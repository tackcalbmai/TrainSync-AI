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
    target_rir:null,
    reps:actualReps,
    weight_kg:actualWeight,
    rpe:null,
    is_warmup:false,
    completed_at:date,
  }));
}

function highEffortMissRows(sessionId, date, exerciseKey = "push_up") {
  return resultRows(sessionId, date, exerciseKey, 6).map((row) => ({ ...row, target_rir:2, rpe:10 }));
}

function pushupExercise() {
  return {
    exerciseKey:"push_up",
    name:"Push-Up",
    role:"hypertrophy_compound",
    progressionMode:"variant_progression",
    setMetric:"reps",
    sets:[
      { metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:90, weightKg:null },
      { metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:90, weightKg:null },
      { metricType:"reps", minReps:8, maxReps:10, targetRir:2, restSec:90, weightKg:null },
    ],
  };
}

function pullupExercise() {
  return {
    exerciseKey:"pull_up",
    name:"Pull-Up",
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
  const current = { id:"ps2", program_id:"p1", scheduled_date:"2026-09-02", payload:{ exercises:[pullupExercise()] } };
  const workout = { id:"ws2", program_session_id:"ps2", status:"completed" };
  const history = [
    ...resultRows("ws2", "2026-09-02T18:00:00Z", "pull_up"),
    ...resultRows("ws1", "2026-08-31T18:00:00Z", "pull_up"),
  ];
  const future = [{ id:"ps3", program_id:"p1", scheduled_date:"2026-09-04", status:"planned", revision:1, payload:{ exercises:[pullupExercise()] } }];
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
  assert.equal(plan.requirements.length, 0);
});

test("using less than prescribed resistance prevents false overperformance", () => {
  const performance = classifyResultExposure(resultRows("ws1", "2026-08-31T18:00:00Z", "row", 12, 20, 16));
  assert.equal(performance.state, "underperformed");
});

test("target misses at very high reported effort are labeled as observation, not fatigue diagnosis", () => {
  const performance = classifyResultExposure(highEffortMissRows("ws1", "2026-08-31T18:00:00Z"));
  assert.equal(performance.state, "high_effort_underperformance");
  assert.match(performance.reasons.join(" "), /missed at very high effort/i);
});

test("top range with matched prescribed effort becomes a stronger progression signal", () => {
  const rows = resultRows("ws1", "2026-08-31T18:00:00Z", "push_up", 10).map((row) => ({ ...row, target_rir:2, rpe:8.5 }));
  const performance = classifyResultExposure(rows);
  assert.equal(performance.state, "overperformed");
  assert.equal(performance.effortMatchedTarget, true);
  assert.equal(performance.effortComparedSets, 3);
  assert.ok(performance.confidence >= 0.8);
});

test("top range reached materially harder than prescribed does not trigger progression", () => {
  const rows = resultRows("ws1", "2026-08-31T18:00:00Z", "push_up", 10).map((row) => ({ ...row, target_rir:2, rpe:10 }));
  const performance = classifyResultExposure(rows);
  assert.equal(performance.state, "on_target");
  assert.equal(performance.effortMatchedTarget, false);
  assert.match(performance.reasons.join(" "), /higher than the prescribed RIR/i);
});

test("Garmin-like top range without reported effort stays lower confidence", () => {
  const rows = resultRows("ws1", "2026-08-31T18:00:00Z", "push_up", 10).map((row) => ({ ...row, target_rir:2, rpe:null }));
  const performance = classifyResultExposure(rows);
  assert.equal(performance.state, "top_range_completed");
  assert.equal(performance.effortMatchedTarget, false);
  assert.ok(performance.confidence <= 0.62);
});

