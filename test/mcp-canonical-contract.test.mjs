import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createTrainSyncServer } from "../api/mcp.js";
import { normalizeMcpWorkoutDraft } from "../lib/mcp-workout-draft.mjs";
import { validateWorkout } from "../lib/workout.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

function draft(overrides = {}) {
  return {
    title:"Canonical strength session",
    scheduledDate:"2026-09-03",
    timezone:"Europe/Riga",
    durationMinutes:45,
    intensity:"moderate",
    instructions:"Controlled reps.",
    exercises:[{
      exerciseKey:"barbell_bench_press",
      notes:"Pause briefly.",
      sets:[{
        metricType:"reps",
        targetReps:8,
        weightKg:80,
        targetRir:2,
        restSec:120,
      }],
    }],
    ...overrides,
  };
}

test("MCP drafts use server-owned canonical exercise identity and stable ids", () => {
  const first = normalizeMcpWorkoutDraft(draft(), { now:new Date("2026-09-01T10:00:00.000Z") });
  const retry = normalizeMcpWorkoutDraft(draft(), { now:new Date("2026-09-01T10:05:00.000Z") });

  assert.equal(first.id, retry.id);
  assert.equal(first.source, "chatgpt_mcp");
  assert.equal(first.exerciseCatalogEnforced, true);
  assert.equal(first.exercises[0].exerciseKey, "barbell_bench_press");
  assert.equal(first.exercises[0].name, "Barbell Bench Press");
  assert.equal(first.exercises[0].movementPattern, "horizontal_push");
  assert.deepEqual(first.exercises[0].primaryMuscles, ["chest"]);
  assert.deepEqual(first.exercises[0].sets[0], {
    index:1,
    metricType:"reps",
    targetReps:8,
    minReps:8,
    maxReps:8,
    weightKg:80,
    targetRir:2,
    restSec:120,
  });
  assert.equal(validateWorkout(first).valid, true);
});

test("MCP drafts preserve canonical duration metrics without inventing reps", () => {
  const workout = normalizeMcpWorkoutDraft(draft({
    exercises:[{
      exerciseKey:"front_plank",
      notes:"",
      sets:[{
        metricType:"duration_seconds",
        targetDurationSeconds:45,
        weightKg:null,
        targetRir:2,
        restSec:60,
      }],
    }],
  }));

  assert.deepEqual(workout.exercises[0].sets[0], {
    index:1,
    metricType:"duration_seconds",
    targetDurationSeconds:45,
    minDurationSeconds:45,
    maxDurationSeconds:45,
    weightKg:null,
    targetRir:2,
    restSec:60,
  });
  assert.equal("targetReps" in workout.exercises[0].sets[0], false);
  assert.equal(validateWorkout(workout).valid, true);
});

test("MCP drafts reject a set metric that conflicts with canonical metadata", () => {
  assert.throws(
    () => normalizeMcpWorkoutDraft(draft({
      exercises:[{
        exerciseKey:"front_plank",
        notes:"",
        sets:[{ metricType:"reps", targetReps:10, weightKg:null, targetRir:2, restSec:60 }],
      }],
    })),
    /duration_seconds is required/,
  );
});

test("production MCP has no mock Garmin publication action or legacy server", () => {
  const source = read("api/mcp.js");
  assert.match(source, /exerciseKey:\s*exerciseKeySchema/);
  assert.match(source, /officialPublishingAvailable:false/);
  assert.match(source, /connected:false/);
  assert.doesNotMatch(source, /registerTool\("publish_workout"/);
  assert.doesNotMatch(source, /publishWorkoutMock|savePublicationForUser/);
  assert.doesNotMatch(source, /published to Garmin in/);
  assert.equal(existsSync(path.join(ROOT, "mcp/server.mjs")), false);
  assert.equal(existsSync(path.join(ROOT, "mcp/package.json")), false);
});

test("MCP protocol advertises only the four honest authenticated tools", async () => {
  const server = createTrainSyncServer({ user:{ id:"usr_contract" }, token:"token_contract" });
  const client = new Client({ name:"contract-test", version:"1.0.0" }, { capabilities:{} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.listTools();
    assert.deepEqual(
      result.tools.map((tool) => tool.name).sort(),
      ["create_workout_draft", "get_connection_status", "list_workouts", "validate_workout"],
    );
    const createTool = result.tools.find((tool) => tool.name === "create_workout_draft");
    const exerciseItem = createTool.inputSchema.properties.exercises.items;
    assert.ok(exerciseItem.properties.exerciseKey.enum.includes("barbell_bench_press"));
    assert.equal("name" in exerciseItem.properties, false);
  } finally {
    await client.close();
    await server.close();
  }
});
