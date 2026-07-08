import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryEvidenceStorageProvider,
  S3CompatibleEvidenceStorageProvider,
  validateEvidenceUploadInput,
} from "./storage.js";

describe("booking evidence storage", () => {
  it("stores local/in-memory evidence under booking-scoped keys", async () => {
    const provider = new InMemoryEvidenceStorageProvider();
    const stored = await provider.store({
      bookingId: "book_test_123",
      fileName: "before.jpg",
      contentType: "image/jpeg",
      body: Buffer.from("evidence"),
    });

    assert.match(stored.storageKey, /^booking-evidence\/book_test_123\/.+[.]jpg$/);
    assert.equal(stored.url, `evidence://${stored.storageKey}`);
  });

  it("uploads evidence to S3-compatible storage with SigV4 headers", async () => {
    const requests: Array<{ readonly url: string; readonly init: RequestInit }> = [];
    const provider = new S3CompatibleEvidenceStorageProvider({
      endpoint: "https://storage.example.com",
      region: "ap-southeast-1",
      bucket: "prima-wash-evidence",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      publicBaseUrl: "https://evidence.example.com",
      fetch: async (url, init) => {
        requests.push({ url: String(url), init: init ?? {} });
        return new Response(null, { status: 200 });
      },
    });
    const stored = await provider.store({
      bookingId: "book_s3_123",
      fileName: "after.png",
      contentType: "image/png",
      body: Buffer.from("signed evidence"),
    });

    assert.equal(requests.length, 1);
    assert.match(stored.storageKey, /^booking-evidence\/book_s3_123\/.+[.]png$/);
    assert.equal(stored.url, `https://evidence.example.com/${stored.storageKey}`);
    assert.equal(requests[0]?.url, `https://storage.example.com/prima-wash-evidence/${stored.storageKey}`);
    assert.equal(requests[0]?.init.method, "PUT");
    assert.equal(readHeader(requests[0]?.init.headers, "content-type"), "image/png");
    assert.equal(readHeader(requests[0]?.init.headers, "x-amz-content-sha256")?.length, 64);
    assert.match(readHeader(requests[0]?.init.headers, "x-amz-date") ?? "", /^\d{8}T\d{6}Z$/);
    assert.match(readHeader(requests[0]?.init.headers, "authorization") ?? "", /^AWS4-HMAC-SHA256 /);
  });

  it("rejects failed S3-compatible evidence writes", async () => {
    const provider = new S3CompatibleEvidenceStorageProvider({
      endpoint: "https://storage.example.com",
      region: "ap-southeast-1",
      bucket: "prima-wash-evidence",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      fetch: async () => new Response(null, { status: 503 }),
    });

    await assert.rejects(
      provider.store({
        bookingId: "book_s3_failed",
        fileName: "before.jpg",
        contentType: "image/jpeg",
        body: Buffer.from("evidence"),
      }),
      /evidence_storage_failed:503/,
    );
  });

  it("validates supported evidence upload file types and limits", () => {
    assert.deepEqual(
      validateEvidenceUploadInput({
        evidenceType: "before",
        contentType: "image/webp",
        byteLength: 512,
      }),
      [],
    );
    assert.deepEqual(
      validateEvidenceUploadInput({
        evidenceType: "before",
        contentType: "text/plain",
        byteLength: 512,
      }),
      ["content-type must be image/jpeg, image/png, image/webp, or application/pdf"],
    );
  });
});

function readHeader(headers: RequestInit["headers"], name: string): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  if (Array.isArray(headers)) {
    return headers.find(([key]) => key.toLowerCase() === name)?.[1];
  }

  return headers?.[name];
}
