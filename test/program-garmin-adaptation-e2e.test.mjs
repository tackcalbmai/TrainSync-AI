import test from "node:test";
import assert from "node:assert/strict";
import { programSessionToWorkout, actualSetPayloadFromWorkout } from "../lib/program-session-workout.mjs";
import { validateWorkout } from "../lib/workout.mjs";
import { garminFitProjectionReadiness } from "../lib/garmin-workout-projection.mjs";
import { encodeAndInspectGarminFitWorkout, GarminFitEncoderError, encodeGarminFitWorkout } from "../lib/garmin-fit-encoder.mjs";
import { buildPostSessionAdaptationPlan, classifyResultExposure } from "../lib/adaptation-plan.mjs";

function program() {
  return {
    id:"program_e2e",
    goal:"strength",
    default_session_minutes:35,
    progression_strategy:"autoregulated",
  };
}

function pullupExercise({ minReps = 8, maxReps = 8, targetReps = 8 } = {}) {
  return {
    exerciseKey:"pull_up",
    name:"Pull-Up",
    role:"hypertrophy_compound",
    progressionMode:"reps_only",
    setMetric:"reps",
    sets:[1,2,3].map((index) => ({
      index,
      metricType:"reps",
      minReps,
      maxReps,
      targetReps,
      targetRir:2,
      weightKg:null,
      restSec:90,
    })),
  };
}

function programSession(id, date, revision = 1, exercise = pullupExercise()) {
  return {
    id,
    user_id:"user_e2e",
    program_id:"program_e2e",
    week_index:1,
    day_index:1,
    slot_index:1,
    revision,
    scheduled_date:date,
    title:"Pull Session",
    status:"planned",
    payload:{ estimatedDurationMinutes:30, focus:"Controlled vertical pulling", exercises:[exercise] },
  };
}

function actualSetsFromWorkout(workout, reps = 8, rpe = 8) {
  return workout.exercises[0].sets.map((set, index) => ({
    exerciseKey:workout.exercises[0].exerciseKey,
    exerciseName:workout.exercises[0].name,
    exerciseOrder:1,
    setIndex:index + 1,
    reps,
    durationSeconds:null,
    weightKg:null,
    rpe,
  }));
}

function simulatedDbRows(workout, sessionId, completedAt, reps = 8, rpe = 8) {
  const exercise = workout.exercises[0];
  return exercise.sets.map((set, index) => ({
    session_id:sessionId,
    exercise_name:exercise.name,
    exercise_key:exercise.exerciseKey,
    set_index:index + 1,
    prescribed_set_count:exercise.sets.length,
    metric_type:"reps",
    target_reps:set.targetReps,
    target_min_reps:set.minReps,
    target_max_reps:set.maxReps,
    target_weight_kg:set.weightKg,
    target_rir:set.targetRir,
    reps,
    weight_kg:null,
    rpe,
    is_warmup:false,
    completed_at:completedAt,
  }));
}

test("PROGRAM -> TRAIN -> FIT -> completed sets preserves canonical execution contract", () => {
  const sourceSession = programSession("ps_e2e_2", "2026-08-25", 4);
  const workout = programSessionToWorkout({ program:program(), programSession:sourceSession, timezone:"Europe/Riga" });

  const validation = validateWorkout(workout);
  assert.equal(validation.valid, true);
  assert.equal(workout.programSessionId, sourceSession.id);
  assert.equal(workout.revision, 4);
  assert.equal(workout.exercises[0].exerciseKey, "pull_up");
  assert.equal(workout.exercises[0].sets[0].targetRir, 2);
  assert.equal(workout.exercises[0].sets[0].minReps, 8);
  assert.equal(workout.exercises[0].sets[0].maxReps, 8);

  const readiness = garminFitProjectionReadiness(workout);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.reasonCode, "GARMIN_EXACT_TARGET_READY");

  const encoded = encodeAndInspectGarminFitWorkout(workout, { timeCreated:"2026-08-23T18:00:00Z", serialNumber:424242 });
  assert.equal(encoded.inspection.integrity, true);
  assert.equal(encoded.inspection.messages.workoutMesgs[0].sport, 10);
  assert.equal(encoded.inspection.messages.workoutMesgs[0].subSport, 20);
  assert.equal(encoded.inspection.messages.workoutStepMesgs.length, 5);
  assert.equal(encoded.inspection.messages.workoutStepMesgs[0].exerciseCategory, 21);
  assert.equal(encoded.inspection.messages.workoutStepMesgs[0].exerciseName, 38);

  const actual = actualSetPayloadFromWorkout(workout, actualSetsFromWorkout(workout));
  assert.equal(actual.length, 3);
  assert.deepEqual(actual.map((set) => set.exerciseKey), ["pull_up","pull_up","pull_up"]);
  assert.deepEqual(actual.map((set) => set.exerciseOrder), [1,1,1]);
  assert.deepEqual(actual.map((set) => set.setIndex), [1,2,3]);
  assert.deepEqual(actual.map((set) => set.rpe), [8,8,8]);
});

