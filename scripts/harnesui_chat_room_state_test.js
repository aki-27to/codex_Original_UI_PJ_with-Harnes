#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appPath = path.join(__dirname, "..", "web", "01.HarnesUI", "app.js");
const source = fs.readFileSync(appPath, "utf8");

function extractConst(name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=.+;`));
  assert(match && match[0], `${name} constant not found`);
  return match[0];
}

function extractFunction(name) {
  const asyncSignature = `async function ${name}(`;
  const syncSignature = `function ${name}(`;
  const asyncStart = source.indexOf(asyncSignature);
  const syncStart = source.indexOf(syncSignature);
  const start = asyncStart >= 0 ? asyncStart : syncStart;
  assert(start >= 0, `${name} helper not found`);
  const signature = asyncStart >= 0 ? asyncSignature : syncSignature;
  let parenDepth = 0;
  let bodyStart = -1;
  for (let index = start + signature.length - 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") {
      parenDepth += 1;
      continue;
    }
    if (char === ")") {
      parenDepth -= 1;
      continue;
    }
    if (char === "{" && parenDepth === 0) {
      bodyStart = index;
      break;
    }
  }
  assert(bodyStart >= 0, `${name} helper body not found`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`failed to extract ${name}`);
}

function buildContext() {
  const storage = new Map();
  const context = {
    Array,
    Boolean,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    composerAttachment: { items: [], error: "", nextId: 1 },
    settingsState: {
      hasStoredModel: false,
      hasStoredModelReasoningEffort: false,
      hasStoredFastMode: false,
      hasStoredAutomaticApprovalReview: false,
      hasStoredExecutionProfile: false,
      hasStoredWebSearchMode: false,
      hasStoredPermissionDetail: false,
    },
    e: {
      executionProfile: { value: "custom" },
      approvalPolicy: { value: "on-request" },
      fastModeEnabled: { checked: false },
      automaticApprovalReviewEnabled: { checked: false },
      sandboxMode: { value: "workspace-write" },
      webSearchMode: { value: "cached" },
      modelName: { value: "gpt-5.4", options: [] },
      modelReasoningEffort: { value: "xhigh" },
      workspacePath: { value: "C:\\repo\\initial" },
      promptInput: { value: "" },
      uiVisibility: { checked: true },
    },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
    },
    s: {
      runtime: { workspaceRoot: "C:\\repo", workspaceGuard: { locked: false, lockedRoot: "", requiredForSources: ["web_ui"], rejectWhenUnlocked: true } },
      chats: [],
      active: null,
      nextChat: 3,
      nextMsg: 1,
    },
    PROFILES: {
      auto: { approvalPolicy: "on-request", sandboxMode: "workspace-write", webSearchMode: "cached", automaticApprovalReviewEnabled: false },
      "read-only": { approvalPolicy: "on-request", sandboxMode: "read-only", webSearchMode: "cached", automaticApprovalReviewEnabled: false },
      guardian: { approvalPolicy: "on-request", sandboxMode: "workspace-write", webSearchMode: "cached", automaticApprovalReviewEnabled: true },
      "full-access": { approvalPolicy: "never", sandboxMode: "danger-full-access", webSearchMode: "live", automaticApprovalReviewEnabled: false },
    },
    DEFAULT_PROFILE_ID: "full-access",
    ALLOWED_APPROVAL_POLICIES: new Set(["untrusted", "on-request", "never"]),
    ALLOWED_SANDBOX_MODES: new Set(["read-only", "workspace-write", "danger-full-access"]),
    ALLOWED_WEB_SEARCH_MODES: new Set(["disabled", "cached", "live"]),
    DEFAULT_EXEC_MODEL: "gpt-5.4",
    DEFAULT_EXEC_MODEL_REASONING_EFFORT: "xhigh",
    CHAT_MESSAGE_LIMIT: 240,
    CHAT_STATE_VERSION: 1,
    CHAT_STATE_KEY: "codex-console-chat-v1",
    saveCalls: 0,
    renderCalls: 0,
    permissionSyncCalls: 0,
    attachmentRenders: 0,
    promptSyncCalls: 0,
    clearedNotices: 0,
    workspaceSyncTargets: [],
    DEFAULT_AGENT_NAME: "default",
    toArr(value) {
      return Array.isArray(value) ? value : [];
    },
    t1(value, limit = 120) {
      const normalized = String(value || "").replace(/\s+/g, " ").trim();
      return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
    },
    normalizeExecutionProfileForUi(value, fallback = "full-access") {
      const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
      return normalized && (normalized === "custom" || Object.prototype.hasOwnProperty.call(this.PROFILES, normalized)) ? normalized : fallback;
    },
    normalizeApprovalPolicyForUi(value, fallback = "on-request") {
      const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
      return this.ALLOWED_APPROVAL_POLICIES.has(normalized) ? normalized : fallback;
    },
    normalizeSandboxModeForUi(value, fallback = "workspace-write") {
      const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
      return this.ALLOWED_SANDBOX_MODES.has(normalized) ? normalized : fallback;
    },
    normalizeWebSearchModeForUi(value, fallback = "cached") {
      const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
      return this.ALLOWED_WEB_SEARCH_MODES.has(normalized) ? normalized : fallback;
    },
    normalizeExecModelNameForUi(value, fallback = "gpt-5.4") {
      const raw = typeof value === "string" ? value.trim() : "";
      return raw || fallback;
    },
    normalizeExecModelReasoningEffortForUi(value, fallback = "xhigh") {
      const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
      return raw || fallback;
    },
    runtimeDefaultExecModel() {
      return "gpt-5.4";
    },
    runtimeDefaultExecModelReasoningEffort() {
      return "xhigh";
    },
    selectedExecModel() {
      return this.normalizeExecModelNameForUi(this.e.modelName.value, "gpt-5.4");
    },
    selectedExecModelReasoningEffort() {
      return this.normalizeExecModelReasoningEffortForUi(this.e.modelReasoningEffort.value, "xhigh");
    },
    selectedCwd() {
      return typeof this.e.workspacePath.value === "string" ? this.e.workspacePath.value.trim() : "";
    },
    active() {
      return this.s.chats.find((chatRecord) => chatRecord && chatRecord.id === this.s.active) || null;
    },
    chat(id) {
      return this.s.chats.find((chatRecord) => chatRecord && chatRecord.id === id) || null;
    },
    scheduleSaveChatState() {
      this.saveCalls += 1;
    },
    renderAttachmentUi() {
      this.attachmentRenders += 1;
    },
    syncPromptInputHeight() {
      this.promptSyncCalls += 1;
    },
    renderExecutionProfileSummaryForUi() {
      this.renderCalls += 1;
    },
    syncPermissionModeControlsForUi() {
      this.permissionSyncCalls += 1;
    },
    hydrateExecModelOptionsForUi() {},
    ensureExecModelOptionForUi(value) {
      return value;
    },
    applyExecutionProfileToUi(profileId) {
      const profile = this.PROFILES[profileId];
      assert(profile, `profile ${profileId} not found`);
      this.e.executionProfile.value = profileId;
      this.e.approvalPolicy.value = profile.approvalPolicy;
      this.e.sandboxMode.value = profile.sandboxMode;
      this.e.webSearchMode.value = profile.webSearchMode;
      this.e.automaticApprovalReviewEnabled.checked = Boolean(profile.automaticApprovalReviewEnabled);
      return true;
    },
    renderWorkspaceGuardUi() {},
    renderMissionSupportUi() {},
    clearWorkspaceGuardNotice() {
      this.clearedNotices += 1;
    },
    refresh() {},
    async syncWorkspaceGuardForChat(chatRecord) {
      this.workspaceSyncTargets.push(chatRecord && chatRecord.id ? chatRecord.id : "");
      return true;
    },
    serializeHarnessState(value) {
      return value || {};
    },
  };

  context.toArr = (value) => (Array.isArray(value) ? value : []);
  context.t1 = (value, limit = 120) => {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized;
  };
  context.normalizeExecutionProfileForUi = (value, fallback = "full-access") => {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    return normalized && (normalized === "custom" || Object.prototype.hasOwnProperty.call(context.PROFILES, normalized)) ? normalized : fallback;
  };
  context.normalizeApprovalPolicyForUi = (value, fallback = "on-request") => {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    return context.ALLOWED_APPROVAL_POLICIES.has(normalized) ? normalized : fallback;
  };
  context.normalizeSandboxModeForUi = (value, fallback = "workspace-write") => {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    return context.ALLOWED_SANDBOX_MODES.has(normalized) ? normalized : fallback;
  };
  context.normalizeWebSearchModeForUi = (value, fallback = "cached") => {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    return context.ALLOWED_WEB_SEARCH_MODES.has(normalized) ? normalized : fallback;
  };
  context.normalizeExecModelNameForUi = (value, fallback = "gpt-5.4") => {
    const raw = typeof value === "string" ? value.trim() : "";
    return raw || fallback;
  };
  context.normalizeExecModelReasoningEffortForUi = (value, fallback = "xhigh") => {
    const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
    return raw || fallback;
  };
  context.runtimeDefaultExecModel = () => "gpt-5.4";
  context.runtimeDefaultExecModelReasoningEffort = () => "xhigh";
  context.runtimeDefaultFastModeEnabled = () => false;
  context.runtimeDefaultAutomaticApprovalReviewEnabled = () => true;
  context.selectedExecModel = () => context.normalizeExecModelNameForUi(context.e.modelName.value, "gpt-5.4");
  context.selectedExecModelReasoningEffort = () => context.normalizeExecModelReasoningEffortForUi(context.e.modelReasoningEffort.value, "xhigh");
  context.selectedCwd = () => (typeof context.e.workspacePath.value === "string" ? context.e.workspacePath.value.trim() : "");
  context.active = () => context.s.chats.find((chatRecord) => chatRecord && chatRecord.id === context.s.active) || null;
  context.chat = (id) => context.s.chats.find((chatRecord) => chatRecord && chatRecord.id === id) || null;
  context.scheduleSaveChatState = () => {
    context.saveCalls += 1;
  };
  context.renderAttachmentUi = () => {
    context.attachmentRenders += 1;
  };
  context.syncPromptInputHeight = () => {
    context.promptSyncCalls += 1;
  };
  context.renderExecutionProfileSummaryForUi = () => {
    context.renderCalls += 1;
  };
  context.syncPermissionModeControlsForUi = () => {
    context.permissionSyncCalls += 1;
  };
  context.hydrateExecModelOptionsForUi = () => {};
  context.ensureExecModelOptionForUi = (value) => value;
  context.applyExecutionProfileToUi = (profileId) => {
    const profile = context.PROFILES[profileId];
    assert(profile, `profile ${profileId} not found`);
    context.e.executionProfile.value = profileId;
    context.e.approvalPolicy.value = profile.approvalPolicy;
    context.e.sandboxMode.value = profile.sandboxMode;
    context.e.webSearchMode.value = profile.webSearchMode;
    context.e.automaticApprovalReviewEnabled.checked = Boolean(profile.automaticApprovalReviewEnabled);
    return true;
  };
  context.renderWorkspaceGuardUi = () => {};
  context.renderMissionSupportUi = () => {};
  context.clearWorkspaceGuardNotice = () => {
    context.clearedNotices += 1;
  };
  context.refresh = () => {};
  context.createHarnessState = () => ({ status: "idle" });
  context.createPerformanceState = () => ({ totalTokens: 0 });
  context.normalizeScopedChatAgentNameForUi = (agentName) => (typeof agentName === "string" && agentName.trim() ? agentName.trim() : "default");
  context.syncWorkspaceGuardForChat = async (chatRecord) => {
    context.workspaceSyncTargets.push(chatRecord && chatRecord.id ? chatRecord.id : "");
    return true;
  };
  context.serializeHarnessState = (value) => value || {};

  const bootstrap = [
    extractFunction("chatSettingsDefaultsForUi"),
    extractFunction("freshChatSettingsDefaultsForUi"),
    extractFunction("normalizeChatSettingsForUi"),
    extractFunction("serializeChatSettingsForStorage"),
    extractFunction("ensureChatScopedStateForUi"),
    extractFunction("syncActiveChatScopedStateFromUi"),
    extractFunction("applyChatScopedStateToUi"),
    extractFunction("mkChat"),
    extractFunction("setActiveChatForUi"),
    extractFunction("saveChatStateNow"),
    "this.helpers={normalizeChatSettingsForUi,serializeChatSettingsForStorage,ensureChatScopedStateForUi,syncActiveChatScopedStateFromUi,applyChatScopedStateToUi,mkChat,setActiveChatForUi,saveChatStateNow};",
  ].join("\n\n");

  vm.runInNewContext(bootstrap, context);
  return { context, storage, ...context.helpers };
}

async function testSwitchPreservesAndRestoresRoomScopedState() {
  const { context, setActiveChatForUi, mkChat } = buildContext();
  context.s.chats = [
    {
      id: "chat-1",
      title: "Chat 1",
      agent: "default",
      settings: {
        executionProfile: "custom",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        webSearchMode: "cached",
        fastModeEnabled: false,
        automaticApprovalReviewEnabled: false,
        modelName: "gpt-5.4",
        modelReasoningEffort: "xhigh",
        workspacePath: "C:\\repo\\alpha",
        workspaceLockRoot: "C:\\repo\\alpha",
      },
      draftPrompt: "alpha draft",
      draftAttachments: [{ id: "img-1" }],
      messages: [],
      h: {},
    },
    {
      id: "chat-2",
      title: "Chat 2",
      agent: "default",
      settings: {
        executionProfile: "guardian",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        webSearchMode: "cached",
        fastModeEnabled: true,
        automaticApprovalReviewEnabled: true,
        modelName: "gpt-5.4-mini",
        modelReasoningEffort: "medium",
        workspacePath: "D:\\beta",
        workspaceLockRoot: "D:\\beta",
      },
      draftPrompt: "beta draft",
      draftAttachments: [{ id: "img-2" }, { id: "img-3" }],
      messages: [],
      h: {},
    },
  ];
  context.s.active = "chat-1";
  context.e.executionProfile.value = "custom";
  context.e.approvalPolicy.value = "never";
  context.e.fastModeEnabled.checked = true;
  context.e.automaticApprovalReviewEnabled.checked = true;
  context.e.sandboxMode.value = "danger-full-access";
  context.e.webSearchMode.value = "live";
  context.e.modelName.value = "gpt-5.3-codex";
  context.e.modelReasoningEffort.value = "high";
  context.e.workspacePath.value = "C:\\repo\\alpha\\nested";
  context.e.promptInput.value = "edited alpha draft";
  context.composerAttachment.items = context.s.chats[0].draftAttachments;

  const switched = await setActiveChatForUi("chat-2", { syncWorkspaceGuard: false });
  assert.strictEqual(switched, true, "chat switch should succeed");

  const updatedChatOne = context.chat("chat-1");
  assert.strictEqual(updatedChatOne.settings.approvalPolicy, "never", "chat 1 should keep its edited approval policy");
  assert.strictEqual(updatedChatOne.settings.sandboxMode, "danger-full-access", "chat 1 should keep its edited sandbox mode");
  assert.strictEqual(updatedChatOne.settings.workspacePath, "C:\\repo\\alpha\\nested", "chat 1 should keep its edited workspace path");
  assert.strictEqual(updatedChatOne.settings.workspaceLockRoot, "C:\\repo\\alpha", "chat 1 lock root should remain chat-scoped");
  assert.strictEqual(updatedChatOne.draftPrompt, "edited alpha draft", "chat 1 draft should be captured before switching");

  assert.strictEqual(context.s.active, "chat-2", "chat 2 should become active");
  assert.strictEqual(context.e.modelName.value, "gpt-5.4-mini", "chat 2 model should restore to the UI");
  assert.strictEqual(context.e.modelReasoningEffort.value, "medium", "chat 2 reasoning should restore to the UI");
  assert.strictEqual(context.e.workspacePath.value, "D:\\beta", "chat 2 workspace should restore to the UI");
  assert.strictEqual(context.e.promptInput.value, "beta draft", "chat 2 draft should restore to the composer");
  assert.strictEqual(context.composerAttachment.items, context.s.chats[1].draftAttachments, "attachment state should follow the active chat");

  const freshChat = mkChat({ agent: "default", forceNewSession: true, activate: false });
  const switchedToFresh = await setActiveChatForUi(freshChat.id, { syncWorkspaceGuard: false });
  assert.strictEqual(switchedToFresh, true, "switching to the fresh chat should succeed");
  assert.strictEqual(context.e.modelName.value, "gpt-5.4", "fresh chats should start from the runtime default model");
  assert.strictEqual(context.e.promptInput.value, "", "fresh chats should start with an empty draft");
  assert.strictEqual(
    context.chat(freshChat.id).settings.workspaceLockRoot,
    "",
    "fresh chats should not inherit another room's lock root"
  );
}

function testSavedChatPayloadIncludesScopedSettings() {
  const { context, storage, saveChatStateNow } = buildContext();
  context.s.active = "chat-2";
  context.s.chats = [
    {
      id: "chat-1",
      title: "Chat 1",
      agent: "default",
      forceNewSession: false,
      settings: {
        executionProfile: "custom",
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
        webSearchMode: "live",
        fastModeEnabled: true,
        automaticApprovalReviewEnabled: true,
        modelName: "gpt-5.3-codex",
        modelReasoningEffort: "high",
        workspacePath: "C:\\repo\\alpha\\nested",
        workspaceLockRoot: "C:\\repo\\alpha",
      },
      draftPrompt: "edited alpha draft",
      messages: [{ id: "m-1", role: "user", title: "You", time: "10:00:00", content: "hello" }],
      h: { status: "idle" },
    },
    {
      id: "chat-2",
      title: "Chat 2",
      agent: "default",
      forceNewSession: true,
      settings: {
        executionProfile: "guardian",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        webSearchMode: "cached",
        fastModeEnabled: false,
        automaticApprovalReviewEnabled: true,
        modelName: "gpt-5.4-mini",
        modelReasoningEffort: "medium",
        workspacePath: "D:\\beta",
        workspaceLockRoot: "D:\\beta",
      },
      draftPrompt: "beta draft",
      messages: [],
      h: { status: "running" },
    },
  ];

  saveChatStateNow();
  const rawPayload = storage.get("codex-console-chat-v1");
  assert(rawPayload, "chat state should be written to localStorage");
  const parsed = JSON.parse(rawPayload);
  assert.strictEqual(parsed.active, "chat-2", "active chat should persist");
  assert.strictEqual(parsed.chats[0].settings.workspaceLockRoot, "C:\\repo\\alpha", "chat 1 lock root should persist");
  assert.strictEqual(parsed.chats[0].settings.modelName, "gpt-5.3-codex", "chat 1 model should persist");
  assert.strictEqual(parsed.chats[0].draftPrompt, "edited alpha draft", "chat 1 draft prompt should persist");
  assert.strictEqual(parsed.chats[1].settings.workspacePath, "D:\\beta", "chat 2 workspace path should persist");
  assert.strictEqual(parsed.chats[1].settings.executionProfile, "guardian", "chat 2 profile should persist");
}

async function run() {
  await testSwitchPreservesAndRestoresRoomScopedState();
  testSavedChatPayloadIncludesScopedSettings();
  console.log("[harnesui-chat-room-state-test] PASS");
  console.log("PASS");
}

run().catch((error) => {
  console.log(`[harnesui-chat-room-state-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
});
