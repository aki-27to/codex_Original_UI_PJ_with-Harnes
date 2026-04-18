"use strict";

const fs = require("fs");
const path = require("path");

function safeString(value, max = 4000) {
  if (typeof value !== "string") {
    return "";
  }
  if (!Number.isFinite(Number(max)) || max <= 0) {
    return value.trim();
  }
  return value.trim().slice(0, Math.trunc(Number(max)));
}

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/");
}

function normalizePath(value) {
  return toPosix(String(value || "").trim()).toLowerCase();
}

function extractPromptText(input) {
  if (Array.isArray(input)) {
    return input
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return "";
        }
        if (typeof entry.text === "string") {
          return entry.text;
        }
        if (entry.type === "input_text" && typeof entry.value === "string") {
          return entry.value;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  if (input && typeof input === "object" && typeof input.text === "string") {
    return input.text;
  }
  return safeString(String(input || ""), 24000);
}

function resolveWorkspacePath(workspaceRoot, cwd, candidate) {
  const raw = safeString(candidate, 2000);
  if (!raw) {
    return "";
  }
  const absolute = path.isAbsolute(raw)
    ? path.normalize(raw)
    : path.normalize(path.join(cwd || workspaceRoot, raw));
  return absolute;
}

function repoRelative(workspaceRoot, targetPath) {
  return toPosix(path.relative(workspaceRoot, path.resolve(targetPath)));
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readUtf8(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function writeUtf8(filePath, text) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, text, "utf8");
}

function ensureTrailingNewline(text) {
  const value = String(text || "");
  return value.endsWith("\n") ? value : `${value}\n`;
}

function replaceExactLine(filePath, beforeLine, afterLine) {
  const source = readUtf8(filePath);
  const before = String(beforeLine || "");
  const after = String(afterLine || "");
  if (!source.includes(before)) {
    if (source.includes(after)) {
      return;
    }
    throw new Error(`line not found in ${filePath}: ${before}`);
  }
  writeUtf8(filePath, source.replace(before, after));
}

function appendUniqueLine(filePath, line) {
  const source = readUtf8(filePath);
  if (source.includes(line)) {
    return;
  }
  const next = ensureTrailingNewline(source) + `${line}\n`;
  writeUtf8(filePath, next);
}

function insertBulletUnderHeader(filePath, header, bulletLine) {
  const source = readUtf8(filePath);
  if (source.includes(bulletLine)) {
    return;
  }
  const marker = String(header || "");
  const index = source.indexOf(marker);
  if (index < 0) {
    throw new Error(`header not found in ${filePath}: ${marker}`);
  }
  const insertAt = source.indexOf("\n", index);
  const prefix = insertAt >= 0 ? source.slice(0, insertAt + 1) : `${source}\n`;
  const suffix = insertAt >= 0 ? source.slice(insertAt + 1) : "";
  const bullet = `${bulletLine}\n`;
  const next = `${prefix}${bullet}${suffix}`;
  writeUtf8(filePath, next);
}

function insertBulletUnderAnyHeader(filePath, headers, bulletLine) {
  const candidates = Array.isArray(headers) ? headers : [];
  let lastError = null;
  for (const header of candidates) {
    try {
      insertBulletUnderHeader(filePath, header, bulletLine);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    throw lastError;
  }
  throw new Error(`header not found in ${filePath}`);
}

function appendChangelogLine(filePath, line) {
  appendUniqueLine(filePath, line);
}

function buildOwnedPathsMessage(ownedPaths, notes = []) {
  const paths = Array.isArray(ownedPaths) ? ownedPaths.filter(Boolean) : [];
  const lines = [];
  if (paths.length) {
    lines.push("Owned paths:");
    for (const ownedPath of paths) {
      lines.push(`- ${ownedPath}`);
    }
  }
  for (const note of Array.isArray(notes) ? notes : []) {
    const text = safeString(note, 400);
    if (text) {
      lines.push(text);
    }
  }
  return lines.join("\n");
}

function buildPlan(explanation, steps) {
  return {
    explanation: safeString(explanation, 600),
    plan: (Array.isArray(steps) ? steps : []).map((step) => ({
      step: safeString(step, 200),
      status: "completed",
    })),
  };
}

function buildCollabItem({ itemId, child, prompt, receiverThreadId, ownedPaths = [], notes = [], status = "completed" }) {
  const receiver = safeString(receiverThreadId, 120) || `${safeString(child, 40)}-thread`;
  return {
    id: itemId,
    type: "collabToolCall",
    tool: "spawnAgent",
    status,
    agentType: child,
    prompt: safeString(prompt, 1200),
    receiverThreadIds: [receiver],
    agentsStates: {
      [receiver]: {
        message: buildOwnedPathsMessage(ownedPaths, notes),
      },
    },
  };
}

function buildAgentMessageItem(itemId, text) {
  return {
    id: itemId,
    type: "agentMessage",
    status: "completed",
    text,
  };
}

function buildCommandExecutionItem(itemId, {
  command = "node scripts/system_coherence_review_test.js",
  stdout = "PASS system_coherence_review_test",
  stderr = "",
  exitCode = 0,
  durationMs = 120,
  status = "completed",
} = {}) {
  return {
    id: itemId,
    type: "commandExecution",
    status,
    command,
    stdout,
    stderr,
    exitCode,
    durationMs,
  };
}

function matchFirst(promptText, regex) {
  const matched = String(promptText || "").match(regex);
  return matched && matched[1] ? matched[1].trim() : "";
}

function matchLineValue(promptText, prefix) {
  const text = String(promptText || "");
  const marker = String(prefix || "");
  if (!marker) {
    return "";
  }
  const line = text
    .split(/\r?\n/)
    .map((entry) => safeString(entry, 4000))
    .find((entry) => entry.startsWith(marker));
  return line ? line.slice(marker.length).trim() : "";
}

const architectureEvidenceHeaders = [
  "## 6) Evidence and Persistence",
  "## 6) 現在の構成",
];

function buildFastScenario({ workspaceRoot, cwd, promptText, threadId, turnId }) {
  const targetRelativeRaw = matchFirst(promptText, /Change only ([^\r\n]+)/i);
  const targetRelativePath = typeof targetRelativeRaw === "string" ? targetRelativeRaw.replace(/\.\s*$/, "").trim() : "";
  const targetPath = resolveWorkspacePath(workspaceRoot, cwd, targetRelativePath);
  replaceExactLine(targetPath, "status: stale", "status: fresh");
  const ownedPath = repoRelative(workspaceRoot, targetPath);
  const finalText = `FAST_TASK_OK ${targetRelativePath}`;
  return {
    plan: buildPlan("FAST planning with light assurance.", [
      "Lock requirement and confirm single-file scope.",
      "Dispatch the file edit to infra_worker.",
      "Aggregate evidence and finalize.",
    ]),
    items: [
      buildCollabItem({
        itemId: `${turnId}-infra`,
        child: "infra_worker",
        prompt: `Update ${targetRelativePath}`,
        receiverThreadId: `${threadId}-infra`,
        ownedPaths: [ownedPath],
        notes: ["Applied requested line replacement."],
      }),
      buildAgentMessageItem(`${turnId}-final`, finalText),
    ],
    finalText,
    turnStatus: "completed",
  };
}

function buildDiscoveryScenario({ turnId }) {
  const finalText = [
    "STATUS: NEED_USER_INPUT",
    "Open questions:",
    "- What is the concrete product goal for this workflow?",
    "- Which specialist boundaries are in scope?",
    "- What are the non-goals and acceptance checks?",
    "Assumptions:",
    "- No implementation until the user fixes the open questions.",
    "Non-goals:",
    "- No code or config changes in this turn.",
  ].join("\n");
  return {
    plan: buildPlan("DISCOVERY planning selected because the request is ambiguous.", [
      "Surface open questions and assumptions.",
      "Avoid implementation and over-delivery.",
      "Return NEEDS_INPUT for user decision.",
    ]),
    items: [buildAgentMessageItem(`${turnId}-final`, finalText)],
    finalText,
    turnStatus: "completed",
  };
}

function buildNaturalScenario({ workspaceRoot, promptText, threadId, turnId }) {
  const targetRelativePath = "docs/CURRENT_ARCHITECTURE.md";
  const targetPath = path.join(workspaceRoot, "docs", "CURRENT_ARCHITECTURE.md");
  const bulletLine = matchFirst(promptText, /Insert this exact bullet if it is not already present: ([^\n]+)/i);
  insertBulletUnderAnyHeader(targetPath, architectureEvidenceHeaders, bulletLine);
  const finalText = `NATURAL_TASK_OK ${targetRelativePath}`;
  return {
    plan: buildPlan("STANDARD planning with STANDARD assurance for repo docs maintenance.", [
      "Dispatch documentation edit to infra_worker.",
      "Run read-only reviewer check.",
      "Finalize with evidence bundle.",
    ]),
    items: [
      buildCollabItem({
        itemId: `${turnId}-infra`,
        child: "infra_worker",
        prompt: `Update ${targetRelativePath}`,
        receiverThreadId: `${threadId}-infra`,
        ownedPaths: [targetRelativePath],
        notes: ["Applied requested documentation bullet."],
      }),
      buildCommandExecutionItem(`${turnId}-coherence`),
      buildCollabItem({
        itemId: `${turnId}-reviewer`,
        child: "reviewer",
        prompt: `Review ${targetRelativePath}`,
        receiverThreadId: `${threadId}-reviewer`,
        ownedPaths: [],
        notes: ["No findings."],
      }),
      buildAgentMessageItem(`${turnId}-final`, finalText),
    ],
    finalText,
    turnStatus: "completed",
  };
}

function buildBoundaryScenario({ workspaceRoot, cwd, promptText, threadId, turnId }) {
  const targetRelativeRaw = matchFirst(promptText, /Change only ([^\r\n]+)/i);
  const targetRelativePath = typeof targetRelativeRaw === "string" ? targetRelativeRaw.replace(/\.\s*$/, "").trim() : "";
  const targetPath = resolveWorkspacePath(workspaceRoot, cwd, targetRelativePath);
  const bulletLine = matchFirst(promptText, /Insert this exact bullet if it is not already present: ([^\n]+)/i);
  insertBulletUnderHeader(targetPath, "## Runtime Truth", bulletLine);
  const finalText = `BOUNDARY_TASK_OK ${targetRelativePath}`;
  return {
    plan: buildPlan("STANDARD planning with STANDARD assurance for state-boundary docs maintenance.", [
      "Dispatch state documentation edit to infra_worker.",
      "Run read-only reviewer and tester checks.",
      "Finalize with evidence bundle.",
    ]),
    items: [
      buildCollabItem({
        itemId: `${turnId}-infra`,
        child: "infra_worker",
        prompt: `Update ${targetRelativePath}`,
        receiverThreadId: `${threadId}-infra`,
        ownedPaths: [repoRelative(workspaceRoot, targetPath)],
        notes: ["Applied requested runtime-boundary documentation bullet."],
      }),
      buildCommandExecutionItem(`${turnId}-coherence`),
      buildCollabItem({
        itemId: `${turnId}-reviewer`,
        child: "reviewer",
        prompt: `Review ${targetRelativePath}`,
        receiverThreadId: `${threadId}-reviewer`,
        ownedPaths: [],
        notes: ["No findings."],
      }),
      buildCollabItem({
        itemId: `${turnId}-tester`,
        child: "tester",
        prompt: `Verify ${targetRelativePath}`,
        receiverThreadId: `${threadId}-tester`,
        ownedPaths: [],
        notes: ["PASS: requested state-boundary evidence is present."],
      }),
      buildAgentMessageItem(`${turnId}-final`, finalText),
    ],
    finalText,
    turnStatus: "completed",
  };
}

function buildSignoffScenario({ workspaceRoot, cwd, promptText, threadId, turnId }) {
  const targetRelativePath = matchFirst(promptText, /Change ([^,\n]+), docs\/EVIDENCE_CONTRACT\.md/i);
  const targetPath = resolveWorkspacePath(workspaceRoot, cwd, targetRelativePath);
  const evidencePath = path.join(workspaceRoot, "docs", "EVIDENCE_CONTRACT.md");
  const architecturePath = path.join(workspaceRoot, "docs", "CURRENT_ARCHITECTURE.md");
  const changelogPath = path.join(workspaceRoot, "docs", "ARCHITECTURE_CHANGELOG.md");
  const evidenceBullet = matchFirst(promptText, /add this exact bullet if it is not already present: ([^\n]+)/i);
  const architectureBullet = matchFirst(promptText, /add this exact architecture bullet if it is not already present: ([^\n]+)/i);
  const changelogLine = matchFirst(promptText, /add this exact changelog line if it is not already present: ([^\n]+)/i);
  replaceExactLine(targetPath, "gate: pending", "gate: signed");
  appendUniqueLine(evidencePath, evidenceBullet);
  insertBulletUnderAnyHeader(architecturePath, architectureEvidenceHeaders, architectureBullet);
  appendChangelogLine(changelogPath, changelogLine);
  const finalText = `SIGNOFF_TASK_OK ${targetRelativePath}`;
  return {
    plan: buildPlan("STANDARD planning with SIGNOFF assurance.", [
      "Dispatch signoff-oriented implementation to infra_worker.",
      "Require independent reviewer and tester evidence.",
      "Finalize only after doc-sync evidence is present.",
    ]),
    items: [
      buildCollabItem({
        itemId: `${turnId}-infra`,
        child: "infra_worker",
        prompt: `Apply signoff evidence updates for ${targetRelativePath}`,
        receiverThreadId: `${threadId}-infra`,
        ownedPaths: [
          repoRelative(workspaceRoot, targetPath),
          "docs/EVIDENCE_CONTRACT.md",
          "docs/CURRENT_ARCHITECTURE.md",
          "docs/ARCHITECTURE_CHANGELOG.md",
        ],
        notes: ["Applied requested signoff assurance updates."],
      }),
      buildCommandExecutionItem(`${turnId}-coherence`),
      buildCollabItem({
        itemId: `${turnId}-reviewer`,
        child: "reviewer",
        prompt: "Review signoff evidence bundle.",
        receiverThreadId: `${threadId}-reviewer`,
        notes: ["No findings."],
      }),
      buildCollabItem({
        itemId: `${turnId}-tester`,
        child: "tester",
        prompt: "Verify signoff evidence and doc-sync outputs.",
        receiverThreadId: `${threadId}-tester`,
        notes: ["PASS: reviewer/tester/doc-sync evidence present."],
      }),
      buildAgentMessageItem(`${turnId}-final`, finalText),
    ],
    finalText,
    turnStatus: "completed",
  };
}

function buildFastBaselineScenario({ workspaceRoot, cwd, promptText, turnId }) {
  const targetRelativeRaw = matchFirst(promptText, /Change only ([^\r\n]+)/i);
  const targetRelativePath = typeof targetRelativeRaw === "string" ? targetRelativeRaw.replace(/\.\s*$/, "").trim() : "";
  const targetPath = resolveWorkspacePath(workspaceRoot, cwd, targetRelativePath);
  replaceExactLine(targetPath, "status: stale", "status: fresh");
  const finalText = `FAST_TASK_OK ${targetRelativePath}`;
  return {
    plan: buildPlan("Measured baseline profile: direct FAST execution without governed dispatch.", [
      "Apply the bounded file edit directly.",
      "Return without child review or tester fan-out.",
    ]),
    items: [buildAgentMessageItem(`${turnId}-final`, finalText)],
    finalText,
    turnStatus: "completed",
  };
}

function buildDiscoveryBaselineScenario({ turnId }) {
  const finalText = [
    "STATUS: NEED_USER_INPUT",
    "Open questions:",
    "- What is the concrete product goal for this workflow?",
    "- Which specialist boundaries are actually in scope?",
    "- What acceptance checks define success?",
  ].join("\n");
  return {
    plan: buildPlan("Measured baseline profile: discovery pause without governed contracts.", [
      "Surface the blocking open questions.",
      "Stop before implementation.",
    ]),
    items: [buildAgentMessageItem(`${turnId}-final`, finalText)],
    finalText,
    turnStatus: "completed",
  };
}

function buildNaturalBaselineScenario({ workspaceRoot, cwd, promptText, turnId }) {
  const targetRelativeRaw = matchFirst(promptText, /Change only ([^\r\n]+)/i);
  const targetRelativePath = typeof targetRelativeRaw === "string" ? targetRelativeRaw.replace(/\.\s*$/, "").trim() : "";
  const targetPath = resolveWorkspacePath(workspaceRoot, cwd, targetRelativePath);
  const bulletLine = matchFirst(promptText, /Insert this exact bullet if it is not already present: ([^\n]+)/i);
  insertBulletUnderAnyHeader(targetPath, architectureEvidenceHeaders, bulletLine);
  const finalText = `NATURAL_TASK_OK ${targetRelativePath}`;
  return {
    plan: buildPlan("Measured baseline profile: direct docs maintenance without reviewer fan-out.", [
      "Apply the requested documentation bullet directly.",
      "Return without governed review artifacts.",
    ]),
    items: [
      buildCommandExecutionItem(`${turnId}-coherence`),
      buildAgentMessageItem(`${turnId}-final`, finalText),
    ],
    finalText,
    turnStatus: "completed",
  };
}

function buildBoundaryBaselineScenario({ workspaceRoot, cwd, promptText, turnId }) {
  const targetRelativeRaw = matchFirst(promptText, /Change only ([^\r\n]+)/i);
  const targetRelativePath = typeof targetRelativeRaw === "string" ? targetRelativeRaw.replace(/\.\s*$/, "").trim() : "";
  const targetPath = resolveWorkspacePath(workspaceRoot, cwd, targetRelativePath);
  const bulletLine = matchFirst(promptText, /Insert this exact bullet if it is not already present: ([^\n]+)/i);
  insertBulletUnderHeader(targetPath, "## Runtime Truth", bulletLine);
  const finalText = `BOUNDARY_TASK_OK ${targetRelativePath}`;
  return {
    plan: buildPlan("Measured baseline profile: direct runtime-boundary docs maintenance without reviewer fan-out.", [
      "Apply the requested runtime-boundary documentation bullet directly.",
      "Return without governed review artifacts.",
    ]),
    items: [
      buildCommandExecutionItem(`${turnId}-coherence`),
      buildAgentMessageItem(`${turnId}-final`, finalText),
    ],
    finalText,
    turnStatus: "completed",
  };
}

function buildSignoffBaselineScenario({ workspaceRoot, cwd, promptText, turnId }) {
  const explicitTargetRelativePath = matchLineValue(promptText, "- Signoff baseline target: ");
  const changeTargetsRaw =
    matchLineValue(promptText, "- Signoff baseline support targets: ") ||
    matchFirst(promptText, /Change ([^\n]+)/i);
  const changeTargets = changeTargetsRaw
    .split(/[,\|]/)
    .map((entry) => safeString(entry, 400))
    .filter(Boolean);
  const supportTargets = explicitTargetRelativePath ? changeTargets : changeTargets.slice(1);
  const targetRelativePath = explicitTargetRelativePath || changeTargets[0] || "";
  const evidenceRelativePath = supportTargets[0] || "";
  const architectureRelativePath = supportTargets[1] || "";
  const changelogRelativePath = supportTargets[2] || "";
  const targetPath = resolveWorkspacePath(workspaceRoot, cwd, targetRelativePath);
  const evidencePath = resolveWorkspacePath(workspaceRoot, cwd, evidenceRelativePath);
  const architecturePath = resolveWorkspacePath(workspaceRoot, cwd, architectureRelativePath);
  const changelogPath = resolveWorkspacePath(workspaceRoot, cwd, changelogRelativePath);
  const evidenceBullet = matchFirst(promptText, /add this exact bullet if it is not already present: ([^\n]+)/i);
  const architectureBullet = matchFirst(promptText, /add this exact architecture bullet if it is not already present: ([^\n]+)/i);
  const changelogLine = matchFirst(promptText, /add this exact changelog line if it is not already present: ([^\n]+)/i);
  replaceExactLine(targetPath, "gate: pending", "gate: signed");
  appendUniqueLine(evidencePath, evidenceBullet);
  insertBulletUnderAnyHeader(architecturePath, architectureEvidenceHeaders, architectureBullet);
  appendChangelogLine(changelogPath, changelogLine);
  const finalText = `SIGNOFF_TASK_OK ${targetRelativePath}`;
  return {
    plan: buildPlan("Measured baseline profile: direct signoff-like maintenance without reviewer/tester governance.", [
      "Apply the requested file updates directly.",
      "Return without child reviewer/tester evidence.",
    ]),
    items: [
      buildCommandExecutionItem(`${turnId}-coherence`),
      buildAgentMessageItem(`${turnId}-final`, finalText),
    ],
    finalText,
    turnStatus: "completed",
  };
}

function buildLiveDispatchScenario({ workspaceRoot, cwd, promptText, threadId, turnId }) {
  const childMarker = matchFirst(promptText, /append exactly one new line '([^']+)' to/i);
  const liveTargetRaw = matchFirst(promptText, /append exactly one new line '[^']+' to ([^\r\n]+)/i);
  const liveTarget = typeof liveTargetRaw === "string" ? liveTargetRaw.replace(/\.\s*$/, "").trim() : "";
  const parentMarker = matchFirst(promptText, /append exactly one additional line '([^']+)'/i);
  const targetPath = resolveWorkspacePath(workspaceRoot, cwd, liveTarget);
  const architecturePath = path.join(workspaceRoot, "docs", "CURRENT_ARCHITECTURE.md");
  const changelogPath = path.join(workspaceRoot, "docs", "ARCHITECTURE_CHANGELOG.md");
  const architectureBullet =
    "- Runtime proof samples can fall back to fixture-backed transport and still emit dispatch/doc-sync evidence under constrained sandboxes.";
  const changelogLine =
    "- 2026-03-08: Runtime proof sample now records fixture-backed dispatch evidence plus doc-sync coverage for sandboxed proof generation.";
  appendUniqueLine(targetPath, childMarker);
  appendUniqueLine(targetPath, parentMarker);
  insertBulletUnderAnyHeader(architecturePath, architectureEvidenceHeaders, architectureBullet);
  appendChangelogLine(changelogPath, changelogLine);
  const finalText = `DISPATCH_OK ${liveTarget}`;
  return {
    plan: buildPlan("STANDARD planning to prove native dispatch flow.", [
      "Dispatch implementation-bearing edit to infra_worker.",
      "Capture reviewer/tester evidence for the quality gate.",
      "Finalize with dispatch and doc-sync evidence.",
    ]),
    items: [
      buildCollabItem({
        itemId: `${turnId}-infra`,
        child: "infra_worker",
        prompt: `Append child proof marker to ${liveTarget}`,
        receiverThreadId: `${threadId}-infra`,
        ownedPaths: [
          repoRelative(workspaceRoot, targetPath),
          "docs/CURRENT_ARCHITECTURE.md",
          "docs/ARCHITECTURE_CHANGELOG.md",
        ],
        notes: ["Applied requested child proof marker and doc-sync updates."],
      }),
      buildCommandExecutionItem(`${turnId}-coherence`),
      buildCollabItem({
        itemId: `${turnId}-reviewer`,
        child: "reviewer",
        prompt: "Review runtime proof evidence.",
        receiverThreadId: `${threadId}-reviewer`,
        notes: ["No findings."],
      }),
      buildCollabItem({
        itemId: `${turnId}-tester`,
        child: "tester",
        prompt: "Verify runtime proof evidence.",
        receiverThreadId: `${threadId}-tester`,
        notes: ["PASS: dispatch evidence and doc-sync evidence recorded."],
      }),
      buildAgentMessageItem(`${turnId}-final`, finalText),
    ],
    finalText,
    turnStatus: "completed",
  };
}

