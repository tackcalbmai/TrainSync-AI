# TrainSync AI

Strength-first AI workout control system for Garmin Connect.

## What works in v0.1

- installable mobile-first PWA;
- premium dark strength-training UI;
- natural-language strength workout generation for push, pull, upper, lower and full-body sessions;
- canonical exercise → sets → reps → rest structure;
- deterministic validation;
- idempotent `MockTrainingProvider` publication;
- local API endpoints for generate / validate / publish;
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

## Run the ChatGPT MCP server

The MCP process uses the package versions shown in the current OpenAI plugin quickstart.

```bash
cd mcp
npm install
npm start
```

It exposes `http://localhost:8787/mcp` using Streamable HTTP. Connect it through ChatGPT developer mode after exposing it through HTTPS or deploying it.

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
