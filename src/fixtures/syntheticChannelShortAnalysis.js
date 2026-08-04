import { createChannelAnalyser } from "../analysis/analyseChannel.js";

const CHANNEL_ID = `UC${"c".repeat(22)}`;
const NOW = Date.parse("2026-08-04T12:00:00Z");

const VIDEO_BLUEPRINTS = [
  ["Fast result reveal", 14, "2026-08-02T12:00:00Z", 18_400, 1_620, 118],
  ["Three mistakes in 20 seconds", 20, "2026-07-29T12:00:00Z", 15_200, 1_340, 96],
  ["Before and after loop", 18, "2026-07-24T12:00:00Z", 24_800, 2_160, 141],
  ["One setting most people miss", 28, "2026-07-19T12:00:00Z", 11_600, 1_180, 88],
  ["Tool comparison in 30 seconds", 30, "2026-07-14T12:00:00Z", 9_400, 690, 65],
  ["The hidden shortcut", 24, "2026-07-09T12:00:00Z", 28_700, 2_430, 174],
  ["Do this before you start", 12, "2026-07-04T12:00:00Z", 8_200, 820, 74],
  ["Why this result fails", 42, "2026-06-29T12:00:00Z", 6_800, 510, 62],
  ["Five-second visual test", 9, "2026-06-24T12:00:00Z", 21_300, 1_890, 121],
  ["Quick fix with captions", 36, "2026-06-19T12:00:00Z", 7_600, 720, 55],
  ["A cleaner final reveal", 54, "2026-06-14T12:00:00Z", 5_100, 330, 42],
  ["The replayable transition", 16, "2026-06-09T12:00:00Z", 31_900, 2_860, 203],
  ["Two hooks compared", 48, "2026-06-04T12:00:00Z", 12_100, 980, 79],
  ["Stop using this broad tag", 33, "2026-05-30T12:00:00Z", 4_300, 460, 38],
  ["Show the payoff first", 22, "2026-05-25T12:00:00Z", 26_400, 2_270, 167],
  ["Caption density test", 58, "2026-05-20T12:00:00Z", 3_600, 290, 31],
  ["Loop back to frame one", 26, "2026-05-15T12:00:00Z", 19_700, 1_740, 126],
  ["One clear action", 44, "2026-05-10T12:00:00Z", 6_200, 640, 49],
];

function createVideos() {
  return VIDEO_BLUEPRINTS.map(
    ([title, durationSeconds, publishedAt, viewCount, likeCount, commentCount], index) => ({
      videoId: `SyntheticShort${String(index + 1).padStart(2, "0")}`,
      title: `[Synthetic] ${title}`,
      description:
        "Static Shorts-channel fixture covering hooks, result reveals, captions, loops, tags, pacing and repeatable subjects.",
      publishedAt,
      durationSeconds,
      creatorContentType: "SHORTS",
      viewCount,
      likeCount,
      commentCount,
    }),
  );
}

function finding(title, findingText, action, evidenceVideoIds, confidence = "high") {
  return {
    title,
    finding: findingText,
    evidenceVideoIds,
    confidence,
    action,
  };
}

function direction(subject, rationale, hypothesis, evidenceVideoIds, confidence = "medium") {
  return {
    subject,
    format: "up_to_3_minutes",
    rationale,
    evidenceVideoIds,
    confidence,
    hypothesis,
  };
}

const youtubeClient = {
  fetchChannel: async () => {
    const videos = createVideos();
    return {
      sourceUrl: "https://www.youtube.com/@synthetic-shorts-channel",
      channelId: CHANNEL_ID,
      title: "Synthetic Shorts Performance Lab",
      thumbnailUrl: null,
      subscriberCount: 12_400,
      totalViewCount: videos.reduce((total, video) => total + video.viewCount, 0),
      videoCount: videos.length,
      analysedVideoCount: videos.length,
      videos,
    };
  },
};

const syntheticEngagedViews = {
  status: "available",
  source: "synthetic_fixture",
  reason: null,
  engagedViews: 205_400,
  views: 261_300,
  engagedViewSharePercent: 78.6,
  periodStart: "2019-01-01",
  periodEnd: "2026-08-04",
};

const channelEngagedViewsService = {
  fetch: async () => syntheticEngagedViews,
};

