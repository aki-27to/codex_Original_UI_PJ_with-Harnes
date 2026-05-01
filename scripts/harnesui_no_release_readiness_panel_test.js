"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function assertAbsent(text, pattern, message) {
  assert(!pattern.test(text), message);
}

function main() {
  const packageJson = read("package.json");
  const html = read(path.join("web", "01.HarnesUI", "index.html"));
  const app = read(path.join("web", "01.HarnesUI", "app.js"));
  const css = read(path.join("web", "01.HarnesUI", "styles.css"));
  const runtimeService = read(path.join("server", "services", "runtime_api_snapshot_service.js"));

  assertAbsent(html, /releaseReadinessPanel|Codex release readiness|v0\.120\.0 to v0\.128\.0/, "end-user UI must not show a Codex release readiness panel");
  assertAbsent(app, /renderReleaseReadinessForUi|codexReleaseReadiness|codex_release_readiness/, "HarnesUI app must not render release readiness status");
  assertAbsent(css, /release-readiness/, "HarnesUI styles must not keep release readiness card styling");
  assertAbsent(runtimeService, /codex-release-readiness|codexReleaseReadiness|codex_release_readiness/, "runtime API must not publish release-readiness marketing status");
  assertAbsent(packageJson, /harnesui-codex-release-readiness/, "package scripts must not expose release-readiness panel tests");

  process.stdout.write("PASS harnesui_no_release_readiness_panel_test\n");
}

main();
