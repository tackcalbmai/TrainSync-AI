import crypto from "node:crypto";
import { Decoder, Stream } from "@garmin/fitsdk";

function asArray(value) { return Array.isArray(value) ? value : value == null ? [] : [value]; }
function first(value) { return asArray(value).find((item) => item != null); }
function dateIso(value) { if (!value) return null; const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }
function numberOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function enumText(value) { if (value == null) return null; if (Array.isArray(value)) return enumText(value[0]); return String(value).trim() || null; }
function humanize(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || /^\d+$/.test(text)) return null;
  return text.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (char) => char.toUpperCase());
}
function activitySport(session, messages) { return enumText(session?.sport) || enumText(first(messages?.sportMesgs)?.sport) || null; }
function activitySubSport(session, messages) { return enumText(session?.subSport) || enumText(first(messages?.sportMesgs)?.subSport) || null; }
function strengthLike(sport, subSport) { const text = `${sport || ""} ${subSport || ""}`.toLowerCase(); return text.includes("strength") || (text.includes("training") && text.includes("strength")); }
function workoutStepMap(messages) {
  const map = new Map();
  for (const step of asArray(messages?.workoutStepMesgs)) { const index = numberOrNull(step?.messageIndex); if (index != null) map.set(index, step); }
  return map;
}
function setExerciseName(set, stepMap) {
  const stepIndex = numberOrNull(set?.wktStepIndex ?? set?.workoutStepIndex);
  const step = stepIndex == null ? null : stepMap.get(stepIndex);
  const stepName = humanize(step?.wktStepName || step?.notes); if (stepName) return stepName;
  const subtypeName = humanize(first(set?.categorySubtype)); if (subtypeName) return subtypeName;
  const categoryName = humanize(first(set?.category)); if (categoryName) return categoryName;
  if (stepIndex != null) return `Garmin Exercise ${stepIndex + 1}`;
  return "Garmin Strength Exercise";
}
function setTypeText(set) { return String(set?.setType ?? set?.type ?? "active").toLowerCase(); }
function isRestSet(set) { const type = setTypeText(set); return type === "rest" || type.includes("rest"); }
function isWarmupSet(set) { const type = setTypeText(set); return type.includes("warmup") || type.includes("warm_up"); }

function normalizeSetMessages(messages) {
  const stepMap = workoutStepMap(messages);
  const rawSets = asArray(messages?.setMesgs);
  const results = [];
  let lastExerciseKey = null, exerciseOrder = 0, setIndex = 0;
  for (const raw of rawSets) {
    if (!raw || isRestSet(raw)) continue;
    const rawReps = numberOrNull(raw.repetitions);
    const rawDuration = numberOrNull(raw.duration);
    const reps = rawReps != null && rawReps > 0 ? Math.round(rawReps) : null;
    const durationSeconds = rawDuration != null && rawDuration > 0 ? Math.max(1, Math.round(rawDuration)) : null;
    if (reps == null && durationSeconds == null) continue;
    const metricType = reps != null ? "reps" : "duration_seconds";

    const exerciseName = setExerciseName(raw, stepMap);
    const stepIndex = numberOrNull(raw?.wktStepIndex ?? raw?.workoutStepIndex);
    const category = enumText(first(raw?.category));
    const subtype = enumText(first(raw?.categorySubtype));
    const groupingKey = `${stepIndex ?? "na"}|${category ?? "na"}|${subtype ?? exerciseName}`;
    if (groupingKey !== lastExerciseKey) { exerciseOrder += 1; setIndex = 1; lastExerciseKey = groupingKey; } else setIndex += 1;

    const weightKg = numberOrNull(raw.weight);
    const completedAt = dateIso(raw.timestamp) || dateIso(raw.startTime);
    results.push({
      exerciseName, exerciseOrder, setIndex, metricType,
      reps,
      durationSeconds: metricType === "duration_seconds" ? durationSeconds : null,
      weightKg: weightKg != null && weightKg >= 0 ? weightKg : null,
      rpe: null,
      isWarmup: isWarmupSet(raw),
      completedAt,
      garmin: {
        setType: enumText(raw.setType), category, categorySubtype: subtype, workoutStepIndex: stepIndex,
        durationSeconds,
      },
    });
  }
  return results;
}

export function decodeGarminFit(bytesInput) {
  const bytes = bytesInput instanceof Uint8Array ? bytesInput : Uint8Array.from(bytesInput || []);
  if (!bytes.length) throw new Error("FIT_FILE_EMPTY");
  const stream = Stream.fromByteArray(Array.from(bytes));
  if (!Decoder.isFIT(stream)) throw new Error("NOT_A_FIT_FILE");
  const decoder = new Decoder(stream);
  if (!decoder.checkIntegrity()) throw new Error("FIT_INTEGRITY_FAILED");
  const decoded = decoder.read();
  if (decoded?.errors?.length) { const fatal = decoded.errors.find((error) => /fatal|crc|corrupt/i.test(String(error))); if (fatal) throw new Error(`FIT_DECODE_FAILED: ${fatal}`); }
  return decoded?.messages || {};
}
export function fitFileSha256(bytesInput) { const bytes = bytesInput instanceof Uint8Array ? bytesInput : Uint8Array.from(bytesInput || []); return crypto.createHash("sha256").update(bytes).digest("hex"); }

export function normalizeGarminActivity(messages, { providerActivityId = null, fileHash = null } = {}) {
  const sessions = asArray(messages?.sessionMesgs);
  const session = sessions[0] || {};
  const activity = first(messages?.activityMesgs) || {};
  const workout = first(messages?.workoutMesgs) || {};
  const sets = normalizeSetMessages(messages);
  const sport = activitySport(session, messages), subSport = activitySubSport(session, messages);
  const startedAt = dateIso(session.startTime) || dateIso(sets[0]?.completedAt) || dateIso(activity.timestamp) || null;
  const completedAt = dateIso(session.timestamp) || dateIso(activity.timestamp) || dateIso(sets[sets.length - 1]?.completedAt) || startedAt;
  const durationSeconds = Math.max(0, Math.round(numberOrNull(session.totalTimerTime) ?? numberOrNull(session.totalElapsedTime) ?? 0));
  const title = String(workout?.wktName || "Garmin Strength Training").trim() || "Garmin Strength Training";
  return {
    provider: "garmin",
    providerActivityId: providerActivityId || (fileHash ? `fit_${fileHash.slice(0, 24)}` : null),
    fileHash, title, sport, subSport,
    isStrength: strengthLike(sport, subSport) || sets.length > 0,
    startedAt, completedAt, durationSeconds, sets,
    summary: {
      totalSets: sets.length,
      totalVolumeKg: Math.round(sets.reduce((sum, set) => sum + ((set.weightKg || 0) * (set.reps || 0)), 0) * 10) / 10,
      timedSets: sets.filter((set) => set.metricType === "duration_seconds").length,
      averageHeartRate: numberOrNull(session.avgHeartRate), maxHeartRate: numberOrNull(session.maxHeartRate), calories: numberOrNull(session.totalCalories),
    },
  };
}
export function parseGarminFitActivity(bytesInput, options = {}) {
  const bytes = bytesInput instanceof Uint8Array ? bytesInput : Uint8Array.from(bytesInput || []);
  const fileHash = options.fileHash || fitFileSha256(bytes);
  const messages = decodeGarminFit(bytes);
  return normalizeGarminActivity(messages, { ...options, fileHash });
}
