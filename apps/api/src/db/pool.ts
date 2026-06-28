import pg from "pg";

export type DatabasePool = pg.Pool;

export function createDatabasePool(databaseUrl: string): DatabasePool {
  return new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}
