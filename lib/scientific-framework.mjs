// TrainSync Scientific Framework
// Sources -> claims -> implementation bindings. Runtime decisions must not cite papers directly.

export const SCIENCE_VERSION = "2026-08-23.1";
export const LAST_REVIEWED = "2026-08-23";

export const EVIDENCE_LEVELS = Object.freeze(["high", "moderate", "emerging", "heuristic"]);
export const RULE_KINDS = Object.freeze(["evidence_backed", "evidence_informed_heuristic", "product_heuristic"]);

export const SOURCES = Object.freeze({
  acsm_2026_position: Object.freeze({
    type: "position_stand_overview_of_reviews",
    title: "American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews",
    year: 2026,
    pmid: "41843416",
    doi: "10.1249/MSS.0000000000003897",
    url: "https://pubmed.ncbi.nlm.nih.gov/41843416/",
    population: "Healthy adults >=18 years; systematic reviews of RT interventions >=6 weeks",
    scope: ["strength", "hypertrophy", "power", "physical_function", "prescription"],
    limitations: "Broad overview; many prescription comparisons contain heterogeneous protocols and populations. Search was current to October 2024.",
  }),
  pelland_2026_dose_response: Object.freeze({
    type: "meta_regression",
    title: "The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains",
    year: 2026,
    pmid: "41343037",
    doi: "10.1007/s40279-025-02344-w",
    url: "https://pubmed.ncbi.nlm.nih.gov/41343037/",
    population: "67 studies, 2058 participants; predominantly young and male",
    scope: ["volume", "frequency", "hypertrophy", "strength", "fractional_sets"],
    limitations: "Meta-regression is observational across study-level protocols; dose-response estimates should not be treated as exact individual thresholds.",
  }),
  currier_2023_network_meta: Object.freeze({
    type: "systematic_review_network_meta_analysis",
    title: "Resistance training prescription for muscle strength and hypertrophy in healthy adults: a systematic review and Bayesian network meta-analysis",
    year: 2023,
    pmid: "37414459",
    doi: null,
    url: "https://pubmed.ncbi.nlm.nih.gov/37414459/",
    population: "Healthy adults; 178 studies for strength and 119 for hypertrophy",
    scope: ["load", "sets", "frequency", "strength", "hypertrophy"],
    limitations: "Ranks combinations of prescription variables; rankings should not be interpreted as a single universally optimal program.",
  }),
  robinson_2024_failure_proximity: Object.freeze({
    type: "meta_regression",
    title: "Exploring the Dose-Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy",
    year: 2024,
    pmid: "38970765",
    doi: "10.1007/s40279-024-02069-2",
    url: "https://pubmed.ncbi.nlm.nih.gov/38970765/",
    population: "Healthy resistance-training study populations",
    scope: ["rir", "failure", "hypertrophy", "strength"],
    limitations: "Exploratory meta-regression; RIR was estimated from study descriptions and exact optimum remains uncertain.",
  }),
  refalo_2023_failure_meta: Object.freeze({
    type: "systematic_review_meta_analysis",
    title: "Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy",
    year: 2023,
    pmid: "36334240",
    doi: "10.1007/s40279-022-01784-y",
    url: "https://pubmed.ncbi.nlm.nih.gov/36334240/",
    population: "Healthy adults across training experience levels",
    scope: ["failure", "hypertrophy"],
    limitations: "Definitions of failure varied across included studies; evidence does not identify one exact RIR target for all contexts.",
  }),
  singer_2024_rest_meta: Object.freeze({
    type: "systematic_review_bayesian_meta_analysis",
    title: "Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy",
    year: 2024,
    pmid: "39205815",
    doi: "10.3389/fspor.2024.1429789",
    url: "https://pubmed.ncbi.nlm.nih.gov/39205815/",
    population: "Healthy adults; 9 randomized studies",
    scope: ["rest_intervals", "hypertrophy", "volume_load"],
    limitations: "Small evidence base and substantial heterogeneity; results support ranges rather than a universal exact rest duration.",
  }),
  grgic_2018_strength_rest: Object.freeze({
    type: "systematic_review",
    title: "Effects of Rest Interval Duration in Resistance Training on Measures of Muscular Strength",
    year: 2018,
    pmid: "28933024",
    doi: null,
    url: "https://pubmed.ncbi.nlm.nih.gov/28933024/",
    population: "23 studies, 491 participants; predominantly male",
    scope: ["rest_intervals", "strength"],
    limitations: "Chronic evidence was limited and much practical guidance is informed partly by acute performance data.",
  }),
  superset_2025_meta: Object.freeze({
    type: "systematic_review_meta_analysis",
    title: "Superset Versus Traditional Resistance Training Prescriptions: A Systematic Review and Meta-analysis",
    year: 2025,
    pmid: "39903375",
    doi: null,
    url: "https://pubmed.ncbi.nlm.nih.gov/39903375/",
    population: "19 studies, 313 participants",
    scope: ["supersets", "time_efficiency", "strength", "hypertrophy", "fatigue"],
    limitations: "Superset definitions and protocols were heterogeneous; higher perceived effort/internal load can matter for individual programming.",
  }),
  superset_2024_rct: Object.freeze({
    type: "randomized_controlled_trial",
    title: "Efficacy of Supersets Versus Traditional Sets in Whole-Body Multiple-Joint Resistance Training",
    year: 2024,
    pmid: "39072654",
    doi: null,
    url: "https://pubmed.ncbi.nlm.nih.gov/39072654/",
    population: "Healthy adults completing 10 weeks of heavy multi-joint RT",
    scope: ["supersets", "time_efficiency", "strength"],
    limitations: "Single protocol; some pulling strength outcomes favored traditional sets, so results do not justify a blanket ban or endorsement of supersets.",
  }),
  autoreg_2025_network_meta: Object.freeze({
    type: "systematic_review_network_meta_analysis",
    title: "Autoregulated resistance training for maximal strength enhancement: A systematic review and network meta-analysis",
    year: 2025,
    pmid: "40791980",
    doi: "10.1016/j.jesf.2025.07.006",
    url: "https://pubmed.ncbi.nlm.nih.gov/40791980/",
    population: "Resistance-training studies comparing APRE, RPE, velocity-based and percentage-based approaches",
    scope: ["autoregulation", "strength", "rpe", "velocity"],
    limitations: "Network is relatively small and ranking probabilities should not be interpreted as proof that one autoregulation method is universally superior.",
  }),
  refalo_2024_rir_accuracy: Object.freeze({
    type: "experimental_accuracy_study",
    title: "Accuracy of Intraset Repetitions-in-Reserve Predictions During the Bench Press Exercise in Resistance-Trained Male and Female Subjects",
    year: 2024,
    pmid: "37967832",
    doi: "10.1519/JSC.0000000000004653",
    url: "https://pubmed.ncbi.nlm.nih.gov/37967832/",
    population: "24 resistance-trained men and women; bench press at 75% 1RM",
    scope: ["rir", "measurement", "bench_press"],
    limitations: "Exercise- and load-specific accuracy study; should not be generalized to every exercise, novice, or high-repetition set.",
  }),
  moesgaard_2022_periodization: Object.freeze({
    type: "systematic_review_meta_analysis",
    title: "Effects of Periodization on Strength and Muscle Hypertrophy in Volume-Equated Resistance Training Programs",
    year: 2022,
    pmid: "35044672",
    doi: "10.1007/s40279-021-01636-1",
    url: "https://pubmed.ncbi.nlm.nih.gov/35044672/",
    population: "35 resistance-training studies",
    scope: ["periodization", "strength", "hypertrophy"],
    limitations: "Small strength advantage on average; subgroup findings and periodization-model comparisons have uncertainty and do not support mandatory periodization for every user.",
  }),
  nunes_2021_exercise_order: Object.freeze({
    type: "systematic_review_meta_analysis",
    title: "What influence does resistance exercise order have on muscular strength gains and muscle hypertrophy?",
    year: 2021,
    pmid: "32077380",
    doi: "10.1080/17461391.2020.1733672",
    url: "https://pubmed.ncbi.nlm.nih.gov/32077380/",
    population: "11 resistance-training studies",
    scope: ["exercise_order", "strength", "hypertrophy"],
    limitations: "Evidence base is modest; effect is clearest for strength specificity of exercises performed early, not a universal hypertrophy ordering rule.",
  }),
  ramos_campo_2024_split_fullbody: Object.freeze({
    type: "systematic_review_meta_analysis",
    title: "Efficacy of Split Versus Full-Body Resistance Training on Strength and Muscle Growth",
    year: 2024,
    pmid: "38595233",
    doi: "10.1519/JSC.0000000000004774",
    url: "https://pubmed.ncbi.nlm.nih.gov/38595233/",
    population: "14 studies, 392 participants",
    scope: ["split", "full_body", "strength", "hypertrophy"],
    limitations: "Applies when training volume is equated; adherence and practical scheduling can still make one structure preferable for an individual.",
  }),
});

