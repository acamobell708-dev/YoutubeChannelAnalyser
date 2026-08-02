import test from "node:test";
import assert from "node:assert/strict";

import { createVideoAnalyser } from "../src/analysis/analyseVideo.js";
import { selectRetentionMomentsForExplanation } from "../src/analysis/retentionMoments.js";
import { runSanityChecks } from "../src/analysis/sanity.js";
import { FEEDBACK_CATEGORIES } from "../src/analysis/videoInsightSchema.js";
import { VideoInsightAnalyst } from "../src/services/videoInsightAnalyst.js";

const VIDEO_ID = "dQw4w9WgXcQ";
const VIDEO_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
const CHANNEL_ID = `UC${"e".repeat(22)}`;

test("retention explanations reserve a place for a detected dip and spike", () => {
  const moments = selectRetentionMomentsForExplanation({
    dips: [
      { atSeconds: 10, changePercentagePoints: -12 },
      { atSeconds: 20, changePercentagePoints: -9 },
      { atSeconds: 30, changePercentagePoints: -8 },
    ],
    spikes: [{ atSeconds: 40, changePercentagePoints: 5 }],
  });

  assert.equal(moments.length, 3);
  assert.deepEqual(
    moments.map((moment) => `${moment.kind}:${moment.atSeconds}`),
    ["dip:10", "spike:40", "dip:20"],
  );
});

function feedbackRows(overrides = {}) {
  return FEEDBACK_CATEGORIES.map((category) => ({
    category,
    count: overrides[category] ?? 0,
    prevalence: overrides[category] ? "recurring" : "none",
    observation: overrides[category]
      ? `Observed ${category.replaceAll("_", " ")} in the sample.`
      : `No ${category.replaceAll("_", " ")} was observed in the sample.`,
    confidence: "high",
  }));
}

const insightAnalysis = {
  packaging: {
    titleClarity: "clear",
    thumbnailClarity: "clear",
    titleThumbnailAlignment: "strong",
    contentMismatchRisk: "low",
    tagUsefulness: "beneficial",
    tagAssessment: "The selected tags closely match the tutorial topic and title.",
    observation: "The title and thumbnail communicate the same tutorial topic.",
    evidence: ["Both use the same central phrase."],
    limitation: "The assessment compares public packaging and metadata only.",
  },
  audience: {
    overallSentiment: "positive",
    executiveSummary: "Viewers praise the explanation and request a follow-up.",
    feedbackRows: feedbackRows({ praise: 2, requests: 1 }),
    timestampedReactions: [
      {
        timestamp: "1:20",
        seconds: 80,
        sentiment: "positive",
        observation: "A viewer highlighted the worked example.",
        commentCount: 1,
        confidence: "high",
      },
    ],
    limitations: ["The sample is public and may not represent silent viewers."],
  },
  nextVideo: {
    subjects: [
      {
        subject: "A deeper worked example",
        angle: "Resolve the main follow-up request",
        rationale: "Sampled viewers praised the explanation and requested a follow-up.",
        execution: "Open with the finished result, then walk through one focused example.",
        priority: "most_recommended",
      },
      {
        subject: "Common beginner mistakes",
        angle: "Turn recurring questions into a practical guide",
        rationale: "Questions in the sample identify useful points of friction.",
        execution: "Show three mistakes in quick succession, each with one clear fix.",
        priority: "alternative",
      },
      {
        subject: "Advanced application",
        angle: "Extend the tutorial for returning viewers",
        rationale: "It continues the same clearly communicated topic.",
        execution: "Tease the advanced outcome first, then compare it with the prior technique.",
        priority: "alternative",
      },
    ],
    carryForward: ["Keep the direct explanation and worked-example format."],
    improvements: ["State the intended outcome more clearly in the opening."],
    retentionGuidance: ["Preview the final result before beginning the steps."],
    optimisation: {
      title: "Lead with the specific outcome.",
      thumbnail: "Show one clear result with minimal text.",
      description: "Put the promise and key resources in the first lines.",
      tags: "Use a small set of directly relevant topic variants.",
      captions: "Correct key terms and divide long sentences cleanly.",
    },
    nextAction: "Validate the recommended subject against recent viewer requests.",
    caveat: "These are hypotheses from public packaging, comments, and sampled captions—not measured retention data.",
  },
  crossEvidence: {
    summary: "The clear packaging promise is consistent with positive comments, but measured retention is unavailable.",
    expectationMatch: "aligned",
    evidence: ["The title and thumbnail describe the same tutorial outcome."],
  },
};

