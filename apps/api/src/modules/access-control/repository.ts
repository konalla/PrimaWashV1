import type { Actor, ActorRole, AuthUser, InternalPermission } from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface AccessControlRepository {
  resolveActor(candidate: Actor): Promise<Actor | undefined>;
  resolveLogin(identifier: string): Promise<AuthLoginIdentity | undefined>;
}

export interface AuthLoginIdentity {
  readonly actor: Actor;
  readonly user: AuthUser;
}

interface AccessMembership {
  readonly userId: string;
  readonly role: Exclude<ActorRole, "customer">;
  readonly organizationId?: string;
  readonly partnerLocationId?: string;
  readonly propertyId?: string;
  readonly permissions: readonly InternalPermission[];
}

const seededMemberships: readonly AccessMembership[] = [
  {
    userId: "usr_internal_001",
    role: "internal",
    organizationId: "org_platform_001",
    permissions: ["super_admin"],
  },
  {
    userId: "usr_internal_ops_read_001",
    role: "internal",
    organizationId: "org_platform_001",
    permissions: ["operations_read", "finance_read"],
  },
  {
    userId: "usr_internal_ops_write_001",
    role: "internal",
    organizationId: "org_platform_001",
    permissions: ["operations_read", "operations_write", "finance_read"],
  },
  {
    userId: "usr_internal_finance_001",
    role: "internal",
    organizationId: "org_platform_001",
    permissions: ["operations_read", "finance_read", "finance_write"],
  },
  {
    userId: "usr_internal_property_001",
    role: "internal",
    organizationId: "org_platform_001",
    permissions: ["operations_read", "property_manage"],
  },
  {
    userId: "partner_demo_001",
    role: "partner",
    organizationId: "org_partner_001",
    partnerLocationId: "loc_demo_001",
    permissions: [],
  },
  {
    userId: "partner_harbour_001",
    role: "partner",
    organizationId: "org_partner_002",
    partnerLocationId: "loc_harbour_001",
    permissions: [],
  },
  {
    userId: "partner_orchard_001",
    role: "partner",
    organizationId: "org_partner_003",
    partnerLocationId: "loc_orchard_001",
    permissions: [],
  },
  {
    userId: "mgr_marina_001",
    role: "property_manager",
    propertyId: "prop_sg_marina_one",
    permissions: [],
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

    return buildAuthLoginIdentity(user, this.#memberships.filter((membership) => membership.userId === user.id));
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
  return {
    userId: row.user_id,
    role: row.role,
    ...(row.organization_id ? { organizationId: row.organization_id } : {}),
    ...(row.partner_location_id ? { partnerLocationId: row.partner_location_id } : {}),
    ...(row.property_id ? { propertyId: row.property_id } : {}),
    permissions: row.permissions.filter(isInternalPermission),
  };
}

interface AccessUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
}

interface AccessMembershipRow {
  readonly user_id: string;
  readonly role: Exclude<ActorRole, "customer">;
  readonly organization_id: string | null;
  readonly partner_location_id: string | null;
  readonly property_id: string | null;
  readonly permissions: readonly string[];
}

interface AuthLoginRow {
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly role: Exclude<ActorRole, "customer"> | null;
  readonly organization_id: string | null;
  readonly partner_location_id: string | null;
  readonly property_id: string | null;
  readonly permissions: readonly string[] | null;
}

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
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
