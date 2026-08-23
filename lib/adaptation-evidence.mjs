// Scientific evidence specific to post-session adaptation decisions.
// Kept separate from the general programming evidence so progression policies can evolve independently.

export const ADAPTATION_SCIENCE_VERSION = "2026-08-23.3";

export const ADAPTATION_SOURCES = Object.freeze({
  progression_reps_vs_load_2022: Object.freeze({
    type: "randomized_controlled_trial",
    title: "Progressive overload without progressing load? The effects of load or repetition progression on muscular adaptations",
    year: 2022,
    pmid: "36199287",
    url: "https://pubmed.ncbi.nlm.nih.gov/36199287/",
    population: "43 resistance-trained adults; 8 weeks of lower-body training",
    limitations: "Short intervention and lower-body exercise selection; small between-strategy differences should not be generalized to every exercise or athlete.",
  }),
  progression_reps_vs_load_2024: Object.freeze({
    type: "controlled_longitudinal_trial",
    title: "Effects of Resistance Training Overload Progression Protocols on Strength and Muscle Mass",
    year: 2024,
    pmid: "38286426",
    url: "https://pubmed.ncbi.nlm.nih.gov/38286426/",
    population: "39 previously untrained young adults; within-subject load vs repetition progression",
    limitations: "Early-stage trainees and a single primary exercise model; does not identify an optimal switching threshold.",
  }),
  progressive_overload_2026: Object.freeze({
    type: "randomized_controlled_trial",
    title: "Progressive Overload Affects the Magnitude of Muscle Hypertrophy",
    year: 2026,
    pmid: "41718594",
    url: "https://pubmed.ncbi.nlm.nih.gov/41718594/",
    population: "Untrained young women; unilateral elbow extension for 8 weeks",
    limitations: "Single muscle group and untrained female sample; supports progressive overload as a principle but not one universal algorithm.",
  }),
  acsm_2009_progression: Object.freeze({
    type: "position_stand",
    title: "American College of Sports Medicine position stand. Progression models in resistance training for healthy adults",
    year: 2009,
    pmid: "19204579",
    url: "https://pubmed.ncbi.nlm.nih.gov/19204579/",
    population: "Healthy adults across novice, intermediate and advanced resistance-training levels",
    limitations: "Older guideline superseded in broad prescription scope by the 2026 ACSM update. Its 2-10% load-increase recommendation is a practical guideline, not proof of one optimal increment for every exercise or athlete.",
  }),
  deload_2024_trial: Object.freeze({
    type: "randomized_controlled_trial",
    title: "Gaining more from doing less? The effects of a one-week deload period during supervised resistance training on muscular adaptations",
    year: 2024,
    pmid: "38274324",
    url: "https://pubmed.ncbi.nlm.nih.gov/38274324/",
    population: "39 resistance-trained young adults in a 9-week high-volume program",
    limitations: "Tested one specific one-week training cessation model; it does not evaluate every possible deload strategy or fatigue-triggered reduction.",
  }),
  refalo_2024_rir_accuracy: Object.freeze({
    type: "experimental_accuracy_study",
    title: "Accuracy of Intraset Repetitions-in-Reserve Predictions During the Bench Press Exercise in Resistance-Trained Male and Female Subjects",
    year: 2024,
    pmid: "37967832",
    url: "https://pubmed.ncbi.nlm.nih.gov/37967832/",
    population: "24 resistance-trained men and women; bench press at 75% 1RM",
    limitations: "Exercise- and load-specific accuracy study; RIR estimates are useful but noisy and should not be treated as exact physiological measurements.",
  }),
  hickmott_2022_autoreg_volume: Object.freeze({
    type: "systematic_review_meta_analysis",
    title: "The Effect of Load and Volume Autoregulation on Muscular Strength and Hypertrophy: A Systematic Review and Meta-Analysis",
    year: 2022,
    pmid: "35038063",
    url: "https://pubmed.ncbi.nlm.nih.gov/35038063/",
    population: "15 resistance-training studies; load-autoregulation and velocity-loss volume-autoregulation comparisons",
    limitations: "Most volume-autoregulation evidence used velocity-loss thresholds rather than TrainSync-style set-count changes. It supports autoregulating volume as a class of strategies, not any exact trigger or one-set decrement.",
  }),
  varela_olalla_2025_fatigue: Object.freeze({
    type: "systematic_review",
    title: "Influence of Proximity to Failure, Relative Intensity, and Volume on Voluntary Performance and Fatigue Symptoms After Resistance Training",
    year: 2025,
    pmid: "40644670",
    url: "https://pubmed.ncbi.nlm.nih.gov/40644670/",
    population: "51 studies comparing resistance-training protocols in healthy humans",
    limitations: "Primarily acute fatigue outcomes. It identifies volume, set duration and proximity to failure as fatigue determinants but does not establish a chronic individualized dose-reduction algorithm.",
  }),
});

