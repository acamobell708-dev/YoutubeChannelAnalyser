import { createChannelAnalyser } from "./analysis/analyseChannel.js";
import { createVideoAnalyser } from "./analysis/analyseVideo.js";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { ChannelPerformanceAnalyst } from "./services/channelPerformanceAnalyst.js";
import { DailyTokenQuota } from "./services/dailyTokenQuota.js";
import { GoogleOAuthService } from "./services/googleOAuthService.js";
import { OpenAIAnalysisClient } from "./services/openAIAnalysisClient.js";
import { OwnerYouTubeAccess } from "./services/ownerYouTubeAccess.js";
import { VideoInsightAnalyst } from "./services/videoInsightAnalyst.js";
import { YouTubeAnalyticsClient } from "./services/youtubeAnalyticsClient.js";
import { YouTubeCaptionService } from "./services/youtubeCaptionService.js";
import { YouTubeDataClient } from "./services/youtubeDataClient.js";
import { YouTubeRetentionService } from "./services/youtubeRetentionService.js";

const youtubeClient = new YouTubeDataClient({
  apiKey: config.youtubeApiKey,
});
const openAIAnalysisClient = new OpenAIAnalysisClient({
  apiKey: config.openaiApiKey || "not-configured",
});
const dailyTokenQuota = new DailyTokenQuota({ adminKey: config.openaiAdminKey });
const videoInsightAnalyst = new VideoInsightAnalyst({
  model: config.openaiVideoModel,
  analysisClient: openAIAnalysisClient,
  dailyTokenQuota,
});
const googleOAuthService = new GoogleOAuthService({
  clientId: config.googleOAuthClientId,
  clientSecret: config.googleOAuthClientSecret,
  redirectUri: config.googleOAuthRedirectUri,
  sessionSecret: config.sessionSecret,
});
const ownerYouTubeAccess = new OwnerYouTubeAccess({
  oauthService: googleOAuthService,
});
const captionService = new YouTubeCaptionService({
  oauthService: googleOAuthService,
  ownerAccess: ownerYouTubeAccess,
});
const youtubeAnalyticsClient = new YouTubeAnalyticsClient();
const retentionService = new YouTubeRetentionService({
  ownerAccess: ownerYouTubeAccess,
  analyticsClient: youtubeAnalyticsClient,
});
const performanceAnalyst = new ChannelPerformanceAnalyst({
  model: config.openaiChannelModel,
  analysisClient: openAIAnalysisClient,
  dailyTokenQuota,
});
const analyseVideo = createVideoAnalyser({
  youtubeClient,
  insightAnalyst: videoInsightAnalyst,
  captionService,
  retentionService,
});
const analyseChannel = createChannelAnalyser({
  youtubeClient,
  performanceAnalyst,
});
const app = createApp({
  config,
  analyseVideo,
  analyseChannel,
  googleOAuthService,
  dailyTokenQuota,
});

const server = app.listen(config.port, () => {
  console.log(
    `YouTube Analyser is running at http://localhost:${config.port}/VideoDashboard.html`,
  );
  if (!config.hasYouTubeApiKey || !config.hasOpenAIApiKey) {
    console.log(
      "The dashboard is available, but analysis will remain disabled until both API keys are configured in .env.",
    );
  }
});

function shutdown(signal) {
  console.log(`\n${signal} received. Closing the server.`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
