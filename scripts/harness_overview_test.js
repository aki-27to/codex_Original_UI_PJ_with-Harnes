#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const vm = require("vm");
const { startInProcessHarnessServer } = require("./lib/in_process_harness_server");

const workspaceRoot = path.resolve(__dirname, "..");
const serverJsPath = path.join(workspaceRoot, "server.js");
const overviewHtmlPath = path.join(workspaceRoot, "web", "01.HarnesUI", "overview.html");
const overviewJsPath = path.join(workspaceRoot, "web", "01.HarnesUI", "overview.js");
const indexHtmlPath = path.join(workspaceRoot, "web", "01.HarnesUI", "index.html");

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertRegex(source, regex, message) {
  assert(regex.test(source), message);
}

function runCheck(name, fn) {
  try {
    const detail = fn();
    console.log(`PASS ${name}${detail ? ` :: ${detail}` : ""}`);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${name} :: ${message}`);
    return { ok: false, error: message };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve());
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createClassList() {
  const set = new Set();
  return {
    add(...tokens) {
      for (const token of tokens) {
        if (token) {
          set.add(String(token));
        }
      }
    },
    remove(...tokens) {
      for (const token of tokens) {
        set.delete(String(token));
      }
    },
    contains(token) {
      return set.has(String(token));
    },
    toString() {
      return Array.from(set).join(" ");
    },
  };
}

function createElementStub() {
  return {
    textContent: "",
    innerHTML: "",
    className: "",
    onclick: null,
    classList: createClassList(),
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeObjects(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      merged[key] = mergeObjects(base[key], value);
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

function assertContains(source, expected, message) {
  assert(String(source || "").includes(expected), `${message} :: missing ${expected}`);
}

function payloadActiveAgent(payload) {
  return String(payload && payload.runtime && payload.runtime.activeAgent ? payload.runtime.activeAgent : "unreported");
}

function payloadDefaultExecAgent(payload) {
  const value = payload
    && payload.runtime
    && payload.runtime.fullUtilization
    && payload.runtime.fullUtilization.actual
    && payload.runtime.fullUtilization.actual.defaultExecAgent;
  return String(value || "unreported");
}

function extractHtmlIds(html) {
  const ids = new Set();
  const regex = /id=\"([^\"]+)\"/g;
  let match = regex.exec(html);
  while (match) {
    ids.add(match[1]);
    match = regex.exec(html);
  }
  return ids;
}

function extractOverviewElementIds(source) {
  const ids = new Set();
  const regex = /by\(\"([^\"]+)\"\)/g;
  let match = regex.exec(source);
  while (match) {
    ids.add(match[1]);
    match = regex.exec(source);
  }
  return Array.from(ids);
}

function createOverviewPayload(overrides = {}) {
  const payload = {
    mode: "harness-overview",
    generatedAt: 0,
    runtime: {
      activeAgent: "default",
      sessionRef: "session-01",
      executionProfile: "full-runtime",
      agentCount: 4,
      fullUtilization: {
        ready: true,
        actual: {
          defaultExecAgent: "default",
          requestUserInputPolicy: "blocked",
          adversarialShadowEnabled: 1,
          adversarialLoopEnabled: 1,
          adversarialLoopMaxRetries: 1,
        },
        checks: {
          defaultExecAgentIsDefault: 1,
        },
      },
      nonInteractiveUserInput: {
        policy: "blocked",
        envKey: "CODEX_REQUEST_USER_INPUT_POLICY",
      },
      parentDispatchGuard: {
        mode: "enforce",
        maxRetries: 1,
      },
      adversarialShadow: {
        enabled: true,
        loop: {
          maxRetries: 1,
        },
      },
      requirementGuard: {
        enabled: true,
        rbj: {
          enabled: true,
        },
        planningMode: {
          version: "planning-mode-contract.v1",
          assuranceVersion: "assurance-mode-contract.v1",
        },
      },
      planningContracts: {
        schema: "planning-mode-contract.v1",
        path: "scripts/config/planning_mode_contract.json",
        assuranceSchema: "assurance-mode-contract.v1",
        assurancePath: "scripts/config/assurance_depth_contract.json",
      },
      conversationApi: {
        endpoint: "POST /api/conversation/direct",
        provider: "app-server",
        model: "gpt-5",
      },
      evidenceArtifacts: {
        root: "logs/turns",
        maxDays: 14,
      },
      idempotency: {
        ttlMs: 86400000,
        statusApi: {
          path: "/api/exec/idempotency/:key",
        },
      },
      harnessMemory: {
        storage: "logs/harness_execution_memory.json",
        retentionDays: 14,
      },
      controlApi: {
        enabled: true,
        token: "",
        tokenRedacted: 1,
      },
      execApi: {
        replayApi: {
          listPath: "/api/replay/turns",
        },
        evalApi: {
          runPath: "POST /api/eval/run",
        },
      },
    },
    health: {
      slo: {
        status: "ready",
        sampleSize: 7,
        metrics: {
          failureRate: 0,
          p95LatencyMs: 1200,
        },
      },
      latestTurn: {
        turn_id: "turn-002",
        status: "completed",
        task_outcome_status: "COMPLETED",
        agent_name: "default",
        execution_profile: "full-runtime",
        planning_mode: "NORMAL",
        planning_depth: "STANDARD_PLANNING",
        assurance_depth: "SIGNOFF_ASSURANCE",
      },
    },
    topology: {
      summary: {
        total: 4,
        parents: 1,
        specialists: 1,
        verification: 1,
        retired: 1,
        active: 2,
      },
      lanes: {
        parents: [
          {
            name: "default",
            description: "Live parent",
            role: "parent",
            status: "ACTIVE",
            source: "runtime",
            active: true,
            sessionRef: "session-01",
            threadId: "thread-01",
            activeTurnId: "turn-002",
            configFile: ".codex/agents/default.toml",
            governance: {
              scopePaths: ["docs/CURRENT_ARCHITECTURE.md"],
            },
            skills: ["requirement-rbj"],
          },
        ],
        specialists: [
          {
            name: "backend_worker",
            description: "Backend specialist",
            role: "child",
            status: "COMPLETED",
            source: "runtime",
            active: true,
            governance: {
              scopePaths: ["server.js"],
            },
            skills: ["api-contract-testgen"],
          },
        ],
        verification: [
          {
            name: "reviewer",
            description: "Read-only review lane",
            role: "child",
            status: "CONFIGURED",
            source: "configured",
            governance: {
              readOnly: true,
            },
          },
        ],
        retired: [
          {
            name: "worker",
            description: "Legacy compatibility lane",
            role: "child",
            status: "CONFIGURED",
            source: "configured",
            governance: {
              legacyOnly: true,
              requiresParentOverride: true,
            },
          },
        ],
      },
    },
    contracts: {
      turn: {
        schema: "harness-turn-contract.v1",
        path: "scripts/config/harness_contract_spec.json",
        terminalEvent: "turn/completed",
        taskOutcomeBridge: {
          allowedByTurnState: {
            failed: ["FAILED_VALIDATION", "BLOCKED", "NEEDS_INPUT"],
          },
        },
      },
      taskOutcome: {
        statuses: ["COMPLETED", "FAILED_VALIDATION", "NEEDS_INPUT"],
        reasonMapKeys: ["parent_dispatch_guard_block", "approval_required"],
        path: "scripts/config/task_outcome_contract.json",
      },
      governance: {
        path: "scripts/config/agent_governance_contracts.json",
        parentAgents: ["default", "intake", "release_manager"],
        contracts: {
          worker: {
            legacyOnly: true,
          },
        },
        exceptions: {
          parentOverride: {
            enabled: true,
            reasonMinLength: 32,
          },
        },
      },
    },
    evidence: {
      signoff: {
        storageRoot: "logs/signoff-bundles",
        latest: {
          name: "signoff-001",
          generatedAt: 1710000000000,
          summaryPath: "logs/signoff-bundles/signoff-001/signoff_summary.json",
          assertions: {
            allPassed: true,
          },
          runtime: {
            parentDispatchGuardMode: "enforce",
          },
          coreHarnessWorkflow: {
            suiteId: "core-harness-workflow.v4",
            passedCases: 13,
            sampleSize: 13,
          },
          naturalTask: {
            targetPath: "docs/CURRENT_ARCHITECTURE.md",
            reviewerObserved: true,
            dispatchCountObserved: true,
          },
        },
        recent: [
          {
            name: "signoff-001",
            generatedAt: 1710000000000,
            summaryPath: "logs/signoff-bundles/signoff-001/signoff_summary.json",
          },
        ],
      },
      runtimeProof: {
        storageRoot: "logs/proofs",
        latest: {
          name: "runtime-proof-001",
          generatedAt: 1710000001000,
          summaryPath: "logs/proofs/runtime-proof-001/runtime_proof_summary.json",
          runtime: {
            parentDispatchGuardMode: "enforce",
          },
          liveExec: {
            dispatchSuccessCount: 1,
            taskOutcomeStatus: "COMPLETED",
            fileChanges: 1,
            dispatchCount: 1,
            proofFile: "live_dispatch_proof.md",
          },
          probePersistence: {
            persistedRecords: 3,
          },
        },
        recent: [
          {
            name: "runtime-proof-001",
            generatedAt: 1710000001000,
            summaryPath: "logs/proofs/runtime-proof-001/runtime_proof_summary.json",
          },
        ],
      },
    },
    eval: {
      recentRuns: [
        {
          suiteId: "core-harness-workflow.v4",
          variantLabel: "default",
          passedCases: 13,
          sampleSize: 13,
          failedCases: 0,
          scoreRate: 1,
          generatedAt: 1710000002000,
          probePersistedRecords: 3,
        },
      ],
    },
    memory: {
      execution: {
        recent: [
          {
            agentName: "default",
            taskOutcomeStatus: "COMPLETED",
            dispatchSuccessCount: 1,
            dispatchCount: 1,
            fileChanges: 1,
            completedAt: 1710000003000,
            executionSource: "live-runtime",
            parentDispatchGuard: {
              violation: 0,
            },
          },
        ],
        statusCounts: {
          completed: 1,
        },
        taskOutcomeCounts: {
          COMPLETED: 1,
        },
        sampleSize: 1,
        guardViolations: 0,
        implementationObserved: 1,
        patterns: [
          {
            code: "unsupported_model_preflight",
            count: 1,
            severity: "medium",
            hint: "preflight catches unsupported models",
            lastSeenAt: 1710000003500,
          },
        ],
      },
      replay: {
        recent: [
          {
            agentName: "default",
            taskOutcomeStatus: "COMPLETED",
            replayStats: {
              replayCount: 1,
              lastReplayDiffRate: 0,
            },
            updatedAt: 1710000004000,
            executionSource: "replay",
          },
        ],
      },
    },
    skillPortfolio: {
      status: "PASS",
      assignments: [{ role: "backend_worker", skill: "api-contract-testgen" }],
      catalog: { version: "2026.03", path: "scripts/config/skill_catalog.json" },
      policy: { version: "2026.03", path: "scripts/config/skill_portfolio_policy.json" },
      outcomeEvents: { path: "logs/skill-outcome-events.jsonl", count: 1 },
      missingProposals: [],
      roleChecks: [
        {
          role: "backend_worker",
          pass: true,
          assignedCount: 1,
          minSkills: 1,
          missingClasses: [],
          missingSkills: [],
        },
      ],
    },
    pages: {
      console: "/01.HarnesUI/index.html",
      overview: "/01.HarnesUI/overview.html",
    },
    apis: {
      runtime: "/api/runtime",
      overview: "/api/harness/overview",
      evalRun: "POST /api/eval/run",
    },
  };
  return mergeObjects(payload, overrides);
}

async function createOverviewVmHarness(bootstrapPayload, { htmlSource = "", scriptSource = "" } = {}) {
  const overviewJs = scriptSource || readFile(overviewJsPath);
  const overviewHtml = htmlSource || readFile(overviewHtmlPath);
  const htmlIds = extractHtmlIds(overviewHtml);
  const ids = extractOverviewElementIds(overviewJs);
  assert(ids.length > 0, "overview.js must declare required DOM ids");
  for (const id of ids) {
    assert(htmlIds.has(id), `overview.html must declare id="${id}"`);
  }
  const elements = {};
  for (const id of ids) {
    elements[id] = createElementStub();
  }
  elements.overviewErrorBanner.classList.add("hidden");
  const requests = [
    async () => ({
      ok: true,
      status: 200,
      json: async () => bootstrapPayload,
    }),
  ];
  const context = {
    console,
    Date,
    Intl,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Error,
    Promise,
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
    },
    window: {
      addEventListener() {},
    },
    setInterval() {
      return 1;
    },
    clearInterval() {},
    fetch() {
      if (!requests.length) {
        return Promise.reject(new Error("unexpected fetch"));
      }
      const next = requests.shift();
      return Promise.resolve().then(() => next());
    },
  };
  vm.runInNewContext(`${overviewJs}\n;globalThis.__overviewTestHooks = { loadOverview, renderOverview, state, elements };`, context, {
    filename: overviewJsPath,
  });
  await flushMicrotasks();
  await flushMicrotasks();
  const hooks = context.__overviewTestHooks;
  assert(hooks && typeof hooks.loadOverview === "function", "overview test hooks missing");
  return { elements, hooks, requests };
}

function assertRenderedOverviewMatchesPayload(payload, elements) {
  assert(payload && payload.runtime && payload.runtime.activeAgent, "payload must expose runtime.activeAgent");
  assert(
    payload
      && payload.runtime
      && payload.runtime.fullUtilization
      && payload.runtime.fullUtilization.actual
      && payload.runtime.fullUtilization.actual.defaultExecAgent,
    "payload must expose runtime.fullUtilization.actual.defaultExecAgent"
  );
  assertContains(elements.overviewHeroText.textContent, `Active runtime agent is ${payloadActiveAgent(payload)}.`, "hero must render the active runtime agent");
  assertContains(elements.overviewHeroText.textContent, `Default exec agent is ${payloadDefaultExecAgent(payload)}.`, "hero must render the default exec agent");
  assertContains(elements.runtimePostureCard.innerHTML, `active agent ${payloadActiveAgent(payload)} / default exec ${payloadDefaultExecAgent(payload)}`, "runtime posture must render active/default agent detail");
  const specialists = payload && payload.topology && payload.topology.lanes && Array.isArray(payload.topology.lanes.specialists)
    ? payload.topology.lanes.specialists
    : [];
  if (specialists.length) {
    assertContains(elements.topologySpecialistLane.innerHTML, String(specialists[0].name || "backend_worker"), "topology lane must render the first specialist lane");
  }
  const reasonMapKeys = payload && payload.contracts && payload.contracts.taskOutcome && Array.isArray(payload.contracts.taskOutcome.reasonMapKeys)
    ? payload.contracts.taskOutcome.reasonMapKeys
    : [];
  if (reasonMapKeys.length) {
    assertContains(elements.taskOutcomeCard.innerHTML, String(reasonMapKeys[0]), "task outcome card must render reasonMapKeys");
  }
  const recentExecution = payload && payload.memory && payload.memory.execution && Array.isArray(payload.memory.execution.recent)
    ? payload.memory.execution.recent
    : [];
  if (recentExecution.length) {
    const entry = recentExecution[0];
    assertContains(
      elements.executionMemoryCard.innerHTML,
      `dispatch ${Number(entry.dispatchSuccessCount || 0)}/${Number(entry.dispatchCount || 0)}`,
      "execution memory must render recent dispatch summary"
    );
  }
  const workflowSuiteId = payload
    && payload.evidence
    && payload.evidence.signoff
    && payload.evidence.signoff.latest
    && payload.evidence.signoff.latest.coreHarnessWorkflow
    && payload.evidence.signoff.latest.coreHarnessWorkflow.suiteId;
  if (workflowSuiteId) {
    assertContains(elements.signoffEvidenceCard.innerHTML, String(workflowSuiteId), "signoff evidence must render workflow contract");
  }
}

async function runClientRefreshRaceCheck() {
  const bootstrapPayload = createOverviewPayload({ generatedAt: 1 });
  const { elements, hooks, requests } = await createOverviewVmHarness(bootstrapPayload);

  const successPayload = createOverviewPayload({
    generatedAt: 2,
    runtime: {
      activeAgent: "default chat-natural-42",
      sessionRef: "session-natural-42",
    },
  });
  const staleSuccessPayload = createOverviewPayload({
    generatedAt: 3,
    runtime: {
      activeAgent: "default stale-parent",
      sessionRef: "session-stale-99",
    },
    topology: {
      lanes: {
        specialists: [
          {
            name: "infra_worker",
            description: "Infra specialist",
            role: "child",
            status: "ACTIVE",
            source: "runtime",
            active: true,
            governance: {
              scopePaths: ["start_codex_ui.bat"],
            },
            skills: ["windows-runtime-ops"],
          },
        ],
      },
    },
  });

  const staleFailure = deferred();
  const freshSuccess = deferred();
  requests.push(() => staleFailure.promise);
  requests.push(() => freshSuccess.promise);

  const stalePromise = hooks.loadOverview();
  const freshPromise = hooks.loadOverview();
  freshSuccess.resolve({
    ok: true,
    status: 200,
    json: async () => successPayload,
  });
  await freshPromise;
  await flushMicrotasks();
  assert.strictEqual(elements.overviewRefreshState.textContent, "Live", "fresh success should set refresh state to Live");
  assert.strictEqual(elements.overviewErrorBanner.classList.contains("hidden"), true, "fresh success should keep error banner hidden");
  assert.strictEqual(Number(hooks.state.payload && hooks.state.payload.generatedAt), 2, "fresh success payload should be retained");
  assertRenderedOverviewMatchesPayload(successPayload, elements);
  assertContains(elements.runtimePostureCard.innerHTML, "POST /api/conversation/direct", "runtime posture must render conversation API");

  staleFailure.reject(new Error("stale failure"));
  await stalePromise;
  await flushMicrotasks();
  assert.strictEqual(elements.overviewRefreshState.textContent, "Live", "stale failure must not overwrite newer successful refresh state");
  assert.strictEqual(elements.overviewErrorBanner.classList.contains("hidden"), true, "stale failure must not surface an error banner");
  assert.strictEqual(Number(hooks.state.payload && hooks.state.payload.generatedAt), 2, "stale failure must not replace the latest payload");
  assertContains(elements.topologySpecialistLane.innerHTML, "backend_worker", "stale failure must not disturb rendered specialist lane");

  const staleSuccess = deferred();
  const latestFailure = deferred();
  requests.push(() => staleSuccess.promise);
  requests.push(() => latestFailure.promise);

  const staleSuccessPromise = hooks.loadOverview();
  const latestFailurePromise = hooks.loadOverview();
  latestFailure.reject(new Error("latest failure"));
  await latestFailurePromise;
  await flushMicrotasks();
  assert.strictEqual(elements.overviewRefreshState.textContent, "Error", "latest failure must surface disconnected state");
  assert.strictEqual(elements.overviewErrorBanner.classList.contains("hidden"), false, "latest failure must show an error banner");
  assertContains(elements.overviewErrorBanner.textContent, "latest failure", "latest failure banner must include the failure reason");
  assert.strictEqual(Number(hooks.state.payload && hooks.state.payload.generatedAt), 2, "latest failure must preserve the previous successful payload");

  staleSuccess.resolve({
    ok: true,
    status: 200,
    json: async () => staleSuccessPayload,
  });
  await staleSuccessPromise;
  await flushMicrotasks();
  assert.strictEqual(elements.overviewRefreshState.textContent, "Error", "stale success must not clear a newer failure state");
  assert.strictEqual(elements.overviewErrorBanner.classList.contains("hidden"), false, "stale success must not hide the latest error banner");
  assertContains(elements.overviewHeroText.textContent, `Active runtime agent is ${payloadActiveAgent(successPayload)}.`, "stale success must not replace the rendered hero payload");
  assertContains(elements.topologySpecialistLane.innerHTML, "backend_worker", "stale success must not replace the rendered specialist lane");
  assert.strictEqual(String(elements.topologySpecialistLane.innerHTML).includes("infra_worker"), false, "stale success must not render a stale specialist lane");
  assert.strictEqual(Number(hooks.state.payload && hooks.state.payload.generatedAt), 2, "stale success must not replace the latest retained payload");
  return `requestId=${hooks.state.requestId}`;
}

function pickPort() {
  return 58700 + Math.floor(Math.random() * 500);
}

function httpRequest(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method: "GET",
        timeout: 3000,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk.toString("utf8");
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode || 0, raw });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error(`timeout ${pathname}`));
    });
    req.end();
  });
}

async function waitForServerReady(port, timeoutMs = 20000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await httpRequest(port, "/api/runtime");
      if (response.statusCode === 200) {
        return;
      }
      lastError = new Error(`runtime status=${response.statusCode}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(lastError ? lastError.message : "server not ready");
}

async function stopServer(child) {
  if (!child) {
    return;
  }
  if (typeof child.stop === "function") {
    await child.stop();
    return;
  }
  try {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(2500),
    ]);
  } catch {
    // ignore
  }
}

