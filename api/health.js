import { getMockConnectionStatus } from "../lib/mock-garmin.mjs";

export default async function handler(_req, res) {
  return res.status(200).json({ ok: true, app: "TrainSync AI", garmin: getMockConnectionStatus() });
}
