# ChatGPT tool surface

The authenticated production MCP server exposes four focused tools:

- `get_connection_status` — read-only status that explicitly reports `MOCK`, `connected: false` and official publishing unavailable.
- `create_workout_draft` — creates and persists a workout using canonical TrainSync exercise keys and server-owned exercise metadata.
- `validate_workout` — deterministic canonical-workout validation and future projection warnings.
- `list_workouts` — reads workouts saved for the authenticated TrainSync user.

There is no Garmin publish tool. Garmin has not granted the project official Training API access, and a mock projection must never be presented as a send, publish or schedule operation. Exact-target workouts can be evaluated by the internal projection layer; ranges remain device-verification-required until a provider policy is validated.

The old unauthenticated local MCP scaffold was removed because it used a separate in-memory contract, accepted arbitrary exercise names and exposed a misleading mock publish action. The Vercel `/mcp` function is the only MCP implementation.

References:
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/plan/tools
