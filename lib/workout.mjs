const DEFAULT_TIMEZONE = "Europe/Riga";

const exercise = (name, sets, reps, restSec, group, notes = "") => ({
  name,
  group,
  notes,
  garminExerciseKey: null,
  sets: Array.from({ length: sets }, (_, index) => ({
    index: index + 1,
    targetReps: reps,
    weightKg: null,
    restSec,
  })),
});

const TEMPLATES = {
  upper: {
    title: "Upper Body A",
    exercises: [
      exercise("Bench Press", 4, 8, 120, "chest", "Leave 1–2 reps in reserve."),
      exercise("Chest-Supported Row", 4, 8, 105, "back"),
      exercise("Overhead Press", 3, 8, 105, "shoulders"),
      exercise("Lat Pulldown", 3, 10, 90, "back"),
      exercise("Incline Dumbbell Press", 3, 10, 90, "chest"),
      exercise("Cable Curl", 3, 12, 75, "arms"),
    ],
  },
  push: {
    title: "Push Strength",
    exercises: [
      exercise("Bench Press", 4, 6, 150, "chest"),
      exercise("Incline Dumbbell Press", 3, 8, 105, "chest"),
      exercise("Overhead Press", 3, 8, 105, "shoulders"),
      exercise("Cable Fly", 3, 12, 75, "chest"),
      exercise("Lateral Raise", 3, 15, 60, "shoulders"),
      exercise("Triceps Pushdown", 3, 12, 75, "arms"),
    ],
  },
  pull: {
    title: "Pull Strength",
    exercises: [
      exercise("Barbell Row", 4, 8, 120, "back"),
      exercise("Lat Pulldown", 4, 8, 105, "back"),
      exercise("Single-Arm Cable Row", 3, 10, 90, "back"),
      exercise("Rear Delt Fly", 3, 15, 60, "shoulders"),
      exercise("EZ-Bar Curl", 3, 10, 75, "arms"),
      exercise("Hammer Curl", 2, 12, 75, "arms"),
    ],
  },
  legs: {
    title: "Lower Body A",
    exercises: [
      exercise("Back Squat", 4, 6, 150, "legs", "Controlled depth and bracing."),
      exercise("Romanian Deadlift", 3, 8, 120, "posterior-chain"),
      exercise("Leg Press", 3, 10, 105, "legs"),
      exercise("Seated Leg Curl", 3, 12, 75, "posterior-chain"),
      exercise("Leg Extension", 3, 12, 75, "legs"),
      exercise("Standing Calf Raise", 4, 12, 60, "calves"),
    ],
  },
  full: {
    title: "Full Body",
    exercises: [
      exercise("Back Squat", 3, 6, 135, "legs"),
      exercise("Bench Press", 3, 8, 120, "chest"),
      exercise("Chest-Supported Row", 3, 8, 105, "back"),
      exercise("Romanian Deadlift", 3, 8, 120, "posterior-chain"),
      exercise("Overhead Press", 3, 8, 90, "shoulders"),
      exercise("Lat Pulldown", 3, 10, 90, "back"),
    ],
  },
};

function hash(input) {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(36);
}

function rigaDateParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
}

