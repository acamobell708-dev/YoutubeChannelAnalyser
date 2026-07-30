import test from "node:test";
import assert from "node:assert/strict";

import { YouTubeDataClient } from "../src/services/youtubeDataClient.js";

const VIDEO_ID = "dQw4w9WgXcQ";
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
const CHANNEL_ID = `UC${"c".repeat(22)}`;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("YouTubeDataClient retrieves and normalises official video data", async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);

    if (url.pathname.endsWith("/videos")) {
      return jsonResponse({
        items: [
          {
            id: VIDEO_ID,
            snippet: {
              title: "Example video",
              description: "A detailed example.",
              channelTitle: "Example channel",
              channelId: CHANNEL_ID,
              publishedAt: "2026-01-02T12:00:00Z",
              tags: ["example", "tutorial"],
              categoryId: "27",
              thumbnails: {
                high: { url: "https://i.ytimg.com/example.jpg" },
                maxres: {
                  url: "https://i.ytimg.com/example-maxres.jpg",
                  width: 1280,
                  height: 720,
                },
              },
            },
            contentDetails: {
              duration: "PT3M30S",
              caption: "true",
              definition: "hd",
            },
            statistics: {
              viewCount: "123456",
              likeCount: "9001",
              commentCount: "2",
            },
          },
        ],
      });
    }

    if (url.pathname.endsWith("/videoCategories")) {
      return jsonResponse({
        items: [{ id: "27", snippet: { title: "Education" } }],
      });
    }

    if (url.pathname.endsWith("/commentThreads")) {
      const isRecent = url.searchParams.get("order") === "time";
      return jsonResponse({
        items: isRecent
          ? [
              {
                id: "thread-three",
                snippet: {
                  totalReplyCount: 0,
                  topLevelComment: {
                    id: "comment-three",
                    snippet: {
                      textOriginal: "Can you cover the next topic?",
                      authorDisplayName: "Viewer three",
                      likeCount: 1,
                      publishedAt: "2026-01-05T12:00:00Z",
                    },
                  },
                },
              },
            ]
          : [
              {
                id: "thread-one",
                snippet: {
                  totalReplyCount: 2,
                  topLevelComment: {
                    id: "comment-one",
                    snippet: {
                      textOriginal: "Great explanation at 1:20!",
                      authorDisplayName: "Viewer one",
                      likeCount: 14,
                      publishedAt: "2026-01-03T12:00:00Z",
                    },
                  },
                },
              },
              {
                id: "thread-two",
                snippet: {
                  totalReplyCount: 0,
                  topLevelComment: {
                    id: "comment-two",
                    snippet: {
                      textOriginal: "Please make a follow-up.",
                      authorDisplayName: "Viewer two",
                      likeCount: 3,
                      publishedAt: "2026-01-04T12:00:00Z",
                    },
                  },
                },
              },
            ],
      });
    }

    if (url.pathname.endsWith("/comments")) {
      return jsonResponse({
        items: [
          {
            id: "reply-one",
            snippet: {
              parentId: "comment-one",
              textOriginal: "That was my favourite part too.",
              authorDisplayName: "Reply one",
              likeCount: 2,
              publishedAt: "2026-01-03T13:00:00Z",
            },
          },
          {
            id: "reply-two",
            snippet: {
              parentId: "comment-one",
              textOriginal: "It cleared up my confusion.",
              authorDisplayName: "Reply two",
              likeCount: 1,
              publishedAt: "2026-01-03T14:00:00Z",
            },
          },
        ],
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  const client = new YouTubeDataClient({
    apiKey: "test-youtube-key",
    fetchImpl,
  });
  const result = await client.fetchVideo(VIDEO_URL, { maxComments: 100 });

  assert.equal(result.videoId, VIDEO_ID);
  assert.equal(result.title, "Example video");
  assert.equal(result.channel, "Example channel");
  assert.equal(result.viewCount, 123456);
  assert.equal(result.likeCount, 9001);
  assert.equal(result.reportedCommentCount, 2);
  assert.equal(result.description, "A detailed example.");
  assert.deepEqual(result.tags, ["example", "tutorial"]);
  assert.equal(result.category.title, "Education");
  assert.equal(result.durationSeconds, 210);
  assert.equal(result.captionsAvailable, true);
  assert.equal(result.thumbnail.quality, "maxres");
  assert.equal(result.thumbnail.width, 1280);
  assert.equal(result.comments.length, 3);
  assert.equal(result.comments[0].likeCount, 14);
  assert.deepEqual(result.comments[0].timestamps, [
    { label: "1:20", seconds: 80 },
  ]);
  assert.equal(result.comments[0].replies.length, 2);
  assert.equal(result.commentSampling.completeReplyThreads, 1);
  assert.equal(result.commentSampling.sampledReplies, 2);
  assert.equal(
    requests.every(
      (requestUrl) =>
        requestUrl.searchParams.get("key") === "test-youtube-key",
    ),
    true,
  );
  assert.deepEqual(
    requests
      .filter((requestUrl) =>
        requestUrl.pathname.endsWith("/commentThreads"),
      )
      .map((requestUrl) => requestUrl.searchParams.get("order"))
      .sort(),
    ["relevance", "time"],
  );
});

test("YouTubeDataClient treats disabled comments as an empty sample", async () => {
  const fetchImpl = async (url) => {
    if (url.pathname.endsWith("/videos")) {
      return jsonResponse({
        items: [
          {
            id: VIDEO_ID,
            snippet: {
              title: "Comments disabled",
              channelTitle: "Example channel",
              channelId: CHANNEL_ID,
              thumbnails: {},
            },
            contentDetails: {
              duration: "PT1M",
              caption: "false",
            },
            statistics: {
              viewCount: "10",
              commentCount: "0",
            },
          },
        ],
      });
    }

    return jsonResponse(
      {
        error: {
          message: "Comments are disabled for this video.",
          errors: [{ reason: "commentsDisabled" }],
        },
      },
      403,
    );
  };

  const client = new YouTubeDataClient({
    apiKey: "test-youtube-key",
    fetchImpl,
  });
  const result = await client.fetchVideo(VIDEO_URL, { maxComments: 100 });

  assert.deepEqual(result.comments, []);
});

test("YouTubeDataClient retrieves a channel catalogue and caches the result", async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);

    if (url.pathname.endsWith("/channels")) {
      return jsonResponse({
        items: [
          {
            id: CHANNEL_ID,
            snippet: {
              title: "Example channel",
              thumbnails: {
                high: { url: "https://yt3.example/channel.jpg" },
              },
            },
            contentDetails: {
              relatedPlaylists: { uploads: "UUexample" },
            },
            statistics: {
              viewCount: "9999",
              subscriberCount: "500",
              hiddenSubscriberCount: false,
              videoCount: "2",
            },
          },
        ],
      });
    }

    if (url.pathname.endsWith("/playlistItems")) {
      return jsonResponse({
        items: [
          { contentDetails: { videoId: "video-one" } },
          { contentDetails: { videoId: "video-two" } },
        ],
      });
    }

    if (url.pathname.endsWith("/videos")) {
      return jsonResponse({
        items: [
          {
            id: "video-one",
            snippet: {
              title: "First",
              description: "A first video",
              publishedAt: "2026-01-01T00:00:00Z",
            },
            contentDetails: { duration: "PT1M30S" },
            statistics: {
              viewCount: "8000",
              likeCount: "300",
              commentCount: "40",
            },
          },
          {
            id: "video-two",
            snippet: {
              title: "Second",
              description: "A second video",
              publishedAt: "2026-01-02T00:00:00Z",
            },
            contentDetails: { duration: "PT2M" },
            statistics: {
              viewCount: "1999",
              likeCount: "100",
              commentCount: "10",
            },
          },
        ],
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };
  const client = new YouTubeDataClient({
    apiKey: "test-youtube-key",
    fetchImpl,
  });
  const url = "https://www.youtube.com/@example";

  const firstResult = await client.fetchChannel(url);
  const secondResult = await client.fetchChannel(url);

  assert.equal(firstResult.channelId, CHANNEL_ID);
  assert.equal(firstResult.subscriberCount, 500);
  assert.equal(firstResult.videos.length, 2);
  assert.equal(firstResult.videos[0].durationSeconds, 90);
  assert.equal(firstResult.videos[0].viewCount, 8000);
  assert.strictEqual(secondResult, firstResult);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].searchParams.get("forHandle"), "@example");
  assert.equal(requests[1].searchParams.get("playlistId"), "UUexample");
  assert.equal(requests[2].searchParams.get("id"), "video-one,video-two");
});

