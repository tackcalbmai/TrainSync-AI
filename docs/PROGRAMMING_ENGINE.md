# TrainSync AI — Evidence-Based Programming Engine

Last reviewed: 2026-08-22

## Purpose

TrainSync must not behave like a random workout generator. It should act as a constrained training-programming system that:

1. builds a multi-week plan from the athlete's goal, schedule, experience, equipment and preferences;
2. preserves exercise continuity long enough to measure adaptation;
3. distributes weekly stimulus intelligently across sessions;
4. adjusts load, reps, sets and exercise selection from actual completed performance;
5. distinguishes evidence-backed rules from lower-confidence heuristics;
6. explains meaningful changes to the athlete instead of silently rewriting the program;
7. optimizes for adherence and usability, not theoretical perfection that the athlete will not follow.

## Evidence hierarchy

Programming decisions should be tagged internally as:

- `high`: supported by systematic reviews/meta-analyses and/or major guidelines.
- `moderate`: consistent evidence, but context dependent or with meaningful uncertainty.
- `emerging`: plausible and supported by early/recent evidence, but not mature enough to hard-code as a universal rule.
- `heuristic`: product/coaching rule used because research does not identify a precise universal threshold. Heuristics must be conservative, transparent and adaptable from user data.

The engine must never present a heuristic as settled science.

---

## 1. Core training dose model

### Weekly volume

**Evidence: high.** Weekly resistance-training volume has a positive dose-response relationship with hypertrophy and strength, but with diminishing returns. Recent meta-regression indicates that distinguishing direct from indirect sets improves prediction of adaptation.

Implementation:

- Count a direct set for a target muscle as `1.0`.
- Count a meaningful secondary contribution as approximately `0.5` for hypertrophy-volume accounting.
- Do not pretend there is one universal "optimal number of sets" for every athlete.
- Start conservatively, then increase only if performance/recovery/adherence support it.
- Volume increases should be muscle-specific, not whole-program blanket increases.

Primary reference:
- Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC. *The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains.* Sports Medicine. 2026;56(2):481-505. https://pubmed.ncbi.nlm.nih.gov/41343037/

Supporting reference:
- Schoenfeld BJ, Ogborn D, Krieger JW. *Dose-response relationship between weekly resistance training volume and increases in muscle mass.* J Sports Sci. 2017. https://pubmed.ncbi.nlm.nih.gov/27433992/

### Per-session volume

**Evidence: emerging.** A 2025 preprint meta-regression suggests strong diminishing returns as per-session volume grows, with an estimated point of undetectable superiority around ~11 fractional sets per muscle for hypertrophy and ~2 direct sets for maximal-strength outcomes. This is useful as a guardrail, not a universal cap.

Implementation:

- Avoid concentrating very high weekly muscle volume into one day when it can be distributed.
- Default to spreading target-muscle work across 2+ exposures when schedule permits.
- Treat very high per-session muscle volume as a warning requiring a reason, not an automatic error.

Reference:
- Remmert JF et al. *Is There Too Much of a Good Thing? Meta-Regressions of the Effect of Per-Session Volume on Hypertrophy and Strength.* SportRxiv, 2025. https://sportrxiv.org/index.php/server/preprint/view/537

### Frequency

**Evidence: high/moderate.** For hypertrophy, frequency itself has little independent effect when weekly volume is equated; frequency is mainly a way to distribute volume. For strength, recent dose-response analysis suggests greater frequency can improve gains, also with diminishing returns.

Implementation:

- Choose frequency primarily from available training days, weekly volume, recovery and exercise specificity.
- Do not force a bro split/full-body ideology.
- For strength goals, expose priority lifts more frequently when recovery and schedule permit.
- For hypertrophy, distribute weekly volume to maintain session quality and practical duration.

References:
- Pelland et al. 2026. https://pubmed.ncbi.nlm.nih.gov/41343037/
- Schoenfeld BJ, Grgic J, Krieger J. *How many times per week should a muscle be trained to maximize muscle hypertrophy?* J Sports Sci. 2019. https://pubmed.ncbi.nlm.nih.gov/30558493/
- Ramos-Campo DJ et al. *Efficacy of Split Versus Full-Body Resistance Training on Strength and Muscle Growth.* J Strength Cond Res. 2024. https://pubmed.ncbi.nlm.nih.gov/38595233/

---

## 2. Goal-specific loading

### Strength

**Evidence: high.** Higher-load training is more effective for maximal-strength development than low-load training.

Implementation:

