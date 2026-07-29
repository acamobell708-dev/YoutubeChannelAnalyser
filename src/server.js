import { createVideoAnalyser } from "./analysis/analyseVideo.js";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { CommentSummarizer } from "./services/commentSummarizer.js";
import { YouTubeDataClient } from "./services/youtubeDataClient.js";

const youtubeClient = new YouTubeDataClient({
  apiKey: config.youtubeApiKey,
});
const summarizer = new CommentSummarizer({
  apiKey: config.openaiApiKey || "not-configured",
  model: config.openaiModel,
});
const analyseVideo = createVideoAnalyser({ youtubeClient, summarizer });
const app = createApp({ config, analyseVideo });

const server = app.listen(config.port, () => {
  console.log(
    `YouTube Video Analyser is running at http://localhost:${config.port}/VideoDashboard.html`,
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
