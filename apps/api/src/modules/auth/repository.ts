import { randomUUID } from "node:crypto";
import type { ActorRole } from "@prima-wash/contracts";
import type { DatabasePool } from "../../db/pool.js";

export interface AuthChallengeRecord {
  readonly id: string;
  readonly identifier: string;
  readonly codeHash: string;
  readonly expiresAt: string;
  readonly attempts: number;
}

export interface CreateAuthChallengeInput {
  readonly identifier: string;
  readonly codeHash: string;
  readonly expiresAt: string;
}

export interface AuthSessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly role: ActorRole;
  readonly identifier: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revokedAt?: string;
}

export interface CreateAuthSessionInput {
  readonly userId: string;
  readonly role: ActorRole;
  readonly identifier: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface RecordAuthRequestInput {
  readonly identifier: string;
  readonly source: string;
  readonly occurredAt: string;
  readonly windowStartsAt: string;
  readonly maxAttempts: number;
}

export interface AuthRequestLimitResult {
  readonly allowed: boolean;
  readonly count: number;
  readonly maxAttempts: number;
  readonly windowStartsAt: string;
}

export interface AuthCleanupResult {
  readonly deletedChallenges: number;
  readonly deletedRateLimitEvents: number;
  readonly deletedSessions: number;
}

export interface AuthRepository {
  recordCodeRequest(input: RecordAuthRequestInput): Promise<AuthRequestLimitResult>;
  createChallenge(input: CreateAuthChallengeInput): Promise<AuthChallengeRecord>;
  getChallenge(challengeId: string): Promise<AuthChallengeRecord | undefined>;
  incrementChallengeAttempts(challengeId: string): Promise<AuthChallengeRecord | undefined>;
  deleteChallenge(challengeId: string): Promise<void>;
  createSession(input: CreateAuthSessionInput): Promise<AuthSessionRecord>;
  getSession(sessionId: string): Promise<AuthSessionRecord | undefined>;
  revokeSession(sessionId: string): Promise<AuthSessionRecord | undefined>;
  cleanupExpired(input: {
    readonly now: string;
    readonly rateLimitEventsBefore: string;
    readonly revokedSessionsBefore?: string;
  }): Promise<AuthCleanupResult>;
}

export class InMemoryAuthRepository implements AuthRepository {
  readonly #challenges = new Map<string, AuthChallengeRecord>();
  readonly #sessions = new Map<string, AuthSessionRecord>();
  readonly #requestEvents: { readonly identifier: string; readonly source: string; readonly occurredAt: string }[] = [];

