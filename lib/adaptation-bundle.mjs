function clone(value) { return JSON.parse(JSON.stringify(value ?? null)); }
function arr(value) { return Array.isArray(value) ? value : []; }

function replaceExercise(payload, oldKey, replacement) {
  const next = clone(payload || {});
  next.exercises = arr(next.exercises).map((exercise) => exercise.exerciseKey === oldKey ? clone(replacement) : exercise);
  return next;
}

export function bundleAdaptationProposals(proposals = []) {
  const groups = new Map();
  for (const proposal of arr(proposals).filter((item) => item?.applied && item?.targetProgramSessionId && item?.audit)) {
    const key = proposal.targetProgramSessionId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(proposal);
  }

  const bundles = [];
  for (const [targetProgramSessionId, items] of groups.entries()) {
    const revisions = [...new Set(items.map((item) => Number(item.expectedRevision || 1)))];
    if (revisions.length !== 1) throw new Error(`Conflicting revisions for ${targetProgramSessionId}`);
    let newPayload = clone(items[0].newPayload);
    for (let i = 1; i < items.length; i += 1) {
      const item = items[i];
      newPayload = replaceExercise(newPayload, item.exerciseKey, item.audit.after_state);
    }
    bundles.push({
      targetProgramSessionId,
      expectedRevision:revisions[0],
      newPayload,
      adjustments:items.map((item) => ({
        targetKey:item.exerciseKey,
        ...clone(item.audit),
      })),
    });
  }
  return bundles;
}
