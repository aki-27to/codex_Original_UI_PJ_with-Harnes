#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  buildAutoClosePlan,
  buildCloseoutReport,
  buildPreflightReport,
  classifySessionEntry,
  runAutoClose,
} = require("./lib/repo_session_guard");
const {
  CANONICAL_ORDER,
  REQUIRED_SOURCES,
} = require("./lib/thinking_protocol_validator");

function runGit(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    windowsHide: true,
    encoding: "utf8",
    timeout: 30000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout || result.error.message}`);
  }
  return String(result.stdout || "").trim();
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function validThinkingProtocol() {
  const sources = Array.from(REQUIRED_SOURCES);
  return {
    schemaVersion: "thinking-protocol.v1",
    artifactKind: "mechanical-thinking-protocol",
    task: { id: "repo-session-test", description: "Validate repo session preflight protocol.", owner: "Codex test" },
    canonicalOrder: CANONICAL_ORDER,
    issueThinking: {
      originalRequest: "Keep repo session starts governed by a valid thinking protocol.",
      phenomenonOrIssue: {
        observedProblem: "A clean git tree alone does not prove a governed run has a protocol artifact.",
        classification: "issue",
        reason: "The preflight should require both clean state and protocol evidence.",
      },
      trueIssueCandidates: [
        {
          id: "I1",
          question: "Does a clean repo include the required protocol artifact?",
          impact: "Missing protocol evidence would allow ungoverned execution.",
          solvable: "The fixture can commit a valid protocol artifact.",
          shortValidation: "buildPreflightReport should return CLEAN for the fixture.",
          decisionDirectness: "The report controls start permission.",
        },
        {
          id: "I2",
          question: "Does dirty-state handling remain independent?",
          impact: "Protocol enforcement must not weaken existing dirty detection.",
          solvable: "The existing dirty fixtures still exercise git state classification.",
          shortValidation: "Dirty fixtures should remain DIRTY_BASELINE.",
          decisionDirectness: "The report keeps dirty entries visible.",
        },
      ],
      selectedBigIssue: {
        question: "Can preflight combine clean repo state with valid protocol evidence?",
        selectionReason: "Both conditions are required for governed execution.",
        sourcePerspective: "The operator needs a deterministic start gate.",
      },
      perspectiveMoves: ["Check protocol evidence separately from git cleanliness.", "Keep dirty entries visible in the report."],
      outOfScope: ["Changing closeout remote-sync policy."],
    },
    issueSelection: {
      singleIssueQuestion: "Can repo-session preflight require a valid thinking protocol while preserving dirty checks?",
      valueEquationAcknowledgement: "valuable_work = issue_degree * solution_quality",
      issueDegree: {
        impactHigh: { answer: "yes", rationale: "Start gates are safety-critical for governed work." },
        solvableNow: { answer: "yes", rationale: "The local validator is deterministic." },
        answerDiverges: { answer: "yes", rationale: "A clean tree and a governed protocol are different checks." },
      },
      dogPathCheck: { willAvoidEffortSubstitution: true, evidence: "The fixture is validated by buildPreflightReport." },
      storyline: ["Commit a valid protocol artifact in every clean fixture.", "Assert dirty fixtures still fail on dirty state."],
      messageDrivenOutput: "Preflight should pass only when both repo state and protocol state are acceptable.",
    },
    hypothesisThinking: {
      primaryHypothesis: {
        statement: "Adding a valid protocol fixture preserves existing repo-session tests.",
        specificObservable: "The existing clean and dirty assertions continue to pass.",
        decisionImplication: "The protocol gate is additive, not a replacement for dirty-state checks.",
      },
      alternativeHypotheses: ["The protocol gate might mask dirty-state failures.", "The protocol fixture might be incomplete."],
      decomposition: { formula: "clean_start = clean_git_state && valid_protocol", factors: ["git state", "protocol state"] },
      falsificationExitConditions: [{ condition: "Existing dirty assertions stop failing as expected.", nextAction: "Restore dirty-state precedence in the report." }],
      minimumValidationPlan: [{ step: "Run repo_session_guard_test.", evidenceNeeded: "Process exit 0.", changesDecisionIf: "Any assertion fails." }],
      biasControls: {
        antiConfirmation: "The test keeps existing dirty and auto-close assertions.",
        antiPrematureConvergence: "Protocol-specific CLI cases live in thinking_protocol_gate_test.",
      },
    },
    verification: {
      evidenceObserved: ["repo_session_guard_test executes buildPreflightReport."],
      hypothesisUpdate: { status: "support", update: "The fixture should support existing clean start assertions." },
      answeredBigIssue: { status: "answered", rationale: "The test covers the combined clean-start decision." },
      residualRisks: ["The fixture is minimal and not a full user task packet."],
    },
    gateDecision: { readyToProceed: true, blockIfIncomplete: true, decision: "Allow the test fixture to proceed." },
    sourceCoverage: sources.map((sourceName) => ({
      sourceName,
      mechanizedElements: [`${sourceName} is represented in the repo-session fixture.`],
    })),
  };
}

function createRepo(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `repo-session-${label}-`));
  const remote = path.join(root, "remote.git");
  const work = path.join(root, "work");
  fs.mkdirSync(work, { recursive: true });
  runGit(["init", "--bare", remote], root);
  runGit(["init"], work);
  runGit(["config", "user.name", "Repo Session Test"], work);
  runGit(["config", "user.email", "repo-session@example.invalid"], work);
  writeText(path.join(work, "README.md"), "# repo session test\n");
  writeJson(path.join(work, "thinking-protocol.json"), validThinkingProtocol());
  runGit(["add", "README.md"], work);
  runGit(["add", "thinking-protocol.json"], work);
  runGit(["commit", "-m", "initial"], work);
  runGit(["branch", "-M", "main"], work);
  runGit(["remote", "add", "origin", remote], work);
  runGit(["push", "-u", "origin", "main"], work);
  return { root, remote, work };
}

function assertClassification(repoPath, expected) {
  const actual = classifySessionEntry({ path: repoPath, code: "??", record: "untracked" });
  assert.strictEqual(actual.classification, expected, `${repoPath} classification`);
}

function main() {
  assertClassification("scripts/example.js", "intended_change_candidate");
  assertClassification("plugins/example/skills/test/SKILL.md", "intended_change_candidate");
  assertClassification("output/report.json", "generated_or_runtime");
  assertClassification("logs/current/operator_summary.json", "generated_or_runtime");
  assertClassification("passport_photo_35x45mm_300dpi.jpg", "private_or_local_artifact");
  assertClassification("local-archive.zip", "private_or_local_artifact");
  assertClassification("scratch/unknown.txt", "unknown_dirty");

  const cleanRepo = createRepo("clean");
  const cleanPreflight = buildPreflightReport({ cwd: cleanRepo.work });
  assert.strictEqual(cleanPreflight.status, "CLEAN");
  assert.strictEqual(cleanPreflight.cleanStartAllowed, true);
  const cleanCloseout = buildCloseoutReport({ cwd: cleanRepo.work });
  assert.strictEqual(cleanCloseout.status, "CLEAN_READY");
  assert.strictEqual(cleanCloseout.cleanStartForNextSession, true);

  const sourceRepo = createRepo("source");
  writeText(path.join(sourceRepo.work, "scripts", "new_tool.js"), "\"use strict\";\n");
  const sourceReport = buildPreflightReport({ cwd: sourceRepo.work });
  assert.strictEqual(sourceReport.status, "DIRTY_BASELINE");
  assert.strictEqual(sourceReport.cleanStartAllowed, false);
  assert.strictEqual(sourceReport.counts.byClassification.intended_change_candidate, 1);

  const outputRepo = createRepo("output");
  writeText(path.join(outputRepo.work, "output", "report.json"), "{}\n");
  const outputReport = buildPreflightReport({ cwd: outputRepo.work });
  assert.strictEqual(outputReport.status, "DIRTY_BASELINE");
  assert.strictEqual(outputReport.counts.byClassification.generated_or_runtime, 1);

  const privateRepo = createRepo("private");
  writeText(path.join(privateRepo.work, "passport_photo_35x45mm_300dpi.jpg"), "not really an image\n");
  const privateReport = buildPreflightReport({ cwd: privateRepo.work });
  assert.strictEqual(privateReport.status, "DIRTY_BASELINE");
  assert.strictEqual(privateReport.counts.byClassification.private_or_local_artifact, 1);

  const aheadRepo = createRepo("ahead");
  writeText(path.join(aheadRepo.work, "README.md"), "# repo session test\n\nlocal commit\n");
  runGit(["add", "README.md"], aheadRepo.work);
  runGit(["commit", "-m", "local change"], aheadRepo.work);
  const aheadCloseout = buildCloseoutReport({ cwd: aheadRepo.work });
  assert.strictEqual(aheadCloseout.status, "PUSH_REQUIRED");
  assert.strictEqual(aheadCloseout.cleanStartForNextSession, false);
  runGit(["push"], aheadRepo.work);
  const pushedCloseout = buildCloseoutReport({ cwd: aheadRepo.work });
  assert.strictEqual(pushedCloseout.status, "CLEAN_READY");
  assert.strictEqual(pushedCloseout.cleanStartForNextSession, true);

  const autoCloseRepo = createRepo("autoclose");
  writeText(path.join(autoCloseRepo.work, "scripts", "session_guard_fixture.js"), "\"use strict\";\n");
  writeText(path.join(autoCloseRepo.work, "passport_source.jpg"), "private fixture\n");
  const autoCloseResult = runAutoClose({ cwd: autoCloseRepo.work, message: "chore(codex): test autoclose" });
  assert.strictEqual(autoCloseResult.status, "CLEAN_READY");
  assert.strictEqual(autoCloseResult.commit.status, "created");
  assert.strictEqual(autoCloseResult.push.status, "pushed");
  assert(autoCloseResult.quarantined.includes("passport_source.jpg"), "private fixture should be quarantined in .git/info/exclude");
  assert.strictEqual(buildCloseoutReport({ cwd: autoCloseRepo.work }).status, "CLEAN_READY");

  const unknownRepo = createRepo("unknown");
  writeText(path.join(unknownRepo.work, "scratch", "unknown.txt"), "unknown\n");
  const unknownPlan = buildAutoClosePlan({ cwd: unknownRepo.work });
  assert.strictEqual(unknownPlan.canRun, false);
  assert.strictEqual(unknownPlan.blockers[0].reason, "unknown_dirty_requires_manual_classification_or_explicit_include");

  console.log("PASS repo_session_guard_test");
}

main();
