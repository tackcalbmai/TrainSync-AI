import { EXERCISE_CATALOG as BASE_CATALOG } from "./exercise-catalog-base-v2.mjs";

export const EXERCISE_CATALOG_VERSION = "2026-08-23.3";

const NON_VOLUME_SECONDARY_MUSCLES = new Set(["abs", "forearms", "spinal_erectors"]);

const EXTRA_EXERCISES = [
  { key:"dumbbell_goblet_squat", name:"Dumbbell Goblet Squat", aliases:["db goblet squat"], movementPattern:"squat", loadType:"external_weight", requiredEquipment:["dumbbells"], primaryMuscles:["quads","glutes"], secondaryMuscles:["adductors","abs","spinal_erectors"], progressionMode:"double_progression", family:"squat" },
  { key:"dumbbell_reverse_lunge", name:"Dumbbell Reverse Lunge", aliases:["db reverse lunge"], movementPattern:"lunge", loadType:"external_weight", requiredEquipment:["dumbbells","floor"], primaryMuscles:["quads","glutes"], secondaryMuscles:["hamstrings","adductors","abs"], progressionMode:"double_progression", family:"lunge" },
  { key:"dumbbell_romanian_deadlift", name:"Dumbbell Romanian Deadlift", aliases:["db rdl","dumbbell rdl"], movementPattern:"hinge", loadType:"external_weight", requiredEquipment:["dumbbells"], primaryMuscles:["hamstrings","glutes"], secondaryMuscles:["adductors","forearms","spinal_erectors"], progressionMode:"double_progression", family:"hinge" },
  { key:"dumbbell_overhead_press", name:"Dumbbell Overhead Press", aliases:["db overhead press","dumbbell shoulder press"], movementPattern:"vertical_push", loadType:"external_weight", requiredEquipment:["dumbbells"], primaryMuscles:["front_delts"], secondaryMuscles:["triceps","abs"], progressionMode:"double_progression", family:"vertical_push" },
  { key:"dumbbell_curl", name:"Dumbbell Curl", aliases:["db curl"], movementPattern:"isolation", loadType:"external_weight", requiredEquipment:["dumbbells"], primaryMuscles:["biceps"], secondaryMuscles:["forearms"], progressionMode:"double_progression", family:"curl" },
  { key:"dumbbell_overhead_triceps_extension", name:"Dumbbell Overhead Triceps Extension", aliases:["db triceps extension"], movementPattern:"isolation", loadType:"external_weight", requiredEquipment:["dumbbells"], primaryMuscles:["triceps"], secondaryMuscles:[], progressionMode:"double_progression", family:"triceps_extension" },
  { key:"dumbbell_chest_supported_rear_delt_fly", name:"Chest-Supported Dumbbell Rear-Delt Fly", aliases:["chest supported rear delt fly","chest-supported reverse fly"], movementPattern:"isolation", loadType:"external_weight", requiredEquipment:["dumbbells","bench"], primaryMuscles:["rear_delts"], secondaryMuscles:["upper_back"], progressionMode:"double_progression", family:"rear_delt" },
  { key:"dumbbell_calf_raise", name:"Dumbbell Standing Calf Raise", aliases:["db calf raise"], movementPattern:"calf", loadType:"external_weight", requiredEquipment:["dumbbells","floor"], primaryMuscles:["calves"], secondaryMuscles:[], progressionMode:"double_progression", family:"calf" },
  { key:"cable_chest_press", name:"Cable Chest Press", aliases:["standing cable chest press"], movementPattern:"horizontal_push", loadType:"external_weight", requiredEquipment:["cables"], primaryMuscles:["chest"], secondaryMuscles:["triceps","front_delts"], progressionMode:"double_progression", family:"horizontal_push" },
  { key:"cable_lateral_raise", name:"Cable Lateral Raise", aliases:["cable side raise"], movementPattern:"isolation", loadType:"external_weight", requiredEquipment:["cables"], primaryMuscles:["side_delts"], secondaryMuscles:[], progressionMode:"double_progression", family:"lateral_raise" },
  { key:"cable_biceps_curl", name:"Cable Biceps Curl", aliases:["cable curl"], movementPattern:"isolation", loadType:"external_weight", requiredEquipment:["cables"], primaryMuscles:["biceps"], secondaryMuscles:["forearms"], progressionMode:"double_progression", family:"curl" },
  { key:"cable_triceps_pressdown", name:"Cable Triceps Pressdown", aliases:["triceps pressdown","cable pushdown"], movementPattern:"isolation", loadType:"external_weight", requiredEquipment:["cables"], primaryMuscles:["triceps"], secondaryMuscles:[], progressionMode:"double_progression", family:"triceps_extension" },
  { key:"cable_pull_through", name:"Cable Pull-Through", aliases:["cable pull through"], movementPattern:"hinge", loadType:"external_weight", requiredEquipment:["cables"], primaryMuscles:["glutes","hamstrings"], secondaryMuscles:["spinal_erectors","abs"], progressionMode:"double_progression", family:"hinge" },
  { key:"machine_chest_press", name:"Machine Chest Press", aliases:["chest press machine"], movementPattern:"horizontal_push", loadType:"external_weight", requiredEquipment:["machines"], primaryMuscles:["chest"], secondaryMuscles:["triceps","front_delts"], progressionMode:"double_progression", family:"horizontal_push" },
  { key:"machine_shoulder_press", name:"Machine Shoulder Press", aliases:["shoulder press machine"], movementPattern:"vertical_push", loadType:"external_weight", requiredEquipment:["machines"], primaryMuscles:["front_delts"], secondaryMuscles:["triceps"], progressionMode:"double_progression", family:"vertical_push" },
  { key:"machine_row", name:"Machine Row", aliases:["seated row machine","chest supported machine row"], movementPattern:"horizontal_pull", loadType:"external_weight", requiredEquipment:["machines"], primaryMuscles:["upper_back","lats"], secondaryMuscles:["biceps","rear_delts"], progressionMode:"double_progression", family:"horizontal_pull" },
  { key:"machine_calf_raise", name:"Machine Calf Raise", aliases:["calf raise machine"], movementPattern:"calf", loadType:"external_weight", requiredEquipment:["machines"], primaryMuscles:["calves"], secondaryMuscles:[], progressionMode:"double_progression", family:"calf" },
];

