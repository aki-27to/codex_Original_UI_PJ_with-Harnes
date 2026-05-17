#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const schema = "skill-design-analysis.v1";
const scoreProfile = "article-alignment-gated.v2";
const knownPrefixes = ["ref", "run", "wrap", "assign", "delegate"];
const skipDirs = new Set([".git", "node_modules", ".venv", "dist", "build"]);
const requiredCatalogArrays = [
  "useWhen",
  "avoidWhen",
  "expectedArtifacts",
  "evidenceSurfaces",
  "workerDecisionConnection",
  "promotionCriteria",
  "rollbackCriteria",
];
const requiredAxisFields = ["purpose", "trigger", "shape", "role"];

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

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return null;
  }
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

function findWorkspaceRoot(startDir) {
  let current = path.resolve(startDir);
  while (current && current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "scripts", "config", "repo_local_skill_catalog.json"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return "";
}

function stringArrayComplete(value) {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string" && entry.trim());
}

function loadRepoContracts(skillFile, skillName) {
  const workspaceRoot = findWorkspaceRoot(path.dirname(skillFile));
  if (!workspaceRoot) {
    return {
      workspaceRoot: "",
      relativeSkillFile: "",
      catalogEntry: null,
      flowRole: null,
      catalogComplete: false,
      flowRoleComplete: false,
      repoLocalContractComplete: false,
      isRepoLocalSkill: false,
    };
  }

  const relativeSkillFile = normalizeSlash(path.relative(workspaceRoot, skillFile));
  const isRepoLocalSkill = relativeSkillFile.startsWith(".agents/skills/");
  const catalog = readJsonIfExists(path.join(workspaceRoot, "scripts", "config", "repo_local_skill_catalog.json"));
  const flow = readJsonIfExists(path.join(workspaceRoot, "scripts", "config", "skill_flow_contract.json"));
  const catalogEntry = catalog && Array.isArray(catalog.skills)
    ? catalog.skills.find((entry) => normalizeSlash(entry.path) === relativeSkillFile || entry.id === skillName) || null
    : null;
  const flowRole = flow && flow.skillRoles && skillName ? flow.skillRoles[skillName] || null : null;
  const catalogComplete = Boolean(catalogEntry)
    && requiredCatalogArrays.every((key) => stringArrayComplete(catalogEntry[key]));
  const flowRoleComplete = Boolean(flowRole)
    && typeof flowRole.kind === "string"
    && flowRole.kind.trim()
    && typeof flowRole.primaryResponsibility === "string"
    && flowRole.primaryResponsibility.trim().length >= 40
    && typeof flowRole.canStartFlow === "boolean"
    && typeof flowRole.canEndFlow === "boolean";

  return {
    workspaceRoot,
    relativeSkillFile,
    catalogEntry,
    flowRole,
    catalogComplete,
    flowRoleComplete,
    repoLocalContractComplete: catalogComplete && flowRoleComplete,
    isRepoLocalSkill,
  };
}

function gate(id, status, criterion, evidence) {
  return { id, status, criterion, evidence };
}

function gateStatus(condition, fallbackStatus = "fail") {
  return condition ? "pass" : fallbackStatus;
}

function buildArticleAlignment(metrics) {
  const hasAxisMetadata = requiredAxisFields.every((field) => (
    Object.prototype.hasOwnProperty.call(metrics.frontmatter.extraFieldValues, field)
      && String(metrics.frontmatter.extraFieldValues[field] || "").trim()
  ));
  const repoAlt = metrics.contracts.repoLocalContractComplete;
  const hasOutputAndEvidence = metrics.sections.hasOutputContract
    && (metrics.sections.hasEvidence || metrics.sections.hasVerification)
    && metrics.sections.hasFailureGuard;
  const evaluatorNeedsIntegrity = metrics.taxonomy.evaluatorHint || metrics.frontmatter.extraFieldValues.role === "evaluator";
  const repoAlternativeEvidence = {
    catalogEntryFound: metrics.contracts.catalogEntryFound,
    flowRoleFound: metrics.contracts.flowRoleFound,
    catalogComplete: metrics.contracts.catalogComplete,
    flowRoleComplete: metrics.contracts.flowRoleComplete,
    repoLocalContractComplete: metrics.contracts.repoLocalContractComplete,
    flowKind: metrics.contracts.flowKind,
  };
  const gates = [
    gate(
      "activation_contract",
      gateStatus(metrics.frontmatter.hasName && metrics.frontmatter.hasDescription && metrics.description.hasTriggerCue && metrics.description.length <= 360),
      "name and description must make invocation conditions clear",
      {
        hasName: metrics.frontmatter.hasName,
        hasDescription: metrics.frontmatter.hasDescription,
        name: metrics.frontmatter.name,
        descriptionLength: metrics.description.length,
        hasTriggerCue: metrics.description.hasTriggerCue,
      }
    ),
    gate(
      "purpose_trigger_shape_role",
      hasAxisMetadata ? "pass" : (repoAlt ? "acceptable_alt" : "fail"),
      "article axes must be explicit in frontmatter or covered by machine-checked repo catalog/flow",
      {
        hasAxisMetadata,
        requiredAxisFields,
        frontmatterExtraFields: metrics.frontmatter.extraFields,
        repoLocalAlternative: repoAlternativeEvidence,
      }
    ),
    gate(
      "naming_side_effect_contract",
      metrics.taxonomy.followsKnownPrefix ? "pass" : (repoAlt ? "acceptable_alt" : "fail"),
      "name must expose side effects/role through article prefix or repo-local checked convention",
      {
        name: metrics.frontmatter.name,
        prefix: metrics.taxonomy.prefix,
        followsKnownPrefix: metrics.taxonomy.followsKnownPrefix,
        sideEffectHint: metrics.taxonomy.sideEffectHint,
        evaluatorHint: metrics.taxonomy.evaluatorHint,
        repoLocalAlternative: repoAlternativeEvidence,
      }
    ),
    gate(
      "layer_fit_contract",
      gateStatus(metrics.sections.hasProcedure && (metrics.articleSignals.mentionsLayerChoice || !metrics.taxonomy.sideEffectHint || repoAlt)),
      "skill text must not replace deterministic scripts, hooks, CI, CLI, MCP, or API controls",
      {
        hasProcedure: metrics.sections.hasProcedure,
        mentionsLayerChoice: metrics.articleSignals.mentionsLayerChoice,
        sideEffectHint: metrics.taxonomy.sideEffectHint,
        repoLocalContractComplete: metrics.contracts.repoLocalContractComplete,
      }
    ),
    gate(
      "progressive_disclosure",
      gateStatus(metrics.body.lineCount <= 500 && metrics.resources.unreferenced.length === 0),
      "SKILL.md should stay lean and directly reference bundled resources",
      {
        lineCount: metrics.body.lineCount,
        resourceFileCount: metrics.resources.resourceFiles.length,
        unreferencedResourceCount: metrics.resources.unreferenced.length,
        unreferencedResources: metrics.resources.unreferenced,
      }
    ),
    gate(
      "output_evidence_contract",
      gateStatus(hasOutputAndEvidence),
      "workflow/adoption claims need output, evidence or verification, and failure guard",
      {
        hasOutputContract: metrics.sections.hasOutputContract,
        hasEvidence: metrics.sections.hasEvidence,
        hasVerification: metrics.sections.hasVerification,
        hasFailureGuard: metrics.sections.hasFailureGuard,
      }
    ),
    gate(
      "self_report_rejection",
      gateStatus(metrics.language.selfReportTerms === 0 && metrics.articleSignals.mentionsEvidenceBoundary),
      "100 points cannot rely on done/looks-good language without artifacts or evidence",
      {
        selfReportTerms: metrics.language.selfReportTerms,
        mentionsEvidenceBoundary: metrics.articleSignals.mentionsEvidenceBoundary,
      }
    ),
    gate(
      "generator_evaluator_integrity",
      gateStatus(!evaluatorNeedsIntegrity || metrics.articleSignals.mentionsEvaluatorIntegrity),
      "evaluators must use fixed criteria and treat generator/delegate output as untrusted",
      {
        evaluatorNeedsIntegrity,
        evaluatorHint: metrics.taxonomy.evaluatorHint,
        frontmatterRole: metrics.frontmatter.extraFieldValues.role || "",
        mentionsEvaluatorIntegrity: metrics.articleSignals.mentionsEvaluatorIntegrity,
      }
    ),
    gate(
      "governance_lifecycle",
      metrics.contracts.isRepoLocalSkill ? gateStatus(repoAlt) : "not_applicable",
      "repo-local skills need catalog and flow lifecycle surfaces when this repo enforces them",
      {
        isRepoLocalSkill: metrics.contracts.isRepoLocalSkill,
        ...repoAlternativeEvidence,
      }
    ),
    gate(
      "plugin_automation_boundary",
      gateStatus(!metrics.articleSignals.claimsPluginOrAutomation || metrics.articleSignals.mentionsDistributionBoundary),
      "plugin and automation should be treated as distribution/schedule layers, not hidden skill behavior",
      {
        claimsPluginOrAutomation: metrics.articleSignals.claimsPluginOrAutomation,
        mentionsDistributionBoundary: metrics.articleSignals.mentionsDistributionBoundary,
      }
    ),
  ];
  const completeStatuses = new Set(["pass", "acceptable_alt", "not_applicable"]);
  const passedGateCount = gates.filter((entry) => completeStatuses.has(entry.status)).length;
  const failedGateCount = gates.length - passedGateCount;
  const score = Math.round((passedGateCount / gates.length) * 100);
  return {
    scoreProfile,
    score,
    status: score === 100 ? "ARTICLE_ALIGNED" : score >= 85 ? "ARTICLE_ALIGNED_WITH_GAPS" : "ARTICLE_GAPS",
    passedGateCount,
    failedGateCount,
    gates,
    scoreMeaning: "100 means the article design-language gates passed or have an explicit machine-checked repo-local alternative.",
  };
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
  if (metrics.articleAlignment && metrics.articleAlignment.failedGateCount > 0) {
    issues.push("article_alignment_incomplete");
    for (const articleGate of metrics.articleAlignment.gates) {
      if (articleGate.status === "fail" || articleGate.status === "unknown") {
        issues.push(`article_gate_${articleGate.id}`);
      }
    }
  }
  return issues;
}

function scoreFromChecks(checks) {
  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100);
}

