const SUPABASE_AUTH_BASE = "https://sjihbrpbhfttuyzmbfku.supabase.co/auth/v1";
const DISCOVERY_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co/.well-known/oauth-authorization-server/auth/v1";
import { methodNotAllowed } from "../lib/http.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    const response = await fetch(DISCOVERY_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    const body = await response.text();
    let metadata = null;
    try { metadata = body ? JSON.parse(body) : null; } catch {}

    res.status(200).json({
      oauthServerEnabled: response.ok,
      discoveryStatus: response.status,
      issuer: metadata?.issuer || null,
      authorizationEndpoint: metadata?.authorization_endpoint || null,
      tokenEndpoint: metadata?.token_endpoint || null,
      registrationEndpoint: metadata?.registration_endpoint || null,
      dynamicRegistrationAvailable: Boolean(metadata?.registration_endpoint),
      expectedAuthorizationServer: SUPABASE_AUTH_BASE,
    });
  } catch (error) {
    res.status(200).json({
      oauthServerEnabled: false,
      discoveryStatus: null,
      error: error?.name || "DISCOVERY_FAILED",
      expectedAuthorizationServer: SUPABASE_AUTH_BASE,
    });
  }
}
