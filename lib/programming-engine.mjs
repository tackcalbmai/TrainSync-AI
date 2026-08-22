// Evidence-constrained multi-week resistance-program validator.
// This module deliberately separates hard structural validation from
// evidence-informed warnings and product heuristics.

export const EVIDENCE_VERSION = "2026-08-22";

export const RULES = Object.freeze({
  fractionalSecondarySet: { value: 0.5, evidence: "high", source: "Pelland 2026" },
  highPerSessionMuscleSets: { value: 11, evidence: "emerging", source: "Remmert 2025 preprint" },
  heavyCompoundMinRestSec: { value: 120, evidence: "moderate", source: "Singer 2024; Grgic 2017" },
  hypertrophyCompoundMinRestSec: { value: 90, evidence: "moderate", source: "Singer 2024; Grgic 2017" },
  accessoryMinRestSec: { value: 45, evidence: "heuristic", source: "time-efficiency guardrail" },
  highEffortCompoundRir: { value: 0, evidence: "moderate", source: "Robinson 2024; Refalo 2023" },
  primaryStrengthMaxReps: { value: 10, evidence: "moderate", source: "load-specific strength evidence; ACSM 2026; Lopez 2021" },
  competingSuperset: { evidence: "moderate", source: "superset systematic review/meta-analysis" },
  sharedFatigueSuperset: { evidence: "heuristic", source: "fatigue/setup compatibility guardrail" },
  samePriorityMuscleMinGapHours: { value: 24, evidence: "heuristic", source: "fatigue-management guardrail" },
  minimumPriorityFractionalSets: { value: 4, evidence: "heuristic", source: "priority-stimulus floor for program QA" },
  durationToleranceRatio: { value: 0.2, evidence: "heuristic", source: "product scheduling tolerance" },
});

const MUSCLE_ALIASES = new Map([
  ["pecs", "chest"], ["pectorals", "chest"], ["pectoralis", "chest"],
  ["front delts", "front_delts"], ["anterior delts", "front_delts"],
  ["side delts", "side_delts"], ["lateral delts", "side_delts"],
  ["rear delts", "rear_delts"], ["posterior delts", "rear_delts"],
  ["lats", "lats"], ["latissimus", "lats"],
  ["upper back", "upper_back"], ["mid back", "upper_back"],
  ["quads", "quads"], ["quadriceps", "quads"],
  ["hams", "hamstrings"], ["hamstrings", "hamstrings"],
  ["glute", "glutes"], ["glutes", "glutes"],
  ["calf", "calves"], ["calves", "calves"],
  ["biceps", "biceps"], ["triceps", "triceps"],
  ["forearms", "forearms"], ["abs", "abs"], ["core", "abs"],
  ["spinal erectors", "spinal_erectors"], ["erectors", "spinal_erectors"],
  ["adductors", "adductors"], ["abductors", "abductors"],
]);

