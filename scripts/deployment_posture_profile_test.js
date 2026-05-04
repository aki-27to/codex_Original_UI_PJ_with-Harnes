#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  loadDeploymentPostureProfiles,
  resolveDeploymentPosture,
  buildDeploymentPostureRuntimeSummary,
} = require("./lib/deployment_posture_profile");

function main() {
  const profiles = loadDeploymentPostureProfiles();
  assert.strictEqual(profiles.schema, "deployment-posture-profiles.v1", "deployment posture schema mismatch");
  assert.strictEqual(profiles.defaultProfile, "portable_local", "default deployment posture must stay portable_local");
  assert(profiles.profiles.owner_local, "owner_local profile missing");
  assert(profiles.profiles.portable_local, "portable_local profile missing");
  assert(profiles.profiles.reviewed_team, "reviewed_team profile missing");

  const explicitOwner = resolveDeploymentPosture({ explicitProfile: "owner_local", profiles });
  assert.strictEqual(explicitOwner.active.id, "owner_local", "explicit owner_local profile must resolve");
  assert.strictEqual(Boolean(explicitOwner.explicit), true, "explicit owner_local selection must be marked explicit");

  const inferredOwner = resolveDeploymentPosture({
    approvalPolicy: "never",
    sandboxMode: "danger-full-access",
    autoCommitAndPush: true,
    profiles,
  });
  assert.strictEqual(inferredOwner.active.id, "owner_local", "owner-local defaults must resolve to owner_local");

  const runtimeSummary = buildDeploymentPostureRuntimeSummary({
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    autoCommitAndPush: false,
  });
  assert.strictEqual(runtimeSummary.activeProfile, "portable_local", "portable defaults must resolve to portable_local");
  assert.strictEqual(runtimeSummary.activePostureProfile, "portable_local", "runtime must expose activePostureProfile for UI/API consumers");
  assert.strictEqual(Number(runtimeSummary.referenceArchitectureDefault || 0), 1, "portable_local must remain the reference architecture default");

  process.stdout.write("PASS deployment_posture_profile_test\n");
}

main();
