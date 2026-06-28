import type { Actor, AuditEvent } from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface RecordAuditEventInput {
  readonly actor?: Actor;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly metadata?: Record<string, unknown>;
  readonly requestId?: string;
}

export interface AuditRepository {
  list(limit?: number): Promise<readonly AuditEvent[]>;
  record(input: RecordAuditEventInput): Promise<AuditEvent>;
}

export class InMemoryAuditRepository implements AuditRepository {
  readonly #events: AuditEvent[] = [];

  async list(limit = 50): Promise<readonly AuditEvent[]> {
    return this.#events.slice(0, limit);
  }

  async record(input: RecordAuditEventInput): Promise<AuditEvent> {
    const event = buildAuditEvent(input);
    this.#events.unshift(event);
    return event;
  }
}

export class PostgresAuditRepository implements AuditRepository {
  constructor(private readonly pool: DatabasePool) {}

  async list(limit = 50): Promise<readonly AuditEvent[]> {
    const result = await this.pool.query<AuditEventRow>(
      `select id, actor_user_id, actor_organization_id, action, resource_type, resource_id,
              metadata, request_id, created_at
       from audit_events
       order by created_at desc
       limit $1`,
      [limit],
    );

    return result.rows.map(mapAuditEventRow);
  }

  async record(input: RecordAuditEventInput): Promise<AuditEvent> {
    const event = buildAuditEvent(input);
    const result = await this.pool.query<AuditEventRow>(
      `insert into audit_events (
        id, actor_user_id, actor_organization_id, action, resource_type, resource_id,
        metadata, request_id, created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
      returning id, actor_user_id, actor_organization_id, action, resource_type, resource_id,
                metadata, request_id, created_at`,
      [
        event.id,
        event.actorUserId ?? null,
        event.actorOrganizationId ?? null,
        event.action,
        event.resourceType,
        event.resourceId,
        JSON.stringify(event.metadata),
        event.requestId ?? null,
        event.createdAt,
      ],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("audit_record_failed");
    }

    return mapAuditEventRow(row);
  }
}

interface AuditEventRow {
  readonly id: string;
  readonly actor_user_id: string | null;
  readonly actor_organization_id: string | null;
  readonly action: string;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly metadata: Record<string, unknown>;
  readonly request_id: string | null;
  readonly created_at: Date | string;
}

function buildAuditEvent(input: RecordAuditEventInput): AuditEvent {
  return {
    id: `audit_${crypto.randomUUID()}`,
    ...(input.actor?.userId ? { actorUserId: input.actor.userId } : {}),
    ...(input.actor?.organizationId ? { actorOrganizationId: input.actor.organizationId } : {}),
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadata: input.metadata ?? {},
    ...(input.requestId ? { requestId: input.requestId } : {}),
    createdAt: new Date().toISOString(),
  };
}

function mapAuditEventRow(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    ...(row.actor_user_id ? { actorUserId: row.actor_user_id } : {}),
    ...(row.actor_organization_id ? { actorOrganizationId: row.actor_organization_id } : {}),
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    metadata: row.metadata,
    ...(row.request_id ? { requestId: row.request_id } : {}),
    createdAt: new Date(row.created_at).toISOString(),
  };
}
