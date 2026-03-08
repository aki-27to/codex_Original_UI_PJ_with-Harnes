#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const workspaceRoot = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson({ port, path: requestPath, method = "GET", headers = {}, body = null, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? "" : JSON.stringify(body);
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: requestPath,
        method,
        headers: {
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
          ...headers,
        },
      },
      (response) => {
        let raw = "";
        response.on("data", (chunk) => {
          raw += chunk.toString("utf8");
        });
        response.on("end", () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = null;
          }
          resolve({ statusCode: Number(response.statusCode || 0), json, raw });
        });
      }
    );
    request.on("error", reject);
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`request timeout: ${method} ${requestPath}`)));
    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

function runExecViaHttp({ port, headers, body, timeoutMs = 240000 }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/exec",
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(payload),
          ...(headers || {}),
        },
        timeout: timeoutMs,
      },
      (response) => {
        if (Number(response.statusCode || 0) !== 200) {
          let errorBody = "";
          response.on("data", (chunk) => {
            errorBody += chunk.toString("utf8");
          });
          response.on("end", () => {
            reject(new Error(`POST /api/exec failed: HTTP ${response.statusCode} ${errorBody}`));
          });
          return;
        }
        let buffer = "";
        const events = [];
        response.on("data", (chunk) => {
          buffer += chunk.toString("utf8");
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              continue;
            }
            try {
              events.push(JSON.parse(trimmed));
            } catch {
              // Ignore malformed stream rows in proof mode.
            }
          }
        });
        response.on("end", () => {
          const turnStarted = events.find((event) => event && event.type === "turn" && event.phase === "started") || null;
          const turnCompleted = events.find((event) => event && event.type === "turn" && event.phase === "completed") || null;
          resolve({ events, turnStarted, turnCompleted });
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("POST /api/exec timed out")));
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

async function waitForRuntime(port, maxMs = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxMs) {
    try {
      const response = await requestJson({ port, path: "/api/runtime", timeoutMs: 4000 });
      if (response.statusCode === 200 && response.json && response.json.mode === "app-server") {
        return response.json;
      }
    } catch {
      // retry
    }
    await sleep(500);
  }
  throw new Error(`runtime not ready after ${maxMs}ms`);
}

async function stopChild(child) {
  if (!child) {
    return;
  }
  const waitForExit = (timeoutMs) =>
    Promise.race([
      new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve(true);
          return;
        }
        child.once("exit", () => resolve(true));
      }),
      sleep(timeoutMs).then(() => false),
    ]);
  if (child.exitCode === null && child.signalCode === null) {
    try {
      child.kill("SIGTERM");
    } catch {
      // best effort
    }
  }
  let exited = await waitForExit(2000);
  if (!exited && child.exitCode === null && child.signalCode === null) {
    try {
      child.kill("SIGKILL");
    } catch {
      // best effort
    }
    exited = await waitForExit(1500);
  }
  if (!exited && child.pid && process.platform === "win32") {
    try {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch {
      // best effort
    }
    await waitForExit(2000);
  }
}

async function waitForMemoryRecord(harnessMemoryPath, predicate, maxMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxMs) {
    if (fs.existsSync(harnessMemoryPath)) {
      try {
        const raw = fs.readFileSync(harnessMemoryPath, "utf8");
        const parsed = raw ? JSON.parse(raw) : {};
        const executionMemory = Array.isArray(parsed.executionMemory) ? parsed.executionMemory : [];
        const match = executionMemory.find(predicate);
        if (match) {
          return { parsed, executionMemory, match };
        }
      } catch {
        // retry
      }
    }
    await sleep(500);
  }
  throw new Error(`memory record not found in ${harnessMemoryPath}`);
}

function buildProofPaths() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const nonce = crypto.randomBytes(3).toString("hex");
  const proofRoot = path.join(workspaceRoot, "logs", "proofs", `runtime-proof-${stamp}-${nonce}`);
  return {
    proofRoot,
    harnessMemoryPath: path.join(proofRoot, "harness_execution_memory.json"),
    evalHistoryPath: path.join(proofRoot, "eval_runs.jsonl"),
    turnArtifactsDir: path.join(proofRoot, "turns"),
    summaryPath: path.join(proofRoot, "runtime_proof_summary.json"),
  };
}
function summarizeRepoRelative(targetPath) {
  return path.relative(workspaceRoot, path.resolve(targetPath)).replace(/\\/g, "/");
}
function findTurnArtifactManifest(rootDir, turnId) {
  if (!turnId || !fs.existsSync(rootDir)) {
    return null;
  }
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || entry.name !== "manifest.json") {
        continue;
      }
      try {
        const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        if (parsed && parsed.turn && parsed.turn.turnId === turnId) {
          return { path: fullPath, manifest: parsed };
        }
      } catch {
        // continue
      }
    }
  }
  return null;
}

