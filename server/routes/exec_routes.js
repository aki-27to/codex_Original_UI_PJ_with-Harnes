"use strict";

function createExecRoutes(ctx) {
  return [
    {
      method: "GET",
      match: (pathname) => pathname.startsWith("/api/exec/idempotency/"),
      async handle(args) {
        return ctx.handleExecIdempotencyRequest(args);
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/exec",
      async handle(args) {
        return ctx.handleExecRequest(args);
      },
    },
  ];
}

module.exports = {
  createExecRoutes,
};
