#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  loadMultiAgentBaseline,
  runBoundedWorkflow,
  runSingleAgentFallback,
} = require("./lib/bounded_multi_agent_orchestrator");

const workspaceRoot = path.resolve(__dirname, "..");

function readFlag(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((entry) => entry.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function main() {
  const command = (process.argv[2] || "").trim();
  if (command !== "run_case") {
    throw new Error(`unknown_command:${command || "missing"}`);
  }
  const caseId = readFlag("case-id");
  const baseline = loadMultiAgentBaseline();
  const selected = baseline.cases.find((entry) => entry.id === caseId);
  if (!selected) {
    throw new Error(`unknown_case:${caseId || "missing"}`);
  }
  const taskId = `${selected.id}-${Date.now()}`;
  const orchestrationMode = String(selected.orchestrationMode || "");
  const result = orchestrationMode === "single_agent_fallback"
    ? runSingleAgentFallback({
        workspaceRoot,
        taskId,
        sessionId: "cli",
        title: selected.title,
        objective: selected.objective,
        familyId: selected.familyId,
        acceptanceCriteria: selected.acceptanceCriteria,
        note: "single-agent fallback used from CLI",
      })
    : await runBoundedWorkflow({
        workspaceRoot,
        taskId,
        sessionId: "cli",
        title: selected.title,
        objective: selected.objective,
        familyId: selected.familyId,
        acceptanceCriteria: selected.acceptanceCriteria,
        workflow: selected.workflow,
        casePayload: selected.payload || {},
        allowFallback: orchestrationMode !== "multi_agent_required",
      });
  process.stdout.write(`${JSON.stringify({ ok: true, caseId, taskId, result }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}
