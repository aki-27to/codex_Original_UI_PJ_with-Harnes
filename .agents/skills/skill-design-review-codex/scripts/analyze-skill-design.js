#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const schema = "skill-design-analysis.v1";
const knownPrefixes = ["ref", "run", "wrap", "assign", "delegate"];
const skipDirs = new Set([".git", "node_modules", ".venv", "dist", "build"]);

function usage() {
  console.error("Usage: node analyze-skill-design.js <skill-dir-or-SKILL.md> [more targets]");
}

function normalizeSlash(value) {
  return String(value || "").replace(/\\/g, "/");
}

function stripQuotes(value) {
  const trimmed = String(value || "").trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return { fields: {}, raw: "", error: "missing_frontmatter" };
  }
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (pair) {
      fields[pair[1]] = stripQuotes(pair[2]);
    }
  }
  return { fields, raw: match[1], error: "" };
}

function resolveSkillFile(target) {
  const absolute = path.resolve(target);
  if (!fs.existsSync(absolute)) {
    return { error: "target_not_found", target: absolute };
  }
  const stat = fs.statSync(absolute);
  if (stat.isDirectory()) {
    const skillFile = path.join(absolute, "SKILL.md");
    if (!fs.existsSync(skillFile)) {
      return { error: "missing_SKILL_md", target: absolute };
    }
    return { skillFile, skillRoot: absolute, error: "" };
  }
  return { skillFile: absolute, skillRoot: path.dirname(absolute), error: "" };
}

function walkFiles(root, current = root, out = []) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      walkFiles(root, fullPath, out);
      continue;
    }
    out.push(fullPath);
  }
  return out;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasHeading(body, names) {
  return names.some((name) => {
    const escaped = escapeRegex(name);
    return new RegExp(`^#{1,6}\\s+${escaped}(?:\\s|$)`, "im").test(body);
  });
}

function detectPrefix(name) {
  for (const prefix of knownPrefixes) {
    if (name === prefix || name.startsWith(`${prefix}-`)) {
      return prefix;
    }
  }
  return "";
}

function resourceInfo(skillRoot, source) {
  const files = walkFiles(skillRoot)
    .filter((file) => path.basename(file).toLowerCase() !== "skill.md")
    .map((file) => normalizeSlash(path.relative(skillRoot, file)))
    .sort();

  const resourceFiles = files.filter((file) => /^(references?|scripts|assets)\//i.test(file));
  const unreferenced = [];
  for (const file of resourceFiles) {
    const base = path.basename(file);
    if (!source.includes(file) && !source.includes(base)) {
      unreferenced.push(file);
    }
  }
  return { files, resourceFiles, unreferenced };
}

function countMatches(source, regex) {
  const matches = source.match(regex);
  return matches ? matches.length : 0;
}

function collectIssues(metrics) {
  const issues = [];
  if (!metrics.frontmatter.hasName) issues.push("missing_name");
  if (!metrics.frontmatter.hasDescription) issues.push("missing_description");
  if (metrics.frontmatter.name && metrics.expectedName && metrics.frontmatter.name !== metrics.expectedName) {
    issues.push("name_does_not_match_folder");
  }
  if (metrics.description.length > 360) issues.push("description_too_long");
  if (!metrics.description.hasTriggerCue) issues.push("description_trigger_unclear");
  if (metrics.body.lineCount > 500) issues.push("skill_body_over_500_lines");
  if (metrics.resources.unreferenced.length > 0) issues.push("resource_files_not_referenced_from_skill");
  if (!metrics.sections.hasPurpose) issues.push("missing_purpose_section");
  if (!metrics.sections.hasProcedure) issues.push("missing_procedure_section");
  if (!metrics.sections.hasOutputContract) issues.push("missing_output_contract");
  if (!metrics.sections.hasFailureGuard) issues.push("missing_failure_guard");
  if (!metrics.sections.hasEvidence && !metrics.sections.hasVerification) issues.push("missing_evidence_or_verification_section");
  if (metrics.language.allCapsAlwaysNever > 2) issues.push("excessive_all_caps_invariants");
  if (metrics.language.selfReportTerms > 0) issues.push("self_report_language_present");
  if (metrics.context.externalLlmInjectionLines.length > 0) issues.push("external_llm_dynamic_context_requires_untrusted_boundary");
  return issues;
}

function mechanicalScore(metrics) {
  const checks = [
    metrics.frontmatter.hasName,
    metrics.frontmatter.hasDescription,
    metrics.description.length > 0 && metrics.description.length <= 360,
    metrics.description.hasTriggerCue,
    metrics.sections.hasPurpose,
    metrics.sections.hasProcedure,
    metrics.sections.hasOutputContract,
    metrics.sections.hasFailureGuard,
    metrics.sections.hasEvidence || metrics.sections.hasVerification,
    metrics.body.lineCount <= 500,
    metrics.resources.unreferenced.length === 0,
    metrics.language.allCapsAlwaysNever <= 2,
    metrics.language.selfReportTerms === 0,
    metrics.context.externalLlmInjectionLines.length === 0 || metrics.context.hasUntrustedBoundary,
  ];
  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100);
}

