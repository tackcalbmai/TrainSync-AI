import { currentUser, deleteCurrentUser, signIn } from "./lib/supabase-client.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[char]));
}

function toast(message, success = false) {
  const node = document.querySelector("#toast");
  if (!node) return;
  node.textContent = message;
  node.className = `toast show${success ? " success" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.className = "toast"; }, 4200);
}

function mountAccountSecurity() {
  const main = document.querySelector(".profile-main");
  const user = currentUser();
  if (!main || !user?.id || document.querySelector("#accountSecurityCard")) return;
  const email = String(user.email || "").trim();
  const section = document.createElement("section");
  section.className = "profile-card account-security-card";
  section.id = "accountSecurityCard";
  section.innerHTML = `
    <div class="profile-card-head">
      <div><div class="eyebrow subtle">ACCOUNT SECURITY</div><h2>Delete account</h2></div>
      <span class="security-danger-pill">IRREVERSIBLE</span>
    </div>
    <div class="security-copy">
      <p>Deletes your TrainSync account and the training data tied to it. This cannot be undone.</p>
      <small>Signed in as ${escapeHtml(email || "this account")}. Enter your current password and type <b>DELETE</b> to confirm.</small>
    </div>
    <form id="deleteAccountForm" class="delete-account-form">
      <label>Current password<input id="deletePassword" type="password" autocomplete="current-password" required></label>
      <label>Confirmation<input id="deleteConfirmation" type="text" autocomplete="off" placeholder="Type DELETE" required></label>
      <button id="deleteAccountButton" type="submit" disabled>DELETE ACCOUNT</button>
    </form>`;
  main.append(section);

  const form = section.querySelector("#deleteAccountForm");
  const password = section.querySelector("#deletePassword");
  const confirmation = section.querySelector("#deleteConfirmation");
  const button = section.querySelector("#deleteAccountButton");
  const syncButtonState = () => { button.disabled = !password.value || confirmation.value.trim() !== "DELETE"; };
  password.addEventListener("input", syncButtonState);
  confirmation.addEventListener("input", syncButtonState);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const originalUserId = currentUser()?.id;
    const accountEmail = String(currentUser()?.email || email).trim();
    if (!originalUserId || !accountEmail) return toast("Could not verify the signed-in account.");
    if (confirmation.value.trim() !== "DELETE") return toast("Type DELETE exactly to confirm.");
    button.disabled = true;
    button.textContent = "VERIFYING…";
    try {
      const reauthenticated = await signIn(accountEmail, password.value);
      if (reauthenticated?.user?.id !== originalUserId) throw new Error("ACCOUNT_REAUTHENTICATION_MISMATCH");
      button.textContent = "DELETING…";
      await deleteCurrentUser();
      localStorage.removeItem("trainsync:lastWorkout");
      sessionStorage.clear();
      window.location.replace("/");
    } catch (error) {
      toast(error?.message || "Account deletion failed.");
      password.value = "";
      button.textContent = "DELETE ACCOUNT";
      syncButtonState();
    }
  });
}

mountAccountSecurity();
