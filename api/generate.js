import { createWorkoutFromIntent, validateWorkout, workoutSummary } from "../lib/workout.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  const intent = req.body?.intent;
  if (!intent || typeof intent !== "string") return res.status(400).json({ error: "INTENT_REQUIRED" });
  const workout = createWorkoutFromIntent(intent, { timezone: req.body?.timezone || "Europe/Riga" });
  const validation = validateWorkout(workout);
  return res.status(200).json({ workout, validation, summary: workoutSummary(workout) });
}
