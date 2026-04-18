#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const {
  buildCmdInvocation,
  buildCmdScriptInvocation,
  resolvePackageManagerCommand,
} = require("./lib/process_invocation");

function main() {
  assert.strictEqual(resolvePackageManagerCommand("win32"), "npm.cmd", "Windows package script execution must use npm.cmd directly");
  assert.strictEqual(resolvePackageManagerCommand("linux"), "npm", "POSIX package script execution must use npm");

  const packageInvocation = buildCmdInvocation("npm.cmd", ["run", "test:document-tooling"]);
  assert.strictEqual(packageInvocation.command, "cmd.exe", "Windows package script execution must go through cmd.exe explicitly");
  assert.deepStrictEqual(packageInvocation.args.slice(0, 3), ["/d", "/s", "/c"], "Windows package script execution must keep deterministic cmd.exe flags");
  assert(packageInvocation.args[3].startsWith("npm.cmd "), "Windows package script execution must call npm.cmd directly");
  assert(packageInvocation.args[3].includes("run test:document-tooling"), "Windows package script execution must preserve the npm subcommand and script name without shell:true");

  const invocation = buildCmdScriptInvocation("C:\\node\\node.exe", path.join("scripts", "sample.js"), ["alpha", "two words"]);
  assert.strictEqual(invocation.command, "cmd.exe", "Windows fallback must invoke cmd.exe explicitly");
  assert.deepStrictEqual(invocation.args.slice(0, 3), ["/d", "/s", "/c"], "Windows fallback must keep deterministic cmd.exe flags");
  assert(invocation.args[3].includes("C:\\node\\node.exe"), "Windows fallback must preserve the Node executable path");
  assert(invocation.args[3].includes("scripts"), "Windows fallback must preserve the script path");
  assert(invocation.args[3].includes("\"two words\""), "Windows fallback must preserve spaced arguments without shell:true");

  console.log("PASS process_invocation_test");
}

main();
