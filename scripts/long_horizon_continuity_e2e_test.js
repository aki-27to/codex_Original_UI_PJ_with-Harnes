#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { runPublicRegression } = require("./run_public_regression");

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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const taskId = `phase2-long-horizon-${Date.now()}`;
  const transcriptPath = path.join(workspaceRoot, "logs", "archive", "raw", "runtime_state", "continuity", "tmp", `${taskId}-transcript.txt`);
  fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });
  fs.writeFileSync(transcriptPath, `${"full transcript placeholder ".repeat(800)}\n`, "utf8");

  const init = runCli("initialize_task", [
    `--task-id=${taskId}`,
    "--session-id=s1",
    "--title=Phase 2 continuity e2e",
    "--objective=resume work without replaying the full transcript and finish only after verifier evidence is green",
    "--family=deterministic_code",
    "--acceptance=public regression passes|handoff artifacts are generated",
    "--stop-conditions=requirements_satisfied|verification_recorded",
    "--milestones=baseline|resume|verification|closeout",
  ]);
  const acceptanceIds = init.planState.acceptanceCriteria.map((entry) => entry.id);
  assert.strictEqual(init.taskState.status, "active");

  runCli("update_task", [
    `--task-id=${taskId}`,
    "--session-id=s1",
    "--phase=implementation",
    "--progress-percent=35",
    "--progress-summary=implemented the baseline continuity scaffold",
    `--current-step-id=${init.planState.currentStepId}`,
    "--current-step-status=in_progress",
    "--note=temporary hypothesis: maybe the transcript is still needed",
    "--note-kind=session_note",
    "--open-issues=finish verifier run|generate handoff bundle",
    "--changed-files=scripts/lib/long_horizon_continuity.js|scripts/long_horizon_task.js",
  ]);

  const close1 = runCli("close_session", [
    `--task-id=${taskId}`,
    "--session-id=s1",
    "--phase=paused",
    "--progress-percent=45",
    "--progress-summary=paused after scaffold and before verification",
    "--open-issues=finish verifier run|generate final closeout",
    "--changed-files=scripts/lib/long_horizon_continuity.js|scripts/long_horizon_task.js",
    "--durable=workflow_note::Check unresolved verifier findings before claiming completion",
  ]);
  assert.strictEqual(close1.taskStatus, "PARTIAL");

  const handoffArtifacts = runCli("list_handoff", [`--task-id=${taskId}`]);
  assert(handoffArtifacts.some((entry) => entry.type === "next_session_brief"));
  assert(handoffArtifacts.some((entry) => entry.type === "verification_status"));

  const resume = runCli("resume_task", [
    `--task-id=${taskId}`,
    "--session-id=s2",
    "--skills=handoff-artifact-generation|long-run-session-closeout",
  ]);
  assert.strictEqual(resume.resumeContext.metrics.withinBudget, 1);
  assert(resume.resumeContext.metrics.totalChars < fs.statSync(transcriptPath).size, "carry-forward bundle should be smaller than the transcript placeholder");
  const globalMemorySection = resume.resumeContext.sections.find((entry) => entry.id === "relevant_global_memory");
  assert(globalMemorySection && JSON.stringify(globalMemorySection.payload).includes("Check unresolved verifier findings before claiming completion"));
  assert(!JSON.stringify(globalMemorySection.payload).includes("temporary hypothesis"), "session-only note must not be promoted to durable memory");

  const sessionMemory = runCli("list_session_memory", [`--task-id=${taskId}`, "--session-id=s1"]);
  assert(Array.isArray(sessionMemory.notes) && sessionMemory.notes.some((entry) => entry.text.includes("temporary hypothesis")));
  const durableMemory = runCli("list_durable_memory", [`--task-id=${taskId}`]);
  assert(Array.isArray(durableMemory) && durableMemory.every((entry) => !String(entry.text).includes("temporary hypothesis")));

  const regression = await runPublicRegression({
    actor: "ci",
    label: `phase2-long-horizon-${Date.now()}`,
    port: 57579,
  });
  assert.strictEqual(regression.ok, true, "Phase 1 public regression must stay green");

  const verifierReportPath = path.join(workspaceRoot, "output", `${taskId}-public-verifier.json`);
  writeJson(verifierReportPath, regression.report.verifier);
  const acceptanceUpdateFlag = acceptanceIds.map((entry) => `${entry}:passed`).join("|");
  const update2 = runCli("update_task", [
    `--task-id=${taskId}`,
    "--session-id=s2",
    "--phase=verification",
    "--progress-percent=85",
    "--progress-summary=public regression passed and continuity artifacts are ready",
    `--current-step-id=${init.planState.currentStepId}`,
    "--current-step-status=completed",
    `--acceptance-updates=${acceptanceUpdateFlag}`,
    `--verifier-report=${path.relative(workspaceRoot, verifierReportPath).replace(/\\/g, "/")}`,
    "--changed-files=scripts/lib/long_horizon_continuity.js|scripts/long_horizon_task.js|scripts/long_horizon_continuity_e2e_test.js",
    "--open-issues=",
  ]);
  assert.strictEqual(update2.verifierState.lastVerifierVerdict, "PASS");

  const close2 = runCli("close_session", [
    `--task-id=${taskId}`,
    "--session-id=s2",
    "--completion-claim=completed",
    "--phase=completed",
    "--progress-percent=100",
    "--progress-summary=verified and closed with a carry-forward bundle",
    `--verifier-report=${path.relative(workspaceRoot, verifierReportPath).replace(/\\/g, "/")}`,
    "--changed-files=scripts/lib/long_horizon_continuity.js|scripts/long_horizon_task.js|scripts/long_horizon_continuity_e2e_test.js",
  ]);
  assert.strictEqual(close2.taskStatus, "COMPLETED");

  const falseTaskId = `${taskId}-false-completion`;
  const falseInit = runCli("initialize_task", [
    `--task-id=${falseTaskId}`,
    "--session-id=s1",
    "--title=False completion guard",
    "--objective=prove that completion is blocked when verifier or acceptance is still red",
    "--family=deterministic_code",
    "--acceptance=all criteria passed",
  ]);
  const failingVerifierReportPath = path.join(workspaceRoot, "output", `${falseTaskId}-verifier-fail.json`);
  writeJson(failingVerifierReportPath, {
    schema: "independent-verifier-report.v1",
    generatedAt: new Date().toISOString(),
    verdict: "FAIL",
    reason: "simulated_failure",
    failures: [
      {
        type: "grader_failed",
        reason: "acceptance criteria still unresolved",
        caseId: "false_completion_guard",
      },
    ],
  });
  const falseClose = runCli("close_session", [
    `--task-id=${falseTaskId}`,
    "--session-id=s1",
    "--completion-claim=completed",
    "--phase=claimed_done",
    "--progress-percent=100",
    "--progress-summary=executor claims the work is done",
    `--verifier-report=${path.relative(workspaceRoot, failingVerifierReportPath).replace(/\\/g, "/")}`,
  ]);
  assert.strictEqual(falseClose.taskStatus, "FAILED_VALIDATION");
  const unresolvedVerifier = runCli("list_unresolved_verifier", [`--task-id=${falseTaskId}`]);
  assert(Array.isArray(unresolvedVerifier) && unresolvedVerifier.length > 0, "verifier findings should remain inspectable");

  const taskState = runCli("task_state", [`--task-id=${taskId}`]);
  const planState = runCli("show_plan", [`--task-id=${taskId}`]);
  assert.strictEqual(taskState.status, "COMPLETED");
  assert(Array.isArray(planState.acceptanceCriteria) && planState.acceptanceCriteria.every((entry) => entry.status === "passed"));

  console.log("PASS long_horizon_continuity_e2e_test");
}

main().catch((error) => {
  console.error("FAIL long_horizon_continuity_e2e_test");
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
