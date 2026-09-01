export function methodNotAllowed(res, methods) {
  const allow = [...new Set(methods.map((method) => String(method).toUpperCase()))].join(", ");
  if (typeof res.setHeader === "function") res.setHeader("Allow", allow);
  return res.status(405).json({ error:"METHOD_NOT_ALLOWED" });
}

export function publicErrorMessage(error, fallback) {
  const status = Number(error?.status);
  if (status >= 400 && status < 500 && error?.message) return String(error.message).slice(0, 300);
  return fallback;
}

export function publicErrorDetails(error) {
  const status = Number(error?.status);
  return status >= 400 && status < 500 ? (error?.details ?? null) : null;
}
