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
  assertRegex(indexHtml, /Agent \(Auto\)/, "settings panel must expose the Agent preset");
  assertRegex(indexHtml, /Chat \(Read Only\)/, "settings panel must expose the Chat preset");
  assertRegex(indexHtml, /Guardian Approvals/, "settings panel must expose the Guardian Approvals preset");
  assertRegex(indexHtml, /Agent \(Full Access\)/, "settings panel must expose the Full Access preset");
  assertRegex(indexHtml, /Custom \(config\.toml\)/, "settings panel must expose the custom preset");
  assert.ok(!/value="safe"/.test(indexHtml), "settings panel must remove the legacy safe preset");
  assert.ok(!/value="balanced"/.test(indexHtml), "settings panel must remove the legacy balanced preset");
  assert.ok(!/value="full-auto"/.test(indexHtml), "settings panel must remove the legacy full-auto preset");
  assert.ok(!/value="power"/.test(indexHtml), "settings panel must remove the legacy power preset");
  assertRegex(indexHtml, /<span>Fast mode<\/span>/, "settings panel must keep the Fast mode checkbox label");
  assertRegex(indexHtml, /<span>Guardian approvals<\/span>/, "settings panel must expose the guardian approvals checkbox label");
  assertRegex(indexHtml, /value="gpt-5\.4-mini"/, "settings panel must expose the gpt-5.4-mini preset");
  assertRegex(indexHtml, /<select id="webSearchMode">/, "settings panel must expose the web search mode selector");
  assertRegex(indexHtml, /value="cached"/, "settings panel must expose cached web search");
  assertRegex(indexHtml, /value="live"/, "settings panel must expose live web search");
  assertRegex(indexHtml, /value="disabled"/, "settings panel must expose disabled web search");
  assertRegex(indexHtml, /<select id="sandboxMode">/, "settings panel must expose the sandbox mode selector");
  assertRegex(indexHtml, /id="permissionsAdvanced"/, "settings panel must expose the advanced permissions details");
  assertRegex(indexHtml, /id="executionProfileHeadline"/, "settings panel must expose the permission mode summary headline");
  assert.ok(!/value="on-failure"/.test(indexHtml), "settings panel must remove the deprecated on-failure approval option");
  assert.ok(!/id="codexModeSummary"/.test(indexHtml), "settings panel must remove the redundant codex mode summary node");
  assert.ok(!/id="codexModeDetail"/.test(indexHtml), "settings panel must remove the redundant codex mode detail node");
  assertRegex(indexHtml, /id="harnessRequirementMeta"/, "harness status must expose requirement lock meta");
  assertRegex(indexHtml, /id="harnessRequirementSections"/, "harness status must expose requirement lock sections");
  assertRegex(indexHtml, /<section class="agent-flow-panel"[\s\S]*?id="agentFlowLane"[\s\S]*?id="agentTopographyPanel"[\s\S]*?id="agentTraceList"/, "execution trace must embed the agent topography section");
  assert.ok(!/AIエージェントかんばん/.test(indexHtml), "console must remove the standalone AIエージェントかんばん heading");
  assert.ok(!/agentTopographyToggleBtn/.test(indexHtml), "execution trace topography must remove the standalone collapse toggle");

  assertRegex(stylesCss, /body\.simple-view \.performance-panel[\s\S]*?display:\s*none;/, "simple view must hide the performance panel");
  assert.ok(!/body\.telemetry-off \.harness-panel/.test(stylesCss), "telemetry-off must not hide the main harness panel");
  assertRegex(stylesCss, /\.agent-topography-panel[\s\S]*?display:\s*grid;/, "trace-embedded topography panel styling must exist");
  assert.ok(!/\.agent-topography-panel[\s\S]*?position:\s*fixed;/.test(stylesCss), "execution trace topography must not float as a fixed panel");
  assertRegex(stylesCss, /\.agent-trace-subhead[\s\S]*?display:\s*flex;/, "execution trace subhead styling must exist");
  assertRegex(stylesCss, /\.harness-requirement-panel[\s\S]*?display:\s*grid;/, "requirement lock panel styling must exist");
  assertRegex(stylesCss, /\.settings-mode-card[\s\S]*?display:\s*grid;/, "settings mode summary card styling must exist");
  assertRegex(stylesCss, /\.settings-advanced[\s\S]*?summary::after/, "advanced permissions details styling must exist");

  assertRegex(appJs, /function\s+deriveRuntimeTurnContextForUi\s*\(/, "runtime turn context helper must exist");
  assertRegex(appJs, /function\s+buildRequirementLockSnapshotForUi\s*\(/, "requirement lock snapshot helper must exist");
  assertRegex(appJs, /function\s+requirementGroupsForUi\s*\(/, "requirement group helper must exist");
  assertRegex(appJs, /const\s+AGENT_KANBAN_LANES=Object\.freeze\(\[/, "agent kanban lane definition must exist");
  assertRegex(appJs, /function\s+groupTopographyRowsForUi\s*\(/, "agent kanban grouping helper must exist");
  assertRegex(appJs, /function\s+scheduleTopographyRefreshSoon\s*\(delayMs=180\)\s*\{[\s\S]*?loadAgentTopography\(\)\.catch\(\(\)=>\{\}\);[\s\S]*?\}/, "agent kanban must support fast refresh for live collab changes");
  assertRegex(appJs, /if\(i\.type==="collabAgentToolCall"\|\|i\.type==="collabToolCall"\)scheduleTopographyRefreshSoon\(\);/, "collab item events must trigger a fast topography refresh");
  assertRegex(appJs, /function\s+normalizeApprovalPolicyForUi\s*\(/, "app JS must normalize deprecated approval policies");
  assertRegex(appJs, /function\s+normalizeWebSearchModeForUi\s*\(/, "app JS must normalize web search modes");
  assertRegex(appJs, /function\s+normalizeExecutionProfileForUi\s*\(/, "app JS must normalize legacy preset names");
  assertRegex(appJs, /function\s+renderExecutionProfileSummaryForUi\s*\(/, "app JS must render the permission mode summary");
  assertRegex(appJs, /function\s+syncPermissionModeControlsForUi\s*\(/, "app JS must gate raw permission controls behind the selected mode");
  assertRegex(appJs, /else document\.body\.classList\.add\("simple-view"\);/, "console should default to simple view when no preference is stored");
  assert.ok(!/function\s+renderCodexModeDefaults\s*\(/.test(appJs), "codex mode summary renderer should be removed with the redundant UI");
  assert.ok(!/codexModeSummary|codexModeDetail/.test(appJs), "app JS should not keep references to the removed codex mode summary nodes");
  assert.ok(!/TOPOGRAPHY_COLLAPSED_KEY|loadTopographyUiState|saveTopographyUiState|setTopographyCollapsed|agentTopographyToggleBtn/.test(appJs), "execution trace topography should not keep floating-panel collapse state");
  assertRegex(appJs, /function\s+saveSettings\s*\(\)\s*\{[\s\S]*?settingsState\.hasStoredFastMode=true;[\s\S]*?settingsState\.hasStoredAutomaticApprovalReview=true;[\s\S]*?settingsState\.hasStoredExecutionProfile=true;[\s\S]*?settingsState\.hasStoredWebSearchMode=true;[\s\S]*?\}/, "saving settings must pin permission-mode toggles and search mode in memory");
  assertRegex(appJs, /const\s+PROFILES=Object\.freeze\(\{[\s\S]*?auto:\{approvalPolicy:"on-request",sandboxMode:"workspace-write",webSearchMode:"cached",automaticApprovalReviewEnabled:false\}[\s\S]*?"read-only":\{approvalPolicy:"on-request",sandboxMode:"read-only",webSearchMode:"cached",automaticApprovalReviewEnabled:false\}[\s\S]*?guardian:\{approvalPolicy:"on-request",sandboxMode:"workspace-write",webSearchMode:"cached",automaticApprovalReviewEnabled:true\}[\s\S]*?"full-access":\{approvalPolicy:"never",sandboxMode:"danger-full-access",webSearchMode:"live",automaticApprovalReviewEnabled:false\}[\s\S]*?\}\);/, "app JS must map presets to the latest Codex permission combinations");
  assertRegex(appJs, /const\s+EXEC_MODEL_PRESET_OPTIONS=\["gpt-5\.4","gpt-5\.4-mini","gpt-5\.3-codex"\];/, "app JS must expose the current Codex model presets");
  assertRegex(appJs, /Permission mode applied:/, "preset apply messaging must use the latest terminology");
  assert.ok(!/buildTopographyTaskSignalsForUi|このターン担当/.test(appJs), "agent kanban must not foreground planned-task signals");
  assert.ok(!/agent-topography-signal|agent-topography-item\.engaged/.test(stylesCss), "agent kanban styles must not imply planned-task highlighting");

  process.stdout.write("PASS harness_console_ui_policy_test\n");
}

main();