function arr(value) { return Array.isArray(value) ? value : value == null ? [] : [value]; }
function num(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function round(value, digits = 2) { const p = 10 ** digits; return Math.round(value * p) / p; }

export function normalizeMuscle(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  if (!raw) return null;
  return MUSCLE_ALIASES.get(raw) || raw.replace(/\s+/g, "_");
}

export function exerciseKey(value) {
  return String(value || "exercise").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "exercise";
}

export function setCount(exercise) {
  if (Array.isArray(exercise?.sets)) return exercise.sets.length;
  const count = num(exercise?.setCount ?? exercise?.sets, 0);
  return Math.max(0, Math.round(count || 0));
}

export function fractionalMuscleVolume(exercises = []) {
  const direct = {}, indirect = {}, fractional = {};
  for (const exercise of arr(exercises)) {
    const sets = setCount(exercise);
    if (!sets) continue;
    const primary = new Set(arr(exercise.primaryMuscles ?? exercise.primary_muscles).map(normalizeMuscle).filter(Boolean));
    const secondary = new Set(arr(exercise.secondaryMuscles ?? exercise.secondary_muscles).map(normalizeMuscle).filter(Boolean));
    for (const muscle of primary) { direct[muscle] = (direct[muscle] || 0) + sets; fractional[muscle] = (fractional[muscle] || 0) + sets; }
    for (const muscle of secondary) {
      if (primary.has(muscle)) continue;
      indirect[muscle] = (indirect[muscle] || 0) + sets;
      fractional[muscle] = (fractional[muscle] || 0) + sets * RULES.fractionalSecondarySet.value;
    }
  }
  for (const table of [direct, indirect, fractional]) for (const key of Object.keys(table)) table[key] = round(table[key], 1);
  return { direct, indirect, fractional };
}

function setPrescription(exercise, index) { if (Array.isArray(exercise?.sets)) return exercise.sets[index] || exercise.sets[0] || {}; return exercise?.prescription || {}; }
function setMetric(set, exercise = null) { return String(set?.metricType ?? set?.metric_type ?? exercise?.setMetric ?? exercise?.set_metric ?? "reps").toLowerCase(); }
function setWorkSeconds(exercise, index) {
  const prescription = setPrescription(exercise, index);
  if (setMetric(prescription, exercise) === "duration_seconds") return Math.max(5, num(prescription.maxDurationSeconds ?? prescription.targetDurationSeconds ?? prescription.durationSeconds, 30));
  const maxReps = num(prescription.maxReps ?? prescription.targetReps ?? prescription.reps, 8);
  const repSeconds = Math.max(2, Math.min(8, num(prescription.repSeconds, 4)));
  return Math.max(15, maxReps * repSeconds);
}
function setRestSeconds(exercise, index) { const prescription = setPrescription(exercise, index); return Math.max(0, num(prescription.restSec ?? exercise.restSec, 90)); }

function supersetGroups(exercises) {
  const paired = new Map(), singles = [];
  for (const exercise of exercises) {
    const group = String(exercise?.supersetGroup || "").trim();
    if (!group) { singles.push(exercise); continue; }
    if (!paired.has(group)) paired.set(group, []);
    paired.get(group).push(exercise);
  }
  return { paired, singles };
}

export function estimateSessionMinutes(session) {
  const exercises = arr(session?.exercises ?? session?.payload?.exercises);
  let seconds = 5 * 60;
  const { paired, singles } = supersetGroups(exercises);
  for (const exercise of singles) {
    const count = setCount(exercise);
    if (!count) continue;
    seconds += 75;
    for (let i = 0; i < count; i += 1) { seconds += setWorkSeconds(exercise, i); if (i < count - 1) seconds += setRestSeconds(exercise, i); }
  }
  for (const groupExercises of paired.values()) {
    const usable = groupExercises.filter((exercise) => setCount(exercise) > 0);
    if (!usable.length) continue;
    seconds += 60 * usable.length;
    const rounds = Math.max(...usable.map(setCount));
    for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
      let roundRest = 0;
      for (const exercise of usable) {
        if (roundIndex >= setCount(exercise)) continue;
        seconds += setWorkSeconds(exercise, roundIndex) + 15;
        roundRest = Math.max(roundRest, setRestSeconds(exercise, roundIndex));
      }
      if (roundIndex < rounds - 1) seconds += roundRest;
    }
  }
  return Math.max(1, Math.round(seconds / 60));
}

export function sessionDose(session) {
  const exercises = arr(session?.exercises ?? session?.payload?.exercises);
  return { totalSets: exercises.reduce((sum, exercise) => sum + setCount(exercise), 0), muscles: fractionalMuscleVolume(exercises), estimatedMinutes: estimateSessionMinutes({ ...session, exercises }) };
}

export function weeklyDose(sessions = []) {
  const direct = {}, indirect = {}, fractional = {};
  let totalSets = 0;
  for (const session of arr(sessions)) {
    const dose = sessionDose(session); totalSets += dose.totalSets;
    for (const [key, value] of Object.entries(dose.muscles.direct)) direct[key] = (direct[key] || 0) + value;
    for (const [key, value] of Object.entries(dose.muscles.indirect)) indirect[key] = (indirect[key] || 0) + value;
    for (const [key, value] of Object.entries(dose.muscles.fractional)) fractional[key] = (fractional[key] || 0) + value;
  }
  for (const table of [direct, indirect, fractional]) for (const key of Object.keys(table)) table[key] = round(table[key], 1);
  return { totalSets, muscles: { direct, indirect, fractional } };
}

