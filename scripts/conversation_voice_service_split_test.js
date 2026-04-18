#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
const { implementationPath: serverImplementationPath } = resolveServerImplementationPath(workspaceRoot);
const serverSource = fs.readFileSync(serverImplementationPath, "utf8");
const requestHandlerSource = fs.readFileSync(path.join(workspaceRoot, "server", "request_handler.js"), "utf8");
const requestHandlerContextSource = fs.readFileSync(
  path.join(workspaceRoot, "server", "request_handler_context.js"),
  "utf8"
);
const routeServicesSource = fs.readFileSync(path.join(workspaceRoot, "server", "route_services.js"), "utf8");
const conversationRoutesPath = path.join(workspaceRoot, "server", "routes", "conversation_routes.js");
const voiceRoutesPath = path.join(workspaceRoot, "server", "routes", "voice_routes.js");
const conversationServicePath = path.join(workspaceRoot, "server", "services", "conversation_service.js");
const requestHandlerContextPath = path.join(workspaceRoot, "server", "request_handler_context.js");
const routeServicesPath = path.join(workspaceRoot, "server", "route_services.js");

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assertExcludes(source, needle, message) {
  assert(!source.includes(needle), message);
}

function main() {
  const { createConversationRoutes } = require(conversationRoutesPath);
  const { createVoiceRoutes } = require(voiceRoutesPath);
  const { createConversationService } = require(conversationServicePath);
  const { createRequestHandlerContext } = require(requestHandlerContextPath);
  const { createRouteServices } = require(routeServicesPath);

  assert.strictEqual(
    typeof createConversationRoutes,
    "function",
    "conversation route factory must export createConversationRoutes"
  );
  assert.strictEqual(
    typeof createVoiceRoutes,
    "function",
    "voice route factory must export createVoiceRoutes"
  );
  assert.strictEqual(
    typeof createConversationService,
    "function",
    "conversation service factory must export createConversationService"
  );
  assert.strictEqual(
    typeof createRequestHandlerContext,
    "function",
    "request handler context factory must export createRequestHandlerContext"
  );
  assert.strictEqual(
    typeof createRouteServices,
    "function",
    "route services module must export createRouteServices"
  );

  assertIncludes(
    requestHandlerSource,
    'const { createConversationRoutes } = require("./routes/conversation_routes");',
    "request handler must import conversation routes"
  );
  assertIncludes(
    requestHandlerSource,
    'const { createVoiceRoutes } = require("./routes/voice_routes");',
    "request handler must import voice routes"
  );
  assertIncludes(
    requestHandlerSource,
    "...createConversationRoutes(ctx),",
    "request handler must register conversation routes"
  );
  assertIncludes(
    requestHandlerSource,
    "...createVoiceRoutes(ctx),",
    "request handler must register voice routes"
  );
  assertIncludes(
    requestHandlerContextSource,
    "services,",
    "request handler context must expose the grouped service surface"
  );
  assertIncludes(
    routeServicesSource,
    'const { createConversationService } = require("./services/conversation_service");',
    "route services module must import conversation service"
  );
  assertIncludes(
    routeServicesSource,
    "conversation: conversationService,",
    "route services module must expose the conversation service in the grouped surface"
  );

  assertIncludes(
    serverSource,
    'const {createRouteServices}=require("./server/route_services");',
    "server_impl must import the route services composition module"
  );
  assertIncludes(
    serverSource,
    'const {createRequestHandlerContext}=require("./server/request_handler_context");',
    "server_impl must import the request handler context factory"
  );
  assertIncludes(
    serverSource,
    "const routeServices=createRouteServices({",
    "server_impl must assemble route services through the composition module"
  );
  assertIncludes(
    serverSource,
    "const requestHandler=createRequestHandler(createRequestHandlerContext({",
    "server_impl must pass the extracted route services into the request handler context"
  );
  assertExcludes(
    serverSource,
    'if(req.method==="POST"&&pathname==="/api/voice/piper/prepare"){',
    "server_impl should no longer keep duplicate voice prepare route authority"
  );
  assertExcludes(
    serverSource,
    'if(req.method==="POST"&&pathname==="/api/voice/piper"){',
    "server_impl should no longer keep duplicate piper route authority"
  );
  assertExcludes(
    serverSource,
    'if(req.method==="POST"&&pathname==="/api/voice/kokoro"){',
    "server_impl should no longer keep duplicate kokoro route authority"
  );
  assertExcludes(
    serverSource,
    'if(req.method==="POST"&&pathname==="/api/conversation/direct"){',
    "server_impl should no longer keep duplicate conversation direct route authority"
  );
  assertExcludes(
    serverSource,
    'if(req.method==="POST"&&pathname==="/api/conversation/persona/reset"){',
    "server_impl should no longer keep duplicate persona reset route authority"
  );
  assertIncludes(
    fs.readFileSync(conversationRoutesPath, "utf8"),
    "ctx.services.conversation.handleConversationDirectRequest(args);",
    "conversation routes must delegate directly to the conversation service surface"
  );
  assertIncludes(
    fs.readFileSync(voiceRoutesPath, "utf8"),
    "ctx.services.conversation.handleVoicePiperPrepareRequest(args);",
    "voice routes must delegate directly to the conversation service surface"
  );
  assertExcludes(
    serverSource,
    "function handleConversationDirectRequest(args){",
    "server_impl should not keep conversation wrapper helpers for the request handler"
  );

  console.log("PASS conversation_voice_service_split_test");
}

main();
