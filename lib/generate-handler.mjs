import { createWorkoutFromIntent, stableHash, validateWorkout, workoutSummary } from "./workout.mjs";
import { summarizeTrainingContext, trainingContextInstructions } from "./training-context.mjs";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";
const DEFAULT_MODEL = "gpt-5.6-luna";

const workoutFormat = {
  type: "json_schema",
  name: "strength_workout_draft",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "scheduledDate", "timezone", "durationMinutes", "intensity", "instructions", "exercises"],
    properties: {
      title: { type: "string", minLength: 1 },
      scheduledDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      timezone: { type: "string", minLength: 1 },
      durationMinutes: { type: "integer", minimum: 15, maximum: 240 },
      intensity: { type: "string", enum: ["easy", "moderate", "heavy"] },
      instructions: { type: "string" },
      exercises: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "group", "notes", "sets"],
          properties: {
            name: { type: "string", minLength: 1 },
            group: { type: "string", minLength: 1 },
            notes: { type: "string" },
            sets: {
              type: "array",
              minItems: 1,
              maxItems: 12,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["targetReps", "weightKg", "restSec"],
                properties: {
                  targetReps: { type: "integer", minimum: 1, maximum: 100 },
                  weightKg: { type: ["number", "null"], minimum: 0 },
                  restSec: { type: "integer", minimum: 0, maximum: 900 }
                }
              }
            }
          }
        }
      }
    }
  }
};

