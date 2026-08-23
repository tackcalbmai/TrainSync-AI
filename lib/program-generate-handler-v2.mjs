import { stableHash } from "./workout.mjs";
import { summarizeTrainingContext, trainingContextInstructions } from "./training-context.mjs";
import { EVIDENCE_VERSION, validateProgram } from "./programming-engine.mjs";
import {
  EXERCISE_CATALOG_VERSION,
  canonicalizeExerciseSelection,
  compactCatalogPrompt,
  exerciseCatalogForEquipment,
  exerciseKeysForEquipment,
} from "./exercise-catalog.mjs";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";
const DEFAULT_MODEL = "gpt-5.6-luna";
const GOALS = new Set(["strength","hypertrophy","general_fitness","fat_loss","mixed"]);
const MUSCLES = ["chest","lats","upper_back","front_delts","side_delts","rear_delts","biceps","triceps","quads","hamstrings","glutes","calves","adductors","abductors","forearms","abs","spinal_erectors"];
const ROLES = ["primary_strength","secondary_strength","hypertrophy_compound","accessory","isolation","power"];
const ALWAYS_AVAILABLE = new Set(["bodyweight","floor","wall"]);
const BLOCKING_WARNING_CODES = new Set([
  "HEAVY_PRIORITY_SUPERSET",
  "COMPETING_SUPERSET",
  "SHARED_LIMITER_SUPERSET",
  "HINGE_SUPERSET",
  "PRIMARY_STRENGTH_REP_RANGE_BROAD",
  "BODYWEIGHT_PROGRESSION_MISMATCH",
  "TRACKABILITY_METADATA_MISSING",
  "MIXED_SET_METRIC",
  "SESSION_TIME_MISMATCH",
  "HEAVY_REST_SHORT",
  "COMPOUND_REST_SHORT",
  "REPEATED_COMPOUND_FAILURE",
  "PRIORITY_STIMULUS_LOW",
  "PRIORITY_ONLY_INDIRECT",
]);

function programFormat(allowedKeys) {
  return {
    type: "json_schema",
    name: "trainsync_catalog_program_microcycle",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["title","summary","goal","progressionStrategy","sessions"],
      properties: {
        title: { type:"string", minLength:1, maxLength:80 },
        summary: { type:"string", minLength:1, maxLength:500 },
        goal: { type:"string", enum:[...GOALS] },
        progressionStrategy: { type:"string", enum:["double_progression","load_progression","autoregulated_strength","mixed"] },
        sessions: {
          type:"array", minItems:1, maxItems:7,
          items: {
            type:"object", additionalProperties:false,
            required:["dayIndex","title","focus","estimatedDurationMinutes","exercises"],
            properties: {
              dayIndex:{ type:"integer", minimum:1, maximum:7 },
              title:{ type:"string", minLength:1, maxLength:80 },
              focus:{ type:"string", minLength:1, maxLength:160 },
              estimatedDurationMinutes:{ type:"integer", minimum:15, maximum:240 },
              exercises:{
                type:"array", minItems:1, maxItems:16,
                items:{
                  type:"object", additionalProperties:false,
                  required:["exerciseKey","role","notes","setCount","minReps","maxReps","minDurationSeconds","maxDurationSeconds","targetRir","restSec","progressionNote","supersetGroup"],
                  properties:{
                    exerciseKey:{ type:"string", enum:allowedKeys },
                    role:{ type:"string", enum:ROLES },
                    notes:{ type:"string", maxLength:280 },
                    setCount:{ type:"integer", minimum:1, maximum:8 },
                    minReps:{ type:["integer","null"], minimum:1, maximum:40 },
                    maxReps:{ type:["integer","null"], minimum:1, maximum:40 },
                    minDurationSeconds:{ type:["integer","null"], minimum:5, maximum:600 },
                    maxDurationSeconds:{ type:["integer","null"], minimum:5, maximum:600 },
                    targetRir:{ type:["number","null"], minimum:0, maximum:5 },
                    restSec:{ type:"integer", minimum:30, maximum:600 },
                    progressionNote:{ type:"string", minLength:1, maxLength:240 },
                    supersetGroup:{ type:["string","null"], maxLength:20 }
                  }
                }
              }
            }
          }
        }
      }
    }
  };
}

