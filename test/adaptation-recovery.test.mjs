import test from "node:test";
import assert from "node:assert/strict";
import { buildPostSessionAdaptationPlan } from "../lib/adaptation-plan.mjs";

function exercise(setCount = 2) {
  return {
    exerciseKey:"pull_up",
    name:"Pull-Up",
    role:"hypertrophy_compound",
    progressionMode:"reps_only",
    setMetric:"reps",
    sets:Array.from({ length:setCount }, () => ({ metricType:"reps", minReps:6, maxReps:8, targetRir:2, restSec:120, weightKg:null })),
  };
}

function stableRows(sessionId, date, reps = 7) {
  return [1,2].map((setIndex) => ({
    session_id:sessionId,
    exercise_key:"pull_up",
    set_index:setIndex,
    metric_type:"reps",
    target_min_reps:6,
    target_max_reps:8,
    target_rir:2,
    reps,
    weight_kg:null,
    rpe:null,
    is_warmup:false,
    completed_at:date,
  }));
}

function reductionAudit() {
  return {
    id:"adj-reduce",
    target_key:"pull_up",
    adjustment_type:"reduce_or_review",
    reason_code:"REPEATED_FATIGUE_SIGNAL",
    before_state:exercise(3),
    after_state:exercise(2),
    created_at:"2026-09-01T12:00:00Z",
  };
}

test("two stable exposures restore one working set toward the recorded pre-reduction baseline", () => {
  const current = { id:"ps2", program_id:"p1", scheduled_date:"2026-09-05", payload:{ exercises:[exercise(2)] } };
  const workout = { id:"ws2", program_session_id:"ps2", status:"completed" };
  const history = [
    ...stableRows("ws2", "2026-09-05T18:00:00Z"),
    ...stableRows("ws1", "2026-09-03T18:00:00Z"),
  ];
  const future = [{ id:"ps3", program_id:"p1", scheduled_date:"2026-09-07", status:"planned", revision:5, payload:{ exercises:[exercise(2)] } }];
  const plan = buildPostSessionAdaptationPlan({
    completedProgramSession:current,
    completedWorkoutSession:workout,
    setResults:history,
    futureProgramSessions:future,
    adjustmentHistory:[reductionAudit()],
  });
  assert.equal(plan.proposals.length, 1);
  assert.equal(plan.proposals[0].applied, true);
  assert.equal(plan.proposals[0].decision.action, "restore_volume");
  assert.equal(plan.proposals[0].decision.reasonCode, "RECOVERED_AFTER_VOLUME_REDUCTION");
  assert.equal(plan.proposals[0].newPayload.exercises[0].sets.length, 3);
  assert.equal(plan.proposals[0].audit.metrics_snapshot.recoveryAdjustmentId, "adj-reduce");
});

test("one stable exposure is not enough to restore volume", () => {
  const current = { id:"ps1", program_id:"p1", scheduled_date:"2026-09-03", payload:{ exercises:[exercise(2)] } };
  const workout = { id:"ws1", program_session_id:"ps1", status:"completed" };
  const future = [{ id:"ps2", program_id:"p1", scheduled_date:"2026-09-05", status:"planned", revision:1, payload:{ exercises:[exercise(2)] } }];
  const plan = buildPostSessionAdaptationPlan({
    completedProgramSession:current,
    completedWorkoutSession:workout,
    setResults:stableRows("ws1", "2026-09-03T18:00:00Z"),
    futureProgramSessions:future,
    adjustmentHistory:[reductionAudit()],
  });
  assert.equal(plan.proposals.length, 0);
});

test("a later restoration audit closes the older temporary reduction", () => {
  const current = { id:"ps2", program_id:"p1", scheduled_date:"2026-09-05", payload:{ exercises:[exercise(2)] } };
  const workout = { id:"ws2", program_session_id:"ps2", status:"completed" };
  const history = [
    ...stableRows("ws2", "2026-09-05T18:00:00Z"),
    ...stableRows("ws1", "2026-09-03T18:00:00Z"),
  ];
  const future = [{ id:"ps3", program_id:"p1", scheduled_date:"2026-09-07", status:"planned", revision:2, payload:{ exercises:[exercise(2)] } }];
  const restored = {
    id:"adj-restore",
    target_key:"pull_up",
    adjustment_type:"restore_volume",
    reason_code:"RECOVERED_AFTER_VOLUME_REDUCTION",
    before_state:exercise(2),
    after_state:exercise(3),
    created_at:"2026-09-04T12:00:00Z",
  };
  const plan = buildPostSessionAdaptationPlan({
    completedProgramSession:current,
    completedWorkoutSession:workout,
    setResults:history,
    futureProgramSessions:future,
    adjustmentHistory:[restored, reductionAudit()],
  });
  assert.equal(plan.proposals.length, 0);
});
