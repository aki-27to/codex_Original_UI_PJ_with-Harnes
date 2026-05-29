"use strict";

const fs = require("fs");
const path = require("path");

const defaultEvidencePageContractPath = path.join(__dirname, "..", "config", "evidence_page_contract.json");

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, data: null, error: "" };
  }
  try {
    return { exists: true, data: JSON.parse(fs.readFileSync(filePath, "utf8")), error: "" };
  } catch (error) {
    return { exists: true, data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function safeString(value, max = 8000) {
  if (typeof value === "string") {
    return value.trim().slice(0, max);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function escapeHtml(value) {
  return safeString(value, 20000)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function flattenStrings(value, maxDepth = 4) {
  const out = [];
  function visit(current, depth) {
    if (out.length >= 80 || depth > maxDepth) {
      return;
    }
    if (typeof current === "string" || typeof current === "number" || typeof current === "boolean") {
      const text = safeString(current, 1000);
      if (text) {
        out.push(text);
      }
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((entry) => visit(entry, depth + 1));
      return;
    }
    if (current && typeof current === "object") {
      for (const [key, entry] of Object.entries(current)) {
        if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
          const text = safeString(entry, 1000);
          if (text) {
            out.push(`${key}: ${text}`);
          }
        } else {
          visit(entry, depth + 1);
        }
      }
    }
  }
  visit(value, 0);
  return [...new Set(out)];
}

function firstString(...values) {
  for (const value of values) {
    const text = safeString(value);
    if (text) {
      return text;
    }
  }
  return "";
}

function normalizeList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => safeString(entry, 1000)).filter(Boolean);
}

function loadEvidencePageContract(filePath = defaultEvidencePageContractPath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function readInputs(sourceDir) {
  const names = [
    "request_frame.json",
    "requirement_contract.json",
    "evidence_manifest.json",
    "worker_decision_surface.json",
    "review_load_breakdown.json",
    "stage_timeline.json",
    "flow_trace_summary.json",
    "release_decision.json",
    "adoption_readiness_eval.json",
    "reviewer_start_here.json",
  ];
  const inputs = {};
  for (const name of names) {
    inputs[name] = readJsonIfExists(path.join(sourceDir, name));
  }
  return inputs;
}

function getData(inputs, name) {
  return inputs[name] && inputs[name].data ? inputs[name].data : {};
}

function collectCommandLikeStrings(...values) {
  return flattenStrings(values).filter((entry) =>
    /\b(npm run|node scripts\/|GET \/|POST \/|PASS|FAIL|SKIPPED|reviewer|tester|test)\b/i.test(entry)
  );
}

function buildEvidencePageModel({ sourceDir, generatedAt = new Date().toISOString(), contract = loadEvidencePageContract() } = {}) {
  const resolvedSourceDir = path.resolve(sourceDir || contract.defaultSourceDir || "output/governance_public");
  const inputs = readInputs(resolvedSourceDir);
  const requestFrame = getData(inputs, "request_frame.json");
  const requirementContract = getData(inputs, "requirement_contract.json");
  const evidenceManifest = getData(inputs, "evidence_manifest.json");
  const workerSurface = getData(inputs, "worker_decision_surface.json");
  const reviewLoad = getData(inputs, "review_load_breakdown.json");
  const releaseDecision = getData(inputs, "release_decision.json");
  const adoptionEval = getData(inputs, "adoption_readiness_eval.json");
  const stageTimeline = getData(inputs, "stage_timeline.json");
  const flowTrace = getData(inputs, "flow_trace_summary.json");

  const inputStatus = Object.entries(inputs).map(([name, result]) => ({
    name,
    status: result.exists ? (result.error ? "invalid_json" : "available") : "missing",
    error: result.error || "",
  }));

  const sections = [
    {
      id: "original_request",
      title: "Original Request",
      items: [
        firstString(requestFrame.user_goal, requestFrame.expected_deliverable, requirementContract.explicitGoal, requirementContract.lockedGoal),
        ...normalizeList(requestFrame.constraints),
      ].filter(Boolean),
    },
    {
      id: "acceptance_checks",
      title: "Acceptance Checks",
      items: [
        ...normalizeList(requirementContract.acceptanceChecks),
        ...normalizeList(requestFrame.acceptance_criteria),
        ...normalizeList(requirementContract.requiredEvidence),
      ],
    },
    {
      id: "changed_artifacts",
      title: "Changed Artifacts",
      items: [
        ...normalizeList(workerSurface.supportingArtifacts),
        ...flattenStrings(evidenceManifest.changedArtifacts || evidenceManifest.createdArtifacts || evidenceManifest.artifacts || []),
      ],
    },
    {
      id: "verification_commands",
      title: "Verification Commands",
      items: [
        safeString(contract.packageCommand, 200),
        safeString(contract.packageVisibleVerifier, 200),
        ...collectCommandLikeStrings(evidenceManifest, reviewLoad, releaseDecision),
      ].filter(Boolean),
    },
    {
      id: "runtime_truth",
      title: "Runtime Truth",
      items: [
        firstString(workerSurface.topLevelOutcome, workerSurface.taskOutcomeStatus, workerSurface.releaseState),
        firstString(workerSurface.topLevelSummary, workerSurface.evidenceSummary),
        ...flattenStrings(stageTimeline, 2).slice(0, 10),
        ...flattenStrings(flowTrace, 2).slice(0, 10),
      ].filter(Boolean),
    },
    {
      id: "reviewer_or_tester_verdict",
      title: "Reviewer Or Tester Verdict",
      items: flattenStrings(reviewLoad, 3).slice(0, 20),
    },
    {
      id: "residual_risks",
      title: "Residual Risks",
      items: [
        ...normalizeList(workerSurface.residualRisks),
        ...normalizeList(workerSurface.assumptions),
        ...flattenStrings(releaseDecision.residualRisks || releaseDecision.risks || [], 2),
      ],
    },
    {
      id: "adoption_decision",
      title: "Adoption Decision",
      items: [
        firstString(workerSurface.adoptionReadiness, workerSurface.releaseState, releaseDecision.status, adoptionEval.status),
        firstString(workerSurface.topLevelSummary, releaseDecision.summary, adoptionEval.summary),
        ...flattenStrings(workerSurface.adoptionDecisionBasis || adoptionEval.decisionBasis || [], 2),
      ].filter(Boolean),
    },
  ].map((section) => ({
    ...section,
    items: section.items.length ? [...new Set(section.items)] : ["No direct evidence value found in the available inputs."],
  }));

  return {
    generatedAt,
    sourceDir: resolvedSourceDir,
    contractVersion: contract.version,
    defaultArtifact: contract.defaultArtifact,
    inputStatus,
    sections,
  };
}

function renderList(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderEvidencePageHtml(model) {
  const nav = model.sections
    .map((section) => `<a href="#${escapeHtml(section.id)}">${escapeHtml(section.title)}</a>`)
    .join("");
  const sections = model.sections
    .map((section) => {
      return [
        `<section id="${escapeHtml(section.id)}">`,
        `<h2>${escapeHtml(section.title)}</h2>`,
        renderList(section.items),
        "</section>",
      ].join("\n");
    })
    .join("\n");
  const inputRows = model.inputStatus
    .map((entry) => `<tr><td>${escapeHtml(entry.name)}</td><td>${escapeHtml(entry.status)}</td><td>${escapeHtml(entry.error)}</td></tr>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Closeout Evidence Page</title>
  <style>
    :root { color-scheme: light; --ink: #1f2937; --muted: #4b5563; --line: #d1d5db; --panel: #f8fafc; --accent: #0f766e; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: var(--ink); background: #ffffff; }
    header { padding: 28px 32px 18px; border-bottom: 1px solid var(--line); background: var(--panel); }
    main { max-width: 1120px; margin: 0 auto; padding: 24px 32px 40px; }
    h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.2; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 18px; line-height: 1.3; letter-spacing: 0; }
    p, li, td, th, a { font-size: 14px; line-height: 1.5; letter-spacing: 0; }
    .meta { color: var(--muted); margin: 4px 0; }
    nav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
    nav a { color: #075985; text-decoration: none; border: 1px solid var(--line); padding: 6px 9px; border-radius: 6px; background: #ffffff; }
    section { border-top: 1px solid var(--line); padding: 22px 0; }
    ul { margin: 0; padding-left: 20px; }
    li + li { margin-top: 7px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; border: 1px solid var(--line); padding: 8px; vertical-align: top; }
    th { background: var(--panel); }
    .status { color: var(--accent); font-weight: 700; }
  </style>
</head>
<body>
  <header>
    <h1>Closeout Evidence Page</h1>
    <p class="meta">Generated: ${escapeHtml(model.generatedAt)}</p>
    <p class="meta">Source: ${escapeHtml(model.sourceDir)}</p>
    <p class="meta">Contract: <span class="status">${escapeHtml(model.contractVersion)}</span></p>
    <nav>${nav}</nav>
  </header>
  <main>
    ${sections}
    <section id="input_status">
      <h2>Input Status</h2>
      <table>
        <thead><tr><th>Artifact</th><th>Status</th><th>Error</th></tr></thead>
        <tbody>${inputRows}</tbody>
      </table>
    </section>
  </main>
</body>
</html>
`;
}

function writeEvidencePage({ sourceDir, outPath, generatedAt } = {}) {
  const contract = loadEvidencePageContract();
  const model = buildEvidencePageModel({ sourceDir, generatedAt, contract });
  const resolvedOutPath = path.resolve(outPath || contract.defaultArtifact);
  fs.mkdirSync(path.dirname(resolvedOutPath), { recursive: true });
  fs.writeFileSync(resolvedOutPath, renderEvidencePageHtml(model), "utf8");
  return { outPath: resolvedOutPath, model };
}

module.exports = {
  defaultEvidencePageContractPath,
  buildEvidencePageModel,
  loadEvidencePageContract,
  renderEvidencePageHtml,
  writeEvidencePage,
};
