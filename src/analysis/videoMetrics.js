const DAY_MS = 86_400_000;
const MINUTE_AS_DAYS = 1 / 1_440;

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return null;
  const multiplier = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function perHundred(numerator, denominator) {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return null;
  }
  return round((numerator / denominator) * 100);
}

function rankWithinChannel(video, channelVideos, field) {
  const value = video[field];
  if (!Number.isFinite(value)) {
    return { rank: null, outOf: channelVideos.length };
  }

  const uniqueVideos = new Map(
    channelVideos.map((item) => [item.videoId, item]),
  );
  uniqueVideos.set(video.videoId, {
    ...uniqueVideos.get(video.videoId),
    ...video,
    commentCount: video.reportedCommentCount,
  });
  const comparable = [...uniqueVideos.values()].filter((item) =>
    Number.isFinite(item[field]),
  );
  const rank =
    1 + comparable.filter((item) => item[field] > value).length;

  return { rank, outOf: comparable.length };
}

function durationMatches(video, resolvedType) {
  if (!Number.isFinite(video.durationSeconds)) return false;
  return resolvedType === "short"
    ? video.durationSeconds <= 180
    : video.durationSeconds > 180;
}

export function calculateVideoMetrics(
  video,
  channelVideos = [],
  now = Date.now,
  { videoFormat = null, ownerOverview = null } = {},
) {
  const publishedAtMs = Date.parse(video.publishedAt);
  const currentTimeMs =
    typeof now === "function" ? Number(now()) : Number(now);
  const ageMs =
    Number.isFinite(publishedAtMs) && Number.isFinite(currentTimeMs)
      ? currentTimeMs - publishedAtMs
      : Number.NaN;
  const ageDays =
    Number.isFinite(ageMs) && ageMs >= 0 ? ageMs / DAY_MS : null;
  const ageDenominator =
    ageDays === null ? null : Math.max(ageDays, MINUTE_AS_DAYS);
  const engagedViews = Number(ownerOverview?.engagedViews);
  const ownerViews = Number(ownerOverview?.views);
  const subscribersGained = Number(ownerOverview?.subscribersGained);
  const subscribersLost = Number(ownerOverview?.subscribersLost);
  const resolvedType = videoFormat?.resolved ?? "standard";
  const formatCohort = channelVideos.filter((item) =>
    durationMatches(item, resolvedType),
  );
  const formatCaveat =
    resolvedType === "short"
      ? "Format-relative public ranking uses uploads up to three minutes as a proxy unless owner creatorContentType is available."
      : "Format-relative public ranking uses uploads over three minutes as a proxy unless owner creatorContentType is available.";

  return {
    ageDays: round(ageDays),
    viewsPerDay:
      ageDenominator === null
        ? null
        : round(video.viewCount / ageDenominator),
    likesPer100Views: perHundred(video.likeCount, video.viewCount),
    commentsPer100Views: perHundred(
      video.reportedCommentCount,
      video.viewCount,
    ),
    engagedViews: Number.isFinite(engagedViews) ? engagedViews : null,
    engagedViewsPerDay:
      Number.isFinite(engagedViews) && ageDenominator !== null
        ? round(engagedViews / ageDenominator)
        : null,
    engagedViewSharePercent:
      Number.isFinite(engagedViews) &&
      Number.isFinite(ownerViews) &&
      ownerViews > 0
        ? perHundred(engagedViews, ownerViews)
        : null,
    likesPer100EngagedViews: perHundred(
      Number(ownerOverview?.likes),
      engagedViews,
    ),
    commentsPer100EngagedViews: perHundred(
      Number(ownerOverview?.comments),
      engagedViews,
    ),
    sharesPer100EngagedViews: perHundred(
      Number(ownerOverview?.shares),
      engagedViews,
    ),
    netSubscribersPer100EngagedViews: perHundred(
      Number.isFinite(subscribersGained) && Number.isFinite(subscribersLost)
        ? subscribersGained - subscribersLost
        : Number.NaN,
      engagedViews,
    ),
    subscribersGained: Number.isFinite(subscribersGained)
      ? subscribersGained
      : null,
    subscribersLost: Number.isFinite(subscribersLost)
      ? subscribersLost
      : null,
    channelLifetimeRanking: {
      views: rankWithinChannel(video, channelVideos, "viewCount"),
      comments: rankWithinChannel(
        {
          ...video,
          commentCount: video.reportedCommentCount,
        },
        channelVideos,
        "commentCount",
      ),
    },
    formatRelativeRanking: {
      views: rankWithinChannel(video, formatCohort, "viewCount"),
      comments: rankWithinChannel(
        {
          ...video,
          commentCount: video.reportedCommentCount,
        },
        formatCohort,
        "commentCount",
      ),
      cohortVideoCount: formatCohort.length,
      caveat: formatCaveat,
    },
  };
}
