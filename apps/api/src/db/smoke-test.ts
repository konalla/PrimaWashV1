import { readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/prima_wash";
const migrationsDirectory = path.join(process.cwd(), "db", "migrations");

interface CheckResult {
  readonly name: string;
  readonly details?: Record<string, unknown>;
}

const pool = new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
const checks: CheckResult[] = [];

try {
  await pool.query("select 1");
  checks.push({ name: "database_connection" });

  const migrationFiles = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
  const migrationResult = await pool.query<{ count: string; latest: string | null }>(
    "select count(*)::text as count, max(filename) as latest from schema_migrations",
  );
  const appliedCount = Number(migrationResult.rows[0]?.count ?? 0);
  const latestApplied = migrationResult.rows[0]?.latest ?? null;
  const latestExpected = migrationFiles.at(-1) ?? null;

  if (appliedCount !== migrationFiles.length || latestApplied !== latestExpected) {
    throw new Error(
      `migration_mismatch: applied ${appliedCount}/${migrationFiles.length}, latest ${latestApplied ?? "none"} expected ${
        latestExpected ?? "none"
      }`,
    );
  }

  checks.push({
    name: "migrations_current",
    details: { appliedCount, latest: latestApplied },
  });

  await assertSeedCount("organizations", 2);
  await assertSeedCount("users", 1);
  await assertSeedCount("partner_locations", 3);
  await assertSeedCount("service_offerings", 3);
  await assertSeedCount("properties", 3);
  await assertSeedCount("condo_operational_profiles", 1);
  await assertSeedCount("prima_wash_days", 1);
  await assertSeedCount("access_memberships", 5);
  await assertTableExists("auth_challenges");
  await assertTableExists("auth_sessions");
  await assertTableExists("auth_rate_limit_events");
  await assertTableExists("auth_refresh_tokens");
  await assertTableExists("access_invitations");

  await assertColumnExists("vehicles", "is_primary");
  await assertColumnExists("bookings", "onsite_service_mode");
  await assertColumnExists("bookings", "valet_requested");
  await assertColumnExists("bookings", "execution_notes");
  await assertColumnExists("bookings", "operational_exception_code");
  await assertColumnExists("bookings", "operational_exception_notes");
  await assertColumnExists("bookings", "operational_exception_reported_at");
  await assertColumnExists("bookings", "operational_exception_resolved_at");
  await assertColumnExists("payment_intents", "provider");
  await assertColumnExists("payment_intents", "provider_reference");
  await assertColumnExists("payment_intents", "client_secret");
  await assertColumnExists("bookings", "prima_wash_day_id");
  await assertColumnExists("access_memberships", "permissions");
  await assertColumnExists("access_memberships", "property_id");
  await assertColumnExists("auth_challenges", "code_hash");
  await assertColumnExists("auth_challenges", "attempts");
  await assertColumnExists("auth_sessions", "revoked_at");
  await assertColumnExists("auth_rate_limit_events", "source");
  await assertColumnExists("auth_rate_limit_events", "event_type");
  await assertColumnExists("auth_refresh_tokens", "token_hash");
  await assertColumnExists("auth_refresh_tokens", "family_id");
  await assertColumnExists("auth_refresh_tokens", "used_at");
  await assertColumnExists("auth_refresh_tokens", "revoked_at");
  await assertColumnExists("access_invitations", "code_hash");
  await assertColumnExists("access_invitations", "accepted_at");
  await assertColumnExists("access_invitations", "revoked_at");
  await assertColumnExists("access_invitations", "permissions");

  await assertAccessMemberships();
  await assertTransactionalWriteRead();

  console.log(
    JSON.stringify({
      event: "db_smoke_passed",
      database: sanitizeDatabaseUrl(databaseUrl),
      checks,
    }),
  );
} finally {
  await pool.end();
}

async function assertSeedCount(tableName: string, minimum: number): Promise<void> {
  const result = await pool.query<{ count: string }>(`select count(*)::text as count from ${tableName}`);
  const count = Number(result.rows[0]?.count ?? 0);

  if (count < minimum) {
    throw new Error(`seed_missing: ${tableName} has ${count}, expected at least ${minimum}`);
  }

  checks.push({ name: `seed_${tableName}`, details: { count } });
}

async function assertTableExists(tableName: string): Promise<void> {
  const result = await pool.query<{ exists: boolean }>(
    `select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = $1
    )`,
    [tableName],
  );

  if (!result.rows[0]?.exists) {
    throw new Error(`table_missing: ${tableName}`);
  }

  checks.push({ name: `table_${tableName}` });
}

async function assertColumnExists(tableName: string, columnName: string): Promise<void> {
  const result = await pool.query<{ exists: boolean }>(
    `select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
        and column_name = $2
    )`,
    [tableName, columnName],
  );

  if (!result.rows[0]?.exists) {
    throw new Error(`column_missing: ${tableName}.${columnName}`);
  }

  checks.push({ name: `column_${tableName}_${columnName}` });
}

async function assertAccessMemberships(): Promise<void> {
  const result = await pool.query<{
    partner_organization_id: string | null;
    manager_property_id: string | null;
    internal_permissions: readonly string[] | null;
  }>(
    `select
       (select organization_id from access_memberships where user_id = 'partner_demo_001' and active = true limit 1)
         as partner_organization_id,
       (select property_id from access_memberships where user_id = 'mgr_marina_001' and active = true limit 1)
         as manager_property_id,
       (select permissions from access_memberships where user_id = 'usr_internal_001' and active = true limit 1)
         as internal_permissions`,
  );

  const row = result.rows[0];
  if (
    row?.partner_organization_id !== "org_partner_001" ||
    row.manager_property_id !== "prop_sg_marina_one" ||
    !row.internal_permissions?.includes("super_admin")
  ) {
    throw new Error("access_membership_seed_invalid");
  }

  checks.push({
    name: "access_memberships_seeded",
    details: {
      partnerOrganizationId: row.partner_organization_id,
      managerPropertyId: row.manager_property_id,
    },
  });
}

async function assertTransactionalWriteRead(): Promise<void> {
  const client = await pool.connect();
  const suffix = crypto.randomUUID().slice(0, 8);
  const vehicleId = `veh_smoke_${suffix}`;
  const bookingId = `book_smoke_${suffix}`;
  const threadId = `thread_smoke_${suffix}`;
  const messageId = `msg_smoke_${suffix}`;

  try {
    await client.query("begin");
    await client.query(
      `insert into vehicles (id, owner_id, nickname, plate_number, make, model, year, is_primary)
       values ($1, 'usr_demo_001', 'Smoke Test', $2, 'Prima', 'Verifier', 2026, false)`,
      [vehicleId, `SMOKE${suffix}`],
    );
    await client.query(
      `insert into bookings (
        id, owner_id, vehicle_id, partner_location_id, service_code, status, scheduled_start_at, scheduled_end_at,
        accepted_price_amount_minor, accepted_price_currency, onsite_service_mode, valet_requested, execution_notes,
        operational_exception_code, operational_exception_notes, operational_exception_reported_at
      )
      values (
        $1, 'usr_demo_001', $2, 'loc_demo_001', 'wash_basic', 'pending_payment',
        '2026-07-04T06:00:00.000Z', '2026-07-04T06:30:00.000Z', 2500, 'USD',
        'pickup_return', true, 'Smoke test pickup and return persistence.',
        'pickup_return_issue', 'Smoke test exception persistence.', now()
      )`,
      [bookingId, vehicleId],
    );
    await client.query(
      `insert into communication_threads (
        id, thread_type, resource_type, resource_id, subject, created_by_role, created_at, updated_at
      )
      values ($1, 'partner_to_owner', 'booking', $2, 'Smoke test thread', 'partner', now(), now())`,
      [threadId, bookingId],
    );
    await client.query(
      `insert into communication_messages (id, thread_id, sender_user_id, sender_role, body, created_at)
       values ($1, $2, 'partner_demo_001', 'partner', 'Smoke test message', now())`,
      [messageId, threadId],
    );

    const result = await client.query<{
      plate_number: string;
      onsite_service_mode: string;
      valet_requested: boolean;
      operational_exception_code: string | null;
      message_count: string;
    }>(
      `select v.plate_number, b.onsite_service_mode, b.valet_requested, b.operational_exception_code,
              count(cm.id)::text as message_count
       from bookings b
       join vehicles v on v.id = b.vehicle_id
       join communication_threads ct on ct.resource_id = b.id
       join communication_messages cm on cm.thread_id = ct.id
       where b.id = $1
       group by v.plate_number, b.onsite_service_mode, b.valet_requested, b.operational_exception_code`,
      [bookingId],
    );

    const row = result.rows[0];
    if (
      !row ||
      row.onsite_service_mode !== "pickup_return" ||
      !row.valet_requested ||
      row.operational_exception_code !== "pickup_return_issue" ||
      Number(row.message_count) !== 1
    ) {
      throw new Error("transactional_write_read_failed");
    }

    checks.push({
      name: "transactional_write_read",
      details: {
        bookingServiceMode: row.onsite_service_mode,
        operationalExceptionCode: row.operational_exception_code,
        messageCount: Number(row.message_count),
      },
    });
  } finally {
    await client.query("rollback");
    client.release();
  }
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
