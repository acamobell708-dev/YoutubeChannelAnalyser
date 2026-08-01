import { FEEDBACK_CATEGORIES } from "./videoInsightSchema.js";

const PREVALENCE = new Set(["none", "isolated", "recurring", "dominant"]);
const CONFIDENCE = new Set(["low", "medium", "high"]);
const SENTIMENT = new Set([
  "positive",
  "mixed",
  "neutral",
  "negative",
  "insufficient_data",
]);
const REACTION_SENTIMENT = new Set(["positive", "mixed", "neutral", "negative"]);

const unknown = "Unknown — this individual AI finding did not pass validation.";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function feedbackPlaceholder(category) {
  return {
    category,
    count: 0,
    prevalence: "none",
    observation: unknown,
    confidence: "low",
  };
}

function validFeedbackRow(row, analysedCommentCount) {
  return (
    row &&
    FEEDBACK_CATEGORIES.includes(row.category) &&
    Number.isInteger(row.count) &&
    row.count >= 0 &&
    row.count <= analysedCommentCount &&
    PREVALENCE.has(row.prevalence) &&
    CONFIDENCE.has(row.confidence) &&
    isNonEmptyString(row.observation)
  );
}

function validReaction(reaction, allowedTimestampSeconds, analysedCommentCount) {
  return (
    reaction &&
    Number.isInteger(reaction.seconds) &&
    allowedTimestampSeconds.has(reaction.seconds) &&
    Number.isInteger(reaction.commentCount) &&
    reaction.commentCount >= 1 &&
    reaction.commentCount <= analysedCommentCount &&
    REACTION_SENTIMENT.has(reaction.sentiment) &&
    CONFIDENCE.has(reaction.confidence) &&
    isNonEmptyString(reaction.timestamp) &&
    isNonEmptyString(reaction.observation)
  );
}

function normaliseTranscript(transcript, { suppliedSegmentSeconds, durationSeconds }, warnings) {
  if (!transcript) return transcript;
  const supplied = new Set(suppliedSegmentSeconds);
  const validMoment = (moment) =>
    moment &&
    Number.isInteger(moment.atSeconds) &&
    moment.atSeconds >= 0 &&
    moment.atSeconds <= durationSeconds &&
    supplied.has(moment.atSeconds) &&
    isNonEmptyString(moment.finding);
  const validPoint = (point) =>
    point &&
    Number.isInteger(point.atSeconds) &&
    supplied.has(point.atSeconds) &&
    Number.isInteger(point.score) &&
    point.score >= 0 &&
    point.score <= 100 &&
    isNonEmptyString(point.label);

  const timeline = Array.isArray(transcript.timeline)
    ? transcript.timeline.filter(validPoint).slice(0, 5)
    : [];
  if ((transcript.timeline?.length ?? 0) !== timeline.length) {
    warnings.push("One or more transcript timeline points were withheld because their caption timestamp could not be verified.");
  }
  const strongestMoment = validMoment(transcript.strongestMoment)
    ? transcript.strongestMoment
    : null;
  const weakestMoment = validMoment(transcript.weakestMoment)
    ? transcript.weakestMoment
    : null;
  if (!strongestMoment) warnings.push("The strongest-moment transcript finding is Unknown because its caption timestamp could not be verified.");
  if (!weakestMoment) warnings.push("The weakest-moment transcript finding is Unknown because its caption timestamp could not be verified.");

  return {
    ...transcript,
    summary: isNonEmptyString(transcript.summary) ? transcript.summary : unknown,
    timeline,
    strongestMoment,
    weakestMoment,
  };
}

// Strict JSON Schema still protects types and allowed enum values. This second
// pass protects semantic facts that depend on the particular YouTube sample.
// A bad individual AI claim is withheld; it must not discard verified public data.
export function normaliseVideoInsightAnalysis(
  analysis,
  {
    analysedCommentCount,
    allowedTimestampSeconds = [],
    transcriptContext = null,
  },
) {
  const warnings = [];
  const rowsByCategory = new Map();
  for (const row of analysis.audience.feedbackRows ?? []) {
    if (validFeedbackRow(row, analysedCommentCount) && !rowsByCategory.has(row.category)) {
      rowsByCategory.set(row.category, row);
    } else {
      warnings.push("An individual audience-feedback classification was withheld because it did not match the sampled comments.");
    }
  }
  const feedbackRows = FEEDBACK_CATEGORIES.map(
    (category) => rowsByCategory.get(category) ?? feedbackPlaceholder(category),
  );
  const allowed = new Set(allowedTimestampSeconds);
  const reactions = (analysis.audience.timestampedReactions ?? []).filter((reaction) =>
    validReaction(reaction, allowed, analysedCommentCount),
  );
  if ((analysis.audience.timestampedReactions?.length ?? 0) !== reactions.length) {
    warnings.push("One or more timestamped reactions were withheld because their source timestamp could not be verified.");
  }

  const overallSentiment =
    analysedCommentCount === 0
      ? "insufficient_data"
      : SENTIMENT.has(analysis.audience.overallSentiment)
        ? analysis.audience.overallSentiment
        : "insufficient_data";

  const normalised = {
    ...analysis,
    packaging: {
      ...analysis.packaging,
      observation: isNonEmptyString(analysis.packaging.observation)
        ? analysis.packaging.observation
        : unknown,
      tagAssessment: isNonEmptyString(analysis.packaging.tagAssessment)
        ? analysis.packaging.tagAssessment
        : unknown,
      evidence: Array.isArray(analysis.packaging.evidence)
        ? analysis.packaging.evidence.filter(isNonEmptyString)
        : [],
      limitation: isNonEmptyString(analysis.packaging.limitation)
        ? analysis.packaging.limitation
        : unknown,
    },
    audience: {
      ...analysis.audience,
      overallSentiment,
      executiveSummary: isNonEmptyString(analysis.audience.executiveSummary)
        ? analysis.audience.executiveSummary
        : unknown,
      feedbackRows,
      timestampedReactions: reactions,
      limitations: [
        ...(Array.isArray(analysis.audience.limitations)
          ? analysis.audience.limitations.filter(isNonEmptyString)
          : []),
      ],
    },
  };
  if (transcriptContext) {
    normalised.transcriptAnalysis = normaliseTranscript(
      analysis.transcriptAnalysis,
      transcriptContext,
      warnings,
    );
  }
  normalised.audience.limitations.push(...warnings);
  return normalised;
}
