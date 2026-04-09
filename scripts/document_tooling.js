#!/usr/bin/env node
"use strict";

const path = require("path");

const {
  TOOL_DEFINITIONS,
  buildDocumentToolingRuntimeSnapshot,
  bootstrapDocumentTooling,
  findToolDefinition,
  formatDocumentToolingStatus,
  recommendDocumentTool,
  runToolPassthrough,
} = require("./lib/document_tooling_runtime");

function printHelp() {
  process.stdout.write(
    [
      "Document tooling hub",
      "",
      "Usage:",
      "  node scripts/document_tooling.js status [--json]",
      "  node scripts/document_tooling.js bootstrap [--force]",
      "  node scripts/document_tooling.js recommend <free-text task>",
      "  node scripts/document_tooling.js run <tool-id> -- <tool args...>",
      "",
      "Tool ids:",
      ...TOOL_DEFINITIONS.map((entry) => `  - ${entry.id}`),
      "",
    ].join("\n")
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const command = String(argv[0] || "help").toLowerCase();
  const workspaceRoot = path.resolve(__dirname, "..");

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "status" || command === "doctor") {
    const snapshot = buildDocumentToolingRuntimeSnapshot({
      workspaceRoot,
    });
    if (argv.includes("--json")) {
      process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
      return;
    }
    process.stdout.write(formatDocumentToolingStatus(snapshot));
    return;
  }

  if (command === "recommend") {
    const taskText = argv.slice(1).join(" ").trim();
    const recommendation = recommendDocumentTool(taskText);
    const definition = findToolDefinition(recommendation.toolId);
    process.stdout.write(
      [
        `tool: ${recommendation.toolId}`,
        `name: ${definition ? definition.displayName : recommendation.toolId}`,
        `reason: ${recommendation.reason}`,
        `signals: ${(recommendation.matchedSignals || []).join(", ") || "-"}`,
        "",
      ].join("\n")
    );
    return;
  }

  if (command === "bootstrap" || command === "install") {
    const force = argv.includes("--force");
    const result = await bootstrapDocumentTooling({
      workspaceRoot,
      force,
    });
    process.stdout.write(
      [
        "Document tooling bootstrap complete",
        `- Tool root: ${result.snapshot.toolRoot}`,
        `- Venv: ${result.snapshot.venvPath}`,
        `- JDK: ${result.jdkHome.replace(/\\/g, "/")}`,
        `- Wrappers: ${result.wrappers.map((entry) => entry.replace(/\\/g, "/")).join(", ")}`,
        "",
        formatDocumentToolingStatus(result.snapshot).trim(),
        "",
      ].join("\n")
    );
    return;
  }

  if (command === "run") {
    const toolId = argv[1];
    const dashIndex = argv.indexOf("--");
    const passthroughArgs = dashIndex >= 0 ? argv.slice(dashIndex + 1) : argv.slice(2);
    const result = runToolPassthrough(toolId, passthroughArgs, { workspaceRoot });
    if (!result.ok) {
      const lines = [
        result.error || "Tool execution failed.",
      ];
      if (result.bootstrapCommand) {
        lines.push(`Bootstrap with: ${result.bootstrapCommand}`);
      }
      if (result.installCommand) {
        lines.push(`Install with: ${result.installCommand}`);
      }
      if (result.docsUrl) {
        lines.push(`Docs: ${result.docsUrl}`);
      }
      if (Array.isArray(result.availableTools)) {
        lines.push(`Known tools: ${result.availableTools.join(", ")}`);
      }
      process.stderr.write(`${lines.join("\n")}\n`);
    }
    process.exitCode = Number.isInteger(result.code) ? result.code : 1;
    return;
  }

  printHelp();
  process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
