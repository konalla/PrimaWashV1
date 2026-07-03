import { createDatabasePool } from "./pool.js";
import { PostgresAuthRepository } from "../modules/auth/repository.js";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/prima_wash";
const rateLimitRetentionHours = Number.parseInt(process.env.AUTH_RATE_LIMIT_RETENTION_HOURS ?? "24", 10);
const revokedSessionRetentionDays = Number.parseInt(process.env.AUTH_REVOKED_SESSION_RETENTION_DAYS ?? "30", 10);
const now = new Date();
const pool = createDatabasePool(databaseUrl);
const auth = new PostgresAuthRepository(pool);

try {
  const result = await auth.cleanupExpired({
    now: now.toISOString(),
    rateLimitEventsBefore: new Date(now.getTime() - rateLimitRetentionHours * 60 * 60 * 1000).toISOString(),
    revokedSessionsBefore: new Date(now.getTime() - revokedSessionRetentionDays * 24 * 60 * 60 * 1000).toISOString(),
  });

  console.log(
    JSON.stringify({
      event: "auth_cleanup_completed",
      database: sanitizeDatabaseUrl(databaseUrl),
      result,
    }),
  );
} finally {
  await pool.end();
}

function sanitizeDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.password) {
      url.password = "****";
    }
    return url.toString();
  } catch {
    return "configured";
  }
}
