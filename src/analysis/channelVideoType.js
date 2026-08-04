const VALID_CHANNEL_VIDEO_TYPES = new Set(["all", "short", "standard"]);

export function normaliseChannelVideoType(value) {
  const requested = String(value ?? "all").trim().toLowerCase();
  return VALID_CHANNEL_VIDEO_TYPES.has(requested) ? requested : "all";
}

export function classifyChannelVideo(video) {
  if (video?.creatorContentType === "SHORTS") {
    return { type: "short", source: "youtube_owner_analytics" };
  }
  if (video?.creatorContentType === "VIDEO_ON_DEMAND") {
    return { type: "standard", source: "youtube_owner_analytics" };
  }
  if (!Number.isFinite(video?.durationSeconds)) {
    return { type: "unknown", source: "unavailable" };
  }
  return video.durationSeconds <= 180
    ? { type: "short", source: "duration_proxy" }
    : { type: "standard", source: "duration_proxy" };
}

function scopeDefinition(type) {
  if (type === "short") {
    return {
      label: "Shorts-focused catalogue",
      confidence: "proxy",
      source: "creator_type_or_duration_proxy",
      caveat:
        "The analysis includes uploads confirmed as SHORTS when creator classification is present; otherwise it uses duration of up to three minutes as a public-data proxy. Reported public Shorts views can include starts and replays, so public interaction rates are not engaged-view or retention measures.",
    };
  }
  if (type === "standard") {
    return {
      label: "Long-form-focused catalogue",
      confidence: "proxy",
      source: "creator_type_or_duration_proxy",
      caveat:
        "The analysis includes uploads confirmed as video-on-demand when creator classification is present; otherwise it uses duration over three minutes as a public-data proxy. Public metadata does not provide impressions, click-through rate, watch time, or retention.",
    };
  }
  return {
    label: "All public uploads",
    confidence: "mixed",
    source: "complete_public_catalogue",
    caveat:
      "The mixed catalogue includes every public upload returned by YouTube. Duration-aware cohorts reduce, but do not remove, differences between Shorts and long-form viewing behaviour.",
  };
}

export function selectChannelVideos(videos, requestedType = "all") {
  const requested = normaliseChannelVideoType(requestedType);
  const classified = videos.map((video) => {
    const classification = classifyChannelVideo(video);
    return {
      ...video,
      videoType: classification.type,
      videoTypeSource: classification.source,
    };
  });
  const selected = requested === "all"
    ? classified
    : classified.filter((video) => video.videoType === requested);
  const definition = scopeDefinition(requested);
  const exactCount = selected.filter(
    (video) => video.videoTypeSource === "youtube_owner_analytics",
  ).length;
  const proxyCount = selected.filter(
    (video) => video.videoTypeSource === "duration_proxy",
  ).length;
  const unknownCount = classified.filter(
    (video) => video.videoType === "unknown",
  ).length;

  return {
    videos: selected,
    scope: {
      requested,
      resolved: requested,
      ...definition,
      totalFetchedVideoCount: classified.length,
      includedVideoCount: selected.length,
      excludedVideoCount: classified.length - selected.length,
      exactClassificationCount: exactCount,
      proxyClassificationCount: proxyCount,
      unknownClassificationCount: unknownCount,
      publicViewSemantics:
        requested === "short"
          ? "reported_public_shorts_views"
          : "reported_public_views",
    },
  };
}
