#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const codexConfigPath = path.join(workspaceRoot, ".codex", "config.toml");
const manifestPath = path.join(workspaceRoot, "scripts", "config", "tool_registry_manifest.json");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function configuredMcpServerIds(configText) {
  return Array.from(configText.matchAll(/^\[mcp_servers\.([A-Za-z0-9_-]+)\]\s*$/gm))
    .map((match) => match[1])
    .filter(Boolean)
    .sort();
}

function main() {
  const configText = readText(codexConfigPath);
  const manifest = JSON.parse(readText(manifestPath));
  const configuredIds = configuredMcpServerIds(configText);
  const tools = Array.isArray(manifest.tools) ? manifest.tools : [];
  const toolById = new Map(tools.map((entry) => [String(entry.id || ""), entry]));

  assert.ok(configuredIds.length > 0, ".codex/config.toml must declare at least one MCP server");

  for (const id of configuredIds) {
    const entry = toolById.get(id);
    assert.ok(entry, `tool registry manifest must include configured MCP server: ${id}`);
    assert.strictEqual(typeof entry.capability, "string", `${id}.capability must be documented`);
    assert.ok(entry.capability.trim().length > 0, `${id}.capability must not be empty`);
    assert.strictEqual(typeof entry.riskTier, "string", `${id}.riskTier must be documented`);
    assert.strictEqual(typeof entry.status, "string", `${id}.status must be documented`);
    assert.strictEqual(typeof entry.fallbackMode, "string", `${id}.fallbackMode must be documented`);
    assert.strictEqual(typeof entry.reliabilityScore, "number", `${id}.reliabilityScore must be numeric`);
  }

  const stitch = toolById.get("stitch");
  if (stitch) {
    assert.strictEqual(stitch.status, "configured_optional", "Stitch must be explicit as an optional external MCP");
    assert.strictEqual(stitch.accessMode, "external-network", "Stitch must expose its external-network boundary");
    assert.ok(/stitch/i.test(stitch.fallbackMode), "Stitch fallback must name the degraded Stitch path");
  }

  process.stdout.write("PASS mcp_tool_registry_alignment_test\n");
}

main();
