"use strict";

function createConversationRoutes(ctx) {
  return [
    {
      method: "POST",
      match: (pathname) => pathname === "/api/conversation/direct",
      async handle(args) {
        await ctx.services.conversation.handleConversationDirectRequest(args);
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/conversation/persona/reset",
      async handle(args) {
        await ctx.services.conversation.handleConversationPersonaResetRequest(args);
      },
    },
  ];
}

module.exports = {
  createConversationRoutes,
};
