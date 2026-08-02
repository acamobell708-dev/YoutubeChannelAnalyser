import test from "node:test";
import assert from "node:assert/strict";

import { OwnerYouTubeAccess } from "../src/services/ownerYouTubeAccess.js";
import { YouTubeAnalyticsClient } from "../src/services/youtubeAnalyticsClient.js";
import {
  analyseRetentionRows,
  YouTubeRetentionService,
} from "../src/services/youtubeRetentionService.js";
import { AppError } from "../src/errors.js";

const CHANNEL_ID = `UC${"r".repeat(22)}`;

function retentionRows() {
  return Array.from({ length: 100 }, (_, index) => {
    const ratio = (index + 1) / 100;
    const base = 1 - ratio * 0.45;
    const watch = index === 39 ? base - 0.12 : index === 69 ? base + 0.1 : base;
    return {
      elapsedVideoTimeRatio: ratio,
      audienceWatchRatio: watch,
      relativeRetentionPerformance: 0.6,
      startedWatching: index === 0 ? 100 : 0,
      stoppedWatching: index === 39 ? 14 : 1,
      totalSegmentImpressions: Math.round(watch * 100),
    };
  });
}

test("retention rows produce deterministic intro, strongest-section, dip, and spike statistics", () => {
  const result = analyseRetentionRows(retentionRows(), 100);
  assert.equal(result.points.length, 100);
  assert.equal(result.firstThirtySeconds.atSeconds, 30);
  assert.equal(result.relativePerformance.classification, "above_typical");
  assert.ok(result.strongestSection.averageRetentionPercentage > 90);
  assert.ok(result.dips.some((dip) => dip.atSeconds === 40));
  assert.ok(result.spikes.some((spike) => spike.atSeconds === 70));
});

test("retention curve remains usable without YouTube's similar-video comparison", () => {
  const rows = retentionRows().map(({ relativeRetentionPerformance, ...row }) => ({
    ...row,
    relativeRetentionPerformance: null,
  }));
  const result = analyseRetentionRows(rows, 100);

  assert.equal(result.points.length, 100);
  assert.equal(result.points[0].relativeRetentionScore, null);
  assert.equal(result.relativePerformance.averageScore, null);
  assert.equal(result.relativePerformance.classification, "unknown");
});

