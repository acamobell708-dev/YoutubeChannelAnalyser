import {
  resolveVideoFormat,
  summariseTrafficSources,
} from "../analysis/videoFormat.js";

const OVERVIEW_METRICS = [
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
];

const ENGAGED_VIEW_METRICS = ["views", "engagedViews"];
const INTERACTION_METRICS = [
  "likes",
  "comments",
  "shares",
  "subscribersGained",
  "subscribersLost",
];

function round(value, places = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const scale = 10 ** places;
  return Math.round((numeric + Number.EPSILON) * scale) / scale;
}

function normaliseOverview(overview = {}, engagement = {}) {
  return {
    averageViewDurationSeconds: round(overview.averageViewDuration, 0),
    averageViewPercentage: round(overview.averageViewPercentage),
    watchTimeMinutes: round(overview.estimatedMinutesWatched, 0),
    views: round(engagement.views, 0),
    engagedViews: round(engagement.engagedViews, 0),
    likes: round(engagement.likes, 0),
    comments: round(engagement.comments, 0),
    shares: round(engagement.shares, 0),
    subscribersGained: round(engagement.subscribersGained, 0),
    subscribersLost: round(engagement.subscribersLost, 0),
  };
}

function unavailable(reason, requestedVideoType, sourceUrl, durationSeconds) {
  return {
    status: "unavailable",
    reason,
    videoFormat: resolveVideoFormat({
      requested: requestedVideoType,
      sourceUrl,
      durationSeconds,
    }),
    overview: null,
    discovery: {
      status: "unavailable",
      metric: "views",
      rows: [],
      reason,
      thumbnailReach: {
        status: "unavailable",
        impressions: null,
        clickThroughRate: null,
        reason:
          "Thumbnail impressions and click-through rate require YouTube Reporting API Reach reports.",
      },
    },
  };
}

export class YouTubeVideoFormatAnalyticsService {
  constructor({ ownerAccess, analyticsClient, now = Date.now }) {
    this.ownerAccess = ownerAccess;
    this.analyticsClient = analyticsClient;
    this.now = now;
  }

  async fetch({
    videoId,
    channelId,
    publishedAt,
    durationSeconds,
    sourceUrl,
    requestedVideoType = "auto",
    ownerSessionId,
  }) {
    const fallback = unavailable(
      "Owner Google login is required for engaged-view and discovery statistics.",
      requestedVideoType,
      sourceUrl,
      durationSeconds,
    );

    try {
      const owner = await this.ownerAccess.authorise({
        ownerSessionId,
        channelId,
        requireAnalyticsAccess: true,
      });
      if (!owner.available) return { ...fallback, reason: owner.reason };

      const request = {
        accessToken: owner.accessToken,
        ids: `channel==${channelId}`,
        startDate: new Date(publishedAt).toString() === "Invalid Date"
          ? "2005-04-23"
          : new Date(publishedAt).toISOString().slice(0, 10),
        endDate: new Date(this.now()).toISOString().slice(0, 10),
        filters: [`video==${videoId}`],
      };

      const [
        overviewResult,
        engagedViewResult,
        interactionResult,
        formatResult,
        trafficResult,
      ] = await Promise.allSettled([
        this.analyticsClient.query({
          ...request,
          metrics: OVERVIEW_METRICS,
        }),
        this.analyticsClient.query({
          ...request,
          metrics: ENGAGED_VIEW_METRICS,
        }),
        this.analyticsClient.query({
          ...request,
          metrics: INTERACTION_METRICS,
        }),
        this.analyticsClient.query({
          ...request,
          metrics: ENGAGED_VIEW_METRICS,
          dimensions: ["creatorContentType"],
        }),
        this.analyticsClient
          .query({
            ...request,
            metrics: ENGAGED_VIEW_METRICS,
            dimensions: ["insightTrafficSourceType"],
            sort: ["-views"],
            maxResults: 50,
          })
          .catch(() =>
            this.analyticsClient.query({
              ...request,
              metrics: ["views"],
              dimensions: ["insightTrafficSourceType"],
              sort: ["-views"],
              maxResults: 50,
            }),
          ),
      ]);

      const overviewRow =
        overviewResult.status === "fulfilled"
          ? overviewResult.value[0] ?? {}
          : {};
      const engagedViewRow =
        engagedViewResult.status === "fulfilled"
          ? engagedViewResult.value[0] ?? {}
          : {};
      const interactionRow =
        interactionResult.status === "fulfilled"
          ? interactionResult.value[0] ?? {}
          : {};
      const engagementRow = { ...interactionRow, ...engagedViewRow };
      const formatRows =
        formatResult.status === "fulfilled" ? formatResult.value : [];
      const creatorContentType =
        formatRows.find((row) =>
          ["SHORTS", "VIDEO_ON_DEMAND"].includes(row.creatorContentType),
        )?.creatorContentType ?? null;
      const videoFormat = resolveVideoFormat({
        requested: requestedVideoType,
        sourceUrl,
        durationSeconds,
        creatorContentType,
      });
      const trafficRows =
        trafficResult.status === "fulfilled" ? trafficResult.value : [];
      const discovery = summariseTrafficSources(
        trafficRows,
        videoFormat.resolved,
      );

      return {
        status:
          overviewResult.status === "fulfilled" ||
          engagedViewResult.status === "fulfilled" ||
          interactionResult.status === "fulfilled" ||
          formatResult.status === "fulfilled"
            ? "available"
            : "unavailable",
        reason:
          overviewResult.status === "rejected" &&
          engagedViewResult.status === "rejected" &&
          interactionResult.status === "rejected"
            ? "YouTube Analytics did not return owner format metrics for this video."
            : null,
        videoFormat,
        overview: normaliseOverview(overviewRow, engagementRow),
        discovery,
      };
    } catch (error) {
      console.warn(
        `YouTube format Analytics retrieval failed: ${error?.message ?? "Unknown error"}`,
      );
      return fallback;
    }
  }
}
