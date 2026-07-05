import type {
  Actor,
  ActorRole,
  PaymentOperation,
  PaymentOperationName,
  PaymentOperationStatus,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";
import type { PaymentProviderResult } from "../payments/provider.js";

export interface CreatePaymentOperationInput {
  readonly paymentIntentId?: string | undefined;
  readonly bookingId: string;
  readonly ownerId: string;
  readonly operation: PaymentOperationName;
  readonly status: PaymentOperationStatus;
  readonly providerResult?: PaymentProviderResult | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly actor?: Actor | undefined;
  readonly requestId?: string | undefined;
  readonly errorMessage?: string | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface ListPaymentOperationsFilter {
  readonly bookingId?: string | undefined;
  readonly paymentIntentId?: string | undefined;
  readonly limit?: number | undefined;
}

export interface PaymentOperationRepository {
  list(filter?: ListPaymentOperationsFilter): Promise<readonly PaymentOperation[]>;
  create(input: CreatePaymentOperationInput): Promise<PaymentOperation>;
  findSucceededByIdempotencyKey(input: {
    readonly operation: PaymentOperationName;
    readonly bookingId: string;
    readonly idempotencyKey: string;
  }): Promise<PaymentOperation | undefined>;
}

export class InMemoryPaymentOperationRepository implements PaymentOperationRepository {
  readonly #records: PaymentOperation[] = [];

  async list(filter: ListPaymentOperationsFilter = {}): Promise<readonly PaymentOperation[]> {
    return this.#records
      .filter((record) => !filter.bookingId || record.bookingId === filter.bookingId)
      .filter((record) => !filter.paymentIntentId || record.paymentIntentId === filter.paymentIntentId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, normalizeLimit(filter.limit));
  }

  async create(input: CreatePaymentOperationInput): Promise<PaymentOperation> {
    const record = buildPaymentOperation(input);
    this.#records.push(record);
    return record;
  }

  async findSucceededByIdempotencyKey(input: {
    readonly operation: PaymentOperationName;
    readonly bookingId: string;
    readonly idempotencyKey: string;
  }): Promise<PaymentOperation | undefined> {
    return this.#records
      .slice()
      .reverse()
      .find(
        (record) =>
          record.operation === input.operation &&
          record.bookingId === input.bookingId &&
          record.idempotencyKey === input.idempotencyKey &&
          record.status === "succeeded",
      );
  }
}

export class PostgresPaymentOperationRepository implements PaymentOperationRepository {
  constructor(private readonly pool: DatabasePool) {}

  async list(filter: ListPaymentOperationsFilter = {}): Promise<readonly PaymentOperation[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (filter.bookingId) {
      values.push(filter.bookingId);
      clauses.push(`booking_id = $${values.length}`);
    }

    if (filter.paymentIntentId) {
      values.push(filter.paymentIntentId);
      clauses.push(`payment_intent_id = $${values.length}`);
    }

    values.push(normalizeLimit(filter.limit));
    const whereClause = clauses.length > 0 ? `where ${clauses.join(" and ")}` : "";
    const result = await this.pool.query<PaymentOperationRow>(
      `select id, payment_intent_id, booking_id, owner_id, operation, status,
              provider, provider_operation, provider_reference, provider_status, provider_processed_at,
              idempotency_key, actor_user_id, actor_role, request_id, error_message, metadata, created_at
       from payment_operations
       ${whereClause}
       order by created_at desc
       limit $${values.length}`,
      values,
    );

    return result.rows.map(mapPaymentOperationRow);
  }

  async create(input: CreatePaymentOperationInput): Promise<PaymentOperation> {
    const record = buildPaymentOperation(input);
    const result = await this.pool.query<PaymentOperationRow>(
      `insert into payment_operations (
        id, payment_intent_id, booking_id, owner_id, operation, status,
        provider, provider_operation, provider_reference, provider_status, provider_processed_at,
        idempotency_key, actor_user_id, actor_role, request_id, error_message, metadata, created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      returning id, payment_intent_id, booking_id, owner_id, operation, status,
                provider, provider_operation, provider_reference, provider_status, provider_processed_at,
                idempotency_key, actor_user_id, actor_role, request_id, error_message, metadata, created_at`,
      [
        record.id,
        record.paymentIntentId ?? null,
        record.bookingId,
        record.ownerId,
        record.operation,
        record.status,
        record.provider ?? null,
        record.providerOperation ?? null,
        record.providerReference ?? null,
        record.providerStatus ?? null,
        record.providerProcessedAt ?? null,
        record.idempotencyKey ?? null,
        record.actorUserId ?? null,
        record.actorRole ?? null,
        record.requestId ?? null,
        record.errorMessage ?? null,
        JSON.stringify(record.metadata),
        record.createdAt,
      ],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("payment_operation_create_failed");
    }

    return mapPaymentOperationRow(row);
  }

  async findSucceededByIdempotencyKey(input: {
    readonly operation: PaymentOperationName;
    readonly bookingId: string;
    readonly idempotencyKey: string;
  }): Promise<PaymentOperation | undefined> {
    const result = await this.pool.query<PaymentOperationRow>(
      `select id, payment_intent_id, booking_id, owner_id, operation, status,
              provider, provider_operation, provider_reference, provider_status, provider_processed_at,
              idempotency_key, actor_user_id, actor_role, request_id, error_message, metadata, created_at
       from payment_operations
       where operation = $1 and booking_id = $2 and idempotency_key = $3 and status = 'succeeded'
       order by created_at desc
       limit 1`,
      [input.operation, input.bookingId, input.idempotencyKey],
    );

    return result.rows[0] ? mapPaymentOperationRow(result.rows[0]) : undefined;
  }
}

interface PaymentOperationRow {
  readonly id: string;
  readonly payment_intent_id: string | null;
  readonly booking_id: string;
  readonly owner_id: string;
  readonly operation: PaymentOperationName;
  readonly status: PaymentOperationStatus;
  readonly provider: string | null;
  readonly provider_operation: string | null;
  readonly provider_reference: string | null;
  readonly provider_status: string | null;
  readonly provider_processed_at: Date | string | null;
  readonly idempotency_key: string | null;
  readonly actor_user_id: string | null;
  readonly actor_role: ActorRole | null;
  readonly request_id: string | null;
  readonly error_message: string | null;
  readonly metadata: Record<string, unknown> | string | null;
  readonly created_at: Date | string;
}

function buildPaymentOperation(input: CreatePaymentOperationInput): PaymentOperation {
  const providerResult = input.providerResult;
  return {
    id: `payop_${crypto.randomUUID()}`,
    ...(input.paymentIntentId ? { paymentIntentId: input.paymentIntentId } : {}),
    bookingId: input.bookingId,
    ownerId: input.ownerId,
    operation: input.operation,
    status: input.status,
    ...(providerResult ? { provider: providerResult.provider } : {}),
    ...(providerResult ? { providerOperation: providerResult.operation } : {}),
    ...(providerResult ? { providerReference: providerResult.providerReference } : {}),
    ...(providerResult ? { providerStatus: providerResult.status } : {}),
    ...(providerResult ? { providerProcessedAt: providerResult.processedAt } : {}),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.actor ? { actorUserId: input.actor.userId, actorRole: input.actor.role } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
    metadata: input.metadata ?? {},
    createdAt: new Date().toISOString(),
  };
}

function mapPaymentOperationRow(row: PaymentOperationRow): PaymentOperation {
  return {
    id: row.id,
    ...(row.payment_intent_id ? { paymentIntentId: row.payment_intent_id } : {}),
    bookingId: row.booking_id,
    ownerId: row.owner_id,
    operation: row.operation,
    status: row.status,
    ...(row.provider ? { provider: row.provider } : {}),
    ...(row.provider_operation ? { providerOperation: row.provider_operation } : {}),
    ...(row.provider_reference ? { providerReference: row.provider_reference } : {}),
    ...(row.provider_status ? { providerStatus: row.provider_status } : {}),
    ...(row.provider_processed_at ? { providerProcessedAt: new Date(row.provider_processed_at).toISOString() } : {}),
    ...(row.idempotency_key ? { idempotencyKey: row.idempotency_key } : {}),
    ...(row.actor_user_id ? { actorUserId: row.actor_user_id } : {}),
    ...(row.actor_role ? { actorRole: row.actor_role } : {}),
    ...(row.request_id ? { requestId: row.request_id } : {}),
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    metadata: parseMetadata(row.metadata),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function parseMetadata(metadata: PaymentOperationRow["metadata"]): Record<string, unknown> {
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
