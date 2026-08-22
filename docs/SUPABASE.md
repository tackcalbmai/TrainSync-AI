# Supabase integration

Project ref: `sjihbrpbhfttuyzmbfku`

## Current scope

- Email/password authentication through Supabase Auth.
- Per-user workout persistence in `public.workouts`.
- Publication audit rows in `public.publication_attempts`.
- Row Level Security on all browser-accessible tables.
- Browser uses a Supabase publishable key; no service-role or Garmin secrets are shipped to the client.

## Private schema

`private.garmin_connections` and `private.tool_audit_log` are reserved for the future server-side Garmin OAuth/tool layer. Browser roles have schema/table access revoked and the current web MVP does not query them. Before production Garmin OAuth, harden these tables with the final server access model and re-run Supabase security advisors.

## Migrations

- `0001_initial.sql` — app tables, RLS policies, private security boundary.
- `0002_add_lookup_indexes.sql` — lookup and foreign-key indexes.
