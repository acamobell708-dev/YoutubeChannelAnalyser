import crypto from "node:crypto";

export const OWNER_SESSION_COOKIE = "ytsa_owner_session";
export const OAUTH_STATE_COOKIE = "ytsa_oauth_state";
export const OAUTH_RETURN_COOKIE = "ytsa_oauth_return";

export function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator === -1
          ? [part, ""]
          : [
              part.slice(0, separator),
              decodeURIComponent(part.slice(separator + 1)),
            ];
      }),
  );
}

export function signSessionId(sessionId, secret) {
  const signature = crypto
    .createHmac("sha256", secret)
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${signature}`;
}

export function verifySessionCookie(value, secret) {
  if (!value || !secret) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const sessionId = value.slice(0, separator);
  const expected = signSessionId(sessionId, secret);
  if (value.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected))
    ? sessionId
    : null;
}

export function ownerSessionId(request, config) {
  return verifySessionCookie(
    parseCookies(request)[OWNER_SESSION_COOKIE],
    config.sessionSecret,
  );
}
