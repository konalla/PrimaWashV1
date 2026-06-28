import type {
  CapacityTemplate,
  CreateCapacityTemplateRequest,
  ServiceCode,
  UpdateCapacityTemplateRequest,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";
import { findServiceOffering } from "../availability/catalog.js";

export type CreateCapacityTemplateInput = CreateCapacityTemplateRequest & { readonly partnerLocationId: string };

export interface CapacityTemplateRepository {
  list(partnerLocationId?: string): Promise<readonly CapacityTemplate[]>;
  get(templateId: string): Promise<CapacityTemplate | undefined>;
  create(input: CreateCapacityTemplateInput): Promise<CapacityTemplate>;
  update(templateId: string, input: UpdateCapacityTemplateRequest): Promise<CapacityTemplate>;
}

const defaultTemplate: CapacityTemplate = {
  id: "cap_tpl_demo_001",
  partnerLocationId: "loc_demo_001",
  name: "Weekday standard capacity",
  openTime: "08:00",
  closeTime: "19:00",
  staffCount: 3,
  bayCount: 2,
  serviceCodes: ["wash_basic", "wash_premium"],
  slotDurationMinutes: 60,
  bufferMinutes: 15,
  createdAt: new Date("2026-06-01T00:00:00.000Z").toISOString(),
  updatedAt: new Date("2026-06-01T00:00:00.000Z").toISOString(),
};

export class InMemoryCapacityTemplateRepository implements CapacityTemplateRepository {
  readonly #templates = new Map<string, CapacityTemplate>([[defaultTemplate.id, defaultTemplate]]);

  async list(partnerLocationId?: string): Promise<readonly CapacityTemplate[]> {
    return Array.from(this.#templates.values())
      .filter((template) => !partnerLocationId || template.partnerLocationId === partnerLocationId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(templateId: string): Promise<CapacityTemplate | undefined> {
    return this.#templates.get(templateId);
  }

  async create(input: CreateCapacityTemplateInput): Promise<CapacityTemplate> {
    const template = buildCapacityTemplate(input);
    this.#templates.set(template.id, template);
    return template;
  }

  async update(templateId: string, input: UpdateCapacityTemplateRequest): Promise<CapacityTemplate> {
    const current = this.#templates.get(templateId);

    if (!current) {
      throw new Error("capacity_template_not_found");
    }

    const updated: CapacityTemplate = {
      ...current,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    this.#templates.set(templateId, updated);
    return updated;
  }
}

export class PostgresCapacityTemplateRepository implements CapacityTemplateRepository {
  constructor(private readonly pool: DatabasePool) {}

  async list(partnerLocationId?: string): Promise<readonly CapacityTemplate[]> {
    const result = partnerLocationId
      ? await this.pool.query<CapacityTemplateRow>(
          `${capacityTemplateSelectSql} where partner_location_id = $1 order by name asc`,
          [partnerLocationId],
        )
      : await this.pool.query<CapacityTemplateRow>(`${capacityTemplateSelectSql} order by name asc`);

    return result.rows.map(mapCapacityTemplateRow);
  }

  async get(templateId: string): Promise<CapacityTemplate | undefined> {
    const result = await this.pool.query<CapacityTemplateRow>(`${capacityTemplateSelectSql} where id = $1`, [templateId]);
    return result.rows[0] ? mapCapacityTemplateRow(result.rows[0]) : undefined;
  }

  async create(input: CreateCapacityTemplateInput): Promise<CapacityTemplate> {
    const template = buildCapacityTemplate(input);
    const result = await this.pool.query<CapacityTemplateRow>(
      `insert into capacity_templates (
        id, partner_location_id, name, open_time, close_time, staff_count, bay_count,
        service_codes, slot_duration_minutes, buffer_minutes, created_at, updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      returning id, partner_location_id, name, open_time, close_time, staff_count, bay_count,
                service_codes, slot_duration_minutes, buffer_minutes, created_at, updated_at`,
      [
        template.id,
        template.partnerLocationId,
        template.name,
        template.openTime,
        template.closeTime,
        template.staffCount,
        template.bayCount,
        template.serviceCodes,
        template.slotDurationMinutes,
        template.bufferMinutes,
        template.createdAt,
        template.updatedAt,
      ],
    );

    return mapCapacityTemplateRow(result.rows[0] as CapacityTemplateRow);
  }

  async update(templateId: string, input: UpdateCapacityTemplateRequest): Promise<CapacityTemplate> {
    const current = await this.get(templateId);

    if (!current) {
      throw new Error("capacity_template_not_found");
    }

    const next: CapacityTemplate = {
      ...current,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    const result = await this.pool.query<CapacityTemplateRow>(
      `update capacity_templates
       set name = $2,
           open_time = $3,
           close_time = $4,
           staff_count = $5,
           bay_count = $6,
           service_codes = $7,
           slot_duration_minutes = $8,
           buffer_minutes = $9,
           updated_at = $10
       where id = $1
       returning id, partner_location_id, name, open_time, close_time, staff_count, bay_count,
                 service_codes, slot_duration_minutes, buffer_minutes, created_at, updated_at`,
      [
        templateId,
        next.name,
        next.openTime,
        next.closeTime,
        next.staffCount,
        next.bayCount,
        next.serviceCodes,
        next.slotDurationMinutes,
        next.bufferMinutes,
        next.updatedAt,
      ],
    );

    return mapCapacityTemplateRow(result.rows[0] as CapacityTemplateRow);
  }
}

export function validateCreateCapacityTemplate(input: Partial<CreateCapacityTemplateRequest>): string[] {
  return validateCapacityTemplateFields(input, true);
}

export function validateUpdateCapacityTemplate(input: Partial<UpdateCapacityTemplateRequest>): string[] {
  return validateCapacityTemplateFields(input, false);
}

export function validateGenerateCapacitySlots(input: { readonly date?: string }): string[] {
  const errors: string[] = [];

  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    errors.push("date must use YYYY-MM-DD format");
  }

  return errors;
}

function validateCapacityTemplateFields(
  input: Partial<CreateCapacityTemplateRequest | UpdateCapacityTemplateRequest>,
  required: boolean,
): string[] {
  const errors: string[] = [];

  if (required && (!input.name || input.name.trim().length < 2)) {
    errors.push("name is required");
  }

  if (input.name !== undefined && input.name.trim().length < 2) {
    errors.push("name must be at least 2 characters");
  }

  if (required && !input.openTime) {
    errors.push("openTime is required");
  }

  if (required && !input.closeTime) {
    errors.push("closeTime is required");
  }

  if (input.openTime !== undefined && !isValidTime(input.openTime)) {
    errors.push("openTime must use HH:mm format");
  }

  if (input.closeTime !== undefined && !isValidTime(input.closeTime)) {
    errors.push("closeTime must use HH:mm format");
  }

  if (input.openTime && input.closeTime && timeToMinutes(input.closeTime) <= timeToMinutes(input.openTime)) {
    errors.push("closeTime must be after openTime");
  }

  if (required && input.staffCount === undefined) {
    errors.push("staffCount is required");
  }

  if (input.staffCount !== undefined && (!Number.isInteger(input.staffCount) || input.staffCount < 1)) {
    errors.push("staffCount must be a positive integer");
  }

  if (required && input.bayCount === undefined) {
    errors.push("bayCount is required");
  }

  if (input.bayCount !== undefined && (!Number.isInteger(input.bayCount) || input.bayCount < 1)) {
    errors.push("bayCount must be a positive integer");
  }

  if (required && (!input.serviceCodes || input.serviceCodes.length === 0)) {
    errors.push("serviceCodes must include at least one service");
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

  if (required && input.slotDurationMinutes === undefined) {
    errors.push("slotDurationMinutes is required");
  }

  if (
    input.slotDurationMinutes !== undefined &&
    (!Number.isInteger(input.slotDurationMinutes) || input.slotDurationMinutes < 15)
  ) {
    errors.push("slotDurationMinutes must be at least 15 minutes");
  }

  if (required && input.bufferMinutes === undefined) {
    errors.push("bufferMinutes is required");
  }

  if (input.bufferMinutes !== undefined && (!Number.isInteger(input.bufferMinutes) || input.bufferMinutes < 0)) {
    errors.push("bufferMinutes must be zero or greater");
  }

  return errors;
}

function buildCapacityTemplate(input: CreateCapacityTemplateInput): CapacityTemplate {
  const now = new Date().toISOString();

  return {
    id: `cap_tpl_${crypto.randomUUID()}`,
    partnerLocationId: input.partnerLocationId,
    name: input.name.trim(),
    openTime: input.openTime,
    closeTime: input.closeTime,
    staffCount: input.staffCount,
    bayCount: input.bayCount,
    serviceCodes: input.serviceCodes,
    slotDurationMinutes: input.slotDurationMinutes,
    bufferMinutes: input.bufferMinutes,
    createdAt: now,
    updatedAt: now,
  };
}

interface CapacityTemplateRow {
  readonly id: string;
  readonly partner_location_id: string;
  readonly name: string;
  readonly open_time: string;
  readonly close_time: string;
  readonly staff_count: number;
  readonly bay_count: number;
  readonly service_codes: ServiceCode[];
  readonly slot_duration_minutes: number;
  readonly buffer_minutes: number;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}

const capacityTemplateSelectSql = `
  select id, partner_location_id, name, open_time, close_time, staff_count, bay_count,
         service_codes, slot_duration_minutes, buffer_minutes, created_at, updated_at
  from capacity_templates`;

function mapCapacityTemplateRow(row: CapacityTemplateRow): CapacityTemplate {
  return {
    id: row.id,
    partnerLocationId: row.partner_location_id,
    name: row.name,
    openTime: row.open_time,
    closeTime: row.close_time,
    staffCount: row.staff_count,
    bayCount: row.bay_count,
    serviceCodes: row.service_codes,
    slotDurationMinutes: row.slot_duration_minutes,
    bufferMinutes: row.buffer_minutes,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}
