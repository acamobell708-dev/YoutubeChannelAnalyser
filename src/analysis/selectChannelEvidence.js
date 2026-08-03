function sorted(videos, selector, direction = "descending") {
  const multiplier = direction === "ascending" ? 1 : -1;
  return [...videos].sort((left, right) => {
    const difference = (selector(left) - selector(right)) * multiplier;
    return difference || left.videoId.localeCompare(right.videoId);
  });
}

export function selectChannelEvidence(
  channelMetrics,
  maximumVideos,
) {
  const selected = new Map();
  const groupSize = Math.max(1, Math.floor(maximumVideos / 6));

  function add(videos, reason, limit = groupSize) {
    for (const video of videos.slice(0, limit)) {
      const existing = selected.get(video.videoId);
      if (existing) {
        existing.selectionReasons.push(reason);
      } else if (selected.size < maximumVideos) {
        selected.set(video.videoId, {
          ...video,
          selectionReasons: [reason],
        });
      }
    }
  }

  const allVideos = channelMetrics.videos;
  add(sorted(allVideos, (video) => video.viewsPerDay), "reach_leader");
  add(
    sorted(allVideos, (video) => video.engagementPer100Views ?? -1),
    "engagement_leader",
  );
  add(
    channelMetrics.outliers.highReachLowEngagement,
    "high_reach_low_engagement",
  );
  add(
    channelMetrics.outliers.fairPeerUnderperformers,
    "fair_peer_underperformer",
  );
  add(
    sorted(allVideos, (video) => video.publishedTimestamp ?? 0),
    "recent_upload",
  );

  const medianViewsPerDay = channelMetrics.summary.medianViewsPerDay;
  add(
    sorted(
      allVideos,
      (video) => Math.abs(video.viewsPerDay - medianViewsPerDay),
      "ascending",
    ),
    "median_baseline",
  );

  for (const cohort of channelMetrics.durationCohorts) {
    add(
      sorted(
        allVideos.filter((video) => video.durationBucket === cohort.id),
        (video) => video.viewsPerDay,
      ),
      `duration_leader:${cohort.id}`,
      1,
    );
  }

  if (selected.size < maximumVideos) {
    add(sorted(allVideos, (video) => video.viewsPerDay), "coverage_fill", maximumVideos);
  }
  return [...selected.values()].slice(0, maximumVideos);
}
