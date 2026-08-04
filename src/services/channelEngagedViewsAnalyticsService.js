const ANALYTICS_START_DATE = "2019-01-01";

function nonNegativeInteger(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0
    ? Math.round(numeric)
    : null;
}

function unavailable(reason) {
  return {
    status: "unavailable",
    source: null,
    reason,
    engagedViews: null,
    views: null,
    engagedViewSharePercent: null,
    periodStart: null,
    periodEnd: null,
  };
}

function round(value, places = 1) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export class ChannelEngagedViewsAnalyticsService {
  constructor({ ownerAccess, analyticsClient, now = Date.now }) {
    this.ownerAccess = ownerAccess;
    this.analyticsClient = analyticsClient;
    this.now = now;
  }

  async fetch({ channelId, ownerSessionId }) {
    const fallback = unavailable(
      "Connect the channel owner and grant YouTube Analytics access to retrieve measured Shorts engaged views.",
    );

    try {
      const owner = await this.ownerAccess.authorise({
        ownerSessionId,
        channelId,
        requireAnalyticsAccess: true,
      });
      if (!owner.available) {
        return { ...fallback, reason: owner.reason };
      }

      const periodEnd = new Date(this.now()).toISOString().slice(0, 10);
      const rows = await this.analyticsClient.query({
        accessToken: owner.accessToken,
        ids: `channel==${channelId}`,
        startDate: ANALYTICS_START_DATE,
        endDate: periodEnd,
        metrics: ["engagedViews", "views"],
        dimensions: ["creatorContentType"],
      });
      const shortRow = rows.find(
        (row) => row.creatorContentType === "SHORTS",
      );
      const engagedViews = nonNegativeInteger(shortRow?.engagedViews) ?? 0;
      const views = nonNegativeInteger(shortRow?.views) ?? 0;

      return {
        status: "available",
        source: "youtube_owner_analytics",
        reason: null,
        engagedViews,
        views,
        engagedViewSharePercent:
          views > 0 ? round((engagedViews / views) * 100) : null,
        periodStart: ANALYTICS_START_DATE,
        periodEnd,
      };
    } catch (error) {
      console.warn(
        `Channel engaged-view Analytics retrieval failed: ${error?.message ?? "Unknown error"}`,
      );
      return {
        ...fallback,
        reason:
          "YouTube Analytics did not return a usable Shorts engaged-view summary.",
      };
    }
  }
}
