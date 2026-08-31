import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_RATE_LIMIT_POLICIES,
  consumeAiGenerationLimit,
  enforceAiRateLimits,
  retryAfterSeconds,
} from "../lib/api-rate-limit.mjs";

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, async text() { return JSON.stringify(body); } };
}

test("AI generation policies protect both hourly and daily spend", () => {
  assert.deepEqual(AI_RATE_LIMIT_POLICIES.workout_generation, { hourLimit:20, dayLimit:60 });
  assert.deepEqual(AI_RATE_LIMIT_POLICIES.program_generation, { hourLimit:6, dayLimit:20 });
});

test("rate limit RPC receives only authenticated token and server-known policy", async () => {
  let captured = null;
  const result = await consumeAiGenerationLimit({
    token:"jwt-test",
    policy:"workout_generation",
    fetchImpl:async (url, options) => {
      captured = { url, options };
      return response([{ allowed:true, remaining:19, reset_at:"2026-08-31T20:00:00.000Z", hour_count:1, day_count:1 }]);
    },
  });
  assert.match(captured.url, /rpc\/consume_ai_generation_limit$/);
  assert.equal(captured.options.headers.Authorization, "Bearer jwt-test");
  assert.deepEqual(JSON.parse(captured.options.body), { p_policy:"workout_generation" });
  assert.deepEqual(result, { allowed:true, remaining:19, resetAt:"2026-08-31T20:00:00.000Z", hourCount:1, dayCount:1 });
});

test("client cannot choose custom limits or windows through the helper", async () => {
  let requestBody = null;
  await consumeAiGenerationLimit({
    token:"jwt-test",
    policy:"program_generation",
    limit:999999,
    windowSeconds:1,
    fetchImpl:async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return response([{ allowed:true, remaining:5, reset_at:"2026-08-31T20:00:00.000Z", hour_count:1, day_count:1 }]);
    },
  });
  assert.deepEqual(requestBody, { p_policy:"program_generation" });
  assert.equal("p_limit" in requestBody, false);
  assert.equal("p_window_seconds" in requestBody, false);
});

test("one atomic response can block on hourly or daily policy", async () => {
  let calls = 0;
  const result = await enforceAiRateLimits({
    token:"jwt-test",
    policy:"program_generation",
    fetchImpl:async () => {
      calls += 1;
      return response([{ allowed:false, remaining:0, reset_at:"2026-09-01T00:00:00.000Z", hour_count:7, day_count:12 }]);
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.allowed, false);
  assert.equal(result.policy, "program_generation");
  assert.equal(result.hourLimit, 6);
  assert.equal(result.dayLimit, 20);
  assert.equal(result.hourCount, 7);
  assert.equal(result.dayCount, 12);
});

test("allowed atomic response exposes remaining guardrail without another DB call", async () => {
  let calls = 0;
  const result = await enforceAiRateLimits({
    token:"jwt-test",
    policy:"program_generation",
    fetchImpl:async () => {
      calls += 1;
      return response([{ allowed:true, remaining:4, reset_at:"2026-08-31T20:00:00.000Z", hour_count:2, day_count:2 }]);
    },
  });
  assert.deepEqual(result, { allowed:true, remaining:4, hourCount:2, dayCount:2 });
  assert.equal(calls, 1);
});

test("unknown policies are rejected before any RPC call", async () => {
  let calls = 0;
  await assert.rejects(
    consumeAiGenerationLimit({ token:"jwt-test", policy:"custom_unlimited", fetchImpl:async () => { calls += 1; return response([]); } }),
    (error) => error.code === "RATE_LIMIT_POLICY_UNKNOWN",
  );
  assert.equal(calls, 0);
});

test("limiter infrastructure failure is explicit rather than silently spending AI tokens", async () => {
  await assert.rejects(
    consumeAiGenerationLimit({ token:"jwt-test", policy:"workout_generation", fetchImpl:async () => response({ message:"db unavailable" }, { ok:false, status:503 }) }),
    (error) => error.code === "RATE_LIMIT_CHECK_FAILED" && error.status === 503,
  );
});

test("retry-after is deterministic from the server reset timestamp", () => {
  assert.equal(retryAfterSeconds("2026-08-31T19:00:00.000Z", "2026-08-31T18:59:10.000Z"), 50);
});
