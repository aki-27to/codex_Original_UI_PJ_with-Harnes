#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function main() {
  const constitution = read("docs/HARNESS_CONSTITUTION.md");
  const agents = read("AGENTS.md");

  assert(
    constitution.includes("Sovereignty remains with the human-adopted constitution, explicit operator decisions, permission boundaries, stop conditions, and release gates."),
    "HARNESS_CONSTITUTION.md must fix sovereignty above the agent runtime"
  );
  assert(
    constitution.includes("This harness may optimize execution inside those boundaries, but it must not self-amend or silently weaken:"),
    "HARNESS_CONSTITUTION.md must forbid self-amending core governance"
  );
  assert(
    constitution.includes("return to human only for explicit user-decision clauses, destructive irreversible actions, irreversible external writes, broad environment / permission changes, or material safety / authority uncertainty"),
    "HARNESS_CONSTITUTION.md must define the narrow return-to-human boundary"
  );
  assert(
    constitution.includes("fail closed rather than self-justify shipment"),
    "HARNESS_CONSTITUTION.md must encode fail-closed behavior"
  );
  assert(
    constitution.includes("Convert user requests into adoption-ready deliverables with minimal unnecessary human interruption while preserving alignment with the user's literal request, latent intent, constitutional authority boundaries, and release-quality gates."),
    "HARNESS_CONSTITUTION.md must make the top-level mission user-adoptable outcome oriented"
  );
  assert(
    constitution.includes("user-adoptable outcome is the top-level objective; a clean internal procedure is not a substitute for the result"),
    "HARNESS_CONSTITUTION.md must reject bureaucratic closure as the primary objective"
  );
  assert(
    constitution.includes("A procedurally clean but non-adoptable run is not a successful outcome."),
    "HARNESS_CONSTITUTION.md must reject procedurally clean but user-misaligned runs"
  );

  assert(
    agents.includes("このファイルは、L0 の主権固定と L1 の最上位目的を runtime で受けるための運用憲法です。"),
    "AGENTS.md must declare that it receives L0/L1 rather than owning them"
  );
  assert(
    agents.includes("最上位の実務目的は、ユーザー依頼を最小の不要 HITL で adoption-ready deliverable に変換することです。"),
    "AGENTS.md must inherit the user-adoptable outcome mission"
  );
  assert(
    agents.includes("原文不一致、潜在意図不一致、内部都合への goal すり替えは同じ系統の重大失敗です。"),
    "AGENTS.md must treat internal goal substitution as a top-level failure"
  );
  assert(
    agents.includes("内部都合の goal へのすり替え"),
    "AGENTS.md must explicitly forbid internal goal substitution"
  );
  assert(
    agents.includes("silent task-contract rewrite"),
    "AGENTS.md must explicitly forbid silent task-contract rewrites"
  );
  assert(
    agents.includes("内部的な review closure、plan 消化、decision state 到達だけでは `COMPLETED` にしてはいけません。"),
    "AGENTS.md must forbid counting procedural closure as completion"
  );

  process.stdout.write("PASS l0_l1_governance_surface_test\n");
}

main();
