#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { createRuntimeStateService } = require("../server/services/runtime_state_service");

function run() {
  const deps = {
    listAgentsSnapshot() {
      return [
        {
          name: "default@chat-chat-1",
          threadId: "thread-1",
          sessionRef: "thread-1",
          activeTurnId: "turn-1",
        },
        {
          name: "default@chat-chat-2",
          threadId: "thread-2",
          sessionRef: "thread-2",
          activeTurnId: "turn-2",
        },
      ];
    },
    getLatestTurnSnapshot() {
      return {
        agent_name: "default@chat-chat-1",
        thread_id: "thread-1",
        turn_id: "turn-1",
        status: "needs_input",
        started_at: 100,
        completed_at: 150,
      };
    },
    getActiveExecRequestCount() {
      return 1;
    },
  };

  const service = createRuntimeStateService(deps);
  const snapshot = service.buildTurnRuntimeSnapshot();

  assert.strictEqual(snapshot.latestTurn.status, "needs_input", "latest turn status should preserve needs_input");
  assert.deepStrictEqual(
    snapshot.activeTurns,
    [
      {
        agentName: "default@chat-chat-2",
        threadId: "thread-2",
        sessionRef: "thread-2",
        turnId: "turn-2",
      },
    ],
    "terminal latest turns must not remain in activeTurns"
  );

  console.log("[runtime-state-service-test] PASS");
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[runtime-state-service-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
