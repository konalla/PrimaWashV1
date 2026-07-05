import type {
  Actor,
  BookingEvidence,
  BookingEvidenceSummary,
  BookingEvidenceType,
  CreateBookingEvidenceRequest,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface CreateBookingEvidenceInput extends CreateBookingEvidenceRequest {
  readonly bookingId: string;
  readonly actor: Actor;
}

export interface BookingEvidenceRepository {
  list(bookingId: string): Promise<readonly BookingEvidence[]>;
  create(input: CreateBookingEvidenceInput): Promise<BookingEvidence>;
  countByBookingIds(bookingIds: readonly string[]): Promise<ReadonlyMap<string, BookingEvidenceSummary>>;
}

const evidenceTypes: readonly BookingEvidenceType[] = ["before", "after", "damage", "handover", "other"];
const evidenceTypeSet = new Set<BookingEvidenceType>(evidenceTypes);

export function validateCreateBookingEvidence(input: Partial<CreateBookingEvidenceRequest>): readonly string[] {
  const errors: string[] = [];

  if (!input.evidenceType || !evidenceTypeSet.has(input.evidenceType)) {
    errors.push("evidenceType must be one of before, after, damage, handover, other");
  }

  const storageKey = input.storageKey?.trim();
  const url = input.url?.trim();

  if (!storageKey && !url) {
    errors.push("storageKey or url is required");
  }

  if (storageKey && storageKey.length > 500) {
    errors.push("storageKey must be 500 characters or fewer");
  }

  if (url && (url.length > 500 || !/^(https?:\/\/|evidence:\/\/)/.test(url))) {
    errors.push("url must be an http(s) or evidence URL with 500 characters or fewer");
  }

  if (input.notes && input.notes.length > 2000) {
    errors.push("notes must be 2000 characters or fewer");
  }

  return errors;
}

export class InMemoryBookingEvidenceRepository implements BookingEvidenceRepository {
  readonly #records = new Map<string, BookingEvidence[]>();

  async list(bookingId: string): Promise<readonly BookingEvidence[]> {
    return this.#sorted(this.#records.get(bookingId) ?? []);
  }

  async create(input: CreateBookingEvidenceInput): Promise<BookingEvidence> {
    const record = buildBookingEvidence(input);
    const existing = this.#records.get(input.bookingId) ?? [];
    this.#records.set(input.bookingId, [record, ...existing]);
    return record;
  }

  async countByBookingIds(bookingIds: readonly string[]): Promise<ReadonlyMap<string, BookingEvidenceSummary>> {
    const summaries = new Map<string, BookingEvidenceSummary>();

    for (const bookingId of bookingIds) {
      const records = this.#records.get(bookingId) ?? [];
      summaries.set(bookingId, summarizeBookingEvidence(records));
    }

    return summaries;
  }

  #sorted(records: readonly BookingEvidence[]): readonly BookingEvidence[] {
    return records.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export class PostgresBookingEvidenceRepository implements BookingEvidenceRepository {
  constructor(private readonly pool: DatabasePool) {}

  async list(bookingId: string): Promise<readonly BookingEvidence[]> {
    const result = await this.pool.query<BookingEvidenceRow>(
      `select id, booking_id, evidence_type, storage_key, url, notes, uploaded_by_user_id, uploaded_by_role, created_at
       from booking_evidence
       where booking_id = $1
       order by created_at desc`,
      [bookingId],
    );

    return result.rows.map(mapBookingEvidenceRow);
  }

  async create(input: CreateBookingEvidenceInput): Promise<BookingEvidence> {
    const record = buildBookingEvidence(input);
    const result = await this.pool.query<BookingEvidenceRow>(
      `insert into booking_evidence (
        id, booking_id, evidence_type, storage_key, url, notes, uploaded_by_user_id, uploaded_by_role, created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      returning id, booking_id, evidence_type, storage_key, url, notes, uploaded_by_user_id, uploaded_by_role, created_at`,
      [
        record.id,
        record.bookingId,
        record.evidenceType,
        record.storageKey ?? null,
        record.url ?? null,
        record.notes ?? null,
        record.uploadedByUserId ?? null,
        record.uploadedByRole,
        record.createdAt,
      ],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error("booking_evidence_create_failed");
    }

    return mapBookingEvidenceRow(row);
  }

  async countByBookingIds(bookingIds: readonly string[]): Promise<ReadonlyMap<string, BookingEvidenceSummary>> {
    if (bookingIds.length === 0) {
      return new Map();
    }

    const result = await this.pool.query<{ readonly booking_id: string; readonly evidence_type: BookingEvidenceType; readonly count: string }>(
      `select booking_id, evidence_type, count(*)::text as count
       from booking_evidence
       where booking_id = any($1::text[])
       group by booking_id, evidence_type`,
      [bookingIds],
    );
    const summaries = new Map<string, BookingEvidenceSummary>();

    for (const bookingId of bookingIds) {
      summaries.set(bookingId, emptyEvidenceSummary());
    }

    for (const row of result.rows) {
      const summary = summaries.get(row.booking_id) ?? emptyEvidenceSummary();
      summaries.set(row.booking_id, addEvidenceCount(summary, row.evidence_type, Number(row.count)));
    }

    return summaries;
  }
}

interface BookingEvidenceRow {
  readonly id: string;
  readonly booking_id: string;
  readonly evidence_type: BookingEvidenceType;
  readonly storage_key: string | null;
  readonly url: string | null;
  readonly notes: string | null;
  readonly uploaded_by_user_id: string | null;
  readonly uploaded_by_role: Actor["role"];
  readonly created_at: Date | string;
}

export function summarizeBookingEvidence(records: readonly BookingEvidence[]): BookingEvidenceSummary {
  return records.reduce(
    (summary, record) => addEvidenceCount(summary, record.evidenceType, 1),
    emptyEvidenceSummary(),
  );
}

export function emptyEvidenceSummary(): BookingEvidenceSummary {
  return {
    beforeCount: 0,
    afterCount: 0,
    damageCount: 0,
    handoverCount: 0,
    otherCount: 0,
    totalCount: 0,
  };
}

function addEvidenceCount(
  summary: BookingEvidenceSummary,
  evidenceType: BookingEvidenceType,
  count: number,
): BookingEvidenceSummary {
  return {
    beforeCount: summary.beforeCount + (evidenceType === "before" ? count : 0),
    afterCount: summary.afterCount + (evidenceType === "after" ? count : 0),
    damageCount: summary.damageCount + (evidenceType === "damage" ? count : 0),
    handoverCount: summary.handoverCount + (evidenceType === "handover" ? count : 0),
    otherCount: summary.otherCount + (evidenceType === "other" ? count : 0),
    totalCount: summary.totalCount + count,
  };
}

function buildBookingEvidence(input: CreateBookingEvidenceInput): BookingEvidence {
  const storageKey = input.storageKey?.trim();
  const url = input.url?.trim();
  const notes = input.notes?.trim();

  return {
    id: `evidence_${crypto.randomUUID()}`,
    bookingId: input.bookingId,
    evidenceType: input.evidenceType,
    ...(storageKey ? { storageKey } : {}),
    ...(url ? { url } : {}),
    ...(notes ? { notes } : {}),
    ...(input.actor.userId ? { uploadedByUserId: input.actor.userId } : {}),
    uploadedByRole: input.actor.role,
    createdAt: new Date().toISOString(),
  };
}

function mapBookingEvidenceRow(row: BookingEvidenceRow): BookingEvidence {
  return {
    id: row.id,
    bookingId: row.booking_id,
    evidenceType: row.evidence_type,
    ...(row.storage_key ? { storageKey: row.storage_key } : {}),
    ...(row.url ? { url: row.url } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.uploaded_by_user_id ? { uploadedByUserId: row.uploaded_by_user_id } : {}),
    uploadedByRole: row.uploaded_by_role,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
