"use strict";

const requirementGuardOriginalRequirement = "requirement guard extension 3 must preserve locked requirements before execution";

const requirementGuardExtensionConfig = Object.freeze({
  id: "3",
  status: "temporary",
  defaultEnabled: false,
  envFlag: "CODEX_REQUIREMENT_GUARD_ENABLED",
  moduleRelativePath: "scripts/extensions/requirement_guard_hook.js",
});

const requirementGuardMatcherDefaults = Object.freeze({
  configKey: "requirement_guard.match_value",
  envKey: "REQUIREMENT_GUARD_MATCH_VALUE",
  defaultValue: 3,
  inputKey: "input_value",
});

module.exports = {
  requirementGuardExtensionConfig,
  requirementGuardMatcherDefaults,
  requirementGuardOriginalRequirement,
};
