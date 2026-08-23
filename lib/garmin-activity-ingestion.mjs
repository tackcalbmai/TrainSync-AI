function cleanText(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
const STOP = new Set(["the", "and", "with", "training", "workout", "session", "strength", "body"]);
function tokens(value) { return cleanText(value).split(" ").filter((token) => token && token.length > 1 && !STOP.has(token)); }
export function textSimilarity(a, b) {
  const leftText = cleanText(a), rightText = cleanText(b);
  if (!leftText || !rightText) return 0;
  if (leftText === rightText) return 1;
  if (leftText.includes(rightText) || rightText.includes(leftText)) return 0.86;
  const left = new Set(tokens(a)), right = new Set(tokens(b));
  if (!left.size || !right.size) return 0;
  let overlap = 0; for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / new Set([...left, ...right]).size;
}
function activityDate(activity) { const value = activity?.startedAt || activity?.completedAt; if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function dateKey(date, timezone = "UTC") { if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null; try { return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date); } catch { return date.toISOString().slice(0, 10); } }
function dayDistance(activity, workout) { const date = activityDate(activity); if (!date || !workout?.scheduled_date) return null; const local = dateKey(date, workout.timezone || workout.payload?.timezone || "UTC"); if (!local) return null; return Math.round(Math.abs(new Date(`${local}T12:00:00Z`) - new Date(`${workout.scheduled_date}T12:00:00Z`)) / 86400000); }
function usefulActivityExercises(activity) {
  const seen = new Set(), result = [];
  for (const set of activity?.sets || []) { const name = String(set?.exerciseName || "").trim(); const normalized = cleanText(name); if (!normalized || normalized.startsWith("garmin exercise") || normalized === "garmin strength exercise") continue; if (!seen.has(normalized)) { seen.add(normalized); result.push(name); } }
  return result;
}
function plannedExercises(workout) { return Array.isArray(workout?.payload?.exercises) ? workout.payload.exercises : []; }
function exerciseOverlap(activity, workout) {
  const actual = usefulActivityExercises(activity), planned = plannedExercises(workout).map((exercise) => exercise?.name).filter(Boolean);
  if (!actual.length || !planned.length) return null;
  let total = 0; for (const name of actual) { let best = 0; for (const target of planned) best = Math.max(best, textSimilarity(name, target)); total += best; }
  return Math.min(1, total / Math.max(actual.length, planned.length));
}
function setCountSimilarity(activity, workout) {
  const actual = Number(activity?.summary?.totalSets ?? activity?.sets?.length ?? 0);
  const planned = Number(workout?.payload?.totalSets ?? plannedExercises(workout).reduce((sum, exercise) => sum + (exercise?.sets?.length || 0), 0));
  if (!actual || !planned) return null;
  return Math.max(0, 1 - Math.abs(actual - planned) / Math.max(actual, planned));
}
export function scoreGarminWorkoutMatch(activity, workout) {
  const distance = dayDistance(activity, workout);
  const dateScore = distance == null ? 0.25 : distance === 0 ? 1 : distance === 1 ? 0.45 : 0;
  const titleScore = textSimilarity(activity?.title, workout?.title || workout?.payload?.title);
  const exercisesScore = exerciseOverlap(activity, workout), setsScore = setCountSimilarity(activity, workout);
  let score = exercisesScore != null
    ? dateScore * 0.45 + exercisesScore * 0.35 + titleScore * 0.12 + (setsScore ?? 0.5) * 0.08
    : dateScore * 0.58 + titleScore * 0.27 + (setsScore ?? 0.5) * 0.15;
  score = Math.round(score * 1000) / 1000;
  const highConfidence = distance === 0 && (score >= 0.72 || (exercisesScore != null && exercisesScore >= 0.55 && score >= 0.64) || (titleScore >= 0.86 && (setsScore == null || setsScore >= 0.5)));
  return { score, highConfidence, signals: { dayDistance: distance, dateScore: Math.round(dateScore * 1000) / 1000, titleScore: Math.round(titleScore * 1000) / 1000, exerciseScore: exercisesScore == null ? null : Math.round(exercisesScore * 1000) / 1000, setCountScore: setsScore == null ? null : Math.round(setsScore * 1000) / 1000 } };
}
export function matchGarminActivityToWorkout(activity, workouts = []) {
  const candidates = workouts.filter((workout) => workout && workout.status !== "completed" && workout.sport !== "running" && workout.sport !== "cycling").map((workout) => ({ workout, ...scoreGarminWorkoutMatch(activity, workout) })).sort((a, b) => b.score - a.score);
  const best = candidates[0] || null, runnerUp = candidates[1] || null;
  if (!best) return { matched: false, confidence: "none", best: null, candidates: [] };
  const margin = runnerUp ? best.score - runnerUp.score : best.score;
  const matched = best.highConfidence && (margin >= 0.08 || best.score >= 0.84);
  return { matched, confidence: matched ? "high" : best.score >= 0.55 ? "possible" : "low", best: { workoutId: best.workout.id, title: best.workout.title, score: best.score, signals: best.signals }, candidates: candidates.slice(0, 3).map((candidate) => ({ workoutId: candidate.workout.id, title: candidate.workout.title, score: candidate.score, signals: candidate.signals })) };
}
function bestPlannedExercise(name, workout) {
  let best = null;
  for (const exercise of plannedExercises(workout)) { const score = textSimilarity(name, exercise?.name); if (!best || score > best.score) best = { exercise, score }; }
  return best && best.score >= 0.45 ? best : null;
}
function positiveInt(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.round(n) : null; }
function finiteRir(value) { const n = Number(value); return Number.isFinite(n) && n >= 0 && n <= 6 ? n : null; }
function rangeForTarget(set) {
  const metricType = String(set?.metricType || "reps").toLowerCase();
  if (metricType === "duration_seconds") {
    const min = positiveInt(set?.minDurationSeconds ?? set?.targetDurationSeconds);
    const max = positiveInt(set?.maxDurationSeconds ?? set?.targetDurationSeconds ?? min);
    return { metricType, targetReps: null, targetMinReps: null, targetMaxReps: null, targetDurationSeconds: min != null && min === max ? min : null, targetMinDurationSeconds: min, targetMaxDurationSeconds: max };
  }
  const min = positiveInt(set?.minReps ?? set?.targetReps);
  const max = positiveInt(set?.maxReps ?? set?.targetReps ?? min);
  return { metricType: "reps", targetReps: min != null && min === max ? min : null, targetMinReps: min, targetMaxReps: max, targetDurationSeconds: null, targetMinDurationSeconds: null, targetMaxDurationSeconds: null };
}
export function targetForGarminSet(set, workout) {
  const empty = { metricType: set?.metricType === "duration_seconds" ? "duration_seconds" : "reps", targetReps: null, targetMinReps: null, targetMaxReps: null, targetDurationSeconds: null, targetMinDurationSeconds: null, targetMaxDurationSeconds: null, targetWeightKg: null, targetRir: null, plannedExercise: null, plannedExerciseKey: null, similarity: 0 };
  if (!workout) return empty;
  const match = bestPlannedExercise(set?.exerciseName, workout); if (!match) return empty;
  const targetSet = match.exercise?.sets?.[Math.max(0, Number(set?.setIndex || 1) - 1)] || match.exercise?.sets?.[0] || null;
  const range = rangeForTarget(targetSet || {});
  return { ...range, targetWeightKg: targetSet?.weightKg == null ? null : Number(targetSet.weightKg), targetRir: finiteRir(targetSet?.targetRir), plannedExercise: match.exercise?.name || null, plannedExerciseKey: match.exercise?.exerciseKey || null, similarity: Math.round(match.score * 1000) / 1000 };
}
