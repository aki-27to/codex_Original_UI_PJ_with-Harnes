"use strict";

function createAppRoutes(ctx) {
  return [
    {
      method: "POST",
      match: (pathname) => /^\/api\/apps\/[^/]+\/reply$/.test(pathname),
      async handle({ req, res, pathname }) {
        const match = pathname.match(/^\/api\/apps\/([^/]+)\/reply$/);
        if (!match) {
          ctx.sendJson(res, 404, { ok: false, error: "Unknown API route", path: pathname });
          return;
        }
        await ctx.services.harnessApp.handleHarnessAppReplyRequest(req, res, decodeURIComponent(match[1]));
      },
    },
    {
      method: "POST",
      match: (pathname) => /^\/api\/apps\/[^/]+\/structured$/.test(pathname),
      async handle({ req, res, pathname }) {
        const match = pathname.match(/^\/api\/apps\/([^/]+)\/structured$/);
        if (!match) {
          ctx.sendJson(res, 404, { ok: false, error: "Unknown API route", path: pathname });
          return;
        }
        await ctx.services.harnessApp.handleHarnessAppStructuredRequest(req, res, decodeURIComponent(match[1]));
      },
    },
  ];
}

module.exports = {
  createAppRoutes,
};
