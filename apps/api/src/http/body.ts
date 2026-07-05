import type { IncomingMessage } from "node:http";

const maxBodyBytes = 1_000_000;

export async function readRawBody(request: IncomingMessage, limitBytes = maxBodyBytes): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > limitBytes) {
      throw new Error("request_body_too_large");
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    throw new Error("request_body_required");
  }

  return Buffer.concat(chunks);
}

export async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  return JSON.parse((await readRawBody(request)).toString("utf8")) as T;
}