async function runIntegrationCheck() {
  const port = pickPort();
  const child = await startInProcessHarnessServer({
    CODEX_UI_PORT: String(port),
    CODEX_AUTO_OPEN_BROWSER: "0",
    CODEX_PAUSE_ON_EXIT: "0",
    CODEX_APP_SERVER_TRANSPORT: "mock-fixture",
  });

  try {
    await waitForServerReady(port);
    const overviewRes = await httpRequest(port, "/api/harness/overview");
    assert.strictEqual(overviewRes.statusCode, 200, "GET /api/harness/overview must return 200");
    const overviewJson = JSON.parse(overviewRes.raw);
    assert(overviewJson && typeof overviewJson === "object", "overview payload must be an object");
    assert.strictEqual(overviewJson.mode, "harness-overview", "overview mode mismatch");
    assert(overviewJson.runtime && typeof overviewJson.runtime === "object", "overview runtime missing");
    assert(overviewJson.runtime.activeAgent, "overview runtime must expose activeAgent");
    assert(overviewJson.topology && typeof overviewJson.topology === "object", "overview topology missing");
    assert(overviewJson.contracts && typeof overviewJson.contracts === "object", "overview contracts missing");
    assert(overviewJson.evidence && typeof overviewJson.evidence === "object", "overview evidence missing");
    assert(overviewJson.memory && typeof overviewJson.memory === "object", "overview memory missing");
    assert(overviewJson.skillPortfolio && typeof overviewJson.skillPortfolio === "object", "overview skillPortfolio missing");
    assert.strictEqual(overviewJson.pages && overviewJson.pages.overview, "/01.HarnesUI/overview.html", "overview page path mismatch");
    assert(Array.isArray(overviewJson.eval && overviewJson.eval.recentRuns), "overview recent eval runs must be an array");
    assert(overviewJson.runtime.controlApi && typeof overviewJson.runtime.controlApi === "object", "overview controlApi missing");
    assert.strictEqual(String(overviewJson.runtime.controlApi.token || ""), "", "overview must redact controlApi.token");
    assert.strictEqual(Number(overviewJson.runtime.controlApi.tokenRedacted || 0), 1, "overview must mark controlApi.token as redacted");
    assert(
      overviewJson.runtime
        && overviewJson.runtime.fullUtilization
        && overviewJson.runtime.fullUtilization.actual
        && overviewJson.runtime.fullUtilization.actual.defaultExecAgent,
      "overview runtime must expose fullUtilization.actual.defaultExecAgent"
    );
    assert(Array.isArray(overviewJson.contracts.taskOutcome && overviewJson.contracts.taskOutcome.reasonMapKeys), "overview taskOutcome reasonMapKeys must be an array");
    const signoffLatest = overviewJson.evidence && overviewJson.evidence.signoff && overviewJson.evidence.signoff.latest;
    const signoffRecent = overviewJson.evidence && overviewJson.evidence.signoff && Array.isArray(overviewJson.evidence.signoff.recent)
      ? overviewJson.evidence.signoff.recent
      : [];
    if (signoffLatest && signoffRecent.length > 1) {
      const latestTs = Number(signoffLatest.generatedAt || 0);
      const nextTs = Number(signoffRecent[1].generatedAt || 0);
      assert(latestTs >= nextTs, "signoff latest bundle is not ordered by generatedAt");
    }
    const runtimeProofLatest = overviewJson.evidence && overviewJson.evidence.runtimeProof && overviewJson.evidence.runtimeProof.latest;
    const runtimeProofRecent = overviewJson.evidence && overviewJson.evidence.runtimeProof && Array.isArray(overviewJson.evidence.runtimeProof.recent)
      ? overviewJson.evidence.runtimeProof.recent
      : [];
    if (runtimeProofLatest && runtimeProofRecent.length > 1) {
      const latestTs = Number(runtimeProofLatest.generatedAt || 0);
      const nextTs = Number(runtimeProofRecent[1].generatedAt || 0);
      assert(latestTs >= nextTs, "runtime proof latest bundle is not ordered by generatedAt");
    }

    const htmlRes = await httpRequest(port, "/01.HarnesUI/overview.html");
    assert.strictEqual(htmlRes.statusCode, 200, "GET /01.HarnesUI/overview.html must return 200");
    assert(htmlRes.raw.includes("Harness Overview"), "served overview html should include title text");
    assert(htmlRes.raw.includes("./overview.js"), "served overview html must reference ./overview.js");
    const overviewJsRes = await httpRequest(port, "/01.HarnesUI/overview.js");
    assert.strictEqual(overviewJsRes.statusCode, 200, "GET /01.HarnesUI/overview.js must return 200");
    const vmHarness = await createOverviewVmHarness(overviewJson, {
      htmlSource: htmlRes.raw,
      scriptSource: overviewJsRes.raw,
    });
    assertRenderedOverviewMatchesPayload(overviewJson, vmHarness.elements);
    const scopedPayload = mergeObjects(overviewJson, {
      runtime: {
        activeAgent: "worker-scoped-proof",
      },
    });
    const scopedHarness = await createOverviewVmHarness(scopedPayload, {
      htmlSource: htmlRes.raw,
      scriptSource: overviewJsRes.raw,
    });
    assertRenderedOverviewMatchesPayload(scopedPayload, scopedHarness.elements);
    assertContains(scopedHarness.elements.overviewHeroText.textContent, "Active runtime agent is worker-scoped-proof.", "served renderer must keep active runtime agent distinct in scoped proof");
    assertContains(
      scopedHarness.elements.overviewHeroText.textContent,
      `Default exec agent is ${payloadDefaultExecAgent(scopedPayload)}.`,
      "served renderer must keep default exec agent distinct in scoped proof"
    );
    const missingActivePayload = mergeObjects(overviewJson, {
      runtime: {
        activeAgent: "",
      },
    });
    const missingActiveHarness = await createOverviewVmHarness(missingActivePayload, {
      htmlSource: htmlRes.raw,
      scriptSource: overviewJsRes.raw,
    });
    assertContains(missingActiveHarness.elements.overviewHeroText.textContent, "Active runtime agent is unreported.", "missing active agent must not fall back to default");
    assertContains(
      missingActiveHarness.elements.overviewHeroText.textContent,
      `Default exec agent is ${payloadDefaultExecAgent(overviewJson)}.`,
      "missing active agent must preserve the reported default exec agent"
    );
    const missingDefaultExecPayload = mergeObjects(overviewJson, {
      runtime: {
        activeAgent: "worker-proof-missing-default",
        fullUtilization: {
          actual: {
            defaultExecAgent: "",
          },
        },
      },
    });
    const missingDefaultExecHarness = await createOverviewVmHarness(missingDefaultExecPayload, {
      htmlSource: htmlRes.raw,
      scriptSource: overviewJsRes.raw,
    });
    assertContains(missingDefaultExecHarness.elements.overviewHeroText.textContent, "Default exec agent is unreported.", "missing default exec agent must not fall back to activeAgent");
    assert.strictEqual(
      String(missingDefaultExecHarness.elements.overviewHeroText.textContent).includes("Default exec agent is worker-proof-missing-default."),
      false,
      "missing default exec agent must never alias the active runtime agent"
    );
    return `port=${port}`;
  } finally {
    await stopServer(child);
  }
}