export const CLAIMS = Object.freeze({
  progressive_rt_effective: Object.freeze({
    statement: "Progressive resistance training improves strength and muscle size in healthy adults across many valid prescription structures.",
    confidence: "high",
    outcomes: ["strength", "hypertrophy"],
    sourceIds: ["acsm_2026_position", "currier_2023_network_meta"],
    applicability: "Healthy adults; starting prescription should still reflect goal, experience, equipment and adherence constraints.",
  }),
  heavy_load_strength_specificity: Object.freeze({
    statement: "Heavier loading is generally superior for maximizing 1RM/maximal-strength outcomes, while hypertrophy can occur across a broader loading range.",
    confidence: "high",
    outcomes: ["strength", "hypertrophy"],
    sourceIds: ["acsm_2026_position", "currier_2023_network_meta"],
    applicability: "Use as a strength-specific preference, not a rule that every set must be heavy.",
  }),
  volume_positive_diminishing_returns: Object.freeze({
    statement: "Weekly resistance-training set volume has a positive dose-response relationship with hypertrophy and strength, with diminishing returns; the strength curve appears to diminish more strongly.",
    confidence: "high",
    outcomes: ["hypertrophy", "strength"],
    sourceIds: ["pelland_2026_dose_response", "acsm_2026_position"],
    applicability: "Population-level relationship; does not establish one universal optimal or maximal number of sets for an individual.",
  }),
  fractional_direct_indirect_sets: Object.freeze({
    statement: "Distinguishing direct and indirect sets, with partial credit for indirect work, models adaptation better than treating every involved muscle as receiving a full direct set.",
    confidence: "high",
    outcomes: ["hypertrophy", "strength"],
    sourceIds: ["pelland_2026_dose_response"],
    applicability: "Useful for dose estimation; exact fractional contribution of a specific exercise-muscle pairing remains an approximation.",
  }),
  hypertrophy_frequency_is_distribution_tool: Object.freeze({
    statement: "When weekly volume is considered, training frequency has a smaller and less consistent independent relationship with hypertrophy than volume; frequency can be used mainly to distribute productive work and improve feasibility.",
    confidence: "moderate",
    outcomes: ["hypertrophy"],
    sourceIds: ["pelland_2026_dose_response"],
    applicability: "Does not imply frequency never matters; individual recovery, session quality and adherence can still favor different schedules.",
  }),
  failure_not_required: Object.freeze({
    statement: "Momentary muscular failure is not required for strength or hypertrophy; hypertrophy may improve as sets are performed closer to failure, but the exact optimal proximity is uncertain.",
    confidence: "moderate",
    outcomes: ["strength", "hypertrophy"],
    sourceIds: ["acsm_2026_position", "robinson_2024_failure_proximity", "refalo_2023_failure_meta"],
    applicability: "Supports using RIR as a controllable dose variable rather than prescribing repeated failure by default.",
  }),
  longer_rest_preserves_quality: Object.freeze({
    statement: "Very short inter-set rest can reduce performance/volume; longer rest is generally appropriate for strength work, while hypertrophy evidence suggests little reason to force rest below roughly 60-90 seconds when time permits.",
    confidence: "moderate",
    outcomes: ["strength", "hypertrophy", "session_quality"],
    sourceIds: ["singer_2024_rest_meta", "grgic_2018_strength_rest"],
    applicability: "Does not establish one exact rest duration for every exercise; exercise complexity, load and time constraints matter.",
  }),
  supersets_time_efficiency_tradeoff: Object.freeze({
    statement: "Supersets can substantially improve time efficiency with similar average chronic hypertrophy and strength outcomes, but increase perceived/internal load and poorly paired or heavy multi-joint supersets can compromise performance.",
    confidence: "moderate",
    outcomes: ["time_efficiency", "strength", "hypertrophy", "fatigue"],
    sourceIds: ["superset_2025_meta", "superset_2024_rct"],
    applicability: "Supports selective non-competing supersets, not universal supersetting of priority lifts.",
  }),
  autoregulation_supported_not_oracle: Object.freeze({
    statement: "Autoregulated loading can improve maximal-strength programming relative to fixed percentage prescriptions, but no single autoregulation method should be treated as universally optimal.",
    confidence: "moderate",
    outcomes: ["strength"],
    sourceIds: ["autoreg_2025_network_meta"],
    applicability: "Best used with objective performance history and bounded changes rather than unconstrained day-to-day AI decisions.",
  }),
  rir_useful_context_dependent: Object.freeze({
    statement: "RIR is a useful prescription and feedback signal, especially in trained lifters near task failure, but measurement error is exercise-, load-, experience- and repetition-range dependent.",
    confidence: "moderate",
    outcomes: ["effort_measurement", "autoregulation"],
    sourceIds: ["refalo_2024_rir_accuracy", "robinson_2024_failure_proximity"],
    applicability: "RIR should be combined with completed reps, load, trends and repeated exposures rather than treated as ground truth.",
  }),
  periodization_contextual_tool: Object.freeze({
    statement: "Periodization can provide a small average advantage for 1RM strength in volume-equated programs, particularly in trained participants, but does not consistently improve hypertrophy and is not a mandatory feature of every program.",
    confidence: "moderate",
    outcomes: ["strength", "hypertrophy"],
    sourceIds: ["moesgaard_2022_periodization", "acsm_2026_position"],
    applicability: "Use when it solves a programming problem; do not impose arbitrary waves or deloads solely because a block has reached a calendar week.",
  }),
  exercise_order_priority_specificity: Object.freeze({
    statement: "Strength gains tend to be greatest for exercises performed earlier in a session, whereas hypertrophy appears less sensitive to exercise order.",
    confidence: "moderate",
    outcomes: ["strength", "hypertrophy"],
    sourceIds: ["nunes_2021_exercise_order", "acsm_2026_position"],
    applicability: "Place goal-priority strength exercises early unless a deliberate alternative has a clear reason.",
  }),
  split_fullbody_equivalent_when_volume_equated: Object.freeze({
    statement: "Split and full-body routines produce similar strength and hypertrophy outcomes when volume is equated, so schedule structure can be chosen around adherence, time and recovery.",
    confidence: "moderate",
    outcomes: ["strength", "hypertrophy", "adherence"],
    sourceIds: ["ramos_campo_2024_split_fullbody"],
    applicability: "Supports user-centered scheduling rather than branding one split as inherently superior.",
  }),
});

