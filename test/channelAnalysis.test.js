import test from "node:test";
import assert from "node:assert/strict";

import { createChannelAnalyser } from "../src/analysis/analyseChannel.js";
import { ChannelPerformanceAnalyst } from "../src/services/channelPerformanceAnalyst.js";

const CHANNEL_ID = `UC${"b".repeat(22)}`;

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

test("channel analyser returns deterministic client-safe top-ten rankings", async () => {
  const videos = Array.from({ length: 12 }, (_, index) =>
    makeVideo(index + 1),
  );
  let analystInput;
  const analyseChannel = createChannelAnalyser({
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
        return "- Longer tutorials appear repeatedly in both rankings.";
      },
    },
  });

  const result = await analyseChannel({
    url: "https://www.youtube.com/@example",
  });

  assert.equal(result.topByViews.length, 10);
  assert.equal(result.topByViews[0].viewCount, 12_000);
  assert.equal(result.topByViews[9].viewCount, 3_000);
  assert.equal(result.topByComments[0].commentCount, 120);
  assert.equal(result.topByComments[9].commentCount, 30);
  assert.equal(result.topByViews[0].rank, 1);
  assert.match(result.topByViews[0].videoUrl, /youtube\.com\/watch/);
  assert.equal("description" in result.topByViews[0], false);
  assert.equal(analystInput.topByViews[0].description, "Description 12");
  assert.equal(result.sanity.passed, true);
});

test("ChannelPerformanceAnalyst uses GPT-5.4 with bounded untrusted metadata", async () => {
  let request;
  const client = {
    responses: {
      create: async (payload) => {
        request = payload;
        return { output_text: "- Tutorial topics lead both rankings." };
      },
    },
  };
  const analyst = new ChannelPerformanceAnalyst({ apiKey: "test", client });
  const video = {
    ...makeVideo(1),
    description: "x".repeat(800),
  };

  const result = await analyst.analyse({
    channel: {
      title: "Example channel",
      videoCount: 1,
      analysedVideoCount: 1,
    },
    topByViews: [video],
    topByComments: [video],
  });

  assert.match(result, /Tutorial topics/);
  assert.equal(request.model, "gpt-5.4");
  assert.equal(request.reasoning.effort, "low");
  assert.match(request.instructions, /untrusted/i);
  assert.match(request.instructions, /Do not claim causation/i);
  assert.equal(request.input.includes("x".repeat(501)), false);
  assert.match(request.input, /BEGIN UNTRUSTED TOP VIDEOS/);
});