function localDate(timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function bearerToken(req) {
  const header = req.headers?.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || null;
}

function supabaseHeaders(token) {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`
  };
}

async function authenticateUser(token) {
  if (!token) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: supabaseHeaders(token),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

async function loadAthleteProfile(token, userId) {
  if (!token || !userId) return null;
  try {
    const query = new URLSearchParams({
      select: "timezone,units,goal,experience_level,default_workout_minutes,equipment",
      user_id: `eq.${userId}`,
      limit: "1"
    });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/athlete_profiles?${query}`, {
      headers: supabaseHeaders(token),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return null;
    const rows = await response.json();
    return Array.isArray(rows) ? (rows[0] || null) : null;
  } catch {
    return null;
  }
}

async function loadTrainingContext(token, userId) {
  if (!token || !userId) return summarizeTrainingContext([], []);
  try {
    const setQuery = new URLSearchParams({
      select: "exercise_name,exercise_key,reps,weight_kg,rpe,target_reps,target_weight_kg,is_warmup,completed_at",
      user_id: `eq.${userId}`,
      is_warmup: "eq.false",
      order: "completed_at.desc",
      limit: "300"
    });
    const sessionQuery = new URLSearchParams({
      select: "title,completed_at,duration_seconds,status,total_sets,total_volume_kg",
      user_id: `eq.${userId}`,
      status: "eq.completed",
      order: "completed_at.desc",
      limit: "40"
    });

    const [setsResponse, sessionsResponse] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/set_results?${setQuery}`, {
        headers: supabaseHeaders(token),
        signal: AbortSignal.timeout(8000)
      }),
      fetch(`${SUPABASE_URL}/rest/v1/workout_sessions?${sessionQuery}`, {
        headers: supabaseHeaders(token),
        signal: AbortSignal.timeout(8000)
      })
    ]);

    const sets = setsResponse.ok ? await setsResponse.json() : [];
    const sessions = sessionsResponse.ok ? await sessionsResponse.json() : [];
    return summarizeTrainingContext(sets, sessions);
  } catch {
    return summarizeTrainingContext([], []);
  }
}

function profileInstructions(profile) {
  if (!profile) return [];
  const context = [];
  if (profile.goal) context.push(`Primary training goal: ${profile.goal}.`);
  if (profile.experience_level) context.push(`Experience level: ${profile.experience_level}.`);
  if (profile.default_workout_minutes) context.push(`Default workout duration when the user does not specify one: ${profile.default_workout_minutes} minutes.`);
  if (Array.isArray(profile.equipment) && profile.equipment.length) context.push(`Available equipment: ${profile.equipment.join(", ")}. Unless the user explicitly requests otherwise, choose exercises that fit this equipment.`);
  if (profile.units) context.push(`Preferred display units: ${profile.units}. TrainSync stores canonical weightKg internally.`);
  return context;
}

function outputText(response) {
  return (response?.output || [])
    .filter((item) => item?.type === "message")
    .flatMap((item) => item.content || [])
    .filter((part) => part?.type === "output_text")
    .map((part) => part.text || "")
    .join("")
    .trim();
}

function normalizeDraft(draft) {
  const exercises = draft.exercises.map((item) => ({
    name: item.name.trim(),
    group: item.group.trim(),
    notes: item.notes?.trim?.() || "",
    garminExerciseKey: null,
    sets: item.sets.map((set, index) => ({
      index: index + 1,
      targetReps: set.targetReps,
      weightKg: set.weightKg ?? null,
      restSec: set.restSec
    }))
  }));

  const totalSets = exercises.reduce((sum, item) => sum + item.sets.length, 0);
  const identity = JSON.stringify({
    title: draft.title,
    scheduledDate: draft.scheduledDate,
    intensity: draft.intensity,
    durationMinutes: draft.durationMinutes,
    exercises
  });

  return {
    id: `wrk_${stableHash(identity)}`,
    revision: 1,
    title: draft.title.trim(),
    sport: "strength",
    intensity: draft.intensity,
    source: "openai",
    scheduledDate: draft.scheduledDate,
    timezone: draft.timezone,
    estimatedDurationMinutes: draft.durationMinutes,
    totalSets,
    status: "draft",
    instructions: draft.instructions?.trim?.() || "Use controlled form and stop a set if technique breaks down.",
    exercises,
    createdAt: new Date().toISOString()
  };
}

function resolveOpenAIKey() {
  return process.env.OPENAI_API_KEY || process.env.OPENAI_APY_KEY || process.env.openai_api_key || process.env.oepnai_api_key;
}

async function generateWithOpenAI(intent, timezone, profile, trainingContext) {
  const apiKey = resolveOpenAIKey();
  if (!apiKey) {
    const error = new Error("OpenAI is not configured yet.");
    error.code = "AI_NOT_CONFIGURED";
    throw error;
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const today = localDate(timezone);
  const instructions = [
    "You are TrainSync AI, a strength-training programming engine.",
    "Create realistic, practical strength workouts from the user's request.",
    "The user's direct request always overrides profile defaults and historical tendencies when they conflict.",
    ...profileInstructions(profile),
    ...trainingContextInstructions(trainingContext),
    "Respect requested body parts, duration, intensity, equipment and scheduling constraints.",
    "Choose exercises, working sets, reps and rest periods intelligently for the stated goal and experience level.",
    "When training history is absent or insufficient for an exercise, do not invent a working weight; use null for weightKg.",
    "When history is strong enough to justify a working weight, keep the prescription conservative and consistent with recent successful performance, RPE and target completion.",
    "Prefer a sensible number of exercises and working sets that can actually fit the requested duration.",
    "Avoid rehabilitation, injury-treatment or medical claims. If the request is medically framed, keep programming conservative and generic.",
    `Today in the user's timezone (${timezone}) is ${today}. Resolve relative dates such as today or tomorrow from that date.`,
    "Return only the structured workout matching the provided schema."
  ].join(" ");

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions,
      input: intent,
      text: { format: workoutFormat }
    }),
    signal: AbortSignal.timeout(45000)
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error?.message || `OpenAI request failed (${response.status}).`);
    error.code = body?.error?.code || "OPENAI_API_ERROR";
    error.status = response.status;
    throw error;
  }

  const text = outputText(body);
  if (!text) {
    const error = new Error("OpenAI returned no workout output.");
    error.code = "OPENAI_EMPTY_OUTPUT";
    throw error;
  }

  let draft;
  try {
    draft = JSON.parse(text);
  } catch {
    const error = new Error("OpenAI returned an invalid structured workout.");
    error.code = "OPENAI_INVALID_OUTPUT";
    throw error;
  }

  return { workout: normalizeDraft(draft), model, responseId: body.id || null };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });

  const intent = req.body?.intent;
  const requestedTimezone = req.body?.timezone || "Europe/Riga";
  if (!intent || typeof intent !== "string") return res.status(400).json({ error: "INTENT_REQUIRED" });

  if (req.body?.demo === true) {
    const workout = createWorkoutFromIntent(intent, { timezone: requestedTimezone });
    const validation = validateWorkout(workout);
    return res.status(200).json({
      workout,
      validation,
      summary: workoutSummary(workout),
      ai: { mode: "demo", model: null, profileApplied: false, historyApplied: false }
    });
  }

  const token = bearerToken(req);
  const user = await authenticateUser(token);
  if (!user) {
    return res.status(401).json({
      error: "SIGN_IN_REQUIRED",
      message: "Sign in to use AI workout generation."
    });
  }

  const [profile, trainingContext] = await Promise.all([
    loadAthleteProfile(token, user.id),
    loadTrainingContext(token, user.id)
  ]);
  const timezone = profile?.timezone || requestedTimezone;

  try {
    const generated = await generateWithOpenAI(intent, timezone, profile, trainingContext);
    const validation = validateWorkout(generated.workout);
    if (!validation.valid) {
      return res.status(422).json({
        error: "WORKOUT_VALIDATION_FAILED",
        message: "The generated workout did not pass TrainSync validation.",
        validation
      });
    }

    return res.status(200).json({
      workout: generated.workout,
      validation,
      summary: workoutSummary(generated.workout),
      ai: {
        mode: "openai",
        model: generated.model,
        responseId: generated.responseId,
        profileApplied: Boolean(profile),
        historyApplied: Boolean(trainingContext?.hasData),
        historySetCount: trainingContext?.setCount || 0,
        historySessionCount: trainingContext?.sessionCount || 0
      }
    });
  } catch (error) {
    const status = error.code === "AI_NOT_CONFIGURED" ? 503 : error.status === 429 ? 429 : 502;
    return res.status(status).json({
      error: error.code || "AI_GENERATION_FAILED",
      message: error.message || "AI workout generation failed."
    });
  }
}
