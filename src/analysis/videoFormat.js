const VALID_VIDEO_TYPES = new Set(["auto", "short", "standard"]);

export function normaliseRequestedVideoType(value) {
  const requested = String(value ?? "auto").trim().toLowerCase();
  return VALID_VIDEO_TYPES.has(requested) ? requested : "auto";
}

function creatorTypeToVideoType(value) {
  if (value === "SHORTS") return "short";
  if (value === "VIDEO_ON_DEMAND") return "standard";
  return null;
}

export function resolveVideoFormat({
  requested = "auto",
  sourceUrl = "",
  durationSeconds = null,
  creatorContentType = null,
} = {}) {
  const selected = normaliseRequestedVideoType(requested);
  const ownerType = creatorTypeToVideoType(creatorContentType);

  if (ownerType) {
    return {
      requested: selected,
      resolved: ownerType,
      creatorContentType,
      confidence: "confirmed",
      source: "youtube_owner_analytics",
      label: ownerType === "short" ? "Short" : "Standard video",
      caveat: null,
    };
  }

  if (selected !== "auto") {
    return {
      requested: selected,
      resolved: selected,
      creatorContentType: null,
      confidence: "selected",
      source: "user_selection",
      label: selected === "short" ? "Short lens" : "Standard-video lens",
      caveat:
        "The selected analysis lens is being used because exact creatorContentType was not available.",
    };
  }

  if (/youtube\.com\/shorts\//i.test(String(sourceUrl))) {
    return {
      requested: selected,
      resolved: "short",
      creatorContentType: null,
      confidence: "likely",
      source: "shorts_url",
      label: "Likely Short",
      caveat:
        "The /shorts/ URL strongly suggests a Short, but exact classification requires owner Analytics.",
    };
  }

  if (Number.isFinite(durationSeconds) && durationSeconds <= 180) {
    return {
      requested: selected,
      resolved: "short",
      creatorContentType: null,
      confidence: "proxy",
      source: "duration_proxy",
      label: "Likely Short",
      caveat:
        "Duration up to three minutes is only a public-data proxy; some uploads in this range are not Shorts.",
    };
  }

  return {
    requested: selected,
    resolved: "standard",
    creatorContentType: null,
    confidence: Number.isFinite(durationSeconds) ? "likely" : "proxy",
    source: "duration_proxy",
    label: "Likely standard video",
    caveat:
      "Public metadata does not expose exact creatorContentType; owner Analytics can confirm the format.",
  };
}

const STANDARD_DISCOVERY = [
  {
    id: "browse",
    label: "Browse",
    sourceTypes: ["SUBSCRIBER", "YT_CHANNEL", "YT_OTHER_PAGE", "YT_PLAYLIST_PAGE"],
  },
  { id: "suggested", label: "Suggested videos", sourceTypes: ["RELATED_VIDEO"] },
  { id: "search", label: "YouTube Search", sourceTypes: ["YT_SEARCH"] },
  { id: "external", label: "External sources", sourceTypes: ["EXT_URL", "NO_LINK_EMBEDDED"] },
];

const SHORT_DISCOVERY = [
  { id: "shorts_feed", label: "Shorts Feed", sourceTypes: ["SHORTS"] },
  { id: "sound_pages", label: "Sound pages", sourceTypes: ["SOUND_PAGE"] },
  { id: "video_remixes", label: "Video remixes", sourceTypes: ["VIDEO_REMIXES"] },
  { id: "search", label: "YouTube Search", sourceTypes: ["YT_SEARCH"] },
  { id: "external", label: "External sources", sourceTypes: ["EXT_URL", "NO_LINK_EMBEDDED"] },
];

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, places = 1) {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export function summariseTrafficSources(rows = [], videoType = "standard") {
  const groups = videoType === "short" ? SHORT_DISCOVERY : STANDARD_DISCOVERY;
  const metric =
    videoType === "short" && rows.some((row) => number(row.engagedViews) > 0)
      ? "engagedViews"
      : "views";
  const total = rows.reduce((sum, row) => sum + number(row[metric]), 0);

  return {
    status: rows.length ? "available" : "unavailable",
    metric,
    reason: rows.length
      ? null
      : "YouTube Analytics did not return a traffic-source breakdown for this video.",
    rows: groups.map((group) => {
      const value = rows
        .filter((row) => group.sourceTypes.includes(row.insightTrafficSourceType))
        .reduce((sum, row) => sum + number(row[metric]), 0);
      return {
        id: group.id,
        label: group.label,
        value,
        sharePercent: total > 0 ? round((value / total) * 100) : null,
      };
    }),
    ungroupedValue: rows
      .filter(
        (row) =>
          !groups.some((group) =>
            group.sourceTypes.includes(row.insightTrafficSourceType),
          ),
      )
      .reduce((sum, row) => sum + number(row[metric]), 0),
    thumbnailReach: {
      status: "unavailable",
      impressions: null,
      clickThroughRate: null,
      reason:
        "Thumbnail impressions and click-through rate are not exposed by the targeted YouTube Analytics query used here. They require the YouTube Reporting API Reach reports and persisted bulk-report jobs.",
    },
  };
}
