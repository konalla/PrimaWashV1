import type { Actor, ActorRole, InternalPermission } from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface AccessControlRepository {
  resolveActor(candidate: Actor): Promise<Actor | undefined>;
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

export class InMemoryAccessControlRepository implements AccessControlRepository {
  readonly #memberships = [...seededMemberships];

  async resolveActor(candidate: Actor): Promise<Actor | undefined> {
    return resolveActorFromMemberships(candidate, this.#memberships);
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

interface AccessMembershipRow {
  readonly user_id: string;
  readonly role: Exclude<ActorRole, "customer">;
  readonly organization_id: string | null;
  readonly partner_location_id: string | null;
  readonly property_id: string | null;
  readonly permissions: readonly string[];
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