async function run() {
  const paths = buildProofPaths();
  fs.mkdirSync(paths.proofRoot, { recursive: true });
  const liveProofFilePath = path.join(paths.proofRoot, "live_dispatch_proof.md");
  if (!fs.existsSync(liveProofFilePath)) {
    fs.writeFileSync(liveProofFilePath, "# Live Dispatch Proof\n", "utf8");
  }
  const port = 57620 + Math.floor(Math.random() * 200);
  const liveChildProofMarker = `child-proof-run: ${new Date().toISOString()} :: ${crypto.randomBytes(4).toString("hex")}`;
  const liveParentProofMarker = `parent-proof-review: ${new Date().toISOString()} :: ${crypto.randomBytes(4).toString("hex")}`;
  const env = {
    ...process.env,
    CODEX_UI_PORT: String(port),
    CODEX_AUTO_OPEN_BROWSER: "0",
    CODEX_DEFAULT_EXEC_AGENT: "default",
    CODEX_EXECUTION_PROFILE: "proof-runtime",
    CODEX_REQUEST_USER_INPUT_POLICY: "",
    CODEX_PARENT_DISPATCH_GUARD_MODE: "enforce",
    CODEX_PARENT_DISPATCH_GUARD_MAX_RETRIES: "1",
    CODEX_ADVERSARIAL_SHADOW_ENABLED: "0",
    CODEX_ADVERSARIAL_LOOP_ENABLED: "0",
    CODEX_HARNESS_MEMORY_PATH: paths.harnessMemoryPath,
    CODEX_EVAL_HISTORY_PATH: paths.evalHistoryPath,
    CODEX_TURN_ARTIFACTS_DIR: paths.turnArtifactsDir,
  };
  const child = spawn(process.execPath, ["server.js"], {
    cwd: workspaceRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString("utf8")));

  const summary = {
    generatedAt: new Date().toISOString(),
    port,
    proofRoot: paths.proofRoot,
    harnessMemoryPath: paths.harnessMemoryPath,
    evalHistoryPath: paths.evalHistoryPath,
    turnArtifactsDir: paths.turnArtifactsDir,
    runtime: null,
    liveExec: null,
    probePersistence: null,
    memory: null,
  };

  try {
    const runtime = await waitForRuntime(port);
    summary.runtime = {
      nonInteractiveUserInput: runtime.nonInteractiveUserInput,
      parentDispatchGuard: runtime.parentDispatchGuard,
      harnessMemory: runtime.harnessMemory,
      evalHarness: runtime.evalHarness,
      evidenceArtifacts: runtime.evidenceArtifacts,
    };
    assert(runtime.nonInteractiveUserInput && runtime.nonInteractiveUserInput.policy === "blocked", "runtime default request_user_input policy should be blocked");
    assert(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode === "enforce", "runtime parent dispatch guard should default to enforce");
    assert(runtime.parentDispatchGuard && Number(runtime.parentDispatchGuard.maxRetries) === 1, "runtime parent dispatch guard maxRetries should be 1");
    assert(runtime.harnessMemory && runtime.harnessMemory.counts && runtime.harnessMemory.counts.execution === 0, "fresh isolated memory should start empty");
    assert(runtime.harnessMemory.storage === summarizeRepoRelative(paths.harnessMemoryPath), "runtime should point at isolated harness memory path");
    assert(runtime.evalHarness && runtime.evalHarness.historyPath === summarizeRepoRelative(paths.evalHistoryPath), "runtime should point at isolated eval history path");
    assert(
      runtime.evidenceArtifacts &&
        runtime.evidenceArtifacts.root === summarizeRepoRelative(paths.turnArtifactsDir),
      "runtime should point at isolated turn-artifact root"
    );

    const controlApi = runtime.controlApi && typeof runtime.controlApi === "object" ? runtime.controlApi : null;
    const token = controlApi && typeof controlApi.token === "string" ? controlApi.token.trim() : "";
    const tokenHeader = controlApi && typeof controlApi.tokenHeader === "string" ? controlApi.tokenHeader.trim() : "x-codex-control-token";
    assert(token, "runtime control token missing");
    const authHeaders = {
      [tokenHeader]: token,
      Origin: `http://127.0.0.1:${port}`,
      Referer: `http://127.0.0.1:${port}/`,
    };

    const liveExecBody = {
      prompt: [
        "You are the default parent. This run must use native collab dispatch.",
        "Required sequence: spawn infra_worker -> wait -> review -> parent append -> final answer.",
        `Infra worker task: use apply_patch to append exactly one new line '${liveChildProofMarker}' to ${summarizeRepoRelative(liveProofFilePath)}.`,
        `After the child succeeds, the parent must use apply_patch to append exactly one additional line '${liveParentProofMarker}' to the same file.`,
        "Do not use shell commands to edit files. Use apply_patch for both edits. Do not modify any other file. Do not ask follow-up questions.",
        `After the child succeeds, reply with exactly: DISPATCH_OK ${summarizeRepoRelative(liveProofFilePath)}`,
      ].join("\n"),
      agentName: "default",
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      cwd: workspaceRoot,
      executionProfile: "proof-runtime",
      executionIntent: "proof-live-dispatch",
      executionSource: "runtime_proof_script",
      forceNewSession: true,
      idempotencyKey: `runtime-proof-live-${Date.now()}`,
    };
    const liveExecResult = await runExecViaHttp({
      port,
      headers: authHeaders,
      body: liveExecBody,
      timeoutMs: 420000,
    });
    const liveTurn = liveExecResult.turnCompleted || liveExecResult.turnStarted;
    assert(liveTurn && typeof liveTurn.turnId === "string" && liveTurn.turnId, "live exec turn id missing");
    assert(
      liveExecResult.turnCompleted &&
        liveExecResult.turnCompleted.status === "completed" &&
        liveExecResult.turnCompleted.taskOutcomeStatus === "COMPLETED",
      "live default-parent exec should complete successfully"
    );
    const liveMemory = await waitForMemoryRecord(
      paths.harnessMemoryPath,
      (entry) => entry && entry.turnId === liveTurn.turnId,
      45000
    );
    const liveRecord = liveMemory.match;
    assert(liveRecord.parentDispatchGuard && liveRecord.parentDispatchGuard.mode === "enforce", "live exec memory should record parentDispatchGuard.mode=enforce");
    assert(Number(liveRecord.parentDispatchGuard.satisfied) === 1, "live exec memory should mark parent dispatch as satisfied");
    assert(
      liveRecord.observedSignals &&
        Number(liveRecord.observedSignals.dispatchSuccessCount || 0) >= 1,
      "live exec memory should record specialist dispatch success"
    );
    assert(
      liveRecord.observedSignals && Number(liveRecord.observedSignals.fileChanges || 0) > 0,
      "live exec memory should record fileChanges > 0"
    );
    const liveProofFileText = fs.readFileSync(liveProofFilePath, "utf8");
    assert(liveProofFileText.includes(liveChildProofMarker), "live proof file should contain the child marker");
    assert(liveProofFileText.includes(liveParentProofMarker), "live proof file should contain the parent marker");
    const liveArtifactRecord = findTurnArtifactManifest(paths.turnArtifactsDir, liveTurn.turnId);
    assert(liveArtifactRecord, "live run should emit a proof-local turn artifact manifest");
    assert(
      path.resolve(liveArtifactRecord.path).startsWith(path.resolve(paths.turnArtifactsDir)),
      "live turn artifact manifest should land under proof-local turns dir"
    );
    summary.liveExec = {
      turnId: liveTurn.turnId,
      status: liveExecResult.turnCompleted.status,
      taskOutcomeStatus: liveExecResult.turnCompleted.taskOutcomeStatus,
      taskOutcomeReason: liveExecResult.turnCompleted.taskOutcomeReason,
      parentDispatchGuard: liveRecord.parentDispatchGuard,
      observedSignals: liveRecord.observedSignals,
      proofFile: summarizeRepoRelative(liveProofFilePath),
      childProofMarker: liveChildProofMarker,
      parentProofMarker: liveParentProofMarker,
      artifactManifestPath: summarizeRepoRelative(liveArtifactRecord.path),
    };

    const probeSuite = {
      suiteId: "runtime-proof-suite.v1",
      description: "Fresh proof generation suite",
      cases: [
        {
          id: "parent_dispatch_guard_violation",
          title: "Parent dispatch violation persists",
          driver: "parent_dispatch_guard_probe",
          input: {
            mode: "enforce",
            agentName: "default",
            executionProfile: "proof-runtime",
            finalStatus: "completed",
            fileChanges: 1,
            changedFiles: ["server.js"],
            dispatchCount: 0,
            dispatchSuccessCount: 0,
            dispatchFailureCount: 0,
            collabCalls: 0,
          },
          expect: {
            mode: "json_fields",
            fields: {
              violation: 1,
              reason: "dispatch_not_attempted",
            },
          },
        },
        {
          id: "explicit_needs_input",
          title: "Explicit NEEDS_INPUT persists",
          driver: "task_outcome_probe",
          input: {
            turnStatus: "failed",
            approvalReason: "interactive_approval_unavailable",
          },
          expect: {
            mode: "json_fields",
            fields: {
              status: "NEEDS_INPUT",
              reason: "interactive_approval_unavailable",
            },
          },
        },
        {
          id: "explicit_failed_validation",
          title: "Explicit FAILED_VALIDATION persists",
          driver: "task_outcome_probe",
          input: {
            turnStatus: "failed",
            missingEvidence: true,
          },
          expect: {
            mode: "json_fields",
            fields: {
              status: "FAILED_VALIDATION",
              reason: "missing_required_evidence",
            },
          },
        },
      ],
    };
    const evalRun = await requestJson({
      port,
      path: "/api/eval/run",
      method: "POST",
      headers: authHeaders,
      body: {
        persistProbeResultsToMemory: true,
        suite: probeSuite,
        variants: [
          {
            label: "proof",
            agentName: "default",
            executionProfile: "proof-runtime",
            executionIntent: "proof-eval",
            requestUserInputPolicy: "blocked",
            webSearch: 0,
          },
        ],
      },
      timeoutMs: 120000,
    });
    assert(evalRun.statusCode === 200 && evalRun.json && evalRun.json.ok === true, "probe persistence eval run failed");
    const probePersistence = evalRun.json.report && evalRun.json.report.probePersistence;
    assert(probePersistence && probePersistence.requested === 1, "probe persistence should be requested");
    assert(Number(probePersistence.persistedRecords) === 3, "probe persistence should store three synthetic records");

    const finalMemoryRaw = fs.readFileSync(paths.harnessMemoryPath, "utf8");
    const finalMemory = finalMemoryRaw ? JSON.parse(finalMemoryRaw) : {};
    const executionMemory = Array.isArray(finalMemory.executionMemory) ? finalMemory.executionMemory : [];
    const guardRecord = executionMemory.find(
      (entry) =>
        entry &&
        entry.taskOutcomeStatus === "FAILED_VALIDATION" &&
        entry.taskOutcomeReason === "parent_dispatch_guard_block" &&
        entry.parentDispatchGuard &&
        entry.parentDispatchGuard.mode === "enforce"
    );
    const needsInputRecord = executionMemory.find(
      (entry) => entry && entry.taskOutcomeStatus === "NEEDS_INPUT" && entry.taskOutcomeReason === "interactive_approval_unavailable"
    );
    const failedValidationRecord = executionMemory.find(
      (entry) => entry && entry.taskOutcomeStatus === "FAILED_VALIDATION" && entry.taskOutcomeReason === "missing_required_evidence"
    );
    assert(guardRecord, "execution memory should include parent dispatch guard violation record");
    assert(needsInputRecord, "execution memory should include explicit NEEDS_INPUT record");
    assert(failedValidationRecord, "execution memory should include explicit FAILED_VALIDATION record");
    assert(Number(guardRecord.observedSignals && guardRecord.observedSignals.fileChanges) > 0, "guard violation record should preserve fileChanges > 0");
    assert(Number(guardRecord.observedSignals && guardRecord.observedSignals.dispatchCount) === 0, "guard violation record should preserve dispatchCount = 0");

    summary.probePersistence = {
      report: probePersistence,
      guardRecord,
      needsInputRecord,
      failedValidationRecord,
    };
    summary.memory = {
      counts: {
        execution: executionMemory.length,
        replay: Array.isArray(finalMemory.replayMemory) ? finalMemory.replayMemory.length : 0,
        audit: Array.isArray(finalMemory.auditMemory) ? finalMemory.auditMemory.length : 0,
      },
      records: {
        liveTurnId: liveTurn.turnId,
        guardViolationTurnId: guardRecord.turnId,
        needsInputTurnId: needsInputRecord.turnId,
        failedValidationTurnId: failedValidationRecord.turnId,
      },
    };

    fs.writeFileSync(paths.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ok: true, summaryPath: paths.summaryPath, proofRoot: paths.proofRoot }, null, 2));
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.serverLogs = logs.slice(-40);
    try {
      fs.writeFileSync(paths.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    } catch {
      // best effort
    }
    console.log(JSON.stringify({ ok: false, summaryPath: paths.summaryPath, proofRoot: paths.proofRoot, error: summary.error }, null, 2));
    throw error;
  } finally {
    await stopChild(child);
  }
}

run().catch((error) => {
  console.error(`[generate-runtime-proof] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
