import { AppError } from "../errors.js";
import {
  extractVideoId,
  validateYouTubeVideoUrl,
} from "../domain/videoUrl.js";

const API_ROOT = "https://www.googleapis.com/youtube/v3";

function asNonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function getBestThumbnail(thumbnails = {}) {
  return (
    thumbnails.maxres?.url ??
    thumbnails.standard?.url ??
    thumbnails.high?.url ??
    thumbnails.medium?.url ??
    thumbnails.default?.url ??
    null
  );
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function getGoogleErrorReason(payload) {
  return payload?.error?.errors?.[0]?.reason ?? null;
}

export class YouTubeDataClient {
  constructor({ apiKey, fetchImpl = fetch }) {
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
  }

  async request(resource, parameters) {
    const url = new URL(`${API_ROOT}/${resource}`);
    Object.entries({ ...parameters, key: this.apiKey }).forEach(
      ([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      },
    );

    let response;
    try {
      response = await this.fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new AppError(
        "The YouTube Data API could not be reached. Check the server connection and try again.",
        { status: 502, code: "YOUTUBE_CONNECTION_ERROR", cause: error },
      );
    }

    const payload = await readJson(response);
    if (!response.ok) {
      const reason = getGoogleErrorReason(payload);
      if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
        throw new AppError(
          "The YouTube API quota for this project has been exhausted. Try again after the quota resets.",
          { status: 429, code: "YOUTUBE_QUOTA_EXCEEDED" },
        );
      }
      if (reason === "keyInvalid" || reason === "accessNotConfigured") {
        throw new AppError(
          "The YouTube API key is invalid or YouTube Data API v3 is not enabled for its Google Cloud project.",
          { status: 503, code: "YOUTUBE_API_CONFIGURATION_ERROR" },
        );
      }
      if (reason === "commentsDisabled") {
        throw new AppError("Comments are disabled for this video.", {
          status: 409,
          code: "YOUTUBE_COMMENTS_DISABLED",
        });
      }

      throw new AppError(
        payload?.error?.message ??
          "YouTube rejected the request. Confirm that the video is public and available.",
        { status: 502, code: "YOUTUBE_API_ERROR" },
      );
    }

    return payload;
  }

  async fetchComments(videoId, maxComments) {
    const comments = [];
    let pageToken;

    while (comments.length < maxComments) {
      const pageSize = Math.min(100, maxComments - comments.length);
      let payload;

      try {
        payload = await this.request("commentThreads", {
          part: "snippet",
          videoId,
          maxResults: pageSize,
          order: "relevance",
          textFormat: "plainText",
          pageToken,
          fields:
            "nextPageToken,items(snippet(topLevelComment(snippet(textOriginal,authorDisplayName,likeCount,publishedAt))))",
        });
      } catch (error) {
        if (
          error instanceof AppError &&
          error.code === "YOUTUBE_COMMENTS_DISABLED"
        ) {
          return [];
        }
        throw error;
      }

      for (const item of payload.items ?? []) {
        const snippet = item?.snippet?.topLevelComment?.snippet;
        const text = String(snippet?.textOriginal ?? "").trim();
        if (!text) continue;

        comments.push({
          text,
          author: String(snippet?.authorDisplayName ?? "Unknown").trim(),
          likeCount: asNonNegativeInteger(snippet?.likeCount),
          publishedAt: snippet?.publishedAt ?? null,
        });
      }

      pageToken = payload.nextPageToken;
      if (!pageToken || !(payload.items?.length > 0)) break;
    }

    return comments.slice(0, maxComments);
  }

  async fetchVideo(rawUrl, { maxComments = 100 } = {}) {
    const sourceUrl = validateYouTubeVideoUrl(rawUrl);
    const expectedVideoId = extractVideoId(sourceUrl);
    const payload = await this.request("videos", {
      part: "snippet,statistics",
      id: expectedVideoId,
      fields:
        "items(id,snippet(title,channelTitle,publishedAt,thumbnails),statistics(viewCount,likeCount,commentCount))",
    });

    const item = payload.items?.[0];
    if (!item) {
      throw new AppError(
        "No public video was found for that URL. It may be private, deleted, or unavailable in this region.",
        { status: 404, code: "VIDEO_NOT_FOUND" },
      );
    }

    const title = String(item.snippet?.title ?? "").trim();
    const viewCount = Number.parseInt(item.statistics?.viewCount, 10);
    if (!title || !Number.isInteger(viewCount) || viewCount < 0) {
      throw new AppError(
        "YouTube returned incomplete video metadata, so the analysis was stopped.",
        { status: 502, code: "INCOMPLETE_VIDEO_DATA" },
      );
    }

    const comments = await this.fetchComments(item.id, maxComments);

    return {
      sourceUrl,
      videoId: item.id,
      title,
      channel: String(item.snippet?.channelTitle ?? "Unknown").trim(),
      publishedAt: item.snippet?.publishedAt ?? null,
      thumbnailUrl: getBestThumbnail(item.snippet?.thumbnails),
      viewCount,
      likeCount:
        item.statistics?.likeCount === undefined
          ? null
          : asNonNegativeInteger(item.statistics.likeCount),
      reportedCommentCount:
        item.statistics?.commentCount === undefined
          ? null
          : asNonNegativeInteger(item.statistics.commentCount),
      comments,
    };
  }
}
