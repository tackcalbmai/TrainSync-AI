import test from "node:test";
import assert from "node:assert/strict";
import { buildPostSessionAdaptationPlan } from "../lib/adaptation-plan.mjs";

function pushupExercise() {
  return {
    exerciseKey:"push_up",
    name:"Push-Up",
    role:"hypertrophy_compound",
    progressionMode:"variant_progression",
    setMetric:"reps",
    sets:[
      { metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:90 },
      { metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:90 },
    ],
  };
}

function overperformed(sessionId, date) {
  return [1,2].map((setIndex) => ({
    session_id:sessionId,
    exercise_key:"push_up",
    set_index:setIndex,
    metric_type:"reps",
    target_min_reps:8,
    target_max_reps:10,
    target_rir:null,
    reps:11,
    weight_kg:null,
    rpe:null,
    is_warmup:false,
    completed_at:date,
  }));
}

function context() {
  const completedProgramSession = { id:"ps2", program_id:"p1", scheduled_date:"2026-09-02", payload:{ exercises:[pushupExercise()] } };
  const completedWorkoutSession = { id:"ws2", program_session_id:"ps2", status:"completed" };
  const setResults = [
    ...overperformed("ws2", "2026-09-02T18:00:00Z"),
    ...overperformed("ws1", "2026-08-31T18:00:00Z"),
  ];
  const futureProgramSessions = [{ id:"ps3", program_id:"p1", scheduled_date:"2026-09-04", status:"planned", revision:1, payload:{ exercises:[pushupExercise()] } }];
  return { completedProgramSession, completedWorkoutSession, setResults, futureProgramSessions };
}

test("variant adaptation does not invent equipment that is absent from the athlete profile", () => {
  const plan = buildPostSessionAdaptationPlan({ ...context(), allowedEquipment:[] });
  assert.equal(plan.valid, true);
  assert.equal(plan.proposals.length, 0);
});

test("confirmed bench equipment allows the registered push-up progression", () => {
  const plan = buildPostSessionAdaptationPlan({ ...context(), allowedEquipment:["bench"] });
  assert.equal(plan.valid, true);
  assert.equal(plan.proposals.length, 1);
  assert.equal(plan.proposals[0].applied, true);
  assert.equal(plan.proposals[0].decision.action, "progress_variant");
  assert.equal(plan.proposals[0].newPayload.exercises[0].exerciseKey, "decline_push_up");
  assert.deepEqual(plan.proposals[0].audit.metrics_snapshot.allowedEquipment, ["bench"]);
  assert.equal(plan.proposals[0].audit.metrics_snapshot.variantTransition.nextExerciseKey, "decline_push_up");
});
