import type {
  CalendarException,
  OperatingScheduleRule,
  ResourcePool,
  ResourceType,
  SchedulingConfig,
  ServiceCapacityRule,
  ServiceCode,
  UpdateSchedulingConfigRequest,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";
import { findServiceOffering } from "../availability/catalog.js";

export interface SchedulingConfigRepository {
  get(partnerLocationId: string): Promise<SchedulingConfig>;
  replace(partnerLocationId: string, input: UpdateSchedulingConfigRequest): Promise<SchedulingConfig>;
}

const weekdays = [1, 2, 3, 4, 5, 6] as const;

export class InMemorySchedulingConfigRepository implements SchedulingConfigRepository {
  readonly #configs = new Map<string, SchedulingConfig>(
    ["loc_demo_001", "loc_harbour_001", "loc_orchard_001"].map((partnerLocationId) => [
      partnerLocationId,
      defaultSchedulingConfig(partnerLocationId),
    ]),
  );

  async get(partnerLocationId: string): Promise<SchedulingConfig> {
    return this.#configs.get(partnerLocationId) ?? defaultSchedulingConfig(partnerLocationId);
  }

  async replace(partnerLocationId: string, input: UpdateSchedulingConfigRequest): Promise<SchedulingConfig> {
    const current = await this.get(partnerLocationId);
    const next: SchedulingConfig = {
      operatingScheduleRules: input.operatingScheduleRules
        ? input.operatingScheduleRules.map((rule) => ({
            id: `schedule_${crypto.randomUUID()}`,
            partnerLocationId,
            ...rule,
          }))
        : current.operatingScheduleRules,
      calendarExceptions: input.calendarExceptions
        ? input.calendarExceptions.map((exception) => ({
            id: `cal_ex_${crypto.randomUUID()}`,
            partnerLocationId,
            ...exception,
          }))
        : current.calendarExceptions,
      resourcePools: input.resourcePools
        ? input.resourcePools.map((resource) => ({
            id: `res_pool_${crypto.randomUUID()}`,
            partnerLocationId,
            ...resource,
          }))
        : current.resourcePools,
      serviceCapacityRules: input.serviceCapacityRules
        ? input.serviceCapacityRules.map((rule) => ({
            id: `svc_rule_${crypto.randomUUID()}`,
            partnerLocationId,
            ...rule,
          }))
        : current.serviceCapacityRules,
    };

    this.#configs.set(partnerLocationId, next);
    return next;
  }
}

export class PostgresSchedulingConfigRepository implements SchedulingConfigRepository {
  constructor(private readonly pool: DatabasePool) {}

  async get(partnerLocationId: string): Promise<SchedulingConfig> {
    const [schedule, exceptions, resources, serviceRules] = await Promise.all([
      this.pool.query<OperatingScheduleRuleRow>(
        `select id, partner_location_id, weekday, open_time, close_time, enabled
         from operating_schedule_rules
         where partner_location_id = $1
         order by weekday asc, open_time asc`,
        [partnerLocationId],
      ),
      this.pool.query<CalendarExceptionRow>(
        `select id, partner_location_id, date, type, reason, open_time, close_time
         from calendar_exceptions
         where partner_location_id = $1
         order by date asc`,
        [partnerLocationId],
      ),
      this.pool.query<ResourcePoolRow>(
        `select id, partner_location_id, resource_type, name, quantity, enabled
         from resource_pools
         where partner_location_id = $1
         order by resource_type asc, name asc`,
        [partnerLocationId],
      ),
      this.pool.query<ServiceCapacityRuleRow>(
        `select id, partner_location_id, service_code, duration_minutes, pre_buffer_minutes,
                post_buffer_minutes, required_staff, required_resource_type, required_resource_quantity,
                max_concurrent, max_daily_bookings, enabled
         from service_capacity_rules
         where partner_location_id = $1
         order by service_code asc`,
        [partnerLocationId],
      ),
    ]);

    const config = {
      operatingScheduleRules: schedule.rows.map(mapScheduleRow),
      calendarExceptions: exceptions.rows.map(mapExceptionRow),
      resourcePools: resources.rows.map(mapResourceRow),
      serviceCapacityRules: serviceRules.rows.map(mapServiceRuleRow),
    };

    if (
      config.operatingScheduleRules.length === 0 &&
      config.resourcePools.length === 0 &&
      config.serviceCapacityRules.length === 0
    ) {
      return defaultSchedulingConfig(partnerLocationId);
    }

    return config;
  }

