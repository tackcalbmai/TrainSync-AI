export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  res.setHeader("Cache-Control", "no-store");
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_APY_KEY || process.env.openai_api_key || process.env.oepnai_api_key;
  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";

  let reachable = false;
  let openaiStatus = null;
  let quotaError = null;
  if (apiKey) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ model, input: "Reply only OK", max_output_tokens: 4, store: false }),
        signal: AbortSignal.timeout(15000)
      });
      openaiStatus = response.status;
      reachable = response.ok;
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        quotaError = body?.error?.code || body?.error?.type || null;
      }
    } catch {
      openaiStatus = 0;
    }
  }

  return res.status(200).json({
    configured: Boolean(apiKey),
    reachable,
    openaiStatus,
    quotaError,
    model,
    provider: "openai"
  });
}
