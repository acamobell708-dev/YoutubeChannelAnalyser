import {
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE,
  OWNER_SESSION_COOKIE,
  ownerSessionId,
  parseCookies,
  signSessionId,
} from "../auth/sessionCookies.js";
import { toPublicError } from "../errors.js";

const DEFAULT_RETURN_PATH = "/VideoDashboard.html";
const ALLOWED_RETURN_PATHS = new Set([
  DEFAULT_RETURN_PATH,
  "/ChannelDashbaord.html",
  "/ChannelDashboard.html",
]);

export function normaliseOAuthReturnTo(value) {
  const returnTo = String(value ?? "").trim();
  return ALLOWED_RETURN_PATHS.has(returnTo)
    ? returnTo
    : DEFAULT_RETURN_PATH;
}

function cookieSecurity(config) {
  return config.googleOAuthRedirectUri?.startsWith("https://");
}

function clearPendingCookies(response) {
  response.clearCookie(OAUTH_STATE_COOKIE, { path: "/auth/google" });
  response.clearCookie(OAUTH_RETURN_COOKIE, { path: "/auth/google" });
}

export function registerGoogleAuthRoutes(
  app,
  { config, googleOAuthService = null },
) {
  app.get("/api/auth/status", (request, response) => {
    const status = googleOAuthService?.getStatus(
      ownerSessionId(request, config),
    ) || {
      configured: false,
      connected: false,
      channels: [],
    };
    response.json({ ownerAuth: status });
  });

  app.get("/auth/google/start", (request, response) => {
    try {
      if (!googleOAuthService?.configured) {
        response.status(503).json({
          error: {
            code: "GOOGLE_OAUTH_NOT_CONFIGURED",
            message:
              "Google owner sign-in is not configured on this server.",
          },
        });
        return;
      }

      const returnTo = normaliseOAuthReturnTo(request.query.returnTo);
      const { url, state } = googleOAuthService.beginAuthorization();
      const commonOptions = {
        httpOnly: true,
        sameSite: "lax",
        secure: cookieSecurity(config),
        maxAge: 10 * 60 * 1000,
        path: "/auth/google",
      };
      response.cookie(OAUTH_STATE_COOKIE, state, commonOptions);
      response.cookie(OAUTH_RETURN_COOKIE, returnTo, commonOptions);
      response.redirect(url);
    } catch (error) {
      const publicError = toPublicError(error);
      response.status(publicError.status).json(publicError.body);
    }
  });

  app.get("/auth/google/callback", async (request, response) => {
    const cookies = parseCookies(request);
    const returnTo = normaliseOAuthReturnTo(cookies[OAUTH_RETURN_COOKIE]);
    try {
      const result = await googleOAuthService.completeAuthorization({
        code: request.query.code,
        state: request.query.state,
        expectedState: cookies[OAUTH_STATE_COOKIE],
      });
      clearPendingCookies(response);
      response.cookie(
        OWNER_SESSION_COOKIE,
        signSessionId(result.sessionId, config.sessionSecret),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: cookieSecurity(config),
          maxAge: 4 * 60 * 60 * 1000,
          path: "/",
        },
      );
      response.redirect(`${returnTo}?owner=connected`);
    } catch {
      clearPendingCookies(response);
      response.redirect(`${returnTo}?owner=error`);
    }
  });

  app.post("/api/auth/logout", async (request, response) => {
    const origin = request.get("origin");
    let originMatches = true;
    try {
      originMatches = !origin || new URL(origin).host === request.get("host");
    } catch {
      originMatches = false;
    }
    if (!originMatches) {
      response.status(403).json({
        error: {
          code: "INVALID_ORIGIN",
          message: "The logout request origin was not accepted.",
        },
      });
      return;
    }
    await googleOAuthService?.logout(ownerSessionId(request, config));
    response.clearCookie(OWNER_SESSION_COOKIE, { path: "/" });
    response.json({ ownerAuth: { connected: false } });
  });
}