function roleOf(exercise) { return String(exercise?.role || "hypertrophy").toLowerCase(); }
function movementOf(exercise) { return String(exercise?.movementPattern || exercise?.movement_pattern || "").toLowerCase(); }
function loadTypeOf(exercise) { return String(exercise?.loadType || exercise?.load_type || "").toLowerCase(); }
function progressionModeOf(exercise) { return String(exercise?.progressionMode || exercise?.progression_mode || "").toLowerCase(); }
function pushFinding(list, severity, code, message, context = {}, evidence = "heuristic") { list.push({ severity, code, message, evidence, context }); }
function primaryMuscles(exercise) { return new Set(arr(exercise?.primaryMuscles ?? exercise?.primary_muscles).map(normalizeMuscle).filter(Boolean)); }
function secondaryMuscles(exercise) { return new Set(arr(exercise?.secondaryMuscles ?? exercise?.secondary_muscles).map(normalizeMuscle).filter(Boolean)); }
function allMuscles(exercise) { return new Set([...primaryMuscles(exercise), ...secondaryMuscles(exercise)]); }

function validateSupersets(exercises, warnings) {
  const { paired } = supersetGroups(exercises);
  for (const [group, members] of paired.entries()) {
    if (members.length < 2) { pushFinding(warnings, "warning", "ORPHAN_SUPERSET", `Superset ${group} contains only one exercise, so it provides no time-efficiency benefit.`, { group }, "heuristic"); continue; }
    if (members.length > 3) pushFinding(warnings, "warning", "OVERLOADED_SUPERSET", `Superset ${group} contains ${members.length} exercises; long circuits may make loading and equipment flow impractical.`, { group, exercises: members.length }, "heuristic");
    const strengthMembers = members.filter((exercise) => roleOf(exercise).includes("strength"));
    if (strengthMembers.length >= 2) pushFinding(warnings, "warning", "HEAVY_PRIORITY_SUPERSET", `Superset ${group} pairs multiple strength-focused exercises; time savings may compromise priority performance.`, { group, exercises: strengthMembers.map((x) => x.name) }, RULES.competingSuperset.evidence);
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const a = members[i], b = members[j];
        const leftPrimary = primaryMuscles(a), rightPrimary = primaryMuscles(b);
        const primaryOverlap = [...leftPrimary].filter((muscle) => rightPrimary.has(muscle));
        if (primaryOverlap.length) pushFinding(warnings, "warning", "COMPETING_SUPERSET", `Superset ${group} directly targets ${primaryOverlap.join(", ")} in both exercises; this pairing may reduce repetitions or load compared with non-competing pairing.`, { group, muscles: primaryOverlap, exercises: [a.name, b.name] }, RULES.competingSuperset.evidence);
        const leftAll = allMuscles(a), rightAll = allMuscles(b);
        const shared = [...leftAll].filter((muscle) => rightAll.has(muscle));
        const limitingShared = shared.filter((muscle) => ["forearms","spinal_erectors","abs"].includes(muscle));
        const compoundOrStrength = [a, b].some((exercise) => roleOf(exercise).includes("strength") || roleOf(exercise).includes("compound"));
        if (!primaryOverlap.length && limitingShared.length && compoundOrStrength) pushFinding(warnings, "warning", "SHARED_LIMITER_SUPERSET", `Superset ${group} shares a likely limiting stabilizer (${limitingShared.join(", ")}) with a strength/compound movement; the pair may be locally non-competing but still degrade performance.`, { group, muscles: limitingShared, exercises: [a.name, b.name] }, RULES.sharedFatigueSuperset.evidence);
        if (movementOf(a) === "hinge" && movementOf(b) === "hinge") pushFinding(warnings, "warning", "HINGE_SUPERSET", `Superset ${group} combines two hinge-pattern exercises; trunk, grip and posterior-chain fatigue may make this pairing inefficient.`, { group, exercises: [a.name, b.name] }, RULES.sharedFatigueSuperset.evidence);
      }
    }
  }
}