function structuralScore(metrics) {
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
  return scoreFromChecks(checks);
}

function mechanicalScore(metrics) {
  return Math.min(structuralScore(metrics), Number(metrics.articleAlignment && metrics.articleAlignment.score) || 0);
}

function analyzeTarget(target) {
  const resolved = resolveSkillFile(target);
  if (resolved.error) {
    return { target, error: resolved.error, schema, scoreProfile };
  }

  const source = fs.readFileSync(resolved.skillFile, "utf8");
  const frontmatter = parseFrontmatter(source);
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const name = frontmatter.fields.name || "";
  const description = frontmatter.fields.description || "";
  const expectedName = path.basename(resolved.skillRoot);
  const prefix = detectPrefix(name);
  const resources = resourceInfo(resolved.skillRoot, source);
  const repoContracts = loadRepoContracts(resolved.skillFile, name);
  const externalLlmInjectionLines = body
    .split(/\r?\n/)
    .map((line, index) => ({ index: index + 1, line }))
    .filter((entry) => /!`/.test(entry.line) && /\b(codex|gemini|claude|llm|openai)\b/i.test(entry.line))
    .map((entry) => ({ line: entry.index, text: entry.line.trim().slice(0, 180) }));

  const extraFieldValues = Object.fromEntries(
    Object.entries(frontmatter.fields).filter(([key]) => !["name", "description"].includes(key))
  );
  const metrics = {
    schema,
    scoreProfile,
    target: normalizeSlash(target),
    skillFile: normalizeSlash(resolved.skillFile),
    skillRoot: normalizeSlash(resolved.skillRoot),
    expectedName,
    frontmatter: {
      hasName: Boolean(name),
      hasDescription: Boolean(description),
      name,
      description,
      extraFields: Object.keys(extraFieldValues).sort(),
      extraFieldValues,
      error: frontmatter.error,
    },
    description: {
      length: description.length,
      hasTriggerCue: /\b(use when|when|trigger|review|evaluate|diagnose|audit|skill|SKILL\.md)\b|使用|レビュー|評価|診断|監査|必要|依頼|発動/i.test(description),
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
      hasPurpose: hasHeading(body, ["Purpose", "Goal", "目的"]),
      hasProcedure: hasHeading(body, ["Procedure", "Workflow", "Process", "Deterministic Steps", "手順", "ワークフロー", "プロセス"]),
      hasOutputContract: hasHeading(body, ["Output Contract", "Output", "Deliverable", "Input / Output", "完了条件", "出力契約", "成果物"]),
      hasEvidence: hasHeading(body, ["Evidence", "Evidence Surfaces", "証拠", "根拠"]),
      hasVerification: hasHeading(body, ["Verification", "Validation", "Tests", "検証", "確認", "テスト"]),
      hasFailureGuard: hasHeading(body, ["Failure Guard", "Guardrails", "Completion Guard", "失敗ガード", "防止", "禁止事項", "完了条件"]),
      hasGotchas: hasHeading(body, ["Gotchas", "Common Pitfalls", "落とし穴"]),
      hasResources: hasHeading(body, ["Resources", "References", "Additional Resources", "参照", "参考"]),
    },
    resources,
    language: {
      allCapsAlwaysNever: countMatches(body, /\b(ALWAYS|NEVER)\b/g),
      whyCues: countMatches(body, /\b(because|reason|why|so that|therefore)\b/gi),
      selfReportTerms: countMatches(body, /\b(done|high quality|looks good|problem solved)\b/gi),
    },
    context: {
      dynamicInjectionCount: countMatches(body, /!`/g),
      externalLlmInjectionLines,
      hasUntrustedBoundary: /untrusted|do not treat.*fact|external.*opinion|delegate.*untrusted/i.test(body),
    },
    articleSignals: {
      mentionsLayerChoice: /\b(AGENTS\.md|Skill|Plugin|Automation|Subagent|Rules?|Hooks?|CI|MCP|CLI|API|script|deterministic|layer|distribution|schedule)\b|決定論|層|配布|定期/i.test(body),
      mentionsEvidenceBoundary: /\b(artifact|evidence|verification|self-report|COMPLETED|adoption-ready)\b|証拠|検証|自己申告|完了判定/i.test(body),
      mentionsEvaluatorIntegrity: /\b(fixed criteria|rubric|generator|evaluator|delegate|untrusted|do not rewrite|do not change|do not alter|criteria)\b|評価基準|生成役|評価役|未信頼/i.test(body),
      claimsPluginOrAutomation: /\b(plugin|automation|schedule|distribution)\b|配布|定期実行|自動実行/i.test(body),
      mentionsDistributionBoundary: /\b(plugin|automation|schedule|distribution)\b|配布|定期実行|自動実行/i.test(body)
        && /\b(method|schedule|distribution|bundle|not.*runtime|not.*hidden)\b|方法|時刻|配布単位|隠さない/i.test(body),
    },
    contracts: {
      workspaceRoot: normalizeSlash(repoContracts.workspaceRoot),
      relativeSkillFile: normalizeSlash(repoContracts.relativeSkillFile),
      isRepoLocalSkill: repoContracts.isRepoLocalSkill,
      catalogEntryFound: Boolean(repoContracts.catalogEntry),
      flowRoleFound: Boolean(repoContracts.flowRole),
      catalogComplete: repoContracts.catalogComplete,
      flowRoleComplete: repoContracts.flowRoleComplete,
      repoLocalContractComplete: repoContracts.repoLocalContractComplete,
      flowKind: repoContracts.flowRole ? repoContracts.flowRole.kind : "",
    },
  };

  metrics.articleAlignment = buildArticleAlignment(metrics);
  const issues = collectIssues(metrics);
  const nextStructuralScore = structuralScore(metrics);
  const nextMechanicalScore = mechanicalScore(metrics);
  return {
    ...metrics,
    scores: {
      structuralScore: nextStructuralScore,
      articleAlignmentScore: metrics.articleAlignment.score,
      mechanicalScore: nextMechanicalScore,
    },
    issues,
    mechanicalScore: nextMechanicalScore,
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
    scoreProfile,
    generatedAt: new Date().toISOString(),
    targetCount: results.length,
    results,
    summary: {
      errorCount: results.filter((result) => result.error).length,
      averageMechanicalScore: results.length
        ? Math.round(results.reduce((sum, result) => sum + Number(result.mechanicalScore || 0), 0) / results.length)
        : 0,
      averageArticleAlignmentScore: results.length
        ? Math.round(results.reduce((sum, result) => sum + Number(result.articleAlignment && result.articleAlignment.score || 0), 0) / results.length)
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

if (require.main === module) {
  main();
}

module.exports = {
  analyzeTarget,
  buildArticleAlignment,
  schema,
  scoreProfile,
};
