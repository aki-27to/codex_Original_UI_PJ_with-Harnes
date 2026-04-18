"use strict";

const fs=require("fs");
const os=require("os");
const path=require("path");
const crypto=require("crypto");
const {spawn}=require("child_process");
const {buildCmdInvocation}=require("./process_invocation");

const replySchema=Object.freeze({
  type:"object",
  additionalProperties:false,
  required:["reply"],
  properties:{
    reply:{type:"string"},
  },
});

function safeString(value,max=12000){
  if(typeof value!=="string")return"";
  const trimmed=value.trim();
  if(!trimmed)return"";
  return trimmed.slice(0,max);
}

function resolveWindowsCodexInvocation(){
  const appData=process.env.APPDATA||"";
  if(!appData)return null;
  const cmdPath=path.join(appData,"npm","codex.cmd");
  if(!fs.existsSync(cmdPath))return null;
  try{
    const source=fs.readFileSync(cmdPath,"utf8");
    const rootMatch=source.match(/SET\s+"CODEX_ROOT=([^"\r\n]+)"/i);
    const jsMatch=source.match(/"([^"\r\n]+node_modules\\@openai\\codex\\bin\\codex\.js)"/i);
    const codexRoot=rootMatch?rootMatch[1]:"";
    const codexJsPath=jsMatch?jsMatch[1]:"";
    const nodeExePath=codexRoot?path.join(codexRoot,"node.exe"):"";
    if(!codexJsPath||!fs.existsSync(codexJsPath))return null;
    return{
      command:nodeExePath&&fs.existsSync(nodeExePath)?nodeExePath:"node",
      argsPrefix:[codexJsPath],
    };
  }catch{
    return null;
  }
}

function resolveCodexInvocation(){
  if(process.platform==="win32"){
    const windowsInvocation=resolveWindowsCodexInvocation();
    if(windowsInvocation)return windowsInvocation;
  }
  return{
    command:"codex",
    argsPrefix:[],
  };
}

function buildSpawnTargetFromInvocation(invocation,args,cwd,stdio=["pipe","pipe","pipe"]){
  const normalizedArgs=Array.isArray(args)?args.map((entry)=>String(entry)):[];
  if(
    process.platform==="win32"
    && invocation
    && invocation.command==="codex"
    && (!Array.isArray(invocation.argsPrefix)||!invocation.argsPrefix.length)
  ){
    const cmdInvocation=buildCmdInvocation("codex.cmd",normalizedArgs);
    return{
      command:cmdInvocation.command,
      args:cmdInvocation.args,
      options:{cwd,stdio,windowsHide:true},
    };
  }
  return{
    command:invocation.command,
    args:[...(Array.isArray(invocation.argsPrefix)?invocation.argsPrefix:[]),...normalizedArgs],
    options:{cwd,stdio,windowsHide:true},
  };
}

function resolveCodexAppServerSpawnTarget({
  cwd,
  stdio=["pipe","pipe","pipe"],
  reasoningEffortConfig="",
}={}){
  const invocation=resolveCodexInvocation();
  const args=[];
  if(reasoningEffortConfig&&process.platform!=="win32"){
    args.push("-c",safeString(reasoningEffortConfig,160));
  }
  args.push("app-server");
  return buildSpawnTargetFromInvocation(invocation,args,cwd,stdio);
}

async function assertCodexReady(cwd){
  const invocation=resolveCodexInvocation();
  return new Promise((resolve,reject)=>{
    const child=spawn(invocation.command,[...invocation.argsPrefix,"--version"],{
      cwd,
      stdio:["ignore","pipe","pipe"],
      windowsHide:true,
    });
    let stderr="";
    child.stderr.on("data",(chunk)=>{
      stderr=`${stderr}${String(chunk)}`.slice(-2000);
    });
    child.on("error",reject);
    child.on("close",(exitCode)=>{
      if(exitCode===0){
        resolve(true);
        return;
      }
      reject(new Error(safeString(stderr,240)||"codex command is unavailable"));
    });
  });
}

async function runCodexStructuredOutput({
  cwd,
  prompt,
  outputSchema,
  model,
  timeoutMs=180000,
  sandboxMode="read-only",
}){
  const invocation=resolveCodexInvocation();
  const schemaFilePath=path.join(os.tmpdir(),`harness-app-schema-${crypto.randomUUID()}.json`);
  const outputFilePath=path.join(os.tmpdir(),`harness-app-output-${crypto.randomUUID()}.json`);
  fs.writeFileSync(schemaFilePath,JSON.stringify(outputSchema,null,2),"utf8");
  const args=[
    ...invocation.argsPrefix,
    "exec",
    "-C",
    cwd,
    "--skip-git-repo-check",
    "--sandbox",
    safeString(sandboxMode,40)||"read-only",
    "--color",
    "never",
    "--ephemeral",
    "--output-schema",
    schemaFilePath,
    "-o",
    outputFilePath,
  ];
  const normalizedModel=safeString(model,120);
  if(normalizedModel){
    args.push("-m",normalizedModel);
  }

  return new Promise((resolve,reject)=>{
    const child=spawn(invocation.command,args,{
      cwd,
      stdio:["pipe","pipe","pipe"],
      windowsHide:true,
    });
    let stdout="";
    let stderr="";
    let settled=false;
    const finish=async(error,value)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timeoutId);
      await fs.promises.unlink(schemaFilePath).catch(()=>{});
      await fs.promises.unlink(outputFilePath).catch(()=>{});
      if(error){
        reject(error);
        return;
      }
      resolve(value);
    };
    const timeoutId=setTimeout(()=>{
      child.kill();
      finish(new Error(`codex exec timed out after ${timeoutMs}ms`));
    },Math.max(5000,Math.min(300000,Math.trunc(Number(timeoutMs)||180000))));

    child.stdout.on("data",(chunk)=>{
      stdout=`${stdout}${String(chunk)}`.slice(-12000);
    });
    child.stderr.on("data",(chunk)=>{
      stderr=`${stderr}${String(chunk)}`.slice(-12000);
    });
    child.on("error",(error)=>{
      finish(error);
    });
    child.on("close",async(exitCode)=>{
      if(settled)return;
      try{
        const raw=await fs.promises.readFile(outputFilePath,"utf8");
        const parsed=JSON.parse(raw);
        if(exitCode!==0){
          const wrappedError=new Error(safeString(stderr||stdout,400)||`codex exec failed with exit code ${exitCode}`);
          wrappedError.statusCode=502;
          await finish(wrappedError);
          return;
        }
        await finish(null,parsed);
      }catch(error){
        const wrappedError=new Error(
          safeString(`${error&&error.message?error.message:String(error)} ${stderr||stdout}`,420)||"codex exec failed"
        );
        wrappedError.statusCode=502;
        await finish(wrappedError);
      }
    });
    try{
      child.stdin.write(prompt,"utf8");
      child.stdin.end();
    }catch(error){
      finish(error);
    }
  });
}

async function runCodexReply({
  cwd,
  prompt,
  model,
  timeoutMs=180000,
  sandboxMode="read-only",
}){
  const parsed=await runCodexStructuredOutput({
    cwd,
    prompt,
    outputSchema:replySchema,
    model,
    timeoutMs,
    sandboxMode,
  });
  const reply=safeString(parsed&&parsed.reply,24000);
  if(!reply){
    const error=new Error("codex exec returned an empty reply");
    error.statusCode=502;
    throw error;
  }
  return reply;
}

module.exports={
  assertCodexReady,
  replySchema,
  resolveCodexAppServerSpawnTarget,
  resolveCodexInvocation,
  runCodexReply,
  runCodexStructuredOutput,
};