- Priority compound lifts should regularly include heavy work.
- Accessories do not need to be heavy simply because the athlete's primary goal is strength.
- Specificity matters: improvement is greatest in the movements and loading patterns actually trained.

References:
- Currier BS et al. *Resistance training prescription for muscle strength and hypertrophy in healthy adults.* Br J Sports Med. 2023. https://pubmed.ncbi.nlm.nih.gov/37414459/
- Lopez P et al. *Resistance Training Load Effects on Muscle Hypertrophy and Strength Gain.* Med Sci Sports Exerc. 2021. https://pubmed.ncbi.nlm.nih.gov/33433148/

### Hypertrophy

**Evidence: high.** Muscle growth can occur across a broad loading range when sets are sufficiently effortful. Multiple sets matter more than choosing one magical repetition zone.

Implementation:

- Use practical rep ranges that balance stimulus, fatigue, joint comfort and logging reliability.
- Default most hypertrophy work to moderate reps, while allowing lower/higher ranges when exercise-specific advantages exist.
- Do not force every exercise into 8–12 reps.

Reference:
- Lopez P et al. 2021. https://pubmed.ncbi.nlm.nih.gov/33433148/

### General fitness / fat-loss-oriented strength training

**Evidence: high for health, moderate for exact programming details.** Major guidelines recommend training all major muscle groups at least twice weekly for health. Fat loss should not cause the resistance program to degenerate into random high-rep circuits if maintaining strength/muscle is a goal.

Implementation:

- Maintain progressive resistance training as the backbone.
- Cardio/conditioning may be layered around it according to preference, recovery and time.

Reference:
- WHO Guidelines on Physical Activity and Sedentary Behaviour. https://www.who.int/publications/i/item/9789240015128

---

## 3. Proximity to failure, RIR and RPE

### Hypertrophy

**Evidence: moderate/high.** Hypertrophy generally improves as sets are terminated closer to failure, but momentary muscular failure is not required for growth.

Implementation:

- Most hypertrophy working sets: target roughly 1–3 RIR by default.
- Failure can be used selectively, especially on lower-risk isolation/machine work, but should not be the universal endpoint.
- High-fatigue compound failure should be rare unless deliberately programmed.

References:
- Robinson ZP et al. *Exploring the Dose-Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy.* Sports Med. 2024. https://pubmed.ncbi.nlm.nih.gov/38970765/
- Refalo MC et al. *Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy.* Sports Med. 2023. https://pubmed.ncbi.nlm.nih.gov/36334240/

### Strength

**Evidence: moderate/high.** Strength gains appear much less dependent on training very close to failure than hypertrophy; excessive failure work can increase fatigue and recovery cost.

Implementation:

- Strength compounds should commonly retain reps in reserve.
- Use performance quality and load specificity rather than fatigue as the goal.

### RPE/RIR as monitoring tools

**Evidence: moderate/high.** RPE is a practical and valid way to monitor resistance-exercise exertion. Autoregulated approaches can outperform rigid percentage-based programming for maximal strength in some evidence syntheses.

Implementation:

- RIR/RPE becomes a first-class data field, not optional decoration.
- If Garmin cannot provide RIR, TrainSync should request only a minimal post-session or post-exercise input when it materially changes programming.
- Never infer exact RIR from heart rate alone.

References:
- Lea JWD et al. *Convergent Validity of Ratings of Perceived Exertion During Resistance Exercise.* Sports Med Open. 2022. https://pubmed.ncbi.nlm.nih.gov/35000021/
- Huang Z et al. *Autoregulated resistance training for maximal strength enhancement.* J Exerc Sci Fit. 2025. https://pubmed.ncbi.nlm.nih.gov/40791980/

---

## 4. Progressive overload

**Evidence: high that progression is necessary; moderate for the exact method.** Increasing repetitions or increasing load can both successfully drive adaptation.

Implementation:

TrainSync should support at least three progression modes:

1. `double_progression` — increase reps within a range, then increase load once the athlete owns the top of the range at the intended effort;
2. `load_progression` — increase load while keeping a narrower repetition target;
3. `autoregulated_strength` — RPE/RIR/APRE-style load adjustment for experienced strength-focused users.

Rules:

- Do not increase load merely because the calendar advanced one week.
- Do not decrease load because of one bad set alone.
- Use repeated actual performance, achieved reps, target reps, RIR/RPE, exercise continuity and recent trend.
- Prefer the smallest useful increment supported by available equipment.
- Plateau logic should distinguish technique/exercise-specific failure from whole-program failure.

