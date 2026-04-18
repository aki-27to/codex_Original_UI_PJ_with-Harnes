#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const { spawn } = require("child_process");

const workspaceRoot = path.resolve(__dirname, "..");
const serverJsPath = path.join(workspaceRoot, "server.js");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isEnvironmentRestrictionError(message) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("spawn eperm") ||
    text.includes("spawn eacces") ||
    text.includes("permission denied") ||
    text.includes("operation not permitted")
  );
}

function pickTestPort() {
  const base = 58800;
  const span = 600;
  return base + Math.floor(Math.random() * span);
}

async function startServer(port) {
  const child = spawn(process.execPath, [serverJsPath], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      CODEX_UI_PORT: String(port),
      CODEX_AUTO_OPEN_BROWSER: "0",
      CODEX_PAUSE_ON_EXIT: "0",
    },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });

  let stderrBuffer = "";
  child.stderr.on("data", (chunk) => {
    stderrBuffer += chunk.toString("utf8");
    if (stderrBuffer.length > 4000) {
      stderrBuffer = stderrBuffer.slice(-4000);
    }
  });

  return { child, getStderr: () => stderrBuffer };
}

async function stopServer(child) {
  if (!child) return;
  try {
    if (!child.killed) child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", () => resolve())),
      sleep(2500),
    ]);
  } catch {
    // ignore
  }
}

async function waitForRuntime(page, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const ok = await page.evaluate(async () => {
        try {
          const res = await fetch("/api/runtime", { cache: "no-store" });
          return res.ok;
        } catch {
          return false;
        }
      });
      if (ok) return;
    } catch {
      // ignore
    }
    await sleep(250);
  }
  throw new Error("timeout waiting for /api/runtime");
}