  async recordCodeRequest(input: RecordAuthRequestInput): Promise<AuthRequestLimitResult> {
    this.#requestEvents.push({
      identifier: input.identifier,
      source: input.source,
      occurredAt: input.occurredAt,
    });
    const windowStart = new Date(input.windowStartsAt).getTime();
    const count = this.#requestEvents.filter(
      (event) =>
        event.identifier === input.identifier &&
        event.source === input.source &&
        new Date(event.occurredAt).getTime() >= windowStart,
    ).length;

    return {
      allowed: count <= input.maxAttempts,
      count,
      maxAttempts: input.maxAttempts,
      windowStartsAt: input.windowStartsAt,
    };
  }

  async createChallenge(input: CreateAuthChallengeInput): Promise<AuthChallengeRecord> {
    const challenge: AuthChallengeRecord = {
      id: `auth_chal_${randomUUID()}`,
      attempts: 0,
      ...input,
    };
    this.#challenges.set(challenge.id, challenge);
    return challenge;
  }

  async getChallenge(challengeId: string): Promise<AuthChallengeRecord | undefined> {
    return this.#challenges.get(challengeId);
  }

  async incrementChallengeAttempts(challengeId: string): Promise<AuthChallengeRecord | undefined> {
    const challenge = this.#challenges.get(challengeId);

    if (!challenge) {
      return undefined;
    }

    const updated = { ...challenge, attempts: challenge.attempts + 1 };
    this.#challenges.set(challengeId, updated);
    return updated;
  }

  async deleteChallenge(challengeId: string): Promise<void> {
    this.#challenges.delete(challengeId);
  }

  async createSession(input: CreateAuthSessionInput): Promise<AuthSessionRecord> {
    const session: AuthSessionRecord = {
      id: `auth_sess_${randomUUID()}`,
      ...input,
    };
    this.#sessions.set(session.id, session);
    return session;
  }

  async getSession(sessionId: string): Promise<AuthSessionRecord | undefined> {
    return this.#sessions.get(sessionId);
  }

  async revokeSession(sessionId: string): Promise<AuthSessionRecord | undefined> {
    const session = this.#sessions.get(sessionId);

    if (!session) {
      return undefined;
    }

    const revoked = { ...session, revokedAt: new Date().toISOString() };
    this.#sessions.set(sessionId, revoked);
    return revoked;
  }

  async cleanupExpired(input: {
    readonly now: string;
    readonly rateLimitEventsBefore: string;
    readonly revokedSessionsBefore?: string;
  }): Promise<AuthCleanupResult> {
    const now = new Date(input.now).getTime();
    const rateLimitCutoff = new Date(input.rateLimitEventsBefore).getTime();
    const revokedCutoff = input.revokedSessionsBefore ? new Date(input.revokedSessionsBefore).getTime() : undefined;
    let deletedChallenges = 0;
    let deletedSessions = 0;
    let deletedRateLimitEvents = 0;

    for (const [id, challenge] of this.#challenges) {
      if (new Date(challenge.expiresAt).getTime() <= now) {
        this.#challenges.delete(id);
        deletedChallenges += 1;
      }
    }

    for (const [id, session] of this.#sessions) {
      const expired = new Date(session.expiresAt).getTime() <= now;
      const oldRevoked =
        revokedCutoff !== undefined &&
        session.revokedAt !== undefined &&
        new Date(session.revokedAt).getTime() <= revokedCutoff;

      if (expired || oldRevoked) {
        this.#sessions.delete(id);
        deletedSessions += 1;
      }
    }

    for (let index = this.#requestEvents.length - 1; index >= 0; index -= 1) {
      const event = this.#requestEvents[index];

      if (event && new Date(event.occurredAt).getTime() <= rateLimitCutoff) {
        this.#requestEvents.splice(index, 1);
        deletedRateLimitEvents += 1;
      }
    }

    return { deletedChallenges, deletedRateLimitEvents, deletedSessions };
  }
}

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly pool: DatabasePool) {}

  async recordCodeRequest(input: RecordAuthRequestInput): Promise<AuthRequestLimitResult> {
    await this.pool.query(
      `insert into auth_rate_limit_events (id, identifier, source, event_type, occurred_at)
       values ($1, $2, $3, 'code_request', $4)`,
      [`auth_rl_${randomUUID()}`, input.identifier, input.source, input.occurredAt],
    );
    const result = await this.pool.query<{ count: string }>(
      `select count(*)::text as count
       from auth_rate_limit_events
       where identifier = $1
         and source = $2
         and event_type = 'code_request'
         and occurred_at >= $3`,
      [input.identifier, input.source, input.windowStartsAt],
    );
    const count = Number(result.rows[0]?.count ?? 0);

    return {
      allowed: count <= input.maxAttempts,
      count,
      maxAttempts: input.maxAttempts,
      windowStartsAt: input.windowStartsAt,
    };
  }

  async createChallenge(input: CreateAuthChallengeInput): Promise<AuthChallengeRecord> {
    const result = await this.pool.query<AuthChallengeRow>(
      `insert into auth_challenges (id, identifier, code_hash, expires_at, attempts, created_at)
       values ($1, $2, $3, $4, 0, now())
       returning id, identifier, code_hash, expires_at, attempts`,
      [`auth_chal_${randomUUID()}`, input.identifier, input.codeHash, input.expiresAt],
    );

    return mapChallengeRow(result.rows[0]);
  }

  async getChallenge(challengeId: string): Promise<AuthChallengeRecord | undefined> {
    const result = await this.pool.query<AuthChallengeRow>(
      `select id, identifier, code_hash, expires_at, attempts
       from auth_challenges
       where id = $1`,
      [challengeId],
    );

    return result.rows[0] ? mapChallengeRow(result.rows[0]) : undefined;
  }

  async incrementChallengeAttempts(challengeId: string): Promise<AuthChallengeRecord | undefined> {
    const result = await this.pool.query<AuthChallengeRow>(
      `update auth_challenges
       set attempts = attempts + 1
       where id = $1
       returning id, identifier, code_hash, expires_at, attempts`,
      [challengeId],
    );

    return result.rows[0] ? mapChallengeRow(result.rows[0]) : undefined;
  }

  async deleteChallenge(challengeId: string): Promise<void> {
    await this.pool.query("delete from auth_challenges where id = $1", [challengeId]);
  }

  async createSession(input: CreateAuthSessionInput): Promise<AuthSessionRecord> {
    const result = await this.pool.query<AuthSessionRow>(
      `insert into auth_sessions (id, user_id, role, identifier, issued_at, expires_at)
       values ($1, $2, $3, $4, $5, $6)
       returning id, user_id, role, identifier, issued_at, expires_at, revoked_at`,
      [`auth_sess_${randomUUID()}`, input.userId, input.role, input.identifier, input.issuedAt, input.expiresAt],
    );

    return mapSessionRow(result.rows[0]);
  }

  async getSession(sessionId: string): Promise<AuthSessionRecord | undefined> {
    const result = await this.pool.query<AuthSessionRow>(
      `select id, user_id, role, identifier, issued_at, expires_at, revoked_at
       from auth_sessions
       where id = $1`,
      [sessionId],
    );

    return result.rows[0] ? mapSessionRow(result.rows[0]) : undefined;
  }

  async revokeSession(sessionId: string): Promise<AuthSessionRecord | undefined> {
    const result = await this.pool.query<AuthSessionRow>(
      `update auth_sessions
       set revoked_at = coalesce(revoked_at, now())
       where id = $1
       returning id, user_id, role, identifier, issued_at, expires_at, revoked_at`,
      [sessionId],
    );

    return result.rows[0] ? mapSessionRow(result.rows[0]) : undefined;
  }

  async cleanupExpired(input: {
    readonly now: string;
    readonly rateLimitEventsBefore: string;
    readonly revokedSessionsBefore?: string;
  }): Promise<AuthCleanupResult> {
    const [challengeResult, rateLimitResult, sessionResult] = await Promise.all([
      this.pool.query("delete from auth_challenges where expires_at <= $1", [input.now]),
      this.pool.query("delete from auth_rate_limit_events where occurred_at <= $1", [input.rateLimitEventsBefore]),
      this.pool.query(
        `delete from auth_sessions
         where expires_at <= $1
            or ($2::timestamptz is not null and revoked_at is not null and revoked_at <= $2::timestamptz)`,
        [input.now, input.revokedSessionsBefore ?? null],
      ),
    ]);

    return {
      deletedChallenges: challengeResult.rowCount ?? 0,
      deletedRateLimitEvents: rateLimitResult.rowCount ?? 0,
      deletedSessions: sessionResult.rowCount ?? 0,
    };
  }
}

