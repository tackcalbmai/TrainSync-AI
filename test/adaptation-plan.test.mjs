import test from "node:test";
import assert from "node:assert/strict";
import { buildPostSessionAdaptationPlan, classifyResultExposure } from "../lib/adaptation-plan.mjs";

function resultRows(sessionId, date, exerciseKey = "push_up", actualReps = 11, targetWeight = null, actualWeight = null) {
  return [1,2,3].map((setIndex) => ({
    session_id:sessionId,
    exercise_key:exerciseKey,
    set_index:setIndex,
    metric_type:"reps",
    target_min_reps:8,
    target_max_reps:10,
    target_weight_kg:targetWeight,
    reps:actualReps,
    weight_kg:actualWeight,
    rpe:null,
    is_warmup:false,
    completed_at:date,
  }));
}

function pushupExercise() {
  return {
    exerciseKey:"push_up",
    name:"Push-Up",
    role:"hypertrophy_compound",
    progressionMode:"reps_only",
    setMetric:"reps",
    sets:[
      { metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:90, weightKg:null },
      { metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:90, weightKg:null },
      { metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:90, weightKg:null },
    ],
  };
}

test("two controlled exposures can produce a next-session reps proposal", () => {
  const current = { id:"ps2", program_id:"p1", scheduled_date:"2026-09-02", payload:{ exercises:[pushupExercise()] } };
  const workout = { id:"ws2", program_session_id:"ps2", status:"completed" };
  const history = [
    ...resultRows("ws2", "2026-09-02T18:00:00Z"),
    ...resultRows("ws1", "2026-08-31T18:00:00Z"),
  ];
  const future = [{ id:"ps3", program_id:"p1", scheduled_date:"2026-09-04", status:"planned", revision:1, payload:{ exercises:[pushupExercise()] } }];
  const plan = buildPostSessionAdaptationPlan({ completedProgramSession:current, completedWorkoutSession:workout, setResults:history, futureProgramSessions:future });
  assert.equal(plan.valid, true);
  assert.equal(plan.proposals.length, 1);
  assert.equal(plan.proposals[0].applied, true);
  assert.equal(plan.proposals[0].decision.action, "progress_reps");
  assert.equal(plan.proposals[0].newPayload.exercises[0].sets[0].minReps, 9);
  assert.equal(plan.proposals[0].newPayload.exercises[0].sets[0].maxReps, 11);
  assert.equal(plan.proposals[0].audit.metrics_snapshot.sourceWorkoutSessionId, "ws2");
});

test("one strong exposure does not rewrite the future program", () => {
  const current = { id:"ps1", program_id:"p1", scheduled_date:"2026-08-31", payload:{ exercises:[pushupExercise()] } };
  const workout = { id:"ws1", program_session_id:"ps1", status:"completed" };
  const future = [{ id:"ps2", program_id:"p1", scheduled_date:"2026-09-02", status:"planned", revision:1, payload:{ exercises:[pushupExercise()] } }];
  const plan = buildPostSessionAdaptationPlan({ completedProgramSession:current, completedWorkoutSession:workout, setResults:resultRows("ws1", "2026-08-31T18:00:00Z"), futureProgramSessions:future });
  assert.equal(plan.proposals.length, 0);
});

test("using less than prescribed resistance prevents false overperformance", () => {
  const performance = classifyResultExposure(resultRows("ws1", "2026-08-31T18:00:00Z", "row", 12, 20, 16));
  assert.equal(performance.state, "underperformed");
});

test("program-session provenance is mandatory for automatic adaptation", () => {
  const current = { id:"ps1", program_id:"p1", scheduled_date:"2026-08-31", payload:{ exercises:[pushupExercise()] } };
  const workout = { id:"ws1", program_session_id:null, status:"completed" };
  const plan = buildPostSessionAdaptationPlan({ completedProgramSession:current, completedWorkoutSession:workout, setResults:[], futureProgramSessions:[] });
  assert.equal(plan.valid, false);
  assert.equal(plan.reasonCode, "PROGRAM_SESSION_LINK_NOT_CONFIRMED");
});

test("known small equipment step can create a weight progression proposal", () => {
  const kb = () => ({
    exerciseKey:"kettlebell_floor_press", name:"Kettlebell Floor Press", role:"hypertrophy_compound", progressionMode:"double_progression", setMetric:"reps",
    sets:[{ metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:120, weightKg:null }],
  });
  const current = { id:"ps2", program_id:"p1", scheduled_date:"2026-09-02", payload:{ exercises:[kb()] } };
  const workout = { id:"ws2", program_session_id:"ps2", status:"completed" };
  const rows = [
    ...resultRows("ws2", "2026-09-02T18:00:00Z", "kettlebell_floor_press", 11, null, 20).slice(0,1),
    ...resultRows("ws1", "2026-08-31T18:00:00Z", "kettlebell_floor_press", 11, null, 20).slice(0,1),
  ];
  const future = [{ id:"ps3", program_id:"p1", scheduled_date:"2026-09-04", status:"planned", revision:2, payload:{ exercises:[kb()] } }];
  const plan = buildPostSessionAdaptationPlan({ completedProgramSession:current, completedWorkoutSession:workout, setResults:rows, futureProgramSessions:future, explicitAvailableLoadsByExercise:{ kettlebell_floor_press:[20,21,24] } });
  assert.equal(plan.proposals[0].applied, true);
  assert.equal(plan.proposals[0].decision.action, "progress_load");
  assert.equal(plan.proposals[0].newPayload.exercises[0].sets[0].weightKg, 21);
  assert.equal(plan.proposals[0].expectedRevision, 2);
});
