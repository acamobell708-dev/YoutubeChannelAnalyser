import test from "node:test";
import assert from "node:assert/strict";

import request from "supertest";

import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createSyntheticShortAnalysis } from "../src/fixtures/syntheticShortAnalysis.js";

function appConfig(devFixturesEnabled) {
  return {
    hasYouTubeApiKey: false,
    hasOpenAIApiKey: false,
    hasOpenAIAdminKey: false,
    hasGoogleOAuth: false,
    googleOAuthRedirectUri: "http://localhost:3000/auth/google/callback",
    sessionSecret: "",
    openaiVideoModel: "gpt-5.4",
    openaiChannelModel: "gpt-5.4",
    devFixturesEnabled,
  };
}

function createTestApp(devFixturesEnabled) {
  return createApp({
    config: appConfig(devFixturesEnabled),
    analyseVideo: async () => {
      throw new Error("real video analysis must not run for the fixture");
    },
    analyseChannel: async () => {
      throw new Error("channel analysis must not run for the fixture");
    },
  });
}

test("synthetic fixture is controlled by its explicit flag in every environment", () => {
  assert.equal(
    loadConfig({
      NODE_ENV: "development",
      ENABLE_DEV_FIXTURES: "true",
    }).devFixturesEnabled,
    true,
  );
  assert.equal(
    loadConfig({
      NODE_ENV: "production",
      ENABLE_DEV_FIXTURES: "true",
    }).devFixturesEnabled,
    true,
  );
  assert.equal(
    loadConfig({
      NODE_ENV: "development",
      ENABLE_DEV_FIXTURES: "false",
    }).devFixturesEnabled,
    false,
  );
  assert.equal(
    loadConfig({
      NODE_ENV: "production",
      ENABLE_DEV_FIXTURES: "false",
    }).devFixturesEnabled,
    false,
  );
  assert.equal(
    loadConfig({
      NODE_ENV: "development",
    }).devFixturesEnabled,
    false,
  );
});

test("synthetic Short fixture passes the normal result sanity checks", () => {
  const analysis = createSyntheticShortAnalysis();

  assert.equal(analysis.fixture.synthetic, true);
  assert.equal(analysis.videoFormat.resolved, "short");
  assert.equal(analysis.retention.points.length, 101);
  assert.ok(analysis.retention.overview.averageViewPercentage > 100);
  assert.equal(analysis.retention.momentExplanations.length, 3);
  assert.equal(analysis.discovery.rows[0].label, "Shorts Feed");
  assert.equal(
    analysis.discovery.rows.some((row) => row.id === "sound_pages"),
    true,
  );
  assert.match(
    analysis.insights.nextVideo.optimisation.tags,
    /result reveal/i,
  );
  assert.equal(
    analysis.phaseTwo.timeline.every((point) => Number.isFinite(point.atSeconds)),
    true,
  );
  assert.equal(analysis.sanity.passed, true);
});

test("synthetic Short route is absent when development fixtures are disabled", async () => {
  const response = await request(createTestApp(false))
    .post("/api/dev-fixtures/synthetic-short")
    .expect(404);

  assert.equal(response.body.error.code, "NOT_FOUND");
});

test("synthetic Short route works without API keys, OAuth or token quota", async () => {
  const response = await request(createTestApp(true))
    .post("/api/dev-fixtures/synthetic-short")
    .expect(200);

  assert.equal(response.headers["x-dev-fixture"], "synthetic-short");
  assert.match(response.headers["cache-control"], /no-store/);
  assert.equal(response.body.analysis.fixture.synthetic, true);
  assert.equal(response.body.analysis.videoFormat.creatorContentType, "SHORTS");
  assert.equal(response.body.analysis.metrics.engagedViews, 1_500);
  assert.equal(response.body.analysis.retention.chart.replayDetected, true);
});
