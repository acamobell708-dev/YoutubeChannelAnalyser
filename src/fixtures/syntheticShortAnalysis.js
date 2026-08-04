import { runSanityChecks } from "../analysis/sanity.js";

const VIDEO_ID = "DevShort001";
const CHANNEL_ID = `UC${"s".repeat(22)}`;
const ANALYSED_COMMENTS = 24;

const FEEDBACK = [
  ["praise", 12, "Viewers repeatedly praised the immediate demonstration."],
  ["criticism", 2, "A small number wanted the middle explanation shortened."],
  ["questions", 3, "Viewers asked which tool was used for the result."],
  ["confusion", 1, "One viewer found the transition at nine seconds abrupt."],
  ["requests", 5, "Several viewers requested a follow-up with three examples."],
  ["disagreement", 1, "One viewer preferred a slower explanation."],
  ["timestamped_reactions", 4, "Timestamped reactions cluster around the replay spike and completion drop."],
  ["suspected_spam_or_off_topic", 0, "No concrete spam or off-topic signal was included in the fixture."],
];

const RETENTION_ANCHORS = [
  [0, 100], [0.12, 86], [0.3, 78], [0.48, 64],
  [0.65, 110], [0.82, 96], [0.91, 72], [1, 104],
];

function round(value, places = 1) {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function interpolateRetention(ratio) {
  const upperIndex = RETENTION_ANCHORS.findIndex(([anchorRatio]) => anchorRatio >= ratio);
  if (upperIndex <= 0) return RETENTION_ANCHORS[0][1];
  const [upperRatio, upperValue] = RETENTION_ANCHORS[upperIndex];
  const [lowerRatio, lowerValue] = RETENTION_ANCHORS[upperIndex - 1];
  const progress = (ratio - lowerRatio) / (upperRatio - lowerRatio);
  return round(lowerValue + (upperValue - lowerValue) * progress);
}

function createRetentionPoints() {
  return Array.from({ length: 101 }, (_, index) => {
    const atRatio = index / 100;
    const atSeconds = round(atRatio * 18, 1);
    const audienceWatchPercentage = interpolateRetention(atRatio);
    return {
      atRatio,
      atSeconds,
      audienceWatchPercentage,
      relativeRetentionScore: round(Math.max(0, Math.min(100, 58 + (audienceWatchPercentage - 75) * 0.65))),
      startedWatching: index === 0 ? 2_400 : index % 17 === 0 ? 8 : 0,
      stoppedWatching: index === 12 ? 120 : index === 48 ? 96 : index === 91 ? 130 : 0,
      segmentImpressions: Math.max(1, Math.round((audienceWatchPercentage / 100) * 2_400)),
    };
  });
}

function feedbackRows() {
  return FEEDBACK.map(([category, count, observation]) => ({
    category,
    count,
    percentOfAnalysed: round((count / ANALYSED_COMMENTS) * 100, 2),
    prevalence: count >= 5 ? "recurring" : count > 0 ? "isolated" : "none",
    observation,
    confidence: count > 0 ? "high" : "medium",
  }));
}

function createEvents() {
  return [
    { kind: "dip", eventType: "early_swipe_risk_drop", label: "Early swipe-risk drop", atRatio: 0.12, atSeconds: 2, audienceWatchPercentage: 86, changePercentagePoints: -12, possibleReplay: false, startedWatching: 0, stoppedWatching: 120 },
    { kind: "dip", eventType: "sustained_mid_short_drop", label: "Sustained mid-Short drop", atRatio: 0.48, atSeconds: 9, audienceWatchPercentage: 64, changePercentagePoints: -10, possibleReplay: false, startedWatching: 0, stoppedWatching: 96 },
    { kind: "spike", eventType: "replay_spike", label: "Replay spike", atRatio: 0.65, atSeconds: 12, audienceWatchPercentage: 110, changePercentagePoints: 30, possibleReplay: true, startedWatching: 8, stoppedWatching: 0 },
    { kind: "dip", eventType: "completion_drop", label: "Completion drop", atRatio: 0.91, atSeconds: 16, audienceWatchPercentage: 72, changePercentagePoints: -20, possibleReplay: false, startedWatching: 0, stoppedWatching: 130 },
    { kind: "spike", eventType: "end_loop_rise", label: "End-loop rise", atRatio: 0.99, atSeconds: 18, audienceWatchPercentage: 104, changePercentagePoints: 28, possibleReplay: true, startedWatching: 0, stoppedWatching: 0 },
  ];
}

function createMomentExplanations(events) {
  const byType = new Map(events.map((event) => [event.eventType, event]));
  return [
    {
      ...byType.get("early_swipe_risk_drop"),
      nearestTranscriptAtSeconds: 2,
      timestampedCommentCount: 1,
      evidence: "The opening names the result immediately, then pauses before showing it.",
      hypothesis: "The brief pause may let fast-scrolling viewers decide the payoff is not immediate enough.",
      confidence: "medium",
    },
    {
      ...byType.get("replay_spike"),
      nearestTranscriptAtSeconds: 12,
      timestampedCommentCount: 2,
      evidence: "The caption reveals the completed result while two timestamped reactions mention rewatching the reveal.",
      hypothesis: "Viewers may replay this moment to inspect the result or read the denser on-screen explanation.",
      confidence: "high",
    },
    {
      ...byType.get("completion_drop"),
      nearestTranscriptAtSeconds: 16,
      timestampedCommentCount: 1,
      evidence: "The spoken explanation finishes before the final loop transition begins.",
      hypothesis: "Some viewers may leave once the promised result is complete, before recognising the loop back to the opening.",
      confidence: "medium",
    },
  ];
}

function createDiscovery() {
  return {
    status: "available",
    metric: "engagedViews",
    reason: null,
    rows: [
      { id: "shorts_feed", label: "Shorts Feed", value: 1_110, sharePercent: 74 },
      { id: "sound_pages", label: "Sound pages", value: 120, sharePercent: 8 },
      { id: "video_remixes", label: "Video remixes", value: 90, sharePercent: 6 },
      { id: "search", label: "YouTube Search", value: 105, sharePercent: 7 },
      { id: "external", label: "External sources", value: 75, sharePercent: 5 },
    ],
    ungroupedValue: 0,
    thumbnailReach: {
      status: "unavailable",
      impressions: null,
      clickThroughRate: null,
      reason: "Synthetic Shorts discovery uses engaged-view traffic sources; thumbnail Reach reports are not part of this fixture.",
    },
  };
}

export function createSyntheticShortAnalysis() {
  const points = createRetentionPoints();
  const events = createEvents();
  const discovery = createDiscovery();
  const videoFormat = {
    requested: "auto",
    resolved: "short",
    creatorContentType: "SHORTS",
    confidence: "confirmed",
    source: "synthetic_owner_analytics",
    label: "Synthetic Short",
    caveat: null,
  };

  const retention = {
    status: "available",
    displayValue: "Available",
    reason: null,
    source: "youtube_owner_analytics",
    overview: {
      averageViewDurationSeconds: 22,
      averageViewPercentage: 122.4,
      watchTimeMinutes: 550,
      views: 2_400,
      engagedViews: 1_500,
      likes: 168,
      comments: 42,
      shares: 48,
      subscribersGained: 16,
      subscribersLost: 4,
    },
    points,
    checkpoints: {
      firstThreeSeconds: { atRatio: 3 / 18, atSeconds: 3, audienceWatchPercentage: 82.4 },
      midpoint: { atRatio: 0.5, atSeconds: 9, audienceWatchPercentage: 69.4 },
      end: { atRatio: 1, atSeconds: 18, audienceWatchPercentage: 104 },
    },
    firstThirtySeconds: null,
    firstThreeSeconds: { atRatio: 3 / 18, atSeconds: 3, audienceWatchPercentage: 82.4 },
    midpoint: { atRatio: 0.5, atSeconds: 9, audienceWatchPercentage: 69.4 },
    end: { atRatio: 1, atSeconds: 18, audienceWatchPercentage: 104 },
    strongestSection: { startRatio: 0.62, endRatio: 0.72, startSeconds: 11, endSeconds: 13, averageRetentionPercentage: 108.6 },
    strongestAfterHook: { startRatio: 0.62, endRatio: 0.72, startSeconds: 11, endSeconds: 13, averageRetentionPercentage: 108.6 },
    relativePerformance: { averageScore: 68.5, classification: "above_typical" },
    events,
    dips: events.filter((event) => event.kind === "dip"),
    spikes: events.filter((event) => event.kind === "spike"),
    momentExplanations: createMomentExplanations(events),
    chart: { detailed: true, scrollDecisionEndSeconds: 3, completionStartRatio: 0.9, replayDetected: true, maximumAudienceWatchPercentage: 110 },
    discovery,
    videoFormat,
  };

  const analysis = {
    fixture: {
      synthetic: true,
      id: "synthetic-short-replay-drop-v1",
      label: "Synthetic Short: replay and retention changes",
      description: "Static development data. No YouTube, Google, OpenAI, OAuth, quota, or token request was made.",
      scenario: "18-second Short with early loss, a mid-Short dip, replay activity, a completion drop, and an end-loop rise.",
    },
    video: {
      sourceUrl: `https://www.youtube.com/shorts/${VIDEO_ID}`,
      videoId: VIDEO_ID,
      title: "[Synthetic] The 18-second result reveal",
      channel: "Development Fixture Channel",
      channelId: CHANNEL_ID,
      publishedAt: "2026-07-23T12:00:00Z",
      thumbnailUrl: null,
      thumbnail: { quality: "synthetic", url: null, width: 1_080, height: 1_920 },
      tags: ["synthetic-short", "retention-test", "loop-test"],
      category: { id: "27", title: "Education" },
      durationIso: "PT18S",
      durationSeconds: 18,
      captionsAvailable: true,
      definition: "hd",
      viewCount: 2_400,
      likeCount: 168,
      reportedCommentCount: 42,
      sampledCommentCount: ANALYSED_COMMENTS,
      commentSampling: {
        requestedTopLevelComments: ANALYSED_COMMENTS,
        sampledTopLevelComments: ANALYSED_COMMENTS,
        sampledReplies: 4,
        analysedByGpt: ANALYSED_COMMENTS,
        strategy: "synthetic fixture",
      },
    },
    videoFormat,
    metrics: {
      ageDays: 12,
      viewsPerDay: 200,
      likesPer100Views: 7,
      commentsPer100Views: 1.75,
      engagedViews: 1_500,
      engagedViewsPerDay: 125,
      engagedViewSharePercent: 62.5,
      likesPer100EngagedViews: 11.2,
      commentsPer100EngagedViews: 2.8,
      sharesPer100EngagedViews: 3.2,
      netSubscribersPer100EngagedViews: 0.8,
      subscribersGained: 16,
      subscribersLost: 4,
      channelLifetimeRanking: {
        views: { rank: 4, outOf: 36 },
        comments: { rank: 2, outOf: 36 },
      },
      formatRelativeRanking: {
        views: { rank: 2, outOf: 18 },
        comments: { rank: 1, outOf: 18 },
        cohortVideoCount: 18,
        caveat: "Synthetic confirmed-Short cohort used to exercise the visual standing bars.",
      },
    },
    insights: {
      packaging: {
        titleClarity: "clear",
        thumbnailClarity: "clear",
        titleThumbnailAlignment: "strong",
        contentMismatchRisk: "low",
        tagUsefulness: "beneficial",
        tagAssessment: "The synthetic tags directly describe the fixture scenario and Short format.",
        observation: "The first-frame promise and opening line immediately identify the result.",
        evidence: [
          "The opening caption states the result before the first visual transition.",
          "The loop returns to the same framing used in the first second.",
        ],
        limitation: "This is authored fixture evidence rather than an assessment of a real upload.",
      },
      audience: {
        overallSentiment: "positive",
        executiveSummary: "The synthetic audience responds strongly to the reveal and requests more examples, with one clear pacing concern.",
        feedbackRows: feedbackRows(),
        timestampedReactions: [
          { timestamp: "0:12", seconds: 12, sentiment: "positive", observation: "Two fixture comments say they replayed the result reveal.", commentCount: 2, confidence: "high" },
          { timestamp: "0:16", seconds: 16, sentiment: "mixed", observation: "One fixture comment says the ending feels complete before the loop.", commentCount: 1, confidence: "medium" },
        ],
        limitations: ["All comments, captions, and reactions in this result are synthetic."],
      },
      nextVideo: {
        subjects: [
          {
            subject: "Three mistakes in eighteen seconds",
            angle: "First frame: finished failed result | Opening line: Avoid these three mistakes.",
            rationale: "Payoff: first fix by second 4 | Duration: 16–20 seconds | Target: completion.",
            execution: "Loop/ending: return to failed result | Captions: one short line per mistake | Alternative hook: This fails for one simple reason.",
            priority: "most_recommended",
          },
          {
            subject: "Before-and-after reveal",
            angle: "First frame: split before/after | Opening line: This took less than one minute.",
            rationale: "Payoff: reveal by second 7 | Duration: 14–18 seconds | Target: sharing.",
            execution: "Loop/ending: reverse into the opening frame | Captions: low density | Alternative hook: Watch the left side change.",
            priority: "alternative",
          },
          {
            subject: "One setting most people miss",
            angle: "First frame: highlighted control | Opening line: Turn this on before you start.",
            rationale: "Payoff: demonstrate difference by second 6 | Duration: 18–24 seconds | Target: subscriber conversion.",
            execution: "Loop/ending: zoom back to the control | Captions: medium density | Alternative hook: Your result looks wrong because this is off.",
            priority: "alternative",
          },
        ],
        carryForward: ["Keep the result visible inside the first three seconds.", "Retain the loop-compatible final framing."],
        improvements: ["Remove the pause immediately before the first demonstration.", "Make the final loop transition begin before the spoken explanation fully ends."],
        retentionGuidance: ["Test a version that reaches the first visual payoff by second 2.", "Keep the replay-worthy reveal around the final third."],
        retentionEvidence: {
          carryForward: [{ atSeconds: 12, kind: "spike", text: "Replay spike reaches 110% audience retention." }],
          improvements: [
            { atSeconds: 2, kind: "dip", text: "Early swipe-risk drop falls 12 points." },
            { atSeconds: 16, kind: "dip", text: "Completion drop falls 20 points." },
          ],
        },
        optimisation: {
          title: "Use a specific outcome rather than a broad topic.",
          thumbnail: "Use the clearest result frame for non-feed discovery.",
          description: "State the result and one relevant search phrase first.",
          tags: "Use focused variants such as result reveal, 18-second tutorial, before and after, and looped Short. Avoid generic tags such as viral or trending.",
          captions: "Limit each caption to one short readable phrase.",
        },
        nextAction: "Compare a two-second payoff version against the current three-second opening.",
        caveat: "These recommendations are intentionally synthetic and exist to test presentation and interactions.",
      },
      crossEvidence: {
        summary: "The immediate promise supports strong opening retention, while the delayed demonstration and completed ending plausibly align with the two measured drops.",
        expectationMatch: "aligned",
        evidence: [
          "The title, first frame, and opening caption promise the same result.",
          "The largest positive movement coincides with the completed reveal.",
          "The final drop begins after the spoken payoff is complete.",
        ],
        retentionMoments: retention.momentExplanations.map((moment) => ({
          atSeconds: moment.atSeconds,
          kind: moment.kind,
          evidence: moment.evidence,
          hypothesis: moment.hypothesis,
          confidence: moment.confidence,
        })),
      },
    },
    phaseTwo: {
      status: "analysed",
      displayValue: "Analysed",
      transcript: {
        status: "available",
        displayValue: "Available",
        reason: null,
        source: "youtube_owner_captions",
        language: "en",
        trackKind: "synthetic",
        isAutoSynced: false,
        segmentCount: 6,
        analysedSegmentCount: 6,
      },
      summary: "The synthetic Short is direct and visually structured, but its first demonstration and loop transition can begin earlier.",
      dimensions: {
        hook: { score: 82, finding: "The result is stated immediately, although the demonstration pauses briefly.", retentionContext: "82.4% measured audience retention at 3 seconds." },
        clarity: { score: 88, finding: "Each caption communicates one clear action or result." },
        structure: { score: 84, finding: "Promise, demonstration, reveal, and loop are easy to follow." },
        pacing: { score: 76, finding: "The middle is concise, but the opening pause and completed ending create avoidable exits." },
      },
      timeline: [
        { atSeconds: 0, label: "Immediate promise", score: 86, measuredRetentionPercentage: 100, relativeRetentionScore: 74 },
        { atSeconds: 3, label: "First demonstration", score: 78, measuredRetentionPercentage: 82.4, relativeRetentionScore: 63 },
        { atSeconds: 9, label: "Abrupt transition", score: 68, measuredRetentionPercentage: 64, relativeRetentionScore: 51 },
        { atSeconds: 12, label: "Replay-worthy reveal", score: 92, measuredRetentionPercentage: 110, relativeRetentionScore: 81 },
        { atSeconds: 16, label: "Completed ending", score: 72, measuredRetentionPercentage: 72, relativeRetentionScore: 56 },
      ],
      strongestMoment: { atSeconds: 12, finding: "The result reveal combines the clearest caption with the strongest measured replay signal." },
      weakestMoment: { atSeconds: 9, finding: "The transition changes context without preparing the viewer." },
      visualAnalysis: { status: "unknown", displayValue: "Synthetic", reason: "The fixture supplies authored caption and event descriptions; no real frames or audio were analysed." },
    },
    retention,
    discovery,
    tokenBudget: { mode: "economy", ceilingTokens: 6_500, actualTotalTokens: 0, requestCount: 1 },
  };

  const sanity = runSanityChecks(analysis);
  if (!sanity.passed) {
    throw new Error(`Synthetic Short fixture failed sanity validation: ${sanity.errors.join("; ")}`);
  }

  return {
    ...analysis,
    sanity: {
      ...sanity,
      checks: [
        ...sanity.checks,
        "development fixture is explicitly labelled synthetic",
        "fixture generated without external API or OAuth access",
      ],
    },
  };
}