function isoFromOffset(days = 0) {
  const { year, month, day } = rigaDateParts();
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function resolveScheduledDate(intent) {
  const text = intent.toLowerCase();
  if (/tomorrow|завтра|rīt/.test(text)) return isoFromOffset(1);
  if (/today|tonight|сегодня|сегодня вечером|šodien/.test(text)) return isoFromOffset(0);
  return isoFromOffset(1);
}

function detectTemplate(intent) {
  const text = intent.toLowerCase();
  if (/leg|lower|ног|ноги|squat/.test(text)) return "legs";
  if (/pull|back|biceps|спин|бицепс/.test(text)) return "pull";
  if (/push|chest|triceps|груд|трицепс/.test(text)) return "push";
  if (/full|whole|всё тело|все тело|полное тело/.test(text)) return "full";
  return "upper";
}

function detectDuration(intent, fallback = 50) {
  const match = intent.match(/(?:about\s*)?(\d{2,3})\s*(?:-?minute|min(?:s)?|мин(?:ут[ыау]?)?)/i);
  if (!match) return fallback;
  return Math.max(20, Math.min(120, Number(match[1])));
}

function detectIntensity(intent) {
  const text = intent.toLowerCase();
  if (/heavy|hard|тяж|сильно/.test(text)) return "heavy";
  if (/easy|light|recovery|л[её]гк|восстанов/.test(text)) return "easy";
  return "moderate";
}

function tuneForIntensity(exercises, intensity) {
  return exercises.map((item) => ({
    ...item,
    sets: item.sets.map((set) => {
      if (intensity === "heavy") return { ...set, targetReps: Math.max(4, set.targetReps - 2), restSec: set.restSec + 30 };
      if (intensity === "easy") return { ...set, targetReps: Math.max(6, set.targetReps - 1), restSec: Math.max(60, set.restSec - 15) };
      return { ...set };
    }),
  }));
}

export function createWorkoutFromIntent(intent, options = {}) {
  const cleanIntent = String(intent || "").trim();
  const key = detectTemplate(cleanIntent);
  const base = TEMPLATES[key];
  const intensity = detectIntensity(cleanIntent);
  const scheduledDate = options.scheduledDate || resolveScheduledDate(cleanIntent);
  const duration = options.durationMinutes || detectDuration(cleanIntent, key === "legs" ? 55 : 50);
  const timezone = options.timezone || DEFAULT_TIMEZONE;
  const exercises = tuneForIntensity(base.exercises, intensity);
  const totalSets = exercises.reduce((sum, item) => sum + item.sets.length, 0);
  const clientKey = `${cleanIntent}|${scheduledDate}|${key}|${duration}|${intensity}`;

  return {
    id: `wrk_${hash(clientKey)}`,
    revision: 1,
    title: base.title,
    sport: "strength",
    intensity,
    source: "chatgpt",
    scheduledDate,
    timezone,
    estimatedDurationMinutes: duration,
    totalSets,
    status: "draft",
    instructions: "Use controlled form. Stop the set if technique breaks down.",
    exercises,
    createdAt: new Date().toISOString(),
  };
}

export function validateWorkout(workout) {
  const errors = [];
  const warnings = [];

  if (!workout || typeof workout !== "object") {
    return { valid: false, errors: [{ code: "WORKOUT_REQUIRED", message: "Workout object is required." }], warnings };
  }
  if (!workout.id) errors.push({ code: "WORKOUT_ID_REQUIRED", message: "Workout id is required." });
  if (!workout.title?.trim()) errors.push({ code: "WORKOUT_TITLE_REQUIRED", message: "Workout title is required." });
  if (workout.sport !== "strength") errors.push({ code: "UNSUPPORTED_SPORT", message: "This MVP currently supports strength workouts only." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workout.scheduledDate || "")) errors.push({ code: "INVALID_SCHEDULE_DATE", message: "scheduledDate must be YYYY-MM-DD." });
  if (!Array.isArray(workout.exercises) || workout.exercises.length === 0) errors.push({ code: "EXERCISES_REQUIRED", message: "At least one exercise is required." });

  for (const [exerciseIndex, item] of (workout.exercises || []).entries()) {
    if (!item.name?.trim()) errors.push({ code: "EXERCISE_NAME_REQUIRED", message: `Exercise ${exerciseIndex + 1} has no name.` });
    if (!Array.isArray(item.sets) || item.sets.length === 0) errors.push({ code: "SETS_REQUIRED", message: `${item.name || `Exercise ${exerciseIndex + 1}`} has no sets.` });
    for (const [setIndex, set] of (item.sets || []).entries()) {
      if (!Number.isInteger(set.targetReps) || set.targetReps < 1 || set.targetReps > 100) {
        errors.push({ code: "INVALID_REPS", message: `${item.name}, set ${setIndex + 1}: invalid target reps.` });
      }
      if (!Number.isInteger(set.restSec) || set.restSec < 0 || set.restSec > 900) {
        errors.push({ code: "INVALID_REST", message: `${item.name}, set ${setIndex + 1}: invalid rest duration.` });
      }
    }
    if (!item.garminExerciseKey) warnings.push({ code: "GARMIN_MAPPING_PENDING", message: `${item.name}: Garmin exercise mapping will be resolved by the provider adapter.` });
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function workoutSummary(workout) {
  return {
    id: workout.id,
    title: workout.title,
    scheduledDate: workout.scheduledDate,
    durationMinutes: workout.estimatedDurationMinutes,
    exercises: workout.exercises.length,
    sets: workout.totalSets,
    intensity: workout.intensity,
    status: workout.status,
  };
}

export function stableHash(input) {
  return hash(String(input));
}
