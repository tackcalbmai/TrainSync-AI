# Garmin Developer access

TrainSync AI needs two official Garmin Connect Developer Program APIs for the complete production loop:

1. **Training API** — publish structured workouts/training plans to Garmin Connect so compatible devices can sync them.
2. **Activity API** — receive completed activities after the watch syncs to Garmin Connect and obtain the original activity data / FIT file for result ingestion.

The product must not depend on unofficial Garmin login endpoints or reverse-engineered private APIs.

Official references:

- https://developer.garmin.com/gc-developer-program/training-api/
- https://developer.garmin.com/gc-developer-program/activity-api/
- https://developer.garmin.com/gc-developer-program/program-faq/
- https://developer.garmin.com/gc-developer-program/overview/

## Target production loop

`TrainSync AI plan -> Training API -> Garmin Connect -> Garmin watch -> completed activity -> Activity API -> FIT ingestion -> workout_sessions/set_results -> Progress -> adaptive AI`

The FIT ingestion side is implemented independently of Garmin credentials. `@garmin/fitsdk` decodes activity files, TrainSync normalizes strength set messages, deduplicates activities, stores actual sets/reps/load, and conservatively matches a completed Garmin activity to a planned TrainSync workout.

A planned workout is only automatically marked `completed` when matching confidence is high enough. Otherwise the Garmin result is stored as an unlinked completed session so History/Progress are still updated without corrupting the plan state.

## Current access state

Garmin's new Developer Program applications are currently unavailable while the program is being updated. Until Garmin reopens access:

- workout publishing remains on `MockTrainingProvider`;
- automatic Activity API sync remains disabled;
- the production FIT ingestion pipeline can be tested with an authenticated manual `.fit` import at `/integrations`;
- manual `LOG SESSION` remains a fallback only.

## Request these APIs when access reopens

1. Training API — required for structured workout publishing.
2. Activity API — required for automatic completed-workout result collection.
3. Health API — optional; not required for the core strength workflow.

## Suggested Garmin application description

> TrainSync AI is an AI-assisted strength training platform that allows authenticated users to create structured strength workouts conversationally, publish those workouts to Garmin Connect, and—with separate user consent—ingest completed Garmin activity data to automatically record performed sets, repetitions and loads. The completed training history is used to show progress and improve future workout recommendations.

## Environment variables

`GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, `GARMIN_REDIRECT_URI`, and `TOKEN_ENCRYPTION_KEY` remain placeholders until Garmin grants portal access and documents the approved application's exact credentials/scopes.

Never invent endpoint paths, scopes or exercise identifiers before the approved Garmin API reference is available.
