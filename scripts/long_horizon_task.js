#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  abandonTask,
  archiveTask,
  closeSession,
  initializeTask,
  inspectTask,
  parseKvList,
  parseStringList,
  pruneDurableMemory,
  resumeTask,
  updateTask,
} = require("./lib/long_horizon_continuity");

const workspaceRoot = path.resolve(__dirname, "..");

function readFlag(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((entry) => entry.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function readVerifierReport(reportPath) {
  const absolute = path.resolve(workspaceRoot, reportPath);
  return JSON.parse(fs.readFileSync(absolute, "utf8"));
}

function buildAcceptanceUpdates() {
  return Object.fromEntries(parseKvList(readFlag("acceptance-updates"), { kvDelimiter: ":" }).map((entry) => [entry.key, entry.value]));
}

function buildDurableEntries() {
  return parseKvList(readFlag("durable"), { kvDelimiter: "::" }).map((entry) => ({
    kind: entry.key,
    text: entry.value,
  }));
}

function parseLimit() {
  const raw = readFlag("limit");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

function parsePositiveIntFlag(name, fallback = null) {
  const raw = readFlag(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

async function main() {
  const command = (process.argv[2] || "").trim();
  const taskId = readFlag("task-id");
  const sessionId = readFlag("session-id");
  const verifierReportPath = readFlag("verifier-report");
  const verifierReport = verifierReportPath ? readVerifierReport(verifierReportPath) : null;
  let result;

  switch (command) {
    case "initialize_task":
      result = initializeTask({
        workspaceRoot,
        taskId,
        sessionId,
        title: readFlag("title"),
        objective: readFlag("objective"),
        familyId: readFlag("family"),
        acceptanceCriteria: parseStringList(readFlag("acceptance")),
        stopConditions: parseStringList(readFlag("stop-conditions")),
        milestones: parseStringList(readFlag("milestones")),
        steps: parseStringList(readFlag("steps")),
      });
      break;
    case "resume_task":
      result = resumeTask({
        workspaceRoot,
        taskId,
        sessionId,
        requestedSkillIds: parseStringList(readFlag("skills")),
      });
      break;
    case "update_task":
      result = updateTask({
        workspaceRoot,
        taskId,
        sessionId,
        phase: readFlag("phase"),
        progressPercent: readFlag("progress-percent"),
        progressSummary: readFlag("progress-summary"),
        currentStepId: readFlag("current-step-id"),
        currentStepStatus: readFlag("current-step-status"),
        sprintTitle: readFlag("sprint-title"),
        sprintGoal: readFlag("sprint-goal"),
        note: readFlag("note"),
        noteKind: readFlag("note-kind") || "session_note",
        promoteNote: readFlag("promote-note") === "1",
        openIssues: parseStringList(readFlag("open-issues")),
        changedFiles: parseStringList(readFlag("changed-files")),
        acceptanceUpdates: buildAcceptanceUpdates(),
        verifierReport,
        verifierReportPath: verifierReportPath ? path.relative(workspaceRoot, path.resolve(workspaceRoot, verifierReportPath)).replace(/\\/g, "/") : "",
        durableEntries: buildDurableEntries(),
      });
      break;
    case "close_session":
      result = closeSession({
        workspaceRoot,
        taskId,
        sessionId,
        completionClaim: readFlag("completion-claim"),
        phase: readFlag("phase"),
        progressPercent: readFlag("progress-percent"),
        progressSummary: readFlag("progress-summary"),
        changedFiles: parseStringList(readFlag("changed-files")),
        openIssues: parseStringList(readFlag("open-issues")),
        durableEntries: buildDurableEntries(),
        verifierReport,
        verifierReportPath: verifierReportPath ? path.relative(workspaceRoot, path.resolve(workspaceRoot, verifierReportPath)).replace(/\\/g, "/") : "",
      });
      break;
    case "abandon_task":
      result = abandonTask({
        workspaceRoot,
        taskId,
        sessionId,
        reason: readFlag("reason"),
      });
      break;
    case "archive_task":
      result = archiveTask({
        workspaceRoot,
        taskId,
        sessionId,
        reason: readFlag("reason"),
      });
      break;
    case "prune_durable_memory":
      result = pruneDurableMemory({
        workspaceRoot,
        taskId,
        ageDays: parsePositiveIntFlag("age-days"),
        force: readFlag("force") === "1",
      });
      break;
    case "task_state":
    case "show_plan":
    case "show_task_spec":
    case "show_acceptance_contract":
    case "show_closeout_summary":
    case "show_replan":
    case "show_operating_summary":
    case "show_agent_graph":
    case "show_active_agent_tree":
    case "show_integration_summary":
    case "list_child_tasks":
    case "list_blocked_subtasks":
    case "list_verifier_failed_subtasks":
    case "list_pending_integrations":
    case "list_orphan_subtasks":
    case "list_handoff_history":
    case "list_handoff":
    case "list_durable_memory":
    case "list_session_memory":
    case "list_unresolved_verifier":
    case "list_lifecycle_log":
    case "active_tasks":
    case "blocked_tasks":
    case "verifier_failed_tasks":
    case "abandoned_tasks":
    case "archived_tasks":
    case "registry":
      result = inspectTask({
        workspaceRoot,
        taskId,
        sessionId,
        mode: {
          task_state: "task_state",
          show_plan: "plan_state",
          show_task_spec: "task_spec",
          show_acceptance_contract: "acceptance_contract",
          show_closeout_summary: "closeout_summary",
          show_replan: "replan",
          show_operating_summary: "operating_summary",
          show_agent_graph: "agent_graph",
          show_active_agent_tree: "active_agent_tree",
          show_integration_summary: "integration_summary",
          list_child_tasks: "child_tasks",
          list_blocked_subtasks: "blocked_subtasks",
          list_verifier_failed_subtasks: "verifier_failed_subtasks",
          list_pending_integrations: "pending_integrations",
          list_orphan_subtasks: "orphan_subtasks",
          list_handoff_history: "handoff_history",
          list_handoff: "handoff_artifacts",
          list_durable_memory: "global_memory",
          list_session_memory: "session_memory",
          list_unresolved_verifier: "verifier_unresolved",
          list_lifecycle_log: "lifecycle_log",
          active_tasks: "active_tasks",
          blocked_tasks: "blocked_tasks",
          verifier_failed_tasks: "verifier_failed_tasks",
          abandoned_tasks: "abandoned_tasks",
          archived_tasks: "archived_tasks",
          registry: "registry",
        }[command],
        limit: parseLimit(),
      });
      break;
    default:
      throw new Error(`unknown_command:${command || "missing"}`);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
