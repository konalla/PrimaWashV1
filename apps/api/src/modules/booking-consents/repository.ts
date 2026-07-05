import type {
  BookingConsent,
  BookingConsentSummary,
  BookingConsentType,
  CreateBookingConsentRequest,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface CreateBookingConsentInput extends CreateBookingConsentRequest {
  readonly bookingId: string;
  readonly ownerId: string;
  readonly acceptedByUserId?: string;
}

export interface BookingConsentRepository {
  list(bookingId: string): Promise<readonly BookingConsent[]>;
  create(input: CreateBookingConsentInput): Promise<BookingConsent>;
  summary(bookingId: string): Promise<BookingConsentSummary>;
}

const consentTypes: readonly BookingConsentType[] = ["pickup_return_terms", "property_service_terms"];
const consentTypeSet = new Set<BookingConsentType>(consentTypes);

export function validateCreateBookingConsent(input: Partial<CreateBookingConsentRequest>): readonly string[] {
  const errors: string[] = [];

  if (!input.consentType || !consentTypeSet.has(input.consentType)) {
    errors.push("consentType must be one of pickup_return_terms, property_service_terms");
  }

  if (!input.termsVersion?.trim()) {
    errors.push("termsVersion is required");
  } else if (input.termsVersion.trim().length > 80) {
    errors.push("termsVersion must be 80 characters or fewer");
  }

  if (input.acceptedText && input.acceptedText.length > 2000) {
    errors.push("acceptedText must be 2000 characters or fewer");
  }

  return errors;
}

export class InMemoryBookingConsentRepository implements BookingConsentRepository {
  readonly #records = new Map<string, BookingConsent[]>();

  async list(bookingId: string): Promise<readonly BookingConsent[]> {
    return this.#sorted(this.#records.get(bookingId) ?? []);
  }

  async create(input: CreateBookingConsentInput): Promise<BookingConsent> {
    const record = buildBookingConsent(input);
    const existing = this.#records.get(input.bookingId) ?? [];
    this.#records.set(input.bookingId, [record, ...existing]);
    return record;
  }

  async summary(bookingId: string): Promise<BookingConsentSummary> {
    return summarizeBookingConsents(this.#records.get(bookingId) ?? []);
  }

  #sorted(records: readonly BookingConsent[]): readonly BookingConsent[] {
    return records.slice().sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
  }
}

export class PostgresBookingConsentRepository implements BookingConsentRepository {
  constructor(private readonly pool: DatabasePool) {}

  async list(bookingId: string): Promise<readonly BookingConsent[]> {
    const result = await this.pool.query<BookingConsentRow>(
      `select id, booking_id, owner_id, consent_type, terms_version, accepted_text, accepted_by_user_id, accepted_at
       from booking_consents
       where booking_id = $1
       order by accepted_at desc`,
      [bookingId],
    );

    return result.rows.map(mapBookingConsentRow);
  }

  async create(input: CreateBookingConsentInput): Promise<BookingConsent> {
    const record = buildBookingConsent(input);
    const result = await this.pool.query<BookingConsentRow>(
      `insert into booking_consents (
        id, booking_id, owner_id, consent_type, terms_version, accepted_text, accepted_by_user_id, accepted_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      returning id, booking_id, owner_id, consent_type, terms_version, accepted_text, accepted_by_user_id, accepted_at`,
      [
        record.id,
        record.bookingId,
        record.ownerId,
        record.consentType,
        record.termsVersion,
        record.acceptedText ?? null,
        record.acceptedByUserId ?? null,
        record.acceptedAt,
      ],
    );
    const row = result.rows[0];

    if (!row) {
      throw new Error("booking_consent_create_failed");
    }

    return mapBookingConsentRow(row);
  }

  async summary(bookingId: string): Promise<BookingConsentSummary> {
    return summarizeBookingConsents(await this.list(bookingId));
  }
}

interface BookingConsentRow {
  readonly id: string;
  readonly booking_id: string;
  readonly owner_id: string;
  readonly consent_type: BookingConsentType;
  readonly terms_version: string;
  readonly accepted_text: string | null;
  readonly accepted_by_user_id: string | null;
  readonly accepted_at: Date | string;
}

export function summarizeBookingConsents(records: readonly BookingConsent[]): BookingConsentSummary {
  return {
    pickupReturnTermsAccepted: records.some((record) => record.consentType === "pickup_return_terms"),
    propertyServiceTermsAccepted: records.some((record) => record.consentType === "property_service_terms"),
  };
}

function buildBookingConsent(input: CreateBookingConsentInput): BookingConsent {
  const acceptedText = input.acceptedText?.trim();

  return {
    id: `consent_${crypto.randomUUID()}`,
    bookingId: input.bookingId,
    ownerId: input.ownerId,
    consentType: input.consentType,
    termsVersion: input.termsVersion.trim(),
    ...(acceptedText ? { acceptedText } : {}),
    ...(input.acceptedByUserId ? { acceptedByUserId: input.acceptedByUserId } : {}),
    acceptedAt: new Date().toISOString(),
  };
}

function mapBookingConsentRow(row: BookingConsentRow): BookingConsent {
  return {
    id: row.id,
    bookingId: row.booking_id,
    ownerId: row.owner_id,
    consentType: row.consent_type,
    termsVersion: row.terms_version,
    ...(row.accepted_text ? { acceptedText: row.accepted_text } : {}),
    ...(row.accepted_by_user_id ? { acceptedByUserId: row.accepted_by_user_id } : {}),
    acceptedAt: new Date(row.accepted_at).toISOString(),
  };
}
