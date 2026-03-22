const fs = require("fs");
const path = require("path");

function safeString(value, max = 400) {
  if (typeof value !== "string") {
    if (value === null || value === undefined) return "";
    value = String(value);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function toIsoTimestamp(value = Date.now()) {
  const parsed = Number(value);
  return new Date(Number.isFinite(parsed) ? parsed : Date.now()).toISOString();
}

function normalizeRelativePath(workspaceRoot, targetPath, max = 400) {
  const raw = safeString(targetPath, 1000);
  if (!raw) return "";
  try {
    const resolved = path.resolve(raw);
    const rel = path.relative(workspaceRoot, resolved).replace(/\\/g, "/");
    if (rel && !rel.startsWith("..")) return rel.slice(0, max);
    return resolved.slice(0, max);
  } catch {
    return raw.slice(0, max);
  }
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function writeJsonFile(targetPath, value) {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJsonIfExists(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch {
    return null;
  }
}

function parseTimestamp(value, fallback = 0) {
  if (Number.isFinite(Number(value))) return Math.max(0, Math.trunc(Number(value)));
  const parsed = Date.parse(safeString(value, 160));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildLoggingPaths(workspaceRoot) {
  const logsRoot = path.join(workspaceRoot, "logs");
  const currentRoot = path.join(logsRoot, "current");
  const bundlesRoot = path.join(logsRoot, "bundles");
  const archiveRoot = path.join(logsRoot, "archive");
  const adminRoot = path.join(archiveRoot, "admin");
  const rawRoot = path.join(archiveRoot, "raw");
  const legacyRoot = path.join(archiveRoot, "legacy");
  const runtimeStateRoot = path.join(rawRoot, "runtime_state");
  const operationLogsRoot = path.join(rawRoot, "operation_logs");
  return Object.freeze({
    workspaceRoot,
    logsRoot,
    currentRoot,
    bundlesRoot,
    archiveRoot,
    adminRoot,
    rawRoot,
    legacyRoot,
    archiveRawRoot: rawRoot,
    archiveLegacyRoot: legacyRoot,
    runtimeStateRoot,
    signoffBundlesRoot: path.join(bundlesRoot, "signoff"),
    runtimeProofsRoot: path.join(bundlesRoot, "proof"),
    proofBundlesRoot: path.join(bundlesRoot, "proof"),
    replayBundlesRoot: path.join(bundlesRoot, "replay"),
    turnArtifactsRoot: path.join(rawRoot, "turns"),
    archiveTurnsRoot: path.join(rawRoot, "turns"),
    operationLogsRoot,
    archiveOperationLogsRoot: operationLogsRoot,
    operationLogBasePath: path.join(operationLogsRoot, "codex_ops.jsonl"),
    operationLogArchiveRoot: path.join(operationLogsRoot, "archive"),
    harnessMemoryPath: path.join(rawRoot, "harness_execution_memory.json"),
    evalHistoryPath: path.join(rawRoot, "eval_runs.jsonl"),
    conversationPersonaMemoryPath: path.join(runtimeStateRoot, "conversation_persona_memory.json"),
    fixtureWorkspaceRoot: path.join(rawRoot, "fixtures"),
    archiveTestProofsRoot: path.join(rawRoot, "test_proofs"),
    archiveBaselineComparisonRoot: path.join(legacyRoot, "baseline_comparison"),
    archiveLegacyMiscRoot: path.join(legacyRoot, "misc"),
    inventoryBeforePath: path.join(adminRoot, "log_inventory_before.json"),
    inventoryAfterPath: path.join(adminRoot, "log_inventory_after.json"),
    deletionReportPath: path.join(adminRoot, "log_deletion_report.json"),
    currentIndexPath: path.join(currentRoot, "index.json"),
    currentOperatorSummaryPath: path.join(currentRoot, "operator_summary.json"),
    currentRuntimeSnapshotPath: path.join(currentRoot, "runtime_snapshot.json"),
    currentDesignConformancePath: path.join(currentRoot, "design_conformance_summary.json"),
    currentConformanceReportPath: path.join(currentRoot, "conformance_report.json"),
    currentOperatorViewSummaryPath: path.join(currentRoot, "operator_view_summary.json"),
    currentLatestRunPath: path.join(currentRoot, "latest_run_summary.json"),
    currentLatestRunSummaryPath: path.join(currentRoot, "latest_run_summary.json"),
    currentLatestSignoffPath: path.join(currentRoot, "latest_signoff_summary.json"),
    currentLatestSignoffSummaryPath: path.join(currentRoot, "latest_signoff_summary.json"),
    currentReviewLoadPath: path.join(currentRoot, "review_load_breakdown.json"),
    currentReviewLoadBreakdownPath: path.join(currentRoot, "review_load_breakdown.json"),
  });
}

function ensureLoggingSurfaceDirs(paths) {
  [
    paths.logsRoot,
    paths.currentRoot,
    paths.bundlesRoot,
    paths.signoffBundlesRoot,
    paths.runtimeProofsRoot,
    paths.replayBundlesRoot,
    paths.archiveRoot,
    paths.adminRoot,
    paths.rawRoot,
    paths.legacyRoot,
    paths.runtimeStateRoot,
    paths.turnArtifactsRoot,
    paths.operationLogsRoot,
    paths.operationLogArchiveRoot,
    paths.fixtureWorkspaceRoot,
    paths.archiveTestProofsRoot,
    paths.archiveBaselineComparisonRoot,
    paths.archiveLegacyMiscRoot,
  ].forEach(ensureDir);
}

function summarizePathStats(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return { exists: false, files: 0, directories: 0, bytes: 0 };
  }
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return { exists: true, files: 1, directories: 0, bytes: stat.size };
  }
  let files = 0;
  let directories = 0;
  let bytes = 0;
  const stack = [targetPath];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      const entryStat = fs.statSync(entryPath);
      if (entry.isDirectory()) {
        directories += 1;
        stack.push(entryPath);
      } else {
        files += 1;
        bytes += entryStat.size;
      }
    }
  }
  return { exists: true, files, directories, bytes };
}

function summarizeInventoryByClassification(entries) {
  const summary = {
    KEEP_ACTIVE: { entries: 0, files: 0, directories: 0, bytes: 0 },
    KEEP_BUNDLE_ONLY: { entries: 0, files: 0, directories: 0, bytes: 0 },
    ARCHIVE_ONLY: { entries: 0, files: 0, directories: 0, bytes: 0 },
    DELETE_NOW: { entries: 0, files: 0, directories: 0, bytes: 0 },
  };
  for (const entry of Array.isArray(entries) ? entries : []) {
    const bucket = summary[entry && entry.classification];
    if (!bucket) continue;
    bucket.entries += 1;
    bucket.files += Number(entry.files || 0);
    bucket.directories += Number(entry.directories || 0);
    bucket.bytes += Number(entry.bytes || 0);
  }
  return summary;
}

function buildInventoryClassification(name, paths) {
  if (name === "current") {
    return {
      classification: "KEEP_ACTIVE",
      rationale: "Operator-first summaries live here.",
      targetPath: normalizeRelativePath(paths.workspaceRoot, path.join(paths.logsRoot, name)),
    };
  }
  if (name === "bundles") {
    return {
      classification: "KEEP_ACTIVE",
      rationale: "Bundle entrypoint for signoff, proof, and replay evidence.",
      targetPath: normalizeRelativePath(paths.workspaceRoot, path.join(paths.logsRoot, name)),
    };
  }
  if (name === "archive") {
    return {
      classification: "KEEP_ACTIVE",
      rationale: "Historical and forensic material is retained here.",
      targetPath: normalizeRelativePath(paths.workspaceRoot, path.join(paths.logsRoot, name)),
    };
  }
  if (name === "proofs") {
    return {
      classification: "KEEP_BUNDLE_ONLY",
      rationale: "Runtime proof bundles belong under logs/bundles/proof.",
      targetPath: normalizeRelativePath(paths.workspaceRoot, paths.runtimeProofsRoot),
    };
  }
  if (name === "signoff-bundles") {
    return {
      classification: "KEEP_BUNDLE_ONLY",
      rationale: "Signoff bundles belong under logs/bundles/signoff.",
      targetPath: normalizeRelativePath(paths.workspaceRoot, paths.signoffBundlesRoot),
    };
  }
  if (name === "turns") {
    return {
      classification: "ARCHIVE_ONLY",
      rationale: "Raw turn artifacts stay available for replay/forensics but should not be an active operator surface.",
      targetPath: normalizeRelativePath(paths.workspaceRoot, paths.turnArtifactsRoot),
    };
  }
  if (name === "harness_execution_memory.json") {
    return {
      classification: "ARCHIVE_ONLY",
      rationale: "Execution memory persists, but it is runtime state rather than a root operator entrypoint.",
      targetPath: normalizeRelativePath(paths.workspaceRoot, paths.harnessMemoryPath),
    };
  }
  if (name === "eval_runs.jsonl") {
    return {
      classification: "ARCHIVE_ONLY",
      rationale: "Eval history persists, but it is runtime state rather than a root operator entrypoint.",
      targetPath: normalizeRelativePath(paths.workspaceRoot, paths.evalHistoryPath),
    };
  }
  if (name === "fixtures") {
    return {
      classification: "ARCHIVE_ONLY",
      rationale: "Fixture workspaces should stay off the root operator surface.",
      targetPath: normalizeRelativePath(paths.workspaceRoot, paths.fixtureWorkspaceRoot),
    };
  }
  if (name === "baseline-comparison") {
    return {
      classification: "DELETE_NOW",
      rationale: "Baseline comparison reports are duplicate derivatives already stored inside signoff bundles.",
      targetPath: "",
    };
  }
  if (name === "test-proofs") {
    return {
      classification: "DELETE_NOW",
      rationale: "Legacy test proof folders are not part of the active operator flow.",
      targetPath: "",
    };
  }
  if (/^codex_ops.*\.jsonl$/i.test(name)) {
    return {
      classification: "ARCHIVE_ONLY",
      rationale: "Raw operation logs remain available under archive/raw only.",
      targetPath: normalizeRelativePath(paths.workspaceRoot, paths.operationLogsRoot),
    };
  }
  return {
    classification: "ARCHIVE_ONLY",
    rationale: "Unrecognized log entry is retained outside the operator-first surface until explicitly curated.",
    targetPath: normalizeRelativePath(paths.workspaceRoot, path.join(paths.legacyRoot, name)),
  };
}

function captureLogInventorySnapshot(workspaceRoot, { phase = "snapshot" } = {}) {
  const paths = buildLoggingPaths(workspaceRoot);
  ensureDir(paths.logsRoot);
  const entries = [];
  const names = fs.existsSync(paths.logsRoot) ? fs.readdirSync(paths.logsRoot).sort() : [];
  const codexOps = names.filter((name) => /^codex_ops.*\.jsonl$/i.test(name));
  let codexOpBytes = 0;
  for (const name of codexOps) {
    codexOpBytes += fs.statSync(path.join(paths.logsRoot, name)).size;
  }
  if (codexOps.length) {
    const meta = buildInventoryClassification("codex_ops.jsonl", paths);
    entries.push({
      path: "logs/codex_ops_*.jsonl",
      relativePath: "logs/codex_ops_*.jsonl",
      kind: "group",
      count: codexOps.length,
      files: codexOps.length,
      directories: 0,
      bytes: codexOpBytes,
      classification: meta.classification,
      rationale: meta.rationale,
      targetPath: meta.targetPath,
    });
  }
  for (const name of names) {
    if (/^codex_ops.*\.jsonl$/i.test(name)) continue;
    const entryPath = path.join(paths.logsRoot, name);
    const stat = summarizePathStats(entryPath);
    const meta = buildInventoryClassification(name, paths);
    entries.push({
      path: `logs/${name}`,
      relativePath: `logs/${name}`,
      kind: fs.existsSync(entryPath) && fs.statSync(entryPath).isDirectory() ? "directory" : "file",
      count: stat.files + stat.directories,
      files: stat.files,
      directories: stat.directories,
      bytes: stat.bytes,
      classification: meta.classification,
      rationale: meta.rationale,
      targetPath: meta.targetPath,
    });
  }
  const totals = entries.reduce(
    (sum, entry) => {
      sum.entries += 1;
      sum.files += Number(entry.files || 0);
      sum.directories += Number(entry.directories || 0);
      sum.bytes += Number(entry.bytes || 0);
      return sum;
    },
    { entries: 0, files: 0, directories: 0, bytes: 0 }
  );
  return {
    schema: "log-inventory.v2",
    generatedAt: toIsoTimestamp(),
    phase: safeString(phase, 80) || "snapshot",
    logsRoot: "logs",
    entries,
    rootEntries: entries.map((entry) => entry.relativePath),
    totals,
    classificationSummary: summarizeInventoryByClassification(entries),
  };
}

function chooseUniqueTarget(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;
  const parsed = path.parse(targetPath);
  let counter = 1;
  while (counter < 1000) {
    const candidate = path.join(parsed.dir, `${parsed.name}_${String(counter).padStart(3, "0")}${parsed.ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    counter += 1;
  }
  return path.join(parsed.dir, `${parsed.name}_${Date.now()}${parsed.ext}`);
}

function movePathMerged(sourcePath, targetPath, operations) {
  if (!fs.existsSync(sourcePath)) return;
  const sourceStat = fs.statSync(sourcePath);
  if (sourceStat.isDirectory()) {
    ensureDir(targetPath);
    const entries = fs.readdirSync(sourcePath);
    for (const name of entries) {
      movePathMerged(path.join(sourcePath, name), path.join(targetPath, name), operations);
    }
    if (fs.existsSync(sourcePath)) fs.rmSync(sourcePath, { recursive: true, force: true });
    operations.push({ action: "move_dir", sourcePath, targetPath });
    return;
  }
  ensureDir(path.dirname(targetPath));
  const finalTarget = chooseUniqueTarget(targetPath);
  fs.renameSync(sourcePath, finalTarget);
  operations.push({ action: "move_file", sourcePath, targetPath: finalTarget, bytes: sourceStat.size });
}

function deletePath(targetPath, operations) {
  if (!fs.existsSync(targetPath)) return;
  const stats = summarizePathStats(targetPath);
  fs.rmSync(targetPath, { recursive: true, force: true });
  operations.push({
    action: "delete",
    sourcePath: targetPath,
    bytes: stats.bytes,
    files: stats.files,
    directories: stats.directories,
  });
}

function migrateLegacyLogLayout(workspaceRoot) {
  const paths = buildLoggingPaths(workspaceRoot);
  ensureLoggingSurfaceDirs(paths);
  const operations = [];
  movePathMerged(path.join(paths.logsRoot, "proofs"), paths.runtimeProofsRoot, operations);
  movePathMerged(path.join(paths.logsRoot, "signoff-bundles"), paths.signoffBundlesRoot, operations);
  movePathMerged(path.join(paths.logsRoot, "turns"), paths.turnArtifactsRoot, operations);
  movePathMerged(path.join(paths.logsRoot, "fixtures"), paths.fixtureWorkspaceRoot, operations);
  movePathMerged(path.join(paths.logsRoot, "harness_execution_memory.json"), paths.harnessMemoryPath, operations);
  movePathMerged(path.join(paths.logsRoot, "eval_runs.jsonl"), paths.evalHistoryPath, operations);
  const rootNames = fs.existsSync(paths.logsRoot) ? fs.readdirSync(paths.logsRoot) : [];
  for (const name of rootNames) {
    if (!/^codex_ops.*\.jsonl$/i.test(name)) continue;
    movePathMerged(path.join(paths.logsRoot, name), path.join(paths.operationLogsRoot, name), operations);
  }
  deletePath(path.join(paths.logsRoot, "baseline-comparison"), operations);
  deletePath(path.join(paths.logsRoot, "test-proofs"), operations);
  movePathMerged(path.join(paths.logsRoot, "log_inventory_before.json"), paths.inventoryBeforePath, operations);
  movePathMerged(path.join(paths.logsRoot, "log_inventory_after.json"), paths.inventoryAfterPath, operations);
  movePathMerged(path.join(paths.logsRoot, "log_deletion_report.json"), paths.deletionReportPath, operations);
  return {
    schema: "log-deletion-report.v1",
    generatedAt: toIsoTimestamp(),
    operations: operations.map((entry) => ({
      ...entry,
      sourcePath: normalizeRelativePath(workspaceRoot, entry.sourcePath),
      targetPath: normalizeRelativePath(workspaceRoot, entry.targetPath),
    })),
    summary: operations.reduce(
      (sum, entry) => {
        if (entry.action === "delete") sum.deleted += 1;
        else sum.moved += 1;
        sum.bytesTouched += Number(entry.bytes || 0);
        return sum;
      },
      { moved: 0, deleted: 0, bytesTouched: 0 }
    ),
  };
}

function listBundleSummaryCandidates(rootDir, summaryFileName) {
  if (!rootDir || !summaryFileName || !fs.existsSync(rootDir)) return [];
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dirPath = path.join(rootDir, entry.name);
      const summaryPath = path.join(dirPath, summaryFileName);
      if (!fs.existsSync(summaryPath)) return null;
      const summary = readJsonIfExists(summaryPath) || {};
      const stat = fs.statSync(summaryPath);
      return {
        name: entry.name,
        dirPath,
        summaryPath,
        summary,
        generatedAt: parseTimestamp(summary.generatedAt, Number(stat.mtimeMs || 0)),
        updatedAt: Math.trunc(Number(stat.mtimeMs || 0)),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.generatedAt !== left.generatedAt) return right.generatedAt - left.generatedAt;
      return right.updatedAt - left.updatedAt;
    });
}

function loadLatestExecutionRecord(paths) {
  const memory = readJsonIfExists(paths.harnessMemoryPath);
  const records = Array.isArray(memory && memory.executionMemory) ? memory.executionMemory : [];
  if (!records.length) return null;
  return records
    .slice()
    .sort((left, right) => {
      const rightTs = Math.max(parseTimestamp(right && right.completedAt), parseTimestamp(right && right.updatedAt));
      const leftTs = Math.max(parseTimestamp(left && left.completedAt), parseTimestamp(left && left.updatedAt));
      return rightTs - leftTs;
    })[0];
}

function loadArtifactDetail(pathValue) {
  const normalized = safeString(pathValue, 1000);
  return normalized ? readJsonIfExists(normalized) : null;
}

function normalizeObservedSignals(source) {
  const observed = source && typeof source === "object" ? source : {};
  return {
    commandExecutions: Math.max(0, Math.trunc(Number(observed.commandExecutions || 0))),
    fileChanges: Math.max(0, Math.trunc(Number(observed.fileChanges || 0))),
    changedFiles: Math.max(0, Math.trunc(Number(observed.changedFiles || 0))),
    mcpCalls: Math.max(0, Math.trunc(Number(observed.mcpCalls || 0))),
    collabCalls: Math.max(0, Math.trunc(Number(observed.collabCalls || 0))),
    dispatchCount: Math.max(0, Math.trunc(Number(observed.dispatchCount || 0))),
    dispatchSuccessCount: Math.max(0, Math.trunc(Number(observed.dispatchSuccessCount || 0))),
    dispatchFailureCount: Math.max(0, Math.trunc(Number(observed.dispatchFailureCount || 0))),
    dispatchChildren: Array.isArray(observed.dispatchChildren) ? observed.dispatchChildren.filter(Boolean) : [],
    sampleChangedPaths: Array.isArray(observed.sampleChangedPaths) ? observed.sampleChangedPaths.filter(Boolean) : [],
  };
}

function buildLatestSignoffSummary({ paths, latestSignoffCandidate }) {
  if (!latestSignoffCandidate) return null;
  const summary = latestSignoffCandidate.summary || {};
  const runtime = summary.runtime || {};
  const naturalTask = summary.naturalTask || {};
  const naturalAssertions = naturalTask.assertions || {};
  const signoffTask = summary.signoffTask || {};
  const signoffAssertions = signoffTask.assertions || {};
  return {
    schema: "latest-signoff-summary.v1",
    generatedAt: toIsoTimestamp(),
    bundle: {
      name: latestSignoffCandidate.name,
      bundleRoot: normalizeRelativePath(paths.workspaceRoot, latestSignoffCandidate.dirPath),
      summaryPath: normalizeRelativePath(paths.workspaceRoot, latestSignoffCandidate.summaryPath),
      generatedAt: toIsoTimestamp(latestSignoffCandidate.generatedAt),
    },
    runtime: {
      executionProfile: safeString(runtime.executionProfile, 80) || "",
      requestUserInputPolicy: safeString(runtime.nonInteractiveUserInput && runtime.nonInteractiveUserInput.policy, 40) || "",
      parentDispatchGuardMode: safeString(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode, 40) || "",
      fullUtilizationReady: runtime.fullUtilization && runtime.fullUtilization.ready ? 1 : 0,
    },
    workflow: {
      suiteId: safeString(summary.coreHarnessWorkflow && summary.coreHarnessWorkflow.suiteId, 120) || "",
      passedCases: Math.max(0, Math.trunc(Number(summary.coreHarnessWorkflow && summary.coreHarnessWorkflow.passedCases || 0))),
      failedCases: Math.max(0, Math.trunc(Number(summary.coreHarnessWorkflow && summary.coreHarnessWorkflow.failedCases || 0))),
      passRate: Number(Number(summary.coreHarnessWorkflow && summary.coreHarnessWorkflow.passRate || 0).toFixed(4)),
    },
    naturalTask: {
      threadId: safeString(naturalTask.threadId, 160) || "",
      turnId: safeString(naturalTask.turnId, 160) || "",
      artifactManifestPath: normalizeRelativePath(paths.workspaceRoot, naturalTask.artifactManifestPath),
      implementationObserved: naturalAssertions.implementationObserved ? 1 : 0,
      reviewerObserved: naturalAssertions.reviewerObserved ? 1 : 0,
      parentDispatchSatisfied: naturalAssertions.parentDispatchSatisfied ? 1 : 0,
    },
    signoffTask: {
      reviewerObserved: signoffAssertions.signoffReviewerExecuted ? 1 : 0,
      testerObserved: signoffAssertions.signoffTesterExecuted ? 1 : 0,
      signoffAssuranceSelected: signoffAssertions.signoffAssuranceSelected ? 1 : 0,
      reviewBreakdownPresent: signoffAssertions.reviewBreakdownPresent ? 1 : 0,
    },
    signoffCriteriaSatisfied: summary.allPassed ? 1 : 0,
    residualRisks: summary.allPassed ? [] : ["Latest signoff bundle does not satisfy every signoff assertion."],
  };
}

function findStageDuration(stageTimeline, stageName) {
  const stages = Array.isArray(stageTimeline && stageTimeline.stages) ? stageTimeline.stages : [];
  const match = stages.find((entry) => safeString(entry && entry.name, 120) === stageName);
  return Math.max(0, Math.trunc(Number(match && match.durationMs || 0)));
}

function sumChildWindowMs(flowTraceSummary, predicate) {
  const entries = Array.isArray(flowTraceSummary && flowTraceSummary.childEvidenceLedger)
    ? flowTraceSummary.childEvidenceLedger
    : [];
  return entries
    .filter((entry) => predicate(entry))
    .reduce((sum, entry) => {
      const firstSeenAt = parseTimestamp(entry && entry.firstSeenAt);
      const lastSeenAt = parseTimestamp(entry && entry.lastSeenAt, firstSeenAt);
      return sum + Math.max(0, lastSeenAt - firstSeenAt);
    }, 0);
}

function minPositive(values) {
  const filtered = values.filter((value) => Number.isFinite(Number(value)) && Number(value) > 0).map((value) => Number(value));
  return filtered.length ? Math.min(...filtered) : 0;
}

function buildCurrentReviewLoadSummary({ paths, reviewLoadBreakdown, stageTimeline, flowTraceSummary, latestRunSummary }) {
  const checkpoints = stageTimeline && typeof stageTimeline.checkpoints === "object" ? stageTimeline.checkpoints : {};
  const step4DurationMs = findStageDuration(stageTimeline, "Step 4 - Quality Gate");
  const step5DurationMs = findStageDuration(stageTimeline, "Step 5 - Final Outcome");
  const earliestGateEvidenceAt = minPositive([
    checkpoints.firstReviewAt,
    checkpoints.firstTesterAt,
    checkpoints.firstDocSyncAt,
  ]);
  const step4Stage = Array.isArray(stageTimeline && stageTimeline.stages)
    ? stageTimeline.stages.find((entry) => safeString(entry && entry.name, 120) === "Step 4 - Quality Gate")
    : null;
  const step4Start = parseTimestamp(step4Stage && step4Stage.startedAt);
  const step4End = parseTimestamp(step4Stage && step4Stage.endedAt);
  const reviewerTimeMs = sumChildWindowMs(flowTraceSummary, (entry) => entry && entry.reviewerObserved);
  const testerTimeMs = sumChildWindowMs(flowTraceSummary, (entry) => entry && entry.testerObserved);
  const docSyncVerificationTimeMs = checkpoints.firstDocSyncAt && step4End
    ? Math.max(0, step4End - Number(checkpoints.firstDocSyncAt))
    : 0;
  const evidenceCollectionTimeMs = step4Start && earliestGateEvidenceAt
    ? Math.max(0, earliestGateEvidenceAt - step4Start)
    : 0;
  const bottleneckCandidates = [
    ["evidence_collection", evidenceCollectionTimeMs],
    ["reviewer", reviewerTimeMs],
    ["tester", testerTimeMs],
    ["doc_sync_verification", docSyncVerificationTimeMs],
    ["outcome_conversion", step5DurationMs],
  ].sort((left, right) => right[1] - left[1]);
  return {
    schema: "operator-review-load-summary.v1",
    generatedAt: toIsoTimestamp(),
    sourceArtifactPath: normalizeRelativePath(paths.workspaceRoot, latestRunSummary && latestRunSummary.artifacts && latestRunSummary.artifacts.reviewLoadBreakdownPath),
    evidenceCollectionTimeMs,
    testerTimeMs,
    reviewerTimeMs,
    docSyncVerificationTimeMs,
    retryLoopCount: checkpoints.retryAt ? 1 : 0,
    outcomeConversionTimeMs: step5DurationMs,
    totalStep4DurationMs: step4DurationMs,
    dominantBottleneck: bottleneckCandidates[0] && bottleneckCandidates[0][1] > 0 ? bottleneckCandidates[0][0] : "none_observed",
    qualityGate: reviewLoadBreakdown && reviewLoadBreakdown.qualityGate ? reviewLoadBreakdown.qualityGate : {},
    reviewerFindingSummary: Array.isArray(reviewLoadBreakdown && reviewLoadBreakdown.reviewerFindingSummary)
      ? reviewLoadBreakdown.reviewerFindingSummary
      : [],
    testerResultSummary: Array.isArray(reviewLoadBreakdown && reviewLoadBreakdown.testerResultSummary)
      ? reviewLoadBreakdown.testerResultSummary
      : [],
    requiredEvidenceFailures: Array.isArray(reviewLoadBreakdown && reviewLoadBreakdown.requiredEvidenceFailures)
      ? reviewLoadBreakdown.requiredEvidenceFailures
      : [],
  };
}

function buildLatestRunSummary({ paths, runtimeSnapshot, latestExecutionRecord, latestSignoffSummary }) {
  if (!latestExecutionRecord) return null;
  const observedSignals = normalizeObservedSignals(latestExecutionRecord.observedSignals);
  const flowTraceSummary = loadArtifactDetail(latestExecutionRecord.flowTraceSummaryPath);
  const reviewLoadBreakdown = loadArtifactDetail(latestExecutionRecord.reviewLoadBreakdownPath);
  const evidenceManifest = loadArtifactDetail(latestExecutionRecord.evidenceManifestPath);
  const stageTimeline = loadArtifactDetail(latestExecutionRecord.stageTimelinePath);
  const changedPaths = Array.from(
    new Set([
      ...observedSignals.sampleChangedPaths,
      ...(Array.isArray(flowTraceSummary && flowTraceSummary.childEvidenceLedger)
        ? flowTraceSummary.childEvidenceLedger.flatMap((entry) => Array.isArray(entry && entry.ownedPaths) ? entry.ownedPaths : [])
        : []),
    ].filter(Boolean))
  ).slice(0, 24);
  const usedAgents = Array.isArray(flowTraceSummary && flowTraceSummary.usedAgents)
    ? flowTraceSummary.usedAgents
    : [safeString(latestExecutionRecord.agentName, 80)].filter(Boolean);
  const docSyncSummary = flowTraceSummary && flowTraceSummary.docSyncEvidence
    ? flowTraceSummary.docSyncEvidence
    : (evidenceManifest && evidenceManifest.docSyncEvidence) || null;
  const evidenceClassesCollected = Array.from(
    new Set([
      latestExecutionRecord.evidenceManifestPath ? "evidence_manifest" : "",
      latestExecutionRecord.stageTimelinePath ? "stage_timeline" : "",
      latestExecutionRecord.flowTraceSummaryPath ? "flow_trace_summary" : "",
      latestExecutionRecord.reviewLoadBreakdownPath ? "review_load_breakdown" : "",
      evidenceManifest && evidenceManifest.requirementContract ? "requirement_contract" : "",
      evidenceManifest && evidenceManifest.dispatchPlan ? "dispatch_plan" : "",
      reviewLoadBreakdown && Array.isArray(reviewLoadBreakdown.reviewerFindingSummary) && reviewLoadBreakdown.reviewerFindingSummary.length ? "reviewer_summary" : "",
      reviewLoadBreakdown && Array.isArray(reviewLoadBreakdown.testerResultSummary) && reviewLoadBreakdown.testerResultSummary.length ? "tester_summary" : "",
      docSyncSummary ? "doc_sync" : "",
    ].filter(Boolean))
  );
  const implementationObserved =
    observedSignals.fileChanges > 0 ||
    observedSignals.commandExecutions > 0 ||
    observedSignals.mcpCalls > 0;
  const latestRunSummary = {
    schema: "latest-run-summary.v1",
    generatedAt: toIsoTimestamp(),
    taskId: safeString(latestExecutionRecord.turnId, 160) || "",
    turnId: safeString(latestExecutionRecord.turnId, 160) || "",
    threadId: safeString(latestExecutionRecord.threadId, 160) || "",
    executionProfile: safeString(latestExecutionRecord.executionProfile, 80) || safeString(runtimeSnapshot && runtimeSnapshot.executionProfile, 80) || "",
    selectedPlanningDepth: safeString(latestExecutionRecord.planningDepth, 80) || safeString(flowTraceSummary && flowTraceSummary.selectedPlanningDepth, 80) || "",
    selectedAssuranceDepth: safeString(latestExecutionRecord.assuranceDepth, 80) || safeString(flowTraceSummary && flowTraceSummary.selectedAssuranceDepth, 80) || "",
    finalOutcome: {
      status: safeString(latestExecutionRecord.status, 80) || "",
      taskOutcomeStatus: safeString(latestExecutionRecord.taskOutcomeStatus, 80) || "",
      taskOutcomeReason: safeString(latestExecutionRecord.taskOutcomeReason, 160) || "",
    },
    dispatchCount: observedSignals.dispatchCount,
    dispatchSuccessCount: observedSignals.dispatchSuccessCount,
    implementationObserved: implementationObserved ? 1 : 0,
    reviewerObserved: reviewLoadBreakdown && reviewLoadBreakdown.qualityGate && reviewLoadBreakdown.qualityGate.reviewerObserved ? 1 : 0,
    testerObserved: reviewLoadBreakdown && reviewLoadBreakdown.qualityGate && reviewLoadBreakdown.qualityGate.testerObserved ? 1 : 0,
    usedAgents,
    usedPolicies: Array.isArray(flowTraceSummary && flowTraceSummary.usedPolicies) ? flowTraceSummary.usedPolicies : [],
    usedContracts: Array.isArray(flowTraceSummary && flowTraceSummary.usedContracts) ? flowTraceSummary.usedContracts : [],
    usedSkills: Array.isArray(flowTraceSummary && flowTraceSummary.usedSkills) ? flowTraceSummary.usedSkills : [],
    changedPaths: changedPaths.map((entry) => normalizeRelativePath(paths.workspaceRoot, entry)),
    evidenceClassesCollected,
    residualRisks: Array.isArray(flowTraceSummary && flowTraceSummary.residualRiskSummary) ? flowTraceSummary.residualRiskSummary : [],
    parentDispatchGuard: latestExecutionRecord.parentDispatchGuard || {},
    requestUserInput: runtimeSnapshot && runtimeSnapshot.nonInteractiveUserInput ? runtimeSnapshot.nonInteractiveUserInput : {},
    docSync: docSyncSummary || {},
    signoffSummaryRef: latestSignoffSummary && latestSignoffSummary.bundle ? latestSignoffSummary.bundle.summaryPath : "",
    artifacts: {
      evidenceManifestPath: normalizeRelativePath(paths.workspaceRoot, latestExecutionRecord.evidenceManifestPath),
      stageTimelinePath: normalizeRelativePath(paths.workspaceRoot, latestExecutionRecord.stageTimelinePath),
      flowTraceSummaryPath: normalizeRelativePath(paths.workspaceRoot, latestExecutionRecord.flowTraceSummaryPath),
      reviewLoadBreakdownPath: normalizeRelativePath(paths.workspaceRoot, latestExecutionRecord.reviewLoadBreakdownPath),
    },
    executionSource: safeString(latestExecutionRecord.executionSource, 80) || "",
  };
  latestRunSummary.reviewLoadBreakdown = buildCurrentReviewLoadSummary({
    paths,
    reviewLoadBreakdown,
    stageTimeline,
    flowTraceSummary,
    latestRunSummary,
  });
  return latestRunSummary;
}

function parseCasePreview(caseEntry) {
  const preview = safeString(caseEntry && caseEntry.output && caseEntry.output.preview, 4000);
  if (!preview) return null;
  try {
    return JSON.parse(preview);
  } catch {
    return null;
  }
}

function getWorkflowCase(coreHarnessWorkflowRun, caseId) {
  const runs = Array.isArray(coreHarnessWorkflowRun && coreHarnessWorkflowRun.report && coreHarnessWorkflowRun.report.runs)
    ? coreHarnessWorkflowRun.report.runs
    : [];
  const cases = runs[0] && Array.isArray(runs[0].cases) ? runs[0].cases : [];
  return cases.find((entry) => safeString(entry && entry.caseId, 120) === caseId) || null;
}

function buildConformanceCheck({ pass, reason, evidencePath }) {
  return {
    status: pass ? "pass" : "fail",
    reason: safeString(reason, 320) || (pass ? "evidence satisfied" : "evidence missing"),
    evidencePath: safeString(evidencePath, 400) || "",
  };
}

function buildDesignConformanceSummary({ paths, runtimeSnapshot, latestSignoffCandidate, latestRunSummary, latestSignoffSummary }) {
  const bundleSummary = latestSignoffCandidate ? latestSignoffCandidate.summary || {} : {};
  const signoffRuntime = readJsonIfExists(bundleSummary.paths && bundleSummary.paths.runtimeSnapshot) || runtimeSnapshot || {};
  const coreHarnessWorkflowRun = readJsonIfExists(bundleSummary.paths && bundleSummary.paths.coreHarnessWorkflow) || {};
  const runtimeSnapshotPath = latestSignoffCandidate && bundleSummary.paths && bundleSummary.paths.runtimeSnapshot
    ? normalizeRelativePath(paths.workspaceRoot, bundleSummary.paths.runtimeSnapshot)
    : normalizeRelativePath(paths.workspaceRoot, paths.currentRuntimeSnapshotPath);
  const workflowEvidencePath = latestSignoffCandidate && bundleSummary.paths && bundleSummary.paths.coreHarnessWorkflow
    ? normalizeRelativePath(paths.workspaceRoot, bundleSummary.paths.coreHarnessWorkflow)
    : "";
  const signoffSummaryPath = latestSignoffSummary && latestSignoffSummary.bundle ? latestSignoffSummary.bundle.summaryPath : "";
  const workerRejected = getWorkflowCase(coreHarnessWorkflowRun, "retired_worker_rejected");
  const workerScopedRejected = getWorkflowCase(coreHarnessWorkflowRun, "retired_worker_scoped_rejected");
  const fastPlanning = getWorkflowCase(coreHarnessWorkflowRun, "planning_mode_fast_selected");
  const discoveryPlanning = getWorkflowCase(coreHarnessWorkflowRun, "planning_mode_discovery_selected");
  const reviewerTesterRequired = getWorkflowCase(coreHarnessWorkflowRun, "reviewer_tester_required_case");
  const dedicatedTestsRequired = getWorkflowCase(coreHarnessWorkflowRun, "dedicated_test_required_for_new_logic");
  const failedValidationBridge = getWorkflowCase(coreHarnessWorkflowRun, "turn_task_outcome_bridge_failed_validation");
  const blockedBridge = getWorkflowCase(coreHarnessWorkflowRun, "turn_task_outcome_bridge_blocked");
  const missingEvidence = getWorkflowCase(coreHarnessWorkflowRun, "failed_validation_missing_evidence");
  const requestUserInputBlocked = getWorkflowCase(coreHarnessWorkflowRun, "needs_input_blocked_policy");
  const reviewerTesterPreview = parseCasePreview(reviewerTesterRequired) || {};
  const dedicatedTestsPreview = parseCasePreview(dedicatedTestsRequired) || {};
  const signoffTaskAssertions = bundleSummary.signoffTask && bundleSummary.signoffTask.assertions
    ? bundleSummary.signoffTask.assertions
    : {};
  const naturalTaskAssertions = bundleSummary.naturalTask && bundleSummary.naturalTask.assertions
    ? bundleSummary.naturalTask.assertions
    : {};
  const checks = {
    defaultExecAgentIsDefault: buildConformanceCheck({
      pass: Boolean(signoffRuntime.assertions && signoffRuntime.assertions.defaultExecAgentIsDefault),
      reason: Boolean(signoffRuntime.assertions && signoffRuntime.assertions.defaultExecAgentIsDefault)
        ? "Default exec agent remains `default`."
        : "Runtime posture no longer reports `default` as the default exec agent.",
      evidencePath: runtimeSnapshotPath,
    }),
    requestUserInputPolicyBlocked: buildConformanceCheck({
      pass: safeString(signoffRuntime.nonInteractiveUserInput && signoffRuntime.nonInteractiveUserInput.policy, 40) === "blocked"
        && Boolean(requestUserInputBlocked && requestUserInputBlocked.passed),
      reason: safeString(signoffRuntime.nonInteractiveUserInput && signoffRuntime.nonInteractiveUserInput.policy, 40) === "blocked"
        ? "Blocked request-user-input posture is confirmed by runtime posture and workflow probe."
        : "Blocked request-user-input posture is not confirmed.",
      evidencePath: workflowEvidencePath || runtimeSnapshotPath,
    }),
    parentDispatchGuardEnforced: buildConformanceCheck({
      pass: safeString(signoffRuntime.parentDispatchGuard && signoffRuntime.parentDispatchGuard.mode, 40) === "enforce",
      reason: safeString(signoffRuntime.parentDispatchGuard && signoffRuntime.parentDispatchGuard.mode, 40) === "enforce"
        ? "Parent dispatch guard is enforced."
        : "Parent dispatch guard mode is not `enforce`.",
      evidencePath: runtimeSnapshotPath,
    }),
    retiredWorkerNotRoutable: buildConformanceCheck({
      pass: Boolean(workerRejected && workerRejected.passed) && Boolean(workerScopedRejected && workerScopedRejected.passed),
      reason: Boolean(workerRejected && workerRejected.passed) && Boolean(workerScopedRejected && workerScopedRejected.passed)
        ? "Retired `worker` targets are rejected for both base and scoped aliases."
        : "Retired `worker` rejection is not proven for both target forms.",
      evidencePath: workflowEvidencePath,
    }),
    planningDepthSelectorWorking: buildConformanceCheck({
      pass: Boolean(fastPlanning && fastPlanning.passed) && Boolean(discoveryPlanning && discoveryPlanning.passed),
      reason: Boolean(fastPlanning && fastPlanning.passed) && Boolean(discoveryPlanning && discoveryPlanning.passed)
        ? "FAST and DISCOVERY planning probes both pass."
        : "Planning-depth selector probes are incomplete or failing.",
      evidencePath: workflowEvidencePath,
    }),
    assuranceDepthSelectorWorking: buildConformanceCheck({
      pass: Boolean(reviewerTesterRequired && reviewerTesterRequired.passed)
        && Boolean(dedicatedTestsRequired && dedicatedTestsRequired.passed)
        && safeString(reviewerTesterPreview.selectedAssuranceDepth, 80) === "SIGNOFF_ASSURANCE"
        && safeString(dedicatedTestsPreview.selectedAssuranceDepth, 80) === "SIGNOFF_ASSURANCE",
      reason: Boolean(reviewerTesterRequired && reviewerTesterRequired.passed)
        ? "Assurance probes escalate to SIGNOFF_ASSURANCE when reviewer/tester and dedicated tests are required."
        : "Assurance-depth probes do not prove signoff escalation.",
      evidencePath: workflowEvidencePath,
    }),
    specialistDispatchObservedWhenImplementationOccurred: buildConformanceCheck({
      pass: Boolean(naturalTaskAssertions.implementationObserved)
        && Boolean(naturalTaskAssertions.parentDispatchSatisfied)
        && Boolean(naturalTaskAssertions.dispatchCountObserved),
      reason: Boolean(naturalTaskAssertions.implementationObserved)
        ? "Natural task trace shows implementation with delegated specialist dispatch."
        : "Natural task trace does not show delegated implementation.",
      evidencePath: signoffSummaryPath,
    }),
    reviewerObservedWhenRequired: buildConformanceCheck({
      pass: Boolean(signoffTaskAssertions.signoffReviewerExecuted),
      reason: Boolean(signoffTaskAssertions.signoffReviewerExecuted)
        ? "Reviewer evidence is present when signoff assurance requires it."
        : "Reviewer evidence is missing from the signoff-required run.",
      evidencePath: signoffSummaryPath,
    }),
    testerObservedWhenRequired: buildConformanceCheck({
      pass: Boolean(signoffTaskAssertions.signoffTesterExecuted),
      reason: Boolean(signoffTaskAssertions.signoffTesterExecuted)
        ? "Tester evidence is present when signoff assurance requires it."
        : "Tester evidence is missing from the signoff-required run.",
      evidencePath: signoffSummaryPath,
    }),
    taskOutcomeSemanticsValid: buildConformanceCheck({
      pass: Boolean(failedValidationBridge && failedValidationBridge.passed)
        && Boolean(blockedBridge && blockedBridge.passed)
        && Boolean(missingEvidence && missingEvidence.passed),
      reason: Boolean(failedValidationBridge && failedValidationBridge.passed)
        ? "Task outcome probes validate FAILED_VALIDATION and BLOCKED bridge semantics."
        : "Task outcome bridge probes are incomplete or failing.",
      evidencePath: workflowEvidencePath,
    }),
    docSyncEvidencePresentWhenRequired: buildConformanceCheck({
      pass: Boolean(signoffTaskAssertions.evidenceBulletPresent)
        && Boolean(signoffTaskAssertions.changelogUpdated)
        && Boolean(signoffTaskAssertions.reviewBreakdownPresent),
      reason: Boolean(signoffTaskAssertions.evidenceBulletPresent)
        ? "Signoff task captured doc-sync and review-load evidence."
        : "Doc-sync evidence is incomplete for the signoff-required run.",
      evidencePath: signoffSummaryPath,
    }),
    signoffCriteriaSatisfied: buildConformanceCheck({
      pass: Boolean(bundleSummary.allPassed),
      reason: Boolean(bundleSummary.allPassed)
        ? "Latest signoff bundle passes all summary assertions."
        : "Latest signoff bundle is not ready for signoff.",
      evidencePath: signoffSummaryPath,
    }),
  };
  const overallPass = Object.values(checks).every((entry) => entry.status === "pass");
  return {
    schema: "design-conformance-summary.v1",
    generatedAt: toIsoTimestamp(),
    bundleRef: latestSignoffSummary && latestSignoffSummary.bundle ? latestSignoffSummary.bundle : null,
    checks,
    overallDesignConformance: {
      status: overallPass ? "pass" : "fail",
      reason: overallPass
        ? "Latest signoff bundle and runtime posture match the governed design contract."
        : "One or more design-conformance checks failed.",
      evidencePath: signoffSummaryPath || runtimeSnapshotPath,
    },
    latestRunRef: latestRunSummary ? normalizeRelativePath(paths.workspaceRoot, paths.currentLatestRunPath) : "",
  };
}

function buildCurrentIndex({ paths, latestRunSummary, latestSignoffSummary, latestProofCandidate }) {
  return {
    schema: "current-log-index.v1",
    generatedAt: toIsoTimestamp(),
    currentRoot: normalizeRelativePath(paths.workspaceRoot, paths.currentRoot),
    entrypoints: [
      {
        question: "Is the build conformant with the intended design?",
        path: normalizeRelativePath(paths.workspaceRoot, paths.currentDesignConformancePath),
      },
      {
        question: "What happened in the latest run?",
        path: normalizeRelativePath(paths.workspaceRoot, paths.currentLatestRunPath),
      },
      {
        question: "Is Step 4 too heavy?",
        path: normalizeRelativePath(paths.workspaceRoot, paths.currentReviewLoadPath),
      },
      {
        question: "What is the current runtime posture?",
        path: normalizeRelativePath(paths.workspaceRoot, paths.currentRuntimeSnapshotPath),
      },
      {
        question: "Can the latest signoff bundle be trusted?",
        path: normalizeRelativePath(paths.workspaceRoot, paths.currentLatestSignoffPath),
      },
    ],
    bundleRoots: {
      signoff: normalizeRelativePath(paths.workspaceRoot, paths.signoffBundlesRoot),
      proof: normalizeRelativePath(paths.workspaceRoot, paths.runtimeProofsRoot),
      replay: normalizeRelativePath(paths.workspaceRoot, paths.replayBundlesRoot),
    },
    archiveRoots: {
      raw: normalizeRelativePath(paths.workspaceRoot, paths.rawRoot),
      legacy: normalizeRelativePath(paths.workspaceRoot, paths.legacyRoot),
    },
    latestRefs: {
      latestRunTurnId: latestRunSummary ? latestRunSummary.turnId : "",
      latestSignoffSummaryPath: latestSignoffSummary && latestSignoffSummary.bundle ? latestSignoffSummary.bundle.summaryPath : "",
      latestProofSummaryPath: latestProofCandidate ? normalizeRelativePath(paths.workspaceRoot, latestProofCandidate.summaryPath) : "",
    },
  };
}

function refreshCurrentLogSurface({ workspaceRoot, runtimeSnapshot = null, latestTurnSnapshot = null } = {}) {
  const paths = buildLoggingPaths(workspaceRoot);
  ensureLoggingSurfaceDirs(paths);
  const serverModule = require(path.join(paths.workspaceRoot, "server.js"));
  if (!serverModule || typeof serverModule.refreshCurrentLogSurface !== "function") {
    throw new Error("server.js does not export refreshCurrentLogSurface");
  }
  serverModule.refreshCurrentLogSurface("restructure_logging_surface");
  [
    paths.currentIndexPath,
    paths.currentRuntimeSnapshotPath,
  ].forEach((targetPath) => {
    if (targetPath && fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { force: true });
    }
  });
  return {
    operatorSummaryPath: paths.currentOperatorSummaryPath,
    designConformancePath: paths.currentDesignConformancePath,
    latestRunPath: paths.currentLatestRunPath,
    reviewLoadPath: paths.currentReviewLoadPath,
    latestSignoffPath: paths.currentLatestSignoffPath,
  };
}

module.exports = {
  buildLoggingPaths,
  captureLogInventorySnapshot,
  ensureLoggingSurfaceDirs,
  listBundleSummaryCandidates,
  migrateLegacyLogLayout,
  normalizeRelativePath,
  readJsonIfExists,
  refreshCurrentLogSurface,
  writeJsonFile,
  ensureDir,
  writeJson: writeJsonFile,
  readJson: readJsonIfExists,
  getLoggingSurfacePaths: buildLoggingPaths,
  repoRelative: normalizeRelativePath,
  buildLogInventory: captureLogInventorySnapshot,
};
