import test from "node:test";
import assert from "node:assert/strict";

import request from "supertest";

import { createApp } from "../src/app.js";

const CHANNEL_ID = `UC${"d".repeat(22)}`;

const readyConfig = {
  hasYouTubeApiKey: true,
  hasOpenAIApiKey: true,
  openaiVideoModel: "gpt-5.4",
  openaiChannelModel: "gpt-5.4",
};

test("health endpoint reports readiness without exposing API keys", async () => {
  const app = createApp({
    config: readyConfig,
    analyseVideo: async () => {
      throw new Error("not called");
    },
    analyseChannel: async () => {
      throw new Error("not called");
    },
  });

  const response = await request(app).get("/api/health").expect(200);

  assert.equal(response.body.configuration.ready, true);
  assert.equal(response.body.configuration.model, "gpt-5.4");
  assert.equal(response.body.configuration.channelModel, "gpt-5.4");
  assert.equal(JSON.stringify(response.body).includes("api-key"), false);
});

test("video dashboard and generated assets are always revalidated", async () => {
  const app = createApp({
    config: readyConfig,
    analyseVideo: async () => {
      throw new Error("not called");
    },
    analyseChannel: async () => {
      throw new Error("not called");
    },
  });

  const page = await request(app).get("/VideoDashboard.html").expect(200);
  assert.match(page.headers["cache-control"], /no-store/);
  assert.equal(page.headers.pragma, "no-cache");
  assert.match(page.text, /phase1-compact-20260730/);

  const asset = await request(app)
    .get("/assets/VideoDashboard.js")
    .expect(200);
  assert.match(asset.headers["cache-control"], /no-cache/);
});

test("analysis endpoint returns a mocked successful result", async () => {
  const expected = {
    video: { videoId: "dQw4w9WgXcQ", title: "Example" },
    insights: { audience: { executiveSummary: "Positive response." } },
    sanity: { passed: true, checks: ["title present"], errors: [] },
  };
  const app = createApp({
    config: readyConfig,
    analyseVideo: async ({ url, maxComments }) => {
      assert.match(url, /youtube\.com/);
      assert.equal(maxComments, 50);
      return expected;
    },
    analyseChannel: async () => {
      throw new Error("not called");
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

test("channel analysis endpoint returns a mocked successful result", async () => {
  const expected = {
    channel: { channelId: CHANNEL_ID, title: "Example channel" },
    topByViews: [],
    topByComments: [],
    performanceAnalysis: "- Tutorials lead both rankings.",
    sanity: { passed: true, checks: ["ranked"], errors: [] },
  };
  const app = createApp({
    config: readyConfig,
    analyseVideo: async () => {
      throw new Error("not called");
    },
    analyseChannel: async ({ url }) => {
      assert.equal(url, "https://www.youtube.com/@example");
      return expected;
    },
  });

  const response = await request(app)
    .post("/api/channel-analysis")
    .send({ url: "https://www.youtube.com/@example" })
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
    analyseChannel: async () => {
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
