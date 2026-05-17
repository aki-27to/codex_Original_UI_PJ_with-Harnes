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

function loadHelpers() {
  const context = {
    Array,
    Date: { now: () => 1700000020000 },
    JSON,
    Math,
    Number,
    Object,
    RUNTIME_PENDING_ORPHAN_GRACE_MS: 13500,
    String,
    runtimePendingSyncState: { lastLoadedAt: 0 },
    s: { chats: [], runtime: null, req: new Map() },
    hset(chatRecord, status) {
      if (chatRecord && chatRecord.h && typeof chatRecord.h === "object") chatRecord.h.status = status;
    },
    lowerText(value) {
      return String(value || "").toLowerCase();
    },
    normalizeAgentNameForUi(name) {
      return typeof name === "string" ? name.trim().toLowerCase() : "";
    },
    toPerfInt(value) {
      return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
    },
  };
  vm.runInNewContext(
    [
      "const chat=id=>s.chats.find(c=>c.id===id)||null;",
      extractFunction("localPendingCountForChat"),
      extractFunction("pendingRequestHasLiveControllerForUi"),
      extractFunction("liveLocalPendingCountForChat"),
      extractFunction("runtimeAgentsFromPayload"),
      extractFunction("runtimeTurnRuntimeSnapshotForUi"),
      extractFunction("runtimePendingAuthorityPresentForUi"),
      extractFunction("latestRuntimeTurn"),
      extractFunction("runtimeTurnStatusForUi"),
      extractFunction("runtimeTurnThreadIdForUi"),
      extractFunction("runtimeTurnIdForUi"),
      extractFunction("runtimeTurnAgentForUi"),
      extractFunction("runtimeTurnCompletedAtForUi"),
      extractFunction("runtimeTurnStartedAtForUi"),
      extractFunction("runtimeTurnIsTerminalForUi"),
      extractFunction("storedTurnSnapshotForUi"),
      extractFunction("storedChatTurnIdForUi"),
      extractFunction("storedChatThreadIdForUi"),
      extractFunction("chatCanAdoptUnboundLatestTurnForUi"),
      extractFunction("runtimeTurnMatchesChat"),
      extractFunction("latestRuntimeTurnForChat"),
      extractFunction("runtimeActiveExecRequestCountForUi"),
      extractFunction("runtimeActiveTurnsFromPayload"),
      extractFunction("runtimeHasAnyActiveTurnForUi"),
      extractFunction("runtimeGloballyIdleForPendingSync"),
      extractFunction("runtimeAgentMatchesChatForUi"),
      extractFunction("chatNeedsInputHoldForUi"),
      extractFunction("pendingProjectionBlocksSendForUi"),
      extractFunction("runtimePendingCountForChat"),
      extractFunction("runtimeAgentHasActiveTurn"),
      extractFunction("collectStalePendingRequestIds"),
      extractFunction("pendingCountForChat"),
      extractFunction("pendingProjectionForChatForUi"),
      extractFunction("pendingProjectionLabelForUi"),
      extractFunction("pendingProjectionDetailForUi"),
      "this.helpers={ runtimePendingCountForChat, pendingCountForChat, pendingProjectionForChatForUi, pendingProjectionBlocksSendForUi, pendingProjectionLabelForUi, pendingProjectionDetailForUi, runtimeTurnIsTerminalForUi, latestRuntimeTurnForChat, collectStalePendingRequestIds };",
    ].join("\n\n"),
    context
  );
  return { context, ...context.helpers };
}

