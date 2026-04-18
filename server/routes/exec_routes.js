"use strict";

function createExecRoutes(ctx) {
  return [
    {
      method: "GET",
      match: (pathname) => pathname.startsWith("/api/exec/idempotency/"),
      async handle(args) {
        return ctx.services.exec.handleExecIdempotencyRequest(args);
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/exec",
      async handle(args) {
        return ctx.services.exec.handleExecRequest(args);
      },
    },
  ];
}

module.exports = {
  createExecRoutes,
};
