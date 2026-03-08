"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const workspaceRoot = path.resolve(__dirname, "..");

function requestJson({ port, path, method = "GET", headers = {}, body = null, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
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
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk.toString("utf8");
        });
        res.on("end", () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = null;
          }
          resolve({ statusCode: Number(res.statusCode || 0), json, raw });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("request timeout")));
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitRuntime(port, maxMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxMs) {
    try {
      const res = await requestJson({ port, path: "/api/runtime", timeoutMs: 4000 });
      if (res.statusCode === 200 && res.json && res.json.mode === "app-server") {
        return res.json;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("runtime not ready");
}

async function waitForReplayTurns({ port, headers, minCount = 1, maxMs = 20000 }) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxMs) {
    const res = await requestJson({ port, path: "/api/replay/turns", headers, timeoutMs: 8000 });
    if (res.statusCode === 200 && res.json && res.json.ok === true && Array.isArray(res.json.turns) && res.json.turns.length >= minCount) {
      return res;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("replay turns should capture at least one executable turn");
}

async function run() {
  const port = 57560;
  const proofRoot = path.join(workspaceRoot, "logs", "test-proofs", `eval-replay-api-smoke-${Date.now()}`);
  const harnessMemoryPath = path.join(proofRoot, "harness_execution_memory.json");
  const evalHistoryPath = path.join(proofRoot, "eval_runs.jsonl");
  const turnArtifactsDir = path.join(proofRoot, "turns");
  fs.mkdirSync(proofRoot, { recursive: true });
  const env = {
    ...process.env,
    CODEX_UI_PORT: String(port),
    CODEX_AUTO_OPEN_BROWSER: "0",
    CODEX_DEFAULT_EXEC_AGENT: "default",
    CODEX_REQUEST_USER_INPUT_POLICY: "",
    CODEX_HARNESS_MEMORY_PATH: harnessMemoryPath,
    CODEX_EVAL_HISTORY_PATH: evalHistoryPath,
    CODEX_TURN_ARTIFACTS_DIR: turnArtifactsDir,
  };
  const child = spawn(process.execPath, ["server.js"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString("utf8")));

  try {
    const runtime = await waitRuntime(port);
    assert(runtime.evalHarness && runtime.evalHarness.suite, "runtime should expose evalHarness suite");
    assert(runtime.slo && runtime.slo.status, "runtime should expose slo status");
    assert(runtime.harnessMemory && runtime.harnessMemory.counts, "runtime should expose harnessMemory counts");
    assert(runtime.nonInteractiveUserInput && runtime.nonInteractiveUserInput.policy === "blocked", "runtime should default nonInteractive user input to blocked");
    assert(
      runtime.harnessMemory.storage === path.relative(workspaceRoot, harnessMemoryPath).replace(/\\/g, "/"),
      `runtime should expose isolated harness memory path (${runtime.harnessMemory.storage || "missing"})`
    );
    assert(runtime.harnessMemory.envKey === "CODEX_HARNESS_MEMORY_PATH", "runtime should expose harness memory env key");
    assert(
      runtime.evalHarness && runtime.evalHarness.historyPath === path.relative(workspaceRoot, evalHistoryPath).replace(/\\/g, "/"),
      `runtime should expose isolated eval history path (${runtime.evalHarness && runtime.evalHarness.historyPath})`
    );
    assert(runtime.evalHarness.historyEnvKey === "CODEX_EVAL_HISTORY_PATH", "runtime should expose eval history env key");
    assert(runtime.contractSpec && runtime.contractSpec.taskOutcomeBridge, "runtime should expose task outcome bridge on contractSpec");
    assert(runtime.taskOutcomeContract && runtime.taskOutcomeContract.path, "runtime should expose taskOutcomeContract");
    assert(
      runtime.governancePolicy &&
        runtime.governancePolicy.contracts &&
        runtime.governancePolicy.contracts.worker &&
        runtime.governancePolicy.contracts.worker.legacyOnly === true,
      "runtime should expose worker legacyOnly governance"
    );

    const suiteRes = await requestJson({ port, path: "/api/eval/suites" });
    assert(suiteRes.statusCode === 200 && suiteRes.json && suiteRes.json.ok === true, "eval suites endpoint should return ok");
    assert(Array.isArray(suiteRes.json.suites) && suiteRes.json.suites.length >= 1, "eval suites should include at least one suite");
    const defaultSuite =
      Array.isArray(suiteRes.json.suites) && suiteRes.json.suites.length > 0
        ? suiteRes.json.suites[0]
        : null;
    assert(defaultSuite && Array.isArray(defaultSuite.caseIds), "eval suite summary should expose caseIds");
    assert(defaultSuite.caseIds.includes("retired_worker_rejected"), "default eval suite should include retired worker workflow coverage");
    assert(defaultSuite.caseIds.includes("retired_worker_scoped_rejected"), "default eval suite should include scoped retired worker workflow coverage");
    assert(defaultSuite.caseIds.includes("parent_dispatch_guard_violation"), "default eval suite should include parent dispatch guard workflow coverage");
    assert(defaultSuite.caseIds.includes("idempotency_failed_outcome_bridge"), "default eval suite should include idempotency lifecycle bridge coverage");
    assert(defaultSuite.caseIds.includes("turn_task_outcome_bridge_blocked"), "default eval suite should include blocked task outcome bridge coverage");

    const sloRes = await requestJson({ port, path: "/api/slo/status" });
    assert(sloRes.statusCode === 200 && sloRes.json && sloRes.json.ok === true, "slo status endpoint should return ok");
    assert(sloRes.json.slo && sloRes.json.slo.metrics, "slo metrics should exist");

    const tokenHeader = runtime.controlApi && runtime.controlApi.tokenHeader;
    const token = runtime.controlApi && runtime.controlApi.token;
    assert(tokenHeader && token, "runtime should expose control token for authenticated checks");

    const authHeaders = {
      [tokenHeader]: token,
      Origin: `http://127.0.0.1:${port}`,
      Referer: `http://127.0.0.1:${port}/`,
    };

    const historyRes = await requestJson({ port, path: "/api/eval/history", headers: authHeaders });
    assert(historyRes.statusCode === 200 && historyRes.json && historyRes.json.ok === true, "eval history endpoint should return ok");
    assert(Array.isArray(historyRes.json.history), "eval history should be an array");

    const evalRunRes = await requestJson({
      port,
      path: "/api/eval/run",
      method: "POST",
      headers: authHeaders,
      body: {
        maxCases: 11,
        caseTimeoutMs: 120000,
        variants: [
          {
            label: "A",
            agentName: "default",
            executionProfile: "eval-smoke",
            requestUserInputPolicy: "blocked",
            webSearch: 0,
          },
        ],
      },
      timeoutMs: 240000,
    });
    assert(evalRunRes.statusCode === 200 && evalRunRes.json && evalRunRes.json.ok === true, "eval run endpoint should return ok");
    assert(evalRunRes.json.report && Array.isArray(evalRunRes.json.report.runs), "eval run report should include runs");
    assert(evalRunRes.json.report.runs.length >= 1, "eval run should produce at least one run");
    const firstRun =
      evalRunRes.json.report.runs[0] && Array.isArray(evalRunRes.json.report.runs[0].cases)
        ? evalRunRes.json.report.runs[0]
        : null;
    assert(firstRun, "eval run should expose first run cases");
    const firstCaseResult = firstRun.cases[0] || null;
    assert(firstCaseResult && typeof firstCaseResult.taskOutcomeStatus === "string", "eval case should expose taskOutcomeStatus");
    const retiredWorkerCase = firstRun.cases.find((entry) => entry && entry.caseId === "retired_worker_rejected");
    assert(retiredWorkerCase && retiredWorkerCase.passed === true, "retired worker eval probe should pass");
    const parentDispatchCase = firstRun.cases.find((entry) => entry && entry.caseId === "parent_dispatch_guard_violation");
    assert(parentDispatchCase && parentDispatchCase.passed === true, "parent dispatch guard eval probe should pass");
    const idempotencyBridgeCase = firstRun.cases.find((entry) => entry && entry.caseId === "idempotency_failed_outcome_bridge");
    assert(idempotencyBridgeCase && idempotencyBridgeCase.passed === true, "idempotency lifecycle bridge eval probe should pass");
    const blockedBridgeCase = firstRun.cases.find((entry) => entry && entry.caseId === "turn_task_outcome_bridge_blocked");
    assert(blockedBridgeCase && blockedBridgeCase.passed === true, "blocked task outcome bridge eval probe should pass");

    const persistedEvalRes = await requestJson({
      port,
      path: "/api/eval/run",
      method: "POST",
      headers: authHeaders,
      body: {
        persistProbeResultsToMemory: true,
        suite: {
          suiteId: "smoke-probe-persistence.v1",
          description: "Probe persistence smoke coverage",
          cases: [
            {
              id: "parent_dispatch_guard_violation_memory",
              title: "Parent dispatch violation persists to execution memory",
              driver: "parent_dispatch_guard_probe",
              input: {
                mode: "enforce",
                agentName: "default",
                executionProfile: "eval-proof",
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
              id: "explicit_needs_input_memory",
              title: "Explicit NEEDS_INPUT persists to execution memory",
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
              id: "explicit_failed_validation_memory",
              title: "Explicit FAILED_VALIDATION persists to execution memory",
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
        },
        variants: [
          {
            label: "A",
            agentName: "default",
            executionProfile: "eval-proof",
            requestUserInputPolicy: "blocked",
            webSearch: 0,
          },
        ],
      },
      timeoutMs: 120000,
    });
    assert(
      persistedEvalRes.statusCode === 200 && persistedEvalRes.json && persistedEvalRes.json.ok === true,
      "probe persistence eval run should return ok"
    );
    const probePersistence = persistedEvalRes.json.report && persistedEvalRes.json.report.probePersistence;
    assert(probePersistence && probePersistence.requested === 1, "probe persistence should be marked requested");
    assert(Number(probePersistence.persistedRecords) === 3, "probe persistence should persist three probe records");
    assert(Array.isArray(probePersistence.records) && probePersistence.records.length === 3, "probe persistence records should be returned");
    assert(fs.existsSync(harnessMemoryPath), "isolated harness memory file should exist after persistence run");
    const memoryRaw = fs.readFileSync(harnessMemoryPath, "utf8");
    const memoryJson = memoryRaw ? JSON.parse(memoryRaw) : {};
    const executionMemory = Array.isArray(memoryJson.executionMemory) ? memoryJson.executionMemory : [];
    assert(executionMemory.length >= 3, "execution memory should include persisted probe records");
    const needsInputRecord = executionMemory.find((entry) => entry && entry.taskOutcomeStatus === "NEEDS_INPUT");
    assert(needsInputRecord, "execution memory should include NEEDS_INPUT probe record");
    const failedValidationRecord = executionMemory.find(
      (entry) => entry && entry.taskOutcomeStatus === "FAILED_VALIDATION" && entry.taskOutcomeReason === "missing_required_evidence"
    );
    assert(failedValidationRecord, "execution memory should include explicit FAILED_VALIDATION probe record");
    const guardRecord = executionMemory.find(
      (entry) =>
        entry &&
        entry.taskOutcomeStatus === "FAILED_VALIDATION" &&
        entry.taskOutcomeReason === "parent_dispatch_guard_block" &&
        entry.parentDispatchGuard &&
        entry.parentDispatchGuard.mode === "enforce"
    );
    assert(guardRecord, "execution memory should include parent dispatch guard FAILED_VALIDATION probe record");
    assert(
      guardRecord.observedSignals &&
        Number(guardRecord.observedSignals.fileChanges) > 0 &&
        Number(guardRecord.observedSignals.dispatchCount) === 0 &&
        Number(guardRecord.observedSignals.dispatchSuccessCount) === 0 &&
        Number(guardRecord.observedSignals.dispatchFailureCount) === 0 &&
        Number(guardRecord.observedSignals.collabCalls) === 0,
      "execution memory should preserve parent dispatch guard probe signals"
    );

    const replayRes = await waitForReplayTurns({ port, headers: authHeaders, minCount: 1 });
    assert(replayRes.statusCode === 200 && replayRes.json && replayRes.json.ok === true, "replay turns endpoint should return ok");
    assert(Array.isArray(replayRes.json.turns), "replay turns should be an array");
    assert(
      replayRes.json.turns[0] && typeof replayRes.json.turns[0].taskOutcomeStatus === "string",
      "replay turn snapshot should expose taskOutcomeStatus"
    );
    const replayTurnId = replayRes.json.turns[0] && replayRes.json.turns[0].turnId;
    assert(replayTurnId, "replay turnId should exist");

    const replayRunRes = await requestJson({
      port,
      path: "/api/replay/turn",
      method: "POST",
      headers: authHeaders,
      body: {
        turnId: replayTurnId,
        timeoutMs: 120000,
      },
      timeoutMs: 240000,
    });
    assert(replayRunRes.statusCode === 200 && replayRunRes.json && replayRunRes.json.ok === true, "replay run endpoint should return ok");
    assert(replayRunRes.json.diff && typeof replayRunRes.json.diff.similarity === "number", "replay diff metrics should be returned");

    console.log("[eval-replay-api-smoke] PASS endpoints respond and runtime exposes new surfaces");
    console.log("PASS");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }
}

run().catch((error) => {
  console.log(`[eval-replay-api-smoke] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
});
