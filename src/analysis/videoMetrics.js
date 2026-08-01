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
    1 +
    comparable.filter((item) => item[field] > value).length;

  return { rank, outOf: comparable.length };
}

export function calculateVideoMetrics(
  video,
  channelVideos = [],
  now = Date.now,
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

  return {
    ageDays: round(ageDays),
    viewsPerDay:
      ageDays === null
        ? null
        : round(video.viewCount / Math.max(ageDays, MINUTE_AS_DAYS)),
    likesPer100Views: perHundred(video.likeCount, video.viewCount),
    commentsPer100Views: perHundred(
      video.reportedCommentCount,
      video.viewCount,
    ),
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
  };
}
