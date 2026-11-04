// Run with node and an explicit external PGlite installation. It uses only
// an in-memory database; no DATABASE_URL or production credentials are read.
import { readFile } from "node:fs/promises";
const modulePath = process.env.PGLITE_MODULE;
if (!modulePath)
  throw new Error(
    "Set PGLITE_MODULE to an installed @electric-sql/pglite module, or run npm run test:sql with local Postgres.",
  );
const { PGlite } = await import(modulePath);
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create schema auth;create schema noshashi;grant usage on schema noshashi to anon,authenticated,service_role;
  create table auth.users(id uuid primary key,email text);
  create table noshashi.accounts(id uuid primary key,email text);
  create table noshashi.entitlements(account_id uuid primary key,tier text,valid_until timestamptz);
  create table noshashi.subscriptions(account_id uuid,stripe_subscription_id text,stripe_customer_id text,tier text,status text,current_period_end timestamptz);
  create table noshashi.api_keys(id uuid primary key default gen_random_uuid(),account_id uuid,name text,prefix text,key_hash text unique,scopes text[],expires_at timestamptz,revoked_at timestamptz);`);
await db.exec(
  await readFile(
    "supabase/migrations/20261103193000_payment_review_portal.sql",
    "utf8",
  ),
);
await db.exec(await readFile("tests/sql/payment-review.test.sql", "utf8"));
await db.close();
console.log("PAYMENT REVIEW SQL TEST PASSED (in-memory PostgreSQL)");
