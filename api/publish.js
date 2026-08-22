import { publishWorkoutMock } from "../lib/mock-garmin.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  try {
    const result = publishWorkoutMock(req.body?.workout);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({
      success: false,
      code: error.code || "GARMIN_API_ERROR",
      message: error.message,
      details: error.details || [],
    });
  }
}
