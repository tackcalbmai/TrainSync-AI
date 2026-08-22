import { stableHash } from "./workout.mjs";
import { summarizeTrainingContext, trainingContextInstructions } from "./training-context.mjs";
import { EVIDENCE_VERSION, validateProgram } from "./programming-engine.mjs";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";
const DEFAULT_MODEL = "gpt-5.6-luna";
const GOALS = new Set(["strength","hypertrophy","general_fitness","fat_loss","mixed"]);
const MUSCLES = ["chest","lats","upper_back","front_delts","side_delts","rear_delts","biceps","triceps","quads","hamstrings","glutes","calves","adductors","abductors","forearms","abs","spinal_erectors"];
const MOVEMENT_PATTERNS = ["horizontal_push","vertical_push","horizontal_pull","vertical_pull","squat","lunge","hinge","calf","core","carry","isolation","other"];
const LOAD_TYPES = ["external_weight","bodyweight","assisted_bodyweight","mixed"];
const PROGRESSION_MODES = ["double_progression","load_progression","variant_progression","reps_only"];

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
        type: "array", minItems: 1, maxItems: 7,
        items: {
          type: "object", additionalProperties: false,
          required: ["dayIndex","title","focus","estimatedDurationMinutes","exercises"],
          properties: {
            dayIndex: { type: "integer", minimum: 1, maximum: 7 },
            title: { type: "string", minLength: 1, maxLength: 80 },
            focus: { type: "string", minLength: 1, maxLength: 160 },
            estimatedDurationMinutes: { type: "integer", minimum: 15, maximum: 240 },
            exercises: {
              type: "array", minItems: 1, maxItems: 16,
              items: {
                type: "object", additionalProperties: false,
                required: ["name","exerciseKey","role","movementPattern","loadType","progressionMode","primaryMuscles","secondaryMuscles","notes","setCount","minReps","maxReps","targetRir","restSec","progressionNote","supersetGroup"],
                properties: {
                  name: { type: "string", minLength: 1, maxLength: 100 },
                  exerciseKey: { type: "string", minLength: 1, maxLength: 100 },
                  role: { type: "string", enum: ["primary_strength","secondary_strength","hypertrophy_compound","accessory","isolation","power"] },
                  movementPattern: { type: "string", enum: MOVEMENT_PATTERNS },
                  loadType: { type: "string", enum: LOAD_TYPES },
                  progressionMode: { type: "string", enum: PROGRESSION_MODES },
                  primaryMuscles: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", enum: MUSCLES } },
                  secondaryMuscles: { type: "array", maxItems: 6, items: { type: "string", enum: MUSCLES } },
                  notes: { type: "string", maxLength: 280 },
                  setCount: { type: "integer", minimum: 1, maximum: 8 },
                  minReps: { type: "integer", minimum: 1, maximum: 40 },
                  maxReps: { type: "integer", minimum: 1, maximum: 40 },
                  targetRir: { type: "number", minimum: 0, maximum: 5 },
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
    const r = await fetch(`${SUPABASE_URL}/rest/v1/athlete_profiles?${q}`, { headers: sbHeaders(token), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0] || null;
  } catch { return null; }
}

async function trainingContext(token, userId) {
  try {
    const sq = new URLSearchParams({ select: "exercise_name,exercise_key,reps,weight_kg,rpe,target_reps,target_weight_kg,is_warmup,completed_at", user_id: `eq.${userId}`, is_warmup: "eq.false", order: "completed_at.desc", limit: "300" });
    const wq = new URLSearchParams({ select: "title,completed_at,duration_seconds,status,total_sets,total_volume_kg", user_id: `eq.${userId}`, status: "eq.completed", order: "completed_at.desc", limit: "40" });
    const [sr, wr] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/set_results?${sq}`, { headers: sbHeaders(token), signal: AbortSignal.timeout(8000) }),
      fetch(`${SUPABASE_URL}/rest/v1/workout_sessions?${wq}`, { headers: sbHeaders(token), signal: AbortSignal.timeout(8000) })
    ]);
    return summarizeTrainingContext(sr.ok ? await sr.json() : [], wr.ok ? await wr.json() : []);
  } catch { return summarizeTrainingContext([], []); }
}

function resolveKey() { return process.env.OPENAI_API_KEY || process.env.OPENAI_APY_KEY || process.env.openai_api_key || process.env.oepnai_api_key; }
function outputText(response) {
  return (response?.output || []).filter((x) => x?.type === "message").flatMap((x) => x.content || []).filter((x) => x?.type === "output_text").map((x) => x.text || "").join("").trim();
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

function normalizeExercise(exercise) {
  const sets = Array.from({ length: exercise.setCount }, (_, index) => ({
    index: index + 1,
    minReps: exercise.minReps,
    maxReps: exercise.maxReps,
    targetRir: exercise.targetRir,
    restSec: exercise.restSec,
    weightKg: null,
  }));
  return {
    name: exercise.name.trim(),
    exerciseKey: exercise.exerciseKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
    role: exercise.role,
    movementPattern: exercise.movementPattern,
    loadType: exercise.loadType,
    progressionMode: exercise.progressionMode,
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
    estimatedDurationMinutes: session.estimatedDurationMinutes,
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
          estimatedDurationMinutes: template.estimatedDurationMinutes,
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
  const availableDays = [...new Set((Array.isArray(body.availableDays) ? body.availableDays : [1,3,5]).map(Number).filter((x) => x >= 1 && x <= 7))].sort((a,b) => a-b);
  if (!availableDays.length) throw Object.assign(new Error("Choose at least one training day."), { status: 400, code: "TRAINING_DAYS_REQUIRED" });
  const weekStart = mondayOf(body.weekStart);
  return {
    goal,
    durationWeeks,
    availableDays,
    weekStart,
    sessionMinutes: Math.max(15, Math.min(240, Math.round(Number(body.sessionMinutes) || userProfile?.default_workout_minutes || 50))),
    priority: String(body.priority || "").trim().slice(0, 500),
    priorityMuscles: [...new Set((Array.isArray(body.priorityMuscles) ? body.priorityMuscles : []).filter((m) => MUSCLES.includes(m)))].slice(0, 6),
    timeEfficient: body.timeEfficient === true,
  };
}

async function generate(request, userProfile, history) {
  const apiKey = resolveKey();
  if (!apiKey) throw Object.assign(new Error("OpenAI is not configured."), { status: 503, code: "AI_NOT_CONFIGURED" });
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const equipment = Array.isArray(userProfile?.equipment) && userProfile.equipment.length ? userProfile.equipment.join(", ") : "not specified";
  const experience = userProfile?.experience_level || "not specified";
  const instructions = [
    "You are the program-design component of TrainSync AI. Design one stable weekly resistance-training microcycle that will be repeated and adaptively progressed across multiple weeks.",
    "Do not create random exercise novelty or predetermined weekly load jumps. TrainSync adapts future sessions after actual performance is recorded.",
    "The user's requested goal, training days, explicit priority muscles, time target and equipment constraints are authoritative. Do not reinterpret them into a different goal.",
    "Evidence rules: weekly training volume has diminishing returns; distribute volume rather than concentrating excessive same-muscle work in one session; frequency is mainly a way to distribute hypertrophy volume, while priority strength lifts may benefit from repeated exposure.",
    "For maximal strength, prioritize specific high-force work while retaining repetitions in reserve. A bodyweight exercise labeled primary_strength should use a sufficiently difficult named variation so its normal working range is roughly 3-10 reps at target RIR; do not call a 12-20 rep bodyweight set primary_strength merely because it is first in the session.",
    "For hypertrophy, use multiple sufficiently hard sets across practical rep ranges; most working sets should normally stop around 1-3 RIR rather than requiring failure.",
    "Use adequate rest: usually at least 2 minutes for heavy priority compounds, commonly 90-180 seconds for hypertrophy compounds, and shorter rests only where performance is unlikely to be compromised.",
    "Put priority exercises or muscles early in the session. Keep exercise selection stable and non-redundant. Machines and free weights are both valid; respect available equipment.",
    "Do not force a fixed deload week. Do not treat 10 sets/week, 48h recovery, 8-12 reps, or failure as universal laws.",
    "Every exercise must map to canonical primary and secondary muscles and one movementPattern so TrainSync can deterministically audit weekly volume and movement coverage.",
    "For bodyweight exercises, progression must be trackable from future workout results. Prefer discrete named variations and progressionMode=variant_progression when leverage must change. Do not tell the athlete to continuously alter hand height, foot height, pike angle, assistance or range of motion inside the same tracked exercise from session to session. A deliberate variation change should become a new named exercise/exerciseKey in a future adaptation.",
    "Use progressionNote to state a concise measurable rule. For external load, usually add reps inside the range first and then the smallest practical load. For bodyweight, own the rep range at target RIR before moving to a discrete harder named variation.",
    request.timeEfficient ? "TIME-EFFICIENT MODE is enabled: use antagonist or genuinely non-competing supersets for suitable accessory/hypertrophy work. Do not superset the athlete's heavy priority strength lifts when doing so would compromise performance. Consider secondary fatigue and setup as well as primary muscles: avoid pairs that share a limiting grip, spinal-erector demand, unsupported bent-over position, or the same major stabilizer. In particular, do not pair a hinge-dominant compound such as an RDL with an unsupported bent-over row/reverse-fly accessory. Give paired exercises the same short supersetGroup label." : "Do not use supersets unless they clearly improve practicality; set supersetGroup to null otherwise.",
    `Goal: ${request.goal}. Experience: ${experience}. Equipment: ${equipment}. Session time target: ${request.sessionMinutes} minutes. Training days (Monday=1): ${request.availableDays.join(", ")}.`,
    request.priorityMuscles.length ? `Explicit priority muscles: ${request.priorityMuscles.join(", ")}. These must receive meaningful weekly work.` : "No explicit priority muscles were selected.",
    request.priority ? `Additional user constraint: ${request.priority}.` : "No additional free-text constraint was stated.",
    ...trainingContextInstructions(history),
    "If history is sparse, keep prescriptions conservative. Do not invent working weights. For a first exposure to an external-load movement, the athlete can calibrate the initial load from the prescribed rep range and RIR; subsequent TrainSync sessions should then use recorded performance.",
    "Return exactly one session template for each requested training day, using those exact dayIndex values."
  ].join(" ");

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, store: false, instructions, input: "Create the TrainSync multi-week program microcycle.", text: { format: programFormat } }),
    signal: AbortSignal.timeout(45000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(body?.error?.message || `OpenAI request failed (${response.status}).`), { status: response.status, code: body?.error?.code || "OPENAI_API_ERROR" });
  const text = outputText(body);
  if (!text) throw Object.assign(new Error("OpenAI returned no program."), { code: "OPENAI_EMPTY_OUTPUT" });
  let draft;
  try { draft = JSON.parse(text); } catch { throw Object.assign(new Error("OpenAI returned invalid structured program data."), { code: "OPENAI_INVALID_OUTPUT" }); }

  const returnedDays = [...new Set(draft.sessions.map((s) => s.dayIndex))].sort((a,b) => a-b);
  if (JSON.stringify(returnedDays) !== JSON.stringify(request.availableDays)) throw Object.assign(new Error("AI program did not match the requested training days."), { code: "PROGRAM_DAY_MISMATCH", status: 422 });
  return { draft, model, responseId: body.id || null };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  const token = bearer(req);
  const user = await authenticate(token);
  if (!user) return res.status(401).json({ error: "SIGN_IN_REQUIRED", message: "Sign in to create a training program." });
  const [userProfile, history] = await Promise.all([profile(token, user.id), trainingContext(token, user.id)]);
  let request;
  try { request = validateRequest(req.body || {}, userProfile); } catch (error) { return res.status(error.status || 400).json({ error: error.code || "PROGRAM_REQUEST_INVALID", message: error.message }); }

  try {
    const generated = await generate(request, userProfile, history);
    const program = normalizeDraft(generated.draft, request, userProfile);
    const validation = validateProgram({
      title: program.title,
      goal: program.goal,
      durationWeeks: program.durationWeeks,
      daysPerWeek: program.daysPerWeek,
      defaultSessionMinutes: program.defaultSessionMinutes,
      priority: program.priority,
    }, program.sessions);
    if (!validation.valid) return res.status(422).json({ error: "PROGRAM_VALIDATION_FAILED", message: "The generated program failed deterministic TrainSync validation.", validation });
    return res.status(200).json({
      program,
      validation,
      ai: { mode: "openai", model: generated.model, responseId: generated.responseId, profileApplied: Boolean(userProfile), historyApplied: Boolean(history?.hasData) }
    });
  } catch (error) {
    return res.status(error.status === 429 ? 429 : error.status || 502).json({ error: error.code || "PROGRAM_GENERATION_FAILED", message: error.message || "Program generation failed." });
  }
}
