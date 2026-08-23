import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../supabase/migrations/20260823203000_adaptation_rpc_idempotency.sql", import.meta.url), "utf8");

test("adaptation execution identity is protected by a unique index", () => {
  assert.match(sql, /create unique index if not exists program_adjustments_execution_target_unique/i);
  assert.match(sql, /workout_session_id, program_session_id, target_key, adjustment_type, reason_code/i);
});

test("a full retry becomes an idempotent no-op before revision mutation", () => {
  const duplicateBranch = sql.indexOf("if v_existing = v_total then");
  const revisionUpdate = sql.indexOf("update public.program_sessions ps");
  assert.ok(duplicateBranch >= 0);
  assert.ok(revisionUpdate > duplicateBranch, "duplicate detection must happen before the session revision is incremented");
  assert.match(sql, /return query select v_revision, 0/);
});

test("partial replay is rejected instead of mixing old and new adjustments", () => {
  assert.match(sql, /ADJUSTMENT_IDEMPOTENCY_PARTIAL_CONFLICT/);
});

test("duplicate keys inside one bundle are rejected explicitly", () => {
  assert.match(sql, /DUPLICATE_ADJUSTMENT_KEYS/);
  assert.match(sql, /having count\(\*\) > 1/i);
});
