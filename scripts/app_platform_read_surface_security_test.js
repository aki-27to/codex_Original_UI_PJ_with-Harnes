#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const {
  createAppPlatformReadSurface,
} = require("./lib/app_platform_read_surface");

const workspaceRoot = path.resolve(__dirname, "..");
const webRoot = path.join(workspaceRoot, "web", "01.HarnesUI");

function createResponseRecorder() {
  const writes = [];
  return {
    writes,
    writeHead(statusCode, headers) {
      writes.push({ type: "head", statusCode, headers });
    },
    end(body) {
      writes.push({ type: "end", body });
    },
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function makeSurface() {
  return createAppPlatformReadSurface({
    appRegistry: [
      {
        id: "demo-app",
        title: "Demo",
        mountPath: "/apps/demo-app",
        integrationMode: "native-static",
        static: { root: "web/01.HarnesUI" },
      },
    ],
    buildAppRegistryRuntimeSnapshot: () => [],
    buildHarnessAppRuntimeStatus: async () => ({ ok: true }),
    bundledEnglishConversationAppRoot: path.join(workspaceRoot, "APP", "01.english-conversation-app"),
    defaultIntegratedEnglishConversationAppRoot: path.join(workspaceRoot, "APP", "01.english-conversation-app"),
    findAppById: (apps, id) => apps.find((entry) => entry.id === id),
    findAppByMountPath: (apps, pathname) => apps.find((entry) => pathname === entry.mountPath || pathname.startsWith(`${entry.mountPath}/`)),
    getRegisteredAppRuntimeConfig: (appId) => appId === "demo-app" ? { id: "demo-app", title: "Demo", mountPath: "/apps/demo-app", integrationMode: "native-static" } : null,
    isPathWithin(rootPath, candidatePath) {
      const root = path.resolve(rootPath);
      const candidate = path.resolve(candidatePath);
      return root === candidate || candidate.startsWith(`${root}${path.sep}`);
    },
    legacyExternalEnglishConversationAppRoot: path.join(workspaceRoot, "..", "01.english-conversation-app"),
    resolveNativeStaticRoot: () => ({ root: webRoot, source: "test" }),
    sendJson,
    summarizePathForOperationLog: (value) => String(value || ""),
    webRoot,
    workspaceRoot,
  });
}

async function main() {
  const surface = makeSurface();
  const malformedStatic = surface.buildStaticRequestTarget("/%E0%A4%A");
  assert.strictEqual(malformedStatic.allowed, false, "malformed static path must be denied");
  assert.strictEqual(malformedStatic.statusCode, 400, "malformed static path must fail as client input");

  const traversalTarget = surface.buildStaticRequestTarget("/../README.md");
  assert.strictEqual(traversalTarget.allowed, false, "static traversal must stay outside the allowed root");

  const res = createResponseRecorder();
  const handled = await surface.tryHandleGetRequest({
    req: { method: "GET" },
    res,
    pathname: "/api/apps/%E0%A4%A/runtime",
    buildRuntimeApiSnapshot: () => ({}),
  });
  assert.strictEqual(handled, true, "malformed app runtime route must be handled locally");
  assert.strictEqual(res.writes[0].statusCode, 400, "malformed app runtime route must return 400");
  assert.strictEqual(JSON.parse(res.writes[1].body).code, "BAD_PERCENT_ENCODING");

  console.log("PASS app_platform_read_surface_security_test");
}

main().catch((error) => {
  console.error(`FAIL app_platform_read_surface_security_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
