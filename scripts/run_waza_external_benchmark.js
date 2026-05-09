#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const workspaceRoot = path.resolve(__dirname, "..");
const defaultManifestPath = path.join(workspaceRoot, "benchmarks", "waza", "benchmark-manifest.json");
const analyzer = require(path.join(
  workspaceRoot,
  ".agents",
  "skills",
  "skill-design-review-codex",
  "scripts",
  "analyze-skill-design.js"
));

function normalizeSlash(value) {
  return String(value || "").replace(/\\/g, "/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function findWaza() {
  try {
    const result = childProcess.spawnSync("where.exe", ["waza"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      windowsHide: true,
      timeout: 10000,
    });
    if (result.status === 0) {
      const first = String(result.stdout || "").split(/\r?\n/).find(Boolean);
      return { available: Boolean(first), path: first || "", error: "" };
    }
    return { available: false, path: "", error: "not_found_on_path" };
  } catch (error) {
    return { available: false, path: "", error: error instanceof Error ? error.message : String(error) };
  }
}

function gateMap(result) {
  const gates = result.articleAlignment && Array.isArray(result.articleAlignment.gates)
    ? result.articleAlignment.gates
    : [];
  return gates.reduce((acc, gate) => {
    acc[gate.id] = gate.status;
    return acc;
  }, {});
}

function checkEqual(actual, expected, label, failures) {
  if (expected === undefined) return;
  if (actual !== expected) {
    failures.push(`${label}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function checkTask(result, task) {
  const expect = task.expect || {};
  const failures = [];
  const article = result.articleAlignment || {};
  const sections = result.sections || {};
  const gates = gateMap(result);

  checkEqual(article.status, expect.articleAlignmentStatus, "articleAlignment.status", failures);
  checkEqual(article.score, expect.articleAlignmentScore, "articleAlignment.score", failures);
  checkEqual(result.mechanicalScore, expect.mechanicalScore, "mechanicalScore", failures);
  checkEqual(article.failedGateCount, expect.failedGateCount, "articleAlignment.failedGateCount", failures);

  if (expect.articleAlignmentStatusNot !== undefined && article.status === expect.articleAlignmentStatusNot) {
    failures.push(`articleAlignment.status must not be ${JSON.stringify(expect.articleAlignmentStatusNot)}`);
  }
  if (expect.maxArticleAlignmentScore !== undefined && Number(article.score || 0) > expect.maxArticleAlignmentScore) {
    failures.push(`articleAlignment.score must be <= ${expect.maxArticleAlignmentScore} but got ${article.score}`);
  }
  if (expect.minFailedGateCount !== undefined && Number(article.failedGateCount || 0) < expect.minFailedGateCount) {
    failures.push(`failedGateCount must be >= ${expect.minFailedGateCount} but got ${article.failedGateCount}`);
  }
  for (const issue of expect.requiredIssues || []) {
    if (!Array.isArray(result.issues) || !result.issues.includes(issue)) {
      failures.push(`required issue missing: ${issue}`);
    }
  }
  for (const [gateId, expectedStatus] of Object.entries(expect.gateStatuses || {})) {
    checkEqual(gates[gateId], expectedStatus, `gate.${gateId}`, failures);
  }
  for (const [sectionName, expectedValue] of Object.entries(expect.sections || {})) {
    checkEqual(Boolean(sections[sectionName]), expectedValue, `sections.${sectionName}`, failures);
  }

  return failures;
}

function summarizeResult(result) {
  return {
    target: result.target,
    error: result.error || "",
    articleAlignment: result.articleAlignment ? {
      status: result.articleAlignment.status,
      score: result.articleAlignment.score,
      failedGateCount: result.articleAlignment.failedGateCount,
      gateStatuses: gateMap(result),
    } : null,
    mechanicalScore: result.mechanicalScore || 0,
    issues: result.issues || [],
    sections: result.sections || {},
  };
}

function runBenchmark(options = {}) {
  const manifestPath = path.resolve(options.manifestPath || defaultManifestPath);
  const manifest = readJson(manifestPath);
  const waza = findWaza();
  const generatedAt = new Date().toISOString();
  const taskResults = [];

  for (const task of manifest.tasks || []) {
    const targetPath = path.resolve(workspaceRoot, task.target);
    const analysis = analyzer.analyzeTarget(targetPath);
    const failures = checkTask(analysis, task);
    taskResults.push({
      id: task.id,
      description: task.description,
      target: normalizeSlash(path.relative(workspaceRoot, targetPath)),
      status: failures.length ? "failed" : "passed",
      score: failures.length ? 0 : 1,
      failures,
      analysis: summarizeResult(analysis),
    });
  }

  const passed = taskResults.filter((task) => task.status === "passed").length;
  const failed = taskResults.length - passed;
  const result = {
    schema: "waza-external-benchmark-result.v1",
    generatedAt,
    benchmarkFramework: "waza-compatible-external",
    benchmark: {
      name: manifest.name,
      skill: manifest.skill,
      description: manifest.description,
      manifestPath: normalizeSlash(path.relative(workspaceRoot, manifestPath)),
      wazaEval: manifest.wazaEval,
    },
    boundary: {
      harnessRuntimeIntegrated: false,
      writesActualSkillOutcomes: false,
      actualUseLogPolicy: manifest.actualUseLogPolicy,
    },
    wazaCli: {
      available: waza.available,
      path: waza.path,
      error: waza.error,
      note: waza.available
        ? "Real Waza CLI is available; the checked-in eval scaffold can also be run manually."
        : "Real Waza CLI was not found on PATH; this run used the repo-local Waza-compatible smoke runner.",
    },
    summary: {
      totalTasks: taskResults.length,
      passed,
      failed,
      passRate: taskResults.length ? passed / taskResults.length : 0,
    },
    outcomes: taskResults,
  };

  if (options.writeArtifacts !== false) {
    const resultPath = path.resolve(workspaceRoot, manifest.resultPath);
    const transcriptPath = path.resolve(workspaceRoot, manifest.transcriptPath);
    writeJson(resultPath, result);
    ensureDir(path.dirname(transcriptPath));
    const transcript = taskResults.map((task) => JSON.stringify({
      type: "benchmark_task_result",
      generatedAt,
      benchmark: manifest.name,
      taskId: task.id,
      status: task.status,
      score: task.score,
      failures: task.failures,
      target: task.target,
    })).join("\n");
    fs.writeFileSync(transcriptPath, `${transcript}\n`, "utf8");
    result.artifacts = {
      resultPath: normalizeSlash(path.relative(workspaceRoot, resultPath)),
      transcriptPath: normalizeSlash(path.relative(workspaceRoot, transcriptPath)),
    };
  }

  return result;
}

function main() {
  const manifestArg = process.argv.find((arg) => arg.startsWith("--manifest="));
  const manifestPath = manifestArg ? manifestArg.slice("--manifest=".length) : defaultManifestPath;
  const result = runBenchmark({ manifestPath });
  console.log(JSON.stringify({
    status: result.summary.failed === 0 ? "PASS" : "FAIL",
    benchmark: result.benchmark.name,
    wazaCliAvailable: result.wazaCli.available,
    totalTasks: result.summary.totalTasks,
    passed: result.summary.passed,
    failed: result.summary.failed,
    passRate: result.summary.passRate,
    artifacts: result.artifacts || null,
  }, null, 2));
  if (result.summary.failed > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  defaultManifestPath,
  runBenchmark,
};
