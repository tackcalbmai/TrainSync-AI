export function parseSupabaseAuthFragment(fragment = "") {
  const raw = String(fragment || "").replace(/^#/, "").trim();
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const errorCode = params.get("error_code") || params.get("error");
  if (errorCode) {
    return {
      error:true,
      errorCode,
      errorDescription:params.get("error_description") || "Authentication link could not be completed.",
    };
  }
  const accessToken = params.get("access_token");
  if (!accessToken) return null;
  const expiresInRaw = Number(params.get("expires_in"));
  return {
    error:false,
    accessToken,
    refreshToken:params.get("refresh_token") || null,
    tokenType:params.get("token_type") || "bearer",
    expiresIn:Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? expiresInRaw : null,
    type:params.get("type") || null,
  };
}

export function cleanAuthFragmentUrl(locationLike = {}) {
  const pathname = String(locationLike.pathname || "/");
  const search = String(locationLike.search || "");
  return `${pathname}${search}`;
}

const AUTHENTICATED_APP_PATHS = new Set(["/program", "/history", "/progress", "/profile", "/integrations"]);

export function safeAuthenticatedAppPath(value, fallback = "/") {
  const path = String(value || "").trim();
  return AUTHENTICATED_APP_PATHS.has(path) ? path : fallback;
}

export function signInRedirectUrl(nextPath = "/") {
  const next = safeAuthenticatedAppPath(nextPath);
  return `/?auth=signin&next=${encodeURIComponent(next)}`;
}
