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
  assertRegex(indexHtml, /<strong id="executionProfileHeadline" class="settings-mode-title">Agent \(Full Access\)<\/strong>/, "settings panel should render Full Access as the initial permission summary");
  assertRegex(indexHtml, /<option value="full-access" selected>Agent \(Full Access\)<\/option>/, "settings panel should default the top permission selector to Full Access");
  assertRegex(indexHtml, /<option value="live" selected>Live<\/option>/, "settings panel should default web search to live for the full-access preset");
  assertRegex(indexHtml, /<option value="never" selected>never<\/option>/, "settings panel should default approval_policy to never for the initial full-access surface");
  assertRegex(indexHtml, /<option value="danger-full-access" selected>danger-full-access<\/option>/, "settings panel should default sandbox_mode to danger-full-access for the initial full-access surface");
  assert.ok(!/<input id="automaticApprovalReviewEnabled" type="checkbox" checked>/.test(indexHtml), "settings panel should not pre-enable guardian approvals in the initial full-access surface");
  assertRegex(indexHtml, /id="workspaceLockBtn"/, "settings panel must expose the workspace lock action");
  assertRegex(indexHtml, /id="workspaceUnlockBtn"/, "settings panel must expose the workspace unlock action");
  assertRegex(indexHtml, /id="workspaceStatus"/, "settings panel must expose the workspace lock status");
  assert.ok(!/value="on-failure"/.test(indexHtml), "settings panel must remove the deprecated on-failure approval option");
  assert.ok(!/id="codexModeSummary"/.test(indexHtml), "settings panel must remove the redundant codex mode summary node");
  assert.ok(!/id="codexModeDetail"/.test(indexHtml), "settings panel must remove the redundant codex mode detail node");
  assertRegex(indexHtml, /id="harnessRequirementMeta"/, "harness status must expose requirement lock meta");
  assertRegex(indexHtml, /id="harnessRequirementSections"/, "harness status must expose requirement lock sections");
  assertRegex(indexHtml, /id="focusActionTitle"/, "console must expose the next-action focus headline");
  assertRegex(indexHtml, /id="focusWorkspaceValue"/, "console must expose the workspace focus summary");
  assertRegex(indexHtml, /id="focusSendValue"/, "console must expose the send readiness summary");
  assertRegex(indexHtml, /id="uiReloadBtn"/, "console must expose the quick UI reload action");
  assertRegex(indexHtml, /id="conversationSummary"/, "conversation panel must expose the summary line");
  assertRegex(indexHtml, /id="jumpToComposerBtn"/, "conversation panel must expose the jump-to-composer action");
  assertRegex(indexHtml, /data-compose-preset=/, "composer must expose prompt preset shortcuts");
  assertRegex(indexHtml, /<section class="agent-flow-panel"[\s\S]*?id="agentFlowLane"[\s\S]*?id="agentTopographyPanel"[\s\S]*?id="agentTraceList"/, "execution trace must embed the agent topography section");
  assert.ok(!/AIエージェントかんばん/.test(indexHtml), "console must remove the standalone AIエージェントかんばん heading");
  assert.ok(!/agentTopographyToggleBtn/.test(indexHtml), "execution trace topography must remove the standalone collapse toggle");

  assertRegex(stylesCss, /body\.simple-view \.performance-panel[\s\S]*?display:\s*none;/, "simple view must hide the performance panel");
  assert.ok(!/body\.telemetry-off \.harness-panel/.test(stylesCss), "telemetry-off must not hide the main harness panel");
  assertRegex(stylesCss, /\.work-panel[\s\S]*?grid-template-rows:\s*auto;/, "main work panel must let content rows size naturally to avoid overlap");
  assertRegex(stylesCss, /\.focus-panel[\s\S]*?display:\s*grid;/, "console must style the next-action focus panel");
  assertRegex(stylesCss, /\.conversation-panel[\s\S]*?display:\s*grid;/, "console must style the conversation wrapper panel");
  assertRegex(stylesCss, /\.timeline[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/, "conversation timeline must support bottom-aligned transcript flow");
  assertRegex(stylesCss, /\.timeline-stack[\s\S]*?margin-top:\s*auto;/, "conversation timeline must expose a bottom-align stack wrapper");
  assertRegex(stylesCss, /\.composer[\s\S]*?position:\s*static;/, "composer must stay anchored at the bottom of the page flow");
  assert.ok(!/\.composer[\s\S]*?position:\s*sticky;/.test(stylesCss), "composer must not follow the viewport while scrolling");
  assertRegex(stylesCss, /body\.composer-static \.composer[\s\S]*?position:\s*static;/, "composer static mode must preserve the bottom placement");
  assertRegex(stylesCss, /\.timeline[\s\S]*?padding:\s*10px;[\s\S]*?scroll-padding-bottom:\s*10px;/, "conversation timeline must keep a compact bottom edge without a large reserved blank area");
  assertRegex(stylesCss, /\.composer-actions[\s\S]*?align-self:\s*end;/, "composer actions must keep their own content height instead of stretching to the textarea column");
  assertRegex(stylesCss, /\.agent-topography-panel[\s\S]*?display:\s*grid;/, "trace-embedded topography panel styling must exist");
  assert.ok(!/\.agent-topography-panel[\s\S]*?position:\s*fixed;/.test(stylesCss), "execution trace topography must not float as a fixed panel");
  assertRegex(stylesCss, /\.agent-trace-subhead[\s\S]*?display:\s*flex;/, "execution trace subhead styling must exist");
  assertRegex(stylesCss, /\.harness-requirement-panel[\s\S]*?display:\s*grid;/, "requirement lock panel styling must exist");
  assertRegex(stylesCss, /\.harness-requirement-summary[\s\S]*?font-size:\s*17px;/, "requirement lock must style the strategy summary prominently");
  assertRegex(stylesCss, /\.harness-requirement-row-label[\s\S]*?color:/, "requirement lock must style compact strategy row labels");
  assertRegex(stylesCss, /\.message-ref-chip[\s\S]*?display:\s*inline-flex;/, "conversation transcript must style compact reference chips");
  assert.ok(!/\.message-ref-line/.test(stylesCss), "conversation transcript must not style a separate line-marker chip");
  assertRegex(stylesCss, /\.message-ref-link[\s\S]*?text-decoration:\s*none;/, "conversation transcript must style readable inline links");
  assertRegex(stylesCss, /\.settings-mode-card[\s\S]*?display:\s*grid;/, "settings mode summary card styling must exist");
  assertRegex(stylesCss, /\.settings-advanced[\s\S]*?summary::after/, "advanced permissions details styling must exist");
  assertRegex(stylesCss, /body\.simple-view \.settings-grid[\s\S]*?display:\s*grid;/, "simple view must keep the workspace lock surface visible");
  assertRegex(stylesCss, /body\.simple-view \.settings-grid > :not\(\.workspace-shell\)[\s\S]*?display:\s*none;/, "simple view must collapse settings to the workspace lock surface");
  assertRegex(stylesCss, /\.workspace-status\.locked[\s\S]*?color:/, "workspace lock status styling must expose the locked tone");
  assertRegex(stylesCss, /\.workspace-status\.warning[\s\S]*?color:/, "workspace lock status styling must expose the warning tone");

  assertRegex(appJs, /function\s+deriveRuntimeTurnContextForUi\s*\(/, "runtime turn context helper must exist");
  assertRegex(appJs, /function\s+buildRequirementLockSnapshotForUi\s*\(/, "requirement lock snapshot helper must exist");
  assertRegex(appJs, /function\s+requirementGroupsForUi\s*\(/, "requirement group helper must exist");
  assertRegex(appJs, /function\s+requirementGatePlanPanelStateForUi\s*\(/, "execution plan panel must expose a requirement-gated hold helper");
  assertRegex(appJs, /function\s+workspaceGuardSnapshotForUi\s*\(/, "workspace guard snapshot helper must exist");
  assertRegex(appJs, /function\s+workspaceGuardErrorInfoForUi\s*\(/, "workspace guard error helper must exist");
  assertRegex(appJs, /function\s+renderWorkspaceGuardUi\s*\(/, "workspace guard renderer must exist");
  assertRegex(appJs, /function\s+scrollElementIntoViewForUi\s*\(/, "console must expose the jump-to-section helper");
  assertRegex(appJs, /function\s+parseMessageReferenceForUi\s*\(/, "conversation transcript must parse message references");
  assertRegex(appJs, /function\s+normalizeMessageReferencesForUi\s*\(/, "conversation transcript must compact markdown-style references");
  assertRegex(appJs, /function\s+renderMessageContentForUi\s*\(/, "conversation transcript must render structured message content");
  assert.ok(!/message-ref-line/.test(appJs), "conversation transcript must not render a separate line-marker chip");
  assertRegex(appJs, /function\s+conversationSnapshotForUi\s*\(/, "conversation snapshot helper must exist");
  assertRegex(appJs, /function\s+latestConversationPreviewForUi\s*\(/, "chat preview helper must exist");
  assertRegex(appJs, /const\s+stack=document\.createElement\("div"\);[\s\S]*?stack\.className="timeline-stack";[\s\S]*?stack\.appendChild\(f\);[\s\S]*?e\.timeline\.appendChild\(stack\);/, "conversation transcript must render messages through the bottom-align stack wrapper");
  assertRegex(appJs, /function\s+renderFocusPanel\s*\(/, "next-action focus renderer must exist");
  assertRegex(appJs, /function\s+shouldUseStickyComposerForUi\s*\(/, "composer sticky viewport helper must exist");
  assertRegex(appJs, /function\s+buildUiReloadUrlForUi\s*\(/, "UI reload URL helper must exist");
  assertRegex(appJs, /function\s+reloadUiShellForUi\s*\(/, "UI reload trigger must exist");
  assertRegex(appJs, /function\s+syncComposerViewportSpacingForUi\s*\(/, "composer viewport spacing helper must exist");
  assertRegex(appJs, /function\s+scheduleComposerViewportSyncForUi\s*\(/, "composer viewport sync scheduler must exist");
  assertRegex(appJs, /function\s+lockSelectedWorkspaceForUi\s*\(/, "workspace guard lock helper must exist");
  assertRegex(appJs, /function\s+unlockWorkspaceForUi\s*\(/, "workspace guard unlock helper must exist");
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
  assertRegex(appJs, /data-compose-preset/, "app JS must bind composer preset shortcuts");
  assertRegex(appJs, /if\(e\.uiReloadBtn\)e\.uiReloadBtn\.onclick=\(\)=>reloadUiShellForUi\(\);/, "UI reload button must be wired to a full shell reload");
  assertRegex(appJs, /timeline-empty-state/, "app JS must render the conversation empty state");
  assertRegex(appJs, /function\s+saveSettings\s*\(\)\s*\{[\s\S]*?settingsState\.hasStoredFastMode=true;[\s\S]*?settingsState\.hasStoredAutomaticApprovalReview=true;[\s\S]*?settingsState\.hasStoredExecutionProfile=true;[\s\S]*?settingsState\.hasStoredWebSearchMode=true;[\s\S]*?\}/, "saving settings must pin permission-mode toggles and search mode in memory");
  assertRegex(appJs, /const\s+PROFILES=Object\.freeze\(\{[\s\S]*?auto:\{approvalPolicy:"on-request",sandboxMode:"workspace-write",webSearchMode:"cached",automaticApprovalReviewEnabled:false\}[\s\S]*?"read-only":\{approvalPolicy:"on-request",sandboxMode:"read-only",webSearchMode:"cached",automaticApprovalReviewEnabled:false\}[\s\S]*?guardian:\{approvalPolicy:"on-request",sandboxMode:"workspace-write",webSearchMode:"cached",automaticApprovalReviewEnabled:true\}[\s\S]*?"full-access":\{approvalPolicy:"never",sandboxMode:"danger-full-access",webSearchMode:"live",automaticApprovalReviewEnabled:false\}[\s\S]*?\}\);/, "app JS must map presets to the latest Codex permission combinations");
  assertRegex(appJs, /const\s+DEFAULT_PROFILE_ID="full-access";/, "app JS should default fresh permission-mode state to Full Access");
  assertRegex(appJs, /const\s+EXEC_MODEL_PRESET_OPTIONS=\["gpt-5\.4","gpt-5\.4-mini","gpt-5\.3-codex"\];/, "app JS must expose the current Codex model presets");
  assertRegex(appJs, /Permission mode applied:/, "preset apply messaging must use the latest terminology");
  assert.ok(!/buildTopographyTaskSignalsForUi|このターン担当/.test(appJs), "agent kanban must not foreground planned-task signals");
  assert.ok(!/agent-topography-signal|agent-topography-item\.engaged/.test(stylesCss), "agent kanban styles must not imply planned-task highlighting");
  assertRegex(appJs, /if\(workspaceGuardError\.handled\)return workspaceGuardError\.detail;/, "workspace lock failures must get a human-readable submit error");
  assertRegex(appJs, /mset\(out,`\[needs_input\] \$\{workspaceGuardError\.inlineMessage\}`\);/, "workspace lock failures must surface as needs_input in the transcript");
  assertRegex(appJs, /if\(requirementBlockedPlanState\)\{\s*e\.harnessPlanMeta\.textContent=requirementBlockedPlanState\.metaText;/, "execution plan meta must be gated by unresolved Requirement Lock state");
  assertRegex(appJs, /if\(requirementBlockedPlanState\)\{\s*e\.harnessPlanCurrentDetail\.textContent=requirementBlockedPlanState\.currentDetailText;/, "execution plan detail must stop at the requirement gate instead of showing downstream plan progress");

  process.stdout.write("PASS harness_console_ui_policy_test\n");
}

main();
