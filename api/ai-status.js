export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  res.setHeader("Cache-Control", "no-store");
  const apiKey = process.env.OPENAI_API_KEY || process.env.openai_api_key || process.env.oepnai_api_key;
  return res.status(200).json({
    configured: Boolean(apiKey),
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    provider: "openai"
  });
}
