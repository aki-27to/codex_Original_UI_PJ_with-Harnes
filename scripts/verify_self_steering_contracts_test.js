#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const {
  mustBeRequiredArray,
  mustInclude,
  verifySelfSteeringContracts,
} = require("./verify_self_steering_contracts");

const workspaceRoot = path.resolve(__dirname, "..");

assert.doesNotThrow(
  () => verifySelfSteeringContracts(workspaceRoot),
  "current self-steering contracts must verify"
);

assert.throws(
  () => mustInclude(["present"], "missing", "prefix "),
  /prefix missing/,
  "mustInclude should fail with a useful field-specific message"
);

assert.throws(
  () => mustBeRequiredArray({ candidate_directions: { required: true, minItems: 0 } }, "candidate_directions", "invalid "),
  /invalid candidate_directions\.minItems/,
  "mustBeRequiredArray should reject empty required arrays"
);

process.stdout.write("PASS verify_self_steering_contracts_test\n");
