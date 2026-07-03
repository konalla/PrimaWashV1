import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type {
  Actor,
  ActorRole,
  AuthSession,
  AuthUser,
  RequestAuthCodeResponse,
} from "@prima-wash/contracts";
import { InMemoryAuthRepository, type AuthRepository, type AuthSessionRecord } from "./repository.js";

export interface SessionPayload {
  readonly sub: string;
  readonly role: ActorRole;
  readonly identifier: string;
  readonly sid: string;
  readonly exp: number;
  readonly iat: number;
}

export class AuthService {
  static readonly codeRequestLimit = 5;
  static readonly codeRequestWindowMs = 15 * 60 * 1000;

  constructor(
    private readonly secret: string,
    private readonly developmentCode = "123456",
    private readonly repository: AuthRepository = new InMemoryAuthRepository(),
  ) {}

  async requestCode(rawIdentifier: string, source = "unknown"): Promise<RequestAuthCodeResponse> {
    const identifier = normalizeIdentifier(rawIdentifier);

    if (!isValidIdentifier(identifier)) {
      throw new Error("invalid_auth_identifier");
    }

    const now = Date.now();
    const rateLimit = await this.repository.recordCodeRequest({
      identifier,
      source: normalizeSource(source),
      occurredAt: new Date(now).toISOString(),
      windowStartsAt: new Date(now - AuthService.codeRequestWindowMs).toISOString(),
      maxAttempts: AuthService.codeRequestLimit,
    });

    if (!rateLimit.allowed) {
      throw new Error("auth_rate_limited");
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const challenge = await this.repository.createChallenge({
      identifier,
      codeHash: codeHash(this.developmentCode, this.secret),
      expiresAt,
    });

    return {
      challengeId: challenge.id,
      expiresAt,
      deliveryHint: maskIdentifier(identifier),
      ...(shouldExposeDevelopmentCode() ? { devCode: this.developmentCode } : {}),
    };
  }

  async verifyCode(
    challengeId: string,
    code: string,
    resolveUser?: (identifier: string) => Promise<AuthUser | undefined>,
  ): Promise<AuthSession> {
    const challenge = await this.repository.getChallenge(challengeId);

    if (!challenge || new Date(challenge.expiresAt).getTime() <= Date.now()) {
      await this.repository.deleteChallenge(challengeId);
      throw new Error("auth_challenge_expired");
    }

    const attemptedChallenge = await this.repository.incrementChallengeAttempts(challengeId);

    if (!attemptedChallenge) {
      throw new Error("auth_challenge_expired");
    }

    if (attemptedChallenge.attempts > 5) {
      await this.repository.deleteChallenge(challengeId);
      throw new Error("auth_challenge_locked");
    }

    if (!safeEqual(attemptedChallenge.codeHash, codeHash(code.trim(), this.secret))) {
      throw new Error("invalid_auth_code");
    }

    await this.repository.deleteChallenge(challengeId);
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + 24 * 60 * 60;
    const user = (await resolveUser?.(challenge.identifier)) ?? customerUserForIdentifier(challenge.identifier);
    const session = await this.repository.createSession({
      userId: user.id,
      role: user.role,
      identifier: user.identifier,
      issuedAt: new Date(issuedAt * 1000).toISOString(),
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    });
    const payload: SessionPayload = {
      sub: user.id,
      role: user.role,
      identifier: user.identifier,
      sid: session.id,
      iat: issuedAt,
      exp: expiresAt,
    };

    return {
      accessToken: signPayload(payload, this.secret),
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      user,
    };
  }

  async readSession(token: string): Promise<AuthSession> {
    const payload = verifyToken(token, this.secret);
    const session = await this.assertActiveSession(payload);
    const user: AuthUser = {
      id: payload.sub,
      role: payload.role,
      identifier: payload.identifier,
      displayName: displayNameForIdentifier(payload.identifier),
      onboardingComplete: true,
    };

    return {
      accessToken: token,
      expiresAt: session.expiresAt,
      user,
    };
  }

  async actorFromToken(token: string): Promise<Actor> {
    const payload = verifyToken(token, this.secret);
    await this.assertActiveSession(payload);
    return { userId: payload.sub, role: payload.role };
  }

  async revokeToken(token: string): Promise<void> {
    const payload = verifyToken(token, this.secret);
    await this.repository.revokeSession(payload.sid);
  }

  async assertActiveSession(payload: SessionPayload): Promise<AuthSessionRecord> {
    const session = await this.repository.getSession(payload.sid);

    if (
      !session ||
      session.revokedAt ||
      session.userId !== payload.sub ||
      session.role !== payload.role ||
      session.identifier !== payload.identifier ||
      new Date(session.expiresAt).getTime() <= Date.now()
    ) {
      throw new Error("invalid_access_token");
    }

    return session;
  }
}

function shouldExposeDevelopmentCode(): boolean {
  return process.env.SHOW_DEV_AUTH_CODE === "true";
}

export function actorFromAccessToken(token: string, secret: string): Actor {
  const payload = verifyToken(token, secret);
  return { userId: payload.sub, role: payload.role };
}

export function sessionPayloadFromAccessToken(token: string, secret: string): SessionPayload {
  return verifyToken(token, secret);
}

function signPayload(payload: SessionPayload, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyToken(token: string, secret: string): SessionPayload {
  const [encodedPayload, suppliedSignature] = token.split(".");

  if (!encodedPayload || !suppliedSignature) {
    throw new Error("invalid_access_token");
  }

  const expectedSignature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");

  if (!safeEqual(expectedSignature, suppliedSignature)) {
    throw new Error("invalid_access_token");
  }

  let payload: SessionPayload;

  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    throw new Error("invalid_access_token");
  }

  if (
    typeof payload.sub !== "string" ||
    !isActorRole(payload.role) ||
    typeof payload.identifier !== "string" ||
    typeof payload.sid !== "string" ||
    typeof payload.exp !== "number" ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("invalid_access_token");
  }

  return payload;
}

function customerUserForIdentifier(identifier: string): AuthUser {
  return {
    id: userIdForIdentifier(identifier),
    role: "customer",
    identifier,
    displayName: displayNameForIdentifier(identifier),
    onboardingComplete: true,
  };
}

function normalizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : trimmed.replace(/[^\d+]/g, "");
}

function normalizeSource(source: string): string {
  return source.trim().slice(0, 128) || "unknown";
}

function isValidIdentifier(identifier: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) || /^\+?\d{8,15}$/.test(identifier);
}

function isActorRole(value: unknown): value is ActorRole {
  return (
    value === "customer" ||
    value === "partner" ||
    value === "fleet" ||
    value === "internal" ||
    value === "property_manager"
  );
}

function maskIdentifier(identifier: string): string {
  if (identifier.includes("@")) {
    const [name = "", domain = ""] = identifier.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }

  return `${identifier.slice(0, 3)}••••${identifier.slice(-3)}`;
}

function userIdForIdentifier(identifier: string): string {
  return `usr_${createHash("sha256").update(identifier).digest("hex").slice(0, 16)}`;
}

function displayNameForIdentifier(identifier: string): string {
  if (identifier === "nalla@example.com") {
    return "Nalla";
  }

  const candidate = identifier.includes("@") ? identifier.split("@")[0] : undefined;
  return candidate ? candidate.charAt(0).toUpperCase() + candidate.slice(1) : "Vehicle owner";
}

function codeHash(code: string, secret: string): string {
  return createHmac("sha256", secret).update(code).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
