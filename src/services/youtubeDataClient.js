import { AppError } from "../errors.js";
import {
  extractVideoId,
  validateYouTubeVideoUrl,
} from "../domain/videoUrl.js";
import { parseYouTubeChannelUrl } from "../domain/channelUrl.js";
import { TtlCache } from "./ttlCache.js";

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

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

function parseDurationSeconds(duration) {
  const match = String(duration ?? "").match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/,
  );
  if (!match) return null;

  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] =
    match;
  return (
    Number(days) * 86_400 +
    Number(hours) * 3_600 +
    Number(minutes) * 60 +
    Number(seconds)
  );
}

export class YouTubeDataClient {
  constructor({
    apiKey,
    fetchImpl = fetch,
    channelCache = new TtlCache(),
    channelBatchConcurrency = 4,
  }) {
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.channelCache = channelCache;
    this.channelBatchConcurrency = channelBatchConcurrency;
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

  async fetchUploadVideoIds(uploadsPlaylistId) {
    const videoIds = [];
    let pageToken;

    do {
      const payload = await this.request("playlistItems", {
        part: "contentDetails",
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken,
        fields: "nextPageToken,items(contentDetails(videoId))",
      });

      for (const item of payload.items ?? []) {
        const videoId = String(item?.contentDetails?.videoId ?? "").trim();
        if (videoId) videoIds.push(videoId);
      }
      pageToken = payload.nextPageToken;
    } while (pageToken);

    return [...new Set(videoIds)];
  }

  async fetchVideoStatistics(videoIds) {
    const batches = chunk(videoIds, 50);
    const batchResults = await mapWithConcurrency(
      batches,
      this.channelBatchConcurrency,
      async (videoIdBatch) => {
        const payload = await this.request("videos", {
          part: "snippet,contentDetails,statistics",
          id: videoIdBatch.join(","),
          fields:
            "items(id,snippet(title,description,publishedAt),contentDetails(duration),statistics(viewCount,likeCount,commentCount))",
        });

        return payload.items ?? [];
      },
    );

    return batchResults.flatMap((items) =>
      items
        .map((item) => {
          const viewCount = Number.parseInt(item.statistics?.viewCount, 10);
          const title = String(item.snippet?.title ?? "").trim();
          if (!item.id || !title || !Number.isInteger(viewCount)) return null;

          return {
            videoId: item.id,
            title,
            description: String(item.snippet?.description ?? "").trim(),
            publishedAt: item.snippet?.publishedAt ?? null,
            durationSeconds: parseDurationSeconds(
              item.contentDetails?.duration,
            ),
            viewCount,
            likeCount:
              item.statistics?.likeCount === undefined
                ? null
                : asNonNegativeInteger(item.statistics.likeCount),
            commentCount: asNonNegativeInteger(
              item.statistics?.commentCount,
            ),
          };
        })
        .filter(Boolean),
    );
  }

  async fetchChannelUncached(rawUrl) {
    const { sourceUrl, lookup } = parseYouTubeChannelUrl(rawUrl);
    const channelPayload = await this.request("channels", {
      part: "snippet,contentDetails,statistics",
      [lookup.parameter]: lookup.value,
      fields:
        "items(id,snippet(title,thumbnails),contentDetails(relatedPlaylists(uploads)),statistics(viewCount,subscriberCount,hiddenSubscriberCount,videoCount))",
    });

    const item = channelPayload.items?.[0];
    if (!item) {
      throw new AppError(
        "No public YouTube channel was found for that URL.",
        { status: 404, code: "CHANNEL_NOT_FOUND" },
      );
    }

    const uploadsPlaylistId =
      item.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      throw new AppError(
        "YouTube did not return an uploads playlist for this channel.",
        { status: 502, code: "CHANNEL_UPLOADS_UNAVAILABLE" },
      );
    }

    const videoIds = await this.fetchUploadVideoIds(uploadsPlaylistId);
    const videos = await this.fetchVideoStatistics(videoIds);
    const subscriberCount = item.statistics?.hiddenSubscriberCount
      ? null
      : asNonNegativeInteger(item.statistics?.subscriberCount);

    return {
      sourceUrl,
      channelId: item.id,
      title: String(item.snippet?.title ?? "Unknown channel").trim(),
      thumbnailUrl: getBestThumbnail(item.snippet?.thumbnails),
      subscriberCount,
      totalViewCount: asNonNegativeInteger(item.statistics?.viewCount),
      videoCount: asNonNegativeInteger(item.statistics?.videoCount),
      analysedVideoCount: videos.length,
      videos,
    };
  }

  async fetchChannel(rawUrl) {
    const { sourceUrl } = parseYouTubeChannelUrl(rawUrl);
    return this.channelCache.getOrCreate(`channel:${sourceUrl}`, () =>
      this.fetchChannelUncached(sourceUrl),
    );
  }
}