const transcriptAnalysis = {
  summary: "The short opens directly, explains one idea, and closes cleanly.",
  hook: { score: 84, finding: "The opening states the value immediately." },
  clarity: { score: 90, finding: "The explanation uses direct language." },
  structure: { score: 78, finding: "The idea progresses in a clear order." },
  pacing: { score: 81, finding: "The sampled sections remain concise." },
  timeline: [
    { atSeconds: 0, label: "Direct opening", score: 84 },
    { atSeconds: 15, label: "Core explanation", score: 90 },
    { atSeconds: 30, label: "Concise close", score: 78 },
  ],
  strongestMoment: {
    atSeconds: 15,
    finding: "The central explanation is clearest here.",
  },
  weakestMoment: {
    atSeconds: 30,
    finding: "The close could state a stronger next action.",
  },
};

const measuredRetention = {
  status: "available",
  displayValue: "Available",
  reason: null,
  source: "youtube_owner_analytics",
  overview: {
    averageViewDurationSeconds: 42,
    averageViewPercentage: 58.3,
    watchTimeMinutes: 720,
  },
  points: [
    { atRatio: 0.01, atSeconds: 3, audienceWatchPercentage: 100, relativeRetentionScore: 60, startedWatching: 100, stoppedWatching: 0, segmentImpressions: 100 },
    { atRatio: 0.1, atSeconds: 30, audienceWatchPercentage: 72, relativeRetentionScore: 58, startedWatching: 0, stoppedWatching: 8, segmentImpressions: 72 },
    { atRatio: 0.5, atSeconds: 150, audienceWatchPercentage: 48, relativeRetentionScore: 55, startedWatching: 0, stoppedWatching: 10, segmentImpressions: 48 },
  ],
  firstThirtySeconds: { atSeconds: 30, audienceWatchPercentage: 72 },
  strongestSection: { startSeconds: 30, endSeconds: 45, averageRetentionPercentage: 72 },
  relativePerformance: { averageScore: 57.7, classification: "above_typical" },
  dips: [{ atSeconds: 150, audienceWatchPercentage: 48, changePercentagePoints: -9, startedWatching: 0, stoppedWatching: 10 }],
  spikes: [],
};

const video = {
  sourceUrl: VIDEO_URL,
  videoId: VIDEO_ID,
  title: "Example video",
  channel: "Example channel",
  channelId: CHANNEL_ID,
  description: "A worked tutorial.",
  publishedAt: "2026-01-02T12:00:00Z",
  tags: ["tutorial", "example"],
  category: { id: "27", title: "Education" },
  durationIso: "PT5M",
  durationSeconds: 300,
  captionsAvailable: true,
  definition: "hd",
  thumbnail: {
    quality: "maxres",
    url: "https://i.ytimg.com/example.jpg",
    width: 1280,
    height: 720,
  },
  thumbnailUrl: "https://i.ytimg.com/example.jpg",
  viewCount: 123456,
  likeCount: 9001,
  reportedCommentCount: 2,
  commentSampling: {
    requestedTopLevelComments: 100,
    sampledTopLevelComments: 2,
    sampledReplies: 1,
    completeReplyThreads: 1,
    truncatedReplyThreads: 0,
    commentsDisabled: false,
    top: 1,
    recent: 1,
    highlyLiked: 1,
  },
  comments: [
    {
      id: "comment-1",
      text: "Great video, especially 1:20!",
      author: "A",
      likeCount: 8,
      sampleGroups: ["top", "highlyLiked"],
      timestamps: [{ label: "1:20", seconds: 80 }],
      replies: [
        {
          id: "reply-1",
          text: "Agreed.",
          author: "B",
          likeCount: 1,
        },
      ],
    },
    {
      id: "comment-2",
      text: "Please make a follow-up.",
      author: "C",
      likeCount: 1,
      sampleGroups: ["recent"],
      timestamps: [],
      replies: [],
    },
  ],
};

