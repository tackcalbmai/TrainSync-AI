import { stableHash } from "./workout.mjs";
import { summarizeTrainingContext, trainingContextInstructions } from "./training-context.mjs";
import { EVIDENCE_VERSION, exerciseKey as canonicalExerciseKey, validateProgram } from "./programming-engine.mjs";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";
const DEFAULT_MODEL = "gpt-5.6-luna";
const GOALS = new Set(["strength","hypertrophy","general_fitness","fat_loss","mixed"]);
const MUSCLES = ["chest","lats","upper_back","front_delts","side_delts","rear_delts","biceps","triceps","quads","hamstrings","glutes","calves","adductors","abductors","forearms","abs","spinal_erectors"];
const MOVEMENT_PATTERNS = ["horizontal_push","vertical_push","horizontal_pull","vertical_pull","squat","lunge","hinge","calf","core","carry","isolation","other"];
const LOAD_TYPES = ["external_weight","bodyweight","assisted_bodyweight","mixed"];
const PROGRESSION_MODES = ["double_progression","load_progression","variant_progression","reps_only","duration_progression"];
const SET_METRICS = ["reps","duration_seconds"];
const EQUIPMENT_REQUIREMENTS = ["bodyweight","floor","wall","pull_up_bar","kettlebells","barbell","dumbbells","bench","rack","cables","machines","low_bar","table","chair"];
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
]);

const programFormat = {
  type: "json_schema",
  name: "trainsync_program_microcycle",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title","summary","goal","progressionStrategy","sessions"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 80 },
      summary: { type: "string", minLength: 1, maxLength: 500 },
      goal: { type: "string", enum: [...GOALS] },
      progressionStrategy: { type: "string", enum: ["double_progression","load_progression","autoregulated_strength","mixed"] },
      sessions: {
        type: "array",
        minItems: 1,
        maxItems: 7,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["dayIndex","title","focus","estimatedDurationMinutes","exercises"],
          properties: {
            dayIndex: { type: "integer", minimum: 1, maximum: 7 },
            title: { type: "string", minLength: 1, maxLength: 80 },
            focus: { type: "string", minLength: 1, maxLength: 160 },
            estimatedDurationMinutes: { type: "integer", minimum: 15, maximum: 240 },
            exercises: {
              type: "array",
              minItems: 1,
              maxItems: 16,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name","exerciseKey","role","movementPattern","loadType","progressionMode","setMetric","requiredEquipment","primaryMuscles","secondaryMuscles","notes","setCount","minReps","maxReps","minDurationSeconds","maxDurationSeconds","targetRir","restSec","progressionNote","supersetGroup"],
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 100 },
                  exerciseKey: { type: "string", minLength: 1, maxLength: 100 },
                  role: { type: "string", enum: ["primary_strength","secondary_strength","hypertrophy_compound","accessory","isolation","power"] },
                  movementPattern: { type: "string", enum: MOVEMENT_PATTERNS },
                  loadType: { type: "string", enum: LOAD_TYPES },
                  progressionMode: { type: "string", enum: PROGRESSION_MODES },
                  setMetric: { type: "string", enum: SET_METRICS },
                  requiredEquipment: { type: "array", maxItems: 4, items: { type: "string", enum: EQUIPMENT_REQUIREMENTS } },
                  primaryMuscles: { type: "array", minItems: 1, maxItems: 2, items: { type: "string", enum: MUSCLES } },
                  secondaryMuscles: { type: "array", maxItems: 6, items: { type: "string", enum: MUSCLES } },
                  notes: { type: "string", maxLength: 280 },
                  setCount: { type: "integer", minimum: 1, maximum: 8 },
                  minReps: { type: ["integer","null"], minimum: 1, maximum: 40 },
                  maxReps: { type: ["integer","null"], minimum: 1, maximum: 40 },
                  minDurationSeconds: { type: ["integer","null"], minimum: 5, maximum: 600 },
                  maxDurationSeconds: { type: ["integer","null"], minimum: 5, maximum: 600 },
                  targetRir: { type: ["number","null"], minimum: 0, maximum: 5 },
                  restSec: { type: "integer", minimum: 30, maximum: 600 },
                  progressionNote: { type: "string", minLength: 1, maxLength: 240 },
                  supersetGroup: { type: ["string","null"], maxLength: 20 }
                }
              }
            }
          }
        }
      }
    }
  }
};

