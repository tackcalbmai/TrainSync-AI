import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(new URL("../supabase/migrations/20260828080000_add_planned_exercise_identity.sql", import.meta.url), "utf8");

test("program completion stores planned exercise identity separately", () => {
  assert.match(sql, /add column if not exists planned_exercise_key text/i);
  assert.match(sql, /exercise_key,planned_exercise_key/i);
  assert.match(sql, /v_performed_key,v_planned_key/i);
});

test("program completion rejects unapproved performed exercise substitutions", () => {
  assert.match(sql, /liveSubstitutions/);
  assert.match(sql, /plannedExerciseKey/);
  assert.match(sql, /replacementExerciseKey/);
  assert.match(sql, /UNAPPROVED_EXERCISE_SUBSTITUTION/);
});

test("substitutions never inherit the planned exercise load target", () => {
  assert.match(sql, /case when v_is_substitution then null else nullif\(v_plan_set->>'weightKg',''\)::numeric end/i);
});

test("legacy program completion without an explicit performed key remains planned identity", () => {
  assert.match(sql, /coalesce\(nullif\(v_item->>'exerciseKey',''\),v_planned_key\)/i);
});
