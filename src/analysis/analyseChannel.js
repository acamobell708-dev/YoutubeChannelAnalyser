import { AppError } from "../errors.js";
import { calculateChannelMetrics } from "./channelMetrics.js";
import { runChannelSanityChecks } from "./sanity.js";
import { selectChannelEvidence } from "./selectChannelEvidence.js";
import { getAnalysisProfile } from "./analysisProfiles.js";
import { selectChannelVideos } from "./channelVideoType.js";

function rankVideos(videos, primaryMetric) {
  return [...videos]
    .sort((left, right) => {
      const primaryDifference =
        (right[primaryMetric] ?? 0) - (left[primaryMetric] ?? 0);
      if (primaryDifference !== 0) return primaryDifference;

      const viewDifference = right.viewCount - left.viewCount;
      if (viewDifference !== 0) return viewDifference;

      return left.title.localeCompare(right.title);
    })
    .slice(0, 10);
}

function clientSafeVideo(video, rank = null) {
  return {
    ...(rank === null ? {} : { rank }),
    videoId: video.videoId,
    title: video.title,
    videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
    publishedAt: video.publishedAt,
    durationSeconds: video.durationSeconds,
    durationBucket: video.durationBucket,
    formatGroup: video.formatGroup,
    videoType: video.videoType,
    videoTypeSource: video.videoTypeSource,
    ageDays: video.ageDays,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    commentCount: video.commentCount,
    viewsPerDay: video.viewsPerDay,
    likesPer100Views: video.likesPer100Views,
    commentsPer100Views: video.commentsPer100Views,
    engagementPer100Views: video.engagementPer100Views,
    percentiles: video.percentiles,
    cohortPercentiles: video.cohortPercentiles,
    cohortSize: video.cohortSize,
  };
}

function clientSafeList(videos) {
  return videos.map((video) => clientSafeVideo(video));
}

function unavailableEngagedViews(reason) {
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

export function createChannelAnalyser({
  youtubeClient,
  performanceAnalyst,
  channelEngagedViewsService = null,
  now = Date.now,
}) {
  return async function analyseChannel({
    url,
    analysisMode = "economy",
    videoType = "all",
    ownerSessionId = null,
  }) {
    const profile = getAnalysisProfile(analysisMode);
    const channel = await youtubeClient.fetchChannel(url);
    if (channel.videos.length === 0) {
      throw new AppError(
        "No public videos with statistics were found for this channel.",
        { status: 404, code: "CHANNEL_HAS_NO_PUBLIC_VIDEOS" },
      );
    }

    const selection = selectChannelVideos(channel.videos, videoType);
    if (selection.videos.length === 0) {
      throw new AppError(
        `No public uploads matched the ${selection.scope.label} analysis lens.`,
        {
          status: 404,
          code: "CHANNEL_HAS_NO_MATCHING_VIDEO_TYPE",
        },
      );
    }

    const engagedViews =
      selection.scope.resolved === "short"
        ? channelEngagedViewsService
          ? await channelEngagedViewsService.fetch({
              channelId: channel.channelId,
              ownerSessionId,
            })
          : unavailableEngagedViews(
              "Owner YouTube Analytics is not configured for channel engaged-view retrieval.",
            )
        : {
            status: "not_applicable",
            source: null,
            reason: "Engaged-view summary is only requested for the Shorts analysis lens.",
            engagedViews: null,
            views: null,
            engagedViewSharePercent: null,
            periodStart: null,
            periodEnd: null,
          };

    const channelMetrics = calculateChannelMetrics(
      selection.videos,
      now,
      { videoType: selection.scope.resolved },
    );
    const topByViews = rankVideos(channelMetrics.videos, "viewCount");
    const topByComments = rankVideos(channelMetrics.videos, "commentCount");
    const representativeVideos = selectChannelEvidence(
      channelMetrics,
      profile.maxChannelEvidenceVideos,
    );
    const performanceResult = await performanceAnalyst.analyse({
      channel,
      channelMetrics,
      representativeVideos,
      mode: analysisMode,
      videoType: selection.scope.resolved,
      analysisScope: selection.scope,
      engagedViewsSummary: engagedViews,
    });

    const result = {
      channel: {
        sourceUrl: channel.sourceUrl,
        channelId: channel.channelId,
        title: channel.title,
        thumbnailUrl: channel.thumbnailUrl,
        subscriberCount: channel.subscriberCount,
        totalViewCount: channel.totalViewCount,
        videoCount: channel.videoCount,
        sourceAnalysedVideoCount: channel.analysedVideoCount,
        analysedVideoCount: selection.scope.includedVideoCount,
      },
      analysisScope: selection.scope,
      engagedViews,
      performance: channelMetrics.summary,
      durationCohorts: channelMetrics.durationCohorts,
      recentMomentum: channelMetrics.recentMomentum,
      outliers: {
        highReachLowEngagement: clientSafeList(
          channelMetrics.outliers.highReachLowEngagement,
        ),
        lowReachHighEngagement: clientSafeList(
          channelMetrics.outliers.lowReachHighEngagement,
        ),
        breakout: clientSafeList(channelMetrics.outliers.breakout),
        fairPeerUnderperformers: clientSafeList(
          channelMetrics.outliers.fairPeerUnderperformers,
        ),
        consistentPerformers: clientSafeList(
          channelMetrics.outliers.consistentPerformers,
        ),
      },
      topByViews: topByViews.map((video, index) =>
        clientSafeVideo(video, index + 1),
      ),
      topByComments: topByComments.map((video, index) =>
        clientSafeVideo(video, index + 1),
      ),
      catalogue: channelMetrics.videos.map((video) => clientSafeVideo(video)),
      performanceAnalysis: performanceResult.insight,
      aiEvidenceVideoIds: performanceResult.suppliedVideoIds,
      tokenBudget: performanceResult.tokenBudget,
    };

    const sanity = runChannelSanityChecks(result);
    if (!sanity.passed) {
      throw new AppError(
        `The channel sanity check failed: ${sanity.errors.join("; ")}.`,
        { status: 500, code: "CHANNEL_SANITY_CHECK_FAILED" },
      );
    }

    return { ...result, sanity };
  };
}