interface AuthChallengeRow {
  readonly id: string;
  readonly identifier: string;
  readonly code_hash: string;
  readonly expires_at: Date | string;
  readonly attempts: number;
}

interface AuthSessionRow {
  readonly id: string;
  readonly user_id: string;
  readonly role: ActorRole;
  readonly identifier: string;
  readonly issued_at: Date | string;
  readonly expires_at: Date | string;
  readonly revoked_at: Date | string | null;
}

function mapChallengeRow(row: AuthChallengeRow | undefined): AuthChallengeRecord {
  if (!row) {
    throw new Error("auth_challenge_persist_failed");
  }

  return {
    id: row.id,
    identifier: row.identifier,
    codeHash: row.code_hash,
    expiresAt: toIsoString(row.expires_at),
    attempts: row.attempts,
  };
}

function mapSessionRow(row: AuthSessionRow | undefined): AuthSessionRecord {
  if (!row) {
    throw new Error("auth_session_persist_failed");
  }

  return {
    id: row.id,
    userId: row.user_id,
    role: row.role,
    identifier: row.identifier,
    issuedAt: toIsoString(row.issued_at),
    expiresAt: toIsoString(row.expires_at),
    ...(row.revoked_at ? { revokedAt: toIsoString(row.revoked_at) } : {}),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
