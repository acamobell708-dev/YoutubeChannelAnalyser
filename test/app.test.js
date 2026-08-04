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
  hasGoogleOAuth: false,
  googleOAuthRedirectUri: "http://localhost:3000/auth/google/callback",
  sessionSecret: "",
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

test("daily token usage endpoint exposes quota state without secrets", async () => {
  const dailyTokenQuota = {
    getStatus: async () => ({
      usedTokens: 150_000,
      projectedTokens: 150_000,
      warning: true,
      locked: false,
      limit: 200_000,
      source: "this application",
    }),
  };
  const app = createApp({
    config: readyConfig,
    dailyTokenQuota,
    analyseVideo: async () => ({}) ,
    analyseChannel: async () => ({}),
  });

  const response = await request(app).get("/api/daily-token-usage").expect(200);
  assert.equal(response.body.usage.warning, true);
  assert.equal(JSON.stringify(response.body).includes("admin-key"), false);
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
  assert.match(
    page.text,
    /\/styles\/dashboard\.css\?v=[a-zA-Z0-9-]+/,
  );
  assert.match(
    page.text,
    /\/styles\/dev-fixture\.css\?v=[a-zA-Z0-9-]+/,
  );
  assert.match(
    page.text,
    /\/assets\/VideoDashboard\.js\?v=[a-zA-Z0-9-]+/,
  );

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
    analyseVideo: async ({ url, maxComments, analysisMode }) => {
      assert.match(url, /youtube\.com/);
      assert.equal(maxComments, 50);
      assert.equal(analysisMode, "heavy");
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
      analysisMode: "heavy",
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
    analyseChannel: async ({ url, analysisMode, videoType, ownerSessionId }) => {
      assert.equal(url, "https://www.youtube.com/@example");
      assert.equal(analysisMode, "heavy");
      assert.equal(videoType, "short");
      assert.equal(ownerSessionId, null);
      return expected;
    },
  });

  const response = await request(app)
    .post("/api/channel-analysis")
    .send({
      url: "https://www.youtube.com/@example",
      analysisMode: "heavy",
      videoType: "short",
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

test("owner OAuth session stays in an HttpOnly cookie and reaches analysis", async () => {
  const oauthConfig = {
    ...readyConfig,
    hasGoogleOAuth: true,
    sessionSecret: "s".repeat(32),
  };
  let receivedOwnerSessionId;
  const googleOAuthService = {
    configured: true,
    beginAuthorization: () => ({
      state: "valid-state",
      url: "https://accounts.google.com/o/oauth2/v2/auth?state=valid-state",
    }),
    completeAuthorization: async ({ code, state, expectedState }) => {
      assert.equal(code, "one-use-code");
      assert.equal(state, "valid-state");
      assert.equal(expectedState, "valid-state");
      return { sessionId: "server-only-session-id" };
    },
    getStatus: (sessionId) => ({
      configured: true,
      connected: sessionId === "server-only-session-id",
      channels:
        sessionId === "server-only-session-id"
          ? [{ id: CHANNEL_ID, title: "Owner channel" }]
          : [],
    }),
    logout: async () => undefined,
  };
  const app = createApp({
    config: oauthConfig,
    googleOAuthService,
    analyseVideo: async ({ ownerSessionId, analysisMode }) => {
      receivedOwnerSessionId = ownerSessionId;
      assert.equal(analysisMode, "economy");
      return { sanity: { passed: true } };
    },
    analyseChannel: async () => {
      throw new Error("not called");
    },
  });
  const agent = request.agent(app);

  const start = await agent.get("/auth/google/start").expect(302);
  assert.match(start.headers["set-cookie"].join(" "), /HttpOnly/i);
  assert.match(start.headers["set-cookie"].join(" "), /SameSite=Lax/i);

  const callback = await agent
    .get(
      "/auth/google/callback?code=one-use-code&state=valid-state",
    )
    .expect(302);
  assert.equal(
    callback.headers.location,
    "/VideoDashboard.html?owner=connected",
  );
  const sessionCookie = callback.headers["set-cookie"].join(" ");
  assert.match(sessionCookie, /ytsa_owner_session=/);
  assert.match(sessionCookie, /HttpOnly/i);
  assert.doesNotMatch(sessionCookie, /private-access-token/);

  const status = await agent.get("/api/auth/status").expect(200);
  assert.equal(status.body.ownerAuth.connected, true);

  await agent
    .post("/api/video-analysis")
    .send({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      maxComments: 10,
    })
    .expect(200);
  assert.equal(receivedOwnerSessionId, "server-only-session-id");
});

test("owner OAuth returns to the dashboard that started sign-in", async () => {
  const oauthConfig = {
    ...readyConfig,
    hasGoogleOAuth: true,
    sessionSecret: "s".repeat(32),
  };
  const googleOAuthService = {
    configured: true,
    beginAuthorization: () => ({
      state: "channel-state",
      url: "https://accounts.google.com/o/oauth2/v2/auth?state=channel-state",
    }),
    completeAuthorization: async () => ({ sessionId: "channel-session" }),
    getStatus: () => ({ configured: true, connected: false, channels: [] }),
    logout: async () => undefined,
  };
  const app = createApp({
    config: oauthConfig,
    googleOAuthService,
    analyseVideo: async () => ({}),
    analyseChannel: async () => ({}),
  });
  const agent = request.agent(app);

  await agent
    .get("/auth/google/start?returnTo=%2FChannelDashbaord.html")
    .expect(302);
  const callback = await agent
    .get("/auth/google/callback?code=code&state=channel-state")
    .expect(302);
  assert.equal(
    callback.headers.location,
    "/ChannelDashbaord.html?owner=connected",
  );
});
