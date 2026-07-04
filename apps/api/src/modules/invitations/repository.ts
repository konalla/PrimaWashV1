import { randomUUID } from "node:crypto";
import type { AccessInvitation, AccessInvitationRole, InternalPermission } from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface InvitationRepository {
  create(input: CreateAccessInvitationInput): Promise<AccessInvitationRecord>;
  get(id: string): Promise<AccessInvitationRecord | undefined>;
  markAccepted(id: string, acceptedAt: string): Promise<AccessInvitationRecord | undefined>;
}

export interface CreateAccessInvitationInput {
  readonly identifier: string;
  readonly displayName: string;
  readonly role: AccessInvitationRole;
  readonly organizationId?: string;
  readonly partnerLocationId?: string;
  readonly propertyId?: string;
  readonly permissions: readonly InternalPermission[];
  readonly codeHash: string;
  readonly expiresAt: string;
  readonly invitedByUserId: string;
}

export interface AccessInvitationRecord extends AccessInvitation {
  readonly displayName: string;
  readonly codeHash: string;
}

export class InMemoryInvitationRepository implements InvitationRepository {
  readonly #invitations = new Map<string, AccessInvitationRecord>();

  async create(input: CreateAccessInvitationInput): Promise<AccessInvitationRecord> {
    const invitation: AccessInvitationRecord = {
      id: `invite_${randomUUID()}`,
      identifier: normalizeIdentifier(input.identifier),
      displayName: input.displayName.trim(),
      role: input.role,
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      ...(input.partnerLocationId ? { partnerLocationId: input.partnerLocationId } : {}),
      ...(input.propertyId ? { propertyId: input.propertyId } : {}),
      permissions: input.permissions,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      invitedByUserId: input.invitedByUserId,
      createdAt: new Date().toISOString(),
    };

    this.#invitations.set(invitation.id, invitation);
    return invitation;
  }

  async get(id: string): Promise<AccessInvitationRecord | undefined> {
    return this.#invitations.get(id);
  }

  async markAccepted(id: string, acceptedAt: string): Promise<AccessInvitationRecord | undefined> {
    const invitation = this.#invitations.get(id);

    if (!invitation) {
      return undefined;
    }

    const accepted = { ...invitation, acceptedAt };
    this.#invitations.set(id, accepted);
    return accepted;
  }
}

export class PostgresInvitationRepository implements InvitationRepository {
  constructor(private readonly pool: DatabasePool) {}

  async create(input: CreateAccessInvitationInput): Promise<AccessInvitationRecord> {
    const result = await this.pool.query<AccessInvitationRow>(
      `insert into access_invitations (
         id, identifier, display_name, role, organization_id, partner_location_id, property_id,
         permissions, code_hash, expires_at, invited_by_user_id
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning *`,
      [
        `invite_${randomUUID()}`,
        normalizeIdentifier(input.identifier),
        input.displayName.trim(),
        input.role,
        input.organizationId ?? null,
        input.partnerLocationId ?? null,
        input.propertyId ?? null,
        input.permissions,
        input.codeHash,
        input.expiresAt,
        input.invitedByUserId,
      ],
    );

    return mapAccessInvitationRow(result.rows[0]);
  }

  async get(id: string): Promise<AccessInvitationRecord | undefined> {
    const result = await this.pool.query<AccessInvitationRow>("select * from access_invitations where id = $1", [id]);
    return result.rows[0] ? mapAccessInvitationRow(result.rows[0]) : undefined;
  }

  async markAccepted(id: string, acceptedAt: string): Promise<AccessInvitationRecord | undefined> {
    const result = await this.pool.query<AccessInvitationRow>(
      `update access_invitations
       set accepted_at = coalesce(accepted_at, $2)
       where id = $1
       returning *`,
      [id, acceptedAt],
    );
    return result.rows[0] ? mapAccessInvitationRow(result.rows[0]) : undefined;
  }
}

export function publicAccessInvitation(invitation: AccessInvitationRecord): AccessInvitation {
  return {
    id: invitation.id,
    identifier: invitation.identifier,
    role: invitation.role,
    ...(invitation.organizationId ? { organizationId: invitation.organizationId } : {}),
    ...(invitation.partnerLocationId ? { partnerLocationId: invitation.partnerLocationId } : {}),
    ...(invitation.propertyId ? { propertyId: invitation.propertyId } : {}),
    permissions: invitation.permissions,
    expiresAt: invitation.expiresAt,
    ...(invitation.acceptedAt ? { acceptedAt: invitation.acceptedAt } : {}),
    ...(invitation.revokedAt ? { revokedAt: invitation.revokedAt } : {}),
    invitedByUserId: invitation.invitedByUserId,
    createdAt: invitation.createdAt,
  };
}

interface AccessInvitationRow {
  readonly id: string;
  readonly identifier: string;
  readonly display_name: string;
  readonly role: AccessInvitationRole;
  readonly organization_id: string | null;
  readonly partner_location_id: string | null;
  readonly property_id: string | null;
  readonly permissions: readonly string[];
  readonly code_hash: string;
  readonly expires_at: Date | string;
  readonly accepted_at: Date | string | null;
  readonly revoked_at: Date | string | null;
  readonly invited_by_user_id: string;
  readonly created_at: Date | string;
}

function mapAccessInvitationRow(row: AccessInvitationRow | undefined): AccessInvitationRecord {
  if (!row) {
    throw new Error("access_invitation_not_found");
  }

  return {
    id: row.id,
    identifier: row.identifier,
    displayName: row.display_name,
    role: row.role,
    ...(row.organization_id ? { organizationId: row.organization_id } : {}),
    ...(row.partner_location_id ? { partnerLocationId: row.partner_location_id } : {}),
    ...(row.property_id ? { propertyId: row.property_id } : {}),
    permissions: row.permissions.filter(isInternalPermission),
    codeHash: row.code_hash,
    expiresAt: toIsoString(row.expires_at),
    ...(row.accepted_at ? { acceptedAt: toIsoString(row.accepted_at) } : {}),
    ...(row.revoked_at ? { revokedAt: toIsoString(row.revoked_at) } : {}),
    invitedByUserId: row.invited_by_user_id,
    createdAt: toIsoString(row.created_at),
  };
}

function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
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
