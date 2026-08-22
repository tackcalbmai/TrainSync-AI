const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";
const SESSION_KEY = "trainsync:supabase-session";

function authHeaders(session, extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...extra,
  };
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = data?.msg || data?.message || data?.error_description || data?.error || `Supabase request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}

function setSession(session) {
  if (session?.access_token) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
  return session;
}

export async function signUp(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: authHeaders(null),
    body: JSON.stringify({ email, password }),
  });
  const data = await parseResponse(response);
  if (data?.access_token) setSession(data);
  return data;
}

export async function signIn(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: authHeaders(null),
    body: JSON.stringify({ email, password }),
  });
  return setSession(await parseResponse(response));
}

export async function signOut() {
  const session = getSession();
  if (session?.access_token) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: "POST", headers: authHeaders(session) });
    } catch {}
  }
  setSession(null);
}

export async function refreshSession() {
  const current = getSession();
  if (!current?.refresh_token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: authHeaders(null),
    body: JSON.stringify({ refresh_token: current.refresh_token }),
  });
  return setSession(await parseResponse(response));
}

export function currentUser() {
  return getSession()?.user || null;
}

async function authorizedFetch(url, options = {}) {
  let session = getSession();
  if (!session?.access_token) throw new Error("SIGN_IN_REQUIRED");
  let response = await fetch(url, { ...options, headers: authHeaders(session, options.headers || {}) });
  if (response.status === 401 && session.refresh_token) {
    session = await refreshSession();
    response = await fetch(url, { ...options, headers: authHeaders(session, options.headers || {}) });
  }
  return parseResponse(response);
}

export async function saveWorkout(workout) {
  const session = getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("SIGN_IN_REQUIRED");
  const row = {
    user_id: userId,
    client_workout_id: workout.id,
    revision: workout.revision || 1,
    title: workout.title,
    sport: workout.sport || "strength",
    scheduled_date: workout.scheduledDate,
    timezone: workout.timezone || "Europe/Riga",
    estimated_duration_minutes: workout.estimatedDurationMinutes,
    status: workout.status || "draft",
    payload: workout,
    updated_at: new Date().toISOString(),
  };
  const url = `${SUPABASE_URL}/rest/v1/workouts?on_conflict=user_id,client_workout_id,revision`;
  const data = await authorizedFetch(url, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  return Array.isArray(data) ? data[0] : data;
}

export async function listWorkouts(limit = 12) {
  const query = new URLSearchParams({
    select: "id,client_workout_id,revision,title,scheduled_date,estimated_duration_minutes,status,payload,created_at,updated_at",
    order: "created_at.desc",
    limit: String(limit),
  });
  return authorizedFetch(`${SUPABASE_URL}/rest/v1/workouts?${query}`);
}

export async function updateWorkoutStatus(dbId, status, payload) {
  return authorizedFetch(`${SUPABASE_URL}/rest/v1/workouts?id=eq.${encodeURIComponent(dbId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status, payload, updated_at: new Date().toISOString() }),
  });
}

export async function savePublication({ workoutDbId, workout, result }) {
  const session = getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("SIGN_IN_REQUIRED");
  const row = {
    user_id: userId,
    workout_id: workoutDbId,
    provider: result.provider || "garmin",
    idempotency_key: result.idempotencyKey,
    provider_resource_id: result.providerResourceId,
    status: result.success ? "published" : "failed",
    error_code: result.code || null,
    response_metadata: result,
  };
  const url = `${SUPABASE_URL}/rest/v1/publication_attempts?on_conflict=user_id,idempotency_key`;
  const data = await authorizedFetch(url, {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  return Array.isArray(data) ? data[0] : data;
}

export { SUPABASE_URL };
