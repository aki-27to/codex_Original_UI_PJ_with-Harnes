"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const defaultOutputDir = path.join(workspaceRoot, "output", "governance_public");
const defaultContractPath = path.join(workspaceRoot, "scripts", "config", "turn_trace_readout_contract.json");

function safeString(value, max = 600) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureDir(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  } catch {
    return {};
  }
}

function loadTurnTraceReadoutContract(contractPath = defaultContractPath) {
  return readJsonIfExists(contractPath);
}

function repoRelative(value) {
  const text = safeString(value, 1200);
  if (!text) return "";
  const normalized = text.replace(/\\/g, "/");
  if (!path.isAbsolute(text)) return normalized.replace(/^\/+/, "");
  const relative = path.relative(workspaceRoot, text).replace(/\\/g, "/");
  return relative && !relative.startsWith("..") ? relative : normalized;
}

function uniqueStrings(values, max = 24) {
  const output = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = safeString(value, 500);
    if (!text || output.includes(text)) continue;
    output.push(text);
    if (output.length >= max) break;
  }
  return output;
}

function firstString(values, max = 600) {
  for (const value of Array.isArray(values) ? values : []) {
    const text = safeString(value, max);
    if (text) return text;
  }
  return "";
}

function buildTurnTraceReadoutModel({
  sourceDir = defaultOutputDir,
  generatedAt = new Date().toISOString(),
} = {}) {
  const resolvedSourceDir = path.resolve(sourceDir);
  const requestFrame = readJsonIfExists(path.join(resolvedSourceDir, "request_frame.json"));
  const flowTrace = readJsonIfExists(path.join(resolvedSourceDir, "flow_trace_summary.json"));
  const stageTimeline = readJsonIfExists(path.join(resolvedSourceDir, "stage_timeline.json"));
  const evidenceManifest = readJsonIfExists(path.join(resolvedSourceDir, "evidence_manifest.json"));
  const reviewBundle = readJsonIfExists(path.join(resolvedSourceDir, "review_bundle.json"));
  const workerDecisionSurface = readJsonIfExists(path.join(resolvedSourceDir, "worker_decision_surface.json"));
  const releaseDecision = readJsonIfExists(path.join(resolvedSourceDir, "release_decision.json"));
  const exportManifest = readJsonIfExists(path.join(resolvedSourceDir, "export_manifest.json"));

  const expectedDeliverable = uniqueStrings(requestFrame.expected_deliverable, 8);
  const acceptanceCriteria = uniqueStrings(requestFrame.acceptance_criteria, 8);
  const childEvidenceLedger = Array.isArray(flowTrace.childEvidenceLedger) ? flowTrace.childEvidenceLedger : [];
  const stages = Array.isArray(stageTimeline.stages) ? stageTimeline.stages : [];
  const exportedArtifacts = Array.isArray(exportManifest.exportedArtifacts) ? exportManifest.exportedArtifacts : [];
  const exportedArtifactNames = exportedArtifacts.map((entry) => safeString(entry && entry.file, 220)).filter(Boolean);
  const changedArtifacts = uniqueStrings([
    ...uniqueStrings(flowTrace.docSyncEvidence && flowTrace.docSyncEvidence.updatedPaths, 20),
    ...childEvidenceLedger.flatMap((entry) => uniqueStrings(entry && entry.ownedPaths, 12)),
    ...exportedArtifactNames.filter((name) => /surface|decision|evidence|trace|readout|overview|manifest/i.test(name)),
  ], 36).map(repoRelative);
  const evidenceSources = uniqueStrings([
    ...uniqueStrings(flowTrace.evidenceSources, 20),
    ...exportedArtifactNames,
  ], 48);
  const riskItems = uniqueStrings([
    ...uniqueStrings(reviewBundle.blockers, 12),
    ...uniqueStrings(reviewBundle.missing_evidence, 12),
    ...uniqueStrings(reviewBundle.residual_risk, 12),
    ...uniqueStrings(workerDecisionSurface.residualRisks, 12),
  ], 24);
  const reviewerObserved = safeNumber(flowTrace.reviewerExecuted || stageTimeline.qualityGate && stageTimeline.qualityGate.reviewerObserved);
  const testerObserved = safeNumber(flowTrace.testerExecuted || stageTimeline.qualityGate && stageTimeline.qualityGate.testerObserved);

  return {
    schema: "turn-trace-readout-model.v1",
    generatedAt,
    sourceDir: repoRelative(resolvedSourceDir),
    userRequest: safeString(requestFrame.user_goal, 1200) || firstString(expectedDeliverable, 1200),
    expectedDeliverable,
    acceptanceCriteria,
    selectedPlanningMode: safeString(flowTrace.selectedPlanningMode || stageTimeline.selectedPlanningMode, 80),
    selectedPlanningDepth: safeString(flowTrace.selectedPlanningDepth || stageTimeline.selectedPlanningDepth, 80),
    selectedAssuranceDepth: safeString(flowTrace.selectedAssuranceDepth || stageTimeline.selectedAssuranceDepth, 80),
    executionFlow: safeString(flowTrace.executionFlow || stageTimeline.executionFlow, 120),
    flowPath: safeString(flowTrace.flowPath || stageTimeline.flowPath, 120),
    finalOutcome: {
      status: safeString(flowTrace.finalOutcome && flowTrace.finalOutcome.status, 80),
      taskOutcomeStatus: safeString(flowTrace.finalOutcome && flowTrace.finalOutcome.taskOutcomeStatus, 80),
      taskOutcomeReason: safeString(flowTrace.finalOutcome && flowTrace.finalOutcome.taskOutcomeReason, 200),
      workerOutcome: safeString(workerDecisionSurface.topLevelOutcome, 120),
      releaseDecision: safeString(releaseDecision.terminal_state || releaseDecision.finalOutcome, 120),
    },
    stageCount: stages.length,
    stages: stages.map((stage) => ({
      name: safeString(stage && stage.name, 160),
      status: safeString(stage && stage.status, 80),
      durationMs: safeNumber(stage && stage.durationMs),
    })),
    dispatchCount: safeNumber(flowTrace.dispatchCount),
    dispatchSuccessCount: safeNumber(flowTrace.dispatchSuccessCount),
    reviewerObserved,
    testerObserved,
    agents: childEvidenceLedger.map((entry) => ({
      agent: safeString(entry && entry.agent, 160),
      dispatchCount: safeNumber(entry && entry.dispatchCount),
      completedCount: safeNumber(entry && entry.completedCount),
      failedCount: safeNumber(entry && entry.failedCount),
      reviewerObserved: safeNumber(entry && entry.reviewerObserved),
      testerObserved: safeNumber(entry && entry.testerObserved),
      evidenceNotes: uniqueStrings(entry && entry.evidenceNotes, 3),
    })),
    evidenceSourceCount: evidenceSources.length,
    evidenceSources,
    changedArtifactCount: changedArtifacts.length,
    changedArtifacts,
    decisions: [
      `worker=${safeString(workerDecisionSurface.topLevelOutcome, 120) || "UNKNOWN"}`,
      `release=${safeString(releaseDecision.terminal_state || releaseDecision.finalOutcome, 120) || "UNKNOWN"}`,
      `flow=${safeString(flowTrace.executionFlow || stageTimeline.executionFlow, 120) || "UNKNOWN"}`,
      `assurance=${safeString(flowTrace.selectedAssuranceDepth || stageTimeline.selectedAssuranceDepth, 80) || "UNKNOWN"}`,
    ],
    risks: riskItems.length ? riskItems : ["No blocker or residual-risk item is present in the public trace."],
  };
}

