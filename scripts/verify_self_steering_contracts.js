#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function readJson(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

function mustInclude(arr, key, msg) {
  if (!Array.isArray(arr) || !arr.includes(key)) {
    throw new Error(`${msg}${key}`);
  }
}

function mustBeRequiredArray(section, key, msg) {
  const field = section[key];
  if (!field) {
    throw new Error(`${msg}${key}`);
  }
  if (field.required !== true) {
    throw new Error(`${msg}${key}.required`);
  }
  if (field.minItems < 1) {
    throw new Error(`${msg}${key}.minItems`);
  }
}

function verifySelfSteeringContracts(root = process.cwd()) {
  const runtime = readJson(root, "scripts/config/self_steering_runtime_contract.json");
  const adoption = readJson(root, "scripts/config/adoption_readiness_evaluator_contract.json");
  const correction = readJson(root, "scripts/config/correction_learning_contract.json");
  const architecture = fs.readFileSync(path.join(root, "docs/CURRENT_ARCHITECTURE.md"), "utf8");

  const runtimeSurface = runtime.runtimePrimaryControlSurface || {};
  [
    "candidate_directions",
    "chosen_direction",
    "rejected_directions",
    "kill_conditions",
    "current_gap",
    "self_correction_applied",
  ].forEach((key) => {
    if (!runtimeSurface[key]) {
      throw new Error(`self_steering_runtime_contract missing runtimePrimaryControlSurface.${key}`);
    }
  });
  mustBeRequiredArray(
    runtimeSurface,
    "candidate_directions",
    "self_steering_runtime_contract invalid runtimePrimaryControlSurface."
  );

  const latentIntent = runtime.latentIntentAdjudication || {};
  [
    "candidate_intent_hypotheses",
    "chosen_intent_model",
    "benchmark_strengths_to_surpass",
    "artifact_comparison_evidence",
  ].forEach((key) => {
    if (!latentIntent[key]) {
      throw new Error(`self_steering_runtime_contract missing latentIntentAdjudication.${key}`);
    }
  });
  [
    "candidate_intent_hypotheses",
    "benchmark_strengths_to_surpass",
    "artifact_comparison_evidence",
  ].forEach((key) => {
    mustBeRequiredArray(latentIntent, key, "self_steering_runtime_contract invalid latentIntentAdjudication.");
  });

  const recurrence = runtime.recurrencePrevention || {};
  ["next_turn_recurrence_patch", "recurrence_patch_decision"].forEach((key) => {
    if (!recurrence[key]) {
      throw new Error(`self_steering_runtime_contract missing recurrencePrevention.${key}`);
    }
  });

  if (((runtime.failClosed || {}).missingRuntimePrimaryControlSurface) !== "fail_closed") {
    throw new Error("self_steering_runtime_contract missing fail_closed runtime control guard");
  }
  if (((runtime.failClosed || {}).missingArtifactGroundedLatentIntentEvidence) !== "fail_closed") {
    throw new Error("self_steering_runtime_contract missing fail_closed latent intent guard");
  }
  if (((runtime.failClosed || {}).missingNextTurnRecurrencePatch) !== "fail_closed") {
    throw new Error("self_steering_runtime_contract missing fail_closed recurrence guard");
  }

  const grounding = adoption.latentIntentArtifactGrounding || {};
  if (grounding.required !== true) {
    throw new Error("adoption readiness contract missing latentIntentArtifactGrounding.required");
  }
  [
    "candidate_intent_hypotheses",
    "chosen_intent_model",
    "benchmark_strengths_to_surpass",
    "artifact_comparison_evidence",
  ].forEach((key) => {
    mustInclude(adoption.judgmentInputs, key, "adoption readiness contract missing judgment input ");
    mustInclude(grounding.requiredInputs, key, "adoption readiness contract missing latent intent grounding input ");
  });
  if (grounding.failClosedWhenArtifactEvidenceMissing !== true) {
    throw new Error("adoption readiness contract missing fail-closed artifact grounding guard");
  }

  const recurrencePolicy = correction.recurrencePatchPolicy || {};
  if (recurrencePolicy.requiredBeforeSkillPromotion !== true) {
    throw new Error("correction learning contract missing recurrence-before-promotion requirement");
  }
  ["next_turn_recurrence_patch", "recurrence_patch_decision"].forEach((key) => {
    mustInclude(recurrencePolicy.requiredFields, key, "correction learning contract missing recurrence patch field ");
    mustInclude((correction.learningTriage || {}).requiredSteps, key, "correction learning contract missing lifecycle step ");
  });
  mustInclude(
    (correction.learningTriage || {}).requiredDecisions,
    "recurrence_patch_decision",
    "correction learning contract missing required decision "
  );
  if (recurrencePolicy.failClosedWhenRecurrencePatchMissing !== true) {
    throw new Error("correction learning contract missing fail-closed recurrence guard");
  }

  ["ac-1", "ac-2", "ac-3"].forEach((marker) => {
    if (!architecture.includes(marker)) {
      throw new Error(`CURRENT_ARCHITECTURE.md missing ${marker}`);
    }
  });
  [
    "runtime primary control surface",
    "artifact-grounded comparison required",
    "proof boundary: static contract and docs consistency only",
  ].forEach((phrase) => {
    if (!architecture.includes(phrase)) {
      throw new Error(`CURRENT_ARCHITECTURE.md missing phrase: ${phrase}`);
    }
  });
}

function main() {
  try {
    verifySelfSteeringContracts();
    process.stdout.write("self-steering contracts verified\n");
  } catch (error) {
    process.stderr.write(`${error && error.message ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  mustBeRequiredArray,
  mustInclude,
  verifySelfSteeringContracts,
};
