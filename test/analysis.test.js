import test from "node:test";
import assert from "node:assert/strict";

import { createVideoAnalyser } from "../src/analysis/analyseVideo.js";
import { runSanityChecks } from "../src/analysis/sanity.js";
import { calculateVideoMetrics } from "../src/analysis/videoMetrics.js";
import { FEEDBACK_CATEGORIES } from "../src/analysis/videoInsightSchema.js";
import { VideoInsightAnalyst } from "../src/services/videoInsightAnalyst.js";

const VIDEO_ID = "dQw4w9WgXcQ";
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
const CHANNEL_ID = `UC${"e".repeat(22)}`;

function feedbackRows(overrides = {}) {
  return FEEDBACK_CATEGORIES.map((category) => ({
    category,
    count: overrides[category] ?? 0,
    prevalence: overrides[category] ? "recurring" : "none",
    observation: overrides[category]
      ? `Observed ${category.replaceAll("_", " ")} in the sample.`
      : `No ${category.replaceAll("_", " ")} was observed in the sample.`,
    confidence: "high",
  }));
}

const insightAnalysis = {
  packaging: {
    titleClarity: "clear",
    thumbnailClarity: "clear",
    titleThumbnailAlignment: "strong",
    contentMismatchRisk: "low",
    observation: "The title and thumbnail communicate the same tutorial topic.",
    evidence: ["Both use the same central phrase."],
    limitation: "The assessment compares public packaging and metadata only.",
  },
  audience: {
    overallSentiment: "positive",
    executiveSummary: "Viewers praise the explanation and request a follow-up.",
    feedbackRows: feedbackRows({ praise: 2, requests: 1 }),
    timestampedReactions: [
      {
        timestamp: "1:20",
        seconds: 80,
        sentiment: "positive",
        observation: "A viewer highlighted the worked example.",
        commentCount: 1,
        confidence: "high",
      },
    ],
    limitations: ["The sample is public and may not represent silent viewers."],
  },
};

const video = {
  sourceUrl: VIDEO_URL,
  videoId: VIDEO_ID,
  title: "Example video",
  channel: "Example channel",
  channelId: CHANNEL_ID,
  description: "A worked tutorial.",
  publishedAt: "2026-01-02T12:00:00Z",
  tags: ["tutorial", "example"],
  category: { id: "27", title: "Education" },
  durationIso: "PT5M",
  durationSeconds: 300,
  captionsAvailable: true,
  definition: "hd",
  thumbnail: {
    quality: "maxres",
    url: "https://i.ytimg.com/example.jpg",
    width: 1280,
    height: 720,
  },
  thumbnailUrl: "https://i.ytimg.com/example.jpg",
  viewCount: 123456,
  likeCount: 9001,
  reportedCommentCount: 2,
  commentSampling: {
    requestedTopLevelComments: 100,
    sampledTopLevelComments: 2,
    sampledReplies: 1,
    completeReplyThreads: 1,
    truncatedReplyThreads: 0,
    commentsDisabled: false,
    top: 1,
    recent: 1,
    highlyLiked: 1,
  },
  comments: [
    {
      id: "comment-1",
      text: "Great video, especially 1:20!",
      author: "A",
      likeCount: 8,
      sampleGroups: ["top", "highlyLiked"],
      timestamps: [{ label: "1:20", seconds: 80 }],
      replies: [
        {
          id: "reply-1",
          text: "Agreed.",
          author: "B",
          likeCount: 1,
        },
      ],
    },
    {
      id: "comment-2",
      text: "Please make a follow-up.",
      author: "C",
      likeCount: 1,
      sampleGroups: ["recent"],
      timestamps: [],
      replies: [],
    },
  ],
};

test("VideoInsightAnalyst requests strict GPT-5.4 vision output", async () => {
  let request;
  const client = {
    responses: {
      create: async (options) => {
        request = options;
        return { output_text: JSON.stringify(insightAnalysis) };
      },
    },
  };
  const analyst = new VideoInsightAnalyst({
    apiKey: "test-openai-key",
    client,
  });

  const result = await analyst.analyse(video);

  assert.equal(result.analysedCommentCount, 2);
  assert.equal(request.model, "gpt-5.4");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.match(request.instructions, /untrusted quoted data/i);
  assert.match(request.instructions, /Do not calculate or discuss views/i);
  assert.equal(
    request.input[0].content.some(
      (item) =>
        item.type === "input_image" &&
        item.image_url === video.thumbnailUrl,
    ),
    true,
  );
  const textInput = request.input[0].content.find(
    (item) => item.type === "input_text",
  ).text;
  assert.doesNotMatch(textInput, /123456/);
  assert.equal(result.analysis.audience.feedbackRows.length, 8);
});

