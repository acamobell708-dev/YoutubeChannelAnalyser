import test from "node:test";
import assert from "node:assert/strict";

import { createChannelAnalyser } from "../src/analysis/analyseChannel.js";
import { calculateChannelMetrics } from "../src/analysis/channelMetrics.js";
import { selectChannelEvidence } from "../src/analysis/selectChannelEvidence.js";
import { ChannelPerformanceAnalyst } from "../src/services/channelPerformanceAnalyst.js";

const CHANNEL_ID = `UC${"b".repeat(22)}`;
const NOW = Date.parse("2026-02-01T12:00:00Z");

function makeVideo(index) {
  return {
    videoId: `video-${String(index).padStart(2, "0")}`,
    title: `Video ${index}`,
    description: `Description ${index}`,
    publishedAt: `2026-01-${String(index).padStart(2, "0")}T12:00:00Z`,
    durationSeconds: index * 60,
    viewCount: index * 1_000,
    likeCount: index * 100,
    commentCount: (13 - index) * 10,
  };
}

function unavailablePerformanceResult(mode = "economy") {
  return {
    insight: {
      status: "unavailable",
      reason: "Mock AI unavailable; deterministic metrics remain available.",
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

function structuredInsight(videoIds) {
  const finding = (title) => ({
    title,
    finding: `${title} is supported by the selected public evidence.`,
    evidenceVideoIds: [videoIds[0]],
    confidence: "medium",
    action: `Test ${title.toLowerCase()} in a future upload.`,
  });
  return {
    summary: {
      headline: "Age-normalised reach is concentrated",
      assessment: "Selected videos show repeatable public patterns, with private analytics still unavailable.",
      confidence: "medium",
    },
    strengths: [finding("Clear topics"), finding("Repeat formats"), finding("Public engagement")],
    weaknesses: [finding("Uneven reach"), finding("Weak conversion proxy"), finding("Small cohorts")],
    uncertainties: ["Public data does not include retention."],
    nextVideoDirections: ["Follow-up", "Focused tutorial", "Short test"].map((subject, index) => ({
      subject,
      format: index === 2 ? "up_to_3_minutes" : "over_3_minutes",
      rationale: "The selected evidence supports testing this direction.",
      evidenceVideoIds: [videoIds[index % videoIds.length]],
      confidence: "medium",
      hypothesis: "A similar topic with clearer packaging may outperform the channel median.",
    })),
  };
}

test("channel analyser returns deterministic whole-catalogue intelligence", async () => {
  const videos = Array.from({ length: 12 }, (_, index) => makeVideo(index + 1));
  let analystInput;
  const analyseChannel = createChannelAnalyser({
    now: () => NOW,
    youtubeClient: {
      fetchChannel: async () => ({
        sourceUrl: "https://www.youtube.com/@example",
        channelId: CHANNEL_ID,
        title: "Example channel",
        thumbnailUrl: null,
        subscriberCount: 500,
        totalViewCount: 78_000,
        videoCount: 12,
        analysedVideoCount: 12,
        videos,
      }),
    },
    performanceAnalyst: {
      analyse: async (input) => {
        analystInput = input;
        return unavailablePerformanceResult(input.mode);
      },
    },
  });

  const result = await analyseChannel({
    url: "https://www.youtube.com/@example",
    analysisMode: "economy",
  });

  assert.equal(result.catalogue.length, 12);
  assert.equal(result.topByViews.length, 10);
  assert.equal(result.topByViews[0].viewCount, 12_000);
  assert.equal(result.topByComments[0].commentCount, 120);
  assert.equal(result.topByViews[0].rank, 1);
  assert.match(result.topByViews[0].videoUrl, /youtube\.com\/watch/);
  assert.equal("description" in result.topByViews[0], false);
  assert.ok(result.catalogue.every((video) => Number.isFinite(video.viewsPerDay)));
  assert.ok(result.catalogue.every((video) => video.percentiles.viewsPerDay <= 100));
  assert.equal(result.durationCohorts.reduce((sum, cohort) => sum + cohort.videoCount, 0), 12);
  assert.equal(analystInput.representativeVideos.length <= 12, true);
  assert.equal(analystInput.representativeVideos[0].description.startsWith("Description"), true);
  assert.equal(result.tokenBudget.ceilingTokens, 6_500);
  assert.equal(result.sanity.passed, true);
});

test("channel metrics distinguish age-normalised reach and fair cohorts", () => {
  const metrics = calculateChannelMetrics(
    [
      { ...makeVideo(1), publishedAt: "2026-01-31T12:00:00Z", viewCount: 1_000, durationSeconds: 120 },
      { ...makeVideo(2), publishedAt: "2026-01-02T12:00:00Z", viewCount: 2_000, durationSeconds: 140 },
      { ...makeVideo(3), publishedAt: "2025-01-01T12:00:00Z", viewCount: 20_000, durationSeconds: 900 },
      { ...makeVideo(4), publishedAt: "2025-01-02T12:00:00Z", viewCount: 10_000, durationSeconds: 920 },
    ],
    () => NOW,
  );
  const newest = metrics.videos.find((video) => video.videoId === "video-01");
  const oldest = metrics.videos.find((video) => video.videoId === "video-03");
  assert.ok(newest.viewsPerDay > oldest.viewsPerDay);
  assert.equal(newest.formatGroup, "up_to_3_minutes");
  assert.equal(oldest.formatGroup, "over_3_minutes");
  assert.ok(Number.isFinite(newest.cohortPercentiles.viewsPerDay));
});

test("ChannelPerformanceAnalyst uses strict structured output and evidence IDs", async () => {
  let request;
  const videos = Array.from({ length: 12 }, (_, index) => makeVideo(index + 1));
  const channelMetrics = calculateChannelMetrics(videos, () => NOW);
  const representativeVideos = selectChannelEvidence(channelMetrics, 12);
  const output = structuredInsight(representativeVideos.map((video) => video.videoId));
  const client = {
    responses: {
      create: async (payload) => {
        request = payload;
        return {
          output_text: JSON.stringify(output),
          usage: { input_tokens: 1_200, output_tokens: 700, total_tokens: 1_900 },
        };
      },
    },
  };
  const analyst = new ChannelPerformanceAnalyst({ apiKey: "test", client });

  const result = await analyst.analyse({
    channel: { title: "Example channel", videoCount: 12, analysedVideoCount: 12 },
    channelMetrics,
    representativeVideos,
    mode: "economy",
  });

  assert.equal(result.insight.status, "available");
  assert.equal(result.insight.strengths.length, 3);
  assert.equal(result.tokenBudget.actualTotalTokens, 1_900);
  assert.equal(request.model, "gpt-5.4");
  assert.equal(request.reasoning.effort, "none");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.match(request.instructions, /untrusted quoted data/i);
  assert.match(request.instructions, /duration-and-age cohort/i);
  assert.match(request.input, /BEGIN UNTRUSTED CHANNEL EVIDENCE/);
  assert.equal(request.max_output_tokens, 2_800);
});

test("invalid AI evidence degrades without discarding channel metrics", async () => {
  const videos = Array.from({ length: 8 }, (_, index) => makeVideo(index + 1));
  const channelMetrics = calculateChannelMetrics(videos, () => NOW);
  const representativeVideos = selectChannelEvidence(channelMetrics, 12);
  const output = structuredInsight(representativeVideos.map((video) => video.videoId));
  output.strengths[0].evidenceVideoIds = ["invented-video-id"];
  const analyst = new ChannelPerformanceAnalyst({
    apiKey: "test",
    client: {
      responses: {
        create: async () => ({ output_text: JSON.stringify(output) }),
      },
    },
  });

  const result = await analyst.analyse({
    channel: { title: "Example", videoCount: 8, analysedVideoCount: 8 },
    channelMetrics,
    representativeVideos,
  });
  assert.equal(result.insight.status, "unavailable");
  assert.match(result.insight.reason, /deterministic channel metrics/i);
});