async function runIntegration() {
  const { chromium } = require("playwright");
  const port = pickTestPort();
  const { child, getStderr } = await startServer(port);
  let childExit = null;
  let childError = null;
  child.on("error", (error) => {
    childError = error;
  });
  child.on("exit", (code) => {
    childExit = code;
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`http://127.0.0.1:${port}/01.HarnesUI/index.html`, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await waitForRuntime(page);
    await page.evaluate(() => {
      try {
        localStorage.clear();
      } catch {
        // ignore
      }
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
    await waitForRuntime(page);

    const initialMode = await page.$eval("#harnessCheckMode", (el) => el.value);
    assert.strictEqual(initialMode, "adaptive", "default check mode should be adaptive");

    await page.evaluate(() => {
      const el = document.querySelector("#harnessCheckMode");
      if (!el) throw new Error("missing #harnessCheckMode");
      el.value = "relaxed";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(120);
    const storedMode = await page.evaluate(() =>
      localStorage.getItem("codex-harness-check-mode-v2")
    );
    assert.strictEqual(storedMode, "relaxed", "mode should persist to localStorage");

    await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
    await waitForRuntime(page);
    const reloadedMode = await page.$eval("#harnessCheckMode", (el) => el.value);
    assert.strictEqual(reloadedMode, "relaxed", "mode should restore from localStorage");

    const modeComparison = await page.evaluate(() => {
      const c = active();
      c.h = createHarnessState();
      hset(c, "running");
      hpush(c, "dispatch", "case", "running");
      hpush(c, "turn/start", "case", "running");
      hpush(c, "reasoning", "step", "info");

      syncHarnessFlow(c, "strict");
      const strictExecution = c.h.flow.find((phase) => phase.id === "execution").state;
      const strictPlanning = c.h.flow.find((phase) => phase.id === "planning").state;
      const strictVerdict = evaluateHarnessVerdict(c.h, "strict");

      syncHarnessFlow(c, "adaptive");
      const adaptiveExecution = c.h.flow.find((phase) => phase.id === "execution").state;
      const adaptivePlanning = c.h.flow.find((phase) => phase.id === "planning").state;
      const adaptiveVerdict = evaluateHarnessVerdict(c.h, "adaptive");

      syncHarnessFlow(c, "relaxed");
      const relaxedExecution = c.h.flow.find((phase) => phase.id === "execution").state;
      const relaxedPlanning = c.h.flow.find((phase) => phase.id === "planning").state;
      const relaxedVerdict = evaluateHarnessVerdict(c.h, "relaxed");

      const adaptiveLightweightComplete = (() => {
        const cLight = active();
        cLight.h = createHarnessState();
        hset(cLight, "running");
        hpush(cLight, "dispatch", "adaptive-light", "running");
        hpush(cLight, "turn/start", "adaptive-light", "running");
        hpush(cLight, "command execution", "echo lightweight", "info");
        hset(cLight, "completed");
        hpush(cLight, "turn/completed", "completed", "info");
        syncHarnessFlow(cLight, "adaptive");
        const verdict = evaluateHarnessVerdict(cLight.h, "adaptive");
        return {
          execution: cLight.h.flow.find((phase) => phase.id === "execution").state,
          planning: cLight.h.flow.find((phase) => phase.id === "planning").state,
          label: verdict.label,
          detail: verdict.detail,
        };
      })();

      const adaptiveHeavyMissingPlan = (() => {
        const cHeavy = active();
        cHeavy.h = createHarnessState();
        hset(cHeavy, "running");
        hpush(cHeavy, "dispatch", "adaptive-heavy", "running");
        hpush(cHeavy, "turn/start", "adaptive-heavy", "running");
        hpush(cHeavy, "command execution", "run heavy", "info");
        hpush(cHeavy, "file change", "updated web/01.HarnesUI/app.js", "info");
        hset(cHeavy, "completed");
        hpush(cHeavy, "turn/completed", "completed", "info");
        syncHarnessFlow(cHeavy, "adaptive");
        const verdict = evaluateHarnessVerdict(cHeavy.h, "adaptive");
        return {
          execution: cHeavy.h.flow.find((phase) => phase.id === "execution").state,
          planning: cHeavy.h.flow.find((phase) => phase.id === "planning").state,
          label: verdict.label,
          detail: verdict.detail,
        };
      })();

      const overflowPass = (() => {
        const c2 = active();
        c2.h = createHarnessState();
        hset(c2, "running");
        hpush(c2, "dispatch", "case-overflow", "running");
        hpush(c2, "turn/start", "case-overflow", "running");
        hpush(c2, "plan/update", "3 steps", "info");
        hpush(c2, "collab agent tool", "spawn_agent / receivers=1", "info");
        for (let i = 0; i < 120; i += 1) {
          hpush(c2, "reasoning", `noise-${i}`, "info");
        }
        hset(c2, "completed");
        hpush(c2, "turn/completed", "completed", "info");
        syncHarnessFlow(c2, "strict");
        const verdict = evaluateHarnessVerdict(c2.h, "strict");
        return {
          label: verdict.label,
          detail: verdict.detail,
          eventsLen: Array.isArray(c2.h.events) ? c2.h.events.length : 0,
          hasDispatchInBuffer: c2.h.events.some((item) => item && item.l === "dispatch"),
          hasTurnStartInBuffer: c2.h.events.some((item) => item && item.l === "turn/start"),
          hasPlanInBuffer: c2.h.events.some((item) => item && item.l === "plan/update"),
        };
      })();

      const overflowMissingPlan = (() => {
        const c3 = active();
        c3.h = createHarnessState();
        hset(c3, "running");
        hpush(c3, "dispatch", "case-overflow-no-plan", "running");
        hpush(c3, "turn/start", "case-overflow-no-plan", "running");
        for (let i = 0; i < 120; i += 1) {
          hpush(c3, "reasoning", `noise-noplan-${i}`, "info");
        }
        hset(c3, "completed");
        hpush(c3, "turn/completed", "completed", "info");
        syncHarnessFlow(c3, "strict");
        const verdict = evaluateHarnessVerdict(c3.h, "strict");
        return {
          label: verdict.label,
          detail: verdict.detail,
        };
      })();

      return {
        strictExecution,
        strictPlanning,
        strictLabel: strictVerdict.label,
        adaptiveExecution,
        adaptivePlanning,
        adaptiveLabel: adaptiveVerdict.label,
        relaxedExecution,
        relaxedPlanning,
        relaxedLabel: relaxedVerdict.label,
        adaptiveLightweightComplete,
        adaptiveHeavyMissingPlan,
        overflowPass,
        overflowMissingPlan,
      };
    });

    const planUiSnapshot = await page.evaluate(() => {
      const cPlan = active();
      cPlan.h = createHarnessState();
      hset(cPlan, "running");
      cPlan.h.turnSnapshot = {
        planning: {
          requirementContract: {
            acceptanceChecks: [
              { id: "ac-1", title: "Render the Execution Plan purpose in the main UI" },
              { id: "ac-2", title: "Verify browser rendering and documentation sync" },
            ],
            requestCoverage: {
              rawRequestClauses: [
                { id: "req-1", text: "Lock requirement and acceptance checks", kind: "explicit_request", lane: "core" },
                { id: "req-2", text: "Render execution plan panel in the main UI", kind: "explicit_request", lane: "core" },
                { id: "req-3", text: "Verify browser rendering and update docs", kind: "explicit_request", lane: "core" },
              ],
              coreObligations: ["req-1", "req-2", "req-3"],
              mappedRequirements: [
                { clauseId: "req-1", requirementRefs: ["acceptanceChecks"] },
                { clauseId: "req-2", requirementRefs: ["baselineScope"] },
                { clauseId: "req-3", requirementRefs: ["acceptanceChecks"] },
              ],
              parkedItems: [],
              droppedItems: [],
              coverageSummary: {
                totalClauses: 3,
                mappedCount: 3,
                coreTotal: 3,
                coreMapped: 3,
                coreUnmapped: 0,
                parkedCount: 0,
                droppedCount: 0,
              },
            },
          },
        },
      };
      cPlan.h.planExp = "Parent locks the requirement, then exposes each implementation step and current progress.";
      cPlan.h.plan = [
        { step: "Lock requirement and acceptance checks", status: "completed", requestClauseRefs: ["req-1"], requirementRefs: ["acceptanceChecks"] },
        { step: "Render execution plan panel in the main UI", status: "in_progress", requestClauseRefs: ["req-2"], acceptanceCheckRefs: ["ac-1"] },
        { step: "Verify browser rendering and update docs", status: "pending", requestClauseRefs: ["req-3"], acceptanceCheckRefs: ["ac-2"] },
      ];
      hpush(cPlan, "plan/update", "3 steps", "info");
      renderHarness();
      const currentCard = document.querySelector("#harnessPlanCurrentCard");
      const currentLabel = document.querySelector("#harnessPlanCurrentCard .harness-plan-current-label");
      const rows = Array.from(document.querySelectorAll("#harnessPlanList .harness-plan-step"));
      return {
        planMeta: document.querySelector("#harnessPlanMeta")?.textContent || "",
        currentLabel: currentLabel?.textContent || "",
        currentCardClass: currentCard?.className || "",
        currentStep: document.querySelector("#harnessPlanCurrentStep")?.textContent || "",
        currentPurpose: document.querySelector("#harnessPlanCurrentPurpose")?.textContent || "",
        currentDetail: document.querySelector("#harnessPlanCurrentDetail")?.textContent || "",
        currentWork: document.querySelector("#harnessJourneyWork")?.textContent || "",
        explanation: document.querySelector("#harnessPlanExplanation")?.textContent || "",
        renderedStatuses: rows.map((row) => row.querySelector(".harness-plan-step-status")?.textContent || ""),
        renderedSteps: rows.map((row) => row.querySelector(".harness-plan-step-text")?.textContent || ""),
        renderedPurposes: rows.map((row) => row.querySelector(".harness-plan-step-purpose")?.textContent || ""),
        focusedStep: document.querySelector("#harnessPlanList .harness-plan-step.focus .harness-plan-step-text")?.textContent || "",
        focusedStatusClass:
          document.querySelector("#harnessPlanList .harness-plan-step.focus .harness-plan-step-status")?.className || "",
      };
    });

    const blockedRequirementUiSnapshot = await page.evaluate(() => {
      const cBlocked = active();
      cBlocked.h = createHarnessState();
      cBlocked.h.turnSnapshot = {
        planning: {
          requirementContract: {
            explicitGoal: "UIに最終表示するときは",
            implicitGoal: "",
            openQuestions: ["What acceptance checks define success?"],
            acceptanceChecks: [],
            baselineScope: [],
            overDeliveryScope: [],
            nonGoals: ["推測でスコープを広げない"],
            assumptions: [],
            status: "BLOCKED",
            statusReason: "Open questions remain: 1.",
            validation: {
              verdict: "BLOCK",
              summary: { passCount: 1, warnCount: 0, blockCount: 1, total: 2 },
              checks: [{ status: "BLOCK", detail: "Acceptance checks are missing or too weak for reliable completion judgment." }],
            },
            intentInterpretation: {
              presentation: "progress_hypothesis",
              questionLike: true,
              direction: "今の問題は成果物ではなく、ハーネスが「未証明」と「失敗」を同じ赤で潰していることです。",
              hypothesis: "表示上の意味づけを切り分けたい",
            },
            userValueFrame: {
              valueThesis: "未証明と失敗の違いが一目で分かる状態にする",
              userWants: [],
              userShouldFeelGet: [],
              mustAvoid: [],
              hardConstraints: [],
              qualityAxes: ["bounded_scope"],
              completedMeans: [],
            },
            displayContract: {
              headline: "UIに最終表示するときは",
              goal: "UIに最終表示するときは",
              goalMode: "locked",
              goalLabel: "locked_goal",
              nextAction: "Clarify: What acceptance checks define success?",
              holdReason: "Acceptance checks are missing or too weak for reliable completion judgment.",
              targetOutcome: "",
              boundaries: [],
              askNext: [{ question: "What acceptance checks define success?", category: "blocking", reason: "missing_acceptance" }],
              delightTitles: [],
            },
          },
        },
      };
      hset(cBlocked, "running");
      const blockedMeta = ensureHarnessPlanMeta(cBlocked.h);
      blockedMeta.decision = "skip";
      blockedMeta.skipReason = "direct_response_only";
      blockedMeta.source = "policy";
      hpush(cBlocked, "dispatch", "blocked-case", "running");
      hpush(cBlocked, "turn/start", "blocked-case", "running");
      hpush(cBlocked, "plan/update", "PLAN SKIP / FAST_PLANNING", "info");
      hpush(cBlocked, "reasoning", "blocked-case", "info");
      syncHarnessFlow(cBlocked, "adaptive");
      renderHarness();
      const phases = Object.fromEntries(
        Array.from(document.querySelectorAll("#harnessJourneyList .harness-journey-step")).map((node) => [
          node.querySelector("h4")?.textContent || "",
          node.className || "",
        ])
      );
      return {
        requirementStage: cBlocked.h.flow.find((phase) => phase.id === "requirements")?.state || "",
        planningStage: cBlocked.h.flow.find((phase) => phase.id === "planning")?.state || "",
        executionStage: cBlocked.h.flow.find((phase) => phase.id === "execution")?.state || "",
        qualityStage: cBlocked.h.flow.find((phase) => phase.id === "quality")?.state || "",
        reportStage: cBlocked.h.flow.find((phase) => phase.id === "report")?.state || "",
        currentStage: document.querySelector("#harnessJourneyStage")?.textContent || "",
        currentWork: document.querySelector("#harnessJourneyWork")?.textContent || "",
        planningSummary:
          Array.from(document.querySelectorAll("#harnessJourneyList .harness-journey-step"))[1]?.querySelector(".harness-journey-summary")?.textContent || "",
        executionSummary:
          Array.from(document.querySelectorAll("#harnessJourneyList .harness-journey-step"))[2]?.querySelector(".harness-journey-summary")?.textContent || "",
        planMeta: document.querySelector("#harnessPlanMeta")?.textContent || "",
        phaseClasses: phases,
      };
    });

    const completedBlockedUiSnapshot = await page.evaluate(() => {
      const cCompleted = active();
      cCompleted.h = createHarnessState();
      cCompleted.h.turnSnapshot = {
        planning: {
          requirementContract: {
            explicitGoal: "Keep the right panel readable after completion",
            implicitGoal: "",
            openQuestions: ["What acceptance checks define success?"],
            acceptanceChecks: [],
            baselineScope: [],
            overDeliveryScope: [],
            nonGoals: ["Do not widen the panel."],
            assumptions: [],
            status: "BLOCKED",
            statusReason: "Open questions remain: 1.",
            validation: {
              verdict: "BLOCK",
              summary: { passCount: 1, warnCount: 0, blockCount: 1, total: 2 },
              checks: [{ status: "BLOCK", detail: "Acceptance checks are missing or too weak for reliable completion judgment." }],
            },
            userValueFrame: {
              valueThesis: "The panel should reflect the latest visible answer, not a stale requirement hold.",
              userWants: [],
              mustAvoid: [],
              hardConstraints: [],
              qualityAxes: ["bounded_scope"],
              completedMeans: [],
            },
            displayContract: {
              headline: "Keep the right panel readable after completion",
              goal: "Keep the right panel readable after completion",
              goalMode: "locked",
              nextAction: "Clarify: What acceptance checks define success?",
              holdReason: "Acceptance checks are missing or too weak for reliable completion judgment.",
              boundaries: [],
              askNext: [{ question: "What acceptance checks define success?", category: "blocking", reason: "missing_acceptance" }],
            },
          },
        },
      };
      hset(cCompleted, "completed");
      hpush(cCompleted, "dispatch", "completed-blocked-case", "running");
      hpush(cCompleted, "turn/start", "completed-blocked-case", "running");
      hpush(cCompleted, "turn/completed", "completed", "info");
      renderHarness();
      return {
        workflowCurrent: document.querySelector("#harnessWorkflowCurrent")?.textContent || "",
        workflowDetail: document.querySelector("#harnessWorkflowDetail")?.textContent || "",
        currentWork: document.querySelector("#harnessJourneyWork")?.textContent || "",
        complianceBadge: document.querySelector("#harnessComplianceBadge")?.textContent || "",
        complianceDetail: document.querySelector("#harnessComplianceDetail")?.textContent || "",
      };
    });

    const requirementUiSnapshot = await page.evaluate(() => {
      const cReq = active();
      cReq.h = createHarnessState();
      cReq.h.turnSnapshot = {
        planning: {
          selection: {
            taskFamily: "deterministic_code",
          },
          dispatchPlan: {
            dispatches: [
              { ownerAgent: "backend_worker" },
              { ownerAgent: "tester" },
            ],
          },
          requirementContract: {
            explicitGoal: "Show what was locked in Step 1",
            acceptanceChecks: [
              { id: "ac-1", title: "Requirement lock summary is visible in Harness Status." },
              { id: "ac-2", title: "Current Work prefers the active plan step." },
            ],
            nonGoals: ["Generic progress-only cards"],
            assumptions: [],
            status: "LOCKED",
            statusReason: "Ready to proceed.",
            validation: {
              verdict: "PASS",
              summary: { passCount: 3, warnCount: 0, blockCount: 0, total: 3 },
              checks: [{ status: "PASS", detail: "Core contract is ready." }],
            },
            requestCoverage: {
              rawRequestClauses: [
                { id: "req-1", text: "Implement UI", kind: "explicit_request", lane: "core" },
              ],
              coreObligations: ["req-1"],
              mappedRequirements: [
                { clauseId: "req-1", requirementRefs: ["explicitGoal"] },
              ],
              parkedItems: [],
              droppedItems: [],
              coverageSummary: {
                totalClauses: 1,
                mappedCount: 1,
                coreTotal: 1,
                coreMapped: 1,
                coreUnmapped: 0,
                parkedCount: 0,
                droppedCount: 0,
              },
            },
            userValueFrame: {
              mustAvoid: ["Generic progress-only cards"],
              qualityAxes: ["bounded_scope"],
              completedMeans: ["Requirement lock summary is visible in Harness Status."],
            },
            displayContract: {
              headline: "Show what was locked in Step 1",
              goal: "Show what was locked in Step 1",
              goalMode: "locked",
              boundaries: ["Generic progress-only cards"],
              nextAction: "Implement UI",
            },
          },
        },
        family_completion_gate: {
          applies: true,
          status: "pass",
          summary: "family gate pass",
        },
      };
      cReq.h.evidence = { tasksDone: 1, tasksTotal: 2, tests: 1, reviews: 1, logs: 0 };
      cReq.h.planExp = "Keep the current requirement visible while the active step runs.";
      cReq.h.plan = [
        { step: "Implement UI", status: "in_progress", requestClauseRefs: ["req-1"] },
        { step: "Verify docs", status: "pending" },
      ];
      hset(cReq, "running");
      hpush(cReq, "plan/update", "2 steps", "info");
      renderHarness();
      const phaseCards = Array.from(document.querySelectorAll("#harnessJourneyList .harness-journey-step"));
      const requirementRows = Array.from(
        document.querySelectorAll("#harnessRequirementSections .harness-requirement-row")
      ).map((row) => ({
        label: row.querySelector(".harness-requirement-row-label")?.textContent || "",
        text: row.querySelector(".harness-requirement-row-text")?.textContent || "",
      }));
      return {
        requirementMeta: document.querySelector("#harnessRequirementMeta")?.textContent || "",
        requirementHeadline: document.querySelector("#harnessRequirementHeadline")?.textContent || "",
        sectionTitles: Array.from(
          document.querySelectorAll("#harnessRequirementSections .harness-requirement-group h5")
        ).map((el) => el.textContent || ""),
        sectionSummaries: Array.from(
          document.querySelectorAll("#harnessRequirementSections .harness-requirement-summary")
        ).map((el) => el.textContent || ""),
        rowEntries: requirementRows,
        rowTexts: requirementRows.map((entry) => entry.text),
        firstPhaseSummary: phaseCards[0]?.querySelector(".harness-journey-summary")?.textContent || "",
        secondPhaseSummary: phaseCards[1]?.querySelector(".harness-journey-summary")?.textContent || "",
        thirdPhaseSummary: phaseCards[2]?.querySelector(".harness-journey-summary")?.textContent || "",
        fourthPhaseSummary: phaseCards[3]?.querySelector(".harness-journey-summary")?.textContent || "",
        currentWork: document.querySelector("#harnessJourneyWork")?.textContent || "",
      };
    });

    const skipUiSnapshot = await page.evaluate(() => {
      const cSkip = active();
      cSkip.h = createHarnessState();
      cSkip.h.turnSnapshot = {
        planning: {
          requirementContract: {
            explicitGoal: "Reply directly",
            acceptanceChecks: [],
            nonGoals: [],
            assumptions: [],
            status: "LOCKED",
            statusReason: "Ready to proceed.",
            validation: {
              verdict: "PASS",
              summary: { passCount: 1, warnCount: 0, blockCount: 0, total: 1 },
              checks: [{ status: "PASS", detail: "Direct response is allowed." }],
            },
            displayContract: {
              headline: "Reply directly",
              goal: "Reply directly",
              goalMode: "locked",
            },
          },
        },
      };
      cSkip.h.planExp = "Skip the detailed execution plan and answer inline.";
      cSkip.h.plan = [
        { step: "Respond inline without a detailed execution plan", status: "pending" },
      ];
      const skipMeta = ensureHarnessPlanMeta(cSkip.h);
      skipMeta.source = "policy";
      skipMeta.decision = "skip";
      skipMeta.skipReason = "direct_response_only";
      skipMeta.planningDepth = "FAST_PLANNING";
      hset(cSkip, "running");
      hpush(cSkip, "plan/update", "PLAN SKIP / FAST_PLANNING", "info");
      renderHarness();
      const phaseCards = Array.from(document.querySelectorAll("#harnessJourneyList .harness-journey-step"));
      return {
        planMeta: document.querySelector("#harnessPlanMeta")?.textContent || "",
        currentCardClass: document.querySelector("#harnessPlanCurrentCard")?.className || "",
        currentDetail: document.querySelector("#harnessPlanCurrentDetail")?.textContent || "",
        currentWork: document.querySelector("#harnessJourneyWork")?.textContent || "",
        planningCardClass: phaseCards[1]?.className || "",
        planningCardText: phaseCards[1]?.querySelector(".harness-journey-summary")?.textContent || "",
        renderedStatus: document.querySelector("#harnessPlanList .harness-plan-step-status")?.textContent || "",
      };
    });

    assert.strictEqual(
      modeComparison.strictExecution,
      "todo",
      "strict mode should block execution stage without plan/update"
    );
    assert.strictEqual(
      modeComparison.strictPlanning,
      "active",
      "strict mode should keep planning stage active when plan is missing"
    );
    assert.strictEqual(
      modeComparison.strictLabel,
      "WARN",
      "strict running verdict should warn when turn started before plan/update"
    );

    assert.strictEqual(
      modeComparison.adaptiveExecution,
      "active",
      "adaptive mode should allow lightweight inferred plan progression to execution"
    );
    assert.strictEqual(
      modeComparison.adaptivePlanning,
      "done",
      "adaptive mode should complete planning when inferred micro-plan is allowed"
    );
    assert.strictEqual(
      modeComparison.adaptiveLabel,
      "RUNNING",
      "adaptive mode should keep running verdict for in-progress turn"
    );

    assert.strictEqual(
      modeComparison.relaxedExecution,
      "active",
      "relaxed mode should allow inferred execution stage progression"
    );
    assert.strictEqual(
      modeComparison.relaxedPlanning,
      "done",
      "relaxed mode should mark planning done when inferred progression reaches execution"
    );
    assert.strictEqual(
      modeComparison.relaxedLabel,
      "RUNNING",
      "relaxed mode should keep running verdict for in-progress turn"
    );

    assert.strictEqual(
      modeComparison.adaptiveLightweightComplete.execution,
      "done",
      "adaptive lightweight completed turn should finish execution stage"
    );
    assert.strictEqual(
      modeComparison.adaptiveLightweightComplete.planning,
      "done",
      "adaptive lightweight completed turn should finish planning stage"
    );
    assert.strictEqual(
      modeComparison.adaptiveLightweightComplete.label,
      "PASS",
      "adaptive lightweight completed turn should pass with inferred micro-plan"
    );
    assert(
      modeComparison.adaptiveLightweightComplete.detail.includes("推定マイクロプラン"),
      "adaptive lightweight pass should mention inferred micro-plan"
    );

    assert.strictEqual(
      modeComparison.adaptiveHeavyMissingPlan.execution,
      "todo",
      "adaptive heavy turn without plan/update should not enter execution stage"
    );
    assert.strictEqual(
      modeComparison.adaptiveHeavyMissingPlan.planning,
      "failed",
      "adaptive heavy completed turn without plan/update should fail planning stage"
    );
    assert.strictEqual(
      modeComparison.adaptiveHeavyMissingPlan.label,
      "FAIL",
      "adaptive heavy completed turn without plan/update should fail verdict"
    );
    assert(
      modeComparison.adaptiveHeavyMissingPlan.detail.includes("plan/update"),
      "adaptive heavy missing-plan failure should mention plan/update"
    );

    assert.strictEqual(
      modeComparison.overflowPass.eventsLen,
      64,
      "event buffer should be capped to 64"
    );
    assert.strictEqual(
      modeComparison.overflowPass.hasDispatchInBuffer,
      false,
      "dispatch should be dropped from visible event buffer in overflow scenario"
    );
    assert.strictEqual(
      modeComparison.overflowPass.hasTurnStartInBuffer,
      false,
      "turn/start should be dropped from visible event buffer in overflow scenario"
    );
    assert.strictEqual(
      modeComparison.overflowPass.hasPlanInBuffer,
      false,
      "plan/update should be dropped from visible event buffer in overflow scenario"
    );
    assert.strictEqual(
      modeComparison.overflowPass.label,
      "PASS",
      "strict verdict should remain PASS using latched signals even after buffer overflow"
    );

    assert.strictEqual(
      modeComparison.overflowMissingPlan.label,
      "FAIL",
      "strict verdict should fail when plan/update never arrived"
    );
    assert(
      modeComparison.overflowMissingPlan.detail.includes("plan/update"),
      "strict missing-plan failure should mention plan/update"
    );
    assert(
      !modeComparison.overflowMissingPlan.detail.includes("requirement/dispatch"),
      "missing-plan failure should not regress to missing requirement/dispatch when overflow occurs"
    );
    assert(
      !modeComparison.overflowMissingPlan.detail.includes("turn/start"),
      "missing-plan failure should not regress to missing turn/start when overflow occurs"
    );
    assert.strictEqual(
      blockedRequirementUiSnapshot.requirementStage,
      "blocked",
      "blocked requirement contracts should keep Step 1 blocked"
    );
    assert.strictEqual(
      blockedRequirementUiSnapshot.planningStage,
      "todo",
      "blocked requirement contracts should not advance to planning"
    );
    assert.strictEqual(
      blockedRequirementUiSnapshot.executionStage,
      "todo",
      "blocked requirement contracts should not advance to execution"
    );
    assert.strictEqual(
      blockedRequirementUiSnapshot.qualityStage,
      "todo",
      "blocked requirement contracts should not advance to quality"
    );
    assert.strictEqual(
      blockedRequirementUiSnapshot.reportStage,
      "todo",
      "blocked requirement contracts should not advance to reporting"
    );
    assert(
      blockedRequirementUiSnapshot.currentStage.includes("1. 要件整理"),
      "current stage should stay on Step 1 when the requirement contract is blocked"
    );
    assert(
      blockedRequirementUiSnapshot.currentWork.includes("要確認")
        || blockedRequirementUiSnapshot.currentWork.includes("何を満たせば成功と言えるか？"),
      "current work should surface the requirement blocker instead of a later-stage plan skip"
    );
    assert(
      blockedRequirementUiSnapshot.planningSummary.includes("要件整理が保留のため"),
      "planning summary should explain that downstream work is gated by the blocked requirement contract"
    );
    assert(
      blockedRequirementUiSnapshot.executionSummary.includes("要件整理が保留のため"),
      "execution summary should explain that downstream work is gated by the blocked requirement contract"
    );

    assert.strictEqual(
      completedBlockedUiSnapshot.workflowCurrent,
      "5. 完了",
      "completed replies should land on the user-facing completion step even if the stored requirement snapshot was previously blocked"
    );
    assert(
      completedBlockedUiSnapshot.workflowDetail.includes("完了") || completedBlockedUiSnapshot.workflowDetail.includes("返却"),
      "completed replies should describe the compact workflow as finished"
    );
    assert(
      completedBlockedUiSnapshot.currentWork.includes("完了") || completedBlockedUiSnapshot.currentWork.includes("返却"),
      "current work should prefer the completed reply summary over a stale requirement blocker"
    );
    assert.strictEqual(
      completedBlockedUiSnapshot.complianceBadge,
      "完了",
      "the stop-reason badge should show completed once the answer was returned"
    );
    assert(
      completedBlockedUiSnapshot.complianceDetail.includes("返却済み"),
      "the stop-reason detail should explain that the latest answer was already returned"
    );

    assert(
      planUiSnapshot.planMeta.includes("1/3"),
      "plan panel should summarize completed plan steps"
    );
    assert(
      planUiSnapshot.currentCardClass.includes("in_progress"),
      "current plan card should be highlighted as in_progress"
    );
    assert.strictEqual(
      planUiSnapshot.currentStep,
      "Render execution plan panel in the main UI",
      "current plan card should surface the in-progress step text"
    );
    assert(
      planUiSnapshot.currentPurpose.includes("支える依頼")
        && planUiSnapshot.currentPurpose.includes("Render execution plan panel in the main UI"),
      "current plan card should foreground which request clause the focused step serves"
    );
    assert(
      planUiSnapshot.currentDetail.includes("進行中"),
      "current plan detail should expose the in-progress status label"
    );
    assert(
      planUiSnapshot.currentDetail.includes("step 2 of 3")
        || planUiSnapshot.currentDetail.includes("2 / 3"),
      "current plan detail should expose the focused step index"
    );
    assert(
      planUiSnapshot.currentWork.includes("2/3"),
      "Current Work should expose the active plan position"
    );
    assert(
      planUiSnapshot.currentWork.includes("Render execution plan panel in the main UI"),
      "Current Work should surface the active plan step text"
    );
    assert.strictEqual(
      planUiSnapshot.explanation,
      "Parent locks the requirement, then exposes each implementation step and current progress.",
      "plan summary text should render in the plan panel"
    );
    assert.deepStrictEqual(
      planUiSnapshot.renderedStatuses,
      ["完了", "進行中", "待機"],
      "plan list should render localized status labels for each step"
    );
    assert.deepStrictEqual(
      planUiSnapshot.renderedSteps,
      [
        "Lock requirement and acceptance checks",
        "Render execution plan panel in the main UI",
        "Verify browser rendering and update docs",
      ],
      "plan list should render every plan step in order"
    );
    assert.deepStrictEqual(
      planUiSnapshot.renderedPurposes,
      [
        "支える依頼: Lock requirement and acceptance checks",
        "支える依頼: Render execution plan panel in the main UI",
        "支える依頼: Verify browser rendering and update docs",
      ],
      "plan list should foreground the user-request purpose of every step"
    );
    assert.strictEqual(
      planUiSnapshot.focusedStep,
      "Render execution plan panel in the main UI",
      "plan list should focus the in-progress step"
    );
    assert(
      planUiSnapshot.focusedStatusClass.includes("in_progress"),
      "focused plan step should carry the in_progress status class"
    );
    assert(
      requirementUiSnapshot.requirementMeta.includes("依頼反映 1 / 1")
        && requirementUiSnapshot.requirementMeta.includes("確定"),
      "requirement lock meta should expose request coverage and locked status"
    );
    assert(
      requirementUiSnapshot.requirementHeadline.includes("Show what was locked in Step 1"),
      "requirement lock headline should surface the explicit goal"
    );
    assert(
      requirementUiSnapshot.sectionTitles.includes("AIの方針"),
      "requirement lock panel should render the current AI policy section"
    );
    assert(
      requirementUiSnapshot.sectionSummaries.some((entry) => entry.includes("Show what was locked in Step 1")),
      "requirement lock panel should summarize the locked interpretation"
    );
    assert(
      requirementUiSnapshot.rowEntries.some(
        (entry) => entry.label === "進め方" && entry.text.includes("Implement UI")
      ),
      "requirement lock panel should render the next-action guidance"
    );
    assert(
      requirementUiSnapshot.rowEntries.some(
        (entry) => entry.label === "守る線" && entry.text.includes("Generic progress-only cards")
      ),
      "requirement lock panel should render the must-avoid guidance"
    );
    assert(
      requirementUiSnapshot.firstPhaseSummary.includes("受け入れ 2"),
      "requirements phase should summarize locked acceptance checks"
    );
    assert(
      requirementUiSnapshot.secondPhaseSummary.includes("dispatch 2"),
      "planning phase should summarize dispatch ownership"
    );
    assert(
      requirementUiSnapshot.thirdPhaseSummary.includes("実行中"),
      "execution phase should summarize active implementation progress"
    );
    assert(
      requirementUiSnapshot.fourthPhaseSummary.includes("family gate"),
      "quality phase should summarize the family gate state"
    );
    assert(
      requirementUiSnapshot.currentWork.includes("Implement UI"),
      "Current Work should still prefer the active plan step when requirement details are present"
    );
    assert.strictEqual(
      skipUiSnapshot.planMeta,
      "PLAN SKIP",
      "skip plan should surface PLAN SKIP in the meta badge"
    );
    assert(
      skipUiSnapshot.currentCardClass.includes("skipped"),
      "skip plan card should carry skipped styling"
    );
    assert(
      skipUiSnapshot.currentDetail.includes("PLAN SKIP"),
      "skip plan detail should surface PLAN SKIP"
    );
    assert(
      skipUiSnapshot.currentDetail.includes("FAST_PLANNING"),
      "skip plan detail should expose planning depth"
    );
    assert(
      skipUiSnapshot.currentWork.includes("詳細な実行計画は省略"),
      "Current Work should explain why planning is intentionally omitted"
    );
    assert(
      skipUiSnapshot.planningCardClass.includes("skipped"),
      "planning journey card should show skipped state"
    );
    assert(
      skipUiSnapshot.planningCardText.includes("詳細な実行計画は省略"),
      "planning journey card should explain the skip state"
    );
    assert.strictEqual(
      skipUiSnapshot.renderedStatus,
      "SKIP",
      "skip plan row should render a SKIP status badge"
    );

    console.log(`PASS harness_check_mode_test :: port=${port}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const childDetail = childError
      ? `child error: ${childError.message}`
      : childExit !== null
      ? `child exit code: ${childExit}`
      : "";
    const stderr = getStderr();
    const extra = [childDetail, stderr ? `stderr: ${stderr}` : ""]
      .filter(Boolean)
      .join(" | ");
    throw new Error(extra ? `${detail} | ${extra}` : detail);
  } finally {
    await browser.close().catch(() => {});
    await stopServer(child);
  }
}

async function main() {
  try {
    await runIntegration();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isEnvironmentRestrictionError(message)) {
      console.log(`PASS harness_check_mode_test :: skipped due restricted environment (${message})`);
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(`FAIL harness_check_mode_test :: ${message}`);
  process.exitCode = 1;
});
