import { AppError } from "../errors.js";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export function extractVideoId(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl ?? "").trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  let candidate = null;

  if (host === "youtu.be") {
    candidate = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (ALLOWED_HOSTS.has(host)) {
    if (parsed.pathname === "/watch") {
      candidate = parsed.searchParams.get("v");
    } else {
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      if (
        pathParts.length >= 2 &&
        new Set(["embed", "live", "shorts"]).has(pathParts[0])
      ) {
        candidate = pathParts[1];
      }
    }
  }

  return candidate && VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
}

export function validateYouTubeVideoUrl(rawUrl) {
  const value = String(rawUrl ?? "").trim();
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new AppError(
      "Enter a full YouTube video URL, such as https://www.youtube.com/watch?v=VIDEO_ID.",
      { status: 400, code: "INVALID_VIDEO_URL" },
    );
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !ALLOWED_HOSTS.has(parsed.hostname.toLowerCase()) ||
    !extractVideoId(value)
  ) {
    throw new AppError(
      "The URL is not a recognised YouTube video URL. Standard, shortened, Shorts, live, and embed URLs are supported.",
      { status: 400, code: "INVALID_VIDEO_URL" },
    );
  }

  return value;
}

export function parseCommentLimit(value, { defaultValue = 100 } = {}) {
  const parsed =
    value === undefined || value === null || value === ""
      ? defaultValue
      : Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new AppError("Comment limit must be a whole number from 1 to 500.", {
      status: 400,
      code: "INVALID_COMMENT_LIMIT",
    });
  }

  return parsed;
}
