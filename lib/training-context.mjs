import { epleyE1rmKg, normalizeExerciseKey, setVolumeKg } from "./progress.mjs";

function round(value, digits = 1) { const factor = 10 ** digits; return Math.round((Number(value) + Number.EPSILON) * factor) / factor; }
function validDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; }
function metricType(set) { return String(set?.metric_type ?? set?.metricType ?? (Number(set?.duration_seconds ?? set?.durationSeconds) > 0 ? "duration_seconds" : "reps")).toLowerCase(); }
function targetMin(set) { return metricType(set) === "duration_seconds" ? Number(set?.target_min_duration_seconds ?? set?.target_duration_seconds) : Number(set?.target_min_reps ?? set?.target_reps); }
function targetMax(set) { return metricType(set) === "duration_seconds" ? Number(set?.target_max_duration_seconds ?? set?.target_duration_seconds) : Number(set?.target_max_reps ?? set?.target_reps); }
function actualValue(set) { return metricType(set) === "duration_seconds" ? Number(set?.duration_seconds ?? set?.durationSeconds) : Number(set?.reps); }
function successfulSet(set) {
  const value = actualValue(set), target = targetMin(set);
  if (!Number.isFinite(value) || value <= 0) return false;
  if (!Number.isFinite(target) || target <= 0) return true;
  return value >= target;
}

export function summarizeTrainingContext(setRows = [], sessionRows = [], options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const cutoff30 = new Date(now); cutoff30.setDate(cutoff30.getDate() - 30);
  const sets = (Array.isArray(setRows) ? setRows : []).filter((set) => !set?.is_warmup && actualValue(set) > 0 && validDate(set?.completed_at)).sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
  const sessions = (Array.isArray(sessionRows) ? sessionRows : []).filter((session) => session?.status === "completed" && validDate(session?.completed_at)).sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
  const exerciseMap = new Map();
  for (const set of sets) {
    const key = set.exercise_key || normalizeExerciseKey(set.exercise_name);
    if (!exerciseMap.has(key)) exerciseMap.set(key, { key, name: set.exercise_name || key, latestAt: set.completed_at, sets: [], weightedSets: 0, successfulWeightedSets: 0, bestWeightKg: null, bestE1rmKg: null, bestDurationSeconds: null });
    const row = exerciseMap.get(key);
    if (row.sets.length < 8) row.sets.push(set);
    if (metricType(set) === "duration_seconds") {
      const duration = actualValue(set); if (Number.isFinite(duration) && duration > 0) row.bestDurationSeconds = Math.max(row.bestDurationSeconds || 0, duration);
      continue;
    }
    const weight = Number(set.weight_kg);
    if (Number.isFinite(weight) && weight > 0) {
      row.weightedSets += 1;
      if (successfulSet(set)) row.successfulWeightedSets += 1;
      row.bestWeightKg = Math.max(row.bestWeightKg || 0, weight);
      const e1rm = epleyE1rmKg(weight, set.reps); if (e1rm != null) row.bestE1rmKg = Math.max(row.bestE1rmKg || 0, e1rm);
    }
  }

  const exercises = [...exerciseMap.values()].map((row) => {
    const rpes = row.sets.map((set) => Number(set.rpe)).filter((value) => Number.isFinite(value) && value >= 1 && value <= 10);
    const latest = row.sets[0] || null;
    const latestWeight = Number(latest?.weight_kg), latestRpe = Number(latest?.rpe);
    const latestSucceeded = successfulSet(latest);
    const progressionEligible = metricType(latest) === "reps" && row.successfulWeightedSets >= 2 && Number.isFinite(latestWeight) && latestWeight > 0 && latestSucceeded && (!Number.isFinite(latestRpe) || latestRpe <= 8.5);
    return {
      key: row.key, name: row.name, latestAt: row.latestAt,
      recentSets: row.sets.map((set) => ({ metricType: metricType(set), reps: Number(set.reps) > 0 ? Number(set.reps) : null, durationSeconds: Number(set.duration_seconds) > 0 ? Number(set.duration_seconds) : null, weightKg: Number.isFinite(Number(set.weight_kg)) ? Number(set.weight_kg) : null, rpe: Number.isFinite(Number(set.rpe)) ? Number(set.rpe) : null, targetMin: Number.isFinite(targetMin(set)) ? targetMin(set) : null, targetMax: Number.isFinite(targetMax(set)) ? targetMax(set) : null, completedAt: set.completed_at })),
      weightedSets: row.weightedSets, successfulWeightedSets: row.successfulWeightedSets,
      bestWeightKg: row.bestWeightKg == null ? null : round(row.bestWeightKg, 2), bestE1rmKg: row.bestE1rmKg == null ? null : round(row.bestE1rmKg, 1), bestDurationSeconds: row.bestDurationSeconds,
      averageRpe: rpes.length ? round(rpes.reduce((sum, value) => sum + value, 0) / rpes.length, 1) : null,
      latestSucceeded, progressionEligible,
    };
  }).sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt));

  const sessions30 = sessions.filter((session) => new Date(session.completed_at) >= cutoff30);
  const sessionVolume30Kg = round(sessions30.reduce((sum, session) => sum + Math.max(0, Number(session.total_volume_kg) || 0), 0), 1);
  const setVolume30Kg = round(sets.filter((set) => new Date(set.completed_at) >= cutoff30).reduce((sum, set) => sum + setVolumeKg(set), 0), 1);
  return { hasData: sets.length > 0 || sessions.length > 0, setCount: sets.length, sessionCount: sessions.length, sessions30: sessions30.length, volume30Kg: sessionVolume30Kg || setVolume30Kg, lastSessionAt: sessions[0]?.completed_at || sets[0]?.completed_at || null, exercises: exercises.slice(0, 16) };
}