test("two matched-effort completed exposures adapt the next prescription without losing Garmin compatibility", () => {
  const firstProgramSession = programSession("ps_e2e_1", "2026-08-24", 1);
  const secondProgramSession = programSession("ps_e2e_2", "2026-08-26", 2);
  const firstWorkout = programSessionToWorkout({ program:program(), programSession:firstProgramSession, timezone:"Europe/Riga" });
  const secondWorkout = programSessionToWorkout({ program:program(), programSession:secondProgramSession, timezone:"Europe/Riga" });
  const history = [
    ...simulatedDbRows(secondWorkout, "ws_e2e_2", "2026-08-26T18:00:00Z"),
    ...simulatedDbRows(firstWorkout, "ws_e2e_1", "2026-08-24T18:00:00Z"),
  ];

  const exposure = classifyResultExposure(history.filter((row) => row.session_id === "ws_e2e_2"));
  assert.equal(exposure.state, "overperformed");
  assert.equal(exposure.effortMatchedTarget, true);

  const future = programSession("ps_e2e_3", "2026-08-28", 7);
  const plan = buildPostSessionAdaptationPlan({
    completedProgramSession:{ ...secondProgramSession, status:"completed" },
    completedWorkoutSession:{ id:"ws_e2e_2", program_session_id:"ps_e2e_2", status:"completed" },
    setResults:history,
    futureProgramSessions:[future],
    allowedEquipment:["pull_up_bar"],
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.proposals.length, 1);
  const proposal = plan.proposals[0];
  assert.equal(proposal.applied, true);
  assert.equal(proposal.decision.action, "progress_reps");
  assert.equal(proposal.expectedRevision, 7);
  assert.equal(proposal.exerciseKey, "pull_up");
  assert.equal(proposal.newPayload.exercises[0].exerciseKey, "pull_up");
  assert.equal(proposal.newPayload.exercises[0].sets[0].targetRir, 2);
  assert.equal(proposal.newPayload.exercises[0].sets[0].minReps, 9);
  assert.equal(proposal.newPayload.exercises[0].sets[0].maxReps, 9);
  assert.ok(proposal.audit.science_version);
  assert.ok(Array.isArray(proposal.audit.evidence_rule_keys));
  assert.ok(proposal.audit.evidence_rule_keys.length > 0);

  const adaptedSession = { ...future, payload:proposal.newPayload };
  const adaptedWorkout = programSessionToWorkout({ program:program(), programSession:adaptedSession, timezone:"Europe/Riga" });
  const readiness = garminFitProjectionReadiness(adaptedWorkout);
  assert.equal(readiness.ready, true);
  const encoded = encodeAndInspectGarminFitWorkout(adaptedWorkout, { timeCreated:"2026-08-23T18:00:00Z" });
  assert.equal(encoded.inspection.integrity, true);
  assert.equal(encoded.inspection.messages.workoutStepMesgs[0].durationReps ?? encoded.inspection.messages.workoutStepMesgs[0].durationValue, 9);
});

test("ordinary TrainSync rep-range program stays valid but is explicitly not FIT-ready", () => {
  const ranged = pullupExercise({ minReps:8, maxReps:10, targetReps:null });
  const session = programSession("ps_range", "2026-08-24", 1, ranged);
  const workout = programSessionToWorkout({ program:program(), programSession:session, timezone:"Europe/Riga" });
  assert.equal(validateWorkout(workout).valid, true);

  const readiness = garminFitProjectionReadiness(workout);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.publishReady, false);
  assert.equal(readiness.reasonCode, "GARMIN_RANGE_DEVICE_VERIFICATION_REQUIRED");
  assert.equal(readiness.rangePreviewAvailable, true);
  assert.equal(readiness.deviceVerificationRequired, true);
  assert.throws(() => encodeGarminFitWorkout(workout), (error) => {
    assert.ok(error instanceof GarminFitEncoderError);
    assert.equal(error.code, "GARMIN_RANGE_DEVICE_VERIFICATION_REQUIRED");
    return true;
  });
});