function analyzeTarget(target) {
  const resolved = resolveSkillFile(target);
  if (resolved.error) {
    return { target, error: resolved.error, schema };
  }

  const source = fs.readFileSync(resolved.skillFile, "utf8");
  const frontmatter = parseFrontmatter(source);
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const name = frontmatter.fields.name || "";
  const description = frontmatter.fields.description || "";
  const expectedName = path.basename(resolved.skillRoot);
  const prefix = detectPrefix(name);
  const resources = resourceInfo(resolved.skillRoot, source);
  const externalLlmInjectionLines = body
    .split(/\r?\n/)
    .map((line, index) => ({ index: index + 1, line }))
    .filter((entry) => /!`/.test(entry.line) && /\b(codex|gemini|claude|llm|openai)\b/i.test(entry.line))
    .map((entry) => ({ line: entry.index, text: entry.line.trim().slice(0, 180) }));

  const metrics = {
    schema,
    target: normalizeSlash(target),
    skillFile: normalizeSlash(resolved.skillFile),
    skillRoot: normalizeSlash(resolved.skillRoot),
    expectedName,
    frontmatter: {
      hasName: Boolean(name),
      hasDescription: Boolean(description),
      name,
      description,
      extraFields: Object.keys(frontmatter.fields).filter((key) => !["name", "description"].includes(key)).sort(),
      error: frontmatter.error,
    },
    description: {
      length: description.length,
      hasTriggerCue: /\b(use when|when|trigger|review|evaluate|diagnose|audit|skill|SKILL\.md)\b/i.test(description),
    },
    taxonomy: {
      prefix,
      followsKnownPrefix: Boolean(prefix),
      purposeHint: /reference|knowledge|policy|rubric/i.test(body) ? "knowledge" : /output|artifact|generate|produce|edit|write/i.test(body) ? "workflow" : "unknown",
      evaluatorHint: /evaluat|review|score|rubric|judge/i.test(body),
      sideEffectHint: /edit|write|create|delete|api|deploy|commit|push/i.test(body),
    },
    body: {
      lineCount: body.split(/\r?\n/).length,
      charCount: body.length,
      headingCount: countMatches(body, /^#{1,6}\s+/gm),
    },
    sections: {
      hasPurpose: hasHeading(body, ["Purpose", "Goal", "目的", "ç›®çš„"]),
      hasProcedure: hasHeading(body, ["Procedure", "Workflow", "Process", "手順", "æ‰‹é †", "Deterministic Steps"]),
      hasOutputContract: hasHeading(body, ["Output Contract", "Output", "Deliverable", "Input / Output", "出力契約", "å‡ºåŠ›å¥‘ç´„"]),
      hasEvidence: hasHeading(body, ["Evidence", "Evidence Surfaces", "証拠", "è¨¼æ‹ ", "エビデンス"]),
      hasVerification: hasHeading(body, ["Verification", "Validation", "検証", "æ¤œè¨¼", "Tests", "完了条件", "å®Œäº†æ¡ä»¶"]),
      hasFailureGuard: hasHeading(body, ["Failure Guard", "Guardrails", "失敗防止", "失敗ガード", "ガード", "注意", "å®Œäº†æ¡ä»¶"]),
      hasGotchas: hasHeading(body, ["Gotchas", "Common Pitfalls", "注意点", "落とし穴"]),
      hasResources: hasHeading(body, ["Resources", "References", "Additional Resources", "参照", "参考", "リソース"]),
    },
    resources,
    language: {
      allCapsAlwaysNever: countMatches(body, /\b(ALWAYS|NEVER)\b/g),
      whyCues: countMatches(body, /\b(because|reason|why|so that|therefore)\b/gi),
      selfReportTerms: countMatches(body, /\b(done|completed|high quality|looks good|problem solved)\b/gi),
    },
    context: {
      dynamicInjectionCount: countMatches(body, /!`/g),
      externalLlmInjectionLines,
      hasUntrustedBoundary: /untrusted|do not treat.*fact|external.*opinion|delegate.*untrusted/i.test(body),
    },
  };

  const issues = collectIssues(metrics);
  return {
    ...metrics,
    issues,
    mechanicalScore: mechanicalScore(metrics),
  };
}

function main() {
  const targets = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  if (targets.length === 0) {
    usage();
    process.exitCode = 2;
    return;
  }
  const results = targets.map(analyzeTarget);
  const report = {
    schema,
    generatedAt: new Date().toISOString(),
    targetCount: results.length,
    results,
    summary: {
      errorCount: results.filter((result) => result.error).length,
      averageMechanicalScore: results.length
        ? Math.round(results.reduce((sum, result) => sum + Number(result.mechanicalScore || 0), 0) / results.length)
        : 0,
      issueCounts: results.reduce((acc, result) => {
        for (const issue of result.issues || []) {
          acc[issue] = (acc[issue] || 0) + 1;
        }
        return acc;
      }, {}),
    },
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
