#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const PLACEHOLDER_PATTERN = /^(?:todo|tbd|n\/a|na|null|none|undefined|-|_|\?|未定|未記入|なし|特になし|あとで|仮|placeholder|sample|example)$/i;
const CANONICAL_ORDER = ["論点", "イシュー", "仮説", "検証/確定"];
const REQUIRED_SOURCES = new Set([
  "論点思考解説.txt",
  "イシューから始めよ解説.txt",
  "仮説思考解説.txt"
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function display(value) {
  return typeof value === "string" ? value.trim() : String(value);
}

function isFilledString(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  if (PLACEHOLDER_PATTERN.test(trimmed)) return false;
  return true;
}

function add(findings, pathName, message) {
  findings.push(`${pathName}: ${message}`);
}

function requireObject(findings, value, pathName) {
  if (!isObject(value)) {
    add(findings, pathName, "required object is missing or not an object");
    return false;
  }
  return true;
}

function requireString(findings, value, pathName) {
  if (!isFilledString(value)) {
    add(findings, pathName, `required non-placeholder string is missing or empty (actual=${display(value)})`);
    return false;
  }
  return true;
}

function requireBoolean(findings, value, expected, pathName) {
  if (typeof value !== "boolean" || value !== expected) {
    add(findings, pathName, `must be boolean ${expected}`);
    return false;
  }
  return true;
}

function requireArray(findings, value, minItems, pathName) {
  if (!Array.isArray(value)) {
    add(findings, pathName, `required array with at least ${minItems} item(s) is missing`);
    return false;
  }
  if (value.length < minItems) {
    add(findings, pathName, `must contain at least ${minItems} item(s); found ${value.length}`);
    return false;
  }
  return true;
}

function requireEnum(findings, value, allowed, pathName) {
  if (!allowed.includes(value)) {
    add(findings, pathName, `must be one of ${allowed.join(", ")}; found ${display(value)}`);
    return false;
  }
  return true;
}

function validateIssueCandidate(findings, candidate, pathName) {
  if (!requireObject(findings, candidate, pathName)) return;
  ["id", "question", "impact", "solvable", "shortValidation", "decisionDirectness"].forEach((field) => {
    requireString(findings, candidate[field], `${pathName}.${field}`);
  });
}

function validateYesNoRationale(findings, entry, pathName) {
  if (!requireObject(findings, entry, pathName)) return;
  requireEnum(findings, entry.answer, ["yes", "no", "unknown"], `${pathName}.answer`);
  requireString(findings, entry.rationale, `${pathName}.rationale`);
}

function validateArtifact(artifact) {
  const findings = [];
  if (!requireObject(findings, artifact, "$")) return findings;

  if (artifact.schemaVersion !== "thinking-protocol.v1") {
    add(findings, "schemaVersion", "must equal thinking-protocol.v1");
  }
  if (artifact.artifactKind !== "mechanical-thinking-protocol") {
    add(findings, "artifactKind", "must equal mechanical-thinking-protocol");
  }

  if (requireObject(findings, artifact.task, "task")) {
    ["id", "description", "owner"].forEach((field) => requireString(findings, artifact.task[field], `task.${field}`));
  }

  if (!Array.isArray(artifact.canonicalOrder) || artifact.canonicalOrder.length !== CANONICAL_ORDER.length ||
      artifact.canonicalOrder.some((item, index) => item !== CANONICAL_ORDER[index])) {
    add(findings, "canonicalOrder", `must exactly equal ${CANONICAL_ORDER.join(" -> ")}`);
  }

  const issueThinking = artifact.issueThinking;
  if (requireObject(findings, issueThinking, "issueThinking")) {
    requireString(findings, issueThinking.originalRequest, "issueThinking.originalRequest");
    if (requireObject(findings, issueThinking.phenomenonOrIssue, "issueThinking.phenomenonOrIssue")) {
      requireString(findings, issueThinking.phenomenonOrIssue.observedProblem, "issueThinking.phenomenonOrIssue.observedProblem");
      requireEnum(findings, issueThinking.phenomenonOrIssue.classification, ["phenomenon", "issue", "mixed"], "issueThinking.phenomenonOrIssue.classification");
      requireString(findings, issueThinking.phenomenonOrIssue.reason, "issueThinking.phenomenonOrIssue.reason");
    }
    if (requireArray(findings, issueThinking.trueIssueCandidates, 2, "issueThinking.trueIssueCandidates")) {
      issueThinking.trueIssueCandidates.forEach((candidate, index) => validateIssueCandidate(findings, candidate, `issueThinking.trueIssueCandidates[${index}]`));
    }
    if (requireObject(findings, issueThinking.selectedBigIssue, "issueThinking.selectedBigIssue")) {
      ["question", "selectionReason", "sourcePerspective"].forEach((field) => {
        requireString(findings, issueThinking.selectedBigIssue[field], `issueThinking.selectedBigIssue.${field}`);
      });
    }
    if (requireArray(findings, issueThinking.perspectiveMoves, 2, "issueThinking.perspectiveMoves")) {
      issueThinking.perspectiveMoves.forEach((item, index) => requireString(findings, item, `issueThinking.perspectiveMoves[${index}]`));
    }
    if (requireArray(findings, issueThinking.outOfScope, 1, "issueThinking.outOfScope")) {
      issueThinking.outOfScope.forEach((item, index) => requireString(findings, item, `issueThinking.outOfScope[${index}]`));
    }
  }

  const issueSelection = artifact.issueSelection;
  if (requireObject(findings, issueSelection, "issueSelection")) {
    requireString(findings, issueSelection.singleIssueQuestion, "issueSelection.singleIssueQuestion");
    if (issueSelection.valueEquationAcknowledgement !== "valuable_work = issue_degree * solution_quality") {
      add(findings, "issueSelection.valueEquationAcknowledgement", "must equal valuable_work = issue_degree * solution_quality");
    }
    if (requireObject(findings, issueSelection.issueDegree, "issueSelection.issueDegree")) {
      ["impactHigh", "solvableNow", "answerDiverges"].forEach((field) => {
        validateYesNoRationale(findings, issueSelection.issueDegree[field], `issueSelection.issueDegree.${field}`);
      });
    }
    if (requireObject(findings, issueSelection.dogPathCheck, "issueSelection.dogPathCheck")) {
      requireBoolean(findings, issueSelection.dogPathCheck.willAvoidEffortSubstitution, true, "issueSelection.dogPathCheck.willAvoidEffortSubstitution");
      requireString(findings, issueSelection.dogPathCheck.evidence, "issueSelection.dogPathCheck.evidence");
    }
    if (requireArray(findings, issueSelection.storyline, 2, "issueSelection.storyline")) {
      issueSelection.storyline.forEach((item, index) => requireString(findings, item, `issueSelection.storyline[${index}]`));
    }
    requireString(findings, issueSelection.messageDrivenOutput, "issueSelection.messageDrivenOutput");
  }

  const hypothesisThinking = artifact.hypothesisThinking;
  if (requireObject(findings, hypothesisThinking, "hypothesisThinking")) {
    if (requireObject(findings, hypothesisThinking.primaryHypothesis, "hypothesisThinking.primaryHypothesis")) {
      ["statement", "specificObservable", "decisionImplication"].forEach((field) => {
        requireString(findings, hypothesisThinking.primaryHypothesis[field], `hypothesisThinking.primaryHypothesis.${field}`);
      });
    }
    if (requireArray(findings, hypothesisThinking.alternativeHypotheses, 2, "hypothesisThinking.alternativeHypotheses")) {
      hypothesisThinking.alternativeHypotheses.forEach((item, index) => requireString(findings, item, `hypothesisThinking.alternativeHypotheses[${index}]`));
    }
    if (requireObject(findings, hypothesisThinking.decomposition, "hypothesisThinking.decomposition")) {
      requireString(findings, hypothesisThinking.decomposition.formula, "hypothesisThinking.decomposition.formula");
      if (requireArray(findings, hypothesisThinking.decomposition.factors, 2, "hypothesisThinking.decomposition.factors")) {
        hypothesisThinking.decomposition.factors.forEach((item, index) => requireString(findings, item, `hypothesisThinking.decomposition.factors[${index}]`));
      }
    }
    if (requireArray(findings, hypothesisThinking.falsificationExitConditions, 1, "hypothesisThinking.falsificationExitConditions")) {
      hypothesisThinking.falsificationExitConditions.forEach((condition, index) => {
        if (!requireObject(findings, condition, `hypothesisThinking.falsificationExitConditions[${index}]`)) return;
        requireString(findings, condition.condition, `hypothesisThinking.falsificationExitConditions[${index}].condition`);
        requireString(findings, condition.nextAction, `hypothesisThinking.falsificationExitConditions[${index}].nextAction`);
      });
    }
    if (requireArray(findings, hypothesisThinking.minimumValidationPlan, 1, "hypothesisThinking.minimumValidationPlan")) {
      hypothesisThinking.minimumValidationPlan.forEach((step, index) => {
        if (!requireObject(findings, step, `hypothesisThinking.minimumValidationPlan[${index}]`)) return;
        ["step", "evidenceNeeded", "changesDecisionIf"].forEach((field) => {
          requireString(findings, step[field], `hypothesisThinking.minimumValidationPlan[${index}].${field}`);
        });
      });
    }
    if (requireObject(findings, hypothesisThinking.biasControls, "hypothesisThinking.biasControls")) {
      requireString(findings, hypothesisThinking.biasControls.antiConfirmation, "hypothesisThinking.biasControls.antiConfirmation");
      requireString(findings, hypothesisThinking.biasControls.antiPrematureConvergence, "hypothesisThinking.biasControls.antiPrematureConvergence");
    }
  }

  const verification = artifact.verification;
  if (requireObject(findings, verification, "verification")) {
    if (requireArray(findings, verification.evidenceObserved, 1, "verification.evidenceObserved")) {
      verification.evidenceObserved.forEach((item, index) => requireString(findings, item, `verification.evidenceObserved[${index}]`));
    }
    if (requireObject(findings, verification.hypothesisUpdate, "verification.hypothesisUpdate")) {
      requireEnum(findings, verification.hypothesisUpdate.status, ["support", "weaken", "revise", "pending"], "verification.hypothesisUpdate.status");
      requireString(findings, verification.hypothesisUpdate.update, "verification.hypothesisUpdate.update");
    }
    if (requireObject(findings, verification.answeredBigIssue, "verification.answeredBigIssue")) {
      requireEnum(findings, verification.answeredBigIssue.status, ["answered", "partial", "unanswered"], "verification.answeredBigIssue.status");
      requireString(findings, verification.answeredBigIssue.rationale, "verification.answeredBigIssue.rationale");
    }
    if (requireArray(findings, verification.residualRisks, 1, "verification.residualRisks")) {
      verification.residualRisks.forEach((item, index) => requireString(findings, item, `verification.residualRisks[${index}]`));
    }
  }

  if (requireObject(findings, artifact.gateDecision, "gateDecision")) {
    if (typeof artifact.gateDecision.readyToProceed !== "boolean") {
      add(findings, "gateDecision.readyToProceed", "must be boolean");
    }
    requireBoolean(findings, artifact.gateDecision.blockIfIncomplete, true, "gateDecision.blockIfIncomplete");
    requireString(findings, artifact.gateDecision.decision, "gateDecision.decision");
  }

  if (artifact.gateDecision && artifact.gateDecision.readyToProceed === true && issueSelection && issueSelection.issueDegree) {
    ["impactHigh", "solvableNow", "answerDiverges"].forEach((field) => {
      if (issueSelection.issueDegree[field] && issueSelection.issueDegree[field].answer !== "yes") {
        add(findings, `issueSelection.issueDegree.${field}.answer`, "must be yes when gateDecision.readyToProceed is true");
      }
    });
  }

  if (requireArray(findings, artifact.sourceCoverage, 3, "sourceCoverage")) {
    const seen = new Set();
    artifact.sourceCoverage.forEach((entry, index) => {
      if (!requireObject(findings, entry, `sourceCoverage[${index}]`)) return;
      requireEnum(findings, entry.sourceName, Array.from(REQUIRED_SOURCES), `sourceCoverage[${index}].sourceName`);
      seen.add(entry.sourceName);
      if (requireArray(findings, entry.mechanizedElements, 1, `sourceCoverage[${index}].mechanizedElements`)) {
        entry.mechanizedElements.forEach((item, itemIndex) => {
          requireString(findings, item, `sourceCoverage[${index}].mechanizedElements[${itemIndex}]`);
        });
      }
    });
    REQUIRED_SOURCES.forEach((sourceName) => {
      if (!seen.has(sourceName)) add(findings, "sourceCoverage", `missing source coverage for ${sourceName}`);
    });
  }

  return findings;
}

function validateThinkingProtocolFile(filePath, options = {}) {
  const resolved = path.resolve(options.cwd || process.cwd(), filePath || "");
  try {
    const artifact = readJson(resolved);
    const findings = validateArtifact(artifact);
    return {
      ok: findings.length === 0,
      path: resolved,
      findings,
      error: "",
    };
  } catch (error) {
    return {
      ok: false,
      path: resolved,
      findings: [`cannot read JSON at ${resolved}: ${error instanceof Error ? error.message : String(error)}`],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatThinkingProtocolResult(result) {
  const checked = "checked: canonical order, issue fields, issue-degree conditions, dog-path check, 2+ alternatives, falsification exit conditions, validation plan, source coverage";
  const lines = [];
  if (result && result.ok) {
    lines.push(`PASS thinking protocol validation: ${result.path}`);
    lines.push(checked);
    return `${lines.join("\n")}\n`;
  }
  lines.push(`FAIL thinking protocol validation: ${result && result.path ? result.path : "(unknown)"}`);
  for (const finding of result && Array.isArray(result.findings) ? result.findings : []) {
    lines.push(`- ${finding}`);
  }
  return `${lines.join("\n")}\n`;
}

function runCli(argv = process.argv.slice(2), streams = {}) {
  const out = streams.stdout || process.stdout;
  const err = streams.stderr || process.stderr;
  const target = argv[0];
  if (!target) {
    err.write("usage: node scripts/validate-thinking-protocol.js <artifact.json>\n");
    return 2;
  }
  const result = validateThinkingProtocolFile(target);
  out.write(formatThinkingProtocolResult(result));
  return result.ok ? 0 : (result.error ? 2 : 1);
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  CANONICAL_ORDER,
  REQUIRED_SOURCES,
  formatThinkingProtocolResult,
  validateArtifact,
  validateThinkingProtocolFile,
  runCli,
};
