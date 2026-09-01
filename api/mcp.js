import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { EXERCISE_CATALOG } from "../lib/exercise-catalog.mjs";
import { normalizeMcpWorkoutDraft } from "../lib/mcp-workout-draft.mjs";
import { validateWorkout, workoutSummary } from "../lib/workout.mjs";
import {
  authenticateBearerToken,
  listWorkoutsForUser,
  upsertWorkoutForUser,
} from "../lib/supabase-mcp.mjs";

const RESOURCE_METADATA_URL = "https://trainsyncai.vercel.app/.well-known/oauth-protected-resource/mcp";

const exerciseKeys = Object.keys(EXERCISE_CATALOG).sort();
const exerciseKeySchema = z.enum(exerciseKeys);
const repSetSchema = z.object({
  index: z.number().int().positive(),
  metricType: z.literal("reps"),
  targetReps: z.number().int().min(1).max(100),
  minReps: z.number().int().min(1).max(100),
  maxReps: z.number().int().min(1).max(100),
  weightKg: z.number().nonnegative().nullable(),
  targetRir: z.number().min(0).max(6).nullable(),
  restSec: z.number().int().min(0).max(900),
});
const durationSetSchema = z.object({
  index: z.number().int().positive(),
  metricType: z.literal("duration_seconds"),
  targetDurationSeconds: z.number().int().min(1).max(3600),
  minDurationSeconds: z.number().int().min(1).max(3600),
  maxDurationSeconds: z.number().int().min(1).max(3600),
  weightKg: z.number().nonnegative().nullable(),
  targetRir: z.number().min(0).max(6).nullable(),
  restSec: z.number().int().min(0).max(900),
});
const exerciseSchema = z.object({
  exerciseKey: exerciseKeySchema,
  name: z.string().min(1),
  group: z.string().min(1),
  notes: z.string(),
  movementPattern: z.string().min(1),
  loadType: z.string().min(1),
  requiredEquipment: z.array(z.string()),
  primaryMuscles: z.array(z.string()).min(1),
  secondaryMuscles: z.array(z.string()),
  fatigueTags: z.array(z.string()),
  progressionMode: z.string().min(1),
  setMetric: z.enum(["reps", "duration_seconds"]),
  catalogVersion: z.string().min(1),
  exerciseFamily: z.string().min(1),
  sets: z.array(z.union([repSetSchema, durationSetSchema])).min(1),
});
const workoutSchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  title: z.string().min(1),
  sport: z.literal("strength"),
  intensity: z.enum(["easy", "moderate", "heavy"]),
  source: z.string(),
  exerciseCatalogEnforced: z.literal(true),
  exerciseCatalogVersion: z.string().min(1),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1),
  estimatedDurationMinutes: z.number().int().min(1).max(360),
  totalSets: z.number().int().positive(),
  status: z.string(),
  instructions: z.string(),
  exercises: z.array(exerciseSchema).min(1),
  createdAt: z.string(),
});
const draftRepSetInputSchema = z.object({
  metricType: z.literal("reps"),
  targetReps: z.number().int().min(1).max(100),
  weightKg: z.number().nonnegative().nullable().default(null),
  targetRir: z.number().min(0).max(6).nullable().default(null),
  restSec: z.number().int().min(0).max(900),
});
const draftDurationSetInputSchema = z.object({
  metricType: z.literal("duration_seconds"),
  targetDurationSeconds: z.number().int().min(1).max(3600),
  weightKg: z.number().nonnegative().nullable().default(null),
  targetRir: z.number().min(0).max(6).nullable().default(null),
  restSec: z.number().int().min(0).max(900),
});
const draftSetInputSchema = z.discriminatedUnion("metricType", [draftRepSetInputSchema, draftDurationSetInputSchema]);
const draftExerciseInputSchema = z.object({
  exerciseKey: exerciseKeySchema,
  notes: z.string().default(""),
  sets: z.array(draftSetInputSchema).min(1).max(12),
});
const validationErrorSchema = z.object({ code: z.string(), message: z.string() });
const summarySchema = z.object({
  id: z.string(),
  title: z.string(),
  scheduledDate: z.string(),
  durationMinutes: z.number(),
  exercises: z.number(),
  sets: z.number(),
  intensity: z.string(),
  status: z.string(),
});

