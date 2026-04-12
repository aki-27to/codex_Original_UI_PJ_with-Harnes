const OVERVIEW_REFRESH_MS = 20000;

const state = {
  payload: null,
  requestId: 0,
  timer: null,
};

const elements = {
  refreshBtn: by("overviewRefreshBtn"),
  refreshState: by("overviewRefreshState"),
  generatedAt: by("overviewGeneratedAt"),
  heroText: by("overviewHeroText"),
  heroPills: by("overviewHeroPills"),
  errorBanner: by("overviewErrorBanner"),
  metrics: by("overviewMetrics"),
  jobScenarioGrid: by("jobScenarioGrid"),
  capabilitySurfaceSummary: by("capabilitySurfaceSummary"),
  capabilitySurfaceGrid: by("capabilitySurfaceGrid"),
  demoFlowGrid: by("demoFlowGrid"),
  runtimePostureCard: by("runtimePostureCard"),
  guardrailCard: by("guardrailCard"),
  stopBudgetCard: by("stopBudgetCard"),
  healthCard: by("healthCard"),
  topologySummary: by("topologySummary"),
  topologyParentLane: by("topologyParentLane"),
  topologySpecialistLane: by("topologySpecialistLane"),
  topologyVerificationLane: by("topologyVerificationLane"),
  topologyRetiredLane: by("topologyRetiredLane"),
  turnContractCard: by("turnContractCard"),
  taskOutcomeCard: by("taskOutcomeCard"),
  governanceCard: by("governanceCard"),
  traceabilityCard: by("traceabilityCard"),
  signoffEvidenceCard: by("signoffEvidenceCard"),
  runtimeProofCard: by("runtimeProofCard"),
  evalRunsCard: by("evalRunsCard"),
  apiSurfacesCard: by("apiSurfacesCard"),
  executionMemoryCard: by("executionMemoryCard"),
  replayPatternsCard: by("replayPatternsCard"),
  skillPortfolioCard: by("skillPortfolioCard"),
  externalLearningCard: by("externalLearningCard"),
  documentToolingCard: by("documentToolingCard"),
  governedMemoryCard: by("governedMemoryCard"),
  roleChecksCard: by("roleChecksCard"),
  rawSnapshot: by("overviewRawSnapshot"),
};

function by(id) {
  return document.getElementById(id);
}

function toArr(value) {
  return Array.isArray(value) ? value : [];
}

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeText(value, fallback = "") {
  if (value == null) {
    return fallback;
  }
  const text = String(value).trim();
  return text || fallback;
}

function lower(value) {
  return safeText(value).toLowerCase();
}

function runtimeActiveAgent(runtime) {
  return safeText(runtime && runtime.activeAgent, "unreported");
}

function runtimeDefaultExecAgent(runtime) {
  return safeText(runtime && runtime.fullUtilization && runtime.fullUtilization.actual && runtime.fullUtilization.actual.defaultExecAgent, "unreported");
}

function formatDateTime(value) {
  const ms = num(value, 0);
  if (!ms) {
    return "--:--:--";
  }
  return new Date(ms).toLocaleString("ja-JP", { hour12: false });
}

function formatTime(value) {
  const ms = num(value, 0);
  if (!ms) {
    return "--:--:--";
  }
  return new Date(ms).toLocaleTimeString("ja-JP", { hour12: false });
}

