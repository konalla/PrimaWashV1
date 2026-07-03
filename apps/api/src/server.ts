import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiServer } from "./app.js";
import { loadConfig } from "./config.js";
import { createAuthCodeDeliveryProvider } from "./modules/auth/delivery.js";
import { createPaymentProvider } from "./modules/payments/provider.js";
import { createRepositories } from "./modules/repositories.js";

const config = loadConfig();
const repositories = createRepositories(config.persistenceMode === "postgres" ? config.databaseUrl : undefined);
const paymentProvider = createPaymentProvider(config.paymentProvider, {
  ...(config.stripeSecretKey ? { stripeSecretKey: config.stripeSecretKey } : {}),
});
const authCodeDeliveryProvider = createAuthCodeDeliveryProvider(config.authCodeDeliveryProvider, {
  exposeDevelopmentCode: config.showDevAuthCode,
  ...(config.authCodeDeliveryWebhookUrl ? { webhookUrl: config.authCodeDeliveryWebhookUrl } : {}),
  ...(config.authCodeDeliveryWebhookSecret ? { webhookSecret: config.authCodeDeliveryWebhookSecret } : {}),
});
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(moduleDirectory, "../public");
const server = createApiServer({
  repositories,
  paymentProvider,
  authCodeDeliveryProvider,
  publicDirectory,
  authSessionSecret: config.authSessionSecret,
  ...(config.stripeWebhookSecret ? { stripeWebhookSecret: config.stripeWebhookSecret } : {}),
});

if (repositories.databasePool) {
  await repositories.databasePool.query("select 1");
}

server.listen(config.port, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      event: "api_started",
      port: config.port,
      persistence: config.persistenceMode,
      paymentProvider: config.paymentProvider,
      authCodeDeliveryProvider: config.authCodeDeliveryProvider,
    }),
  );
});
