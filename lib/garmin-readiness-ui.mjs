export function garminReadinessUiModel(readiness = {}, { programSession = false } = {}) {
  const baseLabel = programSession ? "PROGRAM SESSION READY" : "WORKOUT VALID";
  const common = {
    baseLabel,
    reasonCode:readiness.reasonCode || "GARMIN_READINESS_UNKNOWN",
    publishReady:Boolean(readiness.publishReady ?? readiness.ready),
  };

  if (readiness.ready || readiness.publishReady) {
    return {
      ...common,
      tone:"ready",
      icon:"✓",
      garminLabel:"GARMIN PROJECTION READY",
      explanation:"Exact targets, canonical exercise identity and reviewed Garmin mappings are ready for strict FIT encoding.",
    };
  }

  if (readiness.reasonCode === "GARMIN_RANGE_DEVICE_VERIFICATION_REQUIRED") {
    const count = Number(readiness?.summary?.rangeTargetSets) || (Array.isArray(readiness.ranges) ? readiness.ranges.length : 0);
    return {
      ...common,
      tone:"verification",
      icon:"◇",
      garminLabel:`GARMIN RANGE${count === 1 ? "" : "S"} · DEVICE VERIFICATION REQUIRED`,
      explanation:"TrainSync keeps the original rep/time range and effort target. The OPEN-step Garmin representation is intentionally not publish-ready until verified on compatible strength hardware.",
    };
  }

  if (readiness.reasonCode === "GARMIN_EXERCISE_MAPPING_REQUIRED") {
    return {
      ...common,
      tone:"pending",
      icon:"◇",
      garminLabel:"GARMIN MAPPING REQUIRED",
      explanation:"At least one canonical TrainSync exercise does not yet have a reviewed Garmin FIT exercise mapping. TrainSync will not invent one.",
    };
  }

  if (readiness.reasonCode === "CANONICAL_EXERCISE_REQUIRED") {
    return {
      ...common,
      tone:"pending",
      icon:"◇",
      garminLabel:"GARMIN IDENTITY REQUIRED",
      explanation:"At least one exercise lacks canonical TrainSync identity, so Garmin projection is blocked until the exercise is resolved.",
    };
  }

  return {
    ...common,
    tone:"pending",
    icon:"◇",
    garminLabel:"GARMIN NOT READY",
    explanation:"The workout is valid in TrainSync, but its Garmin projection still has a blocking requirement.",
  };
}
