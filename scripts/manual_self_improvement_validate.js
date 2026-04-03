#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  buildManualSelfImprovementRuntimeSummary,
  resolveArtifactPath,
  validateManualSelfImprovementCapture,
} = require("./lib/manual_self_improvement_runtime");
const { readJsonIfExists, repoRelative } = require("./lib/logging_surface");

const workspaceRoot = path.resolve(__dirname, "..");
const requestedPath = process.argv[2] ? String(process.argv[2]) : "";
const resolvedPath = resolveArtifactPath(workspaceRoot, requestedPath);
const payload = readJsonIfExists(resolvedPath);
const validation = validateManualSelfImprovementCapture(payload);
const summary = buildManualSelfImprovementRuntimeSummary({
  workspaceRoot,
  artifactPath: resolvedPath,
});

const result = {
  ok: validation.ok,
  artifactPath: repoRelative(workspaceRoot, resolvedPath),
  schema: summary.schema || (payload && payload.schema) || "",
  generatedAt: summary.generatedAt || (payload && payload.generatedAt) || "",
  entryCount: Number(summary.entryCount) || 0,
  status: summary.status || (validation.ok ? "ready" : "invalid"),
  invalidReason: summary.invalidReason || "",
  errors: validation.errors,
  summary,
};

const stream = validation.ok ? process.stdout : process.stderr;
stream.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = validation.ok ? 0 : 1;