test("two consecutive high-effort underperformance observations reduce only the next exercise volume by one working set", () => {
  const current = { id:"ps2", program_id:"p1", scheduled_date:"2026-09-02", payload:{ exercises:[pushupExercise()] } };
  const workout = { id:"ws2", program_session_id:"ps2", status:"completed" };
  const history = [
    ...highEffortMissRows("ws2", "2026-09-02T18:00:00Z"),
    ...highEffortMissRows("ws1", "2026-08-31T18:00:00Z"),
  ];
  const future = [{ id:"ps3", program_id:"p1", scheduled_date:"2026-09-04", status:"planned", revision:3, payload:{ exercises:[pushupExercise()] } }];
  const plan = buildPostSessionAdaptationPlan({ completedProgramSession:current, completedWorkoutSession:workout, setResults:history, futureProgramSessions:future });
  assert.equal(plan.valid, true);
  assert.equal(plan.proposals.length, 1);
  assert.equal(plan.proposals[0].decision.action, "reduce_or_review");
  assert.equal(plan.proposals[0].decision.reasonCode, "REPEATED_HIGH_EFFORT_UNDERPERFORMANCE");
  assert.equal(plan.proposals[0].applied, true);
  assert.equal(plan.proposals[0].mutation.reasonCode, "WORKING_SET_REMOVED_AFTER_REPEATED_HIGH_EFFORT_UNDERPERFORMANCE");
  assert.equal(plan.proposals[0].newPayload.exercises[0].sets.length, 2);
  assert.equal(plan.proposals[0].expectedRevision, 3);
  assert.ok(plan.proposals[0].audit.evidence_rule_keys.includes("reduceAfterRepeatedHighEffortUnderperformance"));
  assert.equal(plan.proposals[0].audit.metrics_snapshot.mutation.removedWorkingSets, 1);
  assert.equal(plan.proposals[0].audit.metrics_snapshot.recentPerformance[0].state, "high_effort_underperformance");
});

test("high-effort underperformance at the two-set floor becomes an explicit review requirement", () => {
  const current = { id:"ps2", program_id:"p1", scheduled_date:"2026-09-02", payload:{ exercises:[pushupExercise()] } };
  const workout = { id:"ws2", program_session_id:"ps2", status:"completed" };
  const history = [
    ...highEffortMissRows("ws2", "2026-09-02T18:00:00Z"),
    ...highEffortMissRows("ws1", "2026-08-31T18:00:00Z"),
  ];
  const nextExercise = pushupExercise();
  nextExercise.sets = nextExercise.sets.slice(0, 2);
  const future = [{ id:"ps3", program_id:"p1", scheduled_date:"2026-09-04", status:"planned", revision:4, payload:{ exercises:[nextExercise] } }];
  const plan = buildPostSessionAdaptationPlan({ completedProgramSession:current, completedWorkoutSession:workout, setResults:history, futureProgramSessions:future });
  assert.equal(plan.proposals.length, 1);
  assert.equal(plan.proposals[0].applied, false);
  assert.equal(plan.proposals[0].mutation.reasonCode, "MINIMUM_WORKING_SETS_REACHED");
  assert.equal(plan.requirements.length, 1);
  assert.equal(plan.requirements[0].type, "review");
  assert.equal(plan.requirements[0].reasonCode, "MINIMUM_WORKING_SETS_REACHED");
  assert.equal(plan.requirements[0].minimumWorkingSets, 2);
  assert.match(plan.requirements[0].message, /below two working sets/i);
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
  assert.equal(plan.requirements.length, 0);
});

test("pure load progression surfaces one precise requirement when no next load is known", () => {
  const bench = () => ({
    exerciseKey:"barbell_bench_press", name:"Barbell Bench Press", role:"primary_strength", progressionMode:"load_progression", setMetric:"reps",
    sets:[{ metricType:"reps", minReps:5, maxReps:6, targetRir:2, restSec:180, weightKg:50 }],
  });
  const current = { id:"ps2", program_id:"p1", scheduled_date:"2026-09-02", payload:{ exercises:[bench()] } };
  const workout = { id:"ws2", program_session_id:"ps2", status:"completed" };
  const rows = [
    ...resultRows("ws2", "2026-09-02T18:00:00Z", "barbell_bench_press", 7, 50, 50).slice(0,1).map((row) => ({ ...row, target_min_reps:5, target_max_reps:6 })),
    ...resultRows("ws1", "2026-08-31T18:00:00Z", "barbell_bench_press", 7, 50, 50).slice(0,1).map((row) => ({ ...row, target_min_reps:5, target_max_reps:6 })),
  ];
  const future = [{ id:"ps3", program_id:"p1", scheduled_date:"2026-09-04", status:"planned", revision:1, payload:{ exercises:[bench()] } }];
  const plan = buildPostSessionAdaptationPlan({ completedProgramSession:current, completedWorkoutSession:workout, setResults:rows, futureProgramSessions:future });
  assert.equal(plan.proposals.length, 1);
  assert.equal(plan.proposals[0].applied, false);
  assert.equal(plan.requirements.length, 1);
  assert.equal(plan.requirements[0].type, "load_options");
  assert.equal(plan.requirements[0].exerciseKey, "barbell_bench_press");
  assert.equal(plan.requirements[0].reasonCode, "NO_HIGHER_LOAD_AVAILABLE");
});
