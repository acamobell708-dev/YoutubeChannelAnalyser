const CAPTIONS_ENDPOINT = "https://www.googleapis.com/youtube/v3/captions";

function unknown(reason) {
  return {
    status: "unknown",
    displayValue: "Unknown",
    reason,
    source: null,
    language: null,
    segmentCount: 0,
    segments: [],
    text: "",
  };
}

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function timestampToSeconds(value) {
  const parts = String(value || "")
    .trim()
    .replace(",", ".")
    .split(":")
    .map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export function parseWebVtt(value) {
  const lines = String(value || "")
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
    .split("\n");
  const segments = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes("-->")) continue;
    const [startValue, endValueWithSettings] = lines[index].split("-->");
    const endValue = endValueWithSettings?.trim().split(/\s+/)[0];
    const startSeconds = timestampToSeconds(startValue);
    const endSeconds = timestampToSeconds(endValue);
    const textLines = [];
    index += 1;
    while (index < lines.length && lines[index].trim()) {
      textLines.push(lines[index].trim());
      index += 1;
    }
    const text = decodeEntities(
      textLines.join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
    );
    if (
      text &&
      Number.isFinite(startSeconds) &&
      Number.isFinite(endSeconds) &&
      endSeconds >= startSeconds &&
      segments.at(-1)?.text !== text
    ) {
      segments.push({ startSeconds, endSeconds, text });
    }
  }
  return segments;
}

function selectCaptionTrack(tracks) {
  return [...tracks]
    .filter((track) => track.snippet?.status !== "failed")
    .sort((left, right) => {
      const score = (snippet = {}) =>
        (snippet.language?.toLowerCase().startsWith("en") ? 8 : 0) +
        (snippet.trackKind !== "ASR" ? 4 : 0) +
        (snippet.isDraft ? -16 : 0);
      return score(right.snippet) - score(left.snippet);
    })[0];
}

export class YouTubeCaptionService {
  constructor({ oauthService, fetchImpl = fetch }) {
    this.oauthService = oauthService;
    this.fetchImpl = fetchImpl;
  }

  async fetchTranscript({ videoId, channelId, ownerSessionId }) {
    if (!this.oauthService?.configured || !ownerSessionId) {
      return unknown(
        "Owner Google login is required for authorised caption analysis.",
      );
    }
    const status = this.oauthService.getStatus(ownerSessionId);
    if (!status.connected) {
      return unknown(
        "Owner Google login is required for authorised caption analysis.",
      );
    }
    if (!status.channels.some((channel) => channel.id === channelId)) {
      return unknown(
        "The signed-in Google account does not own this video's channel.",
      );
    }

    try {
      const accessToken =
        await this.oauthService.getAccessToken(ownerSessionId);
      if (!accessToken) return unknown("The owner Google login has expired.");

      const listUrl = new URL(CAPTIONS_ENDPOINT);
      listUrl.search = new URLSearchParams({
        part: "snippet",
        videoId,
        fields:
          "items(id,snippet(language,name,trackKind,isDraft,status,isAutoSynced))",
      }).toString();
      const listResponse = await this.fetchImpl(listUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!listResponse.ok) {
        return unknown("YouTube did not permit access to the caption track.");
      }
      const listPayload = await listResponse.json();
      const track = selectCaptionTrack(listPayload.items || []);
      if (!track) {
        return unknown("No downloadable owner caption track is available.");
      }

      const downloadUrl = new URL(`${CAPTIONS_ENDPOINT}/${track.id}`);
      downloadUrl.searchParams.set("tfmt", "vtt");
      const downloadResponse = await this.fetchImpl(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!downloadResponse.ok) {
        return unknown("YouTube did not permit the caption download.");
      }
      const segments = parseWebVtt(await downloadResponse.text());
      if (!segments.length) {
        return unknown("The caption track did not contain usable text.");
      }

      return {
        status: "available",
        displayValue: "Available",
        reason: null,
        source: "youtube_owner_captions",
        language: track.snippet?.language || "und",
        trackKind: track.snippet?.trackKind || "standard",
        isAutoSynced: Boolean(track.snippet?.isAutoSynced),
        segmentCount: segments.length,
        segments,
        text: segments.map((segment) => segment.text).join(" "),
      };
    } catch {
      return unknown(
        "The authorised transcript could not be retrieved from YouTube.",
      );
    }
  }
}
