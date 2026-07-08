import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoreEvidenceFileInput {
  readonly bookingId: string;
  readonly fileName?: string;
  readonly contentType: string;
  readonly body: Buffer;
}

export interface StoredEvidenceFile {
  readonly storageKey: string;
  readonly url?: string;
}

export interface EvidenceStorageProvider {
  store(input: StoreEvidenceFileInput): Promise<StoredEvidenceFile>;
}

export class InMemoryEvidenceStorageProvider implements EvidenceStorageProvider {
  readonly #files = new Map<string, { readonly contentType: string; readonly body: Buffer }>();

  async store(input: StoreEvidenceFileInput): Promise<StoredEvidenceFile> {
    const storageKey = buildStorageKey(input.bookingId, input.fileName);
    this.#files.set(storageKey, { contentType: input.contentType, body: input.body });
    return { storageKey, url: `evidence://${storageKey}` };
  }
}

export class LocalEvidenceStorageProvider implements EvidenceStorageProvider {
  constructor(
    private readonly rootDirectory: string,
    private readonly publicBaseUrl?: string,
  ) {}

  async store(input: StoreEvidenceFileInput): Promise<StoredEvidenceFile> {
    const storageKey = buildStorageKey(input.bookingId, input.fileName);
    const targetPath = path.join(this.rootDirectory, ...storageKey.split("/"));
    const resolvedRoot = path.resolve(this.rootDirectory);
    const resolvedTarget = path.resolve(targetPath);

    if (!resolvedTarget.startsWith(resolvedRoot)) {
      throw new Error("storage_key_invalid");
    }

    await mkdir(path.dirname(resolvedTarget), { recursive: true });
    await writeFile(resolvedTarget, input.body);

    return {
      storageKey,
      ...(this.publicBaseUrl ? { url: `${this.publicBaseUrl.replace(/\/$/, "")}/${storageKey}` } : {}),
    };
  }
}

export class S3CompatibleEvidenceStorageProvider implements EvidenceStorageProvider {
  constructor(
    private readonly input: {
      readonly endpoint: string;
      readonly region: string;
      readonly bucket: string;
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
      readonly publicBaseUrl?: string;
      readonly fetch?: typeof fetch;
    },
  ) {}

  async store(input: StoreEvidenceFileInput): Promise<StoredEvidenceFile> {
    const storageKey = buildStorageKey(input.bookingId, input.fileName);
    const bodyHash = hashHex(input.body);
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const endpoint = new URL(this.input.endpoint);
    const pathName = `/${encodeUriPath(this.input.bucket)}/${encodeUriPath(storageKey)}`;
    const url = new URL(pathName, endpoint);
    const host = endpoint.host;
    const headers = {
      authorization: this.authorizationHeader({
        amzDate,
        bodyHash,
        contentType: input.contentType,
        dateStamp,
        host,
        pathName,
      }),
      "content-type": input.contentType,
      host,
      "x-amz-content-sha256": bodyHash,
      "x-amz-date": amzDate,
    };
    const response = await (this.input.fetch ?? fetch)(url, {
      method: "PUT",
      headers,
      body: toArrayBuffer(input.body),
    });

    if (!response.ok) {
      throw new Error(`evidence_storage_failed:${response.status}`);
    }

    return {
      storageKey,
      url: this.input.publicBaseUrl
        ? `${this.input.publicBaseUrl.replace(/\/$/, "")}/${storageKey}`
        : `s3://${this.input.bucket}/${storageKey}`,
    };
  }

  private authorizationHeader(input: {
    readonly amzDate: string;
    readonly bodyHash: string;
    readonly contentType: string;
    readonly dateStamp: string;
    readonly host: string;
    readonly pathName: string;
  }): string {
    const canonicalHeaders = [
      `content-type:${input.contentType}`,
      `host:${input.host}`,
      `x-amz-content-sha256:${input.bodyHash}`,
      `x-amz-date:${input.amzDate}`,
      "",
    ].join("\n");
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      "PUT",
      input.pathName,
      "",
      canonicalHeaders,
      signedHeaders,
      input.bodyHash,
    ].join("\n");
    const credentialScope = `${input.dateStamp}/${this.input.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      input.amzDate,
      credentialScope,
      hashHex(canonicalRequest),
    ].join("\n");
    const signingKey = s3SigningKey(this.input.secretAccessKey, input.dateStamp, this.input.region);
    const signature = hmacHex(signingKey, stringToSign);

    return [
      `AWS4-HMAC-SHA256 Credential=${this.input.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(", ");
  }
}

export function createLocalEvidenceStorageProvider(input: {
  readonly rootDirectory: string;
  readonly publicBaseUrl?: string;
}): EvidenceStorageProvider {
  return new LocalEvidenceStorageProvider(input.rootDirectory, input.publicBaseUrl);
}

export function createS3CompatibleEvidenceStorageProvider(input: {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly publicBaseUrl?: string;
}): EvidenceStorageProvider {
  return new S3CompatibleEvidenceStorageProvider(input);
}

export function validateEvidenceUploadInput(input: {
  readonly evidenceType?: string;
  readonly contentType?: string;
  readonly byteLength: number;
}): readonly string[] {
  const errors: string[] = [];
  const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

  if (!["before", "after", "damage", "handover", "other"].includes(input.evidenceType ?? "")) {
    errors.push("evidenceType must be one of before, after, damage, handover, other");
  }

  if (!input.contentType || !allowedContentTypes.has(input.contentType)) {
    errors.push("content-type must be image/jpeg, image/png, image/webp, or application/pdf");
  }

  if (input.byteLength <= 0) {
    errors.push("file body is required");
  }

  if (input.byteLength > maxEvidenceUploadBytes) {
    errors.push(`file must be ${maxEvidenceUploadBytes} bytes or smaller`);
  }

  return errors;
}

export const maxEvidenceUploadBytes = 5_000_000;

function buildStorageKey(bookingId: string, fileName?: string): string {
  const extension = extensionFor(fileName);
  return `booking-evidence/${sanitizeSegment(bookingId)}/${randomUUID()}${extension}`;
}

function extensionFor(fileName?: string): string {
  const extension = path.extname(fileName ?? "").toLowerCase();
  return /^[.][a-z0-9]{1,8}$/.test(extension) ? extension : "";
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

function encodeUriPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function hashHex(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function s3SigningKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}