  async replace(partnerLocationId: string, input: UpdateSchedulingConfigRequest): Promise<SchedulingConfig> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");

      if (input.operatingScheduleRules) {
        await client.query("delete from operating_schedule_rules where partner_location_id = $1", [partnerLocationId]);
        for (const rule of input.operatingScheduleRules) {
          await client.query(
            `insert into operating_schedule_rules (id, partner_location_id, weekday, open_time, close_time, enabled)
             values ($1, $2, $3, $4, $5, $6)`,
            [`schedule_${crypto.randomUUID()}`, partnerLocationId, rule.weekday, rule.openTime, rule.closeTime, rule.enabled],
          );
        }
      }

      if (input.calendarExceptions) {
        await client.query("delete from calendar_exceptions where partner_location_id = $1", [partnerLocationId]);
        for (const exception of input.calendarExceptions) {
          await client.query(
            `insert into calendar_exceptions (id, partner_location_id, date, type, reason, open_time, close_time)
             values ($1, $2, $3, $4, $5, $6, $7)`,
            [
              `cal_ex_${crypto.randomUUID()}`,
              partnerLocationId,
              exception.date,
              exception.type,
              exception.reason,
              exception.openTime ?? null,
              exception.closeTime ?? null,
            ],
          );
        }
      }

      if (input.resourcePools) {
        await client.query("delete from resource_pools where partner_location_id = $1", [partnerLocationId]);
        for (const resource of input.resourcePools) {
          await client.query(
            `insert into resource_pools (id, partner_location_id, resource_type, name, quantity, enabled)
             values ($1, $2, $3, $4, $5, $6)`,
            [
              `res_pool_${crypto.randomUUID()}`,
              partnerLocationId,
              resource.resourceType,
              resource.name,
              resource.quantity,
              resource.enabled,
            ],
          );
        }
      }

