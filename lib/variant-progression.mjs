import { getExerciseDefinition } from "./exercise-catalog.mjs";

export const VARIANT_PROGRESSION_VERSION = "2026-08-23.1";

// A transition is not inferred from same-family membership. It must be explicitly reviewed.
// The push-up ladder is intentionally small: evidence supports position-dependent changes in
// upper-extremity loading, but does not establish one universal bodyweight progression ladder.
export const REGISTERED_VARIANT_TRANSITIONS = Object.freeze({
  incline_push_up:Object.freeze(["push_up"]),
  push_up:Object.freeze(["decline_push_up"]),
});

const ALWAYS_AVAILABLE = new Set(["bodyweight", "floor", "wall"]);

function allowedEquipmentSet(equipment = []) {
  return new Set([...ALWAYS_AVAILABLE, ...(Array.isArray(equipment) ? equipment : [])].map((item) => String(item || "").trim()).filter(Boolean));
}

export function equipmentSupportsExercise(exerciseKey, equipment = []) {
  const definition = getExerciseDefinition(exerciseKey);
  if (!definition) return false;
  const allowed = allowedEquipmentSet(equipment);
  return (definition.requiredEquipment || []).every((item) => allowed.has(item));
}

export function isRegisteredVariantTransition(currentExerciseKey, nextExerciseKey) {
  const allowed = REGISTERED_VARIANT_TRANSITIONS[String(currentExerciseKey || "")] || [];
  return allowed.includes(String(nextExerciseKey || ""));
}

export function resolveRegisteredVariantTransition(currentExerciseKey, equipment = []) {
  const currentKey = String(currentExerciseKey || "");
  const candidates = REGISTERED_VARIANT_TRANSITIONS[currentKey] || [];
  if (!candidates.length) return { resolved:false, reasonCode:"VARIANT_LADDER_REQUIRED", currentExerciseKey:currentKey, candidates:[] };
  const nextExerciseKey = candidates.find((key) => equipmentSupportsExercise(key, equipment));
  if (!nextExerciseKey) {
    return {
      resolved:false,
      reasonCode:"VARIANT_EQUIPMENT_UNAVAILABLE",
      currentExerciseKey:currentKey,
      candidates:[...candidates],
      requiredEquipment:[...new Set(candidates.flatMap((key) => getExerciseDefinition(key)?.requiredEquipment || []))],
    };
  }
  return { resolved:true, currentExerciseKey:currentKey, nextExerciseKey, candidates:[...candidates] };
}
