import type { Booking, ServiceRecord } from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface ServiceRecordRepository {
  list(ownerId?: string): Promise<readonly ServiceRecord[]>;
  createFromBooking(booking: Booking): Promise<ServiceRecord>;
}

export class InMemoryServiceRecordRepository implements ServiceRecordRepository {
  readonly #records = new Map<string, ServiceRecord>();

  async list(ownerId?: string): Promise<readonly ServiceRecord[]> {
    const records = Array.from(this.#records.values()).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    return ownerId ? records.filter((record) => record.ownerId === ownerId) : records;
  }

  async createFromBooking(booking: Booking): Promise<ServiceRecord> {
    const existing = Array.from(this.#records.values()).find((record) => record.bookingId === booking.id);

    if (existing) {
      return existing;
    }

    const record = buildServiceRecord(booking);
    this.#records.set(record.id, record);
    return record;
  }
}

export class PostgresServiceRecordRepository implements ServiceRecordRepository {
  constructor(private readonly pool: DatabasePool) {}

  async list(ownerId?: string): Promise<readonly ServiceRecord[]> {
    const result = ownerId
      ? await this.pool.query<ServiceRecordRow>(
          `select id, booking_id, owner_id, vehicle_id, partner_location_id, service_code, completed_at, created_at
           from service_records
           where owner_id = $1
           order by completed_at desc`,
          [ownerId],
        )
      : await this.pool.query<ServiceRecordRow>(
          `select id, booking_id, owner_id, vehicle_id, partner_location_id, service_code, completed_at, created_at
           from service_records
           order by completed_at desc`,
        );

    return result.rows.map(mapServiceRecordRow);
  }

  async createFromBooking(booking: Booking): Promise<ServiceRecord> {
    const record = buildServiceRecord(booking);
    const result = await this.pool.query<ServiceRecordRow>(
      `insert into service_records (
        id, booking_id, owner_id, vehicle_id, partner_location_id, service_code, completed_at, created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (booking_id) do update set booking_id = excluded.booking_id
      returning id, booking_id, owner_id, vehicle_id, partner_location_id, service_code, completed_at, created_at`,
      [
        record.id,
        record.bookingId,
        record.ownerId,
        record.vehicleId,
        record.partnerLocationId,
        record.serviceCode,
        record.completedAt,
        record.createdAt,
      ],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("service_record_create_failed");
    }

    return mapServiceRecordRow(row);
  }
}

interface ServiceRecordRow {
  readonly id: string;
  readonly booking_id: string;
  readonly owner_id: string;
  readonly vehicle_id: string;
  readonly partner_location_id: string;
  readonly service_code: ServiceRecord["serviceCode"];
  readonly completed_at: Date | string;
  readonly created_at: Date | string;
}

function buildServiceRecord(booking: Booking): ServiceRecord {
  const now = new Date().toISOString();

  return {
    id: `svc_${crypto.randomUUID()}`,
    bookingId: booking.id,
    ownerId: booking.ownerId,
    vehicleId: booking.vehicleId,
    partnerLocationId: booking.partnerLocationId,
    serviceCode: booking.serviceCode,
    completedAt: now,
    createdAt: now,
  };
}

function mapServiceRecordRow(row: ServiceRecordRow): ServiceRecord {
  return {
    id: row.id,
    bookingId: row.booking_id,
    ownerId: row.owner_id,
    vehicleId: row.vehicle_id,
    partnerLocationId: row.partner_location_id,
    serviceCode: row.service_code,
    completedAt: new Date(row.completed_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}
