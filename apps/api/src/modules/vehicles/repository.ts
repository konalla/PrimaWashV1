import type { CreateVehicleRequest, UpdateVehicleRequest, Vehicle } from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

type CreateVehicleInput = CreateVehicleRequest & { readonly ownerId: string };

export interface VehicleRepository {
  list(ownerId?: string): Promise<readonly Vehicle[]>;
  get(vehicleId: string): Promise<Vehicle | undefined>;
  create(input: CreateVehicleInput): Promise<Vehicle>;
  update(vehicleId: string, input: UpdateVehicleRequest): Promise<Vehicle>;
  delete(vehicleId: string): Promise<void>;
}

export class InMemoryVehicleRepository implements VehicleRepository {
  readonly #vehicles = new Map<string, Vehicle>();

  async list(ownerId?: string): Promise<readonly Vehicle[]> {
    const allVehicles = Array.from(this.#vehicles.values());
    return ownerId ? allVehicles.filter((vehicle) => vehicle.ownerId === ownerId) : allVehicles;
  }

  async get(vehicleId: string): Promise<Vehicle | undefined> {
    return this.#vehicles.get(vehicleId);
  }

  async create(input: CreateVehicleInput): Promise<Vehicle> {
    const ownerVehicles = await this.list(input.ownerId);
    const effectiveInput = { ...input, isPrimary: input.isPrimary ?? ownerVehicles.length === 0 };
    if (effectiveInput.isPrimary) {
      this.#clearPrimary(input.ownerId);
    }
    const vehicle = buildVehicle(effectiveInput);
    this.#vehicles.set(vehicle.id, vehicle);
    return vehicle;
  }

  async update(vehicleId: string, input: UpdateVehicleRequest): Promise<Vehicle> {
    const existing = this.#vehicles.get(vehicleId);
    if (!existing) throw new Error("vehicle_not_found");
    if (input.isPrimary) this.#clearPrimary(existing.ownerId);
    const updated = updateVehicle(existing, input);
    this.#vehicles.set(vehicleId, updated);
    return updated;
  }

  async delete(vehicleId: string): Promise<void> {
    if (!this.#vehicles.delete(vehicleId)) throw new Error("vehicle_not_found");
  }

  #clearPrimary(ownerId: string): void {
    for (const [id, vehicle] of this.#vehicles) {
      if (vehicle.ownerId === ownerId && vehicle.isPrimary) {
        this.#vehicles.set(id, { ...vehicle, isPrimary: false });
      }
    }
  }
}

export class PostgresVehicleRepository implements VehicleRepository {
  constructor(private readonly pool: DatabasePool) {}

  async list(ownerId?: string): Promise<readonly Vehicle[]> {
    const result = ownerId
      ? await this.pool.query<VehicleRow>(
          `select id, owner_id, nickname, plate_number, make, model, year, is_primary, created_at
           from vehicles
           where owner_id = $1
           order by created_at desc`,
          [ownerId],
        )
      : await this.pool.query<VehicleRow>(
          `select id, owner_id, nickname, plate_number, make, model, year, is_primary, created_at
           from vehicles
           order by created_at desc`,
        );

    return result.rows.map(mapVehicleRow);
  }

  async get(vehicleId: string): Promise<Vehicle | undefined> {
    const result = await this.pool.query<VehicleRow>(
      `select id, owner_id, nickname, plate_number, make, model, year, is_primary, created_at
       from vehicles
       where id = $1`,
      [vehicleId],
    );

    return result.rows[0] ? mapVehicleRow(result.rows[0]) : undefined;
  }

