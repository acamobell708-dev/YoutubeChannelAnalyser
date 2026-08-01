const scoredFindingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["score", "finding"],
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    finding: { type: "string" },
  },
};

export const TRANSCRIPT_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "hook",
    "clarity",
    "structure",
    "pacing",
    "timeline",
    "strongestMoment",
    "weakestMoment",
  ],
  properties: {
    summary: { type: "string" },
    hook: scoredFindingSchema,
    clarity: scoredFindingSchema,
    structure: scoredFindingSchema,
    pacing: scoredFindingSchema,
    timeline: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["atSeconds", "label", "score"],
        properties: {
          atSeconds: { type: "integer", minimum: 0 },
          label: { type: "string" },
          score: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
    },
    strongestMoment: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["atSeconds", "finding"],
          properties: {
            atSeconds: { type: "integer", minimum: 0 },
            finding: { type: "string" },
          },
        },
      ],
    },
    weakestMoment: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["atSeconds", "finding"],
          properties: {
            atSeconds: { type: "integer", minimum: 0 },
            finding: { type: "string" },
          },
        },
      ],
    },
  },
};

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

export function validateTranscriptAnalysis(
  analysis,
  { suppliedSegmentSeconds, durationSeconds },
) {
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) {
    throw new Error("transcriptAnalysis must be an object");
  }
  requireString(analysis.summary, "transcriptAnalysis.summary");

  for (const dimension of ["hook", "clarity", "structure", "pacing"]) {
    const value = analysis[dimension];
    if (
      !value ||
      !Number.isInteger(value.score) ||
      value.score < 0 ||
      value.score > 100
    ) {
      throw new Error(`${dimension}.score must be between 0 and 100`);
    }
    requireString(value.finding, `${dimension}.finding`);
  }

  const supplied = new Set(suppliedSegmentSeconds);
  const checkMoment = (moment, label) => {
    if (
      !moment ||
      !Number.isInteger(moment.atSeconds) ||
      moment.atSeconds < 0 ||
      moment.atSeconds > durationSeconds ||
      !supplied.has(moment.atSeconds)
    ) {
      throw new Error(`${label} must reference a supplied transcript segment`);
    }
    requireString(moment.finding, `${label}.finding`);
  };
  if (analysis.strongestMoment !== null) {
    checkMoment(analysis.strongestMoment, "strongestMoment");
  }
  if (analysis.weakestMoment !== null) {
    checkMoment(analysis.weakestMoment, "weakestMoment");
  }

  if (!Array.isArray(analysis.timeline) || analysis.timeline.length > 5) {
    throw new Error("timeline must contain at most five entries");
  }
  for (const point of analysis.timeline) {
    if (
      !Number.isInteger(point.atSeconds) ||
      !supplied.has(point.atSeconds) ||
      !Number.isInteger(point.score) ||
      point.score < 0 ||
      point.score > 100
    ) {
      throw new Error("timeline entries must reference supplied segments");
    }
    requireString(point.label, "timeline.label");
  }
}
