# TrainSync Scientific Framework

Version: `2026-08-23.1`

TrainSync must not treat an LLM, a single paper, a coach opinion, or a popular fitness convention as scientific ground truth. Scientific reasoning is implemented as a traceable chain:

`source -> claim -> programming rule -> user-specific decision -> observed result -> adaptation`

## 1. Outcomes first

Every programming decision must state what it is trying to improve. TrainSync currently distinguishes at least: maximal strength, hypertrophy, power, general fitness, time efficiency and adherence. A rule that is useful for one outcome is not automatically valid for another.

Examples:
- heavier loading has strong support for maximal-strength specificity;
- hypertrophy can occur across a much broader loading range;
- supersets can improve time efficiency but may be a worse choice for some priority strength work;
- exercise order matters more clearly for strength specificity than for hypertrophy.

## 2. Evidence hierarchy

Preferred order when building claims:
1. current position stands / consensus documents grounded in systematic evidence;
2. systematic reviews and meta-analyses;
3. randomized longitudinal training studies;
4. observational or non-randomized longitudinal evidence;
5. acute performance / biomechanics / measurement studies;
6. expert practice and product heuristics.

A lower-level source can refine implementation, but it should not overrule stronger convergent evidence without a clear reason.

## 3. Source registry

Each registered source records:
- title, year, PMID/DOI and stable PubMed URL;
- evidence type;
- study population;
- outcomes/scope;
- limitations relevant to product use.

The registry is version controlled in `lib/scientific-framework.mjs`.

## 4. Claim registry

TrainSync does not wire papers directly into algorithms. Papers support explicit claims.

Each claim records:
- a falsifiable plain-language statement;
- confidence (`high`, `moderate`, `emerging`, `heuristic`);
- target outcomes;
- source IDs;
- applicability limits.

Claims must preserve uncertainty. For example, the framework does **not** claim that:
- every athlete needs exactly 10 sets per muscle;
- every fourth week should be a deload;
- every hypertrophy set should reach failure;
- one split is inherently superior;
- one exact rest period is optimal for every exercise.

## 5. Rule bindings

Every deterministic rule in the programming engine must map to the scientific framework.

There are three implementation classes:
- `evidence_backed`: the rule closely reflects a supported claim;
- `evidence_informed_heuristic`: evidence supports the direction, but the exact threshold/implementation is a TrainSync guardrail;
- `product_heuristic`: primarily UX, scheduling, safety margin or engineering logic rather than a biological fact.

Example: evidence supports longer rest for preserving performance, but a fixed TrainSync minimum of `120 s` for priority strength work is still an implementation choice, not a universal physiological law.

The test suite fails if a programming-engine rule exists without a framework binding.

## 6. Population evidence -> individual adaptation

Population research defines the initial prior. It does not override repeated user-specific response.

Target model:

`evidence-based initial prescription -> Garmin/manual execution data -> repeated performance classification -> bounded adaptation`

A user who is progressing on a lower dose should not have volume increased merely to match a population average. A user whose performance repeatedly deteriorates should not be forced to maintain a population-level volume target.

## 7. Measurement uncertainty

No single signal is treated as ground truth.

Examples:
- RIR/RPE are useful but context dependent;
- e1RM is a trend estimate, not a laboratory measurement;
- Garmin activity fields can contain device/profile-specific limitations;
- one poor session is weak evidence for changing a multi-week program.

Adaptation decisions should combine multiple signals and repeated exposures whenever possible.

## 8. Explainability and auditability

A future production adjustment should be reconstructable from data, for example:

- decision: `increase_load`;
- trigger: top of prescribed rep range achieved across repeated exposures;
- observed effort: within target range;
- relevant claim/rule IDs;
- evidence version;
- before/after prescription;
- confidence;
- rejected alternatives when useful.

The LLM may explain the decision in natural language, but the underlying decision must be generated or validated by deterministic logic.

## 9. Scientific update protocol

When adding or changing a training feature:
1. define the user outcome and exact question;
2. search current high-level evidence first;
3. register sources and limitations;
4. create or update a claim;
5. classify confidence;
6. define implementation as evidence-backed or heuristic;
7. add tests that protect the nuance of the claim;
8. only then change production programming logic;
9. record a new science version when the meaning of a claim or rule materially changes.

New evidence should update claims, not silently patch scattered prompts.

## 10. Research backlog

The framework should be expanded systematically across:
- weekly and per-session volume;
- frequency and distribution of volume;
- load and rep-range specificity;
- proximity to failure and RIR/RPE accuracy;
- rest intervals;
- exercise order;
- exercise selection and variation;
- range of motion and long-muscle-length training;
- progression models and load increments;
- periodization;
- deloading and fatigue management;
- supersets and time-efficient methods;
- beginner vs trained populations;
- age and sex generalizability;
- adherence and preference;
- concurrent endurance + resistance training;
- power training;
- injury/medical boundaries (kept separate from healthy-adult performance guidance).

## 11. Current scientific stance

TrainSync optimizes for useful uncertainty, not fake precision. When the literature supports a direction but not an exact threshold, the UI and decision engine should behave accordingly. Scientific credibility is lost when an evidence-informed range is converted into a made-up universal number.
