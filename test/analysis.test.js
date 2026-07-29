import test from "node:test";
import assert from "node:assert/strict";

import { createVideoAnalyser } from "../src/analysis/analyseVideo.js";
import { runSanityChecks } from "../src/analysis/sanity.js";
import { CommentSummarizer } from "../src/services/commentSummarizer.js";

const VIDEO_ID = "dQw4w9WgXcQ";
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

const video = {
  sourceUrl: VIDEO_URL,
  videoId: VIDEO_ID,
  title: "Example video",
  channel: "Example channel",
  publishedAt: "2026-01-02T12:00:00Z",
  thumbnailUrl: "https://i.ytimg.com/example.jpg",
  viewCount: 123456,
  likeCount: 9001,
  reportedCommentCount: 2,
  comments: [
    { text: "Great video!", author: "A", likeCount: 8 },
    { text: "Interesting perspective.", author: "B", likeCount: 1 },
  ],
};

test("CommentSummarizer sends bounded untrusted data to the Responses API", async () => {
  let request;
  const client = {
    responses: {
      create: async (options) => {
        request = options;
        return {
          output_text:
            "- Viewers are broadly positive.\n- Several request a follow-up.",
        };
      },
    },
  };
  const summarizer = new CommentSummarizer({
    apiKey: "test-openai-key",
    model: "gpt-5.4-mini",
    client,
  });

  const summary = await summarizer.summarize(video);

  assert.match(summary, /broadly positive/);
  assert.equal(request.model, "gpt-5.4-mini");
  assert.equal(request.reasoning.effort, "low");
  assert.match(request.instructions, /untrusted quoted data/i);
  assert.doesNotMatch(request.input, /test-openai-key/);
});

test("video analyser returns only client-safe data and a passed sanity check", async () => {
  const youtubeClient = {
    fetchVideo: async () => video,
  };
  const summarizer = {
    summarize: async () => "- Viewers are broadly positive.",
  };
  const analyseVideo = createVideoAnalyser({ youtubeClient, summarizer });

  const result = await analyseVideo({
    url: VIDEO_URL,
    maxComments: 100,
  });

  assert.equal(result.video.videoId, VIDEO_ID);
  assert.equal(result.video.sampledCommentCount, 2);
  assert.equal(result.video.comments, undefined);
  assert.equal(result.sanity.passed, true);
  assert.match(result.sanity.checks.join(" "), /view count/i);
});

test("sanity check identifies a mismatched video ID", () => {
  const sanity = runSanityChecks({
    video: { ...video, videoId: "aaaaaaaaaaa" },
    commentSummary: "A summary",
  });

  assert.equal(sanity.passed, false);
  assert.match(sanity.errors.join(" "), /does not match/i);
});
