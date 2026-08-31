import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const baseMigrationUrl = new URL("../supabase/migrations/20260831190000_ai_generation_rate_limits.sql", import.meta.url);
const hardeningMigrationUrl = new URL("../supabase/migrations/20260831193000_harden_ai_rate_limit_rpc.sql", import.meta.url);

test("base AI rate-limit schema starts with a user-scoped compound key", async () => {
  const sql = await readFile(baseMigrationUrl, "utf8");
  assert.match(sql, /alter table public\.api_rate_limit_buckets enable row level security/i);
  assert.match(sql, /primary key \(user_id, endpoint, bucket_start\)/i);
});

test("latest limiter migration removes the parameterized security-definer RPC", async () => {
  const sql = await readFile(hardeningMigrationUrl, "utf8");
  assert.match(sql, /drop function if exists public\.consume_api_rate_limit\(text, integer, integer\)/i);
  assert.doesNotMatch(sql, /create or replace function public\.consume_api_rate_limit/i);
  assert.match(sql, /create or replace function public\.consume_ai_generation_limit\(p_policy text\)/i);
  assert.match(sql, /security invoker/i);
  assert.doesNotMatch(sql, /security definer/i);
});

test("authenticated clients can only mutate their own limiter rows under RLS", async () => {
  const sql = await readFile(hardeningMigrationUrl, "utf8");
  assert.match(sql, /create policy api_rate_limit_select_own/i);
  assert.match(sql, /create policy api_rate_limit_insert_own/i);
  assert.match(sql, /create policy api_rate_limit_update_own/i);
  assert.match(sql, /create policy api_rate_limit_delete_expired_own/i);
  assert.match(sql, /user_id = auth\.uid\(\)/i);
  assert.match(sql, /bucket_start < clock_timestamp\(\) - interval '2 days'/i);
});

test("write trigger prevents direct counter reset or bucket identity tampering", async () => {
  const sql = await readFile(hardeningMigrationUrl, "utf8");
  assert.match(sql, /new\.request_count := old\.request_count \+ 1/i);
  assert.match(sql, /RATE_LIMIT_IDENTITY_IMMUTABLE/i);
  assert.match(sql, /RATE_LIMIT_BUCKET_INVALID/i);
  assert.match(sql, /before insert or update on public\.api_rate_limit_buckets/i);
});

test("public RPC exposes only named policies with fixed product limits", async () => {
  const sql = await readFile(hardeningMigrationUrl, "utf8");
  assert.match(sql, /when 'workout_generation'/i);
  assert.match(sql, /v_hour_limit := 20/i);
  assert.match(sql, /v_day_limit := 60/i);
  assert.match(sql, /when 'program_generation'/i);
  assert.match(sql, /v_hour_limit := 6/i);
  assert.match(sql, /v_day_limit := 20/i);
  assert.match(sql, /grant execute on function public\.consume_ai_generation_limit\(text\) to authenticated/i);
  assert.doesNotMatch(sql, /p_limit integer/i);
  assert.doesNotMatch(sql, /p_window_seconds integer/i);
});
