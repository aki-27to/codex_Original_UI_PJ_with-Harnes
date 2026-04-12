"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function safeString(value, max = 400) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function readJsonIfExists(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function workspaceSeed(workspaceRoot) {
  return crypto.createHash("sha256").update(JSON.stringify({ workspaceRoot })).digest("hex").slice(0, 16);
}

function computeExportSessionId(seed) {
  return `export_${crypto.createHash("sha256").update(String(seed || "")).digest("hex").slice(0, 12)}`;
}

function resolveExportSessionIdFromCandidates(workspaceRoot, candidates = []) {
  const seed = (Array.isArray(candidates) ? candidates : [])
    .map((entry) => safeString(entry, 320))
    .find(Boolean)
    || `public_export:${workspaceSeed(workspaceRoot)}:no_current_truth`;
  return computeExportSessionId(seed);
}

function resolveExportSessionId(workspaceRoot) {
  const latestRunSummary = readJsonIfExists(path.join(workspaceRoot, "logs", "current", "latest_run_summary.json")) || {};
  const latestSignoffSummary = readJsonIfExists(path.join(workspaceRoot, "logs", "current", "latest_signoff_summary.json")) || {};
  const bundleRef = latestSignoffSummary && latestSignoffSummary.bundleRef && typeof latestSignoffSummary.bundleRef === "object"
    ? latestSignoffSummary.bundleRef
    : {};
  return resolveExportSessionIdFromCandidates(workspaceRoot, [
    latestRunSummary.turnId,
    latestRunSummary.turn_id,
    latestRunSummary.runId,
    latestRunSummary.run_id,
    latestSignoffSummary.selectedTurnId,
    latestSignoffSummary.selected_turn_id,
    latestSignoffSummary.turnId,
    latestSignoffSummary.turn_id,
    bundleRef.bundlePath,
    bundleRef.summaryPath,
    latestSignoffSummary.finalDecision,
    latestSignoffSummary.final_decision,
  ]);
}

module.exports = {
  computeExportSessionId,
  resolveExportSessionId,
  resolveExportSessionIdFromCandidates,
};
