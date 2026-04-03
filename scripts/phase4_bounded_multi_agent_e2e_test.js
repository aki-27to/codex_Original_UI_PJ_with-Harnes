#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  dispatchChildTask,
  executeChildTask,
  integrateChildTask,
  runBoundedWorkflow,
  runSingleAgentFallback,
} = require("./lib/bounded_multi_agent_orchestrator");
const { closeSession, initializeTask, inspectTask, resumeTask } = require("./lib/long_horizon_continuity");
const { runPublicRegression } = require("./run_public_regression");
const { runHoldoutEval } = require("./run_holdout_eval");
const { requestJson, startHarnessForPhase1 } = require("./lib/harness_api_client");

const workspaceRoot = path.resolve(__dirname, "..");

function runNodeScript(scriptPath, args = [], env = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    throw new Error(`${path.basename(scriptPath)} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result;
}

async function withContinuityServer(port, callback) {
  const harness = await startHarnessForPhase1({
    workspaceRoot,
    proofRoot: path.join(workspaceRoot, "logs", "archive", "raw", "phase4_runs", `http-inspect-${Date.now()}`),
    port,
  });
  try {
    return await callback(harness);
  } finally {
    await harness.handle.stop();
  }
}

async function main() {
  const normalId = `phase4-normal-${Date.now()}`;
  const normal = await runBoundedWorkflow({
    workspaceRoot,
    taskId: normalId,
    sessionId: "s1",
    title: "Phase 4 normal multi-agent",
    objective: "run planner executor verifier and close successfully",
    familyId: "deterministic_code",
    acceptanceCriteria: ["deliverable recorded", "verifier passes", "integration merged"],
    workflow: [
      { role: "planner", objective: "update plan for normal path", expectedDeliverable: "plan delta", acceptanceSubset: ["plan updated"] },
      { role: "executor", objective: "produce bounded executor deliverable", expectedDeliverable: "bounded coding deliverable", acceptanceSubset: ["deliverable recorded"], payload: { deliverableSummary: "Implemented bounded executor artifact with evidence", changedSurface: ["scripts/lib/bounded_multi_agent_orchestrator.js"] } },
      { role: "verifier", objective: "verify executor result", expectedDeliverable: "verifier report", acceptanceSubset: ["verifier passes"], targetRole: "executor" },
    ],
  });
  assert.strictEqual(normal.closed.lifecycleState, "completed");
  const normalGraph = inspectTask({ workspaceRoot, taskId: normalId, mode: "agent_graph" });
  assert(Array.isArray(normalGraph.nodes) && normalGraph.nodes.length >= 4);
  const normalHistory = inspectTask({ workspaceRoot, taskId: normalId, mode: "handoff_history" });
  assert(Array.isArray(normalHistory) && normalHistory.length >= 3);

  const resumeId = `${normalId}-resume`;
  initializeTask({
    workspaceRoot,
    taskId: resumeId,
    sessionId: "s1",
    title: "Phase 4 resume across parent child",
    objective: "resume parent after child work and finish later",
    familyId: "research_analysis",
    acceptanceCriteria: ["research summary recorded", "verifier passes"],
    role: "coordinator",
    orchestrationMode: "bounded_multi_agent",
  });
  const plannerChild = dispatchChildTask({
    workspaceRoot,
    parentTaskId: resumeId,
    sessionId: "s1",
    role: "planner",
    delegatedObjective: "plan research sequence",
    acceptanceSubset: ["research summary recorded"],
    expectedDeliverable: "research planning delta",
  });
  executeChildTask({ workspaceRoot, childTaskId: plannerChild.childTaskId, sessionId: "s1" });
  integrateChildTask({ workspaceRoot, parentTaskId: resumeId, childTaskId: plannerChild.childTaskId, sessionId: "s1" });
  const researchChild = dispatchChildTask({
    workspaceRoot,
    parentTaskId: resumeId,
    sessionId: "s1",
    role: "researcher",
    delegatedObjective: "collect bounded research synthesis",
    acceptanceSubset: ["research summary recorded"],
    expectedDeliverable: "research synthesis",
  });
  executeChildTask({
    workspaceRoot,
    childTaskId: researchChild.childTaskId,
    sessionId: "s1",
    payload: {
      findings: ["Phase 1 hardened eval/rollback", "Phase 2 added continuity", "Phase 3 added lifecycle"],
      citations: ["phase1", "phase2", "phase3"],
    },
  });
  integrateChildTask({ workspaceRoot, parentTaskId: resumeId, childTaskId: researchChild.childTaskId, sessionId: "s1" });
  const paused = closeSession({
    workspaceRoot,
    taskId: resumeId,
    sessionId: "s1",
    progressSummary: "research done, verifier deferred",
  });
  assert.strictEqual(paused.lifecycleState, "blocked");
  const resumed = resumeTask({ workspaceRoot, taskId: resumeId, sessionId: "s2", requestedSkillIds: ["handoff-artifact-generation"] });
  assert.strictEqual(resumed.taskId, resumeId);
  const verifierChild = dispatchChildTask({
    workspaceRoot,
    parentTaskId: resumeId,
    sessionId: "s2",
    role: "verifier",
    delegatedObjective: "verify research summary",
    acceptanceSubset: ["research summary recorded", "verifier passes"],
    expectedDeliverable: "research verifier report",
  });
  const targetResearch = inspectTask({ workspaceRoot, taskId: researchChild.childTaskId, mode: "task_state" });
  assert.strictEqual(targetResearch.parentTaskId, resumeId);
  executeChildTask({
    workspaceRoot,
    childTaskId: verifierChild.childTaskId,
    sessionId: "s2",
    payload: {
      targetRole: "researcher",
      targetResult: JSON.parse(fs.readFileSync(path.join(workspaceRoot, "logs", "archive", "raw", "runtime_state", "continuity", "tasks", researchChild.childTaskId, "agent_normalized_result.json"), "utf8")),
    },
  });
  integrateChildTask({ workspaceRoot, parentTaskId: resumeId, childTaskId: verifierChild.childTaskId, sessionId: "s2" });
  const resumedClose = closeSession({
    workspaceRoot,
    taskId: resumeId,
    sessionId: "s2",
    completionClaim: "completed",
    progressSummary: "resumed and completed after verifier",
  });
  assert.strictEqual(resumedClose.lifecycleState, "completed");

  const failureId = `phase4-failure-${Date.now()}`;
  initializeTask({
    workspaceRoot,
    taskId: failureId,
    sessionId: "s1",
    title: "Phase 4 failure containment",
    objective: "verifier failure should force replan and recovery",
    familyId: "deterministic_code",
    acceptanceCriteria: ["deliverable recorded", "verifier passes"],
    role: "coordinator",
    orchestrationMode: "bounded_multi_agent",
  });
  const execFailChild = dispatchChildTask({
    workspaceRoot,
    parentTaskId: failureId,
    sessionId: "s1",
    role: "executor",
    delegatedObjective: "produce candidate deliverable",
    acceptanceSubset: ["deliverable recorded"],
    expectedDeliverable: "candidate deliverable",
  });
  executeChildTask({
    workspaceRoot,
    childTaskId: execFailChild.childTaskId,
    sessionId: "s1",
    payload: { deliverableSummary: "Implemented candidate artifact with evidence", changedSurface: ["scripts/phase4_bounded_multi_agent_e2e_test.js"] },
  });
  integrateChildTask({ workspaceRoot, parentTaskId: failureId, childTaskId: execFailChild.childTaskId, sessionId: "s1" });
  const badVerifier = dispatchChildTask({
    workspaceRoot,
    parentTaskId: failureId,
    sessionId: "s1",
    role: "verifier",
    delegatedObjective: "fail delegated verifier intentionally",
    acceptanceSubset: ["verifier passes"],
    expectedDeliverable: "failing verifier report",
  });
  executeChildTask({
    workspaceRoot,
    childTaskId: badVerifier.childTaskId,
    sessionId: "s1",
    payload: {
      forceFailure: true,
      failureReason: "simulated child verifier failure",
      targetResult: JSON.parse(fs.readFileSync(path.join(workspaceRoot, "logs", "archive", "raw", "runtime_state", "continuity", "tasks", execFailChild.childTaskId, "agent_normalized_result.json"), "utf8")),
    },
  });
  const failedIntegration = integrateChildTask({ workspaceRoot, parentTaskId: failureId, childTaskId: badVerifier.childTaskId, sessionId: "s1" });
  assert.strictEqual(failedIntegration.integrationStatus, "verifier_failed");
  const failedParent = inspectTask({ workspaceRoot, taskId: failureId, mode: "operating_summary" });
  assert.strictEqual(failedParent.lifecycleState, "verifier_failed");
  const failureReplan = inspectTask({ workspaceRoot, taskId: failureId, mode: "replan" });
  assert(failureReplan && failureReplan.reason);
  resumeTask({ workspaceRoot, taskId: failureId, sessionId: "s2", requestedSkillIds: ["long-run-session-closeout"] });
  const goodVerifier = dispatchChildTask({
    workspaceRoot,
    parentTaskId: failureId,
    sessionId: "s2",
    role: "verifier",
    delegatedObjective: "re-run verifier after replan",
    acceptanceSubset: ["deliverable recorded", "verifier passes"],
    expectedDeliverable: "passing verifier report",
  });
  executeChildTask({
    workspaceRoot,
    childTaskId: goodVerifier.childTaskId,
    sessionId: "s2",
    payload: {
      targetResult: JSON.parse(fs.readFileSync(path.join(workspaceRoot, "logs", "archive", "raw", "runtime_state", "continuity", "tasks", execFailChild.childTaskId, "agent_normalized_result.json"), "utf8")),
    },
  });
  integrateChildTask({ workspaceRoot, parentTaskId: failureId, childTaskId: goodVerifier.childTaskId, sessionId: "s2" });
  const recovered = closeSession({
    workspaceRoot,
    taskId: failureId,
    sessionId: "s2",
    completionClaim: "completed",
    progressSummary: "recovered after verifier replan",
  });
  assert.strictEqual(recovered.lifecycleState, "completed");

  const deniedId = `phase4-denied-${Date.now()}`;
  const denied = await runBoundedWorkflow({
    workspaceRoot,
    taskId: deniedId,
    sessionId: "s1",
    title: "Phase 4 permission guard",
    objective: "denied child action should block parent",
    familyId: "deterministic_code",
    acceptanceCriteria: ["guard triggers", "parent blocks"],
    workflow: [
      {
        role: "executor",
        objective: "attempt denied tool use",
        expectedDeliverable: "should be denied",
        acceptanceSubset: ["guard triggers"],
        payload: { requestedTool: "holdout_eval_lane" },
      },
    ],
  });
  assert.notStrictEqual(denied.closed.lifecycleState, "completed");
  const deniedSummary = inspectTask({ workspaceRoot, taskId: deniedId, mode: "operating_summary" });
  assert(["blocked", "verifier_failed"].includes(deniedSummary.lifecycleState));

  const fallback = runSingleAgentFallback({
    workspaceRoot,
    taskId: `phase4-fallback-${Date.now()}`,
    sessionId: "s1",
    title: "Phase 4 fallback",
    objective: "simple task stays single-agent",
    familyId: "planning_design",
    acceptanceCriteria: ["fallback used"],
    note: "single-agent fallback retained",
  });
  assert.strictEqual(fallback.fallback, 1);
  assert.strictEqual(fallback.closed.lifecycleState, "completed");

  await withContinuityServer(57620, async (harness) => {
    const treeRes = await requestJson({
      port: harness.port,
      path: `/api/continuity/task?task_id=${encodeURIComponent(normalId)}&mode=active_agent_tree`,
      method: "GET",
    });
    assert.strictEqual(treeRes.statusCode, 200);
    assert.strictEqual(treeRes.json.ok, true);
    assert(Array.isArray(treeRes.json.payload.nodes));

    const pendingRes = await requestJson({
      port: harness.port,
      path: `/api/continuity/task?task_id=${encodeURIComponent(normalId)}&mode=integration_summary`,
      method: "GET",
    });
    assert.strictEqual(pendingRes.statusCode, 200);
    assert.strictEqual(pendingRes.json.ok, true);

    const failedList = await requestJson({
      port: harness.port,
      path: "/api/continuity/tasks?state=verifier_failed",
      method: "GET",
    });
    assert.strictEqual(failedList.statusCode, 200);
    assert.strictEqual(failedList.json.ok, true);
    assert(Array.isArray(failedList.json.payload));
  });

  const publicRegression = await runPublicRegression({
    actor: "ci",
    label: `phase4-public-${Date.now()}`,
    port: 57621,
  });
  assert.strictEqual(publicRegression.ok, true);
  const previousUnlock = process.env.CODEX_HOLDOUT_EVAL_UNLOCK;
  process.env.CODEX_HOLDOUT_EVAL_UNLOCK = "1";
  const holdout = await runHoldoutEval({
    actor: "release",
    label: `phase4-holdout-${Date.now()}`,
    port: 57622,
  });
  if (previousUnlock === undefined) {
    delete process.env.CODEX_HOLDOUT_EVAL_UNLOCK;
  } else {
    process.env.CODEX_HOLDOUT_EVAL_UNLOCK = previousUnlock;
  }
  assert.strictEqual(holdout.ok, true);
  runNodeScript(path.join(workspaceRoot, "scripts", "phase1_hardening_e2e_test.js"));
  runNodeScript(path.join(workspaceRoot, "scripts", "long_horizon_continuity_e2e_test.js"));
  runNodeScript(path.join(workspaceRoot, "scripts", "phase3_structured_planning_lifecycle_e2e_test.js"));

  console.log(JSON.stringify({
    ok: true,
    phase: "phase4_bounded_multi_agent",
    normalTaskId: normalId,
    resumeTaskId: resumeId,
    failureTaskId: failureId,
    deniedTaskId: deniedId,
    generatedAt: new Date().toISOString(),
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
