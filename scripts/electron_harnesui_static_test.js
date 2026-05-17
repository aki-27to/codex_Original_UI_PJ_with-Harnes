const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function mustExist(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) fail(`missing required file: ${rel}`);
}

function mustInclude(text, needle, label) {
  if (!text.includes(needle)) fail(`${label} missing ${needle}`);
}

function mustNotInclude(text, needle, label) {
  if (text.includes(needle)) fail(`${label} should not include ${needle}`);
}

[
  "desktop/harnes-electron/main.cjs",
  "desktop/harnes-electron/preload.cjs",
  "desktop/harnes-electron/index.html",
  "desktop/harnes-electron/vite.config.mjs",
  "desktop/harnes-electron/tsconfig.json",
  "desktop/harnes-electron/src/App.tsx",
  "desktop/harnes-electron/src/main.tsx",
  "desktop/harnes-electron/src/styles.css",
  "web/01.HarnesUI/index.html",
  "server/routes/exec_routes.js",
  "server/routes/eval_routes.js",
  "start_harnes_desktop_app.bat",
].forEach(mustExist);

const pkg = JSON.parse(read("package.json"));
["harnes:app", "harnes:desktop", "harnes:web", "electron:harnes", "electron:harnes:build", "electron:harnes:typecheck", "electron:harnes:smoke", "electron:harnes:monkey", "test:electron-harnesui"].forEach((scriptName) => {
  if (!pkg.scripts || !pkg.scripts[scriptName]) fail(`missing package script: ${scriptName}`);
});
if (pkg.scripts["harnes:app"] !== "npm run electron:harnes") fail("harnes:app must launch the Electron desktop app");
if (pkg.scripts["harnes:desktop"] !== "npm run electron:harnes") fail("harnes:desktop must launch the Electron desktop app");
if (pkg.scripts["harnes:web"] === pkg.scripts["harnes:app"]) fail("harnes:web must remain distinct from the desktop app launcher");

const agents = read("AGENTS.md");
mustInclude(agents, "ハーネスAPP", "AGENTS launch contract");
mustInclude(agents, "Electron desktop lane", "AGENTS launch contract");
mustInclude(agents, "npm run harnes:app", "AGENTS launch contract");
mustInclude(agents, "start_harnes_desktop_app.bat", "AGENTS launch contract");
mustInclude(agents, "`start_codex_ui.bat` や `/01.HarnesUI/index.html` は Web / HTML / ブラウザ版を明示された場合だけ使います", "AGENTS launch contract");

const electronDoc = read("docs/ELECTRON_HARNESUI.md");
mustInclude(electronDoc, "When the user says \"Harnes APP\"", "Electron docs launch contract");
mustInclude(electronDoc, "launch this Electron lane", "Electron docs launch contract");
mustInclude(electronDoc, "npm run harnes:app", "Electron docs launch command");
mustInclude(electronDoc, ".\\start_harnes_desktop_app.bat", "Electron docs Windows launcher");
mustInclude(electronDoc, "Do not substitute the web/HTML compatibility UI", "Electron docs anti-substitution guard");
mustInclude(electronDoc, "For the Web compatibility lane", "Electron docs web compatibility boundary");

const desktopLauncher = read("start_harnes_desktop_app.bat");
mustInclude(desktopLauncher, "npm run harnes:app", "desktop app launcher");
mustInclude(desktopLauncher, "CODEX_AUTO_OPEN_BROWSER=0", "desktop app launcher must not open browser");
mustNotInclude(desktopLauncher, "start_codex_ui.bat", "desktop app launcher");
mustNotInclude(desktopLauncher, "/01.HarnesUI/index.html", "desktop app launcher");

