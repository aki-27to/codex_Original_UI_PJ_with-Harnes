#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  CANONICAL_ORDER,
  REQUIRED_SOURCES,
} = require("./lib/thinking_protocol_validator");

const workspaceRoot = path.resolve(__dirname, "..");
const preflightPath = path.join(workspaceRoot, "scripts", "repo_session_preflight.js");

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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function validThinkingProtocol() {
  const sources = Array.from(REQUIRED_SOURCES);
  return {
    schemaVersion: "thinking-protocol.v1",
    artifactKind: "mechanical-thinking-protocol",
    task: {
      id: "gate-test",
      description: "Validate preflight thinking protocol enforcement.",
      owner: "Codex test",
    },
    canonicalOrder: CANONICAL_ORDER,
    issueThinking: {
      originalRequest: "Implement the governed preflight protocol gate.",
      phenomenonOrIssue: {
        observedProblem: "Governed execution can start without a machine-readable protocol.",
        classification: "issue",
        reason: "A missing artifact would make the protocol advisory instead of enforced.",
      },
      trueIssueCandidates: [
        {
          id: "I1",
          question: "Does the gate reject missing protocol artifacts?",
          impact: "It prevents governed execution without required thinking evidence.",
          solvable: "The preflight can validate a fixed JSON artifact path.",
          shortValidation: "Run the preflight against a clean repo with no protocol file.",
          decisionDirectness: "The exit code directly controls the start gate.",
        },
        {
          id: "I2",
          question: "Does the gate reject incomplete protocol artifacts?",
          impact: "It blocks placeholder or partial protocol packets.",
          solvable: "The validator returns deterministic findings.",
          shortValidation: "Run the preflight against an invalid protocol file.",
          decisionDirectness: "The findings identify exactly which fields failed.",
        },
      ],
      selectedBigIssue: {
        question: "Can governed execution be blocked until the thinking protocol is present and valid?",
        selectionReason: "This is the core enforcement gap being tested.",
        sourcePerspective: "The operator needs a fail-closed start gate, not a proposal.",
      },
      perspectiveMoves: [
        "View the protocol as a gate artifact rather than narrative guidance.",
        "Treat the validator result as part of the preflight decision.",
      ],
      outOfScope: ["Changing unrelated repo-session dirty-state policy."],
    },
    issueSelection: {
      singleIssueQuestion: "Can the preflight fail closed on missing or invalid thinking-protocol.json?",
      valueEquationAcknowledgement: "valuable_work = issue_degree * solution_quality",
      issueDegree: {
        impactHigh: { answer: "yes", rationale: "A start gate without this check allows protocol-free governed execution." },
        solvableNow: { answer: "yes", rationale: "The validator is local and dependency-free." },
        answerDiverges: { answer: "yes", rationale: "Proposal-only integration and real gate enforcement differ materially." },
      },
      dogPathCheck: {
        willAvoidEffortSubstitution: true,
        evidence: "The test asserts process exit codes from the real preflight CLI.",
      },
      storyline: [
        "The preflight reads thinking-protocol.json from the target repo root.",
        "Missing and invalid artifacts block while a valid artifact allows a clean start.",
      ],
      messageDrivenOutput: "Governed execution is allowed only after the protocol artifact validates.",
    },
    hypothesisThinking: {
      primaryHypothesis: {
        statement: "A local validator in the preflight path can enforce protocol completeness.",
        specificObservable: "The CLI exits nonzero for missing and invalid protocols and exits zero for a clean valid repo.",
        decisionImplication: "Passing results demonstrate live gate integration rather than standalone prototype validation.",
      },
      alternativeHypotheses: [
        "The validator might only work as a standalone script and not affect the preflight exit.",
        "The dirty baseline bypass might accidentally bypass protocol validation.",
      ],
      decomposition: {
        formula: "preflight_pass = clean_repo_state && valid_thinking_protocol",
        factors: ["git clean state", "thinking protocol artifact presence", "validator findings"],
      },
      falsificationExitConditions: [
        {
          condition: "Missing or invalid protocol exits zero.",
          nextAction: "Fix preflight exit mapping so protocol failure is not bypassed.",
        },
      ],
      minimumValidationPlan: [
        {
          step: "Run missing, invalid, and valid protocol cases through repo_session_preflight.js.",
          evidenceNeeded: "Process exit code and stdout gate status.",
          changesDecisionIf: "Any case disagrees with the expected block/pass behavior.",
        },
      ],
      biasControls: {
        antiConfirmation: "The test uses process exits from the real CLI instead of direct validator calls.",
        antiPrematureConvergence: "The dirty-bypass edge is tested separately from valid clean pass.",
      },
    },
    verification: {
      evidenceObserved: ["The test fixture executes the real preflight CLI."],
      hypothesisUpdate: {
        status: "support",
        update: "A valid fixture should pass while missing and invalid fixtures should block.",
      },
      answeredBigIssue: {
        status: "answered",
        rationale: "The preflight exit code answers whether the gate is enforced.",
      },
      residualRisks: ["This fixture does not test every possible invalid field combination."],
    },
    gateDecision: {
      readyToProceed: true,
      blockIfIncomplete: true,
      decision: "Proceed only when the protocol validates.",
    },
    sourceCoverage: sources.map((sourceName) => ({
      sourceName,
      mechanizedElements: [`${sourceName} is represented in the preflight gate fixture.`],
    })),
  };
}

