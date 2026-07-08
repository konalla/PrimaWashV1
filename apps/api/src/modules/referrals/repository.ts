import type {
  Booking,
  ClaimReferralRequest,
  InternalReferralSummary,
  ReferralCode,
  ReferralCredit,
  ReferralRelationship,
  ReferralSummary,
} from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

const referralCreditAmountMinor = 1000;

export interface ReferralRepository {
  getSummary(ownerId: string): Promise<ReferralSummary>;
  claim(input: ClaimReferralInput): Promise<ReferralRelationship>;
  creditCompletedBooking(booking: Booking): Promise<ReferralCredit | undefined>;
  listInternal(): Promise<InternalReferralSummary>;
}

export interface ClaimReferralInput extends ClaimReferralRequest {
  readonly referredOwnerId: string;
}

export class InMemoryReferralRepository implements ReferralRepository {
  readonly #codes = new Map<string, ReferralCode>();
  readonly #relationships = new Map<string, ReferralRelationship>();
  readonly #credits = new Map<string, ReferralCredit>();

  async getSummary(ownerId: string): Promise<ReferralSummary> {
    const code = this.#getOrCreateCode(ownerId);
    return buildSummary(
      code,
      Array.from(this.#relationships.values()).filter(
        (relationship) => relationship.referrerOwnerId === ownerId || relationship.referredOwnerId === ownerId,
      ),
      Array.from(this.#credits.values()).filter((credit) => credit.ownerId === ownerId),
    );
  }

  async claim(input: ClaimReferralInput): Promise<ReferralRelationship> {
    const normalizedCode = normalizeReferralCode(input.code);
    const code = Array.from(this.#codes.values()).find((candidate) => candidate.code === normalizedCode);

    if (!code) {
      throw new Error("referral_code_not_found");
    }

    if (code.ownerId === input.referredOwnerId) {
      throw new Error("self_referral_not_allowed");
    }

    if (Array.from(this.#relationships.values()).some((relationship) => relationship.referredOwnerId === input.referredOwnerId)) {
      throw new Error("referral_already_claimed");
    }

    const relationship = buildRelationship({
      referrerOwnerId: code.ownerId,
      referredOwnerId: input.referredOwnerId,
      referralCode: code.code,
    });
    this.#relationships.set(relationship.id, relationship);
    return relationship;
  }

  async creditCompletedBooking(booking: Booking): Promise<ReferralCredit | undefined> {
    const relationship = Array.from(this.#relationships.values()).find(
      (candidate) => candidate.referredOwnerId === booking.ownerId && candidate.status === "claimed",
    );

    if (!relationship) {
      return undefined;
    }

    const credit = buildCredit(relationship, booking);
    const creditedRelationship = markRelationshipCredited(relationship, booking.id, credit.createdAt);
    this.#relationships.set(relationship.id, creditedRelationship);
    this.#credits.set(credit.id, credit);
    return credit;
  }

  async listInternal(): Promise<InternalReferralSummary> {
    return {
      relationships: Array.from(this.#relationships.values()).sort(descByCreatedAt),
      credits: Array.from(this.#credits.values()).sort(descByCreatedAt),
    };
  }

  #getOrCreateCode(ownerId: string): ReferralCode {
    const existing = this.#codes.get(ownerId);
    if (existing) {
      return existing;
    }

    const code = buildReferralCode(ownerId, new Set(Array.from(this.#codes.values()).map((item) => item.code)));
    this.#codes.set(ownerId, code);
    return code;
  }
}

export class PostgresReferralRepository implements ReferralRepository {
  constructor(private readonly pool: DatabasePool) {}

  async getSummary(ownerId: string): Promise<ReferralSummary> {
    const code = await this.getOrCreateCode(ownerId);
    const [relationshipsResult, creditsResult] = await Promise.all([
      this.pool.query<ReferralRelationshipRow>(
        `select id, referrer_owner_id, referred_owner_id, referral_code, status, qualifying_booking_id, credited_at, created_at
         from referral_relationships
         where referrer_owner_id = $1 or referred_owner_id = $1
         order by created_at desc`,
        [ownerId],
      ),
      this.pool.query<ReferralCreditRow>(
        `select id, owner_id, referral_relationship_id, amount_minor, currency, status, reason, booking_id,
                created_at, available_at, redeemed_at, voided_at
         from referral_credits
         where owner_id = $1
         order by created_at desc`,
        [ownerId],
      ),
    ]);

    return buildSummary(code, relationshipsResult.rows.map(mapRelationshipRow), creditsResult.rows.map(mapCreditRow));
  }

  async claim(input: ClaimReferralInput): Promise<ReferralRelationship> {
    const normalizedCode = normalizeReferralCode(input.code);
    const result = await this.pool.query<ReferralCodeRow>(
      `select owner_id, code, created_at
       from referral_codes
       where code = $1`,
      [normalizedCode],
    );
    const code = result.rows[0] ? mapReferralCodeRow(result.rows[0]) : undefined;

    if (!code) {
      throw new Error("referral_code_not_found");
    }

    if (code.ownerId === input.referredOwnerId) {
      throw new Error("self_referral_not_allowed");
    }

    const relationship = buildRelationship({
      referrerOwnerId: code.ownerId,
      referredOwnerId: input.referredOwnerId,
      referralCode: code.code,
    });

    try {
      const insertResult = await this.pool.query<ReferralRelationshipRow>(
        `insert into referral_relationships (
          id, referrer_owner_id, referred_owner_id, referral_code, status, qualifying_booking_id, credited_at, created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        returning id, referrer_owner_id, referred_owner_id, referral_code, status, qualifying_booking_id, credited_at, created_at`,
        [
          relationship.id,
          relationship.referrerOwnerId,
          relationship.referredOwnerId,
          relationship.referralCode,
          relationship.status,
          relationship.qualifyingBookingId ?? null,
          relationship.creditedAt ?? null,
          relationship.createdAt,
        ],
      );
      return mapRelationshipRow(requiredRow(insertResult.rows[0], "referral_claim_failed"));
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new Error("referral_already_claimed");
      }
      throw error;
    }
  }

  async creditCompletedBooking(booking: Booking): Promise<ReferralCredit | undefined> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const relationshipResult = await client.query<ReferralRelationshipRow>(
        `select id, referrer_owner_id, referred_owner_id, referral_code, status, qualifying_booking_id, credited_at, created_at
         from referral_relationships
         where referred_owner_id = $1 and status = 'claimed'
         for update`,
        [booking.ownerId],
      );
      const relationship = relationshipResult.rows[0] ? mapRelationshipRow(relationshipResult.rows[0]) : undefined;

      if (!relationship) {
        await client.query("commit");
        return undefined;
      }

      const credit = buildCredit(relationship, booking);
      await client.query(
        `update referral_relationships
         set status = 'credited', qualifying_booking_id = $2, credited_at = $3
         where id = $1`,
        [relationship.id, booking.id, credit.createdAt],
      );
      const creditResult = await client.query<ReferralCreditRow>(
        `insert into referral_credits (
          id, owner_id, referral_relationship_id, amount_minor, currency, status, reason, booking_id,
          created_at, available_at, redeemed_at, voided_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        on conflict (referral_relationship_id) do nothing
        returning id, owner_id, referral_relationship_id, amount_minor, currency, status, reason, booking_id,
                  created_at, available_at, redeemed_at, voided_at`,
        [
          credit.id,
          credit.ownerId,
          credit.referralRelationshipId,
          credit.amount.amountMinor,
          credit.amount.currency,
          credit.status,
          credit.reason,
          credit.bookingId ?? null,
          credit.createdAt,
          credit.availableAt ?? null,
          credit.redeemedAt ?? null,
          credit.voidedAt ?? null,
        ],
      );
      await client.query("commit");
      return creditResult.rows[0] ? mapCreditRow(creditResult.rows[0]) : undefined;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listInternal(): Promise<InternalReferralSummary> {
    const [relationshipsResult, creditsResult] = await Promise.all([
      this.pool.query<ReferralRelationshipRow>(
        `select id, referrer_owner_id, referred_owner_id, referral_code, status, qualifying_booking_id, credited_at, created_at
         from referral_relationships
         order by created_at desc
         limit 200`,
      ),
      this.pool.query<ReferralCreditRow>(
        `select id, owner_id, referral_relationship_id, amount_minor, currency, status, reason, booking_id,
                created_at, available_at, redeemed_at, voided_at
         from referral_credits
         order by created_at desc
         limit 200`,
      ),
    ]);

    return {
      relationships: relationshipsResult.rows.map(mapRelationshipRow),
      credits: creditsResult.rows.map(mapCreditRow),
    };
  }

  private async getOrCreateCode(ownerId: string): Promise<ReferralCode> {
    const existingResult = await this.pool.query<ReferralCodeRow>(
      `select owner_id, code, created_at from referral_codes where owner_id = $1`,
      [ownerId],
    );

    if (existingResult.rows[0]) {
      return mapReferralCodeRow(existingResult.rows[0]);
    }

    const code = buildReferralCode(ownerId);
    try {
      const result = await this.pool.query<ReferralCodeRow>(
        `insert into referral_codes (owner_id, code, created_at)
         values ($1, $2, $3)
         returning owner_id, code, created_at`,
        [code.ownerId, code.code, code.createdAt],
      );
      return mapReferralCodeRow(requiredRow(result.rows[0], "referral_code_create_failed"));
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return this.getOrCreateCode(ownerId);
      }
      throw error;
    }
  }
}

export function validateClaimReferral(input: Partial<ClaimReferralRequest>): string[] {
  const errors: string[] = [];
  if (!input.code || normalizeReferralCode(input.code).length < 4) {
    errors.push("code is required");
  }
  return errors;
}

interface ReferralCodeRow {
  readonly owner_id: string;
  readonly code: string;
  readonly created_at: Date | string;
}

interface ReferralRelationshipRow {
  readonly id: string;
  readonly referrer_owner_id: string;
  readonly referred_owner_id: string;
  readonly referral_code: string;
  readonly status: ReferralRelationship["status"];
  readonly qualifying_booking_id: string | null;
  readonly credited_at: Date | string | null;
  readonly created_at: Date | string;
}

interface ReferralCreditRow {
  readonly id: string;
  readonly owner_id: string;
  readonly referral_relationship_id: string;
  readonly amount_minor: number;
  readonly currency: string;
  readonly status: ReferralCredit["status"];
  readonly reason: string;
  readonly booking_id: string | null;
  readonly created_at: Date | string;
  readonly available_at: Date | string | null;
  readonly redeemed_at: Date | string | null;
  readonly voided_at: Date | string | null;
}

function buildReferralCode(ownerId: string, reservedCodes: ReadonlySet<string> = new Set()): ReferralCode {
  let code = normalizeReferralCode(`PW${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`);
  while (reservedCodes.has(code)) {
    code = normalizeReferralCode(`PW${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`);
  }

  return {
    ownerId,
    code,
    createdAt: new Date().toISOString(),
  };
}

function buildRelationship(input: {
  readonly referrerOwnerId: string;
  readonly referredOwnerId: string;
  readonly referralCode: string;
}): ReferralRelationship {
  return {
    id: `refrel_${crypto.randomUUID()}`,
    referrerOwnerId: input.referrerOwnerId,
    referredOwnerId: input.referredOwnerId,
    referralCode: input.referralCode,
    status: "claimed",
    createdAt: new Date().toISOString(),
  };
}

function buildCredit(relationship: ReferralRelationship, booking: Booking): ReferralCredit {
  const now = new Date().toISOString();
  return {
    id: `refcred_${crypto.randomUUID()}`,
    ownerId: relationship.referrerOwnerId,
    referralRelationshipId: relationship.id,
    amount: {
      amountMinor: referralCreditAmountMinor,
      currency: booking.acceptedPrice.currency,
    },
    status: "available",
    reason: "Referred customer completed first paid Prima Wash booking",
    bookingId: booking.id,
    createdAt: now,
    availableAt: now,
  };
}

function buildSummary(
  code: ReferralCode,
  relationships: readonly ReferralRelationship[],
  credits: readonly ReferralCredit[],
): ReferralSummary {
  const currency = credits[0]?.amount.currency ?? "SGD";
  return {
    code,
    relationships,
    credits,
    availableCreditTotal: {
      amountMinor: credits
        .filter((credit) => credit.status === "available")
        .reduce((total, credit) => total + credit.amount.amountMinor, 0),
      currency,
    },
  };
}

function markRelationshipCredited(
  relationship: ReferralRelationship,
  qualifyingBookingId: string,
  creditedAt: string,
): ReferralRelationship {
  return {
    ...relationship,
    status: "credited",
    qualifyingBookingId,
    creditedAt,
  };
}

function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function mapReferralCodeRow(row: ReferralCodeRow): ReferralCode {
  return {
    ownerId: row.owner_id,
    code: row.code,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapRelationshipRow(row: ReferralRelationshipRow): ReferralRelationship {
  return {
    id: row.id,
    referrerOwnerId: row.referrer_owner_id,
    referredOwnerId: row.referred_owner_id,
    referralCode: row.referral_code,
    status: row.status,
    ...(row.qualifying_booking_id ? { qualifyingBookingId: row.qualifying_booking_id } : {}),
    ...(row.credited_at ? { creditedAt: new Date(row.credited_at).toISOString() } : {}),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapCreditRow(row: ReferralCreditRow): ReferralCredit {
  return {
    id: row.id,
    ownerId: row.owner_id,
    referralRelationshipId: row.referral_relationship_id,
    amount: {
      amountMinor: row.amount_minor,
      currency: row.currency,
    },
    status: row.status,
    reason: row.reason,
    ...(row.booking_id ? { bookingId: row.booking_id } : {}),
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.available_at ? { availableAt: new Date(row.available_at).toISOString() } : {}),
    ...(row.redeemed_at ? { redeemedAt: new Date(row.redeemed_at).toISOString() } : {}),
    ...(row.voided_at ? { voidedAt: new Date(row.voided_at).toISOString() } : {}),
  };
}

function descByCreatedAt(left: { readonly createdAt: string }, right: { readonly createdAt: string }): number {
  return right.createdAt.localeCompare(left.createdAt);
}

function requiredRow<T>(row: T | undefined, errorCode: string): T {
  if (!row) {
    throw new Error(errorCode);
  }
  return row;
}
