import { runProgramAdaptation } from "../lib/adaptation-service.mjs";

const SUPABASE_URL = "https://sjihbrpbhfttuyzmbfku.supabase.co";
const SUPABASE_KEY = "sb_publishable_bdSY8_XqGMnc5BylaWLROw_8ObfQkwI";
function bearer(req) { const match = /^Bearer\s+(.+)$/i.exec(req.headers?.authorization || ""); return match?.[1] || null; }
async function authenticate(token) {
  if (!token) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers:{ apikey:SUPABASE_KEY, Authorization:`Bearer ${token}` }, signal:AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const user = await response.json();
    return user?.id ? user : null;
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error:"METHOD_NOT_ALLOWED" });
  const token = bearer(req);
  const user = await authenticate(token);
  if (!user) return res.status(401).json({ error:"SIGN_IN_REQUIRED" });
  const workoutSessionId = String(req.body?.workoutSessionId || "").trim();
  if (!workoutSessionId) return res.status(400).json({ error:"WORKOUT_SESSION_REQUIRED" });
  try {
    const result = await runProgramAdaptation({ token, userId:user.id, workoutSessionId, apply:req.body?.dryRun !== true });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ error:"ADAPTATION_FAILED", message:error.message || "Adaptation failed." });
  }
}
