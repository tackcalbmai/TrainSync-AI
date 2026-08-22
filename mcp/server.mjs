import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createWorkoutFromIntent, validateWorkout, workoutSummary } from "../lib/workout.mjs";
import { getMockConnectionStatus, publishWorkoutMock } from "../lib/mock-garmin.mjs";

const PORT = Number(process.env.PORT || 8787);
const MCP_PATH = "/mcp";
const workouts = new Map();
const publications = new Map();

const workoutOutput = {
  workout: z.object({
    id: z.string(),
    title: z.string(),
    scheduledDate: z.string(),
    durationMinutes: z.number(),
    exercises: z.number(),
    sets: z.number(),
    intensity: z.string(),
    status: z.string(),
  }),
};

function makeServer() {
  const server = new McpServer(
    { name: "trainsync-ai", version: "0.1.0" },
    { instructions: "Strength-first training plugin. Create a draft before publishing. Publishing affects an external training provider; use publish_workout only when the user asks to send, publish, or schedule the workout." },
  );

  server.registerTool("get_connection_status", {
    title: "Get Garmin connection status",
    description: "Use this when the user wants to know whether Garmin is connected or before a Garmin publishing workflow.",
    inputSchema: {},
    outputSchema: { connected: z.boolean(), mode: z.string(), provider: z.string(), capabilities: z.array(z.string()) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    const status = getMockConnectionStatus();
    return { structuredContent: status, content: [{ type: "text", text: `Garmin provider is ${status.connected ? "connected" : "not connected"} (${status.mode} mode).` }] };
  });

  server.registerTool("create_workout_draft", {
    title: "Create strength workout draft",
    description: "Use this when the user asks to create, design, or prepare a strength workout. This creates a draft and does not publish externally.",
    inputSchema: { intent: z.string().min(3), timezone: z.string().default("Europe/Riga") },
    outputSchema: workoutOutput,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async ({ intent, timezone }) => {
    const workout = createWorkoutFromIntent(intent, { timezone });
    workouts.set(workout.id, workout);
    const summary = workoutSummary(workout);
    return { structuredContent: { workout: summary }, content: [{ type: "text", text: `Created ${summary.title}: ${summary.exercises} exercises, ${summary.sets} sets, ${summary.durationMinutes} minutes.` }] };
  });

  server.registerTool("validate_workout", {
    title: "Validate workout",
    description: "Use this when checking whether a workout is structurally valid before publication.",
    inputSchema: { workoutId: z.string().min(1) },
    outputSchema: { valid: z.boolean(), errors: z.array(z.object({ code: z.string(), message: z.string() })), warningCount: z.number() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ workoutId }) => {
    const workout = workouts.get(workoutId);
    if (!workout) return { isError: true, content: [{ type: "text", text: `Workout ${workoutId} was not found.` }] };
    const result = validateWorkout(workout);
    return { structuredContent: { valid: result.valid, errors: result.errors, warningCount: result.warnings.length }, content: [{ type: "text", text: result.valid ? "Workout is valid." : `Workout has ${result.errors.length} validation errors.` }] };
  });

  server.registerTool("publish_workout", {
    title: "Publish workout to Garmin",
    description: "Use this only when the user explicitly asks to send, publish, or schedule an existing workout to Garmin Connect.",
    inputSchema: { workoutId: z.string().min(1) },
    outputSchema: { success: z.boolean(), provider: z.string(), mode: z.string(), providerResourceId: z.string(), workoutId: z.string(), scheduledDate: z.string(), status: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async ({ workoutId }) => {
    const workout = workouts.get(workoutId);
    if (!workout) return { isError: true, content: [{ type: "text", text: `Workout ${workoutId} was not found.` }] };
    const key = `${workout.id}:r${workout.revision || 1}`;
    const existing = publications.get(key);
    const result = existing || publishWorkoutMock(workout);
    publications.set(key, result);
    workout.status = "published";
    return { structuredContent: result, content: [{ type: "text", text: `${workout.title} published to Garmin (${result.mode} mode) for ${workout.scheduledDate}.` }] };
  });

  server.registerTool("list_workouts", {
    title: "List workouts",
    description: "Use this when the user wants to review workouts created in the current TrainSync session.",
    inputSchema: {},
    outputSchema: { workouts: z.array(workoutOutput.workout) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => {
    const items = [...workouts.values()].map(workoutSummary);
    return { structuredContent: { workouts: items }, content: [{ type: "text", text: `Found ${items.length} workouts.` }] };
  });

  return server;
}

const httpServer = createServer(async (req, res) => {
  if (req.method === "OPTIONS" && req.url === MCP_PATH) {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "content-type,mcp-session-id" }).end();
    return;
  }
  if (req.url === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, name: "trainsync-ai", mode: "mock" }));
    return;
  }
  if (req.url === MCP_PATH) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const server = makeServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("MCP error", error);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }
  res.writeHead(404).end("Not Found");
});

httpServer.listen(PORT, () => console.log(`TrainSync MCP listening on http://localhost:${PORT}${MCP_PATH}`));