function maxPrescribedReps(exercise) {
  const count = setCount(exercise); let best = null;
  for (let i = 0; i < count; i += 1) {
    const set = setPrescription(exercise, i);
    if (setMetric(set, exercise) !== "reps") continue;
    const value = num(set.maxReps ?? set.targetReps ?? set.reps, null);
    if (value != null) best = best == null ? value : Math.max(best, value);
  }
  return best;
}

export function validateProgramSession(session, options = {}) {
  const errors = [], warnings = [], notes = [];
  const exercises = arr(session?.exercises ?? session?.payload?.exercises);
  const targetMinutes = num(session?.estimatedDurationMinutes ?? session?.payload?.estimatedDurationMinutes ?? options.defaultSessionMinutes, null);
  if (!session?.title) pushFinding(errors, "error", "SESSION_TITLE_REQUIRED", "Session title is required.");
  if (!exercises.length) pushFinding(errors, "error", "SESSION_EXERCISES_REQUIRED", "Session must contain at least one exercise.");
  const seen = new Set();
  for (const exercise of exercises) {
    const key = exerciseKey(exercise?.exerciseKey || exercise?.name);
    if (!exercise?.name) pushFinding(errors, "error", "EXERCISE_NAME_REQUIRED", "Every exercise needs a name.");
    if (seen.has(key)) pushFinding(warnings, "warning", "DUPLICATE_EXERCISE", `${exercise?.name || "Exercise"} appears more than once in this session.`, { exerciseKey: key });
    seen.add(key);
    const count = setCount(exercise);
    if (count < 1) pushFinding(errors, "error", "SETS_REQUIRED", `${exercise?.name || "Exercise"} needs at least one working set.`, { exerciseKey: key });
    if (!arr(exercise.primaryMuscles ?? exercise.primary_muscles).length) pushFinding(warnings, "warning", "PRIMARY_MUSCLE_MISSING", `${exercise?.name || "Exercise"} has no primary muscle mapping, so volume balance cannot be trusted.`, { exerciseKey: key });
    if (!movementOf(exercise) || !loadTypeOf(exercise) || !progressionModeOf(exercise)) pushFinding(warnings, "warning", "TRACKABILITY_METADATA_MISSING", `${exercise?.name || "Exercise"} is missing movement/load/progression metadata, so automatic adaptation will be less reliable.`, { exerciseKey: key }, "heuristic");
    if (roleOf(exercise) === "primary_strength") {
      const maxReps = maxPrescribedReps(exercise);
      if (maxReps != null && maxReps > RULES.primaryStrengthMaxReps.value) pushFinding(warnings, "warning", "PRIMARY_STRENGTH_REP_RANGE_BROAD", `${exercise?.name} is labeled primary strength but reaches ${maxReps} reps. A harder load or named bodyweight variation would usually make strength-specific tracking cleaner.`, { exerciseKey: key, maxReps }, RULES.primaryStrengthMaxReps.evidence);
    }
    if (["bodyweight","assisted_bodyweight"].includes(loadTypeOf(exercise)) && progressionModeOf(exercise) === "load_progression") pushFinding(warnings, "warning", "BODYWEIGHT_PROGRESSION_MISMATCH", `${exercise?.name} is bodyweight-based but uses load_progression. Use a trackable variant or reps-first progression unless external loading is explicitly part of the exercise.`, { exerciseKey: key }, "heuristic");

    for (let i = 0; i < count; i += 1) {
      const set = setPrescription(exercise, i);
      const metric = setMetric(set, exercise);
      const rir = num(set.targetRir ?? set.rir, null);
      const rest = num(set.restSec ?? exercise.restSec, null);
      if (metric === "duration_seconds") {
        const minDuration = num(set.minDurationSeconds ?? set.targetDurationSeconds ?? set.durationSeconds, null);
        const maxDuration = num(set.maxDurationSeconds ?? set.targetDurationSeconds ?? set.durationSeconds, minDuration);
        if (minDuration == null || minDuration < 1 || maxDuration == null || maxDuration < minDuration) pushFinding(errors, "error", "DURATION_RANGE_INVALID", `${exercise?.name || "Exercise"} set ${i + 1} has an invalid timed prescription.`, { exerciseKey: key, set: i + 1 });
        if (set.minReps != null || set.maxReps != null || set.targetReps != null) pushFinding(warnings, "warning", "MIXED_SET_METRIC", `${exercise?.name || "Exercise"} set ${i + 1} is time-based but also contains rep targets.`, { exerciseKey: key, set: i + 1 });
      } else {
        const minReps = num(set.minReps ?? set.targetReps ?? set.reps, null);
        const maxReps = num(set.maxReps ?? set.targetReps ?? set.reps, null);
        if (minReps == null || minReps < 1 || maxReps == null || maxReps < minReps) pushFinding(errors, "error", "REP_RANGE_INVALID", `${exercise?.name || "Exercise"} set ${i + 1} has an invalid rep prescription.`, { exerciseKey: key, set: i + 1 });
      }
      if (rir != null && (rir < 0 || rir > 6)) pushFinding(errors, "error", "RIR_INVALID", `${exercise?.name || "Exercise"} set ${i + 1} has target RIR outside 0–6.`, { exerciseKey: key, set: i + 1 });
      if (rest == null || rest < 0) pushFinding(errors, "error", "REST_INVALID", `${exercise?.name || "Exercise"} set ${i + 1} needs a valid rest interval.`, { exerciseKey: key, set: i + 1 });
      const role = roleOf(exercise);
      if (rest != null && role.includes("strength") && rest < RULES.heavyCompoundMinRestSec.value) pushFinding(warnings, "warning", "HEAVY_REST_SHORT", `${exercise?.name} has ${rest}s rest; heavy priority work usually benefits from more recovery.`, { exerciseKey: key, restSec: rest }, RULES.heavyCompoundMinRestSec.evidence);
      else if (rest != null && role.includes("compound") && rest < RULES.hypertrophyCompoundMinRestSec.value) pushFinding(warnings, "warning", "COMPOUND_REST_SHORT", `${exercise?.name} has ${rest}s rest; this may reduce repetitions/load across sets.`, { exerciseKey: key, restSec: rest }, RULES.hypertrophyCompoundMinRestSec.evidence);
      if (rir === 0 && role.includes("strength") && count >= 3) pushFinding(warnings, "warning", "REPEATED_COMPOUND_FAILURE", `${exercise?.name} prescribes repeated failure on heavy strength work, increasing fatigue without a clear strength-specific need.`, { exerciseKey: key }, RULES.highEffortCompoundRir.evidence);
    }
  }
  validateSupersets(exercises, warnings);
  const dose = sessionDose({ ...session, exercises });
  for (const [muscle, sets] of Object.entries(dose.muscles.fractional)) if (sets > RULES.highPerSessionMuscleSets.value) pushFinding(warnings, "warning", "HIGH_SESSION_MUSCLE_VOLUME", `${muscle} receives ${sets} fractional sets in one session; returns may diminish and quality may fall.`, { muscle, fractionalSets: sets }, RULES.highPerSessionMuscleSets.evidence);
  if (targetMinutes) {
    const delta = Math.abs(dose.estimatedMinutes - targetMinutes) / targetMinutes;
    if (delta > RULES.durationToleranceRatio.value) pushFinding(warnings, "warning", "SESSION_TIME_MISMATCH", `Estimated duration is ~${dose.estimatedMinutes} min versus a ${targetMinutes} min target.`, { estimatedMinutes: dose.estimatedMinutes, targetMinutes }, RULES.durationToleranceRatio.evidence);
  }
  return { valid: errors.length === 0, errors, warnings, notes, dose };
}

