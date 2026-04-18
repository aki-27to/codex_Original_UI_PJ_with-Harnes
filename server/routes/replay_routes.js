"use strict";

function createReplayRoutes(ctx) {
  return [
    {
      method: "GET",
      match: (pathname) => pathname === "/api/replay/turns",
      async handle(args) {
        return ctx.services.replay.handleReplayTurnsRequest(args);
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname.startsWith("/api/replay/turn/"),
      async handle(args) {
        return ctx.services.replay.handleReplayTurnDetailRequest(args);
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/replay/turn",
      async handle(args) {
        return ctx.services.replay.handleReplayTurnRequest(args);
      },
    },
  ];
}

module.exports = {
  createReplayRoutes,
};
