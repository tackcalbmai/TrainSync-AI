import { parseGarminFitActivity } from "../lib/garmin-fit.mjs";
import { matchGarminActivityToWorkout, targetForGarminSet } from "../lib/garmin-activity-ingestion.mjs";
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

async function lookupImport(token, userId, field, value) {
  if (!value) return null;
  const query = new URLSearchParams({
    select: "id,provider_activity_id,fit_file_hash,status,workout_session_id,metadata,created_at,updated_at",
    user_id: `eq.${userId}`,
    [field]: `eq.${value}`,
    limit: "1",
  });
  const rows = await rest(token, `garmin_activity_imports?${query}`);
  return Array.isArray(rows) ? (rows[0] || null) : null;
}

async function existingImport(token, userId, providerActivityId, fileHash) {
  return await lookupImport(token, userId, "provider_activity_id", providerActivityId)
    || await lookupImport(token, userId, "fit_file_hash", fileHash);
}

async function recentImports(token, userId) {
  const query = new URLSearchParams({
    select: "id,provider_activity_id,sport,sub_sport,started_at,completed_at,status,error_code,metadata,created_at,updated_at",
    user_id: `eq.${userId}`,
    order: "created_at.desc",
    limit: "10",
  });
  return rest(token, `garmin_activity_imports?${query}`);
}

async function plannedWorkouts(token, userId) {
  const query = new URLSearchParams({
    select: "id,title,sport,status,scheduled_date,timezone,estimated_duration_minutes,payload,created_at,updated_at",
    user_id: `eq.${userId}`,
    order: "scheduled_date.desc.nullslast,created_at.desc",
    limit: "30",
  });
  const rows = await rest(token, `workouts?${query}`);
  return (Array.isArray(rows) ? rows : []).filter((row) => !["completed", "archived"].includes(row.status));
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

async function markWorkoutCompleted(token, workout) {
  if (!workout?.id) return;
  const payload = { ...(workout.payload || {}), status: "completed" };
  await rest(token, `workouts?id=eq.${encodeURIComponent(workout.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "completed", payload, updated_at: new Date().toISOString() }),
  });
}

function providerState() {
  return {
    provider: "garmin",
    automaticSync: false,
    officialAccess: "waiting_for_garmin_access",
    ingestion: "ready",
    manualFitTest: true,
  };
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });

  const token = bearerToken(req);
  const user = await authenticate(token);
  if (!user) return res.status(401).json({ error: "SIGN_IN_REQUIRED" });

  if (req.method === "GET") {
    const imports = await recentImports(token, user.id).catch(() => []);
    return res.status(200).json({ ...providerState(), imports });
  }

  let bytes;
  let activity;
  try {
    bytes = decodeBase64Fit(req.body?.fitBase64);
    activity = parseGarminFitActivity(bytes, { providerActivityId: req.body?.providerActivityId || null });
  } catch (error) {
    return res.status(400).json({ error: "FIT_PARSE_FAILED", message: error.message });
  }

  const providerActivityId = activity.providerActivityId;
  const duplicate = await existingImport(token, user.id, providerActivityId, activity.fileHash).catch(() => null);
  if (duplicate?.status === "imported") {
    return res.status(200).json({
      imported: true,
      duplicate: true,
      providerActivityId,
      workoutSessionId: duplicate.workout_session_id,
      match: duplicate.metadata?.match || null,
      activity,
    });
  }

  if (!activity.isStrength) {
    const metadata = { reason: "NOT_STRENGTH_ACTIVITY", summary: activity.summary };
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
      metadata,
    });
    if (duplicate) await patchImport(token, duplicate.id, { status: "ignored", metadata });
    return res.status(422).json({ error: "NOT_STRENGTH_ACTIVITY", importId: ignored?.id || duplicate?.id, activity });
  }

  if (!activity.sets.length) {
    const metadata = { warning: "NO_STRENGTH_SETS_FOUND", summary: activity.summary };
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
      metadata,
    });
    if (duplicate) await patchImport(token, duplicate.id, { status: "parsed", metadata });
    return res.status(422).json({ error: "NO_STRENGTH_SETS_FOUND", importId: parsed?.id || duplicate?.id, activity });
  }

  const candidateWorkouts = await plannedWorkouts(token, user.id).catch(() => []);
  const match = matchGarminActivityToWorkout(activity, candidateWorkouts);
  const matchedWorkout = match.matched ? candidateWorkouts.find((row) => row.id === match.best?.workoutId) || null : null;

  let importRow = duplicate;
  const baseMetadata = { summary: activity.summary, match };
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
      metadata: baseMetadata,
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
      metadata: baseMetadata,
    });
  }

  let session = null;
  try {
    session = await createSession(token, {
      user_id: user.id,
      workout_id: matchedWorkout?.id || null,
      title: matchedWorkout?.title || activity.title,
      started_at: activity.startedAt || activity.completedAt || new Date().toISOString(),
      completed_at: activity.completedAt || new Date().toISOString(),
      duration_seconds: activity.durationSeconds,
      status: "completed",
      notes: matchedWorkout
        ? "Automatically imported from Garmin FIT and matched to a TrainSync workout."
        : "Automatically imported from Garmin FIT activity.",
      total_sets: activity.summary.totalSets,
      total_volume_kg: activity.summary.totalVolumeKg,
      source: "garmin",
      updated_at: new Date().toISOString(),
    });
    if (!session?.id) throw new Error("SESSION_CREATE_FAILED");

    const setRows = activity.sets.map((set) => {
      const target = targetForGarminSet(set, matchedWorkout);
      return {
        user_id: user.id,
        session_id: session.id,
        exercise_name: set.exerciseName,
        exercise_key: normalizeExerciseKey(set.exerciseName),
        exercise_order: set.exerciseOrder,
        set_index: set.setIndex,
        target_reps: target.targetReps,
        target_weight_kg: target.targetWeightKg,
        reps: set.reps,
        weight_kg: set.weightKg,
        rpe: null,
        is_warmup: Boolean(set.isWarmup),
        completed_at: set.completedAt || activity.completedAt || new Date().toISOString(),
      };
    });

    await rest(token, "set_results", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(setRows),
    });

    let workoutStatusUpdated = false;
    if (matchedWorkout) {
      try {
        await markWorkoutCompleted(token, matchedWorkout);
        workoutStatusUpdated = true;
      } catch {}
    }

    const metadata = {
      summary: activity.summary,
      title: activity.title,
      setCount: setRows.length,
      match,
      workoutStatusUpdated,
    };
    await patchImport(token, importRow.id, {
      status: "imported",
      workout_session_id: session.id,
      error_code: null,
      metadata,
    });

    return res.status(200).json({
      imported: true,
      duplicate: false,
      providerActivityId,
      workoutSessionId: session.id,
      matchedWorkoutId: matchedWorkout?.id || null,
      workoutStatusUpdated,
      match,
      activity,
    });
  } catch (error) {
    await cleanupSession(token, session?.id);
    if (importRow?.id) {
      await patchImport(token, importRow.id, {
        status: "failed",
        error_code: "IMPORT_FAILED",
        metadata: { message: error.message, summary: activity.summary, match },
      }).catch(() => {});
    }
    return res.status(500).json({ error: "IMPORT_FAILED", message: error.message });
  }
}
