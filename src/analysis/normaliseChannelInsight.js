function text(value) {
  return String(value ?? "").trim();
}

function evidenceVideoIds(values) {
  return [...new Set((values ?? []).map(text).filter(Boolean))].slice(0, 3);
}

function finding(value) {
  return {
    ...value,
    title: text(value?.title),
    finding: text(value?.finding),
    evidenceVideoIds: evidenceVideoIds(value?.evidenceVideoIds),
    action: text(value?.action),
  };
}

export function normaliseChannelInsight(value) {
  return {
    ...value,
    summary: {
      ...value?.summary,
      headline: text(value?.summary?.headline),
      assessment: text(value?.summary?.assessment),
    },
    strengths: (value?.strengths ?? []).map(finding),
    weaknesses: (value?.weaknesses ?? []).map(finding),
    uncertainties: (value?.uncertainties ?? []).map(text).filter(Boolean),
    nextVideoDirections: (value?.nextVideoDirections ?? []).map((direction) => ({
      ...direction,
      subject: text(direction?.subject),
      rationale: text(direction?.rationale),
      hypothesis: text(direction?.hypothesis),
      evidenceVideoIds: evidenceVideoIds(direction?.evidenceVideoIds),
    })),
  };
}
