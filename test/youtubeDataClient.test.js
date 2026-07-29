import test from "node:test";
import assert from "node:assert/strict";

import { YouTubeDataClient } from "../src/services/youtubeDataClient.js";

const VIDEO_ID = "dQw4w9WgXcQ";
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

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
              channelTitle: "Example channel",
              publishedAt: "2026-01-02T12:00:00Z",
              thumbnails: {
                high: { url: "https://i.ytimg.com/example.jpg" },
              },
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

    if (url.pathname.endsWith("/commentThreads")) {
      return jsonResponse({
        items: [
          {
            snippet: {
              topLevelComment: {
                snippet: {
                  textOriginal: "Great explanation!",
                  authorDisplayName: "Viewer one",
                  likeCount: 14,
                  publishedAt: "2026-01-03T12:00:00Z",
                },
              },
            },
          },
          {
            snippet: {
              topLevelComment: {
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
  assert.equal(result.comments.length, 2);
  assert.equal(result.comments[0].likeCount, 14);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get("key"), "test-youtube-key");
  assert.equal(requests[1].searchParams.get("order"), "relevance");
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
              thumbnails: {},
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
