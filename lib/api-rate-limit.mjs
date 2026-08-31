const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";

export const AI_RATE_LIMIT_POLICIES = Object.freeze({
  workout_generation:Object.freeze({ hourLimit:20, dayLimit:60 }),
  program_generation:Object.freeze({ hourLimit:6, dayLimit:20 }),
});

function normalizeRow(value) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row.allowed !== "boolean") throw new Error("RATE_LIMIT_RESPONSE_INVALID");
  return {
    allowed:row.allowed,
    remaining:Number.isFinite(Number(row.remaining)) ? Math.max(0, Number(row.remaining)) : 0,
    resetAt:row.reset_at || row.resetAt || null,
    hourCount:Number.isFinite(Number(row.hour_count ?? row.hourCount)) ? Math.max(0, Number(row.hour_count ?? row.hourCount)) : null,
    dayCount:Number.isFinite(Number(row.day_count ?? row.dayCount)) ? Math.max(0, Number(row.day_count ?? row.dayCount)) : null,
  };
}

export async function consumeAiGenerationLimit({ token, policy, fetchImpl = fetch } = {}) {
  if (!token) throw Object.assign(new Error("SIGN_IN_REQUIRED"), { code:"SIGN_IN_REQUIRED" });
  if (!AI_RATE_LIMIT_POLICIES[policy]) throw Object.assign(new Error("RATE_LIMIT_POLICY_UNKNOWN"), { code:"RATE_LIMIT_POLICY_UNKNOWN" });
  const response = await fetchImpl(`${SUPABASE_URL}/rest/v1/rpc/consume_ai_generation_limit`, {
    method:"POST",
    headers:{
      apikey:SUPABASE_KEY,
      Authorization:`Bearer ${token}`,
      "Content-Type":"application/json",
    },
    body:JSON.stringify({ p_policy:policy }),
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
  const limits = AI_RATE_LIMIT_POLICIES[policy];
  if (!limits) throw Object.assign(new Error("RATE_LIMIT_POLICY_UNKNOWN"), { code:"RATE_LIMIT_POLICY_UNKNOWN" });
  const result = await consumeAiGenerationLimit({ token, policy, fetchImpl });
  if (!result.allowed) {
    return {
      allowed:false,
      policy,
      ...limits,
      resetAt:result.resetAt,
      retryAfterSeconds:retryAfterSeconds(result.resetAt),
      hourCount:result.hourCount,
      dayCount:result.dayCount,
    };
  }
  return { allowed:true, remaining:result.remaining, hourCount:result.hourCount, dayCount:result.dayCount };
}
