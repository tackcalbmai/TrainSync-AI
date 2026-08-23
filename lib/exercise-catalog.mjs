export const EXERCISE_CATALOG_VERSION = "2026-08-23.2";

const rawCatalog = [
  { key:"push_up", name:"Push-Up", aliases:["pushup","strict push-up","strict pushup"], movementPattern:"horizontal_push", loadType:"bodyweight", requiredEquipment:["bodyweight","floor"], primaryMuscles:["chest"], secondaryMuscles:["triceps","front_delts","abs"], progressionMode:"variant_progression", family:"push_up" },
  { key:"incline_push_up", name:"Incline Push-Up", aliases:["incline pushup"], movementPattern:"horizontal_push", loadType:"bodyweight", requiredEquipment:["bodyweight","bench"], primaryMuscles:["chest"], secondaryMuscles:["triceps","front_delts","abs"], progressionMode:"variant_progression", family:"push_up" },
  { key:"decline_push_up", name:"Decline Push-Up", aliases:["decline pushup","feet-elevated push-up"], movementPattern:"horizontal_push", loadType:"bodyweight", requiredEquipment:["bodyweight","bench"], primaryMuscles:["chest"], secondaryMuscles:["triceps","front_delts","abs"], progressionMode:"variant_progression", family:"push_up" },
  { key:"diamond_push_up", name:"Diamond Push-Up", aliases:["diamond pushup","close-grip push-up"], movementPattern:"horizontal_push", loadType:"bodyweight", requiredEquipment:["bodyweight","floor"], primaryMuscles:["triceps"], secondaryMuscles:["chest","front_delts","abs"], progressionMode:"variant_progression", family:"push_up" },
  { key:"pseudo_planche_push_up", name:"Pseudo-Planche Push-Up", aliases:["pseudo planche pushup","planche lean push-up"], movementPattern:"horizontal_push", loadType:"bodyweight", requiredEquipment:["bodyweight","floor"], primaryMuscles:["chest","front_delts"], secondaryMuscles:["triceps","abs"], progressionMode:"variant_progression", family:"push_up" },
  { key:"archer_push_up", name:"Archer Push-Up", aliases:["archer pushup"], movementPattern:"horizontal_push", loadType:"bodyweight", requiredEquipment:["bodyweight","floor"], primaryMuscles:["chest"], secondaryMuscles:["triceps","front_delts","abs"], progressionMode:"variant_progression", family:"push_up" },
  { key:"pike_push_up", name:"Pike Push-Up", aliases:["pike pushup"], movementPattern:"vertical_push", loadType:"bodyweight", requiredEquipment:["bodyweight","floor"], primaryMuscles:["front_delts"], secondaryMuscles:["triceps","upper_back","abs"], progressionMode:"variant_progression", family:"vertical_push" },
  { key:"handstand_push_up_wall", name:"Wall Handstand Push-Up", aliases:["wall handstand pushup","handstand push-up"], movementPattern:"vertical_push", loadType:"bodyweight", requiredEquipment:["bodyweight","wall"], primaryMuscles:["front_delts"], secondaryMuscles:["triceps","upper_back","abs"], progressionMode:"variant_progression", family:"vertical_push" },
  { key:"pull_up", name:"Pull-Up", aliases:["pullup","pronated pull-up"], movementPattern:"vertical_pull", loadType:"bodyweight", requiredEquipment:["bodyweight","pull_up_bar"], primaryMuscles:["lats"], secondaryMuscles:["upper_back","biceps","forearms","abs"], progressionMode:"reps_only", family:"vertical_pull" },
  { key:"chin_up", name:"Chin-Up", aliases:["chinup","supinated pull-up"], movementPattern:"vertical_pull", loadType:"bodyweight", requiredEquipment:["bodyweight","pull_up_bar"], primaryMuscles:["lats","biceps"], secondaryMuscles:["upper_back","forearms","abs"], progressionMode:"reps_only", family:"vertical_pull" },
  { key:"negative_pull_up", name:"Negative Pull-Up", aliases:["eccentric pull-up"], movementPattern:"vertical_pull", loadType:"bodyweight", requiredEquipment:["bodyweight","pull_up_bar"], primaryMuscles:["lats"], secondaryMuscles:["upper_back","biceps","forearms"], progressionMode:"duration_progression", family:"vertical_pull" },
  { key:"goblet_squat", name:"Kettlebell Goblet Squat", aliases:["goblet squat","kb goblet squat"], movementPattern:"squat", loadType:"external_weight", requiredEquipment:["kettlebells"], primaryMuscles:["quads","glutes"], secondaryMuscles:["adductors","abs","spinal_erectors"], progressionMode:"double_progression", family:"squat" },
  { key:"kettlebell_front_squat", name:"Kettlebell Front Squat", aliases:["kb front squat"], movementPattern:"squat", loadType:"external_weight", requiredEquipment:["kettlebells"], primaryMuscles:["quads","glutes"], secondaryMuscles:["adductors","abs","spinal_erectors"], progressionMode:"double_progression", family:"squat" },
  { key:"reverse_lunge", name:"Reverse Lunge", aliases:["bodyweight reverse lunge"], movementPattern:"lunge", loadType:"bodyweight", requiredEquipment:["bodyweight","floor"], primaryMuscles:["quads","glutes"], secondaryMuscles:["hamstrings","adductors","abs"], progressionMode:"reps_only", family:"lunge" },
  { key:"kettlebell_reverse_lunge", name:"Kettlebell Reverse Lunge", aliases:["kb reverse lunge"], movementPattern:"lunge", loadType:"external_weight", requiredEquipment:["kettlebells"], primaryMuscles:["quads","glutes"], secondaryMuscles:["hamstrings","adductors","abs"], progressionMode:"double_progression", family:"lunge" },
  { key:"bulgarian_split_squat", name:"Bulgarian Split Squat", aliases:["rear-foot-elevated split squat","rfess"], movementPattern:"lunge", loadType:"bodyweight", requiredEquipment:["bodyweight","bench"], primaryMuscles:["quads","glutes"], secondaryMuscles:["hamstrings","adductors","abs"], progressionMode:"variant_progression", family:"lunge" },
  { key:"kettlebell_rdl", name:"Kettlebell Romanian Deadlift", aliases:["kb rdl","kettlebell rdl"], movementPattern:"hinge", loadType:"external_weight", requiredEquipment:["kettlebells"], primaryMuscles:["hamstrings","glutes"], secondaryMuscles:["spinal_erectors","forearms","adductors"], progressionMode:"double_progression", family:"hinge" },
  { key:"kettlebell_swing", name:"Kettlebell Swing", aliases:["kb swing"], movementPattern:"hinge", loadType:"external_weight", requiredEquipment:["kettlebells"], primaryMuscles:["glutes","hamstrings"], secondaryMuscles:["spinal_erectors","forearms","abs"], progressionMode:"reps_only", family:"hinge" },
  { key:"single_leg_rdl_bodyweight", name:"Single-Leg Romanian Deadlift", aliases:["single-leg rdl","bodyweight single-leg rdl"], movementPattern:"hinge", loadType:"bodyweight", requiredEquipment:["bodyweight","floor"], primaryMuscles:["hamstrings","glutes"], secondaryMuscles:["spinal_erectors","abs"], progressionMode:"reps_only", family:"hinge" },
  { key:"kettlebell_one_arm_row", name:"One-Arm Kettlebell Row", aliases:["one arm kettlebell row","single-arm kettlebell row","kb row"], movementPattern:"horizontal_pull", loadType:"external_weight", requiredEquipment:["kettlebells"], primaryMuscles:["lats","upper_back"], secondaryMuscles:["biceps","rear_delts","forearms","spinal_erectors"], progressionMode:"double_progression", family:"horizontal_pull" },
  { key:"kettlebell_floor_press", name:"Kettlebell Floor Press", aliases:["kb floor press"], movementPattern:"horizontal_push", loadType:"external_weight", requiredEquipment:["kettlebells","floor"], primaryMuscles:["chest"], secondaryMuscles:["triceps","front_delts"], progressionMode:"double_progression", family:"horizontal_push" },
  { key:"kettlebell_overhead_press", name:"Kettlebell Overhead Press", aliases:["kb overhead press","kettlebell shoulder press"], movementPattern:"vertical_push", loadType:"external_weight", requiredEquipment:["kettlebells"], primaryMuscles:["front_delts"], secondaryMuscles:["triceps","upper_back","abs"], progressionMode:"double_progression", family:"vertical_push" },
  { key:"kettlebell_lateral_raise", name:"Kettlebell Lateral Raise", aliases:["kb lateral raise"], movementPattern:"isolation", loadType:"external_weight", requiredEquipment:["kettlebells"], primaryMuscles:["side_delts"], secondaryMuscles:["front_delts"], progressionMode:"double_progression", family:"lateral_raise" },
  { key:"kettlebell_curl", name:"Kettlebell Curl", aliases:["kb curl"], movementPattern:"isolation", loadType:"external_weight", requiredEquipment:["kettlebells"], primaryMuscles:["biceps"], secondaryMuscles:["forearms"], progressionMode:"double_progression", family:"curl" },
  { key:"kettlebell_overhead_triceps_extension", name:"Kettlebell Overhead Triceps Extension", aliases:["kb triceps extension","kettlebell triceps extension"], movementPattern:"isolation", loadType:"external_weight", requiredEquipment:["kettlebells"], primaryMuscles:["triceps"], secondaryMuscles:[], progressionMode:"double_progression", family:"triceps_extension" },
  { key:"prone_reverse_fly", name:"Prone Reverse Fly", aliases:["prone rear delt fly","floor reverse fly"], movementPattern:"isolation", loadType:"bodyweight", requiredEquipment:["bodyweight","floor"], primaryMuscles:["rear_delts"], secondaryMuscles:["upper_back"], progressionMode:"reps_only", family:"rear_delt" },
  { key:"prone_y_raise", name:"Prone Y Raise", aliases:["prone y-raise","floor y raise"], movementPattern:"isolation", loadType:"bodyweight", requiredEquipment:["bodyweight","floor"], primaryMuscles:["upper_back"], secondaryMuscles:["rear_delts"], progressionMode:"reps_only", family:"scapular" },
  { key:"prone_w_raise", name:"Prone W Raise", aliases:["prone w-raise","floor w raise"], movementPattern:"isolation", loadType:"bodyweight", requiredEquipment:["bodyweight","floor"], primaryMuscles:["upper_back"], secondaryMuscles:["rear_delts"], progressionMode:"reps_only", family:"scapular" },
  { key:"hollow_body_hold", name:"Hollow Body Hold", aliases:["hollow hold"], movementPattern:"core", loadType:"bodyweight", requiredEquipment:["bodyweight","floor"], primaryMuscles:["abs"], secondaryMuscles:[], progressionMode:"duration_progression", family:"core", defaultSetMetric:"duration_seconds" },
  { key:"front_plank", name:"Front Plank", aliases:["plank"], movementPattern:"core", loadType:"bodyweight", requiredEquipment:["bodyweight","floor"], primaryMuscles:["abs"], secondaryMuscles:["glutes"], progressionMode:"duration_progression", family:"core", defaultSetMetric:"duration_seconds" },
  { key:"side_plank", name:"Side Plank", aliases:[], movementPattern:"core", loadType:"bodyweight", requiredEquipment:["bodyweight","floor"], primaryMuscles:["abs"], secondaryMuscles:["glutes"], progressionMode:"duration_progression", family:"core", defaultSetMetric:"duration_seconds" },
  { key:"dead_bug", name:"Dead Bug", aliases:[], movementPattern:"core", loadType:"bodyweight", requiredEquipment:["bodyweight","floor"], primaryMuscles:["abs"], secondaryMuscles:[], progressionMode:"reps_only", family:"core" },
  { key:"barbell_back_squat", name:"Barbell Back Squat", aliases:["back squat"], movementPattern:"squat", loadType:"external_weight", requiredEquipment:["barbell","rack"], primaryMuscles:["quads","glutes"], secondaryMuscles:["adductors","spinal_erectors","abs"], progressionMode:"load_progression", family:"squat" },
  { key:"barbell_deadlift", name:"Barbell Deadlift", aliases:["conventional deadlift","deadlift"], movementPattern:"hinge", loadType:"external_weight", requiredEquipment:["barbell"], primaryMuscles:["glutes","hamstrings"], secondaryMuscles:["spinal_erectors","quads","forearms","upper_back"], progressionMode:"load_progression", family:"hinge" },
  { key:"barbell_romanian_deadlift", name:"Barbell Romanian Deadlift", aliases:["barbell rdl"], movementPattern:"hinge", loadType:"external_weight", requiredEquipment:["barbell"], primaryMuscles:["hamstrings","glutes"], secondaryMuscles:["spinal_erectors","forearms","adductors"], progressionMode:"double_progression", family:"hinge" },
  { key:"barbell_bench_press", name:"Barbell Bench Press", aliases:["bench press"], movementPattern:"horizontal_push", loadType:"external_weight", requiredEquipment:["barbell","bench","rack"], primaryMuscles:["chest"], secondaryMuscles:["triceps","front_delts"], progressionMode:"load_progression", family:"horizontal_push" },
  { key:"barbell_overhead_press", name:"Barbell Overhead Press", aliases:["strict press","military press"], movementPattern:"vertical_push", loadType:"external_weight", requiredEquipment:["barbell","rack"], primaryMuscles:["front_delts"], secondaryMuscles:["triceps","upper_back","abs"], progressionMode:"load_progression", family:"vertical_push" },
  { key:"barbell_bent_over_row", name:"Barbell Bent-Over Row", aliases:["barbell row","bent-over row"], movementPattern:"horizontal_pull", loadType:"external_weight", requiredEquipment:["barbell"], primaryMuscles:["upper_back","lats"], secondaryMuscles:["biceps","rear_delts","forearms","spinal_erectors"], progressionMode:"double_progression", family:"horizontal_pull" },
  { key:"dumbbell_bench_press", name:"Dumbbell Bench Press", aliases:["db bench press"], movementPattern:"horizontal_push", loadType:"external_weight", requiredEquipment:["dumbbells","bench"], primaryMuscles:["chest"], secondaryMuscles:["triceps","front_delts"], progressionMode:"double_progression", family:"horizontal_push" },
  { key:"dumbbell_one_arm_row", name:"One-Arm Dumbbell Row", aliases:["single-arm dumbbell row","db row"], movementPattern:"horizontal_pull", loadType:"external_weight", requiredEquipment:["dumbbells","bench"], primaryMuscles:["lats","upper_back"], secondaryMuscles:["biceps","rear_delts","forearms"], progressionMode:"double_progression", family:"horizontal_pull" },
  { key:"dumbbell_lateral_raise", name:"Dumbbell Lateral Raise", aliases:["db lateral raise"], movementPattern:"isolation", loadType:"external_weight", requiredEquipment:["dumbbells"], primaryMuscles:["side_delts"], secondaryMuscles:["front_delts"], progressionMode:"double_progression", family:"lateral_raise" },
  { key:"lat_pulldown", name:"Lat Pulldown", aliases:["cable pulldown"], movementPattern:"vertical_pull", loadType:"external_weight", requiredEquipment:["cables"], primaryMuscles:["lats"], secondaryMuscles:["biceps","upper_back","forearms"], progressionMode:"double_progression", family:"vertical_pull" },
  { key:"seated_cable_row", name:"Seated Cable Row", aliases:["cable row"], movementPattern:"horizontal_pull", loadType:"external_weight", requiredEquipment:["cables"], primaryMuscles:["upper_back","lats"], secondaryMuscles:["biceps","rear_delts","forearms"], progressionMode:"double_progression", family:"horizontal_pull" },
  { key:"cable_face_pull", name:"Cable Face Pull", aliases:["face pull"], movementPattern:"isolation", loadType:"external_weight", requiredEquipment:["cables"], primaryMuscles:["rear_delts","upper_back"], secondaryMuscles:[], progressionMode:"double_progression", family:"rear_delt" },
  { key:"leg_press", name:"Leg Press", aliases:[], movementPattern:"squat", loadType:"external_weight", requiredEquipment:["machines"], primaryMuscles:["quads","glutes"], secondaryMuscles:["adductors"], progressionMode:"double_progression", family:"squat" },
  { key:"leg_extension", name:"Leg Extension", aliases:[], movementPattern:"isolation", loadType:"external_weight", requiredEquipment:["machines"], primaryMuscles:["quads"], secondaryMuscles:[], progressionMode:"double_progression", family:"knee_extension" },
  { key:"seated_leg_curl", name:"Seated Leg Curl", aliases:["leg curl"], movementPattern:"isolation", loadType:"external_weight", requiredEquipment:["machines"], primaryMuscles:["hamstrings"], secondaryMuscles:[], progressionMode:"double_progression", family:"knee_flexion" },
  { key:"standing_calf_raise", name:"Standing Calf Raise", aliases:["calf raise"], movementPattern:"calf", loadType:"bodyweight", requiredEquipment:["bodyweight","floor"], primaryMuscles:["calves"], secondaryMuscles:[], progressionMode:"reps_only", family:"calf" }
];

