import { publishWorkoutMock, getMockConnectionStatus } from "./mock-garmin.mjs";
import { projectWorkoutToGarminFit } from "./garmin-workout-projection.mjs";
import { stableHash } from "./workout.mjs";

export const GARMIN_PROVIDER_CONTRACT_VERSION = "2026-08-23.1";
export const GARMIN_PROVIDER_MODES = Object.freeze(["mock", "official"]);

export class GarminProviderError extends Error {
  constructor(code, message, details = null, status = 400) {
    super(message);
    this.name = "GarminProviderError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

export function resolveGarminProviderMode(value) {
  const mode = String(value || "mock").trim().toLowerCase();
  if (!GARMIN_PROVIDER_MODES.includes(mode)) {
    throw new GarminProviderError(
      "GARMIN_PROVIDER_MODE_INVALID",
      `Unsupported Garmin provider mode: ${mode}`,
      { allowed: GARMIN_PROVIDER_MODES },
      500,
    );
  }
  return mode;
}

function idempotencyKeyFor(workout) {
  if (!workout?.id) {
    throw new GarminProviderError("WORKOUT_ID_REQUIRED", "Workout id is required for Garmin publication.");
  }
  return `${workout.id}:r${workout.revision || 1}`;
}

function projectionSnapshot(result) {
  if (!result?.valid || !result?.projection) return null;
  return {
    valid:true,
    fitProfileVersion:result.projection.fitProfileVersion,
    exerciseMapVersion:result.projection.exerciseMapVersion,
    projectionVersion:result.projection.projectionVersion,
    summary:{ ...result.projection.summary },
    warnings:[...(result.warnings || [])],
  };
}

function officialProjection(workout) {
  const result = projectWorkoutToGarminFit(workout);
  if (!result.valid) {
    throw new GarminProviderError(
      result.reasonCode || "GARMIN_PROJECTION_FAILED",
      "Workout cannot be projected to Garmin FIT.",
      { errors:result.errors || [], warnings:result.warnings || [] },
    );
  }

  const summary = result.projection.summary;
  if (summary.rangeTargetSets > 0) {
    throw new GarminProviderError(
      "GARMIN_TARGET_RANGE_POLICY_REQUIRED",
      "Official Garmin publication is blocked until TrainSync has an explicitly verified policy for FIT rep/time ranges.",
      { summary, warnings:result.warnings || [] },
      409,
    );
  }
  if (summary.canonicalSets !== summary.workSetCount) {
    throw new GarminProviderError(
      "GARMIN_CANONICAL_EXERCISE_REQUIRED",
      "Official Garmin publication requires canonical TrainSync exercise identity for every work set.",
      { summary, warnings:result.warnings || [] },
      409,
    );
  }
  if (summary.mappedSets !== summary.workSetCount) {
    throw new GarminProviderError(
      "GARMIN_EXERCISE_MAPPING_REQUIRED",
      "Official Garmin publication requires a reviewed Garmin FIT exercise mapping for every work set.",
      { summary, warnings:result.warnings || [] },
      409,
    );
  }
  return result;
}

function normalizeOfficialResult({ workout, idempotencyKey, projection, transportResult }) {
  const providerResourceId = String(transportResult?.providerResourceId || transportResult?.resourceId || "").trim();
  if (!providerResourceId) {
    throw new GarminProviderError(
      "GARMIN_PROVIDER_RESPONSE_INVALID",
      "Official Garmin transport did not return a provider resource id.",
      null,
      502,
    );
  }
  return {
    success:true,
    provider:"garmin",
    mode:"official",
    providerContractVersion:GARMIN_PROVIDER_CONTRACT_VERSION,
    idempotencyKey,
    providerResourceId,
    workoutId:workout.id,
    scheduledDate:workout.scheduledDate,
    publishedAt:transportResult?.publishedAt || new Date().toISOString(),
    status:transportResult?.status || "published",
    warnings:[...(projection.warnings || [])],
    fitProjection:projectionSnapshot(projection),
    metadata:transportResult?.metadata && typeof transportResult.metadata === "object"
      ? { ...transportResult.metadata }
      : null,
  };
}

function officialProvider({ transport = null } = {}) {
  const transportConfigured = Boolean(transport && typeof transport.publishWorkout === "function");
  return Object.freeze({
    provider:"garmin",
    mode:"official",
    contractVersion:GARMIN_PROVIDER_CONTRACT_VERSION,
    async getConnectionStatus({ userContext = null } = {}) {
      if (!transportConfigured) {
        return {
          provider:"garmin",
          mode:"official",
          contractVersion:GARMIN_PROVIDER_CONTRACT_VERSION,
          connected:false,
          authorizationValid:false,
          transportConfigured:false,
          capabilities:["strength_workouts", "calendar_publish", "training_plans"],
          state:"waiting_for_garmin_training_api_transport",
          message:"Official Garmin Training API transport is not configured. No Garmin account can be modified.",
        };
      }
      if (typeof transport.getConnectionStatus === "function") {
        const state = await transport.getConnectionStatus({ userContext });
        return {
          provider:"garmin",
          mode:"official",
          contractVersion:GARMIN_PROVIDER_CONTRACT_VERSION,
          transportConfigured:true,
          connected:Boolean(state?.connected),
          authorizationValid:Boolean(state?.authorizationValid),
          capabilities:Array.isArray(state?.capabilities) ? [...state.capabilities] : ["strength_workouts", "calendar_publish", "training_plans"],
          state:String(state?.state || (state?.connected ? "connected" : "not_connected")),
          message:String(state?.message || (state?.connected ? "Official Garmin provider is connected." : "Official Garmin provider is not connected for this user.")),
        };
      }
      return {
        provider:"garmin",
        mode:"official",
        contractVersion:GARMIN_PROVIDER_CONTRACT_VERSION,
        transportConfigured:true,
        connected:false,
        authorizationValid:false,
        capabilities:["strength_workouts", "calendar_publish", "training_plans"],
        state:"user_authorization_unknown",
        message:"Official Garmin transport exists, but user authorization state has not been provided.",
      };
    },
    async publishWorkout(workout, { userContext = null } = {}) {
      const projection = officialProjection(workout);
      if (!transportConfigured) {
        throw new GarminProviderError(
          "GARMIN_OFFICIAL_PROVIDER_NOT_CONFIGURED",
          "Official Garmin Training API publication is unavailable until Garmin grants access and the authenticated transport is configured.",
          { fitProjection:projectionSnapshot(projection) },
          503,
        );
      }
      const idempotencyKey = idempotencyKeyFor(workout);
      let transportResult;
      try {
        transportResult = await transport.publishWorkout({
          workout,
          projection:projection.projection,
          idempotencyKey,
          userContext,
        });
      } catch (error) {
        if (error instanceof GarminProviderError) throw error;
        throw new GarminProviderError(
          error?.code || "GARMIN_TRANSPORT_ERROR",
          error?.message || "Official Garmin transport failed.",
          error?.details || null,
          Number(error?.status) || 502,
        );
      }
      return normalizeOfficialResult({ workout, idempotencyKey, projection, transportResult });
    },
  });
}

function mockProvider() {
  return Object.freeze({
    provider:"garmin",
    mode:"mock",
    contractVersion:GARMIN_PROVIDER_CONTRACT_VERSION,
    async getConnectionStatus() {
      return { ...getMockConnectionStatus(), contractVersion:GARMIN_PROVIDER_CONTRACT_VERSION };
    },
    async publishWorkout(workout) {
      return { ...publishWorkoutMock(workout), providerContractVersion:GARMIN_PROVIDER_CONTRACT_VERSION };
    },
  });
}

export function createGarminProvider({ mode = "mock", officialTransport = null } = {}) {
  const resolved = resolveGarminProviderMode(mode);
  return resolved === "official" ? officialProvider({ transport:officialTransport }) : mockProvider();
}

export async function garminProviderStatus({ mode = "mock", officialTransport = null, userContext = null } = {}) {
  const provider = createGarminProvider({ mode, officialTransport });
  return provider.getConnectionStatus({ userContext });
}

export async function publishWorkoutWithGarminProvider(workout, { mode = "mock", officialTransport = null, userContext = null } = {}) {
  const provider = createGarminProvider({ mode, officialTransport });
  return provider.publishWorkout(workout, { userContext });
}

export function mockProviderResourceId(workout) {
  const key = idempotencyKeyFor(workout);
  return `gmn_mock_${stableHash(key)}`;
}
