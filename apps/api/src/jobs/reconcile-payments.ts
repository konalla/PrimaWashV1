import { loadConfig } from "../config.js";
import { createPaymentProvider } from "../modules/payments/provider.js";
import { runPaymentProviderReconciliation } from "../modules/payment-reconciliation-runs/service.js";
import { createRepositories } from "../modules/repositories.js";

type ReconciliationJobMode = "once" | "loop";

const config = loadConfig();
const provider = getArgumentValue("--provider") ?? process.env.PAYMENT_RECONCILIATION_PROVIDER ?? config.paymentProvider;
const limit = Number.parseInt(getArgumentValue("--limit") ?? process.env.PAYMENT_RECONCILIATION_LIMIT ?? "200", 10);
const mode = parseMode(getArgumentValue("--mode") ?? process.env.PAYMENT_RECONCILIATION_MODE ?? "once");
const intervalMs = normalizeIntervalMs(
  Number.parseInt(getArgumentValue("--interval-ms") ?? process.env.PAYMENT_RECONCILIATION_INTERVAL_MS ?? "900000", 10),
);
const repositories = createRepositories(config.persistenceMode === "postgres" ? config.databaseUrl : undefined);
const paymentProvider = createPaymentProvider(config.paymentProvider, {
  ...(config.stripeSecretKey ? { stripeSecretKey: config.stripeSecretKey } : {}),
});
let shuttingDown = false;

process.once("SIGINT", () => {
  shuttingDown = true;
});
process.once("SIGTERM", () => {
  shuttingDown = true;
});

try {
  if (mode === "loop") {
    await runLoop();
    process.exitCode = 0;
  } else {
    process.exitCode = await runOnce();
  }
} finally {
  await repositories.databasePool?.end();
}

async function runLoop(): Promise<void> {
  log("payment_reconciliation_scheduler_started", { provider, limit, intervalMs });

  while (!shuttingDown) {
    await runOnce();

    if (!shuttingDown) {
      await delay(intervalMs);
    }
  }

  log("payment_reconciliation_scheduler_stopped", { provider });
}

async function runOnce(): Promise<number> {
  const startedAt = Date.now();
  const requestId = `payment-reconciliation-cli-${startedAt}`;

  log("payment_reconciliation_run_requested", { provider, limit, requestId });

  try {
    const result = await runPaymentProviderReconciliation(repositories, paymentProvider, {
      provider,
      limit,
      actor: {
        userId: "usr_internal_finance_001",
        role: "internal",
        permissions: ["finance_read", "finance_write"],
      },
      requestId,
    });

    log("payment_reconciliation_run_completed", {
      requestId,
      durationMs: Date.now() - startedAt,
      result,
    });

    return result.status === "failed" ? 1 : 0;
  } catch (error) {
    if (error instanceof Error && error.message === "payment_provider_reconciliation_run_already_running") {
      log("payment_reconciliation_run_skipped", {
        requestId,
        provider,
        reason: error.message,
        durationMs: Date.now() - startedAt,
      });
      return 2;
    }

    log("payment_reconciliation_run_crashed", {
      requestId,
      provider,
      errorMessage: errorMessageForLog(error),
      durationMs: Date.now() - startedAt,
    });
    return 1;
  }
}

function getArgumentValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

function parseMode(value: string): ReconciliationJobMode {
  if (value === "once" || value === "loop") {
    return value;
  }

  throw new Error("PAYMENT_RECONCILIATION_MODE must be once or loop");
}

function normalizeIntervalMs(value: number): number {
  if (!Number.isFinite(value)) {
    return 900000;
  }

  return Math.max(60000, Math.trunc(value));
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function log(event: string, payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...payload }));
}

function errorMessageForLog(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}
