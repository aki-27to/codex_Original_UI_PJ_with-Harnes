#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
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

function repoRelative(targetPath) {
  return path.relative(workspaceRoot, path.resolve(targetPath)).replace(/\\/g, "/");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw ? JSON.parse(raw) : null;
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function requestJson({
  port,
  path: requestPath,
  method = "GET",
  headers = {},
  body = null,
  timeoutMs = 15000,
}) {
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
              // Ignore malformed rows in evidence mode.
            }
          }
        });
        response.on("end", () => {
          const turnStarted = [...events].reverse().find((event) => event && event.type === "turn" && event.phase === "started") || null;
          const turnCompleted =
            [...events].reverse().find((event) => event && event.type === "turn" && event.phase === "completed") || null;
          const finalEvent = [...events].reverse().find((event) => event && event.type === "final") || null;
          resolve({
            events,
            turnStarted,
            turnCompleted,
            finalText: finalEvent && typeof finalEvent.text === "string" ? finalEvent.text : "",
          });
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

async function waitForFile(filePath, maxMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxMs) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).size >= 0) {
      return true;
    }
    await sleep(300);
  }
  throw new Error(`timed out waiting for file: ${filePath}`);
}

async function waitForMemoryRecord(harnessMemoryPath, predicate, maxMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxMs) {
    if (fs.existsSync(harnessMemoryPath)) {
      try {
        const parsed = readJson(harnessMemoryPath);
        const executionMemory = Array.isArray(parsed && parsed.executionMemory) ? parsed.executionMemory : [];
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

function getObservedSignals(record) {
  return record && record.observedSignals && typeof record.observedSignals === "object" ? record.observedSignals : {};
}

function getParentDispatchGuard(record) {
  return record && record.parentDispatchGuard && typeof record.parentDispatchGuard === "object" ? record.parentDispatchGuard : {};
}

function rankNaturalTaskRecord(record) {
  const observedSignals = getObservedSignals(record);
  const parentDispatchGuard = getParentDispatchGuard(record);
  const completedAt = Number(record && record.completedAt ? record.completedAt : 0);
  return (
    Number(parentDispatchGuard.required || 0) * 1000000 +
    Number(parentDispatchGuard.satisfied || 0) * 100000 +
    Number(observedSignals.dispatchSuccessCount || 0) * 10000 +
    Number(observedSignals.dispatchCount || 0) * 1000 +
    Number(observedSignals.fileChanges || 0) * 100 +
    Number(observedSignals.changedFiles || 0) * 10 +
    Number(observedSignals.collabCalls || 0) +
    completedAt / 1000000000000000
  );
}

function selectNaturalTaskMemoryRecord(executionMemory, { threadId, executionIntent, executionSource }) {
  const candidates = (Array.isArray(executionMemory) ? executionMemory : [])
    .filter((entry) => entry && entry.threadId === threadId)
    .filter((entry) => !executionIntent || entry.executionIntent === executionIntent)
    .filter((entry) => !executionSource || entry.executionSource === executionSource)
    .filter((entry) => entry.status === "completed" && entry.taskOutcomeStatus === "COMPLETED")
    .sort((left, right) => rankNaturalTaskRecord(right) - rankNaturalTaskRecord(left));
  return candidates[0] || null;
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
        const parsed = readJson(fullPath);
        if (parsed && parsed.turn && parsed.turn.turnId === turnId) {
          return { path: fullPath, manifest: parsed };
        }
      } catch {
        // ignore unreadable manifest
      }
    }
  }
  return null;
}

function parseReceivers(detail) {
  const text = typeof detail === "string" ? detail : "";
  const match = text.match(/receivers=([^/]+)/i);
  if (!match || !match[1]) {
    return [];
  }
  return match[1]
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value.trim()))).sort();
}

