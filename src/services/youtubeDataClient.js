import { AppError } from "../errors.js";
import {
  extractVideoId,
  validateYouTubeVideoUrl,
} from "../domain/videoUrl.js";
import {
  CHANNEL_ID_PATTERN,
  parseYouTubeChannelUrl,
} from "../domain/channelUrl.js";
import { TtlCache } from "./ttlCache.js";

const API_ROOT = "https://www.googleapis.com/youtube/v3";

function asNonNegativeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function getBestThumbnail(thumbnails = {}) {
  return getBestThumbnailDetails(thumbnails)?.url ?? null;
}

function getBestThumbnailDetails(thumbnails = {}) {
  for (const quality of [
    "maxres",
    "standard",
    "high",
    "medium",
    "default",
  ]) {
    const thumbnail = thumbnails[quality];
    if (thumbnail?.url) {
      return {
        quality,
        url: thumbnail.url,
        width: asNonNegativeInteger(thumbnail.width, null),
        height: asNonNegativeInteger(thumbnail.height, null),
      };
    }
  }
  return null;
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

function extractCommentTimestamps(text, durationSeconds = null) {
  const timestamps = [];
  const seen = new Set();
  const pattern = /(?:^|[^\d])(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?!\d)/g;
  let match;

  while ((match = pattern.exec(String(text ?? ""))) !== null) {
    const hours = Number(match[1] ?? 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    if (minutes > 59 && match[1] !== undefined) continue;
    if (seconds > 59) continue;

    const totalSeconds = hours * 3_600 + minutes * 60 + seconds;
    if (
      seen.has(totalSeconds) ||
      (Number.isFinite(durationSeconds) &&
        durationSeconds !== null &&
        totalSeconds > durationSeconds + 5)
    ) {
      continue;
    }
    seen.add(totalSeconds);
    timestamps.push({
      label: match[0].trim(),
      seconds: totalSeconds,
    });
  }

  return timestamps;
}

function normaliseComment(comment, durationSeconds = null) {
  const snippet = comment?.snippet;
  const text = String(snippet?.textOriginal ?? "").trim();
  if (!comment?.id || !text) return null;

  return {
    id: comment.id,
    parentId: snippet?.parentId ?? null,
    text,
    author: String(snippet?.authorDisplayName ?? "Unknown").trim(),
    likeCount: asNonNegativeInteger(snippet?.likeCount),
    publishedAt: snippet?.publishedAt ?? null,
    timestamps: extractCommentTimestamps(text, durationSeconds),
  };
}

function selectStratifiedComments(relevant, recent, maxComments) {
  const candidates = new Map();
  for (const [group, items] of [
    ["top", relevant],
    ["recent", recent],
  ]) {
    for (const item of items) {
      const existing = candidates.get(item.id);
      if (existing) {
        existing.candidateGroups.add(group);
      } else {
        candidates.set(item.id, {
          ...item,
          candidateGroups: new Set([group]),
        });
      }
    }
  }

  const topQuota = Math.ceil(maxComments * 0.4);
  const recentQuota = Math.ceil(maxComments * 0.35);
  const likedQuota = Math.max(0, maxComments - topQuota - recentQuota);
  const highlyLiked = [...candidates.values()].sort(
    (left, right) =>
      right.likeCount - left.likeCount ||
      String(right.publishedAt).localeCompare(String(left.publishedAt)),
  );
  const selectedGroups = new Map();

  function mark(items, group, limit) {
    let marked = 0;
    for (const item of items) {
      if (marked >= limit) break;
      const groups = selectedGroups.get(item.id) ?? new Set();
      groups.add(group);
      selectedGroups.set(item.id, groups);
      marked += 1;
    }
  }

  mark(relevant, "top", topQuota);
  mark(recent, "recent", recentQuota);
  mark(highlyLiked, "highlyLiked", likedQuota);

  const orderedIds = [
    ...relevant.slice(0, topQuota).map((item) => item.id),
    ...recent.slice(0, recentQuota).map((item) => item.id),
    ...highlyLiked.slice(0, likedQuota).map((item) => item.id),
    ...relevant.map((item) => item.id),
    ...recent.map((item) => item.id),
  ];
  const uniqueIds = [...new Set(orderedIds)].slice(0, maxComments);

  return uniqueIds.map((id) => {
    const candidate = candidates.get(id);
    return {
      ...candidate,
      candidateGroups: undefined,
      sampleGroups: [
        ...(selectedGroups.get(id) ??
          candidate.candidateGroups ??
          new Set(["supplemental"])),
      ],
    };
  });
}

export class YouTubeDataClient {
  constructor({
    apiKey,
    fetchImpl = fetch,
    channelCache = new TtlCache(),
    videoCategoryCache = new TtlCache({ ttlMs: 24 * 60 * 60 * 1_000 }),
    channelBatchConcurrency = 4,
  }) {
    this.apiKey = apiKey;
    this.fetch = fetchImpl;
    this.channelCache = channelCache;
    this.videoCategoryCache = videoCategoryCache;
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

  async fetchCommentThreadCandidates(
    videoId,
    { maxComments, order, durationSeconds },
  ) {
    const comments = [];
    let pageToken;

    while (comments.length < maxComments) {
      const pageSize = Math.min(100, maxComments - comments.length);
      const payload = await this.request("commentThreads", {
        part: "snippet,replies",
        videoId,
        maxResults: pageSize,
        order,
        textFormat: "plainText",
        pageToken,
        fields:
          "nextPageToken,items(id,snippet(totalReplyCount,topLevelComment(id,snippet(textOriginal,authorDisplayName,likeCount,publishedAt))),replies(comments(id,snippet(parentId,textOriginal,authorDisplayName,likeCount,publishedAt))))",
      });

      for (const item of payload.items ?? []) {
        const topLevel = normaliseComment(
          item?.snippet?.topLevelComment,
          durationSeconds,
        );
        if (!topLevel) continue;
        comments.push({
          ...topLevel,
          totalReplyCount: asNonNegativeInteger(
            item?.snippet?.totalReplyCount,
          ),
          replies: (item?.replies?.comments ?? [])
            .map((reply) => normaliseComment(reply, durationSeconds))
            .filter(Boolean),
        });
      }

      pageToken = payload.nextPageToken;
      if (!pageToken || !(payload.items?.length > 0)) break;
    }

    return comments.slice(0, maxComments);
  }

  async fetchCompleteReplies(
    parentId,
    { maxReplies = 200, durationSeconds } = {},
  ) {
    const replies = [];
    let pageToken;

    while (replies.length < maxReplies) {
      const payload = await this.request("comments", {
        part: "snippet",
        parentId,
        maxResults: Math.min(100, maxReplies - replies.length),
        textFormat: "plainText",
        pageToken,
        fields:
          "nextPageToken,items(id,snippet(parentId,textOriginal,authorDisplayName,likeCount,publishedAt))",
      });
      replies.push(
        ...(payload.items ?? [])
          .map((reply) => normaliseComment(reply, durationSeconds))
          .filter(Boolean),
      );
      pageToken = payload.nextPageToken;
      if (!pageToken || !(payload.items?.length > 0)) break;
    }

    return replies.slice(0, maxReplies);
  }

  async fetchComments(videoId, maxComments, { durationSeconds } = {}) {
    let relevant;
    let recent;
    try {
      [relevant, recent] = await Promise.all([
        this.fetchCommentThreadCandidates(videoId, {
          maxComments,
          order: "relevance",
          durationSeconds,
        }),
        this.fetchCommentThreadCandidates(videoId, {
          maxComments,
          order: "time",
          durationSeconds,
        }),
      ]);
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === "YOUTUBE_COMMENTS_DISABLED"
      ) {
        return {
          comments: [],
          sampleBreakdown: { top: 0, recent: 0, highlyLiked: 0 },
          sampledReplyCount: 0,
          completeReplyThreadCount: 0,
          truncatedReplyThreadCount: 0,
          commentsDisabled: true,
        };
      }
      throw error;
    }

    const comments = selectStratifiedComments(
      relevant,
      recent,
      maxComments,
    );
    const materialThreads = comments
      .filter(
        (comment) =>
          comment.totalReplyCount > comment.replies.length &&
          (comment.totalReplyCount >= 2 ||
            comment.likeCount > 0 ||
            comment.text.includes("?")),
      )
      .sort(
        (left, right) =>
          right.totalReplyCount - left.totalReplyCount ||
          right.likeCount - left.likeCount,
      )
      .slice(0, 8);

    await mapWithConcurrency(materialThreads, 3, async (comment) => {
      const completeReplies = await this.fetchCompleteReplies(comment.id, {
        maxReplies: 200,
        durationSeconds,
      });
      const merged = new Map(
        [...comment.replies, ...completeReplies].map((reply) => [
          reply.id,
          reply,
        ]),
      );
      comment.replies = [...merged.values()];
    });

    const sampleBreakdown = {
      top: comments.filter((comment) =>
        comment.sampleGroups.includes("top"),
      ).length,
      recent: comments.filter((comment) =>
        comment.sampleGroups.includes("recent"),
      ).length,
      highlyLiked: comments.filter((comment) =>
        comment.sampleGroups.includes("highlyLiked"),
      ).length,
    };
    const sampledReplyCount = comments.reduce(
      (total, comment) => total + comment.replies.length,
      0,
    );

    return {
      comments,
      sampleBreakdown,
      sampledReplyCount,
      completeReplyThreadCount: materialThreads.filter(
        (comment) => comment.replies.length >= comment.totalReplyCount,
      ).length,
      truncatedReplyThreadCount: materialThreads.filter(
        (comment) => comment.replies.length < comment.totalReplyCount,
      ).length,
      commentsDisabled: false,
    };
  }

  async fetchVideoCategory(categoryId) {
    if (!categoryId) return null;
    return this.videoCategoryCache.getOrCreate(
      `video-category:${categoryId}`,
      async () => {
        const payload = await this.request("videoCategories", {
          part: "snippet",
          id: categoryId,
          fields: "items(id,snippet(title))",
        });
        const item = payload.items?.[0];
        return item
          ? {
              id: item.id,
              title: String(item.snippet?.title ?? "Unknown category").trim(),
            }
          : { id: categoryId, title: "Unknown category" };
      },
    );
  }

  async fetchVideo(rawUrl, { maxComments = 100 } = {}) {
    const sourceUrl = validateYouTubeVideoUrl(rawUrl);
    const expectedVideoId = extractVideoId(sourceUrl);
    const payload = await this.request("videos", {
      part: "snippet,contentDetails,statistics",
      id: expectedVideoId,
      fields:
        "items(id,snippet(title,description,channelTitle,channelId,publishedAt,tags,categoryId,thumbnails),contentDetails(duration,caption,definition),statistics(viewCount,likeCount,commentCount))",
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

    const durationIso = item.contentDetails?.duration ?? null;
    const durationSeconds = parseDurationSeconds(durationIso);
    const thumbnail = getBestThumbnailDetails(item.snippet?.thumbnails);
    const [commentResult, category] = await Promise.all([
      this.fetchComments(item.id, maxComments, { durationSeconds }),
      this.fetchVideoCategory(item.snippet?.categoryId),
    ]);

    return {
      sourceUrl,
      videoId: item.id,
      title,
      channel: String(item.snippet?.channelTitle ?? "Unknown").trim(),
      channelId: String(item.snippet?.channelId ?? "").trim(),
      description: String(item.snippet?.description ?? "").trim(),
      publishedAt: item.snippet?.publishedAt ?? null,
      tags: Array.isArray(item.snippet?.tags)
        ? item.snippet.tags.map((tag) => String(tag).trim()).filter(Boolean)
        : [],
      category: category ?? {
        id: item.snippet?.categoryId ?? null,
        title: "Uncategorised",
      },
      durationIso,
      durationSeconds,
      captionsAvailable: item.contentDetails?.caption === "true",
      definition: item.contentDetails?.definition ?? null,
      thumbnail,
      thumbnailUrl: thumbnail?.url ?? null,
      viewCount,
      likeCount:
        item.statistics?.likeCount === undefined
          ? null
          : asNonNegativeInteger(item.statistics.likeCount),
      reportedCommentCount:
        item.statistics?.commentCount === undefined
          ? null
          : asNonNegativeInteger(item.statistics.commentCount),
      comments: commentResult.comments,
      commentSampling: {
        requestedTopLevelComments: maxComments,
        sampledTopLevelComments: commentResult.comments.length,
        sampledReplies: commentResult.sampledReplyCount,
        completeReplyThreads: commentResult.completeReplyThreadCount,
        truncatedReplyThreads: commentResult.truncatedReplyThreadCount,
        commentsDisabled: commentResult.commentsDisabled,
        ...commentResult.sampleBreakdown,
      },
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

  async fetchChannelByLookup({ sourceUrl, lookup }) {
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

  async fetchChannelUncached(rawUrl) {
    return this.fetchChannelByLookup(parseYouTubeChannelUrl(rawUrl));
  }

  async fetchChannel(rawUrl) {
    const { sourceUrl } = parseYouTubeChannelUrl(rawUrl);
    return this.channelCache.getOrCreate(`channel:${sourceUrl}`, () =>
      this.fetchChannelUncached(sourceUrl),
    );
  }

  async fetchChannelById(channelId) {
    const normalisedChannelId = String(channelId ?? "").trim();
    if (!CHANNEL_ID_PATTERN.test(normalisedChannelId)) {
      throw new AppError(
        "YouTube returned an invalid channel ID for this video.",
        { status: 502, code: "INVALID_VIDEO_CHANNEL_ID" },
      );
    }

    const sourceUrl = `https://www.youtube.com/channel/${normalisedChannelId}`;
    return this.channelCache.getOrCreate(
      `channel-id:${normalisedChannelId}`,
      () =>
        this.fetchChannelByLookup({
          sourceUrl,
          lookup: { parameter: "id", value: normalisedChannelId },
        }),
    );
  }
}
