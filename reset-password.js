import { consumeAuthRedirect, getSession, signOut, updatePassword } from "./lib/supabase-client.js";

const RECOVERY_FLAG = "trainsync:password-recovery";
const form = document.querySelector("#recoveryForm");
const state = document.querySelector("#recoveryState");
const submit = document.querySelector("#recoverySubmit");

function setState(message, ok = false) {
  state.textContent = message;
  state.className = `recovery-state${ok ? " ok" : ""}`;
}

async function establishRecoverySession() {
  if (window.location.hash) {
    try {
      const result = await consumeAuthRedirect();
      if (result?.type === "recovery") sessionStorage.setItem(RECOVERY_FLAG, "1");
    } catch (error) {
      setState(error?.message || "This recovery link is invalid or expired.");
      form.hidden = true;
      return false;
    }
  }
  const authorizedRecovery = sessionStorage.getItem(RECOVERY_FLAG) === "1";
  if (!authorizedRecovery || !getSession()?.access_token) {
    setState("Open this page from the password-reset link sent to your email.");
    form.hidden = true;
    return false;
  }
  return true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = String(document.querySelector("#newPassword")?.value || "");
  const confirmation = String(document.querySelector("#confirmPassword")?.value || "");
  if (password.length < 8) return setState("Use at least 8 characters for the new password.");
  if (password !== confirmation) return setState("The two passwords do not match.");
  submit.disabled = true;
  submit.textContent = "UPDATING…";
  try {
    await updatePassword(password);
    sessionStorage.removeItem(RECOVERY_FLAG);
    setState("Password updated. Signing you out securely…", true);
    await signOut();
    setTimeout(() => window.location.replace("/"), 900);
  } catch (error) {
    setState(error?.message || "Could not update the password.");
    submit.disabled = false;
    submit.textContent = "UPDATE PASSWORD";
  }
});

establishRecoverySession();
