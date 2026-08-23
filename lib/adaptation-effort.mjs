function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedRir(value) {
  const number = finite(value);
  return number != null && number >= 0 && number <= 6 ? number : null;
}

function boundedRpe(value) {
  const number = finite(value);
  return number != null && number >= 1 && number <= 10 ? number : null;
}

export function adaptationEffortObservation(row = {}) {
  const reportedRir = boundedRir(row.rir);
  const reportedRpe = boundedRpe(row.rpe);

  if (reportedRir != null) {
    return {
      source:"rir",
      actualRir:reportedRir,
      compatibilityRpe:10 - reportedRir,
      reportedRir,
      reportedRpe,
    };
  }

  if (reportedRpe != null) {
    return {
      source:"rpe",
      actualRir:Math.max(0, 10 - reportedRpe),
      compatibilityRpe:reportedRpe,
      reportedRir:null,
      reportedRpe,
    };
  }

  return {
    source:null,
    actualRir:null,
    compatibilityRpe:null,
    reportedRir:null,
    reportedRpe:null,
  };
}

export function normalizeSetResultEffortForAdaptation(row = {}) {
  const effort = adaptationEffortObservation(row);
  return {
    ...row,
    // adaptation-plan historically consumes RPE and converts it to RIR internally.
    // This compatibility value makes direct user-reported RIR authoritative without
    // mutating the stored report or pretending Garmin measured an effort value.
    rpe:effort.compatibilityRpe,
    rir:effort.reportedRir,
    reported_rpe:effort.reportedRpe,
    adaptation_effort_source:effort.source,
    adaptation_effort_rir:effort.actualRir,
  };
}

export function normalizeSetResultEffortRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map(normalizeSetResultEffortForAdaptation);
}
