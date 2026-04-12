#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const outputRoot = path.join(workspaceRoot, "\u63d0\u51fa\u7528");
const withRaw = process.argv.includes("--with-raw");

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function safeReadJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function repoRelative(filePath) {
  return path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
}

function toWorkspacePath(relativeOrAbsolutePath) {
  if (!relativeOrAbsolutePath) return "";
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.resolve(workspaceRoot, String(relativeOrAbsolutePath));
}

function latestSignoffBundleRoot() {
  const currentSummary = safeReadJson(path.join(workspaceRoot, "logs", "current", "latest_signoff_summary.json"));
  const bundlePath = currentSummary
    && currentSummary.bundleRef
    && typeof currentSummary.bundleRef.bundlePath === "string"
    && currentSummary.bundleRef.bundlePath.trim()
      ? currentSummary.bundleRef.bundlePath.trim()
      : "";
  if (bundlePath) return toWorkspacePath(bundlePath);

  const signoffRoot = path.join(workspaceRoot, "logs", "bundles", "signoff");
  if (!fs.existsSync(signoffRoot)) return "";
  const candidates = fs.readdirSync(signoffRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const bundleRoot = path.join(signoffRoot, entry.name);
      const summaryPath = path.join(bundleRoot, "signoff_summary.json");
      if (!fs.existsSync(summaryPath)) return null;
      return {
        bundleRoot,
        mtimeMs: Number(fs.statSync(summaryPath).mtimeMs || 0),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0] ? candidates[0].bundleRoot : "";
}

function clearOutputRoot() {
  ensureDir(outputRoot);
  for (const name of fs.readdirSync(outputRoot)) {
    const targetPath = path.join(outputRoot, name);
    let stat = null;
    try {
      stat = fs.lstatSync(targetPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(targetPath);
    }
  }
}

function copyFileFlat(sourcePath, outputName, bucket, manifest) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return;
  const destinationPath = path.join(outputRoot, outputName);
  fs.copyFileSync(sourcePath, destinationPath);
  manifest.files.push({
    bucket,
    output: outputName,
    sourceRelativePath: repoRelative(sourcePath),
    bytes: fs.statSync(destinationPath).size,
  });
}

function buildSelections(bundleRoot) {
  const bundleFile = (name) => bundleRoot ? path.join(bundleRoot, name) : "";
  return {
    defaultSelections: [
      ["logs/current/operator_summary.json", "operator__operator_summary.json", "operator"],
      ["logs/current/design_conformance_summary.json", "operator__design_conformance_summary.json", "operator"],
      ["logs/current/latest_run_summary.json", "operator__latest_run_summary.json", "operator"],
      ["logs/current/review_load_breakdown.json", "operator__review_load_breakdown.json", "operator"],
      ["logs/current/latest_signoff_summary.json", "operator__latest_signoff_summary.json", "operator"],
      [bundleFile("signoff_summary.json"), "bundle__signoff_summary.json", "bundle"],
      [bundleFile("runtime_snapshot.json"), "bundle__runtime_snapshot.json", "bundle"],
      [bundleFile("core_harness_workflow_run.json"), "bundle__core_harness_workflow_run.json", "bundle"],
      [bundleFile("natural_task_trace_summary.json"), "bundle__natural_task_trace_summary.json", "bundle"],
      [bundleFile("conformance_report.json"), "bundle__conformance_report.json", "bundle"],
      [bundleFile("operator_view_summary.json"), "bundle__operator_view_summary.json", "bundle"],
      [bundleFile("bundle_surface_map.json"), "bundle__bundle_surface_map.json", "bundle"],
      ["server.js", "repo__server.js", "repo"],
      ["server_impl.js", "repo__server_impl.js", "repo"],
      ["server/request_handler.js", "repo__server__request_handler.js", "repo"],
      ["server/bootstrap.js", "repo__server__bootstrap.js", "repo"],
      ["server/routes/runtime_routes.js", "repo__server__routes__runtime_routes.js", "repo"],
      ["server/routes/batch_routes.js", "repo__server__routes__batch_routes.js", "repo"],
      ["server/routes/eval_routes.js", "repo__server__routes__eval_routes.js", "repo"],
      ["server/routes/exec_routes.js", "repo__server__routes__exec_routes.js", "repo"],
      ["scripts/generate_signoff_evidence.js", "repo__generate_signoff_evidence.js", "repo"],
      ["scripts/export_submission_artifacts.js", "repo__export_submission_artifacts.js", "repo"],
      ["scripts/restructure_logging_surface.js", "repo__restructure_logging_surface.js", "repo"],
      ["scripts/lib/logging_surface.js", "repo__logging_surface.js", "repo"],
      ["docs/CURRENT_ARCHITECTURE.md", "repo__CURRENT_ARCHITECTURE.md", "repo"],
      ["docs/ARCHITECTURE_CHANGELOG.md", "repo__ARCHITECTURE_CHANGELOG.md", "repo"],
      ["docs/SERVER_ARCHITECTURE_MAP.md", "repo__SERVER_ARCHITECTURE_MAP.md", "repo"],
      ["docs/HARNESS_LOGGING_MAP.md", "repo__HARNESS_LOGGING_MAP.md", "repo"],
      ["README.md", "repo__README.md", "repo"],
      ["HARNESS_MAP.md", "repo__HARNESS_MAP.md", "repo"],
    ],
    rawSelections: [
      ["logs/archive/admin/log_inventory_before.json", "raw__log_inventory_before.json", "raw"],
      ["logs/archive/admin/log_inventory_after.json", "raw__log_inventory_after.json", "raw"],
      ["logs/archive/admin/log_deletion_report.json", "raw__log_deletion_report.json", "raw"],
      [bundleFile(path.join("raw", "harness_execution_memory.json")), "raw__bundle_harness_execution_memory.json", "raw"],
      [bundleFile(path.join("raw", "eval_runs.jsonl")), "raw__bundle_eval_runs.jsonl", "raw"],
    ],
  };
}

function rewriteJsonReferences(manifest, bundleRoot) {
  const replacements = new Map();
  const canonicalRefs = new Map([
    ["logs/current/operator_summary.json", "operator__operator_summary.json"],
    ["logs/current/design_conformance_summary.json", "operator__design_conformance_summary.json"],
    ["logs/current/latest_run_summary.json", "operator__latest_run_summary.json"],
    ["logs/current/review_load_breakdown.json", "operator__review_load_breakdown.json"],
    ["logs/current/latest_signoff_summary.json", "operator__latest_signoff_summary.json"],
  ]);
  for (const entry of manifest.files) {
    const absoluteSource = toWorkspacePath(entry.sourceRelativePath).replace(/\\/g, "/");
    replacements.set(entry.sourceRelativePath, entry.output);
    replacements.set(absoluteSource, entry.output);
  }

  const normalizedBundleRoot = bundleRoot ? repoRelative(bundleRoot) : "";
  if (normalizedBundleRoot) {
    canonicalRefs.set(normalizedBundleRoot, "bundle__bundle_surface_map.json");
    canonicalRefs.set(`${normalizedBundleRoot}/signoff_summary.json`, "bundle__signoff_summary.json");
    canonicalRefs.set(`${normalizedBundleRoot}/runtime_snapshot.json`, "bundle__runtime_snapshot.json");
    canonicalRefs.set(`${normalizedBundleRoot}/core_harness_workflow_run.json`, "bundle__core_harness_workflow_run.json");
    canonicalRefs.set(`${normalizedBundleRoot}/natural_task_trace_summary.json`, "bundle__natural_task_trace_summary.json");
    canonicalRefs.set(`${normalizedBundleRoot}/conformance_report.json`, "bundle__conformance_report.json");
    canonicalRefs.set(`${normalizedBundleRoot}/operator_view_summary.json`, "bundle__operator_view_summary.json");
    canonicalRefs.set(`${normalizedBundleRoot}/bundle_surface_map.json`, "bundle__bundle_surface_map.json");
    replacements.set(normalizedBundleRoot, "bundle__bundle_surface_map.json");
    replacements.set(toWorkspacePath(normalizedBundleRoot).replace(/\\/g, "/"), "bundle__bundle_surface_map.json");
  }
  for (const [sourcePath, outputName] of canonicalRefs.entries()) {
    replacements.set(sourcePath, outputName);
    replacements.set(toWorkspacePath(sourcePath).replace(/\\/g, "/"), outputName);
  }

  const orderedReplacements = Array.from(replacements.entries()).sort((left, right) => right[0].length - left[0].length);
  const stripPatterns = [
    /\blogs\/(?:current|bundles|archive)\b(?:\/[^\s",}\]]+)?/g,
    /[A-Za-z]:\\[^"\r\n]*?logs\\(?:current|bundles|archive)\b[^"\r\n]*/g,
    /[A-Za-z]:\/[^"\r\n]*?\/logs\/(?:current|bundles|archive)\b[^"\r\n]*/g,
    /bundle__bundle_surface_map\.json\/[^\s",}\]]+/g,
  ];

  for (const entry of manifest.files) {
    if (!entry.output.toLowerCase().endsWith(".json")) continue;
    const outputPath = path.join(outputRoot, entry.output);
    let text = fs.readFileSync(outputPath, "utf8");
    for (const [sourcePath, outputName] of orderedReplacements) {
      text = text.split(sourcePath).join(outputName);
    }
    for (const pattern of stripPatterns) {
      text = text.replace(pattern, "not_in_default_export");
    }
    fs.writeFileSync(outputPath, text, "utf8");
    entry.bytes = fs.statSync(outputPath).size;
  }
}

function writeManifest(manifest) {
  const cleanedFiles = manifest.files.map((entry) => ({
    bucket: entry.bucket,
    output: entry.output,
    bytes: entry.bytes,
  }));
  const finalManifest = {
    ...manifest,
    files: cleanedFiles,
    fileCount: cleanedFiles.length + 1,
  };
  fs.writeFileSync(path.join(outputRoot, "submission_manifest.json"), `${JSON.stringify(finalManifest, null, 2)}\n`, "utf8");
  return finalManifest;
}

function main() {
  const bundleRoot = latestSignoffBundleRoot();
  const { defaultSelections, rawSelections } = buildSelections(bundleRoot);
  const manifest = {
    schema: "submission-export.v2",
    generatedAt: new Date().toISOString(),
    mode: withRaw ? "default+raw" : "default",
    selectionPolicy: "review-first",
    bundleName: bundleRoot ? path.basename(bundleRoot) : "",
    notes: [
      "Default export is the fixed operator-first flat bundle.",
      withRaw
        ? "raw/admin artifacts were added because --with-raw was requested."
        : "raw/admin artifacts are excluded unless --with-raw is requested.",
    ],
    files: [],
  };

  clearOutputRoot();
  for (const [source, outputName, bucket] of defaultSelections) {
    copyFileFlat(toWorkspacePath(source), outputName, bucket, manifest);
  }
  if (withRaw) {
    for (const [source, outputName, bucket] of rawSelections) {
      copyFileFlat(toWorkspacePath(source), outputName, bucket, manifest);
    }
  }

  rewriteJsonReferences(manifest, bundleRoot);
  const finalManifest = writeManifest(manifest);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    outputRoot: repoRelative(outputRoot),
    fileCount: finalManifest.fileCount,
    mode: finalManifest.mode,
  }, null, 2)}\n`);
}

main();