function summarizeStreamEvents(events) {
  const counts = {};
  const activityLabels = new Set();
  const dispatchReceivers = [];
  const itemSummaries = [];
  let implementationObserved = false;
  let reviewerObserved = false;
  for (const event of Array.isArray(events) ? events : []) {
    const type = event && typeof event.type === "string" ? event.type : "unknown";
    counts[type] = (counts[type] || 0) + 1;
    if (type === "activity" && typeof event.label === "string") {
      activityLabels.add(event.label);
    }
    if (type === "item") {
      const itemRecord = event && event.item && typeof event.item === "object" ? event.item : null;
      const label =
        typeof event.label === "string" ? event.label : itemRecord && typeof itemRecord.label === "string" ? itemRecord.label : "";
      const detail =
        typeof event.detail === "string" ? event.detail : itemRecord && typeof itemRecord.detail === "string" ? itemRecord.detail : "";
      if (detail) {
        const lowerDetail = detail.toLowerCase();
        dispatchReceivers.push(...parseReceivers(detail));
        implementationObserved = implementationObserved || lowerDetail.includes("owned paths:");
        reviewerObserved = reviewerObserved || lowerDetail.includes("no findings");
      }
      if (itemSummaries.length < 16) {
        itemSummaries.push({
          label,
          detail,
        });
      }
    }
  }
  return {
    counts,
    activityLabels: Array.from(activityLabels).sort(),
    dispatchReceivers: uniqueStrings(dispatchReceivers),
    itemSummaries,
    implementationObserved,
    reviewerObserved,
  };
}

function loadTurnArtifactEvents(artifactRecord) {
  if (!artifactRecord || !artifactRecord.path) {
    return [];
  }
  const artifactDir = path.dirname(artifactRecord.path);
  const eventsPath = path.join(artifactDir, "events.ndjson");
  return readJsonLines(eventsPath);
}

function extractStreamEventsFromArtifactEvents(artifactEvents) {
  return (Array.isArray(artifactEvents) ? artifactEvents : [])
    .filter((entry) => entry && entry.kind === "stream.event" && entry.payload && typeof entry.payload.type === "string")
    .map((entry) => entry.payload);
}

function extractFinalAssistantTextFromArtifactEvents(artifactEvents) {
  const events = Array.isArray(artifactEvents) ? artifactEvents : [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const entry = events[index];
    if (!entry || typeof entry !== "object") {
      continue;
    }
    if (entry.kind === "appserver.notification" && entry.payload && entry.payload.method === "item/completed") {
      const item = entry.payload.params && entry.payload.params.item;
      if (item && item.type === "agentMessage" && item.phase === "final_answer" && typeof item.text === "string") {
        return item.text;
      }
    }
    if (entry.kind === "stream.event" && entry.payload && entry.payload.type === "final" && typeof entry.payload.text === "string") {
      return entry.payload.text;
    }
    if (
      entry.kind === "stream.event" &&
      entry.payload &&
      entry.payload.type === "item" &&
      entry.payload.item &&
      entry.payload.item.label === "assistant message" &&
      typeof entry.payload.item.detail === "string"
    ) {
      const detail = entry.payload.item.detail;
      const prefix = "assistant: ";
      if (detail.startsWith(prefix)) {
        return detail.slice(prefix.length);
      }
    }
  }
  return "";
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

function buildBundlePaths() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const nonce = crypto.randomBytes(3).toString("hex");
  const bundleRoot = path.join(workspaceRoot, "logs", "signoff-bundles", `signoff-${stamp}-${nonce}`);
  return {
    bundleRoot,
    runtimeSnapshotPath: path.join(bundleRoot, "runtime_snapshot.json"),
    coreHarnessWorkflowRunPath: path.join(bundleRoot, "core_harness_workflow_run.json"),
    naturalTaskTraceSummaryPath: path.join(bundleRoot, "natural_task_trace_summary.json"),
    harnessMemoryPath: path.join(bundleRoot, "harness_execution_memory.json"),
    evalRunsPath: path.join(bundleRoot, "eval_runs.jsonl"),
    turnsDir: path.join(bundleRoot, "turns"),
    operationLogBasePath: path.join(bundleRoot, "codex_ops.jsonl"),
    summaryPath: path.join(bundleRoot, "signoff_summary.json"),
  };
}

