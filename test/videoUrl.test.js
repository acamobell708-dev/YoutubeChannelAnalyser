import test from "node:test";
import assert from "node:assert/strict";

import {
  extractVideoId,
  parseCommentLimit,
  validateYouTubeVideoUrl,
} from "../src/domain/videoUrl.js";

const VIDEO_ID = "dQw4w9WgXcQ";
const STANDARD_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;

test("extractVideoId supports standard, shortened, Shorts, live, and embed URLs", () => {
  assert.equal(extractVideoId(STANDARD_URL), VIDEO_ID);
  assert.equal(extractVideoId(`https://youtu.be/${VIDEO_ID}?t=10`), VIDEO_ID);
  assert.equal(
    extractVideoId(`https://youtube.com/shorts/${VIDEO_ID}`),
    VIDEO_ID,
  );
  assert.equal(
    extractVideoId(`https://www.youtube.com/live/${VIDEO_ID}`),
    VIDEO_ID,
  );
  assert.equal(
    extractVideoId(`https://www.youtube.com/embed/${VIDEO_ID}`),
    VIDEO_ID,
  );
});

test("validateYouTubeVideoUrl rejects unrelated and malformed URLs", () => {
  assert.throws(
    () => validateYouTubeVideoUrl(`https://example.com/watch?v=${VIDEO_ID}`),
    /not a recognised YouTube video URL/i,
  );
  assert.throws(() => validateYouTubeVideoUrl("not a url"), /full YouTube/i);
});

test("parseCommentLimit supplies the default and enforces the configured bounds", () => {
  assert.equal(parseCommentLimit(undefined), 100);
  assert.equal(parseCommentLimit("250"), 250);
  assert.throws(() => parseCommentLimit(0), /from 1 to 500/i);
  assert.throws(() => parseCommentLimit(501), /from 1 to 500/i);
  assert.throws(() => parseCommentLimit("10.5"), /whole number/i);
});
