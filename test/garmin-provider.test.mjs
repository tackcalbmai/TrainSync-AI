import test from "node:test";
import assert from "node:assert/strict";
import {
  GARMIN_PROVIDER_CONTRACT_VERSION,
  GarminProviderError,
  createGarminProvider,
  garminProviderStatus,
  publishWorkoutWithGarminProvider,
  resolveGarminProviderMode,
} from "../lib/garmin-provider.mjs";

function workout({ exerciseKey = "push_up", minReps = 8, maxReps = 8, targetReps = 8 } = {}) {
  return {
    id:"wrk_provider_test",
    revision:2,
    title:"Provider Test",
    sport:"strength",
    scheduledDate:"2026-08-24",
    estimatedDurationMinutes:25,
    totalSets:1,
    status:"draft",
    exercises:[{
      exerciseKey,
      name:exerciseKey === "push_up" ? "Push-Up" : "Hollow Body Hold",
      sets: exerciseKey === "hollow_body_hold"
        ? [{ metricType:"duration_seconds", minDurationSeconds:20, maxDurationSeconds:20, targetDurationSeconds:20, restSec:45 }]
        : [{ metricType:"reps", minReps, maxReps, targetReps:minReps === maxReps ? targetReps : null, restSec:90, targetRir:2 }],
    }],
  };
}

test("provider mode defaults to mock and rejects unknown configuration", () => {
  assert.equal(resolveGarminProviderMode(), "mock");
  assert.equal(resolveGarminProviderMode("OFFICIAL"), "official");
  assert.throws(() => resolveGarminProviderMode("auto"), (error) => {
    assert.ok(error instanceof GarminProviderError);
    assert.equal(error.code, "GARMIN_PROVIDER_MODE_INVALID");
    assert.equal(error.status, 500);
    return true;
  });
});

test("mock provider remains explicit and never claims a real Garmin write", async () => {
  const provider = createGarminProvider({ mode:"mock" });
  const status = await provider.getConnectionStatus();
  assert.equal(status.mode, "mock");
  assert.equal(status.contractVersion, GARMIN_PROVIDER_CONTRACT_VERSION);
  assert.match(status.message, /No external Garmin account is modified/i);

  const result = await provider.publishWorkout(workout());
  assert.equal(result.success, true);
  assert.equal(result.mode, "mock");
  assert.equal(result.providerContractVersion, GARMIN_PROVIDER_CONTRACT_VERSION);
  assert.match(result.providerResourceId, /^gmn_mock_/);
});

test("official provider reports disconnected when no authenticated transport exists", async () => {
  const status = await garminProviderStatus({ mode:"official" });
  assert.equal(status.mode, "official");
  assert.equal(status.connected, false);
  assert.equal(status.authorizationValid, false);
  assert.equal(status.transportConfigured, false);
  assert.equal(status.state, "waiting_for_garmin_training_api_transport");
});

test("official provider never falls back to mock when transport is missing", async () => {
  await assert.rejects(
    () => publishWorkoutWithGarminProvider(workout(), { mode:"official", userContext:{ userId:"usr_test" } }),
    (error) => {
      assert.ok(error instanceof GarminProviderError);
      assert.equal(error.code, "GARMIN_OFFICIAL_PROVIDER_NOT_CONFIGURED");
      assert.equal(error.status, 503);
      return true;
    },
  );
});

test("official provider blocks unresolved rep-range policy before calling transport", async () => {
  let calls = 0;
  const transport = {
    async publishWorkout() { calls += 1; return { providerResourceId:"should_not_happen" }; },
  };
  await assert.rejects(
    () => publishWorkoutWithGarminProvider(workout({ minReps:8, maxReps:10 }), {
      mode:"official",
      officialTransport:transport,
      userContext:{ userId:"usr_test" },
    }),
    (error) => {
      assert.equal(error.code, "GARMIN_TARGET_RANGE_POLICY_REQUIRED");
      assert.equal(error.status, 409);
      return true;
    },
  );
  assert.equal(calls, 0);
});

test("official provider blocks canonical-but-unmapped exercise before transport", async () => {
  let calls = 0;
  const transport = {
    async publishWorkout() { calls += 1; return { providerResourceId:"should_not_happen" }; },
  };
  await assert.rejects(
    () => publishWorkoutWithGarminProvider(workout({ exerciseKey:"hollow_body_hold" }), {
      mode:"official",
      officialTransport:transport,
      userContext:{ userId:"usr_test" },
    }),
    (error) => {
      assert.equal(error.code, "GARMIN_EXERCISE_MAPPING_REQUIRED");
      return true;
    },
  );
  assert.equal(calls, 0);
});

test("injected official transport receives deterministic projection and idempotency context", async () => {
  let received = null;
  const transport = {
    async getConnectionStatus({ userContext }) {
      return {
        connected:userContext?.userId === "usr_test",
        authorizationValid:true,
        state:"connected",
        message:"Test transport connected.",
      };
    },
    async publishWorkout(payload) {
      received = payload;
      return {
        providerResourceId:"garmin_remote_123",
        status:"published",
        publishedAt:"2026-08-23T18:30:00.000Z",
        metadata:{ source:"test_transport" },
      };
    },
  };

  const status = await garminProviderStatus({ mode:"official", officialTransport:transport, userContext:{ userId:"usr_test" } });
  assert.equal(status.connected, true);
  assert.equal(status.transportConfigured, true);

  const result = await publishWorkoutWithGarminProvider(workout(), {
    mode:"official",
    officialTransport:transport,
    userContext:{ userId:"usr_test" },
  });

  assert.equal(result.success, true);
  assert.equal(result.mode, "official");
  assert.equal(result.providerResourceId, "garmin_remote_123");
  assert.equal(result.idempotencyKey, "wrk_provider_test:r2");
  assert.equal(result.providerContractVersion, GARMIN_PROVIDER_CONTRACT_VERSION);
  assert.equal(result.fitProjection.summary.workSetCount, 1);
  assert.equal(received.idempotencyKey, "wrk_provider_test:r2");
  assert.equal(received.userContext.userId, "usr_test");
  assert.equal(received.projection.workout.sport.name, "TRAINING");
  assert.equal(received.projection.workout.subSport.name, "STRENGTH_TRAINING");
  assert.equal(received.projection.steps[0].exerciseCategory.name, "PUSH_UP");
});

test("official transport response must include a provider resource id", async () => {
  const transport = { async publishWorkout() { return { status:"published" }; } };
  await assert.rejects(
    () => publishWorkoutWithGarminProvider(workout(), {
      mode:"official",
      officialTransport:transport,
      userContext:{ userId:"usr_test" },
    }),
    (error) => {
      assert.equal(error.code, "GARMIN_PROVIDER_RESPONSE_INVALID");
      assert.equal(error.status, 502);
      return true;
    },
  );
});