// Bind current deterministic programming-engine rules to scientific claims.
// A heuristic can be useful, but it must be labelled honestly and may not inherit
// a fake level of certainty from a related paper.
export const RULE_EVIDENCE_BINDINGS = Object.freeze({
  fractionalSecondarySet: Object.freeze({ kind: "evidence_backed", level: "high", claimIds: ["fractional_direct_indirect_sets"], note: "0.5 is the current fractional model used in the cited dose-response analysis; exercise-specific fractions remain approximate." }),
  highPerSessionMuscleSets: Object.freeze({ kind: "evidence_informed_heuristic", level: "emerging", claimIds: ["volume_positive_diminishing_returns"], note: "The current per-session warning threshold is a QA guardrail, not a scientifically established hard ceiling." }),
  heavyCompoundMinRestSec: Object.freeze({ kind: "evidence_informed_heuristic", level: "moderate", claimIds: ["longer_rest_preserves_quality"], note: "120 s is a conservative product floor for priority strength work, not a universal optimum." }),
  hypertrophyCompoundMinRestSec: Object.freeze({ kind: "evidence_informed_heuristic", level: "moderate", claimIds: ["longer_rest_preserves_quality"], note: "90 s is a quality-preserving default, not a hard hypertrophy threshold." }),
  accessoryMinRestSec: Object.freeze({ kind: "product_heuristic", level: "heuristic", claimIds: [], note: "Time-efficiency floor only; not presented as an evidence-derived optimum." }),
  highEffortCompoundRir: Object.freeze({ kind: "evidence_backed", level: "moderate", claimIds: ["failure_not_required", "rir_useful_context_dependent"], note: "Repeated failure on priority compounds is warned against; isolated failure is not banned." }),
  primaryStrengthMaxReps: Object.freeze({ kind: "evidence_informed_heuristic", level: "moderate", claimIds: ["heavy_load_strength_specificity"], note: "Rep ceiling is a practical proxy for sufficiently heavy strength-specific loading when exact %1RM is unavailable." }),
  competingSuperset: Object.freeze({ kind: "evidence_backed", level: "moderate", claimIds: ["supersets_time_efficiency_tradeoff"], note: "Detects clearly competing pairings; does not imply all supersets reduce outcomes." }),
  sharedFatigueSuperset: Object.freeze({ kind: "evidence_informed_heuristic", level: "heuristic", claimIds: ["supersets_time_efficiency_tradeoff"], note: "Grip/bracing compatibility is a mechanistic QA guardrail; exact fatigue-tag interactions are not validated dose-response thresholds." }),
  samePriorityMuscleMinGapHours: Object.freeze({ kind: "product_heuristic", level: "heuristic", claimIds: [], note: "24 h is a conservative scheduling warning, not a universal recovery law." }),
  minimumPriorityFractionalSets: Object.freeze({ kind: "evidence_informed_heuristic", level: "heuristic", claimIds: ["volume_positive_diminishing_returns"], note: "Priority floor prevents nominal priorities with trivial exposure; the exact value is a product rule." }),
  durationToleranceRatio: Object.freeze({ kind: "product_heuristic", level: "heuristic", claimIds: [], note: "Scheduling/UX tolerance, not a biological rule." }),
});

