"use strict";

function createEvalRoutes(ctx) {
  return [
    {
      method: "GET",
      match: (pathname) => pathname === "/api/eval/suites",
      async handle(args) {
        return ctx.handleEvalSuitesRequest(args);
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/eval/history",
      async handle(args) {
        return ctx.handleEvalHistoryRequest(args);
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/eval/run",
      async handle(args) {
        return ctx.handleEvalRunRequest(args);
      },
    },
  ];
}

module.exports = {
  createEvalRoutes,
};
