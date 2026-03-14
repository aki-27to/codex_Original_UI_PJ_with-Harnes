const OVERVIEW_REFRESH_MS = 20000;

const state = { payload: null, requestId: 0, timer: null };

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
  signoffEvidenceCard: by("signoffEvidenceCard"),
  runtimeProofCard: by("runtimeProofCard"),
  evalRunsCard: by("evalRunsCard"),
  apiSurfacesCard: by("apiSurfacesCard"),
  executionMemoryCard: by("executionMemoryCard"),
  replayPatternsCard: by("replayPatternsCard"),
  skillPortfolioCard: by("skillPortfolioCard"),
  roleChecksCard: by("roleChecksCard"),
  rawSnapshot: by("overviewRawSnapshot"),
};

function by(id) { return document.getElementById(id); }
function toArr(value) { return Array.isArray(value) ? value : []; }
function num(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function safeText(value, fallback = "") { const text = value == null ? "" : String(value).trim(); return text || fallback; }
function lower(value) { return safeText(value).toLowerCase(); }
function fmtInt(value) { return new Intl.NumberFormat("ja-JP").format(Math.trunc(num(value, 0))); }
function fmtPct(value) { return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : "--"; }
function fmtDateTime(value) { const ms = num(value, 0); return ms ? new Date(ms).toLocaleString("ja-JP", { hour12: false }) : "--:--:--"; }
function fmtTime(value) { const ms = num(value, 0); return ms ? new Date(ms).toLocaleTimeString("ja-JP", { hour12: false }) : "--:--:--"; }
function esc(value) { return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
function activeAgent(runtime) { return safeText(runtime && runtime.activeAgent, "未報告"); }
function defaultExecAgent(runtime) { return safeText(runtime && runtime.fullUtilization && runtime.fullUtilization.actual && runtime.fullUtilization.actual.defaultExecAgent, "未報告"); }
function intentState(runtime) { return runtime && runtime.intentFirst ? runtime.intentFirst : (runtime && runtime.intent_first ? runtime.intent_first : {}); }
function emptyHtml(message) { return `<div class="overview-empty">${esc(message)}</div>`; }
function tagHtml(label, tone = "neutral") { return safeText(label) ? `<span class="overview-tag ${esc(tone)}">${esc(label)}</span>` : ""; }
function tone(value) {
  const v = lower(value);
  if (["completed", "pass", "ready"].includes(v)) return "pass";
  if (["failed_validation", "blocked", "fail"].includes(v)) return "fail";
  if (["needs_input", "partial", "wait"].includes(v)) return "warn";
  if (["running", "enforce", "configured"].includes(v)) return "info";
  return "neutral";
}
function setRefreshState(label, variant) {
  if (!elements.refreshState) return;
  elements.refreshState.textContent = label;
  elements.refreshState.className = `pill ${variant}`;
}
function setHidden(el, hidden) {
  if (!el || !el.classList) return;
  if (typeof el.classList.toggle === "function") {
    el.classList.toggle("hidden", !!hidden);
    return;
  }
  if (hidden) el.classList.add("hidden");
  else el.classList.remove("hidden");
}
function setError(message) {
  if (!elements.errorBanner) return;
  const text = safeText(message);
  elements.errorBanner.textContent = text;
  setHidden(elements.errorBanner, !text);
}
function factRowsHtml(entries) {
  const rows = toArr(entries).filter(Boolean).map((entry) => `
    <div class="overview-fact-row">
      <span class="overview-fact-label">${esc(safeText(entry.label, "-"))}</span>
      <span class="overview-fact-value">${esc(safeText(entry.value, "-"))}</span>
      ${safeText(entry.detail) ? `<span class="overview-fact-detail">${esc(entry.detail)}</span>` : ""}
    </div>
  `);
  return rows.length ? `<div class="overview-fact-list">${rows.join("")}</div>` : emptyHtml("表示できる項目はありません。");
}
function itemListHtml(items, fallbackText) {
  const rows = toArr(items).filter(Boolean).map((item) => `
    <article class="overview-list-item">
      <strong>${esc(safeText(item.title || item.label || item.name, "無題"))}</strong>
      ${toArr(item.tags).length ? `<div class="overview-inline-tags">${toArr(item.tags).map((tag) => tagHtml(tag.label, tag.tone)).join("")}</div>` : ""}
      ${safeText(item.detail || item.description || item.meta) ? `<p>${esc(safeText(item.detail || item.description || item.meta))}</p>` : ""}
      ${toArr(item.lines).length ? `<div class="overview-mono-list">${toArr(item.lines).filter((line) => safeText(line)).map((line) => `<span class="overview-code-line">${esc(line)}</span>`).join("")}</div>` : ""}
    </article>
  `);
  return rows.length ? `<div class="overview-list">${rows.join("")}</div>` : emptyHtml(fallbackText || "表示できるデータはありません。");
}
function metricCardHtml(card) {
  return `
    <article class="overview-metric-card">
      <span class="overview-metric-label">${esc(safeText(card.label, "-"))}</span>
      <strong>${esc(safeText(card.value, "-"))}</strong>
      <div class="overview-inline-tags">${toArr(card.tags).map((tag) => tagHtml(tag.label, tag.tone)).join("")}</div>
      <p class="overview-metric-detail">${esc(safeText(card.detail, ""))}</p>
    </article>
  `;
}
function agentCardHtml(agent) {
  const tags = [
    { label: agent.status || "idle", tone: tone(agent.status) },
    { label: agent.source || "runtime", tone: "neutral" },
    agent.governance && agent.governance.readOnly ? { label: "読み取り専用", tone: "warn" } : null,
    agent.governance && agent.governance.verificationOnly ? { label: "検証専用", tone: "warn" } : null,
    agent.governance && agent.governance.legacyOnly ? { label: "互換専用", tone: "fail" } : null,
    agent.governance && agent.governance.requiresParentOverride ? { label: "override 必須", tone: "warn" } : null,
  ].filter(Boolean);
  const scopeLines = toArr(agent.governance && agent.governance.scopePaths).slice(0, 4).map((entry) => `scope=${safeText(entry)}`);
  const metaLines = ["sessionRef", "threadId", "activeTurnId", "configFile"].map((key) => safeText(agent[key]) ? `${key}=${safeText(agent[key])}` : "").filter(Boolean);
  return `
    <article class="overview-agent-card ${agent.active ? "active" : ""}">
      <div class="overview-agent-head">
        <div>
          <strong>${esc(safeText(agent.name, "不明"))}</strong>
          <p>${esc(safeText(agent.description || agent.role || "設定済みロール"))}</p>
        </div>
        ${tagHtml(agent.role || "child", agent.role === "parent" ? "info" : "neutral")}
      </div>
      <div class="overview-inline-tags">${tags.map((tag) => tagHtml(tag.label, tag.tone)).join("")}</div>
      ${scopeLines.length ? `<div class="overview-mono-list">${scopeLines.map((line) => `<span>${esc(line)}</span>`).join("")}</div>` : ""}
      ${toArr(agent.skills).length ? `<div class="overview-inline-tags">${toArr(agent.skills).map((skill) => tagHtml(skill, "info")).join("")}</div>` : ""}
      ${metaLines.length ? `<div class="overview-mono-list">${metaLines.map((line) => `<span>${esc(line)}</span>`).join("")}</div>` : ""}
    </article>
  `;
}
function renderHero(payload) {
  const runtime = payload && payload.runtime ? payload.runtime : {};
  const health = payload && payload.health ? payload.health : {};
  const topology = payload && payload.topology ? payload.topology : {};
  const signoff = payload && payload.evidence && payload.evidence.signoff ? payload.evidence.signoff.latest : null;
  const runtimeProof = payload && payload.evidence && payload.evidence.runtimeProof ? payload.evidence.runtimeProof.latest : null;
  if (elements.heroText) {
    elements.heroText.textContent = [
      `現在の runtime agent は ${activeAgent(runtime)} です。`,
      `既定の exec agent は ${defaultExecAgent(runtime)} です。`,
      `guard mode は ${safeText(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode, "off")} です。`,
      `${fmtInt(num(topology.summary && topology.summary.total, 0))} 件の可視トポロジーを、親・専門・検証・退役アーティファクトに分けて表示しています。`,
      signoff && signoff.assertions && signoff.assertions.allPassed ? "最新 signoff バンドルは適合です。" : "最新 signoff バンドルはまだ全通過ではありません。",
      runtimeProof && runtimeProof.liveExec ? `最新 runtime 証跡の dispatch 成功数は ${fmtInt(num(runtimeProof.liveExec.dispatchSuccessCount, 0))} 件です。` : "runtime 証跡バンドルはまだありません。",
      `SLO status は ${safeText(health.slo && health.slo.status, "insufficient_data")} です。`,
    ].join(" ");
  }
  if (elements.heroPills) {
    elements.heroPills.innerHTML = [
      tagHtml(`full-utilization ${runtime.fullUtilization && runtime.fullUtilization.ready ? "ready" : "not-ready"}`, runtime.fullUtilization && runtime.fullUtilization.ready ? "ready" : "warn"),
      tagHtml(`ユーザー入力 ${safeText(runtime.nonInteractiveUserInput && runtime.nonInteractiveUserInput.policy, "不明")}`, tone(runtime.nonInteractiveUserInput && runtime.nonInteractiveUserInput.policy)),
      tagHtml(`親ガード ${safeText(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode, "off")}`, tone(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode)),
      tagHtml(`signoff ${signoff && signoff.assertions && signoff.assertions.allPassed ? "適合" : "保留"}`, signoff && signoff.assertions && signoff.assertions.allPassed ? "pass" : "warn"),
      tagHtml(`runtime-proof ${runtimeProof ? "present" : "missing"}`, runtimeProof ? "info" : "warn"),
      tagHtml(`slo ${safeText(health.slo && health.slo.status, "insufficient_data")}`, tone(health.slo && health.slo.status)),
    ].join("");
  }
}
function renderMetrics(payload) {
  const runtime = payload && payload.runtime ? payload.runtime : {};
  const topology = payload && payload.topology ? payload.topology : {};
  const evidence = payload && payload.evidence ? payload.evidence : {};
  const signoff = evidence.signoff && evidence.signoff.latest ? evidence.signoff.latest : null;
  const runtimeProof = evidence.runtimeProof && evidence.runtimeProof.latest ? evidence.runtimeProof.latest : null;
  const latestRun = payload && payload.eval && toArr(payload.eval.recentRuns)[0] ? toArr(payload.eval.recentRuns)[0] : null;
  const cards = [
    { label: "稼働中エージェント", value: activeAgent(runtime), detail: `default exec ${defaultExecAgent(runtime)} / セッション ${safeText(runtime.sessionRef, "なし")} / プロファイル ${safeText(runtime.executionProfile, "不明")}`, tags: [{ label: `agent 数 ${fmtInt(num(runtime.agentCount, 0))}`, tone: "info" }] },
    { label: "全体稼働", value: runtime.fullUtilization && runtime.fullUtilization.ready ? "準備完了" : "要確認", detail: `ユーザー入力 ${safeText(runtime.nonInteractiveUserInput && runtime.nonInteractiveUserInput.policy, "不明")} / シャドウ ${runtime.adversarialShadow && runtime.adversarialShadow.enabled ? "有効" : "無効"}`, tags: [{ label: safeText(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode, "off"), tone: tone(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode) }] },
    { label: "トポロジー行数", value: fmtInt(num(topology.summary && topology.summary.total, 0)), detail: `${fmtInt(num(topology.summary && topology.summary.parents, 0))} 親 / ${fmtInt(num(topology.summary && topology.summary.specialists, 0))} 専門 / ${fmtInt(num(topology.summary && topology.summary.verification, 0))} 検証`, tags: [{ label: `${fmtInt(num(topology.summary && topology.summary.active, 0))} 稼働中`, tone: "info" }] },
    { label: "最新評価", value: latestRun ? `${fmtInt(num(latestRun.passedCases, 0))}/${fmtInt(num(latestRun.sampleSize, 0))}` : "--", detail: latestRun ? `${safeText(latestRun.suiteId, "suite")} / スコア ${fmtPct(latestRun.scoreRate)}` : "評価履歴はまだありません。", tags: [{ label: latestRun ? safeText(latestRun.variantLabel, "variant") : "履歴", tone: "neutral" }] },
    { label: "runtime 証跡", value: runtimeProof ? fmtInt(num(runtimeProof.liveExec && runtimeProof.liveExec.dispatchSuccessCount, 0)) : "--", detail: runtimeProof ? `dispatch 成功数 / ${safeText(runtimeProof.runtime && runtimeProof.runtime.parentDispatchGuardMode, "off")}` : "proof バンドルはありません。", tags: [{ label: runtimeProof ? safeText(runtimeProof.name, "proof") : "未取得", tone: runtimeProof ? "info" : "warn" }] },
    { label: "最新 signoff", value: signoff && signoff.assertions && signoff.assertions.allPassed ? "適合" : "保留", detail: signoff ? `${fmtInt(num(signoff.coreHarnessWorkflow && signoff.coreHarnessWorkflow.passedCases, 0))}/${fmtInt(num(signoff.coreHarnessWorkflow && signoff.coreHarnessWorkflow.sampleSize, 0))} suite 通過` : "signoff バンドルはありません。", tags: [{ label: signoff ? safeText(signoff.name, "signoff") : "未取得", tone: signoff ? "pass" : "warn" }] },
  ];
  if (elements.metrics) elements.metrics.innerHTML = cards.map(metricCardHtml).join("");
}
function renderRuntime(payload) {
  const runtime = payload && payload.runtime ? payload.runtime : {};
  const health = payload && payload.health ? payload.health : {};
  const intent = intentState(runtime);
  if (elements.runtimePostureCard) {
    elements.runtimePostureCard.innerHTML = factRowsHtml([
      { label: "Execution Profile", value: safeText(runtime.executionProfile, "unknown"), detail: `active agent ${activeAgent(runtime)} / default exec ${defaultExecAgent(runtime)}` },
      { label: "Request User Input", value: safeText(runtime.nonInteractiveUserInput && runtime.nonInteractiveUserInput.policy, "unknown"), detail: safeText(runtime.nonInteractiveUserInput && runtime.nonInteractiveUserInput.envKey, "") },
      { label: "Parent Dispatch Guard", value: safeText(runtime.parentDispatchGuard && runtime.parentDispatchGuard.mode, "off"), detail: `maxRetries ${fmtInt(num(runtime.parentDispatchGuard && runtime.parentDispatchGuard.maxRetries, 0))}` },
      { label: "Planning Contract", value: safeText(runtime.planningContracts && runtime.planningContracts.schema, "planning-mode-contract.v1"), detail: `${safeText(runtime.planningContracts && runtime.planningContracts.path, "")} / ${safeText(runtime.planningContracts && runtime.planningContracts.assurancePath, "")}` },
      { label: "Assurance Contract", value: safeText(runtime.planningContracts && runtime.planningContracts.assuranceSchema, "assurance-mode-contract.v1"), detail: safeText(runtime.planningContracts && runtime.planningContracts.assurancePath, "") },
      { label: "Intent Mode", value: safeText(intent && intent.mode, "standard"), detail: safeText(intent && intent.contract && intent.contract.path, "") },
      { label: "Conversation API", value: safeText(runtime.conversationApi && runtime.conversationApi.endpoint, "POST /api/conversation/direct"), detail: `${safeText(runtime.conversationApi && runtime.conversationApi.provider, "app-server")} / ${safeText(runtime.conversationApi && runtime.conversationApi.model, "")}` },
      { label: "Evidence Artifacts", value: safeText(runtime.evidenceArtifacts && runtime.evidenceArtifacts.root, "logs/turns"), detail: `maxDays ${fmtInt(num(runtime.evidenceArtifacts && runtime.evidenceArtifacts.maxDays, 0))}` },
    ]);
  }
  if (elements.guardrailCard) {
    elements.guardrailCard.innerHTML = factRowsHtml([
      { label: "Full Utilization", value: runtime.fullUtilization && runtime.fullUtilization.ready ? "ready" : "not-ready", detail: `default-agent ${num(runtime.fullUtilization && runtime.fullUtilization.checks && runtime.fullUtilization.checks.defaultExecAgentIsDefault, 0) ? "ok" : "check"}` },
      { label: "Requirement Guard", value: runtime.requirementGuard && runtime.requirementGuard.enabled ? "enabled" : "disabled", detail: `rbj ${runtime.requirementGuard && runtime.requirementGuard.rbj && runtime.requirementGuard.rbj.enabled ? "enabled" : "disabled"} / planning ${safeText(runtime.requirementGuard && runtime.requirementGuard.planningMode && runtime.requirementGuard.planningMode.version, "unreported")} / assurance ${safeText(runtime.requirementGuard && runtime.requirementGuard.planningMode && runtime.requirementGuard.planningMode.assuranceVersion, "unreported")}` },
      { label: "Taste Memory", value: safeText(intent && intent.tasteMemory && intent.tasteMemory.activeProfile && intent.tasteMemory.activeProfile.label, "unset"), detail: safeText(intent && intent.tasteMemory && intent.tasteMemory.storage, "") },
      { label: "Adversarial Shadow", value: runtime.adversarialShadow && runtime.adversarialShadow.enabled ? "enabled" : "disabled", detail: `loop retries ${fmtInt(num(runtime.adversarialShadow && runtime.adversarialShadow.loop && runtime.adversarialShadow.loop.maxRetries, 0))}` },
      { label: "Idempotency", value: safeText(runtime.idempotency && runtime.idempotency.statusApi && runtime.idempotency.statusApi.path, "/api/exec/idempotency/:key"), detail: `ttl ${fmtInt(num(runtime.idempotency && runtime.idempotency.ttlMs, 0))}ms` },
      { label: "Runtime Memory", value: safeText(runtime.harnessMemory && runtime.harnessMemory.storage, "logs/harness_execution_memory.json"), detail: `retention ${fmtInt(num(runtime.harnessMemory && runtime.harnessMemory.retentionDays, 0))} days` },
    ]);
  }
  if (elements.healthCard) {
    elements.healthCard.innerHTML = factRowsHtml([
      { label: "SLO Status", value: safeText(health.slo && health.slo.status, "insufficient_data"), detail: `${fmtInt(num(health.slo && health.slo.sampleSize, 0))} turns in window` },
      { label: "Failure Rate", value: fmtPct(health.slo && health.slo.metrics && health.slo.metrics.failureRate), detail: `p95 ${fmtInt(num(health.slo && health.slo.metrics && health.slo.metrics.p95LatencyMs, 0))}ms` },
      { label: "Latest Turn", value: safeText(health.latestTurn && health.latestTurn.turn_id, "none"), detail: `${safeText(health.latestTurn && health.latestTurn.status, "idle")} / ${safeText(health.latestTurn && health.latestTurn.task_outcome_status, "n/a")} / ${safeText(health.latestTurn && health.latestTurn.planning_depth, "planning: n/a")} / ${safeText(health.latestTurn && health.latestTurn.assurance_depth, "assurance: n/a")}` },
      { label: "Latest Turn Agent", value: safeText(health.latestTurn && health.latestTurn.agent_name, "none"), detail: safeText(health.latestTurn && health.latestTurn.execution_profile, "") },
      { label: "Updated", value: fmtDateTime(payload.generatedAt), detail: `snapshot ${fmtTime(payload.generatedAt)}` },
    ]);
  }
}
function renderTopology(payload) {
  const topology = payload && payload.topology ? payload.topology : {};
  const summary = topology.summary || {};
  if (elements.topologySummary) {
    elements.topologySummary.innerHTML = [
      tagHtml(`${fmtInt(num(summary.total, 0))} 行`, "info"),
      tagHtml(`${fmtInt(num(summary.parents, 0))} 親`, "neutral"),
      tagHtml(`${fmtInt(num(summary.specialists, 0))} 専門`, "pass"),
      tagHtml(`${fmtInt(num(summary.verification, 0))} 検証`, "warn"),
      tagHtml(`${fmtInt(num(summary.retired, 0))} 退役`, "fail"),
      tagHtml(`${fmtInt(num(summary.active, 0))} 稼働中`, "info"),
    ].join("");
  }
  if (elements.topologyParentLane) elements.topologyParentLane.innerHTML = toArr(topology.lanes && topology.lanes.parents).length ? toArr(topology.lanes.parents).map(agentCardHtml).join("") : emptyHtml("表示中の親レーンはありません。");
  if (elements.topologySpecialistLane) elements.topologySpecialistLane.innerHTML = toArr(topology.lanes && topology.lanes.specialists).length ? toArr(topology.lanes.specialists).map(agentCardHtml).join("") : emptyHtml("表示中の専門レーンはありません。");
  if (elements.topologyVerificationLane) elements.topologyVerificationLane.innerHTML = toArr(topology.lanes && topology.lanes.verification).length ? toArr(topology.lanes.verification).map(agentCardHtml).join("") : emptyHtml("表示中の検証レーンはありません。");
  if (elements.topologyRetiredLane) elements.topologyRetiredLane.innerHTML = toArr(topology.lanes && topology.lanes.retired).length ? toArr(topology.lanes.retired).map(agentCardHtml).join("") : emptyHtml("表示中の退役レーンはありません。");
}

function renderContracts(payload) {
  const contracts = payload && payload.contracts ? payload.contracts : {};
  const turn = contracts.turn || {};
  const taskOutcome = contracts.taskOutcome || {};
  const governance = contracts.governance || {};
  const designAcceptance = contracts.designAcceptance || {};
  const reasons = toArr(taskOutcome.reasonMapKeys && taskOutcome.reasonMapKeys.length ? taskOutcome.reasonMapKeys : taskOutcome.reasonCodes).slice(0, 6);
  const workerContract = governance.contracts && governance.contracts.worker ? governance.contracts.worker : null;
  if (elements.turnContractCard) {
    elements.turnContractCard.innerHTML = factRowsHtml([
      { label: "Schema", value: safeText(turn.schema, "harness-turn-contract.v1"), detail: safeText(turn.path, "") },
      { label: "Terminal Event", value: safeText(turn.terminalEvent, "turn/completed"), detail: `bridge states ${fmtInt(Object.keys(turn.taskOutcomeBridge && turn.taskOutcomeBridge.allowedByTurnState ? turn.taskOutcomeBridge.allowedByTurnState : {}).length)}` },
    ]);
  }
  if (elements.taskOutcomeCard) {
    elements.taskOutcomeCard.innerHTML = factRowsHtml([
      { label: "ステータス", value: toArr(taskOutcome.statuses).join(", ") || "-", detail: safeText(taskOutcome.path, "") },
      { label: "理由コード", value: `${fmtInt(reasons.length)} 件表示`, detail: reasons.join(", ") || "reason code はありません。" },
      { label: "Intent Contract", value: safeText(designAcceptance.schema, "n/a"), detail: safeText(designAcceptance.path, "") },
    ]);
  }
  if (elements.governanceCard) {
    elements.governanceCard.innerHTML = factRowsHtml([
      { label: "親エージェント", value: toArr(governance.parentAgents).join(", ") || "-", detail: safeText(governance.path, "") },
      { label: "契約数", value: `${fmtInt(Object.keys(governance.contracts || {}).length)} ロール`, detail: workerContract && workerContract.legacyOnly ? "worker は legacyOnly" : "worker は稼働中" },
      { label: "親 override", value: governance.exceptions && governance.exceptions.parentOverride && governance.exceptions.parentOverride.enabled ? "有効" : "無効", detail: `reasonMinLength ${fmtInt(num(governance.exceptions && governance.exceptions.parentOverride && governance.exceptions.parentOverride.reasonMinLength, 0))}` },
    ]);
  }
}
function evidenceCardHtml(title, tags, entries, recentItems, fallbackText) {
  return `
    <div class="overview-list">
      <article class="overview-list-item">
        <strong>${esc(title)}</strong>
        <div class="overview-inline-tags">${toArr(tags).map((tag) => tagHtml(tag.label, tag.tone)).join("")}</div>
        ${factRowsHtml(entries)}
        ${recentItems ? itemListHtml(recentItems, fallbackText) : ""}
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
    detail: `${fmtDateTime(entry.generatedAt)} / ${safeText(entry.summaryPath, "")}`,
  }));
  const runtimeProofRecent = toArr(evidence.runtimeProof && evidence.runtimeProof.recent).slice(1, 4).map((entry) => ({
    title: safeText(entry.name, "proof"),
    detail: `${fmtDateTime(entry.generatedAt)} / ${safeText(entry.summaryPath, "")}`,
  }));
  if (elements.signoffEvidenceCard) {
    elements.signoffEvidenceCard.innerHTML = signoff ? evidenceCardHtml(
      safeText(signoff.name, "signoff"),
      [
        { label: signoff.assertions && signoff.assertions.allPassed ? "適合" : "保留", tone: signoff.assertions && signoff.assertions.allPassed ? "pass" : "warn" },
        { label: safeText(signoff.runtime && signoff.runtime.parentDispatchGuardMode, "off"), tone: tone(signoff.runtime && signoff.runtime.parentDispatchGuardMode) },
      ],
      [
        { label: "生成時刻", value: fmtDateTime(signoff.generatedAt), detail: safeText(signoff.summaryPath, "") },
        { label: "ワークフロー", value: `${fmtInt(num(signoff.coreHarnessWorkflow && signoff.coreHarnessWorkflow.passedCases, 0))}/${fmtInt(num(signoff.coreHarnessWorkflow && signoff.coreHarnessWorkflow.sampleSize, 0))}`, detail: `suite ${safeText(signoff.coreHarnessWorkflow && signoff.coreHarnessWorkflow.suiteId, "core-harness-workflow.v4")}` },
        { label: "自然タスク追跡", value: safeText(signoff.naturalTask && signoff.naturalTask.targetPath, "該当なし"), detail: `レビュー ${signoff.naturalTask && signoff.naturalTask.reviewerObserved ? "確認済み" : "不足"} / 委譲 ${signoff.naturalTask && signoff.naturalTask.dispatchCountObserved ? "確認済み" : "不足"}` },
      ],
      signoffRecent,
      "古い signoff バンドルはありません。",
    ) : emptyHtml(`${safeText(evidence.signoff && evidence.signoff.storageRoot, "logs/signoff-bundles")} 配下に signoff バンドルはありません。`);
  }
  if (elements.runtimeProofCard) {
    elements.runtimeProofCard.innerHTML = runtimeProof ? evidenceCardHtml(
      safeText(runtimeProof.name, "runtime-proof"),
      [
        { label: safeText(runtimeProof.runtime && runtimeProof.runtime.parentDispatchGuardMode, "off"), tone: tone(runtimeProof.runtime && runtimeProof.runtime.parentDispatchGuardMode) },
        { label: `${fmtInt(num(runtimeProof.liveExec && runtimeProof.liveExec.dispatchSuccessCount, 0))} dispatch 成功`, tone: "pass" },
      ],
      [
        { label: "生成時刻", value: fmtDateTime(runtimeProof.generatedAt), detail: safeText(runtimeProof.summaryPath, "") },
        { label: "実行結果", value: safeText(runtimeProof.liveExec && runtimeProof.liveExec.taskOutcomeStatus, runtimeProof.liveExec && runtimeProof.liveExec.status), detail: `変更ファイル ${fmtInt(num(runtimeProof.liveExec && runtimeProof.liveExec.fileChanges, 0))} / 委譲 ${fmtInt(num(runtimeProof.liveExec && runtimeProof.liveExec.dispatchCount, 0))}` },
        { label: "probe 記録", value: fmtInt(num(runtimeProof.probePersistence && runtimeProof.probePersistence.persistedRecords, 0)), detail: safeText(runtimeProof.liveExec && runtimeProof.liveExec.proofFile, "") },
      ],
      runtimeProofRecent,
      "古い proof バンドルはありません。",
    ) : emptyHtml(`${safeText(evidence.runtimeProof && evidence.runtimeProof.storageRoot, "logs/proofs")} 配下に runtime 証跡 bundle はありません。`);
  }
  if (elements.evalRunsCard) {
    elements.evalRunsCard.innerHTML = itemListHtml(toArr(payload && payload.eval && payload.eval.recentRuns).map((entry) => ({
      title: `${safeText(entry.suiteId, "suite")} / ${safeText(entry.variantLabel, "variant")}`,
      tags: [
        { label: `${fmtInt(num(entry.passedCases, 0))}/${fmtInt(num(entry.sampleSize, 0))}`, tone: num(entry.failedCases, 0) === 0 ? "pass" : "warn" },
        { label: `score ${fmtPct(entry.scoreRate)}`, tone: "info" },
      ],
      detail: `${fmtDateTime(entry.generatedAt)} / probes ${fmtInt(num(entry.probePersistedRecords, 0))}`,
    })), "eval 実行はまだ記録されていません。");
  }
  if (elements.apiSurfacesCard) {
    elements.apiSurfacesCard.innerHTML = itemListHtml([
      { title: "ページ", lines: [safeText(payload && payload.pages && payload.pages.console, ""), safeText(payload && payload.pages && payload.pages.overview, "")] },
      { title: "API", lines: Object.values(payload && payload.apis ? payload.apis : {}).map((entry) => safeText(entry)).filter(Boolean) },
      { title: "リプレイ API", detail: safeText(payload && payload.runtime && payload.runtime.execApi && payload.runtime.execApi.replayApi && payload.runtime.execApi.replayApi.listPath, "/api/replay/turns") },
      { title: "評価 API", detail: safeText(payload && payload.runtime && payload.runtime.execApi && payload.runtime.execApi.evalApi && payload.runtime.execApi.evalApi.runPath, "POST /api/eval/run") },
    ], "利用可能な API はありません。");
  }
}
function renderMemory(payload) {
  const memory = payload && payload.memory ? payload.memory : {};
  const taste = memory.taste || {};
  const execution = memory.execution || {};
  const recentTurns = toArr(execution.recent).slice(0, 5).map((entry) => ({
    title: `${safeText(entry.agentName, "agent")} / ${safeText(entry.taskOutcomeStatus || entry.status, "status")}`,
    tags: [
      { label: `dispatch ${fmtInt(num(entry.dispatchSuccessCount, 0))}/${fmtInt(num(entry.dispatchCount, 0))}`, tone: num(entry.parentDispatchGuard && entry.parentDispatchGuard.violation, 0) ? "fail" : "info" },
      { label: `変更ファイル ${fmtInt(num(entry.fileChanges, 0))}`, tone: num(entry.fileChanges, 0) > 0 ? "pass" : "neutral" },
    ],
    detail: `${fmtDateTime(entry.completedAt)} / ${safeText(entry.executionSource, "source")}`,
  }));
  if (elements.executionMemoryCard) {
    elements.executionMemoryCard.innerHTML = `
      <div class="overview-inline-tags">${Object.entries(execution.statusCounts || {}).map(([key, value]) => tagHtml(`${key} ${fmtInt(num(value, 0))}`, tone(key))).join("")}</div>
      <div class="overview-inline-tags">${Object.entries(execution.taskOutcomeCounts || {}).map(([key, value]) => tagHtml(`${key} ${fmtInt(num(value, 0))}`, tone(key))).join("")}</div>
      ${factRowsHtml([
        { label: "サンプル範囲", value: fmtInt(num(execution.sampleSize, 0)), detail: `guard 違反 ${fmtInt(num(execution.guardViolations, 0))}` },
        { label: "実装観測", value: fmtInt(num(execution.implementationObserved, 0)), detail: "file、command、MCP activity を含む turn" },
      ])}
      ${itemListHtml(recentTurns, "実行メモリ記録はまだありません。")}
    `;
  }
  if (elements.replayPatternsCard) {
    elements.replayPatternsCard.innerHTML = `
      ${itemListHtml(toArr(memory.replay && memory.replay.recent).map((entry) => ({
        title: `${safeText(entry.agentName, "agent")} / ${safeText(entry.taskOutcomeStatus || entry.status, "status")}`,
        tags: [
          { label: `リプレイ ${fmtInt(num(entry.replayStats && entry.replayStats.replayCount, 0))}`, tone: "info" },
          { label: `差分 ${fmtPct(entry.replayStats && entry.replayStats.lastReplayDiffRate)}`, tone: "neutral" },
        ],
        detail: `${fmtDateTime(entry.updatedAt)} / ${safeText(entry.executionSource, "replay")}`,
      })).slice(0, 4), "replay 記録はまだありません。")}
      ${itemListHtml(toArr(execution.patterns).map((entry) => ({
        title: safeText(entry.code || entry.signature, "pattern"),
        tags: [
          { label: `${fmtInt(num(entry.count, 0))} hits`, tone: lower(entry.severity) === "high" ? "fail" : lower(entry.severity) === "medium" ? "warn" : "neutral" },
          { label: safeText(entry.severity, "不明"), tone: lower(entry.severity) === "high" ? "fail" : lower(entry.severity) === "medium" ? "warn" : "neutral" },
        ],
        detail: `${safeText(entry.hint, "")} / ${fmtDateTime(entry.lastSeenAt)}`,
      })).slice(0, 4), "再発パターンはまだありません。")}
    `;
  }
  const skillPortfolio = payload && payload.skillPortfolio ? payload.skillPortfolio : {};
  const missingProposals = toArr(skillPortfolio.missingProposals).map((entry) => ({
    title: safeText(entry && entry.id, "proposal"),
    detail: `${safeText(entry && entry.intent, "")} / 担当 ${toArr(entry && entry.ownerRoles).join(", ") || "-"}`,
  }));
  if (elements.skillPortfolioCard) {
    elements.skillPortfolioCard.innerHTML = `
      <div class="overview-inline-tags">
        ${tagHtml(`監査 ${safeText(skillPortfolio.status, "FAIL") === "PASS" ? "適合" : safeText(skillPortfolio.status, "FAIL") === "FAIL" ? "不適合" : safeText(skillPortfolio.status, "不明")}`, safeText(skillPortfolio.status, "FAIL") === "PASS" ? "pass" : "fail")}
        ${tagHtml(`割当 ${fmtInt(toArr(skillPortfolio.assignments).length)}`, "info")}
        ${tagHtml(`イベント ${fmtInt(num(skillPortfolio.outcomeEvents && skillPortfolio.outcomeEvents.count, 0))}`, "neutral")}
      </div>
      ${factRowsHtml([
        { label: "好みプロファイル", value: safeText(taste && taste.activeProfile && taste.activeProfile.label, "該当なし"), detail: safeText(taste && taste.storage, "") },
        { label: "カタログ", value: safeText(skillPortfolio.catalog && skillPortfolio.catalog.version, "不明"), detail: safeText(skillPortfolio.catalog && skillPortfolio.catalog.path, "") },
        { label: "ポリシー", value: safeText(skillPortfolio.policy && skillPortfolio.policy.version, "不明"), detail: safeText(skillPortfolio.policy && skillPortfolio.policy.path, "") },
        { label: "不足提案数", value: fmtInt(missingProposals.length), detail: safeText(skillPortfolio.outcomeEvents && skillPortfolio.outcomeEvents.path, "") },
      ])}
      ${itemListHtml(missingProposals.slice(0, 4), "不足 skill 提案は登録されていません。")}
    `;
  }
  if (elements.roleChecksCard) {
    elements.roleChecksCard.innerHTML = itemListHtml(toArr(skillPortfolio.roleChecks).map((entry) => ({
      title: safeText(entry.role, "role"),
      tags: [
        { label: entry.pass ? "適合" : "要確認", tone: entry.pass ? "pass" : "warn" },
        { label: `${fmtInt(num(entry.assignedCount, 0))}/${fmtInt(num(entry.minSkills, 0))}`, tone: entry.pass ? "info" : "warn" },
      ],
      detail: `不足クラス ${toArr(entry.missingClasses).join("|") || "-"} / 不足スキル ${toArr(entry.missingSkills).join("|") || "-"}`,
    })), "ロール別チェックはありません。");
  }
}
function renderRawSnapshot(payload) {
  if (elements.rawSnapshot) elements.rawSnapshot.textContent = JSON.stringify(payload, null, 2);
}
function renderOverview(payload) {
  renderHero(payload);
  renderMetrics(payload);
  renderRuntime(payload);
  renderTopology(payload);
  renderContracts(payload);
  renderEvidence(payload);
  renderMemory(payload);
  renderRawSnapshot(payload);
  if (elements.generatedAt) elements.generatedAt.textContent = `スナップショット ${fmtTime(payload.generatedAt)}`;
}
async function loadOverview({ manual = false } = {}) {
  const requestId = ++state.requestId;
  setError("");
  setRefreshState(manual ? "更新中" : "読込中", "waiting");
  try {
    const response = await fetch("/api/harness/overview", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (requestId !== state.requestId) return;
    state.payload = payload;
    renderOverview(payload);
    setRefreshState("最新", "connected");
  } catch (error) {
    if (requestId !== state.requestId) return;
    setRefreshState("エラー", "disconnected");
    setError(`overview の更新に失敗しました: ${error && error.message ? error.message : "不明なエラー"}`);
  }
}
function startTicker() {
  stopTicker();
  state.timer = setInterval(() => { loadOverview().catch(() => {}); }, OVERVIEW_REFRESH_MS);
}
function stopTicker() {
  if (!state.timer) return;
  clearInterval(state.timer);
  state.timer = null;
}
function bind() {
  if (elements.refreshBtn) elements.refreshBtn.onclick = () => { loadOverview({ manual: true }).catch(() => {}); };
  window.addEventListener("beforeunload", stopTicker);
}
async function boot() {
  bind();
  await loadOverview({ manual: true });
  startTicker();
}
boot().catch((error) => {
  setRefreshState("エラー", "disconnected");
  setError(`overview の初期化に失敗しました: ${error && error.message ? error.message : "不明なエラー"}`);
});