const main = read("desktop/harnes-electron/main.cjs");
mustInclude(main, "server.js", "Electron main");
mustInclude(main, "CODEX_AUTO_OPEN_BROWSER", "Electron main");
mustInclude(main, "Menu.setApplicationMenu", "Electron main localized app menu");
mustInclude(main, "installApplicationMenu", "Electron main localized app menu installer");
mustInclude(main, 'label: "ファイル"', "Electron main localized File menu");
mustInclude(main, 'label: "編集"', "Electron main localized Edit menu");
mustInclude(main, 'label: "表示"', "Electron main localized View menu");
mustInclude(main, 'label: "ウィンドウ"', "Electron main localized Window menu");
mustInclude(main, 'label: "終了"', "Electron main localized Exit item");
mustInclude(main, "harnes:restart-backend", "Electron main");
mustInclude(main, "harnes:submit-exec", "Electron main");
mustInclude(main, "harnes:cancel-exec", "Electron main");
mustInclude(main, "harnes:get-current-logs", "Electron main");
mustInclude(main, "harnes:get-diagnostics", "Electron main");
mustInclude(main, "operatorPanelsHidden", "Electron main smoke requires normal-state operator panels hidden");
mustInclude(main, "sidebarVisible", "Electron main smoke requires visible sidebar by default");
mustInclude(main, "proposalDockVisible", "Electron main smoke requires left proposal dock");
mustInclude(main, "workStateVisible", "Electron main smoke requires user-facing work state");
mustInclude(main, "oldWebStatusVisible", "Electron main smoke requires old-web status strip");
mustInclude(main, "runtimeRefreshExplained", "Electron main smoke requires runtime refresh explanation");
mustInclude(main, "attachmentRowsReady", "Electron main smoke requires attachment row surface");
mustInclude(main, "capturePage", "Electron main smoke must capture screenshot evidence");
mustInclude(main, "electron-harnesui", "Electron main smoke screenshot output path");
mustInclude(main, "harnes:lock-workspace", "Electron main");
mustInclude(main, "harnes:unlock-workspace", "Electron main");
mustInclude(main, "localOriginHeaders", "Electron main");
mustInclude(main, "Origin: backendUrl", "Electron main");
mustInclude(main, "Referer:", "Electron main");
mustInclude(main, "images", "Electron main attachment payload");
mustInclude(main, 'path: "/api/exec"', "Electron main");
mustInclude(main, "isTerminalExecStatus", "Electron main terminal status guard");
mustInclude(main, "terminalStatusEmitted", "Electron main stream-end fallback status guard");
mustInclude(main, 'forwardExecEvent({ type: "status", status: streamErrorSeen ? "failed" : "completed" })', "Electron main stream-end must settle renderer state");
mustInclude(main, "/api/server/restart", "Electron main");
mustInclude(main, "/api/workspace/lock", "Electron main");
mustInclude(main, "/api/workspace/unlock", "Electron main");

const preload = read("desktop/harnes-electron/preload.cjs");
mustInclude(preload, "submitExec", "Electron preload");
mustInclude(preload, "cancelExec", "Electron preload");
mustInclude(preload, "getCurrentLogs", "Electron preload");
mustInclude(preload, "getDiagnostics", "Electron preload");
mustInclude(preload, "lockWorkspace", "Electron preload");
mustInclude(preload, "unlockWorkspace", "Electron preload");
mustInclude(preload, "onExecEvent", "Electron preload");

