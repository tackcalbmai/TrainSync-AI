import { getSession, refreshSession, SUPABASE_URL } from "./supabase-client.js";
import { SCIENCE_VERSION } from "./scientific-framework.mjs";

const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";

function headers(session, extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...extra,
  };
}

async function parse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error_description || data?.error || `Supabase request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function request(path, options = {}) {
  let session = getSession();
  if (!session?.access_token) throw new Error("SIGN_IN_REQUIRED");
  let response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: headers(session, options.headers || {}) });
  if (response.status === 401 && session.refresh_token) {
    session = await refreshSession();
    response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: headers(session, options.headers || {}) });
  }
  return parse(response);
}

async function apiRequest(path, options = {}) {
  let session = getSession();
  if (!session?.access_token) throw new Error("SIGN_IN_REQUIRED");
  const send = () => fetch(path, {
    ...options,
    headers: {
      "Content-Type":"application/json",
      Authorization:`Bearer ${session.access_token}`,
      ...(options.headers || {}),
    },
  });
  let response = await send();
  if (response.status === 401 && session.refresh_token) {
    session = await refreshSession();
    response = await send();
  }
  return parse(response);
}

export async function listPrograms(limit = 20) {
  const q = new URLSearchParams({
    select: "id,title,goal,status,start_date,duration_weeks,days_per_week,default_session_minutes,progression_strategy,priority,settings,evidence_version,created_at,updated_at",
    order: "updated_at.desc",
    limit: String(Math.max(1, Math.min(100, Number(limit) || 20))),
  });
  return request(`training_programs?${q}`);
}

export async function getProgram(programId) {
  const q = new URLSearchParams({
    select: "id,title,goal,status,start_date,duration_weeks,days_per_week,default_session_minutes,progression_strategy,priority,settings,evidence_version,created_at,updated_at",
    id: `eq.${programId}`,
    limit: "1",
  });
  const rows = await request(`training_programs?${q}`);
  return rows?.[0] || null;
}

export async function getActiveProgram() {
  const q = new URLSearchParams({
    select: "id,title,goal,status,start_date,duration_weeks,days_per_week,default_session_minutes,progression_strategy,priority,settings,evidence_version,created_at,updated_at",
    status: "eq.active",
    order: "updated_at.desc",
    limit: "1",
  });
  const rows = await request(`training_programs?${q}`);
  return rows?.[0] || null;
}

export async function listProgramSessions(programId) {
  const q = new URLSearchParams({
    select: "id,program_id,week_index,day_index,slot_index,scheduled_date,title,status,workout_id,payload,rationale,revision,created_at,updated_at",
    program_id: `eq.${programId}`,
    order: "week_index.asc,day_index.asc,slot_index.asc",
  });
  return request(`program_sessions?${q}`);
}

export async function listProgramAdjustments(programId, limit = 100) {
  const q = new URLSearchParams({
    select: "id,program_id,program_session_id,workout_session_id,target_key,adjustment_type,reason_code,reason_text,evidence_level,science_version,evidence_claim_ids,evidence_rule_keys,decision_confidence,metrics_snapshot,decision_source,before_state,after_state,created_at",
    program_id: `eq.${programId}`,
    order: "created_at.desc",
    limit: String(Math.max(1, Math.min(500, Number(limit) || 100))),
  });
  return request(`program_adjustments?${q}`);
}

export async function listAdaptationRequests(programId, status = "pending") {
  const q = new URLSearchParams({
    select:"id,program_id,source_workout_session_id,target_program_session_id,exercise_key,request_type,reason_code,payload,status,resolution,created_at,updated_at",
    program_id:`eq.${programId}`,
    status:`eq.${status}`,
    order:"created_at.desc",
    limit:"50",
  });
  return request(`adaptation_requests?${q}`);
}

export async function resolveAdaptationInput(requestId, loadsKg) {
  return apiRequest("/api/adaptation-input", {
    method:"POST",
    body:JSON.stringify({ requestId, loadsKg }),
  });
}

export async function saveGeneratedProgram(program) {
  const session = getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("SIGN_IN_REQUIRED");
  const row = {
    user_id: userId,
    title: program.title,
    goal: program.goal,
    status: "draft",
    start_date: program.startDate,
    duration_weeks: program.durationWeeks,
    days_per_week: program.daysPerWeek,
    default_session_minutes: program.defaultSessionMinutes,
    progression_strategy: program.progressionStrategy,
    priority: program.priority || {},
    settings: {
      ...(program.settings || {}),
      clientProgramId: program.clientProgramId,
      scientificFrameworkVersion: SCIENCE_VERSION,
      generatorEvidenceVersion: program.evidenceVersion || null,
    },
    evidence_version: SCIENCE_VERSION,
    updated_at: new Date().toISOString(),
  };
  const createdRows = await request("training_programs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const created = createdRows?.[0];
  if (!created?.id) throw new Error("PROGRAM_CREATE_FAILED");

  const sessionRows = (program.sessions || []).map((item) => ({
    user_id: userId,
    program_id: created.id,
    week_index: item.weekIndex,
    day_index: item.dayIndex,
    slot_index: item.slotIndex || 1,
    scheduled_date: item.scheduledDate,
    title: item.title,
    status: item.status || "planned",
    payload: item.payload || {},
    rationale: item.rationale || {},
    updated_at: new Date().toISOString(),
  }));
  try {
    if (sessionRows.length) await request("program_sessions", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(sessionRows),
    });
  } catch (error) {
    try { await request(`training_programs?id=eq.${created.id}`, { method: "DELETE" }); } catch {}
    throw error;
  }
  return created;
}

export async function activateProgram(programId) {
  // Keep one active program per athlete. Pause an older one before activating the new draft.
  await request("training_programs?status=eq.active", {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "paused", updated_at: new Date().toISOString() }),
  });
  const rows = await request(`training_programs?id=eq.${encodeURIComponent(programId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "active", updated_at: new Date().toISOString() }),
  });
  return rows?.[0] || null;
}

export async function updateProgramStatus(programId, status) {
  const allowed = new Set(["draft","active","paused","completed","archived"]);
  if (!allowed.has(status)) throw new Error("PROGRAM_STATUS_INVALID");
  const rows = await request(`training_programs?id=eq.${encodeURIComponent(programId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
  });
  return rows?.[0] || null;
}
