const BASE_URL = String(process.env.BASE_URL || "https://trainsyncai.vercel.app").replace(/\/$/, "");
const TIMEOUT_MS = 15000;

async function fetchText(path) {
  const response = await fetch(`${BASE_URL}${path}`, { signal:AbortSignal.timeout(TIMEOUT_MS), redirect:"follow" });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return { response, text };
}

async function fetchJson(path) {
  const { text } = await fetchText(path);
  try { return JSON.parse(text); }
  catch { throw new Error(`${path} did not return valid JSON`); }
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

async function checkPage(path, marker) {
  const { text } = await fetchText(path);
  requireValue(text.includes(marker), `${path} is missing expected marker: ${marker}`);
  console.log(`PASS ${path}`);
}

async function main() {
  console.log(`TrainSync production smoke: ${BASE_URL}`);
  await checkPage("/", "TRAINSYNC");
  await checkPage("/workout", "LIVE WORKOUT");
  await checkPage("/program", "PROGRAM");
  await checkPage("/integrations", "GARMIN");

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
  console.log("PRODUCTION_SMOKE_OK");
}

main().catch((error) => {
  console.error(`PRODUCTION_SMOKE_FAILED: ${error?.message || error}`);
  process.exitCode = 1;
});
