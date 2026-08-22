import { parseGarminFitActivity } from "../lib/garmin-fit.mjs";
import { normalizeExerciseKey } from "../lib/progress.mjs";

const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";
const MAX_FIT_BYTES = 4 * 1024 * 1024;

function bearerToken(req) {
  const header = req.headers?.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || null;
}

function headers(token, extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Supabase request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function authenticate(token) {
  if (!token) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

async function rest(token, path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: headers(token, options.headers || {}),
    signal: AbortSignal.timeout(12000),
  });
  return parseResponse(response);
}

function decodeBase64Fit(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("FIT_FILE_REQUIRED");
  const clean = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const bytes = Buffer.from(clean, "base64");
  if (!bytes.length) throw new Error("FIT_FILE_EMPTY");
  if (bytes.length > MAX_FIT_BYTES) throw new Error("FIT_FILE_TOO_LARGE");
  return new Uint8Array(bytes);
}

async function existingImport(token, userId, providerActivityId) {
  const query = new URLSearchParams({
    select: "id,status,workout_session_id,metadata,created_at",
    user_id: `eq.${userId}`,
    provider_activity_id: `eq.${providerActivityId}`,
    limit: "1",
  });
  const rows = await rest(token, `garmin_activity_imports?${query}`);
  return Array.isArray(rows) ? (rows[0] || null) : null;
}

async function createImport(token, row) {
  const rows = await rest(token, "garmin_activity_imports", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function patchImport(token, id, patch) {
  await rest(token, `garmin_activity_imports?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

async function createSession(token, row) {
  const rows = await rest(token, "workout_sessions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function cleanupSession(token, sessionId) {
  if (!sessionId) return;
  try {
    await rest(token, `workout_sessions?id=eq.${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  } catch {}
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });

  const token = bearerToken(req);
  const user = await authenticate(token);
  if (!user) return res.status(401).json({ error: "SIGN_IN_REQUIRED" });

  let bytes;
  let activity;
  try {
    bytes = decodeBase64Fit(req.body?.fitBase64);
    activity = parseGarminFitActivity(bytes, { providerActivityId: req.body?.providerActivityId || null });
  } catch (error) {
    return res.status(400).json({ error: "FIT_PARSE_FAILED", message: error.message });
  }

  const providerActivityId = activity.providerActivityId;
  const duplicate = await existingImport(token, user.id, providerActivityId).catch(() => null);
  if (duplicate?.status === "imported") {
    return res.status(200).json({
      imported: true,
      duplicate: true,
      providerActivityId,
      workoutSessionId: duplicate.workout_session_id,
      activity,
    });
  }

  if (!activity.isStrength) {
    const ignored = duplicate || await createImport(token, {
      user_id: user.id,
      provider: "garmin",
      provider_activity_id: providerActivityId,
      fit_file_hash: activity.fileHash,
      sport: activity.sport,
      sub_sport: activity.subSport,
      started_at: activity.startedAt,
      completed_at: activity.completedAt,
      status: "ignored",
      metadata: { reason: "NOT_STRENGTH_ACTIVITY", summary: activity.summary },
    });
    if (duplicate) await patchImport(token, duplicate.id, { status: "ignored", metadata: { reason: "NOT_STRENGTH_ACTIVITY", summary: activity.summary } });
    return res.status(422).json({ error: "NOT_STRENGTH_ACTIVITY", importId: ignored?.id || duplicate?.id, activity });
  }

  if (!activity.sets.length) {
    const parsed = duplicate || await createImport(token, {
      user_id: user.id,
      provider: "garmin",
      provider_activity_id: providerActivityId,
      fit_file_hash: activity.fileHash,
      sport: activity.sport,
      sub_sport: activity.subSport,
      started_at: activity.startedAt,
      completed_at: activity.completedAt,
      status: "parsed",
      metadata: { warning: "NO_STRENGTH_SETS_FOUND", summary: activity.summary },
    });
    if (duplicate) await patchImport(token, duplicate.id, { status: "parsed", metadata: { warning: "NO_STRENGTH_SETS_FOUND", summary: activity.summary } });
    return res.status(422).json({ error: "NO_STRENGTH_SETS_FOUND", importId: parsed?.id || duplicate?.id, activity });
  }

  let importRow = duplicate;
  if (!importRow) {
    importRow = await createImport(token, {
      user_id: user.id,
      provider: "garmin",
      provider_activity_id: providerActivityId,
      fit_file_hash: activity.fileHash,
      sport: activity.sport,
      sub_sport: activity.subSport,
      started_at: activity.startedAt,
      completed_at: activity.completedAt,
      status: "parsed",
      metadata: { summary: activity.summary },
    });
  } else {
    await patchImport(token, importRow.id, {
      fit_file_hash: activity.fileHash,
      sport: activity.sport,
      sub_sport: activity.subSport,
      started_at: activity.startedAt,
      completed_at: activity.completedAt,
      status: "parsed",
      error_code: null,
      metadata: { summary: activity.summary },
    });
  }

  let session = null;
  try {
    session = await createSession(token, {
      user_id: user.id,
      workout_id: null,
      title: activity.title,
      started_at: activity.startedAt || activity.completedAt || new Date().toISOString(),
      completed_at: activity.completedAt || new Date().toISOString(),
      duration_seconds: activity.durationSeconds,
      status: "completed",
      notes: "Automatically imported from Garmin FIT activity.",
      total_sets: activity.summary.totalSets,
      total_volume_kg: activity.summary.totalVolumeKg,
      source: "garmin",
      updated_at: new Date().toISOString(),
    });
    if (!session?.id) throw new Error("SESSION_CREATE_FAILED");

    const setRows = activity.sets.map((set) => ({
      user_id: user.id,
      session_id: session.id,
      exercise_name: set.exerciseName,
      exercise_key: normalizeExerciseKey(set.exerciseName),
      exercise_order: set.exerciseOrder,
      set_index: set.setIndex,
      target_reps: null,
      target_weight_kg: null,
      reps: set.reps,
      weight_kg: set.weightKg,
      rpe: null,
      is_warmup: Boolean(set.isWarmup),
      completed_at: set.completedAt || activity.completedAt || new Date().toISOString(),
    }));

    await rest(token, "set_results", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(setRows),
    });

    await patchImport(token, importRow.id, {
      status: "imported",
      workout_session_id: session.id,
      error_code: null,
      metadata: {
        summary: activity.summary,
        title: activity.title,
        setCount: setRows.length,
      },
    });

    return res.status(200).json({
      imported: true,
      duplicate: false,
      providerActivityId,
      workoutSessionId: session.id,
      activity,
    });
  } catch (error) {
    await cleanupSession(token, session?.id);
    if (importRow?.id) {
      await patchImport(token, importRow.id, { status: "failed", error_code: "IMPORT_FAILED", metadata: { message: error.message, summary: activity.summary } }).catch(() => {});
    }
    return res.status(500).json({ error: "IMPORT_FAILED", message: error.message });
  }
}
