#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "web", "01.HarnesUI", "app.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(root, "web", "01.HarnesUI", "styles.css"), "utf8");

function cssBlock(selector) {
  const start = stylesSource.lastIndexOf(`${selector} {`);
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
    /Updated Plan/.test(appSource)
      && /└/.test(appSource)
      && /✔/.test(appSource)
      && /□/.test(appSource)
      && !/codex@harnesui:~\$ exec --chat active/.test(appSource),
    "assistant progress content must be Updated Plan output, not a fake terminal prompt"
  );
  assert(
    /function\s+assistantPlanStatusMarkForUi\s*\(/.test(appSource)
      && /function\s+assistantFallbackPlanStepsForUi\s*\(/.test(appSource)
      && /function\s+assistantPlanLineForUi\s*\(/.test(appSource),
    "assistant progress must format CLI-like plan rows as chat return content"
  );
  assert(
    /function\s+assistantFallbackPlanStepsForUi\s*\(phase,\{responseStarted=false,terminalStatus=""\}=\{\}\)/.test(appSource)
      && /responseReady=Boolean\(responseStarted\)/.test(appSource)
      && /finalReady=terminal==="completed"\|\|normalized==="completed"/.test(appSource),
    "assistant fallback plan rows must advance from response-started and terminal progress state"
  );
  assert(
    /const activeDetail=tuiCompactForUi\(phaseInfo\.detail,88\);/.test(appSource)
      && !/event\|\|phaseInfo\.detail/.test(appSource),
    "assistant progress TODO rows must not surface raw internal runtime event text"
  );
  assert(
    /function\s+assistantTuiPulseForUi\s*\(/.test(appSource)
      && /function\s+assistantTuiActivitySummaryForUi\s*\(/.test(appSource)
      && /・動き \$\{assistantTuiPulseForUi\(now\)\} \$\{activityLine\}/.test(appSource),
    "assistant progress must include a visible heartbeat and user-facing activity summary"
  );
  assert(
    /回答待ち",detail:"接続できました。最初の回答本文を待っています"/.test(appSource)
      && /準備中",detail:"依頼を登録し、作業に必要な設定をまとめています"/.test(appSource),
    "assistant progress TODO details must use user-facing Japanese status text"
  );
  assert(
    /messageIsAssistantTuiProgressForUi\(m\)\)messageEl\.classList\.add\("tui-progress"\)/.test(appSource),
    "timeline renderer must mark assistant progress messages for progress styling"
  );
  assert(
    /if\(ev\.type==="plan"\)tuiProgress\.planSteps=Array\.isArray\(ev\.steps\)\?ev\.steps:\[\];[\s\S]*?happly\(c,ev\);[\s\S]*?updateAssistantTuiProgress\("activity"/.test(appSource),
    "plan/update events must feed Updated Plan rows before refreshing the chat return"
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
    /let\s+answerOut=null;/.test(appSource)
      && /const\s+progressOutStillActive=\(\)=>mget\(out\)\.startsWith\(ASSISTANT_TUI_PROGRESS_MARKER\);/.test(appSource)
      && /answerOut=msg\(c\.id,"assistant","Codex",""\);/.test(appSource)
      && /madd\(answerTranscriptOut\(\),ev\.text\)/.test(appSource)
      && /mset\(answerTranscriptOut\(\),typeof ev\.text==="string"\?ev\.text:""\)/.test(appSource),
    "streamed answer text must preserve the TUI progress row and render final text in a separate assistant message"
  );
  assert(
    /function\s+assistantTuiPhaseForUi\s*\(phase\)[\s\S]*?if\(normalized==="answering"\)return\{label:"回答中"/.test(appSource)
      && /const\s+markAssistantTuiResponseStarted=\(event="answer text received"\)=>\{[\s\S]*?tuiProgress\.responseStarted=true;[\s\S]*?updateAssistantTuiProgress\("answering",event,\{force:true\}\);/.test(appSource)
      && /if\(ev\.type==="delta"\)\{[\s\S]*?markAssistantTuiResponseStarted\("answer text is streaming"\);[\s\S]*?madd\(answerTranscriptOut\(\),ev\.text\);/.test(appSource)
      && /if\(ev\.type==="final"\)\{[\s\S]*?finishAssistantTuiProgress\("completed","final answer received","completed"\);/.test(appSource)
      && /markAssistantTuiResponseStarted\("plain text response received"\);madd\(answerTranscriptOut\(\),line\.endsWith\("\\n"\)\?line:`\$\{line\}\\n`\)/.test(appSource),
    "assistant progress must keep updating after the first answer text and only finish at terminal state"
  );
  assert(
    !/mget\(out\)\.startsWith\(ASSISTANT_TUI_PROGRESS_MARKER\)\)mset\(out,""\);stopAssistantTuiProgress\(\);madd\(out,ev\.text\)/.test(appSource),
    "streamed answer text must not clear the TUI progress row"
  );
  assert(
    !/if\(ev\.type==="delta"\)\{[\s\S]*?stopAssistantTuiProgress\(\);[\s\S]*?madd\(answerTranscriptOut\(\),ev\.text\)/.test(appSource),
    "streamed delta text must not stop the progress timer"
  );
  assert(
    !/\[waiting\] Standard Codex/.test(appSource),
    "legacy plain waiting transcript line must not be used for active assistant progress"
  );
  const answerContentBlock = cssBlock(".message.assistant .content");
  const answerPromptBlock = cssBlock(".message.assistant:not(.tui-progress) .content::before");
  const tuiProgressContentBlock = cssBlock(".message.assistant.tui-progress .content");
  const assistantBlock = cssBlock(".message.assistant");
  const tuiProgressBlock = cssBlock(".message.assistant.tui-progress");
  const chatItemLineBlock = cssBlock(".chat-item-line");
  const chatItemStatusBlock = cssBlock(".chat-item-status");
  const sidePanelBlock = cssBlock(".side-panel");
  assert(
    /font:\s*inherit/.test(answerContentBlock)
      && !/font-family:\s*ui-monospace/.test(answerContentBlock)
      && /line-height:\s*1\.65/.test(answerContentBlock),
    "normal assistant answer bodies must use readable UI text typography"
  );
  assert(
    /content:\s*none/.test(answerPromptBlock)
      && !/codex@harnesui:~\$ cat response\.log/.test(answerPromptBlock),
    "normal assistant answers must not show a fake terminal prompt"
  );
  assert(
    /font:\s*inherit/.test(tuiProgressContentBlock)
      && !/font-family:\s*ui-monospace/.test(tuiProgressContentBlock)
      && /line-height:\s*1\.65/.test(tuiProgressContentBlock),
    "assistant Updated Plan rows must keep normal UI typography"
  );
  assert(
    !/background:\s*#10211d/.test(assistantBlock)
      && !/background:\s*#10211d/.test(tuiProgressBlock),
    "assistant rows must not use dark terminal panel colors"
  );
  assert(
    /display:\s*grid/.test(chatItemLineBlock)
      && /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/.test(chatItemLineBlock),
    "chat list rows must reserve status text without vertical wrapping"
  );
  assert(
    /white-space:\s*nowrap/.test(chatItemStatusBlock)
      && /text-overflow:\s*ellipsis/.test(chatItemStatusBlock),
    "chat status labels must stay one-line and clipped cleanly"
  );
  assert(
    !/#263531/.test(sidePanelBlock)
      && !/#1e2b29/.test(sidePanelBlock),
    "side panel must not inherit the dark terminal palette"
  );
}

try {
  run();
  console.log("PASS harnesui_tui_progress_chat_test");
} catch (error) {
  console.error(`FAIL harnesui_tui_progress_chat_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
