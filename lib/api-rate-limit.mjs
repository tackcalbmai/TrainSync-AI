const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";

export const AI_RATE_LIMIT_POLICIES = Object.freeze({
  workout_generation: Object.freeze([
    Object.freeze({ endpoint:"ai_workout_hour", limit:20, windowSeconds:3600 }),
    Object.freeze({ endpoint:"ai_workout_day", limit:60, windowSeconds:86400 }),
  ]),
  program_generation: Object.freeze([
    Object.freeze({ endpoint:"ai_program_hour", limit:6, windowSeconds:3600 }),
    Object.freeze({ endpoint:"ai_program_day", limit:20, windowSeconds:86400 }),
  ]),
});

function normalizeRow(value) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row.allowed !== "boolean") throw new Error("RATE_LIMIT_RESPONSE_INVALID");
  return {
    allowed:row.allowed,
    remaining:Number.isFinite(Number(row.remaining)) ? Math.max(0, Number(row.remaining)) : 0,
    resetAt:row.reset_at || row.resetAt || null,
    requestCount:Number.isFinite(Number(row.request_count ?? row.requestCount)) ? Math.max(0, Number(row.request_count ?? row.requestCount)) : null,
  };
}

export async function consumeApiRateLimit({ token, endpoint, limit, windowSeconds, fetchImpl = fetch } = {}) {
  if (!token) throw Object.assign(new Error("SIGN_IN_REQUIRED"), { code:"SIGN_IN_REQUIRED" });
  const response = await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/consume_api_rate_limit`, {
    method:"POST",
    headers:{
      apikey:SUPABASE_KEY,
      Authorization:`Bearer ${token}`,
      "Content-Type":"application/json",
    },
    body:JSON.stringify({ p_endpoint:endpoint, p_limit:limit, p_window_seconds:windowSeconds }),
    signal:AbortSignal.timeout(8000),
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!response.ok) {
    const error = new Error(body?.message || body?.error || `Rate limit check failed (${response.status}).`);
    error.code = "RATE_LIMIT_CHECK_FAILED";
    error.status = response.status;
    throw error;
  }
  return normalizeRow(body);
}

export function retryAfterSeconds(resetAt, now = new Date()) {
  const resetMs = Date.parse(resetAt || "");
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(resetMs) || !Number.isFinite(nowMs)) return 60;
  return Math.max(1, Math.ceil((resetMs - nowMs) / 1000));
}

export async function enforceAiRateLimits({ token, policy, fetchImpl = fetch } = {}) {
  const rules = AI_RATE_LIMIT_POLICIES[policy];
  if (!rules) throw Object.assign(new Error("RATE_LIMIT_POLICY_UNKNOWN"), { code:"RATE_LIMIT_POLICY_UNKNOWN" });
  for (const rule of rules) {
    const result = await consumeApiRateLimit({ token, ...rule, fetchImpl });
    if (!result.allowed) {
      return {
        allowed:false,
        endpoint:rule.endpoint,
        limit:rule.limit,
        windowSeconds:rule.windowSeconds,
        resetAt:result.resetAt,
        retryAfterSeconds:retryAfterSeconds(result.resetAt),
      };
    }
  }
  return { allowed:true };
}
