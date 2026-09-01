# TrainSync AI

Strength-first AI workout control system for Garmin Connect.

## What works in v0.1

- installable mobile-first PWA;
- premium dark strength-training UI;
- natural-language strength workout generation for push, pull, upper, lower and full-body sessions;
- canonical exercise → sets → reps → rest structure;
- deterministic validation;
- deterministic Garmin FIT projection checks with explicit `MOCK` status;
- API endpoints for generation, validation and provider-boundary testing;
- ChatGPT MCP server scaffold with focused tools;
- live Supabase email/password auth and per-user workout persistence with RLS;
- production-ready private Garmin token storage boundary for the later OAuth phase.

**Important:** v0.1 does not modify a real Garmin account. Garmin production integration is deliberately blocked behind the provider adapter until official Garmin Developer Program credentials are approved.

## Run the verified local MVP

```bash
node server.mjs
```

Open `http://localhost:3000`.

Run checks:

```bash
npm test
npm run check
```

## ChatGPT MCP endpoint

The authenticated MCP endpoint is deployed at `/mcp` and shares the root lockfile and production API runtime. It can create, list and validate canonical TrainSync workout drafts. It cannot publish or schedule workouts to Garmin while official Garmin access is unavailable. `MOCK` means projection testing only, not a connected Garmin account.

## Production path

1. Supabase project is provisioned and the initial schema is applied.
2. Web app auth and workout persistence are live against Supabase.
3. Add MCP user auth and durable server-side tool persistence.
4. Submit Garmin Connect Developer Program application for Training API access.
5. Implement `GarminTrainingProvider` using only the approved Garmin API reference.
6. Deploy web/API/MCP endpoints to a stable HTTPS host.
7. Add Activity API context and subscriptions only after the publish path is proven.

## Visual system

Near-black `#090B0D`, graphite surfaces, soft white type, restrained acid-lime `#C8FF35` accent. The UI is deliberately closer to premium strength equipment and performance instrumentation than a generic fitness tracker.
