import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { stableHash, validateWorkout, workoutSummary } from "../lib/workout.mjs";
import { getMockConnectionStatus, publishWorkoutMock } from "../lib/mock-garmin.mjs";
import {
  authenticateBearerToken,
  listWorkoutsForUser,
  savePublicationForUser,
  upsertWorkoutForUser,
} from "../lib/supabase-mcp.mjs";

const RESOURCE_METADATA_URL = "https://trainsyncai.vercel.app/.well-known/oauth-protected-resource/mcp";

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
    instructions: args.instructions?.trim?.() || "Use controlled form. Stop the set if technique breaks down.",
    exercises,
    createdAt: new Date().toISOString(),
  };
}

function createTrainSyncServer(auth) {
  const userId = auth.user.id;
  const server = new McpServer(
    { name: "trainsync-ai", version: "0.4.0" },
    {
      instructions:
        "Authenticated strength-training toolset. Program exercises, sets, reps, rest and optional working weights from the user's request and context, then call create_workout_draft. Drafts are saved to the authenticated TrainSync account. Validate before publishing. Only call publish_workout when the user explicitly asks to send, publish, or schedule to Garmin. Garmin is currently mock-only and does not modify a real Garmin account.",
    },
  );

  server.registerTool("get_connection_status", {
    title: "Get Garmin connection status",
    description: "Use this to check Garmin publishing availability before a publish workflow.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    const status = getMockConnectionStatus();
    return {
      structuredContent: { ...status, authenticated: true },
      content: [{ type: "text", text: `TrainSync account authenticated. Garmin publishing is available in ${status.mode} mode.` }],
    };
  });

  server.registerTool("create_workout_draft", {
    title: "Create and save strength workout draft",
    description:
      "Use this when the user asks you to create or prepare a strength workout. Program the exercises, sets, reps, rest and optional weights yourself. The draft is saved to the user's TrainSync account but is not published to Garmin.",
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
    const workout = normalizeDraft(args);
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
    description: "Use this to verify a complete TrainSync workout before Garmin publication.",
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
        text: result.valid ? `Workout is valid with ${result.warnings.length} Garmin-mapping warning(s).` : `Workout has ${result.errors.length} validation error(s).`,
      }],
    };
  });

  server.registerTool("publish_workout", {
    title: "Publish workout to Garmin",
    description:
      "Use this only when the user explicitly asks to send, publish, or schedule a complete TrainSync workout to Garmin Connect. Current provider is mock-only.",
    inputSchema: { workout: workoutSchema },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
  }, async ({ workout }) => {
    const validation = validateWorkout(workout);
    if (!validation.valid) {
      return { isError: true, content: [{ type: "text", text: `Cannot publish: ${validation.errors.length} validation error(s).` }] };
    }
    const result = publishWorkoutMock(workout);
    const publishedWorkout = { ...workout, status: "published" };
    const row = await upsertWorkoutForUser(auth.token, userId, publishedWorkout);
    const publication = row?.id
      ? await savePublicationForUser(auth.token, userId, row.id, publishedWorkout, result)
      : null;
    return {
      structuredContent: {
        ...result,
        persistence: {
          saved: Boolean(row?.id),
          databaseId: row?.id || null,
          publicationSaved: Boolean(publication?.id) || result.success,
        },
      },
      content: [{
        type: "text",
        text: `${workout.title} published to Garmin in ${result.mode} mode for ${workout.scheduledDate} and saved to TrainSync history.`,
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
