import type {
  Booking,
  BookingOnsiteServiceMode,
  BookingStatus,
  CreateBookingRequest,
  Money,
  PartnerBookingDecisionRequest,
  ServiceCode,
  UpdateBookingExecutionRequest,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";
import { findAvailabilitySlot, findServiceOffering } from "../availability/catalog.js";
import type { AvailabilityRepository } from "../availability/repository.js";
import type { CondoOperationsRepository } from "../condo-operations/repository.js";

type CreateBookingInput = CreateBookingRequest & { readonly ownerId: string };

export interface BookingRepository {
  list(ownerId?: string): Promise<readonly Booking[]>;
  get(bookingId: string): Promise<Booking | undefined>;
  create(input: CreateBookingInput): Promise<Booking>;
  updateStatus(bookingId: string, status: BookingStatus): Promise<Booking>;
  updateExecution(bookingId: string, input: NormalizedBookingExecutionUpdate): Promise<Booking>;
}

export type NormalizedBookingExecutionUpdate = Omit<
  UpdateBookingExecutionRequest,
  "technicianCheckedIn" | "technicianCheckedOut"
> & {
  readonly technicianCheckedInAt?: string | null;
  readonly technicianCheckedOutAt?: string | null;
};

export class InMemoryBookingRepository implements BookingRepository {
  readonly #bookings = new Map<string, Booking>();

  constructor(
    private readonly availability?: AvailabilityRepository,
    private readonly condoOperations?: CondoOperationsRepository,
  ) {}

  async list(ownerId?: string): Promise<readonly Booking[]> {
    const allBookings = Array.from(this.#bookings.values());
    return ownerId ? allBookings.filter((booking) => booking.ownerId === ownerId) : allBookings;
  }

  async get(bookingId: string): Promise<Booking | undefined> {
    return this.#bookings.get(bookingId);
  }

  async create(input: CreateBookingInput): Promise<Booking> {
    if (input.primaWashDayId) {
      if (!this.condoOperations) {
        throw new Error("prima_wash_day_not_found");
      }

      const day = await this.condoOperations.getPrimaWashDay(input.primaWashDayId);
      const service = findServiceOffering(input.serviceCode);

      if (!day) {
        throw new Error("prima_wash_day_not_found");
      }

      if (!["planned", "approved", "active"].includes(day.status) || new Date(day.endsAt).getTime() <= Date.now()) {
        throw new Error("prima_wash_day_unavailable");
      }

      if (!day.partnerLocationId) {
        throw new Error("prima_wash_day_partner_required");
      }

      if (!service || !day.serviceCodes.includes(input.serviceCode)) {
        throw new Error("service_not_available_for_prima_wash_day");
      }

      const bookedCount = Array.from(this.#bookings.values()).filter(
        (booking) => booking.primaWashDayId === day.id && booking.status !== "cancelled",
      ).length;

      if (bookedCount >= day.capacity) {
        throw new Error("prima_wash_day_full");
      }

      const booking = buildBooking({
        ownerId: input.ownerId,
        vehicleId: input.vehicleId,
        partnerLocationId: day.partnerLocationId,
        primaWashDayId: day.id,
        onsiteServiceMode: input.onsiteServiceMode,
        executionNotes: input.executionNotes,
        serviceCode: input.serviceCode,
        scheduledStartAt: day.startsAt,
        durationMinutes: service.durationMinutes,
        acceptedPrice: service.price,
      });

      this.#bookings.set(booking.id, booking);
      return booking;
    }

    if (!input.availabilitySlotId) {
      throw new Error("availability_slot_required");
    }

    const slot = this.availability
      ? await this.availability.get(input.availabilitySlotId)
      : findAvailabilitySlot(input.availabilitySlotId);
    const service = findServiceOffering(input.serviceCode);

    if (!slot) {
      throw new Error("availability_slot_not_found");
    }

    if (!service || !slot.serviceCodes.includes(input.serviceCode)) {
      throw new Error("service_not_available_for_slot");
    }

    if (slot.closedAt) {
      throw new Error("availability_slot_closed");
    }

    const bookedCount = Array.from(this.#bookings.values()).filter(
      (booking) =>
        booking.partnerLocationId === slot.partnerLocationId &&
        booking.scheduledStartAt === slot.startsAt &&
        booking.status !== "cancelled",
    ).length;

    if (bookedCount >= slot.capacity) {
      throw new Error("availability_slot_full");
    }

    const booking = buildBooking({
      ownerId: input.ownerId,
      vehicleId: input.vehicleId,
      partnerLocationId: slot.partnerLocationId,
      onsiteServiceMode: input.onsiteServiceMode,
      executionNotes: input.executionNotes,
      serviceCode: input.serviceCode,
      scheduledStartAt: slot.startsAt,
      durationMinutes: service.durationMinutes,
      acceptedPrice: service.price,
    });

    this.#bookings.set(booking.id, booking);
    return booking;
  }

  async updateStatus(bookingId: string, status: BookingStatus): Promise<Booking> {
    const booking = this.#bookings.get(bookingId);

    if (!booking) {
      throw new Error("booking_not_found");
    }

    const updatedBooking: Booking = { ...booking, status };
    this.#bookings.set(bookingId, updatedBooking);
    return updatedBooking;
  }

  async updateExecution(bookingId: string, input: NormalizedBookingExecutionUpdate): Promise<Booking> {
    const booking = this.#bookings.get(bookingId);

    if (!booking) {
      throw new Error("booking_not_found");
    }

    const updatedBooking = mergeBookingExecution(booking, input);
    this.#bookings.set(bookingId, updatedBooking);
    return updatedBooking;
  }
}

export class PostgresBookingRepository implements BookingRepository {
  constructor(private readonly pool: DatabasePool) {}

  async list(ownerId?: string): Promise<readonly Booking[]> {
    const result = ownerId
      ? await this.pool.query<BookingRow>(
          `select id, owner_id, vehicle_id, partner_location_id, prima_wash_day_id, service_code, status,
                  scheduled_start_at, scheduled_end_at, accepted_price_amount_minor,
                  accepted_price_currency, onsite_service_mode, valet_requested, execution_notes,
                  technician_checked_in_at, technician_checked_out_at, created_at
           from bookings
           where owner_id = $1
           order by created_at desc`,
          [ownerId],
        )
      : await this.pool.query<BookingRow>(
          `select id, owner_id, vehicle_id, partner_location_id, prima_wash_day_id, service_code, status,
                  scheduled_start_at, scheduled_end_at, accepted_price_amount_minor,
                  accepted_price_currency, onsite_service_mode, valet_requested, execution_notes,
                  technician_checked_in_at, technician_checked_out_at, created_at
           from bookings
           order by created_at desc`,
        );

    return result.rows.map(mapBookingRow);
  }

  async get(bookingId: string): Promise<Booking | undefined> {
    const result = await this.pool.query<BookingRow>(
      `select id, owner_id, vehicle_id, partner_location_id, prima_wash_day_id, service_code, status,
              scheduled_start_at, scheduled_end_at, accepted_price_amount_minor,
              accepted_price_currency, onsite_service_mode, valet_requested, execution_notes,
              technician_checked_in_at, technician_checked_out_at, created_at
       from bookings
       where id = $1`,
      [bookingId],
    );

    return result.rows[0] ? mapBookingRow(result.rows[0]) : undefined;
  }

  async create(input: CreateBookingInput): Promise<Booking> {
    if (input.primaWashDayId) {
      const client = await this.pool.connect();

      try {
        await client.query("begin");

        const dayResult = await client.query<PrimaWashDayServiceRow>(
          `select d.id,
                  d.partner_location_id,
                  d.starts_at,
                  d.ends_at,
                  d.capacity,
                  d.status,
                  so.duration_minutes,
                  so.price_amount_minor,
                  so.price_currency
           from prima_wash_days d
           inner join service_offerings so on so.code = $2
           where d.id = $1
             and so.active = true
             and $2 = any(d.service_codes)
           for update`,
          [input.primaWashDayId, input.serviceCode],
        );
        const day = dayResult.rows[0];

        if (!day) {
          throw new Error("prima_wash_day_not_found");
        }

        if (!["planned", "approved", "active"].includes(day.status) || new Date(day.ends_at).getTime() <= Date.now()) {
          throw new Error("prima_wash_day_unavailable");
        }

        if (!day.partner_location_id) {
          throw new Error("prima_wash_day_partner_required");
        }

        const capacityResult = await client.query<{ booked_count: string }>(
          `select count(*) as booked_count
           from bookings
           where prima_wash_day_id = $1
             and status <> 'cancelled'`,
          [day.id],
        );
        const bookedCount = Number(capacityResult.rows[0]?.booked_count ?? 0);

        if (bookedCount >= day.capacity) {
          throw new Error("prima_wash_day_full");
        }

        const booking = buildBooking({
          ownerId: input.ownerId,
          vehicleId: input.vehicleId,
          partnerLocationId: day.partner_location_id,
          primaWashDayId: day.id,
          onsiteServiceMode: input.onsiteServiceMode,
          executionNotes: input.executionNotes,
          serviceCode: input.serviceCode,
          scheduledStartAt: new Date(day.starts_at).toISOString(),
          durationMinutes: day.duration_minutes,
          acceptedPrice: {
            amountMinor: day.price_amount_minor,
            currency: day.price_currency,
          },
        });

        const result = await client.query<BookingRow>(
          `insert into bookings (
            id, owner_id, vehicle_id, partner_location_id, prima_wash_day_id, service_code, status,
            scheduled_start_at, scheduled_end_at, accepted_price_amount_minor,
            accepted_price_currency, onsite_service_mode, valet_requested, execution_notes, created_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          returning id, owner_id, vehicle_id, partner_location_id, prima_wash_day_id, service_code, status,
                    scheduled_start_at, scheduled_end_at, accepted_price_amount_minor,
                    accepted_price_currency, onsite_service_mode, valet_requested, execution_notes,
                    technician_checked_in_at, technician_checked_out_at, created_at`,
          [
            booking.id,
            booking.ownerId,
            booking.vehicleId,
            booking.partnerLocationId,
            booking.primaWashDayId,
            booking.serviceCode,
            booking.status,
            booking.scheduledStartAt,
            booking.scheduledEndAt,
            booking.acceptedPrice.amountMinor,
            booking.acceptedPrice.currency,
            booking.onsiteServiceMode ?? null,
            booking.valetRequested,
            booking.executionNotes ?? null,
            booking.createdAt,
          ],
        );

        const row = result.rows[0];

        if (!row) {
          throw new Error("booking_create_failed");
        }

        await client.query("commit");
        return mapBookingRow(row);
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }

    if (!input.availabilitySlotId) {
      throw new Error("availability_slot_required");
    }

    const client = await this.pool.connect();

    try {
      await client.query("begin");

      const slotResult = await client.query<SlotServiceRow>(
        `select s.partner_location_id,
                s.starts_at,
                s.capacity,
                s.closed_at,
                so.duration_minutes,
                so.price_amount_minor,
                so.price_currency
         from availability_slots s
         inner join availability_slot_services ass on ass.availability_slot_id = s.id
         inner join service_offerings so on so.code = ass.service_code
         where s.id = $1 and so.code = $2 and so.active = true
         for update`,
        [input.availabilitySlotId, input.serviceCode],
      );

      const slot = slotResult.rows[0];

      if (!slot) {
        throw new Error("availability_slot_not_found");
      }

      if (slot.closed_at) {
        throw new Error("availability_slot_closed");
      }

      const capacityResult = await client.query<{ booked_count: string }>(
        `select count(*) as booked_count
         from bookings
         where partner_location_id = $1
           and scheduled_start_at = $2
           and status <> 'cancelled'`,
        [slot.partner_location_id, slot.starts_at],
      );
      const bookedCount = Number(capacityResult.rows[0]?.booked_count ?? 0);

      if (bookedCount >= slot.capacity) {
        throw new Error("availability_slot_full");
      }

      const booking = buildBooking({
        ownerId: input.ownerId,
        vehicleId: input.vehicleId,
        partnerLocationId: slot.partner_location_id,
        onsiteServiceMode: input.onsiteServiceMode,
        executionNotes: input.executionNotes,
        serviceCode: input.serviceCode,
        scheduledStartAt: new Date(slot.starts_at).toISOString(),
        durationMinutes: slot.duration_minutes,
        acceptedPrice: {
          amountMinor: slot.price_amount_minor,
          currency: slot.price_currency,
        },
      });

      const result = await client.query<BookingRow>(
        `insert into bookings (
          id, owner_id, vehicle_id, partner_location_id, prima_wash_day_id, service_code, status,
          scheduled_start_at, scheduled_end_at, accepted_price_amount_minor,
          accepted_price_currency, onsite_service_mode, valet_requested, execution_notes, created_at
        )
        values ($1, $2, $3, $4, null, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        returning id, owner_id, vehicle_id, partner_location_id, prima_wash_day_id, service_code, status,
                  scheduled_start_at, scheduled_end_at, accepted_price_amount_minor,
                  accepted_price_currency, onsite_service_mode, valet_requested, execution_notes,
                  technician_checked_in_at, technician_checked_out_at, created_at`,
        [
          booking.id,
          booking.ownerId,
          booking.vehicleId,
          booking.partnerLocationId,
          booking.serviceCode,
          booking.status,
          booking.scheduledStartAt,
          booking.scheduledEndAt,
          booking.acceptedPrice.amountMinor,
          booking.acceptedPrice.currency,
          booking.onsiteServiceMode ?? null,
          booking.valetRequested,
          booking.executionNotes ?? null,
          booking.createdAt,
        ],
      );

      const row = result.rows[0];

      if (!row) {
        throw new Error("booking_create_failed");
      }

      await client.query("commit");
      return mapBookingRow(row);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateStatus(bookingId: string, status: BookingStatus): Promise<Booking> {
    const result = await this.pool.query<BookingRow>(
      `update bookings
       set status = $2
       where id = $1
       returning id, owner_id, vehicle_id, partner_location_id, prima_wash_day_id, service_code, status,
                 scheduled_start_at, scheduled_end_at, accepted_price_amount_minor,
                 accepted_price_currency, onsite_service_mode, valet_requested, execution_notes,
                 technician_checked_in_at, technician_checked_out_at, created_at`,
      [bookingId, status],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("booking_not_found");
    }

    return mapBookingRow(row);
  }

  async updateExecution(bookingId: string, input: NormalizedBookingExecutionUpdate): Promise<Booking> {
    const result = await this.pool.query<BookingRow>(
      `update bookings
       set onsite_service_mode = coalesce($2, onsite_service_mode),
           valet_requested = coalesce($3, valet_requested),
           execution_notes = coalesce($4, execution_notes),
           technician_checked_in_at = coalesce($5, technician_checked_in_at),
           technician_checked_out_at = coalesce($6, technician_checked_out_at)
       where id = $1
       returning id, owner_id, vehicle_id, partner_location_id, prima_wash_day_id, service_code, status,
                 scheduled_start_at, scheduled_end_at, accepted_price_amount_minor,
                 accepted_price_currency, onsite_service_mode, valet_requested, execution_notes,
                 technician_checked_in_at, technician_checked_out_at, created_at`,
      [
        bookingId,
        input.onsiteServiceMode ?? null,
        input.valetRequested ?? null,
        input.executionNotes ?? null,
        input.technicianCheckedInAt ?? null,
        input.technicianCheckedOutAt ?? null,
      ],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("booking_not_found");
    }

    return mapBookingRow(row);
  }
}

export function validateCreateBooking(input: Partial<CreateBookingRequest>): string[] {
  const errors: string[] = [];

  if (!input.vehicleId || input.vehicleId.trim().length < 3) {
    errors.push("vehicleId is required");
  }

  if (!input.availabilitySlotId && !input.holdId && !input.primaWashDayId) {
    errors.push("availabilitySlotId, holdId, or primaWashDayId is required");
  }

  if (input.availabilitySlotId !== undefined && input.availabilitySlotId.trim().length < 3) {
    errors.push("availabilitySlotId must be valid");
  }

  if (input.holdId !== undefined && input.holdId.trim().length < 3) {
    errors.push("holdId must be valid");
  }

  if (input.primaWashDayId !== undefined && input.primaWashDayId.trim().length < 3) {
    errors.push("primaWashDayId must be valid");
  }

  if (input.onsiteServiceMode !== undefined && !isValidBookingServiceMode(input.onsiteServiceMode)) {
    errors.push("onsiteServiceMode must be partner_location, customer_property, onsite, or pickup_return");
  }

  if (!input.serviceCode) {
    errors.push("serviceCode is required");
  }

  if (input.executionNotes !== undefined && input.executionNotes.length > 2000) {
    errors.push("executionNotes must be 2000 characters or fewer");
  }

  return errors;
}

export function canTransitionBookingStatus(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) {
    return true;
  }

  const allowedTransitions: Record<BookingStatus, readonly BookingStatus[]> = {
    pending_payment: ["confirmed", "cancelled"],
    confirmed: ["checked_in", "cancelled"],
    checked_in: ["in_service", "cancelled"],
    in_service: ["completed"],
    completed: [],
    cancelled: [],
  };

  return allowedTransitions[from].includes(to);
}

export function validateUpdateBookingStatus(input: { readonly status?: string }): string[] {
  const errors: string[] = [];
  const validStatuses: readonly BookingStatus[] = [
    "pending_payment",
    "confirmed",
    "checked_in",
    "in_service",
    "completed",
    "cancelled",
  ];

  if (!input.status || !validStatuses.includes(input.status as BookingStatus)) {
    errors.push("status must be a valid booking status");
  }

  return errors;
}

export function validateUpdateBookingExecution(input: Partial<UpdateBookingExecutionRequest>): string[] {
  const errors: string[] = [];
  if (input.onsiteServiceMode !== undefined && !isValidBookingServiceMode(input.onsiteServiceMode)) {
    errors.push("onsiteServiceMode must be partner_location, customer_property, onsite, or pickup_return");
  }

  if (input.valetRequested !== undefined && typeof input.valetRequested !== "boolean") {
    errors.push("valetRequested must be boolean");
  }

  if (input.technicianCheckedIn !== undefined && typeof input.technicianCheckedIn !== "boolean") {
    errors.push("technicianCheckedIn must be boolean");
  }

  if (input.technicianCheckedOut !== undefined && typeof input.technicianCheckedOut !== "boolean") {
    errors.push("technicianCheckedOut must be boolean");
  }

  if (input.executionNotes !== undefined && input.executionNotes.length > 2000) {
    errors.push("executionNotes must be 2000 characters or fewer");
  }

  return errors;
}

export function validatePartnerBookingDecision(input: Partial<PartnerBookingDecisionRequest>): string[] {
  const errors: string[] = [];

  if (!input.decision || !["accept", "request_clarification", "reject_mode"].includes(input.decision)) {
    errors.push("decision must be accept, request_clarification, or reject_mode");
  }

  if (
    (input.decision === "request_clarification" || input.decision === "reject_mode") &&
    (!input.message || input.message.trim().length < 2)
  ) {
    errors.push("message is required");
  }

  if (input.message !== undefined && input.message.length > 2000) {
    errors.push("message must be 2000 characters or fewer");
  }

  return errors;
}

function isValidBookingServiceMode(value: string): value is BookingOnsiteServiceMode {
  return ["onsite", "partner_location", "customer_property", "pickup_return"].includes(value);
}

interface BuildBookingInput {
  readonly ownerId: string;
  readonly vehicleId: string;
  readonly partnerLocationId: string;
  readonly primaWashDayId?: string;
  readonly onsiteServiceMode?: BookingOnsiteServiceMode | undefined;
  readonly executionNotes?: string | undefined;
  readonly serviceCode: ServiceCode;
  readonly scheduledStartAt: string;
  readonly durationMinutes: number;
  readonly acceptedPrice: Money;
}

interface SlotServiceRow {
  readonly partner_location_id: string;
  readonly starts_at: Date | string;
  readonly capacity: number;
  readonly closed_at: Date | string | null;
  readonly duration_minutes: number;
  readonly price_amount_minor: number;
  readonly price_currency: string;
}

interface PrimaWashDayServiceRow {
  readonly id: string;
  readonly partner_location_id: string | null;
  readonly starts_at: Date | string;
  readonly ends_at: Date | string;
  readonly capacity: number;
  readonly status: string;
  readonly duration_minutes: number;
  readonly price_amount_minor: number;
  readonly price_currency: string;
}

interface BookingRow {
  readonly id: string;
  readonly owner_id: string;
  readonly vehicle_id: string;
  readonly partner_location_id: string;
  readonly prima_wash_day_id: string | null;
  readonly service_code: ServiceCode;
  readonly status: Booking["status"];
  readonly scheduled_start_at: Date | string;
  readonly scheduled_end_at: Date | string;
  readonly accepted_price_amount_minor: number;
  readonly accepted_price_currency: string;
  readonly onsite_service_mode: BookingOnsiteServiceMode | null;
  readonly valet_requested: boolean;
  readonly execution_notes: string | null;
  readonly technician_checked_in_at: Date | string | null;
  readonly technician_checked_out_at: Date | string | null;
  readonly created_at: Date | string;
}

function buildBooking(input: BuildBookingInput): Booking {
  const scheduledEndAt = new Date(
    new Date(input.scheduledStartAt).getTime() + input.durationMinutes * 60_000,
  ).toISOString();
  const onsiteServiceMode = input.onsiteServiceMode ?? (input.primaWashDayId ? "customer_property" : "partner_location");

  return {
    id: `book_${crypto.randomUUID()}`,
    ownerId: input.ownerId,
    vehicleId: input.vehicleId,
    partnerLocationId: input.partnerLocationId,
    ...(input.primaWashDayId ? { primaWashDayId: input.primaWashDayId } : {}),
    serviceCode: input.serviceCode,
    status: "pending_payment",
    onsiteServiceMode,
    valetRequested: onsiteServiceMode === "pickup_return",
    ...(input.executionNotes ? { executionNotes: input.executionNotes.trim() } : {}),
    scheduledStartAt: input.scheduledStartAt,
    scheduledEndAt,
    acceptedPrice: input.acceptedPrice,
    createdAt: new Date().toISOString(),
  };
}

function mergeBookingExecution(booking: Booking, input: NormalizedBookingExecutionUpdate): Booking {
  return {
    ...booking,
    ...(input.onsiteServiceMode !== undefined ? { onsiteServiceMode: input.onsiteServiceMode } : {}),
    ...(input.valetRequested !== undefined ? { valetRequested: input.valetRequested } : {}),
    ...(input.executionNotes !== undefined ? { executionNotes: input.executionNotes } : {}),
    ...(input.technicianCheckedInAt !== undefined && input.technicianCheckedInAt !== null
      ? { technicianCheckedInAt: input.technicianCheckedInAt }
      : {}),
    ...(input.technicianCheckedOutAt !== undefined && input.technicianCheckedOutAt !== null
      ? { technicianCheckedOutAt: input.technicianCheckedOutAt }
      : {}),
  };
}

function mapBookingRow(row: BookingRow): Booking {
  return {
    id: row.id,
    ownerId: row.owner_id,
    vehicleId: row.vehicle_id,
    partnerLocationId: row.partner_location_id,
    ...(row.prima_wash_day_id ? { primaWashDayId: row.prima_wash_day_id } : {}),
    serviceCode: row.service_code,
    status: row.status,
    ...(row.onsite_service_mode ? { onsiteServiceMode: row.onsite_service_mode } : {}),
    valetRequested: row.valet_requested,
    ...(row.execution_notes ? { executionNotes: row.execution_notes } : {}),
    ...(row.technician_checked_in_at ? { technicianCheckedInAt: new Date(row.technician_checked_in_at).toISOString() } : {}),
    ...(row.technician_checked_out_at ? { technicianCheckedOutAt: new Date(row.technician_checked_out_at).toISOString() } : {}),
    scheduledStartAt: new Date(row.scheduled_start_at).toISOString(),
    scheduledEndAt: new Date(row.scheduled_end_at).toISOString(),
    acceptedPrice: {
      amountMinor: row.accepted_price_amount_minor,
      currency: row.accepted_price_currency,
    },
    createdAt: new Date(row.created_at).toISOString(),
  };
}
