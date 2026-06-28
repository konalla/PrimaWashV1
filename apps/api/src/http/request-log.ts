import type { IncomingMessage, ServerResponse } from "node:http";

export interface RequestContext {
  readonly requestId: string;
  readonly startedAt: bigint;
}

export function attachRequestLogging(request: IncomingMessage, response: ServerResponse): RequestContext {
  const requestId = getRequestId(request);
  const startedAt = process.hrtime.bigint();
  response.setHeader("x-request-id", requestId);

  response.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    console.log(
      JSON.stringify({
        event: "http_request_completed",
        requestId,
        method: request.method,
        path: getPath(request),
        statusCode: response.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      }),
    );
  });

  return { requestId, startedAt };
}

function getRequestId(request: IncomingMessage): string {
  const header = request.headers["x-request-id"];

  if (typeof header === "string" && header.trim().length > 0) {
    return header.trim();
  }

  if (Array.isArray(header) && header[0]?.trim()) {
    return header[0].trim();
  }

  return crypto.randomUUID();
}

function getPath(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
  } catch {
    return request.url ?? "/";
  }
}
