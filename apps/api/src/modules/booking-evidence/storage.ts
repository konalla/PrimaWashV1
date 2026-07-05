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

export function createLocalEvidenceStorageProvider(input: {
  readonly rootDirectory: string;
  readonly publicBaseUrl?: string;
}): EvidenceStorageProvider {
  return new LocalEvidenceStorageProvider(input.rootDirectory, input.publicBaseUrl);
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
  return `booking-evidence/${sanitizeSegment(bookingId)}/${crypto.randomUUID()}${extension}`;
}

function extensionFor(fileName?: string): string {
  const extension = path.extname(fileName ?? "").toLowerCase();
  return /^[.][a-z0-9]{1,8}$/.test(extension) ? extension : "";
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}
