const PROFILES=Object.freeze({
  auto:{approvalPolicy:"on-request",sandboxMode:"workspace-write",webSearchMode:"cached",automaticApprovalReviewEnabled:false},
  "read-only":{approvalPolicy:"on-request",sandboxMode:"read-only",webSearchMode:"cached",automaticApprovalReviewEnabled:false},
  guardian:{approvalPolicy:"on-request",sandboxMode:"workspace-write",webSearchMode:"cached",automaticApprovalReviewEnabled:true},
  "full-access":{approvalPolicy:"never",sandboxMode:"danger-full-access",webSearchMode:"live",automaticApprovalReviewEnabled:false},
});
const DEFAULT_PROFILE_ID="full-access";
const PROFILE_IDS=new Set(Object.keys(PROFILES));
const PROFILE_LABELS=Object.freeze({
  auto:"Agent (Auto)",
  "read-only":"Chat (Read Only)",
  guardian:"Guardian Approvals",
  "full-access":"Agent (Full Access)",
  custom:"Custom (config.toml)",
});
const LEGACY_PROFILE_ALIASES=Object.freeze({
  safe:"read-only",
  balanced:"auto",
  "full-auto":"auto",
  agent:"auto",
  chat:"read-only",
  guardian:"guardian",
  "guardian-approvals":"guardian",
  power:"full-access",
});
const ALLOWED_APPROVAL_POLICIES=new Set(["untrusted","on-request","never"]);
const ALLOWED_SANDBOX_MODES=new Set(["read-only","workspace-write","danger-full-access"]);
const ALLOWED_WEB_SEARCH_MODES=new Set(["disabled","cached","live"]);
const COMMANDS=[];
const DEFAULT_AGENT_NAME="default";
const DEFAULT_EXEC_MODEL="gpt-5.4";
const DEFAULT_EXEC_MODEL_REASONING_EFFORT="xhigh";
const EXEC_MODEL_PRESET_OPTIONS=["gpt-5.4","gpt-5.4-mini","gpt-5.3-codex"];
const EXEC_MODEL_REASONING_EFFORTS=["minimal","low","medium","high","xhigh"];
const LEGACY_EXEC_MODEL_ALIASES=Object.freeze({"codex-5.3":"gpt-5.3-codex"});
const SETTINGS_KEY="codex-console-settings-v3";
const SETTINGS_KEY_LEGACY="codex-console-settings-v2";
const CHAT_STATE_KEY="codex-console-chat-v1";
const CHAT_STATE_VERSION=1;
const CHAT_MESSAGE_LIMIT=240;
const HARNESS_CHECK_MODE_KEY="codex-harness-check-mode-v2";
const HARNESS_CHECK_MODE_KEY_LEGACY="codex-harness-check-mode-v1";
const HARNESS_CHECK_MODES={ADAPTIVE:"adaptive",STRICT:"strict",RELAXED:"relaxed"};
const HARNESS_CHECK_DEFAULT_MODE=HARNESS_CHECK_MODES.ADAPTIVE;
const EXEC_STREAM_CONTENT_TYPE="application/x-ndjson";
const EXEC_IDEMPOTENCY_HEADER="Idempotency-Key";
const EXEC_SUBMIT_RETRY_DELAYS_MS=Object.freeze([1200,2400]);
const EXEC_STREAM_RECOVERY_POLL_MS=1500;
const EXEC_STREAM_RECOVERY_RUNTIME_WAIT_MS=12000;
const EXEC_STREAM_RECOVERY_STATUS_WAIT_MS=2000;
const EXEC_STREAM_RECOVERY_MAX_POLLS=6;
const RUNTIME_PENDING_SYNC_MS=5000;
const COMPOSER_STICKY_MIN_VIEWPORT_HEIGHT=640;
const UI_RELOAD_CACHE_PARAM="ui_reload";
const s={runtime:null,diag:null,diagErr:null,chats:[],active:null,nextChat:1,nextMsg:1,req:new Map(),trace:[],last:null,ticker:null,perf:createPerformanceState()};
const workspaceGuardUiState={message:"",tone:""};
const chatStateSave={timer:null};
const settingsState={
  hasStoredModel:false,
  hasStoredModelReasoningEffort:false,
  hasStoredFastMode:false,
  hasStoredAutomaticApprovalReview:false,
  hasStoredExecutionProfile:false,
  hasStoredWebSearchMode:false,
  hasStoredPermissionDetail:false,
};
const harnessCheckState={mode:HARNESS_CHECK_DEFAULT_MODE};
const TOPOGRAPHY_REFRESH_MS=10000;
const HIDDEN_AGENT_NAMES=new Set(["main"]);
const PARENT_AGENT_NAMES=new Set(["default","intake","release_manager"]);
const VERIFICATION_AGENT_NAMES=new Set(["explorer","reviewer","tester"]);
const AGENT_KANBAN_LANES=Object.freeze([
  {id:"running",label:"稼働中",empty:"今このチャットで動いている agent はありません。"},
  {id:"parents",label:"親",empty:"親 agent はありません。"},
  {id:"specialists",label:"専門",empty:"専門 agent はありません。"},
  {id:"verification",label:"検証",empty:"検証系 agent はありません。"},
]);
const TASK_FAMILY_LABELS=Object.freeze({
  web_creative:"WEB制作",
  deterministic_code:"実装・修正",
  research:"調査",
  planning:"設計・整理",
});
const OPERATOR_AGENT_LABELS=Object.freeze({
  default:"Codex",
  intake:"要件プランナー",
  release_manager:"リリース判定",
  frontend_worker:"UI実装",
  backend_worker:"サーバ実装",
  infra_worker:"環境・運用",
  tester:"テスト",
  reviewer:"レビュー",
  explorer:"調査",
});
const topographyState={agents:[],source:"",error:"",usingFallback:false,lastUpdated:0,loading:false,timer:null,refreshSoonTimer:null,reqId:0};
const e={connectionState:by("connectionState"),modeState:by("modeState"),agentState:by("agentState"),pendingState:by("pendingState"),simpleViewToggle:by("simpleViewToggle"),uiReloadBtn:by("uiReloadBtn"),runtimeAgent:by("runtimeAgent"),runtimeSession:by("runtimeSession"),runtimeExperimental:by("runtimeExperimental"),runtimeAgentCount:by("runtimeAgentCount"),workspacePath:by("workspacePath"),workspaceLockBtn:by("workspaceLockBtn"),workspaceUnlockBtn:by("workspaceUnlockBtn"),workspaceStatus:by("workspaceStatus"),modelName:by("modelName"),modelReasoningEffort:by("modelReasoningEffort"),executionProfileHeadline:by("executionProfileHeadline"),executionProfileDescription:by("executionProfileDescription"),executionProfileApprovalChip:by("executionProfileApprovalChip"),executionProfileSandboxChip:by("executionProfileSandboxChip"),executionProfileSearchChip:by("executionProfileSearchChip"),executionProfileGuardianChip:by("executionProfileGuardianChip"),approvalPolicy:by("approvalPolicy"),fastModeEnabled:by("fastModeEnabled"),automaticApprovalReviewEnabled:by("automaticApprovalReviewEnabled"),sandboxMode:by("sandboxMode"),executionProfile:by("executionProfile"),permissionsAdvanced:by("permissionsAdvanced"),permissionsAdvancedHint:by("permissionsAdvancedHint"),uiVisibility:by("uiVisibility"),webSearchMode:by("webSearchMode"),commandFilter:by("commandFilter"),commandGrid:by("commandGrid"),commandTemplate:by("commandTemplate"),messageTemplate:by("messageTemplate"),chatList:by("chatList"),newChatBtn:by("newChatBtn"),deleteChatBtn:by("deleteChatBtn"),timeline:by("timeline"),promptInput:by("promptInput"),imageInput:by("imageInput"),imageAttachBtn:by("imageAttachBtn"),imageError:by("imageError"),imagePreview:by("imagePreview"),imagePreviewThumb:by("imagePreviewThumb"),imagePreviewName:by("imagePreviewName"),imagePreviewMeta:by("imagePreviewMeta"),imageRemoveBtn:by("imageRemoveBtn"),sendBtn:by("sendBtn"),stopBtn:by("stopBtn"),reconnectBtn:by("reconnectBtn"),refreshDiagBtn:by("refreshDiagBtn"),newThreadBtn:by("newThreadBtn"),openCmdBtn:by("openCmdBtn"),liveStatus:by("liveStatus"),liveStatusLabel:by("liveStatusLabel"),liveStatusElapsed:by("liveStatusElapsed"),liveStatusDetail:by("liveStatusDetail"),performancePanel:by("performancePanel"),perfSessionRef:by("perfSessionRef"),perfUpdatedAt:by("perfUpdatedAt"),perfTokenValue:by("perfTokenValue"),perfTokenDetail:by("perfTokenDetail"),perfTokenSpark:by("perfTokenSpark"),perfTimeValue:by("perfTimeValue"),perfTimeDetail:by("perfTimeDetail"),perfTimeSpark:by("perfTimeSpark"),agentInspector:by("agentInspector"),agentFlowLane:by("agentFlowLane"),agentTraceList:by("agentTraceList"),clearAgentTraceBtn:by("clearAgentTraceBtn"),agentTopographyPanel:by("agentTopographyPanel"),agentTopographyMeta:by("agentTopographyMeta"),agentTopographyList:by("agentTopographyList"),agentTopographyRefreshBtn:by("agentTopographyRefreshBtn"),diagCodexState:by("diagCodexState"),diagCodexDetail:by("diagCodexDetail"),diagNodeState:by("diagNodeState"),diagNodeDetail:by("diagNodeDetail"),diagSearchState:by("diagSearchState"),diagSearchDetail:by("diagSearchDetail"),diagSummaryText:by("diagSummaryText"),diagDetails:by("diagDetails"),diagDetailsSummary:by("diagDetailsSummary"),harnessStatus:by("harnessStatus"),harnessThreadId:by("harnessThreadId"),harnessTurnId:by("harnessTurnId"),harnessUpdatedAt:by("harnessUpdatedAt"),harnessItemList:by("harnessItemList"),harnessPlanMeta:by("harnessPlanMeta"),harnessPlanCurrentCard:by("harnessPlanCurrentCard"),harnessPlanCurrentStep:by("harnessPlanCurrentStep"),harnessPlanCurrentPurpose:by("harnessPlanCurrentPurpose"),harnessPlanCurrentDetail:by("harnessPlanCurrentDetail"),harnessPlanExplanation:by("harnessPlanExplanation"),harnessPlanList:by("harnessPlanList"),harnessTokenUsage:by("harnessTokenUsage"),harnessDiffPreview:by("harnessDiffPreview"),harnessPhaseList:by("harnessPhaseList"),harnessEvidenceTasks:by("harnessEvidenceTasks"),harnessEvidenceTests:by("harnessEvidenceTests"),harnessEvidenceReviews:by("harnessEvidenceReviews"),harnessEvidenceLogs:by("harnessEvidenceLogs")};
e.harnessCheckMode=by("harnessCheckMode");
e.harnessCheckModeHint=by("harnessCheckModeHint");
e.focusActionDetail=by("focusActionDetail");
e.focusActionTitle=by("focusActionTitle");
e.focusActionHint=by("focusActionHint");
e.focusChatCard=by("focusChatCard");
e.focusChatValue=by("focusChatValue");
e.focusChatHint=by("focusChatHint");
e.focusWorkspaceCard=by("focusWorkspaceCard");
e.focusWorkspaceValue=by("focusWorkspaceValue");
e.focusWorkspaceHint=by("focusWorkspaceHint");
e.focusSendCard=by("focusSendCard");
e.focusSendValue=by("focusSendValue");
e.focusSendHint=by("focusSendHint");
e.missionDraftStatus=by("missionDraftStatus");
e.missionGoalValue=by("missionGoalValue");
e.missionScopeValue=by("missionScopeValue");
e.missionConstraintValue=by("missionConstraintValue");
e.missionDoneValue=by("missionDoneValue");
e.focusToTimelineBtn=by("focusToTimelineBtn");
e.focusToComposerBtn=by("focusToComposerBtn");
e.jumpToComposerBtn=by("jumpToComposerBtn");
e.conversationSummary=by("conversationSummary");
e.composer=by("composer");
e.composerModeChip=by("composerModeChip");
e.composerModelChip=by("composerModelChip");
e.composerWorkspaceChip=by("composerWorkspaceChip");
e.composerAttachmentChip=by("composerAttachmentChip");
e.opsDeck=by("opsDeck");
const automationUi={
  panel:by("automationPanel"),
  status:by("automationStatusLine"),
  batchMode:by("automationBatchMode"),
  batchPrompt:by("automationBatchPrompt"),
  batchRunBtn:by("automationBatchRunBtn"),
  schedulerEnabled:by("automationSchedulerEnabled"),
  schedulerInterval:by("automationSchedulerInterval"),
  schedulerMeta:by("automationSchedulerMeta"),
  history:by("automationBatchHistory"),
};
const AUTOMATION_STATUS_POLL_MS=15000;
const AUTOMATION_SCHEDULER_SYNC_DEBOUNCE_MS=400;
const automationState={
  loading:false,
  running:false,
  schedulerUpdating:false,
  timer:null,
  schedulerApplyTimer:null,
  schedulerDesired:null,
  lastError:"",
  status:null,
};
const runtimePendingSyncState={
  timer:null,
  inFlight:false,
};
const notificationAudioState={
  ctx:null,
  unlocked:false,
  unlockBound:false,
  lastPlayAt:0,
};
function by(id){return document.getElementById(id)}
function shouldUseStickyComposerForUi(viewportHeight=window.innerHeight){
  void viewportHeight;
  return false;
}
function buildUiReloadUrlForUi(currentHref=window.location.href,timestamp=Date.now()){
  const fallbackOrigin=window.location&&window.location.origin?window.location.origin:window.location.href;
  const url=new URL(currentHref,fallbackOrigin);
  const normalizedTimestamp=Math.max(0,Math.trunc(Number(timestamp)||Date.now()));
  url.searchParams.set(UI_RELOAD_CACHE_PARAM,String(normalizedTimestamp));
  return url.toString();
}
function reloadUiShellForUi(){
  window.location.replace(buildUiReloadUrlForUi());
}
function syncComposerViewportSpacingForUi(){
  if(typeof document==="undefined"||!document.documentElement)return 0;
  if(document.body&&document.body.classList){
    if(typeof document.body.classList.add==="function")document.body.classList.add("composer-static");
    else document.body.classList.toggle("composer-static",true);
  }
  document.documentElement.style.setProperty("--composer-block-size","0px");
  return 0;
}
function scheduleComposerViewportSyncForUi(){
  if(composerLayoutState.viewportSyncFrame)return;
  const flush=()=>{
    composerLayoutState.viewportSyncFrame=0;
    syncComposerViewportSpacingForUi();
  };
  if(typeof window!=="undefined"&&typeof window.requestAnimationFrame==="function"){
    composerLayoutState.viewportSyncFrame=window.requestAnimationFrame(flush);
    return;
  }
  flush();
}
function createNotificationAudioContext(){
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  if(typeof AudioCtx!=="function")return null;
  try{
    return new AudioCtx();
  }catch{
    return null;
  }
}
async function ensureNotificationAudioReady(){
  if(!notificationAudioState.ctx)notificationAudioState.ctx=createNotificationAudioContext();
  const ctx=notificationAudioState.ctx;
  if(!ctx)return null;
  if(ctx.state==="suspended"){
    try{
      await ctx.resume();
    }catch{
    }
  }
  notificationAudioState.unlocked=ctx.state==="running";
  return notificationAudioState.unlocked?ctx:null;
}
function notificationToneSequence(kind){
  if(kind==="failed"||kind==="aborted"){
    return[
      {freq:440,duration:0.08,delay:0,gain:0.018},
      {freq:330,duration:0.14,delay:0.1,gain:0.024},
    ];
  }
  return[
    {freq:659.25,duration:0.08,delay:0,gain:0.015},
    {freq:880,duration:0.14,delay:0.11,gain:0.02},
  ];
}
async function playNotificationTone(kind="completed"){
  const ctx=await ensureNotificationAudioReady();
  if(!ctx)return false;
  const nowMs=Date.now();
  if(nowMs-notificationAudioState.lastPlayAt<250)return false;
  notificationAudioState.lastPlayAt=nowMs;
  const startAt=ctx.currentTime+0.02;
  notificationToneSequence(kind).forEach((tone)=>{
    const oscillator=ctx.createOscillator();
    const gainNode=ctx.createGain();
    const toneStart=startAt+tone.delay;
    const tonePeak=toneStart+0.02;
    const toneEnd=toneStart+tone.duration;
    oscillator.type="sine";
    oscillator.frequency.setValueAtTime(tone.freq,toneStart);
    gainNode.gain.setValueAtTime(0.0001,toneStart);
    gainNode.gain.linearRampToValueAtTime(tone.gain,tonePeak);
    gainNode.gain.exponentialRampToValueAtTime(0.0001,toneEnd);
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(toneStart);
    oscillator.stop(toneEnd+0.02);
    oscillator.onended=()=>{
      oscillator.disconnect();
      gainNode.disconnect();
    };
  });
  return true;
}
function bindNotificationAudioUnlock(){
  if(notificationAudioState.unlockBound)return;
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  if(typeof AudioCtx!=="function")return;
  const unlock=()=>{void ensureNotificationAudioReady();};
  ["pointerdown","keydown","touchstart"].forEach((eventName)=>{
    document.addEventListener(eventName,unlock,{passive:true});
  });
  notificationAudioState.unlockBound=true;
}
function normalizeHarnessCheckMode(value){
  const normalized=typeof value==="string"?value.trim().toLowerCase():"";
  if(normalized===HARNESS_CHECK_MODES.STRICT||normalized===HARNESS_CHECK_MODES.RELAXED||normalized===HARNESS_CHECK_MODES.ADAPTIVE)return normalized;
  return HARNESS_CHECK_DEFAULT_MODE;
}
function activeHarnessCheckMode(){
  return normalizeHarnessCheckMode(harnessCheckState.mode);
}
function applyHarnessCheckModeUi(){
  const mode=activeHarnessCheckMode();
  if(e.harnessCheckMode)e.harnessCheckMode.value=mode;
  if(e.harnessCheckModeHint){
    if(mode===HARNESS_CHECK_MODES.STRICT){
      e.harnessCheckModeHint.textContent="厳密: 明示 plan がない実行は強く警告します。";
    }else if(mode===HARNESS_CHECK_MODES.RELAXED){
      e.harnessCheckModeHint.textContent="緩和: ストリームから段階を推定しますが、表示する計画は明示 plan のみです。";
    }else{
      e.harnessCheckModeHint.textContent="自動: 軽い依頼では小さな推定 plan を許しますが、表示する計画は明示 plan を優先します。";
    }
  }
}
function saveHarnessCheckMode(){
  try{
    localStorage.setItem(HARNESS_CHECK_MODE_KEY,activeHarnessCheckMode());
  }catch{
  }
}
function loadHarnessCheckMode(){
  try{
    const storedModeRaw=localStorage.getItem(HARNESS_CHECK_MODE_KEY);
    if(typeof storedModeRaw==="string"&&storedModeRaw.trim()){
      harnessCheckState.mode=normalizeHarnessCheckMode(storedModeRaw);
    }else{
      const legacyRaw=localStorage.getItem(HARNESS_CHECK_MODE_KEY_LEGACY);
      const legacyMode=normalizeHarnessCheckMode(legacyRaw||"");
      harnessCheckState.mode=legacyMode===HARNESS_CHECK_MODES.RELAXED?HARNESS_CHECK_MODES.RELAXED:HARNESS_CHECK_DEFAULT_MODE;
      saveHarnessCheckMode();
    }
  }catch{
    harnessCheckState.mode=HARNESS_CHECK_DEFAULT_MODE;
  }
  applyHarnessCheckModeUi();
}
function normalizeAgentNameForUi(name){return typeof name==="string"?name.trim().toLowerCase():"";}
function isHiddenAgentForUi(name){return HIDDEN_AGENT_NAMES.has(normalizeAgentNameForUi(name));}
function canonicalParentAgentNameForUi(name){
  const normalized=normalizeAgentNameForUi(name);
  if(!normalized)return"";
  if(PARENT_AGENT_NAMES.has(normalized))return normalized;
  const scopeSep=normalized.indexOf("@");
  if(scopeSep>0){
    const base=normalized.slice(0,scopeSep);
    if(PARENT_AGENT_NAMES.has(base))return base;
  }
  return normalized;
}
function agentScopeFromNameForUi(name){
  const normalized=normalizeAgentNameForUi(name);
  if(!normalized)return"";
  const scopeSep=normalized.indexOf("@");
  if(scopeSep<=0||scopeSep>=normalized.length-1)return"";
  return normalized.slice(scopeSep+1);
}
function displayAgentNameForUi(name,{includeScope=false}={}){
  const normalized=normalizeAgentNameForUi(name);
  if(!normalized)return DEFAULT_AGENT_NAME;
  if(isLegacyRoomAgentNameForUi(normalized)){
    const legacyScope=chatScopeFromAgentNameForUi(normalized);
    if(includeScope&&legacyScope)return`${DEFAULT_AGENT_NAME} (${legacyScope})`;
    return DEFAULT_AGENT_NAME;
  }
  const canonical=canonicalParentAgentNameForUi(normalized);
  if(canonical===DEFAULT_AGENT_NAME){
    if(includeScope){
      const scope=agentScopeFromNameForUi(normalized);
      if(scope)return`${DEFAULT_AGENT_NAME} (${scope})`;
    }
    return DEFAULT_AGENT_NAME;
  }
  return normalized;
}
function operatorFacingAgentLabelForUi(name){
  const canonical=canonicalParentAgentNameForUi(name);
  if(!canonical||canonical===DEFAULT_AGENT_NAME)return OPERATOR_AGENT_LABELS.default;
  return OPERATOR_AGENT_LABELS[canonical]||displayAgentNameForUi(canonical);
}
function isLegacyRoomAgentNameForUi(name){
  return normalizeAgentNameForUi(name).startsWith("room-");
}
function chatScopeFromAgentNameForUi(name){
  const normalized=normalizeAgentNameForUi(name);
  if(!normalized)return"";
  if(normalized.startsWith("room-chat-"))return normalized.slice("room-".length);
  const scope=agentScopeFromNameForUi(normalized);
  if(scope.startsWith("chat-"))return scope;
  return"";
}
function trackedChatScopesForUi(){
  const scopes=new Set();
  toArr(s.chats).forEach((chatRecord)=>{
    if(!chatRecord||typeof chatRecord!=="object")return;
    const agentName=normalizeScopedChatAgentNameForUi(chatRecord.agent,chatRecord.id||"");
    const scope=chatScopeFromAgentNameForUi(agentName);
    if(scope)scopes.add(scope);
  });
  return scopes;
}
function trackedChatIdsForUi(){
  const ids=new Set();
  toArr(s.chats).forEach((chatRecord)=>{
    const id=chatRecord&&typeof chatRecord.id==="string"?chatRecord.id.trim():"";
    if(id)ids.add(id);
  });
  return ids;
}
function shouldRenderMonitorAgentNameForUi(name,{trackedChatScopes=null}={}){
  const normalized=normalizeAgentNameForUi(name);
  if(!normalized||isHiddenAgentForUi(normalized))return false;
  const chatScope=chatScopeFromAgentNameForUi(normalized);
  if(!chatScope)return true;
  const scopes=trackedChatScopes instanceof Set?trackedChatScopes:trackedChatScopesForUi();
  return scopes.has(chatScope);
}
function addMonitorAgentMatchNamesForUi(target,name){
  if(!(target instanceof Set))return target;
  const normalized=normalizeAgentNameForUi(name);
  if(!normalized||isHiddenAgentForUi(normalized))return target;
  target.add(normalized);
  const canonical=canonicalParentAgentNameForUi(normalized);
  if(canonical)target.add(canonical);
  return target;
}
function monitorAgentMatchesForUi(name,matchNames){
  if(!(matchNames instanceof Set)||!matchNames.size)return false;
  const normalized=normalizeAgentNameForUi(name);
  if(!normalized||isHiddenAgentForUi(normalized))return false;
  if(matchNames.has(normalized))return true;
  if(chatScopeFromAgentNameForUi(normalized))return false;
  const canonical=canonicalParentAgentNameForUi(normalized);
  return Boolean(canonical&&matchNames.has(canonical));
}
function resolveMonitorAgentNameForUi(name,baseByName){
  const normalized=normalizeAgentNameForUi(name);
  if(!normalized)return"";
  if(baseByName instanceof Map){
    if(baseByName.has(normalized))return normalized;
    const scopedChat=chatScopeFromAgentNameForUi(normalized);
    const canonical=canonicalParentAgentNameForUi(normalized);
    if(scopedChat&&canonical&&baseByName.has(canonical))return canonical;
  }
  return normalized;
}
function activeChatTraceRowsForUi(chatId){
  const targetId=typeof chatId==="string"?chatId.trim():"";
  if(!targetId)return[];
  return s.trace.filter((item)=>item&&item.cid===targetId);
}
function activeChatPendingRowsForUi(chatId){
  const targetId=typeof chatId==="string"?chatId.trim():"";
  if(!targetId)return[];
  return[...s.req.values()].filter((item)=>item&&item.cid===targetId);
}
function addMonitorAgentMatchNamesFromTextForUi(target,text){
  if(!(target instanceof Set))return target;
  const source=typeof text==="string"?text:"";
  if(!source)return target;
  const matches=source.match(/\bchild=([a-z0-9._@-]+)/ig)||[];
  matches.forEach((entry)=>{
    const parts=entry.split("=");
    addMonitorAgentMatchNamesForUi(target,parts.length>1?parts[1]:"");
  });
  return target;
}
function activeChatTopographyContextForUi(rows){
  const currentChat=active();
  const currentChatId=currentChat&&typeof currentChat.id==="string"?currentChat.id.trim():"";
  const currentAgent=normalizeAgentNameForUi(currentChat&&currentChat.agent?currentChat.agent:"");
  const currentThreadId=currentChat&&currentChat.h&&typeof currentChat.h.thread==="string"?currentChat.h.thread.trim():"";
  const currentTurnId=currentChat&&currentChat.h&&typeof currentChat.h.turn==="string"?currentChat.h.turn.trim():"";
  const traceRows=activeChatTraceRowsForUi(currentChatId);
  const pendingRows=activeChatPendingRowsForUi(currentChatId);
  const matchNames=new Set();
  addMonitorAgentMatchNamesForUi(matchNames,currentAgent);
  pendingRows.forEach((item)=>addMonitorAgentMatchNamesForUi(matchNames,item&&item.agent));
  traceRows.forEach((item)=>{
    addMonitorAgentMatchNamesForUi(matchNames,item&&item.agent);
    addMonitorAgentMatchNamesFromTextForUi(matchNames,item&&item.detail);
  });
  toArr(currentChat&&currentChat.h&&currentChat.h.events).forEach((entry)=>{
    addMonitorAgentMatchNamesFromTextForUi(matchNames,entry&&entry.d);
  });
  const runtimeRows=toArr(rows).map((raw,index)=>normalizeMonitorAgent(raw,index)).filter((item)=>item&&item.name);
  runtimeRows.forEach((row)=>{
    const threadId=typeof row.threadId==="string"?row.threadId.trim():"";
    const turnId=typeof row.activeTurnId==="string"?row.activeTurnId.trim():"";
    const sessionRef=typeof row.sessionRef==="string"?row.sessionRef.trim():"";
    const threadMatch=Boolean(currentThreadId&&(threadId===currentThreadId||sessionRef===currentThreadId));
    const turnMatch=Boolean(currentTurnId&&turnId===currentTurnId);
    if(threadMatch||turnMatch)addMonitorAgentMatchNamesForUi(matchNames,row.name);
  });
  const hasCurrentChatSignals=Boolean(currentChatId||currentAgent||currentThreadId||currentTurnId||traceRows.length||pendingRows.length);
  return{currentChatId,matchNames,hasCurrentChatSignals};
}
function inferAgentRoleForUi(name){
  const normalized=canonicalParentAgentNameForUi(name);
  if(PARENT_AGENT_NAMES.has(normalized))return"parent";
  if(normalized==="")return"child";
  return"child";
}
function monitorBaseAgentNameForUi(name){
  const normalized=normalizeAgentNameForUi(name);
  if(!normalized)return"";
  const canonical=canonicalParentAgentNameForUi(normalized);
  if(canonical)return canonical;
  const scopeSep=normalized.indexOf("@");
  return scopeSep>0?normalized.slice(0,scopeSep):normalized;
}
function isVerificationAgentForUi(row){
  const baseName=monitorBaseAgentNameForUi(row&&row.name);
  return VERIFICATION_AGENT_NAMES.has(baseName);
}
function isRunningMonitorAgentForUi(row){
  if(!row||typeof row!=="object")return false;
  if(typeof row.activeTurnId==="string"&&row.activeTurnId.trim())return true;
  if(row.tone==="running")return true;
  const status=String(row.status||"").toLowerCase();
  return status.includes("running")
    ||status.includes("busy")
    ||status.includes("progress")
    ||status.includes("working")
    ||status.includes("streaming");
}
function isFailedMonitorAgentForUi(row){
  if(!row||typeof row!=="object")return false;
  if(row.tone==="failed")return true;
  const status=String(row.status||"").toLowerCase();
  return status.includes("fail")
    ||status.includes("error")
    ||status.includes("abort")
    ||status.includes("interrupt")
    ||status.includes("needs_input")
    ||status.includes("blocked");
}
function isCompletedMonitorAgentForUi(row){
  if(!row||typeof row!=="object")return false;
  if(row.tone==="completed")return true;
  const status=String(row.status||"").toLowerCase();
  return status.includes("complete")
    ||status.includes("done")
    ||status.includes("pass")
    ||status.includes("success")
    ||status.includes("ready");
}
function monitorLaneForUi(row){
  if(isRunningMonitorAgentForUi(row))return"running";
  if(row&&row.role==="parent")return"parents";
  if(isVerificationAgentForUi(row))return"verification";
  return"specialists";
}
function monitorRoleLabelForUi(row){
  const lane=monitorLaneForUi(row);
  if(lane==="running")return"稼働中";
  if(lane==="parents")return"親";
  if(lane==="verification")return"検証";
  return"専門";
}
function compactMonitorRefForUi(value){
  const text=String(value||"").trim();
  if(!text)return"";
  if(text.length<=18)return text;
  return`${text.slice(0,8)}…${text.slice(-4)}`;
}
function groupTopographyRowsForUi(rows){
  const grouped=new Map(AGENT_KANBAN_LANES.map((lane)=>[lane.id,{...lane,items:[]}]));
  toArr(rows).forEach((row)=>{
    const laneId=monitorLaneForUi(row);
    const lane=grouped.get(laneId)||grouped.get("specialists");
    lane.items.push(row);
  });
  grouped.forEach((lane)=>{
    lane.items.sort((left,right)=>{
      const leftRunning=isRunningMonitorAgentForUi(left)?1:0;
      const rightRunning=isRunningMonitorAgentForUi(right)?1:0;
      if(rightRunning!==leftRunning)return rightRunning-leftRunning;
      const leftSynced=left&&left.synced?1:0;
      const rightSynced=right&&right.synced?1:0;
      if(rightSynced!==leftSynced)return rightSynced-leftSynced;
      const leftSelected=left&&String(left.status||"").toLowerCase()==="selected"?1:0;
      const rightSelected=right&&String(right.status||"").toLowerCase()==="selected"?1:0;
      if(rightSelected!==leftSelected)return rightSelected-leftSelected;
      return String(left&&left.name||"").localeCompare(String(right&&right.name||""));
    });
  });
  return AGENT_KANBAN_LANES.map((lane)=>grouped.get(lane.id));
}
const t1=(x,n=120)=>{const s=String(x||"").replace(/\s+/g," ").trim();return s.length>n?`${s.slice(0,n-1)}…`:s};
const tt=(ms)=>Number.isFinite(ms)?new Date(ms).toLocaleTimeString("ja-JP",{hour12:false}):"--:--:--";
const el=(ms)=>{if(!Number.isFinite(ms)||ms<0)return"--:--";const s=Math.floor(ms/1000),m=Math.floor((s%3600)/60),h=Math.floor(s/3600),ss=s%60;return h>0?`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`};
const fmtInt=(value)=>Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))).toLocaleString("ja-JP"):"0";
function normalizeExecModelNameForUi(value,fallback=DEFAULT_EXEC_MODEL){
  const raw=typeof value==="string"?value.trim():"";
  const candidate=raw||String(fallback||"").trim();
  if(!candidate)return DEFAULT_EXEC_MODEL;
  return LEGACY_EXEC_MODEL_ALIASES[candidate.toLowerCase()]||candidate;
}
function runtimeDefaultExecModel(){
  const runtimeModel=s.runtime&&s.runtime.execApi&&typeof s.runtime.execApi.defaultModel==="string"?s.runtime.execApi.defaultModel.trim():"";
  return normalizeExecModelNameForUi(runtimeModel,DEFAULT_EXEC_MODEL);
}
function normalizeNonEmptyExecModelNameForUi(value){
  const raw=typeof value==="string"?value.trim():"";
  if(!raw)return"";
  return normalizeExecModelNameForUi(raw,DEFAULT_EXEC_MODEL);
}
function ensureExecModelOptionForUi(value){
  if(!e.modelName)return"";
  const normalized=normalizeNonEmptyExecModelNameForUi(value);
  if(!normalized)return"";
  const target=normalized.toLowerCase();
  const hasOption=Array.from(e.modelName.options||[]).some(option=>{
    const optionValue=normalizeNonEmptyExecModelNameForUi(option&&option.value?option.value:"");
    return optionValue&&optionValue.toLowerCase()===target;
  });
  if(!hasOption){
    const option=document.createElement("option");
    option.value=normalized;
    option.textContent=normalized;
    e.modelName.appendChild(option);
  }
  return normalized;
}
function hydrateExecModelOptionsForUi(extraValues=[]){
  EXEC_MODEL_PRESET_OPTIONS.forEach(ensureExecModelOptionForUi);
  if(Array.isArray(extraValues))extraValues.forEach(ensureExecModelOptionForUi);
}
function normalizeExecModelReasoningEffortForUi(value,fallback=DEFAULT_EXEC_MODEL_REASONING_EFFORT){
  const raw=typeof value==="string"?value.trim().toLowerCase():"";
  const candidate=raw||String(fallback||"").trim().toLowerCase();
  if(EXEC_MODEL_REASONING_EFFORTS.includes(candidate))return candidate;
  return DEFAULT_EXEC_MODEL_REASONING_EFFORT;
}
function runtimeDefaultExecModelReasoningEffort(){
  const runtimeValue=s.runtime&&s.runtime.execApi&&typeof s.runtime.execApi.modelReasoningEffort==="string"?s.runtime.execApi.modelReasoningEffort.trim().toLowerCase():"";
  return normalizeExecModelReasoningEffortForUi(runtimeValue,DEFAULT_EXEC_MODEL_REASONING_EFFORT);
}
function runtimeDefaultFastModeEnabled(){
  return Boolean(s.runtime&&s.runtime.operatorDefaults&&typeof s.runtime.operatorDefaults.fastModeEnabled==="boolean"?s.runtime.operatorDefaults.fastModeEnabled:false);
}
function runtimeDefaultAutomaticApprovalReviewEnabled(){
  return Boolean(s.runtime&&s.runtime.operatorDefaults&&typeof s.runtime.operatorDefaults.automaticApprovalReviewEnabled==="boolean"?s.runtime.operatorDefaults.automaticApprovalReviewEnabled:true);
}
function isLegacyExecModelAlias(value){
  const raw=typeof value==="string"?value.trim().toLowerCase():"";
  return Boolean(raw)&&Object.prototype.hasOwnProperty.call(LEGACY_EXEC_MODEL_ALIASES,raw);
}
const chat=id=>s.chats.find(c=>c.id===id)||null,active=()=>chat(s.active);
const selectedExecModel=()=>{
  const chosen=e.modelName&&typeof e.modelName.value==="string"?e.modelName.value.trim():"";
  return normalizeExecModelNameForUi(chosen,runtimeDefaultExecModel());
};
const selectedExecModelReasoningEffort=()=>{
  const chosen=e.modelReasoningEffort&&typeof e.modelReasoningEffort.value==="string"?e.modelReasoningEffort.value.trim():"";
  return normalizeExecModelReasoningEffortForUi(chosen,runtimeDefaultExecModelReasoningEffort());
};
function deriveAgentNameFromChatId(chatId){
  const raw=typeof chatId==="string"?chatId:"";
  const normalized=raw.toLowerCase().replace(/[^a-z0-9_-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  const tail=(normalized||`chat-${Date.now().toString(36)}`).slice(-32);
  return`${DEFAULT_AGENT_NAME}@chat-${tail}`;
}
function normalizeScopedChatAgentNameForUi(agentName,chatId){
  const normalized=normalizeAgentNameForUi(agentName);
  if(!normalized||normalized===DEFAULT_AGENT_NAME||isLegacyRoomAgentNameForUi(normalized)){
    return deriveAgentNameFromChatId(chatId);
  }
  return normalized;
}
function ensureChatAgent(chatRecord){
  if(!chatRecord||typeof chatRecord!=="object")return DEFAULT_AGENT_NAME;
  const next=normalizeScopedChatAgentNameForUi(chatRecord.agent,chatRecord.id||"");
  if(chatRecord.agent!==next){
    chatRecord.agent=next;
    scheduleSaveChatState();
  }
  return next||DEFAULT_AGENT_NAME;
}
function localPendingCountForChat(chatId){
  const id=typeof chatId==="string"?chatId:"";
  if(!id)return 0;
  let count=0;
  s.req.forEach((row)=>{
    if(row&&row.cid===id)count+=1;
  });
  return count;
}
function runtimeAgentsFromPayload(runtime){
  return runtime&&Array.isArray(runtime.agents)?runtime.agents:[];
}
function latestRuntimeTurn(runtime=s.runtime){
  const source=runtime&&typeof runtime==="object"?runtime:{};
  if(source.latestTurn&&typeof source.latestTurn==="object")return source.latestTurn;
  return source.latest_turn&&typeof source.latest_turn==="object"?source.latest_turn:null;
}
function runtimeTurnStatusForUi(turn){
  if(!turn||typeof turn!=="object")return"";
  return lowerText(turn.terminal_status||turn.terminalStatus||turn.status);
}
function runtimeTurnThreadIdForUi(turn){
  const raw=turn&&typeof turn==="object"
    ?(typeof turn.thread_id==="string"&&turn.thread_id.trim()?turn.thread_id:turn.threadId)
    :"";
  return typeof raw==="string"?raw.trim():"";
}
function runtimeTurnIdForUi(turn){
  const raw=turn&&typeof turn==="object"
    ?(typeof turn.turn_id==="string"&&turn.turn_id.trim()?turn.turn_id:turn.turnId)
    :"";
  return typeof raw==="string"?raw.trim():"";
}
function runtimeTurnAgentForUi(turn){
  const raw=turn&&typeof turn==="object"
    ?(typeof turn.agent_name==="string"&&turn.agent_name.trim()?turn.agent_name:turn.agentName)
    :"";
  return normalizeAgentNameForUi(raw);
}
function runtimeTurnCompletedAtForUi(turn){
  if(!turn||typeof turn!=="object")return 0;
  return toPerfInt(turn.completed_at||turn.completedAt||turn.updated_at||turn.updatedAt);
}
function chatCanAdoptUnboundLatestTurnForUi(chatRecord){
  if(!chatRecord||typeof chatRecord!=="object")return false;
  if(Boolean(chatRecord.forceNewSession))return false;
  if(!Array.isArray(s.chats)||s.chats.length!==1)return false;
  return Array.isArray(chatRecord.messages)&&chatRecord.messages.length>0;
}
function cloneJsonForUi(value,fallback=null){
  if(value===undefined)return fallback;
  try{
    return JSON.parse(JSON.stringify(value));
  }catch{
    return fallback;
  }
}
function captureTurnSnapshotForUi(turn){
  if(!turn||typeof turn!=="object")return null;
  const snapshot={};
  const status=runtimeTurnStatusForUi(turn);
  const threadId=runtimeTurnThreadIdForUi(turn);
  const turnId=runtimeTurnIdForUi(turn);
  const agentName=runtimeTurnAgentForUi(turn);
  const completedAt=runtimeTurnCompletedAtForUi(turn);
  const planningMode=typeof turn.planning_mode==="string"&&turn.planning_mode.trim()?turn.planning_mode.trim():"";
  const planning=planningContextForUi(turn);
  if(status)snapshot.terminal_status=status;
  if(threadId)snapshot.thread_id=threadId;
  if(turnId)snapshot.turn_id=turnId;
  if(agentName)snapshot.agent_name=agentName;
  if(completedAt>0)snapshot.completed_at=completedAt;
  if(planningMode)snapshot.planning_mode=planningMode;
  if(planning&&Object.keys(planning).length)snapshot.planning=cloneJsonForUi(planning,{});
  if(turn.family_completion_gate&&typeof turn.family_completion_gate==="object"){
    snapshot.family_completion_gate=cloneJsonForUi(turn.family_completion_gate,{});
  }
  return Object.keys(snapshot).length?snapshot:null;
}
function storedTurnSnapshotForUi(h){
  return h&&h.turnSnapshot&&typeof h.turnSnapshot==="object"?h.turnSnapshot:null;
}
function syncTurnSnapshotForUi(chatRecord,turn){
  if(!chatRecord||typeof chatRecord!=="object"||!chatRecord.h||typeof chatRecord.h!=="object")return false;
  const next=captureTurnSnapshotForUi(turn);
  if(!next)return false;
  const previous=storedTurnSnapshotForUi(chatRecord.h);
  const prevKey=previous?JSON.stringify(previous):"";
  const nextKey=JSON.stringify(next);
  if(prevKey===nextKey)return false;
  chatRecord.h.turnSnapshot=next;
  if(!chatRecord.h.thread){
    const threadId=runtimeTurnThreadIdForUi(next);
    if(threadId)chatRecord.h.thread=threadId;
  }
  if(!chatRecord.h.turn){
    const turnId=runtimeTurnIdForUi(next);
    if(turnId)chatRecord.h.turn=turnId;
  }
  return true;
}
function taskFamilyLabelForUi(value){
  const normalized=typeof value==="string"?value.trim():"";
  if(!normalized)return"未分類";
  return TASK_FAMILY_LABELS[normalized]||normalized;
}
function familyGateStatusLabelForUi(status){
  const normalized=lowerText(status);
  if(!normalized)return"未判定";
  if(normalized==="passed"||normalized==="completed")return"通過";
  if(normalized==="failed"||normalized==="failed_validation")return"未通過";
  if(normalized==="running"||normalized==="pending")return"判定中";
  if(normalized==="not_applicable")return"対象外";
  return normalized;
}
function runtimeTurnMatchesChat(turn,chatRecord){
  if(!turn||typeof turn!=="object"||!chatRecord||typeof chatRecord!=="object")return false;
  const turnId=runtimeTurnIdForUi(turn);
  const threadId=runtimeTurnThreadIdForUi(turn);
  const turnAgent=runtimeTurnAgentForUi(turn);
  const chatTurn=typeof chatRecord?.h?.turn==="string"?chatRecord.h.turn.trim():"";
  const chatThread=typeof chatRecord?.h?.thread==="string"?chatRecord.h.thread.trim():"";
  const chatAgent=normalizeAgentNameForUi(chatRecord.agent);
  if(chatTurn&&turnId&&chatTurn===turnId)return true;
  if(chatThread&&threadId&&chatThread===threadId)return true;
  if(chatAgent&&turnAgent&&chatAgent===turnAgent){
    if(pendingCountForChat(chatRecord.id)>0)return true;
    if(!chatTurn&&!chatThread&&chatCanAdoptUnboundLatestTurnForUi(chatRecord))return true;
  }
  return false;
}
function latestRuntimeTurnForChat(chatRecord,runtime=s.runtime){
  const turn=latestRuntimeTurn(runtime);
  if(!turn)return null;
  return runtimeTurnMatchesChat(turn,chatRecord)?turn:null;
}
function deriveRuntimeTurnContextForUi(turn){
  if(!turn||typeof turn!=="object")return null;
  const planning=turn.planning&&typeof turn.planning==="object"?turn.planning:{};
  const selection=planning.selection&&typeof planning.selection==="object"?planning.selection:{};
  const familyProfile=selection.familyProfile&&typeof selection.familyProfile==="object"?selection.familyProfile:{};
  const requirement=planning.requirementContract&&typeof planning.requirementContract==="object"?planning.requirementContract:{};
  const userValueFrame=requirement.userValueFrame&&typeof requirement.userValueFrame==="object"?requirement.userValueFrame:{};
  const gate=turn.family_completion_gate&&typeof turn.family_completion_gate==="object"?turn.family_completion_gate:{};
  const applies=Boolean(gate.applies===true||Number(gate.applies)===1);
  return{
    taskFamily:typeof selection.taskFamily==="string"&&selection.taskFamily.trim()
      ?selection.taskFamily.trim()
      :(typeof gate.taskFamily==="string"?gate.taskFamily.trim():""),
    familyProfileId:typeof selection.familyProfileId==="string"&&selection.familyProfileId.trim()
      ?selection.familyProfileId.trim()
      :(typeof gate.familyProfileId==="string"?gate.familyProfileId.trim():""),
    familyLabel:typeof familyProfile.label==="string"&&familyProfile.label.trim()
      ?taskFamilyLabelForUi(selection.taskFamily||gate.taskFamily||"")
      :taskFamilyLabelForUi(selection.taskFamily||gate.taskFamily||""),
    planningMode:typeof turn.planning_mode==="string"&&turn.planning_mode.trim()
      ?turn.planning_mode.trim()
      :(typeof selection.selectedMode==="string"?selection.selectedMode.trim():""),
    userValueThesis:typeof userValueFrame.valueThesis==="string"?userValueFrame.valueThesis.trim():"",
    qualityAxisCount:Array.isArray(userValueFrame.qualityAxes)?userValueFrame.qualityAxes.length:0,
    mustAvoidCount:Array.isArray(userValueFrame.mustAvoid)?userValueFrame.mustAvoid.length:0,
    completedMeansCount:Array.isArray(userValueFrame.completedMeans)?userValueFrame.completedMeans.length:0,
    gateApplies:applies,
    gateStatus:typeof gate.status==="string"?gate.status.trim():"",
    gateSummary:typeof gate.summary==="string"?gate.summary.trim():"",
  };
}
function planningContextForUi(turn){
  return turn&&turn.planning&&typeof turn.planning==="object"?turn.planning:{};
}
function requirementContractForUi(turn){
  const planning=planningContextForUi(turn);
  return planning.requirementContract&&typeof planning.requirementContract==="object"?planning.requirementContract:{};
}
function dispatchPlanForUi(turn){
  const planning=planningContextForUi(turn);
  return planning.dispatchPlan&&typeof planning.dispatchPlan==="object"?planning.dispatchPlan:{};
}
const QUALITY_AXIS_LABELS_FOR_UI=Object.freeze({
  correctness:"正しさ",
  bounded_scope:"スコープの適切さ",
  regression_resistance:"回帰への強さ",
  maintainability:"保守しやすさ",
  actionability:"次に動きやすいこと",
  verification:"検証のしやすさ",
  locality:"変更の局所性",
  regression_safety:"安全性",
  first_impression:"第一印象",
  information_hierarchy:"情報の優先順位",
  typography_and_spacing:"文字組みと余白",
  responsive_realness:"レスポンシブ品質",
  benchmark_superiority:"比較対象に勝てること",
  conversion_clarity:"訴求の分かりやすさ",
  reference_benchmarking:"参考比較",
  responsive_quality:"レスポンシブ品質",
  coverage:"網羅性",
  source_grounding:"根拠の明確さ",
  hypothesis_separation:"仮説の切り分け",
  comparison_quality:"比較の質",
  decision_usefulness:"意思決定への役立ち",
  comparative_reasoning:"比較の妥当性",
  source_quality:"情報源の質",
  decision_support:"判断しやすさ",
  tradeoff_clarity:"トレードオフの明確さ",
  option_quality:"選択肢の質",
  execution_readiness:"実行しやすさ",
  risk_visibility:"リスクの見えやすさ",
  sequencing:"段取りの明確さ",
  option_tradeoffs:"選択肢ごとの差",
});
function qualityAxisLabelForUi(value){
  const key=typeof value==="string"?value.trim():"";
  if(!key)return"";
  return QUALITY_AXIS_LABELS_FOR_UI[key]||key.replace(/_/g," ");
}
const REQUIREMENT_TEXT_LABELS_FOR_UI=Object.freeze({
  "No implementation or config changes until the open questions are resolved.":"未解決の確認事項が解消するまで、実装や設定変更は行わない。",
  "Do not expand scope beyond requirement clarification.":"要件確認を超えて、勝手にスコープを広げない。",
  "Acceptance checks are not fully specified, so implementation details may require user confirmation.":"受け入れ条件がまだ十分に決まっていないため、実装の細部はユーザー確認が必要になる可能性がある。",
  "What acceptance checks define success?":"何を満たせば成功と言えるか？",
  "Some task boundaries still depend on inferred scope from the prompt.":"作業範囲の一部は、入力文からの推定にまだ依存している。",
  "Any scope outside the explicit goal should stay proposal-only unless the prompt states otherwise.":"明示ゴールの外側は、入力で明示されない限り提案止まりにとどめる。",
  "Deliver the requested web experience in a way that wins on first impression, hierarchy, and believability before process neatness.":"第一印象、情報の優先順位、信頼感で勝てるWeb体験を届ける。",
  "Deliver an answer the user can trust for decision-making by maximizing coverage, grounded comparison, and explicit uncertainty management.":"比較の広さ、根拠、不確実さの明示を重視し、判断に使える答えを届ける。",
  "Help the user make the next correct decision by clarifying tradeoffs, options, and execution consequences before prescribing a path.":"結論を押し付ける前に、選択肢、トレードオフ、実行結果を整理して、次の正しい判断を助ける。",
  "Deliver the requested change correctly, locally, and in a way that minimizes follow-up correction pressure.":"依頼された変更を正しく、局所的に、あとからの手直しが増えにくい形で届ける。",
  "AI-looking generic layouts.":"AIっぽい無個性なレイアウト。",
  "Weak card-grid sameness with no clear section rhythm.":"全部同じ調子のカード並びで、見出しのリズムが弱い構成。",
  "Abstract filler copy with no believable proof.":"説得力のない抽象的な埋め草コピー。",
  "Single-path overconfidence without comparison.":"比較なしで一つの結論だけを強く言い切ること。",
  "Claims without grounding.":"根拠のない主張。",
  "Hidden uncertainty.":"不確実さを隠すこと。",
  "Premature single-path certainty.":"早すぎる一本化。",
  "Hand-wavy plans with no execution consequences.":"実行した結果が見えない、ふわっとした計画。",
  "Ignoring key tradeoffs.":"重要なトレードオフを無視すること。",
  "Speculative scope expansion.":"推測でスコープを広げること。",
  "Broad rewrites without need.":"必要のない大きな書き換え。",
  "Completion claims without concrete verification.":"具体的な検証なしに完了と言い切ること。",
  "The result feels intentionally designed and materially above a safe average answer.":"仕上がりが意図を持って設計されており、無難な平均点を明確に上回っている。",
  "The page communicates value clearly, avoids cheap patterns, and holds up responsively.":"価値が一目で伝わり、安っぽい型にはまらず、レスポンシブでも崩れない。",
  "The answer covers the key possibilities, compares them, and states confidence honestly.":"主要な可能性を押さえ、比較し、確信度を正直に示している。",
  "The user can choose a path with clear tradeoffs, risks, and next steps.":"トレードオフ、リスク、次の一手が見えた状態で進路を選べる。",
  "The requested change works, remains bounded, and does not create obvious regression pressure.":"依頼された変更が動き、範囲が広がりすぎず、明らかな後戻り圧力を生まない。",
});
function requirementTextLabelForUi(value){
  const key=typeof value==="string"?value.trim():"";
  if(!key)return"";
  return REQUIREMENT_TEXT_LABELS_FOR_UI[key]||qualityAxisLabelForUi(key);
}
function normalizeRequirementCompareKeyForUi(value){
  return requirementTextLabelForUi(value)
    .replace(/^(?:質問に答える|次の点を説明する|Answer the user's question about|Explain these points)\s*:?\s*/,"")
    .replace(/[?？!！。．:：/／、,\s-]+/g,"")
    .toLowerCase();
}
function requirementKeysOverlapForUi(left,right,{minLength=12}={}){
  const leftKey=normalizeRequirementCompareKeyForUi(left);
  const rightKey=normalizeRequirementCompareKeyForUi(right);
  if(!leftKey||!rightKey)return false;
  if(leftKey===rightKey)return true;
  if(leftKey.length>=minLength&&rightKey.includes(leftKey))return true;
  if(rightKey.length>=minLength&&leftKey.includes(rightKey))return true;
  return false;
}
function distinctRequirementCandidateForUi(value,{explicitGoal="",explicitGoalRaw="",blockedValues=[]}={}){
  const text=requirementTextLabelForUi(t1(value,220).trim());
  if(!text||/[?？]/.test(text))return"";
  if(
    requirementKeysOverlapForUi(text,explicitGoal,{minLength:10})
    || requirementKeysOverlapForUi(text,explicitGoalRaw,{minLength:10})
  )return"";
  for(const blocked of toArr(blockedValues)){
    if(requirementKeysOverlapForUi(text,blocked,{minLength:10}))return"";
  }
  return text;
}
function collectDistinctRequirementCandidatesForUi(values,options={}){
  const seen=new Set();
  return toArr(values).map((entry)=>distinctRequirementCandidateForUi(entry,options)).filter((text)=>{
    const key=normalizeRequirementCompareKeyForUi(text);
    if(!key||seen.has(key))return false;
    seen.add(key);
    return true;
  });
}
function stripQuestionLeadForUi(value){
  return requirementTextLabelForUi(value)
    .replace(/^(?:質問に答える|次の点を説明する|Answer the user's question about|Explain these points)\s*:?\s*/,"")
    .replace(/[?？!！。．\s]+$/g,"")
    .trim();
}
function requirementLooksFragmentaryForUi(value){
  const text=requirementTextLabelForUi(t1(value,220).trim());
  if(!text)return false;
  if(/[?？]$/.test(text))return true;
  return /(?:とき|時|場合|際)(?:は|には)?$|(?:前に|後に|あとで|後で)$|(?:なら|ならば|したら)$/.test(text);
}
function preferredRequirementNarrativeForUi(values,{fallback=""}={}){
  const candidates=toArr(values).map((entry)=>requirementTextLabelForUi(t1(entry,220).trim())).filter(Boolean);
  const preferred=candidates.find((entry)=>!requirementLooksFragmentaryForUi(entry));
  return preferred||candidates[0]||requirementTextLabelForUi(t1(fallback,220).trim())||"";
}
function joinIntentPhrasesForUi(parts){
  const phrases=toArr(parts).map((entry)=>String(entry||"").trim()).filter(Boolean).slice(0,3);
  if(!phrases.length)return"";
  if(phrases.length===1)return phrases[0];
  return phrases.reduce((acc,entry,index)=>{
    if(index===0)return entry;
    return`${acc.replace(/する$/,"し、")}${entry}`;
  },"");
}
function inferQuestionIntentDirectionForUi(value){
  const text=stripQuestionLeadForUi(value);
  if(!text)return"";
  const appearanceOnly=/(?:ように見える|見えるだけ|だけでしょうか|だけなのか|見えているだけ)/.test(text);
  const literalVsInterpretation=/(?:そのまま受け取|literal|焼き直し|言い換え|オウム返し)/i.test(text)&&/(?:解釈|意図|仮説|要件)/.test(text);
  if(literalVsInterpretation&&appearanceOnly){
    return"要件ロックが原文の反復に見える理由を、見え方と実際の挙動を切り分け、どこまで解釈できていてどこが原文寄りかを整理して説明する";
  }
  if(literalVsInterpretation&&/(?:なぜ|なんで|理由|どうして)/.test(text)){
    return"要件ロックが原文の反復に見える理由と、どこまで解釈できていてどこが原文寄りかを整理して説明する";
  }
  if(literalVsInterpretation){
    return"要件ロックが原文の反復に見える点を、どこまで解釈できていてどこが原文寄りかを整理する";
  }
  const recentLabel=/(?:最近|直近)/.test(text)?"最近の":"今回の";
  let topicLabel="";
  if(/要件/.test(text)&&/(?:修正|変更|直し|改善)/.test(text))topicLabel=`${recentLabel}要件まわりの修正について、`;
  else if(/(?:表示|UI|画面|見た目)/i.test(text)&&/(?:修正|変更|直し|改善)/.test(text))topicLabel=`${recentLabel}表示まわりの修正について、`;
  else if(/(?:修正|変更|直し|改善)/.test(text))topicLabel=`${recentLabel}修正について、`;
  const actions=[];
  if(/(?:ええかんじ|ええ感じ|いい感じ|良くなった|よくなった|改善|直った|問題|大丈夫|伝わりやす|見やす|自然|狙いどおり)/.test(text)){
    actions.push("狙いどおり改善できたかを確認する");
  }
  if(/(?:どんな修正|どこを修正|何を修正|何を変えた|どこを変えた|変更点|修正したか|どう直した|どんな変更)/.test(text)){
    actions.push("変更点を具体的に説明する");
  }
  if(/(?:なぜ|なんで|理由|どうして)/.test(text)){
    actions.push("理由を説明する");
  }
  if(!actions.length&&/(?:教えて|教えてください|説明して|説明してください|知りたい)/.test(text)){
    actions.push("知りたいポイントを整理して説明する");
  }
  const actionText=joinIntentPhrasesForUi(actions);
  return actionText?`${topicLabel}${actionText}`:"";
}
function inferQuestionIntentHypothesisForUi(value){
  const text=stripQuestionLeadForUi(value);
  if(!text)return"";
  const appearanceOnly=/(?:ように見える|見えるだけ|だけでしょうか|だけなのか|見えているだけ)/.test(text);
  const literalVsInterpretation=/(?:そのまま受け取|literal|焼き直し|言い換え|オウム返し)/i.test(text)&&/(?:解釈|意図|仮説|要件)/.test(text);
  if(literalVsInterpretation&&appearanceOnly){
    return"見え方だけの問題か、実際に意図解釈が弱いのかを切り分けて確かめたい";
  }
  if(literalVsInterpretation){
    return"原文固定と意図解釈のどちらが支配的かを確かめたい";
  }
  const improvementReview=/(?:ええかんじ|ええ感じ|いい感じ|良くなった|よくなった|改善|直った|問題|大丈夫|伝わりやす|見やす|自然|狙いどおり)/.test(text);
  const changeExplanation=/(?:どんな修正|どこを修正|何を修正|何を変えた|どこを変えた|変更点|修正したか|どう直した|どんな変更)/.test(text);
  if(improvementReview&&changeExplanation){
    return"変更点だけでなく、改善の根拠まで短く把握したい";
  }
  if(changeExplanation){
    return"変更点とその意図のつながりを把握したい";
  }
  if(improvementReview){
    return"結果だけでなく、改善できた根拠まで把握したい";
  }
  return"";
}
function formatPlanSkipWorkTextForUi(value){
  const text=t1(value,240).trim().replace(/^PLAN SKIP\s*[:/]\s*/i,"");
  return text||"直接回答または確認を行います。";
}
function compactTextListForUi(value,{maxItems=8,maxChars=180,transform=null}={}){
  return toArr(value).map((entry)=>{
    const raw=typeof transform==="function"?transform(entry):entry;
    return t1(raw,maxChars).trim();
  }).filter(Boolean).slice(0,maxItems);
}
function acceptanceCheckLabelsForUi(value,{maxItems=8}={}){
  return toArr(value).map((entry,index)=>{
    if(entry&&typeof entry==="object"){
      const title=typeof entry.title==="string"&&entry.title.trim()?entry.title.trim():"";
      const id=typeof entry.id==="string"&&entry.id.trim()?entry.id.trim():"";
      return t1(title||id||`check-${index+1}`,180).trim();
    }
    return t1(entry,180).trim();
  }).filter(Boolean).slice(0,maxItems);
}
function summarizeInlineListForUi(items,{maxItems=3,emptyLabel=""}={}){
  const list=toArr(items).map((entry)=>String(entry||"").trim()).filter(Boolean);
  if(!list.length)return emptyLabel;
  const visible=list.slice(0,maxItems);
  const remainder=list.length-visible.length;
  return`${visible.join(" / ")}${remainder>0?` / 他 ${remainder} 件`:""}`;
}
function requirementStatusLabelForUi(value){
  const normalized=typeof value==="string"?value.trim().toUpperCase():"";
  if(normalized==="LOCKED")return"確定";
  if(normalized==="BLOCKED")return"保留";
  if(normalized==="REVISED")return"改訂";
  return"下書き";
}
function requirementValidationLabelForUi(value){
  const normalized=typeof value==="string"?value.trim().toUpperCase():"";
  if(normalized==="PASS")return"PASS";
  if(normalized==="BLOCK")return"BLOCK";
  return"WARN";
}
const REQUIREMENT_FIELD_LABELS_FOR_UI=Object.freeze({
  explicitGoal:"明示ゴール",
  implicitGoal:"暗黙ゴール",
  baselineScope:"基本スコープ",
  nonGoals:"非対象",
  approvalBoundaryItems:"境界メモ",
  acceptanceChecks:"受け入れ条件",
  "userValueFrame.valueThesis":"価値の中心",
  "userValueFrame.userWants":"欲しい結果",
  "userValueFrame.mustAvoid":"避けること",
  "userValueFrame.hardConstraints":"厳守条件",
  "userValueFrame.qualityAxes":"品質軸",
  "userValueFrame.benchmarkCandidates":"参考比較",
  "userValueFrame.completedMeans":"完了像",
  "intentInterpretation.presentation":"見せ方",
  "intentInterpretation.direction":"向かう先",
  "intentInterpretation.hypothesis":"意図仮説",
});
function requirementFieldLabelForUi(value){
  const key=typeof value==="string"?value.trim():"";
  return REQUIREMENT_FIELD_LABELS_FOR_UI[key]||key;
}
function collectRequirementProvenanceCountsForUi(value,counts={user_explicit:0,user_implied:0,system_inferred:0,policy_default:0}){
  if(!value||typeof value!=="object")return counts;
  if(typeof value.source==="string"&&Object.prototype.hasOwnProperty.call(counts,value.source)){
    counts[value.source]+=1;
  }
  Object.keys(value).forEach((key)=>{
    const entry=value[key];
    if(Array.isArray(entry)){
      entry.forEach((item)=>{
        if(item&&typeof item==="object"&&typeof item.source==="string"&&Object.prototype.hasOwnProperty.call(counts,item.source)){
          counts[item.source]+=1;
        }
      });
      return;
    }
    if(entry&&typeof entry==="object"&&typeof entry.source!=="string"){
      collectRequirementProvenanceCountsForUi(entry,counts);
    }
  });
  return counts;
}
function summarizeRequirementProvenanceForUi(value){
  const counts=collectRequirementProvenanceCountsForUi(value);
  const parts=[
    counts.user_explicit?`明示 ${counts.user_explicit}`:"",
    counts.user_implied?`含意 ${counts.user_implied}`:"",
    counts.system_inferred?`推定 ${counts.system_inferred}`:"",
    counts.policy_default?`既定 ${counts.policy_default}`:"",
  ].filter(Boolean);
  return{counts,parts};
}
function buildRequirementLockSnapshotForUi(turn){
  const requirement=requirementContractForUi(turn);
  const userValueFrame=requirement.userValueFrame&&typeof requirement.userValueFrame==="object"?requirement.userValueFrame:{};
  const intentInterpretation=requirement.intentInterpretation&&typeof requirement.intentInterpretation==="object"?requirement.intentInterpretation:{};
  const displayContract=requirement.displayContract&&typeof requirement.displayContract==="object"?requirement.displayContract:{};
  const questionPlan=requirement.questionPlan&&typeof requirement.questionPlan==="object"?requirement.questionPlan:{};
  const delightPlan=requirement.delightPlan&&typeof requirement.delightPlan==="object"?requirement.delightPlan:{};
  const requestCoverage=requirement.requestCoverage&&typeof requirement.requestCoverage==="object"?requirement.requestCoverage:{};
  const coverageSummary=requestCoverage.coverageSummary&&typeof requestCoverage.coverageSummary==="object"?requestCoverage.coverageSummary:{};
  const provenance=requirement.provenance&&typeof requirement.provenance==="object"?requirement.provenance:{};
  const validation=requirement.validation&&typeof requirement.validation==="object"?requirement.validation:{};
  const revisionLedger=requirement.revisionLedger&&typeof requirement.revisionLedger==="object"?requirement.revisionLedger:{};
  const contractStatus=typeof requirement.status==="string"?requirement.status.trim().toUpperCase():"";
  const contractStatusReason=typeof requirement.statusReason==="string"?requirementTextLabelForUi(t1(requirement.statusReason,220).trim()):"";
  const validationVerdict=typeof validation.verdict==="string"?validation.verdict.trim().toUpperCase():"";
  const validationSummary=validation.summary&&typeof validation.summary==="object"?validation.summary:{};
  const validationChecks=toArr(validation.checks).filter((entry)=>entry&&typeof entry==="object");
  const validationBlocks=validationChecks.filter((entry)=>String(entry.status||"").toUpperCase()==="BLOCK");
  const validationWarnings=validationChecks.filter((entry)=>String(entry.status||"").toUpperCase()==="WARN");
  const revisionSummary=typeof revisionLedger.summary==="string"?t1(revisionLedger.summary,220).trim():"";
  const revisionChangedFields=compactTextListForUi(revisionLedger.changedFields,{transform:requirementFieldLabelForUi,maxItems:6,maxChars:80});
  const provenanceSummary=summarizeRequirementProvenanceForUi(provenance);
  const acceptanceCheckEntries=toArr(requirement.acceptanceChecks).map((entry,index)=>{
    if(entry&&typeof entry==="object"){
      const id=typeof entry.id==="string"&&entry.id.trim()?entry.id.trim():`ac-${index+1}`;
      const title=typeof entry.title==="string"&&entry.title.trim()?entry.title.trim():"";
      const text=requirementTextLabelForUi(t1(title||id||`check-${index+1}`,180).trim());
      if(!text)return null;
      return{id,text};
    }
    const text=requirementTextLabelForUi(t1(entry,180).trim());
    if(!text)return null;
    return{id:`ac-${index+1}`,text};
  }).filter(Boolean);
  const acceptanceChecks=acceptanceCheckEntries.map((entry)=>entry.text);
  const acceptanceCheckTextById=acceptanceCheckEntries.reduce((acc,entry)=>{
    if(!entry||typeof entry!=="object"||!entry.id||!entry.text)return acc;
    acc[entry.id]=entry.text;
    return acc;
  },{});
  const requestClauseEntries=toArr(requestCoverage.rawRequestClauses).map((entry,index)=>{
    if(!entry||typeof entry!=="object")return null;
    const id=typeof entry.id==="string"&&entry.id.trim()?entry.id.trim():`req-${index+1}`;
    const text=requirementTextLabelForUi(t1(entry.text||id,240).trim());
    if(!text)return null;
    return{
      id,
      text,
      kind:typeof entry.kind==="string"&&entry.kind.trim()?entry.kind.trim():"explicit_request",
      lane:typeof entry.lane==="string"&&entry.lane.trim()?entry.lane.trim():"core",
    };
  }).filter(Boolean);
  const requestClauseTextById=requestClauseEntries.reduce((acc,entry)=>{
    if(!entry||typeof entry!=="object"||!entry.id||!entry.text)return acc;
    acc[entry.id]=entry.text;
    return acc;
  },{});
  const baselineScope=compactTextListForUi(requirement.baselineScope,{transform:requirementTextLabelForUi});
  const overDeliveryScope=compactTextListForUi(requirement.overDeliveryScope,{transform:requirementTextLabelForUi});
  const nonGoals=compactTextListForUi(requirement.nonGoals,{transform:requirementTextLabelForUi});
  const assumptions=compactTextListForUi(requirement.assumptions,{transform:requirementTextLabelForUi});
  const openQuestionsRaw=compactTextListForUi(requirement.openQuestions,{transform:requirementTextLabelForUi});
  const userWantsRaw=compactTextListForUi(userValueFrame.userWants,{transform:requirementTextLabelForUi});
  const hardConstraints=compactTextListForUi(userValueFrame.hardConstraints,{transform:requirementTextLabelForUi});
  const mustAvoid=compactTextListForUi(userValueFrame.mustAvoid,{transform:requirementTextLabelForUi});
  const qualityAxes=compactTextListForUi(userValueFrame.qualityAxes,{transform:qualityAxisLabelForUi});
  const completedMeans=compactTextListForUi(userValueFrame.completedMeans,{transform:requirementTextLabelForUi});
  const valueThesis=typeof userValueFrame.valueThesis==="string"?requirementTextLabelForUi(t1(userValueFrame.valueThesis,220).trim()):"";
  const explicitGoalRaw=typeof requirement.explicitGoal==="string"?requirementTextLabelForUi(t1(requirement.explicitGoal,220).trim()):"";
  const implicitGoal=typeof requirement.implicitGoal==="string"?requirementTextLabelForUi(t1(requirement.implicitGoal,220).trim()):"";
  const lockedGoal=typeof requirement.lockedGoal==="string"?requirementTextLabelForUi(t1(requirement.lockedGoal,220).trim()):"";
  const intentHypotheses=compactTextListForUi(
    toArr(requirement.intentHypotheses).map((entry)=>entry&&typeof entry==="object"?entry.goal:""),
    {transform:requirementTextLabelForUi,maxItems:4,maxChars:200}
  );
  const displayAskNext=compactTextListForUi(
    toArr(displayContract.askNext).map((entry)=>entry&&typeof entry==="object"?entry.question:entry),
    {transform:requirementTextLabelForUi,maxItems:3,maxChars:180}
  );
  const questionPlanAskNext=compactTextListForUi(
    toArr(questionPlan.askNext).map((entry)=>entry&&typeof entry==="object"?entry.question:entry),
    {transform:requirementTextLabelForUi,maxItems:3,maxChars:180}
  );
  const delightTitles=compactTextListForUi(
    Array.isArray(displayContract.delightTitles)&&displayContract.delightTitles.length?displayContract.delightTitles:toArr(delightPlan.candidates).map((entry)=>entry&&typeof entry==="object"?entry.title:entry),
    {transform:requirementTextLabelForUi,maxItems:4,maxChars:180}
  );
  const approvalBoundaryItems=compactTextListForUi(
    toArr(requirement.approvalBoundaryItems).map((entry)=>entry?`Boundary note: ${entry}`:""),
    {transform:requirementTextLabelForUi,maxItems:4,maxChars:180}
  );
  const displayBoundaries=compactTextListForUi(
    Array.isArray(displayContract.boundaries)&&displayContract.boundaries.length?displayContract.boundaries:[],
    {transform:requirementTextLabelForUi,maxItems:6,maxChars:180}
  );
  const displayGoal=typeof displayContract.goal==="string"?requirementTextLabelForUi(t1(displayContract.goal,220).trim()):"";
  const displayHeadline=typeof displayContract.headline==="string"?requirementTextLabelForUi(t1(displayContract.headline,220).trim()):"";
  const displayNextAction=typeof displayContract.nextAction==="string"?requirementTextLabelForUi(t1(displayContract.nextAction,220).trim()):"";
  const displayHoldReason=typeof displayContract.holdReason==="string"?requirementTextLabelForUi(t1(displayContract.holdReason,220).trim()):"";
  const displayTargetOutcome=typeof displayContract.targetOutcome==="string"?requirementTextLabelForUi(t1(displayContract.targetOutcome,220).trim()):"";
  const displayGoalMode=typeof displayContract.goalMode==="string"?displayContract.goalMode.trim().toLowerCase():"draft";
  const hasLockedIntentInterpretation=Object.keys(intentInterpretation).length>0;
  const lockedQuestionLike=hasLockedIntentInterpretation?Boolean(intentInterpretation.questionLike):false;
  const lockedIntentPresentation=hasLockedIntentInterpretation&&intentInterpretation.presentation==="progress_hypothesis"?"progress_hypothesis":"goal";
  const lockedIntentDirection=typeof intentInterpretation.direction==="string"?requirementTextLabelForUi(t1(intentInterpretation.direction,220).trim()):"";
  const lockedIntentHypothesis=typeof intentInterpretation.hypothesis==="string"?requirementTextLabelForUi(t1(intentInterpretation.hypothesis,220).trim()):"";
  const goalLooksQuestionLike=hasLockedIntentInterpretation&&lockedQuestionLike;
  const explicitGoal=goalLooksQuestionLike?stripQuestionLeadForUi(explicitGoalRaw):explicitGoalRaw;
  const openQuestions=openQuestionsRaw.filter((entry)=>{
    if(requirementKeysOverlapForUi(entry,explicitGoalRaw)||requirementKeysOverlapForUi(entry,explicitGoal))return false;
    if(goalLooksQuestionLike&&lockedIntentDirection&&requirementKeysOverlapForUi(entry,lockedIntentDirection,{minLength:16}))return false;
    return true;
  });
  const hasInterpretedQuestionView=hasLockedIntentInterpretation
    &&lockedQuestionLike
    &&lockedIntentPresentation==="progress_hypothesis"
    &&Boolean(lockedIntentDirection||lockedIntentHypothesis);
  const intentDirection=hasLockedIntentInterpretation
    ?(hasInterpretedQuestionView?lockedIntentDirection:"")
    :"";
  const intentDirectionKey=normalizeRequirementCompareKeyForUi(intentDirection);
  const intentHypothesis=hasLockedIntentInterpretation
    ?(hasInterpretedQuestionView?lockedIntentHypothesis:"")
    :"";
  const hasRequirementCore=Boolean(
    explicitGoal
    || implicitGoal
    || lockedGoal
    || displayGoal
    || intentHypotheses.length
    || acceptanceChecks.length
    || baselineScope.length
    || overDeliveryScope.length
    || nonGoals.length
    || assumptions.length
    || openQuestions.length
    || approvalBoundaryItems.length
  );
  const lockedCount=
    acceptanceChecks.length
    +baselineScope.length
    +overDeliveryScope.length
    +nonGoals.length
    +assumptions.length
    +openQuestions.length
    +userWantsRaw.length
    +hardConstraints.length
    +mustAvoid.length
    +qualityAxes.length
    +completedMeans.length;
  const scopeSummaryParts=[];
  if(baselineScope.length)scopeSummaryParts.push(`baseline ${baselineScope.length}`);
  if(overDeliveryScope.length)scopeSummaryParts.push(`over ${overDeliveryScope.length}`);
  const riskSummaryParts=[];
  if(nonGoals.length)riskSummaryParts.push(`non-goal ${nonGoals.length}`);
  if(assumptions.length)riskSummaryParts.push(`assumption ${assumptions.length}`);
  if(openQuestions.length)riskSummaryParts.push(`open ${openQuestions.length}`);
  if(approvalBoundaryItems.length)riskSummaryParts.push(`boundary ${approvalBoundaryItems.length}`);
  const requestCoverageSummary={
    totalClauses:Number(coverageSummary.totalClauses||0),
    mappedCount:Number(coverageSummary.mappedCount||0),
    coreTotal:Number(coverageSummary.coreTotal||0),
    coreMapped:Number(coverageSummary.coreMapped||0),
    coreUnmapped:Number(coverageSummary.coreUnmapped||0),
    parkedCount:Number(coverageSummary.parkedCount||0),
    droppedCount:Number(coverageSummary.droppedCount||0),
  };
  const requestCoverageParts=[
    requestCoverageSummary.coreTotal||requestCoverageSummary.parkedCount||requestCoverageSummary.droppedCount||requestCoverageSummary.totalClauses
      ?`依頼反映 ${requestCoverageSummary.coreMapped} / ${requestCoverageSummary.coreTotal}`
      :"",
    requestCoverageSummary.coreTotal||requestCoverageSummary.parkedCount||requestCoverageSummary.droppedCount||requestCoverageSummary.totalClauses
      ?`保留 ${requestCoverageSummary.parkedCount}`
      :"",
    requestCoverageSummary.coreTotal||requestCoverageSummary.parkedCount||requestCoverageSummary.droppedCount||requestCoverageSummary.totalClauses
      ?`除外 ${requestCoverageSummary.droppedCount}`
      :"",
  ].filter(Boolean);
  const conciseMetaParts=[
    ...requestCoverageParts,
    contractStatus?requirementStatusLabelForUi(contractStatus):"",
    contractStatus==="BLOCKED"&&(displayAskNext.length||questionPlanAskNext.length||openQuestions.length)
      ?`要確認 ${displayAskNext.length||questionPlanAskNext.length||openQuestions.length}`
      :"",
    contractStatus==="REVISED"&&revisionLedger&&revisionLedger.revised
      ?`v${Number(revisionLedger.revisionNumber||1)}`
      :"",
  ].filter(Boolean);
  return{
    hasRequirement:hasRequirementCore,
    goalGroupTitle:goalLooksQuestionLike&&hasInterpretedQuestionView?"進行仮説":"ゴール",
    explicitGoalLabel:goalLooksQuestionLike&&hasInterpretedQuestionView?"扱う論点":"明示ゴール",
    implicitGoalLabel:goalLooksQuestionLike&&hasInterpretedQuestionView?"補足背景":"暗黙ゴール",
    intentDirectionLabel:goalLooksQuestionLike&&hasInterpretedQuestionView?"向かう先":"主目的",
    intentHypothesisLabel:goalLooksQuestionLike&&hasInterpretedQuestionView?"ユーザー意図の仮説":"補助目的",
    intentDirection,
    intentHypothesis,
    explicitGoal,
    implicitGoal,
    lockedGoal,
    intentHypotheses,
    acceptanceChecks,
    baselineScope,
    overDeliveryScope,
    nonGoals,
    assumptions,
    openQuestions,
    userWants:userWantsRaw,
    hardConstraints,
    valueThesis,
    mustAvoid,
    qualityAxes,
    completedMeans,
    displayGoal:requirementLooksFragmentaryForUi(displayGoal)?"":displayGoal,
    displayGoalMode:contractStatus==="LOCKED"||contractStatus==="REVISED"?displayGoalMode:"hypothesis",
    displayHeadline:requirementLooksFragmentaryForUi(displayHeadline)?"":displayHeadline,
    displayNextAction,
    displayHoldReason,
    displayTargetOutcome,
    displayAskNext:displayAskNext.length?displayAskNext:questionPlanAskNext,
    displayBoundaries:displayBoundaries.length?displayBoundaries:compactTextListForUi([...approvalBoundaryItems,...nonGoals,...mustAvoid,...hardConstraints],{transform:requirementTextLabelForUi,maxItems:6,maxChars:180}),
    delightTitles,
    contractStatus,
    contractStatusLabel:requirementStatusLabelForUi(contractStatus),
    contractStatusReason,
    validationVerdict,
    validationVerdictLabel:requirementValidationLabelForUi(validationVerdict),
    validationSummary:{
      passCount:Number(validationSummary.passCount||0),
      warnCount:Number(validationSummary.warnCount||0),
      blockCount:Number(validationSummary.blockCount||0),
      total:Number(validationSummary.total||validationChecks.length||0),
    },
    validationHighlights:compactTextListForUi(
      validationBlocks.length?validationBlocks.map((entry)=>entry.detail):validationWarnings.map((entry)=>entry.detail),
      {maxItems:3,maxChars:180,transform:requirementTextLabelForUi}
    ),
    requestCoverageSummary,
    requestClauseEntries,
    requestClauseTextById,
    acceptanceCheckTextById,
    revision:{
      revisionNumber:Number(revisionLedger.revisionNumber||1),
      revised:Boolean(revisionLedger.revised),
      revisionKind:typeof revisionLedger.revisionKind==="string"?revisionLedger.revisionKind.trim():"",
      requiresReapproval:Boolean(revisionLedger.requiresReapproval),
      summary:revisionSummary,
      changedFields:revisionChangedFields,
    },
    provenanceSummary,
    lockedCount,
    headline:preferredRequirementNarrativeForUi([
      requirementLooksFragmentaryForUi(displayHeadline)?"":displayHeadline,
      requirementLooksFragmentaryForUi(displayGoal)?"":displayGoal,
      requirementLooksFragmentaryForUi(lockedGoal)?"":lockedGoal,
      goalLooksQuestionLike&&hasInterpretedQuestionView?intentDirection:"",
      requirementLooksFragmentaryForUi(explicitGoal)?"":explicitGoal,
      implicitGoal,
      valueThesis,
    ]),
    metaParts:conciseMetaParts.length?conciseMetaParts:[
      contractStatus?`状態 ${requirementStatusLabelForUi(contractStatus)}`:"",
      validationVerdict?`検証 ${requirementValidationLabelForUi(validationVerdict)}`:"",
      acceptanceChecks.length?`受け入れ ${acceptanceChecks.length}`:"",
      intentHypotheses.length>1?`候補 ${intentHypotheses.length}`:"",
      (displayAskNext.length||questionPlanAskNext.length)?`質問 ${displayAskNext.length||questionPlanAskNext.length}`:"",
      scopeSummaryParts.length?scopeSummaryParts.join(" / "):"",
      riskSummaryParts.length?riskSummaryParts.join(" / "):"",
      provenanceSummary.parts.length?provenanceSummary.parts.slice(0,2).join(" / "):"",
    ].filter(Boolean),
  };
}
function requirementGroupsForUi(snapshot){
  if(!snapshot||!snapshot.hasRequirement)return[];
  const rows=[];
  const interpretation=preferredRequirementNarrativeForUi([
    snapshot.displayGoal,
    snapshot.lockedGoal,
    snapshot.intentDirection,
    snapshot.explicitGoal,
    snapshot.implicitGoal,
    snapshot.valueThesis,
  ]);
  if(!interpretation)return[];
  const referenceTargets=[];
  toArr(snapshot.baselineScope).forEach((entry)=>{
    const text=String(entry||"").trim();
    if(!text)return;
    if(/^Stitch project:/i.test(text))referenceTargets.push(text.replace(/^Stitch project:\s*/i,"Project "));
    else if(/^Stitch screen:/i.test(text))referenceTargets.push(text.replace(/^Stitch screen:\s*/i,"Screen "));
    else if(/画像とコード|images and code/i.test(text))referenceTargets.push("画像とコードを取得して基準にする");
    else if(/curl\s*-L/i.test(text)||/hosted url/i.test(text))referenceTargets.push("hosted URL は curl -L で取得する");
  });
  if(referenceTargets.length){
    rows.push({
      label:"確認対象",
      text:summarizeInlineListForUi(referenceTargets,{maxItems:3}),
    });
  }
  const approachParts=[];
  if(snapshot.displayAskNext&&snapshot.displayAskNext.length){
    const firstAsk=String(snapshot.displayAskNext[0]||"").trim();
    if(firstAsk){
      if(/^まず/.test(firstAsk))approachParts.push(firstAsk);
      else if(/(?:確認する|決める|固める|整理する|絞る|見る|詰める)$/.test(firstAsk))approachParts.push(firstAsk);
      else approachParts.push(`まず ${firstAsk} を確認する`);
    }
  }else if(snapshot.displayNextAction){
    const nextActionText=String(snapshot.displayNextAction||"").trim();
    if(/^Clarify:\s*/i.test(nextActionText)){
      approachParts.push(`まず ${nextActionText.replace(/^Clarify:\s*/i,"").trim()} を確認する`);
    }else if(/^Plan around\s+/i.test(nextActionText)){
      approachParts.push(`まず ${nextActionText.replace(/^Plan around\s+/i,"").trim()} を満たす形に寄せる`);
    }else if(/^Stay inside\s+/i.test(nextActionText)){
      approachParts.push(`まず ${nextActionText.replace(/^Stay inside\s+/i,"").trim()} の範囲に絞る`);
    }else if(/^Clarify the core contract before execution\.?$/i.test(nextActionText)){
      approachParts.push("まず要件の芯を固める");
    }else{
      approachParts.push(nextActionText);
    }
  }else if(snapshot.openQuestions.length){
    approachParts.push(`まず ${summarizeInlineListForUi(snapshot.openQuestions,{maxItems:2})} を確認し、要件確認の範囲で方向を固める`);
  }else if(snapshot.acceptanceChecks.length){
    approachParts.push(`まず ${summarizeInlineListForUi(snapshot.acceptanceChecks,{maxItems:2})} を満たす形を決める`);
  }else if(snapshot.baselineScope.length){
    approachParts.push(`まず ${summarizeInlineListForUi(snapshot.baselineScope,{maxItems:2})} の範囲に絞って計画へ落とす`);
  }else{
    approachParts.push("まず依頼された範囲を外さず、余計なスコープを増やさずに計画へ進む");
  }
  if(snapshot.contractStatus==="BLOCKED"){
    approachParts.push("今は未解決事項の整理が先で、まだ実装や設定変更には進まない");
  }else if(snapshot.contractStatus==="REVISED"){
    approachParts.push("前ターンとの差分を反映したうえで計画を更新する");
  }else if(snapshot.contractStatus==="LOCKED"){
    approachParts.push("この解釈を土台に次の計画を作る");
  }
  if(approachParts.length){
    rows.push({label:"進め方",text:`${approachParts.join("。")}。`});
  }
  const holdReason=snapshot.contractStatus==="BLOCKED"
    ?(
      snapshot.displayHoldReason
      || snapshot.contractStatusReason
      || ((snapshot.validationHighlights&&snapshot.validationHighlights.length)?snapshot.validationHighlights[0]:"")
      || (snapshot.assumptions.length&&!snapshot.openQuestions.length?`前提: ${summarizeInlineListForUi(snapshot.assumptions,{maxItems:2})}`:"")
    )
    :(
      snapshot.displayHoldReason
      || ""
    );
  if(holdReason){
    rows.push({
      label:snapshot.contractStatus==="BLOCKED"?"止まる理由":"補足",
      text:holdReason,
    });
  }
  const boundaryParts=[];
  if(snapshot.displayBoundaries&&snapshot.displayBoundaries.length)boundaryParts.push(summarizeInlineListForUi(snapshot.displayBoundaries,{maxItems:3}));
  else{
    if(snapshot.nonGoals.length)boundaryParts.push(`非対象 ${summarizeInlineListForUi(snapshot.nonGoals,{maxItems:2})}`);
    if(snapshot.mustAvoid.length)boundaryParts.push(`避けること ${summarizeInlineListForUi(snapshot.mustAvoid,{maxItems:2})}`);
    if(snapshot.hardConstraints.length)boundaryParts.push(`厳守 ${summarizeInlineListForUi(snapshot.hardConstraints,{maxItems:2})}`);
  }
  if(boundaryParts.length){
    rows.push({label:"守る線",text:boundaryParts.join(" / ")});
  }
  if(!rows.length){
    rows.push({label:"進め方",text:"この解釈を土台に、余計なスコープを増やさず次の計画へ進む。"});
  }
  return [{
    title:"AIの方針",
    summaryLabel:snapshot.contractStatus==="LOCKED"||snapshot.contractStatus==="REVISED"?"確定した見立て":"いまの見立て",
    summary:interpretation,
    rows:rows.slice(0,3),
  }];
}
function requirementNeedsFurtherLockForUi(snapshot){
  if(!snapshot||!snapshot.hasRequirement)return false;
  if(snapshot.contractStatus==="BLOCKED")return true;
  if(snapshot.validationVerdict==="BLOCK")return true;
  if(snapshot.validationVerdict==="WARN"&&((snapshot.displayAskNext&&snapshot.displayAskNext.length)||snapshot.openQuestions.length))return true;
  return false;
}
function applyRequirementPhaseStateForUi(flowItems,snapshot){
  const phases=Array.isArray(flowItems)?flowItems:[];
  const requirementPhase=phases.find((phase)=>phase&&phase.id==="requirements");
  if(!requirementPhase)return;
  if(requirementNeedsFurtherLockForUi(snapshot)){
    requirementPhase.state="blocked";
    const count=(snapshot.displayAskNext&&snapshot.displayAskNext.length)||snapshot.openQuestions.length||0;
    requirementPhase.detail=count>0?`要確認 ${count}`:(snapshot.contractStatusLabel||"保留");
    return;
  }
  if(requirementPhase.state==="blocked"){
    requirementPhase.state="done";
  }
}
function buildPhaseSummariesForUi({flowItems,requirementSnapshot,displayedPlan,evidence,runtimeContext,verdict,status,turn}={}){
  const planSteps=displayedPlan&&Array.isArray(displayedPlan.steps)?displayedPlan.steps:[];
  const dispatchPlan=dispatchPlanForUi(turn);
  const dispatches=Array.isArray(dispatchPlan.dispatches)?dispatchPlan.dispatches:[];
  const currentStatus=lowerText(status);
  const requirementGateBlocked=requirementNeedsFurtherLockForUi(requirementSnapshot);
  const familyGateLabel=runtimeContext&&runtimeContext.gateApplies?familyGateStatusLabelForUi(runtimeContext.gateStatus):"";
  const summaryMap={};
  summaryMap.requirements=requirementSnapshot&&requirementSnapshot.hasRequirement
    ?`${requirementSnapshot.contractStatusLabel?`状態 ${requirementSnapshot.contractStatusLabel} / `:""}目的解釈 ${requirementSnapshot.headline||"整理中"} / 受け入れ ${requirementSnapshot.acceptanceChecks.length||0} / 非対象 ${requirementSnapshot.nonGoals.length||0} / 前提 ${requirementSnapshot.assumptions.length||0}${requirementSnapshot.displayAskNext&&requirementSnapshot.displayAskNext.length?` / 質問 ${requirementSnapshot.displayAskNext.length}`:requirementSnapshot.openQuestions.length?` / 未解決 ${requirementSnapshot.openQuestions.length}`:""}${requirementSnapshot.validationVerdictLabel?` / 検証 ${requirementSnapshot.validationVerdictLabel}`:""}`
    :`要件ロック待ち${currentStatus&&currentStatus!=="idle"?" / 依頼は送信済み":""}`;
  if(requirementGateBlocked){
    summaryMap.planning="要件整理が保留のため、計画には進まない";
  }else if(displayedPlan&&displayedPlan.decision==="skip"){
    summaryMap.planning=planSkipReasonLabelForUi(displayedPlan.skipReason);
  }else if(planSteps.length){
    const completedCount=planSteps.filter((step)=>step.status==="completed").length;
    const owners=dispatches.map((entry)=>t1(entry&&entry.ownerAgent,80).trim()).filter(Boolean);
    const ownerSummary=owners.length?` / 担当 ${summarizeInlineListForUi(owners,{maxItems:2})}`:"";
    summaryMap.planning=`計画 ${completedCount}/${planSteps.length} 完了${ownerSummary}${dispatches.length?` / dispatch ${dispatches.length}`:""}`;
  }else{
    summaryMap.planning="明示プラン待ち";
  }
  if(requirementGateBlocked){
    summaryMap.execution="要件整理が保留のため、実装・操作には進まない";
  }else if(currentStatus==="completed"){
    summaryMap.execution=`実装・操作は完了 / タスク ${Number(evidence&&evidence.tasksDone)||0}`;
  }else if(currentStatus==="running"||currentStatus==="starting"||currentStatus==="needs_input"){
    summaryMap.execution=`実行中 / タスク ${Number(evidence&&evidence.tasksDone)||0}/${Number(evidence&&evidence.tasksTotal)||0}`;
  }else{
    summaryMap.execution="実装・検証はまだ始まっていません";
  }
  summaryMap.quality=requirementGateBlocked
    ?"要件整理が保留のため、品証には進まない"
    :`テスト ${Number(evidence&&evidence.tests)||0} / レビュー ${Number(evidence&&evidence.reviews)||0} / ログ ${Number(evidence&&evidence.logs)||0}${familyGateLabel?` / family gate ${familyGateLabel}`:""}`;
  summaryMap.report=requirementGateBlocked
    ?"要件整理の確定待ち"
    :currentStatus==="completed"
    ?`最終判定 ${verdict&&verdict.label?verdict.label:"PASS"}${runtimeContext&&runtimeContext.gateApplies?` / gate ${familyGateLabel}`:""}`
    :currentStatus==="failed"||currentStatus==="interrupted"
      ?`報告前に停止 / ${verdict&&verdict.label?verdict.label:"FAIL"}`
      :currentStatus==="needs_input"
        ?"報告保留 / ユーザー入力待ち"
        :"最終報告待ち";
  return toArr(flowItems).reduce((acc,phase)=>{
    if(!phase||!phase.id)return acc;
    acc[phase.id]=summaryMap[phase.id]||String(phase.detail||"").trim();
    return acc;
  },{});
}
function runtimeAgentHasActiveTurn(runtime,agentName){
  const wanted=normalizeAgentNameForUi(agentName);
  if(!wanted)return false;
  return runtimeAgentsFromPayload(runtime).some((item)=>{
    if(!item||typeof item!=="object")return false;
    const runtimeAgent=normalizeAgentNameForUi(item.name);
    const activeTurnId=typeof item.activeTurnId==="string"?item.activeTurnId.trim():"";
    return runtimeAgent===wanted&&Boolean(activeTurnId);
  });
}
function collectStalePendingRequestIds(runtime=s.runtime){
  const latestTurn=latestRuntimeTurn(runtime);
  const latestStatus=runtimeTurnStatusForUi(latestTurn);
  if(!["completed","failed","interrupted"].includes(latestStatus))return[];
  const latestAgent=runtimeTurnAgentForUi(latestTurn);
  const latestThreadId=runtimeTurnThreadIdForUi(latestTurn);
  const latestTurnId=runtimeTurnIdForUi(latestTurn);
  const latestCompletedAt=runtimeTurnCompletedAtForUi(latestTurn);
  const staleIds=[];
  s.req.forEach((row,rid)=>{
    if(!row||typeof row!=="object")return;
    const c=chat(row.cid);
    const chatAgent=normalizeAgentNameForUi(c&&c.agent?c.agent:row.agent);
    if(!chatAgent||runtimeAgentHasActiveTurn(runtime,chatAgent))return;
    const chatThread=typeof c?.h?.thread==="string"?c.h.thread.trim():"";
    const sameThread=Boolean(chatThread&&latestThreadId&&chatThread===latestThreadId);
    const sameAgent=Boolean(latestAgent&&chatAgent===latestAgent);
    if(!sameThread&&!sameAgent)return;
    const startedAt=toPerfInt(row.at);
    if(startedAt&&latestCompletedAt&&latestCompletedAt<startedAt)return;
    staleIds.push(rid);
    if(c){
      if(latestThreadId&&!c.h.thread)c.h.thread=latestThreadId;
      if(latestTurnId&&!c.h.turn)c.h.turn=latestTurnId;
      hset(c,latestStatus);
    }
  });
  return staleIds;
}
function reconcilePendingRequestsWithRuntime(runtime=s.runtime,{refreshUi=true}={}){
  const staleIds=collectStalePendingRequestIds(runtime);
  if(!staleIds.length)return 0;
  staleIds.forEach((rid)=>{
    const row=s.req.get(rid);
    if(!row)return;
    const c=chat(row.cid);
    if(c)c.pending=Math.max(0,toPerfInt(c.pending)-1);
    s.req.delete(rid);
  });
  if(refreshUi)refresh();
  return staleIds.length;
}
function startRuntimePendingSyncTicker(){
  if(runtimePendingSyncState.timer!==null||s.req.size===0)return;
  runtimePendingSyncState.timer=setInterval(()=>{
    if(runtimePendingSyncState.inFlight||s.req.size===0)return;
    runtimePendingSyncState.inFlight=true;
    loadRuntime({reconcilePending:true}).catch(()=>{}).finally(()=>{
      runtimePendingSyncState.inFlight=false;
      if(s.req.size===0)stopRuntimePendingSyncTicker();
    });
  },RUNTIME_PENDING_SYNC_MS);
}
function stopRuntimePendingSyncTicker(){
  if(runtimePendingSyncState.timer!==null){
    clearInterval(runtimePendingSyncState.timer);
    runtimePendingSyncState.timer=null;
  }
  runtimePendingSyncState.inFlight=false;
}
function syncRuntimePendingMonitor(){
  if(s.req.size>0){
    startRuntimePendingSyncTicker();
    return;
  }
  stopRuntimePendingSyncTicker();
}
function pendingCountForChat(chatId){
  const id=typeof chatId==="string"?chatId:"";
  if(!id)return 0;
  const chatRecord=chat(id);
  const agentName=normalizeAgentNameForUi(chatRecord&&chatRecord.agent?chatRecord.agent:"");
  const localCount=localPendingCountForChat(id);
  let runtimeCount=0;
  if(agentName){
    rAgents().forEach((item)=>{
      if(!item||typeof item!=="object")return;
      const runtimeAgent=normalizeAgentNameForUi(item.name);
      const activeTurnId=typeof item.activeTurnId==="string"?item.activeTurnId.trim():"";
      if(runtimeAgent===agentName&&activeTurnId)runtimeCount+=1;
    });
  }
  return Math.max(localCount,runtimeCount);
}
function totalPendingCount(){
  return s.chats.reduce((sum,item)=>sum+pendingCountForChat(item&&item.id),0);
}
const selectedCwd=()=>{const chosen=e.workspacePath&&typeof e.workspacePath.value==="string"?e.workspacePath.value.trim():"";if(chosen)return chosen;return s.runtime&&typeof s.runtime.workspaceRoot==="string"?s.runtime.workspaceRoot:"";};
const controlApiCfg=()=>s.runtime&&s.runtime.controlApi&&typeof s.runtime.controlApi==="object"?s.runtime.controlApi:null;
const controlApiToken=()=>{const cfg=controlApiCfg();return cfg&&typeof cfg.token==="string"?cfg.token.trim():"";};
const controlApiTokenHeader=()=>{const cfg=controlApiCfg();return cfg&&typeof cfg.tokenHeader==="string"&&cfg.tokenHeader.trim()?cfg.tokenHeader.trim():"x-codex-control-token";};
const controlApiAllows=(action)=>{
  const cfg=controlApiCfg();
  const wanted=typeof action==="string"?action.trim():"";
  if(!wanted||!cfg||!Array.isArray(cfg.actionAllowlist))return false;
  return cfg.actionAllowlist.includes(wanted);
};
function normalizePathForUi(value){
  const raw=typeof value==="string"?value.trim():"";
  if(!raw)return"";
  const normalized=raw.replace(/\//g,"\\");
  if(/^[A-Za-z]:\\$/.test(normalized))return normalized.toLowerCase();
  return normalized.replace(/\\+$/,"").toLowerCase();
}
function isPathWithinForUi(rootPath,candidatePath){
  const root=normalizePathForUi(rootPath);
  const candidate=normalizePathForUi(candidatePath);
  if(!root||!candidate)return false;
  if(candidate===root)return true;
  return candidate.startsWith(`${root}\\`);
}
function workspaceGuardSnapshotForUi(){
  const source=s.runtime&&(s.runtime.workspaceGuard||s.runtime.workspace_guard)&&typeof(s.runtime.workspaceGuard||s.runtime.workspace_guard)==="object"
    ?(s.runtime.workspaceGuard||s.runtime.workspace_guard)
    :{};
  return{
    locked:Boolean(source.locked),
    lockedRoot:typeof source.lockedRoot==="string"&&source.lockedRoot.trim()?source.lockedRoot.trim():"",
    requiredForSources:Array.isArray(source.requiredForSources)?source.requiredForSources.map((entry)=>String(entry||"").trim()).filter(Boolean):[],
    rejectWhenUnlocked:Boolean(source.rejectWhenUnlocked),
  };
}
function setWorkspaceGuardNotice(message,{tone=""}={}){
  workspaceGuardUiState.message=t1(message||"",220).trim();
  workspaceGuardUiState.tone=typeof tone==="string"?tone.trim():"";
  renderWorkspaceGuardUi();
}
function clearWorkspaceGuardNotice(){
  workspaceGuardUiState.message="";
  workspaceGuardUiState.tone="";
  renderWorkspaceGuardUi();
}
function workspaceGuardErrorInfoForUi(error){
  const source=error&&error.payload&&typeof error.payload==="object"
    ?error.payload
    :(error&&error.cause&&error.cause.payload&&typeof error.cause.payload==="object"?error.cause.payload:null);
  const code=source&&typeof source.code==="string"?source.code.trim():"";
  const runtimeGuard=source&&source.workspaceGuard&&typeof source.workspaceGuard==="object"?source.workspaceGuard:{};
  const selectedPath=selectedCwd();
  if(code==="workspace_lock_required"){
    const lockTarget=selectedPath||"現在のワークスペース";
    return{
      handled:true,
      status:"needs_input",
      tone:"warning",
      detail:`この依頼は見た目変更を含むため、workspace lock が必要です。ワークスペース欄を確認し、「このパスで lock」を押してから再送してください。`,
      inlineMessage:`この依頼はデザイン寄りの実行なので workspace lock が必要です。\n対象: ${lockTarget}\n操作: 設定の「このパスで lock」を押してから再送してください。`,
      systemMessage:`送信保留: この依頼は workspace lock が必要です。対象フォルダを確認し、「このパスで lock」を押してから再送してください。`,
      notice:`この依頼は workspace lock が必要です。対象フォルダを確認し、「このパスで lock」を押してから再送してください。`,
      workspaceGuard:runtimeGuard,
    };
  }
  if(code==="outside_locked_workspace"){
    const lockedRoot=typeof runtimeGuard.lockedRoot==="string"&&runtimeGuard.lockedRoot.trim()?runtimeGuard.lockedRoot.trim():"(lock 未設定)";
    return{
      handled:true,
      status:"needs_input",
      tone:"warning",
      detail:`選択中のワークスペースが現在の lock 範囲外です。lock 中のルートへ戻すか、unlock 後に正しいフォルダで lock し直してください。`,
      inlineMessage:`選択中のワークスペースが lock 範囲外です。\n現在の lock: ${lockedRoot}\n操作: lock 中のフォルダ配下へ戻すか、unlock して正しいパスで lock し直してください。`,
      systemMessage:`送信保留: 選択中のワークスペースが lock 範囲外です。`,
      notice:`選択中のワークスペースが現在の lock 範囲外です。lock 中のルートへ戻すか、unlock して正しいパスで lock し直してください。`,
      workspaceGuard:runtimeGuard,
    };
  }
  return{handled:false};
}
function renderWorkspaceGuardUi(){
  if(!e.workspaceStatus&&!e.workspaceLockBtn&&!e.workspaceUnlockBtn)return;
  const snapshot=workspaceGuardSnapshotForUi();
  const selectedPath=selectedCwd();
  const hasToken=Boolean(controlApiToken());
  const selectedInsideLock=snapshot.locked&&selectedPath?isPathWithinForUi(snapshot.lockedRoot,selectedPath):false;
  let text="";
  let tone="";
  if(workspaceGuardUiState.message){
    text=workspaceGuardUiState.message;
    tone=workspaceGuardUiState.tone;
  }else if(snapshot.locked){
    text=selectedPath&&!selectedInsideLock
      ?`Lock 中: ${snapshot.lockedRoot} / 現在の入力先は lock 範囲外です。`
      :`Lock 中: ${snapshot.lockedRoot} / この配下だけ実行できます。`;
    tone=selectedPath&&!selectedInsideLock?"warning":"locked";
  }else{
    const requiredSources=snapshot.requiredForSources.length?snapshot.requiredForSources.join(", "):"design-sensitive source";
    text=selectedPath
      ?`未固定: ${selectedPath} / ${requiredSources} では lock 後に送信します。`
      :"未固定: ワークスペースを選ぶと、ここから lock できます。";
    tone="warning";
  }
  if(e.workspaceStatus){
    e.workspaceStatus.textContent=text;
    e.workspaceStatus.classList.remove("locked","warning");
    if(tone==="locked")e.workspaceStatus.classList.add("locked");
    if(tone==="warning")e.workspaceStatus.classList.add("warning");
  }
  if(e.workspaceLockBtn){
    e.workspaceLockBtn.disabled=!hasToken||!selectedPath||(snapshot.locked&&selectedInsideLock);
    e.workspaceLockBtn.title=!hasToken
      ?"control API token unavailable. refresh runtime first."
      :!selectedPath
        ?"lock するワークスペースを指定してください。"
        :snapshot.locked&&selectedInsideLock
          ?"このパスはすでに lock 済みです。"
          :"";
  }
  if(e.workspaceUnlockBtn){
    e.workspaceUnlockBtn.disabled=!hasToken||!snapshot.locked;
    e.workspaceUnlockBtn.title=!hasToken
      ?"control API token unavailable. refresh runtime first."
      :!snapshot.locked
        ?"現在 lock はありません。"
        :"";
  }
  renderFocusPanel();
  renderMissionSupportUi();
}
async function postWorkspaceGuardMutationForUi(pathname,payload){
  const token=controlApiToken();
  if(!token)throw new Error("control API token unavailable. refresh runtime first.");
  const headers={"Content-Type":"application/json"};
  headers[controlApiTokenHeader()]=token;
  const response=await fetch(pathname,{method:"POST",headers,body:JSON.stringify(payload)});
  const bodyText=await response.text();
  const parsed=parseJsonSafe(bodyText)||{};
  if(!response.ok||parsed.ok===false){
    throw buildExecResponseError(response,bodyText);
  }
  return parsed;
}
async function lockSelectedWorkspaceForUi(){
  const targetPath=selectedCwd();
  if(!targetPath){
    setWorkspaceGuardNotice("lock するワークスペースが未指定です。", {tone:"warning"});
    return false;
  }
  const payload=await postWorkspaceGuardMutationForUi("/api/workspace/lock",{action:"lock_workspace_directory",path:targetPath});
  if(s.runtime&&payload&&payload.workspaceGuard)s.runtime.workspaceGuard=payload.workspaceGuard;
  setWorkspaceGuardNotice(`workspace を固定しました: ${targetPath}`,{tone:"locked"});
  try{await loadRuntime({reconcilePending:false});}catch{}
  refresh();
  return true;
}
async function unlockWorkspaceForUi(){
  const payload=await postWorkspaceGuardMutationForUi("/api/workspace/unlock",{action:"unlock_workspace_directory"});
  if(s.runtime&&payload&&payload.workspaceGuard)s.runtime.workspaceGuard=payload.workspaceGuard;
  setWorkspaceGuardNotice("workspace lock を解除しました。", {tone:"warning"});
  try{await loadRuntime({reconcilePending:false});}catch{}
  refresh();
  return true;
}
const IMAGE_MAX_BYTES=10*1024*1024;
const IMAGE_EXT_TO_MIME={".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".gif":"image/gif"};
const IMAGE_MIME_TO_EXT={"image/png":".png","image/jpeg":".jpg","image/webp":".webp","image/gif":".gif"};
const IMAGE_ALLOWED_MIME=new Set(Object.values(IMAGE_EXT_TO_MIME));
const IMAGE_ALLOWED_EXT=new Set(Object.keys(IMAGE_EXT_TO_MIME));
const composerAttachment={items:[],error:"",nextId:1};
const composerLayoutState={promptInputBaseHeight:0,viewportSyncFrame:0};
function measurePromptInputBaseHeight(){
  if(!e.promptInput)return 0;
  const previousHeight=e.promptInput.style.height;
  e.promptInput.style.height="";
  const computed=window.getComputedStyle(e.promptInput);
  const rendered=e.promptInput.getBoundingClientRect().height;
  const minHeight=parseFloat(computed.minHeight)||0;
  e.promptInput.style.height=previousHeight;
  const baseHeight=Math.max(Math.round(rendered),Math.round(minHeight));
  composerLayoutState.promptInputBaseHeight=baseHeight>0?baseHeight:0;
  return composerLayoutState.promptInputBaseHeight;
}
function syncPromptInputHeight({resetToBase=false,remeasureBase=false}={}){
  if(!e.promptInput)return;
  const baseHeight=remeasureBase||composerLayoutState.promptInputBaseHeight<=0
    ?measurePromptInputBaseHeight()
    :composerLayoutState.promptInputBaseHeight;
  if(baseHeight>0)e.promptInput.style.height=`${baseHeight}px`;
  if(resetToBase||!String(e.promptInput.value||"").length){
    scheduleComposerViewportSyncForUi();
    return;
  }
  const nextHeight=Math.max(baseHeight,Math.ceil(e.promptInput.scrollHeight));
  e.promptInput.style.height=`${nextHeight}px`;
  scheduleComposerViewportSyncForUi();
}
function createHarnessSignals(){
  return{requirement:false,dispatch:false,turnStart:false,turnCompleted:false,plan:false,planInferred:false,delegation:false,quality:false};
}
function createHarnessPlanMeta(){
  return{
    source:"",
    decision:"",
    skipReason:"",
    planningMode:"",
    planningDepth:"",
    assuranceDepth:"",
    flowPath:"",
    generatedBy:"",
  };
}
function createHarnessState(){
  return{
    status:"idle",
    thread:"",
    turn:"",
    at:0,
    events:[],
    planExp:"",
    plan:[],
    planMeta:createHarnessPlanMeta(),
    tokens:"",
    diff:"",
    flow:[
      {id:"requirements",label:"1. 要件整理",detail:"曖昧依頼を契約可能仕様へ収束",state:"todo"},
      {id:"planning",label:"2. 計画作成",detail:"実行計画と担当を定義",state:"todo"},
      {id:"execution",label:"3. 実行",detail:"Codexが実装・検証を実行",state:"todo"},
      {id:"quality",label:"4. 品質確認",detail:"証拠確認と統合ゲート判定",state:"todo"},
      {id:"report",label:"5. 報告",detail:"結果報告と次アクション提示",state:"todo"}
    ],
    evidence:{tasksDone:0,tasksTotal:0,tests:0,reviews:0,logs:0},
    signals:createHarnessSignals(),
    turnSnapshot:null
  };
}
function createPerformanceState(sessionRef=""){
  return{
    sessionRef:typeof sessionRef==="string"?sessionRef.trim():"",
    turnsCompleted:0,
    baseTokens:0,
    baseProcessingMs:0,
    liveTurnId:"",
    liveTurnStartedAt:0,
    liveTokens:0,
    historyTokens:[],
    historyProcessingMs:[],
    historyAt:[],
    updatedAt:Date.now(),
  };
}
function ensureChatPerformance(chatRecord,sessionRef=""){
  if(!chatRecord||typeof chatRecord!=="object")return createPerformanceState(sessionRef);
  const normalizedSession=typeof sessionRef==="string"?sessionRef.trim():"";
  if(!chatRecord.perf||typeof chatRecord.perf!=="object"){
    chatRecord.perf=createPerformanceState(normalizedSession);
    return chatRecord.perf;
  }
  const perf=chatRecord.perf;
  if(normalizedSession&&perf.sessionRef!==normalizedSession){
    chatRecord.perf=createPerformanceState(normalizedSession);
    return chatRecord.perf;
  }
  if(typeof perf.sessionRef!=="string")perf.sessionRef="";
  if(!Array.isArray(perf.historyTokens))perf.historyTokens=[];
  if(!Array.isArray(perf.historyProcessingMs))perf.historyProcessingMs=[];
  if(!Array.isArray(perf.historyAt))perf.historyAt=[];
  perf.turnsCompleted=toPerfInt(perf.turnsCompleted);
  perf.baseTokens=toPerfInt(perf.baseTokens);
  perf.baseProcessingMs=toPerfInt(perf.baseProcessingMs);
  perf.liveTurnId=typeof perf.liveTurnId==="string"?perf.liveTurnId:"";
  perf.liveTurnStartedAt=toPerfInt(perf.liveTurnStartedAt);
  perf.liveTokens=toPerfInt(perf.liveTokens);
  perf.updatedAt=toPerfInt(perf.updatedAt)||Date.now();
  return perf;
}
function toPerfInt(value){
  return Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))):0;
}
function trimPerfHistory(perfState=s.perf){
  const perf=perfState&&typeof perfState==="object"?perfState:s.perf;
  const max=80;
  if(perf.historyTokens.length>max)perf.historyTokens=perf.historyTokens.slice(-max);
  if(perf.historyProcessingMs.length>max)perf.historyProcessingMs=perf.historyProcessingMs.slice(-max);
  if(perf.historyAt.length>max)perf.historyAt=perf.historyAt.slice(-max);
}
function resetPerformanceState(sessionRef=""){
  s.perf=createPerformanceState(sessionRef);
}
function ensurePerformanceSession(sessionRef){
  const normalized=typeof sessionRef==="string"?sessionRef.trim():"";
  if(!normalized)return;
  if(s.perf.sessionRef!==normalized){
    resetPerformanceState(normalized);
  }
}
function pushPerformanceHistory(tokens,processingMs,at=Date.now(),perfState=s.perf){
  const perf=perfState&&typeof perfState==="object"?perfState:s.perf;
  const tokenValue=toPerfInt(tokens);
  const msValue=toPerfInt(processingMs);
  const atValue=toPerfInt(at)||Date.now();
  const lastIndex=perf.historyTokens.length-1;
  if(lastIndex>=0&&perf.historyTokens[lastIndex]===tokenValue&&perf.historyProcessingMs[lastIndex]===msValue){
    perf.historyAt[lastIndex]=atValue;
    return;
  }
  perf.historyTokens.push(tokenValue);
  perf.historyProcessingMs.push(msValue);
  perf.historyAt.push(atValue);
  trimPerfHistory(perf);
}
function syncPerformanceFromRuntime(runtime){
  const rt=runtime&&typeof runtime==="object"?runtime:{};
  const activeSession=typeof rt.sessionRef==="string"?rt.sessionRef:"";
  const perfRaw=rt.sessionPerformance&&typeof rt.sessionPerformance==="object"
    ?rt.sessionPerformance
    :(rt.session_performance&&typeof rt.session_performance==="object"?rt.session_performance:null);
  if(!perfRaw){
    if(activeSession&&activeSession!==s.perf.sessionRef){
      resetPerformanceState(activeSession);
    }
    s.perf.updatedAt=Date.now();
    renderPerformanceIndicator();
    return;
  }
  const cumulative=perfRaw.cumulative&&typeof perfRaw.cumulative==="object"?perfRaw.cumulative:{};
  const live=perfRaw.live&&typeof perfRaw.live==="object"?perfRaw.live:{};
  const history=perfRaw.history&&typeof perfRaw.history==="object"?perfRaw.history:{};
  s.perf={
    sessionRef:typeof perfRaw.sessionRef==="string"&&perfRaw.sessionRef.trim()?perfRaw.sessionRef.trim():(activeSession||""),
    turnsCompleted:toPerfInt(perfRaw.turnsCompleted),
    baseTokens:toPerfInt(cumulative.totalTokens),
    baseProcessingMs:toPerfInt(cumulative.processingMs),
    liveTurnId:Boolean(live.active)&&typeof live.turnId==="string"?live.turnId:"",
    liveTurnStartedAt:Boolean(live.active)?toPerfInt(live.startedAt):0,
    liveTokens:Boolean(live.active)&&live.tokenUsage&&typeof live.tokenUsage==="object"?toPerfInt(live.tokenUsage.totalTokens):0,
    historyTokens:toArr(history.tokens).map((value)=>toPerfInt(value)).slice(-80),
    historyProcessingMs:toArr(history.processingMs).map((value)=>toPerfInt(value)).slice(-80),
    historyAt:toArr(history.at).map((value)=>toPerfInt(value)).slice(-80),
    updatedAt:toPerfInt(perfRaw.updatedAt)||Date.now(),
  };
  trimPerfHistory();
  renderPerformanceIndicator();
}
function onPerformanceTurnStarted(chatRecord,ev){
  if(!chatRecord||!ev||typeof ev!=="object")return;
  const sessionRef=typeof ev.threadId==="string"?ev.threadId.trim():"";
  const perf=ensureChatPerformance(chatRecord,sessionRef);
  if(sessionRef&&!perf.sessionRef)perf.sessionRef=sessionRef;
  perf.liveTurnId=typeof ev.turnId==="string"?ev.turnId:"";
  perf.liveTurnStartedAt=Date.now();
  perf.liveTokens=0;
  perf.updatedAt=Date.now();
}
function onPerformanceTokenUsage(chatRecord,ev){
  if(!chatRecord||!ev||typeof ev!=="object")return;
  const sessionRef=typeof ev.threadId==="string"?ev.threadId.trim():"";
  const perf=ensureChatPerformance(chatRecord,sessionRef);
  const turnId=typeof ev.turnId==="string"?ev.turnId:"";
  if(turnId){
    if(perf.liveTurnId&&perf.liveTurnId!==turnId)return;
    perf.liveTurnId=turnId;
  }
  if(!perf.liveTurnStartedAt)perf.liveTurnStartedAt=Date.now();
  const usage=ev.usage&&typeof ev.usage==="object"?ev.usage:{};
  perf.liveTokens=toPerfInt(usage.totalTokens);
  perf.updatedAt=Date.now();
}
function onPerformanceTurnCompleted(chatRecord,ev){
  if(!chatRecord||!ev||typeof ev!=="object")return;
  const sessionRef=typeof ev.threadId==="string"?ev.threadId.trim():"";
  const perf=ensureChatPerformance(chatRecord,sessionRef);
  const turnId=typeof ev.turnId==="string"?ev.turnId:"";
  if(turnId&&perf.liveTurnId&&perf.liveTurnId!==turnId)return;
  const now=Date.now();
  const elapsed=perf.liveTurnStartedAt?Math.max(0,now-perf.liveTurnStartedAt):0;
  perf.baseTokens=toPerfInt(perf.baseTokens)+toPerfInt(perf.liveTokens);
  perf.baseProcessingMs=toPerfInt(perf.baseProcessingMs)+elapsed;
  perf.turnsCompleted=toPerfInt(perf.turnsCompleted)+1;
  pushPerformanceHistory(perf.baseTokens,perf.baseProcessingMs,now,perf);
  perf.liveTurnId="";
  perf.liveTurnStartedAt=0;
  perf.liveTokens=0;
  perf.updatedAt=now;
}
function buildSparkSeries(history,current){
  const values=toArr(history).map((value)=>toPerfInt(value)).slice(-32);
  const normalizedCurrent=toPerfInt(current);
  if(!values.length||values[values.length-1]!==normalizedCurrent)values.push(normalizedCurrent);
  return values.slice(-32);
}
function renderSparkline(svg,series,color){
  if(!svg)return;
  const values=toArr(series).map((value)=>toPerfInt(value)).filter((value)=>Number.isFinite(value));
  const width=100;
  const height=28;
  const pad=2;
  const xmlns="http://www.w3.org/2000/svg";
  svg.innerHTML="";
  const line=document.createElementNS(xmlns,"line");
  line.setAttribute("x1","0");
  line.setAttribute("x2",String(width));
  line.setAttribute("y1",String(height-pad));
  line.setAttribute("y2",String(height-pad));
  line.setAttribute("stroke","#223754");
  line.setAttribute("stroke-width","1");
  svg.appendChild(line);
  if(!values.length)return;
  if(values.length===1)values.unshift(values[0]);
  const min=Math.min(...values);
  const max=Math.max(...values);
  const range=Math.max(1,max-min);
  const points=values.map((value,index)=>{
    const x=values.length===1?width/2:(index/(values.length-1))*(width-pad*2)+pad;
    const y=(height-pad)-(((value-min)/range)*(height-pad*2));
    return`${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const polyline=document.createElementNS(xmlns,"polyline");
  polyline.setAttribute("points",points);
  polyline.setAttribute("fill","none");
  polyline.setAttribute("stroke",color);
  polyline.setAttribute("stroke-width","2");
  polyline.setAttribute("stroke-linecap","round");
  polyline.setAttribute("stroke-linejoin","round");
  svg.appendChild(polyline);
}
function renderPerformanceIndicator(){
  if(!e.performancePanel)return;
  const now=Date.now();
  const currentChat=active();
  const currentChatId=currentChat&&currentChat.id?currentChat.id:"";
  const currentPending=currentChatId?pendingCountForChat(currentChatId):0;
  const currentThread=typeof currentChat?.h?.thread==="string"?currentChat.h.thread.trim():"";
  const perf=currentChat?ensureChatPerformance(currentChat,currentThread):s.perf;
  const activeLive=Boolean(currentPending>0&&perf.sessionRef&&(perf.liveTurnStartedAt||perf.liveTokens));
  const liveProcessingMs=perf.liveTurnStartedAt?Math.max(0,now-perf.liveTurnStartedAt):0;
  const liveTokensForUi=activeLive?toPerfInt(perf.liveTokens):0;
  const liveProcessingMsForUi=activeLive?liveProcessingMs:0;
  const totalTokens=toPerfInt(perf.baseTokens)+liveTokensForUi;
  const totalProcessingMs=toPerfInt(perf.baseProcessingMs)+liveProcessingMsForUi;
  const sessionRefForUi=perf.sessionRef||currentThread||"";
  const hasPerfState=Boolean(sessionRefForUi||perf.baseTokens||perf.baseProcessingMs||perf.turnsCompleted||perf.historyTokens.length||activeLive);
  if(e.perfSessionRef)e.perfSessionRef.textContent=sessionRefForUi||"none";
  if(e.perfUpdatedAt)e.perfUpdatedAt.textContent=hasPerfState?tt(perf.updatedAt||now):"--:--:--";
  if(e.perfTokenValue)e.perfTokenValue.textContent=fmtInt(totalTokens);
  if(e.perfTokenDetail)e.perfTokenDetail.textContent=hasPerfState?`実行中 +${fmtInt(liveTokensForUi)}`:"このチャットではまだ計測がありません";
  if(e.perfTimeValue)e.perfTimeValue.textContent=fmtInt(totalProcessingMs);
  if(e.perfTimeDetail)e.perfTimeDetail.textContent=hasPerfState?`実行中 +${fmtInt(liveProcessingMsForUi)}ms / 完了 ${fmtInt(perf.turnsCompleted)} 回`:"実行すると計測を始めます";
  renderSparkline(e.perfTokenSpark,buildSparkSeries(perf.historyTokens,totalTokens),"#6cb1ff");
  renderSparkline(e.perfTimeSpark,buildSparkSeries(perf.historyProcessingMs,totalProcessingMs),"#55d79b");
  e.performancePanel.classList.toggle("running",activeLive);
}
function rAgents(){return s.runtime&&Array.isArray(s.runtime.agents)?s.runtime.agents:[]}
function monitorTone(status){
  const v=String(status||"").toLowerCase();
  if(v.includes("fail")||v.includes("error")||v.includes("abort")||v.includes("interrupt")||v.includes("needs_input")||v.includes("blocked"))return"failed";
  if(v.includes("complete")||v.includes("done")||v.includes("pass")||v.includes("success")||v.includes("ready"))return"completed";
  if(v.includes("spawn")||v.includes("run")||v.includes("busy")||v.includes("work")||v.includes("progress")||v.includes("stream"))return"running";
  return"idle";
}
function normalizeMonitorAgent(raw,index,{runtimeFallback=false}={}){
  const item=raw&&typeof raw==="object"?raw:{};
  const nameSource=[item.name,item.agentName,item.agent,item.id].find((value)=>typeof value==="string"&&value.trim());
  const name=nameSource?nameSource.trim():`agent-${index+1}`;
  let roleSource=item.role;
  if(Array.isArray(roleSource))roleSource=roleSource.filter(Boolean).join(", ");
  if(roleSource&&typeof roleSource==="object"){
    if(typeof roleSource.name==="string")roleSource=roleSource.name;
    else if(typeof roleSource.id==="string")roleSource=roleSource.id;
    else roleSource="";
  }
  const roleFallback=typeof roleSource==="string"&&roleSource.trim()?roleSource.trim():(runtimeFallback?"runtime":"unknown");
  const role=inferAgentRoleForUi(name)==="parent"?"parent":roleFallback;
  let statusSource=item.status;
  if(typeof statusSource!=="string"||!statusSource.trim()){
    if(typeof item.state==="string"&&item.state.trim())statusSource=item.state.trim();
    else if(typeof item.phase==="string"&&item.phase.trim())statusSource=item.phase.trim();
    else if(typeof item.health==="string"&&item.health.trim())statusSource=item.health.trim();
    else if(typeof item.isActive==="boolean")statusSource=item.isActive?"selected":"idle";
    else statusSource=runtimeFallback?"idle":"unknown";
  }
  const activeTurnId=typeof item.activeTurnId==="string"?item.activeTurnId:"";
  if(activeTurnId.trim())statusSource="running";
  else if(Boolean(item.isActive)&&/^(?:configured|idle)$/i.test(String(statusSource||"").trim()))statusSource="selected";
  return{
    name,
    role,
    status:String(statusSource),
    tone:monitorTone(statusSource),
    source:typeof item.source==="string"?item.source:"",
    threadId:typeof item.threadId==="string"?item.threadId:"",
    activeTurnId,
    sessionRef:typeof item.sessionRef==="string"?item.sessionRef:"",
    isActive:Boolean(item.isActive),
    description:typeof item.description==="string"?item.description:"",
    updatedAt:Number.isFinite(Number(item.updatedAt))?Math.max(0,Math.trunc(Number(item.updatedAt))):0,
    completedAt:Number.isFinite(Number(item.completedAt))?Math.max(0,Math.trunc(Number(item.completedAt))):0,
    parentThreadId:typeof item.parentThreadId==="string"?item.parentThreadId:"",
    parentTurnId:typeof item.parentTurnId==="string"?item.parentTurnId:"",
    governance:item&&item.governance&&typeof item.governance==="object"?item.governance:{},
  };
}
function extractTopographyAgents(payload){
  if(Array.isArray(payload))return payload;
  if(payload&&typeof payload==="object"){
    if(Array.isArray(payload.agents))return payload.agents;
    if(Array.isArray(payload.items))return payload.items;
    if(Array.isArray(payload.data))return payload.data;
  }
  return[];
}
function runtimeAgentsForMonitor(runtime){
  const rt=runtime&&typeof runtime==="object"?runtime:{};
  const list=toArr(rt.agents).map((item,index)=>normalizeMonitorAgent(item,index,{runtimeFallback:true})).filter((item)=>item&&item.name);
  if(list.length)return list;
  if(typeof rt.activeAgent==="string"&&rt.activeAgent.trim()){
    return[{name:rt.activeAgent.trim(),role:"runtime",status:"selected",tone:"idle"}];
  }
  return[];
}
function syncedTopographyRows(rows){
  const trackedChatScopes=trackedChatScopesForUi();
  const activeContext=activeChatTopographyContextForUi(rows);
  const shouldIncludeRow=(raw)=>{
    const row=raw&&typeof raw==="object"?raw:{name:raw};
    const normalized=normalizeAgentNameForUi(row.name);
    if(!normalized||isHiddenAgentForUi(normalized))return false;
    const chatScope=chatScopeFromAgentNameForUi(normalized);
    if(!chatScope)return true;
    if((typeof row.activeTurnId==="string"&&row.activeTurnId.trim())||Boolean(row.isActive))return true;
    if(activeContext.hasCurrentChatSignals&&activeContext.matchNames.size){
      return monitorAgentMatchesForUi(normalized,activeContext.matchNames);
    }
    return shouldRenderMonitorAgentNameForUi(normalized,{trackedChatScopes});
  };
  const baseByName=new Map();
  toArr(rows).forEach((raw,index)=>{
    const normalized=normalizeMonitorAgent(raw,index);
    if(normalized&&normalized.name&&shouldIncludeRow(normalized)){
      baseByName.set(normalized.name,{...normalized,synced:false,syncDetail:"",syncAt:0});
    }
  });

  const pendingByAgent=new Map();
  s.req.forEach((item)=>{
    const chatId=item&&typeof item.cid==="string"?item.cid.trim():"";
    if(chatId!==activeContext.currentChatId)return;
    const name=resolveMonitorAgentNameForUi(item&&typeof item.agent==="string"?item.agent.trim():"",baseByName);
    if(!name||!shouldIncludeRow({name}))return;
    pendingByAgent.set(name,(pendingByAgent.get(name)||0)+1);
  });

  const latestTraceByAgent=new Map();
  s.trace.forEach((item)=>{
    const chatId=item&&typeof item.cid==="string"?item.cid.trim():"";
    if(chatId!==activeContext.currentChatId)return;
    const name=resolveMonitorAgentNameForUi(item&&typeof item.agent==="string"?item.agent.trim():"",baseByName);
    if(!name||!shouldIncludeRow({name})||latestTraceByAgent.has(name))return;
    latestTraceByAgent.set(name,item);
  });

  const names=new Set([...baseByName.keys(),...pendingByAgent.keys(),...latestTraceByAgent.keys()]);
  const canonicalParentsWithScopedVariants=new Set();
  names.forEach((name)=>{
    const normalized=normalizeAgentNameForUi(name);
    const scope=agentScopeFromNameForUi(normalized);
    const canonical=canonicalParentAgentNameForUi(normalized);
    if(scope&&canonical&&canonical!==normalized&&PARENT_AGENT_NAMES.has(canonical)){
      canonicalParentsWithScopedVariants.add(canonical);
    }
  });
  const merged=[];
  names.forEach((name)=>{
    const normalizedName=normalizeAgentNameForUi(name);
    if(canonicalParentsWithScopedVariants.has(normalizedName))return;
    const row=baseByName.get(name)||{name,role:"trace",status:"idle",tone:"idle",synced:false,syncDetail:"",syncAt:0};
    const pendingCount=pendingByAgent.get(name)||0;
    const lastTrace=latestTraceByAgent.get(name)||null;
    if(pendingCount>0){
      row.status=pendingCount>1?`running (${pendingCount})`:"running";
      row.tone="running";
      row.synced=true;
      row.syncAt=Date.now();
      row.syncDetail=lastTrace?`trace ${tt(lastTrace.at)} / ${lastTrace.type}`:"trace sync / pending";
    }else if(lastTrace){
      const traceKind=traceTone(lastTrace.type);
      if(lastTrace.type==="aborted"){
        row.status="interrupted";
        row.tone="failed";
      }else if(lastTrace.type==="failed"){
        row.status="failed";
        row.tone="failed";
      }else if(lastTrace.type==="completed"){
        row.status="completed";
        row.tone="completed";
      }else if(traceKind==="running"){
        row.status=lastTrace.type;
        row.tone="running";
      }else{
        row.status=lastTrace.type;
        row.tone="idle";
      }
      row.synced=true;
      row.syncAt=lastTrace.at||0;
      row.syncDetail=`trace ${tt(lastTrace.at)} / ${lastTrace.type}${lastTrace.detail?` / ${t1(lastTrace.detail,40)}`:""}`;
    }
    merged.push(row);
  });

  const toneRank={running:0,failed:1,completed:2,idle:3};
  merged.sort((a,b)=>{
    const aRank=Object.prototype.hasOwnProperty.call(toneRank,a.tone)?toneRank[a.tone]:9;
    const bRank=Object.prototype.hasOwnProperty.call(toneRank,b.tone)?toneRank[b.tone]:9;
    if(aRank!==bRank)return aRank-bRank;
    return String(a.name||"").localeCompare(String(b.name||""));
  });
  return merged;
}
function renderAgentTopography(){
  if(!e.agentTopographyPanel||!e.agentTopographyMeta||!e.agentTopographyList)return;
  e.agentTopographyPanel.classList.toggle("loading",topographyState.loading);
  e.agentTopographyPanel.classList.toggle("fallback",topographyState.usingFallback&&!topographyState.error);
  e.agentTopographyPanel.classList.toggle("error",Boolean(topographyState.error));
  if(e.agentTopographyRefreshBtn)e.agentTopographyRefreshBtn.disabled=topographyState.loading;

  const rows=syncedTopographyRows(topographyState.agents);
  const lanes=groupTopographyRowsForUi(rows);
  const syncedCount=rows.filter((row)=>row.synced).length;
  const latestSyncAt=rows.reduce((max,row)=>Math.max(max,Number.isFinite(Number(row.syncAt))?Number(row.syncAt):0),0);
  if(topographyState.loading)e.agentTopographyMeta.textContent="更新中...";
  else if(topographyState.error)e.agentTopographyMeta.textContent=`取得失敗: ${topographyState.error}`;
  else{
    const currentChat=active();
    const sourceLabel=topographyState.usingFallback?"代替 /api/runtime":"/api/agent-topography";
    const at=topographyState.lastUpdated?tt(topographyState.lastUpdated):"--:--:--";
    const chatLabel=currentChat&&typeof currentChat.title==="string"&&currentChat.title.trim()?` / ${currentChat.title.trim()}`:"";
    const laneSummary=lanes.map((lane)=>`${lane.label} ${lane.items.length}`).join(" / ");
    const traceSync=syncedCount>0?` / trace sync ${syncedCount} @ ${tt(latestSyncAt||Date.now())}`:"";
    e.agentTopographyMeta.textContent=`${sourceLabel}${chatLabel} @ ${at} / ${laneSummary}${traceSync}`;
  }

  e.agentTopographyList.innerHTML="";
  if(!rows.length){
    const empty=document.createElement("div");
    empty.className="agent-topography-empty";
    empty.textContent=topographyState.error?"エージェント情報を取得できませんでした。":"表示できるエージェントがありません。";
    e.agentTopographyList.appendChild(empty);
    return;
  }
  lanes.forEach((lane)=>{
    const laneSection=document.createElement("section");
    laneSection.className=`agent-topography-lane agent-topography-lane-${lane.id}`;
    const laneHead=document.createElement("div");
    laneHead.className="agent-topography-lane-head";
    const laneTitle=document.createElement("h3");
    laneTitle.className="agent-topography-lane-title";
    laneTitle.textContent=lane.label;
    const laneCount=document.createElement("span");
    laneCount.className="agent-topography-lane-count";
    laneCount.textContent=String(lane.items.length);
    laneHead.appendChild(laneTitle);
    laneHead.appendChild(laneCount);
    laneSection.appendChild(laneHead);

    const laneCards=document.createElement("div");
    laneCards.className="agent-topography-cards";
    if(!lane.items.length){
      const empty=document.createElement("div");
      empty.className="agent-topography-empty";
      empty.textContent=lane.empty;
      laneCards.appendChild(empty);
    }else{
      lane.items.forEach((row)=>{
        const card=document.createElement("article");
        card.className="agent-topography-item";
        if(row.synced)card.classList.add("synced");
        if(isRunningMonitorAgentForUi(row))card.classList.add("active");
        const line=document.createElement("div");
        line.className="agent-topography-line";
        const name=document.createElement("p");
        name.className="agent-topography-name";
        name.textContent=operatorFacingAgentLabelForUi(row.name)||"unknown";
        const status=document.createElement("span");
        status.className=`agent-topography-status ${row.tone||"idle"}`;
        status.textContent=row.status||"unknown";
        line.appendChild(name);
        line.appendChild(status);
        card.appendChild(line);

        const role=document.createElement("p");
        role.className="agent-topography-role";
        role.textContent=`区分: ${monitorRoleLabelForUi(row)} / source: ${row.source||"unknown"}`;
        card.appendChild(role);

        const session=document.createElement("p");
        session.className="agent-topography-role";
        const sessionParts=[];
        if(row.sessionRef)sessionParts.push(`session ${compactMonitorRefForUi(row.sessionRef)}`);
        if(row.threadId&&!row.sessionRef)sessionParts.push(`thread ${compactMonitorRefForUi(row.threadId)}`);
        if(row.activeTurnId)sessionParts.push(`turn ${compactMonitorRefForUi(row.activeTurnId)}`);
        session.textContent=sessionParts.length?sessionParts.join(" / "):"session なし";
        card.appendChild(session);

        if(row.syncDetail){
          const sync=document.createElement("p");
          sync.className="agent-topography-sync";
          sync.textContent=row.syncDetail;
          card.appendChild(sync);
        }else if(row.description){
          const desc=document.createElement("p");
          desc.className="agent-topography-sync";
          desc.textContent=t1(row.description,72);
          card.appendChild(desc);
        }
        laneCards.appendChild(card);
      });
    }
    laneSection.appendChild(laneCards);
    e.agentTopographyList.appendChild(laneSection);
  });
}
function stopAgentTopographyTicker(){
  if(topographyState.timer!==null){
    clearInterval(topographyState.timer);
    topographyState.timer=null;
  }
  if(topographyState.refreshSoonTimer!==null){
    clearTimeout(topographyState.refreshSoonTimer);
    topographyState.refreshSoonTimer=null;
  }
}
function startAgentTopographyTicker(){
  stopAgentTopographyTicker();
  topographyState.timer=setInterval(()=>{loadAgentTopography().catch(()=>{});},TOPOGRAPHY_REFRESH_MS);
}
function scrollElementIntoViewForUi(target,{focus=false}={}){
  if(!target||typeof target.scrollIntoView!=="function")return;
  target.scrollIntoView({behavior:"smooth",block:"nearest"});
  if(focus&&typeof target.focus==="function"){
    try{
      target.focus({preventScroll:true});
    }catch{
      target.focus();
    }
  }
}
function setFocusCardToneForUi(element,tone=""){
  if(!element)return;
  element.className=tone?`focus-card ${tone}`:"focus-card";
}
function decodeMessageHrefForUi(value){
  const text=String(value||"");
  if(!text)return"";
  try{return decodeURIComponent(text)}catch{return text}
}
function messageReferenceLocationForUi(value){
  const normalized=String(value||"").trim();
  const match=normalized.match(/#L(\d+)(?:C(\d+))?$/i);
  return{
    line:match&&match[1]?match[1]:"",
    column:match&&match[2]?match[2]:"",
  };
}
function messageReferenceFileNameForUi(value){
  const normalized=String(value||"").replace(/#.*$/,"").replace(/\\/g,"/").replace(/\/+$/,"");
  if(!normalized)return"";
  const parts=normalized.split("/");
  return parts[parts.length-1]||normalized;
}
function messageReferenceDisplayPathForUi(value){
  const normalized=String(value||"").replace(/#.*$/,"").replace(/\\/g,"/").replace(/\/+$/,"");
  if(!normalized)return"";
  const parts=normalized.split("/").filter(Boolean);
  const repoMarkerIndex=parts.findIndex((part)=>/^codex_/i.test(part));
  if(repoMarkerIndex>=0&&repoMarkerIndex<parts.length-1){
    return parts.slice(repoMarkerIndex+1).join("/");
  }
  if(parts.length<=3)return parts.join("/");
  return parts.slice(-3).join("/");
}
function parseMessageReferenceForUi(label,href){
  const rawLabel=String(label||"").trim();
  const rawHref=decodeMessageHrefForUi(href).trim();
  const hrefWithoutHash=rawHref.replace(/#.*$/,"");
  const hrefLocation=messageReferenceLocationForUi(rawHref);
  const labelLocation=messageReferenceLocationForUi(rawLabel);
  const line=hrefLocation.line||labelLocation.line||"";
  const column=hrefLocation.column||labelLocation.column||"";
  const localPath=/^\/[A-Za-z]:[\\/]/.test(hrefWithoutHash)||/^[A-Za-z]:[\\/]/.test(hrefWithoutHash)
    ?hrefWithoutHash.replace(/^\//,"")
    :"";
  const displayPath=messageReferenceDisplayPathForUi(localPath);
  const fileName=messageReferenceFileNameForUi(localPath||rawLabel||rawHref);
  const visibleLabel=localPath?(fileName||rawLabel||rawHref):(rawLabel||rawHref);
  const shortLabel=localPath
    ?`${fileName}${line?`:${line}${column?`:${column}`:""}`:""}`
    :(rawLabel||rawHref);
  return{
    kind:localPath?"local_file":(/^https?:\/\//i.test(rawHref)?"external_link":"generic_link"),
    rawLabel,
    rawHref,
    localPath,
    fileName,
    displayPath,
    line,
    column,
    visibleLabel:visibleLabel||fileName||rawHref||rawLabel,
    shortLabel:shortLabel||fileName||rawHref||rawLabel,
    title:localPath
      ?`${displayPath||fileName}${line?` • L${line}${column?`C${column}`:""}`:""}`
      :(rawHref||rawLabel),
  };
}
function normalizeMessageReferencesForUi(text){
  return String(text||"").replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(_,label,href)=>parseMessageReferenceForUi(label,href).visibleLabel);
}
function compactInlineTextForUi(text){
  return normalizeMessageReferencesForUi(text).replace(/\s+/g," ").trim();
}
function extractStitchPromptContextForUi(prompt){
  const text=String(prompt||"");
  if(!/stitch/i.test(text))return null;
  const lines=text.split(/\r?\n/);
  let section="";
  let projectTitle="";
  let projectId="";
  const screens=[];
  let currentScreen=null;
  for(const rawLine of lines){
    const headingMatch=String(rawLine||"").match(/^\s{0,3}#{1,6}\s*(.+?)\s*$/);
    if(headingMatch){
      const heading=String(headingMatch[1]||"").trim().toLowerCase();
      if(heading.includes("project"))section="project";
      else if(heading.includes("screen"))section="screens";
      else section="";
      continue;
    }
    const line=String(rawLine||"").replace(/^\s*[-*+]\s*/,"").trim();
    if(!line)continue;
    const titleMatch=line.match(/^title\s*:\s*(.+)$/i);
    if(titleMatch&&titleMatch[1]){
      projectTitle=String(titleMatch[1]||"").trim();
      continue;
    }
    const idMatch=line.match(/^id\s*:\s*([A-Za-z0-9_-]+)\s*$/i);
    if(idMatch&&idMatch[1]){
      if(section==="screens"&&currentScreen&&!currentScreen.id)currentScreen.id=idMatch[1];
      else if(!projectId||section==="project")projectId=idMatch[1];
      continue;
    }
    if(section==="screens"){
      const screenTitle=line.replace(/^\s*\d+[.)]\s*/,"").trim();
      if(!screenTitle||/^screens?\s*:/i.test(screenTitle)||/^use a utility/i.test(screenTitle))continue;
      currentScreen={title:screenTitle,id:""};
      screens.push(currentScreen);
    }
  }
  const fetchImagesAndCode=/get the images and code|images and code/i.test(text);
  const requiresHostedUrlDownload=/curl\s+-L/i.test(text)||/hosted urls?/i.test(text);
  const strictRecreation=/(?:完全再現|忠実再現|pixel-?perfect|recreate(?: it)? exactly|match as closely as possible|same as the reference|verbatim recreation)/i.test(text);
  if(!projectTitle&&!projectId&&!screens.length&&!fetchImagesAndCode&&!requiresHostedUrlDownload)return null;
  return{
    projectTitle,
    projectId,
    screens,
    fetchImagesAndCode,
    requiresHostedUrlDownload,
    strictRecreation,
  };
}
function renderStitchPromptContextForUi(element,stitchContext){
  if(!element||!stitchContext||typeof stitchContext!=="object")return;
  const context=stitchContext;
  const primaryScreen=Array.isArray(context.screens)&&context.screens.length?context.screens[0]:null;
  const rows=[];
  if(context.projectTitle||context.projectId){
    rows.push({label:"Project",text:[context.projectTitle,context.projectId?`ID ${context.projectId}`:""].filter(Boolean).join(" / ")});
  }
  if(primaryScreen&&primaryScreen.title){
    const screenParts=[primaryScreen.title,primaryScreen.id?`ID ${primaryScreen.id}`:""];
    if(Array.isArray(context.screens)&&context.screens.length>1)screenParts.push(`他 ${context.screens.length-1} 画面`);
    rows.push({label:"Screen",text:screenParts.filter(Boolean).join(" / ")});
  }
  if(context.fetchImagesAndCode){
    rows.push({label:"取得物",text:"画像とコードを取得して実装の基準にする"});
  }
  if(context.requiresHostedUrlDownload){
    rows.push({label:"取得方法",text:"hosted URL は curl -L で取得する"});
  }
  if(context.strictRecreation){
    rows.push({label:"再現方針",text:"完全再現を優先し、独自アレンジを混ぜない"});
  }
  if(!rows.length)return;
  element.appendChild(document.createTextNode("\n\n"));
  const card=document.createElement("span");
  card.className="message-stitch-card";
  const head=document.createElement("span");
  head.className="message-stitch-head";
  const title=document.createElement("span");
  title.className="message-stitch-title";
  title.textContent="Stitch参照";
  head.appendChild(title);
  card.appendChild(head);
  rows.slice(0,4).forEach((entry)=>{
    const row=document.createElement("span");
    row.className="message-stitch-row";
    const label=document.createElement("span");
    label.className="message-stitch-label";
    label.textContent=entry.label;
    const text=document.createElement("span");
    text.className="message-stitch-text";
    text.textContent=entry.text;
    row.appendChild(label);
    row.appendChild(text);
    card.appendChild(row);
  });
  element.appendChild(card);
}
function renderMessageContentForUi(element,text){
  if(!element)return;
  element.textContent="";
  const source=String(text||"");
  if(!source)return;
  const pattern=/\[([^\]]+)\]\(([^)\s]+)\)/g;
  let lastIndex=0;
  let match=null;
  while((match=pattern.exec(source))){
    const before=source.slice(lastIndex,match.index);
    if(before)element.appendChild(document.createTextNode(before));
    const reference=parseMessageReferenceForUi(match[1],match[2]);
    if(reference.kind==="local_file"){
      const chip=document.createElement("span");
      chip.className="message-ref-chip file";
      chip.title=reference.title;
      const name=document.createElement("span");
      name.className="message-ref-name";
      name.textContent=reference.visibleLabel||reference.fileName||reference.shortLabel;
      chip.appendChild(name);
      element.appendChild(chip);
    }else{
      const link=document.createElement("a");
      link.className="message-ref-link";
      link.href=reference.rawHref||"#";
      link.target="_blank";
      link.rel="noopener noreferrer";
      link.title=reference.title;
      link.textContent=reference.shortLabel;
      element.appendChild(link);
    }
    lastIndex=pattern.lastIndex;
  }
  const after=source.slice(lastIndex);
  if(after)element.appendChild(document.createTextNode(after));
  renderStitchPromptContextForUi(element,extractStitchPromptContextForUi(source));
}
function conversationSnapshotForUi(chatRecord){
  const messages=Array.isArray(chatRecord&&chatRecord.messages)?chatRecord.messages.filter((item)=>item&&typeof item==="object"):[];
  const hasConversation=messages.some((item)=>item.role!=="system"&&compactInlineTextForUi(item.content));
  return{
    hasConversation,
    messages:hasConversation?messages:[],
  };
}
function latestConversationPreviewForUi(chatRecord){
  const snapshot=conversationSnapshotForUi(chatRecord);
  for(let index=snapshot.messages.length-1;index>=0;index-=1){
    const item=snapshot.messages[index];
    const text=compactInlineTextForUi(item&&item.content);
    if(text)return t1(text,88);
  }
  return"まだ依頼はありません。";
}
function latestUserRequestTextForUi(chatRecord){
  const messages=Array.isArray(chatRecord&&chatRecord.messages)?chatRecord.messages.filter((item)=>item&&typeof item==="object"):[];  
  for(let index=messages.length-1;index>=0;index-=1){
    const item=messages[index];
    if(item.role!=="user")continue;
    const text=String(item.content||"").trim();
    if(text)return text;
  }
  return"";
}
function missionDraftSourceForUi(chatRecord){
  const draftText=e.promptInput&&typeof e.promptInput.value==="string"?e.promptInput.value:"";
  if(draftText.trim())return{text:draftText,source:"draft"};
  const requestText=latestUserRequestTextForUi(chatRecord);
  if(requestText)return{text:requestText,source:"request"};
  return{text:"",source:"empty"};
}
function extractMissionFieldByLabelForUi(text,labels){
  const sourceLines=String(text||"").split(/\r?\n/);
  const normalizedLabels=labels.map((label)=>String(label||"").trim().toLowerCase()).filter(Boolean);
  for(const rawLine of sourceLines){
    const line=String(rawLine||"").trim();
    if(!line)continue;
    const lowerLine=line.toLowerCase();
    for(const label of normalizedLabels){
      if(!lowerLine.startsWith(label))continue;
      const remainder=line.slice(label.length).replace(/^[\s:：-]+/,"").trim();
      if(remainder)return remainder;
    }
  }
  return"";
}
function collectMissionPathHintsForUi(text){
  const hints=new Set();
  const source=String(text||"");
  const addHint=(value)=>{
    const normalized=String(value||"").trim().replace(/^["'`]+|["'`]+$/g,"");
    if(!normalized)return;
    if(!(/[\\/]/.test(normalized)||/\.[A-Za-z0-9]{2,5}(?::\d+)?$/.test(normalized)))return;
    hints.add(normalized);
  };
  source.replace(/`([^`]+)`/g,(_match,value)=>{
    addHint(value);
    return"";
  });
  source.replace(/(?:[A-Za-z]:\\|\.{0,2}[\\/]|\/)?[A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)+(?:\.[A-Za-z0-9]{2,5})?/g,(value)=>{
    addHint(value);
    return value;
  });
  return[...hints].slice(0,3);
}
function deriveMissionDraftForUi(text,chatRecord){
  const source=String(text||"");
  const compact=compactInlineTextForUi(source);
  const workspace=workspaceGuardSnapshotForUi();
  const explicitGoal=extractMissionFieldByLabelForUi(source,["目的","goal","task"]);
  const explicitScope=extractMissionFieldByLabelForUi(source,["対象","scope","files","file","path","paths"]);
  const explicitConstraint=extractMissionFieldByLabelForUi(source,["制約","constraints","constraint","非対象","avoid","must avoid"]);
  const explicitDone=extractMissionFieldByLabelForUi(source,["完了条件","確認","done when","verify","verification","テスト","tests"]);
  const pathHints=collectMissionPathHintsForUi(source);
  const selectedPath=selectedCwd();
  const explicitCount=[explicitGoal,explicitScope||pathHints[0],explicitConstraint,explicitDone].filter(Boolean).length;
  const fallbackGoal=compact?t1(compact,88):"何を実現したいかを一文で書きます。";
  const fallbackScope=pathHints.length
    ?pathHints.join(" / ")
    :selectedPath
      ?t1(selectedPath,88)
      :chatRecord&&chatRecord.title
        ?`${chatRecord.title} で続ける範囲`
        :"対象のファイル、画面、または範囲を書きます。";
  const fallbackConstraint=compact&&/(?:維持|そのまま|避け|禁止|without|keep|do not|don't|must not|既存)/i.test(source)
    ?t1(compact,88)
    :"既存経路の維持、追加依存なし、触らない範囲などを書きます。";
  const fallbackDone=compact&&/(?:確認|テスト|review|検証|screenshot|docs|同期|完了条件)/i.test(source)
    ?t1(compact,88)
    :"テスト、画面確認、docs 同期など、完了の証拠を書きます。";
  return{
    goal:explicitGoal||fallbackGoal,
    scope:explicitScope||fallbackScope,
    constraint:explicitConstraint||fallbackConstraint,
    done:explicitDone||fallbackDone,
    explicitCount,
  };
}
function setComposerRuntimeChip(el,text,tone=""){
  if(!el)return;
  el.textContent=text;
  el.className=tone?`composer-runtime-chip ${tone}`:"composer-runtime-chip";
}
function renderComposerRuntimeStrip(){
  if(!e.composerModeChip&&!e.composerModelChip&&!e.composerWorkspaceChip&&!e.composerAttachmentChip)return;
  const profileLabel=executionProfileLabelForUi(e.executionProfile&&e.executionProfile.value);
  const webSearchMode=normalizeWebSearchModeForUi(e.webSearchMode&&e.webSearchMode.value,"cached");
  const workspace=workspaceGuardSnapshotForUi();
  const selectedPath=selectedCwd();
  const attachments=Array.isArray(composerAttachment.items)?composerAttachment.items:[];
  setComposerRuntimeChip(e.composerModeChip,`${profileLabel} / ${webSearchMode}`,webSearchMode==="live"?"ready":"");
  setComposerRuntimeChip(e.composerModelChip,`${selectedExecModel()} / ${selectedExecModelReasoningEffort()}`,"");
  if(workspace.locked){
    setComposerRuntimeChip(e.composerWorkspaceChip,`Lock: ${t1(workspace.lockedRoot,56)}`,"ready");
  }else if(selectedPath){
    setComposerRuntimeChip(e.composerWorkspaceChip,`Workspace: ${t1(selectedPath,56)}`,"warning");
  }else{
    setComposerRuntimeChip(e.composerWorkspaceChip,"Workspace 未指定","warning");
  }
  setComposerRuntimeChip(
    e.composerAttachmentChip,
    attachments.length?`画像 ${attachments.length} 件`:"添付なし",
    attachments.length?"ready":""
  );
}
function renderMissionSupportUi(){
  renderMissionDraftPanel();
  renderComposerRuntimeStrip();
}
function renderMissionDraftPanel(){
  if(!e.missionDraftStatus||!e.missionGoalValue||!e.missionScopeValue||!e.missionConstraintValue||!e.missionDoneValue)return;
  const currentChat=active();
  const draftSource=missionDraftSourceForUi(currentChat);
  if(!draftSource.text){
    e.missionDraftStatus.textContent="未入力";
    e.missionGoalValue.textContent="何を実現したいかを一文で書きます。";
    e.missionScopeValue.textContent="対象のファイル、画面、または範囲を書きます。";
    e.missionConstraintValue.textContent="守るべき制約や避けたいことを書きます。";
    e.missionDoneValue.textContent="テスト、画面確認、docs 同期など、完了の証拠を書きます。";
    return;
  }
  const mission=deriveMissionDraftForUi(draftSource.text,currentChat);
  const sourceLabel=draftSource.source==="draft"?"入力中":"直前の依頼";
  e.missionDraftStatus.textContent=`${sourceLabel} / 骨子 ${mission.explicitCount}/4`;
  e.missionGoalValue.textContent=mission.goal;
  e.missionScopeValue.textContent=mission.scope;
  e.missionConstraintValue.textContent=mission.constraint;
  e.missionDoneValue.textContent=mission.done;
}
function renderFocusPanel(){
  if(!e.focusActionTitle||!e.focusChatValue||!e.focusWorkspaceValue||!e.focusSendValue)return;
  const currentChat=active();
  if(!currentChat)return;
  const conversation=conversationSnapshotForUi(currentChat);
  const snapshot=workspaceGuardSnapshotForUi();
  const selectedPath=selectedCwd();
  const currentPending=pendingCountForChat(currentChat.id);
  const localPending=localPendingCountForChat(currentChat.id);
  const selectedInsideLock=snapshot.locked&&selectedPath?isPathWithinForUi(snapshot.lockedRoot,selectedPath):false;
  const agentLabel=operatorFacingAgentLabelForUi(currentChat.agent);
  const hasRuntime=Boolean(s.runtime);

  let actionTitle="依頼を書いて送信";
  let actionDetail="入力先を確認してから、やることと確認方法を書きます。";
  let actionHint="同じチャットで追記すると、前の文脈を引き継いだまま続けられます。";
  let actionTone="";

  if(!hasRuntime){
    actionTitle="ランタイム接続を待つ";
    actionDetail="接続できると送信と進行状況の追跡が使えます。";
    actionHint="接続が不安定なときは、保守ツールの再接続を使います。";
    actionTone="warning";
  }else if(currentPending>0){
    actionTitle="実行が終わるまで待つ";
    actionDetail=`このチャットで ${currentPending} 件実行中です。応答は下の会話欄へ追加されます。`;
    actionHint=localPending>0
      ?"途中で止める必要があるときだけ「停止」を使います。"
      :"他のチャットからの実行も含めて完了を待っています。";
    actionTone="running";
  }else if(snapshot.locked&&selectedPath&&!selectedInsideLock){
    actionTitle="入力先を lock 範囲に戻す";
    actionDetail="現在のワークスペースが lock 中の範囲外です。";
    actionHint="lock 中のフォルダ配下へ戻すか、unlock してから正しいパスで lock し直します。";
    actionTone="warning";
  }else if(!selectedPath){
    actionTitle="ワークスペースを確認する";
    actionDetail="まず入力先のフォルダを決めると、意図と変更先がずれにくくなります。";
    actionHint="見た目変更や UI 改修では、必要に応じて lock してから送信します。";
    actionTone="warning";
  }else if(!conversation.hasConversation){
    actionTitle="依頼を書いて送信";
    actionDetail="準備ができています。下の入力欄に、やること・対象・確認方法を書いて送信します。";
    actionHint=snapshot.locked
      ?"ワークスペースは lock 済みです。安心してこの範囲で依頼できます。"
      :"見た目変更を含む依頼なら、送信前に workspace lock をすると安全です。";
  }else if(s.last&&s.last.cid===currentChat.id){
    actionTitle="結果を見て次の依頼を書く";
    actionDetail=s.last.type==="failed"
      ?"直前の実行は失敗しました。原因を1つずつ切り分けて続行できます。"
      :"直前の実行結果を確認しながら、追加修正や確認を続けられます。";
    actionHint="同じチャットで追記すると、前の変更内容を踏まえた続きの依頼になります。";
    actionTone=s.last.type==="failed"?"warning":"completed";
  }

  e.focusActionTitle.className=actionTone?`focus-action-title ${actionTone}`:"focus-action-title";
  e.focusActionTitle.textContent=actionTitle;
  e.focusActionDetail.textContent=actionDetail;
  e.focusActionHint.textContent=actionHint;

  setFocusCardToneForUi(e.focusChatCard,currentPending>0?"running":"ready");
  e.focusChatValue.textContent=currentChat.title;
  e.focusChatHint.textContent=conversation.hasConversation
    ?`${agentLabel} / 会話 ${conversation.messages.length} 件`
    :`${agentLabel} / まだ依頼はありません。`;

  if(snapshot.locked&&selectedInsideLock){
    setFocusCardToneForUi(e.focusWorkspaceCard,"ready");
    e.focusWorkspaceValue.textContent="Lock 中";
    e.focusWorkspaceHint.textContent=t1(snapshot.lockedRoot,88);
  }else if(snapshot.locked&&!selectedInsideLock){
    setFocusCardToneForUi(e.focusWorkspaceCard,"warning");
    e.focusWorkspaceValue.textContent="範囲外";
    e.focusWorkspaceHint.textContent=`lock: ${t1(snapshot.lockedRoot,44)} / 現在: ${t1(selectedPath||"(未指定)",32)}`;
  }else if(selectedPath){
    setFocusCardToneForUi(e.focusWorkspaceCard,"warning");
    e.focusWorkspaceValue.textContent="未固定";
    e.focusWorkspaceHint.textContent=t1(selectedPath,88);
  }else{
    setFocusCardToneForUi(e.focusWorkspaceCard,"warning");
    e.focusWorkspaceValue.textContent="未選択";
    e.focusWorkspaceHint.textContent="ワークスペース欄で入力先を確認してください。";
  }

  if(!hasRuntime){
    setFocusCardToneForUi(e.focusSendCard,"warning");
    e.focusSendValue.textContent="接続待ち";
    e.focusSendHint.textContent="runtime が使えると送信できます。";
  }else if(currentPending>0){
    setFocusCardToneForUi(e.focusSendCard,"running");
    e.focusSendValue.textContent="実行中";
    e.focusSendHint.textContent=`${currentPending} 件進行中です。完了までは送信を待機します。`;
  }else if(snapshot.locked&&selectedPath&&!selectedInsideLock){
    setFocusCardToneForUi(e.focusSendCard,"warning");
    e.focusSendValue.textContent="要修正";
    e.focusSendHint.textContent="lock 範囲に戻すと送信できます。";
  }else{
    setFocusCardToneForUi(e.focusSendCard,"ready");
    e.focusSendValue.textContent="送信できます";
    e.focusSendHint.textContent=conversation.hasConversation
      ?"追加の依頼も同じ入力欄から送れます。"
      :"入力欄に依頼を書いて送信します。";
  }
}
function scheduleTopographyRefreshSoon(delayMs=180){
  if(!e.agentTopographyList)return;
  if(topographyState.refreshSoonTimer!==null)return;
  topographyState.refreshSoonTimer=setTimeout(()=>{
    topographyState.refreshSoonTimer=null;
    loadAgentTopography().catch(()=>{});
  },Math.max(0,Math.trunc(Number(delayMs)||0)));
}
async function loadAgentTopography({manual=false}={}){
  if(!e.agentTopographyList)return;
  const requestId=++topographyState.reqId;
  topographyState.loading=true;
  if(manual)topographyState.error="";
  renderAgentTopography();
  const applyState=(next)=>{
    if(requestId!==topographyState.reqId)return false;
    topographyState.agents=toArr(next.agents);
    topographyState.source=String(next.source||"");
    topographyState.error=String(next.error||"");
    topographyState.usingFallback=Boolean(next.usingFallback);
    topographyState.lastUpdated=Date.now();
    topographyState.loading=false;
    renderAgentTopography();
    return true;
  };
  try{
    const topographyRes=await fetch("/api/agent-topography",{cache:"no-store"});
    if(!topographyRes.ok)throw new Error(`HTTP ${topographyRes.status}`);
    const payload=await topographyRes.json();
    const agents=extractTopographyAgents(payload).map((item,index)=>normalizeMonitorAgent(item,index)).filter((item)=>item&&item.name);
    applyState({agents,source:"/api/agent-topography",error:"",usingFallback:false});
    return;
  }catch(topographyError){
    try{
      const runtimeRes=await fetch("/api/runtime",{cache:"no-store"});
      if(!runtimeRes.ok)throw new Error(`HTTP ${runtimeRes.status}`);
      const runtimePayload=await runtimeRes.json();
      s.runtime=runtimePayload;
      applyState({agents:runtimeAgentsForMonitor(runtimePayload),source:"/api/runtime",error:"",usingFallback:true});
      flow();
      return;
    }catch(runtimeError){
      const primaryMessage=topographyError&&topographyError.message?topographyError.message:"unavailable";
      const fallbackMessage=runtimeError&&runtimeError.message?runtimeError.message:"unavailable";
      applyState({agents:runtimeAgentsForMonitor(s.runtime),source:"",error:`topography ${primaryMessage}; runtime ${fallbackMessage}`,usingFallback:true});
    }
  }
}
function mkChat(o={}){
  const id=`chat-${s.nextChat++}-${Date.now()}`;
  const currentNumber=s.nextChat-1;
  const savedAgent=typeof o.agent==="string"&&o.agent.trim()?o.agent.trim():"";
  const c={
    id,
    title:o.title||`Chat ${currentNumber}`,
    agent:normalizeScopedChatAgentNameForUi(savedAgent,id),
    pending:0,
    messages:[],
    h:createHarnessState(),
    perf:createPerformanceState(),
    forceNewSession:o.forceNewSession!==false,
  };
  s.chats.push(c);
  if(!s.active||o.activate!==false)s.active=c.id;
  scheduleSaveChatState();
  return c;
}
function msg(cid,role,title,text){const c=chat(cid);if(!c)return null;const m={id:`m-${s.nextMsg++}`,role,title,time:new Date().toLocaleTimeString(),content:text||""};c.messages.push(m);scheduleSaveChatState();if(cid===s.active)renderTimeline();renderChatList();return{cid,id:m.id}}
function mset(r,t){const c=chat(r.cid);if(!c)return;const m=c.messages.find(x=>x.id===r.id);if(!m)return;m.content=t;scheduleSaveChatState();if(r.cid===s.active)renderTimeline()}
function madd(r,t){const c=chat(r.cid);if(!c)return;const m=c.messages.find(x=>x.id===r.id);if(!m)return;m.content+=t||"";scheduleSaveChatState();if(r.cid===s.active)renderTimeline()}
function extName(name){const v=String(name||"").trim();const i=v.lastIndexOf(".");return i<0?"":v.slice(i).toLowerCase();}
function fmtBytes(bytes){const b=Number.isFinite(Number(bytes))?Math.max(0,Number(bytes)):0;if(b<1024)return`${Math.round(b)} B`;if(b<1024*1024)return`${(b/1024).toFixed(1)} KB`;return`${(b/(1024*1024)).toFixed(2)} MB`;}
function imageRuleLabel(){return"PNG / JPEG / WEBP / GIF (最大10MB)";}
function validateAttachmentFile(file){
  if(!file||typeof file!=="object")return"画像ファイルを選択してください。";
  const name=String(file.name||"").trim();
  const extension=extName(name);
  if(!IMAGE_ALLOWED_EXT.has(extension))return`未対応の拡張子です。${imageRuleLabel()}のみ添付できます。`;
  const mime=String(file.type||"").toLowerCase();
  if(!IMAGE_ALLOWED_MIME.has(mime))return`未対応のMIMEタイプです。${imageRuleLabel()}のみ添付できます。`;
  const expectedMime=IMAGE_EXT_TO_MIME[extension];
  if(expectedMime&&mime!==expectedMime)return`拡張子とMIMEタイプが一致しません (${extension} / ${mime||"unknown"})。`;
  const size=Number.isFinite(Number(file.size))?Math.max(0,Math.trunc(Number(file.size))):0;
  if(size<=0)return"画像サイズを確認できません。別の画像を選択してください。";
  if(size>IMAGE_MAX_BYTES)return`画像サイズが上限を超えています。10MB以下の画像を選択してください。`;
  return"";
}
function setAttachmentError(text){
  composerAttachment.error=String(text||"").trim();
  renderAttachmentUi();
}
function clearAttachmentError(){
  if(!composerAttachment.error)return;
  composerAttachment.error="";
  renderAttachmentUi();
}
function revokeAttachmentPreview(item){
  if(!item||!item.previewUrl)return;
  try{URL.revokeObjectURL(item.previewUrl)}catch{}
}
function clearAttachment({keepError=false}={}){
  composerAttachment.items.forEach(revokeAttachmentPreview);
  composerAttachment.items=[];
  if(!keepError)composerAttachment.error="";
  if(e.imageInput)e.imageInput.value="";
  renderAttachmentUi();
}
function removeAttachmentFromComposer(itemId=null){
  if(itemId===null||itemId===undefined){
    clearAttachment();
  }else{
    const idx=composerAttachment.items.findIndex((item)=>item&&item.id===itemId);
    if(idx>=0){
      const removed=composerAttachment.items.splice(idx,1);
      removed.forEach(revokeAttachmentPreview);
      if(e.imageInput)e.imageInput.value="";
      renderAttachmentUi();
    }
  }
  if(e.promptInput&&typeof e.promptInput.focus==="function")e.promptInput.focus();
}
function addAttachmentFile(file){
  if(!file)return;
  let previewUrl="";
  try{
    previewUrl=URL.createObjectURL(file);
  }catch{
    previewUrl="";
  }
  composerAttachment.items.push({id:`img-${composerAttachment.nextId++}`,file,previewUrl});
}
function handleAttachmentPickFiles(filesInput){
  const files=filesInput&&typeof filesInput.length==="number"?Array.from(filesInput):filesInput?[filesInput]:[];
  const picked=files.filter(Boolean);
  if(!picked.length)return;
  const errors=[];
  picked.forEach((file)=>{
    const validationError=validateAttachmentFile(file);
    if(validationError){
      errors.push(`${String(file.name||"image")}: ${validationError}`);
      return;
    }
    addAttachmentFile(file);
  });
  if(errors.length){
    setAttachmentError(errors[0]);
  }else{
    clearAttachmentError();
  }
  if(e.imageInput)e.imageInput.value="";
  renderAttachmentUi();
}
function normalizePastedImageFile(file){
  if(!file||typeof file!=="object")return file;
  const name=String(file.name||"").trim();
  if(extName(name))return file;
  const mime=String(file.type||"").toLowerCase();
  const inferredExt=IMAGE_MIME_TO_EXT[mime]||"";
  if(!inferredExt||typeof File!=="function")return file;
  const lastModified=Number.isFinite(Number(file.lastModified))?Math.max(0,Math.trunc(Number(file.lastModified))):Date.now();
  try{
    return new File([file],`pasted-image-${Date.now()}${inferredExt}`,{type:mime||file.type||"",lastModified});
  }catch{
    return file;
  }
}
function getClipboardImageFiles(ev){
  const clipboard=ev&&ev.clipboardData?ev.clipboardData:null;
  if(!clipboard)return[];
  const images=[];
  const items=clipboard.items;
  if(items&&typeof items.length==="number"){
    for(let i=0;i<items.length;i+=1){
      const item=items[i];
      if(!item)continue;
      const type=String(item.type||"").toLowerCase();
      if(!type.startsWith("image/"))continue;
      const file=typeof item.getAsFile==="function"?item.getAsFile():null;
      if(file)images.push(normalizePastedImageFile(file));
    }
    if(images.length)return images;
  }
  const files=clipboard.files;
  if(files&&typeof files.length==="number"){
    for(let i=0;i<files.length;i+=1){
      const file=files[i];
      if(!file)continue;
      const type=String(file.type||"").toLowerCase();
      if(!type.startsWith("image/"))continue;
      images.push(normalizePastedImageFile(file));
    }
  }
  return images;
}
function handlePromptPaste(ev){
  const pastedImages=getClipboardImageFiles(ev);
  if(!pastedImages.length)return;
  handleAttachmentPickFiles(pastedImages);
}
function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>{if(typeof reader.result==="string")resolve(reader.result);else reject(new Error("画像データの読み込み結果が不正です。"));};
    reader.onerror=()=>reject(new Error("画像データの読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}
async function buildAttachmentPayload(file){
  const validationError=validateAttachmentFile(file);
  if(validationError)throw new Error(validationError);
  const dataUrl=await fileToDataUrl(file);
  return{name:String(file.name||"image"),mimeType:String(file.type||"").toLowerCase(),sizeBytes:Number.isFinite(Number(file.size))?Math.max(0,Math.trunc(Number(file.size))):0,dataUrl};
}
function composeUserMessage(prompt,imagePayloads){
  const text=String(prompt||"").trim();
  const images=Array.isArray(imagePayloads)?imagePayloads.filter((payload)=>payload&&payload.name):[];
  if(images.length){
    const imageLines=images.map((payload)=>`[image] ${payload.name} (${fmtBytes(payload.sizeBytes)})`);
    return text?`${text}\n${imageLines.join("\n")}`:imageLines.join("\n");
  }
  return text;
}
function shouldRenderTerminalErrorInTranscript(text,{finalApplied=false}={}){
  const normalized=String(text||"").trim();
  if(!normalized)return false;
  if(finalApplied)return false;
  return true;
}
function composeDispatchDetail(prompt,imagePayloads){
  const text=String(prompt||"").trim();
  if(text)return text;
  const images=Array.isArray(imagePayloads)?imagePayloads.filter((payload)=>payload&&payload.name):[];
  if(images.length===1)return`[image] ${images[0].name}`;
  if(images.length>1)return`[images] ${images.length} files`;
  return"";
}
function renderAttachmentUi(){
  const items=Array.isArray(composerAttachment.items)?composerAttachment.items:[];
  const previewSummary=by("imagePreviewSummary");
  const previewList=by("imagePreviewList");
  if(e.imagePreview){
    e.imagePreview.hidden=!items.length;
  }
  if(previewSummary){
    previewSummary.textContent=items.length?`${items.length}件の画像を添付中`:"";
  }
  if(previewList){
    previewList.innerHTML="";
    items.forEach((item)=>{
      if(!item||!item.file)return;
      const row=document.createElement("article");
      row.className="image-preview-item";
      const thumb=document.createElement("img");
      thumb.className="image-preview-thumb";
      if(item.previewUrl)thumb.src=item.previewUrl;
      thumb.alt=`${item.file.name||"image"} のプレビュー`;
      const info=document.createElement("div");
      info.className="image-preview-info";
      const name=document.createElement("p");
      name.className="image-preview-name";
      name.textContent=String(item.file.name||"image");
      const meta=document.createElement("p");
      meta.className="image-preview-meta";
      meta.textContent=`${fmtBytes(item.file.size)} / ${String(item.file.type||"unknown")}`;
      info.appendChild(name);
      info.appendChild(meta);
      const removeBtn=document.createElement("button");
      removeBtn.type="button";
      removeBtn.className="btn mini secondary";
      removeBtn.textContent="削除";
      removeBtn.onclick=()=>removeAttachmentFromComposer(item.id);
      row.appendChild(thumb);
      row.appendChild(info);
      row.appendChild(removeBtn);
      previewList.appendChild(row);
    });
  }
  if(e.imageRemoveBtn){
    e.imageRemoveBtn.hidden=!items.length;
  }
  if(e.imageError){
    const err=String(composerAttachment.error||"").trim();
    e.imageError.hidden=!err;
    e.imageError.textContent=err;
  }
  renderComposerRuntimeStrip();
  scheduleComposerViewportSyncForUi();
}
function ensureHarnessSignals(h){
  if(!h||typeof h!=="object")return createHarnessSignals();
  if(!h.signals||typeof h.signals!=="object")h.signals=createHarnessSignals();
  const source=h.signals;
  h.signals={
    requirement:Boolean(source.requirement),
    dispatch:Boolean(source.dispatch),
    turnStart:Boolean(source.turnStart),
    turnCompleted:Boolean(source.turnCompleted),
    plan:Boolean(source.plan),
    planInferred:Boolean(source.planInferred),
    delegation:Boolean(source.delegation),
    quality:Boolean(source.quality),
  };
  return h.signals;
}
function ensureHarnessPlanMeta(h){
  if(!h||typeof h!=="object")return createHarnessPlanMeta();
  if(!h.planMeta||typeof h.planMeta!=="object")h.planMeta=createHarnessPlanMeta();
  const source=h.planMeta;
  h.planMeta={
    source:typeof source.source==="string"?source.source:"",
    decision:typeof source.decision==="string"?source.decision:"",
    skipReason:typeof source.skipReason==="string"?source.skipReason:"",
    planningMode:typeof source.planningMode==="string"?source.planningMode:"",
    planningDepth:typeof source.planningDepth==="string"?source.planningDepth:"",
    assuranceDepth:typeof source.assuranceDepth==="string"?source.assuranceDepth:"",
    flowPath:typeof source.flowPath==="string"?source.flowPath:"",
    generatedBy:typeof source.generatedBy==="string"?source.generatedBy:"",
  };
  return h.planMeta;
}
function foldHarnessSignalsFromLabel(signals,labelText,detailText,statusText=""){
  const label=lowerText(labelText);
  const detail=lowerText(detailText);
  const status=lowerText(statusText);
  const text=`${label} ${detail}`.trim();
  if(label==="dispatch"){signals.dispatch=true;signals.requirement=true;}
  if(label==="turn/start"){signals.turnStart=true;signals.requirement=true;}
  if(label==="turn/completed"||label==="turn/end"||status==="completed"||status==="failed"||status==="interrupted")signals.turnCompleted=true;
  if(label==="plan/update"){signals.plan=true;signals.planInferred=false;}
  if(text.includes("collab agent tool")||text.includes("spawn_agent")||text.includes("spawnagent")||text.includes("receivers="))signals.delegation=true;
  if(text.includes("test")||text.includes("review")||text.includes("audit")||text.includes("guard"))signals.quality=true;
  if(signals.dispatch||signals.turnStart)signals.requirement=true;
}
function deriveHarnessOperationProfile(events){
  const profile={operationCount:0,commandCount:0,fileCount:0,mcpCount:0,webCount:0,imageCount:0,delegationCount:0,qualityCount:0,failedCount:0};
  toArr(events).forEach((item)=>{
    const label=lowerText(item&&item.l);
    const detail=lowerText(item&&item.d);
    const text=`${label} ${detail}`.trim();
    switch(label){
      case"command execution":
        profile.operationCount+=1;
        profile.commandCount+=1;
        break;
      case"file change":
        profile.operationCount+=1;
        profile.fileCount+=1;
        break;
      case"mcp tool":
        profile.operationCount+=1;
        profile.mcpCount+=1;
        break;
      case"web search":
        profile.operationCount+=1;
        profile.webCount+=1;
        break;
      case"image view":
        profile.operationCount+=1;
        profile.imageCount+=1;
        break;
      case"collab agent tool":
        profile.operationCount+=1;
        profile.delegationCount+=1;
        break;
      default:
        break;
    }
    if(text.includes("test")||text.includes("review")||text.includes("audit")||text.includes("guard"))profile.qualityCount+=1;
    if(lowerText(item&&item.tone)==="failed")profile.failedCount+=1;
  });
  return profile;
}
function shouldInferAdaptiveMicroPlan(h,signals){
  if(!h||!signals||signals.plan)return false;
  if(!signals.requirement&&!signals.turnStart)return false;
  const status=lowerText(h.status);
  if(status==="failed"||status==="interrupted")return false;
  const profile=deriveHarnessOperationProfile(h.events);
  if(profile.failedCount>0||profile.delegationCount>0||profile.qualityCount>0)return false;
  if(profile.fileCount>0||profile.mcpCount>0)return false;
  if(typeof h.diff==="string"&&h.diff.trim())return false;
  if(toArr(h.plan).length>0||String(h.planExp||"").trim())return false;
  if(profile.operationCount===0)return true;
  if(profile.operationCount===1&&(profile.commandCount===1||profile.webCount===1||profile.imageCount===1))return true;
  return false;
}
function getHarnessSignals(h,mode=activeHarnessCheckMode()){
  const signals=createHarnessSignals();
  if(h&&h.signals&&typeof h.signals==="object"){
    signals.requirement=Boolean(h.signals.requirement);
    signals.dispatch=Boolean(h.signals.dispatch);
    signals.turnStart=Boolean(h.signals.turnStart);
    signals.turnCompleted=Boolean(h.signals.turnCompleted);
    signals.plan=Boolean(h.signals.plan);
    signals.planInferred=Boolean(h.signals.planInferred);
    signals.delegation=Boolean(h.signals.delegation);
    signals.quality=Boolean(h.signals.quality);
  }
  toArr(h&&h.events).forEach((item)=>{
    foldHarnessSignalsFromLabel(signals,item&&item.l,item&&item.d,h&&h.status);
  });
  const explicitPlanInState=toArr(h&&h.plan).length>0;
  const explicitPlanInEvents=toArr(h&&h.events).some((item)=>lowerText(item&&item.l)==="plan/update");
  if(explicitPlanInState)signals.plan=true;
  if(explicitPlanInState||explicitPlanInEvents)signals.planInferred=false;
  if(h&&typeof h.status==="string"&&["completed","failed","interrupted"].includes(lowerText(h.status)))signals.turnCompleted=true;
  if(h&&((typeof h.turn==="string"&&h.turn.trim())||(typeof h.thread==="string"&&h.thread.trim()))){
    signals.turnStart=true;
    signals.requirement=true;
  }
  if(signals.dispatch||signals.turnStart)signals.requirement=true;
  const checkMode=normalizeHarnessCheckMode(mode);
  if(!signals.plan)signals.planInferred=false;
  if(checkMode===HARNESS_CHECK_MODES.ADAPTIVE&&!signals.plan&&shouldInferAdaptiveMicroPlan(h,signals)){
    signals.plan=true;
    signals.planInferred=true;
  }
  return signals;
}
function hpush(c,l,d,tone="info"){
  c.h.events.unshift({l:t1(l,56),d:t1(d,220),tone,at:Date.now()});
  c.h.events=c.h.events.slice(0,64);
  c.h.at=Date.now();
  const signals=ensureHarnessSignals(c.h);
  foldHarnessSignalsFromLabel(signals,l,d,c.h&&c.h.status);
}
function hset(c,st){c.h.status=st;c.h.at=Date.now()}
function happly(c,ev){
  if(!c||!ev||typeof ev!=="object")return;
  if(ev.type==="turn"){
    if(typeof ev.threadId==="string")c.h.thread=ev.threadId;
    if(typeof ev.turnId==="string")c.h.turn=ev.turnId;
    if(ev.phase==="started"){
      hset(c,"running");
      hpush(c,"turn/start",`${c.h.turn} @ ${c.h.thread}`,"running");
      onPerformanceTurnStarted(c,ev);
    }
    if(ev.phase==="completed"){
      hset(c,ev.status||"completed");
      hpush(c,"turn/completed",ev.status||"completed",ev.status==="failed"?"failed":"info");
      onPerformanceTurnCompleted(c,ev);
    }
    scheduleTopographyRefreshSoon();
    return;
  }
  if(ev.type==="item"){
    const i=ev.item||{};
    hpush(c,i.label||i.type||"item",i.detail||"",i.status==="failed"?"failed":"info");
    if(i.type==="collabAgentToolCall"||i.type==="collabToolCall")scheduleTopographyRefreshSoon();
    return;
  }
  if(ev.type==="activity"){
    hpush(c,ev.label||"activity",ev.detail||"",ev.label==="error"?"failed":"info");
    return;
  }
  if(ev.type==="plan"){
    c.h.planExp=String(ev.explanation||"");
    const planMeta=ensureHarnessPlanMeta(c.h);
    planMeta.source=typeof ev.source==="string"&&ev.source.trim()?ev.source.trim():"explicit";
    planMeta.decision=typeof ev.decision==="string"&&ev.decision.trim()?ev.decision.trim():(ev.skip?"skip":"plan");
    planMeta.skipReason=typeof ev.skipReason==="string"?ev.skipReason:"";
    planMeta.planningMode=typeof ev.planningMode==="string"?ev.planningMode:"";
    planMeta.planningDepth=typeof ev.planningDepth==="string"?ev.planningDepth:"";
    planMeta.assuranceDepth=typeof ev.assuranceDepth==="string"?ev.assuranceDepth:"";
    planMeta.flowPath=typeof ev.flowPath==="string"?ev.flowPath:"";
    planMeta.generatedBy=typeof ev.generatedBy==="string"?ev.generatedBy:"";
    c.h.plan=(Array.isArray(ev.steps)?ev.steps:[]).map((x)=>({
      step:String(x.step||""),
      status:String(x.status||"pending"),
      phase:typeof x.phase==="string"?x.phase:"",
      kind:typeof x.kind==="string"?x.kind:"",
      ownerAgent:typeof x.ownerAgent==="string"?x.ownerAgent:"",
      stepId:typeof x.stepId==="string"?x.stepId:"",
      requestClauseRefs:Array.isArray(x.requestClauseRefs)?x.requestClauseRefs.map((entry)=>String(entry||"").trim()).filter(Boolean).slice(0,24):[],
      requirementRefs:Array.isArray(x.requirementRefs)?x.requirementRefs.map((entry)=>String(entry||"").trim()).filter(Boolean).slice(0,24):[],
      acceptanceCheckRefs:Array.isArray(x.acceptanceCheckRefs)?x.acceptanceCheckRefs.map((entry)=>String(entry||"").trim()).filter(Boolean).slice(0,16):[],
    })).filter((x)=>x.step).slice(0,16);
    const planEventParts=[
      lowerText(planMeta.decision)==="skip"?"PLAN SKIP":`${c.h.plan.length} steps`,
      planMeta.planningDepth||"",
      planMeta.assuranceDepth||"",
    ].filter(Boolean);
    hpush(c,"plan/update",planEventParts.join(" / "),"info");
    return;
  }
  if(ev.type==="tokenUsage"){
    const u=ev.usage||{};
    const p=[];
    if(Number.isFinite(u.totalTokens))p.push(`total=${u.totalTokens}`);
    if(Number.isFinite(u.inputTokens))p.push(`in=${u.inputTokens}`);
    if(Number.isFinite(u.outputTokens))p.push(`out=${u.outputTokens}`);
    if(Number.isFinite(u.cachedInputTokens))p.push(`cached=${u.cachedInputTokens}`);
    if(Number.isFinite(u.reasoningOutputTokens))p.push(`reason=${u.reasoningOutputTokens}`);
    if(Number.isFinite(u.modelContextWindow))p.push(`ctx=${u.modelContextWindow}`);
    c.h.tokens=p.join(" / ");
    if(c.h.tokens)hpush(c,"token/usage",c.h.tokens,"info");
    onPerformanceTokenUsage(c,ev);
    return;
  }
  if(ev.type==="diff"&&typeof ev.text==="string"){
    c.h.diff=ev.text;
    hpush(c,"turn/diff",`${ev.text.length} chars`,"info");
  }
}
function lowerText(value){return String(value||"").toLowerCase();}
function deriveHarnessEvidence(events){
  const taskLabels=new Set(["command execution","file change","mcp tool","collab agent tool","web search","image view","reasoning"]);
  const evidence={tasksDone:0,tasksTotal:0,tests:0,reviews:0,logs:0};
  toArr(events).forEach((item)=>{
    const label=lowerText(item&&item.l);
    const detail=lowerText(item&&item.d);
    const tone=lowerText(item&&item.tone);
    const text=`${label} ${detail}`.trim();
    if(taskLabels.has(label)){
      evidence.tasksTotal+=1;
      if(tone!=="failed")evidence.tasksDone+=1;
    }
    if(text.includes("test")||text.includes("pytest")||text.includes("playwright")||text.includes("vitest")||text.includes("jest"))evidence.tests+=1;
    if(text.includes("review")||text.includes("audit"))evidence.reviews+=1;
    if(text.includes("log")||text.includes("trace")||text.includes("artifact"))evidence.logs+=1;
  });
  return evidence;
}
function syncHarnessFlow(c,mode=activeHarnessCheckMode()){
  if(!c||!c.h)return;
  const checkMode=normalizeHarnessCheckMode(mode);
  const templateFlow=createHarnessState().flow;
  const existingFlow=Array.isArray(c.h.flow)?c.h.flow:[];
  const byId=new Map();
  existingFlow.forEach((phase)=>{
    if(!phase||typeof phase!=="object")return;
    const id=String(phase.id||"").trim();
    if(!id)return;
    byId.set(id,phase);
  });
  const flow=templateFlow.map((base)=>({
    id:base.id,
    label:base.label,
    detail:byId.has(base.id)&&typeof byId.get(base.id).detail==="string"&&byId.get(base.id).detail?byId.get(base.id).detail:base.detail,
    state:byId.has(base.id)&&typeof byId.get(base.id).state==="string"?byId.get(base.id).state:"todo",
  }));
  c.h.flow=flow;

  const status=lowerText(c.h.status);
  const events=toArr(c.h.events);
  const signals=getHarnessSignals(c.h,checkMode);
  const planMeta=ensureHarnessPlanMeta(c.h);
  const requirementSnapshot=buildRequirementLockSnapshotForUi(storedTurnSnapshotForUi(c.h));
  const requirementGateBlocked=requirementNeedsFurtherLockForUi(requirementSnapshot);
  const hasPlanSkip=lowerText(planMeta.decision)==="skip";
  c.h.signals={...signals};
  const hasDispatch=signals.dispatch;
  const hasTurnStart=signals.turnStart;
  const hasTurnCompleted=signals.turnCompleted;
  const hasPlan=signals.plan;
  const hasRequirement=signals.requirement||status==="starting"||status==="running"||status==="needs_input"||status==="completed"||status==="failed"||status==="interrupted";
  const hasExecutionSignal=events.some((item)=>{
    const label=lowerText(item&&item.l);
    if(!label)return false;
    if(label==="dispatch"||label==="turn/start"||label==="turn/completed"||label==="plan/update"||label==="turn/end")return false;
    return true;
  });
  const hasQualitySignal=signals.quality||events.some((item)=>{
    const text=`${lowerText(item&&item.l)} ${lowerText(item&&item.d)}`;
    return text.includes("test")||text.includes("review")||text.includes("audit")||text.includes("guard");
  });
  const hasAnyProgressSignal=hasRequirement||hasPlan||hasExecutionSignal||hasQualitySignal||hasDispatch||hasTurnStart||hasTurnCompleted;
  const hasActiveTurnLikeStatus=status==="starting"||status==="running"||status==="needs_input"||status==="completed"||status==="failed"||status==="interrupted";
  const shouldHighlightStage=hasAnyProgressSignal||hasActiveTurnLikeStatus;

  let stageIndex=0;
  if(!requirementGateBlocked){
    if(checkMode===HARNESS_CHECK_MODES.RELAXED){
      if(hasRequirement)stageIndex=1;
      if(hasPlan||hasExecutionSignal)stageIndex=Math.max(stageIndex,2);
      if(hasQualitySignal)stageIndex=Math.max(stageIndex,3);
      if(status==="needs_input")stageIndex=Math.max(stageIndex,4);
      if(hasTurnCompleted||status==="completed"||status==="failed"||status==="interrupted")stageIndex=4;
    }else{
      if(hasRequirement)stageIndex=1;
      if(hasRequirement&&hasPlan)stageIndex=2;
      if(hasRequirement&&hasPlan&&hasQualitySignal)stageIndex=3;
      if(status==="needs_input")stageIndex=Math.max(stageIndex,2);
      if(hasTurnCompleted&&hasRequirement&&hasPlan)stageIndex=4;
    }
  }

  const states=["todo","todo","todo","todo","todo"];
  if(status==="completed"){
    const strictComplete=!requirementGateBlocked&&(checkMode===HARNESS_CHECK_MODES.RELAXED||(hasRequirement&&hasPlan&&hasTurnCompleted));
    if(strictComplete){
      for(let i=0;i<states.length;i+=1)states[i]="done";
    }else{
      for(let i=0;i<Math.min(stageIndex,states.length);i+=1)states[i]="done";
      if(stageIndex>=0&&stageIndex<states.length)states[stageIndex]="failed";
    }
  }else if(status==="failed"||status==="interrupted"){
    const failedIndex=Math.min(Math.max(stageIndex,0),states.length-1);
    for(let i=0;i<failedIndex;i+=1)states[i]="done";
    states[failedIndex]="failed";
  }else{
    for(let i=0;i<Math.min(stageIndex,states.length);i+=1)states[i]="done";
    if(shouldHighlightStage&&stageIndex>=0&&stageIndex<states.length)states[stageIndex]="active";
  }

  flow.forEach((phase,idx)=>{
    phase.state=states[idx]||"todo";
  });
  const planningPhase=flow.find((phase)=>phase&&phase.id==="planning");
  if(planningPhase&&hasPlanSkip&&planningPhase.state!=="failed"&&!requirementGateBlocked){
    planningPhase.state="skipped";
    planningPhase.detail="詳細 plan 省略";
  }else if(planningPhase&&requirementGateBlocked){
    planningPhase.detail="要件整理の確定待ち";
  }
  const executionPhase=flow.find((phase)=>phase&&phase.id==="execution");
  const qualityPhase=flow.find((phase)=>phase&&phase.id==="quality");
  const reportPhase=flow.find((phase)=>phase&&phase.id==="report");
  if(requirementGateBlocked){
    if(executionPhase)executionPhase.detail="要件整理の確定待ち";
    if(qualityPhase)qualityPhase.detail="要件整理の確定待ち";
    if(reportPhase)reportPhase.detail="要件整理の確定待ち";
    applyRequirementPhaseStateForUi(flow,requirementSnapshot);
  }
  c.h.evidence=deriveHarnessEvidence(events);
}
function evaluateHarnessVerdict(h,mode=activeHarnessCheckMode()){
  const checkMode=normalizeHarnessCheckMode(mode);
  const status=String(h&&h.status||"idle").toLowerCase();
  const events=toArr(h&&h.events);
  const signals=getHarnessSignals(h,checkMode);
  const hasDispatch=signals.dispatch;
  const hasTurnStart=signals.turnStart;
  const hasTurnCompleted=signals.turnCompleted;
  const hasPlan=signals.plan;
  const hasPlanInferred=Boolean(signals.planInferred);
  const hasRequirement=signals.requirement||hasDispatch||hasTurnStart;
  const hasDelegation=signals.delegation||events.some((item)=>{
    const text=`${String(item&&item.l||"")} ${String(item&&item.d||"")}`.toLowerCase();
    return text.includes("collab agent tool")
      ||text.includes("spawn_agent")
      ||text.includes("spawnagent")
      ||text.includes("receivers=");
  });
  const hasFailedEvent=events.some((item)=>item&&item.tone==="failed");

  if(status==="failed"||status==="interrupted"){
    return{label:"FAIL",tone:"failed",detail:`Terminal status is ${status}.`};
  }
  if(status==="needs_input"){
    return{label:"WAIT",tone:"running",detail:"ユーザー入力または承認待ちです。"};
  }
  if(checkMode===HARNESS_CHECK_MODES.STRICT||checkMode===HARNESS_CHECK_MODES.ADAPTIVE){
    const modeName=checkMode===HARNESS_CHECK_MODES.STRICT?"Strict":"Adaptive";
    const planSignalLabel=hasPlanInferred?"plan/update（推定マイクロプラン）":"plan/update";
    if(status==="running"||status==="starting"){
      if(hasTurnStart&&!hasPlan){
        return{label:"WARN",tone:"running",detail:`plan/update より先に実行が開始されました（${modeName.toLowerCase()} gate）。`};
      }
      const observed=[];
      if(hasRequirement)observed.push("requirement/dispatch");
      if(hasTurnStart)observed.push("turn/start");
      if(hasPlan)observed.push(planSignalLabel);
      if(hasDelegation)observed.push("child dispatch");
      return{
        label:"RUNNING",
        tone:"running",
        detail:observed.length?`観測済み: ${observed.join(", ")}。`:"ターン実行中です。",
      };
    }
    if(status==="completed"){
      const missingHard=[];
      if(!hasRequirement)missingHard.push("requirement/dispatch");
      if(!hasTurnStart)missingHard.push("turn/start");
      if(!hasTurnCompleted)missingHard.push("turn/completed");
      if(!hasPlan)missingHard.push("plan/update");
      if(missingHard.length){
        return{label:"FAIL",tone:"failed",detail:`${modeName} 必須シグナル不足: ${missingHard.join(", ")}。`};
      }
      if(hasFailedEvent){
        return{label:"WARN",tone:"failed",detail:"完了していますが、trace に failed/error イベントが残っています。"};
      }
      if(!hasDelegation&&!(checkMode===HARNESS_CHECK_MODES.ADAPTIVE&&hasPlanInferred)){
        return{label:"WARN",tone:"running",detail:"推奨シグナル不足: child dispatch。"};
      }
      if(hasPlanInferred){
        return{label:"PASS",tone:"completed",detail:"軽量ターンとして、Adaptive の必須シグナルと推定マイクロプランを確認しました。"};
      }
      return{label:"PASS",tone:"completed",detail:`${modeName} の必須 harness シグナルを確認しました。`};
    }
    return{label:"WAIT",tone:"idle",detail:"まだ terminal turn はありません。"};
  }
  if(status==="running"||status==="starting"){
    const observed=[];
    if(hasTurnStart)observed.push("turn/start");
    if(hasPlan)observed.push("plan/update");
    if(hasDelegation)observed.push("child dispatch");
    return{
      label:"RUNNING",
      tone:"running",
      detail:observed.length?`観測済み: ${observed.join(", ")}。`:"ターン実行中です。",
    };
  }
  if(status==="completed"){
    if(hasFailedEvent){
      return{label:"WARN",tone:"failed",detail:"完了していますが、trace に failed/error イベントが残っています。"};
    }
    const missing=[];
    if(!hasTurnStart)missing.push("turn/start");
    if(!hasTurnCompleted)missing.push("turn/completed");
    if(!hasPlan)missing.push("plan/update");
    if(!hasDelegation)missing.push("child dispatch");
    if(missing.length){
      return{label:"WARN",tone:"running",detail:`不足シグナル: ${missing.join(", ")}。`};
    }
    return{label:"PASS",tone:"completed",detail:"必須 harness シグナルを確認しました。"};
  }
  return{label:"WAIT",tone:"idle",detail:"まだ terminal turn はありません。"};
}
function normalizePlanStepStatusForUi(value){
  const normalized=lowerText(value).replace(/[\s-]+/g,"_");
  if(normalized==="skipped"||normalized==="skip")return"skipped";
  if(normalized==="in_progress"||normalized==="running"||normalized==="active"||normalized==="working")return"in_progress";
  if(normalized==="completed"||normalized==="done"||normalized==="pass"||normalized==="ok"||normalized==="ready")return"completed";
  if(normalized==="failed"||normalized==="error")return"failed";
  if(normalized==="interrupted"||normalized==="aborted"||normalized==="cancelled"||normalized==="canceled")return"interrupted";
  return"pending";
}
function planStepStatusLabelForUi(status){
  if(status==="skipped")return"SKIP";
  if(status==="in_progress")return"進行中";
  if(status==="completed")return"完了";
  if(status==="failed")return"失敗";
  if(status==="interrupted")return"中断";
  return"待機";
}
function planSourceLabelForUi(source,decision="plan"){
  if(decision==="skip")return"PLAN SKIP";
  if(source==="policy")return"ポリシープラン";
  if(source==="explicit")return"明示プラン";
  if(source==="assistant")return"アシスタント案";
  return"実行プラン";
}
function planSkipReasonLabelForUi(reason){
  if(reason==="direct_response_only")return"直接回答または確認のみのため、詳細な実行計画は省略";
  if(!reason)return"";
  return"詳細な実行計画は省略";
}
function planSkipWorkLabelForUi(displayedPlan,planFocus){
  const reason=planSkipReasonLabelForUi(displayedPlan&&displayedPlan.skipReason);
  if(reason)return reason;
  const text=t1(planFocus&&planFocus.text?planFocus.text:"",220).trim().replace(/^PLAN SKIP\s*[:/.-]?\s*/i,"");
  return text||"詳細な実行計画は省略";
}
function planFocusLabelForUi(mode){
  if(mode==="skipped")return"SKIP";
  if(mode==="current")return"現在のステップ";
  if(mode==="next")return"次のステップ";
  if(mode==="blocked")return"停止中のステップ";
  if(mode==="done")return"直近の完了ステップ";
  return"プラン焦点";
}
function planCardToneForUi(status){
  if(status==="in_progress"||status==="completed"||status==="failed"||status==="interrupted"||status==="skipped")return status;
  return"idle";
}
function planWorkToneForUi(status){
  if(status==="in_progress")return"running";
  if(status==="completed")return"completed";
  if(status==="failed"||status==="interrupted"||status==="skipped")return status;
  return"idle";
}
function requirementGateBlockerTextForUi(snapshot,fallbackText="要件整理の保留を解消する"){
  if(!snapshot||typeof snapshot!=="object")return fallbackText;
  if(snapshot.displayAskNext&&snapshot.displayAskNext.length){
    const firstAsk=String(snapshot.displayAskNext[0]||"").trim();
    if(firstAsk)return`要確認: ${firstAsk}`;
  }
  const holdReason=String(snapshot.displayHoldReason||snapshot.contractStatusReason||"").trim();
  return holdReason||fallbackText;
}
function requirementGatePlanPanelStateForUi(snapshot){
  const blockedLabel=snapshot&&snapshot.contractStatusLabel?snapshot.contractStatusLabel:"保留";
  const pendingCount=(snapshot&&snapshot.displayAskNext&&snapshot.displayAskNext.length)
    ||(snapshot&&snapshot.openQuestions&&snapshot.openQuestions.length)
    ||0;
  const blockerText=requirementGateBlockerTextForUi(snapshot);
  const detailParts=[`要件整理が${blockedLabel}のため、計画には進まない`];
  if(pendingCount>0)detailParts.push(`要確認 ${pendingCount}`);
  return{
    metaText:`要件整理${blockedLabel}`,
    currentStepText:blockerText,
    currentPurposeText:"支える依頼: まず Step 1 の保留を解消する",
    currentDetailText:detailParts.join(" / "),
    explanationText:"Step 1 の未解決を先に解消するまで、ここでは実行計画を表示しない。",
    emptyText:"要件整理が固まると、ここに実行計画が表示されます。",
    tone:"idle",
  };
}
function normalizePlanTraceRefsForUi(value,max=24){
  return Array.isArray(value)
    ?value.map((entry)=>String(entry||"").trim()).filter(Boolean).slice(0,max)
    :[];
}
function planPurposeSummaryForUi(step,requirementSnapshot){
  const snapshot=requirementSnapshot&&typeof requirementSnapshot==="object"?requirementSnapshot:{};
  const requestClauseTextById=snapshot.requestClauseTextById&&typeof snapshot.requestClauseTextById==="object"
    ?snapshot.requestClauseTextById
    :{};
  const acceptanceCheckTextById=snapshot.acceptanceCheckTextById&&typeof snapshot.acceptanceCheckTextById==="object"
    ?snapshot.acceptanceCheckTextById
    :{};
  const clauseTexts=compactTextListForUi(
    normalizePlanTraceRefsForUi(step&&step.requestClauseRefs,24).map((entry)=>requestClauseTextById[entry]||""),
    {maxItems:2,maxChars:96,transform:requirementTextLabelForUi}
  );
  if(clauseTexts.length)return`支える依頼: ${summarizeInlineListForUi(clauseTexts,{maxItems:2})}`;
  const acceptanceTexts=compactTextListForUi(
    normalizePlanTraceRefsForUi(step&&step.acceptanceCheckRefs,16).map((entry)=>acceptanceCheckTextById[entry]||""),
    {maxItems:2,maxChars:96,transform:requirementTextLabelForUi}
  );
  if(acceptanceTexts.length)return`支える受け入れ: ${summarizeInlineListForUi(acceptanceTexts,{maxItems:2})}`;
  const requirementRefs=compactTextListForUi(
    normalizePlanTraceRefsForUi(step&&step.requirementRefs,24).map((entry)=>requirementFieldLabelForUi(entry)),
    {maxItems:2,maxChars:96}
  );
  if(requirementRefs.length)return`支える要件: ${summarizeInlineListForUi(requirementRefs,{maxItems:2})}`;
  return"支える依頼: 参照未接続";
}
function derivePlanFocusForUi(planSteps,statusText=""){
  const steps=toArr(planSteps).map((step,index)=>{
    const explicitIndex=Number.isFinite(Number(step&&step.index))?Math.max(0,Math.trunc(Number(step.index))):index;
    const text=step&&typeof step.text==="string"
      ?step.text.trim()
      :(step&&typeof step.step==="string"?step.step.trim():"");
    return{...(step&&typeof step==="object"?step:{}),text,index:explicitIndex,status:normalizePlanStepStatusForUi(step&&step.status),raw:step};
  }).filter((step)=>step.text);
  if(!steps.length)return null;
  const turnStatus=lowerText(statusText);
  const currentStep=steps.find((step)=>step.status==="in_progress");
  if(currentStep)return{...currentStep,mode:"current"};
  const blockedStep=steps.find((step)=>step.status==="failed"||step.status==="interrupted");
  if(blockedStep)return{...blockedStep,mode:"blocked"};
  const skippedStep=steps.find((step)=>step.status==="skipped");
  if(skippedStep)return{...skippedStep,mode:"skipped"};
  if(turnStatus==="running"||turnStatus==="starting"||turnStatus==="needs_input"){
    const nextPending=steps.find((step)=>step.status==="pending");
    if(nextPending)return{...nextPending,mode:"next"};
    const lastCompletedWhileRunning=[...steps].reverse().find((step)=>step.status==="completed");
    if(lastCompletedWhileRunning)return{...lastCompletedWhileRunning,mode:"done"};
  }
  if(turnStatus==="completed"){
    const lastCompleted=[...steps].reverse().find((step)=>step.status==="completed");
    if(lastCompleted)return{...lastCompleted,mode:"done"};
  }
  return{...steps[0],mode:"current"};
}
function normalizePlanPhaseForUi(value){
  const normalized=lowerText(value).replace(/[\s-]+/g,"_");
  if(normalized==="planning"||normalized==="plan")return"planning";
  if(normalized==="execution"||normalized==="dispatch"||normalized==="execute")return"execution";
  if(normalized==="quality"||normalized==="review"||normalized==="verification"||normalized==="test")return"quality";
  if(normalized==="report"||normalized==="release"||normalized==="needs_input")return"report";
  return"";
}
function phaseWeightForUi(phaseId){
  const normalized=lowerText(phaseId);
  if(normalized==="requirements")return 1;
  if(normalized==="planning")return 2;
  if(normalized==="execution")return 3;
  if(normalized==="quality")return 4;
  if(normalized==="report")return 5;
  return 0;
}
function currentHarnessPhaseForUi(flowItems,statusText=""){
  const activePhase=toArr(flowItems).find((phase)=>phase&&phase.state==="active")
    ||toArr(flowItems).find((phase)=>phase&&phase.state==="failed")
    ||null;
  if(activePhase&&activePhase.id)return String(activePhase.id);
  const status=lowerText(statusText);
  if(status==="completed"||status==="failed"||status==="interrupted")return"report";
  const lastDone=[...toArr(flowItems)].reverse().find((phase)=>phase&&phase.state==="done");
  return lastDone&&lastDone.id?String(lastDone.id):"planning";
}
function normalizePlanEntryForUi(step,index){
  return{
    index,
    text:step&&typeof step.step==="string"?step.step.trim():"",
    status:normalizePlanStepStatusForUi(step&&step.status),
    phase:normalizePlanPhaseForUi(step&&step.phase),
    kind:step&&typeof step.kind==="string"?step.kind.trim():"",
    ownerAgent:step&&typeof step.ownerAgent==="string"?step.ownerAgent.trim():"",
    stepId:step&&typeof step.stepId==="string"?step.stepId.trim():"",
    requestClauseRefs:normalizePlanTraceRefsForUi(step&&step.requestClauseRefs,24),
    requirementRefs:normalizePlanTraceRefsForUi(step&&step.requirementRefs,24),
    acceptanceCheckRefs:normalizePlanTraceRefsForUi(step&&step.acceptanceCheckRefs,16),
  };
}
function projectExplicitPlanProgressForUi(rawSteps,flowItems,statusText="",planMeta=null){
  const steps=toArr(rawSteps).map((step)=>({...step}));
  if(!steps.length)return[];
  const decision=lowerText(planMeta&&planMeta.decision);
  if(decision==="skip"){
    return steps.map((step)=>({...step,status:"skipped"}));
  }
  const hasStructuredPhase=steps.some((step)=>step&&step.phase);
  if(!hasStructuredPhase)return steps;
  const currentPhaseId=currentHarnessPhaseForUi(flowItems,statusText);
  const currentWeight=phaseWeightForUi(currentPhaseId);
  const status=lowerText(statusText);
  if(!currentWeight)return steps;
  return steps.map((step)=>{
    const stepWeight=phaseWeightForUi(step&&step.phase==="planning"?"planning":step&&step.phase);
    if(!stepWeight)return step;
    let nextStatus=step.status;
    if(status==="completed"){
      nextStatus=step.status==="skipped"?"skipped":"completed";
    }else if(status==="failed"||status==="interrupted"){
      if(stepWeight<currentWeight)nextStatus="completed";
      else if(stepWeight===currentWeight)nextStatus=status==="interrupted"?"interrupted":"failed";
      else nextStatus="pending";
    }else if(status==="running"||status==="starting"||status==="needs_input"){
      if(stepWeight<currentWeight)nextStatus="completed";
      else if(stepWeight===currentWeight)nextStatus="in_progress";
      else nextStatus="pending";
    }
    return{...step,status:nextStatus};
  });
}
function deriveDisplayedPlanForUi(h,flowItems,statusText=""){
  const planMeta=ensureHarnessPlanMeta(h);
  const explicitSteps=toArr(h&&h.plan).map((step,index)=>normalizePlanEntryForUi(step,index)).filter((step)=>step.text);
  if(explicitSteps.length){
    const projectedSteps=projectExplicitPlanProgressForUi(explicitSteps,flowItems,statusText,planMeta);
    return{
      source:planMeta.source||"explicit",
      decision:planMeta.decision||"plan",
      skipReason:planMeta.skipReason||"",
      meta:planMeta,
      steps:projectedSteps,
      focus:derivePlanFocusForUi(projectedSteps,statusText),
      explanation:String(h&&h.planExp||"").trim()||"計画要約はまだありませんが、最新の計画ステップを表示しています。",
    };
  }
  return{
    source:"none",
    decision:"",
    skipReason:"",
    meta:planMeta,
    steps:[],
    focus:null,
    explanation:"このチャットで plan/update または PLAN SKIP が届くと、ここに表示します。",
  };
}
function renderTimeline(){
  e.timeline.innerHTML="";
  const c=active();
  if(!c){
    if(e.conversationSummary)e.conversationSummary.textContent="チャットを選ぶと会話が表示されます。";
    return;
  }
  const conversation=conversationSnapshotForUi(c);
  const currentPending=pendingCountForChat(c.id);
  if(e.conversationSummary){
    if(currentPending>0){
      e.conversationSummary.textContent="応答はここに追加されます。実行中の内容もこの欄で追えます。";
    }else if(!conversation.hasConversation){
      e.conversationSummary.textContent="まだ依頼は始まっていません。下の入力欄から始めます。";
    }else{
      e.conversationSummary.textContent=`このチャットのメッセージ ${conversation.messages.length} 件を表示しています。`;
    }
  }
  if(!conversation.hasConversation){
    const empty=document.createElement("article");
    empty.className="timeline-empty-state";
    empty.innerHTML="<h4 class=\"timeline-empty-title\">まだ依頼は始まっていません</h4><p class=\"timeline-empty-copy\">この欄には、送信した依頼、途中の進行、最終結果が時系列で並びます。</p><ul class=\"timeline-empty-list\"><li>目的を一文で書く</li><li>対象のファイルや画面を書く</li><li>制約や避けたいことを書く</li><li>完了条件や確認方法を書く</li></ul>";
    e.timeline.appendChild(empty);
    return;
  }
  const stack=document.createElement("div");
  stack.className="timeline-stack";
  conversation.messages.forEach((m)=>{
    const f=e.messageTemplate.content.cloneNode(true);
    f.querySelector(".message").classList.add(m.role);
    f.querySelector(".meta").textContent=`${m.title} ${m.time}`;
    renderMessageContentForUi(f.querySelector(".content"),m.content||"");
    stack.appendChild(f);
  });
  e.timeline.appendChild(stack);
  e.timeline.scrollTop=e.timeline.scrollHeight;
}
function renameChatTitle(chatId){
  const c=chat(chatId);
  if(!c)return;
  const next=window.prompt("チャットタイトルを入力してください",c.title||"");
  if(next===null)return;
  const normalized=t1(next,60).trim();
  if(!normalized)return;
  c.title=normalized;
  scheduleSaveChatState();
  refresh();
}
function renderChatList(){
  e.chatList.innerHTML="";
  s.chats.forEach((c)=>{
    const activeCount=pendingCountForChat(c.id);
    c.pending=activeCount;
    const statusClass=activeCount>0?"running":"idle";
    const statusLabel=activeCount>0?`実行中 ${activeCount}`:"待機中";
    const agentLabel=operatorFacingAgentLabelForUi(c.agent);
    const preview=latestConversationPreviewForUi(c);
    const b=document.createElement("button");
    b.type="button";
    b.className=c.id===s.active?"chat-item active":"chat-item";
    b.title="ダブルクリックでタイトル変更 / Deleteで削除";
    b.innerHTML=`<span class=\"chat-item-line\"><span class=\"chat-item-title\">${c.title}</span><span class=\"chat-item-meta\">${agentLabel}</span><span class=\"chat-item-status ${statusClass}\">${statusLabel}</span></span><span class=\"chat-item-preview\">${preview}</span>`;
    b.onclick=()=>{s.active=c.id;refresh()};
    b.ondblclick=(ev)=>{
      ev.preventDefault();
      ev.stopPropagation();
      renameChatTitle(c.id);
    };
    b.onkeydown=(ev)=>{
      if(ev.key==="F2"){
        ev.preventDefault();
        renameChatTitle(c.id);
        return;
      }
      if(ev.key==="Delete"){
        ev.preventDefault();
        deleteChat(c.id);
      }
    };
    e.chatList.appendChild(b);
  });
}
function renderHarness(){
  const c=active();
  if(!c)return;
  const checkMode=activeHarnessCheckMode();
  const latestTurn=latestRuntimeTurnForChat(c);
  if(latestTurn&&syncTurnSnapshotForUi(c,latestTurn))scheduleSaveChatState();
  syncHarnessFlow(c,checkMode);
  const h=c.h;
  const stageListEl=by("harnessJourneyList");
  const stageEl=by("harnessJourneyStage");
  const workEl=by("harnessJourneyWork");
  const complianceEl=by("harnessComplianceBadge");
  const complianceDetailEl=by("harnessComplianceDetail");
  const highlightsEl=by("harnessHighlights");
  const requirementMetaEl=by("harnessRequirementMeta");
  const requirementHeadlineEl=by("harnessRequirementHeadline");
  const requirementSectionsEl=by("harnessRequirementSections");
  if(!stageListEl||!stageEl||!workEl||!highlightsEl)return;

  const status=String(h.status||"idle");
  const flowItems=toArr(h.flow);
  const phaseStateText=(phase)=>{
    const state=String(phase&&phase.state||"todo");
    if(state==="skipped")return"SKIP";
    if(state==="blocked")return"保留";
    if(state==="active")return"進行中";
    if(state==="done")return"完了";
    if(state==="failed")return"失敗";
    return"待機中";
  };
  const phaseTone=(phase)=>{
    const state=String(phase&&phase.state||"todo");
    if(state==="skipped")return"skipped";
    if(state==="blocked")return"blocked";
    if(state==="active")return"running";
    if(state==="done")return"completed";
    if(state==="failed")return"failed";
    return"idle";
  };
  const describePhase=(phase)=>{
    if(!phase)return"未開始";
    const base=phaseStateText(phase);
    const detail=phase&&typeof phase.detail==="string"&&phase.detail?` / ${phase.detail}`:"";
    return`${base}${detail}`;
  };
  const turnForUi=latestTurn||storedTurnSnapshotForUi(c.h);
  const requirementSnapshot=buildRequirementLockSnapshotForUi(turnForUi);
  const requirementGroups=requirementGroupsForUi(requirementSnapshot);
  const requirementGateBlocked=requirementNeedsFurtherLockForUi(requirementSnapshot);
  applyRequirementPhaseStateForUi(flowItems,requirementSnapshot);

  const latestEvent=toArr(h.events)[0];
  const verdict=evaluateHarnessVerdict(h,checkMode);
  const runtimeContext=deriveRuntimeTurnContextForUi(turnForUi);
  if(complianceEl){
    complianceEl.textContent=verdict.label;
    complianceEl.className=`harness-now-value ${verdict.tone}`;
  }
  if(complianceDetailEl){
    const detailParts=[verdict.detail];
    if(runtimeContext&&runtimeContext.gateApplies){
      const gateLabel=familyGateStatusLabelForUi(runtimeContext.gateStatus);
      const gateSummary=t1(runtimeContext.gateSummary||"",120).trim();
      detailParts.push(gateSummary?`ファミリーゲート: ${gateLabel} / ${gateSummary}`:`ファミリーゲート: ${gateLabel}`);
    }
    complianceDetailEl.textContent=detailParts.filter(Boolean).join(" / ");
  }

  const displayedPlan=deriveDisplayedPlanForUi(h,flowItems,status);
  const planSteps=displayedPlan.steps;
  const planFocus=displayedPlan.focus;
  const planSource=displayedPlan.source;
  const planDecision=displayedPlan.decision||"plan";
  const evidence=h.evidence&&typeof h.evidence==="object"?h.evidence:{tasksDone:0,tasksTotal:0,tests:0,reviews:0,logs:0};
  const phaseSummaries=buildPhaseSummariesForUi({
    flowItems,
    requirementSnapshot,
    displayedPlan,
    evidence,
    runtimeContext,
    verdict,
    status,
    turn:turnForUi,
  });

  stageListEl.innerHTML="";
  flowItems.forEach((phase)=>{
    const state=String(phase&&phase.state||"todo");
    const card=document.createElement("article");
    card.className=`harness-journey-step ${state}`;
    const title=document.createElement("h4");
    title.textContent=String(phase&&phase.label||"フェーズ");
    const stateLine=document.createElement("p");
    stateLine.className="harness-journey-state";
    stateLine.textContent=phaseStateText(phase);
    const summary=document.createElement("p");
    summary.className="harness-journey-summary";
    summary.textContent=phaseSummaries[phase&&phase.id]||String(phase&&phase.detail||phaseStateText(phase));
    card.appendChild(title);
    card.appendChild(stateLine);
    card.appendChild(summary);
    stageListEl.appendChild(card);
  });

  let currentPhase=flowItems.find((phase)=>phase&&phase.state==="active")
    ||flowItems.find((phase)=>phase&&phase.state==="blocked")
    ||flowItems.find((phase)=>phase&&phase.state==="failed")
    ||null;
  if(!currentPhase){
    const donePhases=flowItems.filter((phase)=>phase&&(phase.state==="done"||phase.state==="skipped"));
    currentPhase=donePhases.length?donePhases[donePhases.length-1]:(flowItems[0]||null);
  }
  const currentPhaseSummary=currentPhase&&currentPhase.id?phaseSummaries[currentPhase.id]:"";
  stageEl.textContent=currentPhase?`${currentPhase.label} (${phaseStateText(currentPhase)})`:"未開始";
  stageEl.className=`harness-now-value ${phaseTone(currentPhase)}`;
  if(requirementGateBlocked){
    const blockerText=requirementGateBlockerTextForUi(
      requirementSnapshot,
      currentPhaseSummary||"要件整理の保留を解消する"
    );
    workEl.textContent=blockerText;
    workEl.className="harness-now-value blocked";
  }else if(planFocus){
    if(planDecision==="skip"){
      workEl.textContent=planSkipWorkLabelForUi(displayedPlan,planFocus);
    }else{
      workEl.textContent=`${planFocus.index+1}${planSteps.length?`/${planSteps.length}`:""} / ${planFocus.text}`;
    }
    workEl.className=`harness-now-value ${planWorkToneForUi(planFocus.status)}`;
  }else{
    const fallbackWork=currentPhaseSummary
      ||(latestEvent?`${latestEvent.l}${latestEvent.d?` / ${latestEvent.d}`:""}`:"");
    workEl.textContent=fallbackWork||"待機中";
    workEl.className=`harness-now-value ${latestEvent&&latestEvent.tone==="failed"?"failed":(status==="running"?"running":"idle")}`;
  }
  if(requirementMetaEl){
    requirementMetaEl.textContent=requirementSnapshot.hasRequirement
      ?(requirementSnapshot.metaParts&&requirementSnapshot.metaParts.length
        ?requirementSnapshot.metaParts.join(" / ")
        :requirementSnapshot.contractStatusLabel||"整理中")
      :"整理前";
  }
  if(requirementHeadlineEl){
    requirementHeadlineEl.textContent=requirementSnapshot.hasRequirement
      ?requirementSnapshot.headline||"要件の主目的は固まりました。"
      :status==="running"||status==="starting"
        ?"実行は始まっていますが、このチャットではまだ Plan 前の解釈カードを組み立てられていません。"
        :"この欄には、Plan を立てる前に AI がいま何を目標に見ていて、どんな方針で進もうとしているかを簡潔に表示します。";
  }
  if(requirementSectionsEl){
    requirementSectionsEl.innerHTML="";
    if(!requirementGroups.length){
      const empty=document.createElement("article");
      empty.className="harness-requirement-group empty";
      const title=document.createElement("h5");
      title.textContent="AIの方針";
      const text=document.createElement("p");
      text.textContent=requirementSnapshot.hasRequirement
        ?"要件は取れていますが、方針として短く出せるだけの材料がまだ不足しています。"
        :"この依頼を AI がどう理解し、次にどう進めるつもりかだけをここに短く表示します。";
      empty.appendChild(title);
      empty.appendChild(text);
      requirementSectionsEl.appendChild(empty);
    }else{
      requirementGroups.forEach((group)=>{
        const article=document.createElement("article");
        article.className="harness-requirement-group";
        const title=document.createElement("h5");
        title.textContent=group.title;
        article.appendChild(title);
        if(group.summary){
          const summary=document.createElement("p");
          summary.className="harness-requirement-summary";
          summary.textContent=group.summary;
          article.appendChild(summary);
        }
        if(Array.isArray(group.rows)&&group.rows.length){
          const rowList=document.createElement("div");
          rowList.className="harness-requirement-rows";
          group.rows.forEach((entry)=>{
            if(!entry||typeof entry!=="object")return;
            const row=document.createElement("div");
            row.className="harness-requirement-row";
            const label=document.createElement("span");
            label.className="harness-requirement-row-label";
            label.textContent=entry.label||"";
            const text=document.createElement("p");
            text.className="harness-requirement-row-text";
            text.textContent=entry.text||"";
            row.appendChild(label);
            row.appendChild(text);
            rowList.appendChild(row);
          });
          article.appendChild(rowList);
        }else{
          const list=document.createElement("ul");
          list.className="harness-requirement-list";
          group.items.forEach((entry)=>{
            const item=document.createElement("li");
            item.textContent=entry;
            list.appendChild(item);
          });
          article.appendChild(list);
        }
        requirementSectionsEl.appendChild(article);
      });
    }
  }
  const requirementBlockedPlanState=requirementGateBlocked?requirementGatePlanPanelStateForUi(requirementSnapshot):null;
  if(e.harnessPlanMeta){
    const completedCount=planSteps.filter((step)=>step.status==="completed").length;
    if(requirementBlockedPlanState){
      e.harnessPlanMeta.textContent=requirementBlockedPlanState.metaText;
    }else if(planDecision==="skip"){
      e.harnessPlanMeta.textContent="PLAN SKIP";
    }else if(planSteps.length){
      const metaParts=[`${completedCount}/${planSteps.length} 完了`];
      if(displayedPlan.meta&&displayedPlan.meta.planningDepth)metaParts.push(displayedPlan.meta.planningDepth);
      e.harnessPlanMeta.textContent=metaParts.join(" / ");
    }else{
      e.harnessPlanMeta.textContent="計画待ち";
    }
  }
  if(e.harnessPlanCurrentCard){
    const tone=requirementBlockedPlanState?requirementBlockedPlanState.tone:(planFocus?planCardToneForUi(planFocus.status):"idle");
    e.harnessPlanCurrentCard.className=`harness-plan-current ${tone}`;
  }
  if(e.harnessPlanCurrentStep){
    e.harnessPlanCurrentStep.textContent=requirementBlockedPlanState
      ?requirementBlockedPlanState.currentStepText
      :(planFocus?planFocus.text:"計画待ち");
  }
  if(e.harnessPlanCurrentPurpose){
    if(requirementBlockedPlanState){
      e.harnessPlanCurrentPurpose.textContent=requirementBlockedPlanState.currentPurposeText;
    }else if(planFocus){
      e.harnessPlanCurrentPurpose.textContent=planPurposeSummaryForUi(planFocus,requirementSnapshot);
    }else{
      e.harnessPlanCurrentPurpose.textContent="支える依頼: plan/update 待ち";
    }
  }
  if(e.harnessPlanCurrentDetail){
    if(requirementBlockedPlanState){
      e.harnessPlanCurrentDetail.textContent=requirementBlockedPlanState.currentDetailText;
    }else if(planFocus){
      if(planDecision==="skip"){
        const skipParts=[
          planSourceLabelForUi(planSource,planDecision),
          planSkipReasonLabelForUi(displayedPlan.skipReason),
        ];
        if(displayedPlan.meta&&displayedPlan.meta.planningDepth)skipParts.push(displayedPlan.meta.planningDepth);
        e.harnessPlanCurrentDetail.textContent=skipParts.filter(Boolean).join(" / ");
      }else{
        const stepIndexText=planSteps.length?`ステップ ${planFocus.index+1} / ${planSteps.length}`:`ステップ ${planFocus.index+1}`;
        e.harnessPlanCurrentDetail.textContent=`${planSourceLabelForUi(planSource,planDecision)} / ${planFocusLabelForUi(planFocus.mode)} / ${planStepStatusLabelForUi(planFocus.status)} / ${stepIndexText}`;
      }
    }else{
      e.harnessPlanCurrentDetail.textContent="このチャットではまだ明示プランが出ていません。";
    }
  }
  if(e.harnessPlanExplanation){
    e.harnessPlanExplanation.textContent=requirementBlockedPlanState
      ?requirementBlockedPlanState.explanationText
      :displayedPlan.explanation;
  }
  if(e.harnessPlanList){
    e.harnessPlanList.innerHTML="";
    if(requirementBlockedPlanState){
      const empty=document.createElement("li");
      empty.className="harness-empty";
      empty.textContent=requirementBlockedPlanState.emptyText;
      e.harnessPlanList.appendChild(empty);
    }else if(!planSteps.length){
      const empty=document.createElement("li");
      empty.className="harness-empty";
      empty.textContent="計画ステップはここに表示されます。";
      e.harnessPlanList.appendChild(empty);
    }else{
      planSteps.forEach((step)=>{
        const item=document.createElement("li");
        const isFocus=Boolean(planFocus&&planFocus.index===step.index);
        item.className=`harness-plan-step ${step.status}${isFocus?" focus":""}`;
        const head=document.createElement("div");
        head.className="harness-plan-step-head";
        const indexBadge=document.createElement("span");
        indexBadge.className="harness-plan-step-index";
        indexBadge.textContent=String(step.index+1).padStart(2,"0");
        const statusBadge=document.createElement("span");
        statusBadge.className=`harness-plan-step-status ${step.status}`;
        statusBadge.textContent=planStepStatusLabelForUi(step.status);
        head.appendChild(indexBadge);
        head.appendChild(statusBadge);
        const text=document.createElement("p");
        text.className="harness-plan-step-text";
        text.textContent=step.text;
        const purpose=document.createElement("p");
        purpose.className="harness-plan-step-purpose";
        purpose.textContent=planPurposeSummaryForUi(step,requirementSnapshot);
        item.appendChild(head);
        item.appendChild(text);
        item.appendChild(purpose);
        e.harnessPlanList.appendChild(item);
      });
    }
  }
  const requirementPhase=flowItems.find((phase)=>phase&&phase.id==="requirements")||flowItems[0]||null;
  const planningPhase=flowItems.find((phase)=>phase&&phase.id==="planning")||flowItems[1]||null;
  const executionPhase=flowItems.find((phase)=>phase&&phase.id==="execution")||flowItems[2]||null;
  const qualityPhase=flowItems.find((phase)=>phase&&phase.id==="quality")||flowItems[3]||null;
  const reportPhase=flowItems.find((phase)=>phase&&phase.id==="report")||flowItems[4]||null;

  const highlights=[];
  if(runtimeContext&&runtimeContext.taskFamily){
    const familyParts=[`勝ち筋: ${taskFamilyLabelForUi(runtimeContext.taskFamily)}`];
    if(runtimeContext.planningMode)familyParts.push(runtimeContext.planningMode);
    highlights.push(familyParts.join(" / "));
  }
  if(runtimeContext&&runtimeContext.userValueThesis){
    highlights.push(`価値の中心: ${t1(runtimeContext.userValueThesis,120)}`);
  }
  if(runtimeContext&&(runtimeContext.qualityAxisCount>0||runtimeContext.mustAvoidCount>0||runtimeContext.completedMeansCount>0)){
    const focusParts=[];
    if(runtimeContext.qualityAxisCount>0)focusParts.push(`品質軸 ${runtimeContext.qualityAxisCount}`);
    if(runtimeContext.mustAvoidCount>0)focusParts.push(`避けること ${runtimeContext.mustAvoidCount}`);
    if(runtimeContext.completedMeansCount>0)focusParts.push(`完了条件 ${runtimeContext.completedMeansCount}`);
    highlights.push(`見るべき点: ${focusParts.join(" / ")}`);
  }
  const inProgressStep=planSteps.find((step)=>step&&step.status==="in_progress");
  if(planDecision==="skip"&&planFocus&&planFocus.text){
    highlights.push(planSkipReasonLabelForUi(displayedPlan.skipReason));
  }else if(inProgressStep&&inProgressStep.text){
    highlights.push(`進行中プラン: ${inProgressStep.text}`);
  }else if(planSteps.length&&planFocus&&planFocus.text){
    highlights.push(`現在プラン: ${planFocus.text}`);
  }
  const failedEvent=toArr(h.events).find((item)=>item&&item.tone==="failed");
  if(failedEvent){
    highlights.push(`ブロッカー: ${failedEvent.l}${failedEvent.d?` / ${failedEvent.d}`:""}`);
  }
  if(status==="needs_input"){
    highlights.push("ユーザー入力待ち: 追加回答または承認が必要です。");
  }
  if(Number(evidence.tasksTotal)>0&&Number(evidence.tasksDone)<Number(evidence.tasksTotal)){
    highlights.push(`未完了タスク: ${Number(evidence.tasksDone)||0}/${Number(evidence.tasksTotal)||0}`);
  }
  if(qualityPhase&&(qualityPhase.state!=="todo"||Number(evidence.tests)+Number(evidence.reviews)+Number(evidence.logs)>0)){
    highlights.push(`品質確認: テスト${Number(evidence.tests)||0} / レビュー${Number(evidence.reviews)||0} / ログ${Number(evidence.logs)||0}`);
  }else if(reportPhase&&(reportPhase.state!=="todo"||["completed","failed","needs_input","interrupted"].includes(status))){
    highlights.push(`報告: ${describePhase(reportPhase)}`);
  }

  highlightsEl.innerHTML="";
  const rows=highlights.slice(0,5);
  if(!rows.length){
    highlightsEl.innerHTML='<li class="harness-empty">追加の判断情報はありません。</li>';
    return;
  }
  rows.forEach((row)=>{
    const li=document.createElement("li");
    li.textContent=row;
    highlightsEl.appendChild(li);
  });
}
function inspect(){if(!e.agentInspector)return;const c=active();if(!c)return;const ra=rAgents().find(a=>a.name===c.agent);e.agentInspector.textContent=ra?`Agent: ${operatorFacingAgentLabelForUi(ra.name)}\nActive: ${ra.isActive?"yes":"no"}\nSession: ${ra.sessionRef||"none"}`:`Agent: ${operatorFacingAgentLabelForUi(c.agent)}\nRuntime metadata not available.`}
function trace(type,agent,detail="",cid=s.active){s.trace.unshift({type,agent,cid:cid||"",detail:t1(detail,140),at:Date.now()});s.trace=s.trace.slice(0,180);flow()}
function traceTone(type){
  const normalized=lowerText(type).replace(/[\s-]+/g,"_");
  if(normalized==="dispatch"||normalized==="streaming"||normalized==="running"||normalized==="working"||normalized==="spawned")return"running";
  if(normalized==="completed"||normalized==="done"||normalized==="pass"||normalized==="success")return"completed";
  if(normalized==="failed"||normalized==="aborted"||normalized==="interrupted"||normalized==="needs_input")return"failed";
  return"idle";
}
function monitorRowEventAtForUi(row){
  if(!row||typeof row!=="object")return 0;
  if(Number.isFinite(Number(row.updatedAt))&&Number(row.updatedAt)>0)return Math.max(0,Math.trunc(Number(row.updatedAt)));
  if(Number.isFinite(Number(row.completedAt))&&Number(row.completedAt)>0)return Math.max(0,Math.trunc(Number(row.completedAt)));
  return 0;
}
function executionTraceBucketForUi({row=null,pendingCount=0,lastTrace=null}={}){
  if(pendingCount>0)return"running";
  if(lastTrace){
    const traceBucket=traceTone(lastTrace.type);
    if(traceBucket==="running"||traceBucket==="completed"||traceBucket==="failed")return traceBucket;
  }
  if(isRunningMonitorAgentForUi(row))return"running";
  if(isFailedMonitorAgentForUi(row))return"failed";
  if(isCompletedMonitorAgentForUi(row))return"completed";
  return"idle";
}
function executionTraceStatusTextForUi({bucket,row=null,pendingCount=0,lastTrace=null}={}){
  const status=lowerText(row&&row.status);
  if(bucket==="running"){
    if(status.includes("spawn"))return"初期化中";
    return pendingCount>1?`実行中 (${pendingCount})`:"実行中";
  }
  if(bucket==="completed"){
    if(status.includes("pass"))return"PASS";
    return"完了";
  }
  if(bucket==="failed"){
    if(status.includes("needs_input")||status.includes("input"))return"入力待ち";
    if((lastTrace&&lastTrace.type==="aborted")||status.includes("interrupt")||status.includes("abort")||status.includes("cancel"))return"中断";
    return"失敗";
  }
  return status==="configured"?"準備済み":"待機";
}
function executionTraceActivityForUi({row=null,lastTrace=null,pendingCount=0}={}){
  const traceAt=lastTrace&&Number.isFinite(Number(lastTrace.at))?Number(lastTrace.at):0;
  const rowAt=monitorRowEventAtForUi(row);
  if(traceAt>=rowAt&&lastTrace){
    return `${tt(traceAt)} ${lastTrace.type}${lastTrace.detail?` / ${lastTrace.detail}`:""}`;
  }
  const detail=row&&typeof row.syncDetail==="string"&&row.syncDetail.trim()
    ?row.syncDetail.trim()
    :(row&&typeof row.description==="string"&&row.description.trim()?t1(row.description,140):"");
  const status=row&&typeof row.status==="string"&&row.status.trim()?row.status.trim():"";
  if(rowAt>0&&(status||detail)){
    return `${tt(rowAt)} ${status||"status"}${detail?` / ${detail}`:""}`;
  }
  if(pendingCount>0)return"実行リクエスト処理中";
  return"待機中";
}
function executionTraceRoleLabelForUi(row,name=""){
  if(row&&row.role==="parent")return"親";
  if(isVerificationAgentForUi(row&&row.name?row:{name}))return"検証";
  return"専門";
}
function synthesizeTraceRowsForUi(baseRows,topographyRows,pendingByAgent,currentChatId){
  const rows=Array.isArray(baseRows)?baseRows.map((row)=>row&&typeof row==="object"?{...row}:row).filter(Boolean):[];
  const seenKeys=new Set(rows.map((row)=>`${normalizeAgentNameForUi(row&&row.agent)}::${Number.isFinite(Number(row&&row.at))?Math.trunc(Number(row.at)):0}::${String(row&&row.type||"")}`));
  toArr(topographyRows).forEach((row)=>{
    if(!row||typeof row!=="object")return;
    const bucket=executionTraceBucketForUi({row,pendingCount:pendingByAgent instanceof Map?(pendingByAgent.get(row.name)||0):0,lastTrace:null});
    if(bucket==="idle")return;
    const at=monitorRowEventAtForUi(row);
    if(!at)return;
    const type=bucket==="running"
      ?(lowerText(row.status).includes("spawn")?"spawned":"running")
      :bucket==="completed"
        ?"completed"
        :(lowerText(row.status).includes("needs_input")?"needs_input":lowerText(row.status).includes("interrupt")?"aborted":"failed");
    const detail=executionTraceActivityForUi({row,pendingCount:0}).replace(/^\d{2}:\d{2}:\d{2}\s+/,"");
    const key=`${normalizeAgentNameForUi(row.name)}::${at}::${type}`;
    if(seenKeys.has(key))return;
    seenKeys.add(key);
    rows.push({type,agent:row.name,cid:currentChatId,detail,at});
  });
  rows.sort((left,right)=>Number(right&&right.at||0)-Number(left&&left.at||0));
  return rows;
}
function flow(){
  const currentChat=active();
  const currentChatId=currentChat&&currentChat.id?currentChat.id:"";
  const traceRows=s.trace.filter((item)=>item&&item.cid===currentChatId);
  const topographyRows=syncedTopographyRows(topographyState.agents);
  const topographyByName=new Map();
  topographyRows.forEach((row)=>{
    if(!row||!row.name||isHiddenAgentForUi(row.name))return;
    topographyByName.set(row.name,row);
  });
  const names=new Set();
  if(currentChat&&currentChat.agent&&!isHiddenAgentForUi(currentChat.agent))names.add(currentChat.agent);
  topographyRows.forEach((row)=>{
    if(!row||!row.name||isHiddenAgentForUi(row.name))return;
    names.add(row.name);
  });
  s.req.forEach((r)=>{
    if(!r||r.cid!==currentChatId||!r.agent||isHiddenAgentForUi(r.agent))return;
    names.add(resolveMonitorAgentNameForUi(r.agent,topographyByName)||r.agent);
  });
  traceRows.forEach((row)=>{
    if(!row||!row.agent||isHiddenAgentForUi(row.agent))return;
    names.add(resolveMonitorAgentNameForUi(row.agent,topographyByName)||row.agent);
  });
  if(!names.size)names.add(DEFAULT_AGENT_NAME);

  e.agentFlowLane.innerHTML="";
  const list=[...names].filter(Boolean).filter((name)=>!isHiddenAgentForUi(name)).sort((a,b)=>a.localeCompare(b));
  if(!list.length){
    e.agentFlowLane.innerHTML='<article class="agent-flow-empty">まだエージェント情報がありません。</article>';
  }else{
    const pendingByAgent=new Map();
    s.req.forEach((item)=>{
      if(!item||item.cid!==currentChatId||!item.agent||isHiddenAgentForUi(item.agent))return;
      const name=resolveMonitorAgentNameForUi(item.agent,topographyByName)||item.agent;
      pendingByAgent.set(name,(pendingByAgent.get(name)||0)+1);
    });
    const runtimeByName=new Map();
    rAgents().forEach((item,index)=>{
      const normalized=normalizeMonitorAgent(item,index,{runtimeFallback:true});
      const name=resolveMonitorAgentNameForUi(normalized&&normalized.name?normalized.name:"",topographyByName)||normalized.name;
      if(!normalized||!name||isHiddenAgentForUi(name))return;
      runtimeByName.set(name,{...normalized,name});
    });
    runtimeByName.forEach((runtime,name)=>{
      if(!runtime||!name||isHiddenAgentForUi(name))return;
      const activeTurnId=typeof runtime.activeTurnId==="string"?runtime.activeTurnId.trim():"";
      if(!activeTurnId)return;
      pendingByAgent.set(name,Math.max(1,pendingByAgent.get(name)||0));
    });
    const latestTraceByAgent=new Map();
    traceRows.forEach((item)=>{
      const name=resolveMonitorAgentNameForUi(item&&item.agent?item.agent:"",topographyByName);
      if(name&&!latestTraceByAgent.has(name))latestTraceByAgent.set(name,item);
    });

    const buckets={idle:[],running:[],completed:[],failed:[]};
    list.forEach((name)=>{
      const runtime=runtimeByName.get(name)||null;
      const monitorRow=topographyByName.get(name)||runtime||null;
      const pendingCount=pendingByAgent.get(name)||0;
      const lastTrace=latestTraceByAgent.get(name)||null;
      const tone=executionTraceBucketForUi({row:monitorRow,pendingCount,lastTrace});
      const statusText=executionTraceStatusTextForUi({bucket:tone,row:monitorRow,pendingCount,lastTrace});
      const activity=executionTraceActivityForUi({row:monitorRow,lastTrace,pendingCount});

      const card=document.createElement("article");
      card.className="agent-flow-card";
      if(tone==="running")card.classList.add("running");
      else if(tone!=="idle")card.classList.add("active");
      const title=document.createElement("h5");
      title.className="agent-flow-name";
      title.textContent=operatorFacingAgentLabelForUi(name);
      const status=document.createElement("p");
      status.className=`agent-flow-status ${tone==="running"?"running":(tone==="idle"?"idle":"active")}`;
      status.textContent=statusText;
      const role=document.createElement("p");
      role.className="agent-flow-meta";
      role.textContent=`区分: ${executionTraceRoleLabelForUi(monitorRow,name)}`;
      const session=document.createElement("p");
      session.className="agent-flow-meta";
      const sessionParts=[];
      if(monitorRow&&(monitorRow.sessionRef||monitorRow.threadId))sessionParts.push(`session ${compactMonitorRefForUi(monitorRow.sessionRef||monitorRow.threadId)}`);
      else if(runtime&&(runtime.sessionRef||runtime.threadId))sessionParts.push(`session ${compactMonitorRefForUi(runtime.sessionRef||runtime.threadId)}`);
      if(monitorRow&&monitorRow.activeTurnId)sessionParts.push(`turn ${compactMonitorRefForUi(monitorRow.activeTurnId)}`);
      session.textContent=sessionParts.length?sessionParts.join(" / "):"session なし";
      const work=document.createElement("p");
      work.className="agent-flow-meta";
      work.textContent=`直近: ${activity}`;
      card.appendChild(title);
      card.appendChild(status);
      card.appendChild(role);
      card.appendChild(session);
      card.appendChild(work);
      buckets[tone].push(card);
    });

    const columns=[{key:"idle",title:"待機",tone:"idle"},{key:"running",title:"実行中",tone:"running"},{key:"completed",title:"完了",tone:"completed"},{key:"failed",title:"失敗/中断",tone:"failed"}];
    columns.forEach((column)=>{
      const wrap=document.createElement("article");
      wrap.className=`agent-flow-column ${column.tone==="idle"?"":column.tone}`.trim();
      const head=document.createElement("div");
      head.className="agent-flow-column-head";
      const label=document.createElement("span");
      label.textContent=column.title;
      const count=document.createElement("span");
      count.className="agent-flow-column-count";
      count.textContent=`${buckets[column.key].length} 件`;
      head.appendChild(label);
      head.appendChild(count);
      const body=document.createElement("div");
      body.className="agent-flow-column-body";
      if(!buckets[column.key].length){
        const empty=document.createElement("article");
        empty.className="agent-flow-empty";
        empty.textContent="なし";
        body.appendChild(empty);
      }else{
        buckets[column.key].forEach((card)=>body.appendChild(card));
      }
      wrap.appendChild(head);
      wrap.appendChild(body);
      e.agentFlowLane.appendChild(wrap);
    });
  }

  const traceRowsForList=synthesizeTraceRowsForUi(traceRows,topographyRows,(function(){const map=new Map();s.req.forEach((item)=>{if(!item||item.cid!==currentChatId||!item.agent||isHiddenAgentForUi(item.agent))return;const name=resolveMonitorAgentNameForUi(item.agent,topographyByName)||item.agent;map.set(name,(map.get(name)||0)+1);});return map;})(),currentChatId);
  e.agentTraceList.innerHTML=traceRowsForList.length?"":'<li class="agent-trace-empty">まだトレースイベントはありません。</li>';
  traceRowsForList.slice(0,32).forEach(x=>{const tone=traceTone(x.type)==="failed"?(x.type==="aborted"?"aborted":"failed"):traceTone(x.type);const li=document.createElement("li");li.className=`agent-trace-item ${tone}`;li.innerHTML=`<span class=\"agent-trace-time\">${tt(x.at)}</span><span class=\"agent-trace-agent\">${operatorFacingAgentLabelForUi(x.agent)}</span><span class=\"agent-trace-event\">${x.type}</span><span class=\"agent-trace-detail\">${x.detail||"-"}</span>`;e.agentTraceList.appendChild(li)});
  renderAgentTopography();
}
function live(){
  flow();
  const currentChat=active();
  const currentChatId=currentChat&&currentChat.id?currentChat.id:"";
  const currentPending=currentChatId?pendingCountForChat(currentChatId):0;
  const currentPerf=currentChat?ensureChatPerformance(currentChat,typeof currentChat?.h?.thread==="string"?currentChat.h.thread.trim():""):s.perf;
  const runningRows=[...s.req.values()].filter((row)=>row&&row.cid===currentChatId);
  const total=runningRows.length;
  if(currentPending>0){
    const starts=runningRows.map((r)=>r.at).filter(Number.isFinite);
    const start=starts.length?Math.min(...starts):(Number.isFinite(Number(currentPerf.liveTurnStartedAt))&&currentPerf.liveTurnStartedAt>0?currentPerf.liveTurnStartedAt:Date.now());
    const bag=new Map();
    runningRows.forEach((r)=>bag.set(r.agent,(bag.get(r.agent)||0)+1));
    if(!bag.size&&currentChat&&currentChat.agent){
      bag.set(currentChat.agent,1);
    }
    e.liveStatus.className="live-status running";
    e.liveStatusLabel.textContent=`実行中 (${currentPending})`;
    e.liveStatusElapsed.textContent=el(Date.now()-start);
    e.liveStatusDetail.textContent=[...bag.entries()].map(([n,c])=>{const label=operatorFacingAgentLabelForUi(n);return c>1?`${label} x${c}`:label;}).join(" / ")||"処理中...";
    renderPerformanceIndicator();
    if(s.ticker===null)s.ticker=setInterval(live,400);
    return;
  }
  if(s.ticker!==null){
    clearInterval(s.ticker);
    s.ticker=null;
  }
  const lastForCurrentChat=s.last&&s.last.cid===currentChatId?s.last:null;
  if(!lastForCurrentChat){
    const runningElsewhere=Math.max(0,totalPendingCount()-currentPending);
    e.liveStatus.className="live-status idle";
    e.liveStatusLabel.textContent="待機中";
    e.liveStatusElapsed.textContent="--:--";
    e.liveStatusDetail.textContent=runningElsewhere>0
      ?`このチャットに実行中の要求はありません。他のチャットで ${runningElsewhere} 件動いています。`
      :"まだ要求はありません。";
    renderPerformanceIndicator();
    return;
  }
  const tone=lastForCurrentChat.type==="failed"?"failed":lastForCurrentChat.type==="aborted"?"aborted":"completed";
  e.liveStatus.className=`live-status ${tone}`;
  e.liveStatusLabel.textContent=lastForCurrentChat.type==="failed"?"直前の実行は失敗":lastForCurrentChat.type==="aborted"?"直前の実行は中断":"直前の実行は完了";
  e.liveStatusElapsed.textContent=el(Date.now()-lastForCurrentChat.at);
  e.liveStatusDetail.textContent=`${lastForCurrentChat.chat||"チャット"} / ${operatorFacingAgentLabelForUi(lastForCurrentChat.agent)||"agent"} / ${lastForCurrentChat.detail||""}`;
  renderPerformanceIndicator();
}
function pending(){
  const c=active();
  const totalPending=totalPendingCount();
  const localCurrentPending=c?localPendingCountForChat(c.id):0;
  const currentPending=c?pendingCountForChat(c.id):0;
  const hasPending=totalPending>0;
  const hasCurrentPending=currentPending>0;
  if(c)c.pending=currentPending;
  e.stopBtn.disabled=!c||localCurrentPending===0;
  if(e.sendBtn)e.sendBtn.disabled=!c||currentPending>0;
  if(e.deleteChatBtn)e.deleteChatBtn.disabled=!c;
  if(!hasPending)e.pendingState.textContent="待機なし";
  else if(currentPending>0)e.pendingState.textContent=`実行待ち: このチャット ${currentPending} / 全体 ${totalPending}`;
  else e.pendingState.textContent=`他チャットで実行中: ${totalPending}`;
  e.pendingState.classList.toggle("waiting",hasCurrentPending);
  e.pendingState.classList.toggle("idle",!hasCurrentPending);
  if(!c)e.agentState.textContent="チャット未選択";
  else{
    const agentLabel=operatorFacingAgentLabelForUi(c.agent);
    e.agentState.textContent=`チャット: ${c.title}${currentPending>0?` (${currentPending})`:""} / エージェント: ${agentLabel}`;
  }
}
function refresh(){renderTimeline();renderChatList();renderHarness();inspect();pending();live();renderPerformanceIndicator();renderAutomationStatus();renderWorkspaceGuardUi();renderMissionSupportUi();syncRuntimePendingMonitor()}
function normalizeApprovalPolicyForUi(value,fallback="on-request"){
  const normalized=typeof value==="string"?value.trim().toLowerCase():"";
  if(normalized==="on-failure")return"on-request";
  return ALLOWED_APPROVAL_POLICIES.has(normalized)?normalized:fallback;
}
function normalizeSandboxModeForUi(value,fallback="workspace-write"){
  const normalized=typeof value==="string"?value.trim().toLowerCase():"";
  return ALLOWED_SANDBOX_MODES.has(normalized)?normalized:fallback;
}
function normalizeWebSearchModeForUi(value,fallback="cached"){
  if(typeof value==="boolean")return value?"live":"disabled";
  if(typeof value==="number")return value!==0?"live":"disabled";
  const normalized=typeof value==="string"?value.trim().toLowerCase():"";
  if(normalized==="1"||normalized==="true"||normalized==="on")return"live";
  if(normalized==="0"||normalized==="false"||normalized==="off")return"disabled";
  return ALLOWED_WEB_SEARCH_MODES.has(normalized)?normalized:fallback;
}
function webSearchEnabledForUi(value){
  return normalizeWebSearchModeForUi(value,"disabled")!=="disabled";
}
function webSearchModeLabelForUi(value){
  const normalized=normalizeWebSearchModeForUi(value,"cached");
  if(normalized==="live")return"Web: live";
  if(normalized==="disabled")return"Web: disabled";
  return"Web: cached";
}
function normalizeExecutionProfileForUi(value,fallback=DEFAULT_PROFILE_ID){
  const normalized=typeof value==="string"?value.trim().toLowerCase():"";
  if(!normalized)return fallback;
  const aliased=LEGACY_PROFILE_ALIASES[normalized]||normalized;
  if(aliased==="custom")return aliased;
  return PROFILE_IDS.has(aliased)?aliased:fallback;
}
function executionProfileLabelForUi(value){
  const normalized=normalizeExecutionProfileForUi(value,"custom");
  return PROFILE_LABELS[normalized]||PROFILE_LABELS.custom;
}
function currentPermissionSnapshotForUi(){
  return{
    approvalPolicy:normalizeApprovalPolicyForUi(e.approvalPolicy&&e.approvalPolicy.value,""),
    sandboxMode:normalizeSandboxModeForUi(e.sandboxMode&&e.sandboxMode.value,""),
    webSearchMode:normalizeWebSearchModeForUi(e.webSearchMode&&e.webSearchMode.value,""),
    automaticApprovalReviewEnabled:Boolean(e.automaticApprovalReviewEnabled&&e.automaticApprovalReviewEnabled.checked),
  };
}
function describeExecutionProfileForUi(profileId,snap=currentPermissionSnapshotForUi()){
  const normalized=normalizeExecutionProfileForUi(profileId,"custom");
  if(normalized==="auto")return"Workspace 内では自動で読み書きと実行を行い、workspace 外や追加リスクのある操作では承認を求めます。";
  if(normalized==="read-only")return"まず読む・考えることに寄せるモードです。編集、コマンド実行、ネットワーク利用は承認待ちになります。";
  if(normalized==="guardian")return"Workspace 書き込みを維持しつつ、eligible な on-request 承認を guardian reviewer に回します。";
  if(normalized==="full-access")return"サンドボックスも承認も外し、workspace 外アクセスと live Web検索を許可します。注意して使ってください。";
  const parts=[
    `approval_policy=${snap.approvalPolicy||"on-request"}`,
    `sandbox_mode=${snap.sandboxMode||"workspace-write"}`,
    `web_search=${snap.webSearchMode||"cached"}`,
    `guardian=${snap.automaticApprovalReviewEnabled?"on":"off"}`,
  ];
  return`下の config-level controls がそのまま有効です。現在の組み合わせは ${parts.join(" / ")} です。`;
}
function syncPermissionModeControlsForUi(){
  const isCustom=normalizeExecutionProfileForUi(e.executionProfile&&e.executionProfile.value,"custom")==="custom";
  [e.approvalPolicy,e.automaticApprovalReviewEnabled,e.sandboxMode].filter(Boolean).forEach(control=>control.disabled=!isCustom);
  if(e.permissionsAdvancedHint){
    e.permissionsAdvancedHint.textContent=isCustom
      ?"Custom を選んでいるため、この欄の値がそのまま request payload に反映されます。"
      :"上位モードが raw controls を上書きしています。細かく調整したい場合だけ Custom に切り替えてください。";
  }
  if(e.permissionsAdvanced&&isCustom)e.permissionsAdvanced.open=true;
}
function renderExecutionProfileSummaryForUi(profileId=e.executionProfile&&e.executionProfile.value){
  const normalized=normalizeExecutionProfileForUi(profileId,"custom");
  const snap=currentPermissionSnapshotForUi();
  if(e.executionProfileHeadline)e.executionProfileHeadline.textContent=executionProfileLabelForUi(normalized);
  if(e.executionProfileDescription)e.executionProfileDescription.textContent=describeExecutionProfileForUi(normalized,snap);
  if(e.executionProfileApprovalChip)e.executionProfileApprovalChip.textContent=`Approval: ${snap.approvalPolicy||"on-request"}`;
  if(e.executionProfileSandboxChip)e.executionProfileSandboxChip.textContent=`Sandbox: ${snap.sandboxMode||"workspace-write"}`;
  if(e.executionProfileSearchChip)e.executionProfileSearchChip.textContent=webSearchModeLabelForUi(snap.webSearchMode||"cached");
  if(e.executionProfileGuardianChip){
    const guardianLabel=snap.approvalPolicy==="never"
      ?"Guardian: inactive"
      :`Guardian: ${snap.automaticApprovalReviewEnabled?"on":"off"}`;
    e.executionProfileGuardianChip.textContent=guardianLabel;
  }
}
function applyExecutionProfileToUi(profileId){
  const normalized=normalizeExecutionProfileForUi(profileId,"");
  const profile=normalized?PROFILES[normalized]:null;
  if(!profile)return false;
  e.executionProfile.value=normalized;
  e.approvalPolicy.value=profile.approvalPolicy;
  if(e.fastModeEnabled)e.fastModeEnabled.checked=runtimeDefaultFastModeEnabled();
  if(e.automaticApprovalReviewEnabled)e.automaticApprovalReviewEnabled.checked=Boolean(profile.automaticApprovalReviewEnabled);
  e.sandboxMode.value=profile.sandboxMode;
  if(e.webSearchMode)e.webSearchMode.value=profile.webSearchMode;
  renderExecutionProfileSummaryForUi(normalized);
  syncPermissionModeControlsForUi();
  return true;
}
function profileSync(){
  const snap=currentPermissionSnapshotForUi();
  const id=Object.keys(PROFILES).find(k=>{
    const p=PROFILES[k];
    return p.approvalPolicy===snap.approvalPolicy
      &&p.sandboxMode===snap.sandboxMode
      &&p.webSearchMode===snap.webSearchMode
      &&Boolean(p.automaticApprovalReviewEnabled)===snap.automaticApprovalReviewEnabled;
  });
  e.executionProfile.value=id||"custom";
  renderExecutionProfileSummaryForUi(e.executionProfile.value);
  syncPermissionModeControlsForUi();
}
function normalizeSavedMessage(raw,index){
  if(!raw||typeof raw!=="object")return null;
  const id=typeof raw.id==="string"&&raw.id.trim()?raw.id.trim():`m-restore-${index+1}`;
  const role=typeof raw.role==="string"&&raw.role.trim()?raw.role.trim():"assistant";
  const title=typeof raw.title==="string"&&raw.title.trim()?raw.title.trim():(role==="user"?"You":"Codex");
  const time=typeof raw.time==="string"?raw.time:"";
  const content=typeof raw.content==="string"?raw.content:String(raw.content||"");
  return{id,role,title,time,content};
}
function normalizeSavedChat(raw,index){
  if(!raw||typeof raw!=="object")return null;
  const id=typeof raw.id==="string"&&raw.id.trim()?raw.id.trim():`chat-restore-${index+1}-${Date.now()}`;
  const title=t1(raw.title||`Chat ${index+1}`,60).trim()||`Chat ${index+1}`;
  const savedAgent=typeof raw.agent==="string"&&raw.agent.trim()?raw.agent.trim():"";
  const agent=normalizeScopedChatAgentNameForUi(savedAgent,id);
  const messages=toArr(raw.messages).map((item,msgIndex)=>normalizeSavedMessage(item,msgIndex)).filter(Boolean).slice(-CHAT_MESSAGE_LIMIT);
  const forceNewSession=typeof raw.forceNewSession==="boolean"?raw.forceNewSession:messages.length===0;
  return{id,title,agent,pending:0,messages,h:normalizeSavedHarnessState(raw.h),perf:createPerformanceState(),forceNewSession};
}
function normalizeSavedHarnessEvent(raw,index){
  if(!raw||typeof raw!=="object")return null;
  const label=t1(raw.l||raw.label||"",56).trim();
  if(!label)return null;
  return{
    l:label,
    d:t1(raw.d||raw.detail||"",220),
    tone:typeof raw.tone==="string"&&raw.tone.trim()?raw.tone.trim():"info",
    at:Number.isFinite(Number(raw.at))?Math.max(0,Math.trunc(Number(raw.at))):index+1,
  };
}
function normalizeSavedHarnessPlanStep(raw){
  if(!raw||typeof raw!=="object")return null;
  const step=String(raw.step||"").trim();
  if(!step)return null;
  return{
    step:t1(step,200),
    status:typeof raw.status==="string"&&raw.status.trim()?raw.status.trim():"pending",
    phase:typeof raw.phase==="string"?raw.phase:"",
    kind:typeof raw.kind==="string"?raw.kind:"",
    ownerAgent:typeof raw.ownerAgent==="string"?raw.ownerAgent:"",
    stepId:typeof raw.stepId==="string"?raw.stepId:"",
    requestClauseRefs:normalizePlanTraceRefsForUi(raw.requestClauseRefs,24),
    requirementRefs:normalizePlanTraceRefsForUi(raw.requirementRefs,24),
    acceptanceCheckRefs:normalizePlanTraceRefsForUi(raw.acceptanceCheckRefs,16),
  };
}
function normalizeSavedHarnessState(raw){
  const base=createHarnessState();
  if(!raw||typeof raw!=="object")return base;
  base.status=typeof raw.status==="string"&&raw.status.trim()?raw.status.trim():"idle";
  base.thread=typeof raw.thread==="string"?raw.thread.trim():"";
  base.turn=typeof raw.turn==="string"?raw.turn.trim():"";
  base.at=Number.isFinite(Number(raw.at))?Math.max(0,Math.trunc(Number(raw.at))):0;
  base.events=toArr(raw.events).map((item,index)=>normalizeSavedHarnessEvent(item,index)).filter(Boolean).slice(0,64);
  base.planExp=typeof raw.planExp==="string"?raw.planExp:"";
  base.plan=toArr(raw.plan).map((item)=>normalizeSavedHarnessPlanStep(item)).filter(Boolean).slice(0,16);
  const planMeta=raw.planMeta&&typeof raw.planMeta==="object"?raw.planMeta:{};
  base.planMeta={
    source:typeof planMeta.source==="string"?planMeta.source:"",
    decision:typeof planMeta.decision==="string"?planMeta.decision:"",
    skipReason:typeof planMeta.skipReason==="string"?planMeta.skipReason:"",
    planningMode:typeof planMeta.planningMode==="string"?planMeta.planningMode:"",
    planningDepth:typeof planMeta.planningDepth==="string"?planMeta.planningDepth:"",
    assuranceDepth:typeof planMeta.assuranceDepth==="string"?planMeta.assuranceDepth:"",
    flowPath:typeof planMeta.flowPath==="string"?planMeta.flowPath:"",
    generatedBy:typeof planMeta.generatedBy==="string"?planMeta.generatedBy:"",
  };
  base.tokens=typeof raw.tokens==="string"?raw.tokens:"";
  base.diff=typeof raw.diff==="string"?raw.diff:"";
  const evidence=raw.evidence&&typeof raw.evidence==="object"?raw.evidence:{};
  base.evidence={
    tasksDone:Number.isFinite(Number(evidence.tasksDone))?Math.max(0,Math.trunc(Number(evidence.tasksDone))):0,
    tasksTotal:Number.isFinite(Number(evidence.tasksTotal))?Math.max(0,Math.trunc(Number(evidence.tasksTotal))):0,
    tests:Number.isFinite(Number(evidence.tests))?Math.max(0,Math.trunc(Number(evidence.tests))):0,
    reviews:Number.isFinite(Number(evidence.reviews))?Math.max(0,Math.trunc(Number(evidence.reviews))):0,
    logs:Number.isFinite(Number(evidence.logs))?Math.max(0,Math.trunc(Number(evidence.logs))):0,
  };
  const signals=raw.signals&&typeof raw.signals==="object"?raw.signals:{};
  base.signals={
    requirement:Boolean(signals.requirement),
    dispatch:Boolean(signals.dispatch),
    turnStart:Boolean(signals.turnStart),
    turnCompleted:Boolean(signals.turnCompleted),
    plan:Boolean(signals.plan),
    planInferred:Boolean(signals.planInferred),
    delegation:Boolean(signals.delegation),
    quality:Boolean(signals.quality),
  };
  base.turnSnapshot=captureTurnSnapshotForUi(raw.turnSnapshot);
  return base;
}
function serializeHarnessState(h){
  const source=h&&typeof h==="object"?h:createHarnessState();
  const planMeta=ensureHarnessPlanMeta(source);
  const signals=ensureHarnessSignals(source);
  return{
    status:typeof source.status==="string"?source.status:"idle",
    thread:typeof source.thread==="string"?source.thread:"",
    turn:typeof source.turn==="string"?source.turn:"",
    at:Number.isFinite(Number(source.at))?Math.max(0,Math.trunc(Number(source.at))):0,
    events:toArr(source.events).map((item,index)=>normalizeSavedHarnessEvent(item,index)).filter(Boolean).slice(0,64),
    planExp:typeof source.planExp==="string"?source.planExp:"",
    plan:toArr(source.plan).map((item)=>normalizeSavedHarnessPlanStep(item)).filter(Boolean).slice(0,16),
    planMeta:{
      source:planMeta.source,
      decision:planMeta.decision,
      skipReason:planMeta.skipReason,
      planningMode:planMeta.planningMode,
      planningDepth:planMeta.planningDepth,
      assuranceDepth:planMeta.assuranceDepth,
      flowPath:planMeta.flowPath,
      generatedBy:planMeta.generatedBy,
    },
    tokens:typeof source.tokens==="string"?source.tokens:"",
    diff:typeof source.diff==="string"?source.diff:"",
    evidence:{
      tasksDone:Number.isFinite(Number(source?.evidence?.tasksDone))?Math.max(0,Math.trunc(Number(source.evidence.tasksDone))):0,
      tasksTotal:Number.isFinite(Number(source?.evidence?.tasksTotal))?Math.max(0,Math.trunc(Number(source.evidence.tasksTotal))):0,
      tests:Number.isFinite(Number(source?.evidence?.tests))?Math.max(0,Math.trunc(Number(source.evidence.tests))):0,
      reviews:Number.isFinite(Number(source?.evidence?.reviews))?Math.max(0,Math.trunc(Number(source.evidence.reviews))):0,
      logs:Number.isFinite(Number(source?.evidence?.logs))?Math.max(0,Math.trunc(Number(source.evidence.logs))):0,
    },
    signals:{
      requirement:Boolean(signals.requirement),
      dispatch:Boolean(signals.dispatch),
      turnStart:Boolean(signals.turnStart),
      turnCompleted:Boolean(signals.turnCompleted),
      plan:Boolean(signals.plan),
      planInferred:Boolean(signals.planInferred),
      delegation:Boolean(signals.delegation),
      quality:Boolean(signals.quality),
    },
    turnSnapshot:captureTurnSnapshotForUi(source.turnSnapshot),
  };
}
function deriveNextChatCounter(chats){
  let next=1;
  toArr(chats).forEach((item)=>{
    const matched=String(item&&item.id||"").match(/^chat-(\d+)-/);
    if(!matched)return;
    const current=Number(matched[1]);
    if(Number.isFinite(current))next=Math.max(next,Math.trunc(current)+1);
  });
  return next;
}
function deriveNextMessageCounter(chats){
  let next=1;
  toArr(chats).forEach((item)=>{
    toArr(item&&item.messages).forEach((message)=>{
      const matched=String(message&&message.id||"").match(/^m-(\d+)/);
      if(!matched)return;
      const current=Number(matched[1]);
      if(Number.isFinite(current))next=Math.max(next,Math.trunc(current)+1);
    });
  });
  return next;
}
function saveChatStateNow(){
  try{
    const payload={
      v:CHAT_STATE_VERSION,
      active:s.active,
      nextChat:s.nextChat,
      nextMsg:s.nextMsg,
      chats:s.chats.map((chatRecord)=>({
        id:chatRecord.id,
        title:chatRecord.title,
        agent:chatRecord.agent,
        forceNewSession:Boolean(chatRecord.forceNewSession),
        h:serializeHarnessState(chatRecord.h),
        messages:toArr(chatRecord.messages).slice(-CHAT_MESSAGE_LIMIT).map((message)=>({
          id:message.id,
          role:message.role,
          title:message.title,
          time:message.time,
          content:message.content,
        })),
      })),
    };
    localStorage.setItem(CHAT_STATE_KEY,JSON.stringify(payload));
  }catch{}
}
function scheduleSaveChatState(){
  if(chatStateSave.timer!==null)return;
  chatStateSave.timer=setTimeout(()=>{
    chatStateSave.timer=null;
    saveChatStateNow();
  },180);
}
function flushSaveChatState(){
  if(chatStateSave.timer!==null){
    clearTimeout(chatStateSave.timer);
    chatStateSave.timer=null;
  }
  saveChatStateNow();
}
function loadChatState(){
  let parsed={};
  try{parsed=JSON.parse(localStorage.getItem(CHAT_STATE_KEY)||"{}")}catch{parsed={}}
  if(!parsed||typeof parsed!=="object")return;
  const version=Number.isFinite(Number(parsed.v))?Math.trunc(Number(parsed.v)):0;
  if(version!==CHAT_STATE_VERSION)return;
  const restored=toArr(parsed.chats).map((item,index)=>normalizeSavedChat(item,index)).filter(Boolean);
  if(!restored.length)return;
  s.chats=restored;
  const activeId=typeof parsed.active==="string"?parsed.active:"";
  s.active=restored.some((item)=>item.id===activeId)?activeId:restored[0].id;
  const storedNextChat=Number.isFinite(Number(parsed.nextChat))?Math.max(1,Math.trunc(Number(parsed.nextChat))):1;
  const storedNextMsg=Number.isFinite(Number(parsed.nextMsg))?Math.max(1,Math.trunc(Number(parsed.nextMsg))):1;
  s.nextChat=Math.max(storedNextChat,deriveNextChatCounter(restored));
  s.nextMsg=Math.max(storedNextMsg,deriveNextMessageCounter(restored));
}
function resolveStoredWebSearchModeForUi(parsed,fallback="cached"){
  const source=parsed&&typeof parsed==="object"?parsed:{};
  if(typeof source.webSearchMode==="string"&&source.webSearchMode.trim()){
    return normalizeWebSearchModeForUi(source.webSearchMode,fallback);
  }
  if(typeof source.webSearch==="boolean"){
    if(!source.webSearch)return"disabled";
    const legacyProfile=normalizeExecutionProfileForUi(source.executionProfile,"");
    const legacySandbox=normalizeSandboxModeForUi(source.sandboxMode,"workspace-write");
    if(legacyProfile==="full-access"||legacySandbox==="danger-full-access")return"live";
    return"cached";
  }
  return normalizeWebSearchModeForUi("",fallback);
}
function saveSettings(){
  try{
    const payload={
      approvalPolicy:e.approvalPolicy.value,
      fastModeEnabled:Boolean(e.fastModeEnabled&&e.fastModeEnabled.checked),
      automaticApprovalReviewEnabled:Boolean(e.automaticApprovalReviewEnabled&&e.automaticApprovalReviewEnabled.checked),
      sandboxMode:e.sandboxMode.value,
      webSearchMode:normalizeWebSearchModeForUi(e.webSearchMode&&e.webSearchMode.value,"cached"),
      webSearch:webSearchEnabledForUi(e.webSearchMode&&e.webSearchMode.value),
      executionProfile:e.executionProfile.value,
      modelName:selectedExecModel(),
      modelReasoningEffort:selectedExecModelReasoningEffort(),
      simpleView:document.body.classList.contains("simple-view"),
      uiVisibility:e.uiVisibility?Boolean(e.uiVisibility.checked):true,
      workspacePath:selectedCwd(),
    };
    localStorage.setItem(SETTINGS_KEY,JSON.stringify(payload));
    settingsState.hasStoredFastMode=true;
    settingsState.hasStoredAutomaticApprovalReview=true;
    settingsState.hasStoredExecutionProfile=true;
    settingsState.hasStoredWebSearchMode=true;
  }catch{}
}
function loadSettings(){
  let parsed={};
  const rawStoredSettings=localStorage.getItem(SETTINGS_KEY)||localStorage.getItem(SETTINGS_KEY_LEGACY)||"{}";
  try{parsed=JSON.parse(rawStoredSettings)}catch{parsed={}}
  const defaultProfile=PROFILES[DEFAULT_PROFILE_ID]||{approvalPolicy:"on-request",sandboxMode:"workspace-write",webSearchMode:"cached",automaticApprovalReviewEnabled:true};
  const normalizedStoredProfile=normalizeExecutionProfileForUi(parsed.executionProfile,"");
  const shouldApplyStoredPreset=normalizedStoredProfile&&normalizedStoredProfile!=="custom";
  settingsState.hasStoredModel=false;
  settingsState.hasStoredModelReasoningEffort=false;
  settingsState.hasStoredFastMode=false;
  settingsState.hasStoredAutomaticApprovalReview=false;
  settingsState.hasStoredExecutionProfile=false;
  settingsState.hasStoredWebSearchMode=false;
  settingsState.hasStoredPermissionDetail=false;
  applyExecutionProfileToUi(DEFAULT_PROFILE_ID);
  if(e.modelName){
    const runtimeModel=runtimeDefaultExecModel();
    hydrateExecModelOptionsForUi([runtimeModel,parsed&&typeof parsed.modelName==="string"?parsed.modelName:""]);
    e.modelName.value=ensureExecModelOptionForUi(runtimeModel)||runtimeModel;
  }
  if(e.modelReasoningEffort)e.modelReasoningEffort.value=runtimeDefaultExecModelReasoningEffort();
  if(shouldApplyStoredPreset)applyExecutionProfileToUi(normalizedStoredProfile);
  else{
    e.approvalPolicy.value=normalizeApprovalPolicyForUi(parsed.approvalPolicy,defaultProfile.approvalPolicy);
    e.sandboxMode.value=normalizeSandboxModeForUi(parsed.sandboxMode,defaultProfile.sandboxMode);
    if(e.webSearchMode)e.webSearchMode.value=resolveStoredWebSearchModeForUi(parsed,defaultProfile.webSearchMode);
    settingsState.hasStoredPermissionDetail=Boolean(parsed.approvalPolicy||parsed.sandboxMode||Object.prototype.hasOwnProperty.call(parsed,"webSearch")||parsed.webSearchMode);
  }
  if(typeof parsed.fastModeEnabled==="boolean"&&e.fastModeEnabled){e.fastModeEnabled.checked=Boolean(parsed.fastModeEnabled);settingsState.hasStoredFastMode=true;}
  if(typeof parsed.automaticApprovalReviewEnabled==="boolean"&&e.automaticApprovalReviewEnabled){e.automaticApprovalReviewEnabled.checked=Boolean(parsed.automaticApprovalReviewEnabled);settingsState.hasStoredAutomaticApprovalReview=true;}
  if(typeof parsed.executionProfile==="string"){e.executionProfile.value=normalizeExecutionProfileForUi(parsed.executionProfile,"custom");settingsState.hasStoredExecutionProfile=true;}
  if((typeof parsed.webSearchMode==="string"&&parsed.webSearchMode.trim())||typeof parsed.webSearch==="boolean")settingsState.hasStoredWebSearchMode=true;
  if(e.modelName&&typeof parsed.modelName==="string"&&parsed.modelName.trim()){
    const normalizedStoredModel=normalizeExecModelNameForUi(parsed.modelName,runtimeDefaultExecModel());
    e.modelName.value=ensureExecModelOptionForUi(normalizedStoredModel)||normalizedStoredModel;
    settingsState.hasStoredModel=true;
  }
  if(e.modelReasoningEffort&&typeof parsed.modelReasoningEffort==="string"&&parsed.modelReasoningEffort.trim()){
    e.modelReasoningEffort.value=normalizeExecModelReasoningEffortForUi(parsed.modelReasoningEffort,runtimeDefaultExecModelReasoningEffort());
    settingsState.hasStoredModelReasoningEffort=true;
  }
  if(typeof parsed.workspacePath==="string"&&parsed.workspacePath.trim())e.workspacePath.value=parsed.workspacePath.trim();
  if(e.uiVisibility){
    if(typeof parsed.uiVisibility==="boolean")e.uiVisibility.checked=parsed.uiVisibility;
    else e.uiVisibility.checked=true;
    document.body.classList.toggle("telemetry-off",!e.uiVisibility.checked);
  }
  if(typeof parsed.simpleView==="boolean")document.body.classList.toggle("simple-view",parsed.simpleView);
  else document.body.classList.add("simple-view");
  e.simpleViewToggle.textContent=document.body.classList.contains("simple-view")?"詳細表示":"要点表示";
  profileSync();
}
function updateSearchDiag(){
  if(s.diagErr){
    e.diagSearchState.textContent="異常";
    e.diagSearchState.className="diag-state missing";
    e.diagSearchDetail.textContent=s.diagErr;
    return;
  }
  const codex=s.diag&&s.diag.tools&&s.diag.tools.codex&&s.diag.tools.codex.available;
  const mode=normalizeWebSearchModeForUi(e.webSearchMode&&e.webSearchMode.value,"cached");
  if(mode==="disabled"){
    e.diagSearchState.textContent="OFF";
    e.diagSearchState.className="diag-state off";
    e.diagSearchDetail.textContent="設定で無効です。";
    return;
  }
  if(!codex){
    e.diagSearchState.textContent="利用不可";
    e.diagSearchState.className="diag-state missing";
    e.diagSearchDetail.textContent="Codex CLI が利用できません。";
    return;
  }
  e.diagSearchState.textContent=mode==="live"?"LIVE":"CACHED";
  e.diagSearchState.className="diag-state ready";
  e.diagSearchDetail.textContent=mode==="live"
    ?"次の実行で live Web検索を使えます。"
    :"次の実行で cached Web検索を使えます。";
}
function tdiag(name,st,de){const t=s.diag&&s.diag.tools?s.diag.tools[name]:null;if(!t){st.textContent="未確認";st.className="diag-state pending";de.textContent="データなし";return}if(t.available){st.textContent="準備完了";st.className="diag-state ready";de.textContent=t.version||"利用可能";return}st.textContent="不足";st.className="diag-state missing";de.textContent=t.error||"利用不可"}
function renderDiagSummary(){
  if(!e.diagSummaryText)return;
  const rows=[
    {name:"Codex",state:e.diagCodexState?String(e.diagCodexState.textContent||"").trim():"未確認"},
    {name:"Node",state:e.diagNodeState?String(e.diagNodeState.textContent||"").trim():"未確認"},
    {name:"Web検索",state:e.diagSearchState?String(e.diagSearchState.textContent||"").trim():"未確認"},
  ];
  const bad=rows.filter((row)=>["不足","異常","利用不可"].includes(row.state));
  const totalReady=rows.filter((row)=>["準備完了","LIVE","CACHED","OFF"].includes(row.state)).length;
  if(bad.length){
    e.diagSummaryText.textContent=`要確認: ${bad.map((row)=>row.name).join(" / ")}`;
    if(e.diagDetailsSummary)e.diagDetailsSummary.textContent="詳細を確認";
    if(e.diagDetails)e.diagDetails.open=true;
    return;
  }
  e.diagSummaryText.textContent=`問題なし (${totalReady}/${rows.length})`;
  if(e.diagDetailsSummary)e.diagDetailsSummary.textContent="詳細を表示";
}
async function loadRuntime({reconcilePending=true}={}){
  const response=await fetch("/api/runtime",{cache:"no-store"});
  if(!response.ok)throw new Error(`Failed to load runtime: ${response.status}`);
  s.runtime=await response.json();
  if(reconcilePending)reconcilePendingRequestsWithRuntime(s.runtime,{refreshUi:false});
  if(e.modelName){
    const currentModel=e.modelName.value&&typeof e.modelName.value==="string"?e.modelName.value.trim():"";
    const selectedModel=(!settingsState.hasStoredModel||!currentModel||isLegacyExecModelAlias(currentModel))
      ?runtimeDefaultExecModel()
      :normalizeExecModelNameForUi(currentModel,runtimeDefaultExecModel());
    hydrateExecModelOptionsForUi([selectedModel,runtimeDefaultExecModel()]);
    e.modelName.value=ensureExecModelOptionForUi(selectedModel)||selectedModel;
  }
  if(e.modelReasoningEffort){
    const currentReasoning=e.modelReasoningEffort.value&&typeof e.modelReasoningEffort.value==="string"?e.modelReasoningEffort.value.trim():"";
    if(!settingsState.hasStoredModelReasoningEffort||!currentReasoning)e.modelReasoningEffort.value=runtimeDefaultExecModelReasoningEffort();
    else e.modelReasoningEffort.value=normalizeExecModelReasoningEffortForUi(currentReasoning,runtimeDefaultExecModelReasoningEffort());
  }
  if(e.fastModeEnabled&&!settingsState.hasStoredFastMode)e.fastModeEnabled.checked=runtimeDefaultFastModeEnabled();
  if(e.automaticApprovalReviewEnabled&&!settingsState.hasStoredAutomaticApprovalReview)e.automaticApprovalReviewEnabled.checked=runtimeDefaultAutomaticApprovalReviewEnabled();
  profileSync();
  syncPerformanceFromRuntime(s.runtime);
  if(e.workspacePath&&!e.workspacePath.value.trim())e.workspacePath.value=s.runtime.workspaceRoot||"";
  if(e.runtimeAgent)e.runtimeAgent.textContent=s.runtime.activeAgent||DEFAULT_AGENT_NAME;
  if(e.runtimeSession)e.runtimeSession.textContent=s.runtime.sessionRef||"none";
  if(e.runtimeExperimental)e.runtimeExperimental.textContent=s.runtime.experimental?"on":"off";
  if(e.runtimeAgentCount)e.runtimeAgentCount.textContent=Number.isInteger(s.runtime.agentCount)?String(s.runtime.agentCount):"1";
  if(e.openCmdBtn){
    const canOpenShell=Boolean(controlApiToken()&&controlApiAllows("open_workspace_shell"));
    e.openCmdBtn.disabled=!canOpenShell;
    e.openCmdBtn.title=canOpenShell?"":"Open CMD is disabled by runtime policy.";
  }
  renderWorkspaceGuardUi();
  e.connectionState.textContent="接続中";
  e.connectionState.classList.add("connected");
  e.connectionState.classList.remove("disconnected");
  e.modeState.textContent=`モード (${s.runtime.mode||"unknown"})`;
  if(topographyState.usingFallback){
    topographyState.agents=runtimeAgentsForMonitor(s.runtime);
    topographyState.source="/api/runtime";
    topographyState.error="";
    topographyState.lastUpdated=Date.now();
    topographyState.loading=false;
    renderAgentTopography();
  }
  refresh();
}
async function loadDiag(){try{const r=await fetch("/api/diagnostics",{cache:"no-store"});if(!r.ok){let body="";try{body=await r.text()}catch(_e){}const er=new Error(`HTTP ${r.status}`);er.kind="http";er.status=r.status;er.bodyText=body;throw er}s.diag=await r.json();s.diagErr=null}catch(er){s.diagErr=er&&er.kind==="http"?`HTTP ${er.status}: ${String(er.bodyText||"").replace(/\s+/g," ").trim().slice(0,180)}`:`通信エラー: ${er&&er.message?er.message:"unknown"}`;throw er}finally{if(s.diagErr){[e.diagCodexState,e.diagNodeState,e.diagSearchState].forEach((st,i)=>{const de=[e.diagCodexDetail,e.diagNodeDetail,e.diagSearchDetail][i];st.textContent="異常";st.className="diag-state missing";de.textContent=s.diagErr})}else{tdiag("codex",e.diagCodexState,e.diagCodexDetail);tdiag("node",e.diagNodeState,e.diagNodeDetail);updateSearchDiag()}renderDiagSummary()}}
function hasAutomationUi(){return Boolean(automationUi.panel&&automationUi.status&&automationUi.history);}
function normalizeAutomationBatchRun(raw,index){
  const item=raw&&typeof raw==="object"?raw:{};
  const runId=typeof item.runId==="string"&&item.runId.trim()?item.runId.trim():`run-${index+1}`;
  const mode=typeof item.mode==="string"&&item.mode.trim()?item.mode.trim():"mock";
  const status=typeof item.status==="string"&&item.status.trim()?item.status.trim():"unknown";
  const summary=typeof item.summary==="string"&&item.summary.trim()?item.summary.trim():"(no summary)";
  const startedAt=Number.isFinite(Number(item.startedAt))?Number(item.startedAt):0;
  const finishedAt=Number.isFinite(Number(item.finishedAt))?Number(item.finishedAt):0;
  const prompt=typeof item.prompt==="string"?item.prompt:"";
  const error=typeof item.error==="string"?item.error:"";
  return{runId,mode,status,summary,startedAt,finishedAt,prompt,error};
}
function normalizeAutomationStatus(raw){
  const payload=raw&&typeof raw==="object"?raw:{};
  const scheduler=payload.scheduler&&typeof payload.scheduler==="object"?payload.scheduler:{};
  return{
    interactivePath:typeof payload.interactivePath==="string"?payload.interactivePath:"POST /api/exec",
    batchPath:typeof payload.batchPath==="string"?payload.batchPath:"POST /api/batch/run",
    sharedHarness:typeof payload.sharedHarness==="string"?payload.sharedHarness:"policy + logging + retry",
    scheduler:{
      enabled:Boolean(scheduler.enabled),
      intervalSec:Number.isFinite(Number(scheduler.intervalSec))?Math.max(15,Math.trunc(Number(scheduler.intervalSec))):120,
      nextTickAt:Number.isFinite(Number(scheduler.nextTickAt))?Math.max(0,Math.trunc(Number(scheduler.nextTickAt))):0,
      defaultPrompt:typeof scheduler.defaultPrompt==="string"?scheduler.defaultPrompt:"",
    },
    runs:toArr(payload.lastBatchRuns).map((item,index)=>normalizeAutomationBatchRun(item,index)).slice(0,20),
  };
}
function renderAutomationStatus(){
  if(!hasAutomationUi())return;
  const status=automationState.status;
  const hasBusy=automationState.loading||automationState.running||automationState.schedulerUpdating;
  if(automationUi.panel)automationUi.panel.classList.toggle("loading",hasBusy);
  if(automationUi.panel)automationUi.panel.classList.toggle("error",Boolean(automationState.lastError));
  if(automationUi.batchRunBtn)automationUi.batchRunBtn.disabled=hasBusy||s.req.size>0;
  if(automationUi.schedulerEnabled)automationUi.schedulerEnabled.disabled=hasBusy;
  if(automationUi.schedulerInterval)automationUi.schedulerInterval.disabled=hasBusy;
  if(automationUi.batchMode)automationUi.batchMode.disabled=hasBusy;

  if(!status){
    automationUi.status.textContent=automationState.lastError?`Automation error: ${automationState.lastError}`:"Automation status loading...";
    automationUi.history.innerHTML='<li class="automation-empty">status loading...</li>';
    return;
  }

  const scheduler=status.scheduler||{enabled:false,intervalSec:120,nextTickAt:0,defaultPrompt:""};
  if(automationUi.schedulerEnabled&&!automationState.schedulerUpdating)automationUi.schedulerEnabled.checked=Boolean(scheduler.enabled);
  if(automationUi.schedulerInterval&&!automationUi.schedulerInterval.matches(":focus")&&!automationState.schedulerUpdating){
    automationUi.schedulerInterval.value=String(scheduler.intervalSec||120);
  }
  if(automationUi.batchPrompt&&typeof scheduler.defaultPrompt==="string"&&!automationUi.batchPrompt.value.trim()){
    automationUi.batchPrompt.value=scheduler.defaultPrompt;
  }

  const nextTick=scheduler.nextTickAt?tt(scheduler.nextTickAt):"--:--:--";
  if(automationUi.schedulerMeta){
    automationUi.schedulerMeta.textContent=scheduler.enabled
      ?`scheduler: ON / interval ${scheduler.intervalSec}s / next ${nextTick}`
      :"scheduler: OFF";
  }
  const modeLabel=automationUi.batchMode?String(automationUi.batchMode.value||"mock"):"mock";
  const runCount=toArr(status.runs).length;
  let line=`batch=${status.batchPath} / runs=${runCount} / mode=${modeLabel}`;
  if(automationState.lastError)line+=` / last_error=${automationState.lastError}`;
  automationUi.status.textContent=line;

  automationUi.history.innerHTML="";
  const rows=toArr(status.runs).slice(0,20);
  if(!rows.length){
    automationUi.history.innerHTML='<li class="automation-empty">No batch history yet.</li>';
    return;
  }
  rows.forEach((item)=>{
    const li=document.createElement("li");
    li.className=`automation-history-item ${item.status==="completed"?"ok":"ng"}`;
    const at=item.finishedAt||item.startedAt||Date.now();
    const summary=t1(item.summary||"(no summary)",160);
    const tail=item.error?` / error=${t1(item.error,120)}`:"";
    li.textContent=`${tt(at)} [${item.mode}] ${item.status} ${item.runId} / ${summary}${tail}`;
    automationUi.history.appendChild(li);
  });
}
async function fetchAutomationStatusPayload(){
  const res=await fetch("/api/batch/status",{cache:"no-store"});
  if(!res.ok)throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
async function postAutomation({path,payload,limitErrorLabel}){
  const headers={"Content-Type":"application/json"};
  const body=JSON.stringify(payload||{});
  const res=await fetch(path,{method:"POST",headers,body});
  const parsed=parseJsonSafe(await res.text())||{};
  if(!res.ok||parsed.ok===false){
    const errText=parsed&&parsed.error?parsed.error:`HTTP ${res.status}`;
    throw new Error(limitErrorLabel?`${limitErrorLabel}: ${errText}`:errText);
  }
  return parsed;
}
async function loadAutomationStatus({silent=false}={}){
  if(!hasAutomationUi())return null;
  if(!silent)automationState.loading=true;
  try{
    const payload=await fetchAutomationStatusPayload();
    automationState.status=normalizeAutomationStatus(payload);
    automationState.lastError="";
    renderAutomationStatus();
    return automationState.status;
  }catch(error){
    automationState.lastError=error&&error.message?error.message:"unknown";
    renderAutomationStatus();
    return null;
  }finally{
    automationState.loading=false;
    renderAutomationStatus();
  }
}
function getSchedulerConfigFromUi(){
  const enabled=Boolean(automationUi.schedulerEnabled&&automationUi.schedulerEnabled.checked);
  const intervalRaw=Number(automationUi.schedulerInterval&&automationUi.schedulerInterval.value);
  const intervalSec=Number.isFinite(intervalRaw)?Math.max(15,Math.trunc(intervalRaw)):120;
  return{enabled,intervalSec};
}
function schedulerConfigMatches(config,scheduler){
  const target=config&&typeof config==="object"?config:{enabled:false,intervalSec:120};
  const current=scheduler&&typeof scheduler==="object"?scheduler:{enabled:false,intervalSec:120};
  return Boolean(target.enabled)===Boolean(current.enabled)
    && Math.max(15,Math.trunc(Number(target.intervalSec)||120))===Math.max(15,Math.trunc(Number(current.intervalSec)||120));
}
async function applyAutomationSchedulerNow(){
  if(!hasAutomationUi())return;
  if(automationState.schedulerUpdating)return;
  const desired=getSchedulerConfigFromUi();
  automationState.schedulerDesired=desired;
  automationState.schedulerUpdating=true;
  automationState.lastError="";
  renderAutomationStatus();
  try{
    await postAutomation({
      path:"/api/batch/scheduler",
      payload:desired,
      limitErrorLabel:"scheduler update failed",
    });
    await loadAutomationStatus({silent:true});
  }catch(error){
    automationState.lastError=error&&error.message?error.message:"scheduler update failed";
  }finally{
    automationState.schedulerUpdating=false;
    renderAutomationStatus();
    const latest=getSchedulerConfigFromUi();
    const scheduler=automationState.status&&automationState.status.scheduler&&typeof automationState.status.scheduler==="object"
      ?automationState.status.scheduler
      :null;
    if(!schedulerConfigMatches(latest,scheduler))queueAutomationSchedulerApply({immediate:false});
  }
}
function queueAutomationSchedulerApply({immediate=false}={}){
  if(!hasAutomationUi())return;
  automationState.schedulerDesired=getSchedulerConfigFromUi();
  if(automationState.schedulerApplyTimer!==null){
    clearTimeout(automationState.schedulerApplyTimer);
    automationState.schedulerApplyTimer=null;
  }
  if(immediate){
    applyAutomationSchedulerNow().catch(()=>{});
    return;
  }
  automationState.schedulerApplyTimer=setTimeout(()=>{
    automationState.schedulerApplyTimer=null;
    applyAutomationSchedulerNow().catch(()=>{});
  },AUTOMATION_SCHEDULER_SYNC_DEBOUNCE_MS);
}
async function runAutomationBatchOnce(){
  if(!hasAutomationUi())return;
  const prompt=String(automationUi.batchPrompt&&automationUi.batchPrompt.value||"").trim();
  if(!prompt){
    automationState.lastError="batch prompt is empty";
    renderAutomationStatus();
    return;
  }
  const mode=String(automationUi.batchMode&&automationUi.batchMode.value||"mock");
  automationState.running=true;
  automationState.lastError="";
  renderAutomationStatus();
  try{
    await postAutomation({
      path:"/api/batch/run",
      payload:{prompt,mode,cwd:selectedCwd()},
      limitErrorLabel:"batch run failed",
    });
    await loadAutomationStatus({silent:true});
    msg(s.active,"system","System",`Batch completed (${mode})`);
  }catch(error){
    automationState.lastError=error&&error.message?error.message:"batch run failed";
    msg(s.active,"system","System",`Batch failed: ${automationState.lastError}`);
  }finally{
    automationState.running=false;
    renderAutomationStatus();
  }
}
function startAutomationStatusTicker(){
  if(!hasAutomationUi())return;
  if(automationState.timer!==null)clearInterval(automationState.timer);
  automationState.timer=setInterval(()=>{
    if(automationState.loading||automationState.running||automationState.schedulerUpdating)return;
    loadAutomationStatus({silent:true}).catch(()=>{});
  },AUTOMATION_STATUS_POLL_MS);
}
function stopAutomationStatusTicker(){
  if(automationState.timer!==null){
    clearInterval(automationState.timer);
    automationState.timer=null;
  }
  if(automationState.schedulerApplyTimer!==null){
    clearTimeout(automationState.schedulerApplyTimer);
    automationState.schedulerApplyTimer=null;
  }
}
function parseJsonSafe(text){try{return JSON.parse(text)}catch{return null}}
function toArr(v){return Array.isArray(v)?v:[]}
function createExecIdempotencyKey(){
  return`web-exec-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
}
function buildExecSubmitHeaders(idempotencyKey){
  const token=controlApiToken();
  if(!token){
    const error=new Error("control API token unavailable. refresh runtime first.");
    error.name="ExecTokenUnavailableError";
    throw error;
  }
  const headers={"Content-Type":"application/json"};
  headers[controlApiTokenHeader()]=token;
  if(idempotencyKey)headers[EXEC_IDEMPOTENCY_HEADER]=idempotencyKey;
  return headers;
}
async function refreshRuntimeForExecRetry(){
  try{
    await loadRuntime({reconcilePending:false});
    return true;
  }catch{
    return false;
  }
}
function isExecStreamResponse(response){
  const contentType=response&&response.headers&&typeof response.headers.get==="function"
    ?String(response.headers.get("content-type")||"").toLowerCase()
    :"";
  return contentType.includes(EXEC_STREAM_CONTENT_TYPE);
}
function buildExecResponseError(response,bodyText){
  const payload=parseJsonSafe(bodyText);
  const status=response&&Number.isFinite(Number(response.status))?Math.trunc(Number(response.status)):0;
  const duplicate=Boolean(payload&&payload.duplicate);
  const resolvedDuplicate=Boolean(duplicate&&payload&&payload.idempotency&&payload.idempotency.lifecycle&&payload.idempotency.lifecycle.resolved);
  const rawMessage=payload&&typeof payload.error==="string"
    ?payload.error
    :(bodyText?String(bodyText):`HTTP ${status||0}`);
  const compactMessage=t1(rawMessage.replace(/\s+/g," ").trim(),180)||`HTTP ${status||0}`;
  const error=new Error(compactMessage);
  error.name="ExecResponseError";
  error.status=status;
  error.bodyText=bodyText||"";
  error.payload=payload;
  error.code=payload&&typeof payload.code==="string"?payload.code.trim():"";
  error.isDuplicate=duplicate;
  error.isResolvedDuplicate=resolvedDuplicate;
  if(duplicate&&status===409){
    error.message="previous submit is already running on the server";
  }else if(duplicate&&resolvedDuplicate){
    error.message="previous submit already completed on the server";
  }else if(status){
    error.message=`HTTP ${status} ${compactMessage}`.trim();
  }
  return error;
}
function isTransientExecSubmitError(error){
  if(!error||error.name==="AbortError")return false;
  if(error.name==="TimeoutError"||error.name==="TypeError"||error.name==="ExecTokenUnavailableError")return true;
  const status=Number.isFinite(Number(error&&error.status))?Math.trunc(Number(error.status)):0;
  if(status===403||status===408||status===425||status===429||status>=500)return true;
  const message=String(error&&error.message?error.message:"").toLowerCase();
  return message.includes("failed to fetch")
    ||message.includes("networkerror")
    ||message.includes("network request failed")
    ||message.includes("load failed")
    ||message.includes("the network connection was lost");
}
function formatExecSubmitError(error){
  if(!error)return"unknown error";
  const workspaceGuardError=workspaceGuardErrorInfoForUi(error);
  if(workspaceGuardError.handled)return workspaceGuardError.detail;
  if(error.name==="TimeoutError")return"request timeout";
  return t1(String(error&&error.message?error.message:"runtime error").replace(/\s+/g," ").trim(),180)||"runtime error";
}
function formatExecRetryDelay(delayMs){
  return`${(Math.max(0,Number(delayMs)||0)/1000).toFixed(1)}s`;
}
function pushExecRetryNotice(out,chatRecord,attempt,maxRetries,delayMs,error){
  const detail=`submit retry ${attempt}/${maxRetries} in ${formatExecRetryDelay(delayMs)} (${formatExecSubmitError(error)})`;
  madd(out,`[retry] 送信に失敗したため ${formatExecRetryDelay(delayMs)} 後に再試行します (${attempt}/${maxRetries}): ${formatExecSubmitError(error)}\n`);
  hpush(chatRecord,"submit/retry",detail,"running");
  renderHarness();
}
async function submitExecRequestWithRetry({payload,signal,out,chatRecord}){
  const maxRetries=EXEC_SUBMIT_RETRY_DELAYS_MS.length;
  let lastError=null;
  for(let attempt=0;attempt<=maxRetries;attempt+=1){
    try{
      if(attempt>0)await refreshRuntimeForExecRetry();
      const headers=buildExecSubmitHeaders(payload&&payload.idempotencyKey?payload.idempotencyKey:"");
      const response=await fetch("/api/exec",{method:"POST",headers,body:JSON.stringify(payload),signal});
      if(!isExecStreamResponse(response)){
        const bodyText=await response.text();
        throw buildExecResponseError(response,bodyText);
      }
      return response;
    }catch(error){
      if(error&&error.name==="AbortError")throw error;
      lastError=error;
      if(!isTransientExecSubmitError(error)||attempt>=maxRetries)break;
      const delayMs=EXEC_SUBMIT_RETRY_DELAYS_MS[attempt];
      pushExecRetryNotice(out,chatRecord,attempt+1,maxRetries,delayMs,error);
      await sleepWithSignal(delayMs,signal);
    }
  }
  if(isTransientExecSubmitError(lastError)){
    const wrapped=new Error(`submit failed after automatic retry: ${formatExecSubmitError(lastError)}`);
    wrapped.name=lastError&&lastError.name?lastError.name:"ExecSubmitError";
    wrapped.cause=lastError;
    wrapped.isTransientSubmitFailure=true;
    throw wrapped;
  }
  throw lastError||new Error("request failed");
}
function formatRunPromptFailureMessage(error){
  const workspaceGuardError=workspaceGuardErrorInfoForUi(error);
  if(workspaceGuardError.handled)return workspaceGuardError.systemMessage;
  if(error&&error.isTransientSubmitFailure){
    const cause=error&&error.cause?error.cause:error;
    return`自動再試行後も送信できませんでした: ${formatExecSubmitError(cause)}`;
  }
  if(error&&error.isDuplicate&&error.status===409){
    return"送信を停止しました: 前回の送信がサーバ側でまだ実行中です。";
  }
  if(error&&error.isResolvedDuplicate){
    return"送信を停止しました: 前回の送信はサーバ側ですでに完了しています。";
  }
  return`Send failed: ${formatExecSubmitError(error)}`;
}
function buildExecStatusHeaders(){
  const token=controlApiToken();
  if(!token){
    const error=new Error("control API token unavailable. refresh runtime first.");
    error.name="ExecTokenUnavailableError";
    throw error;
  }
  const headers={};
  headers[controlApiTokenHeader()]=token;
  return headers;
}
async function fetchExecIdempotencyStatus(idempotencyKey,{signal,waitMs=0}={}){
  if(!idempotencyKey)return null;
  const query=waitMs>0?`?wait_ms=${encodeURIComponent(String(Math.max(0,Math.trunc(Number(waitMs)||0))))}`:"";
  const response=await fetch(`/api/exec/idempotency/${encodeURIComponent(idempotencyKey)}${query}`,{
    method:"GET",
    headers:buildExecStatusHeaders(),
    cache:"no-store",
    signal,
  });
  const bodyText=await response.text();
  const payload=parseJsonSafe(bodyText);
  if(!response.ok){
    const error=buildExecResponseError(response,bodyText);
    error.name="ExecStatusError";
    throw error;
  }
  return payload&&typeof payload==="object"?payload:null;
}
async function fetchReplayTurnSnapshot(turnId,{signal}={}){
  if(!turnId)return null;
  const response=await fetch(`/api/replay/turn/${encodeURIComponent(turnId)}`,{
    method:"GET",
    headers:buildExecStatusHeaders(),
    cache:"no-store",
    signal,
  });
  const bodyText=await response.text();
  const payload=parseJsonSafe(bodyText);
  if(!response.ok){
    const error=buildExecResponseError(response,bodyText);
    error.name="ExecReplayStatusError";
    throw error;
  }
  return payload&&typeof payload==="object"?payload:null;
}
function isTransientExecStreamError(error){
  if(isTransientExecSubmitError(error))return true;
  const message=String(error&&error.message?error.message:"").toLowerCase();
  return message.includes("terminated")
    ||message.includes("stream disconnected")
    ||message.includes("body stream")
    ||message.includes("unexpected end")
    ||message.includes("connection reset");
}
function isHarnessRestartInterruptedOutcome(outcome){
  const text=String(outcome&&outcome.error?outcome.error:"").toLowerCase();
  return text.includes("in-flight request interrupted by harness restart");
}
async function recoverExecStreamAfterDisconnect({idempotencyKey,signal,out,chatRecord}={}){
  if(!idempotencyKey)return{handled:false};
  madd(out,"[recovery] 接続が切れたため、サーバ状態を確認しています...\n");
  hpush(chatRecord,"stream/recovery","stream recovery via idempotency status","running");
  renderHarness();
  const runtimeDeadline=Date.now()+EXEC_STREAM_RECOVERY_RUNTIME_WAIT_MS;
  while(Date.now()<runtimeDeadline){
    try{
      await refreshRuntimeForExecRetry();
      break;
    }catch{
    }
    await sleepWithSignal(EXEC_STREAM_RECOVERY_POLL_MS,signal);
  }
  for(let attempt=0;attempt<EXEC_STREAM_RECOVERY_MAX_POLLS;attempt+=1){
    let statusPayload=null;
    try{
      statusPayload=await fetchExecIdempotencyStatus(idempotencyKey,{
        signal,
        waitMs:attempt===0?EXEC_STREAM_RECOVERY_STATUS_WAIT_MS:0,
      });
    }catch(error){
      if(attempt>=EXEC_STREAM_RECOVERY_MAX_POLLS-1)return{handled:false,error};
    }
    const snapshot=statusPayload&&statusPayload.idempotency&&typeof statusPayload.idempotency==="object"
      ?statusPayload.idempotency
      :null;
    const outcome=snapshot&&snapshot.outcome&&typeof snapshot.outcome==="object"?snapshot.outcome:null;
    const lifecycle=snapshot&&snapshot.lifecycle&&typeof snapshot.lifecycle==="object"?snapshot.lifecycle:null;
    if(lifecycle&&lifecycle.resolved){
      if(outcome&&String(outcome.status||"")==="completed"){
        let replayText="";
        try{
          const replayPayload=outcome.turnId?await fetchReplayTurnSnapshot(outcome.turnId,{signal}):null;
          replayText=String(replayPayload&&replayPayload.replay&&replayPayload.replay.baseline&&replayPayload.replay.baseline.outputSnapshot||"");
        }catch{
        }
        return{
          handled:true,
          terminal:"completed",
          text:replayText,
          detail:"stream recovered from persisted turn result",
        };
      }
      if(isHarnessRestartInterruptedOutcome(outcome)){
        return{
          handled:true,
          terminal:"failed",
          text:"[error] harness restarted during the turn. The request was interrupted before completion.",
          detail:"harness restart interrupted the in-flight turn",
        };
      }
      return{
        handled:true,
        terminal:"failed",
        text:`[error] ${t1(String(outcome&&outcome.error?outcome.error:"stream disconnected before completion").replace(/\s+/g," ").trim(),240)}`,
        detail:"stream ended before a terminal response reached the browser",
      };
    }
    await sleepWithSignal(EXEC_STREAM_RECOVERY_POLL_MS,signal);
  }
  return{handled:false};
}
function sleepWithSignal(ms,signal){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{
      if(signal)signal.removeEventListener("abort",onAbort);
      resolve();
    },ms);
    const onAbort=()=>{
      clearTimeout(timer);
      const error=new Error("aborted");
      error.name="AbortError";
      reject(error);
    };
    if(signal){
      if(signal.aborted){
        onAbort();
        return;
      }
      signal.addEventListener("abort",onAbort,{once:true});
    }
  });
}
async function fetchTextWithTimeout(url,{timeoutMs=12000,signal,...init}={}){
  const ctl=new AbortController();
  let timedOut=false;
  const onAbort=()=>ctl.abort();
  if(signal){
    if(signal.aborted)ctl.abort();
    else signal.addEventListener("abort",onAbort,{once:true});
  }
  const timer=setTimeout(()=>{
    timedOut=true;
    ctl.abort();
  },Math.max(1000,Number(timeoutMs)||12000));
  try{
    const res=await fetch(url,{...init,signal:ctl.signal});
    const text=await res.text();
    return{res,text};
  }catch(error){
    if(timedOut){
      const timeoutError=new Error(`request timeout: ${url}`);
      timeoutError.name="TimeoutError";
      throw timeoutError;
    }
    throw error;
  }finally{
    clearTimeout(timer);
    if(signal)signal.removeEventListener("abort",onAbort);
  }
}
async function runPrompt(raw,cid=s.active,options={}){
  const c=chat(cid),prompt=String(raw||"").trim();
  if(!c)return;
  const notifyOnTerminal=cid===s.active;
  void ensureNotificationAudioReady();
  const currentPending=pendingCountForChat(c.id);
  if(currentPending>0){
    msg(c.id,"system","System","このチャットは実行中です。完了後に送信してください。");
    return;
  }
  const runAgent=ensureChatAgent(c);
  c.agent=runAgent;
  const pickedFiles=options&&Array.isArray(options.attachments)?options.attachments.filter(Boolean):[];
  let imagePayloads=[];
  if(pickedFiles.length){
    try{
      imagePayloads=await Promise.all(pickedFiles.map((file)=>buildAttachmentPayload(file)));
      clearAttachmentError();
    }catch(error){
      setAttachmentError(error&&error.message?error.message:"画像データの読み込みに失敗しました。");
      return;
    }
  }
  if(!prompt&&!imagePayloads.length){
    setAttachmentError("テキストまたは画像を入力してください。");
    return;
  }
  clearAttachmentError();
  clearWorkspaceGuardNotice();
  const dispatchDetail=composeDispatchDetail(prompt,imagePayloads);
  const shouldForceNewSession=Boolean(c.forceNewSession);
  if(shouldForceNewSession)c.perf=createPerformanceState();
  c.h=createHarnessState();
  hset(c,"starting");
  hpush(c,"dispatch",dispatchDetail||"(empty)","running");
  if(c.id===s.active)renderHarness();
  msg(c.id,"user","You",composeUserMessage(prompt,imagePayloads));
  if(c.id===s.active){
    e.promptInput.value="";
    syncPromptInputHeight({resetToBase:true});
    if(imagePayloads.length)clearAttachment();
  }
  const out=msg(c.id,"assistant","Codex","");
  if(!out)return;
  madd(out,`[waiting] Standard Codex: ON${imagePayloads.length?` (${imagePayloads.length} images attached)`:""}\n`);
  const rid=`req-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const ctl=new AbortController();
  s.req.set(rid,{cid:c.id,agent:runAgent,at:Date.now(),controller:ctl,notifyOnTerminal});
  c.pending+=1;
  pending();
  live();
  syncRuntimePendingMonitor();
  trace("dispatch",runAgent,dispatchDetail||"(empty)",c.id);
  let ttype="completed",tdetail="completed",finalApplied=false;
  let streamOpened=false;
  let idempotencyKey="";
  try{
    const selectedApproval=normalizeApprovalPolicyForUi(e.approvalPolicy.value,PROFILES[DEFAULT_PROFILE_ID].approvalPolicy);
    const selectedSandbox=normalizeSandboxModeForUi(e.sandboxMode.value,PROFILES[DEFAULT_PROFILE_ID].sandboxMode);
    const selectedWebSearchMode=normalizeWebSearchModeForUi(e.webSearchMode&&e.webSearchMode.value,"cached");
    const selectedModel=selectedExecModel();
    const selectedModelReasoningEffort=selectedExecModelReasoningEffort();
    const requestPayload={
      prompt,
      sandboxMode:selectedSandbox,
      approvalPolicy:selectedApproval,
      fastModeEnabled:Boolean(e.fastModeEnabled&&e.fastModeEnabled.checked),
      automaticApprovalReviewEnabled:Boolean(e.automaticApprovalReviewEnabled&&e.automaticApprovalReviewEnabled.checked),
      webSearch:webSearchEnabledForUi(selectedWebSearchMode),
      webSearchMode:selectedWebSearchMode,
      model:selectedModel,
      modelReasoningEffort:selectedModelReasoningEffort,
      agentName:runAgent,
      forceNewSession:shouldForceNewSession,
      cwd:selectedCwd(),
      executionProfile:String(e.executionProfile&&e.executionProfile.value?e.executionProfile.value:"custom"),
      executionIntent:"web-ui-interactive",
      executionSource:"web_ui",
    };
    if(imagePayloads.length)requestPayload.images=imagePayloads;
    idempotencyKey=createExecIdempotencyKey();
    requestPayload.idempotencyKey=idempotencyKey;
    const r=await submitExecRequestWithRetry({payload:requestPayload,signal:ctl.signal,out,chatRecord:c});
    c.forceNewSession=false;
    scheduleSaveChatState();
    trace("streaming",runAgent,"stream started",c.id);
    hset(c,"running");
    hpush(c,"stream/open","NDJSON stream connected","running");
    renderHarness();
    mset(out,"");
    const reader=r.body.getReader();
    streamOpened=true;
    const decoder=new TextDecoder();
    let buf="";
    const apply=ev=>{if(!ev||typeof ev!=="object"||typeof ev.type!=="string")return false;if(ev.type==="delta"){if(typeof ev.text==="string"&&ev.text)madd(out,ev.text);return true}if(ev.type==="final"){mset(out,typeof ev.text==="string"?ev.text:"");finalApplied=true;return true}if(ev.type==="error"){const t=typeof ev.text==="string"?ev.text:"";if(t){if(shouldRenderTerminalErrorInTranscript(t,{finalApplied}))mset(out,t);ttype="failed";tdetail=t1(t,120);hset(c,"failed");hpush(c,"stream/error",tdetail,"failed");renderHarness()}return true}if(ev.type==="status"){const st=String(ev.status||"");if(st==="failed"){ttype="failed";if(tdetail==="completed")tdetail="status=failed"}else if(st==="interrupted"){ttype="aborted";tdetail="status=interrupted"}else if(st==="needs_input"){ttype="needs_input";if(tdetail==="completed"||!tdetail)tdetail="status=needs_input"}hset(c,st||"completed");renderHarness();return true}if(["turn","item","activity","plan","tokenUsage","diff"].includes(ev.type)){happly(c,ev);renderHarness();return true}return false};
    const onLine=line=>{const t=String(line||"").trim();if(!t)return;try{const p=JSON.parse(t);if(apply(p))return}catch(_e){}madd(out,line.endsWith("\n")?line:`${line}\n`)};
    const flush=(chunk,force=false)=>{if(chunk)buf+=chunk;while(true){const i=buf.indexOf("\n");if(i<0)break;const line=buf.slice(0,i);buf=buf.slice(i+1);onLine(line)}if(force&&buf.length){onLine(buf);buf=""}};
    while(true){const{value,done}=await reader.read();if(done)break;flush(decoder.decode(value,{stream:true}))}
    flush(decoder.decode(),true)
  }catch(err){if(err&&err.name==="AbortError"){ttype="aborted";tdetail="user interrupted";madd(out,"\n[user interrupted]\n");hset(c,"interrupted");hpush(c,"turn/interrupt","user interrupt","failed");renderHarness();return}const surfacedError=err&&err.cause?err.cause:err;if(streamOpened&&idempotencyKey&&isTransientExecStreamError(surfacedError)){let recovery=null;try{recovery=await recoverExecStreamAfterDisconnect({idempotencyKey,signal:ctl.signal,out,chatRecord:c})}catch{}if(recovery&&recovery.handled){ttype=recovery.terminal==="completed"?"completed":"failed";tdetail=recovery.detail||`${ttype==="completed"?"completed":"failed"} after stream recovery`;if(typeof recovery.text==="string"&&(recovery.text||ttype!=="completed"))mset(out,recovery.text);hset(c,ttype==="completed"?"completed":"failed");hpush(c,"stream/recovered",t1(tdetail,180),ttype==="completed"?"info":"failed");renderHarness();return}}const workspaceGuardError=workspaceGuardErrorInfoForUi(surfacedError);if(workspaceGuardError.handled){ttype=workspaceGuardError.status||"needs_input";tdetail=workspaceGuardError.detail;mset(out,`[needs_input] ${workspaceGuardError.inlineMessage}`);hset(c,"needs_input");hpush(c,"turn/needs_input",t1(workspaceGuardError.detail,180),"info");setWorkspaceGuardNotice(workspaceGuardError.notice,{tone:workspaceGuardError.tone||"warning"});renderHarness();return}ttype="failed";tdetail=err&&err.message?err.message:"runtime error";mset(out,`[error] ${formatExecSubmitError(surfacedError)}`);hset(c,"failed");hpush(c,"turn/error",t1(tdetail,180),"failed");renderHarness();throw err}finally{const reqMeta=s.req.get(rid);s.req.delete(rid);c.pending=Math.max(0,c.pending-1);syncRuntimePendingMonitor();if(ttype==="completed")hset(c,"completed");else if(ttype==="failed")hset(c,"failed");else if(ttype==="aborted")hset(c,"interrupted");else if(ttype==="needs_input")hset(c,"needs_input");hpush(c,"turn/end",t1(tdetail,180),ttype==="failed"?"failed":"info");s.last={type:ttype,detail:tdetail,at:Date.now(),agent:runAgent,chat:c.title,cid:c.id};trace(ttype,runAgent,tdetail,c.id);if(reqMeta&&reqMeta.notifyOnTerminal)void playNotificationTone(ttype);refresh();if(s.req.size===0){try{await loadRuntime()}catch(_e){e.connectionState.textContent="未接続";e.connectionState.classList.remove("connected");e.connectionState.classList.add("disconnected")}}scheduleSaveChatState();updateSearchDiag()}
}
function renderCommands(q=""){e.commandGrid.innerHTML="";const qq=q.trim().toLowerCase();const list=COMMANDS.filter(c=>!qq||c.toLowerCase().includes(qq));if(!list.length){e.commandGrid.innerHTML='<article class="command-empty">No matching commands.</article>';return}list.forEach(cmd=>{const f=e.commandTemplate.content.cloneNode(true);f.querySelector(".command-text").textContent=cmd;const b=f.querySelector(".command-badge");b.textContent="local";b.classList.add("local");f.querySelector(".command-desc").textContent="Quick insert/run command.";f.querySelector(".insert-btn").onclick=()=>{const cur=e.promptInput.value,p=cur&&!cur.endsWith("\n")?"\n":"";e.promptInput.value=`${cur}${p}${cmd} `;syncPromptInputHeight();e.promptInput.focus()};f.querySelector(".run-btn").onclick=async()=>{e.promptInput.value=cmd;syncPromptInputHeight();await runPrompt(e.promptInput.value,s.active).catch(er=>msg(s.active,"system","System",formatRunPromptFailureMessage(er)))};e.commandGrid.appendChild(f)})}
function clearChat(){const c=active();if(!c)return;c.messages=[];c.h=createHarnessState();c.perf=createPerformanceState();c.forceNewSession=true;s.trace=s.trace.filter((item)=>item&&item.cid!==c.id);if(s.last&&s.last.cid===c.id)s.last=null;scheduleSaveChatState();refresh()}
function deleteChat(chatId=s.active){
  const target=chat(chatId);
  if(!target)return false;
  const activeId=s.active;
  const currentIndex=s.chats.findIndex((item)=>item&&item.id===target.id);
  let runningCount=0;
  const killList=[];
  s.req.forEach((req,rid)=>{
    if(req&&req.cid===target.id){
      runningCount+=1;
      killList.push({rid,controller:req.controller});
    }
  });
  const askMessage=runningCount>0
    ?`「${target.title}」を削除しますか？\n実行中の ${runningCount} 件も中断されます。`
    :`「${target.title}」を削除しますか？`;
  if(!window.confirm(askMessage))return false;
  killList.forEach((item)=>{
    try{item.controller.abort();}catch{}
    s.req.delete(item.rid);
  });
  s.chats=s.chats.filter((item)=>item&&item.id!==target.id);
  s.trace=s.trace.filter((item)=>item&&item.cid!==target.id);
  if(s.last&&s.last.cid===target.id)s.last=null;
  if(!s.chats.length){
    const fallback=mkChat({title:"Chat 1",agent:DEFAULT_AGENT_NAME});
    s.active=fallback.id;
  }else if(activeId===target.id||!chat(s.active)){
    const nextIndex=Math.max(0,Math.min(currentIndex,s.chats.length-1));
    s.active=s.chats[nextIndex].id;
  }
  clearAttachment();
  scheduleSaveChatState();
  refresh();
  return true;
}
function stop(){const c=active();if(!c)return;let n=0;s.req.forEach(r=>{if(r.cid===c.id){r.controller.abort();n+=1}});if(n>0)msg(c.id,"system","System",`Stopped ${n} running request(s).`) }
function bind(){
  bindNotificationAudioUnlock();
  e.sendBtn.onclick=()=>{void ensureNotificationAudioReady();return runPrompt(e.promptInput.value,s.active,{attachments:composerAttachment.items.map((item)=>item.file)}).catch(er=>msg(s.active,"system","System",formatRunPromptFailureMessage(er)));};
  e.stopBtn.onclick=stop;
  e.newThreadBtn.onclick=clearChat;
  if(e.deleteChatBtn)e.deleteChatBtn.onclick=()=>deleteChat();
  if(e.focusToTimelineBtn)e.focusToTimelineBtn.onclick=()=>scrollElementIntoViewForUi(e.timeline);
  if(e.focusToComposerBtn)e.focusToComposerBtn.onclick=()=>scrollElementIntoViewForUi(e.promptInput,{focus:true});
  if(e.jumpToComposerBtn)e.jumpToComposerBtn.onclick=()=>scrollElementIntoViewForUi(e.promptInput,{focus:true});
  if(e.imageAttachBtn)e.imageAttachBtn.onclick=()=>{clearAttachmentError();if(e.imageInput)e.imageInput.click();};
  if(e.imageInput)e.imageInput.onchange=()=>{const files=e.imageInput&&e.imageInput.files?e.imageInput.files:[];handleAttachmentPickFiles(files);};
  if(e.imageRemoveBtn)e.imageRemoveBtn.onclick=()=>removeAttachmentFromComposer();
  if(e.openCmdBtn)e.openCmdBtn.onclick=async()=>{
    try{
      if(!controlApiAllows("open_workspace_shell")){
        msg(s.active,"system","System","Open CMD is disabled by runtime policy.");
        return;
      }
      const token=controlApiToken();
      if(!token)throw new Error("control API token unavailable. refresh runtime first.");
      const headerName=controlApiTokenHeader();
      const headers={"Content-Type":"application/json"};
      headers[headerName]=token;
      const response=await fetch("/api/open-cmd",{method:"POST",headers,body:JSON.stringify({action:"open_workspace_shell"})});
      if(!response.ok){
        let detail="";
        try{
          const payload=await response.json();
          detail=payload&&typeof payload.error==="string"?payload.error:"";
        }catch(_e){
          try{detail=await response.text();}catch(_e2){}
        }
        throw new Error(`HTTP ${response.status}${detail?`: ${detail}`:""}`);
      }
      msg(s.active,"system","System","Opened new CMD window.");
    }catch(er){
      msg(s.active,"system","System",`Failed to open CMD: ${er&&er.message?er.message:"unknown"}`);
    }
  };
  if(e.workspaceLockBtn)e.workspaceLockBtn.onclick=async()=>{
    try{
      await lockSelectedWorkspaceForUi();
    }catch(er){
      const detail=formatExecSubmitError(er&&er.cause?er.cause:er);
      setWorkspaceGuardNotice(detail,{tone:"warning"});
      msg(s.active,"system","System",`Workspace lock failed: ${detail}`);
    }
  };
  if(e.workspaceUnlockBtn)e.workspaceUnlockBtn.onclick=async()=>{
    try{
      await unlockWorkspaceForUi();
    }catch(er){
      const detail=formatExecSubmitError(er&&er.cause?er.cause:er);
      setWorkspaceGuardNotice(detail,{tone:"warning"});
      msg(s.active,"system","System",`Workspace unlock failed: ${detail}`);
    }
  };
  e.reconnectBtn.onclick=async()=>{try{await loadRuntime();msg(s.active,"system","System","Runtime refreshed.")}catch(er){e.connectionState.textContent="未接続";e.connectionState.classList.remove("connected");e.connectionState.classList.add("disconnected");msg(s.active,"system","System",`Reconnect failed: ${er&&er.message?er.message:"unknown"}`)}};
  if(e.uiReloadBtn)e.uiReloadBtn.onclick=()=>reloadUiShellForUi();
  e.refreshDiagBtn.onclick=async()=>{try{await loadDiag();msg(s.active,"system","System","Diagnostics refreshed.")}catch(er){msg(s.active,"system","System",`Diagnostics refresh failed: ${er&&er.message?er.message:"unknown"}`)}};
  e.newChatBtn.onclick=()=>{const c=mkChat({agent:DEFAULT_AGENT_NAME,forceNewSession:true});s.active=c.id;refresh()};
  e.clearAgentTraceBtn.onclick=()=>{const c=active();if(!c){s.trace=[];s.last=null;flow();return;}s.trace=s.trace.filter((item)=>item&&item.cid!==c.id);if(s.last&&s.last.cid===c.id)s.last=null;flow();msg(s.active,"system","System","Current chat trace cleared.")};
  if(e.agentTopographyRefreshBtn)e.agentTopographyRefreshBtn.onclick=()=>loadAgentTopography({manual:true}).catch(()=>{});
  if(automationUi.batchRunBtn)automationUi.batchRunBtn.onclick=()=>runAutomationBatchOnce().catch(()=>{});
  if(automationUi.batchMode)automationUi.batchMode.onchange=()=>renderAutomationStatus();
  if(automationUi.schedulerEnabled)automationUi.schedulerEnabled.onchange=()=>queueAutomationSchedulerApply({immediate:false});
  if(automationUi.schedulerInterval)automationUi.schedulerInterval.onchange=()=>queueAutomationSchedulerApply({immediate:false});
  if(automationUi.schedulerInterval)automationUi.schedulerInterval.onblur=()=>queueAutomationSchedulerApply({immediate:false});
  if(e.harnessCheckMode)e.harnessCheckMode.onchange=()=>{
    harnessCheckState.mode=normalizeHarnessCheckMode(e.harnessCheckMode.value);
    applyHarnessCheckModeUi();
    saveHarnessCheckMode();
    refresh();
  };
  if(e.promptInput){
    e.promptInput.onkeydown=ev=>{if(ev.key==="Enter"&&!ev.shiftKey){ev.preventDefault();e.sendBtn.click()}};
    e.promptInput.addEventListener("input",()=>{syncPromptInputHeight();renderMissionSupportUi();});
    e.promptInput.addEventListener("paste",handlePromptPaste);
  }
  document.querySelectorAll("[data-compose-preset]").forEach((btn)=>btn.onclick=()=>{
    e.promptInput.value=btn.getAttribute("data-compose-preset")||"";
    syncPromptInputHeight();
    renderMissionSupportUi();
    scrollElementIntoViewForUi(e.promptInput,{focus:true});
  });
  document.querySelectorAll("[data-preset]").forEach(btn=>btn.onclick=()=>{e.promptInput.value=btn.getAttribute("data-preset")||"";syncPromptInputHeight();renderMissionSupportUi();e.sendBtn.click()});
  window.addEventListener("resize",()=>{syncPromptInputHeight({remeasureBase:true});scheduleComposerViewportSyncForUi();});
  if(e.commandFilter)e.commandFilter.oninput=()=>renderCommands(e.commandFilter.value);
  e.executionProfile.onchange=()=>{
    if(e.executionProfile.value==="custom"){profileSync();saveSettings();updateSearchDiag();renderMissionSupportUi();return}
    if(!applyExecutionProfileToUi(e.executionProfile.value))return;
    saveSettings();
    updateSearchDiag();
    renderMissionSupportUi();
    msg(s.active,"system","System",`Permission mode applied: ${executionProfileLabelForUi(e.executionProfile.value)}`);
  };
  [e.approvalPolicy,e.fastModeEnabled,e.automaticApprovalReviewEnabled,e.sandboxMode,e.webSearchMode].filter(Boolean).forEach(x=>x.onchange=()=>{profileSync();saveSettings();updateSearchDiag();renderMissionSupportUi()});
  if(e.modelName)e.modelName.onchange=()=>{const normalizedModel=normalizeExecModelNameForUi(e.modelName.value,runtimeDefaultExecModel());e.modelName.value=ensureExecModelOptionForUi(normalizedModel)||normalizedModel;settingsState.hasStoredModel=true;saveSettings();renderMissionSupportUi();};
  if(e.modelReasoningEffort)e.modelReasoningEffort.onchange=()=>{e.modelReasoningEffort.value=normalizeExecModelReasoningEffortForUi(e.modelReasoningEffort.value,runtimeDefaultExecModelReasoningEffort());settingsState.hasStoredModelReasoningEffort=true;saveSettings();renderMissionSupportUi();};
  if(e.workspacePath)e.workspacePath.oninput=()=>{workspaceGuardUiState.message="";workspaceGuardUiState.tone="";renderWorkspaceGuardUi();renderMissionSupportUi();};
  e.workspacePath.onchange=()=>{workspaceGuardUiState.message="";workspaceGuardUiState.tone="";saveSettings();renderWorkspaceGuardUi();renderMissionSupportUi();};
  if(e.uiVisibility)e.uiVisibility.onchange=()=>{document.body.classList.toggle("telemetry-off",!e.uiVisibility.checked);saveSettings();};
  e.simpleViewToggle.onclick=()=>{const n=!document.body.classList.contains("simple-view");document.body.classList.toggle("simple-view",n);e.simpleViewToggle.textContent=n?"詳細表示":"要点表示";saveSettings()};
}
async function boot(){
  loadSettings();
  loadHarnessCheckMode();
  loadChatState();
  bind();
  renderCommands();
  renderAttachmentUi();
  renderAgentTopography();
  if(!s.chats.length)mkChat({title:"Chat 1",agent:DEFAULT_AGENT_NAME});
  if(!chat(s.active))s.active=s.chats[0].id;
  syncPromptInputHeight({resetToBase:true,remeasureBase:true});
  scheduleComposerViewportSyncForUi();
  refresh();
  e.modeState.textContent="Mode";
  e.connectionState.textContent="未接続";
  e.connectionState.classList.add("disconnected");
  try{
    await loadRuntime();
  }catch(error){
    msg(s.active,"system","System",`Runtime check failed: ${error&&error.message?error.message:"unknown"}`);
  }
  try{
    await loadDiag();
  }catch(error){
    msg(s.active,"system","System",`Diagnostics check failed: ${error&&error.message?error.message:"unknown"}`);
  }
  try{
    await loadAutomationStatus({silent:false});
  }catch(_error){
  }
  await loadAgentTopography({manual:true}).catch(()=>{});
  startAgentTopographyTicker();
  startAutomationStatusTicker();
  if(s.runtime){
    const current=active();
    const hasMessages=current&&Array.isArray(current.messages)&&current.messages.length>0;
    if(!hasMessages){
      msg(s.active,"system","System","Ready. Standard Codex: ON");
    }
  }
}
window.addEventListener("beforeunload",()=>{if(s.ticker!==null){clearInterval(s.ticker);s.ticker=null}stopRuntimePendingSyncTicker();stopAgentTopographyTicker();stopAutomationStatusTicker();revokeAttachmentPreview();flushSaveChatState();});
boot();
