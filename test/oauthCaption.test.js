import test from "node:test";
import assert from "node:assert/strict";

import { GoogleOAuthService } from "../src/services/googleOAuthService.js";
import {
  parseWebVtt,
  YouTubeCaptionService,
} from "../src/services/youtubeCaptionService.js";

const CHANNEL_ID = `UC${"o".repeat(22)}`;

test("GoogleOAuthService uses state, PKCE, and keeps tokens server-side", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/token")) {
      return new Response(
        JSON.stringify({
          access_token: "private-access-token",
          refresh_token: "private-refresh-token",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        items: [{ id: CHANNEL_ID, snippet: { title: "Owner channel" } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const service = new GoogleOAuthService({
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "http://localhost:3000/auth/google/callback",
    sessionSecret: "x".repeat(32),
    fetchImpl,
  });

  const start = service.beginAuthorization();
  const authorisationUrl = new URL(start.url);
  assert.equal(authorisationUrl.searchParams.get("state"), start.state);
  assert.equal(
    authorisationUrl.searchParams.get("code_challenge_method"),
    "S256",
  );
  assert.ok(authorisationUrl.searchParams.get("code_challenge"));

  const result = await service.completeAuthorization({
    code: "one-use-code",
    state: start.state,
    expectedState: start.state,
  });
  const status = service.getStatus(result.sessionId);

  assert.equal(status.connected, true);
  assert.deepEqual(status.channels, [
    { id: CHANNEL_ID, title: "Owner channel" },
  ]);
  assert.doesNotMatch(JSON.stringify(status), /private-(access|refresh)-token/);
  assert.match(String(requests[1].options.headers.Authorization), /^Bearer /);
});

test("GoogleOAuthService rejects a mismatched callback state before exchange", async () => {
  let fetchCount = 0;
  const service = new GoogleOAuthService({
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri: "http://localhost:3000/auth/google/callback",
    sessionSecret: "x".repeat(32),
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error("must not be called");
    },
  });
  const start = service.beginAuthorization();
  await assert.rejects(
    () =>
      service.completeAuthorization({
        code: "code",
        state: start.state,
        expectedState: "attacker-state",
      }),
    (error) => error.code === "INVALID_OAUTH_STATE",
  );
  assert.equal(fetchCount, 0);
});

test("YouTubeCaptionService downloads captions only for an owned channel", async () => {
  const requests = [];
  const oauthService = {
    configured: true,
    getStatus: () => ({
      connected: true,
      channels: [{ id: CHANNEL_ID, title: "Owner channel" }],
    }),
    getAccessToken: async () => "owner-token",
  };
  const service = new YouTubeCaptionService({
    oauthService,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (requests.length === 1) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "caption-track",
                snippet: {
                  language: "en",
                  trackKind: "standard",
                  isDraft: false,
                  status: "serving",
                  isAutoSynced: true,
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        [
          "WEBVTT",
          "",
          "00:00:00.000 --> 00:00:01.500",
          "A concise hook.",
          "",
          "00:00:01.500 --> 00:00:03.000",
          "Then the explanation.",
          "",
        ].join("\n"),
        { status: 200 },
      );
    },
  });

  const result = await service.fetchTranscript({
    videoId: "dQw4w9WgXcQ",
    channelId: CHANNEL_ID,
    ownerSessionId: "session",
  });

  assert.equal(result.status, "available");
  assert.equal(result.segmentCount, 2);
  assert.equal(result.text, "A concise hook. Then the explanation.");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers.Authorization, "Bearer owner-token");
  assert.equal(requests[1].options.headers.Authorization, "Bearer owner-token");
});

test("caption parsing is deterministic and a non-owner returns Unknown", async () => {
  const parsed = parseWebVtt(
    "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<b>Hello &amp; welcome</b>\n",
  );
  assert.deepEqual(parsed, [
    { startSeconds: 1, endSeconds: 2, text: "Hello & welcome" },
  ]);

  let called = false;
  const service = new YouTubeCaptionService({
    oauthService: {
      configured: true,
      getStatus: () => ({
        connected: true,
        channels: [{ id: CHANNEL_ID, title: "Owner channel" }],
      }),
    },
    fetchImpl: async () => {
      called = true;
      throw new Error("must not be called");
    },
  });
  const result = await service.fetchTranscript({
    videoId: "dQw4w9WgXcQ",
    channelId: `UC${"n".repeat(22)}`,
    ownerSessionId: "session",
  });
  assert.equal(result.displayValue, "Unknown");
  assert.match(result.reason, /does not own/i);
  assert.equal(called, false);
});