export function getSource(sourceId) { return SOURCES[sourceId] || null; }
export function getClaim(claimId) { return CLAIMS[claimId] || null; }

export function evidenceForRule(ruleKey) {
  const binding = RULE_EVIDENCE_BINDINGS[ruleKey];
  if (!binding) return null;
  const claims = binding.claimIds.map((claimId) => ({ id: claimId, ...CLAIMS[claimId] }));
  const sourceIds = [...new Set(claims.flatMap((claim) => claim.sourceIds || []))];
  return { scienceVersion: SCIENCE_VERSION, ruleKey, ...binding, claims, sources: sourceIds.map((sourceId) => ({ id: sourceId, ...SOURCES[sourceId] })) };
}

export function validateScientificFramework(programmingRules = null) {
  const errors = [];
  for (const [claimId, claim] of Object.entries(CLAIMS)) {
    if (!EVIDENCE_LEVELS.includes(claim.confidence)) errors.push(`Claim ${claimId} has invalid confidence ${claim.confidence}.`);
    if (!Array.isArray(claim.sourceIds) || !claim.sourceIds.length) errors.push(`Claim ${claimId} has no sources.`);
    for (const sourceId of claim.sourceIds || []) if (!SOURCES[sourceId]) errors.push(`Claim ${claimId} references missing source ${sourceId}.`);
  }
  for (const [ruleKey, binding] of Object.entries(RULE_EVIDENCE_BINDINGS)) {
    if (!RULE_KINDS.includes(binding.kind)) errors.push(`Rule ${ruleKey} has invalid binding kind ${binding.kind}.`);
    if (!EVIDENCE_LEVELS.includes(binding.level)) errors.push(`Rule ${ruleKey} has invalid level ${binding.level}.`);
    for (const claimId of binding.claimIds || []) if (!CLAIMS[claimId]) errors.push(`Rule ${ruleKey} references missing claim ${claimId}.`);
    if (binding.kind === "evidence_backed" && !(binding.claimIds || []).length) errors.push(`Evidence-backed rule ${ruleKey} must cite at least one claim.`);
    if (!(binding.note || "").trim()) errors.push(`Rule ${ruleKey} needs an implementation note.`);
  }
  if (programmingRules && typeof programmingRules === "object") {
    for (const ruleKey of Object.keys(programmingRules)) if (!RULE_EVIDENCE_BINDINGS[ruleKey]) errors.push(`Programming rule ${ruleKey} has no scientific-framework binding.`);
    for (const ruleKey of Object.keys(RULE_EVIDENCE_BINDINGS)) if (!Object.prototype.hasOwnProperty.call(programmingRules, ruleKey)) errors.push(`Scientific binding ${ruleKey} no longer maps to a programming-engine rule.`);
  }
  return { valid: errors.length === 0, scienceVersion: SCIENCE_VERSION, sourceCount: Object.keys(SOURCES).length, claimCount: Object.keys(CLAIMS).length, ruleBindingCount: Object.keys(RULE_EVIDENCE_BINDINGS).length, errors };
}