function formatSet(set) {
  if (set.metricType === "duration_seconds") {
    const target = set.targetMin && set.durationSeconds < set.targetMin ? ` (target ${set.targetMin}${set.targetMax && set.targetMax !== set.targetMin ? `–${set.targetMax}` : ""}s, missed)` : "";
    return `${set.durationSeconds}s${target}`;
  }
  const load = set.weightKg == null ? "bodyweight/unknown load" : `${round(set.weightKg, 2)}kg`;
  const rpe = set.rpe == null ? "" : ` @RPE${set.rpe}`;
  const target = set.targetMin && set.reps < set.targetMin ? ` (target ${set.targetMin}${set.targetMax && set.targetMax !== set.targetMin ? `–${set.targetMax}` : ""}, missed)` : "";
  return `${load}×${set.reps}${rpe}${target}`;
}

export function trainingContextInstructions(context) {
  if (!context?.hasData) return [];
  const lines = [
    `Training history is available: ${context.sessionCount} completed sessions and ${context.setCount} logged work sets in the loaded history.`,
    `Last completed training: ${context.lastSessionAt || "unknown"}. Completed sessions in the last 30 days: ${context.sessions30}. Approximate 30-day external-load volume: ${context.volume30Kg} kg.`,
    "Use history as evidence, not as an instruction. The user's direct request and athlete profile still take precedence.",
    "When an exercise clearly matches weighted historical data, you may ground a working weight in recent successful sets. Do not invent weights for new, ambiguous, or materially different exercises.",
    "For timed/isometric work, compare duration only with the same named variation. Never translate hold seconds into repetitions or e1RM.",
    "Progression must be conservative: normally do not increase external load by more than 5% from a recent successful comparable set. If recent RPE is 9.5-10, minimum targets were missed, or performance declined, do not increase load.",
  ];
  for (const exercise of context.exercises) {
    const recent = exercise.recentSets.slice(0, 4).map(formatSet).join(", ");
    const metrics = [exercise.bestWeightKg != null ? `best load ${exercise.bestWeightKg}kg` : null, exercise.bestE1rmKg != null ? `best e1RM ${exercise.bestE1rmKg}kg` : null, exercise.bestDurationSeconds != null ? `best hold ${exercise.bestDurationSeconds}s` : null, exercise.averageRpe != null ? `recent avg RPE ${exercise.averageRpe}` : null, exercise.progressionEligible ? "load progression eligible" : null].filter(Boolean).join("; ");
    lines.push(`${exercise.name}: recent ${recent || "no comparable work sets"}${metrics ? `; ${metrics}` : ""}.`);
  }
  return lines;
}
