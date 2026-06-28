import type { MavoResponse, ProductEvent, ProductEventName } from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface RecordProductEventInput {
  readonly ownerId: string;
  readonly name: ProductEventName;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ProductEventRepository {
  record(input: RecordProductEventInput): Promise<ProductEvent>;
  calculateMavo(month: string): Promise<MavoResponse>;
}

export const qualifyingMavoEventNames: readonly ProductEventName[] = [
  "vehicle_created",
  "booking_created",
  "service_completed",
];

export class InMemoryProductEventRepository implements ProductEventRepository {
  readonly #events: ProductEvent[] = [];

  async record(input: RecordProductEventInput): Promise<ProductEvent> {
    const event = buildProductEvent(input);
    this.#events.unshift(event);
    return event;
  }

  async calculateMavo(month: string): Promise<MavoResponse> {
    const ownerIds = new Set(
      this.#events
        .filter((event) => isEventInMonth(event, month))
        .filter((event) => qualifyingMavoEventNames.includes(event.name))
        .map((event) => event.ownerId),
    );

    return buildMavoResponse(month, ownerIds.size);
  }
}

export class PostgresProductEventRepository implements ProductEventRepository {
  constructor(private readonly pool: DatabasePool) {}

  async record(input: RecordProductEventInput): Promise<ProductEvent> {
    const event = buildProductEvent(input);
    const result = await this.pool.query<ProductEventRow>(
      `insert into product_events (id, owner_id, name, resource_type, resource_id, metadata, occurred_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7)
       returning id, owner_id, name, resource_type, resource_id, metadata, occurred_at`,
      [
        event.id,
        event.ownerId,
        event.name,
        event.resourceType,
        event.resourceId,
        JSON.stringify(event.metadata),
        event.occurredAt,
      ],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("product_event_record_failed");
    }

    return mapProductEventRow(row);
  }

  async calculateMavo(month: string): Promise<MavoResponse> {
    const start = `${month}-01T00:00:00.000Z`;
    const end = addOneMonth(start);
    const result = await this.pool.query<{ readonly count: string }>(
      `select count(distinct owner_id)::text as count
       from product_events
       where occurred_at >= $1
         and occurred_at < $2
         and name = any($3::text[])`,
      [start, end, qualifyingMavoEventNames],
    );

    return buildMavoResponse(month, Number.parseInt(result.rows[0]?.count ?? "0", 10));
  }
}

interface ProductEventRow {
  readonly id: string;
  readonly owner_id: string;
  readonly name: ProductEventName;
  readonly resource_type: string;
  readonly resource_id: string;
  readonly metadata: Record<string, unknown>;
  readonly occurred_at: Date | string;
}

function buildProductEvent(input: RecordProductEventInput): ProductEvent {
  return {
    id: `evt_${crypto.randomUUID()}`,
    ownerId: input.ownerId,
    name: input.name,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadata: input.metadata ?? {},
    occurredAt: new Date().toISOString(),
  };
}

function mapProductEventRow(row: ProductEventRow): ProductEvent {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    metadata: row.metadata,
    occurredAt: new Date(row.occurred_at).toISOString(),
  };
}

function isEventInMonth(event: ProductEvent, month: string): boolean {
  return event.occurredAt.startsWith(`${month}-`);
}

function buildMavoResponse(month: string, monthlyActiveVehicleOwners: number): MavoResponse {
  return {
    month,
    monthlyActiveVehicleOwners,
    qualifyingEventNames: qualifyingMavoEventNames,
    generatedAt: new Date().toISOString(),
  };
}

function addOneMonth(isoStart: string): string {
  const date = new Date(isoStart);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}
