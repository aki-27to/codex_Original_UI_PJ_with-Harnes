#!/usr/bin/env node
"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

function loadShouldRenderTerminalErrorInTranscript(){
  const source=fs.readFileSync(path.join(__dirname,"..","web","01.HarnesUI","app.js"),"utf8");
  const match=source.match(/function shouldRenderTerminalErrorInTranscript\(text,\{finalApplied=false\}=\{\}\)\{[\s\S]*?\n\}/);
  assert(match&&match[0],"shouldRenderTerminalErrorInTranscript helper not found in app.js");
  const context={};
  vm.runInNewContext(`${match[0]}; this.__helper__=shouldRenderTerminalErrorInTranscript;`,context);
  return context.__helper__;
}

function run(){
  const helper=loadShouldRenderTerminalErrorInTranscript();
  assert.strictEqual(helper("",{}),false,"empty terminal errors should not render");
  assert.strictEqual(helper("[error] runtime failure",{finalApplied:false}),true,"pre-final terminal errors should still render");
  assert.strictEqual(helper("[needs_input] waiting on user input; reply with the missing information, approval, or decision to continue",{finalApplied:true}),false,"post-final internal terminal errors should stay out of the transcript");
  console.log("[harnesui-terminal-error-surface-test] PASS");
  console.log("PASS");
}

try{
  run();
}catch(error){
  console.log(`[harnesui-terminal-error-surface-test] FAIL ${error instanceof Error?error.message:String(error)}`);
  console.log("FAIL");
  process.exitCode=1;
}
