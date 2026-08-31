import { enforceAiRateLimits } from "./api-rate-limit.mjs";

function bearerToken(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req?.headers?.authorization || "");
  return match?.[1] || null;
}

export function withAiGenerationRateLimit(baseHandler, {
  policy,
  shouldLimit = () => true,
  enforcer = enforceAiRateLimits,
} = {}) {
  if (typeof baseHandler !== "function") throw new Error("RATE_LIMIT_BASE_HANDLER_REQUIRED");
  if (!policy) throw new Error("RATE_LIMIT_POLICY_REQUIRED");

  return async function rateLimitedHandler(req, res) {
    if (req?.method !== "POST" || !shouldLimit(req)) return baseHandler(req, res);
    const token = bearerToken(req);
    if (!token) return baseHandler(req, res);

    try {
      const result = await enforcer({ token, policy });
      if (!result?.allowed) {
        if (typeof res?.setHeader === "function") res.setHeader("Retry-After", String(result.retryAfterSeconds || 60));
        return res.status(429).json({
          error:"AI_RATE_LIMITED",
          message:"AI generation limit reached. Try again after the current usage window resets.",
          resetAt:result.resetAt || null,
        });
      }
      return baseHandler(req, res);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403 || error?.code === "SIGN_IN_REQUIRED") {
        return baseHandler(req, res);
      }
      return res.status(503).json({
        error:"RATE_LIMIT_CHECK_FAILED",
        message:"AI generation is temporarily unavailable because usage protection could not be verified. No model request was sent.",
      });
    }
  };
}
