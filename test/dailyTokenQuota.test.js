import test from "node:test";
import assert from "node:assert/strict";

import {
  DAILY_TOKEN_LIMIT,
  DailyTokenQuota,
} from "../src/services/dailyTokenQuota.js";

const DAY = Date.parse("2026-08-01T12:00:00Z");

test("daily quota warns at 150,000 tokens and locks reservations beyond 200,000", async () => {
  const quota = new DailyTokenQuota({ now: () => DAY });
  const first = await quota.reserve(150_000);
  first.settle(150_000);

  const warning = await quota.getStatus();
  assert.equal(warning.warning, true);
  assert.equal(warning.locked, false);
  assert.equal(warning.usedTokens, 150_000);

  const second = await quota.reserve(50_000);
  second.settle(50_000);
  const locked = await quota.getStatus();
  assert.equal(locked.locked, true);
  assert.equal(locked.usedTokens, DAILY_TOKEN_LIMIT);
  await assert.rejects(
    () => quota.reserve(1),
    (error) => error.code === "DAILY_TOKEN_LIMIT_REACHED" && error.status === 429,
  );
});

test("daily quota conservatively charges an unsuccessful reserved request", async () => {
  const quota = new DailyTokenQuota({ now: () => DAY });
  const reservation = await quota.reserve(5_000);
  reservation.settle();
  assert.equal((await quota.getStatus()).usedTokens, 5_000);
});

test("optional OpenAI organisation usage supplements the status", async () => {
  let requestedUrl = "";
  const quota = new DailyTokenQuota({
    adminKey: "admin-key",
    now: () => DAY,
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      assert.equal(options.headers.Authorization, "Bearer admin-key");
      return {
        ok: true,
        json: async () => ({
          data: [{ results: [{ input_tokens: 140_000, output_tokens: 15_000 }] }],
        }),
      };
    },
  });

  const status = await quota.getStatus();
  assert.equal(status.usedTokens, 155_000);
  assert.equal(status.warning, true);
  assert.equal(status.source, "OpenAI organisation usage");
  assert.match(requestedUrl, /organization\/usage\/completions/);
  assert.match(requestedUrl, /bucket_width=1d/);
});
