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

  async createStructured({
    model,
    instructions,
    input,
    schemaName,
    schema,
    validate,
    reasoningEffort = "low",
    maxOutputTokens = 2_500,
    errorCode = "OPENAI_STRUCTURED_ANALYSIS_ERROR",
    errorMessage = "OpenAI could not complete the structured analysis.",
  }) {
    let response;

    try {
      response = await this.client.responses.create({
        model,
        instructions,
        input,
        reasoning: { effort: reasoningEffort },
        max_output_tokens: maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            strict: true,
            schema,
          },
        },
      });
    } catch (error) {
      throw new AppError(errorMessage, {
        status: 502,
        code: errorCode,
        cause: error,
      });
    }

    const rawOutput = String(response.output_text ?? "").trim();
    if (!rawOutput) {
      throw new AppError("OpenAI returned an empty structured analysis.", {
        status: 502,
        code: "EMPTY_OPENAI_STRUCTURED_ANALYSIS",
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawOutput);
    } catch (error) {
      throw new AppError(
        "OpenAI returned structured analysis that could not be parsed.",
        {
          status: 502,
          code: "INVALID_OPENAI_STRUCTURED_JSON",
          cause: error,
        },
      );
    }

    try {
      validate?.(parsed);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        "OpenAI returned structured analysis that failed local validation.",
        {
          status: 502,
          code: "INVALID_OPENAI_STRUCTURED_ANALYSIS",
          cause: error,
        },
      );
    }

    return parsed;
  }
}
