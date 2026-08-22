const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";

function headers(token, extra = {}) {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function decodeJwtPayload(token) {
  try {
    const part = String(token).split(".")[1];
    if (!part) return {};
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

async function readResponse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(
      data?.message || data?.msg || data?.error_description || data?.error || `Supabase request failed (${response.status})`,
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function authenticateBearerToken(token) {
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: headers(token),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const user = await response.json();
  if (!user?.id) return null;

  // Supabase validated authenticity above. Decode only after that to inspect OAuth claims.
  const claims = decodeJwtPayload(token);
  if (!claims.client_id) return null;
  return {
    token,
    user,
    clientId: String(claims.client_id),
    scope: String(claims.scope || "email"),
  };
}

export async function upsertWorkoutForUser(token, userId, workout) {
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
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/workouts?on_conflict=user_id,client_workout_id,revision&select=id,client_workout_id,revision,title,scheduled_date,status,updated_at`,
    {
      method: "POST",
      headers: headers(token, { Prefer: "resolution=merge-duplicates,return=representation" }),
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(8000),
    },
  );
  const data = await readResponse(response);
  return Array.isArray(data) ? data[0] : data;
}

export async function listWorkoutsForUser(token, userId, limit = 12) {
  const query = new URLSearchParams({
    select: "id,client_workout_id,revision,title,scheduled_date,estimated_duration_minutes,status,payload,created_at,updated_at",
    user_id: `eq.${userId}`,
    order: "created_at.desc",
    limit: String(Math.max(1, Math.min(50, limit))),
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/workouts?${query}`, {
    method: "GET",
    headers: headers(token),
    signal: AbortSignal.timeout(8000),
  });
  return readResponse(response);
}

export async function savePublicationForUser(token, userId, workoutDbId, workout, result) {
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
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/publication_attempts?on_conflict=user_id,idempotency_key&select=id,status,provider_resource_id,created_at`,
    {
      method: "POST",
      headers: headers(token, { Prefer: "resolution=ignore-duplicates,return=representation" }),
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(8000),
    },
  );
  const data = await readResponse(response);
  return Array.isArray(data) ? data[0] || null : data;
}

export { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY };
