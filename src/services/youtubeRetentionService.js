const OVERVIEW_METRICS = [
  "estimatedMinutesWatched",
  "averageViewDuration",
  "averageViewPercentage",
];
const RETENTION_METRICS = ["audienceWatchRatio"];
const GRANULAR_RETENTION_METRICS = [
  "startedWatching",
  "stoppedWatching",
  "totalSegmentImpressions",
];
const RELATIVE_RETENTION_METRICS = ["relativeRetentionPerformance"];

const round = (value, decimals = 1) => {
  if (!Number.isFinite(Number(value))) return null;
  const multiplier = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * multiplier) / multiplier;
};

function unknown(reason, { overview = null, source = null } = {}) {
  return {
    status: "unknown",
    displayValue: "Unavailable",
    reason,
    source,
    overview,
    points: [],
    firstThirtySeconds: null,
    strongestSection: null,
    relativePerformance: null,
    dips: [],
    spikes: [],
  };
}

function unavailableFromAnalyticsError(error) {
  if (error?.code === "YOUTUBE_ANALYTICS_TIMEOUT") {
    return unknown(
      "YouTube Analytics did not respond in time after a retry. Please try again; this does not consume GPT tokens.",
    );
  }
  if (error?.code === "YOUTUBE_ANALYTICS_REQUEST_FAILED") {
    if (error.status === 401) {
      return unknown(
        "Reconnect Google to refresh the owner permission required for YouTube Analytics retention data.",
      );
    }
    if (error.status === 403) {
      if (error.providerReason === "insufficientPermissions") {
        return unknown(
          "Google was connected without the current YouTube Analytics permission. Reconnect Google and accept every requested permission.",
        );
      }
      if (error.providerReason === "accessNotConfigured") {
        return unknown(
          "YouTube Analytics is not enabled for the Cloud project that owns this app's OAuth client. Enable it in that same project, then reconnect Google.",
        );
      }
      return unknown(
        "Google is connected, but YouTube Analytics access was denied. Reconnect Google and ensure the YouTube Analytics API is enabled for this OAuth project.",
      );
    }
    if (error.status === 400) {
      return unknown(
        "YouTube Analytics could not provide a retention report for this video yet. New or low-volume videos may not have report data.",
      );
    }
    return unknown(
      `YouTube Analytics returned HTTP ${error.status ?? "unknown"} while retrieving retention. Check the server terminal for the provider reason, then try again.`,
    );
  }
  return unknown("Authorised YouTube retention data could not be retrieved.");
}

function dateOnly(value, fallback) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? fallback : parsed.toISOString().slice(0, 10);
}

function normaliseOverview(row = {}) {
  return {
    averageViewDurationSeconds: round(row.averageViewDuration, 0),
    averageViewPercentage: round(row.averageViewPercentage),
    watchTimeMinutes: round(row.estimatedMinutesWatched, 0),
  };
}

function selectChanges(points, direction) {
  const candidates = [];
  for (let index = 2; index < points.length; index += 1) {
    const baseline = (points[index - 1].audienceWatchPercentage + points[index - 2].audienceWatchPercentage) / 2;
    const change = points[index].audienceWatchPercentage - baseline;
    if ((direction === "dip" && change <= -5) || (direction === "spike" && change >= 5)) {
      candidates.push({
        atRatio: points[index].atRatio,
        atSeconds: points[index].atSeconds,
        audienceWatchPercentage: points[index].audienceWatchPercentage,
        changePercentagePoints: round(change),
        startedWatching: points[index].startedWatching,
        stoppedWatching: points[index].stoppedWatching,
      });
    }
  }
  const selected = [];
  for (const candidate of candidates.sort((left, right) =>
    Math.abs(right.changePercentagePoints) - Math.abs(left.changePercentagePoints))) {
    if (selected.every((item) => Math.abs(item.atRatio - candidate.atRatio) >= 0.04)) {
      selected.push(candidate);
    }
    if (selected.length === 3) break;
  }
  return selected.sort((left, right) => left.atSeconds - right.atSeconds);
}

