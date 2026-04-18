#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
const { implementationPath: serverImplementationPath } = resolveServerImplementationPath(workspaceRoot);
const serverSource = fs.readFileSync(serverImplementationPath, "utf8");
const contextPath = path.join(workspaceRoot, "server", "request_handler_context.js");
const contextSource = fs.readFileSync(contextPath, "utf8");

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assertExcludes(source, needle, message) {
  assert(!source.includes(needle), message);
}

function main() {
  const { createRequestHandlerContext } = require(contextPath);

  assert.strictEqual(
    typeof createRequestHandlerContext,
    "function",
    "request handler context factory must export createRequestHandlerContext"
  );

  assertIncludes(
    serverSource,
    'const {createRequestHandlerContext}=require("./server/request_handler_context");',
    "server_impl must import the request handler context factory"
  );
  assertIncludes(
    serverSource,
    'const {createRouteServices}=require("./server/route_services");',
    "server_impl must import the route services composition module"
  );
  assertIncludes(
    serverSource,
    "const requestHandler=createRequestHandler(createRequestHandlerContext({",
    "server_impl must build the request handler through the extracted context factory"
  );
  assertIncludes(
    serverSource,
    "services:routeServices,",
    "request handler context must receive the grouped route service surface"
  );
  assertIncludes(
    contextSource,
    "services,",
    "request handler context must expose grouped services"
  );
  assertExcludes(
    contextSource,
    "buildIntentFirstApiSnapshot,",
    "request handler context should no longer carry overview/control route helpers inline"
  );
  assertExcludes(
    contextSource,
    "getConversationRuntimeSnapshot,",
    "request handler context should no longer expose overview route builder helpers directly"
  );
  assertIncludes(
    contextSource,
    "get workspaceGuardLockedRoot() {",
    "batch routes must still preserve the live workspace lock getter"
  );
  assertExcludes(
    serverSource,
    "function buildRequestHandlerContext(){",
    "server_impl should no longer keep the request handler context builder inline"
  );
  assertExcludes(
    serverSource,
    "handleExecRequest,",
    "request handler context should no longer expose per-route wrapper handlers"
  );

  console.log("PASS request_handler_context_split_test");
}

main();
