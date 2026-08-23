import { garminFitProjectionReadiness } from "../lib/garmin-workout-projection.mjs";
import { validateWorkout } from "../lib/workout.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error:"METHOD_NOT_ALLOWED" });
  const workout = req.body?.workout;
  const validation = validateWorkout(workout);
  const garmin = garminFitProjectionReadiness(workout);
  return res.status(200).json({ ...validation, garmin });
}
