import test from "node:test";
import assert from "node:assert/strict";

import { parseYouTubeChannelUrl } from "../src/domain/channelUrl.js";

const CHANNEL_ID = `UC${"a".repeat(22)}`;

test("parseYouTubeChannelUrl supports handles, IDs, and legacy usernames", () => {
  assert.deepEqual(
    parseYouTubeChannelUrl("https://www.youtube.com/@GoogleDevelopers").lookup,
    { parameter: "forHandle", value: "@GoogleDevelopers" },
  );
  assert.deepEqual(
    parseYouTubeChannelUrl(`https://youtube.com/channel/${CHANNEL_ID}`).lookup,
    { parameter: "id", value: CHANNEL_ID },
  );
  assert.deepEqual(
    parseYouTubeChannelUrl("https://m.youtube.com/user/GoogleDevelopers").lookup,
    { parameter: "forUsername", value: "GoogleDevelopers" },
  );
});

test("parseYouTubeChannelUrl rejects non-YouTube and unsupported custom URLs", () => {
  assert.throws(
    () => parseYouTubeChannelUrl("https://example.com/@channel"),
    (error) => error.code === "INVALID_CHANNEL_URL",
  );
  assert.throws(
    () => parseYouTubeChannelUrl("https://youtube.com/c/example"),
    (error) => error.code === "UNSUPPORTED_CHANNEL_URL",
  );
});
