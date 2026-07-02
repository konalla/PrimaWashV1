import { createHmac, createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  Actor,
  ActorRole,
  AuthSession,
  AuthUser,
  RequestAuthCodeResponse,
} from "@prima-wash/contracts";

interface AuthChallenge {
  readonly identifier: string;
  readonly code: string;
  readonly expiresAt: number;
  attempts: number;
}

interface SessionPayload {
  readonly sub: string;
  readonly role: ActorRole;
  readonly identifier: string;
  readonly exp: number;
  readonly iat: number;
}

export class AuthService {
  readonly #challenges = new Map<string, AuthChallenge>();

  constructor(
    private readonly secret: string,
    private readonly developmentCode = "123456",
  ) {}

  requestCode(rawIdentifier: string): RequestAuthCodeResponse {
    const identifier = normalizeIdentifier(rawIdentifier);

    if (!isValidIdentifier(identifier)) {
      throw new Error("invalid_auth_identifier");
    }

    const challengeId = randomUUID();
    const expiresAt = Date.now() + 10 * 60 * 1000;
    this.#challenges.set(challengeId, {
      identifier,
      code: this.developmentCode,
      expiresAt,
      attempts: 0,
    });

    return {
      challengeId,
      expiresAt: new Date(expiresAt).toISOString(),
      deliveryHint: maskIdentifier(identifier),
      ...(shouldExposeDevelopmentCode() ? { devCode: this.developmentCode } : {}),
    };
  }

  async verifyCode(
    challengeId: string,
    code: string,
    resolveUser?: (identifier: string) => Promise<AuthUser | undefined>,
  ): Promise<AuthSession> {
    const challenge = this.#challenges.get(challengeId);

    if (!challenge || challenge.expiresAt <= Date.now()) {
      this.#challenges.delete(challengeId);
      throw new Error("auth_challenge_expired");
    }

    challenge.attempts += 1;

    if (challenge.attempts > 5) {
      this.#challenges.delete(challengeId);
      throw new Error("auth_challenge_locked");
    }

    if (!safeEqual(challenge.code, code.trim())) {
      throw new Error("invalid_auth_code");
    }

    this.#challenges.delete(challengeId);
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + 24 * 60 * 60;
    const user = (await resolveUser?.(challenge.identifier)) ?? customerUserForIdentifier(challenge.identifier);
    const payload: SessionPayload = {
      sub: user.id,
      role: user.role,
      identifier: user.identifier,
      iat: issuedAt,
      exp: expiresAt,
    };

    return {
      accessToken: signPayload(payload, this.secret),
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      user,
    };
  }

  readSession(token: string): AuthSession {
    const payload = verifyToken(token, this.secret);
    const user: AuthUser = {
      id: payload.sub,
      role: "customer",
      identifier: payload.identifier,
      displayName: displayNameForIdentifier(payload.identifier),
      onboardingComplete: true,
    };

    return {
      accessToken: token,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      user,
    };
  }
}

function shouldExposeDevelopmentCode(): boolean {
  return process.env.SHOW_DEV_AUTH_CODE === "true";
}

export function actorFromAccessToken(token: string, secret: string): Actor {
  const payload = verifyToken(token, secret);
  return { userId: payload.sub, role: payload.role };
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

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
