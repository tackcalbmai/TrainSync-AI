import { validateNewPassword } from "./lib/password-policy.mjs";
import { consumeAuthRedirect, requestPasswordReset } from "./lib/supabase-client.js";

const RECOVERY_FLAG = "trainsync:password-recovery";

function toast(message, success = false) {
  const node = document.querySelector("#toast");
  if (!node) return;
  node.textContent = message;
  node.className = `toast show${success ? " success" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.className = "toast"; }, 4200);
}

function restoreAuthForm() {
  const modal = document.querySelector("#authModal");
  const password = document.querySelector("#authPassword");
  const submit = document.querySelector("#authSubmit");
  const heading = document.querySelector("#authMode");
  const switchButton = document.querySelector("#authSwitch");
  const forgot = document.querySelector("#authForgot");
  if (!modal || !password || !submit || !heading || !switchButton || !forgot) return;
  if (modal.dataset.mode !== "recovery") return;
  modal.dataset.mode = "signin";
  password.parentElement.hidden = false;
  password.required = true;
  password.autocomplete = "current-password";
  heading.textContent = "SIGN IN";
  submit.textContent = "SIGN IN";
  switchButton.hidden = false;
  switchButton.textContent = "New here? Create account";
  forgot.textContent = "Forgot password?";
}

function setRecoveryMode() {
  const modal = document.querySelector("#authModal");
  const password = document.querySelector("#authPassword");
  const submit = document.querySelector("#authSubmit");
  const heading = document.querySelector("#authMode");
  const switchButton = document.querySelector("#authSwitch");
  const forgot = document.querySelector("#authForgot");
  if (!modal || !password || !submit || !heading || !switchButton || !forgot) return;
  modal.dataset.mode = "recovery";
  password.value = "";
  password.required = false;
  password.parentElement.hidden = true;
  heading.textContent = "RESET PASSWORD";
  submit.textContent = "SEND RESET LINK";
  switchButton.hidden = true;
  forgot.textContent = "Back to sign in";
  document.querySelector("#authEmail")?.focus();
}

function syncPasswordAutocomplete() {
  const modal = document.querySelector("#authModal");
  const password = document.querySelector("#authPassword");
  if (!modal || !password || modal.dataset.mode === "recovery") return;
  password.autocomplete = modal.dataset.mode === "signup" ? "new-password" : "current-password";
}

function installRecoveryUi() {
  const form = document.querySelector("#authForm");
  const switchButton = document.querySelector("#authSwitch");
  if (!form || !switchButton || document.querySelector("#authForgot")) return;
  const forgot = document.createElement("button");
  forgot.type = "button";
  forgot.id = "authForgot";
  forgot.className = "auth-switch";
  forgot.textContent = "Forgot password?";
  switchButton.insertAdjacentElement("afterend", forgot);

  forgot.addEventListener("click", () => {
    const modal = document.querySelector("#authModal");
    if (modal?.dataset.mode === "recovery") restoreAuthForm();
    else setRecoveryMode();
  });
  document.querySelector("#authClose")?.addEventListener("click", restoreAuthForm);
  document.querySelector("#authModal")?.addEventListener("click", (event) => {
    if (event.target?.id === "authModal") restoreAuthForm();
  });
  switchButton.addEventListener("click", restoreAuthForm, { capture:true });
  switchButton.addEventListener("click", () => queueMicrotask(syncPasswordAutocomplete));

  form.addEventListener("submit", async (event) => {
    const modal = document.querySelector("#authModal");
    const mode = modal?.dataset.mode || "signin";
    if (mode === "signup") {
      const verdict = validateNewPassword(document.querySelector("#authPassword")?.value || "");
      if (!verdict.valid) {
        event.preventDefault();
        event.stopImmediatePropagation();
        toast(verdict.message);
      }
      return;
    }
    if (mode !== "recovery") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const email = String(document.querySelector("#authEmail")?.value || "").trim();
    const submit = document.querySelector("#authSubmit");
    if (!email) return toast("Enter your email address.");
    submit.disabled = true;
    submit.textContent = "SENDING…";
    try {
      await requestPasswordReset(email, window.location.origin);
      toast("If an account exists for that email, a reset link has been sent.", true);
      restoreAuthForm();
    } catch (error) {
      toast(error?.message || "Could not request a password reset.");
    } finally {
      submit.disabled = false;
      if (modal.dataset.mode === "recovery") submit.textContent = "SEND RESET LINK";
    }
  }, { capture:true });
}

async function bootstrapAuthRedirect() {
  if (!window.location.hash) return;
  try {
    const result = await consumeAuthRedirect();
    if (!result) return;
    if (result.type === "recovery") {
      sessionStorage.setItem(RECOVERY_FLAG, "1");
      window.location.replace("/reset-password");
      return;
    }
    sessionStorage.setItem("trainsync:auth-message", "Email confirmed. You are signed in.");
    window.location.reload();
  } catch (error) {
    sessionStorage.setItem("trainsync:auth-message", error?.message || "Authentication link could not be completed.");
    window.location.reload();
  }
}

installRecoveryUi();
const authMessage = sessionStorage.getItem("trainsync:auth-message");
if (authMessage) {
  sessionStorage.removeItem("trainsync:auth-message");
  setTimeout(() => toast(authMessage, /confirmed|signed in/i.test(authMessage)), 0);
}
bootstrapAuthRedirect();