test("VideoInsightAnalyst requests strict GPT-5.4 vision output", async () => {
  let request;
  const client = {
    responses: {
      create: async (options) => {
        request = options;
        return {
          output_text: JSON.stringify(insightAnalysis),
          usage: {
            input_tokens: 1_800,
            output_tokens: 650,
            total_tokens: 2_450,
          },
        };
      },
    },
  };
  const analyst = new VideoInsightAnalyst({
    apiKey: "test-openai-key",
    client,
  });

  const result = await analyst.analyse(video);

  assert.equal(result.analysedCommentCount, 2);
  assert.equal(request.model, "gpt-5.4");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.match(request.instructions, /untrusted quoted data/i);
  assert.match(request.instructions, /Do not calculate views/i);
  assert.equal(request.reasoning.effort, "none");
  assert.equal(request.max_output_tokens, 2_800);
  assert.equal(
    request.input[0].content.some(
      (item) =>
        item.type === "input_image" &&
        item.image_url === video.thumbnailUrl &&
        item.detail === "low",
    ),
    true,
  );
  const textInput = request.input[0].content.find(
    (item) => item.type === "input_text",
  ).text;
  assert.doesNotMatch(textInput, /123456/);
  assert.equal(result.analysis.audience.feedbackRows.length, 8);
  assert.equal(result.analysis.packaging.tagUsefulness, "beneficial");
  assert.equal(result.analysis.nextVideo.subjects.length, 3);
  assert.equal(
    result.analysis.nextVideo.subjects.filter(
      (subject) => subject.priority === "most_recommended",
    ).length,
    1,
  );
  assert.equal(result.tokenBudget.ceilingTokens, 6_500);
  assert.equal(result.tokenBudget.actualTotalTokens, 2_450);
  assert.equal(result.tokenBudget.requestCount, 1);
});

test("VideoInsightAnalyst applies the larger heavy-analysis profile", async () => {
  let request;
  const analyst = new VideoInsightAnalyst({
    apiKey: "test-openai-key",
    client: {
      responses: {
        create: async (options) => {
          request = options;
          return {
            output_text: JSON.stringify(insightAnalysis),
            usage: { input_tokens: 2_500, output_tokens: 900, total_tokens: 3_400 },
          };
        },
      },
    },
  });

  const result = await analyst.analyse(video, { mode: "heavy" });

  assert.equal(request.max_output_tokens, 3_000);
  assert.equal(
    request.input[0].content.find((item) => item.type === "input_image").detail,
    "high",
  );
  assert.equal(result.tokenBudget.mode, "heavy");
  assert.equal(result.tokenBudget.ceilingTokens, 10_000);
});

test("VideoInsightAnalyst replaces an impossible feedback count with one placeholder row", async () => {
  const invalid = structuredClone(insightAnalysis);
  invalid.audience.feedbackRows[0].count = 999;
  const analyst = new VideoInsightAnalyst({
    apiKey: "test-openai-key",
    client: {
      responses: {
        create: async () => ({ output_text: JSON.stringify(invalid) }),
      },
    },
  });

  const result = await analyst.analyse(video);
  const praise = result.analysis.audience.feedbackRows.find(
    (row) => row.category === "praise",
  );
  assert.equal(praise.count, 0);
  assert.match(praise.observation, /individual AI finding did not pass validation/i);
});

test("VideoInsightAnalyst returns Unknown placeholders for malformed structured JSON", async () => {
  const analyst = new VideoInsightAnalyst({
    apiKey: "test-openai-key",
    client: {
      responses: {
        create: async () => ({ output_text: '{"packaging":' }),
      },
    },
  });

  const result = await analyst.analyse(video);

  assert.equal(result.analysis.packaging.titleClarity, "unknown");
  assert.equal(result.analysis.packaging.tagUsefulness, "unknown");
  assert.equal(result.analysis.audience.overallSentiment, "insufficient_data");
  assert.equal(result.analysis.audience.feedbackRows.length, 8);
  assert.match(
    result.analysis.packaging.limitation,
    /model response could not be safely used/i,
  );
  assert.equal(result.tokenBudget.actualTotalTokens, null);
});

test("VideoInsightAnalyst returns Unknown placeholders for an incomplete response", async () => {
  const analyst = new VideoInsightAnalyst({
    apiKey: "test-openai-key",
    client: {
      responses: {
        create: async () => ({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output_text: '{"packaging":',
        }),
      },
    },
  });

  const result = await analyst.analyse(video);

  assert.equal(result.analysis.packaging.titleClarity, "unknown");
  assert.equal(result.analysis.audience.feedbackRows.length, 8);
});

