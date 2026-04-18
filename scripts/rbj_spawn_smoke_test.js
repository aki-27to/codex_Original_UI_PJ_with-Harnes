#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawn } = require("child_process");
const { resolveCodexAppServerSpawnTarget } = require("./lib/harness_app_runtime");

const workspaceRoot = path.resolve(__dirname, "..");

async function run() {
  const target = resolveCodexAppServerSpawnTarget({
    cwd: workspaceRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const child = spawn(target.command, target.args, target.options);
  let settled = false;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve();
    }, 3000);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    });
  });
  try {
    child.kill();
  } catch {}
  console.log("PASS rbj_spawn_smoke_test");
}

run().catch((error) => {
  console.error(`FAIL rbj_spawn_smoke_test: ${error && error.message ? error.message : String(error)}`);
  process.exit(1);
});
