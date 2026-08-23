import test from "node:test";
import assert from "node:assert/strict";
import { MIN_NEW_PASSWORD_LENGTH, validateNewPassword } from "../lib/password-policy.mjs";

test("new passwords shorter than the app minimum are rejected", () => {
  assert.equal(MIN_NEW_PASSWORD_LENGTH, 8);
  const result = validateNewPassword("1234567");
  assert.equal(result.valid, false);
  assert.equal(result.reasonCode, "PASSWORD_TOO_SHORT");
});

test("new passwords at or above the app minimum pass local policy", () => {
  assert.equal(validateNewPassword("12345678").valid, true);
  assert.equal(validateNewPassword("correct horse battery staple").valid, true);
});
