import test from "node:test";
import assert from "node:assert/strict";
import { classifyResultExposure } from "../lib/adaptation-plan.mjs";

function row(setIndex, reps = 10) {
  return {
    session_id:"ws1",
    exercise_key:"push_up",
    set_index:setIndex,
    prescribed_set_count:3,
    metric_type:"reps",
    target_min_reps:8,
    target_max_reps:10,
    target_reps:null,
    target_weight_kg:null,
    target_rir:2,
    reps,
    weight_kg:null,
    rpe:null,
    is_warmup:false,
    completed_at:"2026-08-23T18:00:00Z",
  };
}

test("incomplete prescribed work cannot become a progression signal", () => {
  const performance = classifyResultExposure([row(1), row(2)]);
  assert.equal(performance.state, "underperformed");
  assert.equal(performance.prescribedSetCount, 3);
  assert.equal(performance.completedSetCount, 2);
  assert.match(performance.reasons.join(" "), /2 of 3 prescribed working sets/i);
});

test("complete prescribed set count preserves normal top-range classification", () => {
  const performance = classifyResultExposure([row(1), row(2), row(3)]);
  assert.equal(performance.state, "top_range_completed");
  assert.equal(performance.prescribedSetCount, 3);
  assert.equal(performance.completedSetCount, 3);
});
