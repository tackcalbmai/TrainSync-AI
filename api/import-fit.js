import { parseGarminFitActivity } from "../lib/garmin-fit.mjs";
import { matchGarminActivityToWorkout, targetForGarminSet } from "../lib/garmin-activity-ingestion.mjs";
import { normalizeExerciseKey } from "../lib/progress.mjs";
import { runProgramAdaptation } from "../lib/adaptation-service.mjs";
import { methodNotAllowed } from "../lib/http.mjs";

const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";
const MAX_FIT_BYTES = 3 * 1024 * 1024;
const MAX_FIT_BASE64_CHARS = Math.ceil(MAX_FIT_BYTES / 3) * 4;
function bearerToken(req) { const match = /^Bearer\s+(.+)$/i.exec(req.headers?.authorization || ""); return match?.[1] || null; }
function headers(token, extra = {}) { return { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra }; }
async function parseResponse(response) { const text = await response.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; } if (!response.ok) { const error = new Error(data?.message || data?.error || `Supabase request failed (${response.status})`); error.status = response.status; throw error; } return data; }
async function authenticate(token) { if (!token) return null; try { const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }); if (!response.ok) return null; const user = await response.json(); return user?.id ? user : null; } catch { return null; } }
async function rest(token, path, options = {}) { const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: headers(token, options.headers || {}), signal: AbortSignal.timeout(12000) }); return parseResponse(response); }
function decodeBase64Fit(value) { if (typeof value !== "string" || !value.trim()) throw new Error("FIT_FILE_REQUIRED"); const clean = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value; if (clean.length > MAX_FIT_BASE64_CHARS) throw new Error("FIT_FILE_TOO_LARGE"); const bytes = Buffer.from(clean, "base64"); if (!bytes.length) throw new Error("FIT_FILE_EMPTY"); if (bytes.length > MAX_FIT_BYTES) throw new Error("FIT_FILE_TOO_LARGE"); return new Uint8Array(bytes); }
function fitParseMessage(error) { if (error?.message === "FIT_FILE_REQUIRED") return "Choose a FIT file to import."; if (error?.message === "FIT_FILE_EMPTY") return "The FIT file is empty."; if (error?.message === "FIT_FILE_TOO_LARGE") return "FIT files must be 3 MB or smaller."; return "TrainSync could not read this FIT file."; }
async function lookupImport(token, userId, field, value) { if (!value) return null; const query = new URLSearchParams({ select: "id,provider_activity_id,fit_file_hash,status,workout_session_id,metadata,created_at,updated_at", user_id: `eq.${userId}`, [field]: `eq.${value}`, limit: "1" }); const rows = await rest(token, `garmin_activity_imports?${query}`); return Array.isArray(rows) ? (rows[0] || null) : null; }
async function existingImport(token, userId, providerActivityId, fileHash) { return await lookupImport(token, userId, "provider_activity_id", providerActivityId) || await lookupImport(token, userId, "fit_file_hash", fileHash); }
async function recentImports(token, userId) { const query = new URLSearchParams({ select: "id,provider_activity_id,sport,sub_sport,started_at,completed_at,status,error_code,metadata,created_at,updated_at", user_id: `eq.${userId}`, order: "created_at.desc", limit: "10" }); return rest(token, `garmin_activity_imports?${query}`); }
async function plannedWorkouts(token, userId) { const query = new URLSearchParams({ select: "id,title,sport,status,scheduled_date,timezone,estimated_duration_minutes,payload,created_at,updated_at", user_id: `eq.${userId}`, order: "scheduled_date.desc.nullslast,created_at.desc", limit: "30" }); const rows = await rest(token, `workouts?${query}`); return (Array.isArray(rows) ? rows : []).filter((row) => !["completed", "archived"].includes(row.status)).map((row) => ({ ...row, matchSource: "workout" })); }
async function athleteTimezone(token, userId) { const q = new URLSearchParams({ select:"timezone", user_id:`eq.${userId}`, limit:"1" }); const rows = await rest(token, `athlete_profiles?${q}`); return rows?.[0]?.timezone || "UTC"; }
async function activeProgramSessions(token, userId) {
  const pq = new URLSearchParams({ select:"id", user_id:`eq.${userId}`, status:"eq.active", order:"updated_at.desc", limit:"1" });
  const programs = await rest(token, `training_programs?${pq}`);
  const programId = programs?.[0]?.id;
  if (!programId) return [];
  const timezone = await athleteTimezone(token, userId).catch(() => "UTC");
  const q = new URLSearchParams({ select:"id,program_id,title,status,scheduled_date,workout_id,payload,rationale,revision,created_at,updated_at", user_id:`eq.${userId}`, program_id:`eq.${programId}`, status:"in.(planned,generated)", order:"scheduled_date.asc", limit:"40" });
  const rows = await rest(token, `program_sessions?${q}`);
  return (Array.isArray(rows) ? rows : []).map((row) => ({ ...row, timezone, sport:"strength", matchSource:"program_session" }));
}
async function createImport(token, row) { const rows = await rest(token, "garmin_activity_imports", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) }); return Array.isArray(rows) ? rows[0] : rows; }
async function createImportRaceSafe(token, userId, providerActivityId, fileHash, row) { try { return await createImport(token, row); } catch (error) { const raced = await existingImport(token, userId, providerActivityId, fileHash).catch(() => null); if (raced) return raced; throw error; } }
async function patchImport(token, id, patch) { await rest(token, `garmin_activity_imports?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }); }
async function createSession(token, row) { const rows = await rest(token, "workout_sessions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) }); return Array.isArray(rows) ? rows[0] : rows; }
async function cleanupSession(token, sessionId) { if (!sessionId) return; try { await rest(token, `workout_sessions?id=eq.${encodeURIComponent(sessionId)}`, { method: "DELETE" }); } catch {} }
async function markWorkoutCompleted(token, workout) { if (!workout?.id) return; const payload = { ...(workout.payload || {}), status: "completed" }; await rest(token, `workouts?id=eq.${encodeURIComponent(workout.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "completed", payload, updated_at: new Date().toISOString() }) }); }
async function markProgramSessionCompleted(token, programSession) { if (!programSession?.id) return; const rationale = { ...(programSession.rationale || {}), completionSource:"garmin", completedAt:new Date().toISOString() }; await rest(token, `program_sessions?id=eq.${encodeURIComponent(programSession.id)}`, { method:"PATCH", headers:{ Prefer:"return=minimal" }, body:JSON.stringify({ status:"completed", rationale, updated_at:new Date().toISOString() }) }); }
function providerState() { return { provider: "garmin", automaticSync: false, officialAccess: "waiting_for_garmin_access", ingestion: "ready", manualFitTest: true }; }
function duplicateResponse(res, activity, importRow) { return res.status(200).json({ imported: true, duplicate: true, providerActivityId: activity.providerActivityId, workoutSessionId: importRow.workout_session_id, match: importRow.metadata?.match || null, matchedProgramSessionId: importRow.metadata?.matchedProgramSessionId || null, adaptation: importRow.metadata?.adaptation || null, activity }); }
function adaptationSummary(result) {
  if (!result) return null;
  return {
    status: result.status || "unknown",
    reasonCode: result.reasonCode || null,
    proposalCount: Array.isArray(result.plan?.proposals) ? result.plan.proposals.length : 0,
    appliedProposalCount: Array.isArray(result.plan?.proposals) ? result.plan.proposals.filter((item) => item?.applied).length : 0,
    bundleCount: Number(result.bundleCount || result.bundles?.length || 0),
    appliedBundleCount: Array.isArray(result.appliedBundles) ? result.appliedBundles.length : 0,
    conflictCount: Array.isArray(result.conflicts) ? result.conflicts.length : 0,
  };
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return methodNotAllowed(res, ["GET", "POST"]);
  const token = bearerToken(req); const user = await authenticate(token); if (!user) return res.status(401).json({ error: "SIGN_IN_REQUIRED" });
  if (req.method === "GET") { const imports = await recentImports(token, user.id).catch(() => []); return res.status(200).json({ ...providerState(), imports }); }

  let activity;
  try { const bytes = decodeBase64Fit(req.body?.fitBase64); activity = parseGarminFitActivity(bytes, { providerActivityId: req.body?.providerActivityId || null }); }
  catch (error) { return res.status(400).json({ error: error?.message === "FIT_FILE_TOO_LARGE" ? "FIT_FILE_TOO_LARGE" : "FIT_PARSE_FAILED", message: fitParseMessage(error) }); }

  const providerActivityId = activity.providerActivityId;
  const duplicate = await existingImport(token, user.id, providerActivityId, activity.fileHash).catch(() => null);
  if (duplicate?.status === "imported") return duplicateResponse(res, activity, duplicate);

  if (!activity.isStrength) {
    const metadata = { reason: "NOT_STRENGTH_ACTIVITY", summary: activity.summary };
    const ignored = duplicate || await createImportRaceSafe(token, user.id, providerActivityId, activity.fileHash, { user_id: user.id, provider: "garmin", provider_activity_id: providerActivityId, fit_file_hash: activity.fileHash, sport: activity.sport, sub_sport: activity.subSport, started_at: activity.startedAt, completed_at: activity.completedAt, status: "ignored", metadata });
    if (ignored?.status === "imported") return duplicateResponse(res, activity, ignored);
    await patchImport(token, ignored.id, { status: "ignored", metadata });
    return res.status(422).json({ error: "NOT_STRENGTH_ACTIVITY", importId: ignored?.id, activity });
  }
  if (!activity.sets.length) {
    const metadata = { warning: "NO_STRENGTH_SETS_FOUND", summary: activity.summary };
    const parsed = duplicate || await createImportRaceSafe(token, user.id, providerActivityId, activity.fileHash, { user_id: user.id, provider: "garmin", provider_activity_id: providerActivityId, fit_file_hash: activity.fileHash, sport: activity.sport, sub_sport: activity.subSport, started_at: activity.startedAt, completed_at: activity.completedAt, status: "parsed", metadata });
    if (parsed?.status === "imported") return duplicateResponse(res, activity, parsed);
    await patchImport(token, parsed.id, { status: "parsed", metadata });
    return res.status(422).json({ error: "NO_STRENGTH_SETS_FOUND", importId: parsed?.id, activity });
  }

  const [candidatePrograms, candidateWorkouts] = await Promise.all([
    activeProgramSessions(token, user.id).catch(() => []),
    plannedWorkouts(token, user.id).catch(() => []),
  ]);
  const candidates = [...candidatePrograms, ...candidateWorkouts];
  const match = matchGarminActivityToWorkout(activity, candidates);
  const matchedTarget = match.matched ? candidates.find((row) => row.id === match.best?.workoutId) || null : null;
  const matchedProgramSession = matchedTarget?.matchSource === "program_session" ? matchedTarget : null;
  const matchedWorkout = matchedTarget?.matchSource === "workout" ? matchedTarget : null;
  const linkedWorkoutId = matchedProgramSession?.workout_id || matchedWorkout?.id || null;
  let importRow = duplicate;
  const baseMetadata = { summary: activity.summary, match, matchedProgramSessionId:matchedProgramSession?.id || null, matchedWorkoutId:linkedWorkoutId };
  if (!importRow) {
    importRow = await createImportRaceSafe(token, user.id, providerActivityId, activity.fileHash, { user_id: user.id, provider: "garmin", provider_activity_id: providerActivityId, fit_file_hash: activity.fileHash, sport: activity.sport, sub_sport: activity.subSport, started_at: activity.startedAt, completed_at: activity.completedAt, status: "parsed", metadata: baseMetadata });
    if (importRow?.status === "imported") return duplicateResponse(res, activity, importRow);
  } else await patchImport(token, importRow.id, { fit_file_hash: activity.fileHash, sport: activity.sport, sub_sport: activity.subSport, started_at: activity.startedAt, completed_at: activity.completedAt, status: "parsed", error_code: null, metadata: baseMetadata });

  let session = null;
  let importCommitted = false;
  try {
    const targetPlan = matchedProgramSession || matchedWorkout;
    session = await createSession(token, { user_id: user.id, workout_id: linkedWorkoutId, program_session_id: matchedProgramSession?.id || null, title: targetPlan?.title || activity.title, started_at: activity.startedAt || activity.completedAt || new Date().toISOString(), completed_at: activity.completedAt || new Date().toISOString(), duration_seconds: activity.durationSeconds, status: "completed", notes: matchedProgramSession ? "Automatically imported from Garmin FIT and matched to an active TrainSync program session." : matchedWorkout ? "Automatically imported from Garmin FIT and matched to a TrainSync workout." : "Automatically imported from Garmin FIT activity.", total_sets: activity.summary.totalSets, total_volume_kg: activity.summary.totalVolumeKg, source: "garmin", updated_at: new Date().toISOString() });
    if (!session?.id) throw new Error("SESSION_CREATE_FAILED");

    const setRows = activity.sets.map((set) => {
      const target = targetForGarminSet(set, targetPlan);
      const timed = set.metricType === "duration_seconds";
      const canonicalKey = target.plannedExerciseKey || normalizeExerciseKey(set.exerciseName);
      const canonicalName = target.plannedExercise || set.exerciseName;
      return {
        user_id: user.id, session_id: session.id, exercise_name: canonicalName, exercise_key: canonicalKey, exercise_order: set.exerciseOrder, set_index: set.setIndex,
        metric_type: timed ? "duration_seconds" : "reps",
        target_reps: timed ? null : target.targetReps,
        target_min_reps: timed ? null : target.targetMinReps,
        target_max_reps: timed ? null : target.targetMaxReps,
        target_duration_seconds: timed ? target.targetDurationSeconds : null,
        target_min_duration_seconds: timed ? target.targetMinDurationSeconds : null,
        target_max_duration_seconds: timed ? target.targetMaxDurationSeconds : null,
        target_weight_kg: target.targetWeightKg,
        target_rir: target.targetRir,
        reps: timed ? null : set.reps,
        duration_seconds: timed ? set.durationSeconds : null,
        weight_kg: set.weightKg, rpe: null, is_warmup: Boolean(set.isWarmup), completed_at: set.completedAt || activity.completedAt || new Date().toISOString(),
      };
    });
    await rest(token, "set_results", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(setRows) });

    const committedMetadata = { summary: activity.summary, title: activity.title, setCount: setRows.length, timedSetCount: setRows.filter((row) => row.metric_type === "duration_seconds").length, match, matchedProgramSessionId:matchedProgramSession?.id || null, matchedWorkoutId:linkedWorkoutId, workoutStatusUpdated:false, programSessionStatusUpdated:false, adaptation:null };
    await patchImport(token, importRow.id, { status: "imported", workout_session_id: session.id, error_code: null, metadata:committedMetadata });
    importCommitted = true;

    let workoutStatusUpdated = false, programSessionStatusUpdated = false;
    if (linkedWorkoutId) { try { await markWorkoutCompleted(token, { ...(matchedWorkout || {}), id:linkedWorkoutId, payload:matchedWorkout?.payload || matchedProgramSession?.payload || {} }); workoutStatusUpdated = true; } catch {} }
    if (matchedProgramSession) { try { await markProgramSessionCompleted(token, matchedProgramSession); programSessionStatusUpdated = true; } catch {} }

    let adaptationResult = null;
    if (matchedProgramSession && programSessionStatusUpdated) {
      try {
        adaptationResult = await runProgramAdaptation({ token, userId:user.id, workoutSessionId:session.id, apply:true });
      } catch (error) {
        adaptationResult = { status:"error", reasonCode:"ADAPTATION_POST_IMPORT_FAILED", message:error.message || "Adaptation failed after successful activity import." };
      }
    }
    const adaptation = adaptationSummary(adaptationResult);
    const metadata = { summary: activity.summary, title: activity.title, setCount: setRows.length, timedSetCount: setRows.filter((row) => row.metric_type === "duration_seconds").length, match, matchedProgramSessionId:matchedProgramSession?.id || null, matchedWorkoutId:linkedWorkoutId, workoutStatusUpdated, programSessionStatusUpdated, adaptation };
    await patchImport(token, importRow.id, { status: "imported", workout_session_id: session.id, error_code: null, metadata }).catch(() => {});
    return res.status(200).json({ imported: true, duplicate: false, providerActivityId, workoutSessionId: session.id, matchedProgramSessionId: matchedProgramSession?.id || null, matchedWorkoutId: linkedWorkoutId, workoutStatusUpdated, programSessionStatusUpdated, adaptation, match, activity });
  } catch (error) {
    if (!importCommitted) {
      await cleanupSession(token, session?.id);
      if (importRow?.id) await patchImport(token, importRow.id, { status: "failed", error_code: "IMPORT_FAILED", metadata: { message: error.message, summary: activity.summary, match } }).catch(() => {});
      return res.status(500).json({ error: "IMPORT_FAILED", message: "The FIT activity could not be saved. Your existing training data was not changed." });
    }
    return res.status(500).json({ error: "POST_IMPORT_UPDATE_FAILED", message: "The FIT activity was saved, but a follow-up program status update needs retry." });
  }
}
