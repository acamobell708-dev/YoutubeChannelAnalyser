import { AppError } from "../errors.js";
import { parseCommentLimit } from "../domain/videoUrl.js";
import { runSanityChecks } from "./sanity.js";
import { calculateVideoMetrics } from "./videoMetrics.js";

function percentage(count, total) {
  if (!Number.isInteger(count) || !Number.isInteger(total) || total <= 0) {
    return 0;
  }
  return Math.round(((count / total) * 100 + Number.EPSILON) * 100) / 100;
}

export function createVideoAnalyser({
  youtubeClient,
  insightAnalyst,
  now = Date.now,
}) {
  return async function analyseVideo({ url, maxComments }) {
    const commentLimit = parseCommentLimit(maxComments);
    const video = await youtubeClient.fetchVideo(url, {
      maxComments: commentLimit,
    });
    const [channel, insightResult] = await Promise.all([
      youtubeClient.fetchChannelById(video.channelId),
      insightAnalyst.analyse(video),
    ]);
    const metrics = calculateVideoMetrics(video, channel.videos, now);
    const insights = {
      ...insightResult.analysis,
      audience: {
        ...insightResult.analysis.audience,
        feedbackRows: insightResult.analysis.audience.feedbackRows.map(
          (row) => ({
            ...row,
            percentOfAnalysed: percentage(
              row.count,
              insightResult.analysedCommentCount,
            ),
          }),
        ),
      },
    };

    const result = {
      video: {
        sourceUrl: video.sourceUrl,
        videoId: video.videoId,
        title: video.title,
        channel: video.channel,
        channelId: video.channelId,
        publishedAt: video.publishedAt,
        thumbnailUrl: video.thumbnailUrl,
        thumbnail: video.thumbnail,
        tags: video.tags,
        category: video.category,
        durationIso: video.durationIso,
        durationSeconds: video.durationSeconds,
        captionsAvailable: video.captionsAvailable,
        definition: video.definition,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        reportedCommentCount: video.reportedCommentCount,
        sampledCommentCount: video.comments.length,
        commentSampling: {
          ...video.commentSampling,
          analysedByGpt: insightResult.analysedCommentCount,
        },
      },
      metrics,
      insights,
    };
    const sanity = runSanityChecks(result);

    if (!sanity.passed) {
      throw new AppError(
        `The final sanity check failed: ${sanity.errors.join("; ")}.`,
        { status: 500, code: "SANITY_CHECK_FAILED" },
      );
    }

    return { ...result, sanity };
  };
}