const BASE_CORRECTIONS = Object.freeze({
  pike_push_up: { secondaryMuscles:["triceps"], addFatigueTags:["core_bracing","shoulder_girdle_stability"] },
  handstand_push_up_wall: { secondaryMuscles:["triceps"], addFatigueTags:["core_bracing","shoulder_girdle_stability"] },
  kettlebell_overhead_press: { secondaryMuscles:["triceps"], addFatigueTags:["core_bracing","shoulder_girdle_stability"] },
  barbell_overhead_press: { secondaryMuscles:["triceps"], addFatigueTags:["core_bracing","shoulder_girdle_stability"] },
  barbell_deadlift: { secondaryMuscles:["quads"], addFatigueTags:["grip","spinal_bracing","upper_back_bracing","hinge"] },
});

function token(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function fatigueTagsFor(item) {
  const muscles = new Set([...(item.primaryMuscles || []), ...(item.secondaryMuscles || [])]);
  const tags = new Set(item.fatigueTags || []);
  if (muscles.has("forearms")) tags.add("grip");
  if (muscles.has("spinal_erectors")) tags.add("spinal_bracing");
  if (muscles.has("abs")) tags.add("core_bracing");
  if (item.movementPattern === "hinge") tags.add("hinge");
  return [...tags];
}

function normalizeEntry(item) {
  const correction = BASE_CORRECTIONS[item.key] || null;
  const secondarySource = correction?.secondaryMuscles || item.secondaryMuscles || [];
  return Object.freeze({
    ...item,
    aliases:Object.freeze([...(item.aliases || [])]),
    requiredEquipment:Object.freeze([...(item.requiredEquipment || [])]),
    primaryMuscles:Object.freeze([...(item.primaryMuscles || [])]),
    secondaryMuscles:Object.freeze([...secondarySource].filter((muscle) => !NON_VOLUME_SECONDARY_MUSCLES.has(muscle))),
    fatigueTags:Object.freeze([...new Set([...fatigueTagsFor(item), ...(correction?.addFatigueTags || [])])]),
    defaultSetMetric:item.defaultSetMetric || "reps",
    catalogVersion:EXERCISE_CATALOG_VERSION,
  });
}

const merged = {};
for (const item of Object.values(BASE_CATALOG)) merged[item.key] = normalizeEntry(item);
for (const item of EXTRA_EXERCISES) {
  if (merged[item.key]) throw new Error(`Duplicate exercise catalog key: ${item.key}`);
  merged[item.key] = normalizeEntry(item);
}

export const EXERCISE_CATALOG = Object.freeze(merged);

const aliasIndex = new Map();
for (const entry of Object.values(EXERCISE_CATALOG)) {
  aliasIndex.set(token(entry.key), entry.key);
  aliasIndex.set(token(entry.name), entry.key);
  for (const alias of entry.aliases) aliasIndex.set(token(alias), entry.key);
}

export function getExerciseDefinition(value) {
  const key = aliasIndex.get(token(value));
  return key ? EXERCISE_CATALOG[key] : null;
}

export function exerciseKeysForEquipment(equipment = []) {
  const allowed = new Set(["bodyweight","floor","wall", ...equipment]);
  return Object.values(EXERCISE_CATALOG)
    .filter((entry) => entry.requiredEquipment.every((item) => allowed.has(item)))
    .map((entry) => entry.key)
    .sort();
}

export function exerciseCatalogForEquipment(equipment = []) {
  return exerciseKeysForEquipment(equipment).map((key) => EXERCISE_CATALOG[key]);
}

function countBy(entries, getter) {
  const counts = {};
  for (const entry of entries) for (const key of getter(entry)) counts[key] = (counts[key] || 0) + 1;
  return counts;
}

export function catalogCoverageForEquipment(equipment = []) {
  const entries = exerciseCatalogForEquipment(equipment);
  const movementPatterns = countBy(entries, (entry) => [entry.movementPattern]);
  const primaryMuscles = countBy(entries, (entry) => entry.primaryMuscles || []);
  const progressionModes = countBy(entries, (entry) => [entry.progressionMode]);
  return {
    catalogVersion:EXERCISE_CATALOG_VERSION,
    exerciseCount:entries.length,
    movementPatterns,
    primaryMuscles,
    progressionModes,
    capabilities:{
      upperPush:Boolean(movementPatterns.horizontal_push || movementPatterns.vertical_push),
      upperPull:Boolean(movementPatterns.horizontal_pull || movementPatterns.vertical_pull),
      kneeDominant:Boolean(movementPatterns.squat || movementPatterns.lunge),
      hinge:Boolean(movementPatterns.hinge),
      calves:Boolean(movementPatterns.calf),
      core:Boolean(movementPatterns.core),
    },
    exerciseKeys:entries.map((entry) => entry.key),
  };
}

export function catalogCoverageGaps(equipment = [], { requiredCapabilities = [], requiredPrimaryMuscles = [] } = {}) {
  const coverage = catalogCoverageForEquipment(equipment);
  return {
    coverage,
    missingCapabilities:requiredCapabilities.filter((key) => !coverage.capabilities[key]),
    missingPrimaryMuscles:requiredPrimaryMuscles.filter((key) => !coverage.primaryMuscles[key]),
  };
}

export function canonicalizeExerciseSelection(selection) {
  const definition = getExerciseDefinition(selection?.exerciseKey) || getExerciseDefinition(selection?.name);
  if (!definition) return null;
  return {
    ...selection,
    exerciseKey:definition.key,
    name:definition.name,
    movementPattern:definition.movementPattern,
    loadType:definition.loadType,
    requiredEquipment:[...definition.requiredEquipment],
    primaryMuscles:[...definition.primaryMuscles],
    secondaryMuscles:[...definition.secondaryMuscles],
    fatigueTags:[...definition.fatigueTags],
    progressionMode:definition.progressionMode,
    setMetric:definition.defaultSetMetric,
    catalogVersion:EXERCISE_CATALOG_VERSION,
    exerciseFamily:definition.family,
  };
}

export function compactCatalogPrompt(entries = Object.values(EXERCISE_CATALOG)) {
  return entries.map((entry) => `${entry.key}=${entry.name} [${entry.movementPattern}; primary:${entry.primaryMuscles.join("+")}; equipment:${entry.requiredEquipment.join("+")}]`).join(" | ");
}