export const ADAPTATION_CLAIMS = Object.freeze({
  progressive_overload_supports_continued_adaptation: Object.freeze({
    statement: "Progressive overload is a defensible long-term programming principle, but the evidence does not define one universal increment size or trigger for every athlete and exercise.",
    confidence: "moderate",
    sourceIds: ["progressive_overload_2026"],
    applicability: "Use to justify progression after demonstrated capacity, not automatic load increases on a fixed calendar.",
  }),
  repetitions_and_load_are_both_viable_progression_tools: Object.freeze({
    statement: "Increasing repetitions and increasing external load can both produce strength and hypertrophy adaptations; the choice can depend on equipment increments, exercise type and goal specificity.",
    confidence: "moderate",
    sourceIds: ["progression_reps_vs_load_2022", "progression_reps_vs_load_2024"],
    applicability: "Supports double progression and reps-first strategies; does not prove equivalence for all exercises, populations or long-term time horizons.",
  }),
  modest_load_increments_are_a_practical_progression_guideline: Object.freeze({
    statement: "A modest increase in external load after exceeding the prescribed repetition target is a long-standing progression guideline; ACSM historically recommended a broad 2-10% range rather than one fixed increment.",
    confidence: "moderate",
    sourceIds: ["acsm_2009_progression"],
    applicability: "Use only when the next real equipment increment is known. The broad range is a guardrail, not evidence that every increase inside it is optimal or every increase outside it is unsafe.",
  }),
  fixed_calendar_deload_is_not_established: Object.freeze({
    statement: "A fixed scheduled deload or week of training cessation is not established as universally beneficial; one controlled trial found no hypertrophy benefit and worse lower-body strength outcomes for a one-week mid-block cessation.",
    confidence: "emerging",
    sourceIds: ["deload_2024_trial"],
    applicability: "Do not prescribe automatic calendar deloads as scientific necessity. Fatigue-triggered load/volume reductions remain a separate practical hypothesis requiring conservative use.",
  }),
  reported_rir_is_useful_but_noisy: Object.freeze({
    statement: "Reported RIR/RPE can add useful effort context to completed repetitions and load, but estimation error is meaningful enough that it should modify confidence rather than act as a standalone progression oracle.",
    confidence: "moderate",
    sourceIds: ["refalo_2024_rir_accuracy"],
    applicability: "Use only when the same set has an explicit prescribed effort target and an actually reported effort value. Do not infer RIR from heart rate or other unrelated wearable signals.",
  }),
  volume_is_a_plausible_fatigue_management_lever: Object.freeze({
    statement: "Resistance-training volume and proximity to failure materially influence acute fatigue, and autoregulating training volume is a defensible programming strategy. The evidence does not establish one universal fatigue trigger or exact set reduction.",
    confidence: "moderate",
    sourceIds: ["hickmott_2022_autoreg_volume", "varela_olalla_2025_fatigue"],
    applicability: "Supports using a small, reversible volume adjustment when repeated performance evidence suggests excessive fatigue. TrainSync's exact two-exposure trigger, one-set decrement, two-set floor and recovery threshold remain conservative product heuristics.",
  }),
});

