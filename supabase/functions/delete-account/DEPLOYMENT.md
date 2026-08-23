# delete-account deployment contract

Deploy this Edge Function with gateway JWT verification disabled (`verify_jwt=false`). This is intentional so browser CORS preflight reaches the handler consistently.

The function itself is still authenticated: every POST must contain a Bearer token, and the handler validates that token against Supabase Auth (`/auth/v1/user`) before it performs any admin operation. Only the validated user's own `user.id` is passed to the server-side admin delete endpoint. `SUPABASE_SERVICE_ROLE_KEY` remains server-only.

Do not remove the in-handler Auth validation if deployment remains `verify_jwt=false`.
