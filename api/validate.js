import { garminFitProjectionReadiness } from "../lib/garmin-workout-projection.mjs";
import { validateWorkout } from "../lib/workout.mjs";
import { methodNotAllowed } from "../lib/http.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const workout = req.body?.workout;
  const validation = validateWorkout(workout);
  const garmin = garminFitProjectionReadiness(workout);
  return res.status(200).json({ ...validation, garmin });
}
