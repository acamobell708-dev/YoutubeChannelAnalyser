import { AppError } from "../errors.js";
import { runChannelSanityChecks } from "./sanity.js";

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

function clientSafeVideo(video, rank) {
  return {
    rank,
    videoId: video.videoId,
    title: video.title,
    videoUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
    publishedAt: video.publishedAt,
    durationSeconds: video.durationSeconds,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    commentCount: video.commentCount,
  };
}

export function createChannelAnalyser({ youtubeClient, performanceAnalyst }) {
  return async function analyseChannel({ url }) {
    const channel = await youtubeClient.fetchChannel(url);
    if (channel.videos.length === 0) {
      throw new AppError(
        "No public videos with statistics were found for this channel.",
        { status: 404, code: "CHANNEL_HAS_NO_PUBLIC_VIDEOS" },
      );
    }

    const topByViews = rankVideos(channel.videos, "viewCount");
    const topByComments = rankVideos(channel.videos, "commentCount");
    const performanceAnalysis = await performanceAnalyst.analyse({
      channel,
      topByViews,
      topByComments,
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
        analysedVideoCount: channel.analysedVideoCount,
      },
      topByViews: topByViews.map((video, index) =>
        clientSafeVideo(video, index + 1),
      ),
      topByComments: topByComments.map((video, index) =>
        clientSafeVideo(video, index + 1),
      ),
      performanceAnalysis,
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
