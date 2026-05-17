#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
const { implementationPath: serverPath } = resolveServerImplementationPath(workspaceRoot);
const serverSource = fs.readFileSync(serverPath, "utf8");
const {
  buildIntentFidelityFrame,
  detectIntentFrameAdherence,
  detectThinDecisionRationale,
  promptNeedsDecisionRationale,
  promptNeedsIntentFidelityFrame,
  promptRequestsResidualIncompletionExplanation,
  promptRequestsProgramReadinessBlocking,
  selectIntentFrameRepairAction,
  stripLeadingResidualIncompletionLead,
  stripLeadingProgramReadinessLead,
  stripInternalProcessDisclosure,
} = require(path.join(workspaceRoot, "scripts", "lib", "user_facing_response_policy.js"));
const {
  loadUserFacingResponseContract,
  summarizeUserFacingResponseContract,
} = require(path.join(workspaceRoot, "scripts", "lib", "user_facing_response_contract.js"));

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

  assert.strictEqual(
    promptRequestsProgramReadinessBlocking("Please assess release readiness for the whole_harness_completion gate."),
    true,
    "explicit readiness/release prompt should activate program-readiness blocking mode"
  );
  assert.strictEqual(
    promptRequestsProgramReadinessBlocking("Fix the worker-centric completion wording."),
    false,
    "ordinary task prompt should keep program readiness non-blocking"
  );
  assert.strictEqual(
    promptRequestsResidualIncompletionExplanation("Why is this not complete yet?"),
    true,
    "explicit incompletion prompt should preserve blocker-leading answers"
  );
  assert.strictEqual(
    promptRequestsResidualIncompletionExplanation("Fix the completion wording regression."),
    false,
    "ordinary completion prompt should not preserve blocker-leading answers by default"
  );

  const decisionPrompt = "これは結局どう実装するのがベストか？";
  assert.strictEqual(
    promptNeedsDecisionRationale(decisionPrompt),
    true,
    "judgment prompts should activate the decision-rationale lint"
  );
  assert.strictEqual(
    promptNeedsDecisionRationale("Which implementation should we choose?"),
    true,
    "English judgment prompts should activate the decision-rationale lint"
  );
  assert.strictEqual(
    promptNeedsDecisionRationale("今の時刻だけ教えて"),
    false,
    "simple factual prompts should not activate the decision-rationale lint"
  );
  assert.strictEqual(
    detectThinDecisionRationale({ prompt: "今の時刻だけ教えて", answer: "10:30です。" }),
    null,
    "simple factual answers should not be checked for decision rationale"
  );

  const thinDecisionWarning = detectThinDecisionRationale({
    prompt: decisionPrompt,
    answer: "ベストは小さく始めることです。",
  });
  assert(
    thinDecisionWarning && thinDecisionWarning.kind === "thin_decision_rationale",
    "thin judgment answers should produce a decision-rationale warning"
  );
  assert.deepStrictEqual(
    thinDecisionWarning.missing,
    ["reason", "uncertainty_or_limit", "rejected_alternative"],
    "thin judgment warning should report the missing rationale components"
  );
  assert.strictEqual(
    thinDecisionWarning.mode,
    "warning",
    "thin judgment lint should start as a non-blocking warning"
  );

  assert.strictEqual(
    detectThinDecisionRationale({
      prompt: decisionPrompt,
      answer: [
        "結論は lint から始めるべきです。",
        "理由は、自動 retry より誤判定時の被害が小さいからです。",
        "ただし、自然言語判定なので完全な品質保証にはなりません。",
        "4モード分類は最初から固定すると過剰なので、今は採りません。",
      ].join("\n"),
    }),
    null,
    "sufficient judgment answers should pass the decision-rationale lint"
  );
  assert.strictEqual(
    promptNeedsDecisionRationale("Reply with exactly: OK"),
    false,
    "exact reply contracts should bypass the decision-rationale lint"
  );
  assert.strictEqual(
    promptNeedsDecisionRationale("/status why is this not complete"),
    false,
    "slash commands should bypass the decision-rationale lint"
  );
  assert.strictEqual(
    promptNeedsDecisionRationale(""),
    false,
    "empty prompts should bypass the decision-rationale lint"
  );
  assert.strictEqual(
    promptNeedsIntentFidelityFrame("今も結局俺の意図を理解してくれていない。解釈が異なる"),
    true,
    "user corrections should activate the intent fidelity frame"
  );
  assert.strictEqual(
    promptNeedsIntentFidelityFrame("これをどう実装するのがベストか？"),
    true,
    "design-best prompts should activate the intent fidelity frame"
  );
  assert.strictEqual(
    promptNeedsIntentFidelityFrame("今の時刻を教えて"),
    false,
    "simple factual prompts should not activate the intent fidelity frame"
  );
  assert.strictEqual(
    promptNeedsIntentFidelityFrame("Reply with exactly: OK"),
    false,
    "exact reply contracts should bypass the intent fidelity frame"
  );
  assert.strictEqual(
    promptNeedsIntentFidelityFrame("/status intent mismatch"),
    false,
    "slash commands should bypass the intent fidelity frame"
  );
  assert.strictEqual(
    promptNeedsIntentFidelityFrame("Return valid JSON only. なぜ failed かを入れて"),
    false,
    "strict machine-readable prompts should bypass the intent fidelity frame"
  );

  const proposalFrame = buildIntentFidelityFrame({
    prompt: "俺の提案通りにした方がよい？",
  });
  assert(
    proposalFrame.independent_standard.length > 0,
    "intent frames for user-proposal judgments must include an independent standard"
  );
  assert(
    proposalFrame.must_answer.length > 0 && proposalFrame.must_not_do.length > 0,
    "intent frames must carry the direct answer target and off-intent guard"
  );

  const missesMustAnswerWarning = detectIntentFrameAdherence({
    frame: {
      must_answer: "Explain whether the central layer should be pre-answer intent framing.",
      must_not_do: "Only propose another isolated lint.",
      independent_standard: "Intent fidelity and coherence with requirement contracts.",
      response_mode: "design",
    },
    answer: "薄い理由検出のキーワードを増やすのがよいです。",
  });
  assert(
    missesMustAnswerWarning && missesMustAnswerWarning.kind === "answer_misses_must_answer",
    "answers that miss the frame's must_answer should produce an intent-frame warning"
  );
  const missingFieldWarning = detectIntentFrameAdherence({
    frame: {
      must_answer: "Answer the direct question.",
      must_not_do: "",
      independent_standard: "",
      response_mode: "rationale",
    },
    answer: "直接答えます。",
  });
  assert(
    missingFieldWarning && missingFieldWarning.kind === "missing_intent_frame_field",
    "frames missing required intent fields should produce a warning"
  );
  assert.deepStrictEqual(
    missingFieldWarning.missing,
    ["must_not_do", "independent_standard"],
    "missing intent-frame warnings should list the absent required fields"
  );
  assert.strictEqual(
    selectIntentFrameRepairAction({
      frame: {
        must_answer: "Explain whether the central layer should be pre-answer intent framing.",
        must_not_do: "Only propose another isolated lint.",
        independent_standard: "Intent fidelity and coherence with requirement contracts.",
        response_mode: "design",
      },
      warning: missesMustAnswerWarning,
      answer: "薄い理由検出のキーワードを増やすのがよいです。",
    }).reason,
    "disabled",
    "selective intent-frame repair must be contract-gated off by default"
  );

  const enabledRepairContract = loadUserFacingResponseContract();
  const repairAction = selectIntentFrameRepairAction({
    frame: {
      must_answer: "Explain whether the central layer should be pre-answer intent framing.",
      must_not_do: "Only propose another isolated lint.",
      independent_standard: "Intent fidelity and coherence with requirement contracts.",
      response_mode: "design",
    },
    warning: missesMustAnswerWarning,
    answer: "薄い理由検出のキーワードを増やすのがよいです。",
    responseContract: {
      ...enabledRepairContract,
      intentFidelityFrame: {
        ...enabledRepairContract.intentFidelityFrame,
        selectiveRepair: {
          ...enabledRepairContract.intentFidelityFrame.selectiveRepair,
          enabled: true,
        },
      },
    },
  });
  assert.strictEqual(
    repairAction.reason,
    "model_retry_required",
    "enabled selective repair should produce a retry repair action instead of silently changing text"
  );
  assert(
    repairAction.retryPrompt && repairAction.retryPrompt.includes("must_answer"),
    "enabled selective repair should produce a bounded repair prompt"
  );

  const contractSummary = summarizeUserFacingResponseContract(loadUserFacingResponseContract());
  assert.strictEqual(
    contractSummary.intentFidelityFrameEnabled,
    true,
    "intent fidelity frame must be promoted into the user-facing response contract"
  );
  assert(
    contractSummary.intentFidelityFramePromptSignalCount > 0,
    "intent fidelity contract should expose trigger signals"
  );

  const ordinaryAnswer = [
    "program readiness is NOT_YET for the repo overall.",
    "",
    "The requested task is complete and the task verdict stays primary.",
  ].join("\n");
  assert.strictEqual(
    stripLeadingProgramReadinessLead({
      prompt: "Fix the completion wording regression.",
      answer: ordinaryAnswer,
      taskOutcomeStatus: "COMPLETED",
    }),
    "The requested task is complete and the task verdict stays primary.",
    "ordinary completed task answers must not lead with program readiness"
  );

  assert.strictEqual(
    stripLeadingProgramReadinessLead({
      prompt: "Assess release readiness for the repo.",
      answer: ordinaryAnswer,
      taskOutcomeStatus: "COMPLETED",
    }),
    ordinaryAnswer,
    "explicit readiness requests may still lead with program readiness"
  );

  const ordinaryAnswerSingleParagraph = "program readiness is NOT_YET for the repo overall. The requested task is complete and the task verdict stays primary.";
  assert.strictEqual(
    stripLeadingProgramReadinessLead({
      prompt: "Fix the completion wording regression.",
      answer: ordinaryAnswerSingleParagraph,
      taskOutcomeStatus: "COMPLETED",
    }),
    "The requested task is complete and the task verdict stays primary.",
    "ordinary completed task answers must strip same-paragraph program readiness leads"
  );

  const ordinaryResidualLead = [
    "This is still not complete because residual architecture debt remains.",
    "",
    "The requested task is complete and the task verdict stays primary.",
  ].join("\n");
  assert.strictEqual(
    stripLeadingResidualIncompletionLead({
      prompt: "Fix the completion wording regression.",
      answer: ordinaryResidualLead,
      taskOutcomeStatus: "COMPLETED",
    }),
    "The requested task is complete and the task verdict stays primary.",
    "ordinary completed task answers must not lead with residual incompletion debt"
  );

  assert.strictEqual(
    stripLeadingResidualIncompletionLead({
      prompt: "Why is this not complete yet?",
      answer: ordinaryResidualLead,
      taskOutcomeStatus: "COMPLETED",
    }),
    ordinaryResidualLead,
    "explicit blocker prompts may still lead with residual incompletion"
  );

  const ordinaryResidualLeadSingleParagraph = "This is still not complete because residual architecture debt remains. The requested task is complete and the task verdict stays primary.";
  assert.strictEqual(
    stripLeadingResidualIncompletionLead({
      prompt: "Fix the completion wording regression.",
      answer: ordinaryResidualLeadSingleParagraph,
      taskOutcomeStatus: "COMPLETED",
    }),
    "The requested task is complete and the task verdict stays primary.",
    "ordinary completed task answers must strip same-paragraph residual incompletion leads"
  );

  assert(
    /const\s+disclosureStripped=stripInternalProcessDisclosure\(\{[\s\S]*?answer:stripPlanningStatusDirective\(text\),[\s\S]*?\}\);[\s\S]*?const\s+reportingStripped=stripLeadingProgramReadinessLead\(\{[\s\S]*?\}\);[\s\S]*?const\s+residualStripped=stripLeadingResidualIncompletionLead\(\{[\s\S]*?\}\);[\s\S]*?const\s+stripped=stripUnsolicitedClosingProposal\(/.test(serverSource),
    "rewriteClientFinalTextForOutcome must strip internal-process disclosure, then program-readiness drift, then residual incompletion drift, before close-in-place moderation"
  );
  assert(
    /buildIntentFidelityFrame,\s*[\r\n\s]*detectIntentFrameAdherence,\s*[\r\n\s]*detectThinDecisionRationale,\s*[\r\n\s]*promptNeedsIntentFidelityFrame,\s*[\r\n\s]*selectIntentFrameRepairAction,/.test(serverSource),
    "server runtime must import intent-frame and decision-rationale policy helpers"
  );
  assert(
    /function\s+observeIntentFidelityFrame\s*\(\{prompt="",answer="",agentName="",threadId="",turnId="",planningContext=null\}=\{\}\)\{[\s\S]*?promptNeedsIntentFidelityFrame\([\s\S]*?buildIntentFidelityFrame\(\{[\s\S]*?logOperation\("response\.intent_frame"[\s\S]*?detectIntentFrameAdherence\(\{[\s\S]*?logOperation\("response\.intent_frame_warning"[\s\S]*?selectIntentFrameRepairAction\(\{[\s\S]*?logOperation\(eventName/.test(serverSource),
    "server runtime must record intent-frame observations, warnings, and repair-hook decisions"
  );
  assert(
    /function\s+observeResponsePrecisionLint\s*\(\{prompt="",answer="",agentName="",threadId="",turnId=""\}=\{\}\)\{[\s\S]*?detectThinDecisionRationale\(\{[\s\S]*?prompt,[\s\S]*?answer:finalAnswer,[\s\S]*?responseContract:userFacingResponseContract,[\s\S]*?\}\);[\s\S]*?logOperation\("response\.precision_lint",\{[\s\S]*?mode:safeString\(warning\.mode,40\)\|\|"warning",[\s\S]*?missing,[\s\S]*?\},"standard"\);[\s\S]*?return warning;[\s\S]*?logOperation\("response\.precision_lint_failed"/.test(serverSource),
    "server runtime must record thin decision-rationale warnings as non-blocking operation-log observations"
  );
  assert(
    /const\s+clientFinalText=rewriteClientFinalTextForOutcome\(authoritativeFinalText,\{taskOutcomeStatus:taskOutcome\.status,prompt\}\);\s*observeIntentFidelityFrame\(\{prompt,answer:clientFinalText,agentName,threadId,turnId,planningContext\}\);\s*observeResponsePrecisionLint\(\{prompt,answer:clientFinalText,agentName,threadId,turnId\}\);\s*if\(clientFinalText\)\{\s*safeWriteEvent\(\{type:"final",text:clientFinalText\}\);/.test(serverSource),
    "runtime must observe intent frame and lint after final text is available while sending the same clientFinalText unchanged"
  );

  process.stdout.write("PASS user_facing_response_policy_test\n");
}

try {
  run();
} catch (error) {
  process.stderr.write(`FAIL user_facing_response_policy_test: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