function dateMs(value) { if (!value) return null; const d = new Date(String(value).length <= 10 ? `${value}T12:00:00Z` : value); return Number.isNaN(d.getTime()) ? null : d.getTime(); }
function movementCoverage(sessions) {
  const patterns = new Set();
  for (const session of arr(sessions)) for (const exercise of arr(session?.exercises ?? session?.payload?.exercises)) { const movement = movementOf(exercise); if (movement) patterns.add(movement); }
  return { patterns: [...patterns], upperPush: patterns.has("horizontal_push") || patterns.has("vertical_push"), upperPull: patterns.has("horizontal_pull") || patterns.has("vertical_pull"), kneeDominant: patterns.has("squat") || patterns.has("lunge"), hinge: patterns.has("hinge") };
}

export function validateProgram(program, sessions = []) {
  const errors = [], warnings = [], notes = [];
  const durationWeeks = num(program?.duration_weeks ?? program?.durationWeeks, 0);
  const daysPerWeek = num(program?.days_per_week ?? program?.daysPerWeek, 0);
  const goal = String(program?.goal || "").toLowerCase();
  if (!program?.title) pushFinding(errors, "error", "PROGRAM_TITLE_REQUIRED", "Program title is required.");
  if (!program?.goal) pushFinding(errors, "error", "PROGRAM_GOAL_REQUIRED", "Program goal is required.");
  if (durationWeeks < 1 || durationWeeks > 52) pushFinding(errors, "error", "PROGRAM_DURATION_INVALID", "Program duration must be 1–52 weeks.");
  if (daysPerWeek < 1 || daysPerWeek > 7) pushFinding(errors, "error", "PROGRAM_FREQUENCY_INVALID", "Training days per week must be 1–7.");
  const byWeek = new Map();
  for (const session of arr(sessions)) {
    const week = num(session.week_index ?? session.weekIndex, 1);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week).push(session);
    const result = validateProgramSession(session, { defaultSessionMinutes: program?.default_session_minutes ?? program?.defaultSessionMinutes });
    errors.push(...result.errors.map((f) => ({ ...f, context: { ...f.context, week, sessionId: session.id || null } })));
    warnings.push(...result.warnings.map((f) => ({ ...f, context: { ...f.context, week, sessionId: session.id || null } })));
  }
  const weekSummaries = [];
  for (const [week, weekSessions] of [...byWeek.entries()].sort((a, b) => a[0] - b[0])) {
    if (daysPerWeek && weekSessions.length > daysPerWeek) pushFinding(warnings, "warning", "WEEK_EXCEEDS_PLANNED_DAYS", `Week ${week} has ${weekSessions.length} sessions versus ${daysPerWeek} planned days.`, { week, sessions: weekSessions.length });
    const dose = weeklyDose(weekSessions), coverage = movementCoverage(weekSessions);
    weekSummaries.push({ week, sessionCount: weekSessions.length, dose, movementCoverage: coverage });
    if (["mixed","general_fitness","fat_loss"].includes(goal)) {
      const missing = [];
      if (!coverage.upperPush) missing.push("upper-body push");
      if (!coverage.upperPull) missing.push("upper-body pull");
      if (!coverage.kneeDominant) missing.push("knee-dominant lower body");
      if (!coverage.hinge) missing.push("hip hinge");
      if (missing.length) pushFinding(warnings, "warning", "MOVEMENT_COVERAGE_GAP", `Week ${week} is missing ${missing.join(", ")} exposure for a ${goal} program.`, { week, missing }, "heuristic");
    }
    const dated = weekSessions.map((session) => ({ session, time: dateMs(session.scheduled_date ?? session.scheduledDate), dose: sessionDose(session) })).filter((x) => x.time != null).sort((a, b) => a.time - b.time);
    for (let i = 1; i < dated.length; i += 1) {
      const prev = dated[i - 1], curr = dated[i];
      const gapHours = (curr.time - prev.time) / 36e5;
      if (gapHours >= RULES.samePriorityMuscleMinGapHours.value) continue;
      for (const muscle of Object.keys(curr.dose.muscles.direct)) if ((curr.dose.muscles.direct[muscle] || 0) >= 3 && (prev.dose.muscles.direct[muscle] || 0) >= 3) pushFinding(warnings, "warning", "DENSE_REPEAT_EXPOSURE", `${muscle} receives substantial direct work in sessions less than ${RULES.samePriorityMuscleMinGapHours.value}h apart.`, { week, muscle, gapHours: round(gapHours, 1) }, RULES.samePriorityMuscleMinGapHours.evidence);
    }
  }
  const priorityMuscles = arr(program?.priority?.muscles).map(normalizeMuscle).filter(Boolean);
  if (priorityMuscles.length && weekSummaries.length) {
    for (const summary of weekSummaries) for (const muscle of priorityMuscles) {
      const fractional = summary.dose.muscles.fractional[muscle] || 0, direct = summary.dose.muscles.direct[muscle] || 0;
      if (fractional === 0) pushFinding(errors, "error", "PRIORITY_MUSCLE_MISSING", `${muscle} is marked as a priority but receives no work in week ${summary.week}.`, { week: summary.week, muscle });
      else if (fractional < RULES.minimumPriorityFractionalSets.value) pushFinding(warnings, "warning", "PRIORITY_STIMULUS_LOW", `${muscle} is marked as a priority but receives only ${fractional} fractional sets in week ${summary.week}.`, { week: summary.week, muscle, fractionalSets: fractional }, RULES.minimumPriorityFractionalSets.evidence);
      if (fractional > 0 && direct === 0) pushFinding(warnings, "warning", "PRIORITY_ONLY_INDIRECT", `${muscle} is marked as a priority but receives only indirect work in week ${summary.week}.`, { week: summary.week, muscle, fractionalSets: fractional }, "heuristic");
    }
  }
  return { valid: errors.length === 0, evidenceVersion: EVIDENCE_VERSION, errors, warnings, notes, weekSummaries };
}