test("YouTubeDataClient paginates uploads and batches video lookups by 50", async () => {
  const requestedBatchSizes = [];
  const fetchImpl = async (url) => {
    if (url.pathname.endsWith("/channels")) {
      return jsonResponse({
        items: [
          {
            id: CHANNEL_ID,
            snippet: { title: "Large channel", thumbnails: {} },
            contentDetails: {
              relatedPlaylists: { uploads: "UUlarge" },
            },
            statistics: { viewCount: "1", videoCount: "51" },
          },
        ],
      });
    }

    if (url.pathname.endsWith("/playlistItems")) {
      const isSecondPage = url.searchParams.get("pageToken") === "page-two";
      return jsonResponse({
        nextPageToken: isSecondPage ? undefined : "page-two",
        items: isSecondPage
          ? [{ contentDetails: { videoId: "video-51" } }]
          : Array.from({ length: 50 }, (_, index) => ({
              contentDetails: { videoId: `video-${index + 1}` },
            })),
      });
    }

    if (url.pathname.endsWith("/videos")) {
      const ids = url.searchParams.get("id").split(",");
      requestedBatchSizes.push(ids.length);
      return jsonResponse({
        items: ids.map((id) => ({
          id,
          snippet: { title: id, description: "" },
          contentDetails: { duration: "PT1M" },
          statistics: { viewCount: "1", commentCount: "0" },
        })),
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };
  const client = new YouTubeDataClient({
    apiKey: "test-youtube-key",
    fetchImpl,
    channelBatchConcurrency: 2,
  });

  const result = await client.fetchChannel(
    "https://www.youtube.com/@large-channel",
  );

  assert.equal(result.videos.length, 51);
  assert.deepEqual(requestedBatchSizes.sort((a, b) => b - a), [50, 1]);
});