export const ADAPTATION_RULE_BINDINGS = Object.freeze({
  progressionModeChoice: Object.freeze({
    kind: "evidence_backed",
    level: "moderate",
    claimIds: ["repetitions_and_load_are_both_viable_progression_tools"],
    note: "The engine may choose reps-first, load-first or double progression according to exercise and available increments.",
  }),
  progressionAfterRepeatedSuccess: Object.freeze({
    kind: "evidence_informed_heuristic",
    level: "moderate",
    claimIds: ["progressive_overload_supports_continued_adaptation", "repetitions_and_load_are_both_viable_progression_tools"],
    note: "Requiring repeated success before progression is a TrainSync stability guardrail; the exact number of exposures is not established by these trials.",
  }),
  progressionAfterRepeatedTopRangeCompletion: Object.freeze({
    kind: "evidence_informed_heuristic",
    level: "heuristic",
    claimIds: ["progressive_overload_supports_continued_adaptation", "repetitions_and_load_are_both_viable_progression_tools"],
    note: "Treating three consecutive top-range completions as sufficient when direct effort data are unavailable is a conservative TrainSync product threshold. The exact number three is not established by these sources.",
  }),
  progressionAfterRepeatedEffortConfirmedTopRange: Object.freeze({
    kind: "evidence_informed_heuristic",
    level: "heuristic",
    claimIds: ["progressive_overload_supports_continued_adaptation", "reported_rir_is_useful_but_noisy"],
    note: "Two repeated top-range exposures may support progression when every working set also has reported effort within the prescribed RIR tolerance. The two-exposure rule and +/-1 RIR tolerance are TrainSync guardrails, not universal biological thresholds.",
  }),
  equipmentAwareLoadIncrement: Object.freeze({
    kind: "evidence_informed_heuristic",
    level: "moderate",
    claimIds: ["modest_load_increments_are_a_practical_progression_guideline", "repetitions_and_load_are_both_viable_progression_tools"],
    note: "Select the smallest real available load above the current load and avoid pretending that a coarse equipment jump is automatically appropriate. The 2-10% ACSM range is treated as a broad auto-apply guardrail, not an optimum.",
  }),
  equipmentLimitedRepFallback: Object.freeze({
    kind: "evidence_informed_heuristic",
    level: "heuristic",
    claimIds: ["repetitions_and_load_are_both_viable_progression_tools"],
    note: "For double-progression exercises only, if a safe next external load is not known or the next known jump is too coarse, TrainSync may use a small repetitions progression instead. The exact fallback trigger and step size are product heuristics, not a universal physiological rule.",
  }),
  repTargetIncrement: Object.freeze({
    kind: "product_heuristic",
    level: "heuristic",
    claimIds: ["repetitions_and_load_are_both_viable_progression_tools"],
    note: "A one-repetition increase preserves trackability and small-step progression, but the exact +1 step is a TrainSync implementation choice.",
  }),
  durationTargetIncrement: Object.freeze({
    kind: "product_heuristic",
    level: "heuristic",
    claimIds: [],
    note: "Small timed-target increments are a trackability/product choice; no universal scientific duration increment is asserted.",
  }),
  registeredVariantOnly: Object.freeze({
    kind: "product_heuristic",
    level: "heuristic",
    claimIds: [],
    note: "Bodyweight progression may change exercise identity only through a registered catalog relationship so longitudinal tracking remains valid.",
  }),
  holdAfterSingleMiss: Object.freeze({
    kind: "product_heuristic",
    level: "heuristic",
    claimIds: [],
    note: "One poor exposure is treated as insufficient evidence to rewrite a multi-week prescription.",
  }),
  reduceAfterRepeatedFatigue: Object.freeze({
    kind: "evidence_informed_heuristic",
    level: "heuristic",
    claimIds: ["volume_is_a_plausible_fatigue_management_lever"],
    note: "Using volume as a reversible fatigue-management lever is evidence-informed. TrainSync's exact rule of two consecutive fatigue signals, removing one working set, keeping a two-set floor and later restoring one set after stable recovery is deliberately classified as a product heuristic rather than a proven universal threshold.",
  }),
  noAutomaticCalendarDeload: Object.freeze({
    kind: "evidence_informed_heuristic",
    level: "emerging",
    claimIds: ["fixed_calendar_deload_is_not_established"],
    note: "TrainSync does not deload solely because the calendar reached week N.",
  }),
});

export function validateAdaptationEvidence() {
  const errors = [];
  const levels = new Set(["high", "moderate", "emerging", "heuristic"]);
  const kinds = new Set(["evidence_backed", "evidence_informed_heuristic", "product_heuristic"]);
  for (const [claimId, claim] of Object.entries(ADAPTATION_CLAIMS)) {
    if (!levels.has(claim.confidence)) errors.push(`Adaptation claim ${claimId} has invalid confidence.`);
    if (!Array.isArray(claim.sourceIds) || !claim.sourceIds.length) errors.push(`Adaptation claim ${claimId} has no source.`);
    for (const sourceId of claim.sourceIds || []) if (!ADAPTATION_SOURCES[sourceId]) errors.push(`Adaptation claim ${claimId} references missing source ${sourceId}.`);
  }
  for (const [ruleKey, binding] of Object.entries(ADAPTATION_RULE_BINDINGS)) {
    if (!kinds.has(binding.kind)) errors.push(`Adaptation rule ${ruleKey} has invalid kind.`);
    if (!levels.has(binding.level)) errors.push(`Adaptation rule ${ruleKey} has invalid level.`);
    for (const claimId of binding.claimIds || []) if (!ADAPTATION_CLAIMS[claimId]) errors.push(`Adaptation rule ${ruleKey} references missing claim ${claimId}.`);
    if (binding.kind === "evidence_backed" && !(binding.claimIds || []).length) errors.push(`Evidence-backed adaptation rule ${ruleKey} has no claim.`);
  }
  return {
    valid: errors.length === 0,
    scienceVersion: ADAPTATION_SCIENCE_VERSION,
    sourceCount: Object.keys(ADAPTATION_SOURCES).length,
    claimCount: Object.keys(ADAPTATION_CLAIMS).length,
    ruleBindingCount: Object.keys(ADAPTATION_RULE_BINDINGS).length,
    errors,
  };
}
