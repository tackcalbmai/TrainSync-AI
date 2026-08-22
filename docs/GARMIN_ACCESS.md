# Garmin Developer access

TrainSync AI requires the Garmin Connect Developer Program **Training API** for production publishing.

Public Garmin documentation states that the Training API can publish workouts and training plans to the Garmin Connect calendar; users can then sync that data to compatible Garmin devices. Garmin Connect handles the device interaction after publication.

Garmin also states that Developer Program APIs use OAuth 2.0 and that the Developer Program is intended for business/enterprise use. Approval is required before production-throttled integration testing is available.

Official references:

- https://developer.garmin.com/gc-developer-program/training-api/
- https://developer.garmin.com/gc-developer-program/program-faq/
- https://developer.garmin.com/gc-developer-program/overview/

## Request these APIs

1. Training API — required for structured workouts and training plans.
2. Activity API — recommended later for completed strength-session context.
3. Health API — optional; not required for workout publishing.

## Suggested Garmin application description

> TrainSync AI is an AI-assisted strength training platform that allows authenticated users to create structured strength workouts conversationally and publish those workouts to their Garmin Connect calendars. With separate user consent, future versions may use authorized historical activity data to improve workout recommendations.

## Environment variables

`GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, `GARMIN_REDIRECT_URI`, and `TOKEN_ENCRYPTION_KEY` are placeholders until Garmin grants portal access and documents the approved application's exact credentials/scopes.

Never invent endpoint paths, scopes or exercise identifiers before the approved Garmin API reference is available.
