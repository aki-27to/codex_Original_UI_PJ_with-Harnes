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

    await page.selectOption("#harnessCheckMode", "relaxed");
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
      cPlan.h.planExp = "Parent locks the requirement, then exposes each implementation step and current progress.";
      cPlan.h.plan = [
        { step: "Lock requirement and acceptance checks", status: "completed" },
        { step: "Render execution plan panel in the main UI", status: "in_progress" },
        { step: "Verify browser rendering and update docs", status: "pending" },
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
        currentDetail: document.querySelector("#harnessPlanCurrentDetail")?.textContent || "",
        explanation: document.querySelector("#harnessPlanExplanation")?.textContent || "",
        renderedStatuses: rows.map((row) => row.querySelector(".harness-plan-step-status")?.textContent || ""),
        renderedSteps: rows.map((row) => row.querySelector(".harness-plan-step-text")?.textContent || ""),
        focusedStep: document.querySelector("#harnessPlanList .harness-plan-step.focus .harness-plan-step-text")?.textContent || "",
        focusedStatusClass:
          document.querySelector("#harnessPlanList .harness-plan-step.focus .harness-plan-step-status")?.className || "",
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
      modeComparison.adaptiveLightweightComplete.detail.includes("inferred micro-plan"),
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
      planUiSnapshot.planMeta,
      "1/3 completed",
      "plan panel should summarize completed plan steps"
    );
    assert.strictEqual(
      planUiSnapshot.currentLabel,
      "Current Plan Step",
      "plan panel should render the current-step label"
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
      planUiSnapshot.currentDetail.includes("進行中"),
      "current plan detail should expose the in-progress status label"
    );
    assert(
      planUiSnapshot.currentDetail.includes("step 2 of 3"),
      "current plan detail should expose the focused step index"
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
    assert.strictEqual(
      planUiSnapshot.focusedStep,
      "Render execution plan panel in the main UI",
      "plan list should focus the in-progress step"
    );
    assert(
      planUiSnapshot.focusedStatusClass.includes("in_progress"),
      "focused plan step should carry the in_progress status class"
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
