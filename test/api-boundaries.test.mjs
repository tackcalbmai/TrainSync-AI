import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import adaptSession from "../api/adapt-session.js";
import health from "../api/health.js";
import importFit from "../api/import-fit.js";
import oauthResource from "../api/oauth-resource.js";
import oauthStatus from "../api/oauth-status.js";
import publish from "../api/publish.js";
import science from "../api/science.js";
import validate from "../api/validate.js";
import generate from "../lib/generate-handler.mjs";
import programGenerate from "../lib/program-generate-handler-v2.mjs";
import { publicErrorDetails, publicErrorMessage } from "../lib/http.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

function responseRecorder() {
  return {
    statusCode:null,
    body:null,
    headers:{},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
    end(value) { this.body = value; return this; },
  };
}

test("every HTTP function returns 405 with an explicit Allow contract", async () => {
  const cases = [
    [health, "POST", "GET"],
    [oauthStatus, "POST", "GET"],
    [oauthResource, "POST", "GET"],
    [generate, "GET", "POST"],
    [programGenerate, "GET", "POST"],
    [importFit, "PATCH", "GET, POST"],
    [adaptSession, "GET", "POST"],
    [publish, "PATCH", "GET, POST"],
    [validate, "GET", "POST"],
    [science, "POST", "GET"],
  ];
  for (const [handler, method, allow] of cases) {
    const res = responseRecorder();
    await handler({ method, headers:{}, body:{} }, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers.allow, allow);
    assert.deepEqual(res.body, { error:"METHOD_NOT_ALLOWED" });
  }
  assert.match(read("api/mcp.js"), /setHeader\("Allow", "POST, GET, DELETE, OPTIONS"\)/);
});

test("server faults do not expose upstream messages or structured details", () => {
  const upstream = { status:502, message:"secret upstream host and stack detail", details:{ internal:true } };
  assert.equal(publicErrorMessage(upstream, "Safe fallback"), "Safe fallback");
  assert.equal(publicErrorDetails(upstream), null);
  assert.equal(publicErrorMessage({ status:409, message:"Revision conflict" }, "fallback"), "Revision conflict");
});

test("FIT UI and server leave room for base64 JSON under Vercel's 4.5 MB payload limit", () => {
  const endpoint = read("api/import-fit.js");
  const client = read("integrations.js");
  const html = read("integrations.html");
  assert.match(endpoint, /MAX_FIT_BYTES\s*=\s*3 \* 1024 \* 1024/);
  assert.match(endpoint, /MAX_FIT_BASE64_CHARS/);
  assert.match(client, /file\.size > 3 \* 1024 \* 1024/);
  assert.match(html, /Maximum 3 MB/);
  assert.doesNotMatch(endpoint, /res\.status\(500\)\.json\(\{[^}]*message:\s*error\.message/s);
});

test("FIT import commits the activity before best-effort program status updates", () => {
  const endpoint = read("api/import-fit.js");
  const commit = endpoint.indexOf('status: "imported", workout_session_id: session.id');
  const workoutStatus = endpoint.indexOf("if (linkedWorkoutId)", commit);
  const programStatus = endpoint.indexOf("if (matchedProgramSession)", commit);
  assert.ok(commit > 0 && workoutStatus > commit && programStatus > commit);
  assert.match(endpoint, /if \(!importCommitted\) \{\s*await cleanupSession/s);
  assert.match(endpoint, /POST_IMPORT_UPDATE_FAILED/);
});
