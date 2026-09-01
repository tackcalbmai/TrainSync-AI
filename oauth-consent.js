import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm";
import { getSession, refreshSession, signIn, signUp } from "/lib/supabase-client.js";
import { validateNewPassword } from "/lib/password-policy.mjs";

const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const authorizationId = new URLSearchParams(location.search).get("authorization_id");
const status = document.querySelector("#status");
const errorBox = document.querySelector("#error");
const authPanel = document.querySelector("#authPanel");
const consentPanel = document.querySelector("#consentPanel");
const authForm = document.querySelector("#authForm");
const authSwitch = document.querySelector("#authSwitch");
const authSubmit = document.querySelector("#authSubmit");
let authMode = "signin";

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

async function syncSdkSession() {
  let session = getSession();
  if (!session?.access_token || !session?.refresh_token) return false;
  let { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (!error) return true;

  session = await refreshSession().catch(() => null);
  if (!session?.access_token || !session?.refresh_token) return false;
  ({ error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }));
  return !error;
}

function showAuth() {
  status.classList.add("hidden");
  consentPanel.classList.add("hidden");
  authPanel.classList.remove("hidden");
}

function showConsent(details) {
  status.classList.add("hidden");
  authPanel.classList.add("hidden");
  consentPanel.classList.remove("hidden");
  document.querySelector("#clientName").textContent = details.client?.name || "ChatGPT";
  document.querySelector("#redirectUri").textContent = details.redirect_uri || "—";
  const scopeList = String(details.scope || "email").split(/\s+/).filter(Boolean);
  document.querySelector("#scopes").innerHTML = scopeList
    .map((scope) => `<span class="scope">${scope.replace(/[<>&\"]/g, "")}</span>`)
    .join("");
}

async function loadAuthorization() {
  clearError();
  if (!authorizationId) {
    status.classList.add("hidden");
    showError("Missing authorization_id. Start the connection from your MCP client.");
    return;
  }

  const hasSession = await syncSdkSession();
  if (!hasSession) {
    showAuth();
    return;
  }

  status.textContent = "Loading authorization request…";
  status.classList.remove("hidden");
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) {
    status.classList.add("hidden");
    showError(error?.message || "Invalid or expired authorization request.");
    return;
  }

  if (!("authorization_id" in data) && data.redirect_url) {
    location.replace(data.redirect_url);
    return;
  }

  showConsent(data);
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  if (!email || !password) {
    showError("Enter your email and password.");
    return;
  }
  if (authMode === "signup") {
    const passwordCheck = validateNewPassword(password);
    if (!passwordCheck.valid) {
      showError(passwordCheck.message);
      return;
    }
  }
  authSubmit.disabled = true;
  authSubmit.textContent = authMode === "signup" ? "CREATING…" : "SIGNING IN…";
  try {
    const result = authMode === "signup" ? await signUp(email, password) : await signIn(email, password);
    if (authMode === "signup" && !result?.access_token) {
      showError("Account created. Confirm your email, then return here and sign in.");
      authMode = "signin";
      authSubmit.textContent = "SIGN IN";
      authSwitch.textContent = "New here? Create account";
      return;
    }
    await loadAuthorization();
  } catch (error) {
    showError(error.message || "Authentication failed.");
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = authMode === "signup" ? "CREATE ACCOUNT" : "SIGN IN";
  }
});

authSwitch.addEventListener("click", () => {
  clearError();
  authMode = authMode === "signin" ? "signup" : "signin";
  const password = document.querySelector("#password");
  password.autocomplete = authMode === "signup" ? "new-password" : "current-password";
  password.minLength = authMode === "signup" ? 8 : 1;
  authSubmit.textContent = authMode === "signup" ? "CREATE ACCOUNT" : "SIGN IN";
  authSwitch.textContent = authMode === "signup" ? "Already have an account? Sign in" : "New here? Create account";
});

document.querySelector("#approve").addEventListener("click", async () => {
  clearError();
  const approve = document.querySelector("#approve");
  const deny = document.querySelector("#deny");
  approve.disabled = true;
  deny.disabled = true;
  try {
    const { data, error } = await supabase.auth.oauth.approveAuthorization(authorizationId);
    if (error || !data?.redirect_url) throw error || new Error("Authorization redirect missing.");
    location.assign(data.redirect_url);
  } catch (error) {
    showError(error.message || "Could not approve authorization.");
    approve.disabled = false;
    deny.disabled = false;
  }
});

document.querySelector("#deny").addEventListener("click", async () => {
  clearError();
  const approve = document.querySelector("#approve");
  const deny = document.querySelector("#deny");
  approve.disabled = true;
  deny.disabled = true;
  try {
    const { data, error } = await supabase.auth.oauth.denyAuthorization(authorizationId);
    if (error || !data?.redirect_url) throw error || new Error("Authorization redirect missing.");
    location.assign(data.redirect_url);
  } catch (error) {
    showError(error.message || "Could not deny authorization.");
    approve.disabled = false;
    deny.disabled = false;
  }
});

loadAuthorization();
