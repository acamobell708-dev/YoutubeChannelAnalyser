import { AppError } from "../errors.js";

export const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

export function parseYouTubeChannelUrl(rawUrl) {
  const sourceUrl = String(rawUrl ?? "").trim();
  let parsed;

  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new AppError(
      "Enter a full YouTube channel URL, such as https://www.youtube.com/@GoogleDevelopers.",
      { status: 400, code: "INVALID_CHANNEL_URL" },
    );
  }

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())
  ) {
    throw new AppError(
      "The URL is not a recognised YouTube channel URL.",
      { status: 400, code: "INVALID_CHANNEL_URL" },
    );
  }

  const pathParts = parsed.pathname.split("/").filter(Boolean);
  const firstPart = pathParts[0] ?? "";
  let lookup;

  if (firstPart.startsWith("@") && firstPart.length > 1) {
    lookup = { parameter: "forHandle", value: firstPart };
  } else if (firstPart === "channel" && CHANNEL_ID_PATTERN.test(pathParts[1])) {
    lookup = { parameter: "id", value: pathParts[1] };
  } else if (firstPart === "user" && pathParts[1]) {
    lookup = { parameter: "forUsername", value: pathParts[1] };
  } else {
    throw new AppError(
      "Use a channel URL containing an @handle, /channel/ ID, or legacy /user/ name. Custom /c/ URLs are not supported by the official lookup endpoint.",
      { status: 400, code: "UNSUPPORTED_CHANNEL_URL" },
    );
  }

  return { sourceUrl, lookup };
}
