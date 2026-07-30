import { AppError } from "../errors.js";

export const FEEDBACK_CATEGORIES = [
  "praise",
  "criticism",
  "questions",
  "confusion",
  "requests",
  "disagreement",
  "timestamped_reactions",
  "suspected_spam_or_off_topic",
];

const enumSchema = (values) => ({ type: "string", enum: values });

export const VIDEO_INSIGHT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["packaging", "audience"],
  properties: {
    packaging: {
      type: "object",
      additionalProperties: false,
      required: [
        "titleClarity",
        "thumbnailClarity",
        "titleThumbnailAlignment",
        "contentMismatchRisk",
        "observation",
        "evidence",
        "limitation",
      ],
      properties: {
        titleClarity: enumSchema(["clear", "mixed", "unclear"]),
        thumbnailClarity: enumSchema([
          "clear",
          "mixed",
          "unclear",
          "unavailable",
        ]),
        titleThumbnailAlignment: enumSchema([
          "strong",
          "partial",
          "weak",
          "unknown",
        ]),
        contentMismatchRisk: enumSchema([
          "low",
          "medium",
          "high",
          "unknown",
        ]),
        observation: { type: "string" },
        evidence: {
          type: "array",
          items: { type: "string" },
        },
        limitation: { type: "string" },
      },
    },
    audience: {
      type: "object",
      additionalProperties: false,
      required: [
        "overallSentiment",
        "executiveSummary",
        "feedbackRows",
        "timestampedReactions",
        "limitations",
      ],
      properties: {
        overallSentiment: enumSchema([
          "positive",
          "mixed",
          "neutral",
          "negative",
          "insufficient_data",
        ]),
        executiveSummary: { type: "string" },
        feedbackRows: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "category",
              "count",
              "prevalence",
              "observation",
              "confidence",
            ],
            properties: {
              category: enumSchema(FEEDBACK_CATEGORIES),
              count: { type: "integer", minimum: 0 },
              prevalence: enumSchema([
                "none",
                "isolated",
                "recurring",
                "dominant",
              ]),
              observation: { type: "string" },
              confidence: enumSchema(["low", "medium", "high"]),
            },
          },
        },
        timestampedReactions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "timestamp",
              "seconds",
              "sentiment",
              "observation",
              "commentCount",
              "confidence",
            ],
            properties: {
              timestamp: { type: "string" },
              seconds: { type: "integer", minimum: 0 },
              sentiment: enumSchema([
                "positive",
                "mixed",
                "neutral",
                "negative",
              ]),
              observation: { type: "string" },
              commentCount: { type: "integer", minimum: 1 },
              confidence: enumSchema(["low", "medium", "high"]),
            },
          },
        },
        limitations: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
};

const PACKAGING_ENUMS = {
  titleClarity: new Set(["clear", "mixed", "unclear"]),
  thumbnailClarity: new Set(["clear", "mixed", "unclear", "unavailable"]),
  titleThumbnailAlignment: new Set([
    "strong",
    "partial",
    "weak",
    "unknown",
  ]),
  contentMismatchRisk: new Set(["low", "medium", "high", "unknown"]),
};
const SENTIMENTS = new Set([
  "positive",
  "mixed",
  "neutral",
  "negative",
  "insufficient_data",
]);
const REACTION_SENTIMENTS = new Set([
  "positive",
  "mixed",
  "neutral",
  "negative",
]);
const PREVALENCE_LEVELS = new Set([
  "none",
  "isolated",
  "recurring",
  "dominant",
]);
const CONFIDENCE_LEVELS = new Set(["low", "medium", "high"]);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