async function main() {
  const serverJs = readFile(serverJsPath);
  const overviewHtml = readFile(overviewHtmlPath);
  const overviewJs = readFile(overviewJsPath);
  const indexHtml = readFile(indexHtmlPath);
  const checks = [];

  checks.push(
    runCheck("main UI exposes Overview navigation", () => {
      assertRegex(indexHtml, /href=\"\.\/overview\.html\"/, "index.html does not link to overview.html");
    })
  );
  checks.push(
    runCheck("overview html declares primary panels", () => {
      assertRegex(overviewHtml, /id=\"overviewMetrics\"/, "overviewMetrics container missing");
      assertRegex(overviewHtml, /id=\"topologyParentLane\"/, "topologyParentLane container missing");
      assertRegex(overviewHtml, /id=\"overviewRawSnapshot\"/, "overviewRawSnapshot container missing");
      assertRegex(overviewHtml, /src=\"\.\/overview\.js\"/, "overview.html must reference ./overview.js");
    })
  );
  checks.push(
    runCheck("overview html covers every overview.js mount id", () => {
      const htmlIds = extractHtmlIds(overviewHtml);
      const requiredIds = extractOverviewElementIds(overviewJs);
      assert(requiredIds.length > 0, "overview.js must declare required DOM ids");
      for (const id of requiredIds) {
        assert(htmlIds.has(id), `overview.html missing required id=${id}`);
      }
      return `ids=${requiredIds.length}`;
    })
  );
  checks.push(
    runCheck("overview js fetches /api/harness/overview and auto-refreshes", () => {
      assertRegex(overviewJs, /fetch\(\"\/api\/harness\/overview\"/, "overview.js does not fetch /api/harness/overview");
      assertRegex(overviewJs, /const OVERVIEW_REFRESH_MS = 20000;/, "overview refresh interval missing");
      assertRegex(overviewJs, /setInterval\(\(\) => \{\s*loadOverview\(\)\.catch\(\(\) => \{\}\);/s, "overview auto-refresh ticker missing");
      assertRegex(overviewJs, /reasonMapKeys/, "overview.js does not read taskOutcome.reasonMapKeys");
    })
  );
  checks.push(
    runCheck("server exposes overview route and builder", () => {
      assertRegex(serverJs, /function buildHarnessOverviewSnapshot\(\)/, "buildHarnessOverviewSnapshot() missing");
      assertRegex(serverJs, /pathname===\"\/api\/harness\/overview\"/, "GET /api/harness/overview route missing");
    })
  );

  try {
    const detail = await runClientRefreshRaceCheck();
    console.log(`PASS overview stale refresh guard :: ${detail}`);
    checks.push({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL overview stale refresh guard :: ${message}`);
    checks.push({ ok: false, error: message });
  }

  try {
    const detail = await runIntegrationCheck();
    console.log(`PASS overview integration :: ${detail}`);
    checks.push({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL overview integration :: ${message}`);
    checks.push({ ok: false, error: message });
  }

  const failed = checks.filter((entry) => !entry.ok);
  if (failed.length) {
    process.exitCode = 1;
    return;
  }
  console.log("PASS");
}

main().catch((error) => {
  console.error(`FAIL fatal :: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
