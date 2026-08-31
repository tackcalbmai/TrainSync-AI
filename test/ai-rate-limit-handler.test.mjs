import test from "node:test";
import assert from "node:assert/strict";
import { withAiGenerationRateLimit } from "../lib/ai-rate-limit-handler.mjs";

function responseRecorder() {
  return {
    statusCode:null,
    headers:{},
    body:null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("anonymous requests stay with the base handler so authentication remains authoritative", async () => {
  let baseCalls = 0, limiterCalls = 0;
  const handler = withAiGenerationRateLimit(async (_req, res) => { baseCalls += 1; return res.status(401).json({ error:"SIGN_IN_REQUIRED" }); }, {
    policy:"workout_generation",
    enforcer:async () => { limiterCalls += 1; return { allowed:true }; },
  });
  const res = responseRecorder();
  await handler({ method:"POST", headers:{}, body:{ intent:"upper body" } }, res);
  assert.equal(baseCalls, 1);
  assert.equal(limiterCalls, 0);
  assert.equal(res.statusCode, 401);
});

test("blocked authenticated AI request returns 429 before base handler", async () => {
  let baseCalls = 0;
  const handler = withAiGenerationRateLimit(async () => { baseCalls += 1; }, {
    policy:"program_generation",
    enforcer:async ({ token, policy }) => {
      assert.equal(token, "jwt-test");
      assert.equal(policy, "program_generation");
      return { allowed:false, resetAt:"2026-09-01T00:00:00.000Z", retryAfterSeconds:90 };
    },
  });
  const res = responseRecorder();
  await handler({ method:"POST", headers:{ authorization:"Bearer jwt-test" }, body:{} }, res);
  assert.equal(baseCalls, 0);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["Retry-After"], "90");
  assert.equal(res.body.error, "AI_RATE_LIMITED");
});

test("allowed request reaches the expensive base handler exactly once", async () => {
  let baseCalls = 0;
  const handler = withAiGenerationRateLimit(async (_req, res) => { baseCalls += 1; return res.status(200).json({ ok:true }); }, {
    policy:"workout_generation",
    enforcer:async () => ({ allowed:true }),
  });
  const res = responseRecorder();
  await handler({ method:"POST", headers:{ authorization:"Bearer jwt-test" }, body:{} }, res);
  assert.equal(baseCalls, 1);
  assert.equal(res.statusCode, 200);
});

test("usage-guard infrastructure failure fails closed before spending model tokens", async () => {
  let baseCalls = 0;
  const handler = withAiGenerationRateLimit(async () => { baseCalls += 1; }, {
    policy:"workout_generation",
    enforcer:async () => { throw Object.assign(new Error("db down"), { status:503 }); },
  });
  const res = responseRecorder();
  await handler({ method:"POST", headers:{ authorization:"Bearer jwt-test" }, body:{} }, res);
  assert.equal(baseCalls, 0);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, "RATE_LIMIT_CHECK_FAILED");
  assert.match(res.body.message, /No model request was sent/i);
});

test("caller can bypass rate limiting for local demo or obviously invalid requests", async () => {
  let baseCalls = 0, limiterCalls = 0;
  const handler = withAiGenerationRateLimit(async (_req, res) => { baseCalls += 1; return res.status(200).json({ mode:"demo" }); }, {
    policy:"workout_generation",
    shouldLimit:(req) => req.body?.demo !== true,
    enforcer:async () => { limiterCalls += 1; return { allowed:true }; },
  });
  const res = responseRecorder();
  await handler({ method:"POST", headers:{ authorization:"Bearer jwt-test" }, body:{ demo:true } }, res);
  assert.equal(baseCalls, 1);
  assert.equal(limiterCalls, 0);
});
