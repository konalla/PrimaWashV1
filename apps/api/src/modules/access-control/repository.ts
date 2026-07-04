import { createHash } from "node:crypto";
import type {
  AccessMembership as PublicAccessMembership,
  Actor,
  ActorRole,
  AuthUser,
  InternalPermission,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface AccessControlRepository {
  resolveActor(candidate: Actor): Promise<Actor | undefined>;
  resolveLogin(identifier: string): Promise<AuthLoginIdentity | undefined>;
  createUserMembership(input: CreateUserMembershipInput): Promise<AuthLoginIdentity>;
  listMemberships(input?: ListAccessMembershipsInput): Promise<readonly PublicAccessMembership[]>;
  getMembership(membershipId: string): Promise<PublicAccessMembership | undefined>;
  updateMembership(membershipId: string, input: UpdateAccessMembershipInput): Promise<PublicAccessMembership | undefined>;
}

export interface AuthLoginIdentity {
  readonly actor: Actor;
  readonly user: AuthUser;
}

interface AccessMembership {
  readonly id: string;
  readonly userId: string;
  readonly role: Exclude<ActorRole, "customer" | "fleet">;
  readonly organizationId?: string;
  readonly partnerLocationId?: string;
  readonly propertyId?: string;
  readonly permissions: readonly InternalPermission[];
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateUserMembershipInput {
  readonly identifier: string;
  readonly displayName: string;
  readonly role: Exclude<ActorRole, "customer" | "fleet">;
  readonly organizationId?: string;
  readonly partnerLocationId?: string;
  readonly propertyId?: string;
  readonly permissions?: readonly InternalPermission[];
}

export interface ListAccessMembershipsInput {
  readonly limit?: number;
}

export interface UpdateAccessMembershipInput {
  readonly permissions?: readonly InternalPermission[];
  readonly active?: boolean;
}

const seededAt = "2026-07-01T00:00:00.000Z";

const seededMemberships: readonly AccessMembership[] = [
  {
    id: "access_internal_admin_001",
    userId: "usr_internal_001",
    role: "internal",
    organizationId: "org_platform_001",
    permissions: ["super_admin"],
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt,
  },
  {
    id: "access_internal_ops_read_001",
    userId: "usr_internal_ops_read_001",
    role: "internal",
    organizationId: "org_platform_001",
    permissions: ["operations_read", "finance_read"],
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt,
  },
  {
    id: "access_internal_ops_write_001",
    userId: "usr_internal_ops_write_001",
    role: "internal",
    organizationId: "org_platform_001",
    permissions: ["operations_read", "operations_write", "finance_read"],
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt,
  },
  {
    id: "access_internal_finance_001",
    userId: "usr_internal_finance_001",
    role: "internal",
    organizationId: "org_platform_001",
    permissions: ["operations_read", "finance_read", "finance_write"],
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt,
  },
  {
    id: "access_internal_partner_001",
    userId: "usr_internal_partner_001",
    role: "internal",
    organizationId: "org_platform_001",
    permissions: ["operations_read", "partner_manage"],
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt,
  },
  {
    id: "access_internal_property_001",
    userId: "usr_internal_property_001",
    role: "internal",
    organizationId: "org_platform_001",
    permissions: ["operations_read", "property_manage"],
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt,
  },
  {
    id: "access_partner_demo_001",
    userId: "partner_demo_001",
    role: "partner",
    organizationId: "org_partner_001",
    partnerLocationId: "loc_demo_001",
    permissions: [],
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt,
  },
  {
    id: "access_partner_harbour_001",
    userId: "partner_harbour_001",
    role: "partner",
    organizationId: "org_partner_002",
    partnerLocationId: "loc_harbour_001",
    permissions: [],
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt,
  },
  {
    id: "access_partner_orchard_001",
    userId: "partner_orchard_001",
    role: "partner",
    organizationId: "org_partner_003",
    partnerLocationId: "loc_orchard_001",
    permissions: [],
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt,
  },
  {
    id: "access_property_marina_001",
    userId: "mgr_marina_001",
    role: "property_manager",
    propertyId: "prop_sg_marina_one",
    permissions: [],
    active: true,
    createdAt: seededAt,
    updatedAt: seededAt,
  },
];

const seededUsers: readonly AccessUser[] = [
  {
    id: "usr_internal_001",
    email: "internal.demo@primawash.local",
    fullName: "Prima Wash Admin",
  },
  {
    id: "usr_internal_ops_read_001",
    email: "ops.read@primawash.local",
    fullName: "Prima Wash Ops Read",
  },
  {
    id: "usr_internal_ops_write_001",
    email: "ops.coordinator@primawash.local",
    fullName: "Prima Wash Ops Coordinator",
  },
  {
    id: "usr_internal_finance_001",
    email: "finance@primawash.local",
    fullName: "Prima Wash Finance",
  },
  {
    id: "usr_internal_partner_001",
    email: "partner.ops@primawash.local",
    fullName: "Prima Wash Partner Ops",
  },
  {
    id: "usr_internal_property_001",
    email: "property.ops@primawash.local",
    fullName: "Prima Wash Property Ops",
  },
  {
    id: "partner_demo_001",
    email: "partner.demo@primawash.local",
    fullName: "Prima Wash Central Partner",
  },
  {
    id: "partner_harbour_001",
    email: "partner.harbour@primawash.local",
    fullName: "Harbour Auto Spa Partner",
  },
  {
    id: "partner_orchard_001",
    email: "partner.orchard@primawash.local",
    fullName: "Orchard Detail Lab Partner",
  },
  {
    id: "mgr_marina_001",
    email: "manager.marina@primawash.local",
    fullName: "Marina One Management",
  },
];

export class InMemoryAccessControlRepository implements AccessControlRepository {
  readonly #memberships = [...seededMemberships];
  readonly #users = [...seededUsers];

  async resolveActor(candidate: Actor): Promise<Actor | undefined> {
    return resolveActorFromMemberships(candidate, this.#memberships);
  }

  async resolveLogin(identifier: string): Promise<AuthLoginIdentity | undefined> {
    const normalizedIdentifier = normalizeIdentifier(identifier);
    const user = this.#users.find((item) => item.email === normalizedIdentifier);

    if (!user) {
      return undefined;
    }

    return buildAuthLoginIdentity(user, this.#memberships.filter((membership) => membership.userId === user.id && membership.active));
  }

  async createUserMembership(input: CreateUserMembershipInput): Promise<AuthLoginIdentity> {
    const email = normalizeIdentifier(input.identifier);
    let user = this.#users.find((item) => item.email === email);

    if (!user) {
      user = {
        id: userIdForIdentifier(email),
        email,
        fullName: input.displayName.trim(),
      };
      this.#users.push(user);
    }

    const now = new Date().toISOString();
    const existingMembershipIndex = this.#memberships.findIndex(
      (membership) =>
        membership.userId === user.id &&
        membership.role === input.role &&
        membership.organizationId === input.organizationId &&
        membership.partnerLocationId === input.partnerLocationId &&
        membership.propertyId === input.propertyId,
    );

    if (existingMembershipIndex >= 0) {
      const existingMembership = this.#memberships[existingMembershipIndex];
      if (existingMembership) {
        this.#memberships[existingMembershipIndex] = {
          ...existingMembership,
          permissions: input.permissions ?? [],
          active: true,
          updatedAt: now,
        };
      }
    } else {
      this.#memberships.push({
        id: membershipIdForInput(user.id, input),
        userId: user.id,
        role: input.role,
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        ...(input.partnerLocationId ? { partnerLocationId: input.partnerLocationId } : {}),
        ...(input.propertyId ? { propertyId: input.propertyId } : {}),
        permissions: input.permissions ?? [],
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return buildAuthLoginIdentity(user, this.#memberships.filter((membership) => membership.userId === user.id && membership.active));
  }

  async listMemberships(input: ListAccessMembershipsInput = {}): Promise<readonly PublicAccessMembership[]> {
    return this.#memberships
      .map((membership) => publicAccessMembership(membership, this.#users.find((user) => user.id === membership.userId)))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, input.limit ?? 100);
  }

  async getMembership(membershipId: string): Promise<PublicAccessMembership | undefined> {
    const membership = this.#memberships.find((item) => item.id === membershipId);
    return membership
      ? publicAccessMembership(membership, this.#users.find((user) => user.id === membership.userId))
      : undefined;
  }

  async updateMembership(
    membershipId: string,
    input: UpdateAccessMembershipInput,
  ): Promise<PublicAccessMembership | undefined> {
    const membershipIndex = this.#memberships.findIndex((item) => item.id === membershipId);
    const membership = this.#memberships[membershipIndex];

    if (!membership) {
      return undefined;
    }

    const updated = {
      ...membership,
      ...(input.permissions ? { permissions: input.permissions } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.#memberships[membershipIndex] = updated;

    return publicAccessMembership(updated, this.#users.find((user) => user.id === membership.userId));
  }
}

export class PostgresAccessControlRepository implements AccessControlRepository {
  constructor(private readonly pool: DatabasePool) {}

  async resolveActor(candidate: Actor): Promise<Actor | undefined> {
    const result = await this.pool.query<AccessMembershipRow>(
      `select user_id, role, organization_id, partner_location_id, property_id, permissions
       from access_memberships
       where user_id = $1 and active = true
       order by
         case role
           when 'internal' then 1
           when 'partner' then 2
           when 'property_manager' then 3
           when 'fleet' then 4
           else 5
         end,
         created_at asc`,
      [candidate.userId],
    );

    return resolveActorFromMemberships(candidate, result.rows.map(mapAccessMembershipRow));
  }

  async resolveLogin(identifier: string): Promise<AuthLoginIdentity | undefined> {
    const normalizedIdentifier = normalizeIdentifier(identifier);
    const result = await this.pool.query<AuthLoginRow>(
      `select
         u.id as user_id,
         u.email,
         u.full_name,
         am.role,
         am.organization_id,
         am.partner_location_id,
         am.property_id,
         am.permissions
       from users u
       left join access_memberships am
         on am.user_id = u.id
        and am.active = true
       where lower(u.email) = $1
       order by
         case am.role
           when 'internal' then 1
           when 'partner' then 2
           when 'property_manager' then 3
           when 'fleet' then 4
           else 5
         end,
         am.created_at asc`,
      [normalizedIdentifier],
    );
    const firstRow = result.rows[0];

    if (!firstRow) {
      return undefined;
    }

    return buildAuthLoginIdentity(
      {
        id: firstRow.user_id,
        email: firstRow.email,
        fullName: firstRow.full_name,
      },
      result.rows.flatMap((row) =>
        row.role
          ? [
              mapAccessMembershipRow({
                user_id: row.user_id,
                role: row.role,
                organization_id: row.organization_id,
                partner_location_id: row.partner_location_id,
                property_id: row.property_id,
                permissions: row.permissions ?? [],
              }),
            ]
          : [],
      ),
    );
  }

  async createUserMembership(input: CreateUserMembershipInput): Promise<AuthLoginIdentity> {
    const email = normalizeIdentifier(input.identifier);
    const userId = userIdForIdentifier(email);
    const organizationId = input.organizationId ?? (input.role === "internal" ? "org_platform_001" : undefined);
    const userResult = await this.pool.query<{ id: string; email: string; full_name: string }>(
      `insert into users (id, organization_id, email, full_name)
       values ($1, $2, $3, $4)
       on conflict (email) do update set
         full_name = excluded.full_name,
         organization_id = coalesce(users.organization_id, excluded.organization_id)
       returning id, email, full_name`,
      [userId, organizationId ?? null, email, input.displayName.trim()],
    );
    const user = userResult.rows[0];

    if (!user) {
      throw new Error("access_user_create_failed");
    }

    await this.pool.query(
      `insert into access_memberships (
         id, user_id, role, organization_id, partner_location_id, property_id, permissions, active
       )
       values ($1, $2, $3, $4, $5, $6, $7, true)
       on conflict (id) do update set
         organization_id = excluded.organization_id,
         partner_location_id = excluded.partner_location_id,
         property_id = excluded.property_id,
         permissions = excluded.permissions,
         active = true,
         updated_at = now()`,
      [
        membershipIdForInput(user.id, input),
        user.id,
        input.role,
        organizationId ?? null,
        input.partnerLocationId ?? null,
        input.propertyId ?? null,
        input.permissions ?? [],
      ],
    );

    const identity = await this.resolveLogin(email);

    if (!identity) {
      throw new Error("access_membership_create_failed");
    }

    return identity;
  }

  async listMemberships(input: ListAccessMembershipsInput = {}): Promise<readonly PublicAccessMembership[]> {
    const result = await this.pool.query<AccessMembershipListRow>(
      `select
         am.id,
         am.user_id,
         u.email,
         u.full_name,
         am.role,
         am.organization_id,
         am.partner_location_id,
         am.property_id,
         am.permissions,
         am.active,
         am.created_at,
         am.updated_at
       from access_memberships am
       join users u on u.id = am.user_id
       order by am.created_at desc
       limit $1`,
      [input.limit ?? 100],
    );

    return result.rows.map(mapAccessMembershipListRow);
  }

  async getMembership(membershipId: string): Promise<PublicAccessMembership | undefined> {
    const result = await this.pool.query<AccessMembershipListRow>(
      `select
         am.id,
         am.user_id,
         u.email,
         u.full_name,
         am.role,
         am.organization_id,
         am.partner_location_id,
         am.property_id,
         am.permissions,
         am.active,
         am.created_at,
         am.updated_at
       from access_memberships am
       join users u on u.id = am.user_id
       where am.id = $1`,
      [membershipId],
    );

    return result.rows[0] ? mapAccessMembershipListRow(result.rows[0]) : undefined;
  }

  async updateMembership(
    membershipId: string,
    input: UpdateAccessMembershipInput,
  ): Promise<PublicAccessMembership | undefined> {
    const current = await this.getMembership(membershipId);

    if (!current) {
      return undefined;
    }

    await this.pool.query(
      `update access_memberships
       set permissions = $2,
           active = $3,
           updated_at = now()
       where id = $1`,
      [
        membershipId,
        input.permissions ?? current.permissions,
        input.active ?? current.active,
      ],
    );

    return this.getMembership(membershipId);
  }
}

function resolveActorFromMemberships(candidate: Actor, memberships: readonly AccessMembership[]): Actor | undefined {
  if (candidate.role === "customer") {
    return candidate;
  }

  const userMemberships = memberships.filter((membership) => membership.userId === candidate.userId);
  const matchingMembership =
    userMemberships.find((membership) => membership.role === candidate.role) ??
    userMemberships[0];

  if (!matchingMembership) {
    return undefined;
  }

  return {
    userId: matchingMembership.userId,
    role: matchingMembership.role,
    ...(matchingMembership.organizationId ? { organizationId: matchingMembership.organizationId } : {}),
    ...(matchingMembership.propertyId ? { propertyId: matchingMembership.propertyId } : {}),
    ...(matchingMembership.permissions.length > 0 ? { permissions: matchingMembership.permissions } : {}),
  };
}

function buildAuthLoginIdentity(user: AccessUser, memberships: readonly AccessMembership[]): AuthLoginIdentity {
  const actor = resolveActorFromMemberships(
    {
      userId: user.id,
      role: memberships[0]?.role ?? "customer",
    },
    memberships,
  ) ?? { userId: user.id, role: "customer" as const };

  return {
    actor,
    user: {
      id: user.id,
      role: actor.role,
      identifier: user.email,
      displayName: user.fullName,
      onboardingComplete: true,
    },
  };
}

function mapAccessMembershipRow(row: AccessMembershipRow): AccessMembership {
  const now = seededAt;
  return {
    id: row.id ?? membershipIdForInput(row.user_id, {
      identifier: row.user_id,
      displayName: row.user_id,
      role: row.role,
      ...(row.organization_id ? { organizationId: row.organization_id } : {}),
      ...(row.partner_location_id ? { partnerLocationId: row.partner_location_id } : {}),
      ...(row.property_id ? { propertyId: row.property_id } : {}),
    }),
    userId: row.user_id,
    role: row.role,
    ...(row.organization_id ? { organizationId: row.organization_id } : {}),
    ...(row.partner_location_id ? { partnerLocationId: row.partner_location_id } : {}),
    ...(row.property_id ? { propertyId: row.property_id } : {}),
    permissions: row.permissions.filter(isInternalPermission),
    active: row.active ?? true,
    createdAt: row.created_at ? toIsoString(row.created_at) : now,
    updatedAt: row.updated_at ? toIsoString(row.updated_at) : now,
  };
}

function publicAccessMembership(membership: AccessMembership, user?: AccessUser): PublicAccessMembership {
  return {
    id: membership.id,
    userId: membership.userId,
    identifier: user?.email ?? membership.userId,
    displayName: user?.fullName ?? membership.userId,
    role: membership.role,
    ...(membership.organizationId ? { organizationId: membership.organizationId } : {}),
    ...(membership.partnerLocationId ? { partnerLocationId: membership.partnerLocationId } : {}),
    ...(membership.propertyId ? { propertyId: membership.propertyId } : {}),
    permissions: membership.permissions,
    active: membership.active,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  };
}

function mapAccessMembershipListRow(row: AccessMembershipListRow): PublicAccessMembership {
  return publicAccessMembership(
    {
      id: row.id,
      userId: row.user_id,
      role: row.role,
      ...(row.organization_id ? { organizationId: row.organization_id } : {}),
      ...(row.partner_location_id ? { partnerLocationId: row.partner_location_id } : {}),
      ...(row.property_id ? { propertyId: row.property_id } : {}),
      permissions: row.permissions.filter(isInternalPermission),
      active: row.active,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    },
    {
      id: row.user_id,
      email: row.email,
      fullName: row.full_name,
    },
  );
}

interface AccessUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
}

interface AccessMembershipRow {
  readonly id?: string;
  readonly user_id: string;
  readonly role: Exclude<ActorRole, "customer" | "fleet">;
  readonly organization_id: string | null;
  readonly partner_location_id: string | null;
  readonly property_id: string | null;
  readonly permissions: readonly string[];
  readonly active?: boolean;
  readonly created_at?: Date | string;
  readonly updated_at?: Date | string;
}

interface AccessMembershipListRow {
  readonly id: string;
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly role: Exclude<ActorRole, "customer" | "fleet">;
  readonly organization_id: string | null;
  readonly partner_location_id: string | null;
  readonly property_id: string | null;
  readonly permissions: readonly string[];
  readonly active: boolean;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface AuthLoginRow {
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly role: Exclude<ActorRole, "customer" | "fleet"> | null;
  readonly organization_id: string | null;
  readonly partner_location_id: string | null;
  readonly property_id: string | null;
  readonly permissions: readonly string[] | null;
}

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function userIdForIdentifier(identifier: string): string {
  return `usr_${hashIdentifier(identifier).slice(0, 16)}`;
}

function membershipIdForInput(userId: string, input: CreateUserMembershipInput): string {
  return `access_${hashIdentifier(
    [userId, input.role, input.organizationId ?? "", input.partnerLocationId ?? "", input.propertyId ?? ""].join(":"),
  ).slice(0, 24)}`;
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isInternalPermission(value: string): value is InternalPermission {
  return (
    value === "operations_read" ||
    value === "operations_write" ||
    value === "finance_read" ||
    value === "finance_write" ||
    value === "partner_manage" ||
    value === "property_manage" ||
    value === "super_admin"
  );
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