function buildExactReplyScenario({ promptText, turnId }) {
  const exactReply = matchFirst(promptText, /Reply with exactly:\s*([^\n]+)/i) || "ACK";
  return {
    plan: buildPlan("FAST planning for exact reply contract.", [
      "Preserve the exact output contract.",
      "Return without extra work.",
    ]),
    items: [buildAgentMessageItem(`${turnId}-final`, exactReply)],
    finalText: exactReply,
    turnStatus: "completed",
  };
}

function buildFallbackScenario({ turnId }) {
  const finalText = "[fixture] unsupported prompt";
  return {
    plan: buildPlan("Fixture fallback path.", ["Return a deterministic fixture response."]),
    items: [buildAgentMessageItem(`${turnId}-final`, finalText)],
    finalText,
    turnStatus: "completed",
  };
}

function buildMockFixtureScenario({ workspaceRoot, cwd, input, threadId, turnId }) {
  const promptText = extractPromptText(input);
  const lower = promptText.toLowerCase();
  const baselineProfile = lower.includes("[baseline_profile]");
  if (baselineProfile && lower.includes("[fixture_scenario] fast_sample")) {
    return buildFastBaselineScenario({ workspaceRoot, cwd, promptText, turnId });
  }
  if (baselineProfile && lower.includes("[fixture_scenario] discovery_sample")) {
    return buildDiscoveryBaselineScenario({ turnId });
  }
  if (baselineProfile && lower.includes("[fixture_scenario] natural_sample")) {
    return buildNaturalBaselineScenario({ workspaceRoot, cwd, promptText, turnId });
  }
  if (baselineProfile && lower.includes("[fixture_scenario] boundary_sample")) {
    return buildBoundaryBaselineScenario({ workspaceRoot, cwd, promptText, turnId });
  }
  if (baselineProfile && lower.includes("[fixture_scenario] signoff_sample")) {
    return buildSignoffBaselineScenario({ workspaceRoot, cwd, promptText, turnId });
  }
  if (lower.includes("[fixture_scenario] fast_sample")) {
    return buildFastScenario({ workspaceRoot, cwd, promptText, threadId, turnId });
  }
  if (lower.includes("[fixture_scenario] discovery_sample")) {
    return buildDiscoveryScenario({ turnId });
  }
  if (lower.includes("[fixture_scenario] natural_sample")) {
    return buildNaturalScenario({ workspaceRoot, promptText, threadId, turnId });
  }
  if (lower.includes("[fixture_scenario] boundary_sample")) {
    return buildBoundaryScenario({ workspaceRoot, cwd, promptText, threadId, turnId });
  }
  if (lower.includes("[fixture_scenario] signoff_sample")) {
    return buildSignoffScenario({ workspaceRoot, cwd, promptText, threadId, turnId });
  }
  if (lower.includes("[fixture_scenario] live_dispatch_proof")) {
    return buildLiveDispatchScenario({ workspaceRoot, cwd, promptText, threadId, turnId });
  }
  if (lower.includes("fast_task_ok")) {
    return buildFastScenario({ workspaceRoot, cwd, promptText, threadId, turnId });
  }
  if (lower.includes("status: need_user_input") || lower.includes("user decision is required before implementation")) {
    return buildDiscoveryScenario({ turnId });
  }
  if (lower.includes("natural_task_ok")) {
    return buildNaturalScenario({ workspaceRoot, promptText, threadId, turnId });
  }
  if (lower.includes("signoff_task_ok")) {
    return buildSignoffScenario({ workspaceRoot, cwd, promptText, threadId, turnId });
  }
  if (lower.includes("dispatch_ok")) {
    return buildLiveDispatchScenario({ workspaceRoot, cwd, promptText, threadId, turnId });
  }
  if (lower.includes("reply with exactly:")) {
    return buildExactReplyScenario({ promptText, turnId });
  }
  return buildFallbackScenario({ turnId });
}

module.exports = {
  buildMockFixtureScenario,
  extractPromptText,
};
