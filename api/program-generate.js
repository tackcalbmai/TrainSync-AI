import programGenerateHandler from "../lib/program-generate-handler-v2.mjs";
import { withAiGenerationRateLimit } from "../lib/ai-rate-limit-handler.mjs";

export default withAiGenerationRateLimit(programGenerateHandler, {
  policy:"program_generation",
  shouldLimit:(req) => !Array.isArray(req.body?.availableDays) || req.body.availableDays.length > 0,
});
