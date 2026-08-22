export function normalizeExerciseKey(name) {
  return String(name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180) || "exercise";
}
export function setVolumeKg(set) {
  const reps = Number(set?.reps ?? 0), weight = Number(set?.weight_kg ?? set?.weightKg ?? 0);
  if (!Number.isFinite(reps) || !Number.isFinite(weight) || reps <= 0 || weight <= 0) return 0;
  return reps * weight;
}
export function epleyE1rmKg(weightKg, reps) {
  const weight = Number(weightKg), count = Number(reps);
  if (!Number.isFinite(weight) || !Number.isFinite(count) || weight <= 0 || count <= 0 || count > 12) return null;
  if (count === 1) return round(weight, 1);
  return round(weight * (1 + count / 30), 1);
}
export function sessionVolumeKg(sets = []) { return round(sets.reduce((sum, set) => sum + setVolumeKg(set), 0), 1); }
export function formatLoadKg(value) { const amount = Number(value); if (!Number.isFinite(amount)) return "—"; return amount >= 1000 ? `${round(amount / 1000, 1)}t` : `${round(amount, 0)}kg`; }
function validCompletedSet(set) { return Boolean(set?.completed_at) && (Number(set?.reps) > 0 || Number(set?.duration_seconds ?? set?.durationSeconds) > 0); }

export function summarizeProgress(sessions = [], sets = [], options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const completed = sessions.filter((session) => session?.status === "completed" && session?.completed_at).sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
  const completedSets = sets.filter(validCompletedSet).sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
  const cutoff30 = shiftDays(now, -30), cutoff56 = shiftDays(now, -56), cutoff28 = shiftDays(now, -28), cutoffPrev28 = shiftDays(now, -56);
  const sessions30 = completed.filter((session) => new Date(session.completed_at) >= cutoff30);
  const sets30 = completedSets.filter((set) => new Date(set.completed_at) >= cutoff30);
  const sets56 = completedSets.filter((set) => new Date(set.completed_at) >= cutoff56);
  const volume30 = round(sets30.reduce((sum, set) => sum + setVolumeKg(set), 0), 1);
  const workSets30 = sets30.length;
  const duration30 = sessions30.reduce((sum, session) => sum + Math.max(0, Number(session.duration_seconds) || 0), 0);
  const current28Volume = completedSets.filter((set) => new Date(set.completed_at) >= cutoff28).reduce((sum, set) => sum + setVolumeKg(set), 0);
  const previous28Volume = completedSets.filter((set) => { const date = new Date(set.completed_at); return date >= cutoffPrev28 && date < cutoff28; }).reduce((sum, set) => sum + setVolumeKg(set), 0);
  const trendPct = previous28Volume > 0 ? round(((current28Volume - previous28Volume) / previous28Volume) * 100, 1) : null;

  const exerciseMap = new Map(), achievementMap = new Map();
  for (const set of completedSets) {
    const key = set.exercise_key || normalizeExerciseKey(set.exercise_name);
    if (!exerciseMap.has(key)) {
      exerciseMap.set(key, { key, name: set.exercise_name || key, sets: 0, volumeKg: 0, bestWeightKg: null, bestE1rmKg: null, bestDurationSeconds: null, latestAt: null, first56E1rmKg: null, best56E1rmKg: null });
      achievementMap.set(key, { bestE1rm: 0, bestWeight: 0 });
    }
    const row = exerciseMap.get(key);
    row.name = set.exercise_name || row.name; row.sets += 1; row.volumeKg += setVolumeKg(set);
    const duration = Number(set.duration_seconds ?? set.durationSeconds);
    if (Number.isFinite(duration) && duration > 0) row.bestDurationSeconds = Math.max(row.bestDurationSeconds || 0, duration);
    const weight = Number(set.weight_kg);
    if (Number.isFinite(weight) && weight > 0) row.bestWeightKg = Math.max(row.bestWeightKg || 0, weight);
    const e1rm = epleyE1rmKg(weight, set.reps);
    if (e1rm != null) row.bestE1rmKg = Math.max(row.bestE1rmKg || 0, e1rm);
    const date = new Date(set.completed_at);
    if (!row.latestAt || date > new Date(row.latestAt)) row.latestAt = set.completed_at;
    if (date >= cutoff56 && e1rm != null) { if (row.first56E1rmKg == null) row.first56E1rmKg = e1rm; row.best56E1rmKg = Math.max(row.best56E1rmKg || 0, e1rm); }
    const achievement = achievementMap.get(key);
    if (e1rm != null && e1rm > achievement.bestE1rm) { if (date >= cutoff30) achievement.lastPrAt = set.completed_at; achievement.bestE1rm = e1rm; }
    if (Number.isFinite(weight) && weight > achievement.bestWeight) { if (date >= cutoff30) achievement.lastWeightPrAt = set.completed_at; achievement.bestWeight = weight; }
  }
  const exercises = [...exerciseMap.values()].map((row) => ({ ...row, volumeKg: round(row.volumeKg, 1), change56Pct: row.first56E1rmKg && row.best56E1rmKg ? round(((row.best56E1rmKg - row.first56E1rmKg) / row.first56E1rmKg) * 100, 1) : null })).sort((a, b) => (b.bestE1rmKg || b.bestWeightKg || b.bestDurationSeconds || b.volumeKg) - (a.bestE1rmKg || a.bestWeightKg || a.bestDurationSeconds || a.volumeKg));
  const recentPrExercises = exercises.filter((row) => { const achievement = achievementMap.get(row.key); return achievement?.lastPrAt || achievement?.lastWeightPrAt; });
  return { sessions30: sessions30.length, volume30Kg: volume30, workSets30, duration30Seconds: duration30, trendPct, recentPrCount: recentPrExercises.length, exercises, weeklyVolume: weeklyVolumeBuckets(completedSets, now, 8), recentSessions: [...completed].sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at)).slice(0, 8), hasData: completed.length > 0 || completedSets.length > 0, sets56Count: sets56.length };
}

export function weeklyVolumeBuckets(sets = [], nowInput = new Date(), weeks = 8) {
  const now = new Date(nowInput), end = endOfDay(now), buckets = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const bucketEnd = shiftDays(end, -index * 7), bucketStart = shiftDays(bucketEnd, -6);
    const volumeKg = sets.reduce((sum, set) => { const date = new Date(set.completed_at); return date >= startOfDay(bucketStart) && date <= endOfDay(bucketEnd) ? sum + setVolumeKg(set) : sum; }, 0);
    buckets.push({ start: dateKey(bucketStart), end: dateKey(bucketEnd), volumeKg: round(volumeKg, 1) });
  }
  return buckets;
}
function shiftDays(dateInput, days) { const date = new Date(dateInput); date.setDate(date.getDate() + days); return date; }
function startOfDay(dateInput) { const date = new Date(dateInput); date.setHours(0, 0, 0, 0); return date; }
function endOfDay(dateInput) { const date = new Date(dateInput); date.setHours(23, 59, 59, 999); return date; }
function dateKey(dateInput) { const date = new Date(dateInput); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function round(value, digits = 1) { const factor = 10 ** digits; return Math.round((Number(value) + Number.EPSILON) * factor) / factor; }
