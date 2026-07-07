import http from "node:http";
import { sendSmtpMessage } from "./smtp.js";

export interface AuthCodeDeliveryPayload {
  readonly type: "auth_code" | "access_invitation";
  readonly deliveryId: string;
  readonly channel: "email" | "sms";
  readonly identifier: string;
  readonly deliveryHint: string;
  readonly code: string;
  readonly expiresAt: string;
}

export interface DeliveryRelayOptions {
  readonly webhookSecret?: string;
  readonly smtp?: {
    readonly host: string;
    readonly port: number;
    readonly secure: boolean;
    readonly from: string;
    readonly username?: string;
    readonly password?: string;
    readonly timeoutMs: number;
  };
  readonly smsWebhook?: {
    readonly url: string;
    readonly secret?: string;
  };
  readonly sendEmail?: (payload: AuthCodeDeliveryPayload) => Promise<void>;
  readonly sendSms?: (payload: AuthCodeDeliveryPayload) => Promise<void>;
}

export function createDeliveryRelayServer(options: DeliveryRelayOptions): http.Server {
  return http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/healthz") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method !== "POST" || request.url !== "/auth-code") {
        sendJson(response, 404, { error: "not_found" });
        return;
      }

      if (!hasValidAuthorization(request, options.webhookSecret)) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }

      const payload = parseDeliveryPayload(await readJson(request));

      if (payload.channel === "email") {
        await deliverEmail(payload, options);
      } else {
        await deliverSms(payload, options);
      }

      sendJson(response, 202, { accepted: true, deliveryId: payload.deliveryId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "delivery_failed";
      const status = message.startsWith("validation_failed") ? 400 : message === "delivery_channel_not_configured" ? 503 : 500;
      sendJson(response, status, { error: message });
    }
  });
}

async function deliverEmail(payload: AuthCodeDeliveryPayload, options: DeliveryRelayOptions): Promise<void> {
  if (options.sendEmail) {
    await options.sendEmail(payload);
    return;
  }

  if (!options.smtp) {
    throw new Error("delivery_channel_not_configured");
  }

  await sendSmtpMessage({
    host: options.smtp.host,
    port: options.smtp.port,
    secure: options.smtp.secure,
    ...(options.smtp.username ? { username: options.smtp.username } : {}),
    ...(options.smtp.password ? { password: options.smtp.password } : {}),
    from: options.smtp.from,
    to: payload.identifier,
    subject: deliverySubject(payload),
    text: deliveryText(payload),
    timeoutMs: options.smtp.timeoutMs,
  });
}

async function deliverSms(payload: AuthCodeDeliveryPayload, options: DeliveryRelayOptions): Promise<void> {
  if (options.sendSms) {
    await options.sendSms(payload);
    return;
  }

  if (!options.smsWebhook) {
    throw new Error("delivery_channel_not_configured");
  }

  const response = await fetch(options.smsWebhook.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.smsWebhook.secret ? { authorization: `Bearer ${options.smsWebhook.secret}` } : {}),
    },
    body: JSON.stringify({
      deliveryId: payload.deliveryId,
      to: payload.identifier,
      body: deliveryText(payload),
      expiresAt: payload.expiresAt,
      type: payload.type,
    }),
  });

  if (!response.ok) {
    throw new Error("sms_delivery_failed");
  }
}

function deliverySubject(payload: AuthCodeDeliveryPayload): string {
  return payload.type === "access_invitation" ? "Your Prima Wash invitation code" : "Your Prima Wash verification code";
}

function deliveryText(payload: AuthCodeDeliveryPayload): string {
  const intro =
    payload.type === "access_invitation"
      ? "Use this code to accept your Prima Wash invitation."
      : "Use this code to sign in to Prima Wash.";

  return [
    intro,
    "",
    `Code: ${payload.code}`,
    `Expires: ${new Date(payload.expiresAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}`,
    "",
    "If you did not request this, ignore this message.",
  ].join("\n");
}

function hasValidAuthorization(request: http.IncomingMessage, secret: string | undefined): boolean {
  if (!secret) {
    return true;
  }

  return request.headers.authorization === `Bearer ${secret}`;
}

async function readJson(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parseDeliveryPayload(input: unknown): AuthCodeDeliveryPayload {
  if (!isRecord(input)) {
    throw new Error("validation_failed:body");
  }

  if (input.type !== "auth_code" && input.type !== "access_invitation") {
    throw new Error("validation_failed:type");
  }

  if (input.channel !== "email" && input.channel !== "sms") {
    throw new Error("validation_failed:channel");
  }

  const deliveryId = readRequiredString(input, "deliveryId");
  const identifier = readRequiredString(input, "identifier");
  const deliveryHint = readRequiredString(input, "deliveryHint");
  const code = readRequiredString(input, "code");
  const expiresAt = readRequiredString(input, "expiresAt");

  if (!/^\d{6}$/.test(code)) {
    throw new Error("validation_failed:code");
  }

  if (Number.isNaN(new Date(expiresAt).getTime())) {
    throw new Error("validation_failed:expiresAt");
  }

  return {
    type: input.type,
    deliveryId,
    channel: input.channel,
    identifier,
    deliveryHint,
    code,
    expiresAt,
  };
}

function readRequiredString(input: Record<string, unknown>, field: string): string {
  const value = input[field];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`validation_failed:${field}`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sendJson(response: http.ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}