test("VideoInsightAnalyst rejects structured output with impossible counts", async () => {
  const invalid = structuredClone(insightAnalysis);
  invalid.audience.feedbackRows[0].count = 999;
  const analyst = new VideoInsightAnalyst({
    apiKey: "test-openai-key",
    client: {
      responses: {
        create: async () => ({ output_text: JSON.stringify(invalid) }),
      },
    },
  });

  await assert.rejects(
    () => analyst.analyse(video),
    (error) => error.code === "INVALID_OPENAI_STRUCTURED_ANALYSIS",
  );
});

test("video analyser returns client-safe metadata, metrics, and insights", async () => {
  const youtubeClient = {
    fetchVideo: async () => video,
    fetchChannelById: async (channelId) => {
      assert.equal(channelId, CHANNEL_ID);
      return {
        videos: [
          {
            videoId: "larger-video",
            viewCount: 200000,
            commentCount: 10,
          },
          {
            videoId: VIDEO_ID,
            viewCount: video.viewCount,
            commentCount: video.reportedCommentCount,
          },
          {
            videoId: "smaller-video",
            viewCount: 50000,
            commentCount: 1,
          },
        ],
      };
    },
  };
  const insightAnalyst = {
    analyse: async () => ({
      analysis: insightAnalysis,
      analysedCommentCount: 2,
    }),
  };
  const analyseVideo = createVideoAnalyser({
    youtubeClient,
    insightAnalyst,
    now: () => Date.parse("2026-01-04T12:00:00Z"),
  });

  const result = await analyseVideo({
    url: VIDEO_URL,
    maxComments: 100,
  });

  assert.equal(result.video.videoId, VIDEO_ID);
  assert.equal(result.video.sampledCommentCount, 2);
  assert.equal(result.video.comments, undefined);
  assert.deepEqual(result.video.tags, ["tutorial", "example"]);
  assert.equal(result.video.category.title, "Education");
  assert.equal(result.metrics.viewsPerDay, 61728);
  assert.equal(result.metrics.likesPer100Views, 7.29);
  assert.equal(result.metrics.channelLifetimeRanking.views.rank, 2);
  assert.equal(result.metrics.channelLifetimeRanking.comments.rank, 2);
  assert.equal(result.metrics.first24Hours.status, "historical_unavailable");
  assert.equal(
    result.insights.audience.feedbackRows.find(
      (row) => row.category === "praise",
    ).percentOfAnalysed,
    100,
  );
  assert.equal(result.sanity.passed, true);
  assert.match(result.sanity.checks.join(" "), /structured shape/i);
});

test("first-day performance is a live snapshot without a fabricated rank", () => {
  const metrics = calculateVideoMetrics(
    {
      ...video,
      publishedAt: "2026-01-04T00:00:00Z",
    },
    [],
    () => Date.parse("2026-01-04T12:00:00Z"),
  );

  assert.equal(metrics.first24Hours.status, "live_snapshot");
  assert.equal(metrics.first24Hours.observedAtAgeHours, 12);
  assert.equal(metrics.first24Hours.viewsObserved, video.viewCount);
  assert.equal(metrics.first24Hours.commentsObserved, 2);
  assert.equal(metrics.first24Hours.viewRank, null);
  assert.equal(metrics.first24Hours.commentRank, null);
  assert.match(metrics.first24Hours.explanation, /lifetime totals/i);
});

test("sanity check identifies a mismatched video ID", () => {
  const sanity = runSanityChecks({
    video: {
      ...video,
      videoId: "aaaaaaaaaaa",
      sampledCommentCount: 2,
    },
    metrics: {
      viewsPerDay: 100,
      likesPer100Views: 1,
      commentsPer100Views: 0.1,
      first24Hours: {
        status: "historical_unavailable",
        viewRank: null,
        commentRank: null,
      },
    },
    insights: insightAnalysis,
  });

  assert.equal(sanity.passed, false);
  assert.match(sanity.errors.join(" "), /does not match/i);
});
