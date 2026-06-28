import type { BookingHold, BookingHoldStatus, CreateBookingHoldRequest } from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export type CreateBookingHoldInput = CreateBookingHoldRequest & {
  readonly ownerId: string;
  readonly endsAt: string;
  readonly expiresAt: string;
};

export interface BookingHoldRepository {
  listActive(input?: {
    readonly partnerLocationId?: string;
    readonly serviceCode?: string;
    readonly date?: string;
    readonly excludeHoldId?: string;
  }): Promise<readonly BookingHold[]>;
  get(holdId: string): Promise<BookingHold | undefined>;
  create(input: CreateBookingHoldInput): Promise<BookingHold>;
  updateStatus(holdId: string, status: BookingHoldStatus): Promise<BookingHold>;
}

export class InMemoryBookingHoldRepository implements BookingHoldRepository {
  readonly #holds = new Map<string, BookingHold>();

  async listActive(input: {
    readonly partnerLocationId?: string;
    readonly serviceCode?: string;
    readonly date?: string;
    readonly excludeHoldId?: string;
  } = {}): Promise<readonly BookingHold[]> {
    const now = Date.now();
    return Array.from(this.#holds.values()).filter(
      (hold) =>
        hold.status === "active" &&
        new Date(hold.expiresAt).getTime() > now &&
        hold.id !== input.excludeHoldId &&
        (!input.partnerLocationId || hold.partnerLocationId === input.partnerLocationId) &&
        (!input.serviceCode || hold.serviceCode === input.serviceCode) &&
        (!input.date || hold.startsAt.slice(0, 10) === input.date),
    );
  }

  async get(holdId: string): Promise<BookingHold | undefined> {
    return this.#holds.get(holdId);
  }

  async create(input: CreateBookingHoldInput): Promise<BookingHold> {
    const hold = buildBookingHold(input);
    this.#holds.set(hold.id, hold);
    return hold;
  }

  async updateStatus(holdId: string, status: BookingHoldStatus): Promise<BookingHold> {
    const hold = this.#holds.get(holdId);

    if (!hold) {
      throw new Error("booking_hold_not_found");
    }

    const updated: BookingHold = { ...hold, status };
    this.#holds.set(holdId, updated);
    return updated;
  }
}

export class PostgresBookingHoldRepository implements BookingHoldRepository {
  constructor(private readonly pool: DatabasePool) {}

  async listActive(input: {
    readonly partnerLocationId?: string;
    readonly serviceCode?: string;
    readonly date?: string;
    readonly excludeHoldId?: string;
  } = {}): Promise<readonly BookingHold[]> {
    const clauses = ["status = 'active'", "expires_at > now()"];
    const values: unknown[] = [];

    if (input.partnerLocationId) {
      values.push(input.partnerLocationId);
      clauses.push(`partner_location_id = $${values.length}`);
    }

    if (input.serviceCode) {
      values.push(input.serviceCode);
      clauses.push(`service_code = $${values.length}`);
    }

    if (input.date) {
      values.push(input.date);
      clauses.push(`starts_at::date = $${values.length}::date`);
    }

    if (input.excludeHoldId) {
      values.push(input.excludeHoldId);
      clauses.push(`id <> $${values.length}`);
    }

    const result = await this.pool.query<BookingHoldRow>(
      `${bookingHoldSelectSql}
       where ${clauses.join(" and ")}
       order by starts_at asc`,
      values,
    );

    return result.rows.map(mapBookingHoldRow);
  }

  async get(holdId: string): Promise<BookingHold | undefined> {
    const result = await this.pool.query<BookingHoldRow>(`${bookingHoldSelectSql} where id = $1`, [holdId]);
    return result.rows[0] ? mapBookingHoldRow(result.rows[0]) : undefined;
  }

  async create(input: CreateBookingHoldInput): Promise<BookingHold> {
    const hold = buildBookingHold(input);
    const result = await this.pool.query<BookingHoldRow>(
      `insert into booking_holds (
        id, owner_id, vehicle_id, partner_location_id, service_code,
        starts_at, ends_at, status, expires_at, created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      returning id, owner_id, vehicle_id, partner_location_id, service_code,
                starts_at, ends_at, status, expires_at, created_at`,
      [
        hold.id,
        hold.ownerId,
        hold.vehicleId,
        hold.partnerLocationId,
        hold.serviceCode,
        hold.startsAt,
        hold.endsAt,
        hold.status,
        hold.expiresAt,
        hold.createdAt,
      ],
    );

    return mapBookingHoldRow(result.rows[0] as BookingHoldRow);
  }

  async updateStatus(holdId: string, status: BookingHoldStatus): Promise<BookingHold> {
    const result = await this.pool.query<BookingHoldRow>(
      `update booking_holds
       set status = $2
       where id = $1
       returning id, owner_id, vehicle_id, partner_location_id, service_code,
                 starts_at, ends_at, status, expires_at, created_at`,
      [holdId, status],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("booking_hold_not_found");
    }

    return mapBookingHoldRow(row);
  }
}

export function validateCreateBookingHold(input: Partial<CreateBookingHoldRequest>): string[] {
  const errors: string[] = [];

  if (!input.vehicleId || input.vehicleId.trim().length < 3) {
    errors.push("vehicleId is required");
  }

  if (!input.partnerLocationId || input.partnerLocationId.trim().length < 3) {
    errors.push("partnerLocationId is required");
  }

  if (!input.serviceCode) {
    errors.push("serviceCode is required");
  }

  if (!input.startsAt || Number.isNaN(new Date(input.startsAt).getTime())) {
    errors.push("startsAt must be a valid ISO timestamp");
  }

  return errors;
}

interface BookingHoldRow {
  readonly id: string;
  readonly owner_id: string;
  readonly vehicle_id: string;
  readonly partner_location_id: string;
  readonly service_code: BookingHold["serviceCode"];
  readonly starts_at: Date | string;
  readonly ends_at: Date | string;
  readonly status: BookingHoldStatus;
  readonly expires_at: Date | string;
  readonly created_at: Date | string;
}

const bookingHoldSelectSql = `
  select id, owner_id, vehicle_id, partner_location_id, service_code,
         starts_at, ends_at, status, expires_at, created_at
  from booking_holds`;

function buildBookingHold(input: CreateBookingHoldInput): BookingHold {
  return {
    id: `hold_${crypto.randomUUID()}`,
    ownerId: input.ownerId,
    vehicleId: input.vehicleId,
    partnerLocationId: input.partnerLocationId,
    serviceCode: input.serviceCode,
    startsAt: new Date(input.startsAt).toISOString(),
    endsAt: new Date(input.endsAt).toISOString(),
    status: "active",
    expiresAt: new Date(input.expiresAt).toISOString(),
    createdAt: new Date().toISOString(),
  };
}

function mapBookingHoldRow(row: BookingHoldRow): BookingHold {
  return {
    id: row.id,
    ownerId: row.owner_id,
    vehicleId: row.vehicle_id,
    partnerLocationId: row.partner_location_id,
    serviceCode: row.service_code,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    status: row.status,
    expiresAt: new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}
