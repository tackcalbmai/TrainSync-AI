import generateHandler from "../lib/generate-handler.mjs";
import { withAiGenerationRateLimit } from "../lib/ai-rate-limit-handler.mjs";

export default withAiGenerationRateLimit(generateHandler, {
  policy:"workout_generation",
  shouldLimit:(req) => req.body?.demo !== true && typeof req.body?.intent === "string" && Boolean(req.body.intent.trim()),
});
