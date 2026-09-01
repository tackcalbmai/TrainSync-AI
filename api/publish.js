import {
  garminProviderStatus,
  publishWorkoutWithGarminProvider,
  resolveGarminProviderMode,
} from "../lib/garmin-provider.mjs";
import { methodNotAllowed, publicErrorDetails, publicErrorMessage } from "../lib/http.mjs";

const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";

function bearer(req) {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers?.authorization || "");
  return match?.[1] || null;
}

async function authenticate(token) {
  if (!token) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers:{ apikey:SUPABASE_KEY, Authorization:`Bearer ${token}` },
      signal:AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

function providerMode() {
  return resolveGarminProviderMode(process.env.GARMIN_PROVIDER_MODE || "mock");
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return methodNotAllowed(res, ["GET", "POST"]);
  try {
    const mode = providerMode();
    const token = bearer(req);
    const user = token ? await authenticate(token) : null;
    const userContext = user ? { userId:user.id } : null;

    if (req.method === "GET") {
      const status = await garminProviderStatus({ mode, userContext });
      return res.status(200).json(status);
    }

    if (mode === "official" && !user) {
      return res.status(401).json({
        success:false,
        code:"SIGN_IN_REQUIRED",
        message:"Sign in before publishing to an official Garmin account.",
      });
    }

    const result = await publishWorkoutWithGarminProvider(req.body?.workout, { mode, userContext });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(Number(error.status) || 400).json({
      success:false,
      code:error.code || "GARMIN_API_ERROR",
      message:publicErrorMessage(error, "Garmin publication failed."),
      details:publicErrorDetails(error),
    });
  }
}
