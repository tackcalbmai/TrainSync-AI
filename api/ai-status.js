export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  res.setHeader("Cache-Control", "no-store");
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_APY_KEY || process.env.openai_api_key || process.env.oepnai_api_key;
  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";

  let reachable = false;
  let openaiStatus = null;
  if (apiKey) {
    try {
      const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000)
      });
      openaiStatus = response.status;
      reachable = response.ok;
    } catch {
      openaiStatus = 0;
    }
  }

  return res.status(200).json({
    configured: Boolean(apiKey),
    reachable,
    openaiStatus,
    model,
    provider: "openai"
  });
}
