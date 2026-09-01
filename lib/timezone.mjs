export function browserTimezone(fallback = "UTC") {
  try {
    return normalizeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone, fallback);
  } catch {
    return fallback;
  }
}

export function normalizeTimezone(value, fallback = "UTC") {
  const timezone = String(value || fallback).trim() || fallback;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date(0));
  } catch {
    const error = new Error("Choose a valid timezone, for example Europe/Riga.");
    error.code = "TIMEZONE_INVALID";
    throw error;
  }
  return timezone;
}

export function normalizeSessionMinutes(value, { min = 15, max = 180 } = {}) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || minutes < min || minutes > max) {
    const error = new Error(`Session length must be a whole number from ${min} to ${max} minutes.`);
    error.code = "SESSION_MINUTES_INVALID";
    throw error;
  }
  return minutes;
}
