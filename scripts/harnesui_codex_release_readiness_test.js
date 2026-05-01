"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function main() {
  const launcher = read("start_codex_ui.bat");
  const html = read(path.join("web", "01.HarnesUI", "index.html"));
  const app = read(path.join("web", "01.HarnesUI", "app.js"));
  const css = read(path.join("web", "01.HarnesUI", "styles.css"));
  const runtimeService = read(path.join("server", "services", "runtime_api_snapshot_service.js"));

  assert(/if "%CODEX_AUTO_OPEN_BROWSER%"=="" set "CODEX_AUTO_OPEN_BROWSER=1"/.test(launcher), "desktop launcher must default browser auto-open on");
  assert(html.includes('id="releaseReadinessPanel"'), "HarnesUI must expose the release readiness panel");
  assert(html.includes('id="releaseReadinessList"'), "HarnesUI must expose the release readiness list target");
  assert(app.includes('APP_BUNDLE_VERSION="2026-05-01-codex-0128-readiness-v1"'), "UI bundle version must invalidate old cached shells");
  assert(app.includes("renderReleaseReadinessForUi"), "HarnesUI must render release readiness from runtime data");
  assert(app.includes("codexReleaseReadiness"), "HarnesUI must read camelCase release readiness data");
  assert(app.includes("codex_release_readiness"), "HarnesUI must read snake_case release readiness data");
  assert(css.includes(".release-readiness-panel"), "HarnesUI must style the release readiness panel");
  assert(css.includes(".release-readiness-item.supported"), "HarnesUI must style supported readiness rows");
  assert(css.includes(".release-readiness-item.partial"), "HarnesUI must style partial readiness rows");
  assert(runtimeService.includes('schema: "codex-release-readiness.v1"'), "runtime snapshot must publish a stable readiness schema");
  assert(runtimeService.includes("fromVersion: \"v0.120.0\""), "runtime snapshot must record the source Codex version");
  assert(runtimeService.includes("targetVersion: \"v0.128.0\""), "runtime snapshot must record the target Codex version");
  assert(/codexReleaseReadiness,\s*[\r\n]+\s*codex_release_readiness: codexReleaseReadiness/.test(runtimeService), "runtime snapshot must expose camelCase and snake_case readiness fields");
  assert.strictEqual(
    (runtimeService.match(/buildAppServerTransportRuntimeSnapshot\(\)/g) || []).length,
    1,
    "runtime snapshot must build app server transport once and reuse it"
  );

  process.stdout.write("PASS harnesui_codex_release_readiness_test\n");
}

main();
