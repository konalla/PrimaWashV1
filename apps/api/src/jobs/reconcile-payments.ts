import { loadConfig } from "../config.js";
import { createPaymentProvider } from "../modules/payments/provider.js";
import { createRepositories } from "../modules/repositories.js";
import { runPaymentProviderReconciliation } from "../modules/payment-reconciliation-runs/service.js";

const config = loadConfig();
const provider = getArgumentValue("--provider") ?? config.paymentProvider;
const limit = Number.parseInt(getArgumentValue("--limit") ?? process.env.PAYMENT_RECONCILIATION_LIMIT ?? "200", 10);
const repositories = createRepositories(config.persistenceMode === "postgres" ? config.databaseUrl : undefined);
const paymentProvider = createPaymentProvider(config.paymentProvider, {
  ...(config.stripeSecretKey ? { stripeSecretKey: config.stripeSecretKey } : {}),
});

try {
  const result = await runPaymentProviderReconciliation(repositories, paymentProvider, {
    provider,
    limit,
    actor: {
      userId: "usr_internal_finance_001",
      role: "internal",
      permissions: ["finance_read", "finance_write"],
    },
    requestId: `payment-reconciliation-cli-${Date.now()}`,
  });

  console.log(JSON.stringify({ event: "payment_reconciliation_run_completed", result }));
  process.exitCode = result.status === "failed" ? 1 : 0;
} finally {
  await repositories.databasePool?.end();
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
