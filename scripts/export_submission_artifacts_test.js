"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const submissionRoot = path.join(workspaceRoot, "\u63d0\u51fa\u7528");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const currentLatest = readJson(path.join(workspaceRoot, "logs", "current", "latest_signoff_summary.json"));
const submissionManifest = readJson(path.join(submissionRoot, "submission_manifest.json"));
const exportedLatest = readJson(path.join(submissionRoot, "operator__latest_signoff_summary.json"));
const exportedBoundaryTrace = path.join(submissionRoot, "bundle__boundary_task_trace_summary.json");

assert(currentLatest.bundleRef && currentLatest.bundleRef.bundleName, "current latest signoff summary must declare bundleRef.bundleName");
assert.strictEqual(
  submissionManifest.bundleName,
  currentLatest.bundleRef.bundleName,
  "submission export must follow the current latest signoff bundle"
);
assert(exportedLatest.bundleRef && exportedLatest.bundleRef.bundleName, "exported latest signoff summary must declare bundleRef.bundleName");
assert.strictEqual(
  exportedLatest.bundleRef.bundleName,
  submissionManifest.bundleName,
  "flat export latest signoff summary must stay aligned with the selected bundle"
);
assert.strictEqual(
  fs.existsSync(exportedBoundaryTrace),
  true,
  "submission export must include the boundary task trace artifact"
);

process.stdout.write("PASS export_submission_artifacts_test\n");
