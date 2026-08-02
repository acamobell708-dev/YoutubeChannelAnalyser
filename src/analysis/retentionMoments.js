function byMagnitude(left, right) {
  return Math.abs(right.changePercentagePoints) - Math.abs(left.changePercentagePoints);
}

/**
 * Picks a small, balanced set of measured changes for explanation. When both
 * types exist, each gets a place before the remaining place goes to the
 * largest change. This is shared by the prompt and browser-safe result.
 */
export function selectRetentionMomentsForExplanation(retention, maximum = 3) {
  const dips = (retention?.dips ?? [])
    .map((moment) => ({ ...moment, kind: "dip" }))
    .sort(byMagnitude);
  const spikes = (retention?.spikes ?? [])
    .map((moment) => ({ ...moment, kind: "spike" }))
    .sort(byMagnitude);
  const selected = [...dips.slice(0, 1), ...spikes.slice(0, 1)];
  const selectedKeys = new Set(selected.map((moment) => `${moment.kind}:${moment.atSeconds}`));
  const remaining = [...dips, ...spikes]
    .filter((moment) => !selectedKeys.has(`${moment.kind}:${moment.atSeconds}`))
    .sort(byMagnitude);
  return [...selected, ...remaining.slice(0, Math.max(0, maximum - selected.length))];
}
