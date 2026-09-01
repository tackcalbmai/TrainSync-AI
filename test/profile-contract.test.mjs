import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeSessionMinutes, normalizeTimezone } from "../lib/timezone.mjs";

test("profile session length matches the 15-180 minute database contract", async () => {
  assert.equal(normalizeSessionMinutes("15"), 15);
  assert.equal(normalizeSessionMinutes(180), 180);
  assert.throws(() => normalizeSessionMinutes(14), /15 to 180/);
  assert.throws(() => normalizeSessionMinutes(45.5), /whole number/);

  const migration = await readFile(new URL("../supabase/migrations/20260901123000_align_profile_time_and_timezone.sql", import.meta.url), "utf8");
  assert.match(migration, /between 15 and 180/i);
});

test("profile timezone accepts IANA names and rejects arbitrary text", () => {
  assert.equal(normalizeTimezone("Europe/Riga"), "Europe/Riga");
  assert.equal(normalizeTimezone("", "UTC"), "UTC");
  assert.throws(() => normalizeTimezone("Riga gym time"), /valid timezone/i);
});

test("database validates timezone at both profile and workout write boundaries", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260901123000_align_profile_time_and_timezone.sql", import.meta.url), "utf8");
  assert.match(migration, /athlete_profiles_valid_timezone/);
  assert.match(migration, /workouts_valid_timezone/);
  assert.match(migration, /pg_timezone_names/);
});
