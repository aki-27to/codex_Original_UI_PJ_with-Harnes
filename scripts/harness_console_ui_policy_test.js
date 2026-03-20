"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const indexHtmlPath = path.join(workspaceRoot, "web", "01.HarnesUI", "index.html");
const appJsPath = path.join(workspaceRoot, "web", "01.HarnesUI", "app.js");
const stylesCssPath = path.join(workspaceRoot, "web", "01.HarnesUI", "styles.css");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertRegex(source, regex, message) {
  assert(regex.test(source), message);
}

function main() {
  const indexHtml = read(indexHtmlPath);
  const appJs = read(appJsPath);
  const stylesCss = read(stylesCssPath);

  assertRegex(indexHtml, /class="harness-panel"/, "main console must foreground the harness panel");
  assertRegex(indexHtml, /id="performancePanel"/, "performance panel must remain available");
  assertRegex(indexHtml, /id="uiVisibility"/, "secondary panel toggle must remain available");
  assertRegex(indexHtml, /<select id="executionProfile">/, "settings panel must expose the permissions preset selector");
  assertRegex(indexHtml, /Auto \(default\)/, "settings panel must expose the Auto preset");
  assertRegex(indexHtml, /Read-only/, "settings panel must expose the Read-only preset");
  assertRegex(indexHtml, /Full Access/, "settings panel must expose the Full Access preset");
  assertRegex(indexHtml, /Custom \(config\.toml\)/, "settings panel must expose the custom preset");
  assert.ok(!/value="safe"/.test(indexHtml), "settings panel must remove the legacy safe preset");
  assert.ok(!/value="balanced"/.test(indexHtml), "settings panel must remove the legacy balanced preset");
  assert.ok(!/value="full-auto"/.test(indexHtml), "settings panel must remove the legacy full-auto preset");
  assert.ok(!/value="power"/.test(indexHtml), "settings panel must remove the legacy power preset");
  assertRegex(indexHtml, /<span>Fast mode<\/span>/, "settings panel must keep the Fast mode checkbox label");
  assertRegex(indexHtml, /<span>Automatic approval review<\/span>/, "settings panel must keep the automatic approval review checkbox label");
  assertRegex(indexHtml, /value="gpt-5\.4-mini"/, "settings panel must expose the gpt-5.4-mini preset");
  assertRegex(indexHtml, /<select id="sandboxMode">/, "settings panel must expose the sandbox mode selector");
  assert.ok(!/value="on-failure"/.test(indexHtml), "settings panel must remove the deprecated on-failure approval option");
  assert.ok(!/id="codexModeSummary"/.test(indexHtml), "settings panel must remove the redundant codex mode summary node");
  assert.ok(!/id="codexModeDetail"/.test(indexHtml), "settings panel must remove the redundant codex mode detail node");
  assertRegex(indexHtml, /id="harnessRequirementMeta"/, "harness status must expose requirement lock meta");
  assertRegex(indexHtml, /id="harnessRequirementSections"/, "harness status must expose requirement lock sections");
  assertRegex(indexHtml, /id="agentTopographyPanel"/, "console must expose the agent kanban panel");

  assertRegex(stylesCss, /body\.simple-view \.performance-panel[\s\S]*?display:\s*none;/, "simple view must hide the performance panel");
  assert.ok(!/body\.telemetry-off \.harness-panel/.test(stylesCss), "telemetry-off must not hide the main harness panel");
  assert.ok(!/body\.simple-view \.agent-topography-monitor[\s\S]*?display:\s*none;/.test(stylesCss), "simple view must keep the agent kanban visible");
  assert.ok(!/body\.telemetry-off \.agent-topography-monitor[\s\S]*?display:\s*none;/.test(stylesCss), "telemetry-off must keep the agent kanban visible");
  assertRegex(stylesCss, /\.harness-requirement-panel[\s\S]*?display:\s*grid;/, "requirement lock panel styling must exist");

  assertRegex(appJs, /function\s+deriveRuntimeTurnContextForUi\s*\(/, "runtime turn context helper must exist");
  assertRegex(appJs, /function\s+buildRequirementLockSnapshotForUi\s*\(/, "requirement lock snapshot helper must exist");
  assertRegex(appJs, /function\s+requirementGroupsForUi\s*\(/, "requirement group helper must exist");
  assertRegex(appJs, /const\s+AGENT_KANBAN_LANES=Object\.freeze\(\[/, "agent kanban lane definition must exist");
  assertRegex(appJs, /function\s+groupTopographyRowsForUi\s*\(/, "agent kanban grouping helper must exist");
  assertRegex(appJs, /function\s+scheduleTopographyRefreshSoon\s*\(delayMs=180\)\s*\{[\s\S]*?loadAgentTopography\(\)\.catch\(\(\)=>\{\}\);[\s\S]*?\}/, "agent kanban must support fast refresh for live collab changes");
  assertRegex(appJs, /if\(i\.type==="collabAgentToolCall"\|\|i\.type==="collabToolCall"\)scheduleTopographyRefreshSoon\(\);/, "collab item events must trigger a fast topography refresh");
  assertRegex(appJs, /function\s+normalizeApprovalPolicyForUi\s*\(/, "app JS must normalize deprecated approval policies");
  assertRegex(appJs, /function\s+normalizeExecutionProfileForUi\s*\(/, "app JS must normalize legacy preset names");
  assertRegex(appJs, /else document\.body\.classList\.add\("simple-view"\);/, "console should default to simple view when no preference is stored");
  assert.ok(!/function\s+renderCodexModeDefaults\s*\(/.test(appJs), "codex mode summary renderer should be removed with the redundant UI");
  assert.ok(!/codexModeSummary|codexModeDetail/.test(appJs), "app JS should not keep references to the removed codex mode summary nodes");
  assertRegex(appJs, /function\s+saveSettings\s*\(\)\s*\{[\s\S]*?settingsState\.hasStoredFastMode=true;[\s\S]*?settingsState\.hasStoredAutomaticApprovalReview=true;[\s\S]*?\}/, "saving settings must pin fast and approval-review toggles in memory");
  assertRegex(appJs, /const\s+PROFILES=Object\.freeze\(\{[\s\S]*?auto:\{approvalPolicy:"on-request",sandboxMode:"workspace-write",webSearch:true\}[\s\S]*?"read-only":\{approvalPolicy:"on-request",sandboxMode:"read-only",webSearch:true\}[\s\S]*?"full-access":\{approvalPolicy:"never",sandboxMode:"danger-full-access",webSearch:true\}[\s\S]*?\}\);/, "app JS must map presets to the latest Codex permission combinations");
  assertRegex(appJs, /const\s+EXEC_MODEL_PRESET_OPTIONS=\["gpt-5\.4","gpt-5\.4-mini","gpt-5\.3-codex"\];/, "app JS must expose the current Codex model presets");
  assertRegex(appJs, /Permissions preset applied:/, "preset apply messaging must use the latest terminology");
  assert.ok(!/buildTopographyTaskSignalsForUi|このターン担当/.test(appJs), "agent kanban must not foreground planned-task signals");
  assert.ok(!/agent-topography-signal|agent-topography-item\.engaged/.test(stylesCss), "agent kanban styles must not imply planned-task highlighting");

  process.stdout.write("PASS harness_console_ui_policy_test\n");
}

main();
