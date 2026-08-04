import { AppError } from "../errors.js";

const enumSchema = (values) => ({ type: "string", enum: values });
const confidenceSchema = enumSchema(["low", "medium", "high"]);

const findingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "finding", "evidenceVideoIds", "confidence", "action"],
  properties: {
    title: { type: "string" },
    finding: { type: "string" },
    evidenceVideoIds: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: { type: "string" },
    },
    confidence: confidenceSchema,
    action: { type: "string" },
  },
};

export const CHANNEL_INSIGHT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "strengths",
    "weaknesses",
    "uncertainties",
    "nextVideoDirections",
  ],
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["headline", "assessment", "confidence"],
      properties: {
        headline: { type: "string" },
        assessment: { type: "string" },
        confidence: confidenceSchema,
      },
    },
    strengths: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: findingSchema,
    },
    weaknesses: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: findingSchema,
    },
    uncertainties: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "string" },
    },
    nextVideoDirections: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "subject",
          "format",
          "rationale",
          "evidenceVideoIds",
          "confidence",
          "hypothesis",
        ],
        properties: {
          subject: { type: "string" },
          format: enumSchema([
            "up_to_3_minutes",
            "over_3_minutes",
            "either",
          ]),
          rationale: { type: "string" },
          evidenceVideoIds: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: { type: "string" },
          },
          confidence: confidenceSchema,
          hypothesis: { type: "string" },
        },
      },
    },
  },
};

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assertEvidence(items, allowedVideoIds, label) {
  for (const item of items) {
    if (!nonEmpty(item.title ?? item.subject)) {
      throw new Error(`${label} has an empty title.`);
    }
    if (
      ("finding" in item && (!nonEmpty(item.finding) || !nonEmpty(item.action))) ||
      ("rationale" in item &&
        (!nonEmpty(item.rationale) || !nonEmpty(item.hypothesis)))
    ) {
      throw new Error(`${label} has incomplete explanatory text.`);
    }
    if (!Array.isArray(item.evidenceVideoIds) || !item.evidenceVideoIds.length) {
      throw new Error(`${label} has no evidence video IDs.`);
    }
    if (
      item.evidenceVideoIds.some((videoId) => !allowedVideoIds.has(videoId))
    ) {
      throw new Error(`${label} references a video that was not supplied.`);
    }
  }
}

export function validateChannelInsight(
  analysis,
  {
    allowedVideoIds,
    allowedDirectionFormats = null,
  },
) {
  try {
    if (
      !nonEmpty(analysis?.summary?.headline) ||
      !nonEmpty(analysis?.summary?.assessment)
    ) {
      throw new Error("The channel summary is empty.");
    }
    if (analysis.strengths?.length !== 3 || analysis.weaknesses?.length !== 3) {
      throw new Error("Exactly three strengths and weaknesses are required.");
    }
    if (analysis.nextVideoDirections?.length !== 3) {
      throw new Error("Exactly three next-video directions are required.");
    }
    if (!analysis.uncertainties?.every(nonEmpty)) {
      throw new Error("The uncertainty list is incomplete.");
    }
    const allowed = new Set(allowedVideoIds);
    assertEvidence(analysis.strengths, allowed, "A strength");
    assertEvidence(analysis.weaknesses, allowed, "A weakness");
    assertEvidence(
      analysis.nextVideoDirections,
      allowed,
      "A next-video direction",
    );
    if (
      Array.isArray(allowedDirectionFormats) &&
      allowedDirectionFormats.length > 0 &&
      analysis.nextVideoDirections.some(
        (direction) => !allowedDirectionFormats.includes(direction.format),
      )
    ) {
      throw new Error(
        "A next-video direction does not match the selected channel lens.",
      );
    }
  } catch (error) {
    throw new AppError(
      "OpenAI returned channel findings that could not be tied to the supplied evidence.",
      {
        status: 502,
        code: "INVALID_OPENAI_STRUCTURED_ANALYSIS",
        cause: error,
      },
    );
  }
}
