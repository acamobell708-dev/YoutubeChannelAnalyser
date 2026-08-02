import { extractVideoId } from "../domain/videoUrl.js";
import { CHANNEL_ID_PATTERN } from "../domain/channelUrl.js";
import { FEEDBACK_CATEGORIES } from "./videoInsightSchema.js";

export function runSanityChecks({
  video,
  metrics,
  insights,
  phaseTwo,
  retention,
  tokenBudget,
}) {
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

  if (
    Number.isInteger(video.durationSeconds) &&
    video.durationSeconds >= 0 &&
    Array.isArray(video.tags) &&
    video.category?.title
  ) {
    checks.push("public metadata is complete and correctly typed");
  } else {
    errors.push("public metadata is incomplete or incorrectly typed");
  }

  const expectedLikesPer100 =
    video.viewCount > 0 && Number.isFinite(video.likeCount)
      ? Math.round(
          ((video.likeCount / video.viewCount) * 100 + Number.EPSILON) *
            100,
        ) / 100
      : null;
  const expectedCommentsPer100 =
    video.viewCount > 0 && Number.isFinite(video.reportedCommentCount)
      ? Math.round(
          (
            (video.reportedCommentCount / video.viewCount) *
              100 +
            Number.EPSILON
          ) * 100,
        ) / 100
      : null;

  if (
    Number.isFinite(metrics.viewsPerDay) &&
    metrics.viewsPerDay >= 0 &&
    metrics.likesPer100Views === expectedLikesPer100 &&
    metrics.commentsPer100Views === expectedCommentsPer100
  ) {
    checks.push("derived performance metrics match the public totals");
  } else {
    errors.push("derived performance metrics are missing or inconsistent");
  }

  const feedbackRows = insights?.audience?.feedbackRows;
  const feedbackCategories = new Set(
    Array.isArray(feedbackRows)
      ? feedbackRows.map((row) => row.category)
      : [],
  );
  if (
    insights?.audience?.executiveSummary?.trim() &&
    Array.isArray(feedbackRows) &&
    feedbackRows.length === FEEDBACK_CATEGORIES.length &&
    FEEDBACK_CATEGORIES.every((category) =>
      feedbackCategories.has(category),
    ) &&
    feedbackRows.every(
      (row) =>
        Number.isInteger(row.count) &&
        row.count >= 0 &&
        Number.isFinite(row.percentOfAnalysed) &&
        row.percentOfAnalysed >= 0 &&
        row.percentOfAnalysed <= 100,
    )
  ) {
    checks.push("GPT-5.4 output passed the required structured shape");
  } else {
    errors.push("GPT-5.4 output is incomplete or incorrectly structured");
  }

  const supportedBudget =
    (tokenBudget?.mode === "economy" && tokenBudget?.ceilingTokens === 6_500) ||
    (tokenBudget?.mode === "heavy" && tokenBudget?.ceilingTokens === 10_000);
  if (
    supportedBudget &&
    tokenBudget?.requestCount === 1 &&
    (tokenBudget.actualTotalTokens === null ||
      (Number.isInteger(tokenBudget.actualTotalTokens) &&
        tokenBudget.actualTotalTokens >= 0 &&
        tokenBudget.actualTotalTokens <= tokenBudget.ceilingTokens))
  ) {
    checks.push(`${tokenBudget.mode} mode stayed within its token ceiling`);
  } else {
    errors.push("economy token budget is missing or invalid");
  }

  const phaseTwoDimensions = phaseTwo?.dimensions;
  if (
    phaseTwo?.status === "unknown" &&
    ["hook", "clarity", "structure", "pacing"].every(
      (key) =>
        phaseTwoDimensions?.[key]?.score === null &&
        phaseTwoDimensions?.[key]?.displayValue === "Unknown",
    )
  ) {
    checks.push("owner-dependent analytics use the Unknown placeholder");
  } else if (
    phaseTwo?.status === "analysed" &&
    ["hook", "clarity", "structure", "pacing"].every(
      (key) =>
        Number.isInteger(phaseTwoDimensions?.[key]?.score) &&
        phaseTwoDimensions[key].score >= 0 &&
        phaseTwoDimensions[key].score <= 100,
    ) &&
    phaseTwo?.transcript?.source === "youtube_owner_captions"
  ) {
    checks.push("owner transcript analytics passed local score validation");
  } else {
    errors.push("Phase 2 analytics are missing or incorrectly structured");
  }

  if (
    retention?.status === "unknown" &&
    Array.isArray(retention.points) &&
    retention.points.length === 0
  ) {
    checks.push("owner retention uses an explicit unavailable state");
  } else if (
    retention?.status === "available" &&
    retention.source === "youtube_owner_analytics" &&
    retention.points?.length > 0 &&
    retention.points.every(
      (point) =>
        Number.isFinite(point.atRatio) &&
        Number.isFinite(point.audienceWatchPercentage) &&
        Number.isFinite(point.relativeRetentionScore),
    )
  ) {
    checks.push("owner retention passed deterministic local validation");
  } else {
    errors.push("owner retention is missing or incorrectly structured");
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