function buildNaturalTaskPrompt() {
  const targetRelative = "docs/CURRENT_ARCHITECTURE.md";
  const targetSentence =
    "- `natural_task_trace_summary.json` records the selected implementation-bearing turn id and thread id, so signoff bundles stay anchored to the delegated turn even when later completions share the thread.";
  return [
    "#requirement-locked",
    "Implementation is explicitly requested now. There are no open questions and you should not stop at requirement analysis.",
    "#scope-core",
    "Perform one small real repo docs/infra maintenance task.",
    "- Use the default parent orchestration path.",
    "- Delegate the implementation edit to infra_worker, then request an independent read-only reviewer check.",
    `- Change only ${targetRelative}.`,
    "- Use apply_patch for the file edit.",
    "- Under `## 6) Evidence and Persistence`, add exactly one brief bullet documenting the new child-ownership aggregation behavior.",
    `- Insert this exact bullet if it is not already present: ${targetSentence}`,
    "- Do not duplicate the sentence if it already exists.",
    "- Ignore unrelated edits by others and do not revert them.",
    "- The implementation specialist must report using this exact header format:",
    "Owned paths:",
    "- `<absolute path>`",
    "- Reviewer must remain read-only and report findings first or state 'No findings'.",
    `- Final reply must be exactly: NATURAL_TASK_OK ${targetRelative}`,
  ].join("\n");
}

function buildRuntimeAssertions(runtime, paths) {
  const requirementGuard = runtime && runtime.requirementGuard ? runtime.requirementGuard : runtime.requirement_guard;
  const rbj = requirementGuard && requirementGuard.rbj ? requirementGuard.rbj : null;
  return {
    modeIsAppServer: Boolean(runtime && runtime.mode === "app-server"),
    defaultExecAgentIsDefault: Boolean(runtime && runtime.fullUtilization && Number(runtime.fullUtilization.checks && runtime.fullUtilization.checks.defaultExecAgentIsDefault) === 1),
    requestUserInputBlocked: Boolean(runtime && runtime.nonInteractiveUserInput && runtime.nonInteractiveUserInput.policy === "blocked"),
    parentDispatchGuardEnforced: Boolean(runtime && runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode === "enforce"),
    parentDispatchGuardMaxRetriesIsOne: Boolean(runtime && runtime.parentDispatchGuard && Number(runtime.parentDispatchGuard.maxRetries) === 1),
    requirementGuardEnabled: Boolean(requirementGuard && requirementGuard.enabled && requirementGuard.loaded),
    requirementLockEnabled: Boolean(requirementGuard && requirementGuard.requirementLock && requirementGuard.requirementLock.enabled),
    rbjEnabled: Boolean(rbj && rbj.enabled),
    rbjMaxQuestionsIsThree: Boolean(rbj && Number(rbj.maxQuestions) === 3),
    rbjMaxRevisionsIsTwo: Boolean(rbj && Number(rbj.maxRevisions) === 2),
    adversarialShadowEnabled: Boolean(runtime && runtime.adversarialShadow && runtime.adversarialShadow.enabled),
    adversarialLoopEnabled: Boolean(runtime && runtime.adversarialShadow && runtime.adversarialShadow.loop && runtime.adversarialShadow.loop.enabled),
    adversarialLoopMaxRetriesIsOne: Boolean(runtime && runtime.adversarialShadow && runtime.adversarialShadow.loop && Number(runtime.adversarialShadow.loop.maxRetries) === 1),
    isolatedHarnessMemoryPath: Boolean(runtime && runtime.harnessMemory && runtime.harnessMemory.storage === repoRelative(paths.harnessMemoryPath)),
    isolatedEvalHistoryPath: Boolean(runtime && runtime.evalHarness && runtime.evalHarness.historyPath === repoRelative(paths.evalRunsPath)),
    isolatedTurnArtifactsPath: Boolean(runtime && runtime.evidenceArtifacts && runtime.evidenceArtifacts.root === repoRelative(paths.turnsDir)),
    fullUtilizationReady: Boolean(runtime && runtime.fullUtilization && Number(runtime.fullUtilization.ready) === 1),
  };
}

function allAssertionsPass(assertions) {
  return Object.values(assertions).every(Boolean);
}

async function run() {
  const paths = buildBundlePaths();
  fs.mkdirSync(paths.bundleRoot, { recursive: true });
  fs.mkdirSync(paths.turnsDir, { recursive: true });

  const port = 57640 + Math.floor(Math.random() * 180);
  const env = {
    ...process.env,
    CODEX_UI_PORT: String(port),
    CODEX_AUTO_OPEN_BROWSER: "0",
    CODEX_DEFAULT_EXEC_AGENT: "default",
    CODEX_EXECUTION_PROFILE: "full-runtime",
    CODEX_REQUEST_USER_INPUT_POLICY: "blocked",
    CODEX_PARENT_DISPATCH_GUARD_MODE: "enforce",
    CODEX_PARENT_DISPATCH_GUARD_MAX_RETRIES: "1",
    CODEX_REQUIREMENT_GUARD_ENABLED: "1",
    CODEX_REQUIREMENT_LOCK_ENABLED: "1",
    CODEX_REQUIREMENT_RBJ_ENABLED: "1",
    CODEX_REQUIREMENT_RBJ_MAX_QUESTIONS: "3",
    CODEX_REQUIREMENT_RBJ_MAX_REVISIONS: "2",
    CODEX_ADVERSARIAL_SHADOW_ENABLED: "1",
    CODEX_ADVERSARIAL_LOOP_ENABLED: "1",
    CODEX_ADVERSARIAL_LOOP_MAX_RETRIES: "1",
    CODEX_EVAL_MAX_CASES: "20",
    CODEX_HARNESS_MEMORY_PATH: paths.harnessMemoryPath,
    CODEX_EVAL_HISTORY_PATH: paths.evalRunsPath,
    CODEX_TURN_ARTIFACTS_DIR: paths.turnsDir,
    CODEX_OPERATION_LOG_PATH: paths.operationLogBasePath,
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
    bundleRoot: paths.bundleRoot,
    paths: {
      runtimeSnapshot: paths.runtimeSnapshotPath,
      coreHarnessWorkflowRun: paths.coreHarnessWorkflowRunPath,
      naturalTaskTraceSummary: paths.naturalTaskTraceSummaryPath,
      harnessExecutionMemory: paths.harnessMemoryPath,
      evalRuns: paths.evalRunsPath,
      turnsDir: paths.turnsDir,
      signoffSummary: paths.summaryPath,
    },
    runtime: null,
    coreHarnessWorkflow: null,
    naturalTask: null,
    assertions: null,
  };

  try {
    const runtime = await waitForRuntime(port);
    writeJson(paths.runtimeSnapshotPath, runtime);

    const runtimeAssertions = buildRuntimeAssertions(runtime, paths);
    assert(allAssertionsPass(runtimeAssertions), `runtime posture assertion failed: ${JSON.stringify(runtimeAssertions)}`);

    const controlApi = runtime && runtime.controlApi && typeof runtime.controlApi === "object" ? runtime.controlApi : null;
    const token = controlApi && typeof controlApi.token === "string" ? controlApi.token.trim() : "";
    const tokenHeader =
      controlApi && typeof controlApi.tokenHeader === "string" ? controlApi.tokenHeader.trim() : "x-codex-control-token";
    assert(token, "runtime control token missing");

    const authHeaders = {
      [tokenHeader]: token,
      Origin: `http://127.0.0.1:${port}`,
      Referer: `http://127.0.0.1:${port}/`,
    };

    const suiteSummary = runtime && runtime.evalHarness && runtime.evalHarness.suite ? runtime.evalHarness.suite : null;
    const suiteCaseCount = suiteSummary && Number.isFinite(Number(suiteSummary.caseCount))
      ? Math.max(1, Math.trunc(Number(suiteSummary.caseCount)))
      : 1;

    const evalResponse = await requestJson({
      port,
      path: "/api/eval/run",
      method: "POST",
      headers: authHeaders,
      body: {
        suiteId: "core-harness-workflow.v4",
        maxCases: suiteCaseCount,
        caseTimeoutMs: 180000,
        variants: [
          {
            label: "signoff",
            agentName: "default",
            sandboxMode: "workspace-write",
            approvalPolicy: "never",
            cwd: workspaceRoot,
            requestUserInputPolicy: "blocked",
            executionProfile: "full-runtime",
            executionIntent: "signoff-eval",
            executionSource: "signoff_evidence_script",
            webSearch: 0,
          },
        ],
      },
      timeoutMs: 420000,
    });
    assert(evalResponse.statusCode === 200 && evalResponse.json && evalResponse.json.ok === true, "core workflow eval run failed");
    writeJson(paths.coreHarnessWorkflowRunPath, evalResponse.json);
    await waitForFile(paths.evalRunsPath, 30000);

    const evalReport = evalResponse.json.report;
    const evalRun = evalReport && Array.isArray(evalReport.runs) ? evalReport.runs[0] : null;
    const evalCases = evalRun && Array.isArray(evalRun.cases) ? evalRun.cases : [];
    const failedCases = evalCases.filter((entry) => entry && entry.passed !== true);
    const rbjCase = evalCases.find((entry) => entry && entry.caseId === "requirement_rbj_parent_active") || null;
    assert(evalReport && evalReport.suite && evalReport.suite.suiteId === "core-harness-workflow.v4", "unexpected eval suiteId");
    assert(evalRun, "missing eval run summary");
    assert(Number(evalRun.sampleSize || 0) === suiteCaseCount, `core workflow eval did not execute the full suite (${evalRun.sampleSize}/${suiteCaseCount})`);
    assert(failedCases.length === 0, `core workflow eval has failed cases: ${failedCases.map((entry) => entry.caseId).join(", ")}`);
    assert(rbjCase && rbjCase.passed === true, "requirement_rbj_parent_active did not pass");

    const naturalTaskTargetPath = path.join(workspaceRoot, "docs", "CURRENT_ARCHITECTURE.md");
    const naturalTaskTargetSection = "## 6) Evidence and Persistence";
    const naturalTaskTargetRelative = repoRelative(naturalTaskTargetPath);
    const naturalTaskTargetSentence =
      "- `natural_task_trace_summary.json` records the selected implementation-bearing turn id and thread id, so signoff bundles stay anchored to the delegated turn even when later completions share the thread.";
    const naturalTaskPrompt = buildNaturalTaskPrompt();
    const naturalTaskResponse = await runExecViaHttp({
      port,
      headers: authHeaders,
      body: {
        prompt: naturalTaskPrompt,
        agentName: "default",
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        cwd: workspaceRoot,
        requestUserInputPolicy: "blocked",
        executionProfile: "full-runtime",
        executionIntent: "docs_maintenance",
        executionSource: "signoff_evidence_script",
        forceNewSession: true,
        idempotencyKey: `signoff-natural-${Date.now()}`,
      },
      timeoutMs: 420000,
    });

    const naturalTaskThreadId =
      (naturalTaskResponse.turnStarted && typeof naturalTaskResponse.turnStarted.threadId === "string" && naturalTaskResponse.turnStarted.threadId) ||
      (naturalTaskResponse.turnCompleted && typeof naturalTaskResponse.turnCompleted.threadId === "string" && naturalTaskResponse.turnCompleted.threadId) ||
      "";
    assert(naturalTaskThreadId, "natural task thread id missing");

    const memoryMatch = await waitForMemoryRecord(
      paths.harnessMemoryPath,
      (entry) =>
        entry &&
        entry.threadId === naturalTaskThreadId &&
        entry.executionIntent === "docs_maintenance" &&
        entry.executionSource === "signoff_evidence_script" &&
        entry.status === "completed" &&
        entry.taskOutcomeStatus === "COMPLETED" &&
        (Number(getObservedSignals(entry).dispatchSuccessCount || 0) > 0 ||
          Number(getObservedSignals(entry).fileChanges || 0) > 0 ||
          Number(getParentDispatchGuard(entry).required || 0) > 0),
      45000
    );
    const naturalMemoryRecord = selectNaturalTaskMemoryRecord(memoryMatch.executionMemory, {
      threadId: naturalTaskThreadId,
      executionIntent: "docs_maintenance",
      executionSource: "signoff_evidence_script",
    });
    assert(naturalMemoryRecord && typeof naturalMemoryRecord.turnId === "string" && naturalMemoryRecord.turnId, "natural task memory record missing");
    const artifactRecord = findTurnArtifactManifest(paths.turnsDir, naturalMemoryRecord.turnId);
    assert(artifactRecord, "natural task turn artifact manifest missing");
    const artifactEvents = loadTurnArtifactEvents(artifactRecord);
    const artifactStreamSummary = summarizeStreamEvents(extractStreamEventsFromArtifactEvents(artifactEvents));
    const artifactFinalText = extractFinalAssistantTextFromArtifactEvents(artifactEvents);

    const replayResponse = await requestJson({
      port,
      path: `/api/replay/turn/${encodeURIComponent(naturalMemoryRecord.turnId)}`,
      method: "GET",
      headers: authHeaders,
      timeoutMs: 15000,
    });
    assert(replayResponse.statusCode === 200 && replayResponse.json && replayResponse.json.ok === true, "natural task replay lookup failed");

    const targetText = fs.readFileSync(naturalTaskTargetPath, "utf8");
    const responseStreamSummary = summarizeStreamEvents(naturalTaskResponse.events);
    const observedSignals = getObservedSignals(naturalMemoryRecord);
    const observedSampleChangedPaths = Array.isArray(observedSignals.sampleChangedPaths) ? observedSignals.sampleChangedPaths : [];
    const observedDispatchChildren = Array.isArray(observedSignals.dispatchChildren) ? observedSignals.dispatchChildren : [];
    const replayDispatchChildren =
      replayResponse.json &&
      replayResponse.json.replay &&
      replayResponse.json.replay.observed_signals &&
      Array.isArray(replayResponse.json.replay.observed_signals.dispatchChildren)
        ? replayResponse.json.replay.observed_signals.dispatchChildren
        : [];
    const dispatchChildren = uniqueStrings([
      ...observedDispatchChildren,
      ...artifactStreamSummary.dispatchReceivers,
      ...responseStreamSummary.dispatchReceivers,
      ...replayDispatchChildren,
    ]);
    const replayObservedSignals =
      replayResponse.json &&
      replayResponse.json.replay &&
      replayResponse.json.replay.observed_signals &&
      typeof replayResponse.json.replay.observed_signals === "object"
        ? replayResponse.json.replay.observed_signals
        : {};
    const allSampleChangedPaths = uniqueStrings([
      ...observedSampleChangedPaths,
      ...(Array.isArray(replayObservedSignals.sampleChangedPaths) ? replayObservedSignals.sampleChangedPaths : []),
    ]);
    const implementationObserved = Boolean(artifactStreamSummary.implementationObserved || responseStreamSummary.implementationObserved);
    const reviewerObserved = Boolean(artifactStreamSummary.reviewerObserved || responseStreamSummary.reviewerObserved);
    const finalAssistantText = artifactFinalText || naturalTaskResponse.finalText || "";

    const naturalAssertions = {
      completed: Boolean(
        naturalMemoryRecord &&
          naturalMemoryRecord.status === "completed" &&
          naturalMemoryRecord.taskOutcomeStatus === "COMPLETED"
      ),
      parentDispatchSatisfied: Boolean(
        naturalMemoryRecord &&
          naturalMemoryRecord.parentDispatchGuard &&
          Number(naturalMemoryRecord.parentDispatchGuard.satisfied) === 1
      ),
      dispatchCountObserved: Number(observedSignals.dispatchSuccessCount || 0) >= 2 || dispatchChildren.length >= 2,
      implementationObserved,
      reviewerObserved,
      targetSentencePresent: targetText.includes(naturalTaskTargetSentence),
      parentObservedFileChanges: Number(observedSignals.fileChanges || 0) >= 1,
      parentObservedChangedFiles: Number(observedSignals.changedFiles || 0) >= 1,
      parentObservedTargetPath:
        allSampleChangedPaths.includes(naturalTaskTargetRelative) ||
        allSampleChangedPaths.includes(naturalTaskTargetPath.replace(/\\/g, "/")),
      bundleLocalTurnArtifact: path.resolve(artifactRecord.path).startsWith(path.resolve(paths.turnsDir)),
      finalReplyAcknowledged:
        typeof finalAssistantText === "string" &&
        finalAssistantText.trim() === `NATURAL_TASK_OK ${naturalTaskTargetRelative}`,
    };
    assert(allAssertionsPass(naturalAssertions), `natural task assertion failed: ${JSON.stringify(naturalAssertions)}`);

    const naturalTaskTraceSummary = {
      generatedAt: new Date().toISOString(),
      selectionMethod: "persisted_execution_memory_best_completed_turn",
      turnId: naturalMemoryRecord.turnId,
      threadId: naturalTaskThreadId,
      targetPath: naturalTaskTargetPath,
      targetRelativePath: naturalTaskTargetRelative,
      targetSection: naturalTaskTargetSection,
      targetSentence: naturalTaskTargetSentence,
      responseFinalText: naturalTaskResponse.finalText,
      finalText: finalAssistantText,
      turn: {
        status: naturalMemoryRecord.status,
        taskOutcomeStatus: naturalMemoryRecord.taskOutcomeStatus,
        taskOutcomeReason: naturalMemoryRecord.taskOutcomeReason,
      },
      parentDispatchGuard: naturalMemoryRecord.parentDispatchGuard || null,
      observedSignals,
      sampleChangedPaths: allSampleChangedPaths,
      dispatchChildren,
      responseStream: responseStreamSummary,
      artifactStream: artifactStreamSummary,
      replay: replayResponse.json.replay || null,
      artifactManifestPath: artifactRecord.path,
      artifactDir: path.dirname(artifactRecord.path),
      assertions: naturalAssertions,
    };
    writeJson(paths.naturalTaskTraceSummaryPath, naturalTaskTraceSummary);

    await waitForFile(paths.harnessMemoryPath, 30000);
    const finalMemory = readJson(paths.harnessMemoryPath);
    const evalHistory = readJsonLines(paths.evalRunsPath);

    summary.runtime = {
      executionProfile: runtime.executionProfile,
      fullUtilization: runtime.fullUtilization,
      parentDispatchGuard: runtime.parentDispatchGuard,
      nonInteractiveUserInput: runtime.nonInteractiveUserInput,
      requirementGuard: runtime.requirementGuard || runtime.requirement_guard,
      adversarialShadow: runtime.adversarialShadow,
      evidenceArtifacts: runtime.evidenceArtifacts,
      harnessMemory: runtime.harnessMemory,
      evalHarness: runtime.evalHarness,
      operationLog: runtime.operationLog,
      assertions: runtimeAssertions,
    };
    summary.coreHarnessWorkflow = {
      runId: evalReport.runId,
      suiteId: evalReport.suite.suiteId,
      generatedAt: evalReport.generatedAt,
      sampleSize: evalRun.sampleSize,
      passedCases: evalRun.passedCases,
      failedCases: evalRun.failedCases,
      passRate: evalRun.passRate,
      scoreRate: evalRun.scoreRate,
      requirementRbjParentActiveCase: rbjCase,
    };
    summary.naturalTask = {
      threadId: naturalTaskThreadId,
      turnId: naturalMemoryRecord.turnId,
      targetPath: naturalTaskTargetPath,
      artifactManifestPath: artifactRecord.path,
      dispatchChildren,
      assertions: naturalAssertions,
    };
    summary.assertions = {
      runtimePostureSafe: allAssertionsPass(runtimeAssertions),
      coreHarnessWorkflowPassed: failedCases.length === 0,
      requirementRbjParentActivePassed: Boolean(rbjCase && rbjCase.passed === true),
      naturalTaskTracePassed: allAssertionsPass(naturalAssertions),
      bundleContainsRequiredFiles: [
        paths.runtimeSnapshotPath,
        paths.coreHarnessWorkflowRunPath,
        paths.naturalTaskTraceSummaryPath,
        paths.harnessMemoryPath,
        paths.evalRunsPath,
      ].every((filePath) => fs.existsSync(filePath)),
      bundleContainsTurnsDir: fs.existsSync(paths.turnsDir),
      evalHistoryPersisted: evalHistory.length >= 1,
      harnessExecutionMemoryPersisted:
        finalMemory && Array.isArray(finalMemory.executionMemory) && finalMemory.executionMemory.length >= 1,
    };
    summary.allPassed = allAssertionsPass(summary.assertions);
    assert(summary.allPassed, `summary assertion failed: ${JSON.stringify(summary.assertions)}`);

    writeJson(paths.summaryPath, summary);
    console.log(
      JSON.stringify(
        {
          ok: true,
          bundleRoot: paths.bundleRoot,
          summaryPath: paths.summaryPath,
        },
        null,
        2
      )
    );
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.serverLogs = logs.slice(-80);
    writeJson(paths.summaryPath, summary);
    console.log(
      JSON.stringify(
        {
          ok: false,
          bundleRoot: paths.bundleRoot,
          summaryPath: paths.summaryPath,
          error: summary.error,
        },
        null,
        2
      )
    );
    throw error;
  } finally {
    await stopChild(child);
  }
}

run().catch((error) => {
  console.error(`[generate-signoff-evidence] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
