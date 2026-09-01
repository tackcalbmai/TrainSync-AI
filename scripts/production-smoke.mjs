const BASE_URL = String(process.env.BASE_URL || "https://trainsyncai.vercel.app").replace(/\/$/, "");
const TIMEOUT_MS = 15000;

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    signal:AbortSignal.timeout(TIMEOUT_MS),
    redirect:"follow",
    ...options,
  });
  const text = await response.text();
  return { response, text };
}

async function fetchText(path) {
  const result = await request(path);
  if (!result.response.ok) throw new Error(`${path} returned ${result.response.status}`);
  return result;
}

async function fetchJson(path) {
  const { text } = await fetchText(path);
  try { return JSON.parse(text); }
  catch { throw new Error(`${path} did not return valid JSON`); }
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

async function checkPage(path, markers) {
  const { text } = await fetchText(path);
  for (const marker of Array.isArray(markers) ? markers : [markers]) {
    requireValue(text.includes(marker), `${path} is missing expected marker: ${marker}`);
  }
  console.log(`PASS ${path}`);
}

async function checkStatus(path, status, options = {}) {
  const { response } = await request(path, options);
  requireValue(response.status === status, `${path} returned ${response.status}; expected ${status}`);
  console.log(`PASS ${path} -> ${status}`);
}

async function checkSecurityHeaders() {
  const { response } = await fetchText("/");
  const csp = response.headers.get("content-security-policy") || "";
  requireValue(response.headers.get("x-frame-options") === "DENY", "X-Frame-Options must be DENY");
  requireValue(csp.includes("default-src 'self'"), "CSP default-src is missing");
  requireValue(csp.includes("script-src 'self' https://cdn.jsdelivr.net"), "CSP script-src does not preserve pinned Supabase JS CDN access");
  requireValue(csp.includes("connect-src 'self' https://sjihbrpbhfttuyzmbfku.supabase.co"), "CSP connect-src does not preserve Supabase access");
  requireValue(csp.includes("frame-ancestors 'none'"), "CSP clickjacking protection is missing");
  requireValue(!/script-src[^;]*'unsafe-inline'/.test(csp), "CSP unexpectedly permits inline scripts");
  console.log("PASS production security headers");
}

async function main() {
  console.log(`TrainSync production smoke: ${BASE_URL}`);

  await checkPage("/", ["TRAINSYNC", "/next-session-insight-ui.js", "id=\"lastPublish\""]);
  await checkSecurityHeaders();
  await checkPage("/workout", ["LIVE WORKOUT", "/workout-substitution-ui.js"]);
  await checkPage("/program", ["PROGRAM", "/program-missed-session-ui.js", "/program-adjustment-explain-ui.js"]);
  await checkPage("/history", "TRAINING RECORD");
  await checkPage("/progress", "PERFORMANCE SIGNAL");
  await checkPage("/profile", "ATHLETE CONTEXT");
  await checkPage("/integrations", "GARMIN INTEGRATION");
  await checkPage("/reset-password", "Choose a new password");
  await checkPage("/oauth/consent", "SECURE AUTHORIZATION");
  await checkPage("/manifest.webmanifest", "TrainSync AI");
  await checkPage("/sw.js", "trainsync-v21");
  await checkPage("/next-session-insight-ui.js", "buildNextSessionInsight");
  await checkPage("/program-missed-session-ui.js", "resolve_missed_session");
  await checkPage("/program-adjustment-explain-ui.js", "WHY THIS CHANGED");

  const science = await fetchJson("/api/science");
  requireValue(science?.ok === true, "/api/science is not healthy");
  requireValue(science?.adaptationPolicyReady === true, "adaptation policy is not ready");
  requireValue(science?.prescriptionMutationReady === true, "prescription mutation is not ready");
  console.log("PASS /api/science");

  const health = await fetchJson("/api/health");
  requireValue(health?.ok === true, "/api/health is not healthy");
  requireValue(health?.garmin?.provider === "garmin", "Garmin provider status is missing");
  if (health.garmin.mode === "mock") {
    requireValue(health.garmin.connected === false, "mock Garmin must never report connected=true");
    requireValue(health.garmin.authorizationValid === false, "mock Garmin must never report authorizationValid=true");
    requireValue(health.garmin.mockReady === true, "mock Garmin projection/test capability is not ready");
  }
  console.log("PASS /api/health");

  const oauth = await fetchJson("/api/oauth-status");
  requireValue(oauth?.oauthServerEnabled === true, "OAuth discovery is not healthy");
  requireValue(Boolean(oauth?.authorizationEndpoint), "OAuth authorization endpoint is missing");
  requireValue(Boolean(oauth?.tokenEndpoint), "OAuth token endpoint is missing");
  console.log("PASS /api/oauth-status");

  await checkStatus("/mcp", 401);
  await checkStatus("/api/import-fit", 401, { method:"POST", headers:{ "Content-Type":"application/octet-stream" }, body:new Uint8Array() });
  await checkStatus("/api/generate", 401, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ intent:"smoke-test-auth-boundary" }) });
  await checkStatus("/api/program-generate", 401, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({}) });

  console.log("PRODUCTION_SMOKE_OK");
}

main().catch((error) => {
  console.error(`PRODUCTION_SMOKE_FAILED: ${error?.message || error}`);
  process.exitCode = 1;
});
