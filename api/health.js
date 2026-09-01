import { getMockConnectionStatus } from "../lib/mock-garmin.mjs";
import { methodNotAllowed } from "../lib/http.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  return res.status(200).json({ ok: true, app: "TrainSync AI", garmin: getMockConnectionStatus() });
}
