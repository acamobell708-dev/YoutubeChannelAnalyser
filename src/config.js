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
  "your_google_oauth_client_id_here",
  "your_google_oauth_client_secret_here",
  "generate_a_random_secret_of_at_least_32_characters",
]);

function readSecret(name) {
  return (process.env[name] ?? "").trim();
}

function isConfigured(value) {
  return !PLACEHOLDERS.has(value.toLowerCase());
}

function enabledFlag(value) {
  return new Set(["1", "true", "yes", "on"]).has(
    String(value ?? "").trim().toLowerCase(),
  );
}

export function loadConfig(environment = process.env) {
  const youtubeApiKey = (environment.YOUTUBE_API_KEY ?? "").trim();
  const openaiApiKey = (environment.OPENAI_API_KEY ?? "").trim();
  const openaiAdminKey = (environment.OPENAI_ADMIN_KEY ?? "").trim();
  const googleOAuthClientId = (
    environment.GOOGLE_OAUTH_CLIENT_ID ?? ""
  ).trim();
  const googleOAuthClientSecret = (
    environment.GOOGLE_OAUTH_CLIENT_SECRET ?? ""
  ).trim();
  const sessionSecret = (environment.SESSION_SECRET ?? "").trim();
  const openaiVideoModel = (
    environment.OPENAI_VIDEO_MODEL ?? "gpt-5.4"
  ).trim();
  const openaiChannelModel = (
    environment.OPENAI_CHANNEL_MODEL ?? "gpt-5.4"
  ).trim();
  const parsedPort = Number.parseInt(environment.PORT ?? "3000", 10);
  const nodeEnvironment = String(environment.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  const devFixturesEnabled =
    nodeEnvironment === "development" &&
    enabledFlag(environment.ENABLE_DEV_FIXTURES);

  const port =
    Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

  return {
    youtubeApiKey,
    openaiApiKey,
    openaiAdminKey,
    googleOAuthClientId,
    googleOAuthClientSecret,
    googleOAuthRedirectUri: (
      environment.GOOGLE_OAUTH_REDIRECT_URI ??
      `http://localhost:${port}/auth/google/callback`
    ).trim(),
    sessionSecret,
    openaiVideoModel: openaiVideoModel || "gpt-5.4",
    openaiChannelModel: openaiChannelModel || "gpt-5.4",
    port,
    devFixturesEnabled,
    hasYouTubeApiKey: isConfigured(youtubeApiKey),
    hasOpenAIApiKey: isConfigured(openaiApiKey),
    hasOpenAIAdminKey: isConfigured(openaiAdminKey),
    hasGoogleOAuth:
      isConfigured(googleOAuthClientId) &&
      isConfigured(googleOAuthClientSecret) &&
      isConfigured(sessionSecret) &&
      sessionSecret.length >= 32,
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
    openaiUsageApiConfigured: config.hasOpenAIAdminKey,
    googleOAuthConfigured: config.hasGoogleOAuth,
    devFixturesEnabled: config.devFixturesEnabled === true,
    model: config.openaiVideoModel,
    channelModel: config.openaiChannelModel,
  };
}

export const config = loadConfig({
  ...process.env,
  YOUTUBE_API_KEY: readSecret("YOUTUBE_API_KEY"),
  OPENAI_API_KEY: readSecret("OPENAI_API_KEY"),
  OPENAI_ADMIN_KEY: readSecret("OPENAI_ADMIN_KEY"),
});