test("VideoInsightAnalyst returns Unknown placeholders when local validation fails", async () => {
  const invalid = structuredClone(insightAnalysis);
  delete invalid.packaging.tagUsefulness;
  const analyst = new VideoInsightAnalyst({
    apiKey: "test-openai-key",
    client: {
      responses: {
        create: async () => ({ output_text: JSON.stringify(invalid) }),
      },
    },
  });

  const result = await analyst.analyse(video);

  assert.equal(result.analysis.packaging.titleClarity, "unknown");
  assert.match(result.analysis.audience.executiveSummary, /Unknown/i);
});

test("economy transcript analysis uses one request below the token ceiling", async () => {
  let requestCount = 0;
  let request;
  const analyst = new VideoInsightAnalyst({
    apiKey: "test-openai-key",
    client: {
      responses: {
        create: async (options) => {
          requestCount += 1;
          request = options;
          return {
            output_text: JSON.stringify({
              ...insightAnalysis,
              crossEvidence: {
                ...insightAnalysis.crossEvidence,
                retentionMoments: [{
                  atSeconds: 150,
                  kind: "dip",
                  evidence: "The supplied context changes from explanation to conclusion.",
                  hypothesis: "The abrupt transition may have reduced viewer interest.",
                  confidence: "medium",
                }],
              },
              transcriptAnalysis,
            }),
            usage: {
              input_tokens: 2_950,
              output_tokens: 1_000,
              total_tokens: 3_950,
            },
          };
        },
      },
    },
  });

  const result = await analyst.analyse(video, {
    mode: "economy",
    retention: measuredRetention,
    transcript: {
      status: "available",
      segments: [
        { startSeconds: 0, endSeconds: 10, text: "Here is the key idea." },
        {
          startSeconds: 15,
          endSeconds: 25,
          text: "This example explains the idea.",
        },
        { startSeconds: 30, endSeconds: 40, text: "That is the conclusion." },
      ],
    },
  });

  assert.equal(requestCount, 1);
  assert.equal(request.reasoning.effort, "none");
  assert.equal(request.max_output_tokens, 2_800);
  assert.ok(
    request.text.format.schema.required.includes("transcriptAnalysis"),
  );
  assert.equal(
    request.text.format.schema.properties.transcriptAnalysis.properties.timeline
      .minItems,
    3,
  );
  assert.equal(result.analysis.transcriptAnalysis.hook.score, 84);
  assert.equal(result.analysis.crossEvidence.retentionMoments.length, 1);
  assert.equal(result.analysis.crossEvidence.retentionMoments[0].atSeconds, 150);
  assert.equal(result.tokenBudget.actualTotalTokens, 3_950);
  assert.ok(result.tokenBudget.actualTotalTokens <= 6_500);
  assert.ok(result.tokenBudget.estimatedInputTokens <= 3_700);
  assert.match(
    request.input[0].content.find((item) => item.type === "input_text").text,
    /measuredRetention/,
  );
});

test("one invalid transcript timestamp is withheld without discarding the analysis", async () => {
  const invalidTranscript = structuredClone(transcriptAnalysis);
  invalidTranscript.strongestMoment.atSeconds = 14;
  invalidTranscript.timeline.push({
    atSeconds: 14,
    label: "Unverified timestamp",
    score: 80,
  });
  const analyst = new VideoInsightAnalyst({
    apiKey: "test-openai-key",
    client: {
      responses: {
        create: async () => ({
          output_text: JSON.stringify({
            ...insightAnalysis,
            transcriptAnalysis: invalidTranscript,
          }),
          usage: { input_tokens: 2_000, output_tokens: 800, total_tokens: 2_800 },
        }),
      },
    },
  });

  const result = await analyst.analyse(video, {
    transcript: {
      status: "available",
      segments: [
        { startSeconds: 0, endSeconds: 10, text: "The opening." },
        { startSeconds: 15, endSeconds: 25, text: "The explanation." },
        { startSeconds: 30, endSeconds: 40, text: "The close." },
      ],
    },
  });

  assert.equal(result.analysis.transcriptAnalysis.strongestMoment, null);
  assert.equal(result.analysis.transcriptAnalysis.timeline.length, 3);
  assert.match(
    result.analysis.audience.limitations.join(" "),
    /withheld because their caption timestamp could not be verified/i,
  );
});

