import test from "node:test";
import assert from "node:assert/strict";

import { createChannelAnalyser } from "../src/analysis/analyseChannel.js";
import { ChannelEngagedViewsAnalyticsService } from "../src/services/channelEngagedViewsAnalyticsService.js";
import { createSyntheticChannelShortAnalysis } from "../src/fixtures/syntheticChannelShortAnalysis.js";

const CHANNEL_ID = `UC${"e".repeat(22)}`;
const NOW = Date.parse("2026-08-04T12:00:00Z");

function video(index, durationSeconds) {
  return {
    videoId: `engaged-${index}`,
    title: `Video ${index}`,
    description: "Fixture",
    publishedAt: `2026-07-${String(index).padStart(2, "0")}T12:00:00Z`,
    durationSeconds,
    viewCount: index * 1_000,
    likeCount: index * 100,
    commentCount: index * 10,
  };
}

function unavailablePerformanceResult(mode = "economy") {
  return {
    insight: {
      status: "unavailable",
      reason: "Mock AI unavailable.",
      summary: null,
      strengths: [],
      weaknesses: [],
      uncertainties: ["Mock AI unavailable."],
      nextVideoDirections: [],
    },
    suppliedVideoIds: [],
    tokenBudget: {
      mode,
      ceilingTokens: mode === "heavy" ? 10_000 : 6_500,
      actualTotalTokens: null,
      requestCount: 1,
    },
  };
}

test("channel engaged-view service returns measured Shorts owner Analytics", async () => {
  let query;
  const service = new ChannelEngagedViewsAnalyticsService({
    now: () => NOW,
    ownerAccess: {
      authorise: async () => ({ available: true, accessToken: "owner-token" }),
    },
    analyticsClient: {
      query: async (input) => {
        query = input;
        return [
          { creatorContentType: "SHORTS", engagedViews: 800, views: 1_000 },
          { creatorContentType: "VIDEO_ON_DEMAND", engagedViews: 300, views: 350 },
        ];
      },
    },
  });

  const result = await service.fetch({
    channelId: CHANNEL_ID,
    ownerSessionId: "session-id",
  });

  assert.equal(result.status, "available");
  assert.equal(result.source, "youtube_owner_analytics");
  assert.equal(result.engagedViews, 800);
  assert.equal(result.views, 1_000);
  assert.equal(result.engagedViewSharePercent, 80);
  assert.deepEqual(query.metrics, ["engagedViews", "views"]);
  assert.deepEqual(query.dimensions, ["creatorContentType"]);
  assert.equal(query.ids, `channel==${CHANNEL_ID}`);
});

test("Shorts channel analysis passes engaged views to the analyst", async () => {
  const calls = [];
  const engagedViewCalls = [];
  const videos = [video(1, 15), video(2, 30), video(3, 240)];
  const analyseChannel = createChannelAnalyser({
    now: () => NOW,
    youtubeClient: {
      fetchChannel: async () => ({
        sourceUrl: "https://www.youtube.com/@example",
        channelId: CHANNEL_ID,
        title: "Example",
        thumbnailUrl: null,
        subscriberCount: 10,
        totalViewCount: 6_000,
        videoCount: videos.length,
        analysedVideoCount: videos.length,
        videos,
      }),
    },
    channelEngagedViewsService: {
      fetch: async (input) => {
        engagedViewCalls.push(input);
        return {
          status: "available",
          source: "youtube_owner_analytics",
          reason: null,
          engagedViews: 8_000,
          views: 10_000,
          engagedViewSharePercent: 80,
          periodStart: "2019-01-01",
          periodEnd: "2026-08-04",
        };
      },
    },
    performanceAnalyst: {
      analyse: async (input) => {
        calls.push(input);
        return unavailablePerformanceResult(input.mode);
      },
    },
  });

  const result = await analyseChannel({
    url: "https://www.youtube.com/@example",
    videoType: "short",
    ownerSessionId: "session-id",
  });

  assert.equal(result.engagedViews.engagedViews, 8_000);
  assert.equal(result.catalogue.length, 2);
  assert.equal(engagedViewCalls.length, 1);
  assert.equal(engagedViewCalls[0].ownerSessionId, "session-id");
  assert.equal(calls[0].engagedViewsSummary.engagedViewSharePercent, 80);
});

test("public views are not relabelled when owner Analytics is unavailable", async () => {
  const service = new ChannelEngagedViewsAnalyticsService({
    ownerAccess: {
      authorise: async () => ({
        available: false,
        reason: "Owner Google login is required.",
      }),
    },
    analyticsClient: {
      query: async () => {
        throw new Error("must not query");
      },
    },
  });

  const result = await service.fetch({
    channelId: CHANNEL_ID,
    ownerSessionId: null,
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.engagedViews, null);
  assert.match(result.reason, /owner google login/i);
});

test("synthetic Shorts channel exposes aggregate engaged views", async () => {
  const analysis = await createSyntheticChannelShortAnalysis();

  assert.equal(analysis.engagedViews.status, "available");
  assert.equal(analysis.engagedViews.engagedViews, 205_400);
  assert.equal(analysis.engagedViews.engagedViewSharePercent, 78.6);
});