function strongestSection(points, durationSeconds) {
  if (!points.length) return null;
  const eligible = points.length > 10 ? points.slice(5) : points;
  const windowSize = Math.min(5, eligible.length);
  let strongest = null;
  for (let index = 0; index <= eligible.length - windowSize; index += 1) {
    const window = eligible.slice(index, index + windowSize);
    const average = window.reduce((sum, point) => sum + point.audienceWatchPercentage, 0) / window.length;
    if (!strongest || average > strongest.averageRetentionPercentage) {
      strongest = {
        startSeconds: window[0].atSeconds,
        endSeconds: Math.min(durationSeconds, window.at(-1).atSeconds),
        averageRetentionPercentage: round(average),
      };
    }
  }
  return strongest;
}

export function analyseRetentionRows(rows, durationSeconds) {
  const points = rows
    .map((row) => {
      const relativeValue = row.relativeRetentionPerformance;
      const hasRelativeValue =
        relativeValue !== null &&
        relativeValue !== undefined &&
        relativeValue !== "" &&
        Number.isFinite(Number(relativeValue));
      return {
        atRatio: round(row.elapsedVideoTimeRatio, 2),
        atSeconds: Math.min(durationSeconds, Math.round(Number(row.elapsedVideoTimeRatio) * durationSeconds)),
        audienceWatchPercentage: round(Number(row.audienceWatchRatio) * 100),
        relativeRetentionScore: hasRelativeValue
          ? round(Number(relativeValue) * 100)
          : null,
        startedWatching: Math.max(0, Math.round(Number(row.startedWatching ?? 0))),
        stoppedWatching: Math.max(0, Math.round(Number(row.stoppedWatching ?? 0))),
        segmentImpressions: Math.max(0, Math.round(Number(row.totalSegmentImpressions ?? 0))),
      };
    })
    .filter((point) =>
      Number.isFinite(point.atRatio) &&
        Number.isFinite(point.audienceWatchPercentage),
    )
    .sort((left, right) => left.atRatio - right.atRatio);
  if (!points.length) return null;
  const thirtySecondRatio = Math.min(1, 30 / Math.max(1, durationSeconds));
  const firstThirtySeconds = points.reduce((closest, point) =>
    Math.abs(point.atRatio - thirtySecondRatio) < Math.abs(closest.atRatio - thirtySecondRatio)
      ? point
      : closest,
  points[0]);
  const relativeScores = points
    .map((point) => point.relativeRetentionScore)
    .filter(Number.isFinite);
  const averageRelativeScore = relativeScores.length
    ? round(relativeScores.reduce((sum, score) => sum + score, 0) / relativeScores.length)
    : null;
  return {
    points,
    firstThirtySeconds: {
      atSeconds: firstThirtySeconds.atSeconds,
      audienceWatchPercentage: firstThirtySeconds.audienceWatchPercentage,
    },
    strongestSection: strongestSection(points, durationSeconds),
    relativePerformance: {
      averageScore: averageRelativeScore,
      classification:
        averageRelativeScore === null
          ? "unknown"
          : averageRelativeScore >= 55
          ? "above_typical"
          : averageRelativeScore <= 45
            ? "below_typical"
            : "typical",
    },
    dips: selectChanges(points, "dip"),
    spikes: selectChanges(points, "spike"),
  };
}

export class YouTubeRetentionService {
  constructor({ ownerAccess, analyticsClient, now = Date.now }) {
    this.ownerAccess = ownerAccess;
    this.analyticsClient = analyticsClient;
    this.now = now;
  }

  async fetchVideoRetention({ videoId, channelId, publishedAt, durationSeconds, ownerSessionId }) {
    try {
      const owner = await this.ownerAccess.authorise({
        ownerSessionId,
        channelId,
        requireAnalyticsAccess: true,
      });
      if (!owner.available) return unknown(owner.reason);
      const today = new Date(this.now()).toISOString().slice(0, 10);
      const startDate = dateOnly(publishedAt, "2005-04-23");
      const request = {
        accessToken: owner.accessToken,
        // Use the verified channel rather than channel==MINE. The latter can
        // resolve to a different default channel for accounts that manage a
        // Brand channel, producing an empty report despite Studio data.
        ids: `channel==${channelId}`,
        startDate,
        endDate: today,
        filters: [`video==${videoId}`],
      };
      const [overviewResult, retentionResult, relativeRetentionResult, granularRetentionResult] = await Promise.allSettled([
        this.analyticsClient.query({ ...request, metrics: OVERVIEW_METRICS }),
        this.analyticsClient.query({
          ...request,
          metrics: RETENTION_METRICS,
          dimensions: ["elapsedVideoTimeRatio"],
        }),
        this.analyticsClient.query({
          ...request,
          metrics: RELATIVE_RETENTION_METRICS,
          dimensions: ["elapsedVideoTimeRatio"],
        }),
        this.analyticsClient.query({
          ...request,
          metrics: GRANULAR_RETENTION_METRICS,
          dimensions: ["elapsedVideoTimeRatio"],
        }),
      ]);
      if (retentionResult.status === "rejected") {
        const error = retentionResult.reason;
        console.warn(
          `YouTube retention report request failed (${error?.code ?? "UNKNOWN"}, ${error?.status ?? "n/a"}, ${error?.providerReason ?? "no-provider-reason"}): ${error?.message ?? "Unknown error"}`,
        );
        return unavailableFromAnalyticsError(retentionResult.reason);
      }
      const overview = overviewResult.status === "fulfilled"
        ? normaliseOverview(overviewResult.value[0])
        : null;
      console.info(
        `YouTube Analytics overview report returned ${overviewResult.status === "fulfilled" ? overviewResult.value.length : 0} rows for ${videoId}.`,
      );
      let retentionRows = retentionResult.value;
      if (!retentionRows.length) {
        console.info(
          `YouTube retention report returned 0 rows for ${videoId} using ${request.ids}; retrying channel==MINE.`,
        );
        retentionRows = await this.analyticsClient.query({
          ...request,
          ids: "channel==MINE",
          metrics: RETENTION_METRICS,
          dimensions: ["elapsedVideoTimeRatio"],
        });
      }
      const relativeRetentionByRatio = new Map(
        (relativeRetentionResult.status === "fulfilled"
          ? relativeRetentionResult.value
          : [])
          .map((row) => [Number(row.elapsedVideoTimeRatio), row.relativeRetentionPerformance]),
      );
      const granularRetentionByRatio = new Map(
        (granularRetentionResult.status === "fulfilled"
          ? granularRetentionResult.value
          : [])
          .map((row) => [Number(row.elapsedVideoTimeRatio), row]),
      );
      retentionRows = retentionRows.map((row) => ({
        ...row,
        relativeRetentionPerformance:
          relativeRetentionByRatio.get(Number(row.elapsedVideoTimeRatio)) ?? null,
        ...(granularRetentionByRatio.get(Number(row.elapsedVideoTimeRatio)) ?? {}),
      }));
      if (!retentionRows.length) {
        console.info(
          `YouTube retention report returned 0 rows for ${videoId} with both ${request.ids} and channel==MINE (range ${startDate} to ${today}).`,
        );
      }
      const analysed = analyseRetentionRows(retentionRows, durationSeconds);
      if (!analysed) {
        return unknown(
          "YouTube Analytics returned no raw retention points for this video, although YouTube Studio may still show its own retention chart.",
          { overview, source: overview ? "youtube_owner_analytics" : null },
        );
      }
      return {
        status: "available",
        displayValue: "Available",
        reason: null,
        source: "youtube_owner_analytics",
        overview: overview ?? normaliseOverview(),
        ...analysed,
      };
    } catch (error) {
      console.warn(
        `YouTube retention retrieval failed (${error?.code ?? "UNKNOWN"}, ${error?.status ?? "n/a"}, ${error?.providerReason ?? "no-provider-reason"}): ${error?.message ?? "Unknown error"}`,
      );
      return unavailableFromAnalyticsError(error);
    }
  }
}