References:
- Plotkin DL et al. *Progressive overload without progressing load?* Sports Med. 2022. https://pubmed.ncbi.nlm.nih.gov/36199287/
- Kassiano W et al. *Effects of Resistance Training Overload Progression Protocols on Strength and Muscle Mass.* Int J Sports Med. 2024. https://pubmed.ncbi.nlm.nih.gov/38286426/
- ACSM progression model. https://pubmed.ncbi.nlm.nih.gov/11828249/

---

## 5. Rest intervals

**Evidence: moderate.** Very short rest is not required for hypertrophy. Longer rests can preserve repetitions/load and may have a hypertrophy advantage in some contexts; heavy strength work benefits from longer recovery.

Implementation defaults:

- Heavy compounds: usually 2–4+ min.
- Moderate hypertrophy compounds: usually 2–3 min.
- Isolation/machine work: usually 1–2+ min depending on performance drop and time budget.
- Time-constrained modes may shorten rests, but the engine should know it is trading performance quality for session efficiency.

References:
- Singer A et al. *Give it a rest: a systematic review with Bayesian meta-analysis on inter-set rest interval duration and hypertrophy.* 2024. https://pubmed.ncbi.nlm.nih.gov/39205815/
- Grgic J et al. *The effects of short versus long inter-set rest intervals on muscle hypertrophy.* 2017. https://pubmed.ncbi.nlm.nih.gov/28641044/

---

## 6. Exercise order

**Evidence: high.** The exercises performed earlier in a session tend to gain more strength. Hypertrophy differences from order are small/unclear.

Implementation:

- Put the athlete's priority movement/muscle early.
- "Compound first" is a useful default, not a law.
- If biceps/side delts/etc. are the explicit priority, the app may place them earlier.

Reference:
- Nunes JP et al. *What influence does resistance exercise order have on muscular strength gains and muscle hypertrophy?* Eur J Sport Sci. 2021. https://pubmed.ncbi.nlm.nih.gov/32077380/

---

## 7. Range of motion, muscle length and tempo

### ROM

**Evidence: moderate.** Full ROM is a strong default, particularly for strength and lower-body hypertrophy. Longer-muscle-length training is promising, but newer literature remains mixed enough that lengthened partials should not replace full ROM universally.

Implementation:

- Full comfortable ROM is the default.
- Lengthened partials are an advanced optional technique, not a mandatory optimizer.
- Exercise notes should describe the intended ROM when it materially affects execution.

References:
- Schoenfeld BJ, Grgic J. *Effects of range of motion on muscle development.* 2020. https://pubmed.ncbi.nlm.nih.gov/32030125/
- Pallares JG et al. *Effects of range of motion on resistance training adaptations.* 2021. https://pubmed.ncbi.nlm.nih.gov/34170576/
- Wolf M et al. *Does longer-muscle length resistance training cause greater longitudinal growth in humans?* 2025/2026. https://pubmed.ncbi.nlm.nih.gov/41646176/

### Tempo

**Evidence: moderate.** A broad range of normal repetition durations can produce hypertrophy; excessively slow reps are not necessary.

Implementation:

- Default cue: controlled eccentric, intentional concentric, stable technique.
- Do not clutter every set with arbitrary `3-1-3-1` prescriptions unless tempo itself is the training variable.

Reference:
- Schoenfeld BJ et al. *Effect of repetition duration during resistance training on muscle hypertrophy.* Sports Med. 2015. https://pubmed.ncbi.nlm.nih.gov/25601394/

---

## 8. Exercise selection

### Free weights vs machines

**Evidence: high/moderate.** Both can build muscle and strength; strength gains are specific to the modality/test trained.

Implementation:

- Select equipment according to goal, preference, available equipment, stability needs, fatigue cost and pain tolerance.
- Do not assign free weights a universal superiority score.
- Machine exercises can be excellent hypertrophy choices when they permit stable loading and easy progression.

Reference:
- Heidel KA et al. *Effect of free-weight vs. machine-based strength training on maximal strength, hypertrophy and jump performance.* 2023. https://pubmed.ncbi.nlm.nih.gov/37582807/

### Exercise continuity

**Product rule grounded in specificity.** Keep key exercises stable long enough to measure progression. Exercise novelty is not a goal.

Rotate/swap when:

- equipment is unavailable;
- pain/discomfort occurs;
- the athlete dislikes the exercise enough to threaten adherence;
- a movement repeatedly fails to produce useful progression;
- the program intentionally changes specificity.

The user must be able to `LOCK`, `PREFER`, `AVOID`, `SWAP TODAY`, or `REPLACE GOING FORWARD` for any exercise.

