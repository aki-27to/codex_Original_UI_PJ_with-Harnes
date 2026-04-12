"use strict";

const { createBatchRoutes } = require("./routes/batch_routes");
const { createRuntimeRoutes } = require("./routes/runtime_routes");
const { createEvalRoutes } = require("./routes/eval_routes");
const { createExecRoutes } = require("./routes/exec_routes");

function createRequestHandler(ctx) {
  const routes = [
    ...createRuntimeRoutes(ctx),
    ...createBatchRoutes(ctx),
    ...createEvalRoutes(ctx),
    ...createExecRoutes(ctx),
  ];

  return async function requestHandler(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const originalPathname = url.pathname;
    const pathname = ctx.rewriteNativeAppApiPath(ctx.appRegistry, originalPathname) || originalPathname;
    const appProxyForward = ctx.resolveProxyAppForward(ctx.appRegistry, originalPathname);
    if (appProxyForward) {
      req.__proxyMountPath =
        appProxyForward.app && appProxyForward.app.mountPath ? appProxyForward.app.mountPath : "";
      await ctx.proxyConfiguredAppRequest(req, res, appProxyForward, url);
      return;
    }

    if (
      await ctx.appPlatformReadSurface.tryHandleGetRequest({
        req,
        res,
        pathname,
        buildRuntimeApiSnapshot: ctx.buildRuntimeApiSnapshot,
      })
    ) {
      return;
    }

    if (req.method === "POST" && pathname.startsWith("/api/apps/")) {
      const replyMatch = pathname.match(/^\/api\/apps\/([^/]+)\/reply$/);
      if (replyMatch) {
        await ctx.handleHarnessAppReplyRequest(req, res, decodeURIComponent(replyMatch[1]));
        return;
      }
      const structuredMatch = pathname.match(/^\/api\/apps\/([^/]+)\/structured$/);
      if (structuredMatch) {
        await ctx.handleHarnessAppStructuredRequest(req, res, decodeURIComponent(structuredMatch[1]));
        return;
      }
    }

    for (const route of routes) {
      if (route.method === req.method && route.match(pathname)) {
        await route.handle({ req, res, url, pathname, originalPathname });
        return;
      }
    }

    if (await ctx.handleLegacyRuntimeRoute({ req, res, url, pathname, originalPathname })) {
      return;
    }

    if (req.method === "GET") {
      ctx.appPlatformReadSurface.serveStaticFile(req, res, pathname);
      return;
    }

    if (pathname.startsWith("/api/")) {
      ctx.sendJson(res, 404, { ok: false, error: "Unknown API route", path: pathname });
      return;
    }

    ctx.sendJson(res, 405, { error: "Method not allowed" });
  };
}

module.exports = {
  createRequestHandler,
};
