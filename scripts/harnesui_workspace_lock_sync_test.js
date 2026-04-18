#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appPath = path.join(__dirname, "..", "web", "01.HarnesUI", "app.js");
const source = fs.readFileSync(appPath, "utf8");

function extractFunction(name) {
  const asyncSignature = `async function ${name}(`;
  const syncSignature = `function ${name}(`;
  const asyncStart = source.indexOf(asyncSignature);
  const syncStart = source.indexOf(syncSignature);
  const start = asyncStart >= 0 ? asyncStart : syncStart;
  assert(start >= 0, `${name} helper not found`);
  const signature = asyncStart >= 0 ? asyncSignature : syncSignature;
  let parenDepth = 0;
  let bodyStart = -1;
  for (let index = start + signature.length - 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") {
      parenDepth += 1;
      continue;
    }
    if (char === ")") {
      parenDepth -= 1;
      continue;
    }
    if (char === "{" && parenDepth === 0) {
      bodyStart = index;
      break;
    }
  }
  assert(bodyStart >= 0, `${name} helper body not found`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`failed to extract ${name}`);
}

function buildContext({ runtimeGuard, workspacePath = "C:\\repo", activeWorkspacePath = workspacePath } = {}) {
  const notices = [];
  const mutations = [];
  let loadRuntimeCalls = 0;
  let saveCalls = 0;
  const context = {
    Array,
    Boolean,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    s: {
      runtime: {
        workspaceGuard: runtimeGuard,
      },
      chats: [
        {
          id: "chat-1",
          settings: {
            workspacePath,
            workspaceLockRoot: "",
          },
        },
      ],
      active: "chat-1",
    },
    notices,
    mutations,
    loadRuntimeCalls: () => loadRuntimeCalls,
    saveCalls: () => saveCalls,
    active: () => context.s.chats[0],
    selectedCwd: () => activeWorkspacePath,
    ensureChatScopedStateForUi: (chatRecord) => chatRecord || context.s.chats[0],
    normalizeChatSettingsForUi(value) {
      return {
        workspacePath: typeof value.workspacePath === "string" ? value.workspacePath.trim() : "",
        workspaceLockRoot: typeof value.workspaceLockRoot === "string" ? value.workspaceLockRoot.trim() : "",
      };
    },
    scheduleSaveChatState() {
      saveCalls += 1;
    },
    controlApiToken() {
      return "token";
    },
    async postWorkspaceGuardMutationForUi(pathname, payload) {
      mutations.push({ pathname, payload });
      return {
        ok: true,
        workspaceGuard: {
          locked: true,
          lockedRoot: payload.path,
          requiredForSources: ["web_ui"],
          rejectWhenUnlocked: true,
        },
      };
    },
    async loadRuntime() {
      loadRuntimeCalls += 1;
      return { ok: true };
    },
    setWorkspaceGuardNotice(message, { tone = "" } = {}) {
      notices.push({ message, tone });
    },
  };

  const bootstrap = [
    extractFunction("normalizePathForUi"),
    extractFunction("isPathWithinForUi"),
    extractFunction("workspaceGuardSnapshotForUi"),
    extractFunction("chatWorkspaceGuardPreferenceForUi"),
    extractFunction("workspaceGuardPreferenceMatchesRuntimeForUi"),
    extractFunction("syncWorkspaceGuardForChat"),
    "this.helpers={syncWorkspaceGuardForChat,chatWorkspaceGuardPreferenceForUi};",
  ].join("\n\n");

  vm.runInNewContext(bootstrap, context);
  return { context, helpers: context.helpers, notices, mutations };
}

async function testAdoptsRuntimeDefaultLockWithoutUnlocking() {
  const { context, helpers, mutations, notices } = buildContext({
    runtimeGuard: {
      locked: true,
      lockedRoot: "C:\\repo",
      requiredForSources: ["web_ui"],
      rejectWhenUnlocked: true,
    },
  });

  const result = await helpers.syncWorkspaceGuardForChat(context.s.chats[0], { quiet: false });
  assert.strictEqual(result, true, "sync should succeed");
  assert.strictEqual(context.s.chats[0].settings.workspaceLockRoot, "C:\\repo", "chat should adopt runtime default lock root");
  assert.strictEqual(mutations.length, 0, "sync should not unlock or relock when the selected path is already inside the runtime lock");
  assert.strictEqual(context.loadRuntimeCalls(), 1, "sync should still refresh runtime once");
  assert(notices.some((entry) => /既定の workspace lock/.test(entry.message)), "sync should explain that the default runtime lock was adopted");
}

async function testAutoLocksSelectedPathWhenRuntimeIsUnlocked() {
  const { context, helpers, mutations, notices } = buildContext({
    runtimeGuard: {
      locked: false,
      lockedRoot: "",
      requiredForSources: ["web_ui"],
      rejectWhenUnlocked: true,
    },
    workspacePath: "C:\\repo\\design",
    activeWorkspacePath: "C:\\repo\\design",
  });

  const result = await helpers.syncWorkspaceGuardForChat(context.s.chats[0], { quiet: false });
  assert.strictEqual(result, true, "sync should succeed");
  assert.strictEqual(mutations.length, 1, "sync should auto-lock the selected path when no runtime lock exists");
  assert.strictEqual(mutations[0].pathname, "/api/workspace/lock", "sync should use the lock API");
  assert.strictEqual(mutations[0].payload.path, "C:\\repo\\design", "sync should lock the selected workspace path");
  assert.strictEqual(context.s.chats[0].settings.workspaceLockRoot, "C:\\repo\\design", "chat should persist the auto-locked path");
  assert(notices.some((entry) => /自動 lock/.test(entry.message)), "sync should explain that the room was auto-locked");
}

Promise.resolve()
  .then(testAdoptsRuntimeDefaultLockWithoutUnlocking)
  .then(testAutoLocksSelectedPathWhenRuntimeIsUnlocked)
  .then(() => {
    console.log("PASS harnesui_workspace_lock_sync_test");
  })
  .catch((error) => {
    console.error("FAIL harnesui_workspace_lock_sync_test");
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