const NON_VOLUME_SECONDARY_MUSCLES = new Set(["abs", "forearms", "spinal_erectors"]);

function token(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function fatigueTagsFor(item) {
  const muscles = new Set([...(item.primaryMuscles || []), ...(item.secondaryMuscles || [])]);
  const tags = new Set();
  if (muscles.has("forearms")) tags.add("grip");
  if (muscles.has("spinal_erectors")) tags.add("spinal_bracing");
  if (muscles.has("abs")) tags.add("core_bracing");
  if (item.movementPattern === "hinge") tags.add("hinge");
  return [...tags];
}

export const EXERCISE_CATALOG = Object.freeze(Object.fromEntries(rawCatalog.map((item) => [item.key, Object.freeze({
  ...item,
  aliases: Object.freeze([...(item.aliases || [])]),
  requiredEquipment: Object.freeze([...(item.requiredEquipment || [])]),
  primaryMuscles: Object.freeze([...(item.primaryMuscles || [])]),
  secondaryMuscles: Object.freeze([...(item.secondaryMuscles || [])].filter((muscle) => !NON_VOLUME_SECONDARY_MUSCLES.has(muscle))),
  fatigueTags: Object.freeze(fatigueTagsFor(item)),
  defaultSetMetric: item.defaultSetMetric || "reps",
})])));

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

export function canonicalizeExerciseSelection(selection) {
  const definition = getExerciseDefinition(selection?.exerciseKey || selection?.name);
  if (!definition) return null;
  return {
    ...selection,
    exerciseKey: definition.key,
    name: definition.name,
    movementPattern: definition.movementPattern,
    loadType: definition.loadType,
    requiredEquipment: [...definition.requiredEquipment],
    primaryMuscles: [...definition.primaryMuscles],
    secondaryMuscles: [...definition.secondaryMuscles],
    fatigueTags: [...definition.fatigueTags],
    progressionMode: definition.progressionMode,
    setMetric: definition.defaultSetMetric,
    catalogVersion: EXERCISE_CATALOG_VERSION,
    exerciseFamily: definition.family,
  };
}

export function compactCatalogPrompt(entries = Object.values(EXERCISE_CATALOG)) {
  return entries.map((entry) => `${entry.key}=${entry.name} [${entry.movementPattern}; primary:${entry.primaryMuscles.join("+")}; equipment:${entry.requiredEquipment.join("+")}]`).join(" | ");
}