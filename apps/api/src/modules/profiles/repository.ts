import type {
  CustomerProfile,
  CustomerResidentialProfile,
  ResidenceType,
  UpdateCustomerProfileRequest,
  UpdateCustomerResidentialProfileRequest,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface ProfileRepository {
  get(userId: string): Promise<CustomerProfile | undefined>;
  upsertIdentity(userId: string, identifier: string, displayName: string): Promise<CustomerProfile>;
  update(userId: string, input: UpdateCustomerProfileRequest): Promise<CustomerProfile>;
}

export class InMemoryProfileRepository implements ProfileRepository {
  readonly #profiles = new Map<string, CustomerProfile>();

  async get(userId: string): Promise<CustomerProfile | undefined> {
    return this.#profiles.get(userId);
  }

  async upsertIdentity(userId: string, identifier: string, displayName: string): Promise<CustomerProfile> {
    const existing = this.#profiles.get(userId);

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const profile = buildProfile(userId, identifier, displayName, now);
    this.#profiles.set(userId, profile);
    return profile;
  }

  async update(userId: string, input: UpdateCustomerProfileRequest): Promise<CustomerProfile> {
    const existing = this.#profiles.get(userId);

    if (!existing) {
      throw new Error("profile_not_found");
    }

    const updated: CustomerProfile = {
      ...existing,
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber.trim() } : {}),
      ...(input.email !== undefined ? { email: input.email.trim().toLowerCase() } : {}),
      ...(input.residentialProfile !== undefined
        ? { residentialProfile: buildResidentialProfile(input.residentialProfile, existing.residentialProfile) }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    this.#profiles.set(userId, updated);
    return updated;
  }
}

export class PostgresProfileRepository implements ProfileRepository {
  constructor(private readonly pool: DatabasePool) {}

  async get(userId: string): Promise<CustomerProfile | undefined> {
    const result = await this.pool.query<ProfileRow>(
      `select user_id, identifier, display_name, phone_number, email, residential_profile, created_at, updated_at
       from customer_profiles where user_id = $1`,
      [userId],
    );
    return result.rows[0] ? mapProfileRow(result.rows[0]) : undefined;
  }

  async upsertIdentity(userId: string, identifier: string, displayName: string): Promise<CustomerProfile> {
    const now = new Date().toISOString();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into users (id, organization_id, email, full_name, created_at)
         values ($1, null, $2, $3, $4)
         on conflict (id) do update set full_name = excluded.full_name`,
        [userId, identifier.includes("@") ? identifier : `${userId}@phone.primawash.local`, displayName, now],
      );
      const result = await client.query<ProfileRow>(
        `insert into customer_profiles (user_id, identifier, display_name, phone_number, email, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $6)
         on conflict (user_id) do update set identifier = excluded.identifier
         returning user_id, identifier, display_name, phone_number, email, residential_profile, created_at, updated_at`,
        [
          userId,
          identifier,
          displayName,
          identifier.includes("@") ? null : identifier,
          identifier.includes("@") ? identifier : null,
          now,
        ],
      );
      await client.query("commit");
      return mapRequiredRow(result.rows[0]);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async update(userId: string, input: UpdateCustomerProfileRequest): Promise<CustomerProfile> {
    const result = await this.pool.query<ProfileRow>(
      `update customer_profiles
       set display_name = coalesce($2, display_name),
           phone_number = coalesce($3, phone_number),
           email = coalesce($4, email),
           residential_profile = coalesce($5, residential_profile),
           updated_at = $6
       where user_id = $1
       returning user_id, identifier, display_name, phone_number, email, residential_profile, created_at, updated_at`,
      [
        userId,
        input.displayName?.trim() ?? null,
        input.phoneNumber?.trim() ?? null,
        input.email?.trim().toLowerCase() ?? null,
        input.residentialProfile
          ? JSON.stringify(buildResidentialProfile(input.residentialProfile))
          : null,
        new Date().toISOString(),
      ],
    );

    if (!result.rows[0]) {
      throw new Error("profile_not_found");
    }

    return mapProfileRow(result.rows[0]);
  }
}

export function validateProfileUpdate(input: UpdateCustomerProfileRequest): string[] {
  const errors: string[] = [];

  if (input.displayName !== undefined && input.displayName.trim().length < 2) {
    errors.push("displayName must contain at least 2 characters");
  }

  if (input.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.push("email must be valid");
  }

  if (input.residentialProfile !== undefined) {
    errors.push(...validateResidentialProfile(input.residentialProfile));
  }

  return errors;
}

interface ProfileRow {
  readonly user_id: string;
  readonly identifier: string;
  readonly display_name: string;
  readonly phone_number: string | null;
  readonly email: string | null;
  readonly residential_profile: CustomerResidentialProfile | string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

function buildProfile(userId: string, identifier: string, displayName: string, now: string): CustomerProfile {
  return {
    userId,
    identifier,
    displayName,
    ...(identifier.includes("@") ? { email: identifier } : { phoneNumber: identifier }),
    createdAt: now,
    updatedAt: now,
  };
}

function mapRequiredRow(row: ProfileRow | undefined): CustomerProfile {
  if (!row) {
    throw new Error("profile_create_failed");
  }
  return mapProfileRow(row);
}

function mapProfileRow(row: ProfileRow): CustomerProfile {
  return {
    userId: row.user_id,
    identifier: row.identifier,
    displayName: row.display_name,
    ...(row.phone_number ? { phoneNumber: row.phone_number } : {}),
    ...(row.email ? { email: row.email } : {}),
    ...(row.residential_profile ? { residentialProfile: parseResidentialProfile(row.residential_profile) } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const residenceTypes: readonly ResidenceType[] = [
  "multi_unit_private",
  "public_housing",
  "landed",
  "commercial",
  "other",
];

function validateResidentialProfile(input: UpdateCustomerResidentialProfileRequest): string[] {
  const errors: string[] = [];

  if (!residenceTypes.includes(input.residenceType)) {
    errors.push("residenceType is not supported");
  }

  for (const [fieldName, value] of [
    ["marketId", input.marketId],
    ["localResidenceLabel", input.localResidenceLabel],
    ["propertyName", input.propertyName],
    ["propertyAddress", input.propertyAddress],
    ["serviceAreaLabel", input.serviceAreaLabel],
    ["parkingNotes", input.parkingNotes],
    ["accessNotes", input.accessNotes],
  ] as const) {
    if (value !== undefined && value.trim().length === 0) {
      errors.push(`${fieldName} cannot be blank`);
    }
  }

  if (input.residenceType === "multi_unit_private" && input.propertyName !== undefined && input.propertyName.trim().length < 2) {
    errors.push("propertyName must contain at least 2 characters");
  }

  return errors;
}

function buildResidentialProfile(
  input: UpdateCustomerResidentialProfileRequest,
  existing?: CustomerResidentialProfile,
): CustomerResidentialProfile {
  const marketId = input.marketId?.trim() ?? existing?.marketId ?? "sg";
  const residenceType = input.residenceType;
  const localResidenceLabel = input.localResidenceLabel?.trim() ?? defaultResidenceLabel(residenceType);
  const marketMode = input.marketMode ?? (residenceType === "multi_unit_private" ? "residence_partnership" : "open_marketplace");

  return {
    marketId,
    marketMode,
    residenceType,
    localResidenceLabel,
    ...(input.propertyName !== undefined ? { propertyName: input.propertyName.trim() } : existing?.propertyName ? { propertyName: existing.propertyName } : {}),
    ...(input.propertyAddress !== undefined ? { propertyAddress: input.propertyAddress.trim() } : existing?.propertyAddress ? { propertyAddress: existing.propertyAddress } : {}),
    ...(input.propertyActivationStatus !== undefined
      ? { propertyActivationStatus: input.propertyActivationStatus }
      : existing?.propertyActivationStatus
        ? { propertyActivationStatus: existing.propertyActivationStatus }
        : residenceType === "multi_unit_private"
          ? { propertyActivationStatus: "suggested" }
          : {}),
    ...(input.serviceAreaLabel !== undefined ? { serviceAreaLabel: input.serviceAreaLabel.trim() } : existing?.serviceAreaLabel ? { serviceAreaLabel: existing.serviceAreaLabel } : {}),
    ...(input.parkingNotes !== undefined ? { parkingNotes: input.parkingNotes.trim() } : existing?.parkingNotes ? { parkingNotes: existing.parkingNotes } : {}),
    ...(input.accessNotes !== undefined ? { accessNotes: input.accessNotes.trim() } : existing?.accessNotes ? { accessNotes: existing.accessNotes } : {}),
    updatedAt: new Date().toISOString(),
  };
}

function defaultResidenceLabel(residenceType: ResidenceType): string {
  if (residenceType === "multi_unit_private") {
    return "Condominium";
  }

  if (residenceType === "public_housing") {
    return "HDB / public housing";
  }

  if (residenceType === "landed") {
    return "Landed property";
  }

  if (residenceType === "commercial") {
    return "Commercial property";
  }

  return "Other";
}

function parseResidentialProfile(value: CustomerResidentialProfile | string): CustomerResidentialProfile {
  if (typeof value !== "string") {
    return value;
  }

  return JSON.parse(value) as CustomerResidentialProfile;
}
