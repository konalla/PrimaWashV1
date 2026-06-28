import crypto from "node:crypto";
import type {
  CreatePropertyInterestRequest,
  Property,
  PropertyActivationStatus,
  PropertyInterest,
  PropertyLead,
  ResidenceType,
  ServiceCode,
  UpdatePropertyActivationRequest,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

interface PropertyInterestInput {
  readonly ownerId: string;
  readonly propertyId?: string;
  readonly propertyName?: string;
  readonly propertyAddress?: string;
  readonly requestedServiceCodes?: readonly ServiceCode[];
  readonly preferredTimeWindows?: readonly string[];
  readonly parkingNotes?: string;
}

export interface PropertyRepository {
  list(input?: { readonly marketId?: string; readonly query?: string; readonly residenceType?: ResidenceType }): Promise<readonly Property[]>;
  listLeads(input?: { readonly marketId?: string }): Promise<readonly PropertyLead[]>;
  get(propertyId: string): Promise<Property | undefined>;
  registerInterest(input: PropertyInterestInput): Promise<{ readonly property: Property; readonly interest: PropertyInterest }>;
  updateActivation(propertyId: string, input: UpdatePropertyActivationRequest): Promise<PropertyLead>;
}

const demoProperties: readonly Property[] = [
  buildSeedProperty("prop_sg_reflections", "Reflections at Keppel Bay", "1 Keppel Bay View", "interest_gathering", 12),
  buildSeedProperty("prop_sg_interlace", "The Interlace", "180 Depot Road", "interest_gathering", 8),
  buildSeedProperty("prop_sg_marina_one", "Marina One Residences", "21 Marina Way", "contacted", 17),
];

export class InMemoryPropertyRepository implements PropertyRepository {
  readonly #properties = new Map<string, Property>(demoProperties.map((property) => [property.id, property]));
  readonly #interests = new Map<string, PropertyInterest>();

  async list(input: { readonly marketId?: string; readonly query?: string; readonly residenceType?: ResidenceType } = {}): Promise<readonly Property[]> {
    const query = input.query?.trim().toLowerCase();
    return [...this.#properties.values()]
      .filter((property) => !input.marketId || property.marketId === input.marketId)
      .filter((property) => !input.residenceType || property.residenceType === input.residenceType)
      .filter((property) => !query || `${property.name} ${property.addressLine1 ?? ""}`.toLowerCase().includes(query))
      .sort((a, b) => b.interestCount - a.interestCount || a.name.localeCompare(b.name));
  }

  async get(propertyId: string): Promise<Property | undefined> {
    return this.#properties.get(propertyId);
  }

  async listLeads(input: { readonly marketId?: string } = {}): Promise<readonly PropertyLead[]> {
    return [...this.#properties.values()]
      .filter((property) => !input.marketId || property.marketId === input.marketId)
      .map((property) => this.buildLead(property))
      .sort((a, b) => b.interestCount - a.interestCount || a.name.localeCompare(b.name));
  }

  async registerInterest(input: PropertyInterestInput): Promise<{ readonly property: Property; readonly interest: PropertyInterest }> {
    const now = new Date().toISOString();
    const property = input.propertyId
      ? this.#properties.get(input.propertyId)
      : this.findOrCreateSuggestedProperty(input.propertyName, input.propertyAddress, now);

    if (!property) {
      throw new Error("property_not_found");
    }

    const key = `${property.id}:${input.ownerId}`;
    const existing = this.#interests.get(key);
    const interest: PropertyInterest = {
      id: existing?.id ?? `pint_${crypto.randomUUID()}`,
      propertyId: property.id,
      ownerId: input.ownerId,
      requestedServiceCodes: input.requestedServiceCodes ?? existing?.requestedServiceCodes ?? [],
      preferredTimeWindows: input.preferredTimeWindows ?? existing?.preferredTimeWindows ?? [],
      ...(input.parkingNotes !== undefined ? { parkingNotes: input.parkingNotes.trim() } : existing?.parkingNotes ? { parkingNotes: existing.parkingNotes } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.#interests.set(key, interest);

    const interestCount = [...this.#interests.values()].filter((item) => item.propertyId === property.id).length;
    const updatedProperty = { ...property, interestCount: Math.max(property.interestCount, interestCount), updatedAt: now };
    this.#properties.set(property.id, updatedProperty);

    return { property: updatedProperty, interest };
  }

  async updateActivation(propertyId: string, input: UpdatePropertyActivationRequest): Promise<PropertyLead> {
    const existing = this.#properties.get(propertyId);

    if (!existing) {
      throw new Error("property_not_found");
    }

    const updated: Property = {
      ...existing,
      ...(input.activationStatus ? { activationStatus: input.activationStatus } : {}),
      ...(input.managementContactName !== undefined ? { managementContactName: input.managementContactName.trim() } : {}),
      ...(input.managementContactEmail !== undefined ? { managementContactEmail: input.managementContactEmail.trim().toLowerCase() } : {}),
      ...(input.managementContactPhone !== undefined ? { managementContactPhone: input.managementContactPhone.trim() } : {}),
      ...(input.outreachNotes !== undefined ? { outreachNotes: input.outreachNotes.trim() } : {}),
      ...(input.nextFollowUpAt !== undefined ? { nextFollowUpAt: input.nextFollowUpAt } : {}),
      ...(input.lastContactedAt !== undefined ? { lastContactedAt: input.lastContactedAt } : {}),
      ...(input.internalOwner !== undefined ? { internalOwner: input.internalOwner.trim() } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.#properties.set(propertyId, updated);

    return this.buildLead(updated);
  }

  private findOrCreateSuggestedProperty(name: string | undefined, address: string | undefined, now: string): Property {
    const trimmedName = name?.trim();

    if (!trimmedName) {
      throw new Error("property_name_required");
    }

    const existing = [...this.#properties.values()].find(
      (property) => property.name.toLowerCase() === trimmedName.toLowerCase(),
    );

    if (existing) {
      return existing;
    }

    const property: Property = {
      id: `prop_${crypto.randomUUID()}`,
      marketId: "sg",
      residenceType: "multi_unit_private",
      name: trimmedName,
      ...(address?.trim() ? { addressLine1: address.trim() } : {}),
      city: "Singapore",
      region: "Singapore",
      countryCode: "SG",
      activationStatus: "suggested",
      interestCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.#properties.set(property.id, property);
    return property;
  }

  private latestInterestAt(propertyId: string): string | undefined {
    return [...this.#interests.values()]
      .filter((interest) => interest.propertyId === propertyId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.updatedAt;
  }

  private buildLead(property: Property): PropertyLead {
    const latestInterestAt = this.latestInterestAt(property.id);
    return {
      ...property,
      ...(latestInterestAt ? { latestInterestAt } : {}),
    };
  }
}

export class PostgresPropertyRepository implements PropertyRepository {
  constructor(private readonly pool: DatabasePool) {}

  async list(input: { readonly marketId?: string; readonly query?: string; readonly residenceType?: ResidenceType } = {}): Promise<readonly Property[]> {
    const params: unknown[] = [];
    const where: string[] = [];

    if (input.marketId) {
      params.push(input.marketId);
      where.push(`p.market_id = $${params.length}`);
    }

    if (input.residenceType) {
      params.push(input.residenceType);
      where.push(`p.residence_type = $${params.length}`);
    }

    if (input.query?.trim()) {
      params.push(`%${input.query.trim()}%`);
      where.push(`(p.name ilike $${params.length} or p.address_line_1 ilike $${params.length})`);
    }

    const result = await this.pool.query<PropertyRow>(
      `${propertySelect}
       ${where.length > 0 ? `where ${where.join(" and ")}` : ""}
       group by p.id
       order by count(pi.id) desc, p.name asc`,
      params,
    );
    return result.rows.map(mapPropertyRow);
  }

  async get(propertyId: string): Promise<Property | undefined> {
    const result = await this.pool.query<PropertyRow>(`${propertySelect} where p.id = $1 group by p.id`, [propertyId]);
    return result.rows[0] ? mapPropertyRow(result.rows[0]) : undefined;
  }

  async listLeads(input: { readonly marketId?: string } = {}): Promise<readonly PropertyLead[]> {
    const params: unknown[] = [];
    const where: string[] = [];

    if (input.marketId) {
      params.push(input.marketId);
      where.push(`p.market_id = $${params.length}`);
    }

    const result = await this.pool.query<PropertyLeadRow>(
      `${propertyLeadSelect}
       ${where.length > 0 ? `where ${where.join(" and ")}` : ""}
       group by p.id
       order by count(pi.id) desc, max(pi.updated_at) desc nulls last, p.name asc`,
      params,
    );
    return result.rows.map(mapPropertyLeadRow);
  }

  async registerInterest(input: PropertyInterestInput): Promise<{ readonly property: Property; readonly interest: PropertyInterest }> {
    const now = new Date().toISOString();
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const propertyId = input.propertyId ?? `prop_${crypto.randomUUID()}`;

      if (!input.propertyId && !input.propertyName?.trim()) {
        throw new Error("property_name_required");
      }

      if (!input.propertyId) {
        await client.query(
          `insert into properties (
             id, market_id, residence_type, name, address_line_1, city, region, country_code, activation_status, created_at, updated_at
           )
           values ($1, 'sg', 'multi_unit_private', $2, $3, 'Singapore', 'Singapore', 'SG', 'suggested', $4, $4)
           on conflict (market_id, lower(name), coalesce(address_line_1, '')) do nothing`,
          [propertyId, input.propertyName?.trim(), input.propertyAddress?.trim() || null, now],
        );
      }

      const propertyResult = await client.query<PropertyRow>(
        `${propertySelect}
         where ${input.propertyId ? "p.id = $1" : "p.market_id = 'sg' and lower(p.name) = lower($1)"}
         group by p.id
         order by p.created_at desc
         limit 1`,
        [input.propertyId ?? input.propertyName?.trim()],
      );
      const property = propertyResult.rows[0] ? mapPropertyRow(propertyResult.rows[0]) : undefined;

      if (!property) {
        throw new Error("property_not_found");
      }

      const interestResult = await client.query<PropertyInterestRow>(
        `insert into property_interests (
           id, property_id, owner_id, requested_service_codes, preferred_time_windows, parking_notes, created_at, updated_at
         )
         values ($1, $2, $3, $4, $5, $6, $7, $7)
         on conflict (property_id, owner_id) do update set
           requested_service_codes = excluded.requested_service_codes,
           preferred_time_windows = excluded.preferred_time_windows,
           parking_notes = excluded.parking_notes,
           updated_at = excluded.updated_at
         returning id, property_id, owner_id, requested_service_codes, preferred_time_windows, parking_notes, created_at, updated_at`,
        [
          `pint_${crypto.randomUUID()}`,
          property.id,
          input.ownerId,
          input.requestedServiceCodes ?? [],
          input.preferredTimeWindows ?? [],
          input.parkingNotes?.trim() || null,
          now,
        ],
      );
      const refreshedProperty = await client.query<PropertyRow>(`${propertySelect} where p.id = $1 group by p.id`, [property.id]);

      await client.query("commit");
      return {
        property: refreshedProperty.rows[0] ? mapPropertyRow(refreshedProperty.rows[0]) : property,
        interest: mapRequiredInterestRow(interestResult.rows[0]),
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateActivation(propertyId: string, input: UpdatePropertyActivationRequest): Promise<PropertyLead> {
    const result = await this.pool.query<PropertyLeadRow>(
      `update properties
       set activation_status = coalesce($2, activation_status),
           management_contact_name = coalesce($3, management_contact_name),
           management_contact_email = coalesce($4, management_contact_email),
           management_contact_phone = coalesce($5, management_contact_phone),
           outreach_notes = coalesce($6, outreach_notes),
           next_follow_up_at = coalesce($7, next_follow_up_at),
           last_contacted_at = coalesce($8, last_contacted_at),
           internal_owner = coalesce($9, internal_owner),
           updated_at = $10
       where id = $1
       returning id`,
      [
        propertyId,
        input.activationStatus ?? null,
        input.managementContactName?.trim() ?? null,
        input.managementContactEmail?.trim().toLowerCase() ?? null,
        input.managementContactPhone?.trim() ?? null,
        input.outreachNotes?.trim() ?? null,
        input.nextFollowUpAt ?? null,
        input.lastContactedAt ?? null,
        input.internalOwner?.trim() ?? null,
        new Date().toISOString(),
      ],
    );

    if (!result.rows[0]) {
      throw new Error("property_not_found");
    }

    const refreshed = await this.pool.query<PropertyLeadRow>(`${propertyLeadSelect} where p.id = $1 group by p.id`, [propertyId]);
    return mapRequiredPropertyLeadRow(refreshed.rows[0]);
  }
}

export function validateCreatePropertyInterest(input: CreatePropertyInterestRequest): string[] {
  const errors: string[] = [];

  if (!input.propertyId && (!input.propertyName || input.propertyName.trim().length < 2)) {
    errors.push("propertyName must contain at least 2 characters when propertyId is not supplied");
  }

  if (input.propertyAddress !== undefined && input.propertyAddress.trim().length === 0) {
    errors.push("propertyAddress cannot be blank");
  }

  if (input.parkingNotes !== undefined && input.parkingNotes.trim().length === 0) {
    errors.push("parkingNotes cannot be blank");
  }

  return errors;
}

export function validateUpdatePropertyActivation(input: UpdatePropertyActivationRequest): string[] {
  const errors: string[] = [];
  const statuses: readonly PropertyActivationStatus[] = [
    "suggested",
    "interest_gathering",
    "contacted",
    "approved",
    "active",
    "paused",
    "rejected",
  ];

  if (input.activationStatus !== undefined && !statuses.includes(input.activationStatus)) {
    errors.push("activationStatus is not supported");
  }

  if (input.managementContactEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.managementContactEmail.trim())) {
    errors.push("managementContactEmail must be valid");
  }

  for (const [fieldName, value] of [
    ["managementContactName", input.managementContactName],
    ["managementContactPhone", input.managementContactPhone],
    ["outreachNotes", input.outreachNotes],
    ["nextFollowUpAt", input.nextFollowUpAt],
    ["lastContactedAt", input.lastContactedAt],
    ["internalOwner", input.internalOwner],
  ] as const) {
    if (value !== undefined && value.trim().length === 0) {
      errors.push(`${fieldName} cannot be blank`);
    }
  }

  return errors;
}

const propertySelect = `
  select p.id, p.market_id, p.residence_type, p.name, p.address_line_1, p.city, p.region,
         p.country_code, p.activation_status, count(pi.id)::integer as interest_count,
         p.management_contact_name, p.management_contact_email, p.management_contact_phone,
         p.outreach_notes, p.next_follow_up_at, p.last_contacted_at, p.internal_owner,
         p.created_at, p.updated_at
  from properties p
  left join property_interests pi on pi.property_id = p.id`;

const propertyLeadSelect = `
  select p.id, p.market_id, p.residence_type, p.name, p.address_line_1, p.city, p.region,
         p.country_code, p.activation_status, count(pi.id)::integer as interest_count,
         max(pi.updated_at) as latest_interest_at,
         p.management_contact_name, p.management_contact_email, p.management_contact_phone,
         p.outreach_notes, p.next_follow_up_at, p.last_contacted_at, p.internal_owner,
         p.created_at, p.updated_at
  from properties p
  left join property_interests pi on pi.property_id = p.id`;

interface PropertyRow {
  readonly id: string;
  readonly market_id: string;
  readonly residence_type: ResidenceType;
  readonly name: string;
  readonly address_line_1: string | null;
  readonly city: string;
  readonly region: string;
  readonly country_code: string;
  readonly activation_status: PropertyActivationStatus;
  readonly interest_count: number;
  readonly management_contact_name: string | null;
  readonly management_contact_email: string | null;
  readonly management_contact_phone: string | null;
  readonly outreach_notes: string | null;
  readonly next_follow_up_at: Date | string | null;
  readonly last_contacted_at: Date | string | null;
  readonly internal_owner: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface PropertyLeadRow extends PropertyRow {
  readonly latest_interest_at: Date | string | null;
}

interface PropertyInterestRow {
  readonly id: string;
  readonly property_id: string;
  readonly owner_id: string;
  readonly requested_service_codes: ServiceCode[];
  readonly preferred_time_windows: string[];
  readonly parking_notes: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

function buildSeedProperty(
  id: string,
  name: string,
  addressLine1: string,
  activationStatus: PropertyActivationStatus,
  interestCount: number,
): Property {
  const now = new Date("2026-06-28T00:00:00.000Z").toISOString();
  return {
    id,
    marketId: "sg",
    residenceType: "multi_unit_private",
    name,
    addressLine1,
    city: "Singapore",
    region: "Central Region",
    countryCode: "SG",
    activationStatus,
    interestCount,
    createdAt: now,
    updatedAt: now,
  };
}

function mapPropertyRow(row: PropertyRow): Property {
  return {
    id: row.id,
    marketId: row.market_id,
    residenceType: row.residence_type,
    name: row.name,
    ...(row.address_line_1 ? { addressLine1: row.address_line_1 } : {}),
    city: row.city,
    region: row.region,
    countryCode: row.country_code,
    activationStatus: row.activation_status,
    interestCount: row.interest_count,
    ...(row.management_contact_name ? { managementContactName: row.management_contact_name } : {}),
    ...(row.management_contact_email ? { managementContactEmail: row.management_contact_email } : {}),
    ...(row.management_contact_phone ? { managementContactPhone: row.management_contact_phone } : {}),
    ...(row.outreach_notes ? { outreachNotes: row.outreach_notes } : {}),
    ...(row.next_follow_up_at ? { nextFollowUpAt: new Date(row.next_follow_up_at).toISOString() } : {}),
    ...(row.last_contacted_at ? { lastContactedAt: new Date(row.last_contacted_at).toISOString() } : {}),
    ...(row.internal_owner ? { internalOwner: row.internal_owner } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapPropertyLeadRow(row: PropertyLeadRow): PropertyLead {
  return {
    ...mapPropertyRow(row),
    ...(row.latest_interest_at ? { latestInterestAt: new Date(row.latest_interest_at).toISOString() } : {}),
  };
}

function mapRequiredPropertyLeadRow(row: PropertyLeadRow | undefined): PropertyLead {
  if (!row) {
    throw new Error("property_not_found");
  }

  return mapPropertyLeadRow(row);
}

function mapRequiredInterestRow(row: PropertyInterestRow | undefined): PropertyInterest {
  if (!row) {
    throw new Error("property_interest_create_failed");
  }

  return {
    id: row.id,
    propertyId: row.property_id,
    ownerId: row.owner_id,
    requestedServiceCodes: row.requested_service_codes,
    preferredTimeWindows: row.preferred_time_windows,
    ...(row.parking_notes ? { parkingNotes: row.parking_notes } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
