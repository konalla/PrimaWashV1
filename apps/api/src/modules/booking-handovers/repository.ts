import type {
  Actor,
  BookingHandover,
  BookingHandoverSummary,
  BookingHandoverType,
  CreateBookingHandoverRequest,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface CreateBookingHandoverInput extends CreateBookingHandoverRequest {
  readonly bookingId: string;
  readonly actor: Actor;
}

export interface BookingHandoverRepository {
  list(bookingId: string): Promise<readonly BookingHandover[]>;
  create(input: CreateBookingHandoverInput): Promise<BookingHandover>;
  countByBookingIds(bookingIds: readonly string[]): Promise<ReadonlyMap<string, BookingHandoverSummary>>;
}

const handoverTypes: readonly BookingHandoverType[] = ["pickup", "return", "onsite_receipt", "onsite_release"];
const handoverTypeSet = new Set<BookingHandoverType>(handoverTypes);

export function validateCreateBookingHandover(input: Partial<CreateBookingHandoverRequest>): readonly string[] {
  const errors: string[] = [];

  if (!input.handoverType || !handoverTypeSet.has(input.handoverType)) {
    errors.push("handoverType must be one of pickup, return, onsite_receipt, onsite_release");
  }

  if (!input.contactName?.trim()) {
    errors.push("contactName is required");
  } else if (input.contactName.trim().length > 160) {
    errors.push("contactName must be 160 characters or fewer");
  }

  if (!input.locationNotes?.trim()) {
    errors.push("locationNotes is required");
  } else if (input.locationNotes.trim().length > 500) {
    errors.push("locationNotes must be 500 characters or fewer");
  }

  for (const [field, maxLength] of [
    ["keyHandoverMethod", 160],
    ["odometerReading", 80],
    ["fuelOrChargeLevel", 80],
    ["acknowledgedBy", 160],
  ] as const) {
    if (input[field] && input[field].length > maxLength) {
      errors.push(`${field} must be ${maxLength} characters or fewer`);
    }
  }

  if (input.conditionNotes && input.conditionNotes.length > 1000) {
    errors.push("conditionNotes must be 1000 characters or fewer");
  }

  return errors;
}

export class InMemoryBookingHandoverRepository implements BookingHandoverRepository {
  readonly #records = new Map<string, BookingHandover[]>();

  async list(bookingId: string): Promise<readonly BookingHandover[]> {
    return this.#sorted(this.#records.get(bookingId) ?? []);
  }

  async create(input: CreateBookingHandoverInput): Promise<BookingHandover> {
    const record = buildBookingHandover(input);
    const existing = this.#records.get(input.bookingId) ?? [];
    this.#records.set(input.bookingId, [record, ...existing]);
    return record;
  }

  async countByBookingIds(bookingIds: readonly string[]): Promise<ReadonlyMap<string, BookingHandoverSummary>> {
    const summaries = new Map<string, BookingHandoverSummary>();

    for (const bookingId of bookingIds) {
      summaries.set(bookingId, summarizeBookingHandovers(this.#records.get(bookingId) ?? []));
    }

    return summaries;
  }

  #sorted(records: readonly BookingHandover[]): readonly BookingHandover[] {
    return records.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class PostgresBookingHandoverRepository implements BookingHandoverRepository {
  constructor(private readonly pool: DatabasePool) {}

  async list(bookingId: string): Promise<readonly BookingHandover[]> {
    const result = await this.pool.query<BookingHandoverRow>(
      `select id, booking_id, handover_type, contact_name, location_notes, key_handover_method,
              odometer_reading, fuel_or_charge_level, condition_notes, acknowledged_by,
              recorded_by_user_id, recorded_by_role, created_at
       from booking_handovers
       where booking_id = $1
       order by created_at desc`,
      [bookingId],
    );

    return result.rows.map(mapBookingHandoverRow);
  }

  async create(input: CreateBookingHandoverInput): Promise<BookingHandover> {
    const record = buildBookingHandover(input);
    const result = await this.pool.query<BookingHandoverRow>(
      `insert into booking_handovers (
        id, booking_id, handover_type, contact_name, location_notes, key_handover_method,
        odometer_reading, fuel_or_charge_level, condition_notes, acknowledged_by,
        recorded_by_user_id, recorded_by_role, created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      returning id, booking_id, handover_type, contact_name, location_notes, key_handover_method,
                odometer_reading, fuel_or_charge_level, condition_notes, acknowledged_by,
                recorded_by_user_id, recorded_by_role, created_at`,
      [
        record.id,
        record.bookingId,
        record.handoverType,
        record.contactName,
        record.locationNotes,
        record.keyHandoverMethod ?? null,
        record.odometerReading ?? null,
        record.fuelOrChargeLevel ?? null,
        record.conditionNotes ?? null,
        record.acknowledgedBy ?? null,
        record.recordedByUserId ?? null,
        record.recordedByRole,
        record.createdAt,
      ],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("booking_handover_create_failed");
    }

    return mapBookingHandoverRow(row);
  }

  async countByBookingIds(bookingIds: readonly string[]): Promise<ReadonlyMap<string, BookingHandoverSummary>> {
    if (bookingIds.length === 0) {
      return new Map();
    }

    const result = await this.pool.query<{ readonly booking_id: string; readonly handover_type: BookingHandoverType; readonly count: string }>(
      `select booking_id, handover_type, count(*)::text as count
       from booking_handovers
       where booking_id = any($1::text[])
       group by booking_id, handover_type`,
      [bookingIds],
    );
    const summaries = new Map<string, BookingHandoverSummary>();

    for (const bookingId of bookingIds) {
      summaries.set(bookingId, emptyHandoverSummary());
    }

    for (const row of result.rows) {
      const summary = summaries.get(row.booking_id) ?? emptyHandoverSummary();
      summaries.set(row.booking_id, addHandoverCount(summary, row.handover_type, Number(row.count)));
    }

    return summaries;
  }
}

interface BookingHandoverRow {
  readonly id: string;
  readonly booking_id: string;
  readonly handover_type: BookingHandoverType;
  readonly contact_name: string;
  readonly location_notes: string;
  readonly key_handover_method: string | null;
  readonly odometer_reading: string | null;
  readonly fuel_or_charge_level: string | null;
  readonly condition_notes: string | null;
  readonly acknowledged_by: string | null;
  readonly recorded_by_user_id: string | null;
  readonly recorded_by_role: Actor["role"];
  readonly created_at: Date | string;
}

export function summarizeBookingHandovers(records: readonly BookingHandover[]): BookingHandoverSummary {
  return records.reduce(
    (summary, record) => addHandoverCount(summary, record.handoverType, 1),
    emptyHandoverSummary(),
  );
}

export function emptyHandoverSummary(): BookingHandoverSummary {
  return {
    pickupCount: 0,
    returnCount: 0,
    onsiteReceiptCount: 0,
    onsiteReleaseCount: 0,
    totalCount: 0,
  };
}

function addHandoverCount(
  summary: BookingHandoverSummary,
  handoverType: BookingHandoverType,
  count: number,
): BookingHandoverSummary {
  return {
    pickupCount: summary.pickupCount + (handoverType === "pickup" ? count : 0),
    returnCount: summary.returnCount + (handoverType === "return" ? count : 0),
    onsiteReceiptCount: summary.onsiteReceiptCount + (handoverType === "onsite_receipt" ? count : 0),
    onsiteReleaseCount: summary.onsiteReleaseCount + (handoverType === "onsite_release" ? count : 0),
    totalCount: summary.totalCount + count,
  };
}

function buildBookingHandover(input: CreateBookingHandoverInput): BookingHandover {
  return {
    id: `handover_${crypto.randomUUID()}`,
    bookingId: input.bookingId,
    handoverType: input.handoverType,
    contactName: input.contactName.trim(),
    locationNotes: input.locationNotes.trim(),
    ...(input.keyHandoverMethod?.trim() ? { keyHandoverMethod: input.keyHandoverMethod.trim() } : {}),
    ...(input.odometerReading?.trim() ? { odometerReading: input.odometerReading.trim() } : {}),
    ...(input.fuelOrChargeLevel?.trim() ? { fuelOrChargeLevel: input.fuelOrChargeLevel.trim() } : {}),
    ...(input.conditionNotes?.trim() ? { conditionNotes: input.conditionNotes.trim() } : {}),
    ...(input.acknowledgedBy?.trim() ? { acknowledgedBy: input.acknowledgedBy.trim() } : {}),
    ...(input.actor.userId ? { recordedByUserId: input.actor.userId } : {}),
    recordedByRole: input.actor.role,
    createdAt: new Date().toISOString(),
  };
}

function mapBookingHandoverRow(row: BookingHandoverRow): BookingHandover {
  return {
    id: row.id,
    bookingId: row.booking_id,
    handoverType: row.handover_type,
    contactName: row.contact_name,
    locationNotes: row.location_notes,
    ...(row.key_handover_method ? { keyHandoverMethod: row.key_handover_method } : {}),
    ...(row.odometer_reading ? { odometerReading: row.odometer_reading } : {}),
    ...(row.fuel_or_charge_level ? { fuelOrChargeLevel: row.fuel_or_charge_level } : {}),
    ...(row.condition_notes ? { conditionNotes: row.condition_notes } : {}),
    ...(row.acknowledged_by ? { acknowledgedBy: row.acknowledged_by } : {}),
    ...(row.recorded_by_user_id ? { recordedByUserId: row.recorded_by_user_id } : {}),
    recordedByRole: row.recorded_by_role,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
