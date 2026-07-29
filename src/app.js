import path from "node:path";

import express from "express";
import { rateLimit } from "express-rate-limit";

import {
  assertAnalysisConfig,
  configurationStatus,
  PROJECT_ROOT,
} from "./config.js";
import { toPublicError } from "./errors.js";

function registerAnalysisRoute(app, { path, config, analyse, requestData }) {
  app.post(path, async (request, response) => {
    try {
      assertAnalysisConfig(config);
      const analysis = await analyse(requestData(request.body ?? {}));
      response.json({ analysis });
    } catch (error) {
      const publicError = toPublicError(error);
      response.status(publicError.status).json(publicError.body);
    }
  });
}

export function createApp({ config, analyseVideo, analyseChannel }) {
  const app = express();
  const publicDirectory = path.join(PROJECT_ROOT, "public");

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Wait a minute and try again.",
        },
      },
    }),
  );

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      configuration: configurationStatus(config),
    });
  });

  registerAnalysisRoute(app, {
    path: "/api/video-analysis",
    config,
    analyse: analyseVideo,
    requestData: (body) => ({
      url: body.url,
      maxComments: body.maxComments,
    }),
  });

  registerAnalysisRoute(app, {
    path: "/api/channel-analysis",
    config,
    analyse: analyseChannel,
    requestData: (body) => ({ url: body.url }),
  });

  app.use(
    express.static(publicDirectory, {
      index: false,
      etag: true,
      maxAge: "1h",
    }),
  );

  app.get("/", (_request, response) => {
    response.redirect("/VideoDashboard.html");
  });

  app.get("/ChannelDashboard.html", (_request, response) => {
    response.redirect("/ChannelDashbaord.html");
  });

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
      },
    });
  });

  return app;
}