function bearer(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers?.authorization || "");
  return match?.[1] || null;
}
function sbHeaders(token) { return { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }; }
async function authenticate(token) {
  if (!token) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: sbHeaders(token), signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id ? user : null;
  } catch { return null; }
}
async function profile(token, userId) {
  try {
    const q = new URLSearchParams({ select: "timezone,units,goal,experience_level,default_workout_minutes,equipment", user_id: `eq.${userId}`, limit: "1" });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/athlete_profiles?${q}`, { headers: sbHeaders(token), signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    return (await response.json())?.[0] || null;
  } catch { return null; }
}
async function trainingContext(token, userId) {
  try {
    const sq = new URLSearchParams({ select: "exercise_name,exercise_key,metric_type,reps,duration_seconds,weight_kg,rpe,target_reps,target_min_reps,target_max_reps,target_duration_seconds,target_min_duration_seconds,target_max_duration_seconds,target_weight_kg,is_warmup,completed_at", user_id: `eq.${userId}`, is_warmup: "eq.false", order: "completed_at.desc", limit: "300" });
    const wq = new URLSearchParams({ select: "title,completed_at,duration_seconds,status,total_sets,total_volume_kg", user_id: `eq.${userId}`, status: "eq.completed", order: "completed_at.desc", limit: "40" });
    const [setsResponse, sessionsResponse] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/set_results?${sq}`, { headers: sbHeaders(token), signal: AbortSignal.timeout(8000) }),
      fetch(`${SUPABASE_URL}/rest/v1/workout_sessions?${wq}`, { headers: sbHeaders(token), signal: AbortSignal.timeout(8000) }),
    ]);
    return summarizeTrainingContext(setsResponse.ok ? await setsResponse.json() : [], sessionsResponse.ok ? await sessionsResponse.json() : []);
  } catch { return summarizeTrainingContext([], []); }
}
function resolveKey() { return process.env.OPENAI_API_KEY || process.env.OPENAI_APY_KEY || process.env.openai_api_key || process.env.oepnai_api_key; }
function outputText(response) {
  return (response?.output || []).filter((item) => item?.type === "message").flatMap((item) => item.content || []).filter((item) => item?.type === "output_text").map((item) => item.text || "").join("").trim();
}
function isoDate(date) { return date.toISOString().slice(0, 10); }
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
function equipmentViolations(draft, userProfile) {
  const allowed = allowedEquipment(userProfile);
  const violations = [];
  for (const session of draft?.sessions || []) {
    for (const exercise of session?.exercises || []) {
      const required = Array.isArray(exercise.requiredEquipment) ? exercise.requiredEquipment : [];
      const missing = required.filter((item) => !allowed.has(item));
      if (missing.length) violations.push({ exercise: exercise.name, missing });
    }
  }
  return violations;
}
function normalizeExercise(exercise) {
  const timed = exercise.setMetric === "duration_seconds";
  const name = exercise.name.trim();
  const sets = Array.from({ length: exercise.setCount }, (_, index) => ({
    index: index + 1,
    metricType: timed ? "duration_seconds" : "reps",
    minReps: timed ? null : exercise.minReps,
    maxReps: timed ? null : exercise.maxReps,
    minDurationSeconds: timed ? exercise.minDurationSeconds : null,
    maxDurationSeconds: timed ? exercise.maxDurationSeconds : null,
    targetRir: timed ? null : exercise.targetRir,
    restSec: exercise.restSec,
    weightKg: null,
  }));
  return {
    name,
    exerciseKey: canonicalExerciseKey(name),
    role: exercise.role,
    movementPattern: exercise.movementPattern,
    loadType: exercise.loadType,
    progressionMode: exercise.progressionMode,
    setMetric: timed ? "duration_seconds" : "reps",
    requiredEquipment: exercise.requiredEquipment || [],
    primaryMuscles: exercise.primaryMuscles,
    secondaryMuscles: exercise.secondaryMuscles,
    notes: exercise.notes?.trim?.() || "",
    progressionNote: exercise.progressionNote.trim(),
    supersetGroup: exercise.supersetGroup || null,
    sets,
  };
}
function normalizeDraft(draft, request, userProfile) {
  const durationWeeks = request.durationWeeks;
  const weekStart = request.weekStart;
  const templates = draft.sessions.map((session) => ({
    dayIndex: session.dayIndex,
    title: session.title.trim(),
    focus: session.focus.trim(),
    estimatedDurationMinutes: request.sessionMinutes,
    aiEstimatedDurationMinutes: session.estimatedDurationMinutes,
    exercises: session.exercises.map(normalizeExercise),
  })).sort((a, b) => a.dayIndex - b.dayIndex);
  const identity = JSON.stringify({ title: draft.title, goal: request.goal, weekStart, durationWeeks, templates });
  const programId = `prg_${stableHash(identity)}`;
  const sessions = [];
  for (let week = 1; week <= durationWeeks; week += 1) {
    for (const template of templates) {
      sessions.push({
        weekIndex: week,
        dayIndex: template.dayIndex,
        slotIndex: 1,
        scheduledDate: weekDate(weekStart, week, template.dayIndex),
        title: template.title,
        status: "planned",
        payload: {
          title: template.title,
          focus: template.focus,
          estimatedDurationMinutes: request.sessionMinutes,
          aiEstimatedDurationMinutes: template.aiEstimatedDurationMinutes,
          exercises: template.exercises,
          progressionStrategy: draft.progressionStrategy,
          week,
        },
        rationale: {
          source: "openai",
          evidenceVersion: EVIDENCE_VERSION,
          adaptive: true,
          note: week === 1 ? "Initial evidence-constrained microcycle." : "Scheduled from the stable microcycle; future prescriptions may adapt from completed performance.",
        }
      });
    }
  }
  return {
    clientProgramId: programId,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    goal: request.goal,
    status: "draft",
    startDate: weekStart,
    durationWeeks,
    daysPerWeek: templates.length,
    defaultSessionMinutes: request.sessionMinutes || userProfile?.default_workout_minutes || 50,
    progressionStrategy: draft.progressionStrategy,
    priority: { text: request.priority || "", muscles: request.priorityMuscles || [] },
    settings: {
      availableDays: request.availableDays,
      timeEfficient: Boolean(request.timeEfficient),
      adaptive: true,
      preserveExerciseContinuity: true,
      trackBodyweightVariants: true,
      setMetrics: SET_METRICS,
      equipmentContract: [...allowedEquipment(userProfile)],
      summary: draft.summary.trim(),
    },
    evidenceVersion: EVIDENCE_VERSION,
    templates,
    sessions,
  };
}
function validateRequest(body, userProfile) {
  const proposedGoal = body.goal || userProfile?.goal || "general_fitness";
  const goal = GOALS.has(proposedGoal) ? proposedGoal : "general_fitness";
  const durationWeeks = Math.max(2, Math.min(24, Math.round(Number(body.durationWeeks) || 8)));
  const availableDays = [...new Set((Array.isArray(body.availableDays) ? body.availableDays : [1,3,5]).map(Number).filter((value) => value >= 1 && value <= 7))].sort((a,b) => a-b);
  if (!availableDays.length) throw Object.assign(new Error("Choose at least one training day."), { status: 400, code: "TRAINING_DAYS_REQUIRED" });
  return {
    goal,
    durationWeeks,
    availableDays,
    weekStart: mondayOf(body.weekStart),
    sessionMinutes: Math.max(15, Math.min(240, Math.round(Number(body.sessionMinutes) || userProfile?.default_workout_minutes || 50))),
    priority: String(body.priority || "").trim().slice(0, 500),
    priorityMuscles: [...new Set((Array.isArray(body.priorityMuscles) ? body.priorityMuscles : []).filter((muscle) => MUSCLES.includes(muscle)))].slice(0, 6),
    timeEfficient: body.timeEfficient === true,
  };
}
function baseInstructions(request, userProfile, history) {
  const equipment = [...allowedEquipment(userProfile)].join(", ");
  const experience = userProfile?.experience_level || "not specified";
  return [
    "You are the program-design component of TrainSync AI. Design one stable weekly resistance-training microcycle that will be repeated and adaptively progressed across multiple weeks.",
    "Do not create random exercise novelty or predetermined weekly load jumps. TrainSync adapts future sessions after actual performance is recorded.",
    "The user's requested goal, training days, explicit priority muscles, time target and equipment constraints are authoritative. Do not reinterpret them into a different goal.",
    "Weekly training volume has diminishing returns. Distribute useful volume, preserve exercise continuity, and avoid redundant fatigue. Do not inflate volume merely to make a priority visible.",
    "primaryMuscles means the intended main training target of the exercise, not every muscle involved. Use at most two primary muscles. Put synergists in secondaryMuscles. For a chest-focused push-up, chest is primary while triceps/front delts are normally secondary; for a pike push-up, front delts are normally primary while triceps/chest are secondary; for a pull-up, lats are normally primary while biceps/upper back are secondary unless the variation is intentionally biased otherwise.",
    "For maximal strength, prioritize specific high-force work while retaining repetitions in reserve. Bodyweight primary_strength work should use a sufficiently difficult named variation so its normal work range is roughly 3-10 reps at target RIR.",
    "For hypertrophy, use multiple sufficiently hard sets across practical rep ranges; most repetition-based work should normally stop around 1-3 RIR rather than requiring failure.",
    "A preference for bodyweight does not override progressive overload. Do not satisfy a hypertrophy priority mostly with low-load activation or mobility-style movements when a more loadable option exists within the allowed equipment. Use bodyweight where it produces a meaningful, trackable stimulus and use available external load where bodyweight is poorly suited to the target muscle.",
    "Use adequate rest: usually at least 2 minutes for heavy priority compounds, commonly 90-180 seconds for hypertrophy compounds, and shorter rests only where performance is unlikely to be compromised.",
    "Put priority exercises or muscles early. Do not force a fixed deload week or treat 10 sets/week, 48h recovery, 8-12 reps, or failure as universal laws.",
    "Every exercise must map primary/secondary muscles and one movementPattern.",
    "Every exercise must declare all required physical support/equipment in requiredEquipment. Allowed equipment/support is authoritative. Never assume bench, chair, table, low bar, rack, cables, machines or other support unless listed. Floor and wall are available.",
    "For repetition work use setMetric=reps, non-null minReps/maxReps, null duration fields. For timed isometrics use setMetric=duration_seconds, non-null minDurationSeconds/maxDurationSeconds, null rep fields, targetRir=null, and duration_progression or variant_progression. Never encode seconds as repetitions.",
    "For bodyweight exercises, progression must remain trackable. Prefer discrete named variations; do not continuously change foot height, hand height, pike angle, assistance or range of motion inside the same exercise identity. If progression ultimately requires a harder named variation, prefer progressionMode=variant_progression.",
    "Use the exact same exercise name whenever the same variation appears on multiple days. Do not create day-specific exercise identities such as pike_push_up_friday for the same Pike Push-Up.",
    request.timeEfficient
      ? "TIME-EFFICIENT MODE: use supersets only when they are genuinely non-competing. Do not superset two strength-focused exercises. Do not superset a primary_strength exercise with an exercise that directly targets one of its major primary or secondary muscles. Avoid shared grip, spinal-erector, unsupported bent-over, or bracing limiters. Never pair a hinge compound such as an RDL with an unsupported bent-over row/reverse-fly accessory."
      : "Do not use supersets unless they clearly improve practicality.",
    `Goal: ${request.goal}. Experience: ${experience}. Allowed equipment/support only: ${equipment}. Session time target: ${request.sessionMinutes} minutes. Training days (Monday=1): ${request.availableDays.join(", ")}.`,
    request.priorityMuscles.length ? `Explicit priority muscles: ${request.priorityMuscles.join(", ")}. These must receive meaningful weekly work.` : "No explicit priority muscles were selected.",
    request.priority ? `Additional user constraint: ${request.priority}.` : "No additional free-text constraint was stated.",
    ...trainingContextInstructions(history),
    "If history is sparse, keep prescriptions conservative. Do not invent working weights. Return exactly one session template for each requested training day, using those exact dayIndex values."
  ];
}
async function callOpenAI(request, userProfile, history, correction = "") {
  const apiKey = resolveKey();
  if (!apiKey) throw Object.assign(new Error("OpenAI is not configured."), { status: 503, code: "AI_NOT_CONFIGURED" });
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const instructions = [...baseInstructions(request, userProfile, history), correction ? `SELF-REPAIR: The previous draft was rejected by deterministic/product validation. Fix these exact issues without changing the user's constraints: ${correction}` : ""].filter(Boolean).join(" ");
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, store: false, instructions, input: correction ? "Return a corrected TrainSync microcycle that passes all stated constraints." : "Create the TrainSync multi-week program microcycle.", text: { format: programFormat } }),
    signal: AbortSignal.timeout(45000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(body?.error?.message || `OpenAI request failed (${response.status}).`), { status: response.status, code: body?.error?.code || "OPENAI_API_ERROR" });
  const text = outputText(body);
  if (!text) throw Object.assign(new Error("OpenAI returned no program."), { code: "OPENAI_EMPTY_OUTPUT" });
  let draft;
  try { draft = JSON.parse(text); } catch { throw Object.assign(new Error("OpenAI returned invalid structured program data."), { code: "OPENAI_INVALID_OUTPUT" }); }
  return { draft, model, responseId: body.id || null };
}
function returnedDaysIssue(draft, request) {
  const returnedDays = [...new Set((draft?.sessions || []).map((session) => session.dayIndex))].sort((a,b) => a-b);
  return JSON.stringify(returnedDays) === JSON.stringify(request.availableDays) ? null : `Training days were ${returnedDays.join(",") || "missing"}; required ${request.availableDays.join(",")}.`;
}
function blockingWarnings(validation) {
  return (validation?.warnings || []).filter((item) => BLOCKING_WARNING_CODES.has(item.code));
}
function summarizeRepairIssues(dayIssue, violations, validation) {
  const parts = [];
  if (dayIssue) parts.push(dayIssue);
  if (violations.length) parts.push(`Unavailable equipment: ${violations.map((item) => `${item.exercise} requires ${item.missing.join("/")}`).join("; ")}.`);
  if (validation && !validation.valid) parts.push(`Validation errors: ${validation.errors.slice(0, 8).map((item) => `${item.code}: ${item.message}`).join("; ")}.`);
  const blocking = blockingWarnings(validation);
  if (blocking.length) parts.push(`Product-blocking warnings: ${blocking.slice(0, 8).map((item) => `${item.code}: ${item.message}`).join("; ")}.`);
  return parts.join(" ").slice(0, 3500);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  const token = bearer(req);
  const user = await authenticate(token);
  if (!user) return res.status(401).json({ error: "SIGN_IN_REQUIRED", message: "Sign in to create a training program." });
  const [userProfile, history] = await Promise.all([profile(token, user.id), trainingContext(token, user.id)]);
  let request;
  try { request = validateRequest(req.body || {}, userProfile); }
  catch (error) { return res.status(error.status || 400).json({ error: error.code || "PROGRAM_REQUEST_INVALID", message: error.message }); }

  try {
    let correction = "";
    let lastValidation = null;
    let lastViolations = [];
    let generated = null;
    let program = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      generated = await callOpenAI(request, userProfile, history, correction);
      const dayIssue = returnedDaysIssue(generated.draft, request);
      lastViolations = equipmentViolations(generated.draft, userProfile);
      program = normalizeDraft(generated.draft, request, userProfile);
      lastValidation = validateProgram({
        title: program.title,
        goal: program.goal,
        durationWeeks: program.durationWeeks,
        daysPerWeek: program.daysPerWeek,
        defaultSessionMinutes: program.defaultSessionMinutes,
        priority: program.priority,
      }, program.sessions);
      const blocking = blockingWarnings(lastValidation);
      if (!dayIssue && !lastViolations.length && lastValidation.valid && !blocking.length) {
        return res.status(200).json({
          program,
          validation: lastValidation,
          ai: {
            mode: "openai",
            model: generated.model,
            responseId: generated.responseId,
            profileApplied: Boolean(userProfile),
            historyApplied: Boolean(history?.hasData),
            selfRepairAttempts: attempt - 1,
          }
        });
      }
      correction = summarizeRepairIssues(dayIssue, lastViolations, lastValidation);
    }
    return res.status(422).json({
      error: "PROGRAM_VALIDATION_FAILED",
      message: "TrainSync rejected the AI program after an automatic repair attempt.",
      validation: lastValidation,
      violations: lastViolations,
      blockingWarnings: blockingWarnings(lastValidation),
    });
  } catch (error) {
    return res.status(error.status === 429 ? 429 : error.status || 502).json({ error: error.code || "PROGRAM_GENERATION_FAILED", message: error.message || "Program generation failed." });
  }
}