function createRepo(label, protocolValue) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `thinking-protocol-${label}-`));
  const remote = path.join(root, "remote.git");
  const work = path.join(root, "work");
  fs.mkdirSync(work, { recursive: true });
  runGit(["init", "--bare", remote], root);
  runGit(["init"], work);
  runGit(["config", "user.name", "Thinking Protocol Test"], work);
  runGit(["config", "user.email", "thinking-protocol@example.invalid"], work);
  fs.writeFileSync(path.join(work, "README.md"), "# thinking protocol gate test\n", "utf8");
  if (protocolValue) {
    writeJson(path.join(work, "thinking-protocol.json"), protocolValue);
  }
  runGit(["add", "-A"], work);
  runGit(["commit", "-m", "initial"], work);
  runGit(["branch", "-M", "main"], work);
  runGit(["remote", "add", "origin", remote], work);
  runGit(["push", "-u", "origin", "main"], work);
  return { root, remote, work };
}

function runPreflight(repo, extraArgs = []) {
  return spawnSync(process.execPath, [preflightPath, "--cwd", repo.work, ...extraArgs], {
    cwd: workspaceRoot,
    windowsHide: true,
    encoding: "utf8",
    timeout: 30000,
  });
}

function assertExit(result, expected, label) {
  assert.strictEqual(result.status, expected, `${label} exit\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

function main() {
  const missingRepo = createRepo("missing", null);
  const missing = runPreflight(missingRepo);
  assertExit(missing, 3, "missing protocol");
  assert(missing.stdout.includes("thinking_protocol=BLOCKED"), "missing protocol should report BLOCKED");
  assert(missing.stdout.includes("cannot read JSON"), "missing protocol should expose the read failure");

  const invalidRepo = createRepo("invalid", { schemaVersion: "thinking-protocol.v1" });
  const invalid = runPreflight(invalidRepo);
  assertExit(invalid, 3, "invalid protocol");
  assert(invalid.stdout.includes("thinking_protocol=BLOCKED"), "invalid protocol should report BLOCKED");
  assert(invalid.stdout.includes("artifactKind"), "invalid protocol should expose validator findings");

  const validRepo = createRepo("valid", validThinkingProtocol());
  const valid = runPreflight(validRepo);
  assertExit(valid, 0, "valid protocol");
  assert(valid.stdout.includes("thinking_protocol=PASS"), "valid protocol should report PASS");

  fs.writeFileSync(path.join(validRepo.work, "scratch.txt"), "dirty baseline\n", "utf8");
  const dirtyAllowed = runPreflight(validRepo, ["--allow-dirty"]);
  assertExit(dirtyAllowed, 0, "valid protocol with allow-dirty");
  assert(dirtyAllowed.stdout.includes("status=DIRTY_BASELINE"), "allow-dirty should preserve dirty status");
  assert(dirtyAllowed.stdout.includes("thinking_protocol=PASS"), "allow-dirty must not skip protocol validation");

  const missingAllowed = runPreflight(missingRepo, ["--allow-dirty"]);
  assertExit(missingAllowed, 3, "missing protocol with allow-dirty");

  console.log("PASS thinking_protocol_gate_test");
}

main();
