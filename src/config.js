import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { AppError } from "./errors.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(currentDirectory, "..");

dotenv.config({ path: path.join(PROJECT_ROOT, ".env"), quiet: true });

const PLACEHOLDERS = new Set([
  "",
  "replace_with_your_youtube_api_key",
  "replace_with_your_openai_api_key",
  "your_youtube_api_key_here",
  "your_openai_api_key_here",
]);

function readSecret(name) {
  return (process.env[name] ?? "").trim();
}

function isConfigured(value) {
  return !PLACEHOLDERS.has(value.toLowerCase());
}

export function loadConfig(environment = process.env) {
  const youtubeApiKey = (environment.YOUTUBE_API_KEY ?? "").trim();
  const openaiApiKey = (environment.OPENAI_API_KEY ?? "").trim();
  const openaiModel = (environment.OPENAI_MODEL ?? "gpt-5.4-mini").trim();
  const openaiChannelModel = (
    environment.OPENAI_CHANNEL_MODEL ?? "gpt-5.4"
  ).trim();
  const parsedPort = Number.parseInt(environment.PORT ?? "3000", 10);

  return {
    youtubeApiKey,
    openaiApiKey,
    openaiModel: openaiModel || "gpt-5.4-mini",
    openaiChannelModel: openaiChannelModel || "gpt-5.4",
    port: Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000,
    hasYouTubeApiKey: isConfigured(youtubeApiKey),
    hasOpenAIApiKey: isConfigured(openaiApiKey),
  };
}

export function assertAnalysisConfig(config) {
  const missing = [];
  if (!config.hasYouTubeApiKey) missing.push("YOUTUBE_API_KEY");
  if (!config.hasOpenAIApiKey) missing.push("OPENAI_API_KEY");

  if (missing.length > 0) {
    throw new AppError(
      `Server configuration is incomplete. Add ${missing.join(
        " and ",
      )} to the root .env file.`,
      { status: 503, code: "CONFIGURATION_REQUIRED" },
    );
  }
}

export function configurationStatus(config) {
  return {
    ready: config.hasYouTubeApiKey && config.hasOpenAIApiKey,
    youtubeApiConfigured: config.hasYouTubeApiKey,
    openaiConfigured: config.hasOpenAIApiKey,
    model: config.openaiModel,
    channelModel: config.openaiChannelModel,
  };
}

export const config = loadConfig({
  ...process.env,
  YOUTUBE_API_KEY: readSecret("YOUTUBE_API_KEY"),
  OPENAI_API_KEY: readSecret("OPENAI_API_KEY"),
});
