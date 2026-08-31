import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/migrations/20260831190000_ai_generation_rate_limits.sql", import.meta.url);

test("AI rate-limit buckets are private and the RPC is bound to auth.uid", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /alter table public\.api_rate_limit_buckets enable row level security/i);
  assert.match(sql, /revoke all on table public\.api_rate_limit_buckets from anon, authenticated/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(sql, /primary key \(user_id, endpoint, bucket_start\)/i);
  assert.match(sql, /on conflict \(user_id, endpoint, bucket_start\)/i);
  assert.match(sql, /grant execute on function public\.consume_api_rate_limit\(text, integer, integer\) to authenticated/i);
});