---

## 9. Recovery and fatigue management

**Evidence: moderate.** Higher volume, closer-to-failure training, multi-joint lower-body work and large eccentric/lengthened demands can extend recovery. Individual variation is large.

Implementation:

- Do not use a rigid 48-hour recovery rule.
- Track muscle/exercise exposure, failed reps, RIR/RPE, session volume, performance trend and subjective recovery.
- Reduce fatigue cost before abandoning progression.
- If several indicators worsen together, adjust the next session rather than waiting for a calendar deload.

Reference:
- Bell L et al. *The Importance of Recovery in Resistance Training Microcycle Construction.* 2024. https://pubmed.ncbi.nlm.nih.gov/38689583/
- Varela-Olalla D et al. *Influence of Proximity to Failure, Relative Intensity, and Volume on Voluntary Performance and Fatigue Symptoms.* 2025. https://pubmed.ncbi.nlm.nih.gov/40644670/

### Readiness data

**Evidence: moderate.** Subjective well-being can be at least as sensitive as many objective markers. Wearable metrics should be contextual inputs, not a dictator.

Implementation:

Potential signals:

- actual performance vs target;
- RIR/RPE;
- soreness;
- motivation/readiness;
- sleep duration/quality when available;
- resting HR/HRV when officially available from Garmin;
- recent total training load.

Rules:

- No single HRV/body-battery/readiness value should automatically cancel a workout.
- User-reported pain is not treated as ordinary fatigue.
- Baselines should be individualized; avoid generic population cutoffs when not validated.

Reference:
- Saw AE et al. *Monitoring the athlete training response: subjective self-reported measures trump commonly used objective measures.* Br J Sports Med. 2016. https://pubmed.ncbi.nlm.nih.gov/26423706/

---

## 10. Deloads

**Evidence: emerging/mixed.** Planned deloading is common in practice, but evidence does not support blindly inserting a full week off every fixed number of weeks. One trial found no hypertrophy benefit and less strength improvement from a week of complete cessation; a 2026 study found reduced volume/frequency deloads did not hinder hypertrophy or strength-endurance in untrained men.

Implementation:

- No mandatory `every 4th week` deload.
- Prefer autoregulated deload triggers.
- First-line deload adjustment: reduce volume and effort while preserving enough movement exposure and technique practice.
- Complete cessation should be reserved for situations where it is actually useful/necessary.

References:
- Coleman M et al. *Gaining more from doing less?* PeerJ. 2024. https://pubmed.ncbi.nlm.nih.gov/38274324/
- Pancar Z et al. *Effects of deload periods in resistance training...* Sci Rep. 2026. https://pubmed.ncbi.nlm.nih.gov/41730991/

---

## 11. Concurrent cardio and strength

**Evidence: high/moderate.** Concurrent aerobic + resistance training generally does not meaningfully compromise hypertrophy or maximal strength, but explosive strength and highly trained lower-body strength can be more sensitive, especially when modalities are packed into the same session.

Implementation:

- If strength/power is priority and cardio must occur the same day, strength usually comes first.
- When possible for trained athletes prioritizing maximal lower-body strength/power, separate demanding endurance and lower-body resistance sessions by several hours or different days.
- Do not tell normal users that cardio "kills gains."

References:
- Schumann M et al. *Compatibility of Concurrent Aerobic and Strength Training for Skeletal Muscle Size and Function.* Sports Med. 2022. https://pubmed.ncbi.nlm.nih.gov/34757594/
- Petré H et al. *Development of Maximal Dynamic Strength During Concurrent Resistance and Endurance Training.* Sports Med. 2021. https://pubmed.ncbi.nlm.nih.gov/33751469/

---

## 12. Program construction logic

The engine must construct a program in this order:

1. goal and priority ranking;
2. available days and per-session time;
3. athlete experience;
4. equipment;
5. movement limitations / user-declared pain restrictions;
6. exercise preferences and locked movements;
7. target weekly dose by muscle and/or priority lift;
8. distribute dose across sessions;
9. choose exercises and order by priority;
10. assign rep ranges / RIR / rest by exercise role;
11. validate session duration and fatigue concentration;
12. generate progression rules before generating week 2+;
13. only then render the calendar/program.

A program is invalid if it looks balanced by body-part labels but fails movement/exposure/dose checks.

### Movement-pattern coverage

Use movement patterns as a planning sanity check, not as a magical equal-ratio requirement:

