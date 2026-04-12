#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
function resolveHarnessAppJsPath() {
  const candidates = [
    path.join(workspaceRoot, "web", "01.HarnesUI", "app.js"),
    path.join(workspaceRoot, "web", "app.js"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`Harness app.js not found. tried=${candidates.join(", ")}`);
  }
  return found;
}
const appJsPath = resolveHarnessAppJsPath();
const {
  wrapperPath: serverEntryPath,
  implementationPath: serverJsPath,
} = resolveServerImplementationPath(workspaceRoot);
const serverModule = require(serverJsPath);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCheck(name, fn) {
  try {
    const detail = fn();
    console.log(`PASS ${name}${detail ? ` :: ${detail}` : ""}`);
    return { name, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${name} :: ${message}`);
    return { name, ok: false, error: message };
  }
}

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertRegex(source, regex, message) {
  assert(regex.test(source), message);
}

function isEnvironmentRestrictionError(message) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("spawn eperm") ||
    text.includes("spawn eacces") ||
    text.includes("operation not permitted") ||
    text.includes("permission denied") ||
    text.includes("not supported in workers") ||
    text.includes("err_worker_unsupported_operation")
  );
}

function pickTestPort() {
  const base = 58100;
  const span = 700;
  return base + Math.floor(Math.random() * span);
}

function httpGetJson(port, pathName) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathName,
        method: "GET",
        timeout: 2000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString("utf8");
        });
        res.on("end", () => {
          let parsed;
          try {
            parsed = body ? JSON.parse(body) : {};
          } catch (error) {
            reject(new Error(`Invalid JSON from ${pathName}: ${error.message}`));
            return;
          }
          resolve({ statusCode: res.statusCode || 0, body: parsed });
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error(`Timeout waiting for ${pathName}`));
    });
    req.end();
  });
}

async function waitForServerReady(port, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await httpGetJson(port, "/api/runtime");
      if (response.statusCode === 200) {
        return response.body;
      }
      lastError = new Error(`GET /api/runtime returned ${response.statusCode}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(
    `Server did not become ready on port ${port}: ${
      lastError && lastError.message ? lastError.message : "unknown error"
    }`
  );
}

async function stopServer(child) {
  if (!child) {
    return;
  }
  try {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
    await Promise.race([
      new Promise((resolve) => child.once("exit", () => resolve())),
      sleep(2500),
    ]);
  } catch {
    // ignore
  }
}

async function runIntegrationCheck() {
  const port = pickTestPort();
  let childError = null;
  let childExit = null;
  const child = spawn(process.execPath, [serverEntryPath], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      CODEX_UI_PORT: String(port),
      CODEX_AUTO_OPEN_BROWSER: "0",
      CODEX_PAUSE_ON_EXIT: "0",
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  child.on("error", (error) => {
    childError = error;
  });
  child.on("exit", (code) => {
    childExit = code;
  });

  try {
    await waitForServerReady(port, 20000);
    const topographyRes = await httpGetJson(port, "/api/agent-topography");
    assert.strictEqual(
      topographyRes.statusCode,
      200,
      `Expected GET /api/agent-topography to return 200, got ${topographyRes.statusCode}`
    );
    assert(
      topographyRes.body && Array.isArray(topographyRes.body.agents),
      "Expected response body to include an agents array"
    );
    return `port=${port}, agents=${topographyRes.body.agents.length}`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const childDetail = childError
      ? `child error: ${childError.message}`
      : childExit !== null
        ? `child exit code: ${childExit}`
        : "";
    throw new Error(childDetail ? `${detail} | ${childDetail}` : detail);
  } finally {
    await stopServer(child);
  }
}

async function main() {
  const appJsSource = readFile(appJsPath);
  const serverJsSource = readFile(serverJsPath);
  const checks = [];

  checks.push(
    runCheck("topography no longer keeps floating-panel collapse state", () => {
      assert.ok(
        !/TOPOGRAPHY_COLLAPSED_KEY|loadTopographyUiState|saveTopographyUiState|setTopographyCollapsed|agentTopographyToggleBtn/.test(appJsSource),
        "floating-panel collapse state should be removed from app.js"
      );
    })
  );

  checks.push(
    runCheck("topography refresh interval constant is 10000ms", () => {
      assertRegex(
        appJsSource,
        /const\s+TOPOGRAPHY_REFRESH_MS\s*=\s*10000\s*;/,
        "TOPOGRAPHY_REFRESH_MS=10000 not found"
      );
    })
  );

  checks.push(
    runCheck("startAgentTopographyTicker wires setInterval with TOPOGRAPHY_REFRESH_MS", () => {
      assertRegex(
        appJsSource,
        /function\s+startAgentTopographyTicker\s*\(\)\s*\{[\s\S]*?stopAgentTopographyTicker\(\);[\s\S]*?setInterval\(\(\)\s*=>\s*\{loadAgentTopography\(\)\.catch\(\(\)\s*=>\s*\{\}\);\},\s*TOPOGRAPHY_REFRESH_MS\);[\s\S]*?\}/,
        "Ticker wiring with TOPOGRAPHY_REFRESH_MS not found"
      );
    })
  );

  checks.push(
    runCheck("boot sequence starts topography ticker after initial manual load", () => {
      assertRegex(
        appJsSource,
        /await\s+loadAgentTopography\(\{manual:true\}\)\.catch\(\(\)\s*=>\s*\{\}\);\s*startAgentTopographyTicker\(\);/,
        "boot() does not start topography ticker after initial load"
      );
    })
  );

  checks.push(
    runCheck("loadAgentTopography falls back to /api/runtime on primary fetch failure", () => {
      assertRegex(
        appJsSource,
        /catch\(topographyError\)\s*\{[\s\S]*?fetch\(\"\/api\/runtime\",[\s\S]*?applyState\(\{agents:runtimeAgentsForMonitor\(runtimePayload\),source:\"\/api\/runtime\",error:\"\",usingFallback:true\}\);/,
        "fallback fetch/applyState flow using /api/runtime not found"
      );
    })
  );

  checks.push(
    runCheck("renderAgentTopography groups rows into kanban lanes", () => {
      assertRegex(
        appJsSource,
        /const\s+lanes=groupTopographyRowsForUi\(rows\);[\s\S]*?laneSection\.className=`agent-topography-lane agent-topography-lane-\$\{lane\.id\}`;[\s\S]*?laneTitle\.textContent=lane\.label;/,
        "renderAgentTopography does not render topography rows as kanban lanes"
      );
    })
  );

  checks.push(
    runCheck("topography rows do not foreground planned task signals", () => {
      assert.ok(
        !/buildTopographyTaskSignalsForUi|topographyTaskSignalsForRow|このターン担当|agent-topography-signal/.test(appJsSource),
        "planned task-signal overlay logic should not remain in app.js"
      );
    })
  );

  checks.push(
    runCheck("active chat topography context derives match names from current chat traces and harness events", () => {
      assertRegex(
        appJsSource,
        /function\s+activeChatTopographyContextForUi\s*\(rows\)\s*\{[\s\S]*?activeChatTraceRowsForUi\(currentChatId\)[\s\S]*?activeChatPendingRowsForUi\(currentChatId\)[\s\S]*?addMonitorAgentMatchNamesFromTextForUi\(matchNames,item&&item\.detail\)[\s\S]*?addMonitorAgentMatchNamesFromTextForUi\(matchNames,entry&&entry\.d\)/,
        "active chat topography context does not derive agent names from current chat trace/harness details"
      );
    })
  );

  checks.push(
    runCheck("syncedTopographyRows suppresses generic parent rows when a scoped chat variant is present", () => {
      assertRegex(
        appJsSource,
        /const\s+canonicalParentsWithScopedVariants=new Set\(\);[\s\S]*?if\(scope&&canonical&&canonical!==normalized&&PARENT_AGENT_NAMES\.has\(canonical\)\)\{[\s\S]*?if\(canonicalParentsWithScopedVariants\.has\(normalizedName\)\)return;/,
        "generic parent row suppression for scoped chat variants not found"
      );
    })
  );

  checks.push(
    runCheck("server collab item detail includes child agent hints for monitor filtering", () => {
      assertRegex(
        serverJsSource,
        /if\(isCollabToolItemType\(type\)\)\{[\s\S]*?const\s+hintedChild=safeString\(context&&context\.childName,120\);[\s\S]*?detailParts\.push\(`child=\$\{childName\}`\);/,
        "server collab item detail does not include child=... hints"
      );
    })
  );

  checks.push(
    runCheck("execution trace flow merges topography rows into lifecycle lanes", () => {
      assertRegex(
        appJsSource,
        /const\s+topographyRows=syncedTopographyRows\(topographyState\.agents\);[\s\S]*?const\s+topographyByName=new Map\(\);[\s\S]*?const\s+tone=executionTraceBucketForUi\(\{row:monitorRow,pendingCount,lastTrace\}\);/,
        "flow() does not merge synced topography rows into the execution-trace lane state"
      );
      assertRegex(
        appJsSource,
        /function\s+synthesizeTraceRowsForUi\s*\([\s\S]*?const\s+traceRowsForList=synthesizeTraceRowsForUi\(traceRows,topographyRows,/,
        "execution trace list does not synthesize child lifecycle rows from topography data"
      );
    })
  );

  checks.push(
    runCheck("live collab child rows retain terminal outcomes after wait completes", () => {
      const topographyApi = serverModule && serverModule.__topography;
      assert(topographyApi && typeof topographyApi.createLiveCollabTurnTracker === "function", "__topography helpers unavailable");
      topographyApi.clearLiveCollabChildState();
      const tracker = topographyApi.createLiveCollabTurnTracker({
        parentAgentName: "default",
        parentThreadId: "thread-parent-1",
        parentTurnId: "turn-parent-1",
        planningContext: {
          dispatchPlan: {
            dispatches: [{ ownerAgent: "backend_worker" }],
          },
        },
      });

      topographyApi.observeLiveCollabItem({
        phase: "completed",
        tracker,
        item: {
          type: "collabAgentToolCall",
          id: "spawn-1",
          tool: "spawnAgent",
          status: "completed",
          receiverThreadIds: ["child-thread-1"],
        },
      });
      const runningRows = topographyApi.getAgentTopographySnapshot();
      const spawnedRow = runningRows.find((row) => row && row.name === "backend_worker");
      assert(spawnedRow, "spawned backend_worker row not found in topography snapshot");
      assert.strictEqual(spawnedRow.threadId, "child-thread-1", "spawned backend_worker should expose child thread id");
      assert.strictEqual(spawnedRow.activeTurnId, "turn-parent-1", "spawned backend_worker should stay tied to the parent turn while active");
      assert(
        /spawned|working|running/i.test(String(spawnedRow.status || "")),
        `spawned backend_worker should look active, got status=${spawnedRow.status || "(empty)"}`
      );

      topographyApi.observeLiveCollabItem({
        phase: "started",
        tracker,
        item: {
          type: "collabAgentToolCall",
          id: "wait-1",
          tool: "wait",
          status: "inProgress",
          receiverThreadIds: ["child-thread-1"],
        },
      });
      topographyApi.observeLiveCollabItem({
        phase: "completed",
        tracker,
        item: {
          type: "collabAgentToolCall",
          id: "wait-1",
          tool: "wait",
          status: "completed",
          receiverThreadIds: [],
        },
      });
      const settledRows = topographyApi.getAgentTopographySnapshot();
      const settledBackendRow = settledRows.find((row) => row && row.name === "backend_worker");
      assert(settledBackendRow, "backend_worker row should remain after wait completes");
      assert(
        !settledBackendRow.activeTurnId,
        `backend_worker should leave live mode after wait completes, got activeTurnId=${settledBackendRow.activeTurnId}`
      );
      assert.strictEqual(
        settledBackendRow.threadId,
        "child-thread-1",
        "backend_worker should retain the child thread id as terminal evidence after wait completes"
      );
      assert.strictEqual(
        String(settledBackendRow.status || "").toLowerCase(),
        "completed",
        `backend_worker should remain visible as completed, got status=${settledBackendRow.status || "(empty)"}`
      );

      topographyApi.clearLiveCollabChildState();
      const failedTracker = topographyApi.createLiveCollabTurnTracker({
        parentAgentName: "default",
        parentThreadId: "thread-parent-2",
        parentTurnId: "turn-parent-2",
        planningContext: {
          dispatchPlan: {
            dispatches: [{ ownerAgent: "reviewer" }],
          },
        },
      });
      topographyApi.observeLiveCollabItem({
        phase: "completed",
        tracker: failedTracker,
        item: {
          type: "collabAgentToolCall",
          id: "spawn-review-1",
          tool: "spawnAgent",
          status: "completed",
          receiverThreadIds: ["review-thread-1"],
        },
      });
      topographyApi.observeLiveCollabItem({
        phase: "started",
        tracker: failedTracker,
        item: {
          type: "collabAgentToolCall",
          id: "wait-review-1",
          tool: "wait",
          status: "inProgress",
          receiverThreadIds: ["review-thread-1"],
        },
      });
      topographyApi.observeLiveCollabItem({
        phase: "completed",
        tracker: failedTracker,
        item: {
          type: "collabAgentToolCall",
          id: "wait-review-1",
          tool: "wait",
          status: "completed",
          receiverThreadIds: [],
          agentsStates: {
            "review-thread-1": {
              status: "failed",
              message: "FAIL: review found blocking issues",
            },
          },
        },
      });
      const failedRows = topographyApi.getAgentTopographySnapshot();
      const reviewerRow = failedRows.find((row) => row && row.name === "reviewer");
      assert(reviewerRow, "reviewer row should remain visible after a failed wait outcome");
      assert(
        !reviewerRow.activeTurnId,
        `reviewer should leave live mode after a failed wait outcome, got activeTurnId=${reviewerRow.activeTurnId}`
      );
      assert.strictEqual(
        reviewerRow.threadId,
        "review-thread-1",
        "reviewer should retain the child thread id when surfacing a failed terminal outcome"
      );
      assert.strictEqual(
        String(reviewerRow.status || "").toLowerCase(),
        "failed",
        `reviewer should expose the failed wait outcome, got status=${reviewerRow.status || "(empty)"}`
      );

      topographyApi.clearLiveCollabChildState();
    })
  );

  const integrationResult = await (async () => {
    try {
      const detail = await runIntegrationCheck();
      console.log(`PASS integration server endpoint check :: ${detail}`);
      return { name: "integration server endpoint check", ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isEnvironmentRestrictionError(message)) {
        const routeRegex =
          /if\(req\.method==="GET"&&pathname==="\/api\/agent-topography"\)\{\s*sendJson\(res,200,\{agents:getAgentTopographySnapshot\(\)\}\);\s*return;\s*\}/;
        assertRegex(
          serverJsSource,
          routeRegex,
          "server.js does not expose /api/agent-topography with {agents: getAgentTopographySnapshot()}"
        );
        console.log(
          `PASS integration server endpoint check :: skipped runtime boot due restricted environment (${message}); server route wiring verified`
        );
        return { name: "integration server endpoint check", ok: true, skipped: true };
      }
      console.error(`FAIL integration server endpoint check :: ${message}`);
      return { name: "integration server endpoint check", ok: false, error: message };
    }
  })();

  checks.push(integrationResult);

  const failed = checks.filter((result) => !result.ok);
  console.log(`SUMMARY total=${checks.length} pass=${checks.length - failed.length} fail=${failed.length}`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`FAIL test runner crashed :: ${message}`);
  process.exitCode = 1;
});
