#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appPath = path.join(__dirname, "..", "web", "01.HarnesUI", "app.js");
const indexHtmlPath = path.join(__dirname, "..", "web", "01.HarnesUI", "index.html");
const source = fs.readFileSync(appPath, "utf8");
const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");

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

function run() {
  const { context, bodyClassList, rootStyle, helpers } = loadHelpers();
  const { APP_BUNDLE_VERSION, shouldUseStickyComposerForUi, buildUiReloadUrlForUi, extractUiBundleVersionFromSourceForUi, syncComposerViewportSpacingForUi } = helpers;

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