const app = read("desktop/harnes-electron/src/App.tsx");
mustInclude(app, "/api/runtime", "Electron renderer");
mustInclude(app, "/design-proposals/latest/manifest.json", "Electron renderer");
mustInclude(app, "/01.HarnesUI/index.html", "Electron renderer");
mustInclude(app, "Design proposal", "Electron renderer left proposal dock");
mustInclude(app, "proposal-dock", "Electron renderer left proposal dock");
mustInclude(app, "HARNES_SIDEBAR_STORAGE_KEY", "Electron renderer persists sidebar preference");
mustInclude(app, "loadStoredSidebarOpen", "Electron renderer loads sidebar preference");
mustInclude(app, "sidebarOpen", "Electron renderer sidebar toggle state");
mustInclude(app, "sidebar-edge-toggle", "Electron renderer left-edge sidebar toggle control");
mustInclude(app, "sidebar-rail", "Electron renderer collapsed sidebar rail");
mustInclude(app, "sidebar-collapsed", "Electron renderer collapsed sidebar layout");
mustInclude(app, "composer-toolbar", "Electron renderer compact composer toolbar");
mustInclude(app, "composer-submit-actions", "Electron renderer composer submit actions");
mustInclude(app, "command-menu-trigger", "Electron renderer hidden commands menu trigger");
mustInclude(app, "command-menu", "Electron renderer commands dropdown");
mustInclude(app, "insertCommandText", "Electron renderer command dropdown insertion");
mustInclude(app, "hidden-file-input", "Electron renderer hides native file picker chrome");
mustInclude(app, "attachment-trigger", "Electron renderer attachment trigger button");
mustInclude(app, "missionMetaItems", "Electron renderer compact mission metadata");
mustInclude(app, "workStateForChat", "Electron renderer user-facing work state");
mustInclude(app, "返信で続行", "Electron renderer resend-ready needs_input label");
mustInclude(app, "失敗ではありません。必要な情報や判断を返信すると続きから再開できます。", "Electron renderer resend-ready needs_input detail");
mustNotInclude(app, 'label: "入力待ち"', "Electron renderer must not show the old input-wait headline");
mustNotInclude(app, 'listLabel: "入力待ち"', "Electron renderer must not show the old input-wait list label");
mustNotInclude(app, "追加指示を送ると続行できます。", "Electron renderer must not show the old needs_input detail");
mustInclude(app, "const [activeRequests, setActiveRequests] = useState<ActiveRequest[]>([])", "Electron renderer keeps active exec state per chat");
mustInclude(app, "runtimeRefreshState", "Electron renderer explains runtime refresh state");
mustInclude(app, "old-web-status", "Electron renderer old-web status strip");
mustInclude(app, "old-web-version", "Electron renderer visible version label");
mustInclude(app, "codex-cli", "Electron renderer version label must name codex-cli");
mustInclude(app, "Runtime更新", "Electron renderer runtime refresh button names what it updates");
mustInclude(app, "更新対象: /api/runtime、診断、logs、デザイン案", "Electron renderer runtime refresh note");
mustInclude(app, "work-state-spinner", "Electron renderer work state has dynamic spinner");
mustInclude(app, "attachment-panel", "Electron renderer attachment panel");
mustInclude(app, "attachment-item", "Electron renderer attachment rows");
mustInclude(app, "attachment-thumb", "Electron renderer attachment thumbnails");
mustInclude(app, "activeChat ? activeRequests.find((request) => request.chatId === activeChat.id)", "Electron renderer resolves the active request for the current chat only");
mustInclude(app, "&& !activeChatRequest", "Electron renderer submit eligibility is scoped to the active chat");
mustInclude(app, "disabled={!activeChatRequest}", "Electron renderer stop button is scoped to the active chat");
mustInclude(app, "activeRequests.some((request) => request.chatId === chat.id)", "Electron renderer sidebar marks only the running chat");
mustNotInclude(app, "const [activeRequest, setActiveRequest]", "Electron renderer must not keep a single global active request");
mustNotInclude(app, "disabled={!activeRequest}", "Electron renderer stop button must not follow a global active request");
mustInclude(app, "状態: ${activeChatWorkState.label}", "Electron renderer composer work state label");
mustInclude(app, "work-state-pill", "Electron renderer conversation work state pill");
mustInclude(app, "workStateVisible", "Electron smoke proves work state visibility");
mustInclude(app, "oldWebStatusVisible", "Electron smoke proves old-web status visibility");
mustInclude(app, "runtimeRefreshExplained", "Electron smoke proves runtime refresh explanation");
mustInclude(app, "attachmentRowsReady", "Electron smoke proves attachment row surface");
mustInclude(app, 'status: chat.status === "running" ? "completed" : chat.status', "Electron renderer stream-end fallback must not leave running");
mustNotInclude(app, "{chat.status} / {chat.messages.length} messages", "Electron renderer should not expose raw chat status in sidebar");
mustNotInclude(app, "idempotency keyなし", "Electron renderer should not expose technical idempotency fallback in composer");
mustInclude(app, "Logs / Evidence", "Electron renderer");
mustInclude(app, "summarizeEvidence", "Electron renderer evidence summary");
mustInclude(app, "evidenceDetailsOpen", "Electron renderer evidence details toggle");
mustInclude(app, "詳細を表示", "Electron renderer evidence details collapsed by default");
mustInclude(app, "実行設定", "Electron renderer settings");
mustInclude(app, "UI改善", "Electron renderer UI improvement preset");
mustInclude(app, "COMMANDS", "Electron renderer slash commands");
mustInclude(app, "/goal", "Electron renderer slash command parity");
mustNotInclude(app, '"/help"', "Electron renderer command menu should not expose removed /help route");
mustInclude(app, "getDiagnostics", "Electron renderer diagnostics");
mustInclude(app, "summarizeDiagnosticsHealth", "Electron renderer diagnostics summary");
mustInclude(app, "diagnosticsDetailsOpen", "Electron renderer diagnostics details toggle");
mustInclude(app, "Runtime health", "Electron renderer diagnostics summary label");
mustInclude(app, "runtime-panel", "Electron renderer right rail runtime panel");
mustInclude(app, "runSettingsSummary", "Electron renderer compact settings summary");
mustInclude(app, "settings-summary", "Electron renderer collapsed settings summary");
mustInclude(app, "settings-disclosure-button", "Electron renderer settings disclosure control");
mustInclude(app, "settings-detail-body", "Electron renderer preserves detailed settings controls");
mustInclude(app, "runtimePanelVisible", "Electron smoke proves runtime panel visibility");
mustInclude(app, "showRightRail", "Electron renderer right rail visibility gate");
mustInclude(app, "showServerRecovery", "Electron renderer server recovery gate");
mustInclude(app, "showRuntimeIssue", "Electron renderer runtime issue gate");
mustInclude(app, "showEvidenceIssue", "Electron renderer evidence issue gate");
mustInclude(app, "operator-only-panel", "Electron renderer hides operator-only normal-state panels");
mustInclude(app, "operatorPanelsHidden", "Electron renderer smoke proves normal-state operator panels are hidden");
mustNotInclude(app, 'value: compactText(value, "loaded")', "Electron renderer diagnostics object rendering");
mustInclude(app, "lockWorkspace", "Electron renderer workspace lock");
mustInclude(app, "unlockWorkspace", "Electron renderer workspace unlock");
mustInclude(app, "webSearchMode", "Electron renderer web search setting");
mustInclude(app, "MODEL_OPTIONS", "Electron renderer model presets");
mustInclude(app, '<select value={settings.model}', "Electron renderer model setting must be a select");
mustInclude(app, 'MODEL_OPTIONS.map((model) => <option key={model} value={model}>{model}</option>)', "Electron renderer model preset options");
mustInclude(app, "modelReasoningEffort", "Electron renderer reasoning setting");
mustInclude(app, "approvalPolicy", "Electron renderer approval setting");
mustInclude(app, "sandboxMode", "Electron renderer sandbox setting");
mustInclude(app, "attachmentsVisible", "Electron smoke surface");
mustInclude(app, "layoutOk", "Electron smoke layout surface");
mustInclude(app, "handleMissionKeyDown", "Electron renderer Ctrl+Enter submit shortcut");
mustInclude(app, 'event.key !== "Enter"', "Electron renderer Ctrl+Enter submit shortcut key guard");
mustInclude(app, "event.ctrlKey", "Electron renderer Ctrl+Enter submit shortcut modifier guard");
mustInclude(app, "event.nativeEvent.isComposing", "Electron renderer Ctrl+Enter submit shortcut IME guard");
mustInclude(app, "onKeyDown={handleMissionKeyDown}", "Electron renderer mission textarea keyboard shortcut binding");
mustInclude(app, 'setLoadError("依頼本文、slash command、または画像を入力してください。")', "Electron renderer empty submit feedback");
mustInclude(app, "const canSubmitMission = Boolean(activeChat && !activeChatRequest);", "Electron renderer must not leave idle send disabled only because the composer is empty");
mustInclude(app, "disabled={!canSubmitMission}", "Electron renderer shared submit eligibility");
mustNotInclude(app, '<p className="eyebrow">Mission</p>', "Electron renderer should not show redundant mission heading above composer");
mustNotInclude(app, '<h2>{activeChat?.title || "Mission"}</h2>', "Electron renderer should not show redundant active chat title above composer");
mustInclude(app, "submitExec", "Electron renderer");
mustInclude(app, "cancelExec", "Electron renderer");
mustInclude(app, "POST /api/exec", "Electron renderer route copy");
mustInclude(app, "POST /api/eval/run", "Electron renderer route copy");
if (app.indexOf('className="panel conversation-panel full-span"') > app.indexOf('className="panel mission-panel full-span"')) {
  fail("Electron renderer should render conversation above mission composer");
}