- horizontal press;
- vertical press;
- horizontal pull;
- vertical pull;
- squat/knee-dominant;
- hinge/hip-dominant;
- elbow flexion/extension where needed;
- calf/ankle work where appropriate;
- trunk work based on goal and sport demands;
- optional unilateral work.

A bodybuilding plan may intentionally bias muscles; a powerlifting plan may intentionally bias squat/bench/deadlift specificity. "Balance" means appropriate to the goal, not equal sets for everything.

---

## 13. Adaptation engine

After each completed session, TrainSync should classify each exercise result:

- `overperformed`
- `on_target`
- `underperformed`
- `fatigue_signal`
- `pain_or_stop_signal`
- `insufficient_data`

Then decide one of:

- keep;
- add reps;
- add load;
- add a set;
- remove a set;
- increase RIR target / lower effort;
- lengthen rest;
- swap exercise;
- reschedule exposure;
- trigger deload-like reduction;
- ask the user one targeted question before changing anything.

The engine must avoid overreacting to one noisy session. Trend > single datapoint unless safety/pain is involved.

---

## 14. UX rules — usefulness before feature count

Research into exercise apps and current user feedback repeatedly points to the same product risk: good training logic becomes useless if logging interrupts the workout.

TrainSync principles:

### During the workout

- minimum taps;
- large controls;
- previous actual result visible next to today's target;
- rest timer automatic;
- exercise notes/cues persist across sessions;
- allow instant reordering when equipment is occupied;
- `swap today` must not rewrite the future program;
- `replace permanently` must be separate;
- no social feed or irrelevant analytics while the athlete is between sets;
- imported Garmin results should eliminate post-workout retyping wherever possible.

### Before the workout

Show only what changes behavior:

- today's goal;
- exercises;
- target sets/reps/load or effort;
- approximate duration;
- one-line reason if the plan was adapted.

### After the workout

Do not demand a long form. If Garmin supplied reps/weight, TrainSync should only ask missing high-value context, e.g.:

- "How hard was the session?" or last-set RIR for priority lifts;
- pain/discomfort if flagged;
- optional note.

### Program screen

The athlete needs to understand the next several weeks without reading a spreadsheet:

- weekly calendar;
- target muscle/lift exposure;
- progression state;
- upcoming adaptations;
- locked exercises;
- ability to move a session and let TrainSync reflow the microcycle safely.

### Explainability

Every meaningful adaptation should have a short reason, e.g.:

- `+2.5 kg — you completed all target reps twice at ~2 RIR.`
- `Volume held — performance improved; no need to add fatigue.`
- `1 set removed — two sessions showed falling reps and high effort.`

No generic AI prose.

---

## 15. Competitive/product observations

Community feedback around existing strength apps consistently values:

- extremely fast logging;
- persistent exercise notes/cues;
- remembering previous performance;
- flexible exercise substitutions without destroying the program;
- more granular muscle tracking;
- automatic progressive overload that experienced users can understand and override;
- wearable/result import;
- program-level planning rather than isolated session generation.

The main competitive opportunity for TrainSync is therefore **not** "more AI". It is:

> evidence-constrained programming + automatic result capture + transparent adaptation + very low-friction gym UX.

Useful community references:
- Hevy feature request megathread (2025–2026): https://www.reddit.com/r/Hevy/comments/1n6ohrp/feature_request_megathread/
- Hevy product feedback on workout speed (2026): https://www.reddit.com/r/Hevy/comments/1vugxex/for_the_dev_teams_product_hevy/
- Hevy AI/progressive-overload criticism (2026): https://www.reddit.com/r/Hevy/comments/1rsxl9w/hevys_ai_trainer_great_for_beginners_slap_in_the/

---

## 16. What must NOT be hard-coded as "science"

Do not hard-code these as universal truths:

- exactly 10 sets per muscle per week;
- exactly 48 or 72 hours of recovery;
- every set must be 8–12 reps;
- every set must reach failure;
- every fourth week must be a deload;
- free weights are always superior to machines;
- full-body is always superior to split routines or vice versa;
- one Garmin recovery metric can determine readiness;
- soreness is required for growth;
- changing exercises frequently prevents plateaus;
- shorter rest is inherently better for hypertrophy;
- fixed percentages of 1RM are always better than autoregulation.

When evidence does not provide a precise threshold, TrainSync should use a conservative initial heuristic and personalize it from the athlete's own longitudinal data.

---

## 17. Product success criterion

TrainSync succeeds when the athlete can say:

> "I do not have to design the program, I do not have to re-enter what I did, and I can understand why the plan changed."

The best program on paper is not the objective. The objective is the best program the athlete can repeatedly execute, recover from, measure and progress.