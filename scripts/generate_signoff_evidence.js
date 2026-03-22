#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const { spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { startInProcessHarnessServer } = require("./lib/in_process_harness_server");
const { generateBaselineComparison, metricFromTrace } = require("./generate_baseline_comparison");
const { getLoggingSurfacePaths } = require("./lib/logging_surface");
const { buildConformanceReport, buildOperatorViewSummary } = require("./lib/constitution_conformance");

const workspaceRoot = path.resolve(__dirname, "..");
const loggingSurfacePaths = getLoggingSurfacePaths(workspaceRoot);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeString(value, max = 2000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function normalizeProofTransportMode(value) {
  const raw = safeString(value, 80).toLowerCase();
  if (raw === "stdio" || raw === "live" || raw === "app-server" || raw === "raw") return "stdio";
  return "mock-fixture";
}

function resolveBaselineProfile(transportMode) {
  return normalizeProofTransportMode(transportMode) === "stdio"
    ? "live-raw-codex-like"
    : "measured-baseline-smoke";
}

function buildScenarioPrompt({ transportMode = "mock-fixture", scenarioName = "", baselineProfile = "", lines = [] } = {}) {
  const prefix = [];
  const normalizedTransportMode = normalizeProofTransportMode(transportMode);
  if (normalizedTransportMode === "mock-fixture" && scenarioName) {
    prefix.push(`[FIXTURE_SCENARIO] ${scenarioName}`);
  }
  if (normalizedTransportMode === "mock-fixture" && baselineProfile) {
    prefix.push(`[BASELINE_PROFILE] ${baselineProfile}`);
  }
  return [...prefix, ...lines].join("\n");
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

function loadArtifactSiblingJson(artifactRecord, fileName) {
  if (!artifactRecord || !artifactRecord.path || !fileName) {
    return null;
  }
  const candidate = path.join(path.dirname(artifactRecord.path), fileName);
  if (!fs.existsSync(candidate)) {
    return null;
  }
  try {
    return readJson(candidate);
  } catch {
    return null;
  }
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

function buildBundlePaths(bundleRootOverride = "") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const nonce = crypto.randomBytes(3).toString("hex");
  const bundleRoot = bundleRootOverride
    ? path.resolve(workspaceRoot, bundleRootOverride)
    : path.join(loggingSurfacePaths.signoffBundlesRoot, `signoff-${stamp}-${nonce}`);
  const rawRoot = path.join(bundleRoot, "raw");
  const operationLogsRoot = path.join(rawRoot, "operation_logs");
  const rawSummaryRoot = path.join(rawRoot, "summaries");
  const measuredBaselineRoot = path.join(rawRoot, "measured_baseline");
  const rawDirectBaselineRoot = path.join(rawRoot, "raw_direct_baseline");
  return {
    bundleRoot,
    rawRoot,
    rawSummaryRoot,
    operationLogsRoot,
    measuredBaselineRoot,
    rawDirectBaselineRoot,
    runtimeSnapshotPath: path.join(bundleRoot, "runtime_snapshot.json"),
    coreHarnessWorkflowRunPath: path.join(bundleRoot, "core_harness_workflow_run.json"),
    fastTaskTraceSummaryPath: path.join(rawSummaryRoot, "fast_task_trace_summary.json"),
    discoveryTaskTraceSummaryPath: path.join(rawSummaryRoot, "discovery_task_trace_summary.json"),
    signoffTaskTraceSummaryPath: path.join(rawSummaryRoot, "signoff_task_trace_summary.json"),
    naturalTaskTraceSummaryPath: path.join(bundleRoot, "natural_task_trace_summary.json"),
    latestRunSummaryPath: path.join(bundleRoot, "latest_run_summary.json"),
    reviewLoadBreakdownPath: path.join(bundleRoot, "review_load_breakdown.json"),
    laneLatencySummaryPath: path.join(rawRoot, "relocated_top_level", "lane_latency_summary.json"),
    resumeStatePath: path.join(rawRoot, "relocated_top_level", "signoff_resume_state.json"),
    conformanceReportPath: path.join(bundleRoot, "conformance_report.json"),
    operatorViewSummaryPath: path.join(bundleRoot, "operator_view_summary.json"),
    measuredBaselineSummaryPath: path.join(measuredBaselineRoot, "measured_baseline_summary.json"),
    baselineFastTaskTraceSummaryPath: path.join(measuredBaselineRoot, "baseline_fast_task_trace_summary.json"),
    baselineDiscoveryTaskTraceSummaryPath: path.join(measuredBaselineRoot, "baseline_discovery_task_trace_summary.json"),
    baselineSignoffTaskTraceSummaryPath: path.join(measuredBaselineRoot, "baseline_signoff_task_trace_summary.json"),
    baselineNaturalTaskTraceSummaryPath: path.join(measuredBaselineRoot, "baseline_natural_task_trace_summary.json"),
    rawDirectBaselineSummaryPath: path.join(rawDirectBaselineRoot, "raw_direct_baseline_summary.json"),
    rawDirectFastTaskTraceSummaryPath: path.join(rawDirectBaselineRoot, "raw_direct_fast_task_trace_summary.json"),
    rawDirectDiscoveryTaskTraceSummaryPath: path.join(rawDirectBaselineRoot, "raw_direct_discovery_task_trace_summary.json"),
    rawDirectSignoffTaskTraceSummaryPath: path.join(rawDirectBaselineRoot, "raw_direct_signoff_task_trace_summary.json"),
    rawDirectNaturalTaskTraceSummaryPath: path.join(rawDirectBaselineRoot, "raw_direct_natural_task_trace_summary.json"),
    baselineComparisonReportPath: path.join(bundleRoot, "baseline_comparison_report.json"),
    speedVsAssuranceReportPath: path.join(bundleRoot, "speed_vs_assurance_report.md"),
    harnessMemoryPath: path.join(rawRoot, "harness_execution_memory.json"),
    evalRunsPath: path.join(rawRoot, "eval_runs.jsonl"),
    turnsDir: path.join(rawRoot, "turns"),
    operationLogBasePath: path.join(operationLogsRoot, "codex_ops.jsonl"),
    measuredBaselineHarnessMemoryPath: path.join(measuredBaselineRoot, "harness_execution_memory.json"),
    measuredBaselineEvalRunsPath: path.join(measuredBaselineRoot, "eval_runs.jsonl"),
    measuredBaselineTurnsDir: path.join(measuredBaselineRoot, "turns"),
    measuredBaselineOperationLogPath: path.join(measuredBaselineRoot, "operation_logs", "codex_ops.jsonl"),
    bundleSurfaceMapPath: path.join(bundleRoot, "bundle_surface_map.json"),
    summaryPath: path.join(bundleRoot, "signoff_summary.json"),
  };
}

function getPlanningSelection(source) {
  return source && typeof source === "object" ? source : {};
}

function buildBundleSurfaceMap(paths) {
  const topLevelSummaries = [
    repoRelative(paths.summaryPath),
    repoRelative(paths.runtimeSnapshotPath),
    repoRelative(paths.coreHarnessWorkflowRunPath),
    repoRelative(paths.naturalTaskTraceSummaryPath),
    repoRelative(paths.latestRunSummaryPath),
    repoRelative(paths.reviewLoadBreakdownPath),
    repoRelative(paths.conformanceReportPath),
    repoRelative(paths.operatorViewSummaryPath),
    repoRelative(paths.bundleSurfaceMapPath),
  ];
  const openFirst = [
    ...topLevelSummaries,
    repoRelative(paths.laneLatencySummaryPath),
    repoRelative(paths.resumeStatePath),
    repoRelative(paths.baselineComparisonReportPath),
    repoRelative(paths.speedVsAssuranceReportPath),
  ];
  return {
    schema: "bundle-surface-map.v1",
    generatedAt: new Date().toISOString(),
    bundleRoot: paths.bundleRoot,
    openFirst,
    topLevelSummaries,
    deepRawArtifacts: [
      repoRelative(paths.rawSummaryRoot),
      repoRelative(paths.turnsDir),
      repoRelative(paths.operationLogBasePath),
      repoRelative(paths.measuredBaselineRoot),
      repoRelative(paths.rawDirectBaselineRoot),
      repoRelative(paths.measuredBaselineTurnsDir),
      repoRelative(paths.measuredBaselineOperationLogPath),
      repoRelative(paths.harnessMemoryPath),
      repoRelative(paths.evalRunsPath),
      repoRelative(paths.measuredBaselineSummaryPath),
      repoRelative(paths.rawDirectBaselineSummaryPath),
    ],
  };
}

function sanitizeBundleTopLevel(paths) {
  const allowed = new Set([
    "signoff_summary.json",
    "runtime_snapshot.json",
    "core_harness_workflow_run.json",
    "natural_task_trace_summary.json",
    "latest_run_summary.json",
    "review_load_breakdown.json",
    "conformance_report.json",
    "operator_view_summary.json",
    "bundle_surface_map.json",
    "raw",
  ]);
  const entries = fs.readdirSync(paths.bundleRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry || !entry.name || allowed.has(entry.name)) continue;
    const sourcePath = path.join(paths.bundleRoot, entry.name);
    const destinationPath = path.join(paths.rawRoot, "relocated_top_level", entry.name);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.renameSync(sourcePath, destinationPath);
  }
}

function buildFastTaskPrompt(targetRelativePath) {
  return [
    "[FIXTURE_SCENARIO] FAST_SAMPLE",
    "#requirement-locked",
    "Implementation is explicitly requested now.",
    "#scope-core",
    "# 依頼",
    `Change only ${targetRelativePath}.`,
    "",
    "# 受け入れ条件",
    "- 既存仕様を変えない",
    "- 変更は1ファイルだけに限定する",
    `- Final reply must be exactly: FAST_TASK_OK ${targetRelativePath}`,
    "",
    "# 実装要求",
    "- Use the default parent orchestration path.",
    "- Delegate the file edit to infra_worker.",
    "- Use apply_patch for the edit.",
    "- Replace the single line `status: stale` with `status: fresh`.",
    "- Do not modify any other file.",
    "- Do not ask follow-up questions.",
  ].join("\n");
}

function buildSignoffTaskPrompt(targetRelativePath) {
  const evidenceTarget = "docs/EVIDENCE_CONTRACT.md";
  const changelogTarget = "docs/ARCHITECTURE_CHANGELOG.md";
  const evidenceBullet =
    "- `SIGNOFF_ASSURANCE` runs should surface reviewer/tester/doc-sync status in `review_load_breakdown.json` for operator signoff.";
  return [
    "#requirement-locked",
    "Implementation is explicitly requested now. This is a runtime/proof/eval signoff sample for new logic coverage.",
    "#scope-core",
    "Perform one small signoff-assurance maintenance task.",
    "- Use the default parent orchestration path.",
    "- Delegate the implementation edit to infra_worker, then request independent read-only reviewer and tester checks.",
    `- Change ${targetRelativePath}, ${evidenceTarget}, and ${changelogTarget}.`,
    "- Use apply_patch for file edits.",
    `- In ${targetRelativePath}, replace the single line \`gate: pending\` with \`gate: signed\`.`,
    `- In ${evidenceTarget}, add this exact bullet if it is not already present: ${evidenceBullet}`,
    `- In ${changelogTarget}, add one brief 2026-03-08 entry noting the signoff assurance sample evidence wiring if it is not already present.`,
    "- Reviewer must remain read-only and report findings first or state 'No findings'.",
    "- Tester must report pass/fail evidence.",
    `- Final reply must be exactly: SIGNOFF_TASK_OK ${targetRelativePath}`,
  ].join("\n");
}

function buildFastBaselinePrompt(targetRelativePath, transportMode = "mock-fixture") {
  return buildScenarioPrompt({
    transportMode,
    scenarioName: "FAST_SAMPLE",
    baselineProfile: "measured",
    lines: [
    "#requirement-locked",
    "Implementation is explicitly requested now. This is a small existing single-file change.",
    "#scope-core",
    `Change only ${targetRelativePath}.`,
    "# Acceptance Criteria",
    "- Existing content stays intact aside from the requested line replacement.",
    "- Exactly one file changes.",
    `- Final reply must be exactly: FAST_TASK_OK ${targetRelativePath}`,
    "# Execution",
    "- Replace the single line `status: stale` with `status: fresh`.",
    "- Apply the change directly without delegation, reviewer, or tester steps.",
    ],
  });
}

function buildDiscoveryBaselinePrompt(transportMode = "mock-fixture") {
  return buildScenarioPrompt({
    transportMode,
    scenarioName: "DISCOVERY_SAMPLE",
    baselineProfile: "measured",
    lines: [
    "Design a new enterprise execution workflow for a future product line.",
    "- The product goal and acceptance checks are not fixed yet.",
    "- Surface the missing decisions and stop with STATUS: NEED_USER_INPUT.",
    ],
  });
}

function buildNaturalBaselinePrompt(targetRelativePath, targetSentence, transportMode = "mock-fixture") {
  return buildScenarioPrompt({
    transportMode,
    scenarioName: "NATURAL_SAMPLE",
    baselineProfile: "measured",
    lines: [
    "#requirement-locked",
    "# Goal",
    "Perform one small documentation maintenance task.",
    "# Implementation Requirements",
    `- Change only ${targetRelativePath}.`,
    "- Under `## 6) Evidence and Persistence`, add exactly one brief bullet.",
    `- Insert this exact bullet if it is not already present: ${targetSentence}`,
    "# Acceptance Criteria",
    "- Exactly one documentation file changes.",
    "- No follow-up questions are required.",
    `- Final reply must be exactly: NATURAL_TASK_OK ${targetRelativePath}`,
    "# Execution",
    "- Apply the change directly without reviewer fan-out.",
    ],
  });
}

function buildSignoffBaselinePrompt(targetRelativePath, evidenceRelativePath, architectureRelativePath, changelogRelativePath, transportMode = "mock-fixture") {
  const evidenceBullet =
    "- `SIGNOFF_ASSURANCE` runs should surface reviewer/tester/doc-sync status in `review_load_breakdown.json` for operator signoff.";
  const architectureBullet =
    "- `SIGNOFF_ASSURANCE` sample runs keep planning depth, assurance depth, reviewer/tester execution, and doc-sync evidence co-located in signoff bundles.";
  const changelogLine =
    "- 2026-03-08: Added signoff assurance sample evidence wiring for planning/assurance trace and doc-sync bundle checks.";
  return buildScenarioPrompt({
    transportMode,
    scenarioName: "SIGNOFF_SAMPLE",
    baselineProfile: "measured",
    lines: [
    "#requirement-locked",
    "Implementation is explicitly requested now. This is a signoff-like maintenance task under the measured baseline profile.",
    "#scope-core",
    `- Change ${targetRelativePath}, ${evidenceRelativePath}, ${architectureRelativePath}, ${changelogRelativePath}`,
    "# Acceptance Criteria",
    "- Primary target file is updated.",
    "- Supporting docs are updated.",
    `- In ${targetRelativePath}, replace the single line \`gate: pending\` with \`gate: signed\`.`,
    `- In ${evidenceRelativePath}, add this exact bullet if it is not already present: ${evidenceBullet}`,
    `- In ${architectureRelativePath}, add this exact architecture bullet if it is not already present: ${architectureBullet}`,
    `- In ${changelogRelativePath}, add this exact changelog line if it is not already present: ${changelogLine}`,
    `- Final reply must be exactly: SIGNOFF_TASK_OK ${targetRelativePath}`,
    "# Execution",
    "- Apply the changes directly without delegation, reviewer, or tester steps.",
    ],
  });
}

function ensureMeasuredBaselineFixtureFiles(paths) {
  const docsRoot = path.join(paths.measuredBaselineRoot, "docs");
  const scriptsRoot = path.join(paths.measuredBaselineRoot, "scripts", "config");
  const fastRoot = path.join(paths.measuredBaselineRoot, "fixtures");
  fs.mkdirSync(docsRoot, { recursive: true });
  fs.mkdirSync(scriptsRoot, { recursive: true });
  fs.mkdirSync(fastRoot, { recursive: true });

  const fastTargetPath = path.join(fastRoot, "sample_fast_target.md");
  fs.writeFileSync(fastTargetPath, "# Fast Baseline Sample\nstatus: stale\n", "utf8");

  const naturalTargetPath = path.join(docsRoot, "CURRENT_ARCHITECTURE.md");
  const sourceArchitecturePath = path.join(workspaceRoot, "docs", "CURRENT_ARCHITECTURE.md");
  fs.writeFileSync(naturalTargetPath, fs.readFileSync(sourceArchitecturePath, "utf8"), "utf8");

  const signoffTargetPath = path.join(scriptsRoot, "signoff_sample_target.txt");
  fs.writeFileSync(signoffTargetPath, "gate: pending\n", "utf8");

  const evidencePath = path.join(docsRoot, "EVIDENCE_CONTRACT.md");
  const architecturePath = path.join(docsRoot, "CURRENT_ARCHITECTURE_SIGNOFF.md");
  const changelogPath = path.join(docsRoot, "ARCHITECTURE_CHANGELOG.md");
  fs.writeFileSync(evidencePath, fs.readFileSync(path.join(workspaceRoot, "docs", "EVIDENCE_CONTRACT.md"), "utf8"), "utf8");
  fs.writeFileSync(architecturePath, fs.readFileSync(sourceArchitecturePath, "utf8"), "utf8");
  fs.writeFileSync(changelogPath, fs.readFileSync(path.join(workspaceRoot, "docs", "ARCHITECTURE_CHANGELOG.md"), "utf8"), "utf8");

  return {
    fastTargetPath,
    naturalTargetPath,
    signoffTargetPath,
    evidencePath,
    architecturePath,
    changelogPath,
  };
}

function buildDiscoveryTaskPrompt() {
  return [
    "[FIXTURE_SCENARIO] DISCOVERY_SAMPLE",
    "#requirement-locked",
    "#scope-core",
    "# 依頼",
    "Design a new enterprise execution workflow for a future product line.",
    "",
    "# 背景",
    "The goal, non-goals, specialist ownership, and acceptance checks are not fixed yet.",
    "User decision is required before implementation.",
    "",
    "# 受け入れ条件",
    "- First make the open questions explicit.",
    "- Do not implement anything.",
    "- Stop with STATUS: NEED_USER_INPUT.",
  ].join("\n");
}

function buildNaturalTaskPrompt() {
  const targetRelative = "docs/CURRENT_ARCHITECTURE.md";
  const targetSentence =
    "- `natural_task_trace_summary.json` records the selected implementation-bearing turn id and thread id, so trace bundles stay anchored to the delegated turn even when later completions share the thread.";
  return [
    "[FIXTURE_SCENARIO] NATURAL_SAMPLE",
    "#requirement-locked",
    "# Goal",
    "Perform one small real repo documentation maintenance task.",
    "# Implementation Requirements",
    "Implementation is explicitly requested now. Requirements are fixed, so proceed directly to implementation.",
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
    "# Acceptance Criteria",
    "- Exactly one documentation file changes.",
    "- Reviewer evidence is present.",
    "- No follow-up questions are required.",
    "- Reviewer must remain read-only and report findings first or state 'No findings'.",
    `- Final reply must be exactly: NATURAL_TASK_OK ${targetRelative}`,
  ].join("\n");
}

function buildSignoffTaskPrompt() {
  const targetRelative = "docs/ARCHITECTURE_CHANGELOG.md";
  const targetSentence = "- Signoff sample: adaptive execution signoff trace recorded for the governed harness workflow.";
  return [
    "#requirement-locked",
    "Implementation is explicitly requested now.",
    "#scope-core",
    "Perform one signoff-grade docs/runtime evidence task.",
    "- Use the default parent orchestration path.",
    "- Delegate the implementation edit to infra_worker, then request reviewer and tester checks.",
    `- Change only ${targetRelative}.`,
    "- Use apply_patch for the file edit.",
    "- Append exactly one bullet line at the end of the file if it is not already present.",
    `- Use this exact line: ${targetSentence}`,
    "- Treat this as signoff evidence work: mention signoff, proof, reviewer, and tester explicitly.",
    "- Do not modify any other file.",
    `- Final reply must be exactly: SIGNOFF_TASK_OK ${targetRelative}`,
  ].join("\n");
}

function buildFastTaskPrompt(targetRelativePath, transportMode = "mock-fixture") {
  return buildScenarioPrompt({
    transportMode,
    scenarioName: "FAST_SAMPLE",
    lines: [
    "#requirement-locked",
    "Implementation is explicitly requested now.",
    "#scope-core",
    `Change only ${targetRelativePath}.`,
    "# Acceptance Criteria",
    "- Existing content stays intact aside from the requested line replacement.",
    "- Exactly one file changes.",
    `- Final reply must be exactly: FAST_TASK_OK ${targetRelativePath}`,
    "# Execution",
    "- Use the default parent orchestration path.",
    "- Delegate the file edit to infra_worker.",
    "- Use apply_patch for the edit.",
    "- Replace the single line `status: stale` with `status: fresh`.",
    "- Do not modify any other file.",
    "- Do not ask follow-up questions.",
    ],
  });
}

function buildDiscoveryTaskPrompt(transportMode = "mock-fixture") {
  return buildScenarioPrompt({
    transportMode,
    scenarioName: "DISCOVERY_SAMPLE",
    lines: [
    "#requirement-locked",
    "#scope-core",
    "Design a new enterprise execution workflow for a future product line.",
    "# Constraints",
    "The goal, non-goals, specialist ownership, and acceptance checks are not fixed yet.",
    "User decision is required before implementation.",
    "# Execution",
    "- First make the open questions explicit.",
    "- Do not implement anything.",
    "- Stop with STATUS: NEED_USER_INPUT.",
    ],
  });
}

function buildNaturalTaskPrompt(transportMode = "mock-fixture") {
  const targetRelative = "docs/CURRENT_ARCHITECTURE.md";
  const targetSentence =
    "- `natural_task_trace_summary.json` records the selected implementation-bearing turn id and thread id, so trace bundles stay anchored to the delegated turn even when later completions share the thread.";
  return buildScenarioPrompt({
    transportMode,
    scenarioName: "NATURAL_SAMPLE",
    lines: [
    "#requirement-locked",
    "# Goal",
    "Perform one small real repo documentation maintenance task.",
    "# Implementation Requirements",
    "Implementation is explicitly requested now. Requirements are fixed, so proceed directly to implementation.",
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
    "# Acceptance Criteria",
    "- Exactly one documentation file changes.",
    "- Reviewer evidence is present.",
    "- No follow-up questions are required.",
    "- Reviewer must remain read-only and report findings first or state 'No findings'.",
    `- Final reply must be exactly: NATURAL_TASK_OK ${targetRelative}`,
    ],
  });
}

function buildSignoffTaskPrompt(targetRelativePath, transportMode = "mock-fixture") {
  const evidenceTarget = "docs/EVIDENCE_CONTRACT.md";
  const architectureTarget = "docs/CURRENT_ARCHITECTURE.md";
  const changelogTarget = "docs/ARCHITECTURE_CHANGELOG.md";
  const evidenceBullet =
    "- `SIGNOFF_ASSURANCE` runs should surface reviewer/tester/doc-sync status in `review_load_breakdown.json` for operator signoff.";
  const architectureBullet =
    "- `SIGNOFF_ASSURANCE` sample runs keep planning depth, assurance depth, reviewer/tester execution, and doc-sync evidence co-located in signoff bundles.";
  const changelogLine =
    "- 2026-03-08: Added signoff assurance sample evidence wiring for planning/assurance trace and doc-sync bundle checks.";
  return buildScenarioPrompt({
    transportMode,
    scenarioName: "SIGNOFF_SAMPLE",
    lines: [
    "# Goal",
    "Complete one signoff-assurance maintenance task now.",
    "# Implementation Requirements",
    "Implementation is explicitly requested now. Requirements are fixed. Do not switch to proposal-only mode and do not ask follow-up questions.",
    "- Use the default parent orchestration path.",
    "- Delegate the implementation edits to infra_worker.",
    "- Request independent read-only reviewer and tester checks before finalizing.",
    `- Change ${targetRelativePath}, ${evidenceTarget}, ${architectureTarget}, and ${changelogTarget}.`,
    "- Do not modify any other file and do not revert unrelated edits.",
    "- Use apply_patch for file edits.",
    "- The implementation specialist must report using this exact header format:",
    "Owned paths:",
    "- `<absolute path>`",
    `- In ${targetRelativePath}, replace the single line \`gate: pending\` with \`gate: signed\`.`,
    `- In ${evidenceTarget}, add this exact bullet if it is not already present: ${evidenceBullet}`,
    `- In ${architectureTarget}, add this exact architecture bullet if it is not already present: ${architectureBullet}`,
    `- In ${changelogTarget}, add this exact changelog line if it is not already present: ${changelogLine}`,
    "# Acceptance Criteria",
    "- The target file contains `gate: signed`.",
    "- The evidence contract bullet is present.",
    "- The architecture bullet is present.",
    "- The changelog line is present.",
    "- Reviewer evidence is present and the reviewer remains read-only.",
    "- Tester evidence is present and includes pass/fail verification.",
    "- No follow-up questions are required.",
    `- Final reply must be exactly: SIGNOFF_TASK_OK ${targetRelativePath}`,
    ],
  });
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

async function runMeasuredBaseline(paths, transportMode) {
  fs.mkdirSync(paths.measuredBaselineRoot, { recursive: true });
  fs.mkdirSync(paths.measuredBaselineTurnsDir, { recursive: true });
  const fixtures = ensureMeasuredBaselineFixtureFiles(paths);
  const port = 57860 + Math.floor(Math.random() * 120);
  const normalizedTransportMode = normalizeProofTransportMode(transportMode);
  const baselineProfile = resolveBaselineProfile(normalizedTransportMode);
  const rawLikeBaseline = baselineProfile === "live-raw-codex-like";
  const env = {
    CODEX_UI_PORT: String(port),
    CODEX_AUTO_OPEN_BROWSER: "0",
    CODEX_DEFAULT_EXEC_AGENT: "default",
    CODEX_LOGGING_MODE: "PROOF",
    CODEX_EXECUTION_PROFILE: baselineProfile,
    CODEX_REQUEST_USER_INPUT_POLICY: "blocked",
    CODEX_PARENT_DISPATCH_GUARD_MODE: "off",
    CODEX_PARENT_DISPATCH_GUARD_MAX_RETRIES: "0",
    CODEX_REQUIREMENT_GUARD_ENABLED: rawLikeBaseline ? "0" : "1",
    CODEX_REQUIREMENT_LOCK_ENABLED: rawLikeBaseline ? "0" : "1",
    CODEX_REQUIREMENT_RBJ_ENABLED: "0",
    CODEX_ADVERSARIAL_SHADOW_ENABLED: "0",
    CODEX_ADVERSARIAL_LOOP_ENABLED: "0",
    CODEX_EVAL_MAX_CASES: "4",
    CODEX_HARNESS_MEMORY_PATH: paths.measuredBaselineHarnessMemoryPath,
    CODEX_EVAL_HISTORY_PATH: paths.measuredBaselineEvalRunsPath,
    CODEX_TURN_ARTIFACTS_DIR: paths.measuredBaselineTurnsDir,
    CODEX_OPERATION_LOG_PATH: paths.measuredBaselineOperationLogPath,
    CODEX_APP_SERVER_TRANSPORT: normalizedTransportMode,
  };
  const serverHandle = await startInProcessHarnessServer(env);
  const summary = {
    schema: "measured-baseline-summary.v1",
    generatedAt: new Date().toISOString(),
    profile: baselineProfile,
    transportMode: normalizedTransportMode,
    posture: {
      requestUserInputPolicy: "blocked",
      parentDispatchGuardMode: "off",
      requirementGuardEnabled: rawLikeBaseline ? 0 : 1,
      requirementLockEnabled: rawLikeBaseline ? 0 : 1,
      reviewerRequiredByProfile: 0,
      testerRequiredByProfile: 0,
    },
    runtime: null,
    samples: {},
  };
  try {
    const runtime = await waitForRuntime(port);
    summary.runtime = {
      executionProfile: runtime && runtime.executionProfile ? runtime.executionProfile : baselineProfile,
      transportMode: normalizedTransportMode,
      parentDispatchGuard: runtime && runtime.parentDispatchGuard ? runtime.parentDispatchGuard : null,
      requirementGuard: runtime && (runtime.requirementGuard || runtime.requirement_guard) ? (runtime.requirementGuard || runtime.requirement_guard) : null,
      adversarialShadow: runtime && runtime.adversarialShadow ? runtime.adversarialShadow : null,
    };

    const controlApi = runtime && runtime.controlApi && typeof runtime.controlApi === "object" ? runtime.controlApi : null;
    const token = controlApi && typeof controlApi.token === "string" ? controlApi.token.trim() : "";
    const tokenHeader =
      controlApi && typeof controlApi.tokenHeader === "string" ? controlApi.tokenHeader.trim() : "x-codex-control-token";
    assert(token, "baseline runtime control token missing");
    const authHeaders = {
      [tokenHeader]: token,
      Origin: `http://127.0.0.1:${port}`,
      Referer: `http://127.0.0.1:${port}/`,
    };

    const runSample = async ({
      key,
      prompt,
      tracePath,
      executionIntent,
      expectNeedsInput = false,
      allowValidationFailure = false,
      assertTarget = null,
    }) => {
      const response = await runExecViaHttp({
        port,
        headers: authHeaders,
        body: {
          prompt,
          agentName: "default",
          sandboxMode: "workspace-write",
          approvalPolicy: "never",
          cwd: workspaceRoot,
          requestUserInputPolicy: "blocked",
          executionProfile: baselineProfile,
          executionIntent,
          executionSource: "measured_baseline_script",
          forceNewSession: true,
          idempotencyKey: `measured-baseline-${key}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
        },
        timeoutMs: 240000,
      });
      const turnId =
        (response.turnCompleted && response.turnCompleted.turnId) ||
        (response.turnStarted && response.turnStarted.turnId) ||
        "";
      assert(turnId, `baseline ${key} turn id missing`);
      const memoryMatch = await waitForMemoryRecord(
        paths.measuredBaselineHarnessMemoryPath,
        (entry) => entry && entry.turnId === turnId,
        45000
      );
      const memoryRecord = memoryMatch.match;
      const artifactRecord = findTurnArtifactManifest(paths.measuredBaselineTurnsDir, turnId);
      assert(artifactRecord, `baseline ${key} artifact manifest missing`);
      const flowTrace = loadArtifactSiblingJson(artifactRecord, "flow_trace_summary.json");
      const stageTimeline = loadArtifactSiblingJson(artifactRecord, "stage_timeline.json");
      const evidenceManifest = loadArtifactSiblingJson(artifactRecord, "evidence_manifest.json");
      const reviewLoadBreakdown = loadArtifactSiblingJson(artifactRecord, "review_load_breakdown.json");
      const observedSignals = getObservedSignals(memoryRecord);
      const parentDispatchGuard = getParentDispatchGuard(memoryRecord);
      const outcome = memoryRecord && typeof memoryRecord.taskOutcomeStatus === "string" ? memoryRecord.taskOutcomeStatus : "";
      const assertions = {
        tracePresent: Boolean(flowTrace && stageTimeline && evidenceManifest),
        proposalOnlyDispatchSafe: expectNeedsInput
          ? (
              Number(observedSignals.dispatchSuccessCount || 0) === 0 ||
              Number(parentDispatchGuard.satisfied || 0) === 1
            )
          : Number(observedSignals.dispatchSuccessCount || 0) === 0,
        noReviewer: Boolean(flowTrace && Number(flowTrace.reviewerExecuted || 0) === 0),
        noTester: Boolean(flowTrace && Number(flowTrace.testerExecuted || 0) === 0),
        needsInputExpected: expectNeedsInput ? outcome === "NEEDS_INPUT" : outcome !== "NEEDS_INPUT",
        validationOutcomeAccepted: expectNeedsInput
          ? outcome === "NEEDS_INPUT"
          : allowValidationFailure
            ? outcome === "FAILED_VALIDATION" || outcome === "COMPLETED"
            : outcome === "COMPLETED",
        targetCheck: typeof assertTarget === "function" ? Boolean(assertTarget()) : true,
      };
      const traceSummary = {
        generatedAt: new Date().toISOString(),
        profile: baselineProfile,
        transportMode: normalizedTransportMode,
        turnId,
        responseFinalText: response.finalText,
        turn: {
          status: memoryRecord.status,
          taskOutcomeStatus: memoryRecord.taskOutcomeStatus,
          taskOutcomeReason: memoryRecord.taskOutcomeReason,
        },
        observedSignals,
        parentDispatchGuard,
        artifactManifestPath: artifactRecord.path,
        flowTraceSummary: flowTrace,
        stageTimeline,
        evidenceManifest,
        reviewLoadBreakdown,
        assertions,
      };
      writeJson(tracePath, traceSummary);
      assert(allAssertionsPass(assertions), `baseline ${key} assertions failed: ${JSON.stringify(assertions)}`);
      summary.samples[key] = {
        turnId,
        tracePath,
        taskOutcomeStatus: memoryRecord.taskOutcomeStatus,
        taskOutcomeReason: memoryRecord.taskOutcomeReason,
      };
      return traceSummary;
    };

    const fastTargetRelative = repoRelative(fixtures.fastTargetPath);
    await runSample({
      key: "fast",
      prompt: buildFastBaselinePrompt(fastTargetRelative, normalizedTransportMode),
      tracePath: paths.baselineFastTaskTraceSummaryPath,
      executionIntent: "baseline_fast_sample",
      allowValidationFailure: true,
      assertTarget: () => fs.readFileSync(fixtures.fastTargetPath, "utf8").includes("status: fresh"),
    });

    await runSample({
      key: "discovery",
      prompt: buildDiscoveryBaselinePrompt(normalizedTransportMode),
      tracePath: paths.baselineDiscoveryTaskTraceSummaryPath,
      executionIntent: "baseline_discovery_sample",
      expectNeedsInput: true,
      allowValidationFailure: false,
    });

    const signoffTargetRelative = repoRelative(fixtures.signoffTargetPath);
    const evidenceRelativePath = repoRelative(fixtures.evidencePath);
    const architectureRelativePath = repoRelative(fixtures.architecturePath);
    const changelogRelativePath = repoRelative(fixtures.changelogPath);
    await runSample({
      key: "signoff",
      prompt: buildSignoffBaselinePrompt(
        signoffTargetRelative,
        evidenceRelativePath,
        architectureRelativePath,
        changelogRelativePath,
        normalizedTransportMode
      ),
      tracePath: paths.baselineSignoffTaskTraceSummaryPath,
      executionIntent: "baseline_signoff_sample",
      allowValidationFailure: true,
      assertTarget: () =>
        fs.readFileSync(fixtures.signoffTargetPath, "utf8").includes("gate: signed") &&
        fs.readFileSync(fixtures.evidencePath, "utf8").includes("review_load_breakdown.json") &&
        fs.readFileSync(fixtures.changelogPath, "utf8").includes("signoff assurance sample evidence wiring"),
    });

    const naturalTargetRelative = repoRelative(fixtures.naturalTargetPath);
    const naturalTargetSentence =
      "- `natural_task_trace_summary.json` records the selected implementation-bearing turn id and thread id, so trace bundles stay anchored to the delegated turn even when later completions share the thread.";
    await runSample({
      key: "natural",
      prompt: buildNaturalBaselinePrompt(naturalTargetRelative, naturalTargetSentence, normalizedTransportMode),
      tracePath: paths.baselineNaturalTaskTraceSummaryPath,
      executionIntent: "baseline_natural_sample",
      allowValidationFailure: true,
      assertTarget: () => fs.readFileSync(fixtures.naturalTargetPath, "utf8").includes(naturalTargetSentence),
    });

    writeJson(paths.measuredBaselineSummaryPath, summary);
    return summary;
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    writeJson(paths.measuredBaselineSummaryPath, summary);
    throw error;
  } finally {
    await serverHandle.stop();
  }
}

const resumableStageOrder = Object.freeze([
  "eval",
  "fast",
  "discovery",
  "signoff",
  "natural",
  "measured_baseline",
  "raw_direct_baseline",
  "comparison",
  "conformance",
]);

const resumableStageLabels = Object.freeze({
  eval: "core_harness_workflow_eval",
  fast: "fast_lane",
  discovery: "discovery_lane",
  signoff: "signoff_lane",
  natural: "natural_lane",
  measured_baseline: "measured_baseline",
  raw_direct_baseline: "raw_direct_baseline",
  comparison: "baseline_comparison",
  conformance: "conformance_operator_bundle",
});

function loadOptionalJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function normalizeStageKey(value) {
  const raw = safeString(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const aliases = {
    measured: "measured_baseline",
    measured_baseline: "measured_baseline",
    measuredbaseline: "measured_baseline",
    raw: "raw_direct_baseline",
    raw_direct: "raw_direct_baseline",
    raw_direct_baseline: "raw_direct_baseline",
    rawdirectbaseline: "raw_direct_baseline",
  };
  return aliases[raw] || raw;
}

function parseCliOptions(argv = process.argv.slice(2)) {
  const options = {
    bundleRoot: safeString(process.env.CODEX_SIGNOFF_BUNDLE_ROOT, 400),
    resume: /^(1|true|yes)$/i.test(safeString(process.env.CODEX_SIGNOFF_RESUME, 20)),
    stopAfterStage: normalizeStageKey(process.env.CODEX_SIGNOFF_STOP_AFTER),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = safeString(argv[index], 120);
    if (!token) {
      continue;
    }
    if (token === "--bundle-root") {
      index += 1;
      options.bundleRoot = safeString(argv[index], 400);
      continue;
    }
    if (token === "--resume") {
      options.resume = true;
      continue;
    }
    if (token === "--stop-after") {
      index += 1;
      options.stopAfterStage = normalizeStageKey(argv[index]);
      continue;
    }
    if (token === "--help") {
      options.help = true;
      continue;
    }
    throw new Error(`unknown argument: ${token}`);
  }
  if (options.stopAfterStage && !resumableStageOrder.includes(options.stopAfterStage)) {
    throw new Error(`unsupported stop-after stage: ${options.stopAfterStage}`);
  }
  return options;
}

function createResumeState(paths, modes) {
  return {
    schema: "signoff-resume-state.v1",
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    bundleRoot: repoRelative(paths.bundleRoot),
    transportMode: modes.transportMode,
    baselineTransportMode: modes.baselineTransportMode,
    directBaselineTransportMode: modes.directBaselineTransportMode,
    currentStage: "",
    completedStages: [],
    pendingStages: resumableStageOrder.slice(),
    overallStatus: "in_progress",
    canResume: 1,
    stopAfterStage: modes.stopAfterStage || "",
    stageResults: {},
    lastError: "",
  };
}

function syncResumeStateLists(state) {
  const stageResults = state && state.stageResults && typeof state.stageResults === "object" ? state.stageResults : {};
  const completedStages = [];
  const pendingStages = [];
  for (const stageKey of resumableStageOrder) {
    if (stageResults[stageKey] && stageResults[stageKey].status === "completed") {
      completedStages.push(stageKey);
      continue;
    }
    pendingStages.push(stageKey);
  }
  state.completedStages = completedStages;
  state.pendingStages = pendingStages;
  return state;
}

function writeResumeState(paths, state) {
  const nextState = state && typeof state === "object" ? state : {};
  nextState.updatedAt = new Date().toISOString();
  syncResumeStateLists(nextState);
  writeJson(paths.resumeStatePath, nextState);
  return nextState;
}

function loadResumeState(paths, options, modes) {
  const existing = loadOptionalJson(paths.resumeStatePath);
  if (!existing) {
    return writeResumeState(paths, createResumeState(paths, modes));
  }
  if (!options.resume) {
    throw new Error(`bundle root already exists: ${paths.bundleRoot}; pass --resume to continue`);
  }
  if (
    safeString(existing.transportMode, 40) &&
    safeString(existing.transportMode, 40) !== safeString(modes.transportMode, 40)
  ) {
    throw new Error(`resume transport mismatch: bundle=${existing.transportMode} current=${modes.transportMode}`);
  }
  if (
    safeString(existing.baselineTransportMode, 40) &&
    safeString(existing.baselineTransportMode, 40) !== safeString(modes.baselineTransportMode, 40)
  ) {
    throw new Error(
      `resume baseline transport mismatch: bundle=${existing.baselineTransportMode} current=${modes.baselineTransportMode}`
    );
  }
  if (
    safeString(existing.directBaselineTransportMode, 40) &&
    safeString(existing.directBaselineTransportMode, 40) !== safeString(modes.directBaselineTransportMode, 40)
  ) {
    throw new Error(
      `resume direct baseline transport mismatch: bundle=${existing.directBaselineTransportMode} current=${modes.directBaselineTransportMode}`
    );
  }
  existing.stopAfterStage = modes.stopAfterStage || existing.stopAfterStage || "";
  existing.overallStatus = safeString(existing.overallStatus, 40) || "in_progress";
  existing.canResume = 1;
  return writeResumeState(paths, existing);
}

function beginStage(paths, state, stageKey) {
  const startedAt = Date.now();
  state.currentStage = stageKey;
  state.overallStatus = "in_progress";
  state.lastError = "";
  state.stageResults[stageKey] = {
    key: stageKey,
    label: resumableStageLabels[stageKey] || stageKey,
    status: "running",
    startedAt,
    completedAt: 0,
    durationMs: 0,
    refs: [],
    note: "",
    error: "",
  };
  writeResumeState(paths, state);
  return startedAt;
}

function completeStage(paths, state, stageKey, startedAt, info = {}) {
  const completedAt = Date.now();
  state.currentStage = "";
  state.stageResults[stageKey] = {
    ...(state.stageResults[stageKey] || {}),
    key: stageKey,
    label: resumableStageLabels[stageKey] || stageKey,
    status: "completed",
    startedAt: Number.isFinite(Number(startedAt)) ? Math.trunc(Number(startedAt)) : completedAt,
    completedAt,
    durationMs: Number.isFinite(Number(startedAt)) ? Math.max(0, completedAt - Math.trunc(Number(startedAt))) : 0,
    refs: Array.isArray(info.refs) ? info.refs : [],
    note: safeString(info.note, 320),
    error: "",
    metadata: info.metadata && typeof info.metadata === "object" ? info.metadata : {},
  };
  writeResumeState(paths, state);
}

function failStage(paths, state, stageKey, startedAt, error) {
  const completedAt = Date.now();
  state.currentStage = stageKey;
  state.overallStatus = "failed";
  state.lastError = error instanceof Error ? error.message : String(error);
  state.stageResults[stageKey] = {
    ...(state.stageResults[stageKey] || {}),
    key: stageKey,
    label: resumableStageLabels[stageKey] || stageKey,
    status: "failed",
    startedAt: Number.isFinite(Number(startedAt)) ? Math.trunc(Number(startedAt)) : completedAt,
    completedAt,
    durationMs: Number.isFinite(Number(startedAt)) ? Math.max(0, completedAt - Math.trunc(Number(startedAt))) : 0,
    refs: Array.isArray(state.stageResults[stageKey] && state.stageResults[stageKey].refs)
      ? state.stageResults[stageKey].refs
      : [],
    note: "",
    error: state.lastError,
  };
  writeResumeState(paths, state);
}

function isStageCompleted(state, stageKey) {
  return Boolean(state && state.stageResults && state.stageResults[stageKey] && state.stageResults[stageKey].status === "completed");
}

function nextPendingStage(state) {
  syncResumeStateLists(state);
  return state.pendingStages[0] || "";
}

function shouldStopAfterStage(stopAfterStage, stageKey) {
  return Boolean(stopAfterStage && stopAfterStage === stageKey);
}

function findDominantStage(stageTimeline) {
  const stages = Array.isArray(stageTimeline && stageTimeline.stages) ? stageTimeline.stages : [];
  const ranked = stages
    .map((entry) => ({
      name: safeString(entry && entry.name, 120),
      durationMs: Number(entry && entry.durationMs) || 0,
    }))
    .sort((left, right) => right.durationMs - left.durationMs);
  return ranked[0] || { name: "", durationMs: 0 };
}

function sampleBreakdownFromTraceMap(traceMap) {
  return Object.entries(traceMap || {})
    .map(([key, trace]) => {
      const metric = trace ? metricFromTrace(trace) : null;
      return {
        key,
        durationMs: metric ? metric.totalDurationMs : 0,
        evidenceQualityScore: metric ? metric.evidenceQualityScore : 0,
        discoveryEvidenceScore: metric ? metric.discoveryEvidenceScore : 0,
        transportMode: metric ? metric.transportMode : null,
      };
    })
    .filter((entry) => entry.durationMs > 0 || entry.evidenceQualityScore > 0 || entry.discoveryEvidenceScore > 0);
}

function buildLaneLatencySummary(paths, resumeState) {
  const state = resumeState && typeof resumeState === "object" ? resumeState : createResumeState(paths, {});
  const tracePaths = {
    fast: paths.fastTaskTraceSummaryPath,
    discovery: paths.discoveryTaskTraceSummaryPath,
    signoff: paths.signoffTaskTraceSummaryPath,
    natural: paths.naturalTaskTraceSummaryPath,
    measured_baseline: null,
    raw_direct_baseline: null,
  };
  const measuredTraceMap = {
    fast: loadOptionalJson(paths.baselineFastTaskTraceSummaryPath),
    discovery: loadOptionalJson(paths.baselineDiscoveryTaskTraceSummaryPath),
    signoff: loadOptionalJson(paths.baselineSignoffTaskTraceSummaryPath),
    natural: loadOptionalJson(paths.baselineNaturalTaskTraceSummaryPath),
  };
  const rawDirectTraceMap = {
    fast: loadOptionalJson(paths.rawDirectFastTaskTraceSummaryPath),
    discovery: loadOptionalJson(paths.rawDirectDiscoveryTaskTraceSummaryPath),
    signoff: loadOptionalJson(paths.rawDirectSignoffTaskTraceSummaryPath),
    natural: loadOptionalJson(paths.rawDirectNaturalTaskTraceSummaryPath),
  };
  const stages = resumableStageOrder.map((stageKey) => {
    const result = state.stageResults && state.stageResults[stageKey] ? state.stageResults[stageKey] : null;
    const trace = tracePaths[stageKey] ? loadOptionalJson(tracePaths[stageKey]) : null;
    const metric = trace ? metricFromTrace(trace) : null;
    const dominantStage = findDominantStage(trace && trace.stageTimeline);
    const reviewLoadBreakdown = trace && trace.reviewLoadBreakdown && typeof trace.reviewLoadBreakdown === "object"
      ? trace.reviewLoadBreakdown
      : null;
    const sampleBreakdown =
      stageKey === "measured_baseline"
        ? sampleBreakdownFromTraceMap(measuredTraceMap)
        : stageKey === "raw_direct_baseline"
          ? sampleBreakdownFromTraceMap(rawDirectTraceMap)
          : [];
    return {
      key: stageKey,
      label: resumableStageLabels[stageKey] || stageKey,
      status: result ? safeString(result.status, 40) : "pending",
      wallClockMs: result ? Number(result.durationMs || 0) : 0,
      startedAt: result ? Number(result.startedAt || 0) : 0,
      completedAt: result ? Number(result.completedAt || 0) : 0,
      turnDurationMs: metric ? metric.totalDurationMs : 0,
      dominantTurnStage: dominantStage.name || "",
      dominantTurnStageDurationMs: Number(dominantStage.durationMs || 0),
      qualityGateHotspot: reviewLoadBreakdown ? safeString(reviewLoadBreakdown.dominantBottleneck, 80) || "none" : "",
      qualityGateDurationMs: reviewLoadBreakdown ? Number(reviewLoadBreakdown.totalStep4DurationMs || 0) : 0,
      refs: result && Array.isArray(result.refs) ? result.refs : [],
      sampleBreakdown,
    };
  });
  const completedStages = stages.filter((entry) => entry.status === "completed");
  const rankedByWallClock = completedStages.slice().sort((left, right) => right.wallClockMs - left.wallClockMs);
  return {
    schema: "lane-latency-summary.v1",
    generatedAt: new Date().toISOString(),
    bundleRoot: repoRelative(paths.bundleRoot),
    transportMode: safeString(state.transportMode, 40),
    baselineTransportMode: safeString(state.baselineTransportMode, 40),
    directBaselineTransportMode: safeString(state.directBaselineTransportMode, 40),
    stages,
    totals: {
      completedStageCount: completedStages.length,
      observedWallClockMs: completedStages.reduce((sum, entry) => sum + Number(entry.wallClockMs || 0), 0),
      slowestStage: rankedByWallClock[0] ? rankedByWallClock[0].key : "",
      slowestStageWallClockMs: rankedByWallClock[0] ? Number(rankedByWallClock[0].wallClockMs || 0) : 0,
      topHotspots: rankedByWallClock.slice(0, 5).map((entry) => ({
        key: entry.key,
        wallClockMs: Number(entry.wallClockMs || 0),
        dominantTurnStage: entry.dominantTurnStage,
        qualityGateHotspot: entry.qualityGateHotspot || "",
      })),
    },
  };
}

function writeLaneLatencySummary(paths, resumeState) {
  const summary = buildLaneLatencySummary(paths, resumeState);
  writeJson(paths.laneLatencySummaryPath, summary);
  return summary;
}

function buildSummaryPaths(paths) {
  return {
    runtimeSnapshot: paths.runtimeSnapshotPath,
    coreHarnessWorkflowRun: paths.coreHarnessWorkflowRunPath,
    fastTaskTraceSummary: paths.fastTaskTraceSummaryPath,
    discoveryTaskTraceSummary: paths.discoveryTaskTraceSummaryPath,
    signoffTaskTraceSummary: paths.signoffTaskTraceSummaryPath,
    naturalTaskTraceSummary: paths.naturalTaskTraceSummaryPath,
    latestRunSummary: paths.latestRunSummaryPath,
    reviewLoadBreakdown: paths.reviewLoadBreakdownPath,
    laneLatencySummary: paths.laneLatencySummaryPath,
    resumeState: paths.resumeStatePath,
    measuredBaselineSummary: paths.measuredBaselineSummaryPath,
    baselineFastTaskTraceSummary: paths.baselineFastTaskTraceSummaryPath,
    baselineDiscoveryTaskTraceSummary: paths.baselineDiscoveryTaskTraceSummaryPath,
    baselineSignoffTaskTraceSummary: paths.baselineSignoffTaskTraceSummaryPath,
    baselineNaturalTaskTraceSummary: paths.baselineNaturalTaskTraceSummaryPath,
    rawDirectBaselineSummary: paths.rawDirectBaselineSummaryPath,
    rawDirectFastTaskTraceSummary: paths.rawDirectFastTaskTraceSummaryPath,
    rawDirectDiscoveryTaskTraceSummary: paths.rawDirectDiscoveryTaskTraceSummaryPath,
    rawDirectSignoffTaskTraceSummary: paths.rawDirectSignoffTaskTraceSummaryPath,
    rawDirectNaturalTaskTraceSummary: paths.rawDirectNaturalTaskTraceSummaryPath,
    baselineComparisonReport: paths.baselineComparisonReportPath,
    speedVsAssuranceReport: paths.speedVsAssuranceReportPath,
    harnessExecutionMemory: paths.harnessMemoryPath,
    evalRuns: paths.evalRunsPath,
    turnsDir: paths.turnsDir,
    measuredBaselineTurnsDir: paths.measuredBaselineTurnsDir,
    rawRoot: paths.rawRoot,
    operationLog: paths.operationLogBasePath,
    measuredBaselineRoot: paths.measuredBaselineRoot,
    rawDirectBaselineRoot: paths.rawDirectBaselineRoot,
    bundleSurfaceMap: paths.bundleSurfaceMapPath,
    signoffSummary: paths.summaryPath,
    conformanceReport: paths.conformanceReportPath,
    operatorViewSummary: paths.operatorViewSummaryPath,
  };
}

function buildInitialSummary(paths, modes) {
  return {
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    executionMode: "split-resumable",
    bundleRoot: paths.bundleRoot,
    transportMode: modes.transportMode,
    baselineTransportMode: modes.baselineTransportMode,
    directBaselineTransportMode: modes.directBaselineTransportMode,
    paths: buildSummaryPaths(paths),
    runtime: null,
    coreHarnessWorkflow: null,
    fastTask: null,
    discoveryTask: null,
    signoffTask: null,
    naturalTask: null,
    measuredBaseline: null,
    rawDirectBaseline: null,
    baselineComparison: null,
    assertions: null,
    allPassed: false,
  };
}

function refreshSummary(summary, paths, resumeState, modes) {
  const next = summary && typeof summary === "object" ? summary : buildInitialSummary(paths, modes);
  next.updatedAt = new Date().toISOString();
  next.executionMode = "split-resumable";
  next.bundleRoot = paths.bundleRoot;
  next.transportMode = modes.transportMode;
  next.baselineTransportMode = modes.baselineTransportMode;
  next.directBaselineTransportMode = modes.directBaselineTransportMode;
  next.paths = buildSummaryPaths(paths);
  next.resume = {
    canResume: 1,
    statePath: paths.resumeStatePath,
    currentStage: safeString(resumeState && resumeState.currentStage, 80),
    nextPendingStage: nextPendingStage(resumeState),
    stopAfterStage: safeString(modes.stopAfterStage, 80),
  };
  return next;
}

function summarizeRawDirectItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const type = safeString(item.type, 80) || "unknown";
  if (type === "fileChange") {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    return {
      type,
      detail: changes
        .map((change) => `${safeString(change && change.kind, 40) || "change"}:${safeString(change && change.path, 260)}`)
        .filter(Boolean)
        .slice(0, 6)
        .join(", "),
    };
  }
  if (type === "commandExecution") {
    return {
      type,
      detail: safeString(item.command, 260),
    };
  }
  if (type === "agentMessage") {
    return {
      type,
      detail: safeString(item.text, 260),
    };
  }
  return {
    type,
    detail: safeString(item.detail || item.summary || "", 260),
  };
}

function collectRawDirectChangedArtifacts(items, max = 16) {
  const out = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || item.type !== "fileChange" || !Array.isArray(item.changes)) {
      continue;
    }
    for (const change of item.changes) {
      const targetPath = safeString(change && change.path, 320);
      if (!targetPath || out.includes(targetPath)) {
        continue;
      }
      out.push(targetPath);
      if (out.length >= max) {
        return out;
      }
    }
  }
  return out;
}

function extractMeaningfulQuestionsFromText(text, max = 8) {
  const out = [];
  for (const line of safeString(text, 12000).split(/\r?\n/)) {
    const normalized = safeString(line, 320).replace(/^[-*+\d.)\s]+/, "");
    if (!normalized || !normalized.includes("?")) {
      continue;
    }
    if (/^status:/i.test(normalized) || /^question/i.test(normalized) === false && normalized.length < 8) {
      continue;
    }
    if (out.includes(normalized)) {
      continue;
    }
    out.push(normalized);
    if (out.length >= max) {
      break;
    }
  }
  return out;
}

function buildRawDirectTraceSummary({
  tracePath,
  key,
  prompt,
  response,
  transportMode,
  expectNeedsInput = false,
  explicitVerificationPassed = false,
  assertTargetLabel = "",
} = {}) {
  const finalText = safeString(response && response.finalText, 12000);
  const meaningfulOpenQuestions = extractMeaningfulQuestionsFromText(finalText);
  const lowerFinalText = finalText.toLowerCase();
  const discoverySignals = {
    assumptions: /assumption|assume|仮定/i.test(finalText) ? 1 : 0,
    nonGoals: /non-goal|non goal|out of scope/i.test(finalText) ? 1 : 0,
    decisionBoundary: /decision boundary|boundary|blocker|do not implement|proposal-only/i.test(finalText) ? 1 : 0,
    needsInput: /status:\s*need[_ -]?user[_ -]?input|status:\s*needs[_ -]?input|needs[_ -]?input|need[_ -]?user[_ -]?input/i.test(finalText)
      ? 1
      : 0,
  };
  const changedArtifacts = collectRawDirectChangedArtifacts(response && response.items);
  const taskOutcomeStatus = expectNeedsInput
    ? discoverySignals.needsInput || meaningfulOpenQuestions.length > 0
      ? "NEEDS_INPUT"
      : "FAILED_VALIDATION"
    : explicitVerificationPassed
      ? "COMPLETED"
      : safeString(response && response.finalStatus, 40).toLowerCase() === "completed"
        ? "PARTIAL"
        : "FAILED_VALIDATION";
  const taskOutcomeReason = expectNeedsInput
    ? taskOutcomeStatus === "NEEDS_INPUT"
      ? "raw_direct_discovery_boundary_detected"
      : "raw_direct_discovery_boundary_missing"
    : explicitVerificationPassed
      ? "raw_direct_target_verified"
      : safeString(assertTargetLabel, 120) || "raw_direct_target_unverified";
  const traceSummary = {
    schema: "raw-direct-baseline-trace.v1",
    generatedAt: new Date().toISOString(),
    key,
    transportMode,
    directness: "app-server-direct",
    profile: "raw-codex-direct",
    promptSummary: safeString(prompt, 400),
    threadId: safeString(response && response.threadId, 120),
    turnId: safeString(response && response.turnId, 120),
    wallClockMs: Number(response && response.wallClockMs) || 0,
    finalText,
    errorText: safeString(response && response.errorText, 1200),
    changedArtifacts,
    meaningfulOpenQuestions,
    discoverySignals,
    itemCounts: response && response.itemCounts && typeof response.itemCounts === "object" ? response.itemCounts : {},
    itemSummaries: Array.isArray(response && response.itemSummaries) ? response.itemSummaries : [],
    assertions: {
      directTurnCompleted: safeString(response && response.finalStatus, 40).toLowerCase() === "completed",
      explicitVerificationPassed: explicitVerificationPassed ? 1 : 0,
      discoveryBoundaryDetected: expectNeedsInput ? discoverySignals.needsInput || meaningfulOpenQuestions.length > 0 ? 1 : 0 : 0,
    },
    turn: {
      status: safeString(response && response.finalStatus, 40),
      taskOutcomeStatus,
      taskOutcomeReason,
    },
    flowTraceSummary: {
      selectedPlanningDepth: null,
      selectedAssuranceDepth: null,
      executionFlow: "RAW_DIRECT_BASELINE",
      dispatchCount: 0,
      dispatchSuccessCount: 0,
      reviewerExecuted: 0,
      testerExecuted: 0,
      evidenceSources: ["raw_direct_stream"],
      acceptanceSummary: {
        passCount: explicitVerificationPassed ? 1 : 0,
        failCount: explicitVerificationPassed ? 0 : 1,
      },
      docSyncEvidence: {
        status: "SKIPPED",
      },
      finalOutcome: {
        taskOutcomeStatus,
      },
    },
    stageTimeline: {
      schema: "stage-timeline.v1",
      stages: [
        {
          name: "Direct Execution",
          durationMs: Number(response && response.wallClockMs) || 0,
        },
      ],
    },
    evidenceManifest: {
      requirementContract: {
        openQuestions: meaningfulOpenQuestions,
        assumptions: discoverySignals.assumptions ? ["Raw direct response surfaced assumption language."] : [],
        nonGoals: discoverySignals.nonGoals ? ["Raw direct response surfaced non-goal language."] : [],
      },
      dispatchPlan: {
        proposalOnly: expectNeedsInput ? 1 : 0,
      },
    },
  };
  writeJson(tracePath, traceSummary);
  return traceSummary;
}

async function runRawDirectAppServerTurn({ client, prompt, cwd, timeoutMs = 240000 }) {
  const thread = await client.sendRequest(
    "thread/start",
    {
      cwd,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      config: {
        web_search: "disabled",
        "harness.request_user_input_policy": "blocked",
      },
      experimentalRawEvents: false,
    },
    45000
  );
  const threadId = thread && thread.thread && typeof thread.thread.id === "string" ? thread.thread.id : "";
  assert(threadId, "raw direct baseline thread id missing");
  const turn = await client.sendRequest(
    "turn/start",
    {
      threadId,
      input: [{ type: "text", text: prompt, text_elements: [] }],
      approvalPolicy: "never",
      cwd,
    },
    120000
  );
  const turnId = turn && turn.turn && typeof turn.turn.id === "string" ? turn.turn.id : "";
  assert(turnId, "raw direct baseline turn id missing");
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    let finalText = "";
    let finalStatus = "";
    let errorText = "";
    const items = [];
    const itemCounts = {};
    let settled = false;
    let unsubscribe = () => {};
    const finish = (fn) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      unsubscribe();
      fn();
    };
    const timeoutHandle = setTimeout(async () => {
      try {
        await client.interruptTurn(threadId, turnId);
      } catch {
        // best effort
      }
      finish(() => reject(new Error(`raw direct baseline turn timed out: ${turnId}`)));
    }, timeoutMs);
    unsubscribe = client.watchTurn(threadId, turnId, {
      onDelta: (delta) => {
        if (typeof delta === "string" && delta) {
          finalText += delta;
        }
      },
      onItemCompleted: (item) => {
        if (!item || typeof item !== "object") {
          return;
        }
        items.push(item);
        const type = safeString(item.type, 80) || "unknown";
        itemCounts[type] = (itemCounts[type] || 0) + 1;
        if (item.type === "agentMessage" && typeof item.text === "string") {
          finalText = item.text;
        }
      },
      onError: (message) => {
        if (!errorText) {
          errorText = safeString(message, 1200);
        }
      },
      onCompleted: (turnRecord) => {
        finalStatus = safeString(turnRecord && turnRecord.status, 40) || "completed";
        finish(() =>
          resolve({
            threadId,
            turnId,
            finalStatus,
            finalText,
            errorText,
            items,
            itemCounts,
            itemSummaries: items.map(summarizeRawDirectItem).filter(Boolean).slice(0, 16),
            wallClockMs: Math.max(0, Date.now() - startedAt),
          })
        );
      },
      onFatal: (error) => {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      },
    });
  });
}

async function runRawDirectBaseline(paths, transportMode, CodexAppServerClient) {
  fs.mkdirSync(paths.rawDirectBaselineRoot, { recursive: true });
  const normalizedTransportMode = normalizeProofTransportMode(transportMode);
  const summary = {
    schema: "raw-direct-baseline-summary.v1",
    generatedAt: new Date().toISOString(),
    status: "unavailable",
    directness: "app-server-direct",
    profile: "raw-codex-direct",
    transportMode: normalizedTransportMode,
    samples: {},
  };
  if (normalizedTransportMode !== "stdio") {
    summary.reason = "raw direct baseline requires stdio transport";
    writeJson(paths.rawDirectBaselineSummaryPath, summary);
    return summary;
  }
  if (!CodexAppServerClient) {
    summary.reason = "CodexAppServerClient export unavailable";
    writeJson(paths.rawDirectBaselineSummaryPath, summary);
    return summary;
  }
  const fixtures = ensureMeasuredBaselineFixtureFiles({ measuredBaselineRoot: paths.rawDirectBaselineRoot });
  const directClient = new CodexAppServerClient(workspaceRoot);
  const runSample = async ({
    key,
    prompt,
    tracePath,
    expectNeedsInput = false,
    assertTarget = null,
    assertTargetLabel = "",
  }) => {
    try {
      const response = await runRawDirectAppServerTurn({
        client: directClient,
        prompt,
        cwd: workspaceRoot,
        timeoutMs: 240000,
      });
      const explicitVerificationPassed = typeof assertTarget === "function" ? Boolean(assertTarget()) : true;
      const traceSummary = buildRawDirectTraceSummary({
        tracePath,
        key,
        prompt,
        response,
        transportMode: normalizedTransportMode,
        expectNeedsInput,
        explicitVerificationPassed,
        assertTargetLabel,
      });
      summary.samples[key] = {
        turnId: traceSummary.turnId,
        threadId: traceSummary.threadId,
        tracePath,
        taskOutcomeStatus: traceSummary.turn.taskOutcomeStatus,
        verificationPassed: explicitVerificationPassed ? 1 : 0,
      };
    } catch (error) {
      summary.samples[key] = {
        error: error instanceof Error ? error.message : String(error),
        tracePath,
      };
    }
  };

  try {
    await runSample({
      key: "fast",
      prompt: buildFastBaselinePrompt(repoRelative(fixtures.fastTargetPath), normalizedTransportMode),
      tracePath: paths.rawDirectFastTaskTraceSummaryPath,
      assertTarget: () => fs.readFileSync(fixtures.fastTargetPath, "utf8").includes("status: fresh"),
      assertTargetLabel: "fast_target_fresh",
    });
    await runSample({
      key: "discovery",
      prompt: buildDiscoveryBaselinePrompt(normalizedTransportMode),
      tracePath: paths.rawDirectDiscoveryTaskTraceSummaryPath,
      expectNeedsInput: true,
      assertTargetLabel: "discovery_needs_input",
    });
    await runSample({
      key: "signoff",
      prompt: buildSignoffBaselinePrompt(
        repoRelative(fixtures.signoffTargetPath),
        repoRelative(fixtures.evidencePath),
        repoRelative(fixtures.architecturePath),
        repoRelative(fixtures.changelogPath),
        normalizedTransportMode
      ),
      tracePath: paths.rawDirectSignoffTaskTraceSummaryPath,
      assertTarget: () =>
        fs.readFileSync(fixtures.signoffTargetPath, "utf8").includes("gate: signed") &&
        fs.readFileSync(fixtures.evidencePath, "utf8").includes("review_load_breakdown.json") &&
        fs.readFileSync(fixtures.changelogPath, "utf8").includes("signoff assurance sample evidence wiring"),
      assertTargetLabel: "signoff_targets_verified",
    });
    const naturalTargetSentence =
      "- `natural_task_trace_summary.json` records the selected implementation-bearing turn id and thread id, so trace bundles stay anchored to the delegated turn even when later completions share the thread.";
    await runSample({
      key: "natural",
      prompt: buildNaturalBaselinePrompt(repoRelative(fixtures.naturalTargetPath), naturalTargetSentence, normalizedTransportMode),
      tracePath: paths.rawDirectNaturalTaskTraceSummaryPath,
      assertTarget: () => fs.readFileSync(fixtures.naturalTargetPath, "utf8").includes(naturalTargetSentence),
      assertTargetLabel: "natural_doc_note_present",
    });
    summary.status = Object.values(summary.samples).some((entry) => entry && entry.turnId) ? "ok" : "failed";
    writeJson(paths.rawDirectBaselineSummaryPath, summary);
    return summary;
  } catch (error) {
    summary.status = "failed";
    summary.error = error instanceof Error ? error.message : String(error);
    writeJson(paths.rawDirectBaselineSummaryPath, summary);
    return summary;
  } finally {
    directClient.stop();
  }
}

async function run() {
  const cliOptions = parseCliOptions();
  if (cliOptions.help) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          usage: [
            "node scripts/generate_signoff_evidence.js",
            "node scripts/generate_signoff_evidence.js --stop-after fast",
            "node scripts/generate_signoff_evidence.js --bundle-root <path> --resume",
          ],
        },
        null,
        2
      )
    );
    return;
  }
  const transportMode = normalizeProofTransportMode(process.env.CODEX_SIGNOFF_TRANSPORT || process.env.CODEX_APP_SERVER_TRANSPORT);
  const baselineTransportMode = normalizeProofTransportMode(process.env.CODEX_BASELINE_TRANSPORT || transportMode);
  const directBaselineTransportMode = normalizeProofTransportMode(
    process.env.CODEX_RAW_DIRECT_BASELINE_TRANSPORT || baselineTransportMode
  );
  const modes = {
    transportMode,
    baselineTransportMode,
    directBaselineTransportMode,
    stopAfterStage: cliOptions.stopAfterStage,
  };
  const paths = buildBundlePaths(cliOptions.bundleRoot);
  fs.mkdirSync(paths.bundleRoot, { recursive: true });
  fs.mkdirSync(paths.rawRoot, { recursive: true });
  fs.mkdirSync(paths.rawSummaryRoot, { recursive: true });
  fs.mkdirSync(paths.measuredBaselineRoot, { recursive: true });
  fs.mkdirSync(paths.rawDirectBaselineRoot, { recursive: true });
  fs.mkdirSync(paths.turnsDir, { recursive: true });
  const resumeState = loadResumeState(paths, cliOptions, modes);
  let summary = refreshSummary(
    cliOptions.resume ? loadOptionalJson(paths.summaryPath) || buildInitialSummary(paths, modes) : buildInitialSummary(paths, modes),
    paths,
    resumeState,
    modes
  );
  summary.error = "";
  const persistSummary = () => {
    summary = refreshSummary(summary, paths, resumeState, modes);
    writeJson(paths.summaryPath, summary);
    return summary;
  };
  const persistArtifacts = () => {
    writeJson(paths.bundleSurfaceMapPath, buildBundleSurfaceMap(paths));
    writeLaneLatencySummary(paths, resumeState);
    persistSummary();
  };
  const emitPartialResult = () => {
    resumeState.overallStatus = "paused";
    writeResumeState(paths, resumeState);
    persistArtifacts();
    console.log(
      JSON.stringify(
        {
          ok: true,
          partial: true,
          bundleRoot: paths.bundleRoot,
          summaryPath: paths.summaryPath,
          resumeStatePath: paths.resumeStatePath,
          nextStage: nextPendingStage(resumeState),
        },
        null,
        2
      )
    );
  };
  const completeStageAndMaybePause = (stageKey, startedAt, info) => {
    completeStage(paths, resumeState, stageKey, startedAt, info);
    persistArtifacts();
    if (shouldStopAfterStage(cliOptions.stopAfterStage, stageKey) && nextPendingStage(resumeState)) {
      emitPartialResult();
      return true;
    }
    return false;
  };
  persistArtifacts();
  if (cliOptions.stopAfterStage && isStageCompleted(resumeState, cliOptions.stopAfterStage) && nextPendingStage(resumeState)) {
    emitPartialResult();
    return;
  }

  const port = 57640 + Math.floor(Math.random() * 180);
  const env = {
    CODEX_UI_PORT: String(port),
    CODEX_AUTO_OPEN_BROWSER: "0",
    CODEX_DEFAULT_EXEC_AGENT: "default",
    CODEX_LOGGING_MODE: "PROOF",
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
    CODEX_EVAL_MAX_CASES: "24",
    CODEX_HARNESS_MEMORY_PATH: paths.harnessMemoryPath,
    CODEX_EVAL_HISTORY_PATH: paths.evalRunsPath,
    CODEX_TURN_ARTIFACTS_DIR: paths.turnsDir,
    CODEX_OPERATION_LOG_PATH: paths.operationLogBasePath,
    CODEX_APP_SERVER_TRANSPORT: transportMode,
  };
  const logs = [];
  const serverHandle = await startInProcessHarnessServer(env);

  try {
    const runtime = await waitForRuntime(port);
    writeJson(paths.runtimeSnapshotPath, runtime);

    const runtimeAssertions = buildRuntimeAssertions(runtime, paths);
    assert(allAssertionsPass(runtimeAssertions), `runtime posture assertion failed: ${JSON.stringify(runtimeAssertions)}`);
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
    persistArtifacts();

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

    const evalStageStartedAt = isStageCompleted(resumeState, "eval") ? 0 : beginStage(paths, resumeState, "eval");
    if (!isStageCompleted(resumeState, "eval")) {
      const evalResponse = await requestJson({
      port,
      path: "/api/eval/run",
      method: "POST",
      headers: authHeaders,
      body: {
        suiteId: "core-harness-workflow.v5",
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
      assert(evalReport && evalReport.suite && evalReport.suite.suiteId === "core-harness-workflow.v5", "unexpected eval suiteId");
      assert(evalRun, "missing eval run summary");
      assert(Number(evalRun.sampleSize || 0) === suiteCaseCount, `core workflow eval did not execute the full suite (${evalRun.sampleSize}/${suiteCaseCount})`);
      assert(failedCases.length === 0, `core workflow eval has failed cases: ${failedCases.map((entry) => entry.caseId).join(", ")}`);
      assert(rbjCase && rbjCase.passed === true, "requirement_rbj_parent_active did not pass");
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
      if (completeStageAndMaybePause("eval", evalStageStartedAt, {
        refs: [repoRelative(paths.coreHarnessWorkflowRunPath), repoRelative(paths.evalRunsPath)],
        metadata: { runId: evalReport.runId },
      })) {
        return;
      }
    }

    const fastStageStartedAt = isStageCompleted(resumeState, "fast") ? 0 : beginStage(paths, resumeState, "fast");
    if (!isStageCompleted(resumeState, "fast")) {
      const fastTaskTargetPath = path.join(
        loggingSurfacePaths.fixtureWorkspaceRoot,
        "fast_samples",
        `sample_fast_target_${crypto.randomBytes(4).toString("hex")}.md`
      );
      const fastTaskTargetRelative = repoRelative(fastTaskTargetPath);
      fs.mkdirSync(path.dirname(fastTaskTargetPath), { recursive: true });
      fs.writeFileSync(fastTaskTargetPath, "# Fast Sample\nstatus: stale\n", "utf8");
      const fastTaskResponse = await runExecViaHttp({
        port,
        headers: authHeaders,
        body: {
          prompt: buildFastTaskPrompt(fastTaskTargetRelative, transportMode),
          agentName: "default",
          sandboxMode: "workspace-write",
          approvalPolicy: "never",
          cwd: workspaceRoot,
          requestUserInputPolicy: "blocked",
          executionProfile: "full-runtime",
          executionIntent: "fast_sample",
          executionSource: "signoff_evidence_script",
          forceNewSession: true,
          idempotencyKey: `signoff-fast-${Date.now()}`,
        },
        timeoutMs: 420000,
      });
      const fastTurnId =
        (fastTaskResponse.turnCompleted && fastTaskResponse.turnCompleted.turnId) ||
        (fastTaskResponse.turnStarted && fastTaskResponse.turnStarted.turnId) ||
        "";
      assert(fastTurnId, "fast task turn id missing");
      const fastMemoryMatch = await waitForMemoryRecord(paths.harnessMemoryPath, (entry) => entry && entry.turnId === fastTurnId, 45000);
      const fastMemoryRecord = fastMemoryMatch.match;
      const fastArtifactRecord = findTurnArtifactManifest(paths.turnsDir, fastTurnId);
      assert(fastArtifactRecord, "fast task turn artifact manifest missing");
      const fastFlowTrace = loadArtifactSiblingJson(fastArtifactRecord, "flow_trace_summary.json");
      const fastStageTimeline = loadArtifactSiblingJson(fastArtifactRecord, "stage_timeline.json");
      const fastEvidenceManifest = loadArtifactSiblingJson(fastArtifactRecord, "evidence_manifest.json");
      const fastAssertions = {
        completed: Boolean(fastMemoryRecord && fastMemoryRecord.status === "completed" && fastMemoryRecord.taskOutcomeStatus === "COMPLETED"),
        fastModeSelected: Boolean(fastFlowTrace && fastFlowTrace.selectedPlanningMode === "FAST"),
        fastFlowPath: Boolean(fastFlowTrace && fastFlowTrace.flowPath === "FAST_PATH"),
        dispatchObserved: Boolean(fastMemoryRecord && fastMemoryRecord.observedSignals && Number(fastMemoryRecord.observedSignals.dispatchSuccessCount || 0) >= 1),
        evidenceManifestPresent: Boolean(fastEvidenceManifest && fastEvidenceManifest.schema === "turn-evidence-manifest.v1"),
        stageTimelinePresent: Boolean(fastStageTimeline && fastStageTimeline.schema === "stage-timeline.v1"),
        targetUpdated: fs.readFileSync(fastTaskTargetPath, "utf8").includes("status: fresh"),
      };
      assert(allAssertionsPass(fastAssertions), `fast task assertion failed: ${JSON.stringify(fastAssertions)}`);
      const bundledFastTaskTargetPath = path.join(paths.rawRoot, "fixtures", "fast_samples", path.basename(fastTaskTargetPath));
      fs.mkdirSync(path.dirname(bundledFastTaskTargetPath), { recursive: true });
      fs.copyFileSync(fastTaskTargetPath, bundledFastTaskTargetPath);
      writeJson(paths.fastTaskTraceSummaryPath, {
        generatedAt: new Date().toISOString(),
        transportMode,
        turnId: fastTurnId,
        targetPath: bundledFastTaskTargetPath,
        targetRelativePath: repoRelative(bundledFastTaskTargetPath),
        runtimeTargetPath: fastTaskTargetPath,
        runtimeTargetRelativePath: fastTaskTargetRelative,
        turn: {
          status: fastMemoryRecord.status,
          taskOutcomeStatus: fastMemoryRecord.taskOutcomeStatus,
          taskOutcomeReason: fastMemoryRecord.taskOutcomeReason,
        },
        observedSignals: getObservedSignals(fastMemoryRecord),
        parentDispatchGuard: getParentDispatchGuard(fastMemoryRecord),
        artifactManifestPath: fastArtifactRecord.path,
        flowTraceSummary: fastFlowTrace,
        stageTimeline: fastStageTimeline,
        evidenceManifest: fastEvidenceManifest,
        assertions: fastAssertions,
      });
      summary.fastTask = {
        turnId: fastTurnId,
        targetPath: fastTaskTargetPath,
        artifactManifestPath: fastArtifactRecord.path,
        assertions: fastAssertions,
      };
      if (completeStageAndMaybePause("fast", fastStageStartedAt, {
        refs: [repoRelative(paths.fastTaskTraceSummaryPath)],
        metadata: { turnId: fastTurnId },
      })) {
        return;
      }
    }

    const discoveryStageStartedAt = isStageCompleted(resumeState, "discovery") ? 0 : beginStage(paths, resumeState, "discovery");
    if (!isStageCompleted(resumeState, "discovery")) {
      const discoveryTaskResponse = await runExecViaHttp({
        port,
        headers: authHeaders,
        body: {
          prompt: buildDiscoveryTaskPrompt(transportMode),
          agentName: "default",
          sandboxMode: "workspace-write",
          approvalPolicy: "never",
          cwd: workspaceRoot,
          requestUserInputPolicy: "blocked",
          executionProfile: "full-runtime",
          executionIntent: "discovery_sample",
          executionSource: "signoff_evidence_script",
          forceNewSession: true,
          idempotencyKey: `signoff-discovery-${Date.now()}`,
        },
        timeoutMs: 420000,
      });
      const discoveryTurnId =
        (discoveryTaskResponse.turnCompleted && discoveryTaskResponse.turnCompleted.turnId) ||
        (discoveryTaskResponse.turnStarted && discoveryTaskResponse.turnStarted.turnId) ||
        "";
      assert(discoveryTurnId, "discovery task turn id missing");
      const discoveryMemoryMatch = await waitForMemoryRecord(paths.harnessMemoryPath, (entry) => entry && entry.turnId === discoveryTurnId, 45000);
      const discoveryMemoryRecord = discoveryMemoryMatch.match;
      const discoveryArtifactRecord = findTurnArtifactManifest(paths.turnsDir, discoveryTurnId);
      assert(discoveryArtifactRecord, "discovery task turn artifact manifest missing");
      const discoveryFlowTrace = loadArtifactSiblingJson(discoveryArtifactRecord, "flow_trace_summary.json");
      const discoveryStageTimeline = loadArtifactSiblingJson(discoveryArtifactRecord, "stage_timeline.json");
      const discoveryEvidenceManifest = loadArtifactSiblingJson(discoveryArtifactRecord, "evidence_manifest.json");
      const discoveryReviewBreakdown = loadArtifactSiblingJson(discoveryArtifactRecord, "review_load_breakdown.json");
      const discoveryOutcomeStatus = safeString(discoveryMemoryRecord && discoveryMemoryRecord.taskOutcomeStatus, 80).toUpperCase();
      const discoveryAssertions = {
        discoveryOutcomeAcceptable: Boolean(discoveryMemoryRecord && (discoveryOutcomeStatus === "NEEDS_INPUT" || discoveryOutcomeStatus === "COMPLETED")),
        discoveryModeSelected: Boolean(discoveryFlowTrace && discoveryFlowTrace.selectedPlanningMode === "DISCOVERY"),
        discoveryFlowPath: Boolean(discoveryFlowTrace && discoveryFlowTrace.flowPath === "DISCOVERY_PATH"),
        noImplementationFiles: Boolean(discoveryMemoryRecord && discoveryMemoryRecord.observedSignals && Number(discoveryMemoryRecord.observedSignals.fileChanges || 0) === 0),
        proposalOnlyDispatchSafe: Boolean(
          discoveryMemoryRecord &&
            discoveryMemoryRecord.parentDispatchGuard &&
            (Number(discoveryMemoryRecord.parentDispatchGuard.required || 0) === 0 ||
              Number(discoveryMemoryRecord.parentDispatchGuard.satisfied || 0) === 1)
        ),
        evidenceManifestPresent: Boolean(discoveryEvidenceManifest && discoveryEvidenceManifest.schema === "turn-evidence-manifest.v1"),
        stageTimelinePresent: Boolean(discoveryStageTimeline && discoveryStageTimeline.schema === "stage-timeline.v1"),
      };
      assert(allAssertionsPass(discoveryAssertions), `discovery task assertion failed: ${JSON.stringify(discoveryAssertions)}`);
      writeJson(paths.discoveryTaskTraceSummaryPath, {
        generatedAt: new Date().toISOString(),
        transportMode,
        turnId: discoveryTurnId,
        turn: {
          status: discoveryMemoryRecord.status,
          taskOutcomeStatus: discoveryMemoryRecord.taskOutcomeStatus,
          taskOutcomeReason: discoveryMemoryRecord.taskOutcomeReason,
        },
        observedSignals: getObservedSignals(discoveryMemoryRecord),
        parentDispatchGuard: getParentDispatchGuard(discoveryMemoryRecord),
        artifactManifestPath: discoveryArtifactRecord.path,
        flowTraceSummary: discoveryFlowTrace,
        stageTimeline: discoveryStageTimeline,
        evidenceManifest: discoveryEvidenceManifest,
        reviewLoadBreakdown: discoveryReviewBreakdown,
        assertions: discoveryAssertions,
      });
      summary.discoveryTask = {
        turnId: discoveryTurnId,
        artifactManifestPath: discoveryArtifactRecord.path,
        assertions: discoveryAssertions,
      };
      if (completeStageAndMaybePause("discovery", discoveryStageStartedAt, {
        refs: [repoRelative(paths.discoveryTaskTraceSummaryPath)],
        metadata: { turnId: discoveryTurnId },
      })) {
        return;
      }
    }

    const signoffStageStartedAt = isStageCompleted(resumeState, "signoff") ? 0 : beginStage(paths, resumeState, "signoff");
    if (!isStageCompleted(resumeState, "signoff")) {
      const signoffTaskTargetPath = path.join(paths.rawRoot, "scripts", "config", "signoff_sample_target.txt");
      const signoffTargetRelative = repoRelative(signoffTaskTargetPath);
      const signoffEvidenceTargetPath = path.join(workspaceRoot, "docs", "EVIDENCE_CONTRACT.md");
      const signoffChangelogTargetPath = path.join(workspaceRoot, "docs", "ARCHITECTURE_CHANGELOG.md");
      const signoffEvidenceBullet =
        "- `SIGNOFF_ASSURANCE` runs should surface reviewer/tester/doc-sync status in `review_load_breakdown.json` for operator signoff.";
      const signoffTaskTargetSentence = "gate: signed";
      fs.mkdirSync(path.dirname(signoffTaskTargetPath), { recursive: true });
      fs.writeFileSync(signoffTaskTargetPath, "gate: pending\n", "utf8");
      const signoffTaskResponse = await runExecViaHttp({
        port,
        headers: authHeaders,
        body: {
          prompt: buildSignoffTaskPrompt(signoffTargetRelative, transportMode),
          agentName: "default",
          sandboxMode: "workspace-write",
          approvalPolicy: "never",
          cwd: workspaceRoot,
          requestUserInputPolicy: "blocked",
          executionProfile: "full-runtime",
          executionIntent: "signoff_sample",
          executionSource: "signoff_evidence_script",
          forceNewSession: true,
          idempotencyKey: `signoff-sample-${Date.now()}`,
        },
        timeoutMs: 420000,
      });
      const signoffTurnId =
        (signoffTaskResponse.turnCompleted && signoffTaskResponse.turnCompleted.turnId) ||
        (signoffTaskResponse.turnStarted && signoffTaskResponse.turnStarted.turnId) ||
        "";
      assert(signoffTurnId, "signoff task turn id missing");
      const signoffMemoryMatch = await waitForMemoryRecord(paths.harnessMemoryPath, (entry) => entry && entry.turnId === signoffTurnId, 45000);
      const signoffMemoryRecord = signoffMemoryMatch.match;
      const signoffArtifactRecord = findTurnArtifactManifest(paths.turnsDir, signoffTurnId);
      assert(signoffArtifactRecord, "signoff task turn artifact manifest missing");
      const signoffFlowTrace = loadArtifactSiblingJson(signoffArtifactRecord, "flow_trace_summary.json");
      const signoffStageTimeline = loadArtifactSiblingJson(signoffArtifactRecord, "stage_timeline.json");
      const signoffEvidenceManifest = loadArtifactSiblingJson(signoffArtifactRecord, "evidence_manifest.json");
      const signoffReviewBreakdown = loadArtifactSiblingJson(signoffArtifactRecord, "review_load_breakdown.json");
      const signoffAssertions = {
        completed: Boolean(signoffMemoryRecord && signoffMemoryRecord.status === "completed" && signoffMemoryRecord.taskOutcomeStatus === "COMPLETED"),
        signoffAssuranceSelected: Boolean(signoffFlowTrace && signoffFlowTrace.selectedAssuranceDepth === "SIGNOFF_ASSURANCE"),
        signoffFlowSelected: Boolean(signoffFlowTrace && signoffFlowTrace.executionFlow && signoffFlowTrace.executionFlow.includes("SIGNOFF_ASSURANCE")),
        signoffReviewerExecuted: Boolean(signoffFlowTrace && Number(signoffFlowTrace.reviewerExecuted || 0) === 1),
        signoffTesterExecuted: Boolean(signoffFlowTrace && Number(signoffFlowTrace.testerExecuted || 0) === 1),
        signoffRequired: Boolean(signoffEvidenceManifest && signoffEvidenceManifest.dispatchPlan && Number(signoffEvidenceManifest.dispatchPlan.signoffRequired || 0) === 1),
        reviewBreakdownPresent: Boolean(signoffReviewBreakdown && signoffReviewBreakdown.schema === "review-load-breakdown.v1"),
        evidenceBulletPresent: fs.readFileSync(signoffEvidenceTargetPath, "utf8").includes(signoffEvidenceBullet),
        changelogUpdated: fs.readFileSync(signoffChangelogTargetPath, "utf8").includes("signoff assurance sample evidence wiring"),
        targetUpdated: fs.readFileSync(signoffTaskTargetPath, "utf8").includes(signoffTaskTargetSentence),
      };
      assert(allAssertionsPass(signoffAssertions), `signoff task assertion failed: ${JSON.stringify(signoffAssertions)}`);
      writeJson(paths.signoffTaskTraceSummaryPath, {
        generatedAt: new Date().toISOString(),
        transportMode,
        turnId: signoffTurnId,
        targetPath: signoffTaskTargetPath,
        targetRelativePath: signoffTargetRelative,
        turn: {
          status: signoffMemoryRecord.status,
          taskOutcomeStatus: signoffMemoryRecord.taskOutcomeStatus,
          taskOutcomeReason: signoffMemoryRecord.taskOutcomeReason,
        },
        observedSignals: getObservedSignals(signoffMemoryRecord),
        parentDispatchGuard: getParentDispatchGuard(signoffMemoryRecord),
        artifactManifestPath: signoffArtifactRecord.path,
        flowTraceSummary: signoffFlowTrace,
        stageTimeline: signoffStageTimeline,
        evidenceManifest: signoffEvidenceManifest,
        reviewLoadBreakdown: signoffReviewBreakdown,
        assertions: signoffAssertions,
      });
      writeJson(paths.reviewLoadBreakdownPath, signoffReviewBreakdown || {
        generatedAt: new Date().toISOString(),
        note: "signoff review load breakdown unavailable",
      });
      const latestRunSummaryBundle = {
        schema: "bundle-latest-run-summary.v1",
        generatedAt: new Date().toISOString(),
        bundleRoot: repoRelative(paths.bundleRoot),
        turnId: signoffTurnId,
        executionProfile: safeString(runtime && runtime.executionProfile, 80) || "full-runtime",
        selectedPlanningDepth: safeString(signoffFlowTrace && signoffFlowTrace.selectedPlanningDepth, 80),
        selectedAssuranceDepth: safeString(signoffFlowTrace && signoffFlowTrace.selectedAssuranceDepth, 80),
        executionFlow: safeString(signoffFlowTrace && signoffFlowTrace.executionFlow, 120),
        finalOutcome: {
          status: safeString(signoffMemoryRecord && signoffMemoryRecord.status, 40),
          taskOutcomeStatus: safeString(signoffMemoryRecord && signoffMemoryRecord.taskOutcomeStatus, 40),
          taskOutcomeReason: safeString(signoffMemoryRecord && signoffMemoryRecord.taskOutcomeReason, 120),
        },
        usedAgents: uniqueStrings(["default", ...(Array.isArray(signoffFlowTrace && signoffFlowTrace.usedAgents) ? signoffFlowTrace.usedAgents : [])]),
        dispatchCount: Number(getObservedSignals(signoffMemoryRecord).dispatchCount || 0),
        dispatchSuccessCount: Number(getObservedSignals(signoffMemoryRecord).dispatchSuccessCount || 0),
        reviewerObserved: Boolean(signoffFlowTrace && Number(signoffFlowTrace.reviewerExecuted || 0) === 1),
        testerObserved: Boolean(signoffFlowTrace && Number(signoffFlowTrace.testerExecuted || 0) === 1),
        docSyncSummary: signoffFlowTrace && signoffFlowTrace.docSyncEvidence ? signoffFlowTrace.docSyncEvidence : {},
        evidenceRefs: {
          signoffTaskTraceSummary: repoRelative(paths.signoffTaskTraceSummaryPath),
          reviewLoadBreakdown: repoRelative(paths.reviewLoadBreakdownPath),
          artifactManifestPath: repoRelative(signoffArtifactRecord.path),
        },
      };
      writeJson(paths.latestRunSummaryPath, latestRunSummaryBundle);
      summary.signoffTask = {
        turnId: signoffTurnId,
        targetPath: signoffTaskTargetPath,
        artifactManifestPath: signoffArtifactRecord.path,
        assertions: signoffAssertions,
      };
      if (completeStageAndMaybePause("signoff", signoffStageStartedAt, {
        refs: [
          repoRelative(paths.signoffTaskTraceSummaryPath),
          repoRelative(paths.reviewLoadBreakdownPath),
          repoRelative(paths.latestRunSummaryPath),
        ],
        metadata: { turnId: signoffTurnId },
      })) {
        return;
      }
    }

    const naturalStageStartedAt = isStageCompleted(resumeState, "natural") ? 0 : beginStage(paths, resumeState, "natural");
    if (!isStageCompleted(resumeState, "natural")) {
      const naturalTaskTargetPath = path.join(workspaceRoot, "docs", "CURRENT_ARCHITECTURE.md");
      const naturalTaskTargetSection = "## 6) Evidence and Persistence";
      const naturalTaskTargetRelative = repoRelative(naturalTaskTargetPath);
      const naturalTaskTargetSentence =
        "- `natural_task_trace_summary.json` records the selected implementation-bearing turn id and thread id, so trace bundles stay anchored to the delegated turn even when later completions share the thread.";
      const naturalTaskPrompt = buildNaturalTaskPrompt(transportMode);
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
      const naturalFlowTrace = loadArtifactSiblingJson(artifactRecord, "flow_trace_summary.json");
      const naturalStageTimeline = loadArtifactSiblingJson(artifactRecord, "stage_timeline.json");
      const naturalEvidenceManifest = loadArtifactSiblingJson(artifactRecord, "evidence_manifest.json");
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
        completed: Boolean(naturalMemoryRecord && naturalMemoryRecord.status === "completed" && naturalMemoryRecord.taskOutcomeStatus === "COMPLETED"),
        parentDispatchSatisfied: Boolean(naturalMemoryRecord && naturalMemoryRecord.parentDispatchGuard && Number(naturalMemoryRecord.parentDispatchGuard.satisfied) === 1),
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
        finalReplyAcknowledged: typeof finalAssistantText === "string" && finalAssistantText.trim() === `NATURAL_TASK_OK ${naturalTaskTargetRelative}`,
      };
      assert(allAssertionsPass(naturalAssertions), `natural task assertion failed: ${JSON.stringify(naturalAssertions)}`);
      const naturalTaskTraceSummary = {
        generatedAt: new Date().toISOString(),
        transportMode,
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
        flowTraceSummary: naturalFlowTrace,
        stageTimeline: naturalStageTimeline,
        evidenceManifest: naturalEvidenceManifest,
        assertions: naturalAssertions,
      };
      writeJson(paths.naturalTaskTraceSummaryPath, naturalTaskTraceSummary);
      summary.naturalTask = {
        threadId: naturalTaskThreadId,
        turnId: naturalMemoryRecord.turnId,
        targetPath: naturalTaskTargetPath,
        artifactManifestPath: artifactRecord.path,
        dispatchChildren,
        assertions: naturalAssertions,
      };
      if (completeStageAndMaybePause("natural", naturalStageStartedAt, {
        refs: [repoRelative(paths.naturalTaskTraceSummaryPath)],
        metadata: { turnId: naturalMemoryRecord.turnId, threadId: naturalTaskThreadId },
      })) {
        return;
      }
    }

    await waitForFile(paths.harnessMemoryPath, 30000);
    const finalMemory = readJson(paths.harnessMemoryPath);
    const evalHistory = readJsonLines(paths.evalRunsPath);
    const measuredBaselineStageStartedAt = isStageCompleted(resumeState, "measured_baseline") ? 0 : beginStage(paths, resumeState, "measured_baseline");
    if (!isStageCompleted(resumeState, "measured_baseline")) {
      const measuredBaselineSummary = await runMeasuredBaseline(paths, baselineTransportMode);
      summary.measuredBaseline = {
        status: "ok",
        summaryPath: paths.measuredBaselineSummaryPath,
        profile: measuredBaselineSummary && measuredBaselineSummary.profile ? measuredBaselineSummary.profile : resolveBaselineProfile(baselineTransportMode),
        samples: measuredBaselineSummary && measuredBaselineSummary.samples ? measuredBaselineSummary.samples : {},
      };
      if (completeStageAndMaybePause("measured_baseline", measuredBaselineStageStartedAt, {
        refs: [
          repoRelative(paths.measuredBaselineSummaryPath),
          repoRelative(paths.baselineFastTaskTraceSummaryPath),
          repoRelative(paths.baselineDiscoveryTaskTraceSummaryPath),
          repoRelative(paths.baselineSignoffTaskTraceSummaryPath),
          repoRelative(paths.baselineNaturalTaskTraceSummaryPath),
        ],
        metadata: { profile: summary.measuredBaseline.profile },
      })) {
        return;
      }
    }

    const rawDirectBaselineStageStartedAt = isStageCompleted(resumeState, "raw_direct_baseline") ? 0 : beginStage(paths, resumeState, "raw_direct_baseline");
    if (!isStageCompleted(resumeState, "raw_direct_baseline")) {
      const CodexAppServerClient =
        serverHandle &&
        serverHandle.serverModule &&
        serverHandle.serverModule.__riskAudit &&
        serverHandle.serverModule.__riskAudit.CodexAppServerClient
          ? serverHandle.serverModule.__riskAudit.CodexAppServerClient
          : null;
      const rawDirectBaselineSummary = await runRawDirectBaseline(paths, directBaselineTransportMode, CodexAppServerClient);
      summary.rawDirectBaseline = {
        status: safeString(rawDirectBaselineSummary && rawDirectBaselineSummary.status, 40) || "failed",
        summaryPath: paths.rawDirectBaselineSummaryPath,
        directness: safeString(rawDirectBaselineSummary && rawDirectBaselineSummary.directness, 80) || "app-server-direct",
        transportMode: safeString(rawDirectBaselineSummary && rawDirectBaselineSummary.transportMode, 40) || directBaselineTransportMode,
        samples: rawDirectBaselineSummary && rawDirectBaselineSummary.samples ? rawDirectBaselineSummary.samples : {},
        error: safeString(rawDirectBaselineSummary && rawDirectBaselineSummary.error, 400),
        reason: safeString(rawDirectBaselineSummary && rawDirectBaselineSummary.reason, 400),
      };
      if (completeStageAndMaybePause("raw_direct_baseline", rawDirectBaselineStageStartedAt, {
        refs: [
          repoRelative(paths.rawDirectBaselineSummaryPath),
          repoRelative(paths.rawDirectFastTaskTraceSummaryPath),
          repoRelative(paths.rawDirectDiscoveryTaskTraceSummaryPath),
          repoRelative(paths.rawDirectSignoffTaskTraceSummaryPath),
          repoRelative(paths.rawDirectNaturalTaskTraceSummaryPath),
        ],
        metadata: { status: summary.rawDirectBaseline.status },
      })) {
        return;
      }
    }

    const comparisonStageStartedAt = isStageCompleted(resumeState, "comparison") ? 0 : beginStage(paths, resumeState, "comparison");
    if (!isStageCompleted(resumeState, "comparison")) {
      const baselineComparisonRun = generateBaselineComparison(paths.bundleRoot);
      summary.baselineComparison = {
        status: baselineComparisonRun && baselineComparisonRun.ok ? "ok" : "failed",
        reportPath: baselineComparisonRun && baselineComparisonRun.jsonPath ? baselineComparisonRun.jsonPath : "",
        markdownPath: baselineComparisonRun && baselineComparisonRun.mdPath ? baselineComparisonRun.mdPath : "",
        archiveReportPath: baselineComparisonRun && baselineComparisonRun.archiveJsonPath ? baselineComparisonRun.archiveJsonPath : "",
        archiveMarkdownPath: baselineComparisonRun && baselineComparisonRun.archiveMdPath ? baselineComparisonRun.archiveMdPath : "",
        truthfulClaimStatus: baselineComparisonRun && baselineComparisonRun.report ? baselineComparisonRun.report.truthfulClaimStatus : {},
      };
      if (completeStageAndMaybePause("comparison", comparisonStageStartedAt, {
        refs: [
          baselineComparisonRun && baselineComparisonRun.jsonPath ? repoRelative(baselineComparisonRun.jsonPath) : "",
          baselineComparisonRun && baselineComparisonRun.mdPath ? repoRelative(baselineComparisonRun.mdPath) : "",
        ].filter(Boolean),
        metadata: {
          approximation: baselineComparisonRun && baselineComparisonRun.report ? baselineComparisonRun.report.approximation : "",
        },
      })) {
        return;
      }
    }

    const conformanceStageStartedAt = isStageCompleted(resumeState, "conformance") ? 0 : beginStage(paths, resumeState, "conformance");
    if (!isStageCompleted(resumeState, "conformance")) {
      const coreHarnessWorkflowRun = loadOptionalJson(paths.coreHarnessWorkflowRunPath) || {};
      const evalReport = coreHarnessWorkflowRun.report || {};
      const evalRun = Array.isArray(evalReport.runs) ? evalReport.runs[0] : null;
      const evalCases = evalRun && Array.isArray(evalRun.cases) ? evalRun.cases : [];
      const failedCases = evalCases.filter((entry) => entry && entry.passed !== true);
      const rbjCase = evalCases.find((entry) => entry && entry.caseId === "requirement_rbj_parent_active") || null;
      const fastTrace = loadOptionalJson(paths.fastTaskTraceSummaryPath) || {};
      const discoveryTrace = loadOptionalJson(paths.discoveryTaskTraceSummaryPath) || {};
      const signoffTrace = loadOptionalJson(paths.signoffTaskTraceSummaryPath) || {};
      const naturalTrace = loadOptionalJson(paths.naturalTaskTraceSummaryPath) || {};
      const signoffFlowTrace = signoffTrace.flowTraceSummary || {};
      const signoffEvidenceManifest = signoffTrace.evidenceManifest || {};
      const signoffReviewBreakdown = signoffTrace.reviewLoadBreakdown || {};
      const latestRunSummaryBundle = loadOptionalJson(paths.latestRunSummaryPath) || {};
      summary.assertions = {
        runtimePostureSafe: allAssertionsPass(runtimeAssertions),
        coreHarnessWorkflowPassed: failedCases.length === 0,
        requirementRbjParentActivePassed: Boolean(rbjCase && rbjCase.passed === true),
        fastTaskTracePassed: allAssertionsPass(fastTrace.assertions || {}),
        discoveryTaskTracePassed: allAssertionsPass(discoveryTrace.assertions || {}),
        signoffTaskTracePassed: allAssertionsPass(signoffTrace.assertions || {}),
        naturalTaskTracePassed: allAssertionsPass(naturalTrace.assertions || {}),
        bundleContainsRequiredFiles: [
          paths.summaryPath,
          paths.runtimeSnapshotPath,
          paths.coreHarnessWorkflowRunPath,
          paths.naturalTaskTraceSummaryPath,
          paths.latestRunSummaryPath,
          paths.reviewLoadBreakdownPath,
          paths.conformanceReportPath,
          paths.operatorViewSummaryPath,
          paths.bundleSurfaceMapPath,
          paths.resumeStatePath,
          paths.laneLatencySummaryPath,
        ].every((filePath) => fs.existsSync(filePath)),
        bundleContainsTurnsDir: fs.existsSync(paths.turnsDir),
        bundleContainsMeasuredBaselineTurnsDir: fs.existsSync(paths.measuredBaselineTurnsDir),
        evalHistoryPersisted: evalHistory.length >= 1,
        harnessExecutionMemoryPersisted: finalMemory && Array.isArray(finalMemory.executionMemory) && finalMemory.executionMemory.length >= 1,
      };
      summary.allPassed = allAssertionsPass(summary.assertions);
      const signoffPlanningDecision = getPlanningSelection(
        signoffEvidenceManifest &&
          signoffEvidenceManifest.planningDecisionContract &&
          typeof signoffEvidenceManifest.planningDecisionContract === "object"
          ? signoffEvidenceManifest.planningDecisionContract
          : null
      );
      const signoffSelection = {
        selectedMode: signoffFlowTrace.selectedPlanningMode || signoffPlanningDecision.selectedPlanningMode,
        selectedPlanningDepth: signoffFlowTrace.selectedPlanningDepth || signoffPlanningDecision.selectedPlanningDepth,
        selectedAssuranceDepth: signoffFlowTrace.selectedAssuranceDepth || signoffPlanningDecision.selectedAssuranceDepth,
        planningScore:
          signoffPlanningDecision.planningScore !== undefined ? signoffPlanningDecision.planningScore : signoffFlowTrace.planningScore,
        planningScoreBreakdown:
          signoffPlanningDecision.planningScoreBreakdown && typeof signoffPlanningDecision.planningScoreBreakdown === "object"
            ? signoffPlanningDecision.planningScoreBreakdown
            : signoffFlowTrace.planningScoreBreakdown,
        assuranceScore:
          signoffPlanningDecision.assuranceScore !== undefined ? signoffPlanningDecision.assuranceScore : signoffFlowTrace.assuranceScore,
        assuranceScoreBreakdown:
          signoffPlanningDecision.assuranceScoreBreakdown && typeof signoffPlanningDecision.assuranceScoreBreakdown === "object"
            ? signoffPlanningDecision.assuranceScoreBreakdown
            : signoffFlowTrace.assuranceScoreBreakdown,
        planningReasons:
          Array.isArray(signoffPlanningDecision.planningReasons) && signoffPlanningDecision.planningReasons.length > 0
            ? signoffPlanningDecision.planningReasons
            : signoffFlowTrace.planningModeReasons,
        assuranceReasons:
          Array.isArray(signoffPlanningDecision.assuranceReasons) && signoffPlanningDecision.assuranceReasons.length > 0
            ? signoffPlanningDecision.assuranceReasons
            : signoffFlowTrace.assuranceDepthReasons,
      };
      const conformanceReport = buildConformanceReport({
        latestRunSummary: {
          ...latestRunSummaryBundle,
          currentPhase: "Release / Close",
          releaseState: summary.allPassed ? "RELEASE_APPROVED" : "RELEASE_BLOCKED",
          requestUserInputPolicy: runtime && runtime.nonInteractiveUserInput ? runtime.nonInteractiveUserInput.policy : "blocked",
          childEvidenceLedger: Array.isArray(signoffFlowTrace.childEvidenceLedger) ? signoffFlowTrace.childEvidenceLedger : [],
          residualRisks: Array.isArray(signoffEvidenceManifest.residualRiskSummary) ? signoffEvidenceManifest.residualRiskSummary : [],
          assumptions:
            signoffEvidenceManifest &&
            signoffEvidenceManifest.requirementContract &&
            Array.isArray(signoffEvidenceManifest.requirementContract.assumptions)
              ? signoffEvidenceManifest.requirementContract.assumptions
              : [],
        },
        signoffSummary: summary,
        selection: signoffSelection,
        requirementContract: signoffEvidenceManifest.requirementContract || {},
        dispatchPlan: signoffEvidenceManifest.dispatchPlan || {},
        childEvidenceLedger: Array.isArray(signoffFlowTrace.childEvidenceLedger) ? signoffFlowTrace.childEvidenceLedger : [],
        acceptanceResults: Array.isArray(signoffEvidenceManifest.acceptanceChecks) ? signoffEvidenceManifest.acceptanceChecks : [],
        requiredEvidenceFailures: Array.isArray(signoffReviewBreakdown.requiredEvidenceFailures) ? signoffReviewBreakdown.requiredEvidenceFailures : [],
        evidenceRefs: [
          repoRelative(paths.summaryPath),
          repoRelative(paths.latestRunSummaryPath),
          repoRelative(paths.reviewLoadBreakdownPath),
          repoRelative(paths.naturalTaskTraceSummaryPath),
          repoRelative(paths.laneLatencySummaryPath),
        ],
        replayBundleRefs: [repoRelative(paths.rawRoot)],
        rationaleNotes: [
          `transportMode=${transportMode}`,
          `baselineTransportMode=${baselineTransportMode}`,
          `directBaselineTransportMode=${directBaselineTransportMode}`,
        ],
      });
      const operatorViewSummary = buildOperatorViewSummary({
        latestRunSummary: {
          ...latestRunSummaryBundle,
          currentPhase: "Release / Close",
        },
        reviewBundle: conformanceReport.reviewBundle,
        releaseDecision: conformanceReport.releaseDecision,
        conformanceReport,
        routingDecision: conformanceReport.routingDecision,
      });
      writeJson(paths.conformanceReportPath, conformanceReport);
      writeJson(paths.operatorViewSummaryPath, operatorViewSummary);
      assert(summary.allPassed, `summary assertion failed: ${JSON.stringify(summary.assertions)}`);
      completeStageAndMaybePause("conformance", conformanceStageStartedAt, {
        refs: [repoRelative(paths.conformanceReportPath), repoRelative(paths.operatorViewSummaryPath)],
        metadata: {
          releaseState: conformanceReport.releaseDecision && conformanceReport.releaseDecision.terminal_state,
        },
      });
    }

    resumeState.overallStatus = "completed";
    resumeState.currentStage = "";
    writeResumeState(paths, resumeState);
    persistArtifacts();
    sanitizeBundleTopLevel(paths);
    const relocatedTopLevelRoot = path.join(paths.rawRoot, "relocated_top_level");
    const relocatedComparisonPath = path.join(relocatedTopLevelRoot, "baseline_comparison_report.json");
    const relocatedMarkdownPath = path.join(relocatedTopLevelRoot, "speed_vs_assurance_report.md");
    if (summary.baselineComparison && fs.existsSync(relocatedComparisonPath)) {
      summary.baselineComparison.reportPath = relocatedComparisonPath;
      summary.paths.baselineComparisonReport = relocatedComparisonPath;
      paths.baselineComparisonReportPath = relocatedComparisonPath;
    }
    if (summary.baselineComparison && fs.existsSync(relocatedMarkdownPath)) {
      summary.baselineComparison.markdownPath = relocatedMarkdownPath;
      summary.paths.speedVsAssuranceReport = relocatedMarkdownPath;
      paths.speedVsAssuranceReportPath = relocatedMarkdownPath;
    }
    persistArtifacts();
    persistSummary();
    console.log(
      JSON.stringify(
        {
          ok: true,
          bundleRoot: paths.bundleRoot,
          summaryPath: paths.summaryPath,
          resumeStatePath: paths.resumeStatePath,
        },
        null,
        2
      )
    );
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    persistArtifacts();
    console.log(
      JSON.stringify(
        {
          ok: false,
          bundleRoot: paths.bundleRoot,
          summaryPath: paths.summaryPath,
          resumeStatePath: paths.resumeStatePath,
          error: summary.error,
        },
        null,
        2
      )
    );
    throw error;
  } finally {
    await serverHandle.stop();
  }
}

run().catch((error) => {
  console.error(`[generate-signoff-evidence] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