const styles = read("desktop/harnes-electron/src/styles.css");
mustInclude(styles, "overflow-x: hidden", "Electron CSS overflow guard");
mustInclude(styles, "@media (max-width: 1120px)", "Electron CSS medium viewport guard");
mustInclude(styles, ".settings-grid", "Electron CSS settings layout");
mustInclude(styles, ".runtime-summary-row", "Electron CSS compact runtime summary");
mustInclude(styles, ".settings-disclosure-button", "Electron CSS settings disclosure button");
mustInclude(styles, ".settings-detail-body", "Electron CSS settings details layout");
mustInclude(styles, ".composer-toolbar", "Electron CSS compact composer toolbar");
mustInclude(styles, ".composer-tools", "Electron CSS composer tool group");
mustInclude(styles, ".composer-submit-actions", "Electron CSS composer submit actions");
mustInclude(styles, ".work-state-pill", "Electron CSS user-facing work state");
mustInclude(styles, ".work-state-spinner", "Electron CSS dynamic work state spinner");
mustInclude(styles, "@keyframes harnes-spin", "Electron CSS shared spinner animation");
mustInclude(styles, ".topbar-operational", "Electron CSS old-web topbar lane");
mustInclude(styles, ".old-web-status", "Electron CSS old-web status strip");
mustInclude(styles, ".old-web-version", "Electron CSS visible version label");
mustInclude(styles, ".work-state-meta", "Electron CSS composer work state metadata");
mustInclude(styles, ".command-strip", "Electron CSS command palette layout");
mustInclude(styles, ".command-menu", "Electron CSS hidden commands dropdown");
mustInclude(styles, "bottom: calc(100% + 8px)", "Electron CSS command dropdown opens upward from composer");
mustInclude(styles, ".command-menu-item", "Electron CSS command dropdown item");
mustInclude(styles, ".hidden-file-input", "Electron CSS hidden native file picker");
mustInclude(styles, ".attachment-trigger", "Electron CSS attachment trigger");
mustInclude(styles, ".attachment-panel", "Electron CSS attachment panel");
mustInclude(styles, ".attachment-item", "Electron CSS attachment row");
mustInclude(styles, ".attachment-thumb", "Electron CSS attachment thumbnails");
mustInclude(styles, ".runtime-refresh-note", "Electron CSS runtime refresh note");
mustInclude(styles, ".evidence-summary", "Electron CSS evidence summary layout");
mustInclude(styles, ".evidence-details", "Electron CSS evidence details layout");
mustInclude(styles, ".diagnostics-summary", "Electron CSS diagnostics summary layout");
mustInclude(styles, ".diagnostics-details", "Electron CSS diagnostics details layout");
mustInclude(styles, ".right-rail.empty", "Electron CSS hidden right rail layout");
mustInclude(styles, ".operator-only-panel", "Electron CSS operator-only panel hiding");
mustInclude(styles, ".app-grid.right-rail-hidden", "Electron CSS right rail removal layout");
mustInclude(styles, ".app-grid.sidebar-collapsed", "Electron CSS sidebar collapsed layout");
mustInclude(styles, ".sidebar-shell", "Electron CSS sidebar shell layout");
mustInclude(styles, ".sidebar-edge-toggle", "Electron CSS left-edge sidebar toggle");
mustInclude(styles, ".sidebar-rail", "Electron CSS collapsed sidebar rail");
mustInclude(styles, ".rail-button", "Electron CSS collapsed rail button");
mustInclude(styles, ".proposal-dock", "Electron CSS proposal dock layout");
mustInclude(styles, ".sidebar-section", "Electron CSS sidebar section layout");
mustNotInclude(styles, ".proposal-panel", "Electron CSS should not keep right proposal card styles");

const execRoutes = read("server/routes/exec_routes.js");
const evalRoutes = read("server/routes/eval_routes.js");
mustInclude(execRoutes, 'pathname === "/api/exec"', "exec route");
mustInclude(evalRoutes, 'pathname === "/api/eval/run"', "eval route");

console.log("electron_harnesui_static_test: PASS");
