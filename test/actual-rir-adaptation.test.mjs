import test from "node:test";
import assert from "node:assert/strict";
import {
  adaptationEffortObservation,
  normalizeSetResultEffortForAdaptation,
  normalizeSetResultEffortRows,
} from "../lib/adaptation-effort.mjs";
import { classifyResultExposure } from "../lib/adaptation-plan.mjs";

function topRangeRow(overrides = {}) {
  return {
    session_id:"ws_rir",
    exercise_key:"push_up",
    exercise_name:"Push-Up",
    set_index:1,
    prescribed_set_count:1,
    metric_type:"reps",
    target_min_reps:8,
    target_max_reps:10,
    target_reps:null,
    target_rir:2,
    reps:10,
    weight_kg:null,
    target_weight_kg:null,
    is_warmup:false,
    completed_at:"2026-08-23T18:00:00Z",
    ...overrides,
  };
}

test("direct actual RIR is authoritative when RIR and RPE disagree", () => {
  const effort = adaptationEffortObservation({ rir:0, rpe:7 });
  assert.deepEqual(effort, {
    source:"rir",
    actualRir:0,
    compatibilityRpe:10,
    reportedRir:0,
    reportedRpe:7,
  });

  const normalized = normalizeSetResultEffortForAdaptation(topRangeRow({ rir:0, rpe:7 }));
  assert.equal(normalized.rpe, 10);
  assert.equal(normalized.reported_rpe, 7);
  assert.equal(normalized.adaptation_effort_source, "rir");
  assert.equal(normalized.adaptation_effort_rir, 0);

  const exposure = classifyResultExposure([normalized]);
  assert.equal(exposure.state, "on_target");
  assert.equal(exposure.effortTooHigh, true);
  assert.equal(exposure.effortMatchedTarget, false);
});

test("direct RIR can prevent a conflicting high reported RPE from blocking progression", () => {
  const [normalized] = normalizeSetResultEffortRows([topRangeRow({ rir:2, rpe:10 })]);
  assert.equal(normalized.rpe, 8);
  assert.equal(normalized.reported_rpe, 10);
  assert.equal(normalized.adaptation_effort_source, "rir");
  const exposure = classifyResultExposure([normalized]);
  assert.equal(exposure.state, "overperformed");
  assert.equal(exposure.effortMatchedTarget, true);
  assert.equal(exposure.effortTooHigh, false);
});

test("RPE remains a compatibility fallback when actual RIR was not reported", () => {
  const effort = adaptationEffortObservation({ rir:null, rpe:9.5 });
  assert.equal(effort.source, "rpe");
  assert.equal(effort.actualRir, 0.5);
  assert.equal(effort.compatibilityRpe, 9.5);

  const exposure = classifyResultExposure([normalizeSetResultEffortForAdaptation(topRangeRow({ rir:null, rpe:9.5 }))]);
  assert.equal(exposure.state, "on_target");
  assert.equal(exposure.effortTooHigh, true);
});

test("missing Garmin effort data stays unknown and is never invented", () => {
  const normalized = normalizeSetResultEffortForAdaptation(topRangeRow({ rir:null, rpe:null, source:"garmin" }));
  assert.equal(normalized.rir, null);
  assert.equal(normalized.rpe, null);
  assert.equal(normalized.adaptation_effort_source, null);
  assert.equal(normalized.adaptation_effort_rir, null);
  const exposure = classifyResultExposure([normalized]);
  assert.equal(exposure.state, "top_range_completed");
  assert.equal(exposure.effortObserved, false);
});
