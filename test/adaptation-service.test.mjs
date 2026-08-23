import test from "node:test";
import assert from "node:assert/strict";
import { adaptationStatusForRequirements } from "../lib/adaptation-service.mjs";

test("load questions remain explicit input requirements", () => {
  assert.deepEqual(adaptationStatusForRequirements([{ type:"load_options" }]), {
    status:"needs_input",
    reasonCode:"ADAPTATION_INPUT_REQUIRED",
  });
});

test("safety boundaries surface as review requirements", () => {
  assert.deepEqual(adaptationStatusForRequirements([{ type:"review" }]), {
    status:"needs_review",
    reasonCode:"ADAPTATION_REVIEW_REQUIRED",
  });
});

test("load input takes precedence when mixed attention is pending", () => {
  assert.equal(adaptationStatusForRequirements([{ type:"review" }, { type:"load_options" }]).status, "needs_input");
});

test("no pending requirement remains a no-change state", () => {
  assert.deepEqual(adaptationStatusForRequirements([]), {
    status:"no_change",
    reasonCode:"NO_CONFIRMED_ADAPTATION",
  });
});