  async create(input: CreateVehicleInput): Promise<Vehicle> {
    const ownerVehicles = await this.list(input.ownerId);
    const vehicle = buildVehicle({ ...input, isPrimary: input.isPrimary ?? ownerVehicles.length === 0 });
    const client = await this.pool.connect();
    let result;
    try {
      await client.query("begin");
      if (vehicle.isPrimary) {
        await client.query("update vehicles set is_primary = false where owner_id = $1", [vehicle.ownerId]);
      }
      result = await client.query<VehicleRow>(
        `insert into vehicles (id, owner_id, nickname, plate_number, make, model, year, is_primary, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning id, owner_id, nickname, plate_number, make, model, year, is_primary, created_at`,
        [vehicle.id, vehicle.ownerId, vehicle.nickname ?? null, vehicle.plateNumber, vehicle.make ?? null,
          vehicle.model ?? null, vehicle.year ?? null, vehicle.isPrimary, vehicle.createdAt],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const row = result.rows[0];

    if (!row) {
      throw new Error("vehicle_create_failed");
    }

    return mapVehicleRow(row);
  }

  async update(vehicleId: string, input: UpdateVehicleRequest): Promise<Vehicle> {
    const existing = await this.get(vehicleId);
    if (!existing) throw new Error("vehicle_not_found");
    const next = updateVehicle(existing, input);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      if (next.isPrimary) {
        await client.query("update vehicles set is_primary = false where owner_id = $1", [existing.ownerId]);
      }
      const result = await client.query<VehicleRow>(
        `update vehicles set nickname=$2, plate_number=$3, make=$4, model=$5, year=$6, is_primary=$7
         where id=$1
         returning id, owner_id, nickname, plate_number, make, model, year, is_primary, created_at`,
        [vehicleId, next.nickname ?? null, next.plateNumber, next.make ?? null, next.model ?? null, next.year ?? null, next.isPrimary],
      );
      await client.query("commit");
      if (!result.rows[0]) throw new Error("vehicle_not_found");
      return mapVehicleRow(result.rows[0]);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(vehicleId: string): Promise<void> {
    try {
      const result = await this.pool.query("delete from vehicles where id = $1", [vehicleId]);
      if ((result.rowCount ?? 0) === 0) throw new Error("vehicle_not_found");
    } catch (error) {
      if ((error as { code?: string }).code === "23503") throw new Error("vehicle_has_history");
      throw error;
    }
  }
}

export function validateCreateVehicle(input: Partial<CreateVehicleRequest>): string[] {
  const errors: string[] = [];

  if (!input.plateNumber || input.plateNumber.trim().length < 2) {
    errors.push("plateNumber is required");
  }

  if (input.year !== undefined && (input.year < 1900 || input.year > 2100)) {
    errors.push("year must be between 1900 and 2100");
  }

  return errors;
}

export function validateUpdateVehicle(input: UpdateVehicleRequest): string[] {
  const errors: string[] = [];
  if (input.plateNumber !== undefined && input.plateNumber.trim().length < 2) {
    errors.push("plateNumber must contain at least 2 characters");
  }
  if (input.year !== undefined && (input.year < 1900 || input.year > 2100)) {
    errors.push("year must be between 1900 and 2100");
  }
  return errors;
}

interface VehicleRow {
  readonly id: string;
  readonly owner_id: string;
  readonly nickname: string | null;
  readonly plate_number: string;
  readonly make: string | null;
  readonly model: string | null;
  readonly year: number | null;
  readonly is_primary: boolean;
  readonly created_at: Date | string;
}

function buildVehicle(input: CreateVehicleInput): Vehicle {
  return {
    id: `veh_${crypto.randomUUID()}`,
    ownerId: input.ownerId,
    ...(input.nickname ? { nickname: input.nickname } : {}),
    plateNumber: input.plateNumber.trim().toUpperCase(),
    ...(input.make ? { make: input.make.trim() } : {}),
    ...(input.model ? { model: input.model.trim() } : {}),
    ...(input.year ? { year: input.year } : {}),
    isPrimary: input.isPrimary ?? false,
    createdAt: new Date().toISOString(),
  };
}

function mapVehicleRow(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ...(row.nickname ? { nickname: row.nickname } : {}),
    plateNumber: row.plate_number,
    ...(row.make ? { make: row.make } : {}),
    ...(row.model ? { model: row.model } : {}),
    ...(row.year ? { year: row.year } : {}),
    isPrimary: row.is_primary,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function updateVehicle(existing: Vehicle, input: UpdateVehicleRequest): Vehicle {
  return {
    ...existing,
    ...(input.nickname !== undefined ? { nickname: input.nickname.trim() } : {}),
    ...(input.plateNumber !== undefined ? { plateNumber: input.plateNumber.trim().toUpperCase() } : {}),
    ...(input.make !== undefined ? { make: input.make.trim() } : {}),
    ...(input.model !== undefined ? { model: input.model.trim() } : {}),
    ...(input.year !== undefined ? { year: input.year } : {}),
    ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
  };
}
