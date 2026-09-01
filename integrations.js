import { currentUser, getSession, refreshSession } from "./lib/supabase-client.js";
import { signInRedirectUrl } from "./lib/auth-redirect.mjs";

const $ = (selector) => document.querySelector(selector);
const toast = $("#toast");
let selectedFile = null;

function showToast(message, success = false) {
  toast.textContent = message;
  toast.className = `toast show${success ? " success" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = "toast"; }, 3600);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read FIT file."));
    reader.readAsDataURL(file);
  });
}

async function request(path, options = {}, retry = true) {
  let session = getSession();
  if (!session?.access_token) throw new Error("SIGN_IN_REQUIRED");
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${session.access_token}` };
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401 && retry && session.refresh_token) {
    session = await refreshSession();
    return request(path, options, false);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || `Request failed (${response.status})`);
    error.data = data;
    error.status = response.status;
    throw error;
  }
  return data;
}

function formatDate(value) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function renderImports(imports = []) {
  const list = $("#importList");
  if (!Array.isArray(imports) || !imports.length) {
    list.innerHTML = '<div class="empty-state">No Garmin activity imports yet.</div>';
    return;
  }
  list.innerHTML = imports.map((item) => {
    const match = item?.metadata?.match;
    const matched = match?.matched && match?.best?.title ? ` · matched ${match.best.title}` : "";
    const title = item?.metadata?.title || item?.metadata?.summary?.title || "Garmin activity";
    return `<div class="import-row">
      <div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(formatDate(item.completed_at || item.started_at || item.created_at))}${escapeHtml(matched)}</small></div>
      <span class="status ${escapeHtml(item.status)}">${escapeHtml(String(item.status || "unknown").toUpperCase())}</span>
    </div>`;
  }).join("");
}

function setStrongState(selector, text, ready = false) {
  const element = $(selector);
  if (!element) return;
  element.textContent = text;
  element.classList.toggle("ready", Boolean(ready));
}

function trainingLabel(training = {}) {
  if (training.mode === "mock") return "MOCK ONLY";
  if (training.mode !== "official") return "NOT CONNECTED";
  if (training.connected && training.authorizationValid) return "CONNECTED";
  if (training.transportConfigured && !training.authorizationValid) return "NEEDS AUTH";
  return "NOT CONNECTED";
}

function renderProviderSummary(activity = {}, training = {}) {
  const trainingConnected = training.mode === "official" && training.connected && training.authorizationValid;
  const activityConnected = Boolean(activity.automaticSync);
  const anyOfficial = trainingConnected || activityConnected;
  const bothOfficial = trainingConnected && activityConnected;
  const pill = $("#providerState");

  if (bothOfficial) {
    pill.textContent = "GARMIN CONNECTED";
    pill.className = "state-pill";
  } else if (anyOfficial) {
    pill.textContent = "PARTIAL OFFICIAL CONNECTION";
    pill.className = "state-pill waiting";
  } else {
    pill.textContent = "WAITING FOR GARMIN ACCESS";
    pill.className = "state-pill waiting";
  }

  setStrongState("#trainingApiState", trainingLabel(training), trainingConnected);
  setStrongState("#activityApiState", activityConnected ? "CONNECTED" : "NOT CONNECTED", activityConnected);
  setStrongState("#fitProjectionState", "READY", true);
  setStrongState("#autoSyncState", activityConnected ? "ACTIVE" : "LOCKED", activityConnected);

  const note = $("#providerNote");
  if (training.mode === "mock") {
    note.textContent = "Training publishing is running through the explicit mock provider: no Garmin account is modified. Activity API automatic delivery is also not connected. TrainSync never uses unofficial Garmin login APIs.";
  } else if (trainingConnected && activityConnected) {
    note.textContent = "Official Garmin Training and Activity providers are connected for this account. FIT projection and ingestion remain the deterministic boundaries around external Garmin data.";
  } else if (training.mode === "official" && training.transportConfigured) {
    note.textContent = "The official Training API transport is configured, but this user is not fully authorized yet. TrainSync will not fall back to mock or claim a publish succeeded.";
  } else {
    note.textContent = "Official Garmin cloud access is not connected yet. FIT projection and FIT activity ingestion are ready, and TrainSync will not use unofficial Garmin login APIs.";
  }
}

async function loadProviderState() {
  try {
    const [activity, training] = await Promise.all([
      request("/api/import-fit", { method:"GET" }),
      request("/api/publish", { method:"GET" }),
    ]);
    renderProviderSummary(activity, training);
    renderImports(activity.imports);
  } catch (error) {
    setStrongState("#trainingApiState", "STATUS ERROR", false);
    setStrongState("#activityApiState", "STATUS ERROR", false);
    setStrongState("#autoSyncState", "UNKNOWN", false);
    showToast(error.message);
  }
}

function selectFile(file) {
  selectedFile = null;
  $("#fitDrop").classList.remove("has-file");
  $("#importButton").disabled = true;
  $("#importResult").hidden = true;
  if (!file) {
    $("#fitFileName").textContent = "Choose a Garmin activity file";
    return;
  }
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension !== "fit") {
    $("#fitFile").value = "";
    $("#fitFileName").textContent = "Choose a .fit file";
    return showToast("TrainSync currently accepts extracted .fit files only.");
  }
  if (file.size > 3 * 1024 * 1024) {
    $("#fitFile").value = "";
    $("#fitFileName").textContent = "Choose a smaller .fit file";
    return showToast("FIT file is larger than 3 MB.");
  }
  selectedFile = file;
  $("#fitDrop").classList.add("has-file");
  $("#fitFileName").textContent = file.name;
  $("#importButton").disabled = false;
}

async function importFit() {
  if (!selectedFile) return;
  const button = $("#importButton");
  const resultBox = $("#importResult");
  button.disabled = true;
  button.innerHTML = "IMPORTING…";
  resultBox.hidden = true;
  try {
    const fitBase64 = await fileToDataUrl(selectedFile);
    const result = await request("/api/import-fit", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ fitBase64 }),
    });
    const match = result.match;
    let message = result.duplicate ? "This Garmin activity was already imported." : `Imported ${result.activity?.summary?.totalSets || 0} working sets.`;
    if (match?.matched && match.best?.title) {
      message += ` <strong>Matched to ${escapeHtml(match.best.title)}</strong> (${Math.round((match.best.score || 0) * 100)}%).`;
    } else if (match?.best?.title) {
      message += ` Best possible plan match was ${escapeHtml(match.best.title)}, but confidence was not high enough to auto-link it.`;
    } else {
      message += " No planned workout was auto-linked.";
    }
    resultBox.innerHTML = message;
    resultBox.className = "import-result success";
    resultBox.hidden = false;
    showToast("Garmin FIT imported into TrainSync ✓", true);
    await loadProviderState();
  } catch (error) {
    const details = error.data?.error === "NOT_STRENGTH_ACTIVITY"
      ? "The file is valid, but it is not a strength activity."
      : error.data?.error === "NO_STRENGTH_SETS_FOUND"
        ? "The activity is strength-like, but Garmin did not include usable set messages."
        : error.message;
    resultBox.textContent = details;
    resultBox.className = "import-result";
    resultBox.hidden = false;
    showToast(details);
  } finally {
    button.innerHTML = "IMPORT FIT <b>↗</b>";
    button.disabled = !selectedFile;
  }
}

if (!currentUser()) {
  location.replace(signInRedirectUrl("/integrations"));
} else {
  $("#fitFile").addEventListener("change", (event) => selectFile(event.target.files?.[0] || null));
  $("#importButton").addEventListener("click", importFit);
  loadProviderState();
}
