import type {
  Actor,
  CreatePaymentReconciliationCaseRequest,
  PaymentOperation,
  PaymentReconciliationCase,
  PaymentReconciliationCaseDetail,
  PaymentReconciliationCaseEvent,
  PaymentReconciliationCaseStatus,
  PaymentReconciliationCaseType,
  UpdatePaymentReconciliationCaseRequest,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface CreatePaymentReconciliationCaseInput extends CreatePaymentReconciliationCaseRequest {
  readonly operation: PaymentOperation;
  readonly actor: Actor;
}

export interface UpdatePaymentReconciliationCaseInput extends UpdatePaymentReconciliationCaseRequest {
  readonly actor: Actor;
}

export interface ListPaymentReconciliationCasesFilter {
  readonly status?: PaymentReconciliationCaseStatus | "all" | undefined;
  readonly bookingId?: string | undefined;
  readonly limit?: number | undefined;
}

export interface PaymentReconciliationCaseRepository {
  list(filter?: ListPaymentReconciliationCasesFilter): Promise<readonly PaymentReconciliationCase[]>;
  get(id: string): Promise<PaymentReconciliationCaseDetail | undefined>;
  create(input: CreatePaymentReconciliationCaseInput): Promise<PaymentReconciliationCaseDetail>;
  update(id: string, input: UpdatePaymentReconciliationCaseInput): Promise<PaymentReconciliationCaseDetail | undefined>;
}

const caseTypes: readonly PaymentReconciliationCaseType[] = [
  "payment_failed",
  "stripe_dispute",
  "invalid_transition",
  "duplicate_event",
  "provider_mismatch",
];
const caseStatuses: readonly PaymentReconciliationCaseStatus[] = [
  "open",
  "waiting_customer",
  "waiting_partner",
  "resolved",
  "written_off",
];
const caseTypeSet = new Set<PaymentReconciliationCaseType>(caseTypes);
const caseStatusSet = new Set<PaymentReconciliationCaseStatus>(caseStatuses);

export function validateCreatePaymentReconciliationCase(input: Partial<CreatePaymentReconciliationCaseRequest>): readonly string[] {
  const errors: string[] = [];

  if (!input.paymentOperationId?.trim()) {
    errors.push("paymentOperationId is required");
  }

  if (!input.caseType || !caseTypeSet.has(input.caseType)) {
    errors.push("caseType must be one of payment_failed, stripe_dispute, invalid_transition, duplicate_event, provider_mismatch");
  }

  if (!input.summary?.trim()) {
    errors.push("summary is required");
  } else if (input.summary.trim().length > 500) {
    errors.push("summary must be 500 characters or fewer");
  }

  if (input.assignedToUserId && input.assignedToUserId.length > 120) {
    errors.push("assignedToUserId must be 120 characters or fewer");
  }

  if (input.note && input.note.length > 2000) {
    errors.push("note must be 2000 characters or fewer");
  }

  return errors;
}

export function validateUpdatePaymentReconciliationCase(input: Partial<UpdatePaymentReconciliationCaseRequest>): readonly string[] {
  const errors: string[] = [];

  if (input.status && !caseStatusSet.has(input.status)) {
    errors.push("status must be one of open, waiting_customer, waiting_partner, resolved, written_off");
  }

  if (input.assignedToUserId && input.assignedToUserId.length > 120) {
    errors.push("assignedToUserId must be 120 characters or fewer");
  }

  if (input.note && input.note.length > 2000) {
    errors.push("note must be 2000 characters or fewer");
  }

  if (input.resolutionNotes && input.resolutionNotes.length > 2000) {
    errors.push("resolutionNotes must be 2000 characters or fewer");
  }

  if (input.status === "resolved" && !input.resolutionNotes?.trim() && !input.note?.trim()) {
    errors.push("resolutionNotes or note is required when resolving a case");
  }

  return errors;
}

export class InMemoryPaymentReconciliationCaseRepository implements PaymentReconciliationCaseRepository {
  readonly #cases = new Map<string, PaymentReconciliationCase>();
  readonly #events = new Map<string, PaymentReconciliationCaseEvent[]>();

  async list(filter: ListPaymentReconciliationCasesFilter = {}): Promise<readonly PaymentReconciliationCase[]> {
    return [...this.#cases.values()]
      .filter((record) => !filter.bookingId || record.bookingId === filter.bookingId)
      .filter((record) => !filter.status || filter.status === "all" || record.status === filter.status)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, normalizeLimit(filter.limit));
  }

  async get(id: string): Promise<PaymentReconciliationCaseDetail | undefined> {
    const record = this.#cases.get(id);
    return record ? { case: record, events: this.#eventsFor(id) } : undefined;
  }

  async create(input: CreatePaymentReconciliationCaseInput): Promise<PaymentReconciliationCaseDetail> {
    const record = buildPaymentReconciliationCase(input);
    const events = [
      buildPaymentReconciliationCaseEvent({
        caseId: record.id,
        actorUserId: input.actor.userId,
        eventType: "created",
        toStatus: record.status,
        note: input.note?.trim() || undefined,
        metadata: { paymentOperationId: input.paymentOperationId },
      }),
    ];
    this.#cases.set(record.id, record);
    this.#events.set(record.id, events);
    return { case: record, events: this.#eventsFor(record.id) };
  }

  async update(id: string, input: UpdatePaymentReconciliationCaseInput): Promise<PaymentReconciliationCaseDetail | undefined> {
    const existing = this.#cases.get(id);
    if (!existing) {
      return undefined;
    }

    const updated = updatePaymentReconciliationCase(existing, input);
    this.#cases.set(id, updated);
    const events = this.#events.get(id) ?? [];
    const nextEvents = buildUpdateEvents(existing, updated, input);
    this.#events.set(id, [...events, ...nextEvents]);
    return { case: updated, events: this.#eventsFor(id) };
  }

  #eventsFor(caseId: string): readonly PaymentReconciliationCaseEvent[] {
    return (this.#events.get(caseId) ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class PostgresPaymentReconciliationCaseRepository implements PaymentReconciliationCaseRepository {
  constructor(private readonly pool: DatabasePool) {}

  async list(filter: ListPaymentReconciliationCasesFilter = {}): Promise<readonly PaymentReconciliationCase[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (filter.bookingId) {
      values.push(filter.bookingId);
      clauses.push(`booking_id = $${values.length}`);
    }

    if (filter.status && filter.status !== "all") {
      values.push(filter.status);
      clauses.push(`status = $${values.length}`);
    }

    values.push(normalizeLimit(filter.limit));
    const whereClause = clauses.length ? `where ${clauses.join(" and ")}` : "";
    const result = await this.pool.query<PaymentReconciliationCaseRow>(
      `${paymentReconciliationCaseSelectSql}
       ${whereClause}
       order by updated_at desc
       limit $${values.length}`,
      values,
    );

    return result.rows.map(mapPaymentReconciliationCaseRow);
  }

  async get(id: string): Promise<PaymentReconciliationCaseDetail | undefined> {
    const result = await this.pool.query<PaymentReconciliationCaseRow>(
      `${paymentReconciliationCaseSelectSql} where id = $1`,
      [id],
    );
    const record = result.rows[0] ? mapPaymentReconciliationCaseRow(result.rows[0]) : undefined;
    return record ? { case: record, events: await this.#listEvents(id) } : undefined;
  }

  async create(input: CreatePaymentReconciliationCaseInput): Promise<PaymentReconciliationCaseDetail> {
    const record = buildPaymentReconciliationCase(input);
    const event = buildPaymentReconciliationCaseEvent({
      caseId: record.id,
      actorUserId: input.actor.userId,
      eventType: "created",
      toStatus: record.status,
      note: input.note?.trim() || undefined,
      metadata: { paymentOperationId: input.paymentOperationId },
    });
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      await client.query(
        `insert into payment_reconciliation_cases (
          id, case_type, status, booking_id, owner_id, payment_intent_id, payment_operation_id,
          provider_reference, provider_event_type, assigned_to_user_id, summary, resolution_notes,
          opened_by_user_id, opened_at, updated_at, resolved_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          record.id,
          record.caseType,
          record.status,
          record.bookingId,
          record.ownerId,
          record.paymentIntentId ?? null,
          record.paymentOperationId ?? null,
          record.providerReference ?? null,
          record.providerEventType ?? null,
          record.assignedToUserId ?? null,
          record.summary,
          record.resolutionNotes ?? null,
          record.openedByUserId,
          record.openedAt,
          record.updatedAt,
          record.resolvedAt ?? null,
        ],
      );
      await insertPaymentReconciliationCaseEvent(client, event);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    return { case: record, events: [event] };
  }

  async update(id: string, input: UpdatePaymentReconciliationCaseInput): Promise<PaymentReconciliationCaseDetail | undefined> {
    const existingDetail = await this.get(id);
    if (!existingDetail) {
      return undefined;
    }

    const updated = updatePaymentReconciliationCase(existingDetail.case, input);
    const events = buildUpdateEvents(existingDetail.case, updated, input);
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      await client.query(
        `update payment_reconciliation_cases
         set status = $2, assigned_to_user_id = $3, resolution_notes = $4, updated_at = $5, resolved_at = $6
         where id = $1`,
        [
          updated.id,
          updated.status,
          updated.assignedToUserId ?? null,
          updated.resolutionNotes ?? null,
          updated.updatedAt,
          updated.resolvedAt ?? null,
        ],
      );
      for (const event of events) {
        await insertPaymentReconciliationCaseEvent(client, event);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    return { case: updated, events: await this.#listEvents(id) };
  }

  async #listEvents(caseId: string): Promise<readonly PaymentReconciliationCaseEvent[]> {
    const result = await this.pool.query<PaymentReconciliationCaseEventRow>(
      `select id, case_id, event_type, actor_user_id, from_status, to_status, note, metadata, created_at
       from payment_reconciliation_case_events
       where case_id = $1
       order by created_at desc`,
      [caseId],
    );

    return result.rows.map(mapPaymentReconciliationCaseEventRow);
  }
}

const paymentReconciliationCaseSelectSql = `
  select id, case_type, status, booking_id, owner_id, payment_intent_id, payment_operation_id,
         provider_reference, provider_event_type, assigned_to_user_id, summary, resolution_notes,
         opened_by_user_id, opened_at, updated_at, resolved_at
  from payment_reconciliation_cases`;

interface PaymentReconciliationCaseRow {
  readonly id: string;
  readonly case_type: PaymentReconciliationCaseType;
  readonly status: PaymentReconciliationCaseStatus;
  readonly booking_id: string;
  readonly owner_id: string;
  readonly payment_intent_id: string | null;
  readonly payment_operation_id: string | null;
  readonly provider_reference: string | null;
  readonly provider_event_type: string | null;
  readonly assigned_to_user_id: string | null;
  readonly summary: string;
  readonly resolution_notes: string | null;
  readonly opened_by_user_id: string;
  readonly opened_at: Date | string;
  readonly updated_at: Date | string;
  readonly resolved_at: Date | string | null;
}

interface PaymentReconciliationCaseEventRow {
  readonly id: string;
  readonly case_id: string;
  readonly event_type: PaymentReconciliationCaseEvent["eventType"];
  readonly actor_user_id: string;
  readonly from_status: PaymentReconciliationCaseStatus | null;
  readonly to_status: PaymentReconciliationCaseStatus | null;
  readonly note: string | null;
  readonly metadata: Record<string, unknown> | string | null;
  readonly created_at: Date | string;
}

function buildPaymentReconciliationCase(input: CreatePaymentReconciliationCaseInput): PaymentReconciliationCase {
  const now = new Date().toISOString();
  return {
    id: `paycase_${crypto.randomUUID()}`,
    caseType: input.caseType,
    status: "open",
    bookingId: input.operation.bookingId,
    ownerId: input.operation.ownerId,
    ...(input.operation.paymentIntentId ? { paymentIntentId: input.operation.paymentIntentId } : {}),
    paymentOperationId: input.paymentOperationId,
    ...(input.operation.providerReference ? { providerReference: input.operation.providerReference } : {}),
    ...(typeof input.operation.metadata?.stripeEventType === "string" ? { providerEventType: input.operation.metadata.stripeEventType } : {}),
    ...(input.assignedToUserId?.trim() ? { assignedToUserId: input.assignedToUserId.trim() } : {}),
    summary: input.summary.trim(),
    openedByUserId: input.actor.userId,
    openedAt: now,
    updatedAt: now,
  };
}

function updatePaymentReconciliationCase(
  existing: PaymentReconciliationCase,
  input: UpdatePaymentReconciliationCaseInput,
): PaymentReconciliationCase {
  const status = input.status ?? existing.status;
  const resolvedAt = status === "resolved" || status === "written_off"
    ? existing.resolvedAt ?? new Date().toISOString()
    : undefined;
  const assignedToUserId = input.assignedToUserId === null
    ? undefined
    : input.assignedToUserId?.trim() || existing.assignedToUserId;
  const resolutionNotes = input.resolutionNotes?.trim() || existing.resolutionNotes;

  const updated: PaymentReconciliationCase = {
    ...existing,
    status,
    updatedAt: new Date().toISOString(),
  };
  delete (updated as { assignedToUserId?: string }).assignedToUserId;
  delete (updated as { resolutionNotes?: string }).resolutionNotes;
  delete (updated as { resolvedAt?: string }).resolvedAt;

  if (assignedToUserId) {
    (updated as { assignedToUserId?: string }).assignedToUserId = assignedToUserId;
  }

  if (resolutionNotes) {
    (updated as { resolutionNotes?: string }).resolutionNotes = resolutionNotes;
  }

  if (resolvedAt) {
    (updated as { resolvedAt?: string }).resolvedAt = resolvedAt;
  }

  return updated;
}

function buildUpdateEvents(
  existing: PaymentReconciliationCase,
  updated: PaymentReconciliationCase,
  input: UpdatePaymentReconciliationCaseInput,
): readonly PaymentReconciliationCaseEvent[] {
  const events: PaymentReconciliationCaseEvent[] = [];

  if (input.status && input.status !== existing.status) {
    events.push(buildPaymentReconciliationCaseEvent({
      caseId: existing.id,
      actorUserId: input.actor.userId,
      eventType: input.status === "resolved" ? "resolved" : "status_changed",
      fromStatus: existing.status,
      toStatus: updated.status,
      note: input.resolutionNotes?.trim() || input.note?.trim() || undefined,
    }));
  }

  if (input.assignedToUserId !== undefined && input.assignedToUserId !== existing.assignedToUserId) {
    events.push(buildPaymentReconciliationCaseEvent({
      caseId: existing.id,
      actorUserId: input.actor.userId,
      eventType: "assigned",
      note: input.assignedToUserId ? `Assigned to ${input.assignedToUserId}` : "Assignment cleared",
    }));
  }

  if (input.note?.trim() && !events.some((event) => event.note === input.note?.trim())) {
    events.push(buildPaymentReconciliationCaseEvent({
      caseId: existing.id,
      actorUserId: input.actor.userId,
      eventType: "note_added",
      note: input.note.trim(),
    }));
  }

  return events;
}

function buildPaymentReconciliationCaseEvent(input: {
  readonly caseId: string;
  readonly actorUserId: string;
  readonly eventType: PaymentReconciliationCaseEvent["eventType"];
  readonly fromStatus?: PaymentReconciliationCaseStatus | undefined;
  readonly toStatus?: PaymentReconciliationCaseStatus | undefined;
  readonly note?: string | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}): PaymentReconciliationCaseEvent {
  return {
    id: `paycase_event_${crypto.randomUUID()}`,
    caseId: input.caseId,
    eventType: input.eventType,
    actorUserId: input.actorUserId,
    ...(input.fromStatus ? { fromStatus: input.fromStatus } : {}),
    ...(input.toStatus ? { toStatus: input.toStatus } : {}),
    ...(input.note ? { note: input.note } : {}),
    metadata: input.metadata ?? {},
    createdAt: new Date().toISOString(),
  };
}

async function insertPaymentReconciliationCaseEvent(
  client: Pick<DatabasePool, "query">,
  event: PaymentReconciliationCaseEvent,
): Promise<void> {
  await client.query(
    `insert into payment_reconciliation_case_events (
      id, case_id, event_type, actor_user_id, from_status, to_status, note, metadata, created_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      event.id,
      event.caseId,
      event.eventType,
      event.actorUserId,
      event.fromStatus ?? null,
      event.toStatus ?? null,
      event.note ?? null,
      JSON.stringify(event.metadata),
      event.createdAt,
    ],
  );
}

function mapPaymentReconciliationCaseRow(row: PaymentReconciliationCaseRow): PaymentReconciliationCase {
  return {
    id: row.id,
    caseType: row.case_type,
    status: row.status,
    bookingId: row.booking_id,
    ownerId: row.owner_id,
    ...(row.payment_intent_id ? { paymentIntentId: row.payment_intent_id } : {}),
    ...(row.payment_operation_id ? { paymentOperationId: row.payment_operation_id } : {}),
    ...(row.provider_reference ? { providerReference: row.provider_reference } : {}),
    ...(row.provider_event_type ? { providerEventType: row.provider_event_type } : {}),
    ...(row.assigned_to_user_id ? { assignedToUserId: row.assigned_to_user_id } : {}),
    summary: row.summary,
    ...(row.resolution_notes ? { resolutionNotes: row.resolution_notes } : {}),
    openedByUserId: row.opened_by_user_id,
    openedAt: new Date(row.opened_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    ...(row.resolved_at ? { resolvedAt: new Date(row.resolved_at).toISOString() } : {}),
  };
}

function mapPaymentReconciliationCaseEventRow(row: PaymentReconciliationCaseEventRow): PaymentReconciliationCaseEvent {
  return {
    id: row.id,
    caseId: row.case_id,
    eventType: row.event_type,
    actorUserId: row.actor_user_id,
    ...(row.from_status ? { fromStatus: row.from_status } : {}),
    ...(row.to_status ? { toStatus: row.to_status } : {}),
    ...(row.note ? { note: row.note } : {}),
    metadata: parseMetadata(row.metadata),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function parseMetadata(metadata: PaymentReconciliationCaseEventRow["metadata"]): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  if (typeof metadata === "string") {
    const parsed = JSON.parse(metadata) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  }

  return metadata;
}

function normalizeLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit)) {
    return 100;
  }

  return Math.max(1, Math.min(Math.trunc(limit), 200));
}
