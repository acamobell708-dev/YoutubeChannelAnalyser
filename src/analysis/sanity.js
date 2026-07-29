import { extractVideoId } from "../domain/videoUrl.js";

export function runSanityChecks({ video, commentSummary }) {
  const checks = [];
  const errors = [];

  if (extractVideoId(video.sourceUrl) === video.videoId) {
    checks.push("video ID matches the supplied URL");
  } else {
    errors.push("video ID does not match the supplied URL");
  }

  if (Number.isInteger(video.viewCount) && video.viewCount >= 0) {
    checks.push("view count is a non-negative integer");
  } else {
    errors.push("view count is missing or invalid");
  }

  if (video.title.trim()) {
    checks.push("video title is present");
  } else {
    errors.push("video title is missing");
  }

  if (commentSummary.trim()) {
    checks.push("comment summary is non-empty");
  } else {
    errors.push("comment summary is empty");
  }

  return {
    passed: errors.length === 0,
    checks,
    errors,
  };
}
