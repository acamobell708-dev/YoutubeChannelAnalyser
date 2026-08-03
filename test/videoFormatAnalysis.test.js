import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveVideoFormat,
  summariseTrafficSources,
} from "../src/analysis/videoFormat.js";
import { enhanceRetentionAnalysis } from "../src/analysis/formatRetention.js";
import { calculateVideoMetrics } from "../src/analysis/videoMetrics.js";

test("owner creatorContentType overrides the selected analysis lens", () => {
  const format = resolveVideoFormat({
    requested: "standard",
    sourceUrl: "https://youtube.com/watch?v=abc",
    durationSeconds: 45,
    creatorContentType: "SHORTS",
  });
  assert.equal(format.resolved, "short");
  assert.equal(format.confidence, "confirmed");
});

test("public auto mode labels a duration-based Short as a proxy", () => {
  const format = resolveVideoFormat({
    requested: "auto",
    sourceUrl: "https://youtube.com/watch?v=abc",
    durationSeconds: 30,
  });
  assert.equal(format.resolved, "short");
  assert.equal(format.source, "duration_proxy");
  assert.match(format.caveat, /proxy/i);
});

test("Short retention exposes three-second, midpoint, end and replay data", () => {
  const points = Array.from({ length: 101 }, (_, index) => ({
    atRatio: index / 100,
    atSeconds: Math.round(index * 0.2),
    audienceWatchPercentage:
      index >= 70 && index <= 80 ? 108 : 100 - index * 0.4,
    relativeRetentionScore: null,
    startedWatching: 0,
    stoppedWatching: 0,
  }));
  const enhanced = enhanceRetentionAnalysis(
    {
      points,
      firstThirtySeconds: null,
      strongestSection: null,
      dips: [],
      spikes: [],
    },
    20,
    "short",
  );
  assert.ok(enhanced.firstThreeSeconds);
  assert.equal(enhanced.midpoint.atRatio, 0.5);
  assert.equal(enhanced.end.atRatio, 1);
  assert.equal(enhanced.chart.replayDetected, true);
  assert.ok(enhanced.strongestAfterHook);
  assert.ok(enhanced.events.some((event) => event.kind === "spike"));
});

test("owner Short metrics use engaged views as their denominator", () => {
  const video = {
    videoId: "abc",
    publishedAt: "2026-01-01T00:00:00Z",
    durationSeconds: 20,
    viewCount: 2_000,
    likeCount: 100,
    reportedCommentCount: 20,
  };
  const metrics = calculateVideoMetrics(
    video,
    [video],
    () => Date.parse("2026-01-11T00:00:00Z"),
    {
      videoFormat: { resolved: "short" },
      ownerOverview: {
        views: 2_000,
        engagedViews: 1_000,
        likes: 100,
        comments: 20,
        shares: 10,
        subscribersGained: 8,
        subscribersLost: 3,
      },
    },
  );
  assert.equal(metrics.engagedViewsPerDay, 100);
  assert.equal(metrics.engagedViewSharePercent, 50);
  assert.equal(metrics.likesPer100EngagedViews, 10);
  assert.equal(metrics.commentsPer100EngagedViews, 2);
  assert.equal(metrics.sharesPer100EngagedViews, 1);
  assert.equal(metrics.netSubscribersPer100EngagedViews, 0.5);
});

test("discovery grouping uses engaged views for Shorts", () => {
  const discovery = summariseTrafficSources(
    [
      { insightTrafficSourceType: "SHORTS", views: 1_000, engagedViews: 800 },
      { insightTrafficSourceType: "YT_SEARCH", views: 200, engagedViews: 100 },
      { insightTrafficSourceType: "EXT_URL", views: 100, engagedViews: 100 },
    ],
    "short",
  );
  assert.equal(discovery.metric, "engagedViews");
  assert.equal(discovery.rows[0].label, "Shorts Feed");
  assert.equal(discovery.rows[0].sharePercent, 80);
});
