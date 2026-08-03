import { AppError } from "../errors.js";
import { parseCommentLimit } from "../domain/videoUrl.js";
import { runSanityChecks } from "./sanity.js";
import { calculateVideoMetrics } from "./videoMetrics.js";
import { selectRetentionMomentsForExplanation } from "./retentionMoments.js";
import { enhanceRetentionAnalysis } from "./formatRetention.js";
import { resolveVideoFormat } from "./videoFormat.js";

function percentage(count, total) {
  if (!Number.isInteger(count) || !Number.isInteger(total) || total <= 0) {
    return 0;
  }
  return Math.round(((count / total) * 100 + Number.EPSILON) * 100) / 100;
}

export function createVideoAnalyser({
  youtubeClient,
  insightAnalyst,
  captionService,
  retentionService,
  videoFormatAnalyticsService = null,
  now = Date.now,
}) {
  return async function analyseVideo({
    url,
    maxComments,
    ownerSessionId = null,
    analysisMode = "economy",
    videoType = "auto",
  }) {
    const commentLimit = parseCommentLimit(maxComments);
    const video = await youtubeClient.fetchVideo(url, {
      maxComments: commentLimit,
    });
    const ownerRequest = {
      videoId: video.videoId,
      channelId: video.channelId,
      ownerSessionId,
    };
    let [transcript, retention, formatAnalytics] = await Promise.all([
      captionService
        ? captionService.fetchTranscript(ownerRequest)
        : Promise.resolve({
            status: "unknown",
            displayValue: "Unknown",
            reason:
              "Owner Google login is required for authorised caption analysis.",
            source: null,
            language: null,
            segmentCount: 0,
            segments: [],
            text: "",
          }),
      retentionService
        ? retentionService.fetchVideoRetention({
            ...ownerRequest,
            publishedAt: video.publishedAt,
            durationSeconds: video.durationSeconds,
          })
        : Promise.resolve({
            status: "unknown",
            displayValue: "Unavailable",
            reason: "Owner Google login is required for measured retention data.",
            source: null,
            overview: null,
            points: [],
            firstThirtySeconds: null,
            strongestSection: null,
            relativePerformance: null,
            dips: [],
            spikes: [],
          }),
      videoFormatAnalyticsService
        ? videoFormatAnalyticsService.fetch({
            ...ownerRequest,
            publishedAt: video.publishedAt,
            durationSeconds: video.durationSeconds,
            sourceUrl: video.sourceUrl,
            requestedVideoType: videoType,
          })
        : Promise.resolve(null),
    ]);
    const videoFormat =
      formatAnalytics?.videoFormat ??
      resolveVideoFormat({
        requested: videoType,
        sourceUrl: video.sourceUrl,
        durationSeconds: video.durationSeconds,
      });
    const formatOverview = Object.fromEntries(
      Object.entries(formatAnalytics?.overview ?? {}).filter(
        ([, value]) => value !== null && value !== undefined,
      ),
    );
    retention = {
      ...retention,
      ...enhanceRetentionAnalysis(
        retention,
        video.durationSeconds,
        videoFormat.resolved,
      ),
      overview: {
        ...(retention.overview ?? {}),
        ...formatOverview,
      },
      discovery: formatAnalytics?.discovery ?? {
        status: "unavailable",
        rows: [],
        reason:
          "Owner Google login is required for discovery and engaged-view statistics.",
        thumbnailReach: {
          status: "unavailable",
          impressions: null,
          clickThroughRate: null,
          reason:
            "Thumbnail impressions and click-through rate require YouTube Reporting API Reach reports.",
        },
      },
      videoFormat,
    };
    const [channel, insightResult] = await Promise.all([
      youtubeClient.fetchChannelById(video.channelId),
      insightAnalyst.analyse(video, {
        transcript,
        retention,
        mode: analysisMode,
        videoFormat,
      }),
    ]);
    const metrics = calculateVideoMetrics(video, channel.videos, now, {
      videoFormat,
      ownerOverview: retention.overview,
    });
    const {
      transcriptAnalysis = null,
      ...phaseOneInsightAnalysis
    } = insightResult.analysis;
    const insights = {
      ...phaseOneInsightAnalysis,
      nextVideo: { ...phaseOneInsightAnalysis.nextVideo },
      audience: {
        ...phaseOneInsightAnalysis.audience,
        feedbackRows: phaseOneInsightAnalysis.audience.feedbackRows.map(
          (row) => ({
            ...row,
            percentOfAnalysed: percentage(
              row.count,
              insightResult.analysedCommentCount,
            ),
          }),
        ),
      },
    };
    const transcriptSummary = {
      status: transcript.status,
      displayValue: transcript.displayValue,
      reason: transcript.reason,
      source: transcript.source,
      language: transcript.language,
      trackKind: transcript.trackKind ?? null,
      isAutoSynced: transcript.isAutoSynced ?? null,
      segmentCount: transcript.segmentCount,
      analysedSegmentCount:
        insightResult.suppliedTranscriptSegmentCount ?? 0,
    };
    const visualAnalysis = {
      status: "unknown",
      displayValue: "Unknown",
      reason:
        "YouTube Data API does not provide the video frames or audio, so visual and audio-only claims are not inferred.",
    };
    const unknownDimension = () => ({
      score: null,
      displayValue: "Unknown",
      finding: transcript.reason,
    });
    const phaseTwo = transcriptAnalysis
      ? {
          status: "analysed",
          displayValue: "Analysed",
          transcript: transcriptSummary,
          summary: transcriptAnalysis.summary,
          dimensions: {
            hook: transcriptAnalysis.hook,
            clarity: transcriptAnalysis.clarity,
            structure: transcriptAnalysis.structure,
            pacing: transcriptAnalysis.pacing,
          },
          timeline: transcriptAnalysis.timeline,
          strongestMoment: transcriptAnalysis.strongestMoment,
          weakestMoment: transcriptAnalysis.weakestMoment,
          visualAnalysis,
        }
      : {
          status: "unknown",
          displayValue: "Unknown",
          transcript: transcriptSummary,
          summary: transcript.reason,
          dimensions: {
            hook: unknownDimension(),
            clarity: unknownDimension(),
            structure: unknownDimension(),
            pacing: unknownDimension(),
          },
          timeline: [],
          strongestMoment: null,
          weakestMoment: null,
          visualAnalysis,
        };

    const nearestRetentionPoint = (seconds) =>
      retention.status === "available" && retention.points.length
        ? retention.points.reduce((closest, point) =>
            Math.abs(point.atSeconds - seconds) < Math.abs(closest.atSeconds - seconds)
              ? point
              : closest,
          retention.points[0])
        : null;
    const openingCheckpoint =
      videoFormat.resolved === "short"
        ? retention.firstThreeSeconds
        : retention.firstThirtySeconds;
    phaseTwo.dimensions.hook.retentionContext = openingCheckpoint
      ? `${openingCheckpoint.audienceWatchPercentage}% measured audience retention at ${openingCheckpoint.atSeconds} seconds.`
      : retention.reason;
    phaseTwo.timeline = phaseTwo.timeline.map((point) => {
      const measured = nearestRetentionPoint(point.atSeconds);
      return {
        ...point,
        measuredRetentionPercentage: measured?.audienceWatchPercentage ?? null,
        relativeRetentionScore: measured?.relativeRetentionScore ?? null,
      };
    });

    if (retention.status === "available") {
      const evidence = {
        carryForward: retention.strongestSection
          ? [{
              atSeconds: retention.strongestSection.startSeconds,
              text: `High-retention section averaged ${retention.strongestSection.averageRetentionPercentage}% audience retention.`,
            }, ...retention.spikes.slice(0, 2).map((spike) => ({
              atSeconds: spike.atSeconds,
              kind: "spike",
              text: `Confirmed ${spike.changePercentagePoints}-point retention spike to ${spike.audienceWatchPercentage}%.`,
            }))]
          : [],
        improvements: retention.dips.map((dip) => ({
          atSeconds: dip.atSeconds,
          kind: "dip",
          text: `Confirmed ${Math.abs(dip.changePercentagePoints)}-point retention drop to ${dip.audienceWatchPercentage}%.`,
        })),
      };
      insights.nextVideo.retentionEvidence = evidence;
      const interpretationByMoment = new Map(
        (insights.crossEvidence.retentionMoments ?? []).map((moment) => [
          `${moment.kind}:${moment.atSeconds}`,
          moment,
        ]),
      );
      const contextByMoment = new Map(
        (insightResult.retentionMomentContext ?? []).map((moment) => [
          `${moment.kind}:${moment.atSeconds}`,
          moment,
        ]),
      );
      retention.momentExplanations = selectRetentionMomentsForExplanation(retention)
        .map((moment) => ({
          ...moment,
          ...contextByMoment.get(`${moment.kind}:${moment.atSeconds}`),
          ...interpretationByMoment.get(`${moment.kind}:${moment.atSeconds}`),
        }));
    } else {
      insights.nextVideo.retentionEvidence = { carryForward: [], improvements: [] };
      retention.momentExplanations = [];
    }

    const result = {
      video: {
        sourceUrl: video.sourceUrl,
        videoId: video.videoId,
        title: video.title,
        channel: video.channel,
        channelId: video.channelId,
        publishedAt: video.publishedAt,
        thumbnailUrl: video.thumbnailUrl,
        thumbnail: video.thumbnail,
        tags: video.tags,
        category: video.category,
        durationIso: video.durationIso,
        durationSeconds: video.durationSeconds,
        captionsAvailable: video.captionsAvailable,
        definition: video.definition,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        reportedCommentCount: video.reportedCommentCount,
        sampledCommentCount: video.comments.length,
        commentSampling: {
          ...video.commentSampling,
          analysedByGpt: insightResult.analysedCommentCount,
        },
      },
      videoFormat,
      metrics,
      insights,
      phaseTwo,
      retention,
      discovery: retention.discovery,
      tokenBudget: insightResult.tokenBudget ?? {
        mode: "economy",
        ceilingTokens: 6_500,
        actualTotalTokens: null,
        requestCount: 1,
      },
    };
    const sanity = runSanityChecks(result);

    if (!sanity.passed) {
      throw new AppError(
        `The final sanity check failed: ${sanity.errors.join("; ")}.`,
        { status: 500, code: "SANITY_CHECK_FAILED" },
      );
    }

    return { ...result, sanity };
  };
}
