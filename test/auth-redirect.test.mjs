import test from "node:test";
import assert from "node:assert/strict";
import { cleanAuthFragmentUrl, parseSupabaseAuthFragment } from "../lib/auth-redirect.mjs";

test("parses Supabase implicit recovery session without exposing unrelated fields", () => {
  const result = parseSupabaseAuthFragment("#access_token=abc.def&refresh_token=refresh123&expires_in=3600&token_type=bearer&type=recovery");
  assert.deepEqual(result, {
    error:false,
    accessToken:"abc.def",
    refreshToken:"refresh123",
    tokenType:"bearer",
    expiresIn:3600,
    type:"recovery",
  });
});

test("parses auth link errors without treating them as sessions", () => {
  const result = parseSupabaseAuthFragment("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid");
  assert.equal(result.error, true);
  assert.equal(result.errorCode, "otp_expired");
  assert.equal(result.errorDescription, "Email link is invalid");
});

test("ignores normal URL fragments that do not carry an access token", () => {
  assert.equal(parseSupabaseAuthFragment("#workout"), null);
  assert.equal(parseSupabaseAuthFragment(""), null);
});

test("auth fragment cleanup preserves path and query but removes secrets", () => {
  assert.equal(cleanAuthFragmentUrl({ pathname:"/", search:"?from=email", hash:"#access_token=secret" }), "/?from=email");
  assert.equal(cleanAuthFragmentUrl({ pathname:"/reset-password", search:"" }), "/reset-password");
});