function renderList(items, emptyText) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return `<p class="empty">${escapeHtml(emptyText || "No entries.")}</p>`;
  return `<ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderMetric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderTurnTraceReadoutHtml(model, contract = loadTurnTraceReadoutContract()) {
  const requiredSections = Array.isArray(contract.requiredSections) ? contract.requiredSections : [];
  const sectionMarker = (id) => requiredSections.includes(id) ? ` data-required-section="true"` : "";
  const stages = Array.isArray(model.stages) ? model.stages : [];
  const agents = Array.isArray(model.agents) ? model.agents : [];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Turn Trace Readout</title>
  <style>
    :root { color-scheme: light; --bg: #f7f7f4; --ink: #161616; --muted: #5b6169; --line: #d7d7cf; --panel: #ffffff; --accent: #245c6f; --ok: #286b3f; --warn: #8a5a00; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: var(--bg); color: var(--ink); line-height: 1.45; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    header { border-bottom: 2px solid var(--line); padding-bottom: 18px; margin-bottom: 20px; }
    h1 { margin: 0 0 8px; font-size: 30px; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 19px; letter-spacing: 0; }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px; margin: 14px 0; }
    .meta { color: var(--muted); font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
    .metric { border: 1px solid var(--line); border-radius: 6px; padding: 10px; min-height: 70px; background: #fbfbf8; }
    .metric span { display: block; color: var(--muted); font-size: 12px; }
    .metric strong { display: block; margin-top: 5px; font-size: 18px; overflow-wrap: anywhere; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border-bottom: 1px solid var(--line); padding: 8px; text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 700; }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 5px 0; overflow-wrap: anywhere; }
    .status { display: inline-block; border-radius: 999px; border: 1px solid var(--line); padding: 2px 8px; font-size: 12px; color: var(--accent); }
    .empty { color: var(--muted); margin: 0; }
    .two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
    @media (max-width: 760px) { main { padding: 16px; } .two { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Turn Trace Readout</h1>
      <div class="meta">Generated ${escapeHtml(model.generatedAt)} from ${escapeHtml(model.sourceDir || "output/governance_public")} using ${escapeHtml(contract.schema || "turn-trace-readout-contract.v1")}.</div>
    </header>
    <section id="overview"${sectionMarker("overview")}>
      <h2>Overview</h2>
      <p>${escapeHtml(model.userRequest || "No request frame is available.")}</p>
      <div class="grid">
        ${renderMetric("Planning depth", model.selectedPlanningDepth || "unknown")}
        ${renderMetric("Assurance depth", model.selectedAssuranceDepth || "unknown")}
        ${renderMetric("Execution flow", model.executionFlow || "unknown")}
        ${renderMetric("Worker outcome", model.finalOutcome && model.finalOutcome.workerOutcome || "unknown")}
        ${renderMetric("Task status", model.finalOutcome && model.finalOutcome.taskOutcomeStatus || "unknown")}
        ${renderMetric("Release decision", model.finalOutcome && model.finalOutcome.releaseDecision || "unknown")}
      </div>
    </section>
    <section id="timeline"${sectionMarker("timeline")}>
      <h2>Timeline</h2>
      <table>
        <thead><tr><th>Stage</th><th>Status</th><th>Duration</th></tr></thead>
        <tbody>
          ${stages.length ? stages.map((stage) => `<tr><td>${escapeHtml(stage.name)}</td><td><span class="status">${escapeHtml(stage.status || "unknown")}</span></td><td>${escapeHtml(stage.durationMs)} ms</td></tr>`).join("") : `<tr><td colspan="3">No stage timeline is available.</td></tr>`}
        </tbody>
      </table>
    </section>
    <section id="tool_and_evidence"${sectionMarker("tool_and_evidence")}>
      <h2>Tool And Evidence</h2>
      <div class="grid">
        ${renderMetric("Dispatches", `${model.dispatchSuccessCount}/${model.dispatchCount}`)}
        ${renderMetric("Reviewer observed", model.reviewerObserved)}
        ${renderMetric("Tester observed", model.testerObserved)}
        ${renderMetric("Evidence sources", model.evidenceSourceCount)}
      </div>
      <div class="two">
        <div>
          <h2>Agents</h2>
          <table>
            <thead><tr><th>Agent</th><th>Done</th><th>Review</th></tr></thead>
            <tbody>
              ${agents.length ? agents.map((agent) => `<tr><td>${escapeHtml(agent.agent || "unknown")}</td><td>${escapeHtml(agent.completedCount)}/${escapeHtml(agent.dispatchCount)}</td><td>reviewer ${escapeHtml(agent.reviewerObserved)} / tester ${escapeHtml(agent.testerObserved)}</td></tr>`).join("") : `<tr><td colspan="3">No child-agent ledger is available.</td></tr>`}
            </tbody>
          </table>
        </div>
        <div>
          <h2>Evidence Sources</h2>
          ${renderList(model.evidenceSources, "No evidence source list is available.")}
        </div>
      </div>
    </section>
    <section id="decisions"${sectionMarker("decisions")}>
      <h2>Decisions</h2>
      ${renderList(model.decisions, "No decision summary is available.")}
    </section>
    <section id="divergence_and_risks"${sectionMarker("divergence_and_risks")}>
      <h2>Divergence And Risks</h2>
      ${renderList(model.risks, "No risk summary is available.")}
    </section>
    <section id="changed_artifacts"${sectionMarker("changed_artifacts")}>
      <h2>Changed Artifacts</h2>
      ${renderList(model.changedArtifacts, "No changed artifact list is available.")}
    </section>
  </main>
</body>
</html>
`;
}

function writeTurnTraceReadout({
  sourceDir = defaultOutputDir,
  outPath = path.join(defaultOutputDir, "turn_trace_readout.html"),
  generatedAt = new Date().toISOString(),
  contractPath = defaultContractPath,
} = {}) {
  const contract = loadTurnTraceReadoutContract(contractPath);
  const model = buildTurnTraceReadoutModel({ sourceDir, generatedAt });
  const html = renderTurnTraceReadoutHtml(model, contract);
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, html, "utf8");
  return {
    outPath: path.resolve(outPath),
    model,
    contract,
  };
}

module.exports = {
  defaultContractPath,
  defaultOutputDir,
  buildTurnTraceReadoutModel,
  loadTurnTraceReadoutContract,
  renderTurnTraceReadoutHtml,
  writeTurnTraceReadout,
};
