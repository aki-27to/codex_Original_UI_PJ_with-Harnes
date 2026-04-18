"use strict";

function createVoiceRoutes(ctx) {
  return [
    {
      method: "POST",
      match: (pathname) => pathname === "/api/voice/piper/prepare",
      async handle(args) {
        await ctx.services.conversation.handleVoicePiperPrepareRequest(args);
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/voice/piper",
      async handle(args) {
        await ctx.services.conversation.handleVoicePiperRequest(args);
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/voice/kokoro",
      async handle(args) {
        await ctx.services.conversation.handleVoiceKokoroRequest(args);
      },
    },
  ];
}

module.exports = {
  createVoiceRoutes,
};
