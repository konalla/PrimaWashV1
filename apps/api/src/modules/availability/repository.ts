import type {
  AvailabilitySlot,
  CreateAvailabilitySlotRequest,
  PartnerAvailabilitySlot,
  ServiceCode,
  UpdateAvailabilitySlotRequest,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";
import { availabilitySlots, findServiceOffering, serviceCatalog } from "./catalog.js";

export type CreateAvailabilitySlotInput = CreateAvailabilitySlotRequest & { readonly partnerLocationId: string };

export interface AvailabilityRepository {
  listPublic(partnerLocationId?: string): Promise<readonly AvailabilitySlot[]>;
  listPartner(partnerLocationId?: string): Promise<readonly PartnerAvailabilitySlot[]>;
  get(slotId: string): Promise<PartnerAvailabilitySlot | undefined>;
  create(input: CreateAvailabilitySlotInput): Promise<PartnerAvailabilitySlot>;
  update(slotId: string, input: UpdateAvailabilitySlotRequest): Promise<PartnerAvailabilitySlot>;
}

export class InMemoryAvailabilityRepository implements AvailabilityRepository {
  readonly #slots = new Map<string, AvailabilitySlot>(
    availabilitySlots.map((slot) => [slot.id, { ...slot, capacity: slot.capacity ?? 1 }]),
  );

  async listPublic(partnerLocationId?: string): Promise<readonly AvailabilitySlot[]> {
    const partnerSlots = await this.listPartner(partnerLocationId);
    return partnerSlots
      .filter((slot) => !slot.closedAt && slot.availableCount > 0)
      .map(({ availableCount: _availableCount, ...slot }) => slot);
  }

  async listPartner(partnerLocationId?: string): Promise<readonly PartnerAvailabilitySlot[]> {
    return Array.from(this.#slots.values())
      .filter((slot) => !partnerLocationId || slot.partnerLocationId === partnerLocationId)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((slot) => toPartnerAvailabilitySlot(slot, 0));
  }

  async get(slotId: string): Promise<PartnerAvailabilitySlot | undefined> {
    const slot = this.#slots.get(slotId);
    return slot ? toPartnerAvailabilitySlot(slot, 0) : undefined;
  }

  async create(input: CreateAvailabilitySlotInput): Promise<PartnerAvailabilitySlot> {
    const slot = buildAvailabilitySlot(input);
    this.#slots.set(slot.id, slot);
    return toPartnerAvailabilitySlot(slot, 0);
  }

  async update(slotId: string, input: UpdateAvailabilitySlotRequest): Promise<PartnerAvailabilitySlot> {
    const slot = this.#slots.get(slotId);

    if (!slot) {
      throw new Error("availability_slot_not_found");
    }

    const updatedSlot: AvailabilitySlot = {
      id: slot.id,
      partnerLocationId: slot.partnerLocationId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      capacity: input.capacity ?? slot.capacity,
      serviceCodes: input.serviceCodes ?? slot.serviceCodes,
      ...(typeof input.closed === "boolean"
        ? input.closed
          ? { closedAt: slot.closedAt ?? new Date().toISOString() }
          : {}
        : slot.closedAt
          ? { closedAt: slot.closedAt }
          : {}),
    };

    this.#slots.set(slotId, updatedSlot);
    return toPartnerAvailabilitySlot(updatedSlot, 0);
  }
}

export class PostgresAvailabilityRepository implements AvailabilityRepository {
  constructor(private readonly pool: DatabasePool) {}

  async listPublic(partnerLocationId?: string): Promise<readonly AvailabilitySlot[]> {
    const slots = await this.listPartner(partnerLocationId);
    return slots
      .filter((slot) => !slot.closedAt && slot.availableCount > 0)
      .map(({ availableCount: _availableCount, ...slot }) => slot);
  }

  async listPartner(partnerLocationId?: string): Promise<readonly PartnerAvailabilitySlot[]> {
    const result = partnerLocationId
      ? await this.pool.query<AvailabilitySlotRow>(
          availabilitySlotSelectSql("where s.partner_location_id = $1"),
          [partnerLocationId],
        )
      : await this.pool.query<AvailabilitySlotRow>(availabilitySlotSelectSql(""));

    return result.rows.map(mapAvailabilitySlotRow);
  }

  async get(slotId: string): Promise<PartnerAvailabilitySlot | undefined> {
    const result = await this.pool.query<AvailabilitySlotRow>(availabilitySlotSelectSql("where s.id = $1"), [slotId]);
    return result.rows[0] ? mapAvailabilitySlotRow(result.rows[0]) : undefined;
  }

  async create(input: CreateAvailabilitySlotInput): Promise<PartnerAvailabilitySlot> {
    const client = await this.pool.connect();
    const slot = buildAvailabilitySlot(input);

    try {
      await client.query("begin");
      await client.query(
        `insert into availability_slots (id, partner_location_id, starts_at, ends_at, capacity, created_at)
         values ($1, $2, $3, $4, $5, $6)`,
        [slot.id, slot.partnerLocationId, slot.startsAt, slot.endsAt, slot.capacity, new Date().toISOString()],
      );

      for (const serviceCode of slot.serviceCodes) {
        await client.query(
          `insert into availability_slot_services (availability_slot_id, service_code)
           values ($1, $2)`,
          [slot.id, serviceCode],
        );
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const createdSlot = await this.get(slot.id);

    if (!createdSlot) {
      throw new Error("availability_slot_create_failed");
    }

    return createdSlot;
  }

  async update(slotId: string, input: UpdateAvailabilitySlotRequest): Promise<PartnerAvailabilitySlot> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      if (typeof input.capacity === "number") {
        await client.query("update availability_slots set capacity = $2 where id = $1", [slotId, input.capacity]);
      }

      if (typeof input.closed === "boolean") {
        await client.query(
          "update availability_slots set closed_at = $2 where id = $1",
          [slotId, input.closed ? new Date().toISOString() : null],
        );
      }

      if (input.serviceCodes) {
        await client.query("delete from availability_slot_services where availability_slot_id = $1", [slotId]);

        for (const serviceCode of input.serviceCodes) {
          await client.query(
            `insert into availability_slot_services (availability_slot_id, service_code)
             values ($1, $2)`,
            [slotId, serviceCode],
          );
        }
      }

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const updatedSlot = await this.get(slotId);

    if (!updatedSlot) {
      throw new Error("availability_slot_not_found");
    }

    return updatedSlot;
  }
}

export function validateCreateAvailabilitySlot(input: Partial<CreateAvailabilitySlotRequest>): string[] {
  const errors: string[] = [];

  if (!input.startsAt || Number.isNaN(new Date(input.startsAt).getTime())) {
    errors.push("startsAt must be a valid ISO timestamp");
  }

  if (!input.endsAt || Number.isNaN(new Date(input.endsAt).getTime())) {
    errors.push("endsAt must be a valid ISO timestamp");
  }

  if (input.startsAt && input.endsAt && new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
    errors.push("endsAt must be after startsAt");
  }

  if (!Number.isInteger(input.capacity) || (input.capacity ?? 0) < 1) {
    errors.push("capacity must be a positive integer");
  }

  if (!input.serviceCodes || input.serviceCodes.length === 0) {
    errors.push("serviceCodes must include at least one service");
  } else {
    for (const serviceCode of input.serviceCodes) {
      if (!findServiceOffering(serviceCode)) {
        errors.push(`serviceCode ${serviceCode} is not available`);
      }
    }
  }

  return errors;
}

export function validateUpdateAvailabilitySlot(input: Partial<UpdateAvailabilitySlotRequest>): string[] {
  const errors: string[] = [];

  if (input.capacity !== undefined && (!Number.isInteger(input.capacity) || input.capacity < 1)) {
    errors.push("capacity must be a positive integer");
  }

  if (input.serviceCodes !== undefined) {
    if (input.serviceCodes.length === 0) {
      errors.push("serviceCodes must include at least one service");
    }

    for (const serviceCode of input.serviceCodes) {
      if (!findServiceOffering(serviceCode)) {
        errors.push(`serviceCode ${serviceCode} is not available`);
      }
    }
  }

  if (input.closed !== undefined && typeof input.closed !== "boolean") {
    errors.push("closed must be a boolean");
  }

  return errors;
}

interface AvailabilitySlotRow {
  readonly id: string;
  readonly partner_location_id: string;
  readonly starts_at: Date | string;
  readonly ends_at: Date | string;
  readonly capacity: number;
  readonly closed_at: Date | string | null;
  readonly service_codes: ServiceCode[];
  readonly booked_count: string | number;
}

function availabilitySlotSelectSql(whereClause: string): string {
  return `
    select s.id,
           s.partner_location_id,
           s.starts_at,
           s.ends_at,
           s.capacity,
           s.closed_at,
           coalesce(array_agg(ass.service_code order by ass.service_code) filter (where ass.service_code is not null), '{}') as service_codes,
           (
             select count(*)
             from bookings b
             where b.partner_location_id = s.partner_location_id
               and b.scheduled_start_at = s.starts_at
               and b.status <> 'cancelled'
           ) as booked_count
    from availability_slots s
    left join availability_slot_services ass on ass.availability_slot_id = s.id
    ${whereClause}
    group by s.id
    order by s.starts_at asc`;
}

function buildAvailabilitySlot(input: CreateAvailabilitySlotInput): AvailabilitySlot {
  return {
    id: `slot_${crypto.randomUUID()}`,
    partnerLocationId: input.partnerLocationId,
    startsAt: new Date(input.startsAt).toISOString(),
    endsAt: new Date(input.endsAt).toISOString(),
    capacity: input.capacity,
    serviceCodes: input.serviceCodes,
  };
}

function mapAvailabilitySlotRow(row: AvailabilitySlotRow): PartnerAvailabilitySlot {
  return toPartnerAvailabilitySlot(
    {
      id: row.id,
      partnerLocationId: row.partner_location_id,
      startsAt: new Date(row.starts_at).toISOString(),
      endsAt: new Date(row.ends_at).toISOString(),
      capacity: row.capacity,
      ...(row.closed_at ? { closedAt: new Date(row.closed_at).toISOString() } : {}),
      serviceCodes: row.service_codes,
    },
    Number(row.booked_count),
  );
}

function toPartnerAvailabilitySlot(slot: AvailabilitySlot, bookedCount: number): PartnerAvailabilitySlot {
  return {
    ...slot,
    bookedCount,
    availableCount: Math.max(slot.capacity - bookedCount, 0),
  };
}

export { serviceCatalog };
