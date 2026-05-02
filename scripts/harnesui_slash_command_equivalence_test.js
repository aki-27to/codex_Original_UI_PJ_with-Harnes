"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
const appJs = fs.readFileSync(path.join(workspaceRoot, "web", "01.HarnesUI", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(workspaceRoot, "web", "01.HarnesUI", "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(workspaceRoot, "web", "01.HarnesUI", "styles.css"), "utf8");
const { implementationPath: serverImplPath } = resolveServerImplementationPath(workspaceRoot);
const serverImpl = fs.readFileSync(serverImplPath, "utf8");

function assertMatch(source, regex, message) {
  assert(regex.test(source), message);
}

function main() {
  assertMatch(
    appJs,
    /const\s+COMMANDS=\["\/help","\/goal","\/goal clear","\/goal pause","\/goal resume","\/goal complete","\/status","\/diff","\/resume --last","\/fork","\/fast status","\/agent list"\];/,
    "HarnesUI command palette must expose supported slash commands, not only a /goal prompt preset"
  );
  assertMatch(
    appJs,
    /function\s+commandPaletteCopyForUi\s*\(/,
    "HarnesUI command palette must explain which commands are Codex-backed versus local"
  );
  assertMatch(
    indexHtml,
    /data-compose-preset="\/goal "[^>]*title="\/goal コマンドを入力します。送信時にCodex goalへ接続し、未対応runtimeではHarnesUI goalに保存します。"/,
    "visible /goal shortcut must state native goal connection and fallback behavior"
  );

  assertMatch(appJs, /const\s+GOAL_COMPOSER_PRESET="\/goal ";/, "/goal composer shortcut must have a single canonical preset value");
  assertMatch(appJs, /function\s+applyComposerPresetButtonForUi\s*\(btn\)[\s\S]*?promptHasGoalComposerPrefixForUi\(value\)[\s\S]*?removeGoalComposerPrefixForUi\(value\)[\s\S]*?addGoalComposerPrefixForUi\(value\)[\s\S]*?syncActiveChatScopedStateFromUi\(\);[\s\S]*?renderMissionSupportUi\(\);/, "/goal composer shortcut must toggle the prefix and persist draft state");
  assertMatch(appJs, /function\s+syncGoalComposerPresetStateForUi\s*\(\)[\s\S]*?aria-pressed[\s\S]*?dataset\.state/, "/goal composer shortcut must expose accessible ON/OFF state");
  assertMatch(stylesCss, /\.composer-preset\[aria-pressed="true"\]/, "/goal composer shortcut must have a visible ON style");
  for (const command of ["/help", "/status", "/diff", "/resume --last", "/fork", "/fast status", "/agent list"]) {
    assertMatch(
      indexHtml,
      new RegExp(`data-slash-command="${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      `composer must expose a visible ${command} slash shortcut`
    );
  }
  assertMatch(stylesCss, /\.slash-shortcuts\s*\{[\s\S]*?flex-wrap:\s*wrap;/, "representative slash shortcuts must wrap instead of overflowing the composer");

  assertMatch(serverImpl, /async function handleSlashGoalCommand\s*\(/, "server slash router must implement /goal");
  assertMatch(serverImpl, /function handleSlashHelpCommand\s*\(/, "server slash router must implement /help");
  assertMatch(serverImpl, /function handleSlashStatusCommand\s*\(/, "server slash router must implement /status");
  assertMatch(serverImpl, /function formatCodexStatusLikeText\s*\([\s\S]*?>_ OpenAI Codex/, "/status must render a Codex-style status body instead of a generic chat answer");
  assertMatch(serverImpl, /native quota bars are not exposed by the local app-server\./, "/status must be honest about quota data unavailable to HarnesUI");
  assertMatch(serverImpl, /function handleSlashDiffCommand\s*\(/, "server slash router must implement /diff");
  assertMatch(serverImpl, /function handleUnsupportedSlashCommand\s*\(/, "server slash router must reject unsupported slash commands before ordinary turn execution");
  assertMatch(serverImpl, /await handleSlashGoalCommand\(res,argsText,targetAgentName,sandboxMode,normalized\);/, "runCodexExecStreaming must route /goal before ordinary turn execution");
  assertMatch(serverImpl, /handleUnsupportedSlashCommand\(res,command\);[\s\S]*?return;[\s\S]*?await executeTurnStreaming/, "unknown slash commands must not fall through as ordinary model prompts");
  assertMatch(serverImpl, /appServer\.sendRequest\("thread\/goal\/get"/, "/goal status must try native app-server goal get");
  assertMatch(serverImpl, /appServer\.sendRequest\("thread\/goal\/set"/, "/goal set/pause/resume/complete must try native app-server goal set");
  assertMatch(serverImpl, /appServer\.sendRequest\("thread\/goal\/clear"/, "/goal clear must try native app-server goal clear");
  assertMatch(serverImpl, /Native Codex goal API is not available in this runtime\./, "/goal must fail over transparently when native goal requests are unavailable");
  assertMatch(serverImpl, /const mentionsGoalMethod=[\s\S]*?thread\/goal\//, "/goal fallback must be limited to goal-method errors");
  assert(!/function isUnsupportedAppServerGoalMethodError[\s\S]*?invalid request[\s\S]*?function normalizeGoalForSlashCommand/.test(serverImpl), "/goal must not hide native payload errors as unsupported fallback");
  assertMatch(serverImpl, /method==="thread\/goal\/set"/, "mock fixture must support native goal set for slash-command tests");
  assertMatch(serverImpl, /method==="thread\/goal\/get"/, "mock fixture must support native goal get for slash-command tests");
  assertMatch(serverImpl, /method==="thread\/goal\/clear"/, "mock fixture must support native goal clear for slash-command tests");

  process.stdout.write("PASS harnesui_slash_command_equivalence_test\n");
}

main();
