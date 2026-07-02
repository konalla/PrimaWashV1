import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/prima_wash";

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run production migrations");
}

const pool = new pg.Pool({ connectionString: databaseUrl });
const migrationsDirectory = path.join(process.cwd(), "db", "migrations");

try {
  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const alreadyApplied = await pool.query("select 1 from schema_migrations where filename = $1", [file]);

    if ((alreadyApplied.rowCount ?? 0) > 0) {
      continue;
    }

    const client = await pool.connect();

    try {
      await client.query("begin");
      const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
      await client.query(sql);
      await client.query("insert into schema_migrations (filename) values ($1)", [file]);
      await client.query("commit");
      console.log(JSON.stringify({ event: "migration_applied", file }));
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
