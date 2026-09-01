import { currentUser, getProfile, saveProfile, signOut } from "./lib/supabase-client.js";
import { browserTimezone, normalizeSessionMinutes, normalizeTimezone } from "./lib/timezone.mjs";
import { signInRedirectUrl } from "./lib/auth-redirect.mjs";

const $ = (selector) => document.querySelector(selector);
const toast = $("#toast");

function showToast(message, success = false) {
  toast.textContent = message;
  toast.className = `toast show${success ? " success" : ""}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = "toast"; }, 3400);
}

function selectedEquipment() {
  return [...document.querySelectorAll('#equipmentGrid input[type="checkbox"]:checked')].map((input) => input.value);
}

function fillProfile(profile) {
  $("#profileGoal").value = profile?.goal || "";
  $("#profileExperience").value = profile?.experience_level || "";
  $("#profileMinutes").value = profile?.default_workout_minutes || 50;
  $("#profileUnits").value = profile?.units === "imperial" ? "imperial" : "metric";
  $("#profileTimezone").value = profile?.timezone || browserTimezone();
  const equipment = new Set(profile?.equipment || []);
  for (const input of document.querySelectorAll('#equipmentGrid input[type="checkbox"]')) input.checked = equipment.has(input.value);
}

async function loadProfile() {
  if (!currentUser()) {
    location.replace(signInRedirectUrl("/profile"));
    return;
  }
  try {
    const profile = await getProfile();
    fillProfile(profile);
    $("#profileState").textContent = profile?.goal || profile?.experience_level || profile?.equipment?.length ? "PERSONALIZED" : "DEFAULTS";
    $("#profileState").classList.add("ready");
  } catch (error) {
    $("#profileState").textContent = "SYNC ERROR";
    showToast(error.message);
  }
}

$("#profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#profileSave");
  button.disabled = true;
  $("#profileState").textContent = "SAVING…";
  try {
    const timezone = normalizeTimezone($("#profileTimezone").value, browserTimezone());
    const minutes = normalizeSessionMinutes($("#profileMinutes").value);
    await saveProfile({
      goal: $("#profileGoal").value || null,
      experience_level: $("#profileExperience").value || null,
      default_workout_minutes: minutes,
      units: $("#profileUnits").value,
      timezone,
      equipment: selectedEquipment(),
    });
    $("#profileState").textContent = "PERSONALIZED";
    $("#profileState").classList.add("ready");
    showToast("Athlete profile saved. AI context updated ✓", true);
  } catch (error) {
    $("#profileState").textContent = "SAVE FAILED";
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
});

$("#signOutButton").addEventListener("click", async () => {
  await signOut();
  location.replace("/");
});

loadProfile();
