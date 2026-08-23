# Garmin provider architecture

TrainSync treats Garmin publishing as a replaceable server-side provider boundary.

## Contract

`TrainSync workout -> deterministic validation -> Garmin FIT projection -> Garmin provider -> Garmin Connect`

The current production-safe default is `mock`. The `official` provider mode is intentionally unavailable until an approved Garmin Connect Developer Program integration can supply the real authenticated transport.

The provider layer must never silently fall back from `official` to `mock`.

## Official Garmin constraints

The public Garmin Connect Developer Program documentation describes the Training API as a REST, cloud-to-cloud integration that publishes workouts/training plans to Garmin Connect after end-user consent. Garmin Connect then handles sync to compatible devices. Approved integrations are tested against a throttled production environment.

Public references:
- https://developer.garmin.com/gc-developer-program/training-api/
- https://developer.garmin.com/gc-developer-program/overview/
- https://developer.garmin.com/fit/file-types/workout/
- https://developer.garmin.com/fit/cookbook/encoding-workout-files/

## Provider rules

1. Mock mode is explicit and must report that no Garmin account is modified.
2. Official mode requires an injected authenticated transport. No undocumented endpoint or authentication scheme is hard-coded before Garmin grants access.
3. Every publish starts from the canonical TrainSync workout and deterministic Garmin FIT projection.
4. Provider-specific code may not rewrite canonical exercise identity.
5. A workout requiring unresolved provider policy (for example a rep range that cannot be represented as one exact FIT `REPS` value) is blocked rather than silently collapsed.
6. Unknown exercises are never fuzzy-mapped.
7. Publish calls use a stable TrainSync idempotency key (`workout id + revision`).
8. Official transport responses are normalized before they reach the application.

## Future official transport

Once Garmin grants Training API documentation/credentials, implement a transport object with:

```js
await transport.publishWorkout({
  workout,
  projection,
  idempotencyKey,
  userContext,
});
```

The transport owns Garmin-specific OAuth/consent tokens, request URLs, HTTP serialization and response parsing. The provider owns TrainSync validation, projection-readiness checks, idempotency semantics, status normalization and error taxonomy.