function targetMetric(target) { return String(target?.metricType ?? target?.metric_type ?? (target?.durationSeconds != null || target?.targetDurationSeconds != null ? "duration_seconds" : "reps")).toLowerCase(); }
function actualMetric(actual) { return String(actual?.metricType ?? actual?.metric_type ?? (actual?.durationSeconds != null ? "duration_seconds" : "reps")).toLowerCase(); }

export function classifyExercisePerformance({ targetSets = [], actualSets = [] } = {}) {
  const targets = arr(targetSets);
  const actual = arr(actualSets).filter((set) => actualMetric(set) === "duration_seconds" ? num(set?.durationSeconds ?? set?.duration_seconds, 0) > 0 : num(set?.reps, 0) > 0);
  if (!actual.length) return { state: "insufficient_data", confidence: 0, reasons: ["No completed sets recorded."] };
  let missed = 0, highEffort = 0, over = 0;
  for (let i = 0; i < actual.length; i += 1) {
    const act = actual[i] || {}, target = targets[i] || targets[targets.length - 1] || {};
    const metric = targetMetric(target);
    const rpe = num(act.rpe, null), rir = num(act.rir, rpe == null ? null : 10 - rpe);
    if (metric === "duration_seconds") {
      const value = num(act.durationSeconds ?? act.duration_seconds, 0);
      const min = num(target.minDurationSeconds ?? target.targetDurationSeconds ?? target.target_duration_seconds, null);
      const max = num(target.maxDurationSeconds ?? target.targetDurationSeconds ?? target.target_duration_seconds, min);
      if (min != null && value < min) missed += 1;
      if (max != null && value > max) over += 1;
    } else {
      const reps = num(act.reps, 0);
      const min = num(target.minReps ?? target.targetReps ?? target.target_reps, null);
      const max = num(target.maxReps ?? target.targetReps ?? target.target_reps, min);
      if (min != null && reps < min) missed += 1;
      if (max != null && reps > max) over += 1;
    }
    if ((rir != null && rir <= 0.5) || (rpe != null && rpe >= 9.5)) highEffort += 1;
  }
  const completion = actual.length / Math.max(1, targets.length || actual.length);
  if (missed >= Math.max(1, Math.ceil(actual.length / 3)) && highEffort >= 1) return { state: "fatigue_signal", confidence: round(Math.min(1, 0.55 + missed / actual.length * 0.35)), reasons: ["Multiple targets were missed at very high effort."] };
  if (missed > 0) return { state: "underperformed", confidence: round(0.55 + missed / actual.length * 0.3), reasons: ["One or more set targets were missed."] };
  if (over > 0 && highEffort === 0 && completion >= 0.9) return { state: "overperformed", confidence: 0.75, reasons: ["Targets were exceeded without a high-effort signal."] };
  return { state: "on_target", confidence: round(Math.min(0.9, 0.6 + completion * 0.25)), reasons: ["Recorded sets met the prescribed targets."] };
}
