import crypto from "node:crypto";
import type {
  CondoOperationalProfile,
  CreatePrimaWashDayRequest,
  PrimaWashDay,
  PrimaWashDayStatus,
  ServiceCode,
  UpdateCondoOperationalProfileRequest,
  UpdatePrimaWashDayRequest,
  VehicleMovementPolicy,
  WaterPolicy,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface CondoOperationsRepository {
  getOperationalProfile(propertyId: string): Promise<CondoOperationalProfile | undefined>;
  upsertOperationalProfile(propertyId: string, input: UpdateCondoOperationalProfileRequest): Promise<CondoOperationalProfile>;
  listPrimaWashDays(input?: { readonly propertyId?: string }): Promise<readonly PrimaWashDay[]>;
  getPrimaWashDay(dayId: string): Promise<PrimaWashDay | undefined>;
  createPrimaWashDay(input: CreatePrimaWashDayRequest): Promise<PrimaWashDay>;
  updatePrimaWashDay(dayId: string, input: UpdatePrimaWashDayRequest): Promise<PrimaWashDay>;
}

const nowSeed = new Date("2026-06-28T00:00:00.000Z").toISOString();
const demoPropertyNames = new Map([
  ["prop_sg_reflections", "Reflections at Keppel Bay"],
  ["prop_sg_interlace", "The Interlace"],
  ["prop_sg_marina_one", "Marina One Residences"],
]);

export class InMemoryCondoOperationsRepository implements CondoOperationsRepository {
  readonly #profiles = new Map<string, CondoOperationalProfile>([
    [
      "prop_sg_marina_one",
      {
        propertyId: "prop_sg_marina_one",
        approvedServiceAreas: ["Basement visitor lots B1 near lift lobby"],
        operatingInstructions: "Technicians must check in with security and keep equipment within the approved visitor-lot bay.",
        waterPolicy: "rinseless_required",
        vehicleMovementPolicy: "not_allowed",
        onsiteServiceAllowed: true,
        pickupReturnAllowed: true,
        simultaneousVehicleCapacity: 3,
        availableServiceCodes: ["wash_basic", "wash_premium", "detail_interior"],
        safetyRequirements: "Use cones around service area. Keep pedestrian walkways clear.",
        createdAt: nowSeed,
        updatedAt: nowSeed,
      },
    ],
  ]);
  readonly #days = new Map<string, PrimaWashDay>([
    [
      "pwd_sg_marina_one_20260704",
      {
        id: "pwd_sg_marina_one_20260704",
        propertyId: "prop_sg_marina_one",
        propertyName: "Marina One Residences",
        partnerLocationId: "loc_demo_001",
        approvedServiceArea: "Basement visitor lots B1 near lift lobby",
        startsAt: "2026-07-04T01:00:00.000Z",
        endsAt: "2026-07-04T05:00:00.000Z",
        capacity: 12,
        serviceCodes: ["wash_basic", "wash_premium"],
        status: "planned",
        operatingNotes: "First pilot Prima Wash Day. Rinseless service only.",
        createdAt: nowSeed,
        updatedAt: nowSeed,
      },
    ],
  ]);

  async getOperationalProfile(propertyId: string): Promise<CondoOperationalProfile | undefined> {
    return this.#profiles.get(propertyId);
  }

  async upsertOperationalProfile(propertyId: string, input: UpdateCondoOperationalProfileRequest): Promise<CondoOperationalProfile> {
    const existing = this.#profiles.get(propertyId);
    const now = new Date().toISOString();
    const profile: CondoOperationalProfile = {
      propertyId,
      approvedServiceAreas: input.approvedServiceAreas ?? existing?.approvedServiceAreas ?? [],
      ...(input.operatingInstructions !== undefined ? { operatingInstructions: input.operatingInstructions.trim() } : existing?.operatingInstructions ? { operatingInstructions: existing.operatingInstructions } : {}),
      waterPolicy: input.waterPolicy ?? existing?.waterPolicy ?? "rinseless_required",
      vehicleMovementPolicy: input.vehicleMovementPolicy ?? existing?.vehicleMovementPolicy ?? "not_allowed",
      onsiteServiceAllowed: input.onsiteServiceAllowed ?? existing?.onsiteServiceAllowed ?? true,
      pickupReturnAllowed: input.pickupReturnAllowed ?? existing?.pickupReturnAllowed ?? false,
      simultaneousVehicleCapacity: input.simultaneousVehicleCapacity ?? existing?.simultaneousVehicleCapacity ?? 1,
      availableServiceCodes: input.availableServiceCodes ?? existing?.availableServiceCodes ?? ["wash_basic", "wash_premium"],
      ...(input.safetyRequirements !== undefined ? { safetyRequirements: input.safetyRequirements.trim() } : existing?.safetyRequirements ? { safetyRequirements: existing.safetyRequirements } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.#profiles.set(propertyId, profile);
    return profile;
  }

  async listPrimaWashDays(input: { readonly propertyId?: string } = {}): Promise<readonly PrimaWashDay[]> {
    return [...this.#days.values()]
      .filter((day) => !input.propertyId || day.propertyId === input.propertyId)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  async getPrimaWashDay(dayId: string): Promise<PrimaWashDay | undefined> {
    return this.#days.get(dayId);
  }

  async createPrimaWashDay(input: CreatePrimaWashDayRequest): Promise<PrimaWashDay> {
    const now = new Date().toISOString();
    const day: PrimaWashDay = {
      id: `pwd_${crypto.randomUUID()}`,
      propertyId: input.propertyId,
      propertyName: demoPropertyNames.get(input.propertyId) ?? "Property",
      ...(input.partnerLocationId ? { partnerLocationId: input.partnerLocationId } : {}),
      approvedServiceArea: input.approvedServiceArea.trim(),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      capacity: input.capacity,
      serviceCodes: input.serviceCodes,
      status: input.status ?? "planned",
      ...(input.operatingNotes ? { operatingNotes: input.operatingNotes.trim() } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.#days.set(day.id, day);
    return day;
  }

  async updatePrimaWashDay(dayId: string, input: UpdatePrimaWashDayRequest): Promise<PrimaWashDay> {
    const existing = this.#days.get(dayId);

    if (!existing) {
      throw new Error("prima_wash_day_not_found");
    }

    const updated: PrimaWashDay = {
      ...existing,
      ...(input.partnerLocationId !== undefined ? { partnerLocationId: input.partnerLocationId } : {}),
      ...(input.approvedServiceArea !== undefined ? { approvedServiceArea: input.approvedServiceArea.trim() } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.serviceCodes !== undefined ? { serviceCodes: input.serviceCodes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.operatingNotes !== undefined ? { operatingNotes: input.operatingNotes.trim() } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.#days.set(dayId, updated);
    return updated;
  }
}

export class PostgresCondoOperationsRepository implements CondoOperationsRepository {
  constructor(private readonly pool: DatabasePool) {}

  async getOperationalProfile(propertyId: string): Promise<CondoOperationalProfile | undefined> {
    const result = await this.pool.query<OperationalProfileRow>(
      `select property_id, approved_service_areas, operating_instructions, water_policy, vehicle_movement_policy,
              onsite_service_allowed, pickup_return_allowed, simultaneous_vehicle_capacity, available_service_codes,
              safety_requirements, created_at, updated_at
       from condo_operational_profiles
       where property_id = $1`,
      [propertyId],
    );
    return result.rows[0] ? mapOperationalProfileRow(result.rows[0]) : undefined;
  }

  async upsertOperationalProfile(propertyId: string, input: UpdateCondoOperationalProfileRequest): Promise<CondoOperationalProfile> {
    const existing = await this.getOperationalProfile(propertyId);
    const now = new Date().toISOString();
    const profile = {
      approvedServiceAreas: input.approvedServiceAreas ?? existing?.approvedServiceAreas ?? [],
      operatingInstructions: input.operatingInstructions ?? existing?.operatingInstructions,
      waterPolicy: input.waterPolicy ?? existing?.waterPolicy ?? "rinseless_required",
      vehicleMovementPolicy: input.vehicleMovementPolicy ?? existing?.vehicleMovementPolicy ?? "not_allowed",
      onsiteServiceAllowed: input.onsiteServiceAllowed ?? existing?.onsiteServiceAllowed ?? true,
      pickupReturnAllowed: input.pickupReturnAllowed ?? existing?.pickupReturnAllowed ?? false,
      simultaneousVehicleCapacity: input.simultaneousVehicleCapacity ?? existing?.simultaneousVehicleCapacity ?? 1,
      availableServiceCodes: input.availableServiceCodes ?? existing?.availableServiceCodes ?? ["wash_basic", "wash_premium"],
      safetyRequirements: input.safetyRequirements ?? existing?.safetyRequirements,
    };
    const result = await this.pool.query<OperationalProfileRow>(
      `insert into condo_operational_profiles (
         property_id, approved_service_areas, operating_instructions, water_policy, vehicle_movement_policy,
         onsite_service_allowed, pickup_return_allowed, simultaneous_vehicle_capacity, available_service_codes,
         safety_requirements, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
       on conflict (property_id) do update set
         approved_service_areas = excluded.approved_service_areas,
         operating_instructions = excluded.operating_instructions,
         water_policy = excluded.water_policy,
         vehicle_movement_policy = excluded.vehicle_movement_policy,
         onsite_service_allowed = excluded.onsite_service_allowed,
         pickup_return_allowed = excluded.pickup_return_allowed,
         simultaneous_vehicle_capacity = excluded.simultaneous_vehicle_capacity,
         available_service_codes = excluded.available_service_codes,
         safety_requirements = excluded.safety_requirements,
         updated_at = excluded.updated_at
       returning property_id, approved_service_areas, operating_instructions, water_policy, vehicle_movement_policy,
                 onsite_service_allowed, pickup_return_allowed, simultaneous_vehicle_capacity, available_service_codes,
                 safety_requirements, created_at, updated_at`,
      [
        propertyId,
        profile.approvedServiceAreas,
        profile.operatingInstructions ?? null,
        profile.waterPolicy,
        profile.vehicleMovementPolicy,
        profile.onsiteServiceAllowed,
        profile.pickupReturnAllowed,
        profile.simultaneousVehicleCapacity,
        profile.availableServiceCodes,
        profile.safetyRequirements ?? null,
        now,
      ],
    );
    return mapRequiredOperationalProfileRow(result.rows[0]);
  }

  async listPrimaWashDays(input: { readonly propertyId?: string } = {}): Promise<readonly PrimaWashDay[]> {
    const params: unknown[] = [];
    const where: string[] = [];

    if (input.propertyId) {
      params.push(input.propertyId);
      where.push(`d.property_id = $${params.length}`);
    }

    const result = await this.pool.query<PrimaWashDayRow>(
      `${primaWashDaySelect}
       ${where.length > 0 ? `where ${where.join(" and ")}` : ""}
       order by d.starts_at asc`,
      params,
    );
    return result.rows.map(mapPrimaWashDayRow);
  }

  async getPrimaWashDay(dayId: string): Promise<PrimaWashDay | undefined> {
    const result = await this.pool.query<PrimaWashDayRow>(`${primaWashDaySelect} where d.id = $1`, [dayId]);
    return result.rows[0] ? mapPrimaWashDayRow(result.rows[0]) : undefined;
  }

  async createPrimaWashDay(input: CreatePrimaWashDayRequest): Promise<PrimaWashDay> {
    const now = new Date().toISOString();
    const result = await this.pool.query<PrimaWashDayRow>(
      `insert into prima_wash_days (
         id, property_id, partner_location_id, approved_service_area, starts_at, ends_at, capacity,
         service_codes, status, operating_notes, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
       returning id`,
      [
        `pwd_${crypto.randomUUID()}`,
        input.propertyId,
        input.partnerLocationId ?? null,
        input.approvedServiceArea.trim(),
        input.startsAt,
        input.endsAt,
        input.capacity,
        input.serviceCodes,
        input.status ?? "planned",
        input.operatingNotes?.trim() ?? null,
        now,
      ],
    );
    const created = await this.pool.query<PrimaWashDayRow>(`${primaWashDaySelect} where d.id = $1`, [result.rows[0]?.id]);
    return mapRequiredPrimaWashDayRow(created.rows[0]);
  }

  async updatePrimaWashDay(dayId: string, input: UpdatePrimaWashDayRequest): Promise<PrimaWashDay> {
    const existing = await this.pool.query<PrimaWashDayRow>(`${primaWashDaySelect} where d.id = $1`, [dayId]);

    if (!existing.rows[0]) {
      throw new Error("prima_wash_day_not_found");
    }

    const current = mapPrimaWashDayRow(existing.rows[0]);
    await this.pool.query(
      `update prima_wash_days
       set partner_location_id = $2,
           approved_service_area = $3,
           starts_at = $4,
           ends_at = $5,
           capacity = $6,
           service_codes = $7,
           status = $8,
           operating_notes = $9,
           updated_at = $10
       where id = $1`,
      [
        dayId,
        input.partnerLocationId ?? current.partnerLocationId ?? null,
        input.approvedServiceArea?.trim() ?? current.approvedServiceArea,
        input.startsAt ?? current.startsAt,
        input.endsAt ?? current.endsAt,
        input.capacity ?? current.capacity,
        input.serviceCodes ?? current.serviceCodes,
        input.status ?? current.status,
        input.operatingNotes?.trim() ?? current.operatingNotes ?? null,
        new Date().toISOString(),
      ],
    );
    const refreshed = await this.pool.query<PrimaWashDayRow>(`${primaWashDaySelect} where d.id = $1`, [dayId]);
    return mapRequiredPrimaWashDayRow(refreshed.rows[0]);
  }
}

export function validateOperationalProfile(input: UpdateCondoOperationalProfileRequest): string[] {
  const errors: string[] = [];

  if (input.approvedServiceAreas !== undefined && input.approvedServiceAreas.some((area) => area.trim().length === 0)) {
    errors.push("approvedServiceAreas cannot contain blank values");
  }

  if (input.simultaneousVehicleCapacity !== undefined && input.simultaneousVehicleCapacity < 1) {
    errors.push("simultaneousVehicleCapacity must be greater than 0");
  }

  if (input.availableServiceCodes !== undefined && input.availableServiceCodes.length === 0) {
    errors.push("availableServiceCodes must include at least one service");
  }

  return errors;
}

export function validateCreatePrimaWashDay(input: CreatePrimaWashDayRequest): string[] {
  return validatePrimaWashDayCore(input);
}

export function validateUpdatePrimaWashDay(input: UpdatePrimaWashDayRequest): string[] {
  return validatePrimaWashDayCore(input);
}

function validatePrimaWashDayCore(input: Partial<CreatePrimaWashDayRequest & UpdatePrimaWashDayRequest>): string[] {
  const errors: string[] = [];

  if ("propertyId" in input && input.propertyId !== undefined && input.propertyId.trim().length === 0) {
    errors.push("propertyId is required");
  }

  if (input.approvedServiceArea !== undefined && input.approvedServiceArea.trim().length === 0) {
    errors.push("approvedServiceArea cannot be blank");
  }

  if (input.capacity !== undefined && input.capacity < 1) {
    errors.push("capacity must be greater than 0");
  }

  if (input.serviceCodes !== undefined && input.serviceCodes.length === 0) {
    errors.push("serviceCodes must include at least one service");
  }

  if (input.startsAt && input.endsAt && new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
    errors.push("endsAt must be after startsAt");
  }

  return errors;
}

interface OperationalProfileRow {
  readonly property_id: string;
  readonly approved_service_areas: string[];
  readonly operating_instructions: string | null;
  readonly water_policy: WaterPolicy;
  readonly vehicle_movement_policy: VehicleMovementPolicy;
  readonly onsite_service_allowed: boolean;
  readonly pickup_return_allowed: boolean;
  readonly simultaneous_vehicle_capacity: number;
  readonly available_service_codes: ServiceCode[];
  readonly safety_requirements: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

interface PrimaWashDayRow {
  readonly id: string;
  readonly property_id: string;
  readonly property_name: string;
  readonly partner_location_id: string | null;
  readonly approved_service_area: string;
  readonly starts_at: Date | string;
  readonly ends_at: Date | string;
  readonly capacity: number;
  readonly service_codes: ServiceCode[];
  readonly status: PrimaWashDayStatus;
  readonly operating_notes: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

const primaWashDaySelect = `
  select d.id, d.property_id, p.name as property_name, d.partner_location_id, d.approved_service_area,
         d.starts_at, d.ends_at, d.capacity, d.service_codes, d.status, d.operating_notes, d.created_at, d.updated_at
  from prima_wash_days d
  join properties p on p.id = d.property_id`;

function mapOperationalProfileRow(row: OperationalProfileRow): CondoOperationalProfile {
  return {
    propertyId: row.property_id,
    approvedServiceAreas: row.approved_service_areas,
    ...(row.operating_instructions ? { operatingInstructions: row.operating_instructions } : {}),
    waterPolicy: row.water_policy,
    vehicleMovementPolicy: row.vehicle_movement_policy,
    onsiteServiceAllowed: row.onsite_service_allowed,
    pickupReturnAllowed: row.pickup_return_allowed,
    simultaneousVehicleCapacity: row.simultaneous_vehicle_capacity,
    availableServiceCodes: row.available_service_codes,
    ...(row.safety_requirements ? { safetyRequirements: row.safety_requirements } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapRequiredOperationalProfileRow(row: OperationalProfileRow | undefined): CondoOperationalProfile {
  if (!row) {
    throw new Error("operational_profile_not_found");
  }

  return mapOperationalProfileRow(row);
}

function mapPrimaWashDayRow(row: PrimaWashDayRow): PrimaWashDay {
  return {
    id: row.id,
    propertyId: row.property_id,
    propertyName: row.property_name,
    ...(row.partner_location_id ? { partnerLocationId: row.partner_location_id } : {}),
    approvedServiceArea: row.approved_service_area,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    capacity: row.capacity,
    serviceCodes: row.service_codes,
    status: row.status,
    ...(row.operating_notes ? { operatingNotes: row.operating_notes } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapRequiredPrimaWashDayRow(row: PrimaWashDayRow | undefined): PrimaWashDay {
  if (!row) {
    throw new Error("prima_wash_day_not_found");
  }

  return mapPrimaWashDayRow(row);
}
