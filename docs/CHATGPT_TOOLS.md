# ChatGPT tool surface

The first MCP server exposes five focused tools:

- `get_connection_status` — read-only Garmin/provider state.
- `create_workout_draft` — creates a strength workout draft from natural language.
- `validate_workout` — deterministic validation before external writes.
- `publish_workout` — external write; only for explicit send/publish/schedule intent.
- `list_workouts` — reads workouts created in the current MVP session.

Current OpenAI plugin documentation recommends one distinct action per tool, explicit schemas, useful structured results and accurate MCP safety annotations. Production publishing is therefore marked `openWorldHint: true`; read-only tools are marked `readOnlyHint: true`.

References:
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/plan/tools
