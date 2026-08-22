import { validateWorkout } from "../lib/workout.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  return res.status(200).json(validateWorkout(req.body?.workout));
}
