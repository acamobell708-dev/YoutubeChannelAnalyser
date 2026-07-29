import { AppError } from "../errors.js";
import { parseCommentLimit } from "../domain/videoUrl.js";
import { runSanityChecks } from "./sanity.js";

export function createVideoAnalyser({ youtubeClient, summarizer }) {
  return async function analyseVideo({ url, maxComments }) {
    const commentLimit = parseCommentLimit(maxComments);
    const video = await youtubeClient.fetchVideo(url, {
      maxComments: commentLimit,
    });
    const commentSummary = await summarizer.summarize(video);
    const sanity = runSanityChecks({ video, commentSummary });

    if (!sanity.passed) {
      throw new AppError(
        `The final sanity check failed: ${sanity.errors.join("; ")}.`,
        { status: 500, code: "SANITY_CHECK_FAILED" },
      );
    }

    return {
      video: {
        sourceUrl: video.sourceUrl,
        videoId: video.videoId,
        title: video.title,
        channel: video.channel,
        publishedAt: video.publishedAt,
        thumbnailUrl: video.thumbnailUrl,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        reportedCommentCount: video.reportedCommentCount,
        sampledCommentCount: video.comments.length,
      },
      commentSummary,
      sanity,
    };
  };
}
