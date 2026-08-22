import { currentUser, getProfile, listSetResults, listWorkoutSessions } from "./lib/supabase-client.js";
import { summarizeProgress } from "./lib/progress.mjs";

const $ = (selector) => document.querySelector(selector);
const KG_TO_LB = 2.2046226218;
let units = "metric";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = "toast show";
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = "toast"; }, 3400);
}

function displayWeight(kg, { compact = false } = {}) {
  const amount = Number(kg);
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  const converted = units === "imperial" ? amount * KG_TO_LB : amount;
  const suffix = units === "imperial" ? "lb" : "kg";
  if (compact && converted >= 1000) return `${(converted / 1000).toFixed(converted >= 10000 ? 0 : 1)}k`;
  return `${converted.toFixed(converted >= 100 ? 0 : 1)} ${suffix}`;
}

function renderWeeklyChart(weeks) {
  const chart = $("#weeklyChart");
  const max = Math.max(1, ...weeks.map((week) => Number(week.volumeKg) || 0));
  if (!weeks.some((week) => Number(week.volumeKg) > 0)) {
    chart.innerHTML = '<div class="empty-panel" style="width:100%;align-self:center"><strong>No volume data yet.</strong><p>Log weighted working sets to build the 8-week volume trend.</p></div>';
    return;
  }
  chart.innerHTML = weeks.map((week) => {
    const volume = Number(week.volumeKg) || 0;
    const height = Math.max(volume > 0 ? 5 : 2, Math.round((volume / max) * 100));
    const end = new Date(`${week.end}T12:00:00`);
    const label = new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(end);
    return `<div class="week-bar" title="${escapeHtml(displayWeight(volume))}"><span>${escapeHtml(displayWeight(volume, { compact: true }))}</span><i style="--height:${height}%"></i><strong>${escapeHtml(label)}</strong></div>`;
  }).join("");
}

function renderPrList(exercises) {
  const list = $("#prList");
  const rows = exercises.filter((row) => row.bestE1rmKg || row.bestWeightKg).slice(0, 6);
  if (!rows.length) {
    list.innerHTML = '<div class="history-empty">Weighted sets of 12 reps or fewer will create estimated 1RM records here.</div>';
    return;
  }
  list.innerHTML = rows.map((row) => `<div class="pr-row"><div><strong>${escapeHtml(row.name)}</strong><small>${row.sets} logged sets</small></div><div class="pr-value">${escapeHtml(displayWeight(row.bestE1rmKg || row.bestWeightKg))}<small>${row.bestE1rmKg ? "EST. 1RM" : "BEST LOAD"}</small></div></div>`).join("");
}

function renderExerciseRows(exercises) {
  const list = $("#exerciseProgressList");
  $("#exerciseCount").textContent = `${exercises.length} EXERCISES`;
  if (!exercises.length) {
    list.innerHTML = '<div class="empty-panel"><strong>No performance data yet.</strong><p>Once you complete sessions, each exercise will accumulate best load, estimated 1RM and 8-week change.</p><a href="/">BUILD A WORKOUT</a></div>';
    return;
  }
  list.innerHTML = exercises.map((row) => {
    const change = row.change56Pct;
    const changeClass = change > 0 ? "positive" : change < 0 ? "negative" : "";
    const changeLabel = change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
    return `<div class="exercise-progress-row">
      <div><strong>${escapeHtml(row.name)}</strong><small>${row.sets} sets · last ${escapeHtml(row.latestAt ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(row.latestAt)) : "—")}</small></div>
      <div class="number"><strong>${escapeHtml(displayWeight(row.bestE1rmKg || row.bestWeightKg))}</strong><small>${row.bestE1rmKg ? "EST. 1RM" : "BEST LOAD"}</small></div>
      <div class="number volume"><strong>${escapeHtml(displayWeight(row.volumeKg, { compact: true }))}</strong><small>TOTAL VOLUME</small></div>
      <div class="number change ${changeClass}"><strong>${escapeHtml(changeLabel)}</strong><small>8-WEEK CHANGE</small></div>
    </div>`;
  }).join("");
}

async function load() {
  if (!currentUser()) {
    location.replace("/");
    return;
  }
  try {
    const [profile, sessions, sets] = await Promise.all([getProfile(), listWorkoutSessions(500), listSetResults(5000)]);
    units = profile?.units === "imperial" ? "imperial" : "metric";
    const summary = summarizeProgress(sessions, sets);

    $("#progressVolume").textContent = displayWeight(summary.volume30Kg, { compact: true });
    $("#progressVolumeUnit").textContent = `${units === "imperial" ? "lb" : "kg"} moved`;
    $("#progressSessions").textContent = summary.sessions30;
    $("#progressPrs").textContent = summary.recentPrCount;
    const trend = summary.trendPct;
    $("#progressTrend").textContent = trend == null ? "—" : `${trend > 0 ? "+" : ""}${trend.toFixed(1)}%`;
    $("#progressTrend").style.color = trend > 0 ? "var(--accent)" : trend < 0 ? "var(--danger)" : "";
    $("#progressState").textContent = summary.hasData ? "LIVE METRICS" : "WAITING FOR DATA";
    $("#progressState").classList.add("ready");

    renderWeeklyChart(summary.weeklyVolume);
    renderPrList(summary.exercises);
    renderExerciseRows(summary.exercises);
  } catch (error) {
    $("#progressState").textContent = "SYNC ERROR";
    showToast(error.message || "Could not load progress.");
  }
}

load();
