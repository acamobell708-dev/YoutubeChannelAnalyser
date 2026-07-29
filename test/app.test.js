import test from "node:test";
import assert from "node:assert/strict";

import request from "supertest";

import { createApp } from "../src/app.js";

const readyConfig = {
  hasYouTubeApiKey: true,
  hasOpenAIApiKey: true,
  openaiModel: "gpt-5.4-mini",
};

test("health endpoint reports readiness without exposing API keys", async () => {
  const app = createApp({
    config: readyConfig,
    analyseVideo: async () => {
      throw new Error("not called");
    },
  });

  const response = await request(app).get("/api/health").expect(200);

  assert.equal(response.body.configuration.ready, true);
  assert.equal(response.body.configuration.model, "gpt-5.4-mini");
  assert.equal(JSON.stringify(response.body).includes("api-key"), false);
});

test("analysis endpoint returns a mocked successful result", async () => {
  const expected = {
    video: { videoId: "dQw4w9WgXcQ", title: "Example" },
    commentSummary: "- Positive response.",
    sanity: { passed: true, checks: ["title present"], errors: [] },
  };
  const app = createApp({
    config: readyConfig,
    analyseVideo: async ({ url, maxComments }) => {
      assert.match(url, /youtube\.com/);
      assert.equal(maxComments, 50);
      return expected;
    },
  });

  const response = await request(app)
    .post("/api/video-analysis")
    .send({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      maxComments: 50,
    })
    .expect(200);

  assert.deepEqual(response.body.analysis, expected);
});

test("analysis endpoint explains missing server configuration", async () => {
  const app = createApp({
    config: {
      ...readyConfig,
      hasYouTubeApiKey: false,
      hasOpenAIApiKey: false,
    },
    analyseVideo: async () => {
      throw new Error("not called");
    },
  });

  const response = await request(app)
    .post("/api/video-analysis")
    .send({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      maxComments: 100,
    })
    .expect(503);

  assert.equal(response.body.error.code, "CONFIGURATION_REQUIRED");
  assert.match(response.body.error.message, /YOUTUBE_API_KEY/);
  assert.match(response.body.error.message, /OPENAI_API_KEY/);
});
