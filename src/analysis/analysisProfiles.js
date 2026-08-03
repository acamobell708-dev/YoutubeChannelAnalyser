import { AppError } from "../errors.js";

export const ANALYSIS_PROFILES = Object.freeze({
  economy: Object.freeze({
    id: "economy",
    ceilingTokens: 6_500,
    estimatedInputTarget: 3_700,
    maxOutputTokens: 2_800,
    maxCommentThreads: 8,
    maxRepliesPerThread: 1,
    maxTranscriptSegments: 12,
    minimumTranscriptSegments: 4,
    minimumCommentThreads: 3,
    thumbnailDetail: "low",
    maxChannelEvidenceVideos: 12,
    channelDescriptionCharacters: 180,
  }),
  heavy: Object.freeze({
    id: "heavy",
    ceilingTokens: 10_000,
    estimatedInputTarget: 6_500,
    maxOutputTokens: 3_000,
    maxCommentThreads: 18,
    maxRepliesPerThread: 2,
    maxTranscriptSegments: 24,
    minimumTranscriptSegments: 6,
    minimumCommentThreads: 6,
    thumbnailDetail: "high",
    maxChannelEvidenceVideos: 24,
    channelDescriptionCharacters: 320,
  }),
});

export function getAnalysisProfile(mode = "economy") {
  const profile = ANALYSIS_PROFILES[mode];
  if (!profile) {
    throw new AppError("Choose either economy or heavy analysis mode.", {
      status: 400,
      code: "UNSUPPORTED_ANALYSIS_MODE",
    });
  }
  return profile;
}
