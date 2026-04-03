#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { requestJson, startHarnessForPhase1 } = require("./lib/harness_api_client");
const { runPublicRegression } = require("./run_public_regression");
const { runHoldoutEval } = require("./run_holdout_eval");

const workspaceRoot = path.resolve(__dirname, "..");
const cliPath = path.join(workspaceRoot, "scripts", "long_horizon_task.js");

function runCli(command, args = []) {
  const result = spawnSync(process.execPath, [cliPath, command, ...args], {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function runNodeScript(scriptPath, args = [], env = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
  if (result.status !== 0) {
    throw new Error(`${path.basename(scriptPath)} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeEntriesStale(filePath) {
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const staleIso = "2025-01-01T00:00:00.000Z";
  const staleRecency = Date.parse(staleIso);
  payload.entries = Array.isArray(payload.entries) ? payload.entries.map((entry) => ({
    ...entry,
    createdAt: staleIso,
    updatedAt: staleIso,
    recency: staleRecency,
  })) : [];
  payload.updatedAt = staleIso;
  writeJson(filePath, payload);
}

async function withContinuityServer(port, callback) {
  const harness = await startHarnessForPhase1({
    workspaceRoot,
    proofRoot: path.join(workspaceRoot, "logs", "archive", "raw", "phase3_runs", `http-inspect-${Date.now()}`),
    port,
  });
  try {
    return await callback(harness);
  } finally {
    await harness.handle.stop();
  }
}

async function main() {
  const baseId = `phase3-lifecycle-${Date.now()}`;
  const init = runCli("initialize_task", [
    `--task-id=${baseId}`,
    "--session-id=s1",
    "--title=Phase 3 lifecycle baseline",
    "--objective=manage planning, resume, closeout, and inspection through structured lifecycle artifacts",
    "--family=deterministic_code",
    "--acceptance=public regression passes|acceptance contract is fully green",
    "--stop-conditions=requirements_satisfied|verification_recorded",
    "--milestones=baseline|resume|verification|closeout",
  ]);
  assert.strictEqual(init.taskState.lifecycle.currentState, "planned");
  const acceptanceIds = init.planState.acceptanceCriteria.map((entry) => entry.id);

  const taskSpec = runCli("show_task_spec", [`--task-id=${baseId}`]);
  assert.strictEqual(taskSpec.taskId, baseId);
  assert(Array.isArray(taskSpec.verifierRequirements) && taskSpec.verifierRequirements.length > 0);

  const planArtifact = runCli("show_plan", [`--task-id=${baseId}`]);
  assert(Array.isArray(planArtifact.steps) && planArtifact.steps.length > 0);

  runCli("update_task", [
    `--task-id=${baseId}`,
    "--session-id=s1",
    "--phase=implementation",
    "--progress-percent=40",
    "--progress-summary=implementation sprint started",
    `--current-step-id=${init.planState.currentStepId}`,
    "--current-step-status=in_progress",
    "--note=temporary implementation scratchpad",
    "--note-kind=session_note",
    "--open-issues=run verifier|finish closeout",
    "--changed-files=scripts/lib/long_horizon_continuity.js|scripts/long_horizon_task.js",
  ]);

  const partialClose = runCli("close_session", [
    `--task-id=${baseId}`,
    "--session-id=s1",
    "--phase=paused",
    "--progress-percent=55",
    "--progress-summary=paused with verifier still pending",
    "--open-issues=run verifier|finish closeout",
    "--changed-files=scripts/lib/long_horizon_continuity.js|scripts/long_horizon_task.js",
  ]);
  assert.strictEqual(partialClose.taskStatus, "PARTIAL");
  assert.strictEqual(partialClose.lifecycleState, "blocked");
  assert.strictEqual(partialClose.closeoutSummary.closeAllowed, 0);

  const operatingBlocked = runCli("show_operating_summary", [`--task-id=${baseId}`]);
  assert.strictEqual(operatingBlocked.lifecycleState, "blocked");
  assert(Array.isArray(operatingBlocked.blockers) && operatingBlocked.blockers.length > 0);

  const resume = runCli("resume_task", [
    `--task-id=${baseId}`,
    "--session-id=s2",
    "--skills=handoff-artifact-generation|long-run-session-closeout",
  ]);
  assert.strictEqual(resume.resumeContext.metrics.withinBudget, 1);
  assert.strictEqual(resume.resumeContext.sections[0].id, "task_contract");

  const publicRegression = await runPublicRegression({
    actor: "ci",
    label: `phase3-public-${Date.now()}`,
    port: 57590,
  });
  assert.strictEqual(publicRegression.ok, true);
  const passVerifierPath = path.join(workspaceRoot, "output", `${baseId}-verifier-pass.json`);
  writeJson(passVerifierPath, publicRegression.report.verifier);
  const acceptanceUpdateFlag = acceptanceIds.map((entry) => `${entry}:passed`).join("|");
  const updateVerified = runCli("update_task", [
    `--task-id=${baseId}`,
    "--session-id=s2",
    "--phase=verification",
    "--progress-percent=90",
    "--progress-summary=verification is green",
    `--current-step-id=${init.planState.currentStepId}`,
    "--current-step-status=completed",
    `--acceptance-updates=${acceptanceUpdateFlag}`,
    `--verifier-report=${path.relative(workspaceRoot, passVerifierPath).replace(/\\/g, "/")}`,
    "--changed-files=scripts/lib/long_horizon_continuity.js|scripts/long_horizon_task.js|scripts/phase3_structured_planning_lifecycle_e2e_test.js",
  ]);
  assert.strictEqual(updateVerified.verifierState.lastVerifierVerdict, "PASS");

  const completedClose = runCli("close_session", [
    `--task-id=${baseId}`,
    "--session-id=s2",
    "--completion-claim=completed",
    "--phase=completed",
    "--progress-percent=100",
    "--progress-summary=completed with verifier and acceptance green",
    `--verifier-report=${path.relative(workspaceRoot, passVerifierPath).replace(/\\/g, "/")}`,
  ]);
  assert.strictEqual(completedClose.taskStatus, "COMPLETED");
  assert.strictEqual(completedClose.lifecycleState, "completed");
  assert.strictEqual(completedClose.closeoutSummary.closeAllowed, 1);

  const falseId = `${baseId}-false`;
  const falseInit = runCli("initialize_task", [
    `--task-id=${falseId}`,
    "--session-id=s1",
    "--title=False completion recovery",
    "--objective=force verifier_failed and replan before allowing completion",
    "--family=deterministic_code",
    "--acceptance=all acceptance items are passed",
  ]);
  const falseAcceptanceIds = falseInit.planState.acceptanceCriteria.map((entry) => entry.id);
  const failVerifierPath = path.join(workspaceRoot, "output", `${falseId}-verifier-fail.json`);
  writeJson(failVerifierPath, {
    schema: "independent-verifier-report.v1",
    generatedAt: new Date().toISOString(),
    verdict: "FAIL",
    reason: "simulated_phase3_failure",
    failures: [
      {
        type: "acceptance_gap",
        reason: "acceptance contract still has pending items",
        caseId: "phase3_false_completion",
      },
    ],
  });
  const falseClose = runCli("close_session", [
    `--task-id=${falseId}`,
    "--session-id=s1",
    "--completion-claim=completed",
    "--phase=claimed_done",
    "--progress-percent=100",
    "--progress-summary=executor claims it is done too early",
    `--verifier-report=${path.relative(workspaceRoot, failVerifierPath).replace(/\\/g, "/")}`,
  ]);
  assert.strictEqual(falseClose.taskStatus, "FAILED_VALIDATION");
  assert.strictEqual(falseClose.lifecycleState, "verifier_failed");
  assert.strictEqual(falseClose.closeoutSummary.closeAllowed, 0);
  const falseReplan = runCli("show_replan", [`--task-id=${falseId}`]);
  assert(falseReplan && Array.isArray(falseReplan.remainingAcceptance) && falseReplan.remainingAcceptance.length > 0);
  const failedTasks = runCli("verifier_failed_tasks");
  assert(failedTasks.some((entry) => entry.taskId === falseId));

  await withContinuityServer(57591, async (harness) => {
    const operatingRes = await requestJson({
      port: harness.port,
      path: `/api/continuity/task?task_id=${encodeURIComponent(falseId)}&mode=operating_summary`,
      method: "GET",
    });
    assert.strictEqual(operatingRes.statusCode, 200);
    assert.strictEqual(operatingRes.json.ok, true);
    assert.strictEqual(operatingRes.json.payload.lifecycleState, "verifier_failed");
    assert(Array.isArray(operatingRes.json.payload.blockers) && operatingRes.json.payload.blockers.length > 0);

    const listRes = await requestJson({
      port: harness.port,
      path: "/api/continuity/tasks?state=verifier_failed",
      method: "GET",
    });
    assert.strictEqual(listRes.statusCode, 200);
    assert.strictEqual(listRes.json.ok, true);
    assert(Array.isArray(listRes.json.payload) && listRes.json.payload.some((entry) => entry.taskId === falseId));
  });

  runCli("resume_task", [
    `--task-id=${falseId}`,
    "--session-id=s2",
    "--skills=handoff-artifact-generation",
  ]);
  const falseAcceptanceUpdateFlag = falseAcceptanceIds.map((entry) => `${entry}:passed`).join("|");
  runCli("update_task", [
    `--task-id=${falseId}`,
    "--session-id=s2",
    "--phase=verification",
    "--progress-percent=95",
    "--progress-summary=replanned and reverified",
    `--current-step-id=${falseInit.planState.currentStepId}`,
    "--current-step-status=completed",
    `--acceptance-updates=${falseAcceptanceUpdateFlag}`,
    `--verifier-report=${path.relative(workspaceRoot, passVerifierPath).replace(/\\/g, "/")}`,
  ]);
  const falseRecovered = runCli("close_session", [
    `--task-id=${falseId}`,
    "--session-id=s2",
    "--completion-claim=completed",
    "--phase=completed",
    "--progress-percent=100",
    "--progress-summary=completed after replan",
    `--verifier-report=${path.relative(workspaceRoot, passVerifierPath).replace(/\\/g, "/")}`,
  ]);
  assert.strictEqual(falseRecovered.taskStatus, "COMPLETED");
  assert.strictEqual(falseRecovered.lifecycleState, "completed");

  const archiveId = `${baseId}-archive`;
  runCli("initialize_task", [
    `--task-id=${archiveId}`,
    "--session-id=s1",
    "--title=Archive path",
    "--objective=exercise abandon and archive transitions",
    "--family=deterministic_code",
    "--acceptance=archive manifest exists",
  ]);
  runCli("update_task", [
    `--task-id=${archiveId}`,
    "--session-id=s1",
    "--durable=workflow_note::stale archived note",
    "--progress-percent=20",
    "--progress-summary=created stale durable note for archive path",
  ]);
  const abandonResult = runCli("abandon_task", [
    `--task-id=${archiveId}`,
    "--session-id=s1",
    "--reason=operator chose to abandon the task",
  ]);
  assert.strictEqual(abandonResult.taskStatus, "ABANDONED");
  assert.strictEqual(abandonResult.lifecycleState, "abandoned");
  const archiveResult = runCli("archive_task", [
    `--task-id=${archiveId}`,
    "--session-id=s1",
    "--reason=archiving abandoned task",
  ]);
  assert.strictEqual(archiveResult.taskStatus, "ARCHIVED");
  assert.strictEqual(archiveResult.lifecycleState, "archived");
  const archivedTasks = runCli("archived_tasks");
  assert(archivedTasks.some((entry) => entry.taskId === archiveId));

  const activeId = `${baseId}-active`;
  runCli("initialize_task", [
    `--task-id=${activeId}`,
    "--session-id=s1",
    "--title=Active durable memory",
    "--objective=ensure stale prune does not touch active tasks",
    "--family=deterministic_code",
    "--acceptance=active durable memory survives prune",
  ]);
  runCli("update_task", [
    `--task-id=${activeId}`,
    "--session-id=s1",
    "--durable=workflow_note::stale active note",
    "--progress-percent=25",
    "--progress-summary=durable note created on active task",
  ]);
  const activeGlobalPath = path.join(workspaceRoot, "logs", "archive", "raw", "runtime_state", "continuity", "tasks", activeId, "global_memory.json");
  makeEntriesStale(activeGlobalPath);
  const skippedPrune = runCli("prune_durable_memory", [
    `--task-id=${activeId}`,
    "--age-days=1",
  ]);
  assert.strictEqual(skippedPrune.skipped, true);
  assert.strictEqual(skippedPrune.skippedBecause, "task_active");
  const activeDurable = runCli("list_durable_memory", [`--task-id=${activeId}`]);
  assert(Array.isArray(activeDurable) && activeDurable.length > 0);

  const archivedGlobalPath = path.join(workspaceRoot, "logs", "archive", "raw", "runtime_state", "continuity", "tasks", archiveId, "global_memory.json");
  makeEntriesStale(archivedGlobalPath);
  const prunedArchived = runCli("prune_durable_memory", [
    `--task-id=${archiveId}`,
    "--age-days=1",
  ]);
  assert.strictEqual(prunedArchived.skipped, false);
  assert(prunedArchived.prunedCount >= 1);
  assert(fs.existsSync(path.join(workspaceRoot, prunedArchived.archivePath)));

  const publicRegressionAgain = await runPublicRegression({
    actor: "ci",
    label: `phase3-public-regression-${Date.now()}`,
    port: 57592,
  });
  assert.strictEqual(publicRegressionAgain.ok, true);

  const previousHoldoutUnlock = process.env.CODEX_HOLDOUT_EVAL_UNLOCK;
  process.env.CODEX_HOLDOUT_EVAL_UNLOCK = "1";
  try {
    const holdoutResult = await runHoldoutEval({
      actor: "release",
      label: `phase3-holdout-${Date.now()}`,
      port: 57593,
    });
    assert.strictEqual(holdoutResult.ok, true);
  } finally {
    if (previousHoldoutUnlock === undefined) {
      delete process.env.CODEX_HOLDOUT_EVAL_UNLOCK;
    } else {
      process.env.CODEX_HOLDOUT_EVAL_UNLOCK = previousHoldoutUnlock;
    }
  }

  runNodeScript(path.join(workspaceRoot, "scripts", "phase1_hardening_e2e_test.js"));
  runNodeScript(path.join(workspaceRoot, "scripts", "long_horizon_continuity_e2e_test.js"));

  console.log("PASS phase3_structured_planning_lifecycle_e2e_test");
}

main().catch((error) => {
  console.error("FAIL phase3_structured_planning_lifecycle_e2e_test");
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
