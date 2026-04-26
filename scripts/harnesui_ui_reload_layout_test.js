#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appPath = path.join(__dirname, "..", "web", "01.HarnesUI", "app.js");
const indexHtmlPath = path.join(__dirname, "..", "web", "01.HarnesUI", "index.html");
const stylesPath = path.join(__dirname, "..", "web", "01.HarnesUI", "styles.css");
const source = fs.readFileSync(appPath, "utf8");
const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
const stylesSource = fs.readFileSync(stylesPath, "utf8");

function extractConst(name) {
  const pattern = new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`);
  const match = source.match(pattern);
  assert(match, `${name} constant not found`);
  return `const ${name}=${match[1]};`;
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

function createClassListMock() {
  const states = new Map();
  return {
    states,
    add(name) {
      states.set(name, true);
    },
    toggle(name, force) {
      const next = Boolean(force);
      states.set(name, next);
      return next;
    },
  };
}

function createStyleMock() {
  const values = new Map();
  return {
    values,
    setProperty(name, value) {
      values.set(name, value);
    },
  };
}

function loadHelpers() {
  const bodyClassList = createClassListMock();
  const rootStyle = createStyleMock();
  const context = {
    Math,
    Number,
    String,
    Date,
    URL,
    document: {
      body: { classList: bodyClassList },
      documentElement: { style: rootStyle },
    },
    window: {
      innerHeight: 920,
      location: {
        href: "http://127.0.0.1:57525/01.HarnesUI/index.html?chat=1#composer",
        origin: "http://127.0.0.1:57525",
      },
    },
    e: {
      composer: {
        getBoundingClientRect() {
          return { height: 212.4 };
        },
      },
    },
  };
  const bootstrap = [
    extractConst("COMPOSER_STICKY_MIN_VIEWPORT_HEIGHT"),
    extractConst("APP_BUNDLE_VERSION"),
    extractConst("UI_RELOAD_CACHE_PARAM"),
    extractFunction("shouldUseStickyComposerForUi"),
    extractFunction("buildUiReloadUrlForUi"),
    extractFunction("extractUiBundleVersionFromSourceForUi"),
    extractFunction("syncComposerViewportSpacingForUi"),
    "this.helpers={APP_BUNDLE_VERSION,shouldUseStickyComposerForUi,buildUiReloadUrlForUi,extractUiBundleVersionFromSourceForUi,syncComposerViewportSpacingForUi};",
  ].join("\n\n");
  vm.runInNewContext(bootstrap, context);
  return { context, bodyClassList, rootStyle, helpers: context.helpers };
}

function loadFirstScreenHelpers() {
  const timelineClassList = createClassListMock();
  const composerClassList = createClassListMock();
  const context = {
    String,
    e: {
      timeline: { classList: timelineClassList },
      composer: { classList: composerClassList },
    },
    normalizeMessageReferencesForUi(value) {
      return String(value || "");
    },
    syncOperatorDetailFoldForUi() {},
  };
  const bootstrap = [
    extractFunction("compactInlineTextForUi"),
    extractFunction("conversationSnapshotForUi"),
    extractFunction("chatHasConversationForUi"),
    extractFunction("syncFirstScreenLayoutForUi"),
    "this.helpers={conversationSnapshotForUi,chatHasConversationForUi,syncFirstScreenLayoutForUi};",
  ].join("\n\n");
  vm.runInNewContext(bootstrap, context);
  return { timelineClassList, composerClassList, helpers: context.helpers };
}

function run() {
  const { context, bodyClassList, rootStyle, helpers } = loadHelpers();
  const { APP_BUNDLE_VERSION, shouldUseStickyComposerForUi, buildUiReloadUrlForUi, extractUiBundleVersionFromSourceForUi, syncComposerViewportSpacingForUi } = helpers;
  const { timelineClassList, composerClassList, helpers: firstScreenHelpers } = loadFirstScreenHelpers();

  assert.strictEqual(shouldUseStickyComposerForUi(920), false, "tall viewport should keep the composer in the normal page flow");
  assert.strictEqual(shouldUseStickyComposerForUi(758), false, "desktop-height viewport should keep the composer in the normal page flow");
  assert.strictEqual(shouldUseStickyComposerForUi(640), false, "threshold viewport should keep the composer in the normal page flow");
  assert.strictEqual(shouldUseStickyComposerForUi(639), false, "short viewport should keep the composer in the normal page flow");

  const reloadUrl = buildUiReloadUrlForUi("http://127.0.0.1:57525/01.HarnesUI/index.html?chat=1#composer", 12345);
  assert.strictEqual(
    reloadUrl,
    "http://127.0.0.1:57525/01.HarnesUI/index.html?chat=1&ui_reload=12345#composer",
    "UI reload URL should preserve query/hash while cache-busting the shell"
  );
  assert(
    !indexHtml.includes("20260412-carryover-v5"),
    "index.html must not keep a stale hard-coded UI asset version seed"
  );
  assert(
    indexHtml.includes('const versionSeed = cacheBust || String(Date.now());'),
    "index.html should derive the UI asset version from the cache-bust param or current time"
  );
  assert.strictEqual(
    extractUiBundleVersionFromSourceForUi(`const APP_BUNDLE_VERSION="${APP_BUNDLE_VERSION}";`),
    APP_BUNDLE_VERSION,
    "bundle version extractor should read the current app bundle marker"
  );
  assert(indexHtml.includes('id="operatorSnapshotCard"'), "index.html should expose the first-screen operator snapshot card");
  assert(
    indexHtml.includes('id="operatorRuntimeValue"') && indexHtml.includes('id="operatorWorkspaceValue"'),
    "index.html should keep the runtime and workspace snapshot values on the first screen"
  );
  assert(indexHtml.includes('class="composer-prompt-label"'), "index.html should label the composer prompt area");
  assert(stylesSource.includes(".operator-snapshot-card"), "styles.css should style the operator snapshot card");
  assert(stylesSource.includes(".composer-prompt-label"), "styles.css should style the composer prompt label");
  assert(stylesSource.includes(".work-panel {"), "styles.css should keep a dedicated work-panel layout for conversation and operator surfaces");
  assert(
    stylesSource.includes(".app-shell {\n  position: relative;\n  z-index: 1;\n  width: min(1720px, calc(100vw - clamp(20px, 2vw, 44px)));"),
    "wide desktop shell should clamp the overall canvas instead of wasting a large right-side span"
  );
  assert(
    stylesSource.includes(".main-layout {\n  margin-top: 14px;\n  display: grid;\n  grid-template-columns: 224px minmax(0, 1fr);\n  gap: clamp(16px, 1.25vw, 24px);"),
    "wide desktop layout should keep a denser left rail and tighter center/right spacing"
  );
  assert(
    stylesSource.includes(".work-panel {\n  grid-template-columns: minmax(0, 1fr) clamp(320px, 21vw, 368px);") &&
      stylesSource.includes("@media (max-width: 1440px) {\n  .work-panel {\n    grid-template-columns: minmax(0, 1fr) 336px;"),
    "wide desktop layout should keep the status rail compact instead of leaving an oversized right gutter"
  );
  assert(
    stylesSource.includes(".timeline.timeline-empty"),
    "empty conversation timeline should get its own compact first-screen sizing"
  );
  assert(
    stylesSource.includes(".composer.composer-empty #promptInput"),
    "empty composer prompt should shrink further to keep the first screen usable"
  );
  assert(
    stylesSource.includes(".composer-actions {\n  display: grid;\n  grid-template-columns: 1fr;\n  gap: 10px;\n  align-self: end;\n  align-content: start;\n  grid-auto-rows: minmax(52px, auto);\n}") &&
      stylesSource.includes(".composer-actions .btn {\n  width: 100%;\n  min-height: 52px;\n}"),
    "desktop composer actions should stay compact instead of stretching into oversized full-height blocks"
  );
  assert(
    stylesSource.includes(".work-panel {\n    grid-template-areas:\n      \"conversation\"\n      \"status\";") &&
      stylesSource.includes(".timeline {\n    min-height: 120px;") &&
      stylesSource.includes(".timeline-empty-list {\n    grid-template-columns: 1fr;") &&
      stylesSource.includes(".composer-input {\n    display: contents;") &&
      stylesSource.includes("#promptInput {\n    min-height: 80px;") &&
      stylesSource.includes(".operator-detail-fold > summary {\n    grid-template-columns: auto 1fr auto;") &&
      stylesSource.includes(".composer-actions {\n    grid-template-columns: 1fr 1fr;"),
    "mobile first-screen layout should keep the conversation and composer ahead of the compact status rail"
  );
  assert(
    indexHtml.includes('id="operatorDetailFold"') && indexHtml.includes('id="operatorDetailSummary"') &&
      stylesSource.includes(".operator-detail-fold") && stylesSource.includes(".operator-detail-summary"),
    "operator detail fold should exist so lower status can collapse below the first screen"
  );
  assert(
    source.includes("function syncOperatorDetailFoldForUi(") &&
      source.includes("function syncFirstScreenLayoutForUi(") &&
      source.includes('e.timeline.classList.toggle("timeline-empty",!hasConversation);') &&
      source.includes('e.composer.classList.toggle("composer-empty",!hasConversation);'),
    "app.js should auto-sync empty-state compaction and status detail folding"
  );
  assert(
    source.includes("chatDetailParts.join(\" / \")"),
    "app.js should keep operator snapshot copy readable without collapsing the chat detail into status codes"
  );
  assert(source.includes("function renderOperatorSnapshotForUi("), "app.js should render the operator snapshot surface");
  assert(source.includes("renderOperatorSnapshotForUi();"), "app.js should refresh the operator snapshot when the UI updates");
  const readyOnlyChat = {
    messages: [
      { role: "system", title: "System", content: "Ready. Standard Codex: ON" },
    ],
  };
  assert.strictEqual(
    firstScreenHelpers.chatHasConversationForUi(readyOnlyChat),
    false,
    "bootstrap-ready system copy should not disable first-screen empty-state compaction"
  );
  const readyOnlySnapshot = firstScreenHelpers.conversationSnapshotForUi(readyOnlyChat);
  assert.strictEqual(
    readyOnlySnapshot.hasConversation,
    false,
    "system-only bootstrap copy should still count as an empty conversation"
  );
  assert.strictEqual(
    Array.isArray(readyOnlySnapshot.messages) ? readyOnlySnapshot.messages.length : -1,
    0,
    "system-only bootstrap copy should not surface transcript rows"
  );
  firstScreenHelpers.syncFirstScreenLayoutForUi(readyOnlyChat);
  assert.strictEqual(
    timelineClassList.states.get("timeline-empty"),
    true,
    "timeline should stay compact for a fresh chat after the runtime-ready bootstrap note"
  );
  assert.strictEqual(
    composerClassList.states.get("composer-empty"),
    true,
    "composer should stay compact for a fresh chat after the runtime-ready bootstrap note"
  );
  const realConversationChat = {
    messages: [
      { role: "system", title: "System", content: "Ready. Standard Codex: ON" },
      { role: "user", title: "You", content: "Need a first-screen layout fix." },
    ],
  };
  assert.strictEqual(
    firstScreenHelpers.chatHasConversationForUi(realConversationChat),
    true,
    "real user messages should still disable the empty-state layout"
  );
  firstScreenHelpers.syncFirstScreenLayoutForUi(realConversationChat);
  assert.strictEqual(
    timelineClassList.states.get("timeline-empty"),
    false,
    "timeline should exit compact empty mode once a real conversation starts"
  );
  assert.strictEqual(
    composerClassList.states.get("composer-empty"),
    false,
    "composer should exit compact empty mode once a real conversation starts"
  );
  const normalizedSource = source.replace(/\s+/g, "");
  assert(
    normalizedSource.includes('window.addEventListener("beforeunload",()=>{if(typeofcleanupRealtimeVoiceSession==="function")cleanupRealtimeVoiceSession();});'),
    "beforeunload should guard the removed realtime voice cleanup hook"
  );

  const stickyHeight = syncComposerViewportSpacingForUi();
  assert.strictEqual(stickyHeight, 0, "static composer spacing should not reserve extra viewport space");
  assert.strictEqual(bodyClassList.states.get("composer-static"), true, "composer should stay in static mode on tall viewports");
  assert.strictEqual(rootStyle.values.get("--composer-block-size"), "0px", "static composer spacing should clear the reserved CSS variable");

  context.window.innerHeight = 620;
  const compactHeight = syncComposerViewportSpacingForUi();
  assert.strictEqual(compactHeight, 0, "short viewport should keep composer spacing cleared");
  assert.strictEqual(bodyClassList.states.get("composer-static"), true, "short viewport should remain in static composer mode");
  assert.strictEqual(rootStyle.values.get("--composer-block-size"), "0px", "short viewport should keep reserved sticky space cleared");

  console.log("[harnesui-ui-reload-layout-test] PASS");
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[harnesui-ui-reload-layout-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
