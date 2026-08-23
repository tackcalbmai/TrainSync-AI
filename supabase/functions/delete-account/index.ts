const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: "SIGN_IN_REQUIRED" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceRole;
  if (!supabaseUrl || !serviceRole || !publicKey) {
    return json(500, { error: "SERVER_AUTH_CONFIGURATION_MISSING" });
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publicKey, Authorization: `Bearer ${token}` },
    });
    if (!userResponse.ok) return json(401, { error: "SESSION_INVALID" });
    const user = await userResponse.json();
    if (!user?.id) return json(401, { error: "SESSION_INVALID" });

    const deleteResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: "DELETE",
      headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
    });
    if (!deleteResponse.ok) {
      const detail = await deleteResponse.text();
      console.error("delete-account admin delete failed", deleteResponse.status, detail);
      return json(502, { error: "ACCOUNT_DELETE_FAILED" });
    }

    return json(200, { deleted: true });
  } catch (error) {
    console.error("delete-account unexpected error", error);
    return json(500, { error: "ACCOUNT_DELETE_FAILED" });
  }
});
