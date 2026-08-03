const DAY_MS = 86_400_000;
const RECENT_MOMENTUM_WINDOW_DAYS = 20;

function round(value, places = 2) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function mean(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length
    ? usable.reduce((total, value) => total + value, 0) / usable.length
    : null;
}

export function median(values) {
  const usable = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2
    ? usable[middle]
    : (usable[middle - 1] + usable[middle]) / 2;
}

function ratePer100(count, views) {
  return Number.isFinite(count) && Number.isFinite(views) && views > 0
    ? round((count / views) * 100)
    : null;
}

function publishedTimestamp(value) {
  const timestamp = new Date(value).valueOf();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function durationBucket(durationSeconds) {
  if (!Number.isFinite(durationSeconds)) return "unknown_duration";
  if (durationSeconds <= 180) return "up_to_3_minutes";
  if (durationSeconds <= 600) return "3_to_10_minutes";
  if (durationSeconds <= 1_200) return "10_to_20_minutes";
  return "over_20_minutes";
}

function publicationAgeBucket(ageDays) {
  if (!Number.isFinite(ageDays)) return "unknown_age";
  if (ageDays <= 30) return "up_to_30_days";
  if (ageDays <= 90) return "31_to_90_days";
  if (ageDays <= 365) return "91_to_365_days";
  return "over_365_days";
}

function percentileRank(value, values) {
  if (!Number.isFinite(value)) return null;
  const usable = values.filter(Number.isFinite);
  if (!usable.length) return null;
  const below = usable.filter((candidate) => candidate < value).length;
  const equal = usable.filter((candidate) => candidate === value).length;
  return round(((below + equal / 2) / usable.length) * 100, 1);
}

function addPercentiles(videos, cohortSelector = () => true) {
  const metrics = [
    "viewCount",
    "viewsPerDay",
    "likesPer100Views",
    "commentsPer100Views",
    "engagementPer100Views",
  ];
  return videos.map((video) => {
    const cohort = videos.filter((candidate) => cohortSelector(video, candidate));
    return {
      ...video,
      percentiles: Object.fromEntries(
        metrics.map((metric) => [
          metric,
          percentileRank(video[metric], videos.map((candidate) => candidate[metric])),
        ]),
      ),
      cohortPercentiles: Object.fromEntries(
        metrics.map((metric) => [
          metric,
          percentileRank(video[metric], cohort.map((candidate) => candidate[metric])),
        ]),
      ),
      cohortSize: cohort.length,
    };
  });
}

function summariseVideos(videos) {
  return {
    videoCount: videos.length,
    totalViews: videos.reduce((total, video) => total + video.viewCount, 0),
    medianViews: round(median(videos.map((video) => video.viewCount))),
    medianViewsPerDay: round(median(videos.map((video) => video.viewsPerDay))),
    medianEngagementPer100Views: round(
      median(videos.map((video) => video.engagementPer100Views)),
    ),
  };
}

function summariseDurationBuckets(videos) {
  const buckets = [
    "up_to_3_minutes",
    "3_to_10_minutes",
    "10_to_20_minutes",
    "over_20_minutes",
    "unknown_duration",
  ];
  const allViews = videos.reduce((total, video) => total + video.viewCount, 0);
  return buckets
    .map((bucket) => {
      const members = videos.filter((video) => video.durationBucket === bucket);
      if (!members.length) return null;
      const summary = summariseVideos(members);
      return {
        id: bucket,
        ...summary,
        shareOfCataloguePercent: round((members.length / videos.length) * 100, 1),
        shareOfViewsPercent: allViews > 0
          ? round((summary.totalViews / allViews) * 100, 1)
          : null,
      };
    })
    .filter(Boolean);
}

function uploadCadence(videos) {
  const timestamps = videos
    .map((video) => video.publishedTimestamp)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const gaps = timestamps
    .slice(1)
    .map((timestamp, index) => (timestamp - timestamps[index]) / DAY_MS);
  const spanDays = timestamps.length > 1
    ? (timestamps.at(-1) - timestamps[0]) / DAY_MS
    : null;
  return {
    medianGapDays: round(median(gaps), 1),
    meanGapDays: round(mean(gaps), 1),
    uploadsPer30Days:
      Number.isFinite(spanDays) && spanDays > 0
        ? round(((timestamps.length - 1) / spanDays) * 30, 2)
        : null,
    measuredGapCount: gaps.length,
  };
}

function performanceConcentration(videos) {
  const viewCounts = videos.map((video) => video.viewCount);
  const totalViews = viewCounts.reduce((total, value) => total + value, 0);
  const topFiveViews = [...viewCounts]
    .sort((left, right) => right - left)
    .slice(0, 5)
    .reduce((total, value) => total + value, 0);
  const averageViewsPerDay = mean(videos.map((video) => video.viewsPerDay));
  const variance = Number.isFinite(averageViewsPerDay)
    ? mean(
        videos.map((video) =>
          (video.viewsPerDay - averageViewsPerDay) ** 2,
        ),
      )
    : null;
  const coefficientOfVariation =
    Number.isFinite(variance) && averageViewsPerDay > 0
      ? Math.sqrt(variance) / averageViewsPerDay
      : null;
  const topFiveViewSharePercent = totalViews > 0
    ? round((topFiveViews / totalViews) * 100, 1)
    : null;

  let classification = "mixed";
  if (videos.length < 10) classification = "insufficient_sample";
  else if (
    topFiveViewSharePercent >= 80 ||
    coefficientOfVariation >= 1.5
  ) classification = "hit_driven";
  else if (
    topFiveViewSharePercent <= 55 &&
    coefficientOfVariation < 1
  ) classification = "distributed";

  return {
    topFiveViewSharePercent,
    coefficientOfVariation: round(coefficientOfVariation, 2),
    classification,
  };
}

function momentumWindow(videos, nowTimestamp, startDaysAgo, endDaysAgo) {
  const start = nowTimestamp - startDaysAgo * DAY_MS;
  const end = nowTimestamp - endDaysAgo * DAY_MS;
  return videos.filter(
    (video) =>
      Number.isFinite(video.publishedTimestamp) &&
      video.publishedTimestamp >= start &&
      video.publishedTimestamp < end,
  );
}

function recentMomentum(videos, nowTimestamp) {
  const windowDays = RECENT_MOMENTUM_WINDOW_DAYS;
  const recent = momentumWindow(videos, nowTimestamp, windowDays, 0);
  const previous = momentumWindow(videos, nowTimestamp, windowDays * 2, windowDays);
  const recentSummary = summariseVideos(recent);
  const previousSummary = summariseVideos(previous);
  const previousMedian = previousSummary.medianViewsPerDay;
  const changePercent = Number.isFinite(previousMedian) && previousMedian > 0
    ? round(
        ((recentSummary.medianViewsPerDay - previousMedian) / previousMedian) *
          100,
        1,
      )
    : null;
  let classification = "steady";
  if (recent.length < 2 || previous.length < 2) {
    classification = "insufficient_sample";
  } else if (changePercent >= 20) {
    classification = "improving";
  } else if (changePercent <= -20) {
    classification = "declining";
  }
  return {
    windowDays,
    recent: recentSummary,
    previous: previousSummary,
    medianViewsPerDayChangePercent: changePercent,
    classification,
  };
}

function sorted(videos, selector, direction = "descending") {
  const multiplier = direction === "ascending" ? 1 : -1;
  return [...videos].sort((left, right) => {
    const leftValue = selector(left);
    const rightValue = selector(right);
    if (!Number.isFinite(leftValue) && !Number.isFinite(rightValue)) {
      return left.videoId.localeCompare(right.videoId);
    }
    if (!Number.isFinite(leftValue)) return 1;
    if (!Number.isFinite(rightValue)) return -1;
    return (leftValue - rightValue) * multiplier ||
      left.videoId.localeCompare(right.videoId);
  });
}

function findOutliers(videos) {
  const highReachLowEngagement = videos.filter(
    (video) =>
      video.percentiles.viewsPerDay >= 75 &&
      Number.isFinite(video.percentiles.engagementPer100Views) &&
      video.percentiles.engagementPer100Views <= 25,
  );
  const lowReachHighEngagement = videos.filter(
    (video) =>
      video.percentiles.viewsPerDay <= 25 &&
      Number.isFinite(video.percentiles.engagementPer100Views) &&
      video.percentiles.engagementPer100Views >= 75,
  );
  const breakout = videos.filter(
    (video) =>
      video.percentiles.viewsPerDay >= 90 &&
      video.cohortPercentiles.viewsPerDay >= 75,
  );
  const fairPeerUnderperformers = videos.filter(
    (video) =>
      video.ageDays >= 14 &&
      video.cohortSize >= 4 &&
      video.cohortPercentiles.viewsPerDay <= 25,
  );
  const consistentPerformers = videos.filter(
    (video) =>
      video.percentiles.viewsPerDay >= 60 &&
      video.percentiles.engagementPer100Views >= 60,
  );
  return {
    highReachLowEngagement: sorted(
      highReachLowEngagement,
      (video) => video.viewsPerDay,
    ),
    lowReachHighEngagement: sorted(
      lowReachHighEngagement,
      (video) => video.engagementPer100Views,
    ),
    breakout: sorted(breakout, (video) => video.viewsPerDay),
    fairPeerUnderperformers: sorted(
      fairPeerUnderperformers,
      (video) => video.cohortPercentiles.viewsPerDay,
      "ascending",
    ),
    consistentPerformers: sorted(
      consistentPerformers,
      (video) =>
        video.percentiles.viewsPerDay +
        video.percentiles.engagementPer100Views,
    ),
  };
}

export function calculateChannelMetrics(videos, now = Date.now) {
  const nowTimestamp = typeof now === "function" ? now() : now;
  const baseVideos = videos.map((video) => {
    const timestamp = publishedTimestamp(video.publishedAt);
    const exactAgeDays = Number.isFinite(timestamp)
      ? Math.max(1, (nowTimestamp - timestamp) / DAY_MS)
      : null;
    const likesPer100Views = ratePer100(video.likeCount, video.viewCount);
    const commentsPer100Views = ratePer100(
      video.commentCount,
      video.viewCount,
    );
    const engagementPer100Views = Number.isFinite(video.likeCount)
      ? ratePer100(video.likeCount + video.commentCount, video.viewCount)
      : null;
    const bucket = durationBucket(video.durationSeconds);
    const ageBucket = publicationAgeBucket(exactAgeDays);
    return {
      ...video,
      publishedTimestamp: timestamp,
      ageDays: round(exactAgeDays, 1),
      viewsPerDay:
        Number.isFinite(exactAgeDays) && exactAgeDays > 0
          ? round(video.viewCount / exactAgeDays, 2)
          : null,
      likesPer100Views,
      commentsPer100Views,
      engagementPer100Views,
      durationBucket: bucket,
      formatGroup:
        bucket === "up_to_3_minutes"
          ? "up_to_3_minutes"
          : bucket === "unknown_duration"
            ? "unknown_duration"
            : "over_3_minutes",
      publicationAgeBucket: ageBucket,
      cohortKey: `${bucket}:${ageBucket}`,
    };
  });
  const enrichedVideos = addPercentiles(
    baseVideos,
    (video, candidate) => candidate.cohortKey === video.cohortKey,
  );
  const medianViewsPerDay = median(
    enrichedVideos.map((video) => video.viewsPerDay),
  );
  const aboveMedianCount = enrichedVideos.filter(
    (video) => video.viewsPerDay > medianViewsPerDay,
  ).length;
  return {
    summary: {
      ...summariseVideos(enrichedVideos),
      meanViews: round(mean(enrichedVideos.map((video) => video.viewCount))),
      meanViewsPerDay: round(
        mean(enrichedVideos.map((video) => video.viewsPerDay)),
      ),
      meanEngagementPer100Views: round(
        mean(enrichedVideos.map((video) => video.engagementPer100Views)),
      ),
      aboveMedianViewsPerDayCount: aboveMedianCount,
      aboveMedianViewsPerDayPercent: round(
        (aboveMedianCount / enrichedVideos.length) * 100,
        1,
      ),
      ...performanceConcentration(enrichedVideos),
      uploadCadence: uploadCadence(enrichedVideos),
    },
    durationCohorts: summariseDurationBuckets(enrichedVideos),
    recentMomentum: recentMomentum(enrichedVideos, nowTimestamp),
    outliers: findOutliers(enrichedVideos),
    videos: enrichedVideos.sort(
      (left, right) =>
        (right.publishedTimestamp ?? 0) - (left.publishedTimestamp ?? 0) ||
        left.videoId.localeCompare(right.videoId),
    ),
  };
}
