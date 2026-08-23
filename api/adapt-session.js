import { runProgramAdaptation } from "../lib/adaptation-service.mjs";

const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";
function bearer(req) { const match = /^Bearer\s+(.+)$/i.exec(req.headers?.authorization || ""); return match?.[1] || null; }
function headers(token, extra = {}) { return { apikey:SUPABASE_KEY, Authorization:`Bearer ${token}`, "Content-Type":"application/json", ...extra }; }
async function parseResponse(response) {
  const text = await response.text(); let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) { const error = new Error(data?.message || data?.error || `Supabase request failed (${response.status})`); error.status = response.status; throw error; }
  return data;
}
async function rest(token, path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers:headers(token, options.headers || {}), signal:AbortSignal.timeout(12000) });
  return parseResponse(response);
}
async function authenticate(token) {
  if (!token) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ apikey:SUPABASE_KEY, Authorization:`Bearer ${token}` }, signal:AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id ? user : null;
  } catch { return null; }
}
function cleanLoads(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[;,\s]+/);
  return [...new Set(values.map(Number).filter((number) => Number.isFinite(number) && number > 0))].sort((a,b) => a-b).slice(0,100);
}
async function getRequest(token, userId, requestId) {
  const q = new URLSearchParams({ select:"id,user_id,program_id,source_workout_session_id,target_program_session_id,exercise_key,request_type,reason_code,payload,status,resolution,created_at,updated_at", id:`eq.${requestId}`, user_id:`eq.${userId}`, limit:"1" });
  const rows = await rest(token, `adaptation_requests?${q}`);
  return rows?.[0] || null;
}
async function saveLoadOptions(token, userId, exerciseKey, loadsKg) {
  const conflict = encodeURIComponent("user_id,exercise_key");
  await rest(token, `exercise_load_options?on_conflict=${conflict}`, {
    method:"POST",
    headers:{ Prefer:"resolution=merge-duplicates,return=minimal" },
    body:JSON.stringify({ user_id:userId, exercise_key:exerciseKey, loads_kg:loadsKg, source:"user_confirmed", updated_at:new Date().toISOString() }),
  });
}
async function resolveInput(token, user, body) {
  const requestId = String(body?.requestId || "").trim();
  if (!requestId) return { statusCode:400, body:{ error:"ADAPTATION_REQUEST_REQUIRED" } };
  const request = await getRequest(token, user.id, requestId).catch(() => null);
  if (!request) return { statusCode:404, body:{ error:"ADAPTATION_REQUEST_NOT_FOUND" } };
  if (request.status !== "pending") return { statusCode:409, body:{ error:"ADAPTATION_REQUEST_NOT_PENDING", status:request.status } };
  if (request.request_type !== "load_options") return { statusCode:400, body:{ error:"ADAPTATION_REQUEST_TYPE_UNSUPPORTED" } };
  const loadsKg = cleanLoads(body?.loadsKg ?? body?.loads);
  if (!loadsKg.length) return { statusCode:400, body:{ error:"LOAD_OPTIONS_REQUIRED", message:"Provide at least one available load in kilograms." } };
  await saveLoadOptions(token, user.id, request.exercise_key, loadsKg);
  const adaptation = await runProgramAdaptation({
    token,
    userId:user.id,
    workoutSessionId:request.source_workout_session_id,
    apply:body?.dryRun !== true,
    explicitAvailableLoadsByExercise:{ [request.exercise_key]:loadsKg },
  });
  return { statusCode:200, body:{ saved:true, exerciseKey:request.exercise_key, loadsKg, adaptation } };
}
async function acknowledgeReview(token, user, body) {
  const requestId = String(body?.requestId || "").trim();
  if (!requestId) return { statusCode:400, body:{ error:"ADAPTATION_REQUEST_REQUIRED" } };
  const request = await getRequest(token, user.id, requestId).catch(() => null);
  if (!request) return { statusCode:404, body:{ error:"ADAPTATION_REQUEST_NOT_FOUND" } };
  if (request.status !== "pending") return { statusCode:409, body:{ error:"ADAPTATION_REQUEST_NOT_PENDING", status:request.status } };
  if (request.request_type !== "review") return { statusCode:400, body:{ error:"ADAPTATION_REQUEST_TYPE_UNSUPPORTED" } };
  const now = new Date().toISOString();
  const q = new URLSearchParams({ id:`eq.${request.id}`, user_id:`eq.${user.id}` });
  await rest(token, `adaptation_requests?${q}`, {
    method:"PATCH",
    headers:{ Prefer:"return=minimal" },
    body:JSON.stringify({ status:"dismissed", resolution:{ resolvedBy:"user_acknowledged_review", acknowledgedAt:now }, updated_at:now }),
  });
  return { statusCode:200, body:{ acknowledged:true, requestId:request.id, exerciseKey:request.exercise_key } };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error:"METHOD_NOT_ALLOWED" });
  const token = bearer(req);
  const user = await authenticate(token);
  if (!user) return res.status(401).json({ error:"SIGN_IN_REQUIRED" });
  try {
    if (req.body?.action === "acknowledge_review") {
      const result = await acknowledgeReview(token, user, req.body || {});
      return res.status(result.statusCode).json(result.body);
    }
    if (req.body?.action === "resolve_input" || req.body?.requestId) {
      const result = await resolveInput(token, user, req.body || {});
      return res.status(result.statusCode).json(result.body);
    }
    const workoutSessionId = String(req.body?.workoutSessionId || "").trim();
    if (!workoutSessionId) return res.status(400).json({ error:"WORKOUT_SESSION_REQUIRED" });
    const result = await runProgramAdaptation({ token, userId:user.id, workoutSessionId, apply:req.body?.dryRun !== true });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ error:"ADAPTATION_FAILED", message:error.message || "Adaptation failed." });
  }
}