function run() {
  const { context, runtimePendingCountForChat, pendingCountForChat, pendingProjectionForChatForUi, pendingProjectionBlocksSendForUi, pendingProjectionLabelForUi, pendingProjectionDetailForUi, latestRuntimeTurnForChat, collectStalePendingRequestIds } = loadHelpers();

  const chatRecord = {
    id: "chat-1",
    agent: "Codex",
    forceNewSession: false,
    messages: [{ id: "m1", role: "user", content: "hello" }],
    h: {
      thread: "thread-chat-1",
      turn: "turn-chat-1",
      turnSnapshot: null,
    },
  };
  context.s.chats = [chatRecord];

  context.s.runtime = {
    agents: [
      {
        name: "Codex",
        threadId: "thread-other",
        sessionRef: "thread-other",
        activeTurnId: "turn-other",
      },
    ],
    latestTurn: {
      agent_name: "Codex",
      thread_id: "thread-chat-1",
      turn_id: "turn-chat-1",
      terminal_status: "completed",
      completed_at: 1700000001000,
      started_at: 1700000000000,
    },
  };
  assert.strictEqual(
    runtimePendingCountForChat(chatRecord, context.s.runtime),
    0,
    "different-thread runtime activity must not keep this chat pending"
  );
  assert.strictEqual(
    pendingCountForChat(chatRecord.id),
    0,
    "send button gating must not stay locked by unrelated runtime turns"
  );

  context.s.runtime = {
    agents: [
      {
        name: "Codex",
        threadId: "thread-chat-1",
        sessionRef: "thread-chat-1",
        activeTurnId: "turn-chat-1",
      },
    ],
    latestTurn: {
      agent_name: "Codex",
      thread_id: "thread-chat-1",
      turn_id: "turn-chat-1",
      terminal_status: "running",
      started_at: 1700000002000,
    },
  };
  assert.strictEqual(
    runtimePendingCountForChat(chatRecord, context.s.runtime),
    1,
    "matching thread runtime activity must still keep the chat pending"
  );
  assert.strictEqual(
    latestRuntimeTurnForChat(chatRecord, context.s.runtime).turn_id,
    "turn-chat-1",
    "matching runtime turns should still bind to the chat"
  );

  context.s.runtime = {
    agents: [
      {
        name: "Codex",
        threadId: "thread-stale-ignored",
        sessionRef: "thread-stale-ignored",
        activeTurnId: "turn-stale-ignored",
      },
    ],
    activeExecRequests: 7,
    latestTurn: {
      agent_name: "Codex",
      thread_id: "thread-stale-ignored",
      turn_id: "turn-stale-ignored",
      terminal_status: "completed",
      completed_at: 1700000003500,
    },
    turnRuntime: {
      sourceOfTruth: "server_runtime",
      activeExecRequests: 1,
      activeTurns: [
        {
          agentName: "Codex",
          threadId: "thread-chat-1",
          sessionRef: "thread-chat-1",
          turnId: "turn-chat-1",
        },
      ],
      latestTurn: {
        agentName: "Codex",
        threadId: "thread-chat-1",
        turnId: "turn-chat-1",
        status: "running",
        startedAt: 1700000002500,
      },
      terminalLatestTurn: null,
    },
  };
  assert.strictEqual(
    runtimePendingCountForChat(chatRecord, context.s.runtime),
    1,
    "server turnRuntime must override stale top-level runtime fields for pending truth"
  );
  assert.strictEqual(
    latestRuntimeTurnForChat(chatRecord, context.s.runtime).turnId,
    "turn-chat-1",
    "chat binding must prefer the authoritative server turnRuntime snapshot"
  );

  context.s.runtime = {
    agents: [],
    latestTurn: {
      agent_name: "Codex",
      thread_id: "thread-chat-1",
      turn_id: "turn-chat-1",
      terminal_status: "running",
      started_at: 1700000002500,
    },
    turnRuntime: {
      sourceOfTruth: "server_runtime",
      activeExecRequests: 0,
      activeTurns: [],
      latestTurn: {
        agentName: "Codex",
        threadId: "thread-chat-1",
        turnId: "turn-chat-1",
        status: "running",
        startedAt: 1700000002500,
      },
      terminalLatestTurn: {
        agentName: "Codex",
        threadId: "thread-chat-1",
        turnId: "turn-chat-1",
        status: "failed",
        completedAt: 1700000004000,
      },
    },
  };
  assert.strictEqual(
    runtimePendingCountForChat(chatRecord, context.s.runtime),
    0,
    "authoritative idle server runtime must not let a stale latestTurn=running keep send blocked"
  );
  assert.strictEqual(
    pendingProjectionBlocksSendForUi(pendingProjectionForChatForUi(chatRecord, context.s.runtime)),
    false,
    "stale latestTurn=running must not disable send when activeExecRequests and activeTurns are empty"
  );

  chatRecord.h.status = "needs_input";
  chatRecord.h.events = [];
  chatRecord.h.flow = [];
  context.s.runtime = {
    agents: [
      {
        name: "Codex",
        threadId: "thread-chat-1",
        sessionRef: "thread-chat-1",
        activeTurnId: "turn-chat-1",
      },
    ],
    latestTurn: null,
  };
  assert.strictEqual(
    runtimePendingCountForChat(chatRecord, context.s.runtime),
    0,
    "needs_input chats must not stay pending just because a stale runtime activeTurn remains"
  );
  const needsInputProjection = pendingProjectionForChatForUi(chatRecord, context.s.runtime);
  assert.strictEqual(needsInputProjection.source, "needs_input", "needs_input chats should project an explicit input-wait state");
  assert.strictEqual(needsInputProjection.count, 0, "needs_input chats should stop contributing to pending counts");
  assert.strictEqual(
    pendingProjectionBlocksSendForUi(needsInputProjection),
    false,
    "needs_input chats must keep the send button enabled so the user can answer"
  );
  assert.strictEqual(
    pendingProjectionLabelForUi(needsInputProjection, { scope: "pill" }),
    "返信で続行",
    "needs_input chats should present a reply-to-continue label instead of a failure headline"
  );
  assert.match(
    pendingProjectionDetailForUi(needsInputProjection),
    /失敗ではありません.*続きから再開できます/,
    "needs_input detail should explain that the turn is waiting for user input, not failed"
  );

  chatRecord.h.status = "running";
  chatRecord.h.events = [{ l: "planning_needs_input", d: "user decision required" }];
  chatRecord.h.flow = [{ id: "requirements", state: "blocked" }];
  const blockedProjection = pendingProjectionForChatForUi(chatRecord, context.s.runtime);
  assert.strictEqual(
    blockedProjection.source,
    "needs_input",
    "requirement-blocked chats should surface as needs_input even when runtime authority is stale"
  );
  chatRecord.h.status = "needs_input";
  chatRecord.h.events = [{ l: "turn/needs_input", d: "workspace lock required" }];
  chatRecord.h.flow = [{ id: "requirements", state: "blocked" }];
  chatRecord.h.turnSnapshot = {
    agent_name: "Codex",
    thread_id: "thread-chat-1",
    turn_id: "turn-chat-2",
    terminal_status: "completed",
    completed_at: 1700000021000,
    started_at: 1700000020000,
  };
  context.s.runtime = {
    agents: [],
    latestTurn: {
      agent_name: "Codex",
      thread_id: "thread-chat-1",
      turn_id: "turn-chat-2",
      terminal_status: "completed",
      completed_at: 1700000021000,
      started_at: 1700000020000,
    },
  };
  const clearedProjection = pendingProjectionForChatForUi(chatRecord, context.s.runtime);
  assert.notStrictEqual(
    clearedProjection.source,
    "needs_input",
    "a later completed turn must clear stale needs_input holds"
  );
  assert.strictEqual(
    chatRecord.h.status,
    "completed",
    "stale needs_input chat status should normalize to completed when a later terminal turn resolves the chat"
  );
  chatRecord.h.events = [];
  chatRecord.h.flow = [];
  chatRecord.h.turnSnapshot = null;

  const freshChat = {
    id: "chat-2",
    agent: "Codex",
    forceNewSession: true,
    messages: [],
    h: { thread: "", turn: "", turnSnapshot: null },
  };
  context.s.chats = [freshChat];
  context.s.runtime = {
    agents: [
      {
        name: "Codex",
        threadId: "",
        sessionRef: "",
        activeTurnId: "turn-fresh",
      },
    ],
    latestTurn: {
      agent_name: "Codex",
      thread_id: "",
      turn_id: "turn-fresh",
      terminal_status: "running",
      started_at: 1700000003000,
    },
  };
  assert.strictEqual(
    runtimePendingCountForChat(freshChat, context.s.runtime),
    0,
    "fresh chats without local pending must not adopt unrelated active turns"
  );

  context.s.req.set("req-1", {
    cid: freshChat.id,
    agent: "Codex",
    at: 1700000003500,
  });
  assert.strictEqual(
    runtimePendingCountForChat(freshChat, context.s.runtime),
    1,
    "local pending requests must still bridge the gap before thread binding arrives"
  );

  const staleChat = {
    id: "chat-3",
    agent: "Codex",
    forceNewSession: false,
    messages: [{ id: "m1", role: "user", content: "stale" }],
    h: { thread: "thread-stale", turn: "", turnSnapshot: null, status: "running" },
  };
  context.s.chats = [staleChat];
  context.s.req = new Map([
    [
      "req-stale",
      {
        cid: staleChat.id,
        agent: "Codex",
        at: 1700000000000,
      },
    ],
  ]);
  context.s.runtime = {
    agents: [
      {
        name: "Codex",
        threadId: "thread-stale-top-level",
        sessionRef: "thread-stale-top-level",
        activeTurnId: "turn-stale-top-level",
      },
    ],
    activeExecRequests: 0,
    latestTurn: null,
    turnRuntime: {
      sourceOfTruth: "server_runtime",
      activeExecRequests: 0,
      activeTurns: [],
      latestTurn: null,
      terminalLatestTurn: null,
    },
  };
  assert.deepStrictEqual(
    Array.from(collectStalePendingRequestIds(context.s.runtime)),
    ["req-stale"],
    "runtime idle state should reclaim orphaned local pending rows after the recovery grace window"
  );
  assert.strictEqual(
    staleChat.h.status,
    "interrupted",
    "orphaned local pending rows should move the chat out of running state"
  );

  const freshPendingChat = {
    id: "chat-4",
    agent: "Codex",
    forceNewSession: false,
    messages: [{ id: "m1", role: "user", content: "fresh" }],
    h: { thread: "thread-fresh", turn: "", turnSnapshot: null, status: "running" },
  };
  context.s.chats = [freshPendingChat];
  context.s.req = new Map([
    [
      "req-fresh",
      {
        cid: freshPendingChat.id,
        agent: "Codex",
        at: 1700000015000,
        controller: { signal: { aborted: false } },
      },
    ],
  ]);
  context.s.runtime = {
    agents: [],
    activeExecRequests: 0,
    latestTurn: null,
  };
  assert.deepStrictEqual(
    Array.from(collectStalePendingRequestIds(context.s.runtime)),
    [],
    "recent local pending rows should survive until the recovery grace window expires"
  );
  assert.strictEqual(
    pendingProjectionForChatForUi(freshPendingChat, context.s.runtime).count,
    1,
    "live local pending rows must keep the chat pending while the active turn remains unresolved"
  );
  assert.strictEqual(
    pendingProjectionBlocksSendForUi(pendingProjectionForChatForUi(freshPendingChat, context.s.runtime)),
    true,
    "live local pending rows must keep send blocked until the client stream settles"
  );

  const controllerBoundChat = {
    id: "chat-4b",
    agent: "Codex",
    forceNewSession: false,
    messages: [{ id: "m1", role: "user", content: "stream still open" }],
    h: {
      thread: "thread-controller-bound",
      turn: "",
      turnSnapshot: null,
      status: "running",
      events: [{ l: "planning_needs_input", d: "stale requirement carryover" }],
    },
  };
  context.s.chats = [controllerBoundChat];
  context.s.req = new Map([
    [
      "req-controller-bound",
      {
        cid: controllerBoundChat.id,
        agent: "Codex",
        at: 1700000000000,
        controller: { signal: { aborted: false } },
      },
    ],
  ]);
  context.runtimePendingSyncState.lastLoadedAt = 1700000019000;
  context.s.runtime = {
    agents: [],
    activeExecRequests: 0,
    latestTurn: null,
    turnRuntime: {
      sourceOfTruth: "server_runtime",
      activeExecRequests: 0,
      activeTurns: [],
      latestTurn: null,
      terminalLatestTurn: null,
    },
  };
  assert.deepStrictEqual(
    Array.from(collectStalePendingRequestIds(context.s.runtime)),
    [],
    "live controller rows must not be reclaimed just because runtime briefly reports idle"
  );
  const controllerBoundProjection = pendingProjectionForChatForUi(controllerBoundChat, context.s.runtime);
  assert.strictEqual(
    controllerBoundProjection.source,
    "local",
    "live controller rows must keep the chat in a local-running state instead of falling through to needs_input"
  );
  assert.strictEqual(
    controllerBoundProjection.count,
    1,
    "live controller rows must continue contributing to pending counts while the stream is open"
  );
  assert.strictEqual(
    pendingProjectionBlocksSendForUi(controllerBoundProjection),
    true,
    "live controller rows must keep send blocked even if runtime authority temporarily goes idle"
  );

  const needsInputCleanupChat = {
    id: "chat-5",
    agent: "Codex",
    forceNewSession: false,
    messages: [{ id: "m1", role: "user", content: "clarify" }],
    h: { thread: "thread-needs", turn: "", turnSnapshot: null, status: "running" },
  };
  context.s.chats = [needsInputCleanupChat];
  context.s.req = new Map([
    [
      "req-needs",
      {
        cid: needsInputCleanupChat.id,
        agent: "Codex",
        at: 1700000000000,
      },
    ],
  ]);
  context.s.runtime = {
    agents: [
      {
        name: "Codex",
        threadId: "thread-needs",
        sessionRef: "thread-needs",
        activeTurnId: "turn-needs",
      },
    ],
    latestTurn: {
      agent_name: "Codex",
      thread_id: "thread-needs",
      turn_id: "turn-needs",
      terminal_status: "needs_input",
      completed_at: 1700000019000,
    },
  };
  assert.deepStrictEqual(
    Array.from(collectStalePendingRequestIds(context.s.runtime)),
    ["req-needs"],
    "needs_input terminal turns must clear stale local pending rows so send can reopen"
  );
  assert.strictEqual(
    needsInputCleanupChat.h.status,
    "needs_input",
    "needs_input cleanup should move the chat to needs_input instead of leaving it running"
  );

  console.log("[harnesui-pending-state-test] PASS");
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[harnesui-pending-state-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
