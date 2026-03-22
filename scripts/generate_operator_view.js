#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { getLoggingSurfacePaths } = require("./lib/logging_surface");
const { buildOperatorViewSummary, loadOptionalJson, repoRelative } = require("./lib/constitution_conformance");

const workspaceRoot = path.resolve(__dirname, "..");
const loggingSurfacePaths = getLoggingSurfacePaths(workspaceRoot);

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveBundleRoot() {
  const explicit = typeof process.argv[2] === "string" ? process.argv[2].trim() : "";
  return explicit ? path.resolve(workspaceRoot, explicit) : "";
}

function buildFromBundle(bundleRoot) {
  const conformanceReport = loadOptionalJson(path.join(bundleRoot, "conformance_report.json")) || {};
  const operatorView =
    conformanceReport && conformanceReport.operatorView && typeof conformanceReport.operatorView === "object"
      ? conformanceReport.operatorView
      : buildOperatorViewSummary({
          latestRunSummary: loadOptionalJson(path.join(bundleRoot, "latest_run_summary.json")) || {},
          reviewBundle: conformanceReport.reviewBundle || {},
          releaseDecision: conformanceReport.releaseDecision || {},
          conformanceReport,
          routingDecision: conformanceReport.routingDecision || {},
        });
  const outputPath = path.join(bundleRoot, "operator_view_summary.json");
  writeJson(outputPath, operatorView);
  return { outputPath, operatorView };
}

function buildFromCurrent() {
  const conformanceReport = loadOptionalJson(path.join(loggingSurfacePaths.currentRoot, "conformance_report.json")) || {};
  const operatorView =
    conformanceReport && conformanceReport.operatorView && typeof conformanceReport.operatorView === "object"
      ? conformanceReport.operatorView
      : buildOperatorViewSummary({
          latestRunSummary: loadOptionalJson(loggingSurfacePaths.currentLatestRunSummaryPath) || {},
          reviewBundle: conformanceReport.reviewBundle || {},
          releaseDecision: conformanceReport.releaseDecision || {},
          conformanceReport,
          routingDecision: conformanceReport.routingDecision || {},
        });
  const outputPath = path.join(loggingSurfacePaths.currentRoot, "operator_view_summary.json");
  writeJson(outputPath, operatorView);
  return { outputPath, operatorView };
}

function main() {
  const bundleRoot = resolveBundleRoot();
  const result = bundleRoot ? buildFromBundle(bundleRoot) : buildFromCurrent();
  console.log(JSON.stringify({ ok: true, outputPath: repoRelative(result.outputPath) }, null, 2));
}

main();
