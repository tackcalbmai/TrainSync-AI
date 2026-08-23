import { stableHash, validateWorkout } from "./workout.mjs";
import { projectWorkoutToGarminFit } from "./garmin-workout-projection.mjs";

export function getMockConnectionStatus() {
  return {
    provider: "garmin",
    mode: "mock",
    connected: true,
    authorizationValid: true,
    capabilities: ["strength_workouts", "calendar_publish", "training_plans"],
    message: "Mock Garmin provider is active. No external Garmin account is modified.",
  };
}

export function publishWorkoutMock(workout) {
  const validation = validateWorkout(workout);
  if (!validation.valid) {
    const error = new Error("Workout validation failed.");
    error.code = "WORKOUT_VALIDATION_FAILED";
    error.details = validation.errors;
    throw error;
  }

  const fitProjection = projectWorkoutToGarminFit(workout);
  const idempotencyKey = `${workout.id}:r${workout.revision || 1}`;
  return {
    success: true,
    provider: "garmin",
    mode: "mock",
    idempotencyKey,
    providerResourceId: `gmn_mock_${stableHash(idempotencyKey)}`,
    workoutId: workout.id,
    scheduledDate: workout.scheduledDate,
    publishedAt: new Date().toISOString(),
    status: "published",
    warnings: validation.warnings,
    fitProjection: fitProjection.valid ? {
      valid: true,
      fitProfileVersion: fitProjection.projection.fitProfileVersion,
      exerciseMapVersion: fitProjection.projection.exerciseMapVersion,
      projectionVersion: fitProjection.projection.projectionVersion,
      summary: fitProjection.projection.summary,
      warnings: fitProjection.warnings,
    } : {
      valid: false,
      reasonCode: fitProjection.reasonCode,
      errors: fitProjection.errors,
      warnings: fitProjection.warnings,
    },
  };
}