test("video analyser returns client-safe metadata, metrics, and insights", async () => {
  const youtubeClient = {
    fetchVideo: async () => video,
    fetchChannelById: async (channelId) => {
      assert.equal(channelId, CHANNEL_ID);
      return {
        videos: [
          {
            videoId: "larger-video",
            viewCount: 200000,
            commentCount: 10,
          },
          {
            videoId: VIDEO_ID,
            viewCount: video.viewCount,
            commentCount: video.reportedCommentCount,
          },
          {
            videoId: "smaller-video",
            viewCount: 50000,
            commentCount: 1,
          },
        ],
      };
    },
  };
  const insightAnalyst = {
    analyse: async () => ({
      analysis: insightAnalysis,
      analysedCommentCount: 2,
    }),
  };
  const analyseVideo = createVideoAnalyser({
    youtubeClient,
    insightAnalyst,
    now: () => Date.parse("2026-01-04T12:00:00Z"),
  });

  const result = await analyseVideo({
    url: VIDEO_URL,
    maxComments: 100,
  });

  assert.equal(result.video.videoId, VIDEO_ID);
  assert.equal(result.video.sampledCommentCount, 2);
  assert.equal(result.video.comments, undefined);
  assert.deepEqual(result.video.tags, ["tutorial", "example"]);
  assert.equal(result.video.category.title, "Education");
  assert.equal(result.metrics.viewsPerDay, 61728);
  assert.equal(result.metrics.likesPer100Views, 7.29);
  assert.equal(result.metrics.channelLifetimeRanking.views.rank, 2);
  assert.equal(result.metrics.channelLifetimeRanking.comments.rank, 2);
  assert.equal(result.phaseTwo.displayValue, "Unknown");
  assert.equal(result.phaseTwo.transcript.displayValue, "Unknown");
  assert.equal(result.phaseTwo.transcript.text, undefined);
  assert.equal(result.retention.status, "unknown");
  assert.equal(result.tokenBudget.ceilingTokens, 6_500);
  assert.equal(
    result.insights.audience.feedbackRows.find(
      (row) => row.category === "praise",
    ).percentOfAnalysed,
    100,
  );
  assert.equal(result.sanity.passed, true);
  assert.match(result.sanity.checks.join(" "), /structured shape/i);
});

test("video analyser attaches verified retention timestamps to creator guidance", async () => {
  let suppliedRetention;
  const analyseVideo = createVideoAnalyser({
    youtubeClient: {
      fetchVideo: async () => video,
      fetchChannelById: async () => ({ videos: [video] }),
    },
    captionService: {
      fetchTranscript: async () => ({
        status: "unknown",
        displayValue: "Unknown",
        reason: "No captions.",
        source: null,
        language: null,
        segmentCount: 0,
        segments: [],
        text: "",
      }),
    },
    retentionService: {
      fetchVideoRetention: async () => structuredClone(measuredRetention),
    },
    insightAnalyst: {
      analyse: async (_video, { retention }) => {
        suppliedRetention = retention;
        return {
          analysis: structuredClone(insightAnalysis),
          analysedCommentCount: 2,
          tokenBudget: {
            mode: "economy",
            ceilingTokens: 6_500,
            actualTotalTokens: 2_000,
            requestCount: 1,
          },
        };
      },
    },
    now: () => Date.parse("2026-01-04T12:00:00Z"),
  });

  const result = await analyseVideo({ url: VIDEO_URL, maxComments: 100 });
  assert.equal(suppliedRetention.status, "available");
  assert.equal(result.retention.points.length, 3);
  assert.equal(
    result.insights.nextVideo.retentionEvidence.carryForward[0].atSeconds,
    30,
  );
  assert.equal(
    result.insights.nextVideo.retentionEvidence.improvements[0].atSeconds,
    150,
  );
  assert.match(result.phaseTwo.dimensions.hook.retentionContext, /72%/);
  assert.equal(result.sanity.passed, true);
});

test("sanity check identifies a mismatched video ID", () => {
  const sanity = runSanityChecks({
    video: {
      ...video,
      videoId: "aaaaaaaaaaa",
      sampledCommentCount: 2,
    },
    metrics: {
      viewsPerDay: 100,
      likesPer100Views: 1,
      commentsPer100Views: 0.1,
    },
    insights: insightAnalysis,
  });

  assert.equal(sanity.passed, false);
  assert.match(sanity.errors.join(" "), /does not match/i);
});
