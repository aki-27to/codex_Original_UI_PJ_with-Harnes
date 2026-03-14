const PROFILES={safe:{approvalPolicy:"untrusted",sandboxMode:"read-only",webSearch:false},balanced:{approvalPolicy:"on-failure",sandboxMode:"workspace-write",webSearch:true},"full-auto":{approvalPolicy:"never",sandboxMode:"workspace-write",webSearch:true},power:{approvalPolicy:"never",sandboxMode:"danger-full-access",webSearch:true}};
const COMMANDS=[];
const DEFAULT_AGENT_NAME="default";
const DEFAULT_EXEC_MODEL="gpt-5.4";
const DEFAULT_EXEC_MODEL_REASONING_EFFORT="xhigh";
const EXEC_MODEL_PRESET_OPTIONS=["gpt-5.4","gpt-5.3-codex"];
const EXEC_MODEL_REASONING_EFFORTS=["minimal","low","medium","high","xhigh"];
const LEGACY_EXEC_MODEL_ALIASES=Object.freeze({"codex-5.3":"gpt-5.3-codex"});
const SETTINGS_KEY="codex-console-settings-v2";
const CHAT_STATE_KEY="codex-console-chat-v1";
const CHAT_STATE_VERSION=1;
const CHAT_MESSAGE_LIMIT=240;
const HARNESS_CHECK_MODE_KEY="codex-harness-check-mode-v2";
const HARNESS_CHECK_MODE_KEY_LEGACY="codex-harness-check-mode-v1";
const HARNESS_CHECK_MODES={ADAPTIVE:"adaptive",STRICT:"strict",RELAXED:"relaxed"};
const HARNESS_CHECK_DEFAULT_MODE=HARNESS_CHECK_MODES.ADAPTIVE;
const RUNTIME_PENDING_SYNC_MS=5000;
const s={runtime:null,diag:null,diagErr:null,chats:[],active:null,nextChat:1,nextMsg:1,req:new Map(),trace:[],last:null,ticker:null,perf:{sessionRef:"",turnsCompleted:0,baseTokens:0,baseProcessingMs:0,liveTurnId:"",liveTurnStartedAt:0,liveTokens:0,historyTokens:[],historyProcessingMs:[],historyAt:[],updatedAt:0}};
const chatStateSave={timer:null};
const settingsState={hasStoredModel:false,hasStoredModelReasoningEffort:false,lastWorkspaceLockNotice:""};
const workspaceUiState={busy:false};
const harnessCheckState={mode:HARNESS_CHECK_DEFAULT_MODE};
const TOPOGRAPHY_REFRESH_MS=10000;
const TOPOGRAPHY_COLLAPSED_KEY="codex-agent-topography-collapsed-v1";
const HIDDEN_AGENT_NAMES=new Set(["main"]);
const PARENT_AGENT_NAMES=new Set(["default","intake","release_manager"]);
const topographyState={agents:[],source:"",error:"",usingFallback:false,lastUpdated:0,loading:false,timer:null,reqId:0,collapsed:false};
const e={connectionState:by("connectionState"),modeState:by("modeState"),agentState:by("agentState"),pendingState:by("pendingState"),simpleViewToggle:by("simpleViewToggle"),runtimeAgent:by("runtimeAgent"),runtimeSession:by("runtimeSession"),runtimeExperimental:by("runtimeExperimental"),runtimeAgentCount:by("runtimeAgentCount"),workspacePath:by("workspacePath"),workspaceBrowseBtn:by("workspaceBrowseBtn"),workspaceLockEnabled:by("workspaceLockEnabled"),workspaceLockStatus:by("workspaceLockStatus"),intentHeadline:by("intentHeadline"),intentSummary:by("intentSummary"),intentRuntimeStatus:by("intentRuntimeStatus"),intentLabelInput:by("intentLabelInput"),intentNorthStarInput:by("intentNorthStarInput"),intentBenchmarkInput:by("intentBenchmarkInput"),intentBenchmarkNotesInput:by("intentBenchmarkNotesInput"),intentPrefersInput:by("intentPrefersInput"),intentRejectsInput:by("intentRejectsInput"),intentProofInput:by("intentProofInput"),intentSaveBtn:by("intentSaveBtn"),intentResetBtn:by("intentResetBtn"),intentSaveState:by("intentSaveState"),intentGateHeadline:by("intentGateHeadline"),intentGateList:by("intentGateList"),modelName:by("modelName"),modelReasoningEffort:by("modelReasoningEffort"),approvalPolicy:by("approvalPolicy"),sandboxMode:by("sandboxMode"),executionProfile:by("executionProfile"),uiVisibility:by("uiVisibility"),webSearch:by("webSearch"),commandFilter:by("commandFilter"),commandGrid:by("commandGrid"),commandTemplate:by("commandTemplate"),messageTemplate:by("messageTemplate"),chatList:by("chatList"),newChatBtn:by("newChatBtn"),deleteChatBtn:by("deleteChatBtn"),timeline:by("timeline"),promptInput:by("promptInput"),imageInput:by("imageInput"),imageAttachBtn:by("imageAttachBtn"),imageError:by("imageError"),imagePreview:by("imagePreview"),imagePreviewThumb:by("imagePreviewThumb"),imagePreviewName:by("imagePreviewName"),imagePreviewMeta:by("imagePreviewMeta"),imageRemoveBtn:by("imageRemoveBtn"),sendBtn:by("sendBtn"),stopBtn:by("stopBtn"),reconnectBtn:by("reconnectBtn"),refreshDiagBtn:by("refreshDiagBtn"),newThreadBtn:by("newThreadBtn"),openCmdBtn:by("openCmdBtn"),liveStatus:by("liveStatus"),liveStatusLabel:by("liveStatusLabel"),liveStatusElapsed:by("liveStatusElapsed"),liveStatusDetail:by("liveStatusDetail"),performancePanel:by("performancePanel"),perfSessionRef:by("perfSessionRef"),perfUpdatedAt:by("perfUpdatedAt"),perfTokenValue:by("perfTokenValue"),perfTokenDetail:by("perfTokenDetail"),perfTokenSpark:by("perfTokenSpark"),perfTimeValue:by("perfTimeValue"),perfTimeDetail:by("perfTimeDetail"),perfTimeSpark:by("perfTimeSpark"),agentInspector:by("agentInspector"),agentFlowLane:by("agentFlowLane"),agentTraceList:by("agentTraceList"),clearAgentTraceBtn:by("clearAgentTraceBtn"),agentTopographyPanel:by("agentTopographyPanel"),agentTopographyMeta:by("agentTopographyMeta"),agentTopographyList:by("agentTopographyList"),agentTopographyRefreshBtn:by("agentTopographyRefreshBtn"),diagCodexState:by("diagCodexState"),diagCodexDetail:by("diagCodexDetail"),diagNodeState:by("diagNodeState"),diagNodeDetail:by("diagNodeDetail"),diagSearchState:by("diagSearchState"),diagSearchDetail:by("diagSearchDetail"),diagSummaryText:by("diagSummaryText"),diagDetails:by("diagDetails"),diagDetailsSummary:by("diagDetailsSummary"),harnessStatus:by("harnessStatus"),harnessThreadId:by("harnessThreadId"),harnessTurnId:by("harnessTurnId"),harnessUpdatedAt:by("harnessUpdatedAt"),harnessItemList:by("harnessItemList"),harnessPlanMeta:by("harnessPlanMeta"),harnessPlanCurrentCard:by("harnessPlanCurrentCard"),harnessPlanCurrentStep:by("harnessPlanCurrentStep"),harnessPlanCurrentDetail:by("harnessPlanCurrentDetail"),harnessPlanExplanation:by("harnessPlanExplanation"),harnessPlanList:by("harnessPlanList"),harnessTokenUsage:by("harnessTokenUsage"),harnessDiffPreview:by("harnessDiffPreview"),harnessPhaseList:by("harnessPhaseList"),harnessEvidenceTasks:by("harnessEvidenceTasks"),harnessEvidenceTests:by("harnessEvidenceTests"),harnessEvidenceReviews:by("harnessEvidenceReviews"),harnessEvidenceLogs:by("harnessEvidenceLogs")};
e.harnessCheckMode=by("harnessCheckMode");
e.harnessCheckModeHint=by("harnessCheckModeHint");
e.agentTopographyToggleBtn=by("agentTopographyToggleBtn");
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
function by(id){return document.getElementById(id)}
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
      e.harnessCheckModeHint.textContent="厳密モード: ステージ 3 には明示的な計画更新が必要です。";
    }else if(mode===HARNESS_CHECK_MODES.RELAXED){
      e.harnessCheckModeHint.textContent="簡易モード: 推定されたストリーム信号で段階を進めます。";
    }else{
      e.harnessCheckModeHint.textContent="適応モード: 軽いターンは推定マイクロプランを許容し、重いターンは明示的な計画更新を要求します。";
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
const t1=(x,n=120)=>{const s=String(x||"").replace(/\s+/g," ").trim();return s.length>n?`${s.slice(0,n-1)}…`:s};
const tt=(ms)=>Number.isFinite(ms)?new Date(ms).toLocaleTimeString("ja-JP",{hour12:false}):"--:--:--";
const el=(ms)=>{if(!Number.isFinite(ms)||ms<0)return"--:--";const s=Math.floor(ms/1000),m=Math.floor((s%3600)/60),h=Math.floor(s/3600),ss=s%60;return h>0?`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`};
const fmtInt=(value)=>Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))).toLocaleString("ja-JP"):"0";
function displayFallbackText(value,fallback="不明"){
  const text=typeof value==="string"?value.trim():"";
  return text||fallback;
}
function displaySessionRef(value){
  return displayFallbackText(value,"未取得");
}
function displayFlagState(enabled,{on="オン",off="オフ"}={}){
  return enabled?on:off;
}
function displayHarnessVerdictLabel(label){
  switch(String(label||"").trim().toUpperCase()){
    case"PASS":
      return"適合";
    case"WARN":
      return"要確認";
    case"RUNNING":
      return"進行中";
    case"WAIT":
      return"待機";
    case"FAIL":
      return"不適合";
    default:
      return displayFallbackText(label);
  }
}
function displayHarnessModeLabel(mode,{includeRaw=false}={}){
  const normalized=normalizeHarnessCheckMode(mode);
  const labelMap={
    [HARNESS_CHECK_MODES.ADAPTIVE]:"適応",
    [HARNESS_CHECK_MODES.STRICT]:"厳密",
    [HARNESS_CHECK_MODES.RELAXED]:"簡易",
  };
  const label=labelMap[normalized]||displayFallbackText(mode);
  return includeRaw&&normalized?`${label}（${normalized}）`:label;
}
function displayHarnessStatusLabel(status){
  const normalized=lowerText(status);
  const labelMap={
    blocked:"差し止め",
    completed:"完了",
    failed:"失敗",
    failed_validation:"検証不足",
    idle:"待機",
    interrupted:"中断",
    needs_input:"入力待ち",
    partial:"部分完了",
    running:"進行中",
    starting:"開始中",
    warn:"要確認",
  };
  return labelMap[normalized]||displayFallbackText(status);
}
function displayHarnessSignalLabel(signal,{includeRaw=false}={}){
  const raw=String(signal||"").trim();
  const normalized=raw.toLowerCase();
  const labelMap={
    "child dispatch":"子エージェント委譲",
    "plan/update":"計画更新",
    "requirement/dispatch":"要件整理と送信",
    "turn/completed":"ターン完了",
    "turn/start":"ターン開始",
  };
  const label=labelMap[normalized]||displayFallbackText(raw);
  return includeRaw&&raw&&label!==raw?`${label}（${raw}）`:label;
}
function displayTraceTypeLabel(type,{includeRaw=false}={}){
  const raw=String(type||"").trim();
  const normalized=raw.toLowerCase();
  const labelMap={
    aborted:"中断",
    activity:"アクティビティ",
    "collab agent tool":"エージェント委譲",
    completed:"完了",
    "command execution":"コマンド実行",
    dispatch:"依頼送信",
    error:"エラー",
    failed:"失敗",
    "file change":"ファイル変更",
    "http/error":"HTTP エラー",
    "image view":"画像確認",
    item:"項目",
    "mcp tool":"MCP ツール",
    "plan/update":"計画更新",
    running:"実行中",
    streaming:"ストリーム中",
    "stream/error":"ストリーム異常",
    "stream/open":"ストリーム接続",
    "token/usage":"トークン使用",
    "turn/completed":"ターン完了",
    "turn/diff":"差分取得",
    "turn/end":"ターン終了",
    "turn/error":"ターン失敗",
    "turn/interrupt":"ターン中断",
    "turn/start":"ターン開始",
    "web search":"Web 検索",
  };
  const label=labelMap[normalized]||displayFallbackText(raw);
  return includeRaw&&raw&&label!==raw?`${label}（${raw}）`:label;
}
function displayMonitorStatusLabel(status){
  const raw=String(status||"").trim();
  const normalized=raw.toLowerCase();
  const runningCountMatch=normalized.match(/^running\s*\((\d+)\)$/);
  if(runningCountMatch)return`実行中 (${runningCountMatch[1]})`;
  const labelMap={
    active:"進行中",
    completed:"完了",
    failed:"失敗",
    idle:"待機",
    interrupted:"中断",
    pending:"保留中",
    selected:"選択中",
    waiting:"待機",
    running:"実行中",
  };
  if(Object.prototype.hasOwnProperty.call(labelMap,normalized))return labelMap[normalized];
  const traceLabel=displayTraceTypeLabel(raw);
  return traceLabel!==raw?traceLabel:displayFallbackText(raw);
}
function displayRoleLabel(role){
  const raw=String(role||"").trim();
  const normalized=raw.toLowerCase();
  const labelMap={child:"子",parent:"親",runtime:"ランタイム",trace:"トレース"};
  return labelMap[normalized]||displayFallbackText(raw);
}
function displayAutomationModeLabel(mode,{includeRaw=false}={}){
  const raw=String(mode||"").trim();
  const normalized=raw.toLowerCase();
  const labelMap={
    "dry-run":"試走",
    live:"本実行",
    mock:"模擬",
    serial:"順次",
  };
  const label=labelMap[normalized]||displayFallbackText(raw);
  return includeRaw&&raw&&label!==raw?`${label}（${raw}）`:label;
}
function displayAutomationRunStatusLabel(status){
  const normalized=lowerText(status);
  const labelMap={
    cancelled:"取消",
    completed:"完了",
    failed:"失敗",
    interrupted:"中断",
    queued:"待機",
    running:"進行中",
  };
  return labelMap[normalized]||displayFallbackText(status);
}
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
function hasTrackedPendingRequests(){
  if(s.req.size>0)return true;
  return s.chats.some((item)=>pendingCountForChat(item&&item.id)>0);
}
function startRuntimePendingSyncTicker(){
  if(runtimePendingSyncState.timer!==null||!hasTrackedPendingRequests())return;
  runtimePendingSyncState.timer=setInterval(()=>{
    if(runtimePendingSyncState.inFlight||!hasTrackedPendingRequests())return;
    runtimePendingSyncState.inFlight=true;
    loadRuntime({reconcilePending:true}).catch(()=>{}).finally(()=>{
      runtimePendingSyncState.inFlight=false;
      if(!hasTrackedPendingRequests())stopRuntimePendingSyncTicker();
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
  if(hasTrackedPendingRequests()){
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
const workspaceInputPath=()=>e.workspacePath&&typeof e.workspacePath.value==="string"?e.workspacePath.value.trim():"";
const runtimeWorkspaceGuard=()=>{
  const direct=s.runtime&&s.runtime.workspaceGuard&&typeof s.runtime.workspaceGuard==="object"?s.runtime.workspaceGuard:null;
  if(direct)return direct;
  return s.runtime&&s.runtime.workspace_guard&&typeof s.runtime.workspace_guard==="object"?s.runtime.workspace_guard:null;
};
const workspaceLockEnabled=()=>Boolean(runtimeWorkspaceGuard()&&runtimeWorkspaceGuard().locked);
const selectedCwd=()=>{
  const guard=runtimeWorkspaceGuard();
  if(guard&&guard.locked&&typeof guard.lockedRoot==="string"&&guard.lockedRoot.trim())return guard.lockedRoot.trim();
  const chosen=workspaceInputPath();
  if(chosen)return chosen;
  return s.runtime&&typeof s.runtime.workspaceRoot==="string"?s.runtime.workspaceRoot:"";
};
const controlApiCfg=()=>s.runtime&&s.runtime.controlApi&&typeof s.runtime.controlApi==="object"?s.runtime.controlApi:null;
const controlApiToken=()=>{const cfg=controlApiCfg();return cfg&&typeof cfg.token==="string"?cfg.token.trim():"";};
const controlApiTokenHeader=()=>{const cfg=controlApiCfg();return cfg&&typeof cfg.tokenHeader==="string"&&cfg.tokenHeader.trim()?cfg.tokenHeader.trim():"x-codex-control-token";};
const controlApiAllows=(action)=>{
  const cfg=controlApiCfg();
  const wanted=typeof action==="string"?action.trim():"";
  if(!wanted||!cfg||!Array.isArray(cfg.actionAllowlist))return false;
  return cfg.actionAllowlist.includes(wanted);
};
function renderWorkspaceScopeUi(){
  const guard=runtimeWorkspaceGuard();
  const locked=workspaceLockEnabled();
  const lockedRoot=guard&&typeof guard.lockedRoot==="string"?guard.lockedRoot.trim():"";
  const currentPath=lockedRoot||workspaceInputPath()||(s.runtime&&typeof s.runtime.workspaceRoot==="string"?s.runtime.workspaceRoot:"");
  const canBrowse=controlApiAllows("select_workspace_directory")&&Boolean(!guard||guard.canSelect!==false);
  const canLock=controlApiAllows("lock_workspace_directory");
  const canUnlock=controlApiAllows("unlock_workspace_directory");
  if(e.workspaceLockEnabled){
    e.workspaceLockEnabled.checked=locked;
    e.workspaceLockEnabled.disabled=workspaceUiState.busy||(locked?!canUnlock:(!canLock||!currentPath));
  }
  if(e.workspacePath){
    if(locked&&lockedRoot)e.workspacePath.value=lockedRoot;
    e.workspacePath.readOnly=locked||workspaceUiState.busy;
    e.workspacePath.setAttribute("aria-readonly",locked||workspaceUiState.busy?"true":"false");
  }
  if(e.workspaceBrowseBtn){
    e.workspaceBrowseBtn.disabled=workspaceUiState.busy||locked||!canBrowse;
    e.workspaceBrowseBtn.title=workspaceUiState.busy
      ?"ワークスペース設定を更新中です。"
      :locked
      ?"別のフォルダーを選ぶ前に固定を解除してください。"
      :(canBrowse?"":"このランタイムではフォルダー選択を使えません。");
  }
  if(!e.workspaceLockStatus)return;
  e.workspaceLockStatus.classList.remove("locked","warning");
  if(locked){
    e.workspaceLockStatus.classList.add("locked");
    e.workspaceLockStatus.textContent=currentPath
      ?`${currentPath} に固定中です。このツリー外へのリクエストはサーバーが拒否します。`
      :"固定中です。実行前にワークスペースパスを指定してください。";
    return;
  }
  const intent=runtimeIntentFirst();
  const lockRequired=intent&&intent.workspaceLock&&intent.workspaceLock.rejectWhenUnlocked;
  if(currentPath){
    if(lockRequired){
      e.workspaceLockStatus.classList.add("warning");
      e.workspaceLockStatus.textContent=`Intent-First モードでは固定が必要です。現在のワークスペースは ${currentPath} です。デザイン系の実行は自動固定されるかブロックされます。`;
      return;
    }
    e.workspaceLockStatus.textContent=`可変モードです。現在のワークスペースは ${currentPath} です。必要なら固定トグルでこの場所に絞り込んでください。`;
    return;
  }
  if(!canBrowse){
    e.workspaceLockStatus.classList.add("warning");
    e.workspaceLockStatus.textContent="可変モードです。フォルダー選択が使えないため、ワークスペースパスを手入力してください。";
    return;
  }
  e.workspaceLockStatus.textContent="可変モードです。フォルダーを選ぶか、ワークスペースパスを手入力してください。";
}
const runtimeIntentFirst=()=>{
  const direct=s.runtime&&s.runtime.intentFirst&&typeof s.runtime.intentFirst==="object"?s.runtime.intentFirst:null;
  if(direct)return direct;
  return s.runtime&&s.runtime.intent_first&&typeof s.runtime.intent_first==="object"?s.runtime.intent_first:null;
};
const runtimeIntentProfile=()=>{
  const intent=runtimeIntentFirst();
  return intent&&intent.tasteMemory&&intent.tasteMemory.activeProfile&&typeof intent.tasteMemory.activeProfile==="object"
    ?intent.tasteMemory.activeProfile
    :null;
};
const runtimeLatestTurn=()=>{
  const direct=s.runtime&&s.runtime.latestTurn&&typeof s.runtime.latestTurn==="object"?s.runtime.latestTurn:null;
  if(direct)return direct;
  return s.runtime&&s.runtime.latest_turn&&typeof s.runtime.latest_turn==="object"?s.runtime.latest_turn:null;
};
function textareaListValue(el){
  const raw=el&&typeof el.value==="string"?el.value:"";
  return raw.split(/\r?\n/).map((entry)=>entry.trim()).filter(Boolean);
}
function setIntentSaveState(label,tone="idle"){
  if(!e.intentSaveState)return;
  e.intentSaveState.textContent=label;
  e.intentSaveState.className=`pill ${tone}`;
}
function isIntentSensitivePromptForUi(prompt){
  const text=String(prompt||"").trim().toLowerCase();
  if(!text)return false;
  const intent=runtimeIntentFirst();
  const keywords=intent&&intent.creativeSignals&&Array.isArray(intent.creativeSignals.promptKeywords)
    ?intent.creativeSignals.promptKeywords
    :[];
  return keywords.some((keyword)=>text.includes(String(keyword||"").toLowerCase()));
}
function latestIntentMissingSet(){
  const latest=runtimeLatestTurn();
  const intent=latest&&latest.intent_first&&typeof latest.intent_first==="object"?latest.intent_first:null;
  const missing=intent&&Array.isArray(intent.missing_hard)?intent.missing_hard:[];
  return new Set(missing.map((entry)=>String(entry||"").trim().toLowerCase()).filter(Boolean));
}
function renderIntentFirstPanel(){
  const intent=runtimeIntentFirst();
  const profile=runtimeIntentProfile();
  const latest=runtimeLatestTurn();
  const missingLatest=latestIntentMissingSet();
  if(e.intentHeadline){
    e.intentHeadline.textContent=profile&&Array.isArray(profile.northStar)&&profile.northStar.length
      ?profile.northStar.join(" / ")
      :"ノーススターはまだ未設定です。";
  }
  if(e.intentSummary){
    const benchmarkCount=profile&&Array.isArray(profile.benchmarkSites)?profile.benchmarkSites.length:0;
    const rejectCount=profile&&Array.isArray(profile.rejects)?profile.rejects.length:0;
    const profileLabel=profile&&profile.label?profile.label:"未設定";
    e.intentSummary.textContent=`現在のプロファイルは ${profileLabel} です。ベンチマーク ${benchmarkCount} 件、明示的な拒否条件 ${rejectCount} 件を読み込みました。`;
  }
  if(e.intentRuntimeStatus){
    const rows=[];
    const latestIntent=latest&&latest.intent_first&&typeof latest.intent_first==="object"?latest.intent_first:null;
    rows.push(`<span class="intent-runtime-chip ${workspaceLockEnabled()?"pass":"warn"}">ワークスペース ${workspaceLockEnabled()?"固定済み":"未固定"}</span>`);
    rows.push(`<span class="intent-runtime-chip ${profile?"pass":"warn"}">好み記憶 ${profile?"読込済み":"不足"}</span>`);
    rows.push(`<span class="intent-runtime-chip ${profile&&Array.isArray(profile.benchmarkSites)&&profile.benchmarkSites.length?"pass":"warn"}">ベンチマーク ${profile&&Array.isArray(profile.benchmarkSites)&&profile.benchmarkSites.length?"設定済み":"不足"}</span>`);
    rows.push(`<span class="intent-runtime-chip ${latestIntent&&latestIntent.design_sensitive?"info":"neutral"}">最新ターン ${latestIntent&&latestIntent.design_sensitive?"デザイン系":"一般"}</span>`);
    e.intentRuntimeStatus.innerHTML=rows.join("");
  }
  if(e.intentLabelInput&&profile&&!e.intentLabelInput.matches(":focus"))e.intentLabelInput.value=profile.label||"";
  if(e.intentNorthStarInput&&profile&&!e.intentNorthStarInput.matches(":focus"))e.intentNorthStarInput.value=(Array.isArray(profile.northStar)?profile.northStar:[]).join("\n");
  if(e.intentBenchmarkInput&&profile&&!e.intentBenchmarkInput.matches(":focus"))e.intentBenchmarkInput.value=(Array.isArray(profile.benchmarkSites)?profile.benchmarkSites:[]).join("\n");
  if(e.intentBenchmarkNotesInput&&profile&&!e.intentBenchmarkNotesInput.matches(":focus"))e.intentBenchmarkNotesInput.value=(Array.isArray(profile.benchmarkNotes)?profile.benchmarkNotes:[]).join("\n");
  if(e.intentPrefersInput&&profile&&!e.intentPrefersInput.matches(":focus"))e.intentPrefersInput.value=(Array.isArray(profile.prefers)?profile.prefers:[]).join("\n");
  if(e.intentRejectsInput&&profile&&!e.intentRejectsInput.matches(":focus"))e.intentRejectsInput.value=(Array.isArray(profile.rejects)?profile.rejects:[]).join("\n");
  if(e.intentProofInput&&profile&&!e.intentProofInput.matches(":focus"))e.intentProofInput.value=(Array.isArray(profile.requiredProof)?profile.requiredProof:[]).join("\n");
  if(!e.intentGateList||!e.intentGateHeadline)return;
  const gates=intent&&Array.isArray(intent.requiredGates)?intent.requiredGates:[];
  const gateCards=gates.map((gate)=>{
    const id=String(gate&&gate.id||"").trim();
    const label=String(gate&&gate.label||id||"gate");
    const normalizedId=id.toLowerCase();
    const normalizedLabel=label.toLowerCase();
    let stateLabel="保留";
    let tone="neutral";
    let detail="デザイン系ターンで確認されます。";
    if(id==="taste_memory"){
      const ok=Boolean(profile&&((profile.northStar&&profile.northStar.length)||(profile.prefers&&profile.prefers.length)||(profile.rejects&&profile.rejects.length)));
      stateLabel=ok?"準備完了":"不足";
      tone=ok?"pass":"fail";
      detail=ok?"使える好みシグナルがハーネスに読み込まれています。":"使える好み記憶がまだ保存されていません。";
    }else if(id==="benchmark"){
      const ok=Boolean(profile&&Array.isArray(profile.benchmarkSites)&&profile.benchmarkSites.length);
      stateLabel=ok?"準備完了":"不足";
      tone=ok?"pass":"fail";
      detail=ok?profile.benchmarkSites.join(" / "):"少なくとも 1 件はベンチマーク対象を設定してください。";
    }else if(id==="workspace_lock"){
      const ok=workspaceLockEnabled();
      stateLabel=ok?"固定済み":"未固定";
      tone=ok?"pass":"warn";
      detail=ok?"固定ツリー外の作業はサーバーが拒否します。":"デザイン系の実行は自動固定されるかブロックされます。";
    }else if(missingLatest.has(normalizedLabel)||missingLatest.has(normalizedId)){
      stateLabel="不足";
      tone="fail";
      detail="直近のデザイン系ターンでこの必須ゲートを満たせませんでした。";
    }else if(latest&&latest.intent_first&&latest.intent_first.design_sensitive){
      const latestIntentStatus=String(latest.intent_first.status||"").toLowerCase();
      const blocked=latestIntentStatus==="blocked"||latestIntentStatus==="failed_validation"||missingLatest.size>0;
      stateLabel=blocked?"未証明":"確認済み";
      tone=blocked?"warn":"pass";
      detail=blocked?"直近のデザイン系ターンではこのゲートを十分に証明できていません。":"直近のデザイン系ターンではこのゲートに不足は報告されていません。";
    }
    return `<article class="intent-gate-card ${tone}">
      <span class="intent-gate-label">${label}</span>
      <strong class="intent-gate-state">${stateLabel}</strong>
      <p class="intent-gate-detail">${detail}</p>
    </article>`;
  });
  e.intentGateList.innerHTML=gateCards.length?gateCards.join(""):'<article class="intent-gate-card neutral"><span class="intent-gate-label">ゲートなし</span><strong class="intent-gate-state">n/a</strong><p class="intent-gate-detail">ランタイムから intent-first 契約が提供されていません。</p></article>';
  const latestIntent=latest&&latest.intent_first&&typeof latest.intent_first==="object"?latest.intent_first:null;
  if(latestIntent&&latestIntent.design_sensitive){
    const latestIntentStatus=String(latestIntent.status||"").toLowerCase();
    e.intentGateHeadline.textContent=latestIntentStatus==="blocked"||latestIntentStatus==="failed_validation"
      ?`ブロック中: ${latestIntent.summary||"必須ゲート不足"}`
      :latestIntent.summary||"最新のデザイン系ターンは intent ゲートを満たしました。";
  }else{
    e.intentGateHeadline.textContent=workspaceLockEnabled()
      ?"デザイン系作業の準備ができています。"
      :"デザイン系作業の前にワークスペースを固定してください。";
  }
}
const IMAGE_MAX_BYTES=10*1024*1024;
const IMAGE_EXT_TO_MIME={".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".gif":"image/gif"};
const IMAGE_MIME_TO_EXT={"image/png":".png","image/jpeg":".jpg","image/webp":".webp","image/gif":".gif"};
const IMAGE_ALLOWED_MIME=new Set(Object.values(IMAGE_EXT_TO_MIME));
const IMAGE_ALLOWED_EXT=new Set(Object.keys(IMAGE_EXT_TO_MIME));
const composerAttachment={items:[],error:"",nextId:1};
function createHarnessSignals(){
  return{requirement:false,dispatch:false,turnStart:false,turnCompleted:false,plan:false,planInferred:false,delegation:false,quality:false};
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
    tokens:"",
    diff:"",
    flow:[
      {id:"requirements",label:"1. 要件整理",detail:"曖昧依頼を契約可能仕様へ収束",state:"todo"},
      {id:"planning",label:"2. 計画作成",detail:"実行計画と担当を定義",state:"todo"},
      {id:"execution",label:"3. 実行",detail:"Codexが実装・検証を実行",state:"todo"},
      {id:"quality",label:"4. 品質チェック",detail:"証拠確認と統合ゲート判定",state:"todo"},
      {id:"report",label:"5. 報告",detail:"結果報告と次アクション提示",state:"todo"}
    ],
    evidence:{tasksDone:0,tasksTotal:0,tests:0,reviews:0,logs:0},
    signals:createHarnessSignals()
  };
}
function toPerfInt(value){
  return Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))):0;
}
function trimPerfHistory(){
  const max=80;
  if(s.perf.historyTokens.length>max)s.perf.historyTokens=s.perf.historyTokens.slice(-max);
  if(s.perf.historyProcessingMs.length>max)s.perf.historyProcessingMs=s.perf.historyProcessingMs.slice(-max);
  if(s.perf.historyAt.length>max)s.perf.historyAt=s.perf.historyAt.slice(-max);
}
function resetPerformanceState(sessionRef=""){
  s.perf={
    sessionRef:typeof sessionRef==="string"?sessionRef:"",
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
function ensurePerformanceSession(sessionRef){
  const normalized=typeof sessionRef==="string"?sessionRef.trim():"";
  if(!normalized)return;
  if(s.perf.sessionRef!==normalized){
    resetPerformanceState(normalized);
  }
}
function pushPerformanceHistory(tokens,processingMs,at=Date.now()){
  const tokenValue=toPerfInt(tokens);
  const msValue=toPerfInt(processingMs);
  const atValue=toPerfInt(at)||Date.now();
  const lastIndex=s.perf.historyTokens.length-1;
  if(lastIndex>=0&&s.perf.historyTokens[lastIndex]===tokenValue&&s.perf.historyProcessingMs[lastIndex]===msValue){
    s.perf.historyAt[lastIndex]=atValue;
    return;
  }
  s.perf.historyTokens.push(tokenValue);
  s.perf.historyProcessingMs.push(msValue);
  s.perf.historyAt.push(atValue);
  trimPerfHistory();
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
function onPerformanceTurnStarted(ev){
  if(!ev||typeof ev!=="object")return;
  const sessionRef=typeof ev.threadId==="string"?ev.threadId.trim():"";
  ensurePerformanceSession(sessionRef||s.perf.sessionRef);
  if(!s.perf.sessionRef)return;
  s.perf.liveTurnId=typeof ev.turnId==="string"?ev.turnId:"";
  s.perf.liveTurnStartedAt=Date.now();
  s.perf.liveTokens=0;
  s.perf.updatedAt=Date.now();
}
function onPerformanceTokenUsage(ev){
  if(!ev||typeof ev!=="object")return;
  const sessionRef=typeof ev.threadId==="string"?ev.threadId.trim():"";
  if(sessionRef)ensurePerformanceSession(sessionRef);
  if(!s.perf.sessionRef)return;
  const turnId=typeof ev.turnId==="string"?ev.turnId:"";
  if(turnId){
    if(s.perf.liveTurnId&&s.perf.liveTurnId!==turnId)return;
    s.perf.liveTurnId=turnId;
  }
  if(!s.perf.liveTurnStartedAt)s.perf.liveTurnStartedAt=Date.now();
  const usage=ev.usage&&typeof ev.usage==="object"?ev.usage:{};
  s.perf.liveTokens=toPerfInt(usage.totalTokens);
  s.perf.updatedAt=Date.now();
}
function onPerformanceTurnCompleted(ev){
  if(!ev||typeof ev!=="object")return;
  const sessionRef=typeof ev.threadId==="string"?ev.threadId.trim():"";
  if(sessionRef)ensurePerformanceSession(sessionRef);
  if(!s.perf.sessionRef)return;
  const turnId=typeof ev.turnId==="string"?ev.turnId:"";
  if(turnId&&s.perf.liveTurnId&&s.perf.liveTurnId!==turnId)return;
  const now=Date.now();
  const elapsed=s.perf.liveTurnStartedAt?Math.max(0,now-s.perf.liveTurnStartedAt):0;
  s.perf.baseTokens=toPerfInt(s.perf.baseTokens)+toPerfInt(s.perf.liveTokens);
  s.perf.baseProcessingMs=toPerfInt(s.perf.baseProcessingMs)+elapsed;
  s.perf.turnsCompleted=toPerfInt(s.perf.turnsCompleted)+1;
  pushPerformanceHistory(s.perf.baseTokens,s.perf.baseProcessingMs,now);
  s.perf.liveTurnId="";
  s.perf.liveTurnStartedAt=0;
  s.perf.liveTokens=0;
  s.perf.updatedAt=now;
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
  const activeLive=Boolean(s.perf.sessionRef&&(s.perf.liveTurnStartedAt||s.perf.liveTokens));
  const currentChat=active();
  const currentChatId=currentChat&&currentChat.id?currentChat.id:"";
  const activeCurrentChat=currentChatId?pendingCountForChat(currentChatId)>0:false;
  const activeLiveForCurrentChat=activeLive&&activeCurrentChat;
  const liveProcessingMs=s.perf.liveTurnStartedAt?Math.max(0,now-s.perf.liveTurnStartedAt):0;
  const liveTokensForUi=activeLiveForCurrentChat?toPerfInt(s.perf.liveTokens):0;
  const liveProcessingMsForUi=activeLiveForCurrentChat?liveProcessingMs:0;
  const totalTokens=toPerfInt(s.perf.baseTokens)+liveTokensForUi;
  const totalProcessingMs=toPerfInt(s.perf.baseProcessingMs)+liveProcessingMsForUi;
  if(e.perfSessionRef)e.perfSessionRef.textContent=displaySessionRef(s.perf.sessionRef);
  if(e.perfUpdatedAt)e.perfUpdatedAt.textContent=tt(s.perf.updatedAt||now);
  if(e.perfTokenValue)e.perfTokenValue.textContent=fmtInt(totalTokens);
  if(e.perfTokenDetail)e.perfTokenDetail.textContent=`実行中 +${fmtInt(liveTokensForUi)}`;
  if(e.perfTimeValue)e.perfTimeValue.textContent=fmtInt(totalProcessingMs);
  if(e.perfTimeDetail)e.perfTimeDetail.textContent=`進行中 +${fmtInt(liveProcessingMsForUi)}ms / 完了ターン ${fmtInt(s.perf.turnsCompleted)}`;
  renderSparkline(e.perfTokenSpark,buildSparkSeries(s.perf.historyTokens,totalTokens),"#6cb1ff");
  renderSparkline(e.perfTimeSpark,buildSparkSeries(s.perf.historyProcessingMs,totalProcessingMs),"#55d79b");
  e.performancePanel.classList.toggle("running",activeLiveForCurrentChat);
}
function rAgents(){return s.runtime&&Array.isArray(s.runtime.agents)?s.runtime.agents:[]}
function monitorTone(status){
  const v=String(status||"").toLowerCase();
  if(v.includes("fail")||v.includes("error")||v.includes("abort")||v.includes("interrupt"))return"failed";
  if(v.includes("run")||v.includes("busy")||v.includes("work")||v.includes("progress"))return"running";
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
  const roleFallback=typeof roleSource==="string"&&roleSource.trim()?roleSource.trim():(runtimeFallback?"runtime":"不明");
  const role=inferAgentRoleForUi(name)==="parent"?"parent":roleFallback;
  let statusSource=item.status;
  if(typeof statusSource!=="string"||!statusSource.trim()){
    if(typeof item.state==="string"&&item.state.trim())statusSource=item.state.trim();
    else if(typeof item.phase==="string"&&item.phase.trim())statusSource=item.phase.trim();
    else if(typeof item.health==="string"&&item.health.trim())statusSource=item.health.trim();
    else if(typeof item.isActive==="boolean")statusSource=item.isActive?"selected":"idle";
    else statusSource=runtimeFallback?"idle":"不明";
  }
  return{
    name,
    role,
    status:String(statusSource),
    tone:monitorTone(statusSource),
    source:typeof item.source==="string"?item.source:"",
    threadId:typeof item.threadId==="string"?item.threadId:"",
    activeTurnId:typeof item.activeTurnId==="string"?item.activeTurnId:"",
    sessionRef:typeof item.sessionRef==="string"?item.sessionRef:"",
    isActive:Boolean(item.isActive),
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
function loadTopographyUiState(){
  try{
    topographyState.collapsed=localStorage.getItem(TOPOGRAPHY_COLLAPSED_KEY)==="1";
  }catch{
    topographyState.collapsed=false;
  }
}
function saveTopographyUiState(){
  try{
    localStorage.setItem(TOPOGRAPHY_COLLAPSED_KEY,topographyState.collapsed?"1":"0");
  }catch{
  }
}
function setTopographyCollapsed(next){
  const normalized=Boolean(next);
  if(topographyState.collapsed===normalized)return;
  topographyState.collapsed=normalized;
  saveTopographyUiState();
  renderAgentTopography();
}
function syncedTopographyRows(rows){
  const trackedChatScopes=trackedChatScopesForUi();
  const activeContext=activeChatTopographyContextForUi(rows);
  const shouldIncludeName=(name)=>{
    if(activeContext.hasCurrentChatSignals&&activeContext.matchNames.size){
      return monitorAgentMatchesForUi(name,activeContext.matchNames);
    }
    return shouldRenderMonitorAgentNameForUi(name,{trackedChatScopes});
  };
  const baseByName=new Map();
  toArr(rows).forEach((raw,index)=>{
    const normalized=normalizeMonitorAgent(raw,index);
    if(normalized&&normalized.name&&shouldIncludeName(normalized.name)){
      baseByName.set(normalized.name,{...normalized,synced:false,syncDetail:"",syncAt:0});
    }
  });

  const pendingByAgent=new Map();
  s.req.forEach((item)=>{
    const chatId=item&&typeof item.cid==="string"?item.cid.trim():"";
    if(chatId!==activeContext.currentChatId)return;
    const name=resolveMonitorAgentNameForUi(item&&typeof item.agent==="string"?item.agent.trim():"",baseByName);
    if(!name||!shouldIncludeName(name))return;
    pendingByAgent.set(name,(pendingByAgent.get(name)||0)+1);
  });

  const latestTraceByAgent=new Map();
  s.trace.forEach((item)=>{
    const chatId=item&&typeof item.cid==="string"?item.cid.trim():"";
    if(chatId!==activeContext.currentChatId)return;
    const name=resolveMonitorAgentNameForUi(item&&typeof item.agent==="string"?item.agent.trim():"",baseByName);
    if(!name||!shouldIncludeName(name)||latestTraceByAgent.has(name))return;
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
      row.syncDetail=lastTrace?`トレース ${tt(lastTrace.at)} / ${displayTraceTypeLabel(lastTrace.type)}`:"トレース同期 / 保留中";
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
      row.syncDetail=`トレース ${tt(lastTrace.at)} / ${displayTraceTypeLabel(lastTrace.type)}${lastTrace.detail?` / ${t1(lastTrace.detail,40)}`:""}`;
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
  e.agentTopographyPanel.classList.toggle("collapsed",topographyState.collapsed);
  e.agentTopographyPanel.classList.toggle("loading",topographyState.loading);
  e.agentTopographyPanel.classList.toggle("fallback",topographyState.usingFallback&&!topographyState.error);
  e.agentTopographyPanel.classList.toggle("error",Boolean(topographyState.error));
  if(e.agentTopographyToggleBtn){
    e.agentTopographyToggleBtn.textContent=topographyState.collapsed?"開く":"閉じる";
    e.agentTopographyToggleBtn.setAttribute("aria-expanded",topographyState.collapsed?"false":"true");
  }
  e.agentTopographyList.hidden=topographyState.collapsed;
  if(e.agentTopographyRefreshBtn)e.agentTopographyRefreshBtn.disabled=topographyState.loading;

  const rows=syncedTopographyRows(topographyState.agents);
  const syncedCount=rows.filter((row)=>row.synced).length;
  const latestSyncAt=rows.reduce((max,row)=>Math.max(max,Number.isFinite(Number(row.syncAt))?Number(row.syncAt):0),0);
  if(topographyState.loading)e.agentTopographyMeta.textContent="更新中...";
  else if(topographyState.error)e.agentTopographyMeta.textContent=`取得失敗: ${topographyState.error}`;
  else{
    const currentChat=active();
    const sourceLabel=topographyState.usingFallback?"代替経路 /api/runtime":"標準経路 /api/agent-topography";
    const at=topographyState.lastUpdated?tt(topographyState.lastUpdated):"--:--:--";
    const chatLabel=currentChat&&typeof currentChat.title==="string"&&currentChat.title.trim()?` / ${currentChat.title.trim()}`:"";
    const traceSync=syncedCount>0?` / トレース同期 ${syncedCount} 件 @ ${tt(latestSyncAt||Date.now())}`:"";
    e.agentTopographyMeta.textContent=`${sourceLabel}${chatLabel} @ ${at}${traceSync}`;
  }

  e.agentTopographyList.innerHTML="";
  if(!rows.length){
    const empty=document.createElement("li");
    empty.className="agent-topography-empty";
    empty.textContent=topographyState.error?"エージェント情報を取得できませんでした。":"表示できるエージェントがありません。";
    e.agentTopographyList.appendChild(empty);
    return;
  }
  rows.forEach((row)=>{
    const card=document.createElement("li");
    card.className="agent-topography-item";
    if(row.synced)card.classList.add("synced");
    const line=document.createElement("div");
    line.className="agent-topography-line";
    const name=document.createElement("p");
    name.className="agent-topography-name";
    name.textContent=displayAgentNameForUi(row.name,{includeScope:true})||"不明";
    const status=document.createElement("span");
    status.className=`agent-topography-status ${row.tone||"idle"}`;
    status.textContent=displayMonitorStatusLabel(row.status);
    const role=document.createElement("p");
    role.className="agent-topography-role";
    role.textContent=`ロール: ${displayRoleLabel(row.role)}`;
    line.appendChild(name);
    line.appendChild(status);
    card.appendChild(line);
    card.appendChild(role);
    if(row.syncDetail){
      const sync=document.createElement("p");
      sync.className="agent-topography-sync";
      sync.textContent=row.syncDetail;
      card.appendChild(sync);
    }
    e.agentTopographyList.appendChild(card);
  });
}
function stopAgentTopographyTicker(){
  if(topographyState.timer!==null){
    clearInterval(topographyState.timer);
    topographyState.timer=null;
  }
}
function startAgentTopographyTicker(){
  stopAgentTopographyTicker();
  topographyState.timer=setInterval(()=>{loadAgentTopography().catch(()=>{});},TOPOGRAPHY_REFRESH_MS);
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
      const primaryMessage=topographyError&&topographyError.message?topographyError.message:"利用不可";
      const fallbackMessage=runtimeError&&runtimeError.message?runtimeError.message:"利用不可";
      applyState({agents:runtimeAgentsForMonitor(s.runtime),source:"",error:`topography 取得: ${primaryMessage} / runtime 取得: ${fallbackMessage}`,usingFallback:true});
    }
  }
}
function mkChat(o={}){
  const id=`chat-${s.nextChat++}-${Date.now()}`;
  const currentNumber=s.nextChat-1;
  const savedAgent=typeof o.agent==="string"&&o.agent.trim()?o.agent.trim():"";
  const c={
    id,
    title:o.title||`チャット ${currentNumber}`,
    agent:normalizeScopedChatAgentNameForUi(savedAgent,id),
    pending:0,
    messages:[],
    h:createHarnessState(),
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
  if(expectedMime&&mime!==expectedMime)return`拡張子とMIMEタイプが一致しません (${extension} / ${mime||"不明"})。`;
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
    const imageLines=images.map((payload)=>`[画像] ${payload.name} (${fmtBytes(payload.sizeBytes)})`);
    return text?`${text}\n${imageLines.join("\n")}`:imageLines.join("\n");
  }
  return text;
}
function composeDispatchDetail(prompt,imagePayloads){
  const text=String(prompt||"").trim();
  if(text)return text;
  const images=Array.isArray(imagePayloads)?imagePayloads.filter((payload)=>payload&&payload.name):[];
  if(images.length===1)return`画像 ${images[0].name}`;
  if(images.length>1)return`画像 ${images.length} 件`;
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
      meta.textContent=`${fmtBytes(item.file.size)} / ${String(item.file.type||"不明")}`;
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
  if(textIncludesAny(text,HARNESS_QUALITY_TERMS))signals.quality=true;
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
    if(textIncludesAny(text,HARNESS_QUALITY_TERMS))profile.qualityCount+=1;
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
      onPerformanceTurnStarted(ev);
    }
    if(ev.phase==="completed"){
      hset(c,ev.status||"completed");
      hpush(c,"turn/completed",ev.status||"completed",ev.status==="failed"?"failed":"info");
      onPerformanceTurnCompleted(ev);
    }
    return;
  }
  if(ev.type==="item"){
    const i=ev.item||{};
    hpush(c,i.label||i.type||"item",i.detail||"",i.status==="failed"?"failed":"info");
    return;
  }
  if(ev.type==="activity"){
    hpush(c,ev.label||"activity",ev.detail||"",ev.label==="error"?"failed":"info");
    return;
  }
  if(ev.type==="plan"){
    c.h.planExp=String(ev.explanation||"");
    c.h.plan=(Array.isArray(ev.steps)?ev.steps:[]).map((x)=>({step:String(x.step||""),status:String(x.status||"pending")})).filter((x)=>x.step).slice(0,16);
    hpush(c,"plan/update",`${c.h.plan.length} 件`,`info`);
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
    onPerformanceTokenUsage(ev);
    return;
  }
  if(ev.type==="diff"&&typeof ev.text==="string"){
    c.h.diff=ev.text;
    hpush(c,"turn/diff",`${ev.text.length} 文字`,"info");
  }
}
function lowerText(value){return String(value||"").toLowerCase();}
const HARNESS_QUALITY_TERMS=["test","pytest","playwright","vitest","jest","review","audit","guard","evidence","proof","テスト","検証","レビュー","監査","ガード","証跡","証拠","証明"];
const HARNESS_TEST_TERMS=["test","pytest","playwright","vitest","jest","テスト","検証"];
const HARNESS_REVIEW_TERMS=["review","audit","レビュー","監査"];
const HARNESS_LOG_TERMS=["log","trace","artifact","ログ","トレース","証跡","アーティファクト"];
function textIncludesAny(text,terms){return terms.some((term)=>text.includes(term));}
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
    if(textIncludesAny(text,HARNESS_TEST_TERMS))evidence.tests+=1;
    if(textIncludesAny(text,HARNESS_REVIEW_TERMS))evidence.reviews+=1;
    if(textIncludesAny(text,HARNESS_LOG_TERMS))evidence.logs+=1;
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
    return textIncludesAny(text,HARNESS_QUALITY_TERMS);
  });
  const hasAnyProgressSignal=hasRequirement||hasPlan||hasExecutionSignal||hasQualitySignal||hasDispatch||hasTurnStart||hasTurnCompleted;
  const hasActiveTurnLikeStatus=status==="starting"||status==="running"||status==="needs_input"||status==="completed"||status==="failed"||status==="interrupted";
  const shouldHighlightStage=hasAnyProgressSignal||hasActiveTurnLikeStatus;

  let stageIndex=0;
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

  const states=["todo","todo","todo","todo","todo"];
  if(status==="completed"){
    const strictComplete=checkMode===HARNESS_CHECK_MODES.RELAXED||(hasRequirement&&hasPlan&&hasTurnCompleted);
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
    return{label:"FAIL",tone:"failed",detail:`終端ステータスは ${displayHarnessStatusLabel(status)} です。`};
  }
  if(status==="needs_input"){
    return{label:"WAIT",tone:"running",detail:"ユーザー入力または承認を待っています。"};
  }
  if(checkMode===HARNESS_CHECK_MODES.STRICT||checkMode===HARNESS_CHECK_MODES.ADAPTIVE){
    const modeName=displayHarnessModeLabel(checkMode);
    const planSignalLabel=hasPlanInferred?"計画更新（推定マイクロプラン）":"計画更新";
    if(status==="running"||status==="starting"){
      if(hasTurnStart&&!hasPlan){
        return{label:"WARN",tone:"running",detail:`計画更新（plan/update）の前に実行が始まりました（${modeName}ゲート）。`};
      }
      const observed=[];
      if(hasRequirement)observed.push(displayHarnessSignalLabel("requirement/dispatch"));
      if(hasTurnStart)observed.push(displayHarnessSignalLabel("turn/start"));
      if(hasPlan)observed.push(planSignalLabel);
      if(hasDelegation)observed.push(displayHarnessSignalLabel("child dispatch"));
      return{
        label:"RUNNING",
        tone:"running",
        detail:observed.length?`観測済み: ${observed.join(", ")}。`:"ターンを実行中です。",
      };
    }
    if(status==="completed"){
      const missingHard=[];
      if(!hasRequirement)missingHard.push(displayHarnessSignalLabel("requirement/dispatch"));
      if(!hasTurnStart)missingHard.push(displayHarnessSignalLabel("turn/start"));
      if(!hasTurnCompleted)missingHard.push(displayHarnessSignalLabel("turn/completed"));
      if(!hasPlan)missingHard.push(displayHarnessSignalLabel("plan/update"));
      if(missingHard.length){
        return{label:"FAIL",tone:"failed",detail:`${modeName} モードで必須シグナルが不足しています: ${missingHard.join(", ")}。`};
      }
      if(hasFailedEvent){
        return{label:"WARN",tone:"failed",detail:"完了しましたが、トレース内に失敗イベントがあります。"};
      }
      if(!hasDelegation&&!(checkMode===HARNESS_CHECK_MODES.ADAPTIVE&&hasPlanInferred)){
        return{label:"WARN",tone:"running",detail:"推奨シグナルの子エージェント委譲が観測できていません。"};
      }
      if(hasPlanInferred){
        return{label:"PASS",tone:"completed",detail:`軽量ターンとして、${modeName} の必須シグナルと推定マイクロプランを観測しました。`};
      }
      return{label:"PASS",tone:"completed",detail:`${modeName} の必須ハーネスシグナルを観測しました。`};
    }
    return{label:"WAIT",tone:"idle",detail:"まだ終端ターンはありません。"};
  }
  if(status==="running"||status==="starting"){
    const observed=[];
    if(hasTurnStart)observed.push(displayHarnessSignalLabel("turn/start"));
    if(hasPlan)observed.push(displayHarnessSignalLabel("plan/update"));
    if(hasDelegation)observed.push(displayHarnessSignalLabel("child dispatch"));
    return{
      label:"RUNNING",
      tone:"running",
      detail:observed.length?`観測済み: ${observed.join(", ")}。`:"ターンを実行中です。",
    };
  }
  if(status==="completed"){
    if(hasFailedEvent){
      return{label:"WARN",tone:"failed",detail:"完了しましたが、トレース内に失敗イベントがあります。"};
    }
    const missing=[];
    if(!hasTurnStart)missing.push(displayHarnessSignalLabel("turn/start"));
    if(!hasTurnCompleted)missing.push(displayHarnessSignalLabel("turn/completed"));
    if(!hasPlan)missing.push(displayHarnessSignalLabel("plan/update"));
    if(!hasDelegation)missing.push(displayHarnessSignalLabel("child dispatch"));
    if(missing.length){
      return{label:"WARN",tone:"running",detail:`不足シグナル: ${missing.join(", ")}。`};
    }
    return{label:"PASS",tone:"completed",detail:"必須ハーネスシグナルを観測しました。"};
  }
  return{label:"WAIT",tone:"idle",detail:"まだ終端ターンはありません。"};
}
function normalizePlanStepStatusForUi(value){
  const normalized=lowerText(value).replace(/[\s-]+/g,"_");
  if(normalized==="in_progress"||normalized==="running"||normalized==="active"||normalized==="working")return"in_progress";
  if(normalized==="completed"||normalized==="done"||normalized==="pass"||normalized==="ok"||normalized==="ready")return"completed";
  if(normalized==="failed"||normalized==="error")return"failed";
  if(normalized==="interrupted"||normalized==="aborted"||normalized==="cancelled"||normalized==="canceled")return"interrupted";
  return"pending";
}
function planStepStatusLabelForUi(status){
  if(status==="in_progress")return"進行中";
  if(status==="completed")return"完了";
  if(status==="failed")return"失敗";
  if(status==="interrupted")return"中断";
  return"待機";
}
function planFocusLabelForUi(mode){
  if(mode==="current")return"Current Plan Step";
  if(mode==="next")return"Next Planned Step";
  if(mode==="blocked")return"Blocked Plan Step";
  if(mode==="done")return"Last Completed Step";
  return"Plan Focus";
}
function derivePlanFocusForUi(planSteps,statusText=""){
  const steps=toArr(planSteps).map((step,index)=>{
    const explicitIndex=Number.isFinite(Number(step&&step.index))?Math.max(0,Math.trunc(Number(step.index))):index;
    const text=step&&typeof step.text==="string"
      ?step.text.trim()
      :(step&&typeof step.step==="string"?step.step.trim():"");
    return{text,index:explicitIndex,status:normalizePlanStepStatusForUi(step&&step.status),raw:step};
  }).filter((step)=>step.text);
  if(!steps.length)return null;
  const turnStatus=lowerText(statusText);
  const currentStep=steps.find((step)=>step.status==="in_progress");
  if(currentStep)return{...currentStep,mode:"current"};
  const blockedStep=steps.find((step)=>step.status==="failed"||step.status==="interrupted");
  if(blockedStep)return{...blockedStep,mode:"blocked"};
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
function renderTimeline(){e.timeline.innerHTML="";const c=active();if(!c)return;c.messages.forEach(m=>{const f=e.messageTemplate.content.cloneNode(true);f.querySelector(".message").classList.add(m.role);f.querySelector(".meta").textContent=`${m.title} ${m.time}`;f.querySelector(".content").textContent=m.content||"";e.timeline.appendChild(f)});e.timeline.scrollTop=e.timeline.scrollHeight}
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
    const agentLabel=displayAgentNameForUi(c.agent);
    const b=document.createElement("button");
    b.type="button";
    b.className=c.id===s.active?"chat-item active":"chat-item";
    b.title="ダブルクリックでタイトル変更 / Delete キーで削除";
    b.innerHTML=`<span class=\"chat-item-line\"><span class=\"chat-item-title\">${c.title}</span><span class=\"chat-item-meta\">${agentLabel}</span><span class=\"chat-item-status ${statusClass}\">${statusLabel}</span></span>`;
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
  syncHarnessFlow(c,checkMode);
  const h=c.h;
  const stageListEl=by("harnessJourneyList");
  const stageEl=by("harnessJourneyStage");
  const workEl=by("harnessJourneyWork");
  const complianceEl=by("harnessComplianceBadge");
  const complianceDetailEl=by("harnessComplianceDetail");
  const highlightsEl=by("harnessHighlights");
  if(!stageListEl||!stageEl||!workEl||!highlightsEl)return;

  const status=String(h.status||"idle");
  const flowItems=toArr(h.flow);
  const phaseStateText=(phase)=>{
    const state=String(phase&&phase.state||"todo");
    if(state==="active")return"進行中";
    if(state==="done")return"完了";
    if(state==="failed")return"失敗";
    return"待機中";
  };
  const phaseTone=(phase)=>{
    const state=String(phase&&phase.state||"todo");
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

  stageListEl.innerHTML="";
  flowItems.forEach((phase)=>{
    const state=String(phase&&phase.state||"todo");
    const card=document.createElement("article");
    card.className=`harness-journey-step ${state}`;
    const title=document.createElement("h4");
    title.textContent=String(phase&&phase.label||"フェーズ");
    const detail=document.createElement("p");
    detail.textContent=String(phase&&phase.detail||phaseStateText(phase));
    card.appendChild(title);
    card.appendChild(detail);
    stageListEl.appendChild(card);
  });

  let currentPhase=flowItems.find((phase)=>phase&&phase.state==="active")||flowItems.find((phase)=>phase&&phase.state==="failed")||null;
  if(!currentPhase){
    const donePhases=flowItems.filter((phase)=>phase&&phase.state==="done");
    currentPhase=donePhases.length?donePhases[donePhases.length-1]:(flowItems[0]||null);
  }
  stageEl.textContent=currentPhase?`${currentPhase.label} (${phaseStateText(currentPhase)})`:"未開始";
  stageEl.className=`harness-now-value ${phaseTone(currentPhase)}`;
  const latestEvent=toArr(h.events)[0];
  workEl.textContent=latestEvent?`${displayTraceTypeLabel(latestEvent.l)}${latestEvent.d?` / ${latestEvent.d}`:""}`:"待機中";
  workEl.className=`harness-now-value ${latestEvent&&latestEvent.tone==="failed"?"failed":(status==="running"?"running":"idle")}`;
  let verdict=evaluateHarnessVerdict(h,checkMode);
  const latest=runtimeLatestTurn();
  const latestIntent=latest&&latest.intent_first&&typeof latest.intent_first==="object"?latest.intent_first:null;
  if(verdict.label==="PASS"&&latestIntent&&latestIntent.design_sensitive&&["blocked","failed_validation"].includes(String(latestIntent.status||"").toLowerCase())){
    verdict={label:"FAIL",tone:"failed",detail:latestIntent.summary||"Intent-First の完了ゲートにより最新のデザイン系ターンがブロックされました。"};
  }
  if(complianceEl){
    complianceEl.textContent=displayHarnessVerdictLabel(verdict.label);
    complianceEl.className=`harness-now-value ${verdict.tone}`;
  }
  if(complianceDetailEl){
    complianceDetailEl.textContent=verdict.detail;
  }

  const planSteps=toArr(h.plan).map((step,index)=>({
    index,
    text:step&&typeof step.step==="string"?step.step.trim():"",
    status:normalizePlanStepStatusForUi(step&&step.status),
  })).filter((step)=>step.text);
  const planFocus=derivePlanFocusForUi(planSteps,status);
  if(e.harnessPlanMeta){
    const completedCount=planSteps.filter((step)=>step.status==="completed").length;
    e.harnessPlanMeta.textContent=planSteps.length?`${completedCount}/${planSteps.length} completed`:"No plan";
  }
  if(e.harnessPlanCurrentCard){
    const tone=planFocus?planFocus.status:"idle";
    e.harnessPlanCurrentCard.className=`harness-plan-current ${tone}`;
  }
  if(e.harnessPlanCurrentStep){
    e.harnessPlanCurrentStep.textContent=planFocus?planFocus.text:"Waiting for plan";
  }
  if(e.harnessPlanCurrentDetail){
    if(planFocus){
      e.harnessPlanCurrentDetail.textContent=`${planFocusLabelForUi(planFocus.mode)} / ${planStepStatusLabelForUi(planFocus.status)} / step ${planFocus.index+1}${planSteps.length?` of ${planSteps.length}`:""}`;
    }else{
      e.harnessPlanCurrentDetail.textContent="No plan has been emitted for this chat yet.";
    }
  }
  if(e.harnessPlanExplanation){
    if(String(h.planExp||"").trim()){
      e.harnessPlanExplanation.textContent=h.planExp;
    }else if(planSteps.length){
      e.harnessPlanExplanation.textContent="Plan summary was not provided, but the latest plan steps are listed below.";
    }else{
      e.harnessPlanExplanation.textContent="Plan summary will appear here once the agent emits a plan/update event.";
    }
  }
  if(e.harnessPlanList){
    e.harnessPlanList.innerHTML="";
    if(!planSteps.length){
      const empty=document.createElement("li");
      empty.className="harness-empty";
      empty.textContent="Plan steps will appear here.";
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
        item.appendChild(head);
        item.appendChild(text);
        e.harnessPlanList.appendChild(item);
      });
    }
  }

  const evidence=h.evidence&&typeof h.evidence==="object"?h.evidence:{tasksDone:0,tasksTotal:0,tests:0,reviews:0,logs:0};
  const requirementPhase=flowItems.find((phase)=>phase&&phase.id==="requirements")||flowItems[0]||null;
  const planningPhase=flowItems.find((phase)=>phase&&phase.id==="planning")||flowItems[1]||null;
  const executionPhase=flowItems.find((phase)=>phase&&phase.id==="execution")||flowItems[2]||null;
  const qualityPhase=flowItems.find((phase)=>phase&&phase.id==="quality")||flowItems[3]||null;
  const reportPhase=flowItems.find((phase)=>phase&&phase.id==="report")||flowItems[4]||null;

  const highlights=[];
  highlights.push(`判定モード: ${displayHarnessModeLabel(checkMode)}`);
  highlights.push(`準拠判定: ${displayHarnessVerdictLabel(verdict.label)} / ${verdict.detail}`);
  if(latestIntent&&latestIntent.design_sensitive){
    highlights.push(`意図ゲート: ${displayHarnessStatusLabel(latestIntent.status||"不明")} / ${latestIntent.summary||"該当なし"}`);
  }
  if(requirementPhase&&(requirementPhase.state!=="todo"||status==="needs_input"))highlights.push(`要件整理: ${describePhase(requirementPhase)}`);
  if(planningPhase&&planningPhase.state!=="todo")highlights.push(`計画作成: ${describePhase(planningPhase)}`);
  if(executionPhase&&(executionPhase.state!=="todo"||Number(evidence.tasksTotal)>0))highlights.push(`実行: ${describePhase(executionPhase)} / ${Number(evidence.tasksDone)||0}/${Number(evidence.tasksTotal)||0} タスク完了`);
  if(qualityPhase&&(qualityPhase.state!=="todo"||Number(evidence.tests)+Number(evidence.reviews)+Number(evidence.logs)>0))highlights.push(`品質チェック: ${describePhase(qualityPhase)} / テスト${Number(evidence.tests)||0} レビュー${Number(evidence.reviews)||0} ログ${Number(evidence.logs)||0}`);
  if(reportPhase&&(reportPhase.state!=="todo"||["completed","failed","needs_input","interrupted"].includes(status)))highlights.push(`報告: ${describePhase(reportPhase)}`);
  if(h.thread||h.turn){
    highlights.push(`実行ID: スレッド ${h.thread||"-"} / ターン ${h.turn||"-"}`);
  }
  const inProgressStep=toArr(h.plan).find((step)=>step&&String(step.status||"").toLowerCase()==="in_progress");
  if(inProgressStep&&inProgressStep.step){
    highlights.push(`進行中プラン: ${inProgressStep.step}`);
  }else if(h.planExp){
    highlights.push(`プラン要約: ${t1(h.planExp,160)}`);
  }
  const failedEvent=toArr(h.events).find((item)=>item&&item.tone==="failed");
  if(failedEvent){
    highlights.push(`ブロッカー: ${displayTraceTypeLabel(failedEvent.l)}${failedEvent.d?` / ${failedEvent.d}`:""}`);
  }
  if(status==="needs_input"){
    highlights.push("ユーザー入力待ち: 追加回答または承認が必要です。");
  }
  if(Number(evidence.tasksTotal)>0&&Number(evidence.tasksDone)<Number(evidence.tasksTotal)){
    highlights.push(`未完了タスク: ${Number(evidence.tasksDone)||0}/${Number(evidence.tasksTotal)||0}`);
  }
  if(typeof h.diff==="string"&&h.diff.trim()){
    const diffLines=h.diff.split(/\r?\n/).filter(Boolean).length;
    highlights.push(`変更影響: 差分 ${diffLines} 行`);
  }
  if(h.tokens){
    highlights.push(`トークン使用: ${h.tokens}`);
  }

  highlightsEl.innerHTML="";
  const rows=highlights.slice(0,6);
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
function inspect(){if(!e.agentInspector)return;const c=active();if(!c)return;const ra=rAgents().find(a=>a.name===c.agent);e.agentInspector.textContent=ra?`エージェント: ${displayAgentNameForUi(ra.name,{includeScope:true})}\n稼働: ${ra.isActive?"はい":"いいえ"}\nセッション: ${displaySessionRef(ra.sessionRef)}`:`エージェント: ${displayAgentNameForUi(c.agent,{includeScope:true})}\nランタイムメタデータはまだ取得できていません。`}
function trace(type,agent,detail="",cid=s.active){s.trace.unshift({type,agent,cid:cid||"",detail:t1(detail,140),at:Date.now()});s.trace=s.trace.slice(0,180);flow()}
function traceTone(type){if(type==="dispatch"||type==="streaming"||type==="running")return"running";if(type==="completed")return"completed";if(type==="failed"||type==="aborted")return"failed";return"idle"}
function flow(){
  const currentChat=active();
  const currentChatId=currentChat&&currentChat.id?currentChat.id:"";
  const traceRows=s.trace.filter((item)=>item&&item.cid===currentChatId);
  const names=new Set();
  if(currentChat&&currentChat.agent&&!isHiddenAgentForUi(currentChat.agent))names.add(currentChat.agent);
  s.req.forEach((r)=>{
    if(!r||r.cid!==currentChatId||!r.agent||isHiddenAgentForUi(r.agent))return;
    names.add(r.agent);
  });
  traceRows.forEach((row)=>{
    if(!row||!row.agent||isHiddenAgentForUi(row.agent))return;
    names.add(row.agent);
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
      pendingByAgent.set(item.agent,(pendingByAgent.get(item.agent)||0)+1);
    });
    const runtimeByName=new Map(rAgents().map((item)=>[item.name,item]));
    runtimeByName.forEach((runtime,name)=>{
      if(!runtime||!name||isHiddenAgentForUi(name))return;
      const activeTurnId=typeof runtime.activeTurnId==="string"?runtime.activeTurnId.trim():"";
      if(!activeTurnId)return;
      pendingByAgent.set(name,Math.max(1,pendingByAgent.get(name)||0));
    });
    const latestTraceByAgent=new Map();
    traceRows.forEach((item)=>{if(item&&item.agent&&!latestTraceByAgent.has(item.agent))latestTraceByAgent.set(item.agent,item)});

    const buckets={idle:[],running:[],completed:[],failed:[]};
    list.forEach((name)=>{
      const runtime=runtimeByName.get(name)||null;
      const pendingCount=pendingByAgent.get(name)||0;
      const lastTrace=latestTraceByAgent.get(name)||null;
      const fromTrace=lastTrace?traceTone(lastTrace.type):"idle";
      const tone=pendingCount>0
        ?"running"
        :(fromTrace==="idle"&&runtime&&runtime.isActive?"idle":fromTrace);
      let statusText=tone==="running"?(pendingCount>0?`実行中 (${pendingCount})`:"実行中"):tone==="completed"?"完了":tone==="failed"?(lastTrace&&lastTrace.type==="aborted"?"中断":"失敗"):"待機";
      let activity=lastTrace?`${tt(lastTrace.at)} ${displayTraceTypeLabel(lastTrace.type)}${lastTrace.detail?` / ${lastTrace.detail}`:""}`:(pendingCount>0?"実行リクエスト処理中":"待機中");

      const card=document.createElement("article");
      card.className="agent-flow-card";
      if(tone==="running")card.classList.add("running");
      else if(tone!=="idle")card.classList.add("active");
      const title=document.createElement("h5");
      title.className="agent-flow-name";
      title.textContent=displayAgentNameForUi(name,{includeScope:true});
      const status=document.createElement("p");
      status.className=`agent-flow-status ${tone==="running"?"running":(tone==="idle"?"idle":"active")}`;
      status.textContent=statusText;
      const role=document.createElement("p");
      role.className="agent-flow-meta";
      role.textContent=`ロール: ${displayRoleLabel(inferAgentRoleForUi(name))}`;
      const session=document.createElement("p");
      session.className="agent-flow-meta";
      session.textContent=`セッション: ${displaySessionRef(runtime&&runtime.sessionRef?runtime.sessionRef:"")}`;
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

  e.agentTraceList.innerHTML=traceRows.length?"":'<li class="agent-trace-empty">まだトレースイベントはありません。</li>';
  traceRows.slice(0,32).forEach(x=>{const tone=traceTone(x.type)==="failed"?(x.type==="aborted"?"aborted":"failed"):traceTone(x.type);const li=document.createElement("li");li.className=`agent-trace-item ${tone}`;li.innerHTML=`<span class=\"agent-trace-time\">${tt(x.at)}</span><span class=\"agent-trace-agent\">${displayAgentNameForUi(x.agent,{includeScope:true})}</span><span class=\"agent-trace-event\">${displayTraceTypeLabel(x.type)}</span><span class=\"agent-trace-detail\">${x.detail||"-"}</span>`;e.agentTraceList.appendChild(li)});
  renderAgentTopography();
}
function live(){
  flow();
  const currentChat=active();
  const currentChatId=currentChat&&currentChat.id?currentChat.id:"";
  const currentPending=currentChatId?pendingCountForChat(currentChatId):0;
  const runningRows=[...s.req.values()].filter((row)=>row&&row.cid===currentChatId);
  const total=runningRows.length;
  if(currentPending>0){
    const starts=runningRows.map((r)=>r.at).filter(Number.isFinite);
    const start=starts.length?Math.min(...starts):(Number.isFinite(Number(s.perf.liveTurnStartedAt))&&s.perf.liveTurnStartedAt>0?s.perf.liveTurnStartedAt:Date.now());
    const bag=new Map();
    runningRows.forEach((r)=>bag.set(r.agent,(bag.get(r.agent)||0)+1));
    if(!bag.size&&currentChat&&currentChat.agent){
      bag.set(currentChat.agent,1);
    }
    e.liveStatus.className="live-status running";
    e.liveStatusLabel.textContent=`実行中 (${currentPending})`;
    e.liveStatusElapsed.textContent=el(Date.now()-start);
    e.liveStatusDetail.textContent=[...bag.entries()].map(([n,c])=>{const label=displayAgentNameForUi(n,{includeScope:true});return c>1?`${label} x${c}`:label;}).join(" / ")||"処理中...";
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
      ?`このチャットに進行中のリクエストはありません。他チャットで ${runningElsewhere} 件が動作中です。`
      :"進行中のリクエストはありません。";
    renderPerformanceIndicator();
    return;
  }
  const tone=lastForCurrentChat.type==="failed"?"failed":lastForCurrentChat.type==="aborted"?"aborted":"completed";
  e.liveStatus.className=`live-status ${tone}`;
  e.liveStatusLabel.textContent=lastForCurrentChat.type==="failed"?"直前の実行は失敗":lastForCurrentChat.type==="aborted"?"直前の実行は中断":"直前の実行は完了";
  e.liveStatusElapsed.textContent=el(Date.now()-lastForCurrentChat.at);
  e.liveStatusDetail.textContent=`${lastForCurrentChat.chat||"現在のチャット"} / ${displayAgentNameForUi(lastForCurrentChat.agent,{includeScope:true})||"現在のエージェント"} / ${lastForCurrentChat.detail||""}`;
  renderPerformanceIndicator();
}
function runtimeAgentRecordForUi(agentName){
  const wanted=normalizeAgentNameForUi(agentName);
  if(!wanted)return null;
  return rAgents().find((item)=>normalizeAgentNameForUi(item&&item.name)===wanted)||null;
}
function resolveInterruptTargetForChat(chatRecord){
  if(!chatRecord||typeof chatRecord!=="object")return null;
  const agentName=normalizeAgentNameForUi(chatRecord.agent);
  const harnessThreadId=typeof chatRecord.h?.thread==="string"?chatRecord.h.thread.trim():"";
  const harnessTurnId=typeof chatRecord.h?.turn==="string"?chatRecord.h.turn.trim():"";
  if(harnessThreadId&&harnessTurnId){
    return{agentName,threadId:harnessThreadId,turnId:harnessTurnId,source:"harness"};
  }
  const runtimeAgent=runtimeAgentRecordForUi(agentName);
  const runtimeThreadId=typeof runtimeAgent?.threadId==="string"?runtimeAgent.threadId.trim():"";
  const runtimeTurnId=typeof runtimeAgent?.activeTurnId==="string"?runtimeAgent.activeTurnId.trim():"";
  if(runtimeThreadId&&runtimeTurnId){
    return{agentName,threadId:runtimeThreadId,turnId:runtimeTurnId,source:"runtime"};
  }
  if(agentName){
    return{agentName,source:"agent"};
  }
  return null;
}
async function requestTurnInterrupt(target){
  const token=controlApiToken();
  if(!token)throw new Error("control API token を取得できません。先にランタイムを更新してください。");
  const headerName=controlApiTokenHeader();
  const headers={"Content-Type":"application/json"};
  headers[headerName]=token;
  const payload={};
  if(target&&typeof target.agentName==="string"&&target.agentName)payload.agentName=target.agentName;
  if(target&&typeof target.threadId==="string"&&target.threadId)payload.threadId=target.threadId;
  if(target&&typeof target.turnId==="string"&&target.turnId)payload.turnId=target.turnId;
  const response=await fetch("/api/turn/interrupt",{method:"POST",headers,body:JSON.stringify(payload)});
  let parsed=null;
  try{
    parsed=await response.json();
  }catch(_e){
    parsed=null;
  }
  if(!response.ok){
    const detail=parsed&&typeof parsed.error==="string"&&parsed.error
      ?parsed.error
      :`HTTP ${response.status}`;
    throw new Error(detail);
  }
  return parsed&&typeof parsed==="object"?parsed:{ok:true,target:payload};
}
function pending(){
  const c=active();
  const totalPending=totalPendingCount();
  const currentPending=c?pendingCountForChat(c.id):0;
  const hasPending=totalPending>0;
  const hasCurrentPending=currentPending>0;
  if(c)c.pending=currentPending;
  e.stopBtn.disabled=!c||currentPending===0;
  if(e.sendBtn)e.sendBtn.disabled=!c||currentPending>0;
  if(e.deleteChatBtn)e.deleteChatBtn.disabled=!c;
  if(!hasPending)e.pendingState.textContent="実行待ちなし";
  else if(currentPending>0)e.pendingState.textContent=`進行中: このチャット ${currentPending} / 全体 ${totalPending}`;
  else e.pendingState.textContent=`他チャットで実行中: ${totalPending}`;
  e.pendingState.classList.toggle("waiting",hasCurrentPending);
  e.pendingState.classList.toggle("idle",!hasCurrentPending);
  if(!c)e.agentState.textContent="チャット: なし";
  else{
    const agentLabel=displayAgentNameForUi(c.agent,{includeScope:true});
    e.agentState.textContent=`チャット: ${c.title}${currentPending>0?` (${currentPending})`:""} / エージェント: ${agentLabel}`;
  }
}
function refresh(){renderTimeline();renderChatList();renderIntentFirstPanel();renderHarness();inspect();pending();live();renderPerformanceIndicator();renderAutomationStatus();syncRuntimePendingMonitor()}
function profileSync(){const snap={approvalPolicy:e.approvalPolicy.value,sandboxMode:e.sandboxMode.value,webSearch:e.webSearch.checked};const id=Object.keys(PROFILES).find(k=>{const p=PROFILES[k];return p.approvalPolicy===snap.approvalPolicy&&p.sandboxMode===snap.sandboxMode&&p.webSearch===snap.webSearch});e.executionProfile.value=id||"custom"}
function localizeLegacyMessageTitle(title,role){
  const raw=typeof title==="string"?title.trim():"";
  if(!raw)return role==="user"?"あなた":role==="system"?"システム":"Codex";
  if(/^you$/i.test(raw)||/^user$/i.test(raw))return"あなた";
  if(/^system$/i.test(raw))return"システム";
  if(/^assistant$/i.test(raw))return"Codex";
  return raw;
}
function localizeLegacyChatTitle(title,index){
  const fallback=`チャット ${index+1}`;
  const raw=t1(title||fallback,60).trim()||fallback;
  const matched=raw.match(/^chat\s+(\d+)$/i);
  if(matched)return`チャット ${matched[1]}`;
  return raw;
}
function normalizeSavedMessage(raw,index){
  if(!raw||typeof raw!=="object")return null;
  const id=typeof raw.id==="string"&&raw.id.trim()?raw.id.trim():`m-restore-${index+1}`;
  const role=typeof raw.role==="string"&&raw.role.trim()?raw.role.trim():"assistant";
  const originalTitle=typeof raw.title==="string"?raw.title:"";
  const title=localizeLegacyMessageTitle(originalTitle,role);
  const time=typeof raw.time==="string"?raw.time:"";
  const content=typeof raw.content==="string"?raw.content:String(raw.content||"");
  return{id,role,title,time,content,_migrated:title!==originalTitle};
}
function normalizeSavedChat(raw,index){
  if(!raw||typeof raw!=="object")return null;
  const id=typeof raw.id==="string"&&raw.id.trim()?raw.id.trim():`chat-restore-${index+1}-${Date.now()}`;
  const originalTitle=typeof raw.title==="string"?raw.title:"";
  const title=localizeLegacyChatTitle(originalTitle,index);
  const savedAgent=typeof raw.agent==="string"&&raw.agent.trim()?raw.agent.trim():"";
  const agent=normalizeScopedChatAgentNameForUi(savedAgent,id);
  const messages=toArr(raw.messages).map((item,msgIndex)=>normalizeSavedMessage(item,msgIndex)).filter(Boolean).slice(-CHAT_MESSAGE_LIMIT);
  const migrated=title!==t1(originalTitle||`チャット ${index+1}`,60).trim()||messages.some((item)=>item&&item._migrated);
  messages.forEach((item)=>{if(item&&typeof item==="object")delete item._migrated;});
  const forceNewSession=typeof raw.forceNewSession==="boolean"?raw.forceNewSession:messages.length===0;
  return{id,title,agent,pending:0,messages,h:createHarnessState(),forceNewSession,_migrated:migrated};
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
  let migrated=false;
  const restored=toArr(parsed.chats).map((item,index)=>normalizeSavedChat(item,index)).filter(Boolean);
  if(!restored.length)return;
  restored.forEach((item)=>{if(item&&item._migrated)migrated=true;if(item&&typeof item==="object")delete item._migrated;});
  s.chats=restored;
  const activeId=typeof parsed.active==="string"?parsed.active:"";
  s.active=restored.some((item)=>item.id===activeId)?activeId:restored[0].id;
  const storedNextChat=Number.isFinite(Number(parsed.nextChat))?Math.max(1,Math.trunc(Number(parsed.nextChat))):1;
  const storedNextMsg=Number.isFinite(Number(parsed.nextMsg))?Math.max(1,Math.trunc(Number(parsed.nextMsg))):1;
  s.nextChat=Math.max(storedNextChat,deriveNextChatCounter(restored));
  s.nextMsg=Math.max(storedNextMsg,deriveNextMessageCounter(restored));
  if(migrated)saveChatStateNow();
}
function saveSettings(){
  try{
    const payload={approvalPolicy:e.approvalPolicy.value,sandboxMode:e.sandboxMode.value,webSearch:Boolean(e.webSearch.checked),executionProfile:e.executionProfile.value,modelName:selectedExecModel(),modelReasoningEffort:selectedExecModelReasoningEffort(),simpleView:document.body.classList.contains("simple-view"),uiVisibility:e.uiVisibility?Boolean(e.uiVisibility.checked):true,workspacePath:workspaceInputPath()||selectedCwd()};
    localStorage.setItem(SETTINGS_KEY,JSON.stringify(payload));
  }catch{}
}
function loadSettings(){
  let parsed={};
  try{parsed=JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}")}catch{parsed={}}
  const defaultProfile=PROFILES["power"]||{approvalPolicy:"never",sandboxMode:"danger-full-access",webSearch:true};
  settingsState.hasStoredModel=false;
  settingsState.hasStoredModelReasoningEffort=false;
  e.approvalPolicy.value=defaultProfile.approvalPolicy;
  e.sandboxMode.value=defaultProfile.sandboxMode;
  e.webSearch.checked=Boolean(defaultProfile.webSearch);
  if(e.modelName){
    const runtimeModel=runtimeDefaultExecModel();
    hydrateExecModelOptionsForUi([runtimeModel,parsed&&typeof parsed.modelName==="string"?parsed.modelName:""]);
    e.modelName.value=ensureExecModelOptionForUi(runtimeModel)||runtimeModel;
  }
  if(e.modelReasoningEffort)e.modelReasoningEffort.value=runtimeDefaultExecModelReasoningEffort();
  if(typeof parsed.approvalPolicy==="string"&&parsed.approvalPolicy.trim())e.approvalPolicy.value=parsed.approvalPolicy.trim();
  if(typeof parsed.sandboxMode==="string"&&parsed.sandboxMode.trim())e.sandboxMode.value=parsed.sandboxMode.trim();
  if(typeof parsed.webSearch==="boolean")e.webSearch.checked=Boolean(parsed.webSearch);
  if(typeof parsed.executionProfile==="string")e.executionProfile.value=parsed.executionProfile;
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
  e.simpleViewToggle.textContent=document.body.classList.contains("simple-view")?"詳細を表示":"簡易表示";
  profileSync();
  renderWorkspaceScopeUi();
}
function updateSearchDiag(){if(s.diagErr){e.diagSearchState.textContent="エラー";e.diagSearchState.className="diag-state missing";e.diagSearchDetail.textContent=s.diagErr;return}const codex=s.diag&&s.diag.tools&&s.diag.tools.codex&&s.diag.tools.codex.available;if(!e.webSearch.checked){e.diagSearchState.textContent="オフ";e.diagSearchState.className="diag-state off";e.diagSearchDetail.textContent="設定で無効です。";return}if(codex){e.diagSearchState.textContent="オン";e.diagSearchState.className="diag-state ready";e.diagSearchDetail.textContent="次回実行で Web 検索が有効です。";return}e.diagSearchState.textContent="利用不可";e.diagSearchState.className="diag-state missing";e.diagSearchDetail.textContent="Codex CLI を利用できません。"}
function tdiag(name,st,de){const t=s.diag&&s.diag.tools?s.diag.tools[name]:null;if(!t){st.textContent="不明";st.className="diag-state pending";de.textContent="データなし";return}if(t.available){st.textContent="準備完了";st.className="diag-state ready";de.textContent=t.version||"利用可能";return}st.textContent="不足";st.className="diag-state missing";de.textContent=t.error||"利用不可"}
function renderDiagSummary(){
  if(!e.diagSummaryText)return;
  const rows=[
    {name:"Codex",state:e.diagCodexState?String(e.diagCodexState.textContent||"").toLowerCase():"unknown"},
    {name:"Node",state:e.diagNodeState?String(e.diagNodeState.textContent||"").toLowerCase():"unknown"},
    {name:"Web検索",state:e.diagSearchState?String(e.diagSearchState.textContent||"").toLowerCase():"unknown"},
  ];
  const bad=rows.filter((row)=>["missing","error","unavailable","不足","エラー","利用不可"].includes(row.state));
  const totalReady=rows.filter((row)=>["ready","on","off","準備完了","オン","オフ"].includes(row.state)).length;
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
  if(!response.ok)throw new Error(`ランタイムの読み込みに失敗しました: ${response.status}`);
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
  syncPerformanceFromRuntime(s.runtime);
  const workspaceGuard=runtimeWorkspaceGuard();
  if(e.workspacePath&&workspaceGuard&&workspaceGuard.locked&&typeof workspaceGuard.lockedRoot==="string"&&workspaceGuard.lockedRoot.trim())e.workspacePath.value=workspaceGuard.lockedRoot.trim();
  else if(e.workspacePath&&!e.workspacePath.value.trim())e.workspacePath.value=s.runtime.workspaceRoot||"";
  if(e.runtimeAgent)e.runtimeAgent.textContent=s.runtime.activeAgent||DEFAULT_AGENT_NAME;
  if(e.runtimeSession)e.runtimeSession.textContent=displaySessionRef(s.runtime.sessionRef);
  if(e.runtimeExperimental)e.runtimeExperimental.textContent=displayFlagState(Boolean(s.runtime.experimental),{on:"有効",off:"無効"});
  if(e.runtimeAgentCount)e.runtimeAgentCount.textContent=Number.isInteger(s.runtime.agentCount)?String(s.runtime.agentCount):"1";
  if(e.openCmdBtn){
    const canOpenShell=Boolean(controlApiToken()&&controlApiAllows("open_workspace_shell"));
    e.openCmdBtn.disabled=!canOpenShell;
    e.openCmdBtn.title=canOpenShell?"":"ランタイムポリシーにより Open CMD は無効です。";
  }
  renderWorkspaceScopeUi();
  e.connectionState.textContent="接続中";
  e.connectionState.classList.add("connected");
  e.connectionState.classList.remove("disconnected");
  e.modeState.textContent=`モード (${s.runtime.mode||"不明"})`;
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
async function loadDiag(){try{const r=await fetch("/api/diagnostics",{cache:"no-store"});if(!r.ok){let body="";try{body=await r.text()}catch(_e){}const er=new Error(`HTTP ${r.status}`);er.kind="http";er.status=r.status;er.bodyText=body;throw er}s.diag=await r.json();s.diagErr=null}catch(er){s.diagErr=er&&er.kind==="http"?`HTTP ${er.status}: ${String(er.bodyText||"").replace(/\s+/g," ").trim().slice(0,180)}`:`ネットワークエラー: ${er&&er.message?er.message:"不明"}`;throw er}finally{if(s.diagErr){[e.diagCodexState,e.diagNodeState,e.diagSearchState].forEach((st,i)=>{const de=[e.diagCodexDetail,e.diagNodeDetail,e.diagSearchDetail][i];st.textContent="エラー";st.className="diag-state missing";de.textContent=s.diagErr})}else{tdiag("codex",e.diagCodexState,e.diagCodexDetail);tdiag("node",e.diagNodeState,e.diagNodeDetail);updateSearchDiag()}renderDiagSummary()}}
function hasAutomationUi(){return Boolean(automationUi.panel&&automationUi.status&&automationUi.history);}
function normalizeAutomationBatchRun(raw,index){
  const item=raw&&typeof raw==="object"?raw:{};
  const runId=typeof item.runId==="string"&&item.runId.trim()?item.runId.trim():`run-${index+1}`;
  const mode=typeof item.mode==="string"&&item.mode.trim()?item.mode.trim():"mock";
  const status=typeof item.status==="string"&&item.status.trim()?item.status.trim():"不明";
  const summary=typeof item.summary==="string"&&item.summary.trim()?item.summary.trim():"(要約なし)";
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
    automationUi.status.textContent=automationState.lastError?`自動化エラー: ${automationState.lastError}`:"自動化ステータスを読み込み中です...";
    automationUi.history.innerHTML='<li class="automation-empty">ステータスを読み込み中です...</li>';
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
      ?`スケジューラ: 稼働中 / 間隔 ${scheduler.intervalSec}s / 次回 ${nextTick}`
      :"スケジューラ: 停止";
  }
  const modeKey=automationUi.batchMode?String(automationUi.batchMode.value||"mock"):"mock";
  const modeLabel=displayAutomationModeLabel(modeKey);
  const runCount=toArr(status.runs).length;
  let line=`バッチ API: ${status.batchPath} / 実行回数: ${runCount} / モード: ${modeLabel}`;
  if(automationState.lastError)line+=` / 最新エラー: ${automationState.lastError}`;
  automationUi.status.textContent=line;

  automationUi.history.innerHTML="";
  const rows=toArr(status.runs).slice(0,20);
  if(!rows.length){
    automationUi.history.innerHTML='<li class="automation-empty">バッチ履歴はまだありません。</li>';
    return;
  }
  rows.forEach((item)=>{
    const li=document.createElement("li");
    li.className=`automation-history-item ${item.status==="completed"?"ok":"ng"}`;
    const at=item.finishedAt||item.startedAt||Date.now();
    const summary=t1(item.summary||"(要約なし)",160);
    const tail=item.error?` / エラー: ${t1(item.error,120)}`:"";
    li.textContent=`${tt(at)} [${displayAutomationModeLabel(item.mode)}] ${displayAutomationRunStatusLabel(item.status)} ${item.runId} / ${summary}${tail}`;
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
async function chooseWorkspaceDirectory(){
  if(!controlApiAllows("select_workspace_directory"))throw new Error("このランタイムではワークスペース選択を使えません。");
  const token=controlApiToken();
  if(!token)throw new Error("control API token を取得できません。先にランタイムを更新してください。");
  const headerName=controlApiTokenHeader();
  const headers={"Content-Type":"application/json"};
  headers[headerName]=token;
  workspaceUiState.busy=true;
  renderWorkspaceScopeUi();
  try{
    const response=await fetch("/api/workspace/select",{
      method:"POST",
      headers,
      body:JSON.stringify({
        action:"select_workspace_directory",
        initialPath:selectedCwd(),
      }),
    });
    const parsed=parseJsonSafe(await response.text())||{};
    if(!response.ok||parsed.ok===false){
      const detail=parsed&&parsed.error?parsed.error:`HTTP ${response.status}`;
      throw new Error(detail);
    }
    if(parsed.cancelled)return false;
    const nextPath=typeof parsed.path==="string"?parsed.path.trim():"";
    if(!nextPath)return false;
    if(e.workspacePath)e.workspacePath.value=nextPath;
    if(parsed.workspaceGuard&&s.runtime&&typeof s.runtime==="object"){
      s.runtime.workspaceGuard=parsed.workspaceGuard;
      s.runtime.workspace_guard=parsed.workspaceGuard;
    }
    saveSettings();
    renderWorkspaceScopeUi();
    return true;
  }finally{
    workspaceUiState.busy=false;
    renderWorkspaceScopeUi();
  }
}
async function applyWorkspaceLock(shouldLock){
  const token=controlApiToken();
  if(!token)throw new Error("control API token を取得できません。先にランタイムを更新してください。");
  const headerName=controlApiTokenHeader();
  const headers={"Content-Type":"application/json"};
  headers[headerName]=token;
  const path=shouldLock?"/api/workspace/lock":"/api/workspace/unlock";
  const action=shouldLock?"lock_workspace_directory":"unlock_workspace_directory";
  const requestBody=shouldLock
    ? {action,path:selectedCwd()}
    : {action};
  workspaceUiState.busy=true;
  renderWorkspaceScopeUi();
  try{
    const response=await fetch(path,{
      method:"POST",
      headers,
      body:JSON.stringify(requestBody),
    });
    const parsed=parseJsonSafe(await response.text())||{};
    if(!response.ok||parsed.ok===false){
      const detail=parsed&&parsed.error?parsed.error:`HTTP ${response.status}`;
      throw new Error(detail);
    }
    if(parsed.workspaceGuard&&s.runtime&&typeof s.runtime==="object"){
      s.runtime.workspaceGuard=parsed.workspaceGuard;
      s.runtime.workspace_guard=parsed.workspaceGuard;
    }
    if(shouldLock&&e.workspacePath&&parsed.workspaceGuard&&typeof parsed.workspaceGuard.lockedRoot==="string"&&parsed.workspaceGuard.lockedRoot.trim()){
      e.workspacePath.value=parsed.workspaceGuard.lockedRoot.trim();
    }
    await loadRuntime();
    saveSettings();
    return parsed.workspaceGuard||null;
  }finally{
    workspaceUiState.busy=false;
    renderWorkspaceScopeUi();
  }
}
async function postIntentProfile(path,payload){
  const token=controlApiToken();
  if(!token)throw new Error("control API token を取得できません。先にランタイムを更新してください。");
  const headerName=controlApiTokenHeader();
  const headers={"Content-Type":"application/json"};
  headers[headerName]=token;
  const response=await fetch(path,{
    method:"POST",
    headers,
    body:JSON.stringify(payload||{}),
  });
  const parsed=parseJsonSafe(await response.text())||{};
  if(!response.ok||parsed.ok===false){
    const detail=parsed&&parsed.error?parsed.error:`HTTP ${response.status}`;
    throw new Error(detail);
  }
  if(parsed.intentFirst&&s.runtime&&typeof s.runtime==="object"){
    s.runtime.intentFirst=parsed.intentFirst;
    s.runtime.intent_first=parsed.intentFirst;
  }
  await loadRuntime();
  return parsed;
}
async function saveIntentProfile(){
  setIntentSaveState("保存中","waiting");
  try{
    await postIntentProfile("/api/intent/profile",{
      action:"update_intent_profile",
      profile:{
        label:e.intentLabelInput&&typeof e.intentLabelInput.value==="string"?e.intentLabelInput.value.trim():"",
        northStar:textareaListValue(e.intentNorthStarInput),
        benchmarkSites:textareaListValue(e.intentBenchmarkInput),
        benchmarkNotes:textareaListValue(e.intentBenchmarkNotesInput),
        prefers:textareaListValue(e.intentPrefersInput),
        rejects:textareaListValue(e.intentRejectsInput),
        requiredProof:textareaListValue(e.intentProofInput),
      },
    });
    setIntentSaveState("保存済み","connected");
    msg(s.active,"system","システム","Intent プロファイルを更新しました。");
  }catch(error){
    setIntentSaveState("失敗","disconnected");
    msg(s.active,"system","システム",`Intent プロファイルの更新に失敗しました: ${error&&error.message?error.message:"不明"}`);
  }
}
async function resetIntentProfile(){
  setIntentSaveState("初期化中","waiting");
  try{
    await postIntentProfile("/api/intent/profile/reset",{
      action:"reset_intent_profile",
    });
    setIntentSaveState("初期化済み","connected");
    msg(s.active,"system","システム","Intent プロファイルを初期値に戻しました。");
  }catch(error){
    setIntentSaveState("失敗","disconnected");
    msg(s.active,"system","システム",`Intent プロファイルの初期化に失敗しました: ${error&&error.message?error.message:"不明"}`);
  }
}
async function ensureIntentWorkspaceLockForPrompt(prompt){
  const intent=runtimeIntentFirst();
  if(!intent||!intent.workspaceLock||!intent.workspaceLock.autoLockRecommended)return true;
  const sensitive=isIntentSensitivePromptForUi(prompt);
  if(!sensitive||workspaceLockEnabled())return true;
  await applyWorkspaceLock(true);
  msg(s.active,"system","システム",`Intent-First 用に ${selectedCwd()} を固定しました。`);
  return true;
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
    automationState.lastError=error&&error.message?error.message:"不明";
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
      limitErrorLabel:"scheduler 更新に失敗しました",
    });
    await loadAutomationStatus({silent:true});
  }catch(error){
    automationState.lastError=error&&error.message?error.message:"スケジューラ更新に失敗しました";
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
    automationState.lastError="バッチ用プロンプトが空です";
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
      limitErrorLabel:"バッチ実行に失敗しました",
    });
    await loadAutomationStatus({silent:true});
    msg(s.active,"system","システム",`バッチを完了しました (${mode})`);
  }catch(error){
    automationState.lastError=error&&error.message?error.message:"バッチ実行に失敗しました";
    msg(s.active,"system","システム",`バッチ実行に失敗しました: ${automationState.lastError}`);
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
  const currentPending=pendingCountForChat(c.id);
  if(currentPending>0){
    msg(c.id,"system","システム","このチャットは実行中です。完了後に送信してください。");
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
  try{
    await ensureIntentWorkspaceLockForPrompt(prompt);
  }catch(error){
    msg(c.id,"system","システム",`Intent-First のワークスペース固定に失敗しました: ${error&&error.message?error.message:"不明"}`);
    return;
  }
  const dispatchDetail=composeDispatchDetail(prompt,imagePayloads);
  const shouldForceNewSession=Boolean(c.forceNewSession);
  c.h=createHarnessState();
  hset(c,"starting");
  hpush(c,"dispatch",dispatchDetail||"入力なし","running");
  if(c.id===s.active)renderHarness();
  msg(c.id,"user","あなた",composeUserMessage(prompt,imagePayloads));
  if(c.id===s.active){
    e.promptInput.value="";
    if(imagePayloads.length)clearAttachment();
  }
  const out=msg(c.id,"assistant","Codex","");
  if(!out)return;
  madd(out,`[待機] Standard Codex: 有効${imagePayloads.length?`（画像 ${imagePayloads.length} 枚を添付）`:""}\n`);
  const rid=`req-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const ctl=new AbortController();
  s.req.set(rid,{cid:c.id,agent:runAgent,at:Date.now(),controller:ctl});
  c.pending+=1;
  pending();
  live();
  syncRuntimePendingMonitor();
  trace("dispatch",runAgent,dispatchDetail||"入力なし",c.id);
  let ttype="completed",tdetail="完了",finalApplied=false;
  try{
    const selectedApproval=typeof e.approvalPolicy.value==="string"&&e.approvalPolicy.value?e.approvalPolicy.value:"never";
    const selectedSandbox=typeof e.sandboxMode.value==="string"&&e.sandboxMode.value?e.sandboxMode.value:"danger-full-access";
    const selectedWebSearch=Boolean(e.webSearch&&e.webSearch.checked);
    const selectedModel=selectedExecModel();
    const selectedModelReasoningEffort=selectedExecModelReasoningEffort();
    const requestPayload={
      prompt,
      sandboxMode:selectedSandbox,
      approvalPolicy:selectedApproval,
      webSearch:selectedWebSearch,
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
    const token=controlApiToken();
    if(!token)throw new Error("control API token を取得できません。先にランタイムを更新してください。");
    const headerName=controlApiTokenHeader();
    const headers={"Content-Type":"application/json"};
    headers[headerName]=token;
    const r=await fetch("/api/exec",{method:"POST",headers,body:JSON.stringify(requestPayload),signal:ctl.signal});
    if(!r.ok||!r.body){const body=await r.text();ttype="failed";tdetail=`HTTP ${r.status} ${t1(body,90)}`;mset(out,`[エラー] ${r.status} ${body}`);hset(c,"failed");hpush(c,"http/error",tdetail,"failed");renderHarness();return}
    c.forceNewSession=false;
    scheduleSaveChatState();
    trace("streaming",runAgent,"ストリーム開始",c.id);
    hset(c,"running");
    hpush(c,"stream/open","NDJSON ストリーム接続完了","running");
    renderHarness();
    mset(out,"");
    const reader=r.body.getReader();
    const decoder=new TextDecoder();
    let buf="";
    const apply=ev=>{if(!ev||typeof ev!=="object"||typeof ev.type!=="string")return false;if(ev.type==="delta"){if(typeof ev.text==="string"&&ev.text)madd(out,ev.text);return true}if(ev.type==="final"){mset(out,typeof ev.text==="string"?ev.text:"");finalApplied=true;return true}if(ev.type==="error"){const t=typeof ev.text==="string"?ev.text:"";if(t){if(finalApplied)madd(out,`\n${t}\n`);else mset(out,t);ttype="failed";tdetail=t1(t,120);hset(c,"failed");hpush(c,"stream/error",tdetail,"failed");renderHarness()}return true}if(ev.type==="status"){const st=String(ev.status||"");if(st==="failed"){ttype="failed";if(tdetail==="完了")tdetail="ステータス=失敗"}else if(st==="interrupted"){ttype="aborted";tdetail="ステータス=中断"}hset(c,st||"completed");renderHarness();return true}if(["turn","item","activity","plan","tokenUsage","diff"].includes(ev.type)){happly(c,ev);renderHarness();return true}return false};
    const onLine=line=>{const t=String(line||"").trim();if(!t)return;try{const p=JSON.parse(t);if(apply(p))return}catch(_e){}madd(out,line.endsWith("\n")?line:`${line}\n`)};
    const flush=(chunk,force=false)=>{if(chunk)buf+=chunk;while(true){const i=buf.indexOf("\n");if(i<0)break;const line=buf.slice(0,i);buf=buf.slice(i+1);onLine(line)}if(force&&buf.length){onLine(buf);buf=""}};
    while(true){const{value,done}=await reader.read();if(done)break;flush(decoder.decode(value,{stream:true}))}
    flush(decoder.decode(),true)
  }catch(err){if(err&&err.name==="AbortError"){ttype="aborted";tdetail="ユーザー中断";madd(out,"\n[ユーザーが中断しました]\n");hset(c,"interrupted");hpush(c,"turn/interrupt","ユーザー中断","failed");renderHarness();return}ttype="failed";tdetail=err&&err.message?err.message:"ランタイムエラー";hset(c,"failed");hpush(c,"turn/error",t1(tdetail,180),"failed");renderHarness();throw err}finally{s.req.delete(rid);c.pending=Math.max(0,c.pending-1);syncRuntimePendingMonitor();if(ttype==="completed")hset(c,"completed");else if(ttype==="failed")hset(c,"failed");else if(ttype==="aborted")hset(c,"interrupted");hpush(c,"turn/end",t1(tdetail,180),ttype==="failed"?"failed":"info");s.last={type:ttype,detail:tdetail,at:Date.now(),agent:runAgent,chat:c.title,cid:c.id};trace(ttype,runAgent,tdetail,c.id);refresh();if(s.req.size===0){try{await loadRuntime()}catch(_e){e.connectionState.textContent="未接続";e.connectionState.classList.remove("connected");e.connectionState.classList.add("disconnected")}}scheduleSaveChatState();updateSearchDiag()}
}
function renderCommands(q=""){e.commandGrid.innerHTML="";const qq=q.trim().toLowerCase();const list=COMMANDS.filter(c=>!qq||c.toLowerCase().includes(qq));if(!list.length){e.commandGrid.innerHTML='<article class="command-empty">一致するコマンドはありません。</article>';return}list.forEach(cmd=>{const f=e.commandTemplate.content.cloneNode(true);f.querySelector(".command-text").textContent=cmd;const b=f.querySelector(".command-badge");b.textContent="local";b.classList.add("local");f.querySelector(".command-desc").textContent="すぐに挿入または実行できます。";f.querySelector(".insert-btn").onclick=()=>{const cur=e.promptInput.value,p=cur&&!cur.endsWith("\n")?"\n":"";e.promptInput.value=`${cur}${p}${cmd} `;e.promptInput.focus()};f.querySelector(".run-btn").onclick=async()=>{e.promptInput.value=cmd;await runPrompt(e.promptInput.value,s.active).catch(er=>msg(s.active,"system","システム",`送信に失敗しました: ${er&&er.message?er.message:"不明"}`))};e.commandGrid.appendChild(f)})}
function clearChat(){const c=active();if(!c)return;c.messages=[];c.h=createHarnessState();c.forceNewSession=true;s.trace=s.trace.filter((item)=>item&&item.cid!==c.id);if(s.last&&s.last.cid===c.id)s.last=null;scheduleSaveChatState();refresh()}
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
    const fallback=mkChat({title:"チャット 1",agent:DEFAULT_AGENT_NAME});
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
async function stop(){
  const c=active();
  if(!c)return;
  const currentPending=pendingCountForChat(c.id);
  if(currentPending===0)return;
  const localRows=[...s.req.values()].filter((row)=>row&&row.cid===c.id);
  const interruptTarget=resolveInterruptTargetForChat(c);
  let interruptRequested=false;
  let interruptDetail="";
  if(interruptTarget){
    try{
      const interruptResult=await requestTurnInterrupt(interruptTarget);
      interruptRequested=Boolean(interruptResult&&interruptResult.ok);
      if(interruptResult&&interruptResult.target&&typeof interruptResult.target.turnId==="string"&&interruptResult.target.turnId){
        interruptDetail=`ターン=${interruptResult.target.turnId}`;
      }
    }catch(error){
      interruptDetail=error&&error.message?error.message:"中断要求に失敗しました";
    }
  }
  let abortedCount=0;
  localRows.forEach((row)=>{
    try{
      row.controller.abort();
      abortedCount+=1;
    }catch{
    }
  });
  if(interruptRequested){
    msg(c.id,"system","システム",`${displayAgentNameForUi(c.agent,{includeScope:true})||"現在の実行"} に停止要求を送りました${interruptDetail?` (${interruptDetail})`:""}。`);
  }else if(abortedCount>0&&interruptDetail){
    msg(c.id,"system","システム",`ローカルストリームを中断しました。停止要求は失敗しました: ${interruptDetail}`);
  }else if(abortedCount>0){
    msg(c.id,"system","システム","ランタイムのターン情報が出る前にローカルストリームを中断しました。");
  }else if(interruptDetail){
    msg(c.id,"system","システム",`停止に失敗しました: ${interruptDetail}`);
  }
  try{
    await loadRuntime({reconcilePending:true});
  }catch(_e){
  }
}
function bind(){
  e.sendBtn.onclick=()=>runPrompt(e.promptInput.value,s.active,{attachments:composerAttachment.items.map((item)=>item.file)}).catch(er=>msg(s.active,"system","システム",`送信に失敗しました: ${er&&er.message?er.message:"不明"}`));
  e.stopBtn.onclick=stop;
  e.newThreadBtn.onclick=clearChat;
  if(e.deleteChatBtn)e.deleteChatBtn.onclick=()=>deleteChat();
  if(e.imageAttachBtn)e.imageAttachBtn.onclick=()=>{clearAttachmentError();if(e.imageInput)e.imageInput.click();};
  if(e.imageInput)e.imageInput.onchange=()=>{const files=e.imageInput&&e.imageInput.files?e.imageInput.files:[];handleAttachmentPickFiles(files);};
  if(e.imageRemoveBtn)e.imageRemoveBtn.onclick=()=>removeAttachmentFromComposer();
  if(e.openCmdBtn)e.openCmdBtn.onclick=async()=>{
    try{
      if(!controlApiAllows("open_workspace_shell")){
        msg(s.active,"system","システム","ランタイムポリシーにより Open CMD は無効です。");
        return;
      }
      const token=controlApiToken();
      if(!token)throw new Error("control API token を取得できません。先にランタイムを更新してください。");
      const headerName=controlApiTokenHeader();
      const headers={"Content-Type":"application/json"};
      headers[headerName]=token;
      const response=await fetch("/api/open-cmd",{method:"POST",headers,body:JSON.stringify({action:"open_workspace_shell",cwd:selectedCwd()})});
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
      msg(s.active,"system","システム","新しい CMD ウィンドウを開きました。");
    }catch(er){
      msg(s.active,"system","システム",`CMD を開けませんでした: ${er&&er.message?er.message:"不明"}`);
    }
  };
  if(e.workspaceBrowseBtn)e.workspaceBrowseBtn.onclick=()=>chooseWorkspaceDirectory()
    .then(changed=>{if(changed)msg(s.active,"system","システム",`ワークスペースを選択しました: ${selectedCwd()}`);})
    .catch(er=>msg(s.active,"system","システム",`ワークスペース選択に失敗しました: ${er&&er.message?er.message:"不明"}`));
  e.reconnectBtn.onclick=async()=>{try{await loadRuntime();msg(s.active,"system","システム","ランタイムを更新しました。")}catch(er){e.connectionState.textContent="未接続";e.connectionState.classList.remove("connected");e.connectionState.classList.add("disconnected");msg(s.active,"system","システム",`再接続に失敗しました: ${er&&er.message?er.message:"不明"}`)}};
  e.refreshDiagBtn.onclick=async()=>{try{await loadDiag();msg(s.active,"system","システム","診断情報を更新しました。")}catch(er){msg(s.active,"system","システム",`診断情報の更新に失敗しました: ${er&&er.message?er.message:"不明"}`)}};
  e.newChatBtn.onclick=()=>{const c=mkChat({agent:DEFAULT_AGENT_NAME,forceNewSession:true});s.active=c.id;refresh()};
  e.clearAgentTraceBtn.onclick=()=>{const c=active();if(!c){s.trace=[];s.last=null;flow();return;}s.trace=s.trace.filter((item)=>item&&item.cid!==c.id);if(s.last&&s.last.cid===c.id)s.last=null;flow();msg(s.active,"system","システム","現在のチャットのトレースを消去しました。")};
  if(e.agentTopographyRefreshBtn)e.agentTopographyRefreshBtn.onclick=()=>loadAgentTopography({manual:true}).catch(()=>{});
  if(e.agentTopographyToggleBtn)e.agentTopographyToggleBtn.onclick=()=>setTopographyCollapsed(!topographyState.collapsed);
  if(e.intentSaveBtn)e.intentSaveBtn.onclick=()=>saveIntentProfile().catch(()=>{});
  if(e.intentResetBtn)e.intentResetBtn.onclick=()=>resetIntentProfile().catch(()=>{});
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
    e.promptInput.addEventListener("paste",handlePromptPaste);
  }
  document.querySelectorAll("[data-preset]").forEach(btn=>btn.onclick=()=>{e.promptInput.value=btn.getAttribute("data-preset")||"";e.sendBtn.click()});
  if(e.commandFilter)e.commandFilter.oninput=()=>renderCommands(e.commandFilter.value);
  e.executionProfile.onchange=()=>{
    if(e.executionProfile.value==="custom"){saveSettings();return}
    const p=PROFILES[e.executionProfile.value];
    if(!p)return;
    e.approvalPolicy.value=p.approvalPolicy;
    e.sandboxMode.value=p.sandboxMode;
    e.webSearch.checked=Boolean(p.webSearch);
    saveSettings();
    updateSearchDiag();
    msg(s.active,"system","システム",`プロファイルを適用しました: ${e.executionProfile.value}`);
  };
  [e.approvalPolicy,e.sandboxMode,e.webSearch].forEach(x=>x.onchange=()=>{profileSync();saveSettings();updateSearchDiag()});
  if(e.modelName)e.modelName.onchange=()=>{const normalizedModel=normalizeExecModelNameForUi(e.modelName.value,runtimeDefaultExecModel());e.modelName.value=ensureExecModelOptionForUi(normalizedModel)||normalizedModel;settingsState.hasStoredModel=true;saveSettings();};
  if(e.modelReasoningEffort)e.modelReasoningEffort.onchange=()=>{e.modelReasoningEffort.value=normalizeExecModelReasoningEffortForUi(e.modelReasoningEffort.value,runtimeDefaultExecModelReasoningEffort());settingsState.hasStoredModelReasoningEffort=true;saveSettings();};
  e.workspacePath.onchange=()=>{saveSettings();renderWorkspaceScopeUi();};
  if(e.workspaceLockEnabled)e.workspaceLockEnabled.onchange=async()=>{
    const shouldLock=Boolean(e.workspaceLockEnabled.checked);
    const previousLocked=workspaceLockEnabled();
    if(shouldLock===previousLocked){renderWorkspaceScopeUi();return;}
    e.workspaceLockEnabled.disabled=true;
    try{
      const snapshot=await applyWorkspaceLock(shouldLock);
      const notice=shouldLock&&snapshot&&typeof snapshot.lockedRoot==="string"&&snapshot.lockedRoot.trim()
        ?`ワークスペースを固定しました: ${snapshot.lockedRoot.trim()}`
        :"ワークスペース固定を解除しました。";
      if(notice!==settingsState.lastWorkspaceLockNotice){
        settingsState.lastWorkspaceLockNotice=notice;
        msg(s.active,"system","システム",notice);
      }
    }catch(er){
      msg(s.active,"system","システム",`ワークスペース固定の更新に失敗しました: ${er&&er.message?er.message:"不明"}`);
    }finally{
      e.workspaceLockEnabled.disabled=false;
      renderWorkspaceScopeUi();
    }
  };
  if(e.uiVisibility)e.uiVisibility.onchange=()=>{document.body.classList.toggle("telemetry-off",!e.uiVisibility.checked);saveSettings();};
  e.simpleViewToggle.onclick=()=>{const n=!document.body.classList.contains("simple-view");document.body.classList.toggle("simple-view",n);e.simpleViewToggle.textContent=n?"詳細を表示":"簡易表示";saveSettings()};
}
async function boot(){
  loadSettings();
  loadHarnessCheckMode();
  loadTopographyUiState();
  loadChatState();
  bind();
  renderCommands();
  renderAttachmentUi();
  renderAgentTopography();
  if(!s.chats.length)mkChat({title:"チャット 1",agent:DEFAULT_AGENT_NAME});
  if(!chat(s.active))s.active=s.chats[0].id;
  refresh();
  e.modeState.textContent="モード";
  e.connectionState.textContent="未接続";
  e.connectionState.classList.add("disconnected");
  try{
    await loadRuntime();
  }catch(error){
    msg(s.active,"system","システム",`ランタイム確認に失敗しました: ${error&&error.message?error.message:"不明"}`);
  }
  try{
    await loadDiag();
  }catch(error){
    msg(s.active,"system","システム",`診断確認に失敗しました: ${error&&error.message?error.message:"不明"}`);
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
      msg(s.active,"system","システム","準備完了です。Standard Codex: 有効");
    }
  }
}
window.addEventListener("beforeunload",()=>{if(s.ticker!==null){clearInterval(s.ticker);s.ticker=null}stopRuntimePendingSyncTicker();stopAgentTopographyTicker();stopAutomationStatusTicker();revokeAttachmentPreview();flushSaveChatState();});
boot();



