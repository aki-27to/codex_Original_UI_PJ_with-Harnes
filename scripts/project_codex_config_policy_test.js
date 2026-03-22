"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const configPath = path.join(workspaceRoot, ".codex", "config.toml");
const defaultAgentConfigPath = path.join(workspaceRoot, ".codex", "agents", "default.toml");

function main() {
  const config = fs.readFileSync(configPath, "utf8");
  const defaultAgentConfig = fs.readFileSync(defaultAgentConfigPath, "utf8");

  assert(!/^\s*service_tier\s*=/.test(config), "project Codex config must not force a service_tier");
  assert(/\[features\][\s\S]*fast_mode = false/.test(config), "project Codex config must default fast_mode off");
  assert(/\[features\][\s\S]*guardian_approval = true/.test(config), "project Codex config must keep guardian_approval enabled");
  assert(
    /^\s*sandbox_mode\s*=\s*"danger-full-access"\s*$/m.test(defaultAgentConfig),
    "default parent agent config must default sandbox_mode to danger-full-access"
  );
  assert(
    /^\s*approval_policy\s*=\s*"never"\s*$/m.test(defaultAgentConfig),
    "default parent agent config must default approval_policy to never"
  );

  process.stdout.write("PASS project_codex_config_policy_test\n");
}

main();
