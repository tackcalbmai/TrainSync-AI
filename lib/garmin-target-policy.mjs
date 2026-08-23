export const GARMIN_TARGET_POLICY_VERSION = "2026-08-23.2";

export const GARMIN_TARGET_POLICIES = Object.freeze({
  STRICT_EXACT:Object.freeze({
    key:"strict_exact_v1",
    publishReadyWhenRangesPresent:false,
    deviceVerified:true,
  }),
  OPEN_RANGE_PREVIEW:Object.freeze({
    key:"open_range_preview_v1",
    publishReadyWhenRangesPresent:false,
    deviceVerified:false,
  }),
});

// FIT WktStepDuration.OPEN. This is used only for an experimental preview and is
// deliberately never passed to the production encoder until device behavior is verified.
export const GARMIN_OPEN_DURATION = Object.freeze({ id:5, name:"OPEN" });

const RANGE_WARNING_CODES = new Set([
  "REP_RANGE_REQUIRES_PROVIDER_POLICY",
  "DURATION_RANGE_REQUIRES_PROVIDER_POLICY",
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isRangeStep(step) {
  if (step?.kind !== "work") return false;
  const min = Number(step?.trainSync?.targetMin);
  const max = Number(step?.trainSync?.targetMax);
  return Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > 0 && min !== max;
}

function rangeKind(step) {
  return step?.trainSync?.metricType === "duration_seconds" ? "duration_seconds" : "reps";
}

function rangeInstruction(step) {
  const min = Number(step?.trainSync?.targetMin);
  const max = Number(step?.trainSync?.targetMax);
  const rir = Number(step?.trainSync?.targetRir);
  const target = rangeKind(step) === "duration_seconds" ? `${min}-${max} sec` : `${min}-${max} reps`;
  return Number.isFinite(rir) ? `${target} · stop ~${rir} RIR` : target;
}

function uniqueNotes(...parts) {
  const seen = new Set();
  const output = [];
  for (const value of parts.flat()) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
  }
  return output.join(" · ") || null;
}

function projectionBlocker(summary = {}) {
  if (summary.canonicalSets !== summary.workSetCount) return "CANONICAL_EXERCISE_REQUIRED";
  if (summary.mappedSets !== summary.workSetCount) return "GARMIN_EXERCISE_MAPPING_REQUIRED";
  return null;
}

function rangeMetadata(projection) {
  return (projection?.steps || []).filter(isRangeStep).map((step) => ({
    messageIndex:step.messageIndex,
    exerciseKey:step?.trainSync?.exerciseKey || null,
    exerciseName:step.wktStepName || null,
    metricType:rangeKind(step),
    min:step.trainSync.targetMin,
    max:step.trainSync.targetMax,
    targetRir:step.trainSync.targetRir ?? null,
    candidateRepresentation:"open_duration_with_instruction",
    candidateInstruction:rangeInstruction(step),
    evidenceState:"official_fit_open_semantics_profile_confirmed_device_behavior_unverified",
  }));
}

export function assessGarminProjection(projected = {}) {
  if (!projected.valid || !projected.projection) {
    return {
      policyVersion:GARMIN_TARGET_POLICY_VERSION,
      policy:GARMIN_TARGET_POLICIES.STRICT_EXACT.key,
      valid:false,
      publishReady:false,
      exactReady:false,
      rangePreviewAvailable:false,
      deviceVerificationRequired:false,
      reasonCode:projected.reasonCode || "WORKOUT_VALIDATION_FAILED",
      summary:null,
      ranges:[],
      errors:projected.errors || [],
      warnings:projected.warnings || [],
    };
  }

  const summary = projected.projection.summary || {};
  const ranges = rangeMetadata(projected.projection);
  const blocker = projectionBlocker(summary);

  if (blocker) {
    return {
      policyVersion:GARMIN_TARGET_POLICY_VERSION,
      policy:GARMIN_TARGET_POLICIES.STRICT_EXACT.key,
      valid:true,
      publishReady:false,
      exactReady:false,
      rangePreviewAvailable:false,
      deviceVerificationRequired:false,
      reasonCode:blocker,
      summary:{ ...summary },
      ranges,
      errors:[],
      warnings:projected.warnings || [],
    };
  }

  if (summary.rangeTargetSets > 0) {
    return {
      policyVersion:GARMIN_TARGET_POLICY_VERSION,
      policy:GARMIN_TARGET_POLICIES.STRICT_EXACT.key,
      valid:true,
      publishReady:false,
      exactReady:false,
      rangePreviewAvailable:true,
      deviceVerificationRequired:true,
      reasonCode:"GARMIN_RANGE_DEVICE_VERIFICATION_REQUIRED",
      summary:{ ...summary },
      ranges,
      rejectedAutomaticPolicies:[
        { key:"use_upper_bound", reason:"Would turn a training target band into a mandatory maximum-rep/time instruction and can violate prescribed effort." },
        { key:"use_lower_bound", reason:"Would discard valid progression room inside the prescribed target band." },
        { key:"use_midpoint", reason:"Has no FIT-contract or training-program basis and still replaces a range with a false exact target." },
      ],
      candidatePolicy:{
        key:GARMIN_TARGET_POLICIES.OPEN_RANGE_PREVIEW.key,
        representation:"OPEN duration + display instruction preserving the original range and RIR",
        publishReady:false,
        deviceVerified:false,
      },
      errors:[],
      warnings:projected.warnings || [],
    };
  }

  return {
    policyVersion:GARMIN_TARGET_POLICY_VERSION,
    policy:GARMIN_TARGET_POLICIES.STRICT_EXACT.key,
    valid:true,
    publishReady:true,
    exactReady:true,
    rangePreviewAvailable:false,
    deviceVerificationRequired:false,
    reasonCode:"GARMIN_EXACT_TARGET_READY",
    summary:{ ...summary },
    ranges:[],
    errors:[],
    warnings:projected.warnings || [],
  };
}

export function buildGarminOpenRangePreviewFromProjection(projected = {}) {
  const assessment = assessGarminProjection(projected);
  if (!assessment.valid || !projected.valid || !projected.projection) {
    return { valid:false, reasonCode:assessment.reasonCode, assessment, projection:null, warnings:assessment.warnings || [] };
  }
  if (!assessment.rangePreviewAvailable) {
    return {
      valid:false,
      reasonCode:assessment.exactReady ? "GARMIN_RANGE_PREVIEW_NOT_NEEDED" : assessment.reasonCode,
      assessment,
      projection:null,
      warnings:assessment.warnings || [],
    };
  }

  const projection = clone(projected.projection);
  let rangePreviewSets = 0;
  projection.steps = projection.steps.map((step) => {
    if (!isRangeStep(step)) return step;
    rangePreviewSets += 1;
    const instruction = rangeInstruction(step);
    return {
      ...step,
      duration:{ type:{ ...GARMIN_OPEN_DURATION }, seconds:null, reps:null },
      notes:uniqueNotes(instruction, step.notes),
      trainSync:{
        ...step.trainSync,
        providerTargetPolicy:GARMIN_TARGET_POLICIES.OPEN_RANGE_PREVIEW.key,
        originalDurationType:step?.duration?.type?.name || null,
        candidateInstruction:instruction,
        deviceVerificationRequired:true,
      },
    };
  });
  projection.summary = {
    ...projection.summary,
    rangePreviewSets,
    targetPolicy:GARMIN_TARGET_POLICIES.OPEN_RANGE_PREVIEW.key,
    targetPolicyVersion:GARMIN_TARGET_POLICY_VERSION,
    deviceVerificationRequired:true,
    publishReady:false,
  };

  const warnings = (projected.warnings || []).filter((item) => !RANGE_WARNING_CODES.has(item.code));
  warnings.push({
    code:"GARMIN_OPEN_RANGE_PREVIEW_UNVERIFIED",
    message:"Range steps are represented as OPEN duration with the original range/RIR in display instructions. This preserves TrainSync intent but is not publish-ready until verified on compatible Garmin strength devices.",
  });

  return {
    valid:true,
    reasonCode:"GARMIN_OPEN_RANGE_PREVIEW_BUILT",
    experimental:true,
    publishReady:false,
    deviceVerificationRequired:true,
    policy:GARMIN_TARGET_POLICIES.OPEN_RANGE_PREVIEW.key,
    policyVersion:GARMIN_TARGET_POLICY_VERSION,
    assessment,
    projection,
    warnings,
  };
}