function formatPercent(value) {
  if (!Number.isFinite(Number(value))) {
    return "--";
  }
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatInteger(value) {
  const parsed = num(value, 0);
  return new Intl.NumberFormat("ja-JP").format(Math.trunc(parsed));
}

function formatSelfImprovementProgress(entry) {
  const reinforcement = entry && entry.reinforcement && typeof entry.reinforcement === "object"
    ? entry.reinforcement
    : null;
  if (!reinforcement) {
    return "-";
  }
  return `success ${formatInteger(num(reinforcement.successCount, 0))}/${formatInteger(num(reinforcement.requiredSuccesses, 0))} / obs ${formatInteger(num(reinforcement.observedCount, 0))} / rate ${formatPercent(num(reinforcement.successRate, 0))} / last ${safeText(reinforcement.lastObservedAt, "-")}`;
}

function toneForPromotionDecision(value) {
  const normalized = lower(value).replace(/_/g, "-");
  if (normalized === "auto-apply candidate" || normalized === "auto-apply-candidate" || normalized === "applied") {
    return "pass";
  }
  if (normalized === "blocked") {
    return "fail";
  }
  if (normalized === "proposal-only" || normalized === "proposal only") {
    return "warn";
  }
  return "neutral";
}

function toneForManualClassification(value) {
  const normalized = lower(value).replace(/_/g, "-");
  if (normalized === "quality-note" || normalized === "quality note") {
    return "warn";
  }
  if (normalized === "skill-candidate" || normalized === "skill candidate") {
    return "pass";
  }
  if (normalized === "runtime-hint" || normalized === "runtime hint") {
    return "info";
  }
  return "neutral";
}

function formatCaptureTimestamp(value) {
  if (typeof value === "number") {
    return formatDateTime(value);
  }
  return safeText(value, "-");
}

function joinSummaryParts(values, fallback = "-") {
  const parts = toArr(values)
    .map((entry) => safeText(entry))
    .filter(Boolean);
  return parts.length ? parts.join(" / ") : fallback;
}

function countEntriesByDecision(entries, decision) {
  const expected = lower(decision).replace(/_/g, "-");
  return toArr(entries).filter((entry) => lower(entry && entry.promotionDecision).replace(/_/g, "-") === expected).length;
}

function countEntriesByClassification(entries, classification) {
  const expected = lower(classification).replace(/_/g, "-");
  return toArr(entries).filter((entry) => lower(entry && entry.classification).replace(/_/g, "-") === expected).length;
}

function normalizeManualCaptureSummary(payload, externalLearning, selfImprovement) {
  const memoryExternalLearning = payload && payload.memory && payload.memory.externalLearning && typeof payload.memory.externalLearning === "object"
    ? payload.memory.externalLearning
    : {};
  const runtimeManualSelfImprovement = payload && payload.runtime && payload.runtime.manualSelfImprovement && typeof payload.runtime.manualSelfImprovement === "object"
    ? payload.runtime.manualSelfImprovement
    : null;
  const memoryManualSelfImprovement = payload && payload.memory && payload.memory.manualSelfImprovement && typeof payload.memory.manualSelfImprovement === "object"
    ? payload.memory.manualSelfImprovement
    : null;
  const rawSummary = [
    selfImprovement && selfImprovement.manualCaptureSummary,
    externalLearning && externalLearning.manualCaptureSummary,
    memoryExternalLearning && memoryExternalLearning.manualCaptureSummary,
    runtimeManualSelfImprovement,
    memoryManualSelfImprovement,
  ].find((entry) => entry && typeof entry === "object");
  if (!rawSummary) {
    return null;
  }
  const entries = toArr(rawSummary.entries && rawSummary.entries.length ? rawSummary.entries : rawSummary.lessons).map((entry) => {
    const appliesTo = entry && entry.appliesTo && typeof entry.appliesTo === "object"
      ? entry.appliesTo
      : {};
    const supportingArtifacts = toArr(entry && entry.supportingArtifacts).map((artifact) => safeText(artifact)).filter(Boolean);
    const evidenceText = safeText(entry && (entry.evidenceSummary || entry.evidence), "").slice(0, 200);
    return {
      title: safeText(entry && (entry.lessonSummary || entry.title || entry.summary), "manual lesson"),
      classification: safeText(entry && entry.classification, "runtime hint"),
      promotionDecision: safeText(entry && entry.promotionDecision, "proposal-only"),
      detail: joinSummaryParts([
        toArr(appliesTo.agent).length ? `agent ${toArr(appliesTo.agent).slice(0, 2).join(", ")}` : "",
        toArr(appliesTo.taskFamily).length ? `family ${toArr(appliesTo.taskFamily).slice(0, 2).join(", ")}` : "",
        toArr(appliesTo.triggers).length ? `trigger ${toArr(appliesTo.triggers).slice(0, 1).join(", ")}` : "",
        evidenceText ? `evidence ${evidenceText}` : "",
        supportingArtifacts.length ? `artifacts ${supportingArtifacts.slice(0, 2).join(", ")}` : "",
      ]),
    };
  });
  const entryCount = num(rawSummary.entryCount, entries.length) || entries.length;
  return {
    schema: safeText(rawSummary.schema, "manual-self-improvement-capture.v1"),
    generatedAt: formatCaptureTimestamp(rawSummary.generatedAt),
    artifactPath: safeText(rawSummary.artifactPath || rawSummary.path || rawSummary.sourcePath, ""),
    sourceKind: safeText(rawSummary.source && rawSummary.source.kind, safeText(rawSummary.sourceKind, "manual_turn_capture")),
    request: safeText(rawSummary.source && rawSummary.source.request, safeText(rawSummary.request || rawSummary.requestSummary, "")),
    status: safeText(rawSummary.status || rawSummary.captureStatus, entryCount ? "captured" : "empty"),
    entryCount,
    proposalOnlyCount: num(rawSummary.proposalOnlyCount, countEntriesByDecision(entries, "proposal-only")),
    blockedCount: num(rawSummary.blockedCount, countEntriesByDecision(entries, "blocked")),
    autoApplyCandidateCount: num(rawSummary.autoApplyCandidateCount, countEntriesByDecision(entries, "auto-apply candidate")),
    runtimeHintCount: num(rawSummary.runtimeHintCount, countEntriesByClassification(entries, "runtime hint")),
    qualityNoteCount: num(rawSummary.qualityNoteCount, countEntriesByClassification(entries, "quality note")),
    skillCandidateCount: num(rawSummary.skillCandidateCount, countEntriesByClassification(entries, "skill candidate")),
    entries,
  };
}

function populatedObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toneForTaskOutcome(value) {
  const normalized = lower(value);
  if (normalized === "completed" || normalized === "pass" || normalized === "ready" || normalized === "ready_to_gate") {
    return "pass";
  }
  if (normalized === "failed_validation" || normalized === "blocked" || normalized === "fail") {
    return "fail";
  }
  if (normalized === "needs_input" || normalized === "partial" || normalized === "wait" || normalized === "awaiting_observations" || normalized === "awaiting_reinforcement" || normalized === "policy_disabled") {
    return "warn";
  }
  if (normalized === "running" || normalized === "enforce" || normalized === "configured") {
    return "info";
  }
  return "neutral";
}

function setRefreshState(label, variant) {
  if (!elements.refreshState) {
    return;
  }
  elements.refreshState.textContent = label;
  elements.refreshState.className = `pill ${variant}`;
}

function setError(message) {
  if (!elements.errorBanner) {
    return;
  }
  const text = safeText(message);
  if (!text) {
    elements.errorBanner.textContent = "";
    elements.errorBanner.classList.add("hidden");
    return;
  }
  elements.errorBanner.textContent = text;
  elements.errorBanner.classList.remove("hidden");
}

function tagHtml(label, tone) {
  const text = safeText(label);
  if (!text) {
    return "";
  }
  return `<span class="overview-tag ${escapeHtml(tone || "neutral")}">${escapeHtml(text)}</span>`;
}

function factRowsHtml(entries) {
  const items = toArr(entries)
    .filter((entry) => entry && (entry.label || entry.value || entry.detail))
    .map((entry) => {
      const label = escapeHtml(safeText(entry.label, "-"));
      const value = escapeHtml(safeText(entry.value, "-"));
      const detail = safeText(entry.detail);
      return `
        <div class="overview-fact-row">
          <span class="overview-fact-label">${label}</span>
          <span class="overview-fact-value">${value}</span>
          ${detail ? `<span class="overview-fact-detail">${escapeHtml(detail)}</span>` : ""}
        </div>
      `;
    });
  if (!items.length) {
    return `<div class="overview-empty">Nothing to show yet.</div>`;
  }
  return `<div class="overview-fact-list">${items.join("")}</div>`;
}

function itemListHtml(items, emptyText) {
  const rows = toArr(items)
    .filter(Boolean)
    .map((item) => {
      const title = escapeHtml(safeText(item.title || item.label || item.name, "Untitled"));
      const detail = safeText(item.detail || item.description || item.meta);
      const tags = toArr(item.tags).map((tag) => tagHtml(tag.label, tag.tone)).join("");
      const lines = toArr(item.lines)
        .filter((line) => safeText(line))
        .map((line) => `<span class="overview-code-line">${escapeHtml(safeText(line))}</span>`)
        .join("");
      return `
        <article class="overview-list-item">
          <strong>${title}</strong>
          ${tags ? `<div class="overview-inline-tags">${tags}</div>` : ""}
          ${detail ? `<p>${escapeHtml(detail)}</p>` : ""}
          ${lines ? `<div class="overview-mono-list">${lines}</div>` : ""}
        </article>
      `;
    });
  if (!rows.length) {
    return `<div class="overview-empty">${escapeHtml(emptyText || "Nothing to show yet.")}</div>`;
  }
  return `<div class="overview-list">${rows.join("")}</div>`;
}

function metricCardHtml(card) {
  return `
    <article class="overview-metric-card">
      <span class="overview-metric-label">${escapeHtml(safeText(card.label, "-"))}</span>
      <strong>${escapeHtml(safeText(card.value, "-"))}</strong>
      <div class="overview-inline-tags">${toArr(card.tags).map((tag) => tagHtml(tag.label, tag.tone)).join("")}</div>
      <p class="overview-metric-detail">${escapeHtml(safeText(card.detail, ""))}</p>
    </article>
  `;
}

function agentCardHtml(agent) {
  const tags = [
    { label: agent.status || "idle", tone: toneForTaskOutcome(agent.status) },
    { label: agent.source || "runtime", tone: "neutral" },
    agent.governance && agent.governance.readOnly ? { label: "read-only", tone: "warn" } : null,
    agent.governance && agent.governance.verificationOnly ? { label: "verification", tone: "warn" } : null,
    agent.governance && agent.governance.legacyOnly ? { label: "legacy-only", tone: "fail" } : null,
    agent.governance && agent.governance.requiresParentOverride ? { label: "override", tone: "warn" } : null,
  ].filter(Boolean);
  const lines = [];
  if (safeText(agent.sessionRef)) {
    lines.push(`session=${safeText(agent.sessionRef)}`);
  }
  if (safeText(agent.threadId)) {
    lines.push(`thread=${safeText(agent.threadId)}`);
  }
  if (safeText(agent.activeTurnId)) {
    lines.push(`turn=${safeText(agent.activeTurnId)}`);
  }
  if (safeText(agent.configFile)) {
    lines.push(`config=${safeText(agent.configFile)}`);
  }
  const scopePaths = toArr(agent.governance && agent.governance.scopePaths)
    .slice(0, 4)
    .map((entry) => safeText(entry))
    .filter(Boolean);
  return `
    <article class="overview-agent-card ${agent.active ? "active" : ""}">
      <div class="overview-agent-head">
        <div>
          <strong>${escapeHtml(safeText(agent.name, "unknown"))}</strong>
          <p>${escapeHtml(safeText(agent.description || agent.role || "Configured role"))}</p>
        </div>
        ${tagHtml(agent.role || "child", agent.role === "parent" ? "info" : "neutral")}
      </div>
      <div class="overview-inline-tags">${tags.map((tag) => tagHtml(tag.label, tag.tone)).join("")}</div>
      ${scopePaths.length ? `<div class="overview-mono-list">${scopePaths.map((entry) => `<span>scope=${escapeHtml(entry)}</span>`).join("")}</div>` : ""}
      ${toArr(agent.skills).length ? `<div class="overview-inline-tags">${toArr(agent.skills).map((skill) => tagHtml(skill, "info")).join("")}</div>` : ""}
      ${lines.length ? `<div class="overview-mono-list">${lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</div>` : ""}
    </article>
  `;
}

function renderHero(payload) {
  const runtime = payload && payload.runtime ? payload.runtime : {};
  const health = payload && payload.health ? payload.health : {};
  const topology = payload && payload.topology ? payload.topology : {};
  const signoff = payload && payload.evidence && payload.evidence.signoff ? payload.evidence.signoff.latest : null;
  const runtimeProof = payload && payload.evidence && payload.evidence.runtimeProof ? payload.evidence.runtimeProof.latest : null;
  const latestTurn = runtime && runtime.latestTurn && typeof runtime.latestTurn === "object"
    ? runtime.latestTurn
    : health && health.latestTurn && typeof health.latestTurn === "object"
      ? health.latestTurn
      : {};
  const summaryText = [
    "This page is not a generic shell dashboard.",
    "Use it to answer three buyer questions: can the worker do real delegated work, can review trust the release call, and can long-running work resume without guesswork.",
    `Active runtime agent is ${runtimeActiveAgent(runtime)}.`,
    `Default exec agent is ${runtimeDefaultExecAgent(runtime)}.`,
    `Latest task outcome is ${safeText(latestTurn.task_outcome_status, "unreported")}.`,
    `Guard mode is ${safeText(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode, "off")}.`,
    `${formatInteger(num(topology.summary && topology.summary.total, 0))} visible topology rows are grouped into parents, specialists, verification lanes, and retired artifacts.`,
    signoff && signoff.assertions && signoff.assertions.allPassed ? "Latest signoff bundle is PASS." : "Latest signoff bundle is not fully passing yet.",
    runtimeProof && runtimeProof.liveExec ? `Latest runtime proof recorded dispatch success count ${formatInteger(num(runtimeProof.liveExec.dispatchSuccessCount, 0))}.` : "No runtime proof bundle is available yet.",
    `SLO status is ${safeText(health.slo && health.slo.status, "insufficient_data")}.`,
  ].join(" ");
  if (elements.heroText) {
    elements.heroText.textContent = summaryText;
  }
  if (elements.heroPills) {
    const pills = [
      tagHtml("compare on adoptability", "info"),
      tagHtml("compare on release honesty", "info"),
      tagHtml("compare on auditability", "info"),
      tagHtml(`full-utilization ${runtime.fullUtilization && runtime.fullUtilization.ready ? "ready" : "not-ready"}`, runtime.fullUtilization && runtime.fullUtilization.ready ? "ready" : "warn"),
      tagHtml(`request-user-input ${safeText(runtime.nonInteractiveUserInput && runtime.nonInteractiveUserInput.policy, "unknown")}`, toneForTaskOutcome(runtime.nonInteractiveUserInput && runtime.nonInteractiveUserInput.policy)),
      tagHtml(`parent-guard ${safeText(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode, "off")}`, toneForTaskOutcome(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode)),
      tagHtml(`signoff ${signoff && signoff.assertions && signoff.assertions.allPassed ? "pass" : "pending"}`, signoff && signoff.assertions && signoff.assertions.allPassed ? "pass" : "warn"),
      tagHtml(`runtime-proof ${runtimeProof ? "present" : "missing"}`, runtimeProof ? "info" : "warn"),
      tagHtml(`slo ${safeText(health.slo && health.slo.status, "insufficient_data")}`, toneForTaskOutcome(health.slo && health.slo.status)),
    ];
    elements.heroPills.innerHTML = pills.join("");
  }
}

function renderMetrics(payload) {
  const runtime = payload && payload.runtime ? payload.runtime : {};
  const topology = payload && payload.topology ? payload.topology : {};
  const evidence = payload && payload.evidence ? payload.evidence : {};
  const iterationControl = runtime && runtime.iterationControl && typeof runtime.iterationControl === "object"
    ? runtime.iterationControl
    : {};
  const skillPortfolio = payload && payload.skillPortfolio && typeof payload.skillPortfolio === "object"
    ? payload.skillPortfolio
    : {};
  const outcomeSummary = skillPortfolio && skillPortfolio.outcomeSummary && typeof skillPortfolio.outcomeSummary === "object"
    ? skillPortfolio.outcomeSummary
    : {};
  const signoff = evidence.signoff && evidence.signoff.latest ? evidence.signoff.latest : null;
  const runtimeProof = evidence.runtimeProof && evidence.runtimeProof.latest ? evidence.runtimeProof.latest : null;
  const recentRuns = payload && payload.eval ? toArr(payload.eval.recentRuns) : [];
  const latestRun = recentRuns[0] || null;
  const externalLearning = runtime && runtime.externalLearning ? runtime.externalLearning : {};
  const selfImprovement = externalLearning && externalLearning.selfImprovement && typeof externalLearning.selfImprovement === "object"
    ? externalLearning.selfImprovement
    : {};
  const manualCaptureSummary = normalizeManualCaptureSummary(payload, externalLearning, selfImprovement);
  const cards = [
    {
      label: "Delegated Worker",
      value: runtimeActiveAgent(runtime),
      detail: `default exec ${runtimeDefaultExecAgent(runtime)} / session ${safeText(runtime.sessionRef, "none")} / profile ${safeText(runtime.executionProfile, "unknown")}`,
      tags: [{ label: `agents ${formatInteger(num(runtime.agentCount, 0))}`, tone: "info" }],
    },
    {
      label: "Execution Posture",
      value: runtime.fullUtilization && runtime.fullUtilization.ready ? "READY" : "CHECK",
      detail: `request-user-input ${safeText(runtime.nonInteractiveUserInput && runtime.nonInteractiveUserInput.policy, "unknown")} / shadow ${runtime.adversarialShadow && runtime.adversarialShadow.enabled ? "on" : "off"}`,
      tags: [{ label: safeText(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode, "off"), tone: toneForTaskOutcome(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode) }],
    },
    {
      label: "Stop Intelligence",
      value: `${formatInteger(num(iterationControl.budgets && iterationControl.budgets.stepBudget, 0))} steps`,
      detail: `delta ${formatPercent(num(iterationControl.improvementDeltaThreshold, 0))} / residual<=${formatInteger(num(iterationControl.riskThresholds && iterationControl.riskThresholds.maxResidualRiskItems, 0))} / token ${formatInteger(num(iterationControl.budgets && iterationControl.budgets.tokenBudget, 0))}`,
      tags: [{ label: `fail-closed ${formatInteger(toArr(iterationControl.failClosedConditions).length)}`, tone: "warn" }],
    },
    {
      label: "Specialist Depth",
      value: formatInteger(num(topology.summary && topology.summary.total, 0)),
      detail: `${formatInteger(num(topology.summary && topology.summary.parents, 0))} parent / ${formatInteger(num(topology.summary && topology.summary.specialists, 0))} specialist / ${formatInteger(num(topology.summary && topology.summary.verification, 0))} verification`,
      tags: [{ label: `${formatInteger(num(topology.summary && topology.summary.active, 0))} active`, tone: "info" }],
    },
    {
      label: "Release Evidence",
      value: latestRun ? `${formatInteger(num(latestRun.passedCases, 0))}/${formatInteger(num(latestRun.sampleSize, 0))}` : "--",
      detail: latestRun ? `${safeText(latestRun.suiteId, "suite")} / score ${formatPercent(latestRun.scoreRate)}` : "No eval history yet.",
      tags: [{ label: latestRun ? safeText(latestRun.variantLabel, "variant") : "history", tone: "neutral" }],
    },
    {
      label: "Audit Trail",
      value: runtimeProof ? formatInteger(num(runtimeProof.liveExec && runtimeProof.liveExec.dispatchSuccessCount, 0)) : "--",
      detail: runtimeProof ? `dispatch successes / ${safeText(runtimeProof.runtime && runtimeProof.runtime.parentDispatchGuardMode, "off")}` : "No proof bundle.",
      tags: [{ label: runtimeProof ? safeText(runtimeProof.name, "proof") : "missing", tone: runtimeProof ? "info" : "warn" }],
    },
    {
      label: "Ship Signal",
      value: signoff && signoff.assertions && signoff.assertions.allPassed ? "PASS" : "PENDING",
      detail: signoff ? `${formatInteger(num(signoff.coreHarnessWorkflow && signoff.coreHarnessWorkflow.passedCases, 0))}/${formatInteger(num(signoff.coreHarnessWorkflow && signoff.coreHarnessWorkflow.sampleSize, 0))} suite cases passed` : "No signoff bundle.",
      tags: [{ label: signoff ? safeText(signoff.name, "signoff") : "missing", tone: signoff ? "pass" : "warn" }],
    },
    {
      label: "Skill Economy",
      value: `${formatInteger(num(skillPortfolio.promotionCandidateCount, 0))} ready`,
      detail: `sampled ${formatInteger(num(outcomeSummary.sampledSkills, 0))} / success ${formatPercent(num(outcomeSummary.overallSuccessRate, 0))} / skill notes ${formatInteger(num(manualCaptureSummary && manualCaptureSummary.skillCandidateCount, 0))}`,
      tags: [{ label: `lessons ${formatInteger(num(manualCaptureSummary && manualCaptureSummary.entryCount, 0))}`, tone: "info" }],
    },
    {
      label: "Improvement Queue",
      value: safeText(externalLearning.lastStatus, externalLearning.enabled ? "IDLE" : "DISABLED"),
      detail: `${formatInteger(num(externalLearning.trackedArticles, 0))} articles / ${formatInteger(num(externalLearning.pendingProposalCount, 0))} pending proposals`,
      tags: [{ label: externalLearning.enabled ? "official-blog" : "paused", tone: externalLearning.enabled ? "info" : "warn" }],
    },
  ];
  elements.metrics.innerHTML = cards.map(metricCardHtml).join("");
}

function renderCapabilities(payload) {
  const runtime = payload && payload.runtime ? payload.runtime : {};
  const health = payload && payload.health ? payload.health : {};
  const memory = payload && payload.memory ? payload.memory : {};
  const topology = payload && payload.topology ? payload.topology : {};
  const skillPortfolio = payload && payload.skillPortfolio ? payload.skillPortfolio : {};
  const capabilitySurface = payload && payload.capabilitySurface ? payload.capabilitySurface : {};
  const evidence = payload && payload.evidence ? payload.evidence : {};
  const browser = capabilitySurface && capabilitySurface.browser ? capabilitySurface.browser : {};
  const continuity = capabilitySurface && capabilitySurface.continuity ? capabilitySurface.continuity : {};
  const signoff = evidence.signoff && evidence.signoff.latest ? evidence.signoff.latest : null;
  const runtimeProof = evidence.runtimeProof && evidence.runtimeProof.latest ? evidence.runtimeProof.latest : null;
  const recentRuns = payload && payload.eval ? toArr(payload.eval.recentRuns) : [];
  const latestRun = recentRuns[0] || null;
  const latestTurn = runtime && runtime.latestTurn && typeof runtime.latestTurn === "object"
    ? runtime.latestTurn
    : health && health.latestTurn && typeof health.latestTurn === "object"
      ? health.latestTurn
      : {};
  const governedGraph = memory && memory.governedGraph && typeof memory.governedGraph === "object"
    ? memory.governedGraph
    : runtime && runtime.governedMemory && typeof runtime.governedMemory === "object"
      ? runtime.governedMemory
      : {};
  const latestPack = governedGraph && governedGraph.latestPack && typeof governedGraph.latestPack === "object"
    ? governedGraph.latestPack
    : {};
  const workspaceProgress = governedGraph && governedGraph.workspaceProgress && typeof governedGraph.workspaceProgress === "object"
    ? governedGraph.workspaceProgress
    : {};
  const externalLearning = runtime && runtime.externalLearning && typeof runtime.externalLearning === "object"
    ? runtime.externalLearning
    : {};
  const selfImprovement = externalLearning && externalLearning.selfImprovement && typeof externalLearning.selfImprovement === "object"
    ? externalLearning.selfImprovement
    : {};
  const manualSelfImprovement = runtime && runtime.manualSelfImprovement && typeof runtime.manualSelfImprovement === "object"
    ? runtime.manualSelfImprovement
    : memory && memory.manualSelfImprovement && typeof memory.manualSelfImprovement === "object"
      ? memory.manualSelfImprovement
      : {};
  const skillAssignments = toArr(skillPortfolio.assignments);
  const roleChecks = toArr(skillPortfolio.roleChecks);
  const missingProposals = toArr(skillPortfolio.missingProposals);
  const specialistLane = toArr(topology && topology.lanes && topology.lanes.specialists);
  const verificationLane = toArr(topology && topology.lanes && topology.lanes.verification);
  const recentBrowserFamilies = toArr(browser.familyRows).map((entry) => ({
    title: safeText(entry && entry.label, "Family"),
    tags: [
      { label: safeText(entry && entry.stabilityStatus, "unreported"), tone: toneForCapabilityStatus(entry && entry.stabilityStatus) },
      { label: entry && entry.stableCovered ? "stable" : "needs recovery", tone: entry && entry.stableCovered ? "pass" : "warn" },
    ],
    detail: `${formatPercent(num(entry && entry.recentSuccessRate, 0))} success / burden ${formatInteger(num(entry && entry.recentFailureBurden, 0))} / ${safeText(entry && entry.nextCoverageAction, "-")}`,
  }));
  const continuityItems = toArr(continuity.openItems).length
    ? toArr(continuity.openItems).map((entry) => ({
        title: safeText(entry && entry.debtClass, "continuity debt"),
        tags: [{ label: safeText(entry && entry.nextOwner, "owner"), tone: "warn" }],
        detail: safeText(entry && (entry.publicSummary || entry.nextRecoveryStep), "-"),
      }))
    : toArr(continuity.recentTrend).map((entry) => ({
        title: safeText(entry && entry.finalReleaseState, "integrated"),
        tags: [{ label: safeText(entry && entry.generatedAt, "-"), tone: "info" }],
        detail: `open debt ${formatInteger(num(entry && entry.openDebtCount, 0))} / blocked ${formatInteger(num(entry && entry.blockedSubtasks, 0))} / pending ${formatInteger(num(entry && entry.integrationPendingCount, 0))}`,
      }));
  const selfImprovementItems = [];
  if (selfImprovement && selfImprovement.nextPriority && typeof selfImprovement.nextPriority === "object") {
    selfImprovementItems.push({
      title: safeText(selfImprovement.nextPriority.title, "Next cycle"),
      tags: [{ label: safeText(selfImprovement.nextPriority.readinessStatus, "pending"), tone: toneForCapabilityStatus(selfImprovement.nextPriority.readinessStatus) }],
      detail: `${safeText(selfImprovement.nextPriority.nextAction, "-")} / ${formatSelfImprovementProgress(selfImprovement.nextPriority)}`,
    });
  }
  if (manualSelfImprovement && typeof manualSelfImprovement === "object" && safeText(manualSelfImprovement.status)) {
    selfImprovementItems.push({
      title: "Manual capture",
      tags: [{ label: safeText(manualSelfImprovement.status, "captured"), tone: toneForCapabilityStatus(manualSelfImprovement.status) }],
      detail: `${formatInteger(num(manualSelfImprovement.entryCount, 0))} lessons / proposal ${formatInteger(num(manualSelfImprovement.proposalOnlyCount, 0))} / blocked ${formatInteger(num(manualSelfImprovement.blockedCount, 0))}`,
    });
  }
  const jobScenarios = [
    {
      kicker: "Job 01",
      title: "Delegated implementation",
      status: safeText(latestTurn.task_outcome_status, safeText(runtime.executionProfile, "running")),
      summary: "Start from the Console or `POST /api/exec`. Use this to prove that the repo is an execution system with proof, not only a governance judge.",
      tags: [
        { label: runtimeActiveAgent(runtime), tone: "info" },
        { label: `${formatInteger(num(topology && topology.summary && topology.summary.specialists, 0))} specialists`, tone: "pass" },
        { label: safeText(latestTurn.task_outcome_status, "unreported"), tone: toneForCapabilityStatus(latestTurn.task_outcome_status) },
      ],
      facts: [
        { label: "Start here", value: "Console / POST /api/exec", detail: `default exec ${runtimeDefaultExecAgent(runtime)} / profile ${safeText(runtime.executionProfile, "unknown")}` },
        { label: "Proof path", value: signoff && signoff.assertions && signoff.assertions.allPassed ? "Signoff ready" : "Evidence pending", detail: runtimeProof ? safeText(runtimeProof.summaryPath, "runtime proof present") : "runtime proof missing" },
      ],
      items: specialistLane.slice(0, 2).map((entry) => ({
        title: safeText(entry && entry.name, "specialist"),
        tags: [{ label: safeText(entry && entry.status, "active"), tone: toneForCapabilityStatus(entry && entry.status) }],
        detail: `${safeText(entry && entry.description, "")} / ${toArr(entry && entry.skills).slice(0, 2).join(", ") || "no skills reported"}`,
      })),
      actions: [
        { label: "Open Console", href: "./index.html", tone: "secondary" },
        { label: "Jump to Evidence", href: "#evidenceSection", tone: "secondary" },
      ],
    },
    {
      kicker: "Job 02",
      title: "Governed review and release decision",
      status: signoff && signoff.assertions && signoff.assertions.allPassed ? "pass" : safeText(latestRun && latestRun.variantLabel, "pending"),
      summary: "Start from `Overview -> Evidence` or `POST /api/eval/run`. Use this to show honest ship / no-ship instead of a nicer-looking completion claim.",
      tags: [
        { label: signoff && signoff.assertions && signoff.assertions.allPassed ? "signoff pass" : "signoff pending", tone: signoff && signoff.assertions && signoff.assertions.allPassed ? "pass" : "warn" },
        { label: latestRun ? safeText(latestRun.variantLabel, "eval") : "eval history", tone: latestRun ? "info" : "neutral" },
        { label: runtimeProof ? "runtime proof present" : "runtime proof missing", tone: runtimeProof ? "info" : "warn" },
      ],
      facts: [
        { label: "Start here", value: "Overview -> Evidence / POST /api/eval/run", detail: latestRun ? safeText(latestRun.suiteId, "latest eval") : "no eval history yet" },
        { label: "Public proof", value: "output/governance_public/", detail: "repo-safe request -> routing -> execution -> review -> release bundle" },
      ],
      items: [
        signoff ? {
          title: safeText(signoff.name, "latest signoff"),
          tags: [{ label: signoff.assertions && signoff.assertions.allPassed ? "pass" : "pending", tone: signoff.assertions && signoff.assertions.allPassed ? "pass" : "warn" }],
          detail: `${formatInteger(num(signoff.coreHarnessWorkflow && signoff.coreHarnessWorkflow.passedCases, 0))}/${formatInteger(num(signoff.coreHarnessWorkflow && signoff.coreHarnessWorkflow.sampleSize, 0))} workflow cases / ${safeText(signoff.summaryPath, "signoff summary")}`,
        } : null,
        latestRun ? {
          title: safeText(latestRun.suiteId, "latest eval"),
          tags: [{ label: safeText(latestRun.variantLabel, "variant"), tone: "info" }],
          detail: `score ${formatPercent(latestRun.scoreRate)} / ${formatInteger(num(latestRun.passedCases, 0))}/${formatInteger(num(latestRun.sampleSize, 0))} passed`,
        } : null,
      ].filter(Boolean),
      actions: [
        { label: "Jump to Evidence", href: "#evidenceSection", tone: "secondary" },
        { label: "Open Eval History", href: safeText(payload && payload.apis && payload.apis.evalHistory, "/api/eval/history"), tone: "secondary" },
      ],
    },
    {
      kicker: "Job 03",
      title: "Long-horizon continuity and handoff",
      status: safeText(continuity.finalReleaseState, continuity.openDebtCount ? "check" : "integrated"),
      summary: "Start from `Overview -> Memory` and the continuity APIs. Use this to show that the runtime can resume work without rebuilding context from raw logs.",
      tags: [
        { label: `${formatInteger(num(continuity.handoffCount, 0))} handoffs`, tone: "info" },
        { label: `${formatInteger(num(continuity.openDebtCount, 0))} open debt`, tone: num(continuity.openDebtCount, 0) ? "warn" : "pass" },
        { label: safeText(continuity.finalReleaseState, "unreported"), tone: toneForCapabilityStatus(continuity.finalReleaseState) },
      ],
      facts: [
        { label: "Objective", value: safeText(continuity.objective, "No active long-horizon objective"), detail: `${safeText(continuity.activeTaskFamily, "-")} / task ${safeText(continuity.activeTaskId, "-")}` },
        { label: "Recovery", value: `${formatInteger(num(continuity.resumeCount, 0))} resumes / ${formatInteger(num(continuity.replanCount, 0))} replans`, detail: `verifier checkpoints ${formatInteger(num(continuity.verifierCheckpointCount, 0))} / resolved ${formatInteger(num(continuity.resolvedDebtCount, 0))}` },
      ],
      items: continuityItems.slice(0, 2),
      actions: [
        { label: "Jump to Memory", href: "#memorySection", tone: "secondary" },
        { label: "Open Continuity API", href: `${safeText(payload && payload.apis && payload.apis.continuityTasks, "/api/continuity/tasks")}?state=all`, tone: "secondary" },
      ],
    },
  ];
  const cards = [
    {
      kicker: "Memory",
      title: "Governed memory",
      status: safeText(governedGraph.status, "unreported"),
      summary: "Live execution memory, canonical graph state, and compiled packs are visible without leaving the runtime map.",
      tags: [
        { label: `${formatInteger(num(governedGraph.itemCount, 0))} items`, tone: "info" },
        { label: `${formatInteger(num(governedGraph.promotedCount, 0))} promoted`, tone: "pass" },
        { label: `${formatInteger(num(toArr(governedGraph.staleMemoryWarnings).length, 0))} stale`, tone: toArr(governedGraph.staleMemoryWarnings).length ? "warn" : "pass" },
      ],
      facts: [
        { label: "Latest pack", value: `${formatInteger(num(latestPack.selectedCount, 0))} selected`, detail: `${safeText(latestPack.activeAgent, "-")} / ${safeText(latestPack.taskFamily, "-")}` },
        { label: "Objective", value: safeText(workspaceProgress.currentObjective, "No compiled objective"), detail: safeText(workspaceProgress.updatedAt, "") },
      ],
      items: toArr(workspaceProgress.nextRecommendedActions).slice(0, 2).map((entry) => ({
        title: safeText(entry, "next action"),
        tags: [{ label: "next", tone: "info" }],
        detail: toArr(workspaceProgress.recentTouchedPaths).slice(0, 2).join(" / ") || safeText(governedGraph.outputRoot, ""),
      })),
      actions: [
        { label: "Jump to Memory", href: "#memorySection", tone: "secondary" },
        { label: "Open Console", href: "./index.html", tone: "secondary" },
      ],
    },
    {
      kicker: "Skills",
      title: "Skill portfolio",
      status: safeText(skillPortfolio.status, "unreported"),
      summary: "Specialist coverage, role-fit checks, and missing skill pressure are shown as a runtime inventory instead of a hidden governance audit.",
      tags: [
        { label: `${formatInteger(skillAssignments.length)} assignments`, tone: "info" },
        { label: `${formatInteger(roleChecks.filter((entry) => entry && entry.pass).length)}/${formatInteger(roleChecks.length)} roles pass`, tone: roleChecks.every((entry) => entry && entry.pass) ? "pass" : "warn" },
        { label: `${formatInteger(missingProposals.length)} gaps`, tone: missingProposals.length ? "warn" : "pass" },
      ],
      facts: [
        { label: "Catalog", value: safeText(skillPortfolio.catalog && skillPortfolio.catalog.version, "unreported"), detail: safeText(skillPortfolio.catalog && skillPortfolio.catalog.path, "") },
        { label: "Audit", value: safeText(skillPortfolio.status, "unreported"), detail: `${safeText(skillPortfolio.policy && skillPortfolio.policy.path, "")} / outcome events ${formatInteger(num(skillPortfolio.outcomeEvents && skillPortfolio.outcomeEvents.count, 0))}` },
      ],
      items: roleChecks.slice(0, 2).map((entry) => ({
        title: safeText(entry && entry.role, "role"),
        tags: [{ label: entry && entry.pass ? "pass" : "check", tone: entry && entry.pass ? "pass" : "warn" }],
        detail: `${formatInteger(num(entry && entry.assignedCount, 0))}/${formatInteger(num(entry && entry.minSkills, 0))} assigned / missing ${toArr(entry && entry.missingClasses).join(", ") || "-"}`,
      })),
      actions: [
        { label: "Jump to Skill Portfolio", href: "#memorySection", tone: "secondary" },
        { label: "Inspect Topology", href: "#topologySection", tone: "secondary" },
      ],
    },
    {
      kicker: "Subagents",
      title: "Multi-agent runtime",
      status: num(topology && topology.summary && topology.summary.active, 0) > 0 ? "active" : "configured",
      summary: "Parent, specialist, and verification lanes are exposed as a live runtime lane map, not just a contract diagram.",
      tags: [
        { label: `${formatInteger(num(topology && topology.summary && topology.summary.parents, 0))} parents`, tone: "neutral" },
        { label: `${formatInteger(num(topology && topology.summary && topology.summary.specialists, 0))} specialists`, tone: "pass" },
        { label: `${formatInteger(num(topology && topology.summary && topology.summary.verification, 0))} verification`, tone: "warn" },
      ],
      facts: [
        { label: "Active lanes", value: `${formatInteger(num(topology && topology.summary && topology.summary.active, 0))} active`, detail: `${formatInteger(num(topology && topology.summary && topology.summary.total, 0))} total rows` },
        { label: "Execution mix", value: specialistLane.length ? safeText(specialistLane[0] && specialistLane[0].name, "specialist") : "specialist lanes configured", detail: `${formatInteger(verificationLane.length)} verification lanes visible` },
      ],
      items: specialistLane.slice(0, 2).map((entry) => ({
        title: safeText(entry && entry.name, "specialist"),
        tags: [{ label: safeText(entry && entry.status, "active"), tone: toneForCapabilityStatus(entry && entry.status) }],
        detail: `${safeText(entry && entry.description, "")} / ${toArr(entry && entry.skills).slice(0, 2).join(", ") || "no skills reported"}`,
      })),
      actions: [
        { label: "Jump to Topology", href: "#topologySection", tone: "secondary" },
        { label: "Open Agent API", href: safeText(payload && payload.apis && payload.apis.topography, "/api/agent-topography"), tone: "secondary" },
      ],
    },
    {
      kicker: "Browser",
      title: "Browser and tool-use recovery",
      status: safeText(browser.status, "unreported"),
      summary: "Browser-style tool use is surfaced with live stability evidence, not implied by docs or hidden eval files.",
      tags: [
        { label: `score ${formatPercent(num(browser.score, 0))}`, tone: num(browser.score, 0) >= 0.8 ? "pass" : "warn" },
        { label: `${formatInteger(num(browser.evidenceCount, 0))} evidence`, tone: "info" },
        { label: `${formatInteger(num(browser.unstableFamilyCount, 0))} unstable`, tone: num(browser.unstableFamilyCount, 0) ? "warn" : "pass" },
      ],
      facts: [
        { label: "Stable breadth", value: formatPercent(num(browser.stableCoverageBreadth, 0)), detail: `supported ${formatPercent(num(browser.supportedCoverageBreadth, 0))} / display ${formatPercent(num(browser.displayFinalScore, 0))}` },
        { label: "Families", value: toArr(browser.sourceFamilies).join(", ") || "unreported", detail: `${formatInteger(num(browser.successCount, 0))} success / ${formatInteger(num(browser.failureCount, 0))} failure` },
      ],
      items: recentBrowserFamilies.slice(0, 3).length
        ? recentBrowserFamilies.slice(0, 3)
        : toArr(browser.openFailureModes).slice(0, 3).map((entry) => ({
            title: "Open failure mode",
            tags: [{ label: "recover", tone: "warn" }],
            detail: safeText(entry, "-"),
          })),
      actions: [
        { label: "Jump to Evidence", href: "#evidenceSection", tone: "secondary" },
        { label: "Replay Turns API", href: safeText(payload && payload.apis && payload.apis.replayTurns, "/api/replay/turns"), tone: "secondary" },
      ],
    },
    {
      kicker: "Continuity",
      title: "Long-horizon continuity",
      status: safeText(continuity.finalReleaseState, continuity.openDebtCount ? "check" : "integrated"),
      summary: "Long-running task state, debt, and recovery evidence are surfaced as live continuity status instead of buried output artifacts.",
      tags: [
        { label: `${formatInteger(num(continuity.handoffCount, 0))} handoffs`, tone: "info" },
        { label: `${formatInteger(num(continuity.openDebtCount, 0))} open debt`, tone: num(continuity.openDebtCount, 0) ? "warn" : "pass" },
        { label: safeText(continuity.debtSeverity, "none"), tone: toneForCapabilityStatus(continuity.debtSeverity) },
      ],
      facts: [
        { label: "Objective", value: safeText(continuity.objective, "No active long-horizon objective"), detail: `${safeText(continuity.activeTaskFamily, "-")} / task ${safeText(continuity.activeTaskId, "-")}` },
        { label: "Recovery", value: `${formatInteger(num(continuity.resumeCount, 0))} resumes / ${formatInteger(num(continuity.replanCount, 0))} replans`, detail: `verifier checkpoints ${formatInteger(num(continuity.verifierCheckpointCount, 0))} / resolved ${formatInteger(num(continuity.resolvedDebtCount, 0))}` },
      ],
      items: continuityItems.slice(0, 3),
      actions: [
        { label: "Open Continuity API", href: `${safeText(payload && payload.apis && payload.apis.continuityTasks, "/api/continuity/tasks")}?state=all`, tone: "secondary" },
        { label: "Jump to Memory", href: "#memorySection", tone: "secondary" },
      ],
    },
    {
      kicker: "Self-Improvement",
      title: "Governed self-improvement",
      status: safeText(selfImprovement.gateStatus, safeText(manualSelfImprovement.status, "unreported")),
      summary: "Learning, promotion, manual capture, and bounded improvement loops are visible as live gated state instead of opaque background logic.",
      tags: [
        { label: `${formatInteger(num(selfImprovement.autoApplyCandidateCount, 0))} ready`, tone: num(selfImprovement.autoApplyCandidateCount, 0) ? "pass" : "neutral" },
        { label: `${formatInteger(num(selfImprovement.awaitingObservationCount, 0) + num(selfImprovement.awaitingReinforcementCount, 0))} waiting`, tone: num(selfImprovement.awaitingObservationCount, 0) + num(selfImprovement.awaitingReinforcementCount, 0) ? "warn" : "neutral" },
        { label: `${formatInteger(num(externalLearning.pendingProposalCount, 0))} proposals`, tone: num(externalLearning.pendingProposalCount, 0) ? "info" : "neutral" },
      ],
      facts: [
        { label: "Gate", value: safeText(selfImprovement.gateStatus, "NOT_RUN"), detail: `${safeText(selfImprovement.appliedDecision, "none")} / obs ${safeText(selfImprovement.observationStatus, "-")}` },
        { label: "Loop", value: safeText(runtime && runtime.agiImprovementFlywheel && runtime.agiImprovementFlywheel.schema, "agi-improvement-flywheel"), detail: `bounded ${runtime && runtime.agiImprovementFlywheel && runtime.agiImprovementFlywheel.boundedLoopsOnly ? "yes" : "no"} / kpis ${formatInteger(num(runtime && runtime.agiImprovementFlywheel && runtime.agiImprovementFlywheel.kpiCount, 0))}` },
      ],
      items: selfImprovementItems.slice(0, 3),
      actions: [
        { label: "Jump to Memory", href: "#memorySection", tone: "secondary" },
        { label: "Jump to Evidence", href: "#evidenceSection", tone: "secondary" },
      ],
    },
  ];

  if (elements.jobScenarioGrid) {
    elements.jobScenarioGrid.innerHTML = jobScenarios.map(capabilityCardHtml).join("");
  }
  if (elements.capabilitySurfaceSummary) {
    const readyCount = cards.filter((card) => ["ready", "pass", "stable", "integrated", "active", "configured"].includes(lower(card.status))).length;
    elements.capabilitySurfaceSummary.innerHTML = [
      tagHtml("3 buyer jobs", "info"),
      tagHtml(`${formatInteger(cards.length)} support lanes`, "info"),
      tagHtml(`${formatInteger(readyCount)} live now`, readyCount === cards.length ? "pass" : "warn"),
      tagHtml("compare on adoptability", "info"),
      tagHtml(`browser ${safeText(browser.status, "unreported")}`, toneForCapabilityStatus(browser.status)),
      tagHtml(`continuity ${safeText(continuity.finalReleaseState, "unreported")}`, toneForCapabilityStatus(continuity.finalReleaseState)),
      tagHtml(`self-improvement ${safeText(selfImprovement.gateStatus, "NOT_RUN")}`, toneForCapabilityStatus(selfImprovement.gateStatus)),
    ].join("");
  }
  if (elements.capabilitySurfaceGrid) {
    elements.capabilitySurfaceGrid.innerHTML = cards.map(capabilityCardHtml).join("");
  }
  if (elements.demoFlowGrid) {
    const demos = [
      {
        kicker: "Flow 01",
        title: "Implement and finish with proof",
        summary: "Use this flow to prove that the runtime is a worker. Start from delegated execution, then walk directly into proof and signoff.",
        tags: [
          { label: safeText(runtime.executionProfile, "runtime"), tone: "info" },
          { label: safeText(payload && payload.health && payload.health.latestTurn && payload.health.latestTurn.task_outcome_status, "n/a"), tone: toneForCapabilityStatus(payload && payload.health && payload.health.latestTurn && payload.health.latestTurn.task_outcome_status) },
        ],
        steps: [
          "Open the Console and run the normal delegated-work path.",
          "Refresh Overview to inspect the active worker, runtime proof, and latest signoff.",
          "Use Evidence to confirm the result is adoptable, not just procedurally complete.",
        ],
        actions: [
          { label: "Open Console", href: "./index.html", tone: "secondary" },
          { label: "Jump to Evidence", href: "#evidenceSection", tone: "secondary" },
        ],
      },
      {
        kicker: "Flow 02",
        title: "Decide ship / no-ship honestly",
        summary: "Use this flow to show that release judgment is evidence-backed and audit-ready, not a confidence statement with nicer wording.",
        tags: [
          { label: signoff && signoff.assertions && signoff.assertions.allPassed ? "signoff pass" : "signoff pending", tone: signoff && signoff.assertions && signoff.assertions.allPassed ? "pass" : "warn" },
          { label: runtimeProof ? "runtime proof present" : "runtime proof missing", tone: runtimeProof ? "info" : "warn" },
        ],
        steps: [
          "Start with Overview -> Evidence and inspect the latest signoff, runtime proof, and eval history together.",
          "Open the public governance bundle to see the repo-safe request -> routing -> execution -> review -> release chain.",
          "Confirm whether the system is honestly saying ship, block, or keep iterating.",
        ],
        actions: [
          { label: "Jump to Evidence", href: "#evidenceSection", tone: "secondary" },
          { label: "Open Eval History", href: safeText(payload && payload.apis && payload.apis.evalHistory, "/api/eval/history"), tone: "secondary" },
        ],
      },
      {
        kicker: "Flow 03",
        title: "Resume across sessions without guesswork",
        summary: "Use this flow to show that long-running work keeps intent, proof, and recovery state instead of depending on tribal memory.",
        tags: [
          { label: `${formatInteger(num(continuity.handoffCount, 0))} handoffs`, tone: "info" },
          { label: `${formatInteger(num(governedGraph.itemCount, 0))} memory items`, tone: "pass" },
        ],
        steps: [
          "Open Memory to inspect the current objective, latest pack, and recent touched paths.",
          "Open the Continuity API to inspect live task registry, debt, and recovery state.",
          "Use the same surface to verify that the next session can resume without re-deriving rationale from logs.",
        ],
        actions: [
          { label: "Jump to Memory", href: "#memorySection", tone: "secondary" },
          { label: "Open Continuity API", href: `${safeText(payload && payload.apis && payload.apis.continuityTasks, "/api/continuity/tasks")}?state=all`, tone: "secondary" },
        ],
      },
    ];
    elements.demoFlowGrid.innerHTML = demos.map(demoCardHtml).join("");
  }
}

function renderRuntime(payload) {
  const runtime = payload && payload.runtime ? payload.runtime : {};
  const health = payload && payload.health ? payload.health : {};
  const phaseStatus = runtime && runtime.phaseStatus && typeof runtime.phaseStatus === "object"
    ? runtime.phaseStatus
    : runtime && runtime.phase_status && typeof runtime.phase_status === "object"
      ? runtime.phase_status
      : {};
  const latestTurn = runtime && runtime.latestTurn && typeof runtime.latestTurn === "object"
    ? runtime.latestTurn
    : health && health.latestTurn && typeof health.latestTurn === "object"
      ? health.latestTurn
      : {};
  const familyCompletionGate = latestTurn && latestTurn.family_completion_gate && typeof latestTurn.family_completion_gate === "object"
    ? latestTurn.family_completion_gate
    : latestTurn && latestTurn.familyCompletionGate && typeof latestTurn.familyCompletionGate === "object"
      ? latestTurn.familyCompletionGate
      : {};
  const familyGateMissing = toArr(familyCompletionGate.missingHard)
    .map((entry) => safeText(entry && (entry.label || entry.reason)))
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
  const phaseDetail = [
    safeText(phaseStatus.completedAt, ""),
    safeText(phaseStatus.auditReportPath, ""),
    toArr(phaseStatus.failedCheckIds).length ? `missing ${toArr(phaseStatus.failedCheckIds).join(", ")}` : "",
  ].filter(Boolean).join(" / ");
  const authorityRegistry = runtime && runtime.authorityRegistry && typeof runtime.authorityRegistry === "object"
    ? runtime.authorityRegistry
    : runtime && runtime.authority_registry && typeof runtime.authority_registry === "object"
      ? runtime.authority_registry
      : {};
  const deploymentPosture = runtime && runtime.deploymentPosture && typeof runtime.deploymentPosture === "object"
    ? runtime.deploymentPosture
    : runtime && runtime.deployment_posture && typeof runtime.deployment_posture === "object"
      ? runtime.deployment_posture
      : {};
  const iterationControl = runtime && runtime.iterationControl && typeof runtime.iterationControl === "object"
    ? runtime.iterationControl
    : runtime && runtime.iteration_control && typeof runtime.iteration_control === "object"
      ? runtime.iteration_control
      : {};
  const adoptionReadinessContract = runtime && runtime.adoptionReadinessContract && typeof runtime.adoptionReadinessContract === "object"
    ? runtime.adoptionReadinessContract
    : runtime && runtime.adoption_readiness_contract && typeof runtime.adoption_readiness_contract === "object"
      ? runtime.adoption_readiness_contract
      : {};
  const failClosedConditions = toArr(iterationControl.failClosedConditions);
  const validationFailureConditions = toArr(iterationControl.validationFailureConditions);
  const retryConditions = toArr(iterationControl.retryConditions);
  const adoptionHardGates = Object.entries(adoptionReadinessContract.hardGates || {}).map(([key, value]) => ({
    key,
    min: Number.isFinite(Number(value && value.min)) ? Number(value.min) : null,
    failureClass: safeText(value && value.failureClass, "unreported"),
  }));
  const stopSignalItems = [
    ...failClosedConditions.slice(0, 2).map((entry) => ({
      title: "Fail-closed trigger",
      tags: [{ label: "fail-closed", tone: "fail" }],
      detail: safeText(entry, "-"),
    })),
    ...validationFailureConditions.slice(0, 1).map((entry) => ({
      title: "Validation failure",
      tags: [{ label: "validation", tone: "warn" }],
      detail: safeText(entry, "-"),
    })),
    ...retryConditions.slice(0, 1).map((entry) => ({
      title: "Retry-eligible",
      tags: [{ label: "retry", tone: "info" }],
      detail: safeText(entry, "-"),
    })),
    ...(familyCompletionGate.applies ? [{
      title: `Family gate ${safeText(familyCompletionGate.taskFamily, "family")}`,
      tags: [{ label: safeText(familyCompletionGate.status, "pending"), tone: toneForTaskOutcome(familyCompletionGate.status) }],
      detail: familyGateMissing || safeText(familyCompletionGate.summary, "Family completion gate is active."),
    }] : []),
  ];
  elements.runtimePostureCard.innerHTML = factRowsHtml([
    { label: "Execution Profile", value: safeText(runtime.executionProfile, "unknown"), detail: `active agent ${runtimeActiveAgent(runtime)} / default exec ${runtimeDefaultExecAgent(runtime)}` },
    { label: "Deployment Posture", value: safeText(deploymentPosture.activeLabel || deploymentPosture.activeProfile, "portable_local"), detail: `${safeText(deploymentPosture.profilePath, "scripts/config/deployment_posture_profiles.json")} / default ${safeText(deploymentPosture.referenceArchitectureDefault ? "reference" : "owner-or-explicit", "")}` },
    { label: "Authority Registry", value: safeText(authorityRegistry.schema, "authority-registry.v1"), detail: `${safeText(authorityRegistry.registryPath, "scripts/config/authority_registry.json")} / ${safeText(authorityRegistry.driftStatus, "aligned")}` },
    { label: "Iteration Control", value: safeText(iterationControl.schema, "iteration-control-contract.v1"), detail: `${safeText(iterationControl.path || iterationControl.contractPath, "scripts/config/iteration_control_contract.json")} / release ${safeText(iterationControl.releaseState || iterationControl.releaseGate, "governed")}` },
    { label: "Adoption Readiness", value: safeText(adoptionReadinessContract.schema, "adoption-readiness-evaluator-contract.v1"), detail: `${safeText(adoptionReadinessContract.path || adoptionReadinessContract.contractPath, "scripts/config/adoption_readiness_evaluator_contract.json")} / ${formatInteger(num(adoptionReadinessContract.dimensionCount, 0))} dimensions` },
    { label: "Request User Input", value: safeText(runtime.nonInteractiveUserInput && runtime.nonInteractiveUserInput.policy, "unknown"), detail: safeText(runtime.nonInteractiveUserInput && runtime.nonInteractiveUserInput.envKey, "") },
    { label: "Parent Dispatch Guard", value: safeText(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode, "off"), detail: `maxRetries ${formatInteger(num(runtime.parentDispatchGuard && runtime.parentDispatchGuard.maxRetries, 0))}` },
    { label: "Planning Contracts", value: safeText(runtime.planningContracts && runtime.planningContracts.schema, "planning-mode-contract.v1"), detail: `${safeText(runtime.planningContracts && runtime.planningContracts.path, "")} / ${safeText(runtime.planningContracts && runtime.planningContracts.assurancePath, "")}` },
    { label: "Assurance Contracts", value: safeText(runtime.planningContracts && runtime.planningContracts.assuranceSchema, "assurance-mode-contract.v1"), detail: safeText(runtime.planningContracts && runtime.planningContracts.assurancePath, "") },
    { label: "Family Profiles", value: safeText(runtime.planningContracts && runtime.planningContracts.familyProfileSchema, "task-family-profiles.v1"), detail: safeText(runtime.planningContracts && runtime.planningContracts.familyProfilePath, "") },
    { label: "Intent-First", value: safeText(runtime.intentFirst && runtime.intentFirst.contract && runtime.intentFirst.contract.schema, "design-acceptance-contract.v1"), detail: `${safeText(runtime.intentFirst && runtime.intentFirst.contractPath, "")} / taste ${safeText(runtime.intentFirst && runtime.intentFirst.tasteMemory && runtime.intentFirst.tasteMemory.activeProfileId, "")}` },
    { label: "Conversation API", value: safeText(runtime.conversationApi && runtime.conversationApi.endpoint, "POST /api/conversation/direct"), detail: `${safeText(runtime.conversationApi && runtime.conversationApi.provider, "app-server")} / ${safeText(runtime.conversationApi && runtime.conversationApi.model, "")}` },
    { label: "Evidence Artifacts", value: safeText(runtime.evidenceArtifacts && runtime.evidenceArtifacts.root, "logs/turns"), detail: `maxDays ${formatInteger(num(runtime.evidenceArtifacts && runtime.evidenceArtifacts.maxDays, 0))}` },
  ]);
  elements.guardrailCard.innerHTML = factRowsHtml([
    { label: "Full Utilization", value: runtime.fullUtilization && runtime.fullUtilization.ready ? "ready" : "not-ready", detail: `default-agent ${num(runtime.fullUtilization && runtime.fullUtilization.checks && runtime.fullUtilization.checks.defaultExecAgentIsDefault, 0) ? "ok" : "check"}` },
    { label: "Requirement Guard", value: runtime.requirementGuard && runtime.requirementGuard.enabled ? "enabled" : "disabled", detail: `rbj ${runtime.requirementGuard && runtime.requirementGuard.rbj && runtime.requirementGuard.rbj.enabled ? "enabled" : "disabled"} / planning ${safeText(runtime.requirementGuard && runtime.requirementGuard.planningMode && runtime.requirementGuard.planningMode.version, "unreported")} / assurance ${safeText(runtime.requirementGuard && runtime.requirementGuard.planningMode && runtime.requirementGuard.planningMode.assuranceVersion, "unreported")}` },
    { label: "Adversarial Shadow", value: runtime.adversarialShadow && runtime.adversarialShadow.enabled ? "enabled" : "disabled", detail: `loop retries ${formatInteger(num(runtime.adversarialShadow && runtime.adversarialShadow.loop && runtime.adversarialShadow.loop.maxRetries, 0))}` },
    { label: "Idempotency", value: safeText(runtime.idempotency && runtime.idempotency.statusApi && runtime.idempotency.statusApi.path, "/api/exec/idempotency/:key"), detail: `ttl ${formatInteger(num(runtime.idempotency && runtime.idempotency.ttlMs, 0))}ms` },
    { label: "Runtime Memory", value: safeText(runtime.harnessMemory && runtime.harnessMemory.storage, "logs/harness_execution_memory.json"), detail: `retention ${formatInteger(num(runtime.harnessMemory && runtime.harnessMemory.retentionDays, 0))} days` },
  ]);
  if (elements.stopBudgetCard) {
    const wallClockMinutes = Math.round(num(iterationControl.budgets && iterationControl.budgets.wallClockMs, 0) / 60000);
    elements.stopBudgetCard.innerHTML = `
      <div class="overview-inline-tags">
        ${tagHtml(`fail-closed ${formatInteger(failClosedConditions.length)}`, failClosedConditions.length ? "fail" : "neutral")}
        ${tagHtml(`validation ${formatInteger(validationFailureConditions.length)}`, validationFailureConditions.length ? "warn" : "neutral")}
        ${tagHtml(`retry ${formatInteger(retryConditions.length)}`, retryConditions.length ? "info" : "neutral")}
        ${tagHtml(`hard gates ${formatInteger(adoptionHardGates.length)}`, adoptionHardGates.length ? "pass" : "neutral")}
      </div>
      ${factRowsHtml([
        {
          label: "Budget Envelope",
          value: `${formatInteger(num(iterationControl.budgets && iterationControl.budgets.stepBudget, 0))} steps / ${formatInteger(num(iterationControl.budgets && iterationControl.budgets.tokenBudget, 0))} tokens`,
          detail: `wall ${formatInteger(wallClockMinutes)} min / delta >= ${formatPercent(num(iterationControl.improvementDeltaThreshold, 0))}`,
        },
        {
          label: "Residual Risk",
          value: `<= ${formatInteger(num(iterationControl.riskThresholds && iterationControl.riskThresholds.maxResidualRiskItems, 0))} items`,
          detail: `evidence failures <= ${formatInteger(num(iterationControl.riskThresholds && iterationControl.riskThresholds.maxRequiredEvidenceFailures, 0))}`,
        },
        {
          label: "Adoption Hard Gates",
          value: adoptionHardGates.map((entry) => entry.key).join(", ") || "-",
          detail: adoptionHardGates.map((entry) => `${entry.key}>=${entry.min == null ? "-" : entry.min.toFixed(2)} (${entry.failureClass})`).join(" / ") || "No hard gates reported.",
        },
        {
          label: "Latest Turn Stop",
          value: safeText(latestTurn.task_outcome_status || latestTurn.taskOutcomeStatus, "n/a"),
          detail: joinSummaryParts([
            safeText(latestTurn.task_outcome_reason || latestTurn.taskOutcomeReason, ""),
            familyCompletionGate.applies ? `family ${safeText(familyCompletionGate.status, "pending")}` : "",
            safeText(iterationControl.releaseState || iterationControl.releaseGate, ""),
          ]),
        },
      ])}
      ${itemListHtml(stopSignalItems, "No stop or retry signals are currently reported.")}
    `;
  }
  elements.healthCard.innerHTML = factRowsHtml([
    { label: "SLO Status", value: safeText(health.slo && health.slo.status, "insufficient_data"), detail: `${formatInteger(num(health.slo && health.slo.sampleSize, 0))} turns in window` },
    { label: "Failure Rate", value: formatPercent(health.slo && health.slo.metrics && health.slo.metrics.failureRate), detail: `p95 ${formatInteger(num(health.slo && health.slo.metrics && health.slo.metrics.p95LatencyMs, 0))}ms` },
    { label: "Requirement Foundation V1", value: safeText(phaseStatus.requirementFoundationV1, "not_done"), detail: phaseDetail || "Run the phase exit audit to publish the freeze status." },
    { label: "Latest Turn", value: safeText(health.latestTurn && health.latestTurn.turn_id, "none"), detail: `${safeText(health.latestTurn && health.latestTurn.status, "idle")} / ${safeText(health.latestTurn && health.latestTurn.task_outcome_status, "n/a")} / ${safeText(health.latestTurn && health.latestTurn.planning_depth, "planning: n/a")} / ${safeText(health.latestTurn && health.latestTurn.assurance_depth, "assurance: n/a")}` },
    { label: "Family Gate", value: safeText(familyCompletionGate.status, familyCompletionGate.applies ? "pending" : "n/a"), detail: familyCompletionGate.applies ? `${safeText(familyCompletionGate.taskFamily, "family")} / ${safeText(familyCompletionGate.completionContract, "contract")} / ${familyGateMissing || safeText(familyCompletionGate.summary, "")}` : "No family-specific completion gate on latest turn." },
    { label: "Latest Turn Agent", value: safeText(health.latestTurn && health.latestTurn.agent_name, "none"), detail: safeText(health.latestTurn && health.latestTurn.execution_profile, "") },
    { label: "Updated", value: formatDateTime(payload.generatedAt), detail: `snapshot ${formatTime(payload.generatedAt)}` },
  ]);
}

function renderTopology(payload) {
  const topology = payload && payload.topology ? payload.topology : {};
  const summary = topology.summary || {};
  elements.topologySummary.innerHTML = [
    tagHtml(`${formatInteger(num(summary.total, 0))} rows`, "info"),
    tagHtml(`${formatInteger(num(summary.parents, 0))} parents`, "neutral"),
    tagHtml(`${formatInteger(num(summary.specialists, 0))} specialists`, "pass"),
    tagHtml(`${formatInteger(num(summary.verification, 0))} verification`, "warn"),
    tagHtml(`${formatInteger(num(summary.retired, 0))} retired`, "fail"),
    tagHtml(`${formatInteger(num(summary.active, 0))} active`, "info"),
  ].join("");
  elements.topologyParentLane.innerHTML = toArr(topology.lanes && topology.lanes.parents).length
    ? toArr(topology.lanes.parents).map(agentCardHtml).join("")
    : `<div class="overview-empty">No parent lanes are visible.</div>`;
  elements.topologySpecialistLane.innerHTML = toArr(topology.lanes && topology.lanes.specialists).length
    ? toArr(topology.lanes.specialists).map(agentCardHtml).join("")
    : `<div class="overview-empty">No specialist lanes are visible.</div>`;
  elements.topologyVerificationLane.innerHTML = toArr(topology.lanes && topology.lanes.verification).length
    ? toArr(topology.lanes.verification).map(agentCardHtml).join("")
    : `<div class="overview-empty">No verification lanes are visible.</div>`;
  elements.topologyRetiredLane.innerHTML = toArr(topology.lanes && topology.lanes.retired).length
    ? toArr(topology.lanes.retired).map(agentCardHtml).join("")
    : `<div class="overview-empty">No retired lanes are visible.</div>`;
}

function renderContracts(payload) {
  const contracts = payload && payload.contracts ? payload.contracts : {};
  const turn = contracts.turn || {};
  const taskOutcome = contracts.taskOutcome || {};
  const governance = contracts.governance || {};
  const reasons = toArr(taskOutcome.reasonMapKeys && taskOutcome.reasonMapKeys.length ? taskOutcome.reasonMapKeys : taskOutcome.reasonCodes).slice(0, 6);
  const workerContract = governance.contracts && governance.contracts.worker ? governance.contracts.worker : null;
  elements.turnContractCard.innerHTML = factRowsHtml([
    { label: "Schema", value: safeText(turn.schema, "harness-turn-contract.v1"), detail: safeText(turn.path, "") },
    { label: "Terminal Event", value: safeText(turn.terminalEvent, "turn/completed"), detail: `bridge states ${formatInteger(Object.keys(turn.taskOutcomeBridge && turn.taskOutcomeBridge.allowedByTurnState ? turn.taskOutcomeBridge.allowedByTurnState : {}).length)}` },
  ]);
  elements.taskOutcomeCard.innerHTML = factRowsHtml([
    { label: "Statuses", value: toArr(taskOutcome.statuses).join(", ") || "-", detail: safeText(taskOutcome.path, "") },
    { label: "Reasons", value: `${formatInteger(reasons.length)} visible`, detail: reasons.join(", ") || "No reason codes." },
  ]);
  elements.governanceCard.innerHTML = factRowsHtml([
    { label: "Parent Agents", value: toArr(governance.parentAgents).join(", ") || "-", detail: safeText(governance.path, "") },
    { label: "Contracts", value: `${formatInteger(Object.keys(governance.contracts || {}).length)} roles`, detail: `${workerContract && workerContract.legacyOnly ? "worker legacyOnly" : "worker active"}` },
    { label: "Parent Override", value: governance.exceptions && governance.exceptions.parentOverride && governance.exceptions.parentOverride.enabled ? "enabled" : "disabled", detail: `reasonMinLength ${formatInteger(num(governance.exceptions && governance.exceptions.parentOverride && governance.exceptions.parentOverride.reasonMinLength, 0))}` },
  ]);
}

function traceStateTone(state) {
  const normalized = lower(state);
  if (normalized === "mapped") return "pass";
  if (normalized === "parked") return "warn";
  if (normalized === "dropped" || normalized === "unmapped") return "fail";
  return "neutral";
}

function traceLaneTone(lane) {
  const normalized = lower(lane);
  if (normalized === "core") return "pass";
  if (normalized === "unsafe_or_approval") return "warn";
  if (normalized === "taste") return "neutral";
  return "info";
}

function renderTraceability(payload) {
  if (!elements.traceabilityCard) {
    return;
  }
  const traceability = payload && payload.traceability ? payload.traceability : {};
  const summary = traceability.summary || {};
  const plan = traceability.plan || {};
  const clauseItems = toArr(traceability.clauses).map((entry) => {
    const lines = [
      toArr(entry.requirementRefs).length ? `requirements=${toArr(entry.requirementRefs).join(", ")}` : "",
      toArr(entry.dispatchIds).length ? `dispatch=${toArr(entry.dispatchIds).join(", ")}` : "",
      toArr(entry.planStepIds).length ? `plan=${toArr(entry.planStepIds).join(", ")}` : "",
      toArr(entry.acceptanceCheckRefs).length ? `acceptance=${toArr(entry.acceptanceCheckRefs).join(", ")}` : "",
    ].filter(Boolean);
    const detailParts = [
      safeText(entry.text, ""),
      safeText(entry.parkedReason, ""),
      entry.droppedReasonCode ? `${safeText(entry.droppedReasonCode, "")}${entry.droppedReason ? `: ${safeText(entry.droppedReason, "")}` : ""}` : "",
    ].filter(Boolean);
    return {
      title: `${safeText(entry.clauseId, "req")} ${safeText(entry.text, "")}`.trim(),
      tags: [
        { label: safeText(entry.state, "tracked"), tone: traceStateTone(entry.state) },
        { label: safeText(entry.lane, "lane"), tone: traceLaneTone(entry.lane) },
        { label: safeText(entry.kind, "clause"), tone: "neutral" },
        entry.core ? { label: "core", tone: "pass" } : null,
      ].filter(Boolean),
      detail: detailParts.join(" / "),
      lines,
    };
  });
  elements.traceabilityCard.innerHTML = `
    <div class="overview-inline-tags">
      ${tagHtml(`owner ${safeText(traceability.owner, "intake")}`, "info")}
      ${tagHtml(`依頼反映 ${formatInteger(num(summary.coreMapped, 0))}/${formatInteger(num(summary.coreTotal, 0))}`, num(summary.coreUnmapped, 0) > 0 ? "warn" : "pass")}
      ${tagHtml(`保留 ${formatInteger(num(summary.parkedCount, 0))}`, num(summary.parkedCount, 0) > 0 ? "warn" : "neutral")}
      ${tagHtml(`除外 ${formatInteger(num(summary.droppedCount, 0))}`, num(summary.droppedCount, 0) > 0 ? "fail" : "neutral")}
      ${tagHtml(`steps ${formatInteger(num(summary.planStepCount, 0))}`, "info")}
    </div>
    ${factRowsHtml([
      { label: "Plan Decision", value: safeText(plan.decision, "n/a"), detail: `${safeText(plan.planningDepth, "")} / ${safeText(plan.assuranceDepth, "")} / ${safeText(plan.flowPath, "")}` },
      { label: "Tracked Clauses", value: formatInteger(num(summary.totalClauses, 0)), detail: `dispatch ${formatInteger(num(summary.dispatchCount, 0))} / mapped ${formatInteger(num(summary.mappedCount, 0))}` },
    ])}
    ${itemListHtml(clauseItems, "No request trace is available for the latest turn.")}
  `;
}

function toneForCapabilityStatus(value) {
  const normalized = lower(value).replace(/_/g, "-");
  if (["ready", "pass", "stable", "integrated", "applied", "configured", "active"].includes(normalized)) {
    return "pass";
  }
  if (["running", "observed", "captured", "tracked"].includes(normalized)) {
    return "info";
  }
  if (["check", "pending", "unstable", "failing only", "starved", "proposal-only"].includes(normalized)) {
    return "warn";
  }
  if (["blocked", "missing", "failed", "disabled", "unreported"].includes(normalized)) {
    return "fail";
  }
  return "neutral";
}

function actionLinkHtml(action) {
  const href = safeText(action && action.href);
  if (!href) {
    return "";
  }
  const label = safeText(action && action.label, "Open");
  const tone = safeText(action && action.tone, "secondary");
  const external = /^https?:\/\//i.test(href);
  return `<a class="btn ${escapeHtml(tone)} mini overview-action-link" href="${escapeHtml(href)}"${external ? ` target="_blank" rel="noreferrer"` : ""}>${escapeHtml(label)}</a>`;
}

function capabilityCardHtml(card) {
  const tags = toArr(card.tags).map((tag) => tagHtml(tag.label, tag.tone)).join("");
  const facts = factRowsHtml(toArr(card.facts));
  const list = toArr(card.items).length ? itemListHtml(card.items, "") : "";
  const actions = toArr(card.actions).map(actionLinkHtml).join("");
  return `
    <article class="overview-panel side-card overview-capability-card">
      <div class="overview-panel-head">
        <div>
          <p class="overview-kicker">${escapeHtml(safeText(card.kicker, "Capability"))}</p>
          <h4>${escapeHtml(safeText(card.title, "Untitled capability"))}</h4>
        </div>
        ${tagHtml(safeText(card.status, "unreported"), toneForCapabilityStatus(card.status))}
      </div>
      ${safeText(card.summary) ? `<p class="overview-capability-summary">${escapeHtml(safeText(card.summary))}</p>` : ""}
      ${tags ? `<div class="overview-inline-tags">${tags}</div>` : ""}
      ${facts}
      ${list}
      ${actions ? `<div class="overview-action-row">${actions}</div>` : ""}
    </article>
  `;
}

function demoCardHtml(card) {
  const tags = toArr(card.tags).map((tag) => tagHtml(tag.label, tag.tone)).join("");
  const steps = toArr(card.steps).map((step) => `<li>${escapeHtml(safeText(step))}</li>`).join("");
  const actions = toArr(card.actions).map(actionLinkHtml).join("");
  return `
    <article class="overview-panel side-card overview-demo-card">
      <div class="overview-panel-head">
        <div>
          <p class="overview-kicker">${escapeHtml(safeText(card.kicker, "Demo"))}</p>
          <h4>${escapeHtml(safeText(card.title, "Untitled flow"))}</h4>
        </div>
      </div>
      ${safeText(card.summary) ? `<p class="overview-capability-summary">${escapeHtml(safeText(card.summary))}</p>` : ""}
      ${tags ? `<div class="overview-inline-tags">${tags}</div>` : ""}
      ${steps ? `<ol class="overview-demo-steps">${steps}</ol>` : ""}
      ${actions ? `<div class="overview-action-row">${actions}</div>` : ""}
    </article>
  `;
}

function evidenceCardHtml(title, tags, entries, recentItems, emptyText) {
  const rows = [
    `<div class="overview-inline-tags">${toArr(tags).map((tag) => tagHtml(tag.label, tag.tone)).join("")}</div>`,
    factRowsHtml(entries),
    recentItems ? itemListHtml(recentItems, emptyText) : "",
  ].filter(Boolean);
  return `
    <div class="overview-list">
      <article class="overview-list-item">
        <strong>${escapeHtml(title)}</strong>
        ${rows.join("")}
      </article>
    </div>
  `;
}

function renderEvidence(payload) {
  const evidence = payload && payload.evidence ? payload.evidence : {};
  const signoff = evidence.signoff && evidence.signoff.latest ? evidence.signoff.latest : null;
  const runtimeProof = evidence.runtimeProof && evidence.runtimeProof.latest ? evidence.runtimeProof.latest : null;
  const signoffRecent = toArr(evidence.signoff && evidence.signoff.recent).slice(1, 4).map((entry) => ({
    title: safeText(entry.name, "signoff"),
    detail: `${formatDateTime(entry.generatedAt)} / ${safeText(entry.summaryPath, "")}`,
  }));
  const runtimeProofRecent = toArr(evidence.runtimeProof && evidence.runtimeProof.recent).slice(1, 4).map((entry) => ({
    title: safeText(entry.name, "proof"),
    detail: `${formatDateTime(entry.generatedAt)} / ${safeText(entry.summaryPath, "")}`,
  }));
  elements.signoffEvidenceCard.innerHTML = signoff
    ? evidenceCardHtml(
        safeText(signoff.name, "signoff"),
        [
          { label: signoff.assertions && signoff.assertions.allPassed ? "PASS" : "PENDING", tone: signoff.assertions && signoff.assertions.allPassed ? "pass" : "warn" },
          { label: safeText(signoff.runtime && signoff.runtime.parentDispatchGuardMode, "off"), tone: toneForTaskOutcome(signoff.runtime && signoff.runtime.parentDispatchGuardMode) },
        ],
        [
          { label: "Generated", value: formatDateTime(signoff.generatedAt), detail: safeText(signoff.summaryPath, "") },
          { label: "Workflow", value: `${formatInteger(num(signoff.coreHarnessWorkflow && signoff.coreHarnessWorkflow.passedCases, 0))}/${formatInteger(num(signoff.coreHarnessWorkflow && signoff.coreHarnessWorkflow.sampleSize, 0))}`, detail: `suite ${safeText(signoff.coreHarnessWorkflow && signoff.coreHarnessWorkflow.suiteId, "core-harness-workflow.v4")}` },
          { label: "Natural Trace", value: safeText(signoff.naturalTask && signoff.naturalTask.targetPath, "n/a"), detail: `reviewer ${signoff.naturalTask && signoff.naturalTask.reviewerObserved ? "observed" : "missing"} / dispatch ${signoff.naturalTask && signoff.naturalTask.dispatchCountObserved ? "observed" : "missing"}` },
        ],
        signoffRecent,
        "No older signoff bundles."
      )
    : `<div class="overview-empty">No signoff bundle was found under ${escapeHtml(safeText(evidence.signoff && evidence.signoff.storageRoot, "logs/signoff-bundles"))}.</div>`;
  elements.runtimeProofCard.innerHTML = runtimeProof
    ? evidenceCardHtml(
        safeText(runtimeProof.name, "runtime-proof"),
        [
          { label: safeText(runtimeProof.runtime && runtimeProof.runtime.parentDispatchGuardMode, "off"), tone: toneForTaskOutcome(runtimeProof.runtime && runtimeProof.runtime.parentDispatchGuardMode) },
          { label: `${formatInteger(num(runtimeProof.liveExec && runtimeProof.liveExec.dispatchSuccessCount, 0))} dispatch-ok`, tone: "pass" },
        ],
        [
          { label: "Generated", value: formatDateTime(runtimeProof.generatedAt), detail: safeText(runtimeProof.summaryPath, "") },
          { label: "Live Exec", value: safeText(runtimeProof.liveExec && runtimeProof.liveExec.taskOutcomeStatus, runtimeProof.liveExec && runtimeProof.liveExec.status), detail: `fileChanges ${formatInteger(num(runtimeProof.liveExec && runtimeProof.liveExec.fileChanges, 0))} / dispatch ${formatInteger(num(runtimeProof.liveExec && runtimeProof.liveExec.dispatchCount, 0))}` },
          { label: "Probe Records", value: formatInteger(num(runtimeProof.probePersistence && runtimeProof.probePersistence.persistedRecords, 0)), detail: safeText(runtimeProof.liveExec && runtimeProof.liveExec.proofFile, "") },
        ],
        runtimeProofRecent,
        "No older proof bundles."
      )
    : `<div class="overview-empty">No runtime proof bundle was found under ${escapeHtml(safeText(evidence.runtimeProof && evidence.runtimeProof.storageRoot, "logs/proofs"))}.</div>`;
  const evalItems = toArr(payload && payload.eval && payload.eval.recentRuns).map((entry) => ({
    title: `${safeText(entry.suiteId, "suite")} / ${safeText(entry.variantLabel, "variant")}`,
    tags: [
      { label: `${formatInteger(num(entry.passedCases, 0))}/${formatInteger(num(entry.sampleSize, 0))}`, tone: num(entry.failedCases, 0) === 0 ? "pass" : "warn" },
      { label: `score ${formatPercent(entry.scoreRate)}`, tone: "info" },
    ],
    detail: `${formatDateTime(entry.generatedAt)} / probes ${formatInteger(num(entry.probePersistedRecords, 0))}`,
  }));
  elements.evalRunsCard.innerHTML = itemListHtml(evalItems, "No eval runs are recorded.");
  const apiItems = [
    { title: "Pages", lines: [safeText(payload && payload.pages && payload.pages.console, ""), safeText(payload && payload.pages && payload.pages.overview, "")] },
    { title: "APIs", lines: Object.values(payload && payload.apis ? payload.apis : {}).map((entry) => safeText(entry)).filter(Boolean) },
    { title: "Replay API", detail: safeText(payload && payload.runtime && payload.runtime.execApi && payload.runtime.execApi.replayApi && payload.runtime.execApi.replayApi.listPath, "/api/replay/turns") },
    { title: "Eval API", detail: safeText(payload && payload.runtime && payload.runtime.execApi && payload.runtime.execApi.evalApi && payload.runtime.execApi.evalApi.runPath, "POST /api/eval/run") },
  ];
  elements.apiSurfacesCard.innerHTML = itemListHtml(apiItems, "No API surfaces available.");
}

function renderMemory(payload) {
  const memory = payload && payload.memory ? payload.memory : {};
  const execution = memory.execution || {};
  const externalLearning = populatedObject(memory.externalLearning)
    ? memory.externalLearning
    : (payload && payload.runtime && payload.runtime.externalLearning) || {};
  const documentTooling = payload && payload.runtime && (payload.runtime.documentTooling || payload.runtime.document_tooling)
    ? (payload.runtime.documentTooling || payload.runtime.document_tooling)
    : {};
  const governedGraph = populatedObject(memory.governedGraph)
    ? memory.governedGraph
    : (payload && payload.runtime && (payload.runtime.governedMemory || payload.runtime.governed_memory)) || {};
  const secondaryLearning = populatedObject(memory.secondaryLearning)
    ? memory.secondaryLearning
    : (payload && payload.runtime && payload.runtime.secondaryLearning) || {};
  const anthropicEngineering = secondaryLearning.anthropicEngineering || secondaryLearning.anthropic_engineering || {};
  const skillPortfolio = payload && payload.skillPortfolio ? payload.skillPortfolio : {};
  const selfImprovement = externalLearning.selfImprovement && typeof externalLearning.selfImprovement === "object"
    ? externalLearning.selfImprovement
    : {};
  const manualCaptureSummary = normalizeManualCaptureSummary(payload, externalLearning, selfImprovement);
  const recentTurns = toArr(execution.recent).slice(0, 5).map((entry) => ({
    title: `${safeText(entry.agentName, "agent")} / ${safeText(entry.taskOutcomeStatus || entry.status, "status")}`,
    tags: [
      { label: `dispatch ${formatInteger(num(entry.dispatchSuccessCount, 0))}/${formatInteger(num(entry.dispatchCount, 0))}`, tone: num(entry.parentDispatchGuard && entry.parentDispatchGuard.violation, 0) ? "fail" : "info" },
      { label: `files ${formatInteger(num(entry.fileChanges, 0))}`, tone: num(entry.fileChanges, 0) > 0 ? "pass" : "neutral" },
    ],
    detail: `${formatDateTime(entry.completedAt)} / ${safeText(entry.executionSource, "source")}`,
  }));
  const statusSummary = Object.entries(execution.statusCounts || {}).map(([key, value]) => ({
    label: `${key} ${formatInteger(num(value, 0))}`,
    tone: toneForTaskOutcome(key),
  }));
  const taskOutcomeSummary = Object.entries(execution.taskOutcomeCounts || {}).map(([key, value]) => ({
    label: `${key} ${formatInteger(num(value, 0))}`,
    tone: toneForTaskOutcome(key),
  }));
  elements.executionMemoryCard.innerHTML = `
    <div class="overview-inline-tags">${statusSummary.map((entry) => tagHtml(entry.label, entry.tone)).join("")}</div>
    <div class="overview-inline-tags">${taskOutcomeSummary.map((entry) => tagHtml(entry.label, entry.tone)).join("")}</div>
    ${factRowsHtml([
      { label: "Sample Window", value: formatInteger(num(execution.sampleSize, 0)), detail: `guard violations ${formatInteger(num(execution.guardViolations, 0))}` },
      { label: "Implementation Observed", value: formatInteger(num(execution.implementationObserved, 0)), detail: "turns with file, command, or MCP activity" },
    ])}
    ${itemListHtml(recentTurns, "No execution memory records are available.")}
  `;
  const replayItems = toArr(memory.replay && memory.replay.recent).map((entry) => ({
    title: `${safeText(entry.agentName, "agent")} / ${safeText(entry.taskOutcomeStatus || entry.status, "status")}`,
    tags: [
      { label: `replays ${formatInteger(num(entry.replayStats && entry.replayStats.replayCount, 0))}`, tone: "info" },
      { label: `diff ${formatPercent(entry.replayStats && entry.replayStats.lastReplayDiffRate)}`, tone: "neutral" },
    ],
    detail: `${formatDateTime(entry.updatedAt)} / ${safeText(entry.executionSource, "replay")}`,
  }));
  const patternItems = toArr(execution.patterns).map((entry) => ({
    title: safeText(entry.code || entry.signature, "pattern"),
    tags: [
      { label: `${formatInteger(num(entry.count, 0))} hits`, tone: lower(entry.severity) === "high" ? "fail" : lower(entry.severity) === "medium" ? "warn" : "neutral" },
      { label: safeText(entry.severity, "unknown"), tone: lower(entry.severity) === "high" ? "fail" : lower(entry.severity) === "medium" ? "warn" : "neutral" },
    ],
    detail: `${safeText(entry.hint, "")} / ${formatDateTime(entry.lastSeenAt)}`,
  }));
  elements.replayPatternsCard.innerHTML = `
    ${itemListHtml(replayItems.slice(0, 4), "No replay records are available.")}
    ${itemListHtml(patternItems.slice(0, 4), "No recurring patterns are available.")}
  `;
  const outcomeSummary = skillPortfolio && skillPortfolio.outcomeSummary && typeof skillPortfolio.outcomeSummary === "object"
    ? skillPortfolio.outcomeSummary
    : {};
  const promotionRules = skillPortfolio && skillPortfolio.promotionRules && typeof skillPortfolio.promotionRules === "object"
    ? skillPortfolio.promotionRules
    : {};
  const portfolioRules = skillPortfolio && skillPortfolio.portfolioRules && typeof skillPortfolio.portfolioRules === "object"
    ? skillPortfolio.portfolioRules
    : {};
  const promotionCandidates = toArr(skillPortfolio.promotionCandidates).map((entry) => ({
    title: safeText(entry && entry.skill, "promotion candidate"),
    tags: [
      { label: `${safeText(entry && entry.fromClass, "scenario")} -> ${safeText(entry && entry.toClass, "role")}`, tone: "info" },
      { label: `${formatInteger(num(entry && entry.evidence && entry.evidence.runs, 0))} runs`, tone: "neutral" },
      { label: `success ${formatPercent(num(entry && entry.evidence && entry.evidence.successRate, 0))}`, tone: num(entry && entry.evidence && entry.evidence.successRate, 0) >= 0.84 ? "pass" : "warn" },
    ],
    detail: `score ${formatPercent(num(entry && entry.evidence && entry.evidence.avgPrimaryScore, 0))} / guard failures ${formatInteger(num(entry && entry.evidence && entry.evidence.guardFailures, 0))}`,
  }));
  const missingProposals = toArr(skillPortfolio.missingProposals).map((entry) => ({
    title: safeText(entry && entry.id, "proposal"),
    detail: `${safeText(entry && entry.intent, "")} / owner ${toArr(entry && entry.ownerRoles).join(", ") || "-"}`,
  }));
  const manualSkillCandidates = manualCaptureSummary
    ? toArr(manualCaptureSummary.entries)
        .filter((entry) => lower(entry && entry.classification).replace(/_/g, "-") === "skill candidate")
        .map((entry) => ({
          title: safeText(entry && entry.title, "manual lesson"),
          tags: [
            { label: safeText(entry && entry.classification, "skill candidate"), tone: toneForManualClassification(entry && entry.classification) },
            { label: safeText(entry && entry.promotionDecision, "proposal-only"), tone: toneForPromotionDecision(entry && entry.promotionDecision) },
          ],
          detail: safeText(entry && entry.detail, "-"),
        }))
    : [];
  elements.skillPortfolioCard.innerHTML = `
    <div class="overview-inline-tags">
      ${tagHtml(`audit ${safeText(skillPortfolio.status, "FAIL")}`, safeText(skillPortfolio.status, "FAIL") === "PASS" ? "pass" : "fail")}
      ${tagHtml(`assignments ${formatInteger(toArr(skillPortfolio.assignments).length)}`, "info")}
      ${tagHtml(`events ${formatInteger(num(skillPortfolio.outcomeEvents && skillPortfolio.outcomeEvents.count, 0))}`, "neutral")}
      ${tagHtml(`promotions ${formatInteger(num(skillPortfolio.promotionCandidateCount, 0))}`, num(skillPortfolio.promotionCandidateCount, 0) ? "pass" : "neutral")}
      ${tagHtml(`manual skill notes ${formatInteger(manualSkillCandidates.length)}`, manualSkillCandidates.length ? "warn" : "neutral")}
    </div>
    ${factRowsHtml([
      { label: "Catalog", value: safeText(skillPortfolio.catalog && skillPortfolio.catalog.version, "unknown"), detail: safeText(skillPortfolio.catalog && skillPortfolio.catalog.path, "") },
      { label: "Policy", value: safeText(skillPortfolio.policy && skillPortfolio.policy.version, "unknown"), detail: safeText(skillPortfolio.policy && skillPortfolio.policy.path, "") },
      { label: "Outcome Sample", value: `${formatInteger(num(outcomeSummary.sampledSkills, 0))} skills`, detail: `success ${formatPercent(num(outcomeSummary.overallSuccessRate, 0))} / guard failures ${formatInteger(num(outcomeSummary.totalGuardFailures, 0))}` },
      { label: "Promotion Thresholds", value: `scenario ${formatInteger(num(promotionRules.scenarioToRole && promotionRules.scenarioToRole.minRuns, 0))} / role ${formatInteger(num(promotionRules.roleToGlobal && promotionRules.roleToGlobal.minRuns, 0))}`, detail: `score ${formatPercent(num(promotionRules.scenarioToRole && promotionRules.scenarioToRole.minPrimaryScore, 0))} / reproducibility ${promotionRules.evidence && promotionRules.evidence.requireReproducibilityEvidence ? "required" : "not required"}` },
      { label: "Portfolio Mix", value: `diversity >= ${formatInteger(num(portfolioRules.minClassDiversity, 0))}`, detail: `global <= ${formatPercent(num(portfolioRules.maxClassShare && portfolioRules.maxClassShare.global, 0))} / role <= ${formatPercent(num(portfolioRules.maxClassShare && portfolioRules.maxClassShare.role, 0))} / scenario <= ${formatPercent(num(portfolioRules.maxClassShare && portfolioRules.maxClassShare.scenario, 0))}` },
      { label: "Missing Proposals", value: formatInteger(missingProposals.length), detail: safeText(skillPortfolio.outcomeEvents && skillPortfolio.outcomeEvents.path, "") },
    ])}
    ${itemListHtml(promotionCandidates.slice(0, 3), "No promotion candidates are ready yet.")}
    ${itemListHtml(manualSkillCandidates.slice(0, 2), "No lesson-to-skill pressure is recorded in manual capture.")}
    ${itemListHtml(missingProposals.slice(0, 4), "No missing skill proposals are registered.")}
  `;
  const learningArticles = toArr(externalLearning.recentArticles).map((entry) => ({
    title: safeText(entry.title, "article"),
    tags: [
      { label: safeText(entry.relevance, "unknown"), tone: safeText(entry.relevance, "low") === "high" ? "pass" : safeText(entry.relevance, "low") === "medium" ? "warn" : "neutral" },
      { label: toArr(entry.topicTags).slice(0, 2).join(" / ") || "topic", tone: "info" },
    ],
    detail: `${safeText(entry.indexDateLabel, "-")} / ${safeText(entry.url, "")}`,
  }));
  const learningProposals = toArr(externalLearning.pendingProposals).map((entry) => ({
    title: safeText(entry.title, "proposal"),
    detail: `${safeText(entry.target, "")} / ${safeText(entry.status, "proposal_only")}`,
  }));
  const learningBacklog = toArr(externalLearning.selfImprovement && externalLearning.selfImprovement.priorityBacklog).map((entry) => ({
    title: safeText(entry.title, "candidate"),
    tags: [
      { label: safeText(entry.changeType, "change"), tone: "info" },
      { label: safeText(entry.readinessStatus, "proposal_only"), tone: toneForTaskOutcome(entry.readinessStatus) },
      { label: safeText(entry.blastRadius, "low"), tone: safeText(entry.blastRadius, "low") === "low" ? "pass" : safeText(entry.blastRadius, "low") === "medium" ? "warn" : "fail" },
    ],
    detail: `${safeText(entry.gatingReason, "-")} / ${safeText(entry.nextAction, "-")}`,
  }));
  const anthropicArticles = toArr(anthropicEngineering.recentArticles).map((entry) => ({
    title: safeText(entry.title, "article"),
    tags: [
      { label: safeText(entry.relevance, "unknown"), tone: safeText(entry.relevance, "low") === "high" ? "pass" : safeText(entry.relevance, "low") === "medium" ? "warn" : "neutral" },
      { label: safeText(entry.portability, anthropicEngineering.portabilityMode === "portable_principles_only" ? "portable" : "mixed"), tone: safeText(entry.portability, "portable") === "portable" ? "pass" : "warn" },
    ],
    detail: `${safeText(entry.indexDateLabel, "-")} / ${safeText(entry.url, "")}`,
  }));
  const anthropicProposals = toArr(anthropicEngineering.pendingProposals).map((entry) => ({
    title: safeText(entry.title, "proposal"),
    detail: `${safeText(entry.target, "")} / ${safeText(entry.status, "proposal_only")}`,
  }));
  const anthropicBacklog = toArr(anthropicEngineering.selfImprovement && anthropicEngineering.selfImprovement.priorityBacklog).map((entry) => ({
    title: safeText(entry.title, "candidate"),
    tags: [
      { label: safeText(entry.changeType, "change"), tone: "info" },
      { label: safeText(entry.readinessStatus, "proposal_only"), tone: toneForTaskOutcome(entry.readinessStatus) },
      { label: safeText(entry.blastRadius, "low"), tone: safeText(entry.blastRadius, "low") === "low" ? "pass" : safeText(entry.blastRadius, "low") === "medium" ? "warn" : "fail" },
    ],
    detail: `${safeText(entry.gatingReason, "-")} / ${safeText(entry.nextAction, "-")}`,
  }));
  if (elements.externalLearningCard) {
    const runtimeRetrieval = externalLearning.runtimeRetrieval && typeof externalLearning.runtimeRetrieval === "object"
      ? externalLearning.runtimeRetrieval
      : {};
    const secondarySelfImprovement = anthropicEngineering.selfImprovement && typeof anthropicEngineering.selfImprovement === "object"
      ? anthropicEngineering.selfImprovement
      : {};
    elements.externalLearningCard.innerHTML = `
      <div class="overview-inline-tags">
        ${tagHtml(`status ${safeText(externalLearning.lastStatus, externalLearning.enabled ? "IDLE" : "DISABLED")}`, toneForTaskOutcome(externalLearning.lastStatus))}
        ${tagHtml(`mode ${safeText(externalLearning.mode, "observe")}`, "info")}
        ${tagHtml(`hosts ${formatInteger(toArr(externalLearning.allowedHosts).length)}`, "neutral")}
        ${tagHtml(`retrieval ${safeText(runtimeRetrieval.lastStatus, runtimeRetrieval.enabled ? "IDLE" : "DISABLED")}`, runtimeRetrieval.enabled ? "info" : "warn")}
        ${tagHtml(`self-improvement ${safeText(selfImprovement.gateStatus, "NOT_RUN")}`, safeText(selfImprovement.gateStatus, "FAIL") === "PASS" ? "pass" : safeText(selfImprovement.gateStatus, "FAIL") === "FAIL" ? "fail" : "warn")}
      </div>
      ${factRowsHtml([
        { label: "Source", value: safeText(externalLearning.sourceName, "OpenAI Developers Blog"), detail: safeText(externalLearning.sourceUrl, "") },
        { label: "Cadence", value: `${formatInteger(num(externalLearning.intervalMinutes, 0))} min`, detail: `next ${safeText(externalLearning.nextRunAt, "-")}` },
        { label: "Artifacts", value: safeText(externalLearning.ledgerPath, "output/openai_blog_learning_ledger.json"), detail: `${safeText(externalLearning.digestPath, "")} / ${safeText(externalLearning.curatedDocPath, "")}` },
        { label: "Runtime Retrieval", value: safeText(runtimeRetrieval.lastStatus, runtimeRetrieval.enabled ? "IDLE" : "DISABLED"), detail: `${toArr(runtimeRetrieval.applyToAgents).join(", ") || "-"} / ${toArr(runtimeRetrieval.lastMatchedTopics).join(", ") || "-"}` },
        { label: "Self Improvement", value: safeText(selfImprovement.gateStatus, "NOT_RUN"), detail: `${safeText(selfImprovement.appliedDecision, "none")} / hints ${formatInteger(num(selfImprovement.appliedHintCount, 0))} / notes ${formatInteger(num(selfImprovement.appliedFrontendQualityNoteCount, 0))} / failed ${toArr(selfImprovement.failedCaseIds).join(", ") || "-"}` },
        { label: "Candidate Queue", value: `ready ${formatInteger(num(selfImprovement.autoApplyCandidateCount, 0))}`, detail: `raw ${formatInteger(num(selfImprovement.rawAutoApplyChangeCount, 0))} / wait ${formatInteger(num(selfImprovement.awaitingObservationCount, 0) + num(selfImprovement.awaitingReinforcementCount, 0))} / disabled ${formatInteger(num(selfImprovement.policyDisabledCandidateCount, 0))}` },
        { label: "Observation Lane", value: safeText(selfImprovement.observationStatus, "-"), detail: `obs ${formatInteger(num(selfImprovement.observationCount, 0))} / last ${safeText(selfImprovement.lastObservedAt, "-")} / threshold s>=${formatInteger(num(selfImprovement.requiredObservationSuccesses, 0))} rate>=${formatPercent(num(selfImprovement.requiredObservationSuccessRate, 0))}` },
        { label: "Next Cycle", value: safeText(selfImprovement.nextPriority && selfImprovement.nextPriority.readinessStatus, "-"), detail: `${safeText(selfImprovement.nextPriority && selfImprovement.nextPriority.title, "-")} / ${safeText(selfImprovement.nextPriority && selfImprovement.nextPriority.nextAction, "-")} / ${formatSelfImprovementProgress(selfImprovement.nextPriority)}` },
        { label: "Freeze Guard", value: safeText(externalLearning.freezeAware && externalLearning.freezeAware.requirementFoundationV1, "bug_fix_only"), detail: `blocked ${toArr(externalLearning.freezeAware && externalLearning.freezeAware.blockedApplyTargets).join(", ") || "-"}` },
      ])}
      ${itemListHtml(learningArticles.slice(0, 4), "No recent official learning articles are tracked yet.")}
      ${itemListHtml(learningProposals.slice(0, 4), "No governed promotion proposals are pending.")}
      ${itemListHtml(learningBacklog.slice(0, 4), "No self-improvement backlog items are queued.")}
      ${manualCaptureSummary ? `
      <section class="overview-subsection">
        <div class="overview-subsection-head">
          <h4>Manual Capture</h4>
          <div class="overview-inline-tags">
            ${tagHtml(`status ${safeText(manualCaptureSummary.status, "captured")}`, toneForTaskOutcome(manualCaptureSummary.status))}
            ${tagHtml(`${formatInteger(num(manualCaptureSummary.entryCount, 0))} lessons`, "info")}
            ${tagHtml(`proposal ${formatInteger(num(manualCaptureSummary.proposalOnlyCount, 0))}`, "warn")}
            ${tagHtml(`blocked ${formatInteger(num(manualCaptureSummary.blockedCount, 0))}`, manualCaptureSummary.blockedCount ? "fail" : "neutral")}
          </div>
        </div>
        ${factRowsHtml([
          { label: "Capture", value: safeText(manualCaptureSummary.schema, "manual-self-improvement-capture.v1"), detail: `${safeText(manualCaptureSummary.generatedAt, "-")} / ${safeText(manualCaptureSummary.sourceKind, "manual_turn_capture")}` },
          { label: "Decisions", value: `proposal ${formatInteger(num(manualCaptureSummary.proposalOnlyCount, 0))} / blocked ${formatInteger(num(manualCaptureSummary.blockedCount, 0))}`, detail: `auto ${formatInteger(num(manualCaptureSummary.autoApplyCandidateCount, 0))} / runtime ${formatInteger(num(manualCaptureSummary.runtimeHintCount, 0))} / quality ${formatInteger(num(manualCaptureSummary.qualityNoteCount, 0))} / skill ${formatInteger(num(manualCaptureSummary.skillCandidateCount, 0))}` },
          { label: "Artifact", value: safeText(manualCaptureSummary.artifactPath, "manual capture summary"), detail: safeText(manualCaptureSummary.request, "-") },
        ])}
        ${itemListHtml(toArr(manualCaptureSummary.entries).slice(0, 3).map((entry) => ({
          title: entry.title,
          tags: [
            { label: entry.classification, tone: toneForManualClassification(entry.classification) },
            { label: entry.promotionDecision, tone: toneForPromotionDecision(entry.promotionDecision) },
          ],
          detail: entry.detail,
        })), "No manual self-improvement lessons are captured yet.")}
      </section>
      ` : ""}
      ${anthropicEngineering && (anthropicEngineering.sourceName || anthropicEngineering.enabled !== undefined) ? `
      <h4>Secondary Source</h4>
      ${factRowsHtml([
        { label: "Source", value: safeText(anthropicEngineering.sourceName, "Anthropic Engineering"), detail: safeText(anthropicEngineering.sourceUrl, "") },
        { label: "Cadence", value: `${formatInteger(num(anthropicEngineering.intervalMinutes, 0))} min`, detail: `next ${safeText(anthropicEngineering.nextRunAt, "-")}` },
        { label: "Mode", value: safeText(anthropicEngineering.portabilityMode, "portable_principles_only"), detail: safeText(anthropicEngineering.curatedDocPath, "") },
        { label: "Self Improvement", value: safeText(secondarySelfImprovement.gateStatus, "NOT_RUN"), detail: `${safeText(secondarySelfImprovement.appliedDecision, "none")} / hints ${formatInteger(num(secondarySelfImprovement.appliedHintCount, 0))}` },
        { label: "Candidate Queue", value: `ready ${formatInteger(num(secondarySelfImprovement.autoApplyCandidateCount, 0))}`, detail: `raw ${formatInteger(num(secondarySelfImprovement.rawAutoApplyChangeCount, 0))} / wait ${formatInteger(num(secondarySelfImprovement.awaitingObservationCount, 0) + num(secondarySelfImprovement.awaitingReinforcementCount, 0))} / disabled ${formatInteger(num(secondarySelfImprovement.policyDisabledCandidateCount, 0))}` },
        { label: "Observation Lane", value: safeText(secondarySelfImprovement.observationStatus, "-"), detail: `obs ${formatInteger(num(secondarySelfImprovement.observationCount, 0))} / last ${safeText(secondarySelfImprovement.lastObservedAt, "-")} / threshold s>=${formatInteger(num(secondarySelfImprovement.requiredObservationSuccesses, 0))} rate>=${formatPercent(num(secondarySelfImprovement.requiredObservationSuccessRate, 0))}` },
        { label: "Next Cycle", value: safeText(secondarySelfImprovement.nextPriority && secondarySelfImprovement.nextPriority.readinessStatus, "-"), detail: `${safeText(secondarySelfImprovement.nextPriority && secondarySelfImprovement.nextPriority.title, "-")} / ${safeText(secondarySelfImprovement.nextPriority && secondarySelfImprovement.nextPriority.nextAction, "-")} / ${formatSelfImprovementProgress(secondarySelfImprovement.nextPriority)}` },
      ])}
      ${itemListHtml(anthropicArticles.slice(0, 3), "No secondary learning articles are tracked yet.")}
      ${itemListHtml(anthropicProposals.slice(0, 3), "No secondary learning proposals are pending.")}
      ${itemListHtml(anthropicBacklog.slice(0, 3), "No secondary self-improvement backlog items are queued.")}
      ` : ""}
    `;
  }
  if (elements.documentToolingCard) {
    const toolingItems = toArr(documentTooling.tools).map((entry) => ({
      title: safeText(entry.displayName || entry.id, "tool"),
      tags: [
        { label: entry.installed ? "available" : "missing", tone: entry.installed ? "pass" : "warn" },
        { label: safeText(entry.category, "tool"), tone: "info" },
      ],
      detail: `${safeText(entry.command, "-")} / ${safeText(entry.version, "-")} / ${safeText(entry.installCommand, "-")}`,
    }));
    const routeItems = toArr(documentTooling.recommendedRoutes).map((entry) => ({
      title: safeText(entry.useCase, "route"),
      tags: [{ label: safeText(entry.toolId, "tool"), tone: "info" }],
      detail: safeText(entry.reason, "-"),
    }));
    elements.documentToolingCard.innerHTML = `
      <div class="overview-inline-tags">
        ${tagHtml(`status ${safeText(documentTooling.status, "ready")}`, safeText(documentTooling.status, "ready") === "ready" ? "pass" : "warn")}
        ${tagHtml(`available ${formatInteger(num(documentTooling.availableCount, 0))}`, num(documentTooling.availableCount, 0) > 0 ? "pass" : "warn")}
        ${tagHtml(`missing ${formatInteger(num(documentTooling.missingCount, 0))}`, num(documentTooling.missingCount, 0) > 0 ? "warn" : "neutral")}
      </div>
      ${factRowsHtml([
        { label: "Hub", value: safeText(documentTooling.hubScriptPath, "scripts/document_tooling.js"), detail: safeText(documentTooling.guidePath, "docs/DOCUMENT_TOOLING_GUIDE.md") },
        { label: "Local root", value: safeText(documentTooling.toolRoot, ".tooling/document-tools"), detail: `${safeText(documentTooling.venvPath, ".tooling/document-tools/venv")} / ${safeText(documentTooling.jdkPath, ".tooling/document-tools/jdk")}` },
        { label: "Bootstrap", value: safeText(documentTooling.exampleCommands && documentTooling.exampleCommands.bootstrap, "node scripts/document_tooling.js bootstrap"), detail: safeText(documentTooling.exampleCommands && documentTooling.exampleCommands.status, "node scripts/document_tooling.js status") },
        { label: "Run", value: safeText(documentTooling.exampleCommands && documentTooling.exampleCommands.runMarkItDown, "node scripts/document_tooling.js run markitdown -- input.pdf -o output.md"), detail: `${safeText(documentTooling.exampleCommands && documentTooling.exampleCommands.runOpenDataLoader, "")} / ${safeText(documentTooling.exampleCommands && documentTooling.exampleCommands.runSkillNet, "")}` },
      ])}
      ${itemListHtml(toolingItems.slice(0, 4), "No document-tooling probe results are available.")}
      ${itemListHtml(routeItems.slice(0, 4), "No default document-tooling routes are registered.")}
    `;
  }
  if (elements.governedMemoryCard) {
    const workspaceProgress = governedGraph && governedGraph.workspaceProgress && typeof governedGraph.workspaceProgress === "object"
      ? governedGraph.workspaceProgress
      : {};
    const latestPack = governedGraph && governedGraph.latestPack && typeof governedGraph.latestPack === "object"
      ? governedGraph.latestPack
      : {};
    const staleWarnings = toArr(governedGraph && governedGraph.staleMemoryWarnings);
    const recentPromotions = toArr(governedGraph && governedGraph.recentPromotions);
    const recentRevocations = toArr(governedGraph && governedGraph.recentRevocations);
    const typeCounts = Object.entries(governedGraph && governedGraph.typeCounts ? governedGraph.typeCounts : {}).map(([key, value]) => ({
      label: `${key} ${formatInteger(num(value, 0))}`,
      tone: key === "constitution_ref" || key === "requirement_ref" ? "pass" : key === "improvement_candidate" ? "warn" : "info",
    }));
    const sectionCounts = Object.entries(latestPack && latestPack.sectionCounts ? latestPack.sectionCounts : {})
      .filter(([, value]) => num(value, 0) > 0)
      .map(([key, value]) => ({
        label: `${key} ${formatInteger(num(value, 0))}`,
        tone: key === "spec" || key === "intent" ? "pass" : key === "semantic" ? "info" : "neutral",
      }));
    const packItems = toArr(latestPack.memoryIds).slice(0, 6).map((entry) => ({
      title: safeText(entry, "memory"),
      detail: safeText(governedGraph.canonicalRoot, ""),
    }));
    const blockerItems = toArr(workspaceProgress.knownBlockers).slice(0, 4).map((entry) => ({
      title: safeText(entry, "blocker"),
      tags: [{ label: "blocker", tone: "fail" }],
      detail: safeText(governedGraph.eventLogPath, ""),
    }));
    const nextItems = toArr(workspaceProgress.nextRecommendedActions).slice(0, 4).map((entry) => ({
      title: safeText(entry, "next"),
      tags: [{ label: "next", tone: "info" }],
      detail: toArr(workspaceProgress.recentTouchedPaths).slice(0, 2).join(" / ") || safeText(governedGraph.outputRoot, ""),
    }));
    const staleItems = staleWarnings.slice(0, 4).map((entry) => ({
      title: safeText(entry.memoryId, "stale-memory"),
      tags: [{ label: `${safeText(entry.type, "memory")} stale`, tone: "warn" }],
      detail: `${formatInteger(num(entry.ageDays, 0))}d / expiry ${formatInteger(num(entry.expiryDays, 0))}d`,
    }));
    const promotionItems = recentPromotions.slice(0, 3).map((entry) => ({
      title: safeText(entry.memoryId, "promotion"),
      tags: [{ label: safeText(entry.status, "promoted"), tone: "pass" }],
      detail: `${safeText(entry.memoryType, "-")} / ${safeText(entry.recordedAt, "-")}`,
    }));
    const revocationItems = recentRevocations.slice(0, 3).map((entry) => ({
      title: safeText(entry.memoryId, "revocation"),
      tags: [{ label: safeText(entry.status, "revoked"), tone: "fail" }],
      detail: `${safeText(entry.memoryType, "-")} / ${safeText(entry.recordedAt, "-")}`,
    }));
    elements.governedMemoryCard.innerHTML = `
      <div class="overview-inline-tags">
        ${tagHtml(`status ${safeText(governedGraph.status, "ready")}`, safeText(governedGraph.status, "ready") === "ready" ? "pass" : "warn")}
        ${tagHtml(`items ${formatInteger(num(governedGraph.itemCount, 0))}`, "info")}
        ${tagHtml(`promoted ${formatInteger(num(governedGraph.promotedCount, 0))}`, "pass")}
        ${tagHtml(`events ${formatInteger(num(governedGraph.eventCount, 0))}`, "neutral")}
        ${tagHtml(`stale ${formatInteger(staleWarnings.length)}`, staleWarnings.length ? "warn" : "pass")}
      </div>
      <div class="overview-inline-tags">${typeCounts.map((entry) => tagHtml(entry.label, entry.tone)).join("")}</div>
      <div class="overview-inline-tags">${sectionCounts.map((entry) => tagHtml(entry.label, entry.tone)).join("")}</div>
      ${factRowsHtml([
        { label: "Canonical Root", value: safeText(governedGraph.canonicalRoot, "logs/archive/raw/runtime_state/memory"), detail: safeText(governedGraph.eventLogPath, "") },
        { label: "Output Root", value: safeText(governedGraph.outputRoot, "output/memory"), detail: safeText(governedGraph.workspaceId, "") },
        { label: "Latest Pack", value: `${formatInteger(num(latestPack.selectedCount, 0))} items`, detail: `${safeText(latestPack.activeAgent, "-")} / ${safeText(latestPack.taskFamily, "-")} / high ${formatInteger(num(latestPack.highConfidenceCount, 0))}` },
        { label: "Objective", value: safeText(workspaceProgress.currentObjective, "No compiled objective"), detail: safeText(workspaceProgress.updatedAt, "") },
      ])}
      ${itemListHtml(packItems, "No compiled memory pack is available yet.")}
      ${itemListHtml(blockerItems, "No known workspace blockers are recorded.")}
      ${itemListHtml(nextItems, "No next actions are compiled.")}
      ${itemListHtml(staleItems, "No stale memory warnings are active.")}
      ${itemListHtml(promotionItems, "No recent promotions are recorded.")}
      ${itemListHtml(revocationItems, "No recent revocations are recorded.")}
    `;
  }
  const roleCheckItems = toArr(skillPortfolio.roleChecks).map((entry) => ({
    title: safeText(entry.role, "role"),
    tags: [
      { label: entry.pass ? "pass" : "check", tone: entry.pass ? "pass" : "warn" },
      { label: `${formatInteger(num(entry.assignedCount, 0))}/${formatInteger(num(entry.minSkills, 0))}`, tone: entry.pass ? "info" : "warn" },
    ],
    detail: `missingClasses ${toArr(entry.missingClasses).join("|") || "-"} / missingSkills ${toArr(entry.missingSkills).join("|") || "-"}`,
  }));
  elements.roleChecksCard.innerHTML = itemListHtml(roleCheckItems, "ロール監査結果はまだありません。");
}

function renderRawSnapshot(payload) {
  if (!elements.rawSnapshot) {
    return;
  }
  elements.rawSnapshot.textContent = JSON.stringify(payload, null, 2);
}

function renderOverview(payload) {
  renderHero(payload);
  renderMetrics(payload);
  renderCapabilities(payload);
  renderRuntime(payload);
  renderTopology(payload);
  renderContracts(payload);
  renderTraceability(payload);
  renderEvidence(payload);
  renderMemory(payload);
  renderRawSnapshot(payload);
  if (elements.generatedAt) {
    elements.generatedAt.textContent = `Snapshot ${formatTime(payload.generatedAt)}`;
  }
}

async function loadOverview({ manual = false } = {}) {
  const requestId = ++state.requestId;
  setError("");
  setRefreshState(manual ? "更新中" : "読込中", "waiting");
  try {
    const response = await fetch("/api/harness/overview", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (requestId !== state.requestId) {
      return;
    }
    state.payload = payload;
    renderOverview(payload);
    setRefreshState("最新", "connected");
  } catch (error) {
    if (requestId !== state.requestId) {
      return;
    }
    setRefreshState("エラー", "disconnected");
    setError(`Overview refresh failed: ${error && error.message ? error.message : "unknown error"}`);
  }
}

function startTicker() {
  stopTicker();
  state.timer = setInterval(() => {
    loadOverview().catch(() => {});
  }, OVERVIEW_REFRESH_MS);
}

function stopTicker() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

function bind() {
  if (elements.refreshBtn) {
    elements.refreshBtn.onclick = () => {
      loadOverview({ manual: true }).catch(() => {});
    };
  }
  window.addEventListener("beforeunload", stopTicker);
}

async function boot() {
  bind();
  setRefreshState("待機中", "idle");
  await loadOverview({ manual: true });
  startTicker();
}

boot().catch((error) => {
  setRefreshState("エラー", "disconnected");
  setError(`Overview bootstrap failed: ${error && error.message ? error.message : "unknown error"}`);
});
