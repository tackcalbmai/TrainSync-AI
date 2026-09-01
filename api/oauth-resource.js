const RESOURCE = "https://trainsyncai.vercel.app/mcp";
const AUTHORIZATION_SERVER = "https://sjihbrpbhfttuyzmbfku.supabase.co/auth/v1";
import { methodNotAllowed } from "../lib/http.mjs";

export default function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    resource: RESOURCE,
    resource_name: "TrainSync AI",
    authorization_servers: [AUTHORIZATION_SERVER],
    scopes_supported: ["email"],
    bearer_methods_supported: ["header"],
  });
}