export function createTrainSyncServer(auth) {
  const userId = auth.user.id;
  const server = new McpServer(
    { name: "trainsync-ai", version: "0.5.0" },
    {
      instructions:
        "Authenticated strength-training toolset. Use only canonical TrainSync exercise keys when creating drafts. Drafts are saved to the authenticated TrainSync account. Official Garmin sync is unavailable: do not claim that a workout was sent, published, or scheduled to Garmin. MOCK means projection testing only and cannot modify a Garmin account.",
    },
  );

  server.registerTool("get_connection_status", {
    title: "Get Garmin integration status",
    description: "Use this to check whether official Garmin sync is available. MOCK is projection testing, not a connected account.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    const status = {
      provider:"garmin",
      mode:"mock",
      connected:false,
      officialPublishingAvailable:false,
      mockProjectionAvailable:true,
      authenticated:true,
      state:"official_access_pending",
    };
    return {
      structuredContent: status,
      content: [{
        type:"text",
        text:"TrainSync is authenticated. Garmin status: MOCK projection testing only. No Garmin account is connected and workouts cannot be sent, published, or scheduled to Garmin.",
      }],
    };
  });

  server.registerTool("create_workout_draft", {
    title: "Create and save strength workout draft",
    description:
      "Use this when the user asks you to create or prepare a strength workout. Choose canonical exerciseKey values and use the catalog metric for every set. The draft is saved to TrainSync and is not sent to Garmin.",
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
      summary: summarySchema,
      validation: z.object({
        valid: z.boolean(),
        errors: z.array(validationErrorSchema),
        warnings: z.array(validationErrorSchema),
      }),
      persistence: z.object({ saved: z.boolean(), databaseId: z.string().nullable() }),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  }, async (args) => {
    let workout;
    try {
      workout = normalizeMcpWorkoutDraft(args);
    } catch (error) {
      return {
        isError:true,
        content:[{ type:"text", text:`Workout draft rejected: ${error?.message || "invalid exercise prescription"}` }],
      };
    }
    const validation = validateWorkout(workout);
    if (!validation.valid) {
      return { isError: true, content: [{ type: "text", text: `Workout failed validation with ${validation.errors.length} error(s).` }] };
    }
    const row = await upsertWorkoutForUser(auth.token, userId, workout);
    const summary = workoutSummary(workout);
    return {
      structuredContent: {
        workout,
        summary,
        validation,
        persistence: { saved: Boolean(row?.id), databaseId: row?.id || null },
      },
      content: [{
        type: "text",
        text: `Created and saved ${summary.title}: ${summary.exercises} exercises, ${summary.sets} working sets, ${summary.durationMinutes} minutes for ${summary.scheduledDate}.`,
      }],
    };
  });

  server.registerTool("list_workouts", {
    title: "List saved workouts",
    description: "Use this when the user wants to review or refer to workouts saved in their TrainSync account.",
    inputSchema: { limit: z.number().int().min(1).max(50).default(12) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ limit }) => {
    const rows = await listWorkoutsForUser(auth.token, userId, limit);
    const workouts = rows.map((row) => ({
      databaseId: row.id,
      id: row.client_workout_id,
      title: row.title,
      scheduledDate: row.scheduled_date,
      durationMinutes: row.estimated_duration_minutes,
      status: row.status,
      workout: row.payload,
    }));
    return {
      structuredContent: { workouts },
      content: [{ type: "text", text: `Found ${workouts.length} saved TrainSync workout(s).` }],
    };
  });

  server.registerTool("validate_workout", {
    title: "Validate strength workout",
    description: "Use this to verify canonical TrainSync workout structure and surface future Garmin-projection warnings.",
    inputSchema: { workout: workoutSchema },
    outputSchema: {
      valid: z.boolean(),
      errors: z.array(validationErrorSchema),
      warnings: z.array(validationErrorSchema),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ workout }) => {
    const result = validateWorkout(workout);
    return {
      structuredContent: result,
      content: [{
        type: "text",
        text: result.valid ? `Workout is valid with ${result.warnings.length} projection warning(s).` : `Workout has ${result.errors.length} validation error(s).`,
      }],
    };
  });

  return server;
}

function sendUnauthorized(res, description = "Authorization required") {
  res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${RESOURCE_METADATA_URL}"`);
  res.status(401).json({ error: "invalid_token", error_description: description });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, accept, authorization, mcp-session-id, mcp-protocol-version");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (!["POST", "GET", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "POST, GET, DELETE, OPTIONS");
    return res.status(405).end("Method Not Allowed");
  }

  const authHeader = String(req.headers.authorization || "");
  if (!authHeader.startsWith("Bearer ")) return sendUnauthorized(res);

  let auth;
  try {
    auth = await authenticateBearerToken(authHeader.slice(7).trim());
  } catch (error) {
    console.error("MCP auth validation error", error?.message || error);
    return sendUnauthorized(res, "Token validation failed");
  }
  if (!auth) return sendUnauthorized(res, "A valid TrainSync OAuth token is required");

  const server = createTrainSyncServer(auth);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { transport.close(); server.close(); });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("TrainSync MCP error", error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
}
