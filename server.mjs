import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorkoutFromIntent, validateWorkout, workoutSummary } from "./lib/workout.mjs";
import { getMockConnectionStatus, publishWorkoutMock } from "./lib/mock-garmin.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/health" && req.method === "GET") {
    return json(res, 200, { ok: true, app: "TrainSync AI", garmin: getMockConnectionStatus() });
  }
  if (url.pathname === "/api/generate" && req.method === "POST") {
    const body = await readJson(req);
    if (!body.intent) return json(res, 400, { error: "INTENT_REQUIRED" });
    const workout = createWorkoutFromIntent(body.intent, { timezone: body.timezone || "Europe/Riga" });
    return json(res, 200, { workout, validation: validateWorkout(workout), summary: workoutSummary(workout) });
  }
  if (url.pathname === "/api/validate" && req.method === "POST") {
    const body = await readJson(req);
    return json(res, 200, validateWorkout(body.workout));
  }
  if (url.pathname === "/api/publish" && req.method === "POST") {
    try {
      const body = await readJson(req);
      return json(res, 200, publishWorkoutMock(body.workout));
    } catch (error) {
      return json(res, 400, { success: false, code: error.code || "GARMIN_API_ERROR", message: error.message, details: error.details || [] });
    }
  }
  return json(res, 404, { error: "NOT_FOUND" });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);

    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const safePath = normalize(requested).replace(/^([.][.][/\\])+/, "");
    const filePath = join(ROOT, safePath);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
      "Cache-Control": extname(filePath) === ".html" ? "no-cache" : "public, max-age=300",
    });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      res.writeHead(404).end("Not Found");
      return;
    }
    console.error(error);
    res.writeHead(500).end("Internal Server Error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`TrainSync AI running at http://localhost:${PORT}`);
});
