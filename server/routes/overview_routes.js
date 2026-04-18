"use strict";

function createOverviewRoutes(ctx) {
  return [
    {
      method: "GET",
      match: (pathname) => pathname === "/api/intent/profile",
      async handle(args) {
        return ctx.services.overview.handleIntentProfileSnapshotRequest(args);
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/harness/overview",
      async handle(args) {
        return ctx.services.overview.handleHarnessOverviewRequest(args);
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/conversation/runtime",
      async handle(args) {
        return ctx.services.overview.handleConversationRuntimeRequest(args);
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/conversation/persona/memory",
      async handle(args) {
        return ctx.services.overview.handleConversationPersonaMemoryRequest(args);
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/agent-topography",
      async handle(args) {
        return ctx.services.overview.handleAgentTopographyRequest(args);
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/continuity/task",
      async handle(args) {
        return ctx.services.overview.handleContinuityTaskRequest(args);
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/continuity/tasks",
      async handle(args) {
        return ctx.services.overview.handleContinuityTasksRequest(args);
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/diagnostics",
      async handle(args) {
        return ctx.services.overview.handleDiagnosticsRequest(args);
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/slo/status",
      async handle(args) {
        return ctx.services.overview.handleSloStatusRequest(args);
      },
    },
  ];
}

module.exports = {
  createOverviewRoutes,
};
