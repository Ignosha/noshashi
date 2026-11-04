// In-memory PostgreSQL only. No production URL/credentials are read.
// Exercises the real security migration and its existing threat registry dependencies.
import { readFile } from "node:fs/promises";
if (!process.env.PGLITE_MODULE)
  throw Error(
    "Set PGLITE_MODULE to an external @electric-sql/pglite installation, or run tests/security-network.sql against a fully migrated disposable PostgreSQL instance.",
  );
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
const read = (p) => readFile(p, "utf8");
try {
  await db.exec(
    (await read("tests/sql/supabase-stubs.sql")).replace(
      /^create extension if not exists pgcrypto.*$/gim,
      "",
    ),
  );
  await db.exec(
    await read("supabase/history/20260914_noshashi_schema_baseline.sql"),
  );
  await db.exec(
    await read(
      "supabase/migrations/20260920190000_organizations_roles_audit.sql",
    ),
  );
  await db.exec(
    await read("supabase/migrations/20260927130000_support_tickets.sql"),
  );
  // Only these existing function/table sections are dependencies. Omit unrelated
  // webhook/cron integration from the in-memory harness; CI runs full migrations.
  await db.exec(
    "alter table noshashi.entitlements add column if not exists organization_id uuid references noshashi.organizations(id)",
  );
  const features = await read(
    "supabase/migrations/20260927180100_institutional_features.sql",
  );
  await db.exec(
    features.slice(
      features.indexOf("create or replace function noshashi.org_has_feature"),
      features.indexOf("-- ── 3. Regulator seats"),
    ),
  );
  const registry = await read(
    "supabase/migrations/20260928150000_protection_threats_phishing.sql",
  );
  await db.exec(
    registry.slice(
      registry.indexOf("create table if not exists noshashi.threat_reports"),
      registry.indexOf("-- ── 3. Phishing link feed"),
    ),
  );
  await db.exec(
    await read("supabase/migrations/20261104123000_security_network.sql"),
  );
  await db.exec(await read("tests/security-network.sql"));
  console.log(
    "SECURITY NETWORK SQL TEST PASSED (in-memory PostgreSQL; actual migration, real registry functions)",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
