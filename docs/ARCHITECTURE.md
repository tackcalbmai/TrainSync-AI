# TrainSync AI architecture

## Product boundary

TrainSync AI is a strength-first control layer. ChatGPT interprets the user's intent; deterministic backend code validates, stores, maps, and publishes the workout.

## Data flow

`ChatGPT → MCP tool → canonical workout → validator → TrainingProvider → Garmin Training API → Garmin Connect → compatible Garmin device`

The MVP uses `MockTrainingProvider`, so the complete flow can be tested without Garmin credentials.

## Canonical model

A workout owns metadata plus ordered exercises. Each exercise owns ordered sets with target reps, optional weight and rest duration. Garmin-specific exercise identifiers are intentionally absent from the AI-facing schema and are resolved inside the provider adapter.

## Provider boundary

The production adapter must expose the same domain operations as the mock provider. Garmin HTTP calls, OAuth tokens, exercise mapping and Garmin-specific validation stay inside the Garmin integration module.

## Persistence

Supabase stores athlete profiles, canonical workouts and publication attempts. Garmin OAuth credentials belong in an unexposed `private` schema and must be encrypted before persistence.

## Current MVP

The browser PWA and local API are dependency-free and runnable with Node 22. The MCP server is a separate process using the official MCP SDK and Zod. This keeps the first vertical slice testable before production infrastructure is provisioned.
