import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_RATE_LIMIT_POLICIES,
  consumeApiRateLimit,
  enforceAiRateLimits,
  retryAfterSeconds,
} from "../lib/api-rate-limit.mjs";

function response(body, { ok = true, status = 200 } = {}) {
  return { ok, status, async text() { return JSON.stringify(body); } };
}

test("AI generation policies protect both hourly and daily spend", () => {
  assert.deepEqual(AI_RATE_LIMIT_POLICIES.workout_generation.map((x) => [x.limit, x.windowSeconds]), [[20,3600],[60,86400]]);
  assert.deepEqual(AI_RATE_LIMIT_POLICIES.program_generation.map((x) => [x.limit, x.windowSeconds]), [[6,3600],[20,86400]]);
});

test("rate limit RPC is called with authenticated user token and exact bucket rule", async () => {
  let captured = null;
  const result = await consumeApiRateLimit({
    token:"jwt-test",
    endpoint:"ai_workout_hour",
    limit:20,
    windowSeconds:3600,
    fetchImpl:async (url, options) => {
      captured = { url, options };
      return response([{ allowed:true, remaining:19, reset_at:"2026-08-31T19:00:00.000Z", request_count:1 }]);
    },
  });
  assert.match(captured.url, /rpc\/consume_api_rate_limit$/);
  assert.equal(captured.options.headers.Authorization, "Bearer jwt-test");
  assert.deepEqual(JSON.parse(captured.options.body), { p_endpoint:"ai_workout_hour", p_limit:20, p_window_seconds:3600 });
  assert.deepEqual(result, { allowed:true, remaining:19, resetAt:"2026-08-31T19:00:00.000Z", requestCount:1 });
});

test("enforcement stops immediately when a bucket is exhausted", async () => {
  const calls = [];
  const result = await enforceAiRateLimits({
    token:"jwt-test",
    policy:"program_generation",
    fetchImpl:async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body.p_endpoint);
      return response([{ allowed:false, remaining:0, reset_at:"2026-08-31T20:00:00.000Z", request_count:7 }]);
    },
  });
  assert.equal(result.allowed, false);
  assert.equal(result.endpoint, "ai_program_hour");
  assert.equal(calls.length, 1);
});

test("enforcement requires every configured bucket to allow the request", async () => {
  const replies = [
    [{ allowed:true, remaining:4, reset_at:"2026-08-31T20:00:00.000Z", request_count:2 }],
    [{ allowed:true, remaining:18, reset_at:"2026-09-01T00:00:00.000Z", request_count:2 }],
  ];
  let index = 0;
  const result = await enforceAiRateLimits({ token:"jwt-test", policy:"program_generation", fetchImpl:async () => response(replies[index++]) });
  assert.deepEqual(result, { allowed:true });
  assert.equal(index, 2);
});

test("limiter infrastructure failure is explicit rather than silently spending AI tokens", async () => {
  await assert.rejects(
    consumeApiRateLimit({ token:"jwt-test", endpoint:"ai_workout_hour", limit:20, windowSeconds:3600, fetchImpl:async () => response({ message:"db unavailable" }, { ok:false, status:503 }) }),
    (error) => error.code === "RATE_LIMIT_CHECK_FAILED" && error.status === 503,
  );
});

test("retry-after is deterministic from the server reset timestamp", () => {
  assert.equal(retryAfterSeconds("2026-08-31T19:00:00.000Z", "2026-08-31T18:59:10.000Z"), 50);
});