function bearer(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers?.authorization || "");
  return match?.[1] || null;
}
function sbHeaders(token) { return { apikey:SUPABASE_KEY, Authorization:`Bearer ${token}` }; }
async function authenticate(token) {
  if (!token) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:sbHeaders(token), signal:AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id ? user : null;
  } catch { return null; }
}
async function profile(token, userId) {
  try {
    const q = new URLSearchParams({ select:"timezone,units,goal,experience_level,default_workout_minutes,equipment", user_id:`eq.${userId}`, limit:"1" });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/athlete_profiles?${q}`, { headers:sbHeaders(token), signal:AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    return (await response.json())?.[0] || null;
  } catch { return null; }
}
async function trainingContext(token, userId) {
  try {
    const sq = new URLSearchParams({ select:"exercise_name,exercise_key,metric_type,reps,duration_seconds,weight_kg,rpe,target_reps,target_min_reps,target_max_reps,target_duration_seconds,target_min_duration_seconds,target_max_duration_seconds,target_weight_kg,is_warmup,completed_at", user_id:`eq.${userId}`, is_warmup:"eq.false", order:"completed_at.desc", limit:"300" });
    const wq = new URLSearchParams({ select:"title,completed_at,duration_seconds,status,total_sets,total_volume_kg", user_id:`eq.${userId}`, status:"eq.completed", order:"completed_at.desc", limit:"40" });
    const [setsResponse, sessionsResponse] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/set_results?${sq}`, { headers:sbHeaders(token), signal:AbortSignal.timeout(8000) }),
      fetch(`${SUPABASE_URL}/rest/v1/workout_sessions?${wq}`, { headers:sbHeaders(token), signal:AbortSignal.timeout(8000) }),
    ]);
    return summarizeTrainingContext(setsResponse.ok ? await setsResponse.json() : [], sessionsResponse.ok ? await sessionsResponse.json() : []);
  } catch { return summarizeTrainingContext([], []); }
}
function resolveKey() { return process.env.OPENAI_API_KEY || process.env.OPENAI_APY_KEY || process.env.openai_api_key || process.env.oepnai_api_key; }
function outputText(response) {
  return (response?.output || []).filter((item) => item?.type === "message").flatMap((item) => item.content || []).filter((item) => item?.type === "output_text").map((item) => item.text || "").join("").trim();
}
function isoDate(date) { return date.toISOString().slice(0,10); }
function mondayOf(dateText) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateText || "") ? new Date(`${dateText}T12:00:00Z`) : new Date();
  if (Number.isNaN(date.getTime())) return isoDate(new Date());
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (day - 1));
  return isoDate(date);
}
function weekDate(weekStart, weekIndex, dayIndex) {
  const base = new Date(`${weekStart}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + (weekIndex - 1) * 7 + (dayIndex - 1));
  return isoDate(base);
}
function allowedEquipment(userProfile) {
  return new Set([...ALWAYS_AVAILABLE, ...(Array.isArray(userProfile?.equipment) ? userProfile.equipment : [])]);
}
function validateRequest(body, userProfile) {
  const proposedGoal = body.goal || userProfile?.goal || "general_fitness";
  const goal = GOALS.has(proposedGoal) ? proposedGoal : "general_fitness";
  const durationWeeks = Math.max(2, Math.min(24, Math.round(Number(body.durationWeeks) || 8)));
  const availableDays = [...new Set((Array.isArray(body.availableDays) ? body.availableDays : [1,3,5]).map(Number).filter((value) => value >= 1 && value <= 7))].sort((a,b) => a-b);
  if (!availableDays.length) throw Object.assign(new Error("Choose at least one training day."), { status:400, code:"TRAINING_DAYS_REQUIRED" });
  const sessionMinutes = Math.max(15, Math.min(240, Math.round(Number(body.sessionMinutes) || userProfile?.default_workout_minutes || 50)));
  return {
    goal,
    durationWeeks,
    availableDays,
    weekStart:mondayOf(body.weekStart),
    sessionMinutes,
    priority:String(body.priority || "").trim().slice(0,500),
    priorityMuscles:[...new Set((Array.isArray(body.priorityMuscles) ? body.priorityMuscles : []).filter((muscle) => MUSCLES.includes(muscle)))].slice(0,6),
    timeEfficient:body.timeEfficient === true,
  };
}
function normalizeExercise(selection) {
  const exercise = canonicalizeExerciseSelection(selection);
  if (!exercise) throw Object.assign(new Error(`Unknown exercise catalog key: ${selection?.exerciseKey || "missing"}`), { code:"EXERCISE_CATALOG_MISS" });
  const timed = exercise.setMetric === "duration_seconds";
  const sets = Array.from({ length:exercise.setCount }, (_, index) => ({
    index:index + 1,
    metricType:timed ? "duration_seconds" : "reps",
    minReps:timed ? null : exercise.minReps,
    maxReps:timed ? null : exercise.maxReps,
    minDurationSeconds:timed ? exercise.minDurationSeconds : null,
    maxDurationSeconds:timed ? exercise.maxDurationSeconds : null,
    targetRir:timed ? null : exercise.targetRir,
    restSec:exercise.restSec,
    weightKg:null,
  }));
  return {
    name:exercise.name,
    exerciseKey:exercise.exerciseKey,
    catalogVersion:exercise.catalogVersion,
    exerciseFamily:exercise.exerciseFamily,
    role:exercise.role,
    movementPattern:exercise.movementPattern,
    loadType:exercise.loadType,
    progressionMode:exercise.progressionMode,
    setMetric:exercise.setMetric,
    requiredEquipment:exercise.requiredEquipment,
    primaryMuscles:exercise.primaryMuscles,
    secondaryMuscles:exercise.secondaryMuscles,
    fatigueTags:exercise.fatigueTags || [],
    notes:exercise.notes?.trim?.() || "",
    progressionNote:exercise.progressionNote.trim(),
    supersetGroup:exercise.supersetGroup || null,
    sets,
  };
}
function normalizeDraft(draft, request, userProfile) {
  const templates = draft.sessions.map((session) => ({
    dayIndex:session.dayIndex,
    title:session.title.trim(),
    focus:session.focus.trim(),
    estimatedDurationMinutes:request.sessionMinutes,
    aiEstimatedDurationMinutes:session.estimatedDurationMinutes,
    exercises:session.exercises.map(normalizeExercise),
  })).sort((a,b) => a.dayIndex - b.dayIndex);
  const identity = JSON.stringify({ title:draft.title, goal:request.goal, weekStart:request.weekStart, durationWeeks:request.durationWeeks, catalogVersion:EXERCISE_CATALOG_VERSION, templates });
  const clientProgramId = `prg_${stableHash(identity)}`;
  const sessions = [];
  for (let week = 1; week <= request.durationWeeks; week += 1) {
    for (const template of templates) {
      sessions.push({
        weekIndex:week,
        dayIndex:template.dayIndex,
        slotIndex:1,
        scheduledDate:weekDate(request.weekStart, week, template.dayIndex),
        title:template.title,
        status:"planned",
        payload:{
          title:template.title,
          focus:template.focus,
          estimatedDurationMinutes:request.sessionMinutes,
          aiEstimatedDurationMinutes:template.aiEstimatedDurationMinutes,
          exercises:template.exercises,
          progressionStrategy:draft.progressionStrategy,
          catalogVersion:EXERCISE_CATALOG_VERSION,
          week,
        },
        rationale:{ source:"openai_catalog", evidenceVersion:EVIDENCE_VERSION, adaptive:true, note:week === 1 ? "Initial catalog-constrained evidence-checked microcycle." : "Stable microcycle; future prescriptions adapt from completed performance." },
      });
    }
  }
  return {
    clientProgramId,
    title:draft.title.trim(),
    summary:draft.summary.trim(),
    goal:request.goal,
    status:"draft",
    startDate:request.weekStart,
    durationWeeks:request.durationWeeks,
    daysPerWeek:templates.length,
    defaultSessionMinutes:request.sessionMinutes,
    progressionStrategy:draft.progressionStrategy,
    priority:{ text:request.priority || "", muscles:request.priorityMuscles || [] },
    settings:{
      availableDays:request.availableDays,
      timeEfficient:Boolean(request.timeEfficient),
      adaptive:true,
      preserveExerciseContinuity:true,
      trackBodyweightVariants:true,
      exerciseCatalogVersion:EXERCISE_CATALOG_VERSION,
      exerciseCatalogEnforced:true,
      equipmentContract:[...allowedEquipment(userProfile)],
      summary:draft.summary.trim(),
    },
    evidenceVersion:EVIDENCE_VERSION,
    templates,
    sessions,
  };
}
function returnedDaysIssue(draft, request) {
  const returnedDays = [...new Set((draft?.sessions || []).map((session) => session.dayIndex))].sort((a,b) => a-b);
  return JSON.stringify(returnedDays) === JSON.stringify(request.availableDays) ? null : `Training days were ${returnedDays.join(",") || "missing"}; required ${request.availableDays.join(",")}.`;
}
function blockingWarnings(validation) {
  return (validation?.warnings || []).filter((item) => BLOCKING_WARNING_CODES.has(item.code));
}
function repairMessage(dayIssue, validation) {
  const parts = [];
  if (dayIssue) parts.push(dayIssue);
  if (validation && !validation.valid) parts.push(`Errors: ${validation.errors.slice(0,8).map((item) => `${item.code}: ${item.message}`).join("; ")}.`);
  const blocking = blockingWarnings(validation);
  if (blocking.length) parts.push(`Blocking quality warnings: ${blocking.slice(0,10).map((item) => `${item.code}: ${item.message}`).join("; ")}.`);
  return parts.join(" ").slice(0,5000);
}
function baseInstructions(request, userProfile, history, catalogEntries) {
  const experience = userProfile?.experience_level || "not specified";
  const equipment = [...allowedEquipment(userProfile)].join(", ");
  return [
    "You are the resistance-program design component of TrainSync AI.",
    "Choose exercises ONLY by exerciseKey from the supplied TrainSync catalog. The catalog, not you, owns exercise names, anatomy, movement patterns, equipment requirements, load type and progression mode.",
    "Never invent an exercise key, never alter the meaning of a catalog exercise, and never compensate for missing equipment with an unlisted exercise.",
    "Design one stable weekly microcycle repeated across the requested block. Do not create novelty just because the calendar week changes; later TrainSync adaptations use completed performance.",
    "The user's goal, exact training days, priority muscles, time target and equipment are authoritative.",
    "For hypertrophy, use enough hard work to be productive without redundant junk volume. Usually stop repetition work around 1-3 RIR. Distribute volume across the week when possible.",
    "For strength roles, choose a sufficiently demanding movement and keep the normal rep ceiling at or below 10. Give priority strength work at least 120 seconds rest unless a very clear reason exists.",
    "Do not pair primary_strength work in supersets. Supersets must be genuinely non-competing: avoid shared primary muscles, grip-limited pairings, shared spinal-erector/bracing bottlenecks, or pairings that degrade a priority lift.",
    "For catalog exercises whose default metric is duration_seconds, set minReps/maxReps/targetRir to null and provide duration fields. For all other exercises, provide rep fields and set duration fields to null.",
    "Do not prescribe unknown working weights. Progression notes should explain how the athlete advances using reps, load, or the cataloged variation identity without silently changing the exercise.",
    `Goal: ${request.goal}. Experience: ${experience}. Session time contract: ${request.sessionMinutes} minutes. Training days Monday=1: ${request.availableDays.join(",")}. Allowed equipment/support: ${equipment}.`,
    request.timeEfficient ? "Time-efficient mode is ON: use supersets only where they preserve performance and help meet the time contract." : "Time-efficient mode is OFF: supersets are optional and should not be forced.",
    request.priorityMuscles.length ? `Explicit priority muscles: ${request.priorityMuscles.join(",")}. Give them meaningful direct weekly work.` : "No explicit priority muscles selected.",
    request.priority ? `Additional user constraint: ${request.priority}.` : "No additional free-text constraint.",
    ...trainingContextInstructions(history),
    `TRAINSync exercise catalog v${EXERCISE_CATALOG_VERSION}: ${compactCatalogPrompt(catalogEntries)}`,
    "Return exactly one session template for each requested training day. The estimatedDurationMinutes field is your estimate, but TrainSync will independently calculate duration and reject material mismatch.",
  ];
}
async function callOpenAI(request, userProfile, history, catalogEntries, allowedKeys, correction = "") {
  const apiKey = resolveKey();
  if (!apiKey) throw Object.assign(new Error("OpenAI is not configured."), { status:503, code:"AI_NOT_CONFIGURED" });
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const instructions = [...baseInstructions(request, userProfile, history, catalogEntries), correction ? `SELF-REPAIR: The prior draft failed TrainSync quality gates. Correct these exact issues while preserving user constraints: ${correction}` : ""].filter(Boolean).join(" ");
  const response = await fetch(OPENAI_URL, {
    method:"POST",
    headers:{ Authorization:`Bearer ${apiKey}`, "Content-Type":"application/json" },
    body:JSON.stringify({
      model,
      store:false,
      instructions,
      input:correction ? "Return a corrected catalog-constrained TrainSync program." : "Create the catalog-constrained TrainSync multi-week program microcycle.",
      text:{ format:programFormat(allowedKeys) },
    }),
    signal:AbortSignal.timeout(45000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(body?.error?.message || `OpenAI request failed (${response.status}).`), { status:response.status, code:body?.error?.code || "OPENAI_API_ERROR" });
  const text = outputText(body);
  if (!text) throw Object.assign(new Error("OpenAI returned no program."), { code:"OPENAI_EMPTY_OUTPUT" });
  let draft;
  try { draft = JSON.parse(text); }
  catch { throw Object.assign(new Error("OpenAI returned invalid structured program data."), { code:"OPENAI_INVALID_OUTPUT" }); }
  return { draft, model, responseId:body.id || null };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error:"METHOD_NOT_ALLOWED" });
  const token = bearer(req);
  const user = await authenticate(token);
  if (!user) return res.status(401).json({ error:"SIGN_IN_REQUIRED", message:"Sign in to create a training program." });
  const [userProfile, history] = await Promise.all([profile(token, user.id), trainingContext(token, user.id)]);
  let request;
  try { request = validateRequest(req.body || {}, userProfile); }
  catch (error) { return res.status(error.status || 400).json({ error:error.code || "PROGRAM_REQUEST_INVALID", message:error.message }); }

  const profileEquipment = Array.isArray(userProfile?.equipment) ? userProfile.equipment : [];
  const allowedKeys = exerciseKeysForEquipment(profileEquipment);
  const catalogEntries = exerciseCatalogForEquipment(profileEquipment);
  if (!allowedKeys.length) return res.status(422).json({ error:"EXERCISE_CATALOG_EMPTY", message:"No catalog exercises match the athlete equipment profile." });

  try {
    let correction = "", lastValidation = null, generated = null, program = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      generated = await callOpenAI(request, userProfile, history, catalogEntries, allowedKeys, correction);
      const dayIssue = returnedDaysIssue(generated.draft, request);
      program = normalizeDraft(generated.draft, request, userProfile);
      lastValidation = validateProgram({
        title:program.title,
        goal:program.goal,
        durationWeeks:program.durationWeeks,
        daysPerWeek:program.daysPerWeek,
        defaultSessionMinutes:program.defaultSessionMinutes,
        priority:program.priority,
      }, program.sessions);
      const blocking = blockingWarnings(lastValidation);
      if (!dayIssue && lastValidation.valid && !blocking.length) {
        return res.status(200).json({
          program,
          validation:lastValidation,
          ai:{ mode:"openai_catalog", model:generated.model, responseId:generated.responseId, profileApplied:Boolean(userProfile), historyApplied:Boolean(history?.hasData), selfRepairAttempts:attempt - 1, exerciseCatalogVersion:EXERCISE_CATALOG_VERSION, allowedExerciseCount:allowedKeys.length },
        });
      }
      correction = repairMessage(dayIssue, lastValidation);
    }
    return res.status(422).json({
      error:"PROGRAM_QUALITY_GATE_FAILED",
      message:"TrainSync rejected the AI program after automatic repair attempts.",
      validation:lastValidation,
      blockingWarnings:blockingWarnings(lastValidation),
      exerciseCatalogVersion:EXERCISE_CATALOG_VERSION,
    });
  } catch (error) {
    return res.status(error.status === 429 ? 429 : error.status || 502).json({ error:error.code || "PROGRAM_GENERATION_FAILED", message:error.message || "Program generation failed." });
  }
}
