import type {
  Actor,
  PaymentIntent,
  PaymentOperation,
  PaymentProviderReconciliationRun,
  PaymentStatus,
} from "@prima-wash/contracts";
import type { Repositories } from "../repositories.js";
import type { PaymentProvider, PaymentProviderState } from "../payments/provider.js";

export interface RunPaymentProviderReconciliationInput {
  readonly provider: string;
  readonly limit: number;
  readonly actor?: Actor | undefined;
  readonly requestId?: string | undefined;
}

export async function runPaymentProviderReconciliation(
  repositories: Repositories,
  paymentProvider: PaymentProvider,
  input: RunPaymentProviderReconciliationInput,
): Promise<PaymentProviderReconciliationRun> {
  const actor = input.actor ?? systemFinanceActor;
  const provider = input.provider || "stripe";
  const run = await repositories.paymentProviderReconciliationRuns.start({
    provider,
    actor,
    requestId: input.requestId,
  });
  const totals = {
    checked: 0,
    matched: 0,
    mismatched: 0,
    failed: 0,
    casesOpened: 0,
  };

  try {
    const payments = await repositories.payments.list({
      provider,
      limit: normalizeReconciliationRunLimit(input.limit),
    });
    totals.checked = payments.length;

    for (const payment of payments) {
      if (!payment.providerReference) {
        continue;
      }

      try {
        const providerState = await paymentProvider.retrieveState(payment);

        if (isPaymentProviderStateMatched(payment.status, providerState)) {
          totals.matched += 1;
          continue;
        }

        totals.mismatched += 1;
        const operation = await recordPaymentOperation(repositories, {
          actor,
          requestId: input.requestId,
          payment,
          status: "skipped",
          metadata: {
            source: "provider_reconciliation",
            outcome: "provider_mismatch",
            provider: providerState.provider,
            providerReference: providerState.providerReference,
            providerStatus: providerState.providerStatus,
            providerNormalizedStatus: providerState.normalizedStatus,
            localStatus: payment.status,
            providerEventType: "provider_reconciliation",
            reconciliationRunId: run.id,
          },
        });
        const existingCase = await repositories.paymentReconciliationCases.findOpenByProviderEvent({
          caseType: "provider_mismatch",
          providerReference: providerState.providerReference,
          providerEventType: "provider_reconciliation",
        });

        await openAutomatedProviderMismatchCase(repositories, operation, {
          summary: `Provider status mismatch for ${providerState.providerReference}.`,
          note: `Local status is ${payment.status}; provider status is ${providerState.providerStatus} (${providerState.normalizedStatus}).`,
        });

        if (!existingCase) {
          totals.casesOpened += 1;
        }
      } catch (error) {
        totals.failed += 1;
        await recordPaymentOperation(repositories, {
          actor,
          requestId: input.requestId,
          payment,
          status: "failed",
          errorMessage: errorMessageForLedger(error),
          metadata: {
            source: "provider_reconciliation",
            outcome: "provider_state_read_failed",
            provider: payment.provider,
            providerReference: payment.providerReference,
            reconciliationRunId: run.id,
          },
        });
      }
    }

    return repositories.paymentProviderReconciliationRuns.complete(run.id, totals);
  } catch (error) {
    return repositories.paymentProviderReconciliationRuns.fail(run.id, {
      ...totals,
      errorMessage: errorMessageForLedger(error),
    });
  }
}

async function openAutomatedProviderMismatchCase(
  repositories: Repositories,
  operation: PaymentOperation,
  input: {
    readonly summary: string;
    readonly note: string;
  },
): Promise<void> {
  const providerReference = operation.providerReference ?? stringMetadataValue(operation.metadata["providerReference"]);
  const providerEventType = stringMetadataValue(operation.metadata["providerEventType"]);

  if (!providerReference || !providerEventType) {
    return;
  }

  const existing = await repositories.paymentReconciliationCases.findOpenByProviderEvent({
    caseType: "provider_mismatch",
    providerReference,
    providerEventType,
  });

  if (existing) {
    await repositories.paymentReconciliationCases.update(existing.case.id, {
      actor: systemFinanceActor,
      note: `Repeated provider mismatch detected for payment operation ${operation.id}.`,
    });
    return;
  }

  await repositories.paymentReconciliationCases.create({
    actor: systemFinanceActor,
    paymentOperationId: operation.id,
    operation,
    caseType: "provider_mismatch",
    summary: input.summary,
    note: input.note,
  });
}

async function recordPaymentOperation(
  repositories: Repositories,
  input: {
    readonly actor?: Actor | undefined;
    readonly requestId?: string | undefined;
    readonly payment: PaymentIntent;
    readonly status: "skipped" | "failed";
    readonly errorMessage?: string | undefined;
    readonly metadata?: Record<string, unknown> | undefined;
  },
): Promise<PaymentOperation> {
  return repositories.paymentOperations.create({
    paymentIntentId: input.payment.id,
    bookingId: input.payment.bookingId,
    ownerId: input.payment.ownerId,
    operation: "reconcile",
    status: input.status,
    actor: input.actor,
    requestId: input.requestId,
    errorMessage: input.errorMessage,
    metadata: {
      paymentStatus: input.payment.status,
      amount: input.payment.amount,
      ...(input.metadata ?? {}),
    },
  });
}

function isPaymentProviderStateMatched(localStatus: PaymentStatus, providerState: PaymentProviderState): boolean {
  return providerState.normalizedStatus !== "unknown" && providerState.normalizedStatus === localStatus;
}

function normalizeReconciliationRunLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return 100;
  }

  return Math.max(1, Math.min(Math.trunc(limit), 500));
}

function errorMessageForLedger(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

function stringMetadataValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

const systemFinanceActor: Actor = {
  userId: "usr_internal_finance_001",
  role: "internal",
  permissions: ["finance_read", "finance_write"],
};
