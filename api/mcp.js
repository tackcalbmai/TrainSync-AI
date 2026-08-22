import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { stableHash, validateWorkout, workoutSummary } from "../lib/workout.mjs";
import { getMockConnectionStatus, publishWorkoutMock } from "../lib/mock-garmin.mjs";

const setSchema = z.object({
  index: z.number().int().positive(),
  targetReps: z.number().int().min(1).max(100),
  weightKg: z.number().nonnegative().nullable(),
  restSec: z.number().int().min(0).max(900),
});

const exerciseSchema = z.object({
  name: z.string().min(1),
  group: z.string().min(1),
  notes: z.string(),
  garminExerciseKey: z.string().nullable(),
  sets: z.array(setSchema).min(1),
});

const workoutSchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  title: z.string().min(1),
  sport: z.literal("strength"),
  intensity: z.enum(["easy", "moderate", "heavy"]),
  source: z.string(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1),
  estimatedDurationMinutes: z.number().int().min(1).max(360),
  totalSets: z.number().int().positive(),
  status: z.string(),
  instructions: z.string(),
  exercises: z.array(exerciseSchema).min(1),
  createdAt: z.string(),
});

const draftSetInputSchema = z.object({
  targetReps: z.number().int().min(1).max(100),
  weightKg: z.number().nonnegative().nullable().default(null),
  restSec: z.number().int().min(0).max(900),
});

const draftExerciseInputSchema = z.object({
  name: z.string().min(1),
  group: z.string().min(1),
  notes: z.string().default(""),
  sets: z.array(draftSetInputSchema).min(1).max(12),
});

const validationErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

function normalizeDraft(args) {
  const exercises = args.exercises.map((item) => ({
    name: item.name.trim(),
    group: item.group.trim(),
    notes: item.notes?.trim?.() || "",
    garminExerciseKey: null,
    sets: item.sets.map((set, index) => ({
      index: index + 1,
      targetReps: set.targetReps,
      weightKg: set.weightKg ?? null,
      restSec: set.restSec,
    })),
  }));
  const totalSets = exercises.reduce((sum, item) => sum + item.sets.length, 0);
  const identity = JSON.stringify({
    title: args.title,
    scheduledDate: args.scheduledDate,
    intensity: args.intensity,
    durationMinutes: args.durationMinutes,
    exercises,
  });

  return {
    id: `wrk_${stableHash(identity)}`,
    revision: 1,
    title: args.title.trim(),
    sport: "strength",
    intensity: args.intensity,
    source: "chatgpt",
    scheduledDate: args.scheduledDate,
    timezone: args.timezone,
    estimatedDurationMinutes: args.durationMinutes,
    totalSets,
    status: "draft",
    instructions:
      args.instructions?.trim?.() ||
      "Use controlled form. Stop the set if technique breaks down.",
    exercises,
    createdAt: new Date().toISOString(),
  };
}

function createTrainSyncServer() {
  const server = new McpServer(
    { name: "trainsync-ai", version: "0.3.0" },
    {
      instructions:
        "Strength-first training toolset. You are responsible for programming the workout: choose exercises, sets, reps, rest and optional working weights from the user's request and context, then call create_workout_draft with that structured plan. Validate before publishing. Only call publish_workout when the user explicitly asks to send, publish, or schedule the workout to Garmin. This deployment currently uses a mock Garmin provider and never modifies a real Garmin account.",
    },
  );

  server.registerTool(
    "get_connection_status",
    {
      title: "Get Garmin connection status",
      description:
        "Use this when checking whether Garmin publishing is available or before a publish workflow.",
      inputSchema: {},
      outputSchema: {
        provider: z.string(),
        mode: z.string(),
        connected: z.boolean(),
        authorizationValid: z.boolean(),
        capabilities: z.array(z.string()),
        message: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      const status = getMockConnectionStatus();
      return {
        structuredContent: status,
        content: [
          {
            type: "text",
            text: `Garmin publishing is available in ${status.mode} mode. No real Garmin account will be modified.`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "create_workout_draft",
    {
      title: "Create strength workout draft",
      description:
        "Use this when the user asks you to create or prepare a strength workout. Program the exercises, sets, reps, rest and optional weights yourself, then submit the structured plan here. This creates a draft only and does not publish externally.",
      inputSchema: {
        title: z.string().min(1),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        timezone: z.string().default("Europe/Riga"),
        durationMinutes: z.number().int().min(15).max(240),
        intensity: z.enum(["easy", "moderate", "heavy"]),
        instructions: z.string().default(""),
        exercises: z.array(draftExerciseInputSchema).min(1).max(20),
      },
      outputSchema: {
        workout: workoutSchema,
        summary: z.object({
          id: z.string(),
          title: z.string(),
          scheduledDate: z.string(),
          durationMinutes: z.number(),
          exercises: z.number(),
          sets: z.number(),
          intensity: z.string(),
          status: z.string(),
        }),
        validation: z.object({
          valid: z.boolean(),
          errors: z.array(validationErrorSchema),
          warnings: z.array(validationErrorSchema),
        }),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const workout = normalizeDraft(args);
      const validation = validateWorkout(workout);
      const summary = workoutSummary(workout);
      return {
        structuredContent: { workout, summary, validation },
        content: [
          {
            type: "text",
            text: `Created ${summary.title}: ${summary.exercises} exercises, ${summary.sets} working sets, ${summary.durationMinutes} minutes, scheduled for ${summary.scheduledDate}. Validation: ${validation.valid ? "valid" : "failed"}.`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "validate_workout",
    {
      title: "Validate strength workout",
      description:
        "Use this to verify a TrainSync workout before publishing it to Garmin.",
      inputSchema: { workout: workoutSchema },
      outputSchema: {
        valid: z.boolean(),
        errors: z.array(validationErrorSchema),
        warnings: z.array(validationErrorSchema),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ workout }) => {
      const result = validateWorkout(workout);
      return {
        structuredContent: result,
        content: [
          {
            type: "text",
            text: result.valid
              ? `Workout is valid with ${result.warnings.length} Garmin-mapping warning(s).`
              : `Workout has ${result.errors.length} validation error(s).`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "publish_workout",
    {
      title: "Publish workout to Garmin",
      description:
        "Use this only when the user explicitly asks to send, publish, or schedule a complete TrainSync workout to Garmin Connect. The current provider is mock-only.",
      inputSchema: { workout: workoutSchema },
      outputSchema: {
        success: z.boolean(),
        provider: z.string(),
        mode: z.string(),
        idempotencyKey: z.string(),
        providerResourceId: z.string(),
        workoutId: z.string(),
        scheduledDate: z.string(),
        publishedAt: z.string(),
        status: z.string(),
        warnings: z.array(validationErrorSchema),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true,
      },
    },
    async ({ workout }) => {
      const result = publishWorkoutMock(workout);
      return {
        structuredContent: result,
        content: [
          {
            type: "text",
            text: `${workout.title} published to Garmin in ${result.mode} mode for ${workout.scheduledDate}. Resource: ${result.providerResourceId}.`,
          },
        ],
      };
    },
  );

  return server;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, accept, authorization, mcp-session-id, mcp-protocol-version",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const allowed = new Set(["POST", "GET", "DELETE"]);
  if (!allowed.has(req.method)) {
    res.setHeader("Allow", "POST, GET, DELETE, OPTIONS");
    res.status(405).end("Method Not Allowed");
    return;
  }

  const server = createTrainSyncServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("TrainSync MCP error", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
}