export function validateVideoInsightAnalysis(
  analysis,
  {
    analysedCommentCount,
    allowedTimestampSeconds = [],
    hasThumbnail,
  },
) {
  requireObject(analysis, "analysis");
  requireObject(analysis.packaging, "packaging");
  requireObject(analysis.audience, "audience");

  for (const [field, allowed] of Object.entries(PACKAGING_ENUMS)) {
    if (!allowed.has(analysis.packaging[field])) {
      throw new Error(`packaging.${field} has an invalid value`);
    }
  }
  requireString(analysis.packaging.observation, "packaging.observation");
  requireString(analysis.packaging.limitation, "packaging.limitation");
  if (!Array.isArray(analysis.packaging.evidence)) {
    throw new Error("packaging.evidence must be an array");
  }
  analysis.packaging.evidence.forEach((item, index) =>
    requireString(item, `packaging.evidence[${index}]`),
  );
  if (
    !hasThumbnail &&
    analysis.packaging.thumbnailClarity !== "unavailable"
  ) {
    throw new Error(
      "thumbnailClarity must be unavailable when no thumbnail was supplied",
    );
  }

  requireString(
    analysis.audience.executiveSummary,
    "audience.executiveSummary",
  );
  if (!SENTIMENTS.has(analysis.audience.overallSentiment)) {
    throw new Error("audience.overallSentiment has an invalid value");
  }
  if (!Array.isArray(analysis.audience.feedbackRows)) {
    throw new Error("audience.feedbackRows must be an array");
  }
  if (analysis.audience.feedbackRows.length !== FEEDBACK_CATEGORIES.length) {
    throw new Error("audience.feedbackRows must contain every category once");
  }

  const seenCategories = new Set();
  for (const row of analysis.audience.feedbackRows) {
    requireObject(row, "feedback row");
    if (
      !FEEDBACK_CATEGORIES.includes(row.category) ||
      seenCategories.has(row.category)
    ) {
      throw new Error("feedback categories must be valid and unique");
    }
    seenCategories.add(row.category);
    if (
      !Number.isInteger(row.count) ||
      row.count < 0 ||
      row.count > analysedCommentCount
    ) {
      throw new Error("feedback count exceeds the analysed comment sample");
    }
    requireString(row.observation, `${row.category}.observation`);
    if (!PREVALENCE_LEVELS.has(row.prevalence)) {
      throw new Error(`${row.category}.prevalence has an invalid value`);
    }
    if (!CONFIDENCE_LEVELS.has(row.confidence)) {
      throw new Error(`${row.category}.confidence has an invalid value`);
    }
  }

  if (
    analysedCommentCount === 0 &&
    analysis.audience.overallSentiment !== "insufficient_data"
  ) {
    throw new Error(
      "overall sentiment must be insufficient_data without comments",
    );
  }

  if (!Array.isArray(analysis.audience.timestampedReactions)) {
    throw new Error("audience.timestampedReactions must be an array");
  }
  const allowedTimestamps = new Set(allowedTimestampSeconds);
  for (const reaction of analysis.audience.timestampedReactions) {
    requireObject(reaction, "timestamped reaction");
    if (
      !Number.isInteger(reaction.seconds) ||
      !allowedTimestamps.has(reaction.seconds)
    ) {
      throw new Error(
        "timestamped reaction must reference a supplied comment timestamp",
      );
    }
    if (
      !Number.isInteger(reaction.commentCount) ||
      reaction.commentCount < 1 ||
      reaction.commentCount > analysedCommentCount
    ) {
      throw new Error("timestamp reaction count is outside the sample");
    }
    requireString(reaction.timestamp, "timestamped reaction timestamp");
    requireString(reaction.observation, "timestamped reaction observation");
    if (!REACTION_SENTIMENTS.has(reaction.sentiment)) {
      throw new Error("timestamped reaction sentiment has an invalid value");
    }
    if (!CONFIDENCE_LEVELS.has(reaction.confidence)) {
      throw new Error("timestamped reaction confidence has an invalid value");
    }
  }

  if (!Array.isArray(analysis.audience.limitations)) {
    throw new Error("audience.limitations must be an array");
  }
  analysis.audience.limitations.forEach((item, index) =>
    requireString(item, `audience.limitations[${index}]`),
  );

  if (seenCategories.size !== FEEDBACK_CATEGORIES.length) {
    throw new AppError(
      "The structured audience analysis omitted required categories.",
      { status: 502, code: "INCOMPLETE_VIDEO_INSIGHT_ANALYSIS" },
    );
  }
}
