#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "web", "01.HarnesUI", "app.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "web", "01.HarnesUI", "styles.css"), "utf8");

function cssBlock(selector) {
  const start = stylesSource.indexOf(`${selector} {`);
  assert(start >= 0, `${selector} block must exist`);
  const open = stylesSource.indexOf("{", start);
  const close = stylesSource.indexOf("}", open);
  assert(open >= 0 && close > open, `${selector} block must be closed`);
  return stylesSource.slice(open + 1, close);
}

function run() {
  assert(
    /const\s+ASSISTANT_TUI_PROGRESS_MARKER="\[harnesui-tui-progress\]";/.test(appSource),
    "assistant TUI progress marker must be defined"
  );
  assert(
    /function\s+buildAssistantTuiProgressForUi\s*\(/.test(appSource),
    "assistant TUI progress builder must exist"
  );
  assert(
    /messageIsAssistantTuiProgressForUi\(m\)\)messageEl\.classList\.add\("tui-progress"\)/.test(appSource),
    "timeline renderer must add terminal styling to assistant progress messages"
  );
  assert(
    /updateAssistantTuiProgress\("preparing","local request registered; preparing runtime handoff",\{force:true\}\);/.test(appSource),
    "runPrompt must show TUI progress as soon as the assistant response row is created"
  );
  assert(
    /updateAssistantTuiProgress\("submitted","\/api\/exec request is being submitted"\);/.test(appSource),
    "runPrompt must update TUI progress when the exec request is submitted"
  );
  assert(
    /updateAssistantTuiProgress\("streaming","NDJSON stream connected; waiting for first answer text"\);/.test(appSource),
    "runPrompt must keep a TUI progress row while waiting for first answer text"
  );
  assert(
    /mget\(out\)\.startsWith\(ASSISTANT_TUI_PROGRESS_MARKER\)\)mset\(out,""\);stopAssistantTuiProgress\(\);madd\(out,ev\.text\)/.test(appSource),
    "first streamed answer text must replace the TUI progress row"
  );
  assert(
    !/\[waiting\] Standard Codex/.test(appSource),
    "legacy plain waiting transcript line must not be used for active assistant progress"
  );
  assert(
    /\.message\.assistant\.tui-progress/.test(stylesSource)
      && /font-family:\s*ui-monospace/.test(stylesSource)
      && /background:\s*#10211d/.test(stylesSource),
    "assistant TUI progress rows must have terminal-like styling"
  );
  const answerContentBlock = cssBlock(".message.assistant .content");
  const answerPromptBlock = cssBlock(".message.assistant:not(.tui-progress) .content::before");
  const tuiProgressContentBlock = cssBlock(".message.assistant.tui-progress .content");
  assert(
    /font:\s*inherit/.test(answerContentBlock)
      && !/font-family:\s*ui-monospace/.test(answerContentBlock)
      && /line-height:\s*1\.65/.test(answerContentBlock),
    "normal assistant answer bodies must use readable UI text typography"
  );
  assert(
    /codex@harnesui:~\$ cat response\.log/.test(answerPromptBlock)
      && /font-family:\s*ui-monospace/.test(answerPromptBlock),
    "normal assistant answer prompt line may stay terminal-like without changing body typography"
  );
  assert(
    /font-family:\s*ui-monospace/.test(tuiProgressContentBlock)
      && /line-height:\s*1\.55/.test(tuiProgressContentBlock),
    "assistant TUI progress content must keep terminal typography"
  );
}

try {
  run();
  console.log("PASS harnesui_tui_progress_chat_test");
} catch (error) {
  console.error(`FAIL harnesui_tui_progress_chat_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