      if (input.serviceCapacityRules) {
        await client.query("delete from service_capacity_rules where partner_location_id = $1", [partnerLocationId]);
        for (const rule of input.serviceCapacityRules) {
          await client.query(
            `insert into service_capacity_rules (
              id, partner_location_id, service_code, duration_minutes, pre_buffer_minutes, post_buffer_minutes,
              required_staff, required_resource_type, required_resource_quantity, max_concurrent, max_daily_bookings, enabled
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              `svc_rule_${crypto.randomUUID()}`,
              partnerLocationId,
              rule.serviceCode,
              rule.durationMinutes,
              rule.preBufferMinutes,
              rule.postBufferMinutes,
              rule.requiredStaff,
              rule.requiredResourceType,
              rule.requiredResourceQuantity,
              rule.maxConcurrent,
              rule.maxDailyBookings,
              rule.enabled,
            ],
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

    return this.get(partnerLocationId);
  }
}

export function validateSchedulingConfig(input: UpdateSchedulingConfigRequest): string[] {
  const errors: string[] = [];

  for (const rule of input.operatingScheduleRules ?? []) {
    if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) {
      errors.push("weekday must be between 0 and 6");
    }

    if (!isValidTime(rule.openTime) || !isValidTime(rule.closeTime)) {
      errors.push("schedule openTime and closeTime must use HH:mm format");
    }

    if (isValidTime(rule.openTime) && isValidTime(rule.closeTime) && timeToMinutes(rule.closeTime) <= timeToMinutes(rule.openTime)) {
      errors.push("schedule closeTime must be after openTime");
    }
  }

  for (const exception of input.calendarExceptions ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.date)) {
      errors.push("exception date must use YYYY-MM-DD format");
    }

    if (exception.type === "special_hours") {
      if (!exception.openTime || !exception.closeTime) {
        errors.push("special_hours exceptions require openTime and closeTime");
      } else if (!isValidTime(exception.openTime) || !isValidTime(exception.closeTime)) {
        errors.push("exception openTime and closeTime must use HH:mm format");
      } else if (timeToMinutes(exception.closeTime) <= timeToMinutes(exception.openTime)) {
        errors.push("exception closeTime must be after openTime");
      }
    }
  }

  for (const resource of input.resourcePools ?? []) {
    if (!isResourceType(resource.resourceType)) {
      errors.push(`resourceType ${resource.resourceType} is not supported`);
    }

    if (!Number.isInteger(resource.quantity) || resource.quantity < 1) {
      errors.push("resource quantity must be a positive integer");
    }
  }

  for (const rule of input.serviceCapacityRules ?? []) {
    if (!findServiceOffering(rule.serviceCode)) {
      errors.push(`serviceCode ${rule.serviceCode} is not available`);
    }

    if (!Number.isInteger(rule.durationMinutes) || rule.durationMinutes < 15) {
      errors.push("durationMinutes must be at least 15");
    }

    if (!Number.isInteger(rule.preBufferMinutes) || rule.preBufferMinutes < 0) {
      errors.push("preBufferMinutes must be zero or greater");
    }

    if (!Number.isInteger(rule.postBufferMinutes) || rule.postBufferMinutes < 0) {
      errors.push("postBufferMinutes must be zero or greater");
    }

    if (!Number.isInteger(rule.requiredStaff) || rule.requiredStaff < 1) {
      errors.push("requiredStaff must be a positive integer");
    }

    if (!isResourceType(rule.requiredResourceType)) {
      errors.push(`requiredResourceType ${rule.requiredResourceType} is not supported`);
    }

    if (!Number.isInteger(rule.requiredResourceQuantity) || rule.requiredResourceQuantity < 1) {
      errors.push("requiredResourceQuantity must be a positive integer");
    }

    if (!Number.isInteger(rule.maxConcurrent) || rule.maxConcurrent < 1) {
      errors.push("maxConcurrent must be a positive integer");
    }

    if (!Number.isInteger(rule.maxDailyBookings) || rule.maxDailyBookings < 1) {
      errors.push("maxDailyBookings must be a positive integer");
    }
  }

  return errors;
}

function defaultSchedulingConfig(partnerLocationId: string): SchedulingConfig {
  return {
    operatingScheduleRules: weekdays.map((weekday) => ({
      id: `schedule_demo_${weekday}`,
      partnerLocationId,
      weekday,
      openTime: "08:00",
      closeTime: "19:00",
      enabled: true,
    })),
    calendarExceptions: [],
    resourcePools: [
      { id: "res_demo_staff", partnerLocationId, resourceType: "staff", name: "Care team", quantity: 3, enabled: true },
      { id: "res_demo_bay", partnerLocationId, resourceType: "wash_bay", name: "Wash bays", quantity: 2, enabled: true },
      { id: "res_demo_detail", partnerLocationId, resourceType: "detail_bay", name: "Detail bays", quantity: 1, enabled: true },
      { id: "res_demo_interior", partnerLocationId, resourceType: "interior_station", name: "Interior stations", quantity: 1, enabled: true },
    ],
    serviceCapacityRules: [
      serviceRule(partnerLocationId, "wash_basic", 30, "wash_bay", 2, 20),
      serviceRule(partnerLocationId, "wash_premium", 60, "wash_bay", 2, 14),
      serviceRule(partnerLocationId, "detail_interior", 90, "interior_station", 1, 8),
    ],
  };
}

function emptySchedulingConfig(): SchedulingConfig {
  return {
    operatingScheduleRules: [],
    calendarExceptions: [],
    resourcePools: [],
    serviceCapacityRules: [],
  };
}

function serviceRule(
  partnerLocationId: string,
  serviceCode: ServiceCode,
  durationMinutes: number,
  resourceType: ResourceType,
  maxConcurrent: number,
  maxDailyBookings: number,
): ServiceCapacityRule {
  return {
    id: `svc_rule_demo_${serviceCode}`,
    partnerLocationId,
    serviceCode,
    durationMinutes,
    preBufferMinutes: 5,
    postBufferMinutes: 10,
    requiredStaff: 1,
    requiredResourceType: resourceType,
    requiredResourceQuantity: 1,
    maxConcurrent,
    maxDailyBookings,
    enabled: true,
  };
}

interface OperatingScheduleRuleRow {
  readonly id: string;
  readonly partner_location_id: string;
  readonly weekday: number;
  readonly open_time: string;
  readonly close_time: string;
  readonly enabled: boolean;
}

interface CalendarExceptionRow {
  readonly id: string;
  readonly partner_location_id: string;
  readonly date: Date | string;
  readonly type: CalendarException["type"];
  readonly reason: string;
  readonly open_time: string | null;
  readonly close_time: string | null;
}

interface ResourcePoolRow {
  readonly id: string;
  readonly partner_location_id: string;
  readonly resource_type: ResourceType;
  readonly name: string;
  readonly quantity: number;
  readonly enabled: boolean;
}

interface ServiceCapacityRuleRow {
  readonly id: string;
  readonly partner_location_id: string;
  readonly service_code: ServiceCode;
  readonly duration_minutes: number;
  readonly pre_buffer_minutes: number;
  readonly post_buffer_minutes: number;
  readonly required_staff: number;
  readonly required_resource_type: ResourceType;
  readonly required_resource_quantity: number;
  readonly max_concurrent: number;
  readonly max_daily_bookings: number;
  readonly enabled: boolean;
}

function mapScheduleRow(row: OperatingScheduleRuleRow): OperatingScheduleRule {
  return {
    id: row.id,
    partnerLocationId: row.partner_location_id,
    weekday: row.weekday,
    openTime: row.open_time,
    closeTime: row.close_time,
    enabled: row.enabled,
  };
}

function mapExceptionRow(row: CalendarExceptionRow): CalendarException {
  return {
    id: row.id,
    partnerLocationId: row.partner_location_id,
    date: typeof row.date === "string" ? row.date.slice(0, 10) : row.date.toISOString().slice(0, 10),
    type: row.type,
    reason: row.reason,
    ...(row.open_time ? { openTime: row.open_time } : {}),
    ...(row.close_time ? { closeTime: row.close_time } : {}),
  };
}

function mapResourceRow(row: ResourcePoolRow): ResourcePool {
  return {
    id: row.id,
    partnerLocationId: row.partner_location_id,
    resourceType: row.resource_type,
    name: row.name,
    quantity: row.quantity,
    enabled: row.enabled,
  };
}

function mapServiceRuleRow(row: ServiceCapacityRuleRow): ServiceCapacityRule {
  return {
    id: row.id,
    partnerLocationId: row.partner_location_id,
    serviceCode: row.service_code,
    durationMinutes: row.duration_minutes,
    preBufferMinutes: row.pre_buffer_minutes,
    postBufferMinutes: row.post_buffer_minutes,
    requiredStaff: row.required_staff,
    requiredResourceType: row.required_resource_type,
    requiredResourceQuantity: row.required_resource_quantity,
    maxConcurrent: row.max_concurrent,
    maxDailyBookings: row.max_daily_bookings,
    enabled: row.enabled,
  };
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function isResourceType(value: string): value is ResourceType {
  return ["staff", "wash_bay", "detail_bay", "interior_station"].includes(value);
}
