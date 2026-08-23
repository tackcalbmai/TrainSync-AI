import test from "node:test";
import assert from "node:assert/strict";
import { garminReadinessUiModel } from "../lib/garmin-readiness-ui.mjs";

test("exact Garmin readiness is shown as publish ready", () => {
  const model = garminReadinessUiModel({ ready:true, publishReady:true, reasonCode:"GARMIN_EXACT_TARGET_READY" });
  assert.equal(model.tone, "ready");
  assert.equal(model.garminLabel, "GARMIN TARGETS READY");
  assert.equal(model.publishReady, true);
});

test("range targets are clearly separated from workout validity", () => {
  const model = garminReadinessUiModel({
    ready:false,
    publishReady:false,
    reasonCode:"GARMIN_RANGE_DEVICE_VERIFICATION_REQUIRED",
    summary:{ rangeTargetSets:3 },
  }, { programSession:true });
  assert.equal(model.baseLabel, "PROGRAM SESSION READY");
  assert.equal(model.tone, "verification");
  assert.equal(model.garminLabel, "GARMIN RANGES · DEVICE TEST REQUIRED");
  assert.equal(model.publishReady, false);
  assert.match(model.explanation, /OPEN-step/);
});

test("missing reviewed Garmin mapping is not presented as device verification", () => {
  const model = garminReadinessUiModel({ ready:false, reasonCode:"GARMIN_EXERCISE_MAPPING_REQUIRED" });
  assert.equal(model.tone, "pending");
  assert.equal(model.garminLabel, "GARMIN MAPPING REQUIRED");
  assert.equal(model.publishReady, false);
});

test("missing canonical identity gets its own blocking status", () => {
  const model = garminReadinessUiModel({ ready:false, reasonCode:"CANONICAL_EXERCISE_REQUIRED" });
  assert.equal(model.garminLabel, "GARMIN IDENTITY REQUIRED");
  assert.match(model.explanation, /canonical TrainSync identity/);
});
