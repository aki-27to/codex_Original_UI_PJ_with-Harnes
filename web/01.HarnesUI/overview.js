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
  runtimePostureCard: by("runtimePostureCard"),
  guardrailCard: by("guardrailCard"),
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
  if (normalized === "completed" || normalized === "pass" || normalized === "ready") {
    return "pass";
  }
  if (normalized === "failed_validation" || normalized === "blocked" || normalized === "fail") {
    return "fail";
  }
  if (normalized === "needs_input" || normalized === "partial" || normalized === "wait") {
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
    return `<div class="overview-empty">No facts available.</div>`;
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
    return `<div class="overview-empty">${escapeHtml(emptyText || "No data available.")}</div>`;
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
  const summaryText = [
    `Active runtime agent is ${runtimeActiveAgent(runtime)}.`,
    `Default exec agent is ${runtimeDefaultExecAgent(runtime)}.`,
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
  const signoff = evidence.signoff && evidence.signoff.latest ? evidence.signoff.latest : null;
  const runtimeProof = evidence.runtimeProof && evidence.runtimeProof.latest ? evidence.runtimeProof.latest : null;
  const recentRuns = payload && payload.eval ? toArr(payload.eval.recentRuns) : [];
  const latestRun = recentRuns[0] || null;
  const externalLearning = runtime && runtime.externalLearning ? runtime.externalLearning : {};
  const cards = [
    {
      label: "Active Agent",
      value: runtimeActiveAgent(runtime),
      detail: `default exec ${runtimeDefaultExecAgent(runtime)} / session ${safeText(runtime.sessionRef, "none")} / profile ${safeText(runtime.executionProfile, "unknown")}`,
      tags: [{ label: `agents ${formatInteger(num(runtime.agentCount, 0))}`, tone: "info" }],
    },
    {
      label: "Full Utilization",
      value: runtime.fullUtilization && runtime.fullUtilization.ready ? "READY" : "CHECK",
      detail: `request-user-input ${safeText(runtime.nonInteractiveUserInput && runtime.nonInteractiveUserInput.policy, "unknown")} / shadow ${runtime.adversarialShadow && runtime.adversarialShadow.enabled ? "on" : "off"}`,
      tags: [{ label: safeText(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode, "off"), tone: toneForTaskOutcome(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode) }],
    },
    {
      label: "Topology Rows",
      value: formatInteger(num(topology.summary && topology.summary.total, 0)),
      detail: `${formatInteger(num(topology.summary && topology.summary.parents, 0))} parent / ${formatInteger(num(topology.summary && topology.summary.specialists, 0))} specialist / ${formatInteger(num(topology.summary && topology.summary.verification, 0))} verification`,
      tags: [{ label: `${formatInteger(num(topology.summary && topology.summary.active, 0))} active`, tone: "info" }],
    },
    {
      label: "Latest Eval",
      value: latestRun ? `${formatInteger(num(latestRun.passedCases, 0))}/${formatInteger(num(latestRun.sampleSize, 0))}` : "--",
      detail: latestRun ? `${safeText(latestRun.suiteId, "suite")} / score ${formatPercent(latestRun.scoreRate)}` : "No eval history yet.",
      tags: [{ label: latestRun ? safeText(latestRun.variantLabel, "variant") : "history", tone: "neutral" }],
    },
    {
      label: "Runtime Proof",
      value: runtimeProof ? formatInteger(num(runtimeProof.liveExec && runtimeProof.liveExec.dispatchSuccessCount, 0)) : "--",
      detail: runtimeProof ? `dispatch successes / ${safeText(runtimeProof.runtime && runtimeProof.runtime.parentDispatchGuardMode, "off")}` : "No proof bundle.",
      tags: [{ label: runtimeProof ? safeText(runtimeProof.name, "proof") : "missing", tone: runtimeProof ? "info" : "warn" }],
    },
    {
      label: "Latest Signoff",
      value: signoff && signoff.assertions && signoff.assertions.allPassed ? "PASS" : "PENDING",
      detail: signoff ? `${formatInteger(num(signoff.coreHarnessWorkflow && signoff.coreHarnessWorkflow.passedCases, 0))}/${formatInteger(num(signoff.coreHarnessWorkflow && signoff.coreHarnessWorkflow.sampleSize, 0))} suite cases passed` : "No signoff bundle.",
      tags: [{ label: signoff ? safeText(signoff.name, "signoff") : "missing", tone: signoff ? "pass" : "warn" }],
    },
    {
      label: "External Learning",
      value: safeText(externalLearning.lastStatus, externalLearning.enabled ? "IDLE" : "DISABLED"),
      detail: `${formatInteger(num(externalLearning.trackedArticles, 0))} articles / ${formatInteger(num(externalLearning.pendingProposalCount, 0))} pending proposals`,
      tags: [{ label: externalLearning.enabled ? "official-blog" : "paused", tone: externalLearning.enabled ? "info" : "warn" }],
    },
  ];
  elements.metrics.innerHTML = cards.map(metricCardHtml).join("");
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
  elements.runtimePostureCard.innerHTML = factRowsHtml([
    { label: "Execution Profile", value: safeText(runtime.executionProfile, "unknown"), detail: `active agent ${runtimeActiveAgent(runtime)} / default exec ${runtimeDefaultExecAgent(runtime)}` },
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
  const externalLearning = memory.externalLearning || (payload && payload.runtime && payload.runtime.externalLearning) || {};
  const secondaryLearning = memory.secondaryLearning || (payload && payload.runtime && payload.runtime.secondaryLearning) || {};
  const anthropicEngineering = secondaryLearning.anthropicEngineering || secondaryLearning.anthropic_engineering || {};
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
  const skillPortfolio = payload && payload.skillPortfolio ? payload.skillPortfolio : {};
  const missingProposals = toArr(skillPortfolio.missingProposals).map((entry) => ({
    title: safeText(entry && entry.id, "proposal"),
    detail: `${safeText(entry && entry.intent, "")} / owner ${toArr(entry && entry.ownerRoles).join(", ") || "-"}`,
  }));
  elements.skillPortfolioCard.innerHTML = `
    <div class="overview-inline-tags">
      ${tagHtml(`audit ${safeText(skillPortfolio.status, "FAIL")}`, safeText(skillPortfolio.status, "FAIL") === "PASS" ? "pass" : "fail")}
      ${tagHtml(`assignments ${formatInteger(toArr(skillPortfolio.assignments).length)}`, "info")}
      ${tagHtml(`events ${formatInteger(num(skillPortfolio.outcomeEvents && skillPortfolio.outcomeEvents.count, 0))}`, "neutral")}
    </div>
    ${factRowsHtml([
      { label: "Catalog", value: safeText(skillPortfolio.catalog && skillPortfolio.catalog.version, "unknown"), detail: safeText(skillPortfolio.catalog && skillPortfolio.catalog.path, "") },
      { label: "Policy", value: safeText(skillPortfolio.policy && skillPortfolio.policy.version, "unknown"), detail: safeText(skillPortfolio.policy && skillPortfolio.policy.path, "") },
      { label: "Missing Proposals", value: formatInteger(missingProposals.length), detail: safeText(skillPortfolio.outcomeEvents && skillPortfolio.outcomeEvents.path, "") },
    ])}
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
  if (elements.externalLearningCard) {
    const runtimeRetrieval = externalLearning.runtimeRetrieval && typeof externalLearning.runtimeRetrieval === "object"
      ? externalLearning.runtimeRetrieval
      : {};
    const selfImprovement = externalLearning.selfImprovement && typeof externalLearning.selfImprovement === "object"
      ? externalLearning.selfImprovement
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
        { label: "Freeze Guard", value: safeText(externalLearning.freezeAware && externalLearning.freezeAware.requirementFoundationV1, "bug_fix_only"), detail: `blocked ${toArr(externalLearning.freezeAware && externalLearning.freezeAware.blockedApplyTargets).join(", ") || "-"}` },
      ])}
      ${itemListHtml(learningArticles.slice(0, 4), "No recent official learning articles are tracked yet.")}
      ${itemListHtml(learningProposals.slice(0, 4), "No governed promotion proposals are pending.")}
      ${anthropicEngineering && (anthropicEngineering.sourceName || anthropicEngineering.enabled !== undefined) ? `
      <h4>Secondary Source</h4>
      ${factRowsHtml([
        { label: "Source", value: safeText(anthropicEngineering.sourceName, "Anthropic Engineering"), detail: safeText(anthropicEngineering.sourceUrl, "") },
        { label: "Cadence", value: `${formatInteger(num(anthropicEngineering.intervalMinutes, 0))} min`, detail: `next ${safeText(anthropicEngineering.nextRunAt, "-")}` },
        { label: "Mode", value: safeText(anthropicEngineering.portabilityMode, "portable_principles_only"), detail: safeText(anthropicEngineering.curatedDocPath, "") },
        { label: "Self Improvement", value: safeText(secondarySelfImprovement.gateStatus, "NOT_RUN"), detail: `${safeText(secondarySelfImprovement.appliedDecision, "none")} / hints ${formatInteger(num(secondarySelfImprovement.appliedHintCount, 0))}` },
      ])}
      ${itemListHtml(anthropicArticles.slice(0, 3), "No secondary learning articles are tracked yet.")}
      ${itemListHtml(anthropicProposals.slice(0, 3), "No secondary learning proposals are pending.")}
      ` : ""}
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
  elements.roleChecksCard.innerHTML = itemListHtml(roleCheckItems, "No role checks are available.");
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
  await loadOverview({ manual: true });
  startTicker();
}

boot().catch((error) => {
  setRefreshState("エラー", "disconnected");
  setError(`Overview bootstrap failed: ${error && error.message ? error.message : "unknown error"}`);
});
