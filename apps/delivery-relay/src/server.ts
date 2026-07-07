import { createDeliveryRelayServer } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const server = createDeliveryRelayServer({
  ...(config.webhookSecret ? { webhookSecret: config.webhookSecret } : {}),
  ...(config.smtpHost && config.smtpFrom
    ? {
        smtp: {
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpSecure,
          from: config.smtpFrom,
          ...(config.smtpUser ? { username: config.smtpUser } : {}),
          ...(config.smtpPassword ? { password: config.smtpPassword } : {}),
          timeoutMs: config.smtpTimeoutMs,
        },
      }
    : {}),
  ...(config.smsWebhookUrl
    ? {
        smsWebhook: {
          url: config.smsWebhookUrl,
          ...(config.smsWebhookSecret ? { secret: config.smsWebhookSecret } : {}),
        },
      }
    : {}),
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      event: "delivery_relay_started",
      port: config.port,
      smtpEnabled: Boolean(config.smtpHost && config.smtpFrom),
      smsWebhookEnabled: Boolean(config.smsWebhookUrl),
    }),
  );
});
