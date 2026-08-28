import { getExerciseDefinition } from "./exercise-catalog.mjs";
import { sessionDose } from "./programming-engine.mjs";

export const MISSED_SESSION_POLICY_VERSION = "2026-08-28.2";
const MUTABLE_SESSION_STATUSES = new Set(["planned", "generated"]);
const OCCUPIED_SESSION_STATUSES = new Set(["planned", "generated", "completed"]);
const LIMITING_FATIGUE_TAGS = new Set(["grip", "spinal_bracing", "core_bracing", "hinge", "shoulder_girdle_stability"]);
const SUBSTANTIAL_DIRECT_SETS = 3;

function arr(value) { return Array.isArray(value) ? value : []; }
function isoDate(value) { const raw = String(value || "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null; }
function dateMs(value) { const iso = isoDate(value); return iso ? Date.parse(`${iso}T12:00:00Z`) : NaN; }
function addDays(value, days) { const ms = dateMs(value); if (!Number.isFinite(ms)) return null; return new Date(ms + Number(days) * 86400000).toISOString().slice(0, 10); }
function dayGap(a, b) { const x = dateMs(a), y = dateMs(b); return Number.isFinite(x) && Number.isFinite(y) ? Math.round(Math.abs(x - y) / 86400000) : Infinity; }
function exerciseMeta(exercise) { return getExerciseDefinition(exercise?.exerciseKey || exercise?.name) || exercise || {}; }

function sessionFootprint(session) {
  const exercises = arr(session?.payload?.exercises);
  let direct = {};
  try { direct = sessionDose({ payload:{ exercises } })?.muscles?.direct || {}; } catch { direct = {}; }
  const fatigue = new Set();
  let strengthPriority = false;
  for (const exercise of exercises) {
    const meta = exerciseMeta(exercise);
    for (const tag of arr(meta.fatigueTags ?? meta.fatigue_tags)) if (LIMITING_FATIGUE_TAGS.has(tag)) fatigue.add(tag);
    if (String(exercise?.role || "").toLowerCase().includes("strength")) strengthPriority = true;
  }
  return { direct, fatigue:[...fatigue], strengthPriority };
}
function sharedSubstantialDirect(left, right) {
  const muscles = new Set([...Object.keys(left.direct || {}), ...Object.keys(right.direct || {})]);
  return [...muscles].filter((muscle) => Number(left.direct?.[muscle] || 0) >= SUBSTANTIAL_DIRECT_SETS && Number(right.direct?.[muscle] || 0) >= SUBSTANTIAL_DIRECT_SETS);
}
function sharedValues(left = [], right = []) { const b = new Set(right); return [...new Set(left)].filter((value) => b.has(value)); }

export function findMissedProgramSessions(sessions = [], todayIso) {
  const today = isoDate(todayIso);
  if (!today) throw new Error("TODAY_ISO_REQUIRED");
  return arr(sessions)
    .filter((session) => MUTABLE_SESSION_STATUSES.has(String(session?.status || "")) && isoDate(session?.scheduled_date) && session.scheduled_date < today)
    .sort((a, b) => String(a.scheduled_date).localeCompare(String(b.scheduled_date)) || Number(a.day_index || 0) - Number(b.day_index || 0));
}

export function assessMissedSessionMove({ missedSession, candidateDate, sessions = [], todayIso = null } = {}) {
  const date = isoDate(candidateDate);
  const today = todayIso == null ? null : isoDate(todayIso);
  if (!missedSession?.id || !date) return { allowed:false, reasonCode:"MOVE_CONTEXT_REQUIRED", warnings:[] };
  if (today && date < today) return { allowed:false, reasonCode:"MOVE_DATE_IN_PAST", warnings:[] };
  const others = arr(sessions).filter((session) => session?.id !== missedSession.id && OCCUPIED_SESSION_STATUSES.has(String(session?.status || "")) && isoDate(session?.scheduled_date));
  if (others.some((session) => session.scheduled_date === date)) return { allowed:false, reasonCode:"SESSION_ALREADY_SCHEDULED_ON_DATE", warnings:[] };

  const missedFootprint = sessionFootprint(missedSession);
  const warnings = [];
  for (const other of others) {
    if (dayGap(date, other.scheduled_date) !== 1) continue;
    const otherFootprint = sessionFootprint(other);
    const sharedDirect = sharedSubstantialDirect(missedFootprint, otherFootprint);
    if (sharedDirect.length) {
      return { allowed:false, reasonCode:"ADJACENT_HIGH_DIRECT_OVERLAP", conflictSessionId:other.id, conflictDate:other.scheduled_date, sharedPrimary:sharedDirect, warnings };
    }
    const sharedFatigue = sharedValues(missedFootprint.fatigue, otherFootprint.fatigue);
    if (sharedFatigue.length && (missedFootprint.strengthPriority || otherFootprint.strengthPriority)) warnings.push({ code:"ADJACENT_SHARED_FATIGUE", sessionId:other.id, date:other.scheduled_date, tags:sharedFatigue });
    else warnings.push({ code:"ADJACENT_SESSION", sessionId:other.id, date:other.scheduled_date });
  }
  return { allowed:true, reasonCode:warnings.length ? "MOVE_ALLOWED_WITH_ADJACENCY_CAUTION" : "MOVE_ALLOWED", warnings, policyVersion:MISSED_SESSION_POLICY_VERSION };
}

export function missedSessionOptions({ missedSession, sessions = [], todayIso, maxSearchDays = 3 } = {}) {
  const today = isoDate(todayIso);
  if (!today || !missedSession?.id) throw new Error("MISSED_SESSION_CONTEXT_REQUIRED");
  if (!MUTABLE_SESSION_STATUSES.has(String(missedSession.status || "")) || !isoDate(missedSession.scheduled_date) || missedSession.scheduled_date >= today) {
    return { missed:false, moveOptions:[], skipAllowed:false, reasonCode:"SESSION_NOT_MISSED", policyVersion:MISSED_SESSION_POLICY_VERSION };
  }
  const future = arr(sessions)
    .filter((session) => session?.id !== missedSession.id && MUTABLE_SESSION_STATUSES.has(String(session?.status || "")) && isoDate(session.scheduled_date) && session.scheduled_date >= today)
    .sort((a, b) => String(a.scheduled_date).localeCompare(String(b.scheduled_date)));
  const nextFuture = future[0]?.scheduled_date || null;
  const dates = [];
  for (let offset = 0; offset <= Math.max(0, Math.min(7, Number(maxSearchDays) || 3)); offset += 1) {
    const candidate = addDays(today, offset);
    if (nextFuture && candidate >= nextFuture) break;
    dates.push(candidate);
  }
  const moveOptions = dates
    .map((candidateDate) => ({ candidateDate, ...assessMissedSessionMove({ missedSession, candidateDate, sessions, todayIso:today }) }))
    .filter((item) => item.allowed);
  return {
    missed:true,
    missedSessionId:missedSession.id,
    originalDate:missedSession.scheduled_date,
    nextScheduledDate:nextFuture,
    moveOptions,
    skipAllowed:true,
    catchUpVolume:false,
    reasonCode:moveOptions.length ? "MISSED_SESSION_OPTIONS_AVAILABLE" : "NO_SAFE_AUTOMATIC_MOVE_BEFORE_NEXT_SESSION",
    policyVersion:MISSED_SESSION_POLICY_VERSION,
  };
}

export function missedSessionResolutionAudit({ missedSession, action, movedTo = null, assessment = null } = {}) {
  if (!missedSession?.id) throw new Error("MISSED_SESSION_REQUIRED");
  const common = {
    adjustment_type:"schedule",
    evidence_level:"heuristic",
    science_version:`schedule:${MISSED_SESSION_POLICY_VERSION}`,
    evidence_claim_ids:["hypertrophy_frequency_is_distribution_tool"],
    evidence_rule_keys:[],
    decision_confidence:1,
    decision_source:"manual",
  };
  if (action === "skip") return {
    ...common,
    reason_code:"MISSED_SESSION_SKIPPED",
    reason_text:"A missed session was skipped and the remaining program continues without automatically adding catch-up volume.",
    before_state:{ scheduledDate:missedSession.scheduled_date, status:missedSession.status },
    after_state:{ scheduledDate:missedSession.scheduled_date, status:"skipped" },
    metrics_snapshot:{ catchUpVolume:false },
  };
  if (action === "move" && isoDate(movedTo) && assessment?.allowed) return {
    ...common,
    reason_code:"MISSED_SESSION_MOVED",
    reason_text:"The missed session was moved to a user-confirmed date after deterministic spacing checks; no other session or weekly volume was automatically changed.",
    before_state:{ scheduledDate:missedSession.scheduled_date, status:missedSession.status },
    after_state:{ scheduledDate:movedTo, status:missedSession.status },
    metrics_snapshot:{ catchUpVolume:false, warnings:arr(assessment.warnings) },
  };
  throw new Error("MISSED_SESSION_RESOLUTION_INVALID");
}
