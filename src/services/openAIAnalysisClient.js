import OpenAI from "openai";

import { AppError } from "../errors.js";

export class OpenAIAnalysisClient {
  constructor({ apiKey, client }) {
    this.client = client ?? new OpenAI({ apiKey });
  }

  async createText({
    model,
    instructions,
    input,
    reasoningEffort = "low",
    maxOutputTokens = 700,
    errorCode = "OPENAI_ANALYSIS_ERROR",
    errorMessage = "OpenAI could not complete the analysis.",
  }) {
    let response;

    try {
      response = await this.client.responses.create({
        model,
        instructions,
        input,
        reasoning: { effort: reasoningEffort },
        max_output_tokens: maxOutputTokens,
      });
    } catch (error) {
      throw new AppError(errorMessage, {
        status: 502,
        code: errorCode,
        cause: error,
      });
    }

    const text = String(response.output_text ?? "").trim();
    if (!text) {
      throw new AppError("OpenAI returned an empty analysis.", {
        status: 502,
        code: "EMPTY_OPENAI_ANALYSIS",
      });
    }

    return text;
  }
}
