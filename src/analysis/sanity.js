import { extractVideoId } from "../domain/videoUrl.js";
import { CHANNEL_ID_PATTERN } from "../domain/channelUrl.js";

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

function isDescending(items, field) {
  return items.every(
    (item, index) =>
      index === 0 || (items[index - 1][field] ?? 0) >= (item[field] ?? 0),
  );
}

export function runChannelSanityChecks({
  channel,
  topByViews,
  topByComments,
  performanceAnalysis,
}) {
  const checks = [];
  const errors = [];

  if (CHANNEL_ID_PATTERN.test(channel.channelId)) {
    checks.push("resolved channel ID is valid");
  } else {
    errors.push("resolved channel ID is invalid");
  }

  if (
    Number.isInteger(channel.analysedVideoCount) &&
    channel.analysedVideoCount > 0
  ) {
    checks.push("at least one public video was analysed");
  } else {
    errors.push("no public videos were analysed");
  }

  if (
    topByViews.length <= 10 &&
    topByViews.length > 0 &&
    isDescending(topByViews, "viewCount")
  ) {
    checks.push("view ranking is limited to ten and sorted descending");
  } else {
    errors.push("view ranking is empty, oversized, or incorrectly sorted");
  }

  if (
    topByComments.length <= 10 &&
    topByComments.length > 0 &&
    isDescending(topByComments, "commentCount")
  ) {
    checks.push("comment ranking is limited to ten and sorted descending");
  } else {
    errors.push("comment ranking is empty, oversized, or incorrectly sorted");
  }

  if (performanceAnalysis.trim()) {
    checks.push("GPT-5.4 performance analysis is non-empty");
  } else {
    errors.push("GPT-5.4 performance analysis is empty");
  }

  return {
    passed: errors.length === 0,
    checks,
    errors,
  };
}