test("analytics client maps result-table headers to reusable row objects", async () => {
  let requestedUrl;
  const client = new YouTubeAnalyticsClient({
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      assert.equal(options.headers.Authorization, "Bearer owner-token");
      return new Response(
        JSON.stringify({
          columnHeaders: [
            { name: "averageViewDuration" },
            { name: "averageViewPercentage" },
          ],
          rows: [[42, 57.5]],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });
  const rows = await client.query({
    accessToken: "owner-token",
    startDate: "2026-01-01",
    endDate: "2026-01-02",
    metrics: ["averageViewDuration", "averageViewPercentage"],
    filters: ["video==dQw4w9WgXcQ"],
  });
  assert.deepEqual(rows, [{ averageViewDuration: 42, averageViewPercentage: 57.5 }]);
  assert.equal(requestedUrl.searchParams.get("ids"), "channel==MINE");
  assert.equal(requestedUrl.searchParams.get("filters"), "video==dQw4w9WgXcQ");
});

test("analytics client preserves the provider reason for safe retention guidance", async () => {
  const client = new YouTubeAnalyticsClient({
    fetchImpl: async () => new Response(
      JSON.stringify({
        error: {
          message: "Insufficient Permission",
          errors: [{ reason: "insufficientPermissions" }],
        },
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    ),
  });

  await assert.rejects(
    () => client.query({
      accessToken: "owner-token",
      startDate: "2026-01-01",
      endDate: "2026-01-02",
      metrics: ["audienceWatchRatio"],
    }),
    (error) => error.code === "YOUTUBE_ANALYTICS_REQUEST_FAILED" && error.providerReason === "insufficientPermissions",
  );
});

test("analytics client retries one transient timeout with the extended timeout", async () => {
  let calls = 0;
  const client = new YouTubeAnalyticsClient({
    timeoutMs: 30_000,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("The operation was aborted due to timeout");
        error.name = "TimeoutError";
        error.code = 23;
        throw error;
      }
      return new Response(
        JSON.stringify({
          columnHeaders: [{ name: "audienceWatchRatio" }],
          rows: [[0.8]],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  const rows = await client.query({
    accessToken: "owner-token",
    startDate: "2026-01-01",
    endDate: "2026-01-02",
    metrics: ["audienceWatchRatio"],
  });

  assert.equal(calls, 2);
  assert.deepEqual(rows, [{ audienceWatchRatio: 0.8 }]);
});

test("retention service requires ownership and returns browser-safe measured data", async () => {
  const ownerAccess = new OwnerYouTubeAccess({
    oauthService: {
      configured: true,
      getStatus: () => ({ connected: true, channels: [{ id: CHANNEL_ID }] }),
      getAccessToken: async () => "owner-token",
    },
  });
  let queryCount = 0;
  const service = new YouTubeRetentionService({
    ownerAccess,
    now: () => Date.parse("2026-08-01T12:00:00Z"),
    analyticsClient: {
      query: async ({ accessToken, ids, metrics, filters }) => {
        assert.equal(accessToken, "owner-token");
        assert.equal(ids, `channel==${CHANNEL_ID}`);
        assert.deepEqual(filters, ["video==dQw4w9WgXcQ"]);
        queryCount += 1;
        return metrics.includes("audienceWatchRatio") || metrics.includes("relativeRetentionPerformance") || metrics.includes("startedWatching")
          ? retentionRows()
          : [{
              estimatedMinutesWatched: 120,
              averageViewDuration: 45,
              averageViewPercentage: 62.5,
            }];
      },
    },
  });
  const result = await service.fetchVideoRetention({
    videoId: "dQw4w9WgXcQ",
    channelId: CHANNEL_ID,
    publishedAt: "2026-01-01T00:00:00Z",
    durationSeconds: 100,
    ownerSessionId: "session",
  });
  assert.equal(queryCount, 4);
  assert.equal(result.status, "available");
  assert.equal(result.source, "youtube_owner_analytics");
  assert.equal(result.overview.averageViewDurationSeconds, 45);
  assert.equal(JSON.stringify(result).includes("owner-token"), false);
});

test("retention remains available when the optional overview report fails", async () => {
  const service = new YouTubeRetentionService({
    ownerAccess: {
      authorise: async () => ({ available: true, accessToken: "owner-token" }),
    },
    now: () => Date.parse("2026-08-01T12:00:00Z"),
    analyticsClient: {
      query: async ({ metrics }) => {
        if (!metrics.includes("audienceWatchRatio")) {
          throw new AppError("Overview unavailable", {
            status: 403,
            code: "YOUTUBE_ANALYTICS_REQUEST_FAILED",
          });
        }
        return retentionRows();
      },
    },
  });

  const result = await service.fetchVideoRetention({
    videoId: "dQw4w9WgXcQ",
    channelId: CHANNEL_ID,
    publishedAt: "2026-01-01T00:00:00Z",
    durationSeconds: 100,
    ownerSessionId: "session",
  });

  assert.equal(result.status, "available");
  assert.equal(result.overview.averageViewDurationSeconds, null);
  assert.equal(result.points.length, 100);
});

test("retention retries channel==MINE when an explicit owned-channel report is empty", async () => {
  const queriedIds = [];
  const service = new YouTubeRetentionService({
    ownerAccess: {
      authorise: async () => ({ available: true, accessToken: "owner-token" }),
    },
    now: () => Date.parse("2026-08-01T12:00:00Z"),
    analyticsClient: {
      query: async ({ ids, metrics }) => {
        if (!metrics.includes("audienceWatchRatio")) return [];
        queriedIds.push(ids);
        return ids === "channel==MINE" ? retentionRows() : [];
      },
    },
  });

  const result = await service.fetchVideoRetention({
    videoId: "dQw4w9WgXcQ",
    channelId: CHANNEL_ID,
    publishedAt: "2026-01-01T00:00:00Z",
    durationSeconds: 100,
    ownerSessionId: "session",
  });

  assert.deepEqual(queriedIds, [`channel==${CHANNEL_ID}`, "channel==MINE"]);
  assert.equal(result.status, "available");
});

test("overview metrics remain available when YouTube withholds raw retention rows", async () => {
  const service = new YouTubeRetentionService({
    ownerAccess: {
      authorise: async () => ({ available: true, accessToken: "owner-token" }),
    },
    now: () => Date.parse("2026-08-01T12:00:00Z"),
    analyticsClient: {
      query: async ({ metrics }) => metrics.includes("audienceWatchRatio")
        ? []
        : [{
            averageViewDuration: 24,
            averageViewPercentage: 33.7,
            estimatedMinutesWatched: 80,
          }],
    },
  });

  const result = await service.fetchVideoRetention({
    videoId: "dQw4w9WgXcQ",
    channelId: CHANNEL_ID,
    publishedAt: "2021-02-19T00:00:00Z",
    durationSeconds: 73,
    ownerSessionId: "session",
  });

  assert.equal(result.status, "unknown");
  assert.equal(result.overview.averageViewDurationSeconds, 24);
  assert.equal(result.overview.averageViewPercentage, 33.7);
  assert.equal(result.overview.watchTimeMinutes, 80);
});

test("retention explains when Google Analytics permission must be refreshed", async () => {
  const service = new YouTubeRetentionService({
    ownerAccess: {
      authorise: async () => ({ available: true, accessToken: "owner-token" }),
    },
    now: () => Date.parse("2026-08-01T12:00:00Z"),
    analyticsClient: {
      query: async ({ metrics }) => {
        if (metrics.includes("audienceWatchRatio")) {
          throw new AppError("Forbidden", {
            status: 403,
            code: "YOUTUBE_ANALYTICS_REQUEST_FAILED",
          });
        }
        return [];
      },
    },
  });

  const result = await service.fetchVideoRetention({
    videoId: "dQw4w9WgXcQ",
    channelId: CHANNEL_ID,
    publishedAt: "2026-01-01T00:00:00Z",
    durationSeconds: 100,
    ownerSessionId: "session",
  });

  assert.equal(result.status, "unknown");
  assert.match(result.reason, /Reconnect Google/i);
});

test("retention surfaces an unexpected Analytics HTTP status without leaking provider details", async () => {
  const service = new YouTubeRetentionService({
    ownerAccess: {
      authorise: async () => ({ available: true, accessToken: "owner-token" }),
    },
    now: () => Date.parse("2026-08-01T12:00:00Z"),
    analyticsClient: {
      query: async ({ metrics }) => {
        if (metrics.includes("audienceWatchRatio")) {
          throw new AppError("Temporary provider failure", {
            status: 500,
            code: "YOUTUBE_ANALYTICS_REQUEST_FAILED",
          });
        }
        return [];
      },
    },
  });

  const result = await service.fetchVideoRetention({
    videoId: "dQw4w9WgXcQ",
    channelId: CHANNEL_ID,
    publishedAt: "2026-01-01T00:00:00Z",
    durationSeconds: 100,
    ownerSessionId: "session",
  });

  assert.match(result.reason, /HTTP 500/);
  assert.doesNotMatch(result.reason, /Temporary provider failure/);
});
