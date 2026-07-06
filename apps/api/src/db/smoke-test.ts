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
  await assertTableExists("booking_evidence");
  await assertTableExists("booking_handovers");
  await assertTableExists("booking_consents");
  await assertTableExists("payment_operations");
  await assertTableExists("payment_reconciliation_cases");
  await assertTableExists("payment_reconciliation_case_events");
  await assertTableExists("payment_provider_reconciliation_runs");

  await assertColumnExists("vehicles", "is_primary");
  await assertColumnExists("bookings", "onsite_service_mode");
  await assertColumnExists("bookings", "valet_requested");
  await assertColumnExists("bookings", "execution_notes");
  await assertColumnExists("bookings", "operational_exception_code");
  await assertColumnExists("bookings", "operational_exception_notes");
  await assertColumnExists("bookings", "operational_exception_reported_at");
  await assertColumnExists("bookings", "operational_exception_resolved_at");
  await assertColumnExists("bookings", "assigned_technician_name");
  await assertColumnExists("bookings", "completion_notes");
  await assertColumnExists("bookings", "before_service_photo_urls");
  await assertColumnExists("bookings", "after_service_photo_urls");
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
  const beforeEvidenceId = `evidence_smoke_before_${suffix}`;
  const afterEvidenceId = `evidence_smoke_after_${suffix}`;
  const pickupHandoverId = `handover_smoke_pickup_${suffix}`;
  const returnHandoverId = `handover_smoke_return_${suffix}`;
  const pickupConsentId = `consent_smoke_pickup_${suffix}`;
  const paymentId = `pay_smoke_${suffix}`;
  const paymentOperationId = `payop_smoke_${suffix}`;
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
        operational_exception_code, operational_exception_notes, operational_exception_reported_at,
        assigned_technician_name, completion_notes, before_service_photo_urls, after_service_photo_urls
      )
      values (
        $1, 'usr_demo_001', $2, 'loc_demo_001', 'wash_basic', 'pending_payment',
        '2026-07-04T06:00:00.000Z', '2026-07-04T06:30:00.000Z', 2500, 'USD',
        'pickup_return', true, 'Smoke test pickup and return persistence.',
        'pickup_return_issue', 'Smoke test exception persistence.', now(),
        'Smoke Tech', 'Smoke completion notes.', array['evidence://before'], array['evidence://after']
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
      `insert into booking_evidence (
        id, booking_id, evidence_type, url, notes, uploaded_by_user_id, uploaded_by_role, created_at
      )
      values
        ($1, $2, 'before', 'evidence://smoke/before', 'Smoke before evidence', 'partner_demo_001', 'partner', now()),
        ($3, $2, 'after', 'evidence://smoke/after', 'Smoke after evidence', 'partner_demo_001', 'partner', now())`,
      [beforeEvidenceId, bookingId, afterEvidenceId],
    );
    await client.query(
      `insert into booking_handovers (
        id, booking_id, handover_type, contact_name, location_notes, key_handover_method,
        odometer_reading, fuel_or_charge_level, condition_notes, acknowledged_by,
        recorded_by_user_id, recorded_by_role, created_at
      )
      values
        ($1, $2, 'pickup', 'Smoke Owner', 'Lobby pickup bay', 'Key card envelope',
         '12000 km', '80%', 'No visible new damage at pickup.', 'Smoke Owner',
         'partner_demo_001', 'partner', now()),
        ($3, $2, 'return', 'Smoke Owner', 'Lobby return bay', 'Key returned to owner',
         '12012 km', '78%', 'Returned clean with owner acknowledgement.', 'Smoke Owner',
         'partner_demo_001', 'partner', now())`,
      [pickupHandoverId, bookingId, returnHandoverId],
    );
    await client.query(
      `insert into booking_consents (
        id, booking_id, owner_id, consent_type, terms_version, accepted_text, accepted_by_user_id, accepted_at
      )
      values ($1, $2, 'usr_demo_001', 'pickup_return_terms', '2026-07-05', 'Smoke pickup-return terms accepted.', 'usr_demo_001', now())`,
      [pickupConsentId, bookingId],
    );
    await client.query(
      `insert into payment_intents (
        id, booking_id, owner_id, amount_minor, currency, status, provider, provider_reference, client_secret, created_at
      )
      values ($1, $2, 'usr_demo_001', 2500, 'USD', 'requires_authorization', 'stripe', $3, $4, now())`,
      [paymentId, bookingId, `pi_smoke_${suffix}`, `secret_smoke_${suffix}`],
    );
    await client.query(
      `insert into payment_operations (
        id, payment_intent_id, booking_id, owner_id, operation, status,
        provider, provider_operation, provider_reference, provider_status, provider_processed_at,
        idempotency_key, actor_user_id, actor_role, request_id, metadata, created_at
      )
      values (
        $1, $2, $3, 'usr_demo_001', 'create', 'succeeded',
        'stripe', 'create', $4, 'succeeded', now(),
        $5, 'usr_demo_001', 'customer', $6, $7::jsonb, now()
      )`,
      [
        paymentOperationId,
        paymentId,
        bookingId,
        `pi_smoke_${suffix}`,
        `idem_smoke_${suffix}`,
        `req_smoke_${suffix}`,
        JSON.stringify({ source: "db_smoke" }),
      ],
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
      assigned_technician_name: string | null;
      before_count: string;
      after_count: string;
      evidence_before_count: string;
      evidence_after_count: string;
      pickup_handover_count: string;
      return_handover_count: string;
      pickup_consent_count: string;
      payment_operation_count: string;
      message_count: string;
    }>(
      `select v.plate_number, b.onsite_service_mode, b.valet_requested, b.operational_exception_code,
              b.assigned_technician_name,
              cardinality(b.before_service_photo_urls)::text as before_count,
              cardinality(b.after_service_photo_urls)::text as after_count,
              count(distinct be.id) filter (where be.evidence_type = 'before')::text as evidence_before_count,
              count(distinct be.id) filter (where be.evidence_type = 'after')::text as evidence_after_count,
              count(distinct bh.id) filter (where bh.handover_type = 'pickup')::text as pickup_handover_count,
              count(distinct bh.id) filter (where bh.handover_type = 'return')::text as return_handover_count,
              count(distinct bc.id) filter (where bc.consent_type = 'pickup_return_terms')::text as pickup_consent_count,
              count(distinct po.id) filter (where po.operation = 'create')::text as payment_operation_count,
              count(distinct cm.id)::text as message_count
       from bookings b
       join vehicles v on v.id = b.vehicle_id
       join booking_evidence be on be.booking_id = b.id
       join booking_handovers bh on bh.booking_id = b.id
       join booking_consents bc on bc.booking_id = b.id
       join payment_operations po on po.booking_id = b.id
       join communication_threads ct on ct.resource_id = b.id
       join communication_messages cm on cm.thread_id = ct.id
       where b.id = $1
       group by v.plate_number, b.onsite_service_mode, b.valet_requested, b.operational_exception_code,
                b.assigned_technician_name, b.before_service_photo_urls, b.after_service_photo_urls`,
      [bookingId],
    );

    const row = result.rows[0];
    if (
      !row ||
      row.onsite_service_mode !== "pickup_return" ||
      !row.valet_requested ||
      row.operational_exception_code !== "pickup_return_issue" ||
      row.assigned_technician_name !== "Smoke Tech" ||
      Number(row.before_count) !== 1 ||
      Number(row.after_count) !== 1 ||
      Number(row.evidence_before_count) !== 1 ||
      Number(row.evidence_after_count) !== 1 ||
      Number(row.pickup_handover_count) !== 1 ||
      Number(row.return_handover_count) !== 1 ||
      Number(row.pickup_consent_count) !== 1 ||
      Number(row.payment_operation_count) !== 1 ||
      Number(row.message_count) !== 1
    ) {
      throw new Error("transactional_write_read_failed");
    }

    checks.push({
      name: "transactional_write_read",
      details: {
        bookingServiceMode: row.onsite_service_mode,
        operationalExceptionCode: row.operational_exception_code,
        assignedTechnicianName: row.assigned_technician_name,
        beforeEvidenceCount: Number(row.before_count),
        afterEvidenceCount: Number(row.after_count),
        beforeEvidenceRecordCount: Number(row.evidence_before_count),
        afterEvidenceRecordCount: Number(row.evidence_after_count),
        pickupHandoverCount: Number(row.pickup_handover_count),
        returnHandoverCount: Number(row.return_handover_count),
        pickupConsentCount: Number(row.pickup_consent_count),
        paymentOperationCount: Number(row.payment_operation_count),
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
