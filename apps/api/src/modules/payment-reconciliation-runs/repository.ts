import type {
  Actor,
  PaymentProviderReconciliationRun,
  PaymentProviderReconciliationRunStatus,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface StartPaymentProviderReconciliationRunInput {
  readonly provider: string;
  readonly actor?: Actor | undefined;
  readonly requestId?: string | undefined;
}

export interface CompletePaymentProviderReconciliationRunInput {
  readonly checked: number;
  readonly matched: number;
  readonly mismatched: number;
  readonly failed: number;
  readonly casesOpened: number;
}

export interface FailPaymentProviderReconciliationRunInput extends CompletePaymentProviderReconciliationRunInput {
  readonly errorMessage: string;
}

export interface ListPaymentProviderReconciliationRunsFilter {
  readonly provider?: string | undefined;
  readonly limit?: number | undefined;
}

export interface PaymentProviderReconciliationRunRepository {
  list(filter?: ListPaymentProviderReconciliationRunsFilter): Promise<readonly PaymentProviderReconciliationRun[]>;
  start(input: StartPaymentProviderReconciliationRunInput): Promise<PaymentProviderReconciliationRun>;
  complete(id: string, input: CompletePaymentProviderReconciliationRunInput): Promise<PaymentProviderReconciliationRun>;
  fail(id: string, input: FailPaymentProviderReconciliationRunInput): Promise<PaymentProviderReconciliationRun>;
}

export class InMemoryPaymentProviderReconciliationRunRepository implements PaymentProviderReconciliationRunRepository {
  readonly #runs = new Map<string, PaymentProviderReconciliationRun>();

  async list(filter: ListPaymentProviderReconciliationRunsFilter = {}): Promise<readonly PaymentProviderReconciliationRun[]> {
    return [...this.#runs.values()]
      .filter((run) => !filter.provider || run.provider === filter.provider)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, normalizeLimit(filter.limit));
  }

  async start(input: StartPaymentProviderReconciliationRunInput): Promise<PaymentProviderReconciliationRun> {
    const run: PaymentProviderReconciliationRun = {
      id: `payrecon_${crypto.randomUUID()}`,
      provider: input.provider,
      status: "running",
      ...(input.actor?.userId ? { actorUserId: input.actor.userId } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      checked: 0,
      matched: 0,
      mismatched: 0,
      failed: 0,
      casesOpened: 0,
      startedAt: new Date().toISOString(),
    };
    this.#runs.set(run.id, run);
    return run;
  }

  async complete(id: string, input: CompletePaymentProviderReconciliationRunInput): Promise<PaymentProviderReconciliationRun> {
    return this.#finish(id, "completed", input);
  }

  async fail(id: string, input: FailPaymentProviderReconciliationRunInput): Promise<PaymentProviderReconciliationRun> {
    return this.#finish(id, "failed", input);
  }

  #finish(
    id: string,
    status: PaymentProviderReconciliationRunStatus,
    input: CompletePaymentProviderReconciliationRunInput & { readonly errorMessage?: string },
  ): PaymentProviderReconciliationRun {
    const existing = this.#runs.get(id);

    if (!existing) {
      throw new Error("payment_provider_reconciliation_run_not_found");
    }

    const updated: PaymentProviderReconciliationRun = {
      ...existing,
      status,
      checked: input.checked,
      matched: input.matched,
      mismatched: input.mismatched,
      failed: input.failed,
      casesOpened: input.casesOpened,
      ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
      completedAt: new Date().toISOString(),
    };
    this.#runs.set(id, updated);
    return updated;
  }
}

export class PostgresPaymentProviderReconciliationRunRepository implements PaymentProviderReconciliationRunRepository {
  constructor(private readonly pool: DatabasePool) {}

  async list(filter: ListPaymentProviderReconciliationRunsFilter = {}): Promise<readonly PaymentProviderReconciliationRun[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (filter.provider) {
      values.push(filter.provider);
      clauses.push(`provider = $${values.length}`);
    }

    values.push(normalizeLimit(filter.limit));
    const whereClause = clauses.length ? `where ${clauses.join(" and ")}` : "";
    const result = await this.pool.query<PaymentProviderReconciliationRunRow>(
      `${paymentProviderReconciliationRunSelectSql}
       ${whereClause}
       order by started_at desc
       limit $${values.length}`,
      values,
    );

    return result.rows.map(mapPaymentProviderReconciliationRunRow);
  }

  async start(input: StartPaymentProviderReconciliationRunInput): Promise<PaymentProviderReconciliationRun> {
    const run: PaymentProviderReconciliationRun = {
      id: `payrecon_${crypto.randomUUID()}`,
      provider: input.provider,
      status: "running",
      ...(input.actor?.userId ? { actorUserId: input.actor.userId } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      checked: 0,
      matched: 0,
      mismatched: 0,
      failed: 0,
      casesOpened: 0,
      startedAt: new Date().toISOString(),
    };
    const result = await this.pool.query<PaymentProviderReconciliationRunRow>(
      `insert into payment_provider_reconciliation_runs (
        id, provider, status, actor_user_id, request_id,
        checked_count, matched_count, mismatched_count, failed_count, cases_opened_count,
        started_at
      )
      values ($1, $2, $3, $4, $5, 0, 0, 0, 0, 0, $6)
      returning id, provider, status, actor_user_id, request_id,
                checked_count, matched_count, mismatched_count, failed_count, cases_opened_count,
                error_message, started_at, completed_at`,
      [
        run.id,
        run.provider,
        run.status,
        run.actorUserId ?? null,
        run.requestId ?? null,
        run.startedAt,
      ],
    );

    return mapRequiredRunRow(result.rows[0]);
  }

  async complete(id: string, input: CompletePaymentProviderReconciliationRunInput): Promise<PaymentProviderReconciliationRun> {
    return this.#finish(id, "completed", input);
  }

  async fail(id: string, input: FailPaymentProviderReconciliationRunInput): Promise<PaymentProviderReconciliationRun> {
    return this.#finish(id, "failed", input);
  }

  async #finish(
    id: string,
    status: PaymentProviderReconciliationRunStatus,
    input: CompletePaymentProviderReconciliationRunInput & { readonly errorMessage?: string },
  ): Promise<PaymentProviderReconciliationRun> {
    const result = await this.pool.query<PaymentProviderReconciliationRunRow>(
      `update payment_provider_reconciliation_runs
       set status = $2,
           checked_count = $3,
           matched_count = $4,
           mismatched_count = $5,
           failed_count = $6,
           cases_opened_count = $7,
           error_message = $8,
           completed_at = $9
       where id = $1
       returning id, provider, status, actor_user_id, request_id,
                 checked_count, matched_count, mismatched_count, failed_count, cases_opened_count,
                 error_message, started_at, completed_at`,
      [
        id,
        status,
        input.checked,
        input.matched,
        input.mismatched,
        input.failed,
        input.casesOpened,
        input.errorMessage ?? null,
        new Date().toISOString(),
      ],
    );

    return mapRequiredRunRow(result.rows[0]);
  }
}

const paymentProviderReconciliationRunSelectSql = `
  select id, provider, status, actor_user_id, request_id,
         checked_count, matched_count, mismatched_count, failed_count, cases_opened_count,
         error_message, started_at, completed_at
  from payment_provider_reconciliation_runs`;

interface PaymentProviderReconciliationRunRow {
  readonly id: string;
  readonly provider: string;
  readonly status: PaymentProviderReconciliationRunStatus;
  readonly actor_user_id: string | null;
  readonly request_id: string | null;
  readonly checked_count: number;
  readonly matched_count: number;
  readonly mismatched_count: number;
  readonly failed_count: number;
  readonly cases_opened_count: number;
  readonly error_message: string | null;
  readonly started_at: Date | string;
  readonly completed_at: Date | string | null;
}

function mapRequiredRunRow(row: PaymentProviderReconciliationRunRow | undefined): PaymentProviderReconciliationRun {
  if (!row) {
    throw new Error("payment_provider_reconciliation_run_not_found");
  }

  return mapPaymentProviderReconciliationRunRow(row);
}

function mapPaymentProviderReconciliationRunRow(row: PaymentProviderReconciliationRunRow): PaymentProviderReconciliationRun {
  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    ...(row.actor_user_id ? { actorUserId: row.actor_user_id } : {}),
    ...(row.request_id ? { requestId: row.request_id } : {}),
    checked: row.checked_count,
    matched: row.matched_count,
    mismatched: row.mismatched_count,
    failed: row.failed_count,
    casesOpened: row.cases_opened_count,
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    startedAt: new Date(row.started_at).toISOString(),
    ...(row.completed_at ? { completedAt: new Date(row.completed_at).toISOString() } : {}),
  };
}

function normalizeLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit)) {
    return 20;
  }

  return Math.max(1, Math.min(Math.trunc(limit), 100));
}
