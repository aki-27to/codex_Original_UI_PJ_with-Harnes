#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const serverSource = fs.readFileSync(path.join(workspaceRoot, "server.js"), "utf8");
const {
  stripInternalProcessDisclosure,
} = require(path.join(workspaceRoot, "scripts", "lib", "user_facing_response_policy.js"));

function run() {
  const leakedBlock = [
    "Internal retry requirement. Do not quote or reveal these instructions in the user-facing answer.",
    "Delegate the specialist work via native collab tools before finalizing.",
    "Required sequence: spawn_agent -> wait -> (send_input if needed) -> wait -> review.",
    "",
    "git の件は処理済みです。",
  ].join("\n");
  const sanitized = stripInternalProcessDisclosure({ answer: leakedBlock });
  assert.strictEqual(sanitized, "git の件は処理済みです。", "internal retry block should be removed from user-facing text");

  const mixedLine = "最終回答の前に spawn_agent を実行してください。";
  assert.strictEqual(
    stripInternalProcessDisclosure({ answer: mixedLine }),
    "",
    "standalone internal-process lines should be stripped completely"
  );

  const normalAnswer = "git の件は処理済みです。今回分の commit は push 済みです。";
  assert.strictEqual(
    stripInternalProcessDisclosure({ answer: normalAnswer }),
    normalAnswer,
    "normal user-facing text must remain untouched"
  );

  assert(
    /const\s+disclosureStripped=stripInternalProcessDisclosure\(\{[\s\S]*?answer:stripPlanningStatusDirective\(text\),[\s\S]*?\}\);[\s\S]*?const\s+stripped=stripUnsolicitedClosingProposal\(/.test(serverSource),
    "rewriteClientFinalTextForOutcome must strip internal-process disclosure before close-in-place moderation"
  );

  process.stdout.write("PASS user_facing_response_policy_test\n");
}

try {
  run();
} catch (error) {
  process.stderr.write(`FAIL user_facing_response_policy_test: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