const performanceAnalyst = {
  analyse: async ({
    representativeVideos,
    mode,
    analysisScope,
    engagedViewsSummary,
  }) => {
    const ids = representativeVideos.map((video) => video.videoId);
    const evidence = (index) => [ids[index % ids.length]];
    return {
      insight: {
        status: "available",
        summary: {
          headline: "Fast payoffs and loop-ready reveals lead this Shorts catalogue",
          assessment:
            `The fixture records ${engagedViewsSummary.engagedViews.toLocaleString()} engaged views, ${engagedViewsSummary.engagedViewSharePercent}% of measured Shorts views. Immediate outcomes and replayable reveals also lead the public per-video proxy, but retention and swipe-away remain unavailable.`,
          confidence: "high",
        },
        strengths: [
          finding(
            "Immediate visual payoff",
            "The strongest age-normalised reach repeatedly appears on result-first concepts.",
            "Show the finished outcome in the first frame and begin the demonstration immediately.",
            evidence(0),
          ),
          finding(
            "Replayable reveal structure",
            "Reveal-and-loop subjects appear repeatedly among the selected reach leaders.",
            "Design the final frame so it naturally reconnects with the opening frame.",
            evidence(1),
          ),
          finding(
            "Specific problem framing",
            "Focused mistakes, shortcuts and settings attract denser public interaction than broad topics.",
            "Use one exact problem, one visible action and one promised result per Short.",
            evidence(2),
          ),
        ],
        weaknesses: [
          finding(
            "Longer Shorts are inconsistent",
            "Uploads near one minute show weaker and less consistent public reach in this fixture.",
            "Test a shorter edit before adding more explanation or examples.",
            evidence(3),
            "medium",
          ),
          finding(
            "Broad metadata direction",
            "Generic tag-led subjects underperform more specific result-led subjects.",
            "Use exact topic and format variants instead of viral or trending language.",
            evidence(4),
            "medium",
          ),
          finding(
            "Dense explanation risk",
            "Caption-heavy explanatory concepts show weaker public interaction density.",
            "Keep each caption to one readable phrase and move detail to a follow-up Short.",
            evidence(5),
            "medium",
          ),
        ],
        uncertainties: [
          "The fixture supplies aggregate engaged views, but per-video engaged views, stayed-to-watch, swipe-away, retention, watch time and replay counts remain unavailable.",
          "The Shorts classification is exact in this fixture but normally uses a duration proxy when owner classification is unavailable.",
        ],
        nextVideoDirections: [
          direction(
            "Three mistakes with instant corrections",
            "Combines the catalogue's strongest specific-problem and rapid-payoff patterns.",
            "A first correction by second two may improve public interaction density and age-normalised reach.",
            evidence(6),
            "high",
          ),
          direction(
            "Before-and-after result loop",
            "Result reveals and loop-ready transitions are repeated public reach leaders.",
            "A reversible final frame may encourage replay without delaying the promised result.",
            evidence(7),
          ),
          direction(
            "One hidden setting, one visible difference",
            "Focused setting and shortcut subjects outperform broad explanatory concepts.",
            "A single on-screen comparison may be clearer than a multi-step explanation.",
            evidence(8),
          ),
        ],
      },
      suppliedVideoIds: ids,
      tokenBudget: {
        mode,
        ceilingTokens: mode === "heavy" ? 10_000 : 6_500,
        maxOutputTokens: mode === "heavy" ? 3_000 : 2_800,
        estimatedInputTokens: 0,
        actualInputTokens: 0,
        actualOutputTokens: 0,
        actualTotalTokens: 0,
        requestCount: 1,
      },
      analysisScope,
    };
  },
};

const analyseSyntheticChannel = createChannelAnalyser({
  youtubeClient,
  performanceAnalyst,
  channelEngagedViewsService,
  now: () => NOW,
});

export async function createSyntheticChannelShortAnalysis() {
  const result = await analyseSyntheticChannel({
    url: "https://www.youtube.com/@synthetic-shorts-channel",
    analysisMode: "economy",
    videoType: "short",
  });
  return {
    ...result,
    fixture: {
      synthetic: true,
      id: "synthetic-channel-shorts-v1",
      label: "Synthetic Shorts channel",
      scenario:
        "Eighteen Shorts with aggregate engaged views, varied duration, age-normalised public reach, interaction density, outliers and evidence-linked recommendations.",
      description:
        "Static test data. No YouTube, Google, OpenAI, OAuth, quota or token request was made.",
    },
    sanity: {
      ...result.sanity,
      checks: [
        ...result.sanity.checks,
        "synthetic Shorts channel is explicitly labelled",
        "channel fixture used the normal focused-analysis pipeline",
      ],
    },
  };
}
