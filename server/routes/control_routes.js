"use strict";

function createControlRoutes(ctx) {
  return [
    {
      method: "POST",
      match: (pathname) => pathname === "/api/intent/profile",
      async handle(args) {
        return ctx.services.control.handleIntentProfileUpdateRequest(args);
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/intent/profile/reset",
      async handle(args) {
        return ctx.services.control.handleIntentProfileResetRequest(args);
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/workspace/lock",
      async handle(args) {
        return ctx.services.control.handleWorkspaceLockRequest(args);
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/workspace/unlock",
      async handle(args) {
        return ctx.services.control.handleWorkspaceUnlockRequest(args);
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/requirement-guard/validate",
      async handle(args) {
        return ctx.services.control.handleRequirementGuardValidateRequest(args);
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/open-cmd",
      async handle(args) {
        return ctx.services.control.handleOpenCmdRequest(args);
      },
    },
  ];
}

module.exports = {
  createControlRoutes,
};
