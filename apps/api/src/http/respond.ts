import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiErrorResponse } from "@prima-wash/contracts";

export const defaultLocalCorsAllowedOrigins = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1:3020",
  "http://localhost:3020",
  "http://127.0.0.1:3021",
  "http://localhost:3021",
  "http://127.0.0.1:8081",
  "http://localhost:8081",
  "http://127.0.0.1:8082",
  "http://localhost:8082",
  "http://127.0.0.1:8083",
  "http://localhost:8083",
  "http://127.0.0.1:19006",
  "http://localhost:19006",
];

export function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

export function sendError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const payload: ApiErrorResponse = { code, message, ...(details === undefined ? {} : { details }) };
  sendJson(response, statusCode, payload);
}

export function applyCorsHeaders(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: readonly string[],
): void {
  const origin = request.headers.origin;

  if (typeof origin === "string" && allowedOrigins.includes(origin)) {
    response.setHeader("access-control-allow-origin", origin);
  }

  response.setHeader("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader(
    "access-control-allow-headers",
    "authorization,content-type,x-prima-user-id,x-prima-role,x-prima-organization-id,x-prima-property-id,x-prima-permissions,x-request-id",
  );
  response.setHeader("access-control-expose-headers", "x-request-id");
  response.setHeader("vary", "Origin");
}

export function sendCorsPreflight(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: readonly string[],
): void {
  applyCorsHeaders(request, response, allowedOrigins);
  response.writeHead(204);
  response.end();
}
