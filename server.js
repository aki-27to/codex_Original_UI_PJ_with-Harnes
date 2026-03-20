const http=require("http");
const https=require("https");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const zlib=require("zlib");
const {EventEmitter}=require("events");
const {spawn,spawnSync}=require("child_process");
const {runBatchJob,getRunnerCapabilities}=require("./scripts/poc_batch_runner");
const {buildMockFixtureScenario}=require("./scripts/lib/mock_app_server_fixture");
const {normalizeRequestUserInputPolicy,resolveNonInteractiveUserInput}=require("./scripts/lib/request_user_input_policy");
const {
  evaluateAgentGovernance,
  getAgentGovernancePolicySnapshot,
  normalizeOverrideRequest,
  summarizeAgentGovernance,
}=require("./scripts/lib/agent_governance_policy");
const {
  defaultOutcomesPath:defaultSkillOutcomesPath,
  evaluateSkillPortfolio,
  loadSkillCatalog,
  loadSkillPortfolioPolicy,
  parseOutcomeEventsFromJsonl,
}=require("./scripts/lib/skill_portfolio_policy");
const {defaultPromptCharLimit,buildPromptAudit,evaluateImagePayloadBudget,formatBytes}=require("./scripts/lib/exec_payload_policy");
const {buildAdversarialShadowReview,shadowReviewVersion}=require("./scripts/lib/adversarial_shadow_policy");
const {buildAdversarialRetryPrompt,shouldRetryAdversarialLoop}=require("./scripts/lib/adversarial_loop_policy");
const {stripUnsolicitedClosingProposal}=require("./scripts/lib/user_facing_response_policy");
const {
  defaultUserFacingResponseContractPath,
  loadUserFacingResponseContract,
  summarizeUserFacingResponseContract,
}=require("./scripts/lib/user_facing_response_contract");
const {
  buildParentDispatchGuardRetryPrompt,
  buildParentDispatchGuardRuntimeSnapshot,
  evaluateParentDispatchGuard,
  normalizeParentDispatchGuardMode,
}=require("./scripts/lib/parent_dispatch_guard_policy");
const {
}=require("./scripts/lib/logging_surface");
const {
  conversationModeValues,
  defaultConversationMode:defaultConversationModeValue,
  defaultPersonaUserId:defaultPersonaUserIdValue,
  normalizeConversationMode:normalizeConversationModePolicy,
  normalizePersonaUserId:normalizePersonaUserIdPolicy,
  createDefaultPersonaMemoryStore,
  normalizePersonaMemoryStore,
  ensurePersonaMemoryRecord,
  applyPersonaMemoryUpdate,
  selectPersonaMemoryContext,
  buildConversationPromptSections,
}=require("./scripts/lib/conversation_persona_policy");
const {
  defaultEvalSuitePath,
  normalizeEvalSuite,
  loadEvalSuiteFromFile,
  summarizeEvalCaseResult,
  buildEvalRunSummary,
  compareEvalRuns,
}=require("./scripts/lib/eval_harness_policy");
const {
  defaultHarnessTurnContractSpecPath,
  loadHarnessTurnContractSpec,
  validateReleaseDecisionState,
  validateTurnTransition,
  validateTurnTerminalContract,
  validateTurnTaskOutcomeContract,
}=require("./scripts/lib/harness_contract_policy");
const {
  defaultTaskOutcomeContractPath,
  deriveTaskOutcome,
  loadTaskOutcomeContract,
  summarizeTaskOutcomeContract,
  validateTaskOutcomeTurnCompatibility,
}=require("./scripts/lib/task_outcome_policy");
const {
  buildGitAutomationConfig,
  captureGitRepoState,
  runGitAutomationForTurn,
}=require("./scripts/lib/git_automation");
const {
  getRequirementRbjConfig,
  resolveRequirementRbjState,
}=require("./scripts/lib/requirement_rbj_policy");
const {
  buildPlanningArtifacts,
  defaultAssuranceModeContractPath,
  defaultDispatchPlanSchemaPath,
  defaultPlanningDecisionContractSchemaPath,
  defaultPlanningModeContractPath,
  defaultRequirementContractSchemaPath,
  defaultTaskFamilyProfilesPath,
  loadAssuranceModeContract,
  loadPlanningModeContract,
  loadTaskFamilyProfilesContract,
  normalizeAssuranceMode,
  normalizePlanningModeContract,
  sanitizePlanningArtifactsForRuntime,
}=require("./scripts/lib/planning_mode_policy");
const {
  defaultDesignAcceptanceContractPath,
  defaultTasteMemorySeedPath,
  isDesignSensitiveRequest,
  loadDesignAcceptanceContract,
  loadUserTasteMemoryStore,
  normalizeUserTasteMemoryStore,
  persistUserTasteMemoryStore,
  requiresWorkspaceLockForSource,
  summarizeIntentFirstRuntime,
}=require("./scripts/lib/intent_first_policy");
const {
  evaluateFamilyCompletion,
}=require("./scripts/lib/family_completion_policy");
const {
  shouldAutoInterruptForDiscoveryNeedsInput,
}=require("./scripts/lib/discovery_needs_input_policy");
const {
  buildOperatorPlanEvent,
}=require("./scripts/lib/operator_plan_surface");
const {
  buildConformanceReport,
  buildOperatorViewSummary,
  buildReleaseDecision,
  buildReviewBundle,
  buildRoutingDecision,
  buildTaskOutcomesArtifact,
  loadConfigJson:loadConstitutionConfigJson,
}=require("./scripts/lib/constitution_conformance");
const {
  defaultPiperModelId,
  preparePiperModel,
  speakWithPiper,
  getPiperRuntimeSnapshot,
}=require("./scripts/lib/piper_voice_runtime");
const {
  ensureDir:ensureLoggingSurfaceDir,
  writeJson:writeLoggingSurfaceJson,
  readJson:readLoggingSurfaceJson,
  getLoggingSurfacePaths,
  repoRelative:repoRelativePath,
}=require("./scripts/lib/logging_surface");

const workspaceRoot=__dirname;
const workspaceParentRoot=path.dirname(workspaceRoot);
const webRoot=path.join(workspaceRoot,"web");
const bundledEnglishConversationAppRoot=path.join(webRoot,"english-conversation-app");
const defaultExternalEnglishConversationAppRoot=path.join(workspaceParentRoot,"english-conversation-app");
const loggingSurfacePaths=getLoggingSurfacePaths(workspaceRoot);
const userHomeDir=process.env.USERPROFILE||process.env.HOME||"";
const apiVersion=4;
const forcedUiPort=Number(process.env.CODEX_UI_PORT||"57525");
const autoOpenBrowser=parseBooleanEnv("CODEX_AUTO_OPEN_BROWSER",false);
const autoOpenPath=normalizeAutoOpenPath(process.env.CODEX_AUTO_OPEN_PATH||"");
const edgeExecutablePath=resolveEdgeExecutable();
const openCmdWindowEnabled=parseBooleanEnv("CODEX_ALLOW_OPEN_CMD_WINDOW",false);
const sessionIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedApprovalPolicies=new Set(["untrusted","on-failure","on-request","never"]);
const allowedSandboxModes=new Set(["read-only","workspace-write","danger-full-access"]);
const allowedModelReasoningEfforts=new Set(["minimal","low","medium","high","xhigh"]);
const riskRulesVersion="2026-02-22.r1";
const approvalRiskRuleIds=Object.freeze({
  commandDestructiveDelete:"cmd.destructive_delete",
  commandRemoteFetchPipeExec:"cmd.remote_fetch_pipe_exec",
  commandDiskOperation:"cmd.disk_operation",
  commandSystemControl:"cmd.system_control",
  commandRetryHint:"cmd.retry_hint",
  commandDangerSandboxBaseline:"cmd.danger_sandbox_baseline",
  commandDangerSandboxRetryEscalation:"cmd.danger_sandbox_retry_escalation",
  fileDeleteChange:"file.delete_change",
  fileOutsideWorkspace:"file.outside_workspace_change",
  fileBulkChange:"file.bulk_change",
  fileMultiChange:"file.multi_change",
  fileDangerSandboxBaseline:"file.danger_sandbox_baseline",
  genericDangerSandboxBaseline:"generic.danger_sandbox_baseline",
});
const requestUserInputPolicyEnvKey="CODEX_REQUEST_USER_INPUT_POLICY";
const automaticApprovalReviewEnvKey="CODEX_AUTOMATIC_APPROVAL_REVIEW";
const fastModeDefaultEnvKey="CODEX_FAST_MODE_DEFAULT";
const nonInteractiveRequestUserInputPolicy=normalizeRequestUserInputPolicy(process.env[requestUserInputPolicyEnvKey],"blocked");
const automaticApprovalReviewDefault=parseBooleanEnv(automaticApprovalReviewEnvKey,true);
const fastModeDefault=parseBooleanEnv(fastModeDefaultEnvKey,false);
const gitAutomationConfig=buildGitAutomationConfig(process.env);
const gitAutomationWorkspaceIgnoredPaths=Object.freeze([
  "logs/archive/raw/harness_execution_memory.json",
  "logs/archive/raw/eval_runs.jsonl",
  "logs/archive/raw/runtime_state/conversation_persona_memory.json",
  "logs/archive/raw/runtime_state/intent_profile_memory.json",
]);
function normalizeConfiguredAgentName(value,fallback){
  const raw=typeof value==="string"?value.trim():"";
  if(raw)return raw.slice(0,120);
  const fb=typeof fallback==="string"?fallback.trim():"";
  return fb?fb.slice(0,120):"default";
}
function normalizeExecutionProfile(value,fallback="standard"){
  const raw=typeof value==="string"?value.trim().toLowerCase():"";
  const normalized=raw.replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  if(normalized)return normalized.slice(0,60);
  const fb=typeof fallback==="string"?fallback.trim().toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,""):"";
  return fb?fb.slice(0,60):"standard";
}
function normalizeExecutionIntent(value,fallback="interactive"){
  const raw=typeof value==="string"?value.trim().toLowerCase():"";
  const normalized=raw.replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  if(normalized)return normalized.slice(0,80);
  const fb=typeof fallback==="string"?fallback.trim().toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,""):"";
  return fb?fb.slice(0,80):"interactive";
}
function isSmokeExecutionProfile(value){
  const profile=normalizeExecutionProfile(value,"standard");
  return profile.includes("smoke")||profile.includes("test")||profile.includes("ci");
}
function isReproExecutionProfile(value){
  const profile=normalizeExecutionProfile(value,"standard");
  return profile==="repro"||profile.startsWith("repro-")||profile.includes(".repro");
}
const defaultExecAgentName=normalizeConfiguredAgentName(process.env.CODEX_DEFAULT_EXEC_AGENT,"default");
const executionProfileEnvKey="CODEX_EXECUTION_PROFILE";
const runtimeExecutionProfile=normalizeExecutionProfile(process.env[executionProfileEnvKey],"standard");
const codexConfigPath=path.join(workspaceRoot,".codex","config.toml");
const userCodexConfigPath=userHomeDir?path.join(userHomeDir,".codex","config.toml"):"";
const defaultExecModelFallbackName="gpt-5.4";
const defaultExecModelReasoningEffortFallback="xhigh";
const legacyExecModelAliases=Object.freeze({
  "codex-5.3":"gpt-5.3-codex",
});
const parentAgentNames=new Set(["default","intake","release_manager"]);
const parentDispatchGuardModeEnvKey="CODEX_PARENT_DISPATCH_GUARD_MODE";
const parentDispatchGuardMaxRetriesEnvKey="CODEX_PARENT_DISPATCH_GUARD_MAX_RETRIES";
const parentDispatchGuardMode=normalizeParentDispatchGuardMode(process.env[parentDispatchGuardModeEnvKey],"enforce");
const parentDispatchGuardMaxRetries=parsePositiveIntEnv(parentDispatchGuardMaxRetriesEnvKey,1,0,6);
const requirementGuardOriginalRequirement="?????3?????";
const requirementGuardExtensionConfig=Object.freeze({
  id:"3",
  status:"temporary",
  defaultEnabled:false,
  envFlag:"CODEX_REQUIREMENT_GUARD_ENABLED",
  moduleRelativePath:"scripts/extensions/requirement_guard_hook.js",
});
const requirementGuardMatcherDefaults=Object.freeze({
  configKey:"requirement_guard.match_value",
  envKey:"REQUIREMENT_GUARD_MATCH_VALUE",
  defaultValue:3,
  inputKey:"input_value",
});
const defaultWindowsCodexCmd=process.env.APPDATA?path.join(process.env.APPDATA,"npm","codex.cmd"):"codex.cmd";
const defaultExecModelName=resolveConfiguredDefaultExecModelName();
const defaultExecModelReasoningEffort=resolveConfiguredDefaultExecModelReasoningEffort();
const defaultExecModelReasoningEffortConfig=`model_reasoning_effort="${defaultExecModelReasoningEffort}"`;
const defaultExperimentalFeatures=Object.freeze(["fast_mode","guardian_approval"]);
const fastModeFeatureName="fast_mode";
const automaticApprovalReviewFeatureName="guardian_approval";
const defaultCodexServiceTier=defaultExperimentalFeatures.includes(fastModeFeatureName)?"fast":"flex";
const nonFastEffectiveServiceTier="auto";
const allowedCodexServiceTiers=new Set(["flex","fast"]);
function normalizeCodexServiceTier(value,fallback=defaultCodexServiceTier){
  const normalized=typeof value==="string"?value.trim().toLowerCase():"";
  if(allowedCodexServiceTiers.has(normalized))return normalized;
  return fallback;
}
const defaultRequestBodyLimitBytes=2*1024*1024;
const execRequestBodyLimitBytes=24*1024*1024;
const maxChatImageBytes=10*1024*1024;
const execRequestBodyHeadroomBytes=2*1024*1024;
const maxChatImageAggregateEncodedBytes=Math.max(1024*1024,execRequestBodyLimitBytes-execRequestBodyHeadroomBytes);
const maxChatImageAggregateBytes=Math.max(maxChatImageBytes,Math.floor(maxChatImageAggregateEncodedBytes*3/4));
const imageMimeByExtension={".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".gif":"image/gif"};
const allowedChatImageMimeTypes=new Set(Object.values(imageMimeByExtension));
const allowedChatImageExtensions=new Set(Object.keys(imageMimeByExtension));
const controlApiTokenHeaderName="x-codex-control-token";
const controlApiActionAllowlist=openCmdWindowEnabled
  ? new Set(["open_workspace_shell"])
  : new Set();
const execApiRequiredContentType="application/json";
const conversationApiRequiredContentType="application/json";
const conversationRequestBodyLimitBytes=parsePositiveIntEnv("CODEX_CONVERSATION_REQUEST_BODY_LIMIT_BYTES",256*1024,8*1024,2*1024*1024);
const conversationRequestTimeoutMs=parsePositiveIntEnv("CODEX_CONVERSATION_REQUEST_TIMEOUT_MS",45000,3000,120000);
const conversationDefaultMaxTokens=parsePositiveIntEnv("CODEX_CONVERSATION_MAX_TOKENS",220,64,1200);
const piperVoiceRequestBodyLimitBytes=parsePositiveIntEnv("CODEX_PIPER_REQUEST_BODY_LIMIT_BYTES",256*1024,8*1024,2*1024*1024);
const kokoroVoiceRequestBodyLimitBytes=parsePositiveIntEnv("CODEX_KOKORO_REQUEST_BODY_LIMIT_BYTES",256*1024,8*1024,2*1024*1024);
const kokoroVoiceRequestTimeoutMs=parsePositiveIntEnv("CODEX_KOKORO_REQUEST_TIMEOUT_MS",45000,3000,120000);
const kokoroVoiceServiceBaseUrl=normalizeKokoroServiceBaseUrl(process.env.CODEX_KOKORO_API_BASE_URL||"http://127.0.0.1:8880");
const kokoroDefaultModel=safeString(process.env.CODEX_KOKORO_DEFAULT_MODEL,80)||"kokoro";
const kokoroDefaultVoice=safeString(process.env.CODEX_KOKORO_DEFAULT_VOICE,80)||"af_heart";
const kokoroDefaultLangCode=safeString(process.env.CODEX_KOKORO_DEFAULT_LANG_CODE,8)||"a";
const execIdempotencyTtlMs=parsePositiveIntEnv("CODEX_EXEC_IDEMPOTENCY_TTL_MS",30*60*1000,30*1000,24*60*60*1000);
const harnessMemorySchema="harness-execution-memory.v1";
const harnessMemoryPathEnvKey="CODEX_HARNESS_MEMORY_PATH";
const harnessMemoryPath=resolveWorkspaceScopedPathOverride(
  harnessMemoryPathEnvKey,
  loggingSurfacePaths.harnessMemoryPath
);
const harnessMemoryRetentionDays=parsePositiveIntEnv("CODEX_HARNESS_MEMORY_RETENTION_DAYS",30,1,365);
const harnessMemoryMaxContractRecords=parsePositiveIntEnv("CODEX_HARNESS_MEMORY_MAX_CONTRACT_RECORDS",5000,200,50000);
const harnessMemoryMaxExecutionRecords=parsePositiveIntEnv("CODEX_HARNESS_MEMORY_MAX_EXECUTION_RECORDS",5000,200,50000);
const harnessMemoryMaxAuditRecords=parsePositiveIntEnv("CODEX_HARNESS_MEMORY_MAX_AUDIT_RECORDS",5000,200,50000);
const harnessMemoryMaxPatternRecords=parsePositiveIntEnv("CODEX_HARNESS_MEMORY_MAX_PATTERN_RECORDS",800,80,10000);
const harnessMemoryMaxReplayRecords=parsePositiveIntEnv("CODEX_HARNESS_MEMORY_MAX_REPLAY_RECORDS",5000,200,50000);
const replayPromptMaxChars=parsePositiveIntEnv("CODEX_REPLAY_PROMPT_MAX_CHARS",12000,500,24000);
const replayOutputSnapshotMaxChars=parsePositiveIntEnv("CODEX_REPLAY_OUTPUT_SNAPSHOT_MAX_CHARS",8000,200,24000);
const evalSuiteConfigPath=path.join(workspaceRoot,"scripts","config","eval_suite_default.json");
const evalRunHistoryPathEnvKey="CODEX_EVAL_HISTORY_PATH";
const evalRunHistoryPath=resolveWorkspaceScopedPathOverride(
  evalRunHistoryPathEnvKey,
  loggingSurfacePaths.evalHistoryPath
);
const runtimeProofsRoot=loggingSurfacePaths.proofBundlesRoot;
const signoffBundlesRoot=loggingSurfacePaths.signoffBundlesRoot;
const replayBundlesRoot=loggingSurfacePaths.replayBundlesRoot;
const evalRunHistoryMaxLines=parsePositiveIntEnv("CODEX_EVAL_HISTORY_MAX_LINES",500,50,10000);
const evalCaseTimeoutMs=parsePositiveIntEnv("CODEX_EVAL_CASE_TIMEOUT_MS",180000,30000,900000);
const evalMaxCases=parsePositiveIntEnv("CODEX_EVAL_MAX_CASES",12,1,120);
const evalDefaultMaxVariants=parsePositiveIntEnv("CODEX_EVAL_MAX_VARIANTS",3,1,6);
const sloWindowTurns=parsePositiveIntEnv("CODEX_SLO_WINDOW_TURNS",30,5,500);
const sloLatencyP95MaxMs=parsePositiveIntEnv("CODEX_SLO_P95_LATENCY_MAX_MS",120000,5000,900000);
const sloFailureRateMax=Number(parseRateEnv("CODEX_SLO_FAILURE_RATE_MAX","0.25",0,1).toFixed(4));
const sloIdempotencyConflictRateMax=Number(parseRateEnv("CODEX_SLO_IDEMPOTENCY_CONFLICT_RATE_MAX","0.05",0,1).toFixed(4));
const harnessTurnContractSpecPath=path.join(workspaceRoot,"scripts","config","harness_contract_spec.json");
const taskOutcomeContractPath=path.join(workspaceRoot,"scripts","config","task_outcome_contract.json");
const userFacingResponseContractPath=defaultUserFacingResponseContractPath;
const planningModeContractPath=path.join(workspaceRoot,"scripts","config","planning_mode_contract.json");
const assuranceModeContractPath=path.join(workspaceRoot,"scripts","config","assurance_depth_contract.json");
const taskFamilyProfilesPath=path.join(workspaceRoot,"scripts","config","task_family_profiles.json");
const designAcceptanceContractPath=defaultDesignAcceptanceContractPath;
const userFacingResponseContract=loadUserFacingResponseContract(userFacingResponseContractPath);
const tasteMemorySeedPath=defaultTasteMemorySeedPath;
const tasteMemoryMemoryPath=path.join(loggingSurfacePaths.runtimeStateRoot,"intent_profile_memory.json");
const planningDecisionContractSchemaPath=path.join(workspaceRoot,"scripts","config","planning_decision_contract.schema.json");
const requirementContractSchemaPath=path.join(workspaceRoot,"scripts","config","requirement_contract.schema.json");
const dispatchPlanSchemaPath=path.join(workspaceRoot,"scripts","config","dispatch_plan.schema.json");
const requestFrameContractPath=path.join(workspaceRoot,"scripts","config","request_frame_contract.json");
const routingDecisionContractPath=path.join(workspaceRoot,"scripts","config","routing_decision_contract.json");
const discoveryOutcomeContractPath=path.join(workspaceRoot,"scripts","config","discovery_outcome_contract.json");
const reviewBundleContractPath=path.join(workspaceRoot,"scripts","config","review_bundle_contract.json");
const releaseDecisionContractPath=path.join(workspaceRoot,"scripts","config","release_decision_contract.json");
const conformanceInvariantsContractPath=path.join(workspaceRoot,"scripts","config","conformance_invariants.json");
const evidenceContractMachinePath=path.join(workspaceRoot,"scripts","config","evidence_contract.json");
const pocBatchHistoryLimit=20;
const pocSchedulerMinIntervalSec=15;
const pocSchedulerDefaultIntervalSec=120;
const pocSchedulerDefaultPrompt="nightly batch: summarize CI failures and list top 3 follow-ups";
const allowedPocBatchModes=new Set(["mock","sdk"]);
const conversationProvider="app-server";
const conversationAppServerModel="codex-app-server";
const conversationPersonaMemoryPath=loggingSurfacePaths.conversationPersonaMemoryPath;
const conversationPersonaMemoryContextFacts=5;
const conversationPersonaMemoryContextTopics=3;
const defaultEvalSuite=loadEvalSuiteSafely();
const harnessTurnContractSpec=loadHarnessTurnContractSpecSafely();
const taskOutcomeContract=loadTaskOutcomeContractSafely();
const planningModeContract=loadPlanningModeContractSafely();
const assuranceModeContract=loadAssuranceModeContractSafely();
const taskFamilyProfilesContract=loadTaskFamilyProfilesContractSafely();
const designAcceptanceContract=loadDesignAcceptanceContractSafely();
let tasteMemoryStore=loadTasteMemoryStoreSafely();
let workspaceGuardLockedRoot="";

let webServer=null;
let webPort=null;
let shuttingDown=false;
let nextAgentNumber=1;
let conversationPersonaMemoryLoaded=false;
let conversationPersonaMemoryStore=createDefaultPersonaMemoryStore();
let requirementGuardExtensionModule=null;
let requirementGuardExtensionLoadError=null;
let requirementGuardExtensionAttempted=false;
let lastTurnArtifactsPruneAt=0;
const execIdempotencyStore=new Map();
let harnessMemoryLoaded=false;
const harnessContractMemoryStore=new Map();
const harnessExecutionMemoryStore=new Map();
const harnessAuditMemoryStore=new Map();
const harnessPatternMemoryStore=new Map();
const harnessReplayMemoryStore=new Map();
let harnessMemoryLastPersistedAt=0;
let lastSloAlertFingerprint="";
const pocBatchRuns=[];
const pocSchedulerState={
  enabled:false,
  intervalSec:pocSchedulerDefaultIntervalSec,
  nextTickAt:0,
  timer:null,
  running:false,
  defaultPrompt:pocSchedulerDefaultPrompt,
};

const allowedOperationLogLevels=new Set(["off","core","standard","verbose"]);
const allowedLoggingModes=new Set(["OPERATOR","PROOF","DEBUG","FORENSIC"]);
function normalizeLoggingMode(value,fallback="OPERATOR"){
  const raw=typeof value==="string"?value.trim().toUpperCase():"";
  if(allowedLoggingModes.has(raw))return raw;
  return fallback;
}
const loggingModeEnvKey="CODEX_LOGGING_MODE";
const loggingMode=normalizeLoggingMode(process.env[loggingModeEnvKey],"OPERATOR");
const refreshCurrentLogsOnly=normalizeBooleanFlag(process.env.CODEX_REFRESH_CURRENT_LOGS_ONLY);
const refreshCurrentLogsTrigger=safeString(process.env.CODEX_REFRESH_CURRENT_LOGS_TRIGGER,80)||"cli_refresh";
const operationLogLevelRank=Object.freeze({
  off:0,
  core:1,
  standard:2,
  verbose:3,
});
const operationLogDefaults=Object.freeze({
  enabled:process.env.CODEX_OPERATION_LOG_ENABLED!=="0",
  relativePath:repoRelativePath(workspaceRoot,path.join(loggingSurfacePaths.archiveOperationLogsRoot,"codex_ops.jsonl"))||"logs/archive/raw/operation_logs/codex_ops.jsonl",
  dailySplit:loggingMode==="FORENSIC",
  maxBytes:1024*1024,
  keepBytes:Math.floor(1024*1024*0.7),
  level:loggingMode==="OPERATOR"
    ?"core"
    :(loggingMode==="PROOF"?"standard":"verbose"),
  maxEventBytes:4096,
  archive:Object.freeze({
    enabled:true,
    compress:true,
    maxBytes:32*1024*1024,
    maxFiles:240,
  }),
});
function normalizeOperationLogLevel(value,fallback=operationLogDefaults.level){
  const raw=typeof value==="string"?value.trim().toLowerCase():"";
  if(allowedOperationLogLevels.has(raw))return raw;
  return fallback;
}
function parseBooleanEnv(name,fallback){
  const raw=typeof process.env[name]==="string"?process.env[name].trim().toLowerCase():"";
  if(!raw)return Boolean(fallback);
  if(raw==="1"||raw==="true"||raw==="yes"||raw==="on")return true;
  if(raw==="0"||raw==="false"||raw==="no"||raw==="off")return false;
  return Boolean(fallback);
}
function parseLogLevelEnv(name,fallback){
  const raw=typeof process.env[name]==="string"?process.env[name].trim().toLowerCase():"";
  return normalizeOperationLogLevel(raw,fallback);
}
function parsePositiveIntEnv(name,fallback,min,max){
  const raw=typeof process.env[name]==="string"?process.env[name].trim():"";
  if(!raw)return fallback;
  const parsed=Number(raw);
  if(!Number.isFinite(parsed))return fallback;
  const value=Math.max(min,Math.min(max,Math.trunc(parsed)));
  return value;
}
function parseRateEnv(name,fallback,min=0,max=1){
  const raw=typeof process.env[name]==="string"?process.env[name].trim():"";
  const source=raw||String(fallback||"");
  const parsed=Number(source);
  if(!Number.isFinite(parsed))return Number(fallback)||0;
  return Math.max(min,Math.min(max,parsed));
}
function resolveWorkspaceScopedPathOverride(envKey,fallbackPath){
  const fallback=path.resolve(fallbackPath);
  const raw=typeof process.env[envKey]==="string"?process.env[envKey].trim():"";
  if(!raw)return fallback;
  const resolved=path.isAbsolute(raw)?path.normalize(raw):path.normalize(path.join(workspaceRoot,raw));
  return isPathWithin(workspaceRoot,resolved)?resolved:fallback;
}
function loadEvalSuiteSafely(){
  try{
    return loadEvalSuiteFromFile(evalSuiteConfigPath);
  }catch(error){
    console.warn(`[eval] failed to load suite from ${evalSuiteConfigPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadEvalSuiteFromFile(defaultEvalSuitePath);
    }catch{
      return normalizeEvalSuite({
        suiteId:"fallback-inline.v1",
        description:"Fallback inline suite",
        cases:[
          {
            id:"fallback_exact_ack",
            prompt:"Reply with exactly: ACK",
            expect:{mode:"exact",value:"ACK"},
            weight:1,
          },
        ],
      },{fallbackId:"fallback-inline.v1"});
    }
  }
}
function loadHarnessTurnContractSpecSafely(){
  try{
    return loadHarnessTurnContractSpec(harnessTurnContractSpecPath);
  }catch(error){
    console.warn(`[contract] failed to load turn spec from ${harnessTurnContractSpecPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadHarnessTurnContractSpec(defaultHarnessTurnContractSpecPath);
    }catch{
      return{
        schema:"harness-turn-contract.v1",
        turn:{
          states:["in_progress","completed","interrupted","failed"],
          terminalStates:["completed","interrupted","failed"],
          terminalEvent:"turn/completed",
          transitions:[
            {from:"in_progress",to:"completed"},
            {from:"in_progress",to:"interrupted"},
            {from:"in_progress",to:"failed"},
          ],
        },
      };
    }
  }
}
function loadTaskOutcomeContractSafely(){
  try{
    return loadTaskOutcomeContract(taskOutcomeContractPath);
  }catch(error){
    console.warn(`[contract] failed to load task outcome spec from ${taskOutcomeContractPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadTaskOutcomeContract(defaultTaskOutcomeContractPath);
    }catch{
      return summarizeTaskOutcomeContract(null);
    }
  }
}
function loadPlanningModeContractSafely(){
  try{
    return loadPlanningModeContract(planningModeContractPath);
  }catch(error){
    console.warn(`[contract] failed to load planning mode spec from ${planningModeContractPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadPlanningModeContract(defaultPlanningModeContractPath);
    }catch{
      return normalizePlanningModeContract(null);
    }
  }
}
function loadAssuranceModeContractSafely(){
  try{
    return loadAssuranceModeContract(assuranceModeContractPath);
  }catch(error){
    console.warn(`[contract] failed to load assurance mode spec from ${assuranceModeContractPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadAssuranceModeContract(defaultAssuranceModeContractPath);
    }catch{
      return{
        schema:"assurance-mode-contract.v1",
        version:"",
        modes:["LIGHT_ASSURANCE","STANDARD_ASSURANCE","SIGNOFF_ASSURANCE"],
      };
    }
  }
}
function loadTaskFamilyProfilesContractSafely(){
  try{
    return loadTaskFamilyProfilesContract(taskFamilyProfilesPath);
  }catch(error){
    console.warn(`[contract] failed to load task family profiles from ${taskFamilyProfilesPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadTaskFamilyProfilesContract(defaultTaskFamilyProfilesPath);
    }catch{
      return{
        schema:"task-family-profiles.v1",
        version:"",
        defaultFamily:"deterministic_code",
        families:[],
      };
    }
  }
}
function loadDesignAcceptanceContractSafely(){
  try{
    return loadDesignAcceptanceContract(designAcceptanceContractPath);
  }catch(error){
    console.warn(`[contract] failed to load design acceptance contract from ${designAcceptanceContractPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadDesignAcceptanceContract(defaultDesignAcceptanceContractPath);
    }catch{
      return loadDesignAcceptanceContract();
    }
  }
}
function loadTasteMemoryStoreSafely(){
  try{
    return loadUserTasteMemoryStore({memoryPath:tasteMemoryMemoryPath,seedPath:tasteMemorySeedPath});
  }catch(error){
    console.warn(`[contract] failed to load taste memory seed from ${tasteMemorySeedPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadUserTasteMemoryStore({memoryPath:tasteMemoryMemoryPath,seedPath:defaultTasteMemorySeedPath});
    }catch{
      return loadUserTasteMemoryStore();
    }
  }
}
function buildIntentFirstApiSnapshot(){
  return{
    ok:true,
    intentFirst:{
      ...summarizeIntentFirstRuntime({contract:designAcceptanceContract,store:tasteMemoryStore}),
      contractPath:summarizePathForOperationLog(designAcceptanceContractPath,220),
      tasteMemorySeedPath:summarizePathForOperationLog(tasteMemorySeedPath,220),
      tasteMemoryPath:summarizePathForOperationLog(tasteMemoryMemoryPath,220),
    },
  };
}
function mergeIntentProfilePatch(currentProfile,profilePatch){
  const current=currentProfile&&typeof currentProfile==="object"?{...currentProfile}:{};
  const patch=profilePatch&&typeof profilePatch==="object"?profilePatch:{};
  const clearFields=(fields)=>{
    for(const field of fields){
      delete current[field];
    }
  };
  if(Object.prototype.hasOwnProperty.call(patch,"northStar")||Object.prototype.hasOwnProperty.call(patch,"northStarLines")){
    clearFields(["northStar","northStarLines"]);
  }
  if(Object.prototype.hasOwnProperty.call(patch,"mustHaves")||Object.prototype.hasOwnProperty.call(patch,"prefers")){
    clearFields(["mustHaves","prefers"]);
  }
  if(Object.prototype.hasOwnProperty.call(patch,"avoid")||Object.prototype.hasOwnProperty.call(patch,"rejects")){
    clearFields(["avoid","rejects"]);
  }
  if(Object.prototype.hasOwnProperty.call(patch,"benchmarkUrls")||Object.prototype.hasOwnProperty.call(patch,"benchmarkSites")){
    clearFields(["benchmarkUrls","benchmarkSites"]);
  }
  if(Object.prototype.hasOwnProperty.call(patch,"notes")||Object.prototype.hasOwnProperty.call(patch,"benchmarkNotes")){
    clearFields(["notes","benchmarkNotes"]);
  }
  if(Object.prototype.hasOwnProperty.call(patch,"requiredProof")){
    clearFields(["requiredProof"]);
  }
  return{
    ...current,
    ...patch,
  };
}
function updateIntentProfileStore(profilePatch){
  const currentStore=normalizeUserTasteMemoryStore(tasteMemoryStore);
  const activeProfileId=safeString(currentStore&&currentStore.activeProfileId,80).toLowerCase()||"default";
  const currentProfile=currentStore&&currentStore.profiles&&currentStore.profiles[activeProfileId]&&typeof currentStore.profiles[activeProfileId]==="object"
    ?currentStore.profiles[activeProfileId]
    :{};
  const nextStore=normalizeUserTasteMemoryStore({
    ...currentStore,
    profiles:{
      ...(currentStore&&currentStore.profiles&&typeof currentStore.profiles==="object"?currentStore.profiles:{}),
      [activeProfileId]:{
        ...mergeIntentProfilePatch(currentProfile,profilePatch),
        id:activeProfileId,
      },
    },
  });
  tasteMemoryStore=persistUserTasteMemoryStore(tasteMemoryMemoryPath,nextStore);
  return buildIntentFirstApiSnapshot();
}
function resetIntentProfileStore(){
  try{
    if(fs.existsSync(tasteMemoryMemoryPath))fs.unlinkSync(tasteMemoryMemoryPath);
  }catch(error){
    throw new Error(`failed to reset intent profile memory: ${error&&error.message?error.message:String(error)}`);
  }
  tasteMemoryStore=loadTasteMemoryStoreSafely();
  return buildIntentFirstApiSnapshot();
}
function buildWorkspaceGuardSnapshot(){
  const workspaceLock=designAcceptanceContract&&designAcceptanceContract.workspaceLock&&typeof designAcceptanceContract.workspaceLock==="object"
    ?designAcceptanceContract.workspaceLock
    :{};
  return{
    locked:Boolean(workspaceGuardLockedRoot),
    lockedRoot:workspaceGuardLockedRoot||null,
    requiredForSources:Array.isArray(workspaceLock.requiredForSources)
      ?workspaceLock.requiredForSources.map((entry)=>safeString(entry,80)).filter(Boolean)
      :[],
    rejectWhenUnlocked:Boolean(workspaceLock.rejectWhenUnlocked),
  };
}
function resolveWorkspaceGuardRequirement({prompt="",executionSource=""}={}){
  const designSensitive=isDesignSensitiveRequest({prompt,contract:designAcceptanceContract});
  return{
    designSensitive,
    workspaceLockRequired:designSensitive&&requiresWorkspaceLockForSource({
      contract:designAcceptanceContract,
      executionSource,
    }),
  };
}
function lockWorkspaceDirectory(targetPath){
  const lockedRoot=normalizeWorkingDirectory(targetPath,targetPath||workspaceRoot);
  workspaceGuardLockedRoot=lockedRoot;
  logOperation("workspace_guard.locked",{
    lockedRoot:summarizePathForOperationLog(lockedRoot,220),
  },"standard");
  return{
    ok:true,
    workspaceGuard:buildWorkspaceGuardSnapshot(),
  };
}
function unlockWorkspaceDirectory(){
  const previousLockedRoot=workspaceGuardLockedRoot||"";
  workspaceGuardLockedRoot="";
  logOperation("workspace_guard.unlocked",{
    previousLockedRoot:summarizePathForOperationLog(previousLockedRoot,220),
  },"standard");
  return{
    ok:true,
    workspaceGuard:buildWorkspaceGuardSnapshot(),
  };
}
function buildWorkspaceGuardViolation(cwd,{label="cwd",statusCode=403,code="outside_locked_workspace"}={}){
  if(!workspaceGuardLockedRoot)return null;
  if(isPathWithin(workspaceGuardLockedRoot,cwd))return null;
  return{
    statusCode:Number.isFinite(Number(statusCode))?Math.trunc(Number(statusCode)):403,
    payload:{
      ok:false,
      error:`${label} is outside locked workspace: ${cwd}`,
      code:safeString(code,80)||"outside_locked_workspace",
      workspaceGuard:buildWorkspaceGuardSnapshot(),
    },
  };
}
function normalizeAutoOpenPath(value){
  const raw=safeString(value,240);
  if(!raw)return"";
  const normalized=raw.trim().replace(/\\/g,"/");
  if(!normalized)return"";
  if(/^https?:\/\//i.test(normalized))return"";
  const withSlash=normalized.startsWith("/")?normalized:`/${normalized}`;
  return withSlash.replace(/\s+/g,"");
}
function buildAutoOpenUrl(port){
  const base=`http://127.0.0.1:${port}`;
  return `${base}${autoOpenPath}`;
}
function resolveEdgeExecutable(){
  const override=safeString(process.env.CODEX_EDGE_EXE,320).trim();
  if(override&&fs.existsSync(override))return override;

  try{
    const which=spawnSync("where",["msedge"],{
      encoding:"utf8",
      windowsHide:true,
      stdio:["ignore","pipe","ignore"],
    });
    if(which&&which.status===0){
      const found=String(which.stdout||"").split(/\r?\n/).map(line=>line.trim()).find(Boolean);
      if(found&&fs.existsSync(found))return found;
    }
  }catch{
  }

  const candidates=[
    process.env.LOCALAPPDATA?path.join(process.env.LOCALAPPDATA,"Microsoft","Edge","Application","msedge.exe"):"",
    process.env["ProgramFiles(x86)"]?path.join(process.env["ProgramFiles(x86)"],"Microsoft","Edge","Application","msedge.exe"):"",
    process.env.ProgramFiles?path.join(process.env.ProgramFiles,"Microsoft","Edge","Application","msedge.exe"):"",
  ];
  for(const candidate of candidates){
    if(!candidate)continue;
    try{
      if(fs.existsSync(candidate))return candidate;
    }catch{
    }
  }
  return"";
}
function isPathWithin(root,target){
  const rootResolved=path.resolve(root).toLowerCase();
  const targetResolved=path.resolve(target).toLowerCase();
  return targetResolved===rootResolved||targetResolved.startsWith(`${rootResolved}${path.sep}`);
}
function resolveControlApiToken(){
  const raw=typeof process.env.CODEX_CONTROL_API_TOKEN==="string"?process.env.CODEX_CONTROL_API_TOKEN.trim():"";
  if(raw&&raw.length>=16&&raw.length<=256)return raw;
  return crypto.randomBytes(24).toString("hex");
}
function normalizeIdempotencyKey(value){
  if(typeof value!=="string")return"";
  const trimmed=value.trim();
  if(!trimmed)return"";
  if(trimmed.length>200)throw new Error("idempotency key is too long (max 200)");
  if(!/^[A-Za-z0-9._:-]+$/.test(trimmed))throw new Error("idempotency key contains unsupported characters");
  return trimmed;
}
function requestHeaderValue(req,name){
  if(!req||!req.headers)return"";
  const raw=req.headers[name];
  if(Array.isArray(raw))return String(raw[0]||"");
  return typeof raw==="string"?raw:"";
}
function normalizeMimeTypeHeader(value){
  const raw=String(value||"").trim().toLowerCase();
  if(!raw)return"";
  const semicolon=raw.indexOf(";");
  return (semicolon>=0?raw.slice(0,semicolon):raw).trim();
}
function validateJsonMutationContentType(req,{required=true,expectedMime=execApiRequiredContentType}={}){
  const normalizedExpected=normalizeMimeTypeHeader(expectedMime)||execApiRequiredContentType;
  const normalizedProvided=normalizeMimeTypeHeader(requestHeaderValue(req,"content-type"));
  if(!normalizedProvided){
    if(required)return{ok:false,status:415,error:`content-type must be ${normalizedExpected}`};
    return{ok:true,status:200,error:""};
  }
  if(normalizedProvided!==normalizedExpected){
    return{ok:false,status:415,error:`unsupported content-type: ${normalizedProvided} (requires ${normalizedExpected})`};
  }
  return{ok:true,status:200,error:""};
}
function extractExecIdempotencyKey(req,body){
  const headerValue=normalizeIdempotencyKey(requestHeaderValue(req,"idempotency-key"));
  const bodyValue=normalizeIdempotencyKey(body&&typeof body.idempotencyKey==="string"?body.idempotencyKey:"");
  if(headerValue&&bodyValue&&headerValue!==bodyValue){
    throw new Error("idempotency key mismatch between header and body");
  }
  return headerValue||bodyValue;
}
function extractGovernanceOverride(body){
  const payload=body&&typeof body==="object"?body:{};
  if(!Object.prototype.hasOwnProperty.call(payload,"governanceOverride"))return null;
  const normalized=normalizeOverrideRequest(payload.governanceOverride);
  if(!normalized){
    throw new Error("invalid governanceOverride (requestedBy/by and reason are required)");
  }
  return normalized;
}
function hashSha256Hex(text){
  return crypto.createHash("sha256").update(String(text||""),"utf8").digest("hex");
}
function normalizeMemoryTimestamp(value,fallback=0){
  const parsed=Number(value);
  if(!Number.isFinite(parsed))return Math.max(0,Math.trunc(fallback));
  return Math.max(0,Math.trunc(parsed));
}
function normalizeContractMemoryState(value){
  const normalized=safeString(value,40).toLowerCase();
  if(normalized==="running"||normalized==="completed"||normalized==="failed"||normalized==="interrupted"||normalized==="released")return normalized;
  if(normalized==="terminal")return"terminal";
  return"failed";
}
function normalizeContractMemoryCloseDisposition(value){
  const normalized=safeString(value,40).toLowerCase();
  if(normalized==="pre_terminal"||normalized==="post_terminal")return normalized;
  return"";
}
function normalizeContractMemoryOutcome(value,fallbackCompletedAt=0){
  if(!value||typeof value!=="object")return null;
  const completedAt=normalizeMemoryTimestamp(value.completedAt,fallbackCompletedAt||Date.now());
  const status=normalizeExecutionState(value.status,{terminalFallback:true});
  return{
    status,
    taskOutcomeStatus:safeString(value.taskOutcomeStatus,80).toUpperCase()||"",
    taskOutcomeReason:safeString(value.taskOutcomeReason,120)||"",
    error:safeString(value.error,2000)||"",
    threadId:safeString(value.threadId,160)||"",
    turnId:safeString(value.turnId,160)||"",
    agentName:safeString(value.agentName,120)||"",
    executionProfile:normalizeExecutionProfile(value.executionProfile,runtimeExecutionProfile),
    executionIntent:normalizeExecutionIntent(value.executionIntent,"interactive"),
    executionSource:safeString(value.executionSource,80)||"",
    artifactDir:safeString(value.artifactDir,260)||"",
    artifactManifestPath:safeString(value.artifactManifestPath,320)||"",
    artifactManifestSha256:safeString(value.artifactManifestSha256,80)||"",
    completedAt,
  };
}
function normalizeContractMemoryRecord(record,{nowMs=Date.now()}={}){
  if(!record||typeof record!=="object")return null;
  const key=normalizeIdempotencyKey(record.key);
  if(!key)return null;
  const createdAt=normalizeMemoryTimestamp(record.createdAt,nowMs);
  const updatedAt=normalizeMemoryTimestamp(record.updatedAt,createdAt||nowMs);
  const expiresAtRaw=normalizeMemoryTimestamp(record.expiresAt,updatedAt+execIdempotencyTtlMs);
  const expiresAt=Math.max(expiresAtRaw,updatedAt+1000);
  const outcome=normalizeContractMemoryOutcome(record.outcome,updatedAt);
  let state=normalizeContractMemoryState(record.state);
  if(state==="terminal"){
    state=outcome&&typeof outcome.status==="string"?outcome.status:"failed";
  }
  return{
    key,
    state,
    createdAt,
    updatedAt,
    expiresAt,
    requestHash:safeString(record.requestHash,160)||"",
    metadata:sanitizeExecIdempotencyMetadata(record.metadata),
    responseClosedAt:normalizeMemoryTimestamp(record.responseClosedAt,0),
    responseCloseDisposition:normalizeContractMemoryCloseDisposition(record.responseCloseDisposition),
    outcome,
  };
}
function isResolvedExecLifecycleState(state){
  const normalized=normalizeContractMemoryState(state);
  return normalized==="completed"||normalized==="failed"||normalized==="interrupted"||normalized==="released";
}
function resolveExecTerminalStatusFromSnapshot(snapshot){
  if(snapshot&&snapshot.outcome&&typeof snapshot.outcome==="object"){
    return normalizeExecutionState(snapshot.outcome.status,{terminalFallback:true});
  }
  const explicitTerminalStatus=safeString(
    snapshot&&snapshot.terminalStatus
      ?snapshot.terminalStatus
      :snapshot&&snapshot.lifecycle&&snapshot.lifecycle.terminalStatus
        ?snapshot.lifecycle.terminalStatus
        :"",
    40
  );
  if(explicitTerminalStatus){
    return normalizeExecutionState(explicitTerminalStatus,{terminalFallback:true});
  }
  const lifecycleState=safeString(
    snapshot&&snapshot.lifecycleState
      ?snapshot.lifecycleState
      :snapshot&&snapshot.lifecycle&&snapshot.lifecycle.state
        ?snapshot.lifecycle.state
        :snapshot&&snapshot.state
          ?snapshot.state
          :"",
    40
  ).toLowerCase();
  if(lifecycleState==="running")return"in_progress";
  if(lifecycleState==="released")return"failed";
  if(lifecycleState==="completed"||lifecycleState==="failed"||lifecycleState==="interrupted"){
    return normalizeExecutionState(lifecycleState,{terminalFallback:true});
  }
  return normalizeExecutionState(lifecycleState,{terminalFallback:true});
}
function isSuccessfulExecTerminalStatus(status){
  return normalizeExecutionState(status,{terminalFallback:true})==="completed";
}
function buildInternalExecJsonResolution(parsed,statusCode=0){
  const payload=parsed&&typeof parsed==="object"?parsed:{};
  const resultPayload=payload.result&&typeof payload.result==="object"?payload.result:null;
  const idempotency=payload.idempotency&&typeof payload.idempotency==="object"?payload.idempotency:null;
  const outcome=idempotency&&idempotency.outcome&&typeof idempotency.outcome==="object"
    ?idempotency.outcome
    :resultPayload;
  const status=normalizeExecutionState(
    outcome&&typeof outcome.status==="string"
      ?outcome.status
      :(typeof payload.status==="string"
        ?payload.status
        :((statusCode>=200&&statusCode<300&&payload.ok===true)?"completed":"failed")),
    {terminalFallback:true}
  );
  const errorText=safeString(
    outcome&&outcome.error
      ?String(outcome.error)
      :payload&&typeof payload.error==="string"
        ?payload.error
        :"",
    12000
  );
  const finalText=safeString(
    resultPayload&&resultPayload.error
      ?String(resultPayload.error)
      :errorText,
    12000
  );
  return{
    status,
    finalText,
    errorText,
    taskOutcomeStatus:outcome?safeString(outcome.taskOutcomeStatus,80).toUpperCase():"",
    taskOutcomeReason:outcome?safeString(outcome.taskOutcomeReason,120):"",
    turnId:outcome?safeString(outcome.turnId,160):"",
    threadId:outcome?safeString(outcome.threadId,160):"",
  };
}
function normalizeFamilyCompletionGateSnapshot(value){
  if(!value||typeof value!=="object")return null;
  const missingHard=Array.isArray(value.missingHard)
    ?value.missingHard.map((entry)=>({
      id:safeString(entry&&entry.id,80)||"",
      label:safeString(entry&&entry.label,120)||"",
      reason:safeString(entry&&entry.reason,120)||"",
    })).filter((entry)=>entry.id||entry.label||entry.reason).slice(0,12)
    :[];
  return{
    applies:Boolean(value.applies),
    designSensitive:Boolean(value.designSensitive),
    taskFamily:safeString(value.taskFamily,80)||"",
    familyProfileId:safeString(value.familyProfileId,80)||"",
    completionContract:safeString(value.completionContract,80)||"",
    status:safeString(value.status,80).toLowerCase()||"",
    summary:safeString(value.summary,400)||"",
    executionSource:safeString(value.executionSource,80).toLowerCase()||"",
    workspaceLockRequired:Boolean(value.workspaceLockRequired),
    workspaceLockedObserved:Boolean(value.workspaceLockedObserved),
    missingHard,
  };
}
function normalizeExecutionMemoryRecord(record){
  if(!record||typeof record!=="object")return null;
  const turnId=safeString(record.turnId,160)||"";
  if(!turnId)return null;
  const updatedAt=normalizeMemoryTimestamp(record.updatedAt,Date.now());
  return{
    turnId,
    threadId:safeString(record.threadId,160)||"",
    agentName:safeString(record.agentName,120)||"",
    cwd:safeString(record.cwd,320)||"",
    source:safeString(record.source,80)||"",
    status:normalizeExecutionState(record.status,{terminalFallback:true}),
    taskOutcomeStatus:safeString(record.taskOutcomeStatus,80).toUpperCase()||"",
    taskOutcomeReason:safeString(record.taskOutcomeReason,120)||"",
    familyCompletionGate:normalizeFamilyCompletionGateSnapshot(record.familyCompletionGate||record.family_completion_gate),
    planningMode:safeString(record.planningMode,40)||"NORMAL",
    planningDepth:safeString(record.planningDepth,60)||"STANDARD_PLANNING",
    assuranceDepth:safeString(record.assuranceDepth,60)||"STANDARD_ASSURANCE",
    flowPath:safeString(record.flowPath,80)||"NORMAL_PATH",
    terminalEvent:safeString(record.terminalEvent,120)||"turn/completed",
    errorText:safeString(record.errorText,2000)||"",
    executionProfile:normalizeExecutionProfile(record.executionProfile,runtimeExecutionProfile),
    executionIntent:normalizeExecutionIntent(record.executionIntent,"interactive"),
    executionSource:safeString(record.executionSource,80)||"",
    startedAt:normalizeMemoryTimestamp(record.startedAt,updatedAt),
    completedAt:normalizeMemoryTimestamp(record.completedAt,updatedAt),
    updatedAt,
    smokeLikeProfile:record.smokeLikeProfile?1:0,
    outputSha256:safeString(record.outputSha256,80)||"",
    outputChars:Number.isFinite(Number(record.outputChars))?Math.max(0,Math.trunc(Number(record.outputChars))):0,
    observedSignals:normalizeObservedTurnSignals(record.observedSignals),
    artifactDir:safeString(record.artifactDir,320)||"",
    artifactManifestPath:safeString(record.artifactManifestPath,320)||"",
    artifactManifestSha256:safeString(record.artifactManifestSha256,80)||"",
    evidenceManifestPath:safeString(record.evidenceManifestPath,320)||"",
    stageTimelinePath:safeString(record.stageTimelinePath,320)||"",
    flowTraceSummaryPath:safeString(record.flowTraceSummaryPath,320)||"",
    planningDecisionContractPath:safeString(record.planningDecisionContractPath,320)||"",
    reviewLoadBreakdownPath:safeString(record.reviewLoadBreakdownPath,320)||"",
    parentDispatchGuard:record.parentDispatchGuard&&typeof record.parentDispatchGuard==="object"
      ?{
        mode:safeString(record.parentDispatchGuard.mode,20)||"off",
        reason:safeString(record.parentDispatchGuard.reason,120)||"",
        required:record.parentDispatchGuard.required?1:0,
        satisfied:record.parentDispatchGuard.satisfied?1:0,
        violation:record.parentDispatchGuard.violation?1:0,
      }
      :{mode:"off",reason:"",required:0,satisfied:0,violation:0},
  };
}
function normalizeAuditMemoryRecord(record){
  if(!record||typeof record!=="object")return null;
  const turnId=safeString(record.turnId,160)||"";
  if(!turnId)return null;
  return{
    turnId,
    threadId:safeString(record.threadId,160)||"",
    artifactDir:safeString(record.artifactDir,260)||"",
    manifestPath:safeString(record.manifestPath,320)||"",
    manifestSha256:safeString(record.manifestSha256,80)||"",
    promptSha256:safeString(record.promptSha256,80)||"",
    generatedAt:normalizeMemoryTimestamp(record.generatedAt,Date.now()),
    artifactCount:Number.isFinite(Number(record.artifactCount))?Math.max(0,Math.trunc(Number(record.artifactCount))):0,
    status:normalizeExecutionState(record.status,{terminalFallback:true}),
  };
}
function normalizeReplayMemoryRecord(record){
  if(!record||typeof record!=="object")return null;
  const turnId=safeString(record.turnId,160)||"";
  if(!turnId)return null;
  const request=record.request&&typeof record.request==="object"?record.request:{};
  const prompt=safeString(request.prompt,replayPromptMaxChars);
  if(!prompt)return null;
  const replayStats=record.replayStats&&typeof record.replayStats==="object"?record.replayStats:{};
  return{
    turnId,
    threadId:safeString(record.threadId,160)||"",
    agentName:safeString(record.agentName,120)||"",
    status:normalizeExecutionState(record.status,{terminalFallback:true}),
    taskOutcomeStatus:safeString(record.taskOutcomeStatus,80).toUpperCase()||"",
    taskOutcomeReason:safeString(record.taskOutcomeReason,120)||"",
    executionProfile:normalizeExecutionProfile(record.executionProfile,runtimeExecutionProfile),
    executionIntent:normalizeExecutionIntent(record.executionIntent,"interactive"),
    executionSource:safeString(record.executionSource,80)||"",
    request:{
      prompt,
      promptSha256:safeString(request.promptSha256,80)||hashSha256Hex(prompt),
      sandboxMode:safeString(request.sandboxMode,40)||"workspace-write",
      approvalPolicy:safeString(request.approvalPolicy,40)||"never",
      webSearch:request.webSearch?1:0,
      model:safeString(request.model,120)||defaultExecModelName,
      modelReasoningEffort:normalizeExecModelReasoningEffort(request.modelReasoningEffort,defaultExecModelReasoningEffort),
      agentName:safeString(request.agentName,120)||safeString(record.agentName,120)||defaultExecAgentName,
      cwd:safeString(request.cwd,220)||workspaceRoot,
      requestUserInputPolicy:normalizeRequestUserInputPolicy(request.requestUserInputPolicy,nonInteractiveRequestUserInputPolicy),
      forceNewSession:request.forceNewSession?1:0,
      executionProfile:normalizeExecutionProfile(request.executionProfile,runtimeExecutionProfile),
      executionIntent:normalizeExecutionIntent(request.executionIntent,"interactive"),
      executionSource:safeString(request.executionSource,80)||"api_exec",
      recipeHash:safeString(request.recipeHash,80)||"",
      planningMode:safeString(request.planningMode,40)||"NORMAL",
      planningDepth:safeString(request.planningDepth,60)||"STANDARD_PLANNING",
      assuranceDepth:safeString(request.assuranceDepth,60)||"STANDARD_ASSURANCE",
      flowPath:safeString(request.flowPath,80)||"NORMAL_PATH",
    },
    baseline:{
      outputSha256:safeString(record.baseline&&record.baseline.outputSha256,80)||"",
      outputLength:Number.isFinite(Number(record.baseline&&record.baseline.outputLength))
        ?Math.max(0,Math.trunc(Number(record.baseline.outputLength)))
        :0,
      outputSnapshot:safeString(record.baseline&&record.baseline.outputSnapshot,replayOutputSnapshotMaxChars)||"",
      artifactManifestPath:safeString(record.baseline&&record.baseline.artifactManifestPath,320)||"",
      artifactManifestSha256:safeString(record.baseline&&record.baseline.artifactManifestSha256,80)||"",
    },
    replayStats:{
      replayCount:Number.isFinite(Number(replayStats.replayCount))?Math.max(0,Math.trunc(Number(replayStats.replayCount))):0,
      lastReplayAt:normalizeMemoryTimestamp(replayStats.lastReplayAt,0),
      lastReplayStatus:safeString(replayStats.lastReplayStatus,40)||"",
      lastReplayOutputSha256:safeString(replayStats.lastReplayOutputSha256,80)||"",
      lastReplayDiffRate:Number.isFinite(Number(replayStats.lastReplayDiffRate))
        ?Number(Number(replayStats.lastReplayDiffRate).toFixed(4))
        :0,
    },
    startedAt:normalizeMemoryTimestamp(record.startedAt,Date.now()),
    completedAt:normalizeMemoryTimestamp(record.completedAt,Date.now()),
    updatedAt:normalizeMemoryTimestamp(record.updatedAt,Date.now()),
  };
}
function classifyExecutionMistake(record){
  const status=normalizeExecutionState(record&&record.status,{terminalFallback:true});
  const taskOutcomeStatus=safeString(record&&record.taskOutcomeStatus,80).toUpperCase();
  const errorText=safeString(record&&record.errorText,2000).toLowerCase();
  const parentDispatchReason=record&&record.parentDispatchGuard&&typeof record.parentDispatchGuard==="object"
    ?safeString(record.parentDispatchGuard.reason,120).toLowerCase()
    :"";
  if(taskOutcomeStatus==="FAILED_VALIDATION"){
    return{
      code:"contract.failed_validation",
      severity:"high",
      hint:"Required validation or evidence gate did not pass; do not report completion.",
    };
  }
  if(taskOutcomeStatus==="NEEDS_INPUT"){
    return{
      code:"contract.needs_input",
      severity:"medium",
      hint:"Collect the missing approval or user decision before continuing.",
    };
  }
  if(taskOutcomeStatus==="BLOCKED"){
    return{
      code:"contract.blocked",
      severity:"medium",
      hint:"Resolve the blocking dependency or governance restriction before retrying.",
    };
  }
  if(status==="completed")return{code:"ok.completed",severity:"none",hint:"No correction needed."};
  if(parentDispatchReason.includes("dispatch")){
    return{
      code:"guard.parent_dispatch",
      severity:"high",
      hint:"Parent tasks should delegate child work before completion in required modes.",
    };
  }
  if(errorText.includes("idempotency")){
    return{
      code:"contract.idempotency_conflict",
      severity:"medium",
      hint:"Use a stable idempotency key and avoid concurrent duplicate submits.",
    };
  }
  if(errorText.includes("disconnect")||errorText.includes("client closed")){
    return{
      code:"runtime.client_disconnect",
      severity:"medium",
      hint:"Add client reconnect/replay flow and finalize terminal state defensively.",
    };
  }
  if(errorText.includes("timeout")){
    return{
      code:"runtime.timeout",
      severity:"medium",
      hint:"Track long-running steps and add deterministic timeout recovery.",
    };
  }
  if(status==="interrupted"){
    return{
      code:"runtime.interrupted",
      severity:"low",
      hint:"Persist intermediate state before interruption boundaries.",
    };
  }
  return{
    code:"runtime.unknown_failure",
    severity:"medium",
    hint:"Capture richer terminal diagnostics and classify failure causes.",
  };
}
function buildExecutionMistakeSignature(record,mistake){
  const normalizedRecord=record&&typeof record==="object"?record:{};
  const normalizedMistake=mistake&&typeof mistake==="object"?mistake:{code:"runtime.unknown_failure"};
  const intent=normalizeExecutionIntent(normalizedRecord.executionIntent,"interactive");
  const profile=normalizeExecutionProfile(normalizedRecord.executionProfile,runtimeExecutionProfile);
  const status=normalizeExecutionState(normalizedRecord.status,{terminalFallback:true});
  return `${safeString(normalizedMistake.code,80)||"runtime.unknown_failure"}|${status}|${intent}|${profile}`;
}
function trimMemoryMapByUpdatedAt(map,maxEntries){
  if(!(map instanceof Map))return;
  const limit=Math.max(1,Math.trunc(Number(maxEntries)||1));
  if(map.size<=limit)return;
  const entries=[...map.entries()].sort((a,b)=>{
    const aUpdated=normalizeMemoryTimestamp(a&&a[1]&&a[1].updatedAt,0);
    const bUpdated=normalizeMemoryTimestamp(b&&b[1]&&b[1].updatedAt,0);
    return aUpdated-bUpdated;
  });
  while(map.size>limit&&entries.length){
    const oldest=entries.shift();
    if(!oldest)break;
    map.delete(oldest[0]);
  }
}
function appendUniqueSample(list,value,max=6){
  const sample=Array.isArray(list)?list:[];
  const normalized=safeString(value,160);
  if(!normalized)return sample;
  if(!sample.includes(normalized))sample.push(normalized);
  while(sample.length>Math.max(1,Math.trunc(Number(max)||6))){
    sample.shift();
  }
  return sample;
}
function upsertPatternFromExecutionRecord(record,nowMs){
  const normalized=normalizeExecutionMemoryRecord(record);
  if(!normalized)return;
  const mistake=classifyExecutionMistake(normalized);
  const signature=buildExecutionMistakeSignature(normalized,mistake);
  const existing=harnessPatternMemoryStore.get(signature);
  const baseline=existing&&typeof existing==="object"
    ?{
      ...existing,
      count:Math.max(0,Math.trunc(Number(existing.count)||0)),
      firstSeenAt:normalizeMemoryTimestamp(existing.firstSeenAt,nowMs),
      sampleTurnIds:Array.isArray(existing.sampleTurnIds)?existing.sampleTurnIds.slice(0,6):[],
      sampleAgents:Array.isArray(existing.sampleAgents)?existing.sampleAgents.slice(0,6):[],
    }
    :{
      signature,
      code:mistake.code,
      severity:mistake.severity,
      hint:mistake.hint,
      status:normalized.status,
      executionIntent:normalized.executionIntent,
      executionProfile:normalized.executionProfile,
      count:0,
      firstSeenAt:nowMs,
      sampleTurnIds:[],
      sampleAgents:[],
    };
  baseline.count+=1;
  baseline.lastSeenAt=nowMs;
  baseline.lastError=safeString(normalized.errorText,500)||"";
  baseline.sampleTurnIds=appendUniqueSample(baseline.sampleTurnIds,normalized.turnId,6);
  baseline.sampleAgents=appendUniqueSample(baseline.sampleAgents,normalized.agentName,6);
  baseline.updatedAt=nowMs;
  harnessPatternMemoryStore.set(signature,baseline);
  trimMemoryMapByUpdatedAt(harnessPatternMemoryStore,harnessMemoryMaxPatternRecords);
}
function pruneHarnessMemoryRecords(nowMs=Date.now()){
  const maxAgeMs=harnessMemoryRetentionDays*24*60*60*1000;
  const cutoff=Math.max(0,nowMs-maxAgeMs);
  for(const[key,entry]of harnessContractMemoryStore.entries()){
    const updatedAt=normalizeMemoryTimestamp(entry&&entry.updatedAt,0);
    if(updatedAt<cutoff){
      harnessContractMemoryStore.delete(key);
    }
  }
  for(const[key,entry]of harnessExecutionMemoryStore.entries()){
    const updatedAt=normalizeMemoryTimestamp(entry&&entry.updatedAt,0);
    if(updatedAt<cutoff){
      harnessExecutionMemoryStore.delete(key);
    }
  }
  for(const[key,entry]of harnessAuditMemoryStore.entries()){
    const generatedAt=normalizeMemoryTimestamp(entry&&entry.generatedAt,0);
    if(generatedAt<cutoff){
      harnessAuditMemoryStore.delete(key);
    }
  }
  for(const[key,entry]of harnessReplayMemoryStore.entries()){
    const updatedAt=normalizeMemoryTimestamp(entry&&entry.updatedAt,0);
    if(updatedAt<cutoff){
      harnessReplayMemoryStore.delete(key);
    }
  }
  for(const[key,entry]of harnessPatternMemoryStore.entries()){
    const updatedAt=normalizeMemoryTimestamp(entry&&entry.updatedAt,0);
    if(updatedAt<cutoff){
      harnessPatternMemoryStore.delete(key);
    }
  }
  trimMemoryMapByUpdatedAt(harnessContractMemoryStore,harnessMemoryMaxContractRecords);
  trimMemoryMapByUpdatedAt(harnessExecutionMemoryStore,harnessMemoryMaxExecutionRecords);
  trimMemoryMapByUpdatedAt(harnessAuditMemoryStore,harnessMemoryMaxAuditRecords);
  trimMemoryMapByUpdatedAt(harnessReplayMemoryStore,harnessMemoryMaxReplayRecords);
  trimMemoryMapByUpdatedAt(harnessPatternMemoryStore,harnessMemoryMaxPatternRecords);
}
function persistHarnessExecutionMemoryStore({reason="runtime"}={}){
  if(!harnessMemoryLoaded)return false;
  try{
    const nowMs=Date.now();
    pruneHarnessMemoryRecords(nowMs);
    const payload={
      schema:harnessMemorySchema,
      updatedAt:nowMs,
      retentionDays:harnessMemoryRetentionDays,
      contractMemory:[...harnessContractMemoryStore.values()],
      executionMemory:[...harnessExecutionMemoryStore.values()],
      auditMemory:[...harnessAuditMemoryStore.values()],
      replayMemory:[...harnessReplayMemoryStore.values()],
      abstractionMemory:{
        patterns:[...harnessPatternMemoryStore.values()],
      },
    };
    fs.mkdirSync(path.dirname(harnessMemoryPath),{recursive:true,mode:0o700});
    const tmpPath=`${harnessMemoryPath}.tmp`;
    fs.writeFileSync(tmpPath,`${JSON.stringify(payload,null,2)}\n`,"utf8");
    hardenFilePermissions(tmpPath);
    fs.renameSync(tmpPath,harnessMemoryPath);
    hardenFilePermissions(harnessMemoryPath);
    harnessMemoryLastPersistedAt=nowMs;
    return true;
  }catch(error){
    logOperation("harness.memory_persist_failed",{
      reason:safeString(reason,80)||"runtime",
      path:summarizePathForOperationLog(harnessMemoryPath,220),
      err:summarizeErrorForOperationLog(error,220),
    },"core");
    return false;
  }
}
function rememberContractMemoryRecord(record,{persist=true}={}){
  const normalized=normalizeContractMemoryRecord(record);
  if(!normalized)return null;
  harnessContractMemoryStore.set(normalized.key,normalized);
  pruneHarnessMemoryRecords(Date.now());
  if(persist)persistHarnessExecutionMemoryStore({reason:"contract_memory"});
  return normalized;
}
function rememberExecutionMemoryRecord(record,{persist=true}={}){
  const normalized=normalizeExecutionMemoryRecord(record);
  if(!normalized)return null;
  harnessExecutionMemoryStore.set(normalized.turnId,normalized);
  upsertPatternFromExecutionRecord(normalized,Date.now());
  pruneHarnessMemoryRecords(Date.now());
  if(persist)persistHarnessExecutionMemoryStore({reason:"execution_memory"});
  return normalized;
}
function rememberAuditMemoryRecord(record,{persist=true}={}){
  const normalized=normalizeAuditMemoryRecord(record);
  if(!normalized)return null;
  harnessAuditMemoryStore.set(normalized.turnId,normalized);
  pruneHarnessMemoryRecords(Date.now());
  if(persist)persistHarnessExecutionMemoryStore({reason:"audit_memory"});
  return normalized;
}
function rememberReplayMemoryRecord(record,{persist=true}={}){
  const normalized=normalizeReplayMemoryRecord(record);
  if(!normalized)return null;
  harnessReplayMemoryStore.set(normalized.turnId,normalized);
  pruneHarnessMemoryRecords(Date.now());
  if(persist)persistHarnessExecutionMemoryStore({reason:"replay_memory"});
  return normalized;
}
function loadHarnessExecutionMemoryStore(){
  if(harnessMemoryLoaded)return;
  harnessMemoryLoaded=true;
  if(!fs.existsSync(harnessMemoryPath)){
    return;
  }
  try{
    const raw=fs.readFileSync(harnessMemoryPath,"utf8");
    const parsed=raw?JSON.parse(raw):{};
    const contractMemory=Array.isArray(parsed&&parsed.contractMemory)?parsed.contractMemory:[];
    const executionMemory=Array.isArray(parsed&&parsed.executionMemory)?parsed.executionMemory:[];
    const auditMemory=Array.isArray(parsed&&parsed.auditMemory)?parsed.auditMemory:[];
    const replayMemory=Array.isArray(parsed&&parsed.replayMemory)?parsed.replayMemory:[];
    const patterns=Array.isArray(parsed&&parsed.abstractionMemory&&parsed.abstractionMemory.patterns)
      ?parsed.abstractionMemory.patterns
      :[];
    for(const entry of contractMemory){
      const normalized=normalizeContractMemoryRecord(entry);
      if(!normalized)continue;
      harnessContractMemoryStore.set(normalized.key,normalized);
    }
    for(const entry of executionMemory){
      const normalized=normalizeExecutionMemoryRecord(entry);
      if(!normalized)continue;
      harnessExecutionMemoryStore.set(normalized.turnId,normalized);
    }
    for(const entry of auditMemory){
      const normalized=normalizeAuditMemoryRecord(entry);
      if(!normalized)continue;
      harnessAuditMemoryStore.set(normalized.turnId,normalized);
    }
    for(const entry of replayMemory){
      const normalized=normalizeReplayMemoryRecord(entry);
      if(!normalized)continue;
      harnessReplayMemoryStore.set(normalized.turnId,normalized);
    }
    for(const entry of patterns){
      if(!entry||typeof entry!=="object")continue;
      const signature=safeString(entry.signature,220);
      if(!signature)continue;
      const normalizedPattern={
        signature,
        code:safeString(entry.code,120)||"runtime.unknown_failure",
        severity:safeString(entry.severity,20)||"medium",
        hint:safeString(entry.hint,220)||"",
        status:normalizeExecutionState(entry.status,{terminalFallback:true}),
        executionIntent:normalizeExecutionIntent(entry.executionIntent,"interactive"),
        executionProfile:normalizeExecutionProfile(entry.executionProfile,runtimeExecutionProfile),
        count:Math.max(0,Math.trunc(Number(entry.count)||0)),
        firstSeenAt:normalizeMemoryTimestamp(entry.firstSeenAt,0),
        lastSeenAt:normalizeMemoryTimestamp(entry.lastSeenAt,0),
        lastError:safeString(entry.lastError,500)||"",
        sampleTurnIds:Array.isArray(entry.sampleTurnIds)?entry.sampleTurnIds.map((v)=>safeString(v,160)).filter(Boolean).slice(0,6):[],
        sampleAgents:Array.isArray(entry.sampleAgents)?entry.sampleAgents.map((v)=>safeString(v,120)).filter(Boolean).slice(0,6):[],
        updatedAt:normalizeMemoryTimestamp(entry.updatedAt,Date.now()),
      };
      harnessPatternMemoryStore.set(signature,normalizedPattern);
    }
    const nowMs=Date.now();
    for(const[key,entry]of harnessContractMemoryStore.entries()){
      const current=normalizeContractMemoryRecord(entry,{nowMs});
      if(!current)continue;
      if(current.state==="running"){
        current.state="failed";
        current.updatedAt=nowMs;
        current.expiresAt=nowMs+execIdempotencyTtlMs;
        current.outcome=normalizeContractMemoryOutcome({
          status:"failed",
          error:"in-flight request interrupted by harness restart",
          threadId:current.outcome&&current.outcome.threadId?current.outcome.threadId:"",
          turnId:current.outcome&&current.outcome.turnId?current.outcome.turnId:"",
          agentName:current.outcome&&current.outcome.agentName?current.outcome.agentName:"",
          completedAt:nowMs,
        },nowMs);
        harnessContractMemoryStore.set(key,current);
      }
      if(current.expiresAt>nowMs&&(current.state==="running"||isResolvedExecLifecycleState(current.state))){
        execIdempotencyStore.set(current.key,{
          key:current.key,
          state:current.state,
          createdAt:current.createdAt,
          updatedAt:current.updatedAt,
          expiresAt:current.expiresAt,
          requestHash:current.requestHash,
          metadata:current.metadata,
          responseClosedAt:current.responseClosedAt,
          responseCloseDisposition:current.responseCloseDisposition,
          outcome:current.outcome,
        });
      }
    }
    pruneHarnessMemoryRecords(nowMs);
    harnessMemoryLastPersistedAt=normalizeMemoryTimestamp(parsed&&parsed.updatedAt,nowMs);
  }catch(error){
    logOperation("harness.memory_load_failed",{
      path:summarizePathForOperationLog(harnessMemoryPath,220),
      err:summarizeErrorForOperationLog(error,220),
    },"core");
    harnessContractMemoryStore.clear();
    harnessExecutionMemoryStore.clear();
    harnessAuditMemoryStore.clear();
    harnessReplayMemoryStore.clear();
    harnessPatternMemoryStore.clear();
  }
}
function buildHarnessMemoryRuntimeSnapshot(){
  const nowMs=Date.now();
  let activeContractRecords=0;
  for(const entry of harnessContractMemoryStore.values()){
    if(!entry||typeof entry!=="object")continue;
    const expiresAt=normalizeMemoryTimestamp(entry.expiresAt,0);
    if(expiresAt>nowMs&&(entry.state==="running"||isResolvedExecLifecycleState(entry.state))){
      activeContractRecords+=1;
    }
  }
  return{
    schema:harnessMemorySchema,
    storage:summarizePathForOperationLog(harnessMemoryPath,220),
    envKey:harnessMemoryPathEnvKey,
    loaded:harnessMemoryLoaded?1:0,
    retentionDays:harnessMemoryRetentionDays,
    counts:{
      contract:harnessContractMemoryStore.size,
      contractActive:activeContractRecords,
      execution:harnessExecutionMemoryStore.size,
      audit:harnessAuditMemoryStore.size,
      replay:harnessReplayMemoryStore.size,
      patterns:harnessPatternMemoryStore.size,
    },
    lastPersistedAt:harnessMemoryLastPersistedAt||0,
  };
}
function pruneExecIdempotencyStore(now=Date.now()){
  let removed=0;
  for(const[key,entry]of execIdempotencyStore.entries()){
    if(!entry||typeof entry!=="object"){
      execIdempotencyStore.delete(key);
      removed+=1;
      continue;
    }
    const expiresAt=Number(entry.expiresAt||0);
    if(!Number.isFinite(expiresAt)||expiresAt<=now){
      execIdempotencyStore.delete(key);
      removed+=1;
    }
  }
  if(removed>0){
    persistHarnessExecutionMemoryStore({reason:"idempotency_prune"});
  }
}
function resolveExecIdempotencyRequestHash(record){
  if(!record||typeof record!=="object")return"";
  const direct=safeString(record.requestHash,160);
  if(direct)return direct;
  const metadata=record.metadata&&typeof record.metadata==="object"?record.metadata:{};
  return safeString(metadata.requestHash,160);
}
function claimExecIdempotencyKey(key,meta={}){
  if(!harnessMemoryLoaded){
    loadHarnessExecutionMemoryStore();
  }
  const normalized=normalizeIdempotencyKey(key);
  if(!normalized)return{ok:true,key:"",record:null};
  const now=Date.now();
  pruneExecIdempotencyStore(now);
  const existing=execIdempotencyStore.get(normalized);
  if(existing&&existing.expiresAt>now){
    const requestHash=safeString(meta&&meta.requestHash,160);
    const existingRequestHash=resolveExecIdempotencyRequestHash(existing);
    const requestHashMismatch=Boolean(requestHash&&existingRequestHash&&requestHash!==existingRequestHash);
    return{
      ok:false,
      key:normalized,
      record:existing,
      reason:requestHashMismatch?"request_hash_mismatch":"duplicate",
      requestHash,
      existingRequestHash,
    };
  }
  const record={
    key:normalized,
    state:"running",
    createdAt:now,
    updatedAt:now,
    expiresAt:now+execIdempotencyTtlMs,
    requestHash:safeString(meta&&meta.requestHash,160),
    metadata:meta&&typeof meta==="object"?meta:{},
    responseClosedAt:0,
    responseCloseDisposition:"",
    outcome:null,
  };
  execIdempotencyStore.set(normalized,record);
  rememberContractMemoryRecord(record,{persist:true});
  return{ok:true,key:normalized,record};
}
function finalizeExecIdempotencyKey(key,outcome={}){
  if(!harnessMemoryLoaded){
    loadHarnessExecutionMemoryStore();
  }
  const normalized=normalizeIdempotencyKey(key);
  if(!normalized)return;
  const existing=execIdempotencyStore.get(normalized);
  if(!existing)return;
  const now=Date.now();
  const terminalStatus=normalizeExecutionState(outcome&&outcome.status,{terminalFallback:true});
  existing.state=terminalStatus;
  existing.updatedAt=now;
  existing.expiresAt=now+execIdempotencyTtlMs;
  existing.outcome=outcome&&typeof outcome==="object"?{
    status:terminalStatus,
    taskOutcomeStatus:safeString(outcome.taskOutcomeStatus,80).toUpperCase()||"",
    taskOutcomeReason:safeString(outcome.taskOutcomeReason,120)||"",
    error:safeString(outcome.error,500)||"",
    threadId:safeString(outcome.threadId,160)||"",
    turnId:safeString(outcome.turnId,160)||"",
    agentName:safeString(outcome.agentName,120)||"",
    executionProfile:normalizeExecutionProfile(outcome.executionProfile,runtimeExecutionProfile),
    executionIntent:normalizeExecutionIntent(outcome.executionIntent,"interactive"),
    executionSource:safeString(outcome.executionSource,80)||"",
    artifactDir:safeString(outcome.artifactDir,260)||"",
    artifactManifestPath:safeString(outcome.artifactManifestPath,320)||"",
    artifactManifestSha256:safeString(outcome.artifactManifestSha256,80)||"",
    completedAt:now,
  }:null;
  rememberContractMemoryRecord(existing,{persist:true});
}
function markExecIdempotencyResponseClosed(key){
  if(!harnessMemoryLoaded){
    loadHarnessExecutionMemoryStore();
  }
  const normalized=normalizeIdempotencyKey(key);
  if(!normalized)return;
  const existing=execIdempotencyStore.get(normalized);
  if(!existing||typeof existing!=="object")return;
  const now=Date.now();
  existing.updatedAt=now;
  existing.expiresAt=Math.max(normalizeMemoryTimestamp(existing.expiresAt,0),now+1000);
  existing.responseClosedAt=existing.responseClosedAt||now;
  existing.responseCloseDisposition=existing.state==="running"?"pre_terminal":"post_terminal";
  rememberContractMemoryRecord(existing,{persist:true});
}
function releaseExecIdempotencyKey(key){
  if(!harnessMemoryLoaded){
    loadHarnessExecutionMemoryStore();
  }
  const normalized=normalizeIdempotencyKey(key);
  if(!normalized)return;
  const existing=execIdempotencyStore.get(normalized);
  if(existing&&typeof existing==="object"){
    const now=Date.now();
    rememberContractMemoryRecord({
      ...existing,
      state:"released",
      updatedAt:now,
      expiresAt:now,
      outcome:existing.outcome&&typeof existing.outcome==="object"
        ?existing.outcome
        :{
          status:"failed",
          error:"idempotency claim released before terminal outcome",
          threadId:"",
          turnId:"",
          agentName:"",
          completedAt:now,
        },
      responseClosedAt:normalizeMemoryTimestamp(existing.responseClosedAt,0),
      responseCloseDisposition:normalizeContractMemoryCloseDisposition(existing.responseCloseDisposition),
    },{persist:true});
  }
  execIdempotencyStore.delete(normalized);
}
function sanitizeExecIdempotencyMetadata(metadata){
  const source=metadata&&typeof metadata==="object"?metadata:{};
  const normalized={
    path:safeString(source.path,120)||"",
    method:safeString(source.method,16)||"",
    agent:safeString(source.agent,80)||"",
    sandbox:safeString(source.sandbox,40)||"",
    approval:safeString(source.approval,40)||"",
    model:safeString(source.model,120)||"",
    modelReasoningEffort:safeString(source.modelReasoningEffort,40)||"",
    cwd:safeString(source.cwd,220)||"",
    requestHash:safeString(source.requestHash,160)||"",
    requestUserInputPolicy:safeString(source.requestUserInputPolicy,40)||"",
    executionProfile:safeString(source.executionProfile,60)||"",
    executionIntent:safeString(source.executionIntent,80)||"",
    executionSource:safeString(source.executionSource,80)||"",
    reproProfile:source.reproProfile?1:0,
    governanceOverrideBy:safeString(source.governanceOverrideBy,80)||"",
  };
  const compact={};
  for(const[key,value]of Object.entries(normalized)){
    if(typeof value==="string"&&value.trim()){
      compact[key]=value;
      continue;
    }
    if(typeof value==="number"&&Number.isFinite(value)&&value!==0){
      compact[key]=value;
    }
  }
  return compact;
}
function buildExecIdempotencySnapshot(key,record){
  if(!record||typeof record!=="object")return null;
  const normalizedKey=safeString(key||record.key,200)||"";
  if(!normalizedKey)return null;
  const lifecycleState=normalizeContractMemoryState(record.state);
  const responseClosedAt=normalizeMemoryTimestamp(record.responseClosedAt,0);
  const responseCloseDisposition=normalizeContractMemoryCloseDisposition(record.responseCloseDisposition);
  const outcomeStatus=record&&record.outcome&&typeof record.outcome==="object"
    ?normalizeExecutionState(record.outcome.status,{terminalFallback:true})
    :"";
  const terminalStatus=outcomeStatus
    ||(lifecycleState==="running"
      ?"in_progress"
      :(lifecycleState==="released"?"failed":lifecycleState));
  const outcomeCompletedAt=record&&record.outcome&&typeof record.outcome==="object"
    ?normalizeMemoryTimestamp(record.outcome.completedAt,0)
    :0;
  const resolved=isResolvedExecLifecycleState(lifecycleState);
  return{
    key:normalizedKey,
    state:lifecycleState,
    lifecycleState,
    lifecycle:{
      state:lifecycleState,
      active:lifecycleState==="running"?1:0,
      terminal:resolved&&lifecycleState!=="released"?1:0,
      resolved:resolved?1:0,
      released:lifecycleState==="released"?1:0,
      terminalStatus,
      terminalAt:outcomeCompletedAt,
      responseClosed:responseClosedAt>0?1:0,
      responseClosedAt,
      responseCloseDisposition,
    },
    terminalStatus,
    createdAt:Number.isFinite(Number(record.createdAt))?Math.max(0,Math.trunc(Number(record.createdAt))):0,
    updatedAt:Number.isFinite(Number(record.updatedAt))?Math.max(0,Math.trunc(Number(record.updatedAt))):0,
    expiresAt:Number.isFinite(Number(record.expiresAt))?Math.max(0,Math.trunc(Number(record.expiresAt))):0,
    metadata:sanitizeExecIdempotencyMetadata(record.metadata),
    outcome:record&&record.outcome&&typeof record.outcome==="object"
      ?{
        status:normalizeExecutionState(record.outcome.status,{terminalFallback:true}),
        taskOutcomeStatus:safeString(record.outcome.taskOutcomeStatus,80).toUpperCase()||"",
        taskOutcomeReason:safeString(record.outcome.taskOutcomeReason,120)||"",
        error:safeString(record.outcome.error,500)||"",
        threadId:safeString(record.outcome.threadId,160)||"",
        turnId:safeString(record.outcome.turnId,160)||"",
        agentName:safeString(record.outcome.agentName,120)||"",
        executionProfile:normalizeExecutionProfile(record.outcome.executionProfile,runtimeExecutionProfile),
        executionIntent:normalizeExecutionIntent(record.outcome.executionIntent,"interactive"),
        executionSource:safeString(record.outcome.executionSource,80)||"",
        artifactDir:safeString(record.outcome.artifactDir,260)||"",
        artifactManifestPath:safeString(record.outcome.artifactManifestPath,320)||"",
        artifactManifestSha256:safeString(record.outcome.artifactManifestSha256,80)||"",
        completedAt:Number.isFinite(Number(record.outcome.completedAt))?Math.max(0,Math.trunc(Number(record.outcome.completedAt))):0,
      }
      :null,
    statusApiPath:`/api/exec/idempotency/${encodeURIComponent(normalizedKey)}`,
    waitMaxMs:execIdempotencyStatusWaitMaxMs,
  };
}
function normalizeExecIdempotencyWaitMs(value){
  const parsed=Number(value);
  if(!Number.isFinite(parsed))return 0;
  if(parsed<=0)return 0;
  return Math.min(execIdempotencyStatusWaitMaxMs,Math.trunc(parsed));
}
async function waitForExecIdempotencyRecord(key,{waitMs=0}={}){
  if(!harnessMemoryLoaded){
    loadHarnessExecutionMemoryStore();
  }
  const normalized=normalizeIdempotencyKey(key);
  if(!normalized)return null;
  pruneExecIdempotencyStore(Date.now());
  let current=execIdempotencyStore.get(normalized)||null;
  const normalizedWaitMs=normalizeExecIdempotencyWaitMs(waitMs);
  if(!current||normalizedWaitMs<=0||String(current.state)!=="running")return current;
  const deadline=Date.now()+normalizedWaitMs;
  while(Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,250));
    pruneExecIdempotencyStore(Date.now());
    current=execIdempotencyStore.get(normalized)||null;
    if(!current||String(current.state)!=="running")break;
  }
  return current;
}
function buildReplayMemorySnapshot(record,{includePrompt=false}={}){
  const normalized=normalizeReplayMemoryRecord(record);
  if(!normalized)return null;
  const requestSnapshot={
    promptSha256:normalized.request.promptSha256,
    promptChars:normalized.request.prompt.length,
    sandboxMode:normalized.request.sandboxMode,
    approvalPolicy:normalized.request.approvalPolicy,
    webSearch:normalized.request.webSearch?1:0,
    model:normalized.request.model,
    modelReasoningEffort:normalized.request.modelReasoningEffort,
    agentName:normalized.request.agentName,
    cwd:summarizePathForOperationLog(normalized.request.cwd,220),
    requestUserInputPolicy:normalized.request.requestUserInputPolicy,
    forceNewSession:normalized.request.forceNewSession?1:0,
    executionProfile:normalized.request.executionProfile,
    executionIntent:normalized.request.executionIntent,
    executionSource:normalized.request.executionSource,
    recipeHash:normalized.request.recipeHash||"",
  };
  if(includePrompt){
    requestSnapshot.prompt=normalized.request.prompt;
  }
  return{
    turnId:normalized.turnId,
    threadId:normalized.threadId,
    agentName:normalized.agentName,
    status:normalized.status,
    taskOutcomeStatus:normalized.taskOutcomeStatus||"",
    taskOutcomeReason:normalized.taskOutcomeReason||"",
    executionProfile:normalized.executionProfile,
    executionIntent:normalized.executionIntent,
    executionSource:normalized.executionSource,
    request:requestSnapshot,
    baseline:{
      outputSha256:normalized.baseline.outputSha256,
      outputLength:normalized.baseline.outputLength,
      outputSnapshot:safeString(normalized.baseline.outputSnapshot,400),
      artifactManifestPath:summarizePathForOperationLog(normalized.baseline.artifactManifestPath,220),
      artifactManifestSha256:normalized.baseline.artifactManifestSha256,
    },
    replayStats:normalized.replayStats,
    startedAt:normalized.startedAt,
    completedAt:normalized.completedAt,
    updatedAt:normalized.updatedAt,
  };
}
function listReplayMemorySnapshots({limit=20}={}){
  const normalizedLimit=Math.max(1,Math.min(200,Math.trunc(Number(limit)||20)));
  return[...harnessReplayMemoryStore.values()]
    .map((record)=>buildReplayMemorySnapshot(record))
    .filter((record)=>record&&typeof record==="object")
    .sort((a,b)=>Number(b.updatedAt||0)-Number(a.updatedAt||0))
    .slice(0,normalizedLimit);
}
function getReplayMemoryRecord(turnId){
  const normalizedTurnId=safeString(turnId,160);
  if(!normalizedTurnId)return null;
  const existing=harnessReplayMemoryStore.get(normalizedTurnId);
  if(!existing)return null;
  return normalizeReplayMemoryRecord(existing);
}
function updateReplayMemoryStats(turnId,{status="",outputSha256="",similarity=0}={}){
  const current=getReplayMemoryRecord(turnId);
  if(!current)return null;
  const replayStats=current.replayStats&&typeof current.replayStats==="object"?current.replayStats:{};
  const nextRecord={
    ...current,
    replayStats:{
      replayCount:Math.max(0,Math.trunc(Number(replayStats.replayCount)||0))+1,
      lastReplayAt:Date.now(),
      lastReplayStatus:safeString(status,40)||"",
      lastReplayOutputSha256:safeString(outputSha256,80)||"",
      lastReplayDiffRate:Number.isFinite(Number(similarity))?Number(Number(similarity).toFixed(4)):0,
    },
    updatedAt:Date.now(),
  };
  return rememberReplayMemoryRecord(nextRecord,{persist:true});
}
function computeTokenJaccardRate(leftText,rightText){
  const leftTokens=String(leftText||"").toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean).slice(0,2000);
  const rightTokens=String(rightText||"").toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean).slice(0,2000);
  if(!leftTokens.length&&!rightTokens.length)return 1;
  const leftSet=new Set(leftTokens);
  const rightSet=new Set(rightTokens);
  let intersection=0;
  for(const token of leftSet){
    if(rightSet.has(token))intersection+=1;
  }
  const union=leftSet.size+rightSet.size-intersection;
  if(union<=0)return 0;
  return intersection/union;
}
function buildReplayDiffMetrics(baselineText,replayText){
  const left=String(baselineText||"");
  const right=String(replayText||"");
  const leftHash=hashSha256Hex(left);
  const rightHash=hashSha256Hex(right);
  const maxChars=Math.max(left.length,right.length,1);
  const lengthDelta=Math.abs(left.length-right.length);
  const lengthSimilarity=1-(lengthDelta/maxChars);
  const tokenJaccard=computeTokenJaccardRate(left,right);
  const similarity=Math.max(0,Math.min(1,(lengthSimilarity*0.4)+(tokenJaccard*0.6)));
  return{
    baselineHash:leftHash,
    replayHash:rightHash,
    exactMatch:leftHash===rightHash?1:0,
    baselineChars:left.length,
    replayChars:right.length,
    lengthDelta,
    tokenJaccard:Number(tokenJaccard.toFixed(4)),
    similarity:Number(similarity.toFixed(4)),
  };
}
function parseNdjsonEvents(rawText){
  const lines=String(rawText||"").split(/\r?\n/);
  const events=[];
  for(const line of lines){
    const trimmed=line.trim();
    if(!trimmed)continue;
    try{
      const parsed=JSON.parse(trimmed);
      if(parsed&&typeof parsed==="object"){
        events.push(parsed);
      }
    }catch{
    }
  }
  return events;
}
async function runInternalExecRequest(payload,{timeoutMs=evalCaseTimeoutMs}={}){
  const port=Number.isFinite(Number(webPort))&&Number(webPort)>0?Math.trunc(Number(webPort)):Math.trunc(Number(forcedUiPort)||57525);
  const bodyObject=payload&&typeof payload==="object"?payload:{};
  const bodyText=JSON.stringify(bodyObject);
  const origin=`http://127.0.0.1:${port}`;
  return new Promise((resolve,reject)=>{
    const startedAt=Date.now();
    const req=http.request({
      hostname:"127.0.0.1",
      port,
      path:"/api/exec",
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Content-Length":Buffer.byteLength(bodyText),
        [controlApiTokenHeaderName]:controlApiToken,
        "Origin":origin,
        "Referer":`${origin}/`,
      },
    },res=>{
      let raw="";
      res.on("data",chunk=>{raw+=chunk.toString("utf8");});
      res.on("end",()=>{
        const elapsedMs=Math.max(0,Date.now()-startedAt);
        const contentType=safeString(String(res.headers&&res.headers["content-type"]||""),120).toLowerCase();
        const statusCode=Number.isFinite(Number(res.statusCode))?Math.trunc(Number(res.statusCode)):0;
        if(contentType.includes("application/json")){
          let parsed=null;
          try{
            parsed=raw?JSON.parse(raw):{};
          }catch(error){
            reject(new Error(`internal exec json parse failed: ${error&&error.message?error.message:String(error)}`));
            return;
          }
          const resolution=buildInternalExecJsonResolution(parsed,statusCode);
          resolve({
            httpStatus:statusCode,
            stream:false,
            elapsedMs,
            status:resolution.status,
            finalText:resolution.finalText,
            errorText:resolution.errorText,
            taskOutcomeStatus:resolution.taskOutcomeStatus,
            taskOutcomeReason:resolution.taskOutcomeReason,
            turnId:resolution.turnId,
            threadId:resolution.threadId,
            events:[],
            duplicate:parsed&&parsed.duplicate?1:0,
            payload:parsed,
          });
          return;
        }
        const events=parseNdjsonEvents(raw);
        let finalText="";
        let latestDelta="";
        let status="";
        let errorText="";
        let taskOutcomeStatus="";
        let taskOutcomeReason="";
        let turnId="";
        let threadId="";
        for(const event of events){
          if(event&&event.type==="delta"&&typeof event.text==="string"){
            latestDelta+=event.text;
          }
          if(event&&event.type==="final"&&typeof event.text==="string"){
            finalText=event.text;
          }
          if(event&&event.type==="status"&&typeof event.status==="string"){
            status=event.status;
          }
          if(event&&event.type==="error"&&typeof event.text==="string"&&!errorText){
            errorText=event.text;
          }
          if(event&&event.type==="turn"&&event.phase==="started"){
            turnId=safeString(event.turnId,160)||turnId;
            threadId=safeString(event.threadId,160)||threadId;
          }
          if(event&&event.type==="turn"&&event.phase==="completed"){
            status=safeString(event.status,40)||status;
            taskOutcomeStatus=safeString(event.taskOutcomeStatus,80).toUpperCase()||taskOutcomeStatus;
            taskOutcomeReason=safeString(event.taskOutcomeReason,120)||taskOutcomeReason;
            turnId=safeString(event.turnId,160)||turnId;
            threadId=safeString(event.threadId,160)||threadId;
          }
        }
        const normalizedStatus=normalizeExecutionState(status||((statusCode>=200&&statusCode<300)?"completed":"failed"),{terminalFallback:true});
        resolve({
          httpStatus:statusCode,
          stream:true,
          elapsedMs,
          status:normalizedStatus,
          finalText:finalText||latestDelta,
          errorText:safeString(errorText,12000),
          taskOutcomeStatus,
          taskOutcomeReason,
          turnId,
          threadId,
          events,
          duplicate:0,
          payload:null,
        });
      });
    });
    req.on("error",error=>reject(error));
    req.setTimeout(Math.max(1000,Math.trunc(Number(timeoutMs)||evalCaseTimeoutMs)),()=>{
      req.destroy(new Error("internal exec request timed out"));
    });
    req.write(bodyText);
    req.end();
  });
}
function normalizeEvalVariant(input,index){
  const payload=input&&typeof input==="object"?input:{};
  const fallbackLabel=index===0?"A":index===1?"B":`variant-${index+1}`;
  return{
    label:safeString(payload.label,40)||fallbackLabel,
    agentName:normalizeAgentName(payload.agentName)||defaultExecAgentName,
    model:normalizeExecModel(payload.model,defaultExecModelName),
    modelReasoningEffort:normalizeExecModelReasoningEffort(payload.modelReasoningEffort,defaultExecModelReasoningEffort),
    sandboxMode:normalizeSandboxMode(payload.sandboxMode||"workspace-write"),
    approvalPolicy:normalizeApprovalPolicy(payload.approvalPolicy||"never"),
    webSearch:normalizeBooleanFlag(payload.webSearch),
    cwd:normalizeWorkingDirectory(payload.cwd,workspaceRoot),
    requestUserInputPolicy:normalizeRequestUserInputPolicy(payload.requestUserInputPolicy,"blocked"),
    executionProfile:normalizeExecutionProfile(payload.executionProfile,"eval-standard"),
    executionIntent:normalizeExecutionIntent(payload.executionIntent,"eval"),
    executionSource:safeString(payload.executionSource,80)||"eval_harness",
  };
}
function executeEvalProbeCase(evalCase,variant){
  const input=evalCase&&evalCase.input&&typeof evalCase.input==="object"?evalCase.input:{};
  const driver=safeString(evalCase&&evalCase.driver,80).toLowerCase()||"exec";
  switch(driver){
  case "agent_governance_probe":
    return evaluateAgentGovernance({
      agentName:safeString(input.agentName,120)||variant.agentName,
      operation:safeString(input.operation,80)||"fileChange",
      changedPaths:Array.isArray(input.changedPaths)
        ?input.changedPaths.map((entry)=>safeString(entry,260)).filter(Boolean).slice(0,24)
        :[],
      override:input.override&&typeof input.override==="object"?input.override:null,
    });
  case "agent_registry_probe":
    return validateRequestedAgentName(safeString(input.agentName,120)||variant.agentName);
  case "idempotency_bridge_probe":{
    const probeKey=safeString(input.key,120)||"eval-idempotency-bridge";
    const probeRecord={
      key:probeKey,
      state:safeString(input.state,40)||"terminal",
      createdAt:1,
      updatedAt:2,
      expiresAt:3,
      responseClosedAt:4,
      responseCloseDisposition:safeString(input.responseCloseDisposition,40)||"post_terminal",
      metadata:{
        method:"POST",
        path:"/api/exec",
        requestHash:"eval-probe",
      },
      outcome:{
        status:safeString(input.outcomeStatus,40)||"failed",
        taskOutcomeStatus:safeString(input.taskOutcomeStatus,80).toUpperCase()||"",
        taskOutcomeReason:safeString(input.taskOutcomeReason,120)||"",
        error:safeString(input.errorText,500)||"",
        completedAt:5,
      },
    };
    const snapshot=buildExecIdempotencySnapshot(probeKey,probeRecord);
    const terminalStatus=resolveExecTerminalStatusFromSnapshot(snapshot);
    const duplicateOk=isSuccessfulExecTerminalStatus(terminalStatus);
    const internalExecResolution=buildInternalExecJsonResolution({
      ok:duplicateOk,
      duplicate:true,
      idempotency:snapshot,
      result:snapshot&&snapshot.outcome?snapshot.outcome:null,
    },duplicateOk?200:409);
    return{
      lifecycleState:snapshot&&snapshot.lifecycleState?snapshot.lifecycleState:"",
      terminalStatus,
      outcomeStatus:snapshot&&snapshot.outcome&&snapshot.outcome.status?snapshot.outcome.status:"",
      duplicateOk,
      internalExecStatus:internalExecResolution.status,
      taskOutcomeStatus:internalExecResolution.taskOutcomeStatus,
      taskOutcomeReason:internalExecResolution.taskOutcomeReason,
    };
  }
  case "task_outcome_probe":
    return deriveTaskOutcome({
      turnStatus:safeString(input.turnStatus,80),
      explicitStatus:safeString(input.explicitStatus,80),
      reason:safeString(input.reason,120),
      approvalReason:safeString(input.approvalReason,120),
      governanceReason:safeString(input.governanceReason,120),
      errorText:safeString(input.errorText,2400),
      parentDispatchViolation:Boolean(input.parentDispatchViolation),
      missingEvidence:Boolean(input.missingEvidence),
      partial:Boolean(input.partial),
      spec:taskOutcomeContract,
    });
  case "turn_task_outcome_probe":
    {
      const result=validateTurnTaskOutcomeContract({
        turnStatus:safeString(input.turnStatus,80),
        taskOutcomeStatus:safeString(input.taskOutcomeStatus,80),
        spec:harnessTurnContractSpec,
      });
      return{
        ...result,
        reason:result&&result.ok?"compatible":safeString(result&&result.reason,80)||"incompatible",
      };
    }
  case "parent_dispatch_guard_probe":
    return evaluateParentDispatchGuard({
      mode:safeString(input.mode,20)||"enforce",
      parentAgents:Array.isArray(input.parentAgents)&&input.parentAgents.length
        ?input.parentAgents.map((entry)=>safeString(entry,80)).filter(Boolean)
        :Array.from(parentAgentNames.values()),
      agentName:safeString(input.agentName,120)||variant.agentName,
      executionProfile:safeString(input.executionProfile,80)||variant.executionProfile,
      finalStatus:safeString(input.finalStatus,80)||"completed",
      fileChanges:input.fileChanges,
      changedFiles:input.changedFiles,
      commandExecutions:input.commandExecutions,
      mcpCalls:input.mcpCalls,
      dispatchCount:input.dispatchCount,
      dispatchSuccessCount:input.dispatchSuccessCount,
      dispatchFailureCount:input.dispatchFailureCount,
      collabCalls:input.collabCalls,
      attempt:input.attempt,
      maxRetries:input.maxRetries,
    });
  case "request_user_input_probe":
    return resolveNonInteractiveUserInput({
      policy:safeString(input.policy,40)||variant.requestUserInputPolicy||nonInteractiveRequestUserInputPolicy,
      params:input.params&&typeof input.params==="object"?input.params:{},
    });
  case "requirement_rbj_probe":
    return resolveRequirementRbjState({
      prompt:safeString(input.prompt,12000),
      options:input.options&&typeof input.options==="object"?input.options:{},
      config:getRequirementRbjConfig(process.env),
    });
  case "planning_mode_probe":{
    const planningProbe=sanitizePlanningArtifactsForRuntime(buildPlanningArtifacts({
      prompt:safeString(input.prompt,24000)||evalCase.prompt||"",
      options:input.options&&typeof input.options==="object"?input.options:variant,
      contract:{planning:planningModeContract,assurance:assuranceModeContract},
    }));
    return{
      selectedMode:safeString(planningProbe&&planningProbe.selection&&planningProbe.selection.selectedMode,40)||"NORMAL",
      selectedPlanningDepth:safeString(planningProbe&&planningProbe.selection&&planningProbe.selection.selectedPlanningDepth,60)||"STANDARD_PLANNING",
      selectedAssuranceDepth:safeString(planningProbe&&planningProbe.selection&&planningProbe.selection.selectedAssuranceDepth,60)||"STANDARD_ASSURANCE",
      flowPath:safeString(planningProbe&&planningProbe.selection&&planningProbe.selection.flowPath,80)||"NORMAL_PATH",
      executionFlow:safeString(planningProbe&&planningProbe.selection&&planningProbe.selection.executionFlow,120)||"",
      needsInputRecommended:planningProbe&&planningProbe.selection&&planningProbe.selection.needsInputRecommended?1:0,
      openQuestionsCount:Number.isFinite(Number(planningProbe&&planningProbe.selection&&planningProbe.selection.signals&&planningProbe.selection.signals.openQuestionsCount))
        ?Math.max(0,Math.trunc(Number(planningProbe.selection.signals.openQuestionsCount)))
        :0,
      specialistBoundaryCount:Number.isFinite(Number(planningProbe&&planningProbe.selection&&planningProbe.selection.signals&&planningProbe.selection.signals.specialistBoundaryCount))
        ?Math.max(0,Math.trunc(Number(planningProbe.selection.signals.specialistBoundaryCount)))
        :0,
      acceptanceClarity:safeString(planningProbe&&planningProbe.selection&&planningProbe.selection.signals&&planningProbe.selection.signals.acceptanceClarity,40)||"low",
    };
  }
  case "planning_contract_probe":{
    const planningProbe=sanitizePlanningArtifactsForRuntime(buildPlanningArtifacts({
      prompt:safeString(input.prompt,24000)||evalCase.prompt||"",
      options:input.options&&typeof input.options==="object"?input.options:variant,
      contract:{planning:planningModeContract,assurance:assuranceModeContract},
    }));
    const dispatches=Array.isArray(planningProbe&&planningProbe.dispatchPlan&&planningProbe.dispatchPlan.dispatches)
      ?planningProbe.dispatchPlan.dispatches
      :[];
    const ownerAgents=dispatches.map((entry)=>safeString(entry&&entry.ownerAgent,80)).filter(Boolean);
    const ownedPaths=dispatches.flatMap((entry)=>Array.isArray(entry&&entry.ownedPaths)?entry.ownedPaths:[]);
    const hasPathLeak=ownedPaths.some((entry)=>{
      const normalized=normalizeMergePath(entry);
      return normalized.startsWith("..")||normalized.includes("../");
    });
    return{
      selectedMode:safeString(planningProbe&&planningProbe.selection&&planningProbe.selection.selectedMode,40)||"NORMAL",
      selectedPlanningDepth:safeString(planningProbe&&planningProbe.selection&&planningProbe.selection.selectedPlanningDepth,60)||"STANDARD_PLANNING",
      selectedAssuranceDepth:safeString(planningProbe&&planningProbe.selection&&planningProbe.selection.selectedAssuranceDepth,60)||"STANDARD_ASSURANCE",
      flowPath:safeString(planningProbe&&planningProbe.selection&&planningProbe.selection.flowPath,80)||"NORMAL_PATH",
      executionFlow:safeString(planningProbe&&planningProbe.selection&&planningProbe.selection.executionFlow,120)||"",
      proposalOnly:planningProbe&&planningProbe.dispatchPlan&&planningProbe.dispatchPlan.proposalOnly?1:0,
      reviewerRequired:planningProbe&&planningProbe.dispatchPlan&&planningProbe.dispatchPlan.reviewerRequired?1:0,
      testerRequired:planningProbe&&planningProbe.dispatchPlan&&planningProbe.dispatchPlan.testerRequired?1:0,
      signoffRequired:planningProbe&&planningProbe.dispatchPlan&&planningProbe.dispatchPlan.signoffRequired?1:0,
      dedicatedTestsRequired:planningProbe&&planningProbe.dispatchPlan&&planningProbe.dispatchPlan.dedicatedTestsRequired?1:0,
      dispatchCount:dispatches.length,
      ownerAgents,
      contextLeakageRisk:hasPathLeak?1:0,
      requirementOpenQuestionsCount:Array.isArray(planningProbe&&planningProbe.requirementContract&&planningProbe.requirementContract.openQuestions)
        ?planningProbe.requirementContract.openQuestions.length
        :0,
    };
  }
  case "adversarial_shadow_probe":
    {
      const review=buildAdversarialShadowReview({
        prompt:safeString(input.request,12000)||safeString(input.prompt,12000),
        answer:safeString(input.assistantResponse,16000)||safeString(input.answer,16000),
        status:safeString(input.turnStatus,40)||(
          safeString(input.taskOutcomeStatus,80).toUpperCase()==="COMPLETED"?"completed":"failed"
        ),
        minScore:input.minScore,
        maxPromptChars:input.maxPromptChars,
        maxAnswerChars:input.maxAnswerChars,
        responseContract:userFacingResponseContract,
      });
      const finding=Array.isArray(review&&review.red&&review.red.findings)
        ?review.red.findings.find((entry)=>safeString(entry&&entry.id,80)==="exact_reply_contract_mismatch")
        :null;
      return{
        ...review,
        decision:finding?"FAILED_VALIDATION":safeString(review&&review.decision,40)||"PASS",
        reason:finding?"exact_reply_contract_mismatch":safeString(review&&review.decision,80)||"pass",
      };
    }
  case "adversarial_loop_probe":
    {
      const loopResult=shouldRetryAdversarialLoop({
        enabled:Boolean(input.enabled),
        finalStatus:safeString(input.finalStatus,40)||(
          safeString(input.decision,80).toUpperCase()==="FAILED_VALIDATION"?"failed":"completed"
        ),
        taskOutcomeStatus:safeString(input.taskOutcomeStatus,80)||safeString(input.decision,80),
        decision:safeString(input.decision,80),
        attempt:input.attempt,
        maxRetries:input.maxRetries,
        clientClosed:Boolean(input.clientClosed),
        writable:input.writable===undefined?true:Boolean(input.writable),
      });
      if(loopResult&&loopResult.retry&&safeString(input.decision,80).toUpperCase()==="FAILED_VALIDATION"){
        return{...loopResult,reason:"adversarial_failed_validation_retry"};
      }
      return loopResult;
    }
  default:
    throw new Error(`unsupported eval driver: ${driver}`);
  }
}
function buildEvalSuiteSummary(suite){
  const normalized=suite&&typeof suite==="object"?suite:{cases:[]};
  return{
    schema:safeString(normalized.schema,80)||"harness-eval-suite.v1",
    suiteId:safeString(normalized.suiteId,120)||"unknown",
    description:safeString(normalized.description,400)||"",
    caseCount:Array.isArray(normalized.cases)?normalized.cases.length:0,
    caseIds:Array.isArray(normalized.cases)?normalized.cases.map((entry)=>safeString(entry&&entry.id,120)).filter(Boolean):[],
    outputSchema:normalized.outputSchema&&typeof normalized.outputSchema==="object"?normalized.outputSchema:{},
  };
}
function buildEvalProbeSyntheticTurnId({evalRunId,variantLabel,caseId}={}){
  const runId=safeString(evalRunId,120).toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  const label=safeString(variantLabel,40).toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  const probeCaseId=safeString(caseId,120).toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
  return `eval-probe-${runId||Date.now()}-${label||"variant"}-${probeCaseId||"case"}`;
}
function buildEvalProbeObservedSignals({evalCase,probeResult}={}){
  const input=evalCase&&evalCase.input&&typeof evalCase.input==="object"?evalCase.input:{};
  const result=probeResult&&typeof probeResult==="object"?probeResult:{};
  const resultWork=result.work&&typeof result.work==="object"?result.work:{};
  const resultDispatch=result.dispatch&&typeof result.dispatch==="object"?result.dispatch:{};
  const changedFilesCount=Array.isArray(input.changedFiles)
    ?input.changedFiles.map((entry)=>safeString(entry,220)).filter(Boolean).length
    :Number.isFinite(Number(input.changedFiles))
      ?Math.max(0,Math.trunc(Number(input.changedFiles)))
      :0;
  return{
    fileChanges:Number.isFinite(Number(input.fileChanges))
      ?Math.max(0,Math.trunc(Number(input.fileChanges)))
      :Number.isFinite(Number(resultWork.fileChanges))
        ?Math.max(0,Math.trunc(Number(resultWork.fileChanges)))
        :0,
    changedFiles:changedFilesCount>0
      ?changedFilesCount
      :Number.isFinite(Number(resultWork.changedFiles))
        ?Math.max(0,Math.trunc(Number(resultWork.changedFiles)))
        :0,
    commandExecutions:Number.isFinite(Number(input.commandExecutions))
      ?Math.max(0,Math.trunc(Number(input.commandExecutions)))
      :Number.isFinite(Number(resultWork.commandExecutions))
        ?Math.max(0,Math.trunc(Number(resultWork.commandExecutions)))
        :0,
    mcpCalls:Number.isFinite(Number(input.mcpCalls))
      ?Math.max(0,Math.trunc(Number(input.mcpCalls)))
      :Number.isFinite(Number(resultWork.mcpCalls))
        ?Math.max(0,Math.trunc(Number(resultWork.mcpCalls)))
        :0,
    collabCalls:Number.isFinite(Number(input.collabCalls))
      ?Math.max(0,Math.trunc(Number(input.collabCalls)))
      :Number.isFinite(Number(resultDispatch.collabCalls))
        ?Math.max(0,Math.trunc(Number(resultDispatch.collabCalls)))
        :0,
    dispatchCount:Number.isFinite(Number(input.dispatchCount))
      ?Math.max(0,Math.trunc(Number(input.dispatchCount)))
      :Number.isFinite(Number(resultDispatch.attempts))
        ?Math.max(0,Math.trunc(Number(resultDispatch.attempts)))
        :0,
    dispatchSuccessCount:Number.isFinite(Number(input.dispatchSuccessCount))
      ?Math.max(0,Math.trunc(Number(input.dispatchSuccessCount)))
      :Number.isFinite(Number(resultDispatch.successes))
        ?Math.max(0,Math.trunc(Number(resultDispatch.successes)))
        :0,
    dispatchFailureCount:Number.isFinite(Number(input.dispatchFailureCount))
      ?Math.max(0,Math.trunc(Number(input.dispatchFailureCount)))
      :Number.isFinite(Number(resultDispatch.failures))
        ?Math.max(0,Math.trunc(Number(resultDispatch.failures)))
        :0,
  };
}
function deriveEvalProbePersistenceMetadata({evalCase,probeResult}={}){
  const driver=safeString(evalCase&&evalCase.driver,80).toLowerCase()||"exec";
  const result=probeResult&&typeof probeResult==="object"?probeResult:{};
  if(driver==="task_outcome_probe"){
    const taskOutcomeStatus=safeString(result.status,80).toUpperCase();
    if(taskOutcomeStatus){
      return{
        status:"failed",
        taskOutcomeStatus,
        taskOutcomeReason:safeString(result.reason,120)||"",
        errorText:`eval probe resolved ${taskOutcomeStatus}${result.reason?` (${safeString(result.reason,120)})`:""}`,
        parentDispatchGuard:null,
      };
    }
  }
  if(driver==="parent_dispatch_guard_probe"){
    const parentDispatchGuard={
      mode:safeString(result.mode,20)||"off",
      reason:safeString(result.reason,120)||"",
      required:result.required?1:0,
      satisfied:result.satisfied?1:0,
      violation:result.violation?1:0,
      dispatch:result.dispatch&&typeof result.dispatch==="object"
        ?{
          attempts:Number.isFinite(Number(result.dispatch.attempts))?Math.max(0,Math.trunc(Number(result.dispatch.attempts))):0,
          successes:Number.isFinite(Number(result.dispatch.successes))?Math.max(0,Math.trunc(Number(result.dispatch.successes))):0,
          failures:Number.isFinite(Number(result.dispatch.failures))?Math.max(0,Math.trunc(Number(result.dispatch.failures))):0,
          collabCalls:Number.isFinite(Number(result.dispatch.collabCalls))?Math.max(0,Math.trunc(Number(result.dispatch.collabCalls))):0,
        }
        :{
          attempts:Number.isFinite(Number(result.dispatchCount))?Math.max(0,Math.trunc(Number(result.dispatchCount))):0,
          successes:Number.isFinite(Number(result.dispatchSuccessCount))?Math.max(0,Math.trunc(Number(result.dispatchSuccessCount))):0,
          failures:Number.isFinite(Number(result.dispatchFailureCount))?Math.max(0,Math.trunc(Number(result.dispatchFailureCount))):0,
          collabCalls:Number.isFinite(Number(result.collabCalls))?Math.max(0,Math.trunc(Number(result.collabCalls))):0,
        },
    };
    const violation=Boolean(parentDispatchGuard.violation&&parentDispatchGuard.mode==="enforce");
    return{
      status:violation?"failed":"completed",
      taskOutcomeStatus:violation?"FAILED_VALIDATION":"",
      taskOutcomeReason:violation?"parent_dispatch_guard_block":"",
      errorText:violation
        ?`parent dispatch guard blocked completion (${parentDispatchGuard.reason||"dispatch_required"})`
        :"",
      parentDispatchGuard,
    };
  }
  if(driver==="request_user_input_probe"&&safeString(result.decision,80).toLowerCase()==="blocked"){
    return{
      status:"failed",
      taskOutcomeStatus:"NEEDS_INPUT",
      taskOutcomeReason:"interactive_approval_unavailable",
      errorText:"non-interactive request_user_input was blocked",
      parentDispatchGuard:null,
    };
  }
  return null;
}
function buildEvalProbeExecutionMemoryRecord({evalRunId,variant,evalCase,probeResult,startedAt,completedAt}={}){
  const metadata=deriveEvalProbePersistenceMetadata({evalCase,probeResult});
  if(!metadata)return null;
  const payloadText=JSON.stringify(probeResult||{});
  const turnId=buildEvalProbeSyntheticTurnId({
    evalRunId,
    variantLabel:variant&&variant.label,
    caseId:evalCase&&evalCase.id,
  });
  const dispatch=metadata.parentDispatchGuard&&metadata.parentDispatchGuard.dispatch&&typeof metadata.parentDispatchGuard.dispatch==="object"
    ?metadata.parentDispatchGuard.dispatch
    :{attempts:0,successes:0,failures:0,collabCalls:0};
  const observedSignals=buildEvalProbeObservedSignals({evalCase,probeResult});
  return{
    turnId,
    threadId:`eval-probe-${safeString(evalRunId,120)||Date.now()}`,
    agentName:safeString(variant&&variant.agentName,120)||defaultExecAgentName,
    status:metadata.status,
    taskOutcomeStatus:metadata.taskOutcomeStatus,
    taskOutcomeReason:metadata.taskOutcomeReason,
    terminalEvent:"turn/completed",
    errorText:metadata.errorText,
    executionProfile:normalizeExecutionProfile(variant&&variant.executionProfile,"eval-standard"),
    executionIntent:normalizeExecutionIntent(variant&&variant.executionIntent,"eval"),
    executionSource:"eval_harness_probe",
    startedAt:normalizeMemoryTimestamp(startedAt,Date.now()),
    completedAt:normalizeMemoryTimestamp(completedAt,Date.now()),
    updatedAt:normalizeMemoryTimestamp(completedAt,Date.now()),
    outputSha256:hashSha256Hex(payloadText),
    outputChars:payloadText.length,
    observedSignals:{
      ...observedSignals,
      collabCalls:Math.max(0,Math.trunc(Number(observedSignals.collabCalls||dispatch.collabCalls||0))),
      dispatchCount:Math.max(0,Math.trunc(Number(observedSignals.dispatchCount||dispatch.attempts||0))),
      dispatchSuccessCount:Math.max(0,Math.trunc(Number(observedSignals.dispatchSuccessCount||dispatch.successes||0))),
      dispatchFailureCount:Math.max(0,Math.trunc(Number(observedSignals.dispatchFailureCount||dispatch.failures||0))),
    },
    parentDispatchGuard:metadata.parentDispatchGuard,
  };
}
function buildEvalProbePersistenceSnapshot(record,evalCase){
  const normalized=normalizeExecutionMemoryRecord(record);
  if(!normalized)return null;
  return{
    caseId:safeString(evalCase&&evalCase.id,120)||"",
    title:safeString(evalCase&&evalCase.title,200)||"",
    turnId:normalized.turnId,
    status:normalized.status,
    taskOutcomeStatus:normalized.taskOutcomeStatus,
    taskOutcomeReason:normalized.taskOutcomeReason,
    executionSource:normalized.executionSource,
    parentDispatchGuard:normalized.parentDispatchGuard,
  };
}
async function executeEvalVariantOnSuite({variant,suite,maxCases,timeoutMs,evalRunId="",persistProbeResults=false}){
  const selectedCases=(Array.isArray(suite&&suite.cases)?suite.cases:[]).slice(0,Math.max(1,Math.min(evalMaxCases,Math.trunc(Number(maxCases)||evalMaxCases))));
  const startedAt=Date.now();
  const caseResults=[];
  const persistedProbeRecords=[];
  for(const evalCase of selectedCases){
    const caseStartedAt=Date.now();
    let execResult=null;
    let status="failed";
    let finalText="";
    let errorText="";
    let latencyMs=0;
    let pendingProbeMemoryRecord=null;
    try{
      if((safeString(evalCase&&evalCase.driver,80).toLowerCase()||"exec")==="exec"){
        const requestBody={
          prompt:evalCase.prompt,
          sandboxMode:variant.sandboxMode,
          approvalPolicy:variant.approvalPolicy,
          webSearch:variant.webSearch?1:0,
          model:variant.model,
          modelReasoningEffort:variant.modelReasoningEffort,
          forceNewSession:true,
          agentName:variant.agentName,
          cwd:variant.cwd,
          requestUserInputPolicy:variant.requestUserInputPolicy,
          executionProfile:variant.executionProfile,
          executionIntent:variant.executionIntent,
          executionSource:variant.executionSource,
          idempotencyKey:`eval-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        };
        execResult=await runInternalExecRequest(requestBody,{timeoutMs});
        status=normalizeExecutionState(execResult.status,{terminalFallback:true});
        finalText=safeString(execResult.finalText,12000)||"";
        errorText=safeString(execResult.errorText,1200)||"";
        latencyMs=Number.isFinite(Number(execResult.elapsedMs))?Math.max(0,Math.trunc(Number(execResult.elapsedMs))):Math.max(0,Date.now()-caseStartedAt);
      }else{
        const probeResult=executeEvalProbeCase(evalCase,variant);
        execResult={
          status:"completed",
          finalText:JSON.stringify(probeResult),
          errorText:"",
          elapsedMs:Math.max(0,Date.now()-caseStartedAt),
          taskOutcomeStatus:"",
          taskOutcomeReason:"",
          turnId:"",
        };
        status="completed";
        finalText=safeString(execResult.finalText,12000)||"";
        errorText="";
        latencyMs=execResult.elapsedMs;
        if(persistProbeResults){
          const probeCompletedAt=caseStartedAt+latencyMs;
          pendingProbeMemoryRecord=buildEvalProbeExecutionMemoryRecord({
            evalRunId,
            variant,
            evalCase,
            probeResult,
            startedAt:caseStartedAt,
            completedAt:probeCompletedAt,
          });
          if(pendingProbeMemoryRecord){
            rememberExecutionMemoryRecord(pendingProbeMemoryRecord,{persist:false});
            const persistenceSnapshot=buildEvalProbePersistenceSnapshot(pendingProbeMemoryRecord,evalCase);
            if(persistenceSnapshot)persistedProbeRecords.push(persistenceSnapshot);
            execResult.taskOutcomeStatus=pendingProbeMemoryRecord.taskOutcomeStatus;
            execResult.taskOutcomeReason=pendingProbeMemoryRecord.taskOutcomeReason;
            execResult.turnId=pendingProbeMemoryRecord.turnId;
            status=pendingProbeMemoryRecord.status;
            errorText=pendingProbeMemoryRecord.errorText;
          }
        }
      }
    }catch(error){
      status="failed";
      finalText="";
      errorText=error&&error.message?error.message:String(error);
      latencyMs=Math.max(0,Date.now()-caseStartedAt);
    }
    const caseResult=summarizeEvalCaseResult({
      evalCase,
      outputText:finalText,
      latencyMs,
      status,
      errorText,
      taskOutcomeStatus:execResult&&typeof execResult.taskOutcomeStatus==="string"?execResult.taskOutcomeStatus:"",
      taskOutcomeReason:execResult&&typeof execResult.taskOutcomeReason==="string"?execResult.taskOutcomeReason:"",
    });
    caseResult.turnId=execResult&&typeof execResult.turnId==="string"?safeString(execResult.turnId,160):"";
    caseResults.push(caseResult);
  }
  const summary=buildEvalRunSummary({
    suite,
    variant,
    caseResults,
    startedAt,
    completedAt:Date.now(),
  });
  if(persistProbeResults){
    summary.probePersistence={
      requested:1,
      persistedRecords:persistedProbeRecords.length,
      records:persistedProbeRecords,
    };
  }
  return summary;
}
function appendEvalRunHistory(record){
  const payload=record&&typeof record==="object"?record:null;
  if(!payload)return;
  try{
    fs.mkdirSync(path.dirname(evalRunHistoryPath),{recursive:true,mode:0o700});
    fs.appendFileSync(evalRunHistoryPath,`${JSON.stringify(payload)}\n`,"utf8");
    hardenFilePermissions(evalRunHistoryPath);
  }catch(error){
    logOperation("eval.history_append_failed",{
      path:summarizePathForOperationLog(evalRunHistoryPath,220),
      err:summarizeErrorForOperationLog(error,220),
    },"core");
  }
}
function readEvalRunHistory({limit=20}={}){
  const normalizedLimit=Math.max(1,Math.min(evalRunHistoryMaxLines,Math.trunc(Number(limit)||20)));
  if(!fs.existsSync(evalRunHistoryPath))return[];
  try{
    const raw=fs.readFileSync(evalRunHistoryPath,"utf8");
    const lines=raw.split(/\r?\n/).map((line)=>line.trim()).filter(Boolean);
    const selected=lines.slice(Math.max(0,lines.length-normalizedLimit));
    const parsed=[];
    for(const line of selected){
      try{
        const entry=JSON.parse(line);
        if(entry&&typeof entry==="object")parsed.push(entry);
      }catch{
      }
    }
    return parsed;
  }catch{
    return[];
  }
}
function percentile(values,p){
  const source=Array.isArray(values)?values.filter((value)=>Number.isFinite(Number(value))).map((value)=>Number(value)):[];
  if(!source.length)return 0;
  const sorted=source.sort((a,b)=>a-b);
  const rank=Math.min(sorted.length-1,Math.max(0,Math.ceil((p/100)*sorted.length)-1));
  return sorted[rank];
}
function buildSloRuntimeSnapshot({windowTurns=sloWindowTurns}={}){
  const normalizedWindow=Math.max(5,Math.min(500,Math.trunc(Number(windowTurns)||sloWindowTurns)));
  const records=[...harnessExecutionMemoryStore.values()]
    .map((entry)=>normalizeExecutionMemoryRecord(entry))
    .filter((entry)=>entry&&typeof entry==="object")
    .sort((a,b)=>Number(b.completedAt||0)-Number(a.completedAt||0))
    .slice(0,normalizedWindow);
  const sampleSize=records.length;
  const failedCount=records.filter((entry)=>entry.status!=="completed").length;
  const idempotencyConflicts=records.filter((entry)=>safeString(entry.errorText,2000).toLowerCase().includes("idempotency")).length;
  const retrySignals=records.filter((entry)=>entry.observedSignals&&Number(entry.observedSignals.dispatchFailureCount||0)>0).length;
  const latencies=records
    .map((entry)=>Math.max(0,Number(entry.completedAt||0)-Number(entry.startedAt||0)))
    .filter((value)=>Number.isFinite(Number(value)));
  const failureRate=sampleSize>0?failedCount/sampleSize:0;
  const idempotencyConflictRate=sampleSize>0?idempotencyConflicts/sampleSize:0;
  const retryRate=sampleSize>0?retrySignals/sampleSize:0;
  const p95LatencyMs=sampleSize>0?percentile(latencies,95):0;
  const avgLatencyMs=sampleSize>0?(latencies.reduce((sum,value)=>sum+Number(value||0),0)/sampleSize):0;
  const alerts=[];
  if(sampleSize>0&&failureRate>sloFailureRateMax){
    alerts.push({
      id:"failure_rate",
      value:Number(failureRate.toFixed(4)),
      threshold:sloFailureRateMax,
      detail:"Execution failure rate exceeded threshold.",
    });
  }
  if(sampleSize>0&&p95LatencyMs>sloLatencyP95MaxMs){
    alerts.push({
      id:"latency_p95_ms",
      value:Math.max(0,Math.trunc(p95LatencyMs)),
      threshold:sloLatencyP95MaxMs,
      detail:"P95 latency exceeded threshold.",
    });
  }
  if(sampleSize>0&&idempotencyConflictRate>sloIdempotencyConflictRateMax){
    alerts.push({
      id:"idempotency_conflict_rate",
      value:Number(idempotencyConflictRate.toFixed(4)),
      threshold:sloIdempotencyConflictRateMax,
      detail:"Idempotency conflict rate exceeded threshold.",
    });
  }
  const status=sampleSize===0?"insufficient_data":alerts.length>0?"degraded":"pass";
  return{
    status,
    generatedAt:Date.now(),
    windowTurns:normalizedWindow,
    sampleSize,
    thresholds:{
      failureRateMax:sloFailureRateMax,
      latencyP95MaxMs:sloLatencyP95MaxMs,
      idempotencyConflictRateMax:sloIdempotencyConflictRateMax,
    },
    metrics:{
      failureRate:Number(failureRate.toFixed(4)),
      p95LatencyMs:Math.max(0,Math.trunc(p95LatencyMs)),
      avgLatencyMs:Number(avgLatencyMs.toFixed(2)),
      idempotencyConflictRate:Number(idempotencyConflictRate.toFixed(4)),
      retryRate:Number(retryRate.toFixed(4)),
      completedCount:Math.max(0,sampleSize-failedCount),
      failedCount,
    },
    alerts,
  };
}
function maybeEmitSloAlert(snapshot,{reason="runtime"}={}){
  const current=snapshot&&typeof snapshot==="object"?snapshot:buildSloRuntimeSnapshot();
  const fingerprint=JSON.stringify({
    status:safeString(current.status,40)||"unknown",
    alerts:Array.isArray(current.alerts)?current.alerts.map((item)=>safeString(item&&item.id,80)).filter(Boolean):[],
  });
  if(fingerprint===lastSloAlertFingerprint)return;
  lastSloAlertFingerprint=fingerprint;
  if(current.status==="degraded"){
    logOperation("slo.degraded",{
      reason:safeString(reason,80)||"runtime",
      sampleSize:Number.isFinite(Number(current.sampleSize))?Math.max(0,Math.trunc(Number(current.sampleSize))):0,
      metrics:current.metrics||{},
      alerts:Array.isArray(current.alerts)?current.alerts:[],
    },"core");
  }else if(current.status==="pass"){
    logOperation("slo.recovered",{
      reason:safeString(reason,80)||"runtime",
      sampleSize:Number.isFinite(Number(current.sampleSize))?Math.max(0,Math.trunc(Number(current.sampleSize))):0,
      metrics:current.metrics||{},
    },"core");
  }
}
function isLoopbackHost(hostname){
  const value=String(hostname||"").trim().toLowerCase();
  return value==="127.0.0.1"||value==="localhost"||value==="::1"||value==="[::1]";
}
function parsePortFromHost(hostValue){
  const raw=String(hostValue||"").trim().toLowerCase();
  if(!raw)return"";
  if(raw.startsWith("[")){
    const end=raw.indexOf("]");
    if(end<0)return"";
    const rest=raw.slice(end+1);
    if(rest.startsWith(":"))return rest.slice(1);
    return"";
  }
  const index=raw.lastIndexOf(":");
  if(index<0)return"";
  return raw.slice(index+1);
}
function parseHostnameFromHost(hostValue){
  const raw=String(hostValue||"").trim().toLowerCase();
  if(!raw)return"";
  if(raw.startsWith("[")){
    const end=raw.indexOf("]");
    if(end<0)return raw.replace(/^\[/,"").replace(/\]$/,"");
    return raw.slice(1,end);
  }
  const index=raw.lastIndexOf(":");
  if(index<0)return raw;
  return raw.slice(0,index);
}
function parseOriginUrl(value){
  const raw=String(value||"").trim();
  if(!raw)return null;
  try{
    const url=new URL(raw);
    const protocol=String(url.protocol||"").toLowerCase();
    if(protocol!=="http:"&&protocol!=="https:")return null;
    return url;
  }catch{
    return null;
  }
}
function sameLocalOriginByPort(url,requestHost){
  if(!url)return false;
  const originHost=parseHostnameFromHost(url.host);
  const requestHostName=parseHostnameFromHost(requestHost);
  if(!isLoopbackHost(originHost)||!isLoopbackHost(requestHostName))return false;
  const originPort=url.port||"80";
  const requestPort=parsePortFromHost(requestHost)||"80";
  return originPort===requestPort;
}
function validateLocalOriginRequest(req){
  const requestHost=requestHeaderValue(req,"host");
  const origin=requestHeaderValue(req,"origin");
  const referer=requestHeaderValue(req,"referer");
  const originUrl=parseOriginUrl(origin);
  const refererUrl=parseOriginUrl(referer);
  const hasLocalOrigin=sameLocalOriginByPort(originUrl,requestHost)||sameLocalOriginByPort(refererUrl,requestHost);
  if(!hasLocalOrigin){
    return{ok:false,status:403,error:"forbidden origin"};
  }
  return{ok:true,status:200,error:""};
}
function validateControlMutationRequest(req,{action,requireAction=false,enforceActionAllowlist=true}={}){
  const requestHost=requestHeaderValue(req,"host");
  const origin=requestHeaderValue(req,"origin");
  const referer=requestHeaderValue(req,"referer");
  const originUrl=parseOriginUrl(origin);
  const refererUrl=parseOriginUrl(referer);
  const hasLocalOrigin=sameLocalOriginByPort(originUrl,requestHost)||sameLocalOriginByPort(refererUrl,requestHost);
  if(!hasLocalOrigin){
    return{ok:false,status:403,error:"forbidden origin"};
  }
  const providedToken=requestHeaderValue(req,controlApiTokenHeaderName).trim();
  if(!providedToken||providedToken!==controlApiToken){
    return{ok:false,status:403,error:"missing or invalid control token"};
  }
  const normalizedAction=safeString(action,80);
  if(requireAction&&!normalizedAction){
    return{ok:false,status:400,error:"action is required"};
  }
  if(normalizedAction&&enforceActionAllowlist&&!controlApiActionAllowlist.has(normalizedAction)){
    return{ok:false,status:400,error:`unsupported action: ${normalizedAction}`};
  }
  return{ok:true,status:200,error:""};
}
const controlApiToken=resolveControlApiToken();
const turnArtifactsEnabled=parseBooleanEnv("CODEX_TURN_ARTIFACTS_ENABLED",true);
const turnArtifactsRoot=(()=>{
  const override=typeof process.env.CODEX_TURN_ARTIFACTS_DIR==="string"?process.env.CODEX_TURN_ARTIFACTS_DIR.trim():"";
  const fallback=loggingSurfacePaths.archiveTurnsRoot;
  if(!override)return fallback;
  const resolved=path.isAbsolute(override)?path.normalize(override):path.normalize(path.join(workspaceRoot,override));
  return isPathWithin(workspaceRoot,resolved)?resolved:fallback;
})();
const turnArtifactsMaxBytes=parsePositiveIntEnv("CODEX_TURN_ARTIFACTS_MAX_BYTES",256*1024*1024,256*1024,2*1024*1024*1024);
const turnArtifactsMaxDays=parsePositiveIntEnv("CODEX_TURN_ARTIFACTS_MAX_DAYS",14,1,3650);
const turnArtifactsRedactionEnabled=parseBooleanEnv("CODEX_TURN_ARTIFACTS_REDACTION_ENABLED",true);
const turnArtifactsRedactionPlaceholder=(()=>{
  const raw=typeof process.env.CODEX_TURN_ARTIFACTS_REDACTION_PLACEHOLDER==="string"
    ?process.env.CODEX_TURN_ARTIFACTS_REDACTION_PLACEHOLDER.trim()
    :"";
  return raw?raw.slice(0,80):"[REDACTED]";
})();
const execIdempotencyStatusWaitMaxMs=parsePositiveIntEnv("CODEX_EXEC_IDEMPOTENCY_STATUS_WAIT_MAX_MS",30000,1000,180000);
const adversarialShadowDefaults=Object.freeze({
  enabled:true,
  minScore:72,
  maxPromptChars:8000,
  maxAnswerChars:16000,
});
const adversarialShadowEnabled=parseBooleanEnv("CODEX_ADVERSARIAL_SHADOW_ENABLED",adversarialShadowDefaults.enabled);
const adversarialShadowMinScore=parsePositiveIntEnv("CODEX_ADVERSARIAL_SHADOW_MIN_SCORE",adversarialShadowDefaults.minScore,0,100);
const adversarialShadowMaxPromptChars=parsePositiveIntEnv("CODEX_ADVERSARIAL_SHADOW_MAX_PROMPT_CHARS",adversarialShadowDefaults.maxPromptChars,200,48000);
const adversarialShadowMaxAnswerChars=parsePositiveIntEnv("CODEX_ADVERSARIAL_SHADOW_MAX_ANSWER_CHARS",adversarialShadowDefaults.maxAnswerChars,200,64000);
const adversarialLoopEnabled=parseBooleanEnv("CODEX_ADVERSARIAL_LOOP_ENABLED",true);
const adversarialLoopMaxRetries=parsePositiveIntEnv("CODEX_ADVERSARIAL_LOOP_MAX_RETRIES",1,0,6);
function buildParentDispatchGuardDefaultsSnapshot(){
  return buildParentDispatchGuardRuntimeSnapshot({
    mode:parentDispatchGuardMode,
    envKey:parentDispatchGuardModeEnvKey,
    maxRetries:parentDispatchGuardMaxRetries,
    parentAgents:Array.from(parentAgentNames.values()),
  });
}
function buildFullUtilizationDefaultsSnapshot(){
  const orchestratorDefault=defaultExecAgentName==="default";
  const requestUserInputBlocked=nonInteractiveRequestUserInputPolicy==="blocked";
  const shadowActive=Boolean(adversarialShadowEnabled);
  const loopActive=Boolean(adversarialShadowEnabled&&adversarialLoopEnabled);
  const ready=Boolean(orchestratorDefault&&requestUserInputBlocked&&shadowActive&&loopActive);
  return{
    expected:{
      defaultExecAgent:"default",
      requestUserInputPolicy:"blocked",
      adversarialShadowEnabled:1,
      adversarialLoopEnabled:1,
    },
    actual:{
      defaultExecAgent:defaultExecAgentName,
      requestUserInputPolicy:nonInteractiveRequestUserInputPolicy,
      adversarialShadowEnabled:shadowActive?1:0,
      adversarialLoopEnabled:loopActive?1:0,
      adversarialLoopMaxRetries:adversarialLoopMaxRetries,
    },
    checks:{
      defaultExecAgentIsDefault:orchestratorDefault?1:0,
      requestUserInputBlocked:requestUserInputBlocked?1:0,
      adversarialShadowEnabled:shadowActive?1:0,
      adversarialLoopEnabled:loopActive?1:0,
    },
    ready:ready?1:0,
  };
}
function buildExecutionRecipe({
  agentName,
  sandboxMode,
  approvalPolicy,
  cwd,
  model,
  modelReasoningEffort,
  requestUserInputPolicy,
  executionProfile,
  executionIntent,
  executionSource,
  webSearch,
}={}){
  const recipe={
    schema:"harness-repro-recipe.v1",
    apiVersion,
    environment:{
      node:safeString(process.version,40),
      platform:safeString(process.platform,40),
      arch:safeString(process.arch,40),
    },
    model:{
      id:normalizeExecModel(model,defaultExecModelName),
      reasoningEffort:normalizeExecModelReasoningEffort(modelReasoningEffort,defaultExecModelReasoningEffort),
    },
    runtime:{
      executionProfile:normalizeExecutionProfile(executionProfile,runtimeExecutionProfile),
      executionIntent:normalizeExecutionIntent(executionIntent,"interactive"),
      executionSource:safeString(executionSource,80)||"api_exec",
    },
    controls:{
      agentName:safeString(agentName,120)||defaultExecAgentName,
      sandboxMode:normalizeSandboxMode(sandboxMode),
      approvalPolicy:normalizeApprovalPolicy(approvalPolicy),
      cwd:safeString(cwd,220)||workspaceRoot,
      webSearch:webSearch?1:0,
      requestUserInputPolicy:normalizeRequestUserInputPolicy(requestUserInputPolicy,nonInteractiveRequestUserInputPolicy),
    },
    generatedAt:Date.now(),
  };
  recipe.hash=hashSha256Hex(JSON.stringify(recipe));
  return recipe;
}
function buildTurnVisibilitySnapshot(input={}){
  const meta=input&&typeof input==="object"?input:{};
  const requestProfile=normalizeExecutionProfile(meta.requestProfile,runtimeExecutionProfile);
  const executionIntent=normalizeExecutionIntent(meta.executionIntent,"interactive");
  const requestUserInputPolicy=normalizeRequestUserInputPolicy(meta.requestUserInputPolicy,nonInteractiveRequestUserInputPolicy);
  const turnAgentName=safeString(meta.agentName,120)||defaultExecAgentName;
  const reproProfile=isReproExecutionProfile(requestProfile);
  const defaultsSnapshot=buildFullUtilizationDefaultsSnapshot();
  const parentDispatchGuard=buildParentDispatchGuardDefaultsSnapshot();
  const planningContext=sanitizePlanningArtifactsForRuntime(meta.planningContext&&typeof meta.planningContext==="object"?meta.planningContext:{});
  const turnChecks={
    agentIsDefault:turnAgentName==="default"?1:0,
    requestUserInputBlocked:requestUserInputPolicy==="blocked"?1:0,
    adversarialShadowEnabled:adversarialShadowEnabled?1:0,
    adversarialLoopEnabled:adversarialShadowEnabled&&adversarialLoopEnabled?1:0,
  };
  const turnReady=Boolean(
    turnChecks.agentIsDefault
    &&turnChecks.requestUserInputBlocked
    &&turnChecks.adversarialShadowEnabled
    &&turnChecks.adversarialLoopEnabled
  );
  const recipe=buildExecutionRecipe({
    agentName:turnAgentName,
    sandboxMode:meta.sandboxMode,
    approvalPolicy:meta.approvalPolicy,
    cwd:meta.cwd,
    model:meta.model,
    modelReasoningEffort:meta.modelReasoningEffort,
    requestUserInputPolicy,
    executionProfile:requestProfile,
    executionIntent,
    executionSource:meta.executionSource,
    webSearch:normalizeBooleanFlag(meta.webSearch),
  });
  return{
    profile:{
      runtime:runtimeExecutionProfile,
      request:requestProfile,
      effective:requestProfile,
      envKey:executionProfileEnvKey,
      smokeLike:isSmokeExecutionProfile(requestProfile)?1:0,
      repro:reproProfile?1:0,
    },
    intent:executionIntent,
    recipe,
    defaults:defaultsSnapshot,
    parentDispatchGuard,
    planning:{
      mode:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedMode,40)||"NORMAL",
      depth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedPlanningDepth,60)||"STANDARD_PLANNING",
      assuranceDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedAssuranceDepth,60)||"STANDARD_ASSURANCE",
      flowPath:safeString(planningContext&&planningContext.selection&&planningContext.selection.flowPath,80)||"NORMAL_PATH",
      executionFlow:safeString(planningContext&&planningContext.selection&&planningContext.selection.executionFlow,120)||"",
      needsInputRecommended:planningContext&&planningContext.selection&&planningContext.selection.needsInputRecommended?1:0,
    },
    turn:{
      agentName:turnAgentName,
      requestUserInputPolicy,
      checks:turnChecks,
      ready:turnReady?1:0,
    },
  };
}
function normalizeObservedTurnSignals(value){
  const source=value&&typeof value==="object"?value:{};
  const itemCountsRaw=source.itemCounts&&typeof source.itemCounts==="object"?source.itemCounts:{};
  const itemCounts=Object.entries(itemCountsRaw).slice(0,20).reduce((acc,[key,count])=>{
    const normalizedKey=safeString(key,80);
    if(!normalizedKey)return acc;
    const normalizedCount=Number.isFinite(Number(count))?Math.max(0,Math.trunc(Number(count))):0;
    acc[normalizedKey]=normalizedCount;
    return acc;
  },{});
  const dispatchChildren=Array.isArray(source.dispatchChildren)
    ?source.dispatchChildren.map((entry)=>safeString(entry,120)).filter(Boolean).slice(0,8)
    :[];
  const sampleChangedPaths=Array.isArray(source.sampleChangedPaths)
    ?source.sampleChangedPaths.map((entry)=>safeString(entry,220)).filter(Boolean).slice(0,3)
    :[];
  return{
    commandExecutions:Number.isFinite(Number(source.commandExecutions))?Math.max(0,Math.trunc(Number(source.commandExecutions))):0,
    commandFailures:Number.isFinite(Number(source.commandFailures))?Math.max(0,Math.trunc(Number(source.commandFailures))):0,
    fileChanges:Number.isFinite(Number(source.fileChanges))?Math.max(0,Math.trunc(Number(source.fileChanges))):0,
    changedFiles:Number.isFinite(Number(source.changedFiles))?Math.max(0,Math.trunc(Number(source.changedFiles))):0,
    sampleChangedPaths,
    mcpCalls:Number.isFinite(Number(source.mcpCalls))?Math.max(0,Math.trunc(Number(source.mcpCalls))):0,
    collabCalls:Number.isFinite(Number(source.collabCalls))?Math.max(0,Math.trunc(Number(source.collabCalls))):0,
    collabFailures:Number.isFinite(Number(source.collabFailures))?Math.max(0,Math.trunc(Number(source.collabFailures))):0,
    webSearches:Number.isFinite(Number(source.webSearches))?Math.max(0,Math.trunc(Number(source.webSearches))):0,
    dispatchCount:Number.isFinite(Number(source.dispatchCount))?Math.max(0,Math.trunc(Number(source.dispatchCount))):0,
    dispatchSuccessCount:Number.isFinite(Number(source.dispatchSuccessCount))?Math.max(0,Math.trunc(Number(source.dispatchSuccessCount))):0,
    dispatchFailureCount:Number.isFinite(Number(source.dispatchFailureCount))?Math.max(0,Math.trunc(Number(source.dispatchFailureCount))):0,
    dispatchChildren,
    itemCounts,
  };
}
function normalizePortForOperationLogTag(value){
  const parsed=Number(value);
  if(Number.isInteger(parsed)&&parsed>0&&parsed<=65535)return String(parsed);
  return "port";
}
function normalizePidForOperationLogTag(value){
  const parsed=Number(value);
  if(Number.isInteger(parsed)&&parsed>0)return String(parsed);
  return "pid";
}
function buildProcessScopedOperationLogPath(filePath,portValue,pidValue){
  const parsed=path.parse(filePath);
  const ext=parsed.ext||".jsonl";
  const baseName=parsed.name||parsed.base||"codex_ops";
  const portTag=normalizePortForOperationLogTag(portValue);
  const pidTag=normalizePidForOperationLogTag(pidValue);
  return path.join(parsed.dir,`${baseName}_${portTag}_${pidTag}${ext}`);
}
function resolveOperationLogPath(){
  const override=typeof process.env.CODEX_OPERATION_LOG_PATH==="string"?process.env.CODEX_OPERATION_LOG_PATH.trim():"";
  const fallback=path.join(workspaceRoot,operationLogDefaults.relativePath);
  const resolvedBase=(()=>{
    if(!override)return fallback;
    const resolved=path.isAbsolute(override)?path.normalize(override):path.normalize(path.join(workspaceRoot,override));
    return isPathWithin(workspaceRoot,resolved)?resolved:fallback;
  })();
  const preferredPort=Number.isInteger(forcedUiPort)&&forcedUiPort>0?forcedUiPort:57525;
  return buildProcessScopedOperationLogPath(resolvedBase,preferredPort,process.pid);
}
function resolveOperationLogArchiveDir(logFilePath){
  const override=typeof process.env.CODEX_OPERATION_LOG_ARCHIVE_DIR==="string"?process.env.CODEX_OPERATION_LOG_ARCHIVE_DIR.trim():"";
  const fallback=path.join(path.dirname(logFilePath),"archive");
  if(!override)return fallback;
  const resolved=path.isAbsolute(override)?path.normalize(override):path.normalize(path.join(workspaceRoot,override));
  return isPathWithin(workspaceRoot,resolved)?resolved:fallback;
}
class CompactOperationLog{
  constructor({enabled,filePath,dailySplit,maxBytes,keepBytes,level,maxEventBytes,archiveEnabled,archiveDir,archiveCompress,archiveMaxBytes,archiveMaxFiles}){
    this.enabled=Boolean(enabled);
    this.baseFilePath=filePath;
    this.filePath=filePath;
    this.dailySplit=Boolean(dailySplit);
    this.activeDayStamp="";
    this.maxBytes=Math.max(64*1024,Math.trunc(maxBytes));
    this.keepBytes=Math.max(8*1024,Math.min(Math.trunc(keepBytes),this.maxBytes-1024));
    this.level=normalizeOperationLogLevel(level,operationLogDefaults.level);
    this.maxEventBytes=Math.max(512,Math.min(64*1024,Math.trunc(maxEventBytes)));
    this.archiveEnabled=Boolean(archiveEnabled);
    this.archiveDir=archiveDir;
    this.archiveCompress=Boolean(archiveCompress);
    this.archiveMaxBytes=Math.max(1024*1024,Math.trunc(archiveMaxBytes));
    this.archiveMaxFiles=Math.max(8,Math.trunc(archiveMaxFiles));
    this.archiveBaseName=path.basename(this.baseFilePath).replace(/\.jsonl$/i,"")||"codex_ops";
    this.sequence=0;
    this.lastTrimAt=0;
    this.lastKnownBytes=null;
    this.dirReady=false;
    this.archiveDirReady=false;
    this.ensureDailyTarget(Date.now());
  }
  toDayStamp(ts){
    const value=Number(ts);
    const date=new Date(Number.isFinite(value)?value:Date.now());
    const year=String(date.getFullYear()).padStart(4,"0");
    const month=String(date.getMonth()+1).padStart(2,"0");
    const day=String(date.getDate()).padStart(2,"0");
    return`${year}-${month}-${day}`;
  }
  buildDailyFilePath(dayStamp){
    const parsed=path.parse(this.baseFilePath);
    const ext=parsed.ext||".jsonl";
    const baseName=parsed.name||parsed.base||"codex_ops";
    return path.join(parsed.dir,`${baseName}-${dayStamp}${ext}`);
  }
  setActiveFilePath(nextPath,dayStamp){
    this.filePath=nextPath;
    this.activeDayStamp=dayStamp;
    this.lastKnownBytes=null;
    this.lastTrimAt=0;
    this.dirReady=false;
  }
  ensureDailyTarget(ts){
    if(!this.dailySplit)return;
    const dayStamp=this.toDayStamp(ts);
    if(dayStamp===this.activeDayStamp&&this.filePath)return;
    const nextPath=this.buildDailyFilePath(dayStamp);
    if(nextPath===this.filePath){
      this.activeDayStamp=dayStamp;
      return;
    }
    this.setActiveFilePath(nextPath,dayStamp);
  }
  inferEventLevel(eventName){
    if(eventName.startsWith("rpc."))return"verbose";
    if(eventName.startsWith("api."))return"standard";
    if(eventName.startsWith("slash."))return"standard";
    if(eventName==="turn.prepare"||eventName==="team.turn_prepare"||eventName==="team.turn_start")return"standard";
    return"core";
  }
  shouldLogEvent(eventName,level){
    if(!this.enabled)return false;
    const currentRank=operationLogLevelRank[this.level]||0;
    if(currentRank<=0)return false;
    const chosenLevel=normalizeOperationLogLevel(level,this.inferEventLevel(eventName));
    const requiredRank=operationLogLevelRank[chosenLevel]||operationLogLevelRank.core;
    return currentRank>=requiredRank;
  }
  ensureDir(){
    if(this.dirReady)return;
    fs.mkdirSync(path.dirname(this.filePath),{recursive:true});
    this.dirReady=true;
  }
  ensureArchiveDir(){
    if(this.archiveDirReady)return;
    fs.mkdirSync(this.archiveDir,{recursive:true});
    this.archiveDirReady=true;
  }
  formatRuntimePath(targetPath){
    const rel=path.relative(workspaceRoot,targetPath).replace(/\\/g,"/");
    return rel&&rel.length&&!rel.startsWith("..")?rel:targetPath;
  }
  write(event,fields,level){
    const eventName=safeString(typeof event==="string"?event:"",80);
    if(!eventName)return;
    if(!this.shouldLogEvent(eventName,level))return;
    const ts=Date.now();
    this.ensureDailyTarget(ts);
    const payload={ts,seq:++this.sequence,ev:eventName,...(fields&&typeof fields==="object"?fields:{})};
    try{
      this.ensureDir();
      let line=JSON.stringify(payload);
      const lineBytes=Buffer.byteLength(line,"utf8");
      if(lineBytes>this.maxEventBytes){
        line=JSON.stringify({
          ts:payload.ts,
          seq:payload.seq,
          ev:eventName,
          truncated:1,
          bytes:lineBytes,
          keys:fields&&typeof fields==="object"?Object.keys(fields).slice(0,16):[],
        });
      }
      const lineWithLf=`${line}\n`;
      fs.appendFileSync(this.filePath,lineWithLf,{encoding:"utf8"});
      if(!Number.isFinite(this.lastKnownBytes)){
        try{
          this.lastKnownBytes=fs.statSync(this.filePath).size;
        }catch{
          this.lastKnownBytes=Buffer.byteLength(lineWithLf,"utf8");
        }
      }else{
        this.lastKnownBytes+=Buffer.byteLength(lineWithLf,"utf8");
      }
      this.trimIfNeeded(Boolean(this.lastKnownBytes>this.maxBytes));
    }catch{
    }
  }
  archiveChunk(buffer){
    if(!this.archiveEnabled||!buffer||!buffer.length)return;
    try{
      this.ensureArchiveDir();
      const stamp=new Date().toISOString().replace(/[-:.TZ]/g,"").slice(0,14);
      const suffix=String(Date.now()).slice(-6);
      const baseName=`${this.archiveBaseName}.${stamp}.${suffix}.jsonl`;
      const archivePath=this.archiveCompress
        ?path.join(this.archiveDir,`${baseName}.gz`)
        :path.join(this.archiveDir,baseName);
      if(this.archiveCompress){
        const compressed=zlib.gzipSync(buffer,{level:9});
        fs.writeFileSync(archivePath,compressed);
      }else{
        fs.writeFileSync(archivePath,buffer);
      }
      this.pruneArchives();
    }catch{
    }
  }
  pruneArchives(){
    if(!this.archiveEnabled)return;
    let entries=[];
    try{
      this.ensureArchiveDir();
      entries=fs.readdirSync(this.archiveDir,{withFileTypes:true});
    }catch{
      return;
    }
    const prefix=`${this.archiveBaseName}.`;
    const files=entries
      .filter((entry)=>entry&&entry.isFile()&&entry.name.startsWith(prefix)&&(/\.jsonl(\.gz)?$/i).test(entry.name))
      .map((entry)=>{
        const fullPath=path.join(this.archiveDir,entry.name);
        let stat=null;
        try{
          stat=fs.statSync(fullPath);
        }catch{
          stat=null;
        }
        return stat?{name:entry.name,path:fullPath,size:Math.max(0,Math.trunc(stat.size)),mtimeMs:Number(stat.mtimeMs)||0}:null;
      })
      .filter(Boolean)
      .sort((a,b)=>a.mtimeMs-b.mtimeMs);
    let totalBytes=files.reduce((sum,file)=>sum+file.size,0);
    while(files.length>this.archiveMaxFiles||totalBytes>this.archiveMaxBytes){
      const oldest=files.shift();
      if(!oldest)break;
      try{
        fs.unlinkSync(oldest.path);
      }catch{
      }
      totalBytes-=oldest.size;
    }
  }
  trimIfNeeded(force=false){
    const now=Date.now();
    if(!force&&now-this.lastTrimAt<1500)return;
    this.lastTrimAt=now;
    let size=0;
    try{
      size=fs.statSync(this.filePath).size;
    }catch{
      return;
    }
    this.lastKnownBytes=size;
    if(size<=this.maxBytes)return;
    try{
      const content=fs.readFileSync(this.filePath);
      if(!content.length)return;
      const start=Math.max(0,content.length-this.keepBytes);
      const tail=content.subarray(start);
      const newlineOffset=tail.indexOf(0x0a);
      const splitAt=newlineOffset>=0?start+newlineOffset+1:start;
      const archived=content.subarray(0,splitAt);
      const keep=content.subarray(splitAt);
      if(archived.length){
        this.archiveChunk(archived);
      }
      fs.writeFileSync(this.filePath,keep);
      this.lastKnownBytes=keep.length;
    }catch{
    }
  }
  runtimeSnapshot(){
    const pathValue=this.dailySplit?this.buildDailyFilePath(this.activeDayStamp||this.toDayStamp(Date.now())):this.filePath;
    return{
      enabled:this.enabled,
      level:this.level,
      path:this.formatRuntimePath(pathValue),
      basePath:this.formatRuntimePath(this.baseFilePath),
      dailySplit:this.dailySplit,
      maxBytes:this.maxBytes,
      keepBytes:this.keepBytes,
      maxEventBytes:this.maxEventBytes,
      archiveEnabled:this.archiveEnabled,
      archivePath:this.formatRuntimePath(this.archiveDir),
      archiveCompress:this.archiveCompress,
      archiveMaxBytes:this.archiveMaxBytes,
      archiveMaxFiles:this.archiveMaxFiles,
    };
  }
}
const operationLogPath=resolveOperationLogPath();
const operationLogDailySplit=parseBooleanEnv("CODEX_OPERATION_LOG_DAILY_SPLIT",operationLogDefaults.dailySplit);
const operationLogMaxBytes=parsePositiveIntEnv("CODEX_OPERATION_LOG_MAX_BYTES",operationLogDefaults.maxBytes,64*1024,32*1024*1024);
const operationLogKeepBytes=parsePositiveIntEnv("CODEX_OPERATION_LOG_KEEP_BYTES",operationLogDefaults.keepBytes,8*1024,operationLogMaxBytes-1024);
const operationLogLevel=parseLogLevelEnv("CODEX_OPERATION_LOG_LEVEL",operationLogDefaults.level);
const operationLogMaxEventBytes=parsePositiveIntEnv("CODEX_OPERATION_LOG_MAX_EVENT_BYTES",operationLogDefaults.maxEventBytes,512,64*1024);
const operationLogArchiveEnabled=parseBooleanEnv("CODEX_OPERATION_LOG_ARCHIVE_ENABLED",operationLogDefaults.archive.enabled);
const operationLogArchiveDir=resolveOperationLogArchiveDir(operationLogPath);
const operationLogArchiveCompress=parseBooleanEnv("CODEX_OPERATION_LOG_ARCHIVE_COMPRESS",operationLogDefaults.archive.compress);
const operationLogArchiveMaxBytes=parsePositiveIntEnv("CODEX_OPERATION_LOG_ARCHIVE_MAX_BYTES",operationLogDefaults.archive.maxBytes,1024*1024,1024*1024*1024);
const operationLogArchiveMaxFiles=parsePositiveIntEnv("CODEX_OPERATION_LOG_ARCHIVE_MAX_FILES",operationLogDefaults.archive.maxFiles,8,4000);
const debugFinalizeSteps=parseBooleanEnv("CODEX_DEBUG_FINALIZE_STEPS",false);
const operationLog=new CompactOperationLog({
  enabled:operationLogDefaults.enabled,
  filePath:operationLogPath,
  dailySplit:operationLogDailySplit,
  maxBytes:operationLogMaxBytes,
  keepBytes:operationLogKeepBytes,
  level:operationLogLevel,
  maxEventBytes:operationLogMaxEventBytes,
  archiveEnabled:operationLogArchiveEnabled,
  archiveDir:operationLogArchiveDir,
  archiveCompress:operationLogArchiveCompress,
  archiveMaxBytes:operationLogArchiveMaxBytes,
  archiveMaxFiles:operationLogArchiveMaxFiles,
});
function summarizeTextForOperationLog(value,max=24000){
  const text=safeString(value,max);
  if(!text)return null;
  return{
    l:text.length,
    h:crypto.createHash("sha1").update(text).digest("hex").slice(0,12),
  };
}
function summarizeErrorForOperationLog(error,max=280){
  if(!error)return"";
  if(typeof error==="string")return safeString(error,max);
  if(error&&typeof error.message==="string")return safeString(error.message,max);
  try{
    return safeString(JSON.stringify(error),max);
  }catch{
    return safeString(String(error),max);
  }
}
function summarizePathForOperationLog(pathValue,max=240){
  const raw=safeString(pathValue,max);
  if(!raw)return"";
  try{
    const resolved=path.resolve(raw);
    const rel=path.relative(workspaceRoot,resolved).replace(/\\/g,"/");
    if(rel&&rel.length&&!rel.startsWith(".."))return safeString(rel,max);
    return safeString(resolved,max);
  }catch{
    return raw;
  }
}
function normalizeRiskRuleIds(ruleIds,max=16){
  if(!Array.isArray(ruleIds))return[];
  const normalized=[];
  const seen=new Set();
  for(const value of ruleIds){
    const raw=safeString(value,64).toLowerCase();
    if(!raw)continue;
    const id=raw.replace(/[^a-z0-9._-]+/g,"_").replace(/^_+/,"").replace(/_+$/,"");
    if(!id||seen.has(id))continue;
    seen.add(id);
    normalized.push(id);
    if(normalized.length>=max)break;
  }
  return normalized;
}
function normalizeRiskInputSummary(summary){
  const source=summary&&typeof summary==="object"?summary:{};
  const normalized={};
  const operation=safeString(source.operation,40);
  if(operation)normalized.operation=operation;
  const sandbox=safeString(source.sandboxMode,40);
  if(sandbox)normalized.sandboxMode=sandbox;
  const commandNormalized=safeString(source.commandNormalized,240);
  if(commandNormalized)normalized.commandNormalized=commandNormalized;
  const commandLength=Number(source.commandLength);
  if(Number.isFinite(commandLength))normalized.commandLength=Math.max(0,Math.trunc(commandLength));
  const boolKeys=[
    "hasDestructiveDelete",
    "hasRemoteFetch",
    "hasPipeExec",
    "hasRemoteFetchPipeExec",
    "hasDiskOperation",
    "hasSystemControl",
    "retryHint",
  ];
  for(const key of boolKeys){
    if(!Object.prototype.hasOwnProperty.call(source,key))continue;
    normalized[key]=source[key]?1:0;
  }
  const intKeys=["totalChanges","deleteCount","outsideWorkspaceCount","changedPathCount"];
  for(const key of intKeys){
    const value=Number(source[key]);
    if(!Number.isFinite(value))continue;
    normalized[key]=Math.max(0,Math.trunc(value));
  }
  if(Array.isArray(source.changedPathSample)&&source.changedPathSample.length){
    normalized.changedPathSample=source.changedPathSample
      .slice(0,8)
      .map((entry)=>summarizePathForOperationLog(entry,220))
      .filter(Boolean);
  }
  if(Array.isArray(source.paramKeySample)&&source.paramKeySample.length){
    normalized.paramKeySample=source.paramKeySample
      .slice(0,8)
      .map((entry)=>safeString(entry,48))
      .filter(Boolean);
  }
  return normalized;
}
function normalizeApprovalAuditRecord(record){
  const source=record&&typeof record==="object"?record:{};
  const normalized={
    type:safeString(source.type,60)||"unknown",
    policyRequested:safeString(source.policyRequested,40)||"",
    policyEffective:safeString(source.policyEffective,64)||"",
    sandbox:safeString(source.sandbox,40)||"",
    decision:safeString(source.decision,20)||"decline",
    reason:safeString(source.reason,120)||"",
    risk:safeString(source.risk,20)||"low",
    riskRulesVersion:safeString(source.riskRulesVersion,40)||riskRulesVersion,
    riskRuleIds:normalizeRiskRuleIds(source.riskRuleIds,16),
    riskInputSummary:normalizeRiskInputSummary(source.riskInputSummary),
    riskSignals:Array.isArray(source.riskSignals)
      ?source.riskSignals.map((signal)=>safeString(signal,60)).filter(Boolean).slice(0,8)
      :[],
    retryHint:source.retryHint?1:0,
    fileChanges:Number.isFinite(Number(source.fileChanges))?Math.max(0,Math.trunc(Number(source.fileChanges))):0,
    fileDeletes:Number.isFinite(Number(source.fileDeletes))?Math.max(0,Math.trunc(Number(source.fileDeletes))):0,
    outsideWorkspaceChanges:Number.isFinite(Number(source.outsideWorkspaceChanges))?Math.max(0,Math.trunc(Number(source.outsideWorkspaceChanges))):0,
    commandSample:summarizeTextForOperationLog(source.commandSample||"",240),
    changedPaths:Array.isArray(source.changedPaths)
      ?source.changedPaths.slice(0,6).map((entry)=>summarizePathForOperationLog(entry,220)).filter(Boolean)
      :[],
    governanceDecision:safeString(source.governanceDecision,40)||"",
    governanceReason:safeString(source.governanceReason,80)||"",
    governanceContract:safeString(source.governanceContract,80)||"",
    governanceViolations:Number.isFinite(Number(source.governanceViolations))?Math.max(0,Math.trunc(Number(source.governanceViolations))):0,
    governanceOverrideRequested:source.governanceOverrideRequested?1:0,
    governanceOverrideApplied:source.governanceOverrideApplied?1:0,
    governanceOverrideBy:safeString(source.governanceOverrideBy,80)||"",
    governanceOverrideReason:safeString(source.governanceOverrideReason,160)||"",
    governanceOverrideFailure:safeString(source.governanceOverrideFailure,80)||"",
    agent:safeString(source.agent,80)||"",
  };
  const threadId=safeString(source.threadId,120);
  if(threadId)normalized.threadId=threadId;
  const turnId=safeString(source.turnId,120);
  if(turnId)normalized.turnId=turnId;
  return normalized;
}
function logOperation(event,fields,level){
  operationLog.write(event,fields,level);
}
function toIsoTimestamp(ts){
  try{
    return new Date(Number.isFinite(Number(ts))?Number(ts):Date.now()).toISOString();
  }catch{
    return new Date().toISOString();
  }
}
function normalizeArtifactFileSegment(value,max=120){
  const raw=safeString(String(value||""),max)||"segment";
  const sanitized=raw.replace(/[^A-Za-z0-9._-]+/g,"_").replace(/^_+/,"").replace(/_+$/,"");
  return sanitized||"segment";
}
function ensureDirRecursive(targetDir){
  try{
    fs.mkdirSync(targetDir,{recursive:true,mode:0o700});
    try{
      fs.chmodSync(targetDir,0o700);
    }catch{
    }
    return true;
  }catch{
    return false;
  }
}
function hardenFilePermissions(filePath){
  if(!filePath)return;
  try{
    fs.chmodSync(filePath,0o600);
  }catch{
  }
}
function fileSha256Hex(filePath){
  try{
    const content=fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
  }catch{
    return"";
  }
}
function fileSizeBytes(filePath){
  try{
    const stat=fs.statSync(filePath);
    return Number.isFinite(Number(stat.size))?Math.max(0,Math.trunc(Number(stat.size))):0;
  }catch{
    return 0;
  }
}
const turnArtifactRedactionRules=Object.freeze([
  Object.freeze({
    id:"openai_api_key",
    regex:/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g,
    replacement:()=>`${turnArtifactsRedactionPlaceholder}:openai_api_key`,
  }),
  Object.freeze({
    id:"aws_access_key",
    regex:/\bAKIA[0-9A-Z]{16}\b/g,
    replacement:()=>`${turnArtifactsRedactionPlaceholder}:aws_access_key`,
  }),
  Object.freeze({
    id:"github_pat",
    regex:/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
    replacement:()=>`${turnArtifactsRedactionPlaceholder}:github_pat`,
  }),
  Object.freeze({
    id:"google_api_key",
    regex:/\bAIza[0-9A-Za-z\-_]{30,}\b/g,
    replacement:()=>`${turnArtifactsRedactionPlaceholder}:google_api_key`,
  }),
  Object.freeze({
    id:"jwt_token",
    regex:/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement:()=>`${turnArtifactsRedactionPlaceholder}:jwt_token`,
  }),
  Object.freeze({
    id:"authorization_bearer",
    regex:/(authorization\s*:\s*bearer\s+)([A-Za-z0-9\-._~+/]+=*)/gi,
    replacement:(match,prefix)=>`${prefix}${turnArtifactsRedactionPlaceholder}:bearer`,
  }),
  Object.freeze({
    id:"secret_assignment",
    regex:/\b(token|api[_-]?key|secret|password|passwd|client[_-]?secret)\b(\s*[:=]\s*)([^\s"']{6,}|\"[^\"]{6,}\"|'[^']{6,}')/gi,
    replacement:(match,key,sep)=>`${key}${sep}${turnArtifactsRedactionPlaceholder}:secret`,
  }),
  Object.freeze({
    id:"private_key_block",
    regex:/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement:()=>`${turnArtifactsRedactionPlaceholder}:private_key_block`,
  }),
  Object.freeze({
    id:"email_address",
    regex:/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement:()=>`${turnArtifactsRedactionPlaceholder}:email`,
  }),
]);
function noteTurnArtifactRedaction(stats,ruleId,count=1){
  if(!stats||typeof stats!=="object")return;
  const normalizedRule=safeString(ruleId,80)||"unknown";
  const increment=Math.max(1,Math.trunc(Number(count)||0));
  stats.replacements=(Number(stats.replacements)||0)+increment;
  if(!stats.byRule||typeof stats.byRule!=="object")stats.byRule={};
  stats.byRule[normalizedRule]=(Number(stats.byRule[normalizedRule])||0)+increment;
}
function applyTurnArtifactRedactionToText(input,stats){
  if(!turnArtifactsRedactionEnabled)return typeof input==="string"?input:"";
  if(typeof input!=="string"||!input.length)return"";
  let output=input;
  for(const rule of turnArtifactRedactionRules){
    if(!rule||!(rule.regex instanceof RegExp))continue;
    output=output.replace(rule.regex,(...args)=>{
      noteTurnArtifactRedaction(stats,rule.id,1);
      if(typeof rule.replacement==="function"){
        try{
          return rule.replacement(...args);
        }catch{
          return`${turnArtifactsRedactionPlaceholder}:${rule.id}`;
        }
      }
      return`${turnArtifactsRedactionPlaceholder}:${rule.id}`;
    });
  }
  return output;
}
function redactTurnArtifactValue(value,stats,depth=0){
  if(depth>8)return value;
  if(typeof value==="string"){
    return applyTurnArtifactRedactionToText(value,stats);
  }
  if(Array.isArray(value)){
    return value.map((entry)=>redactTurnArtifactValue(entry,stats,depth+1));
  }
  if(!value||typeof value!=="object"){
    return value;
  }
  const result={};
  for(const[key,entry]of Object.entries(value)){
    result[key]=redactTurnArtifactValue(entry,stats,depth+1);
  }
  return result;
}
function readNestedString(obj,pathChain){
  if(!obj||typeof obj!=="object"||!Array.isArray(pathChain)||!pathChain.length)return"";
  let cur=obj;
  for(const key of pathChain){
    if(!cur||typeof cur!=="object"||!(key in cur))return"";
    cur=cur[key];
  }
  return typeof cur==="string"?cur:"";
}
function directorySizeRecursive(targetDir){
  if(!targetDir||!fs.existsSync(targetDir))return 0;
  const stack=[targetDir];
  let total=0;
  while(stack.length){
    const current=stack.pop();
    let entries=[];
    try{
      entries=fs.readdirSync(current,{withFileTypes:true});
    }catch{
      continue;
    }
    for(const entry of entries){
      const fullPath=path.join(current,entry.name);
      if(entry.isDirectory()){
        stack.push(fullPath);
        continue;
      }
      if(!entry.isFile())continue;
      total+=fileSizeBytes(fullPath);
    }
  }
  return total;
}
function removeDirectoryRecursive(targetDir){
  if(!targetDir)return false;
  try{
    fs.rmSync(targetDir,{recursive:true,force:true});
    return true;
  }catch{
    return false;
  }
}
function cleanupEmptyTurnArtifactDays(rootDir){
  if(!rootDir||!fs.existsSync(rootDir))return;
  let dayEntries=[];
  try{
    dayEntries=fs.readdirSync(rootDir,{withFileTypes:true});
  }catch{
    return;
  }
  for(const dayEntry of dayEntries){
    if(!dayEntry||!dayEntry.isDirectory())continue;
    const dayPath=path.join(rootDir,dayEntry.name);
    let childEntries=[];
    try{
      childEntries=fs.readdirSync(dayPath,{withFileTypes:true});
    }catch{
      continue;
    }
    if(childEntries.length>0)continue;
    try{
      fs.rmdirSync(dayPath);
    }catch{
    }
  }
}
function pruneTurnArtifactsStorage({rootDir,maxBytes,maxDays,now=Date.now()}){
  if(!rootDir||!fs.existsSync(rootDir))return{
    checkedDirs:0,
    deletedDirs:0,
    deletedBytes:0,
    remainingBytes:0,
  };
  const effectiveMaxBytes=Math.max(1,Math.trunc(Number(maxBytes)||turnArtifactsMaxBytes));
  const effectiveMaxDays=Math.max(1,Math.trunc(Number(maxDays)||turnArtifactsMaxDays));
  const maxAgeMs=effectiveMaxDays*24*60*60*1000;
  const turnDirs=[];
  let dayEntries=[];
  try{
    dayEntries=fs.readdirSync(rootDir,{withFileTypes:true});
  }catch{
    return{
      checkedDirs:0,
      deletedDirs:0,
      deletedBytes:0,
      remainingBytes:0,
    };
  }
  for(const dayEntry of dayEntries){
    if(!dayEntry||!dayEntry.isDirectory())continue;
    const dayPath=path.join(rootDir,dayEntry.name);
    let turnEntries=[];
    try{
      turnEntries=fs.readdirSync(dayPath,{withFileTypes:true});
    }catch{
      continue;
    }
    for(const turnEntry of turnEntries){
      if(!turnEntry||!turnEntry.isDirectory())continue;
      const dirPath=path.join(dayPath,turnEntry.name);
      let mtimeMs=0;
      try{
        const stat=fs.statSync(dirPath);
        mtimeMs=Number(stat.mtimeMs)||0;
      }catch{
        mtimeMs=0;
      }
      const bytes=directorySizeRecursive(dirPath);
      turnDirs.push({dirPath,mtimeMs,bytes});
    }
  }
  let deletedDirs=0;
  let deletedBytes=0;
  const retained=[];
  for(const entry of turnDirs){
    const ageMs=Math.max(0,now-(Number(entry.mtimeMs)||0));
    if(ageMs>maxAgeMs){
      if(removeDirectoryRecursive(entry.dirPath)){
        deletedDirs+=1;
        deletedBytes+=Math.max(0,Math.trunc(Number(entry.bytes)||0));
      }else{
        retained.push(entry);
      }
    }else{
      retained.push(entry);
    }
  }
  retained.sort((a,b)=>a.mtimeMs-b.mtimeMs);
  let remainingBytes=retained.reduce((sum,entry)=>sum+Math.max(0,Math.trunc(Number(entry.bytes)||0)),0);
  while(retained.length&&remainingBytes>effectiveMaxBytes){
    const oldest=retained.shift();
    if(!oldest)break;
    if(removeDirectoryRecursive(oldest.dirPath)){
      deletedDirs+=1;
      const reclaimed=Math.max(0,Math.trunc(Number(oldest.bytes)||0));
      deletedBytes+=reclaimed;
      remainingBytes=Math.max(0,remainingBytes-reclaimed);
    }
  }
  cleanupEmptyTurnArtifactDays(rootDir);
  return{
    checkedDirs:turnDirs.length,
    deletedDirs,
    deletedBytes,
    remainingBytes,
  };
}
function maybePruneTurnArtifactsStorage(reason,{force=false}={}){
  if(!turnArtifactsEnabled)return null;
  const now=Date.now();
  if(!force&&now-lastTurnArtifactsPruneAt<15000)return null;
  lastTurnArtifactsPruneAt=now;
  const summary=pruneTurnArtifactsStorage({
    rootDir:turnArtifactsRoot,
    maxBytes:turnArtifactsMaxBytes,
    maxDays:turnArtifactsMaxDays,
    now,
  });
  if(summary&&(summary.deletedDirs>0||summary.deletedBytes>0)){
    logOperation("turn.artifacts.pruned",{
      reason:safeString(reason,80)||"runtime",
      deletedDirs:Number.isFinite(Number(summary.deletedDirs))?Math.max(0,Math.trunc(Number(summary.deletedDirs))):0,
      deletedBytes:Number.isFinite(Number(summary.deletedBytes))?Math.max(0,Math.trunc(Number(summary.deletedBytes))):0,
      remainingBytes:Number.isFinite(Number(summary.remainingBytes))?Math.max(0,Math.trunc(Number(summary.remainingBytes))):0,
      maxBytes:turnArtifactsMaxBytes,
      maxDays:turnArtifactsMaxDays,
    },"standard");
  }
  return summary;
}
class TurnArtifactRecorder{
  constructor({enabled,rootDir,turnId,threadId,agentName,prompt,sandboxMode,approvalPolicy,cwd,idempotencyKey,executionMeta}){
    this.enabled=Boolean(enabled);
    this.rootDir=rootDir;
    this.turnId=safeString(turnId,160)||"unknown_turn";
    this.threadId=safeString(threadId,160)||"unknown_thread";
    this.agentName=safeString(agentName,80)||"";
    this.prompt=safeString(prompt,24000)||"";
    this.sandboxMode=safeString(sandboxMode,40)||"";
    this.approvalPolicy=safeString(approvalPolicy,40)||"";
    this.cwd=safeString(cwd,220)||"";
    this.idempotencyKey=safeString(idempotencyKey,200)||"";
    this.executionMeta=executionMeta&&typeof executionMeta==="object"?executionMeta:null;
    this.startedAt=Date.now();
    this.eventCount=0;
    this.itemCount=0;
    this.diffUpdates=0;
    this.latestDiffBytes=0;
    this.stdoutChunks=0;
    this.stderrChunks=0;
    this.redaction={
      enabled:turnArtifactsRedactionEnabled?1:0,
      replacements:0,
      byRule:{},
    };
    this.dirPath="";
    this.files={events:"",items:"",diff:"",stdout:"",stderr:"",manifest:"",planningDecisionContract:"",requirementContract:"",dispatchPlan:"",evidenceManifest:"",stageTimeline:"",flowTraceSummary:"",reviewLoadBreakdown:"",requestFrame:"",routingDecision:"",taskOutcomes:"",reviewBundle:"",releaseDecision:"",discoveryOutcome:"",conformanceReport:"",operatorViewSummary:""};
    if(!this.enabled)return;
    const dayStamp=toIsoTimestamp(this.startedAt).slice(0,10);
    const baseName=`${normalizeArtifactFileSegment(this.threadId,64)}__${normalizeArtifactFileSegment(this.turnId,96)}`;
    const baseDir=path.join(this.rootDir,dayStamp);
    if(!ensureDirRecursive(baseDir)){
      this.enabled=false;
      return;
    }
    let targetDir=path.join(baseDir,baseName);
    if(fs.existsSync(targetDir)){
      targetDir=path.join(baseDir,`${baseName}_${normalizeArtifactFileSegment(crypto.randomBytes(3).toString("hex"),12)}`);
    }
    if(!ensureDirRecursive(targetDir)){
      this.enabled=false;
      return;
    }
    this.dirPath=targetDir;
    this.files.events=path.join(targetDir,"events.ndjson");
    this.files.items=path.join(targetDir,"items.ndjson");
    this.files.diff=path.join(targetDir,"diff.patch");
    this.files.stdout=path.join(targetDir,"command_stdout.txt");
    this.files.stderr=path.join(targetDir,"command_stderr.txt");
    this.files.manifest=path.join(targetDir,"manifest.json");
    this.files.planningDecisionContract=path.join(targetDir,"planning_decision_contract.json");
    this.files.requirementContract=path.join(targetDir,"requirement_contract.json");
    this.files.dispatchPlan=path.join(targetDir,"dispatch_plan.json");
    this.files.evidenceManifest=path.join(targetDir,"evidence_manifest.json");
    this.files.stageTimeline=path.join(targetDir,"stage_timeline.json");
    this.files.flowTraceSummary=path.join(targetDir,"flow_trace_summary.json");
    this.files.reviewLoadBreakdown=path.join(targetDir,"review_load_breakdown.json");
    this.files.requestFrame=path.join(targetDir,"request_frame.json");
    this.files.routingDecision=path.join(targetDir,"routing_decision.json");
    this.files.taskOutcomes=path.join(targetDir,"task_outcomes.json");
    this.files.reviewBundle=path.join(targetDir,"review_bundle.json");
    this.files.releaseDecision=path.join(targetDir,"release_decision.json");
    this.files.discoveryOutcome=path.join(targetDir,"discovery_outcome.json");
    this.files.conformanceReport=path.join(targetDir,"conformance_report.json");
    this.files.operatorViewSummary=path.join(targetDir,"operator_view_summary.json");
    this.writeEvent("turn.started",{
      turnId:this.turnId,
      threadId:this.threadId,
      agentName:this.agentName,
      sandboxMode:this.sandboxMode,
      approvalPolicy:this.approvalPolicy,
      cwd:this.cwd,
      idempotencyKey:this.idempotencyKey||null,
      execution:this.executionMeta||null,
      promptHash:hashSha256Hex(this.prompt),
      promptLength:this.prompt.length,
    });
  }
  canWrite(){
    return this.enabled&&Boolean(this.dirPath);
  }
  appendFile(filePath,content){
    if(!this.canWrite()||!filePath||typeof content!=="string")return;
    try{
      fs.appendFileSync(filePath,content,"utf8");
      hardenFilePermissions(filePath);
    }catch{
    }
  }
  writeFile(filePath,content){
    if(!this.canWrite()||!filePath||typeof content!=="string")return;
    try{
      fs.writeFileSync(filePath,content,"utf8");
      hardenFilePermissions(filePath);
    }catch{
    }
  }
  writeJsonArtifact(filePath,value){
    if(!this.canWrite()||!filePath||!value||typeof value!=="object")return null;
    const payload=this.sanitizeValue(value);
    this.writeFile(filePath,`${JSON.stringify(payload,null,2)}\n`);
    return{
      file:path.basename(filePath),
      path:filePath,
      bytes:fileSizeBytes(filePath),
      sha256:fileSha256Hex(filePath),
    };
  }
  sanitizeValue(value){
    if(!turnArtifactsRedactionEnabled)return value;
    return redactTurnArtifactValue(value,this.redaction);
  }
  sanitizeText(text){
    if(!turnArtifactsRedactionEnabled)return typeof text==="string"?text:"";
    return applyTurnArtifactRedactionToText(typeof text==="string"?text:"",this.redaction);
  }
  writeEvent(kind,payload){
    if(!this.canWrite())return;
    const record={
      ts:toIsoTimestamp(Date.now()),
      kind:safeString(kind,80)||"event",
      payload:this.sanitizeValue(payload&&typeof payload==="object"?payload:{}),
    };
    this.appendFile(this.files.events,`${JSON.stringify(record)}\n`);
    this.eventCount+=1;
  }
  writeStreamEvent(event){
    this.writeEvent("stream.event",event&&typeof event==="object"?event:{});
  }
  writeNotification(method,params){
    this.writeEvent("appserver.notification",{
      method:safeString(method,120),
      params:params&&typeof params==="object"?params:{},
    });
  }
  writeItem(phase,item){
    if(!this.canWrite())return;
    const sanitizedItem=this.sanitizeValue(item&&typeof item==="object"?item:{});
    const record={
      ts:toIsoTimestamp(Date.now()),
      phase:safeString(phase,40)||"unknown",
      item:sanitizedItem,
    };
    this.appendFile(this.files.items,`${JSON.stringify(record)}\n`);
    this.itemCount+=1;
    const normalizedItem=sanitizedItem&&typeof sanitizedItem==="object"?sanitizedItem:{};
    if(normalizedItem.type==="commandExecution"&&phase==="completed"){
      this.captureCommandOutputs(normalizedItem);
    }
  }
  captureDiff(diffText){
    if(!this.canWrite()||typeof diffText!=="string")return;
    const sanitizedDiff=this.sanitizeText(diffText);
    this.writeFile(this.files.diff,sanitizedDiff);
    this.diffUpdates+=1;
    this.latestDiffBytes=Buffer.byteLength(sanitizedDiff,"utf8");
    this.writeEvent("diff.snapshot",{bytes:this.latestDiffBytes,updates:this.diffUpdates});
  }
  extractCommandStreams(item){
    const stdout=this.extractFirstString([
      item.stdout,
      item.standardOutput,
      item.output,
      readNestedString(item,["commandOutput","stdout"]),
      readNestedString(item,["result","stdout"]),
      readNestedString(item,["result","output"]),
      readNestedString(item,["metadata","stdout"]),
    ],4000000);
    const stderr=this.extractFirstString([
      item.stderr,
      item.standardError,
      readNestedString(item,["commandOutput","stderr"]),
      readNestedString(item,["result","stderr"]),
      readNestedString(item,["metadata","stderr"]),
    ],2000000);
    return{stdout,stderr};
  }
  extractFirstString(candidates,max=12000){
    if(!Array.isArray(candidates))return"";
    for(const candidate of candidates){
      if(typeof candidate!=="string")continue;
      if(!candidate.length)continue;
      return candidate.length<=max?candidate:candidate.slice(0,max);
    }
    return"";
  }
  captureCommandOutputs(item){
    if(!this.canWrite()||!item||typeof item!=="object")return;
    const command=this.sanitizeText(safeString(item.command,1000)||"(command unavailable)");
    const status=safeString(item.status,80)||"unknown";
    const exitCode=Number.isFinite(Number(item.exitCode))?Math.trunc(Number(item.exitCode)):null;
    const durationMs=Number.isFinite(Number(item.durationMs))?Math.max(0,Math.trunc(Number(item.durationMs))):null;
    const streams=this.extractCommandStreams(item);
    const header=`\n=== commandExecution @ ${toIsoTimestamp(Date.now())} ===\ncommand: ${command}\nstatus: ${status}${exitCode===null?"":` exit=${exitCode}`}${durationMs===null?"":` durationMs=${durationMs}`}\n`;
    if(streams.stdout){
      const sanitizedStdout=this.sanitizeText(streams.stdout);
      this.appendFile(this.files.stdout,`${header}${sanitizedStdout}\n`);
      this.stdoutChunks+=1;
    }
    if(streams.stderr){
      const sanitizedStderr=this.sanitizeText(streams.stderr);
      this.appendFile(this.files.stderr,`${header}${sanitizedStderr}\n`);
      this.stderrChunks+=1;
    }
  }
  finalize({status,errorText,completedAt,approvalAudits,observedSignals,taskOutcomeStatus,taskOutcomeReason,planningContext,planningDecisionContract,requirementContract,dispatchPlan,evidenceManifest,stageTimeline,flowTraceSummary,reviewLoadBreakdown,requestFrame,routingDecision,taskOutcomes,reviewBundle,releaseDecision,discoveryOutcome,conformanceReport,operatorViewSummary}={}){
    if(!this.canWrite())return null;
    this.writeEvent("turn.completed",{
      status:safeString(status,40)||"unknown",
      error:safeString(errorText,1200)||"",
      completedAt:toIsoTimestamp(completedAt||Date.now()),
    });
    const artifactEntries=[];
    const candidates=[
      ["events.ndjson",this.files.events],
      ["items.ndjson",this.files.items],
      ["diff.patch",this.files.diff],
      ["command_stdout.txt",this.files.stdout],
      ["command_stderr.txt",this.files.stderr],
    ];
    for(const[label,filePath]of candidates){
      if(!filePath||!fs.existsSync(filePath))continue;
      const bytes=fileSizeBytes(filePath);
      const sha256=fileSha256Hex(filePath);
      artifactEntries.push({
        file:label,
        bytes,
        sha256,
      });
    }
    const extraArtifacts=[
      this.writeJsonArtifact(this.files.planningDecisionContract,planningDecisionContract&&typeof planningDecisionContract==="object"?planningDecisionContract:null),
      this.writeJsonArtifact(this.files.requirementContract,requirementContract&&typeof requirementContract==="object"?requirementContract:null),
      this.writeJsonArtifact(this.files.dispatchPlan,dispatchPlan&&typeof dispatchPlan==="object"?dispatchPlan:null),
      this.writeJsonArtifact(this.files.evidenceManifest,evidenceManifest&&typeof evidenceManifest==="object"?evidenceManifest:null),
      this.writeJsonArtifact(this.files.stageTimeline,stageTimeline&&typeof stageTimeline==="object"?stageTimeline:null),
      this.writeJsonArtifact(this.files.flowTraceSummary,flowTraceSummary&&typeof flowTraceSummary==="object"?flowTraceSummary:null),
      this.writeJsonArtifact(this.files.reviewLoadBreakdown,reviewLoadBreakdown&&typeof reviewLoadBreakdown==="object"?reviewLoadBreakdown:null),
      this.writeJsonArtifact(this.files.requestFrame,requestFrame&&typeof requestFrame==="object"?requestFrame:null),
      this.writeJsonArtifact(this.files.routingDecision,routingDecision&&typeof routingDecision==="object"?routingDecision:null),
      this.writeJsonArtifact(this.files.taskOutcomes,taskOutcomes&&typeof taskOutcomes==="object"?taskOutcomes:null),
      this.writeJsonArtifact(this.files.reviewBundle,reviewBundle&&typeof reviewBundle==="object"?reviewBundle:null),
      this.writeJsonArtifact(this.files.releaseDecision,releaseDecision&&typeof releaseDecision==="object"?releaseDecision:null),
      this.writeJsonArtifact(this.files.discoveryOutcome,discoveryOutcome&&typeof discoveryOutcome==="object"?discoveryOutcome:null),
      this.writeJsonArtifact(this.files.conformanceReport,conformanceReport&&typeof conformanceReport==="object"?conformanceReport:null),
      this.writeJsonArtifact(this.files.operatorViewSummary,operatorViewSummary&&typeof operatorViewSummary==="object"?operatorViewSummary:null),
    ].filter(Boolean);
    for(const entry of extraArtifacts){
      artifactEntries.push({
        file:safeString(entry.file,80)||path.basename(entry.path),
        bytes:Number.isFinite(Number(entry.bytes))?Math.max(0,Math.trunc(Number(entry.bytes))):0,
        sha256:safeString(entry.sha256,80)||"",
      });
    }
    const approvalRecords=Array.isArray(approvalAudits)
      ?approvalAudits
        .map((entry)=>normalizeApprovalAuditRecord(entry))
        .filter((entry)=>entry&&typeof entry==="object")
        .slice(0,64)
      :[];
    const observed=normalizeObservedTurnSignals(observedSignals);
    const execution=this.executionMeta&&typeof this.executionMeta==="object"
      ?this.sanitizeValue(this.executionMeta)
      :null;
    const manifest={
      schema:"turn-artifact-manifest.v1",
      generatedAt:toIsoTimestamp(Date.now()),
      turn:{
        turnId:this.turnId,
        threadId:this.threadId,
        agentName:this.agentName||null,
        sandboxMode:this.sandboxMode||null,
        approvalPolicy:this.approvalPolicy||null,
        cwd:this.cwd||null,
        idempotencyKey:this.sanitizeText(this.idempotencyKey)||null,
      },
      prompt:{
        length:this.prompt.length,
        sha256:hashSha256Hex(this.prompt),
      },
      counters:{
        events:this.eventCount,
        items:this.itemCount,
        diffUpdates:this.diffUpdates,
        latestDiffBytes:this.latestDiffBytes,
        stdoutChunks:this.stdoutChunks,
        stderrChunks:this.stderrChunks,
      },
      terminal:{
        status:safeString(status,40)||"unknown",
        taskOutcomeStatus:safeString(taskOutcomeStatus,80).toUpperCase()||"",
        taskOutcomeReason:this.sanitizeText(safeString(taskOutcomeReason,160)||""),
        error:this.sanitizeText(safeString(errorText,1200)||""),
        completedAt:toIsoTimestamp(completedAt||Date.now()),
      },
      execution:{
        meta:execution,
        observed,
        planning:planningContext&&typeof planningContext==="object"?this.sanitizeValue(planningContext):null,
      },
      approvalDecisions:{
        riskRulesVersion,
        count:approvalRecords.length,
        truncated:Array.isArray(approvalAudits)&&approvalAudits.length>approvalRecords.length?1:0,
        records:approvalRecords,
      },
      redaction:{
        enabled:this.redaction.enabled?1:0,
        placeholder:turnArtifactsRedactionPlaceholder,
        replacements:Number.isFinite(Number(this.redaction.replacements))?Math.max(0,Math.trunc(Number(this.redaction.replacements))):0,
        byRule:this.redaction.byRule&&typeof this.redaction.byRule==="object"?this.redaction.byRule:{},
      },
      retentionPolicy:{
        maxBytes:turnArtifactsMaxBytes,
        maxDays:turnArtifactsMaxDays,
      },
      artifacts:artifactEntries,
    };
    this.writeFile(this.files.manifest,`${JSON.stringify(manifest,null,2)}\n`);
    const manifestSha256=fileSha256Hex(this.files.manifest);
    return{
      dir:this.dirPath,
      manifest:this.files.manifest,
      planningDecisionContractPath:fs.existsSync(this.files.planningDecisionContract)?this.files.planningDecisionContract:"",
      requirementContractPath:fs.existsSync(this.files.requirementContract)?this.files.requirementContract:"",
      dispatchPlanPath:fs.existsSync(this.files.dispatchPlan)?this.files.dispatchPlan:"",
      evidenceManifestPath:fs.existsSync(this.files.evidenceManifest)?this.files.evidenceManifest:"",
      stageTimelinePath:fs.existsSync(this.files.stageTimeline)?this.files.stageTimeline:"",
      flowTraceSummaryPath:fs.existsSync(this.files.flowTraceSummary)?this.files.flowTraceSummary:"",
      reviewLoadBreakdownPath:fs.existsSync(this.files.reviewLoadBreakdown)?this.files.reviewLoadBreakdown:"",
      requestFramePath:fs.existsSync(this.files.requestFrame)?this.files.requestFrame:"",
      routingDecisionPath:fs.existsSync(this.files.routingDecision)?this.files.routingDecision:"",
      taskOutcomesPath:fs.existsSync(this.files.taskOutcomes)?this.files.taskOutcomes:"",
      reviewBundlePath:fs.existsSync(this.files.reviewBundle)?this.files.reviewBundle:"",
      releaseDecisionPath:fs.existsSync(this.files.releaseDecision)?this.files.releaseDecision:"",
      discoveryOutcomePath:fs.existsSync(this.files.discoveryOutcome)?this.files.discoveryOutcome:"",
      conformanceReportPath:fs.existsSync(this.files.conformanceReport)?this.files.conformanceReport:"",
      operatorViewSummaryPath:fs.existsSync(this.files.operatorViewSummary)?this.files.operatorViewSummary:"",
      manifestSha256,
      promptSha256:manifest&&manifest.prompt?safeString(manifest.prompt.sha256,80):"",
      artifactCount:artifactEntries.length,
      status:manifest.terminal.status,
      redactionReplacements:manifest.redaction.replacements,
    };
  }
}
function createTurnArtifactRecorder(input={}){
  try{
    return new TurnArtifactRecorder({
      enabled:turnArtifactsEnabled,
      rootDir:turnArtifactsRoot,
      ...input,
    });
  }catch{
    return null;
  }
}

function createBaseAgentState(){
  return{
    sessionRef:null,
    threadId:null,
    activeTurnId:null,
    experimentalEnabled:defaultExperimentalFeatures.length>0,
    experimentalFeatures:new Set(defaultExperimentalFeatures),
    serviceTier:defaultCodexServiceTier,
    createdAt:Date.now(),
    forkedFrom:null,
    manualSessionPinned:false,
    lastSandboxMode:null,
    lastWebSearch:null,
    lastCwd:null,
    lastRequestUserInputPolicy:null,
    lastModel:defaultExecModelName,
    lastModelReasoningEffort:defaultExecModelReasoningEffort,
    lastFastModeEnabled:fastModeDefault,
    lastAutomaticApprovalReviewEnabled:automaticApprovalReviewDefault,
    lastPlanningContext:null,
    fastModeEnabled:fastModeDefault,
    automaticApprovalReviewEnabled:automaticApprovalReviewDefault,
  };
}
const agentStates=new Map();
agentStates.set(defaultExecAgentName,createBaseAgentState());
if(defaultExecAgentName!=="main"){
  const mainState=createBaseAgentState();
  mainState.createdAt=Date.now()+1;
  mainState.forkedFrom=defaultExecAgentName;
  agentStates.set("main",mainState);
}
let activeAgentName=defaultExecAgentName;
const liveCollabChildCatalogByThread=new Map();
const liveCollabChildActivityByThread=new Map();
const liveCollabChildStaleMs=15*60*1000;

function pruneLiveCollabChildState(nowMs=Date.now()){
  const now=Number.isFinite(Number(nowMs))?Number(nowMs):Date.now();
  for(const[threadId,entry]of liveCollabChildActivityByThread.entries()){
    const updatedAt=Number.isFinite(Number(entry&&entry.updatedAt))?Number(entry.updatedAt):0;
    const parentTurnId=safeString(entry&&entry.parentTurnId,160);
    if(parentTurnId&&latestTurnSnapshot&&safeString(latestTurnSnapshot.turnId,160)===parentTurnId&&latestTurnSnapshot.status==="in_progress")continue;
    if(updatedAt>0&&now-updatedAt<=liveCollabChildStaleMs)continue;
    liveCollabChildActivityByThread.delete(threadId);
  }
  for(const[threadId,entry]of liveCollabChildCatalogByThread.entries()){
    const updatedAt=Number.isFinite(Number(entry&&entry.updatedAt))?Number(entry.updatedAt):0;
    if(updatedAt>0&&now-updatedAt<=liveCollabChildStaleMs)continue;
    if(liveCollabChildActivityByThread.has(threadId))continue;
    liveCollabChildCatalogByThread.delete(threadId);
  }
}
function looksLikeCollabThreadId(value){
  const text=safeString(value,160);
  if(!text)return false;
  return /^mock-thread-/i.test(text)
    ||/thread/i.test(text)
    ||/^[0-9a-f]{8,}(?:-[0-9a-f]{4,}){2,}$/i.test(text)
    ||/^[0-9a-f]{16,}$/i.test(text);
}
function normalizeLiveCollabFallbackName(threadId){
  const normalizedThreadId=safeString(threadId,120);
  if(!normalizedThreadId)return"child";
  return`child@${normalizedThreadId}`;
}
function buildConfiguredAgentLookup(){
  const lookup=new Map();
  for(const agent of parseConfiguredAgentsFromCodexConfig()){
    const name=normalizeAgentName(agent&&agent.name);
    if(!name)continue;
    lookup.set(name,{
      name,
      description:safeString(agent&&agent.description,400)||"",
      role:safeString(agent&&agent.role,80)||inferAgentRole(name,safeString(agent&&agent.description,400)||""),
      configFile:safeString(agent&&agent.configFile,240)||null,
    });
  }
  return lookup;
}
function configuredAgentKeywordEntries(configuredAgentsByName){
  const entries=[];
  for(const[name]of configuredAgentsByName instanceof Map?configuredAgentsByName:new Map()){
    if(parentAgentNames.has(name))continue;
    const tokens=Array.from(new Set(
      name.split(/[^a-z0-9]+/i).map((entry)=>safeString(entry,80).toLowerCase()).filter((entry)=>entry.length>=4)
    ));
    entries.push({name,tokens});
  }
  return entries;
}
function inferConfiguredAgentFromPromptText(promptText,configuredAgentsByName){
  const lower=safeString(promptText,12000).toLowerCase();
  if(!lower||!(configuredAgentsByName instanceof Map)||!configuredAgentsByName.size)return"";
  for(const[name]of configuredAgentsByName){
    if(parentAgentNames.has(name))continue;
    if(lower.includes(name.toLowerCase()))return name;
  }
  const keywordEntries=configuredAgentKeywordEntries(configuredAgentsByName);
  for(const entry of keywordEntries){
    if(entry.tokens.some((token)=>lower.includes(token)))return entry.name;
  }
  if(lower.includes("backend")&&configuredAgentsByName.has("backend_worker"))return"backend_worker";
  if(lower.includes("frontend")&&configuredAgentsByName.has("frontend_worker"))return"frontend_worker";
  if(lower.includes("infra")&&configuredAgentsByName.has("infra_worker"))return"infra_worker";
  if(lower.includes("review")&&configuredAgentsByName.has("reviewer"))return"reviewer";
  if((lower.includes("test")||lower.includes("verification"))&&configuredAgentsByName.has("tester"))return"tester";
  if((lower.includes("explore")||lower.includes("investigator"))&&configuredAgentsByName.has("explorer"))return"explorer";
  return"";
}
function plannedDispatchOwnersFromPlanningContext(planningContext){
  const dispatches=Array.isArray(planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.dispatches)
    ?planningContext.dispatchPlan.dispatches
    :[];
  return dispatches
    .map((entry)=>normalizeAgentName(entry&&entry.ownerAgent))
    .filter(Boolean);
}
function createLiveCollabTurnTracker({planningContext,parentAgentName="",parentThreadId="",parentTurnId=""}={}){
  return{
    parentAgentName:safeString(parentAgentName,120)||"",
    parentThreadId:safeString(parentThreadId,160)||"",
    parentTurnId:safeString(parentTurnId,160)||"",
    plannedDispatchOwners:plannedDispatchOwnersFromPlanningContext(planningContext),
    nextPlannedDispatchIndex:0,
    configuredAgentsByName:buildConfiguredAgentLookup(),
    childNameByThread:new Map(),
    receiverIdsByCallId:new Map(),
  };
}
function nextPlannedDispatchOwnerForTracker(tracker){
  if(!tracker||!Array.isArray(tracker.plannedDispatchOwners))return"";
  while(tracker.nextPlannedDispatchIndex<tracker.plannedDispatchOwners.length){
    const candidate=normalizeAgentName(tracker.plannedDispatchOwners[tracker.nextPlannedDispatchIndex]);
    tracker.nextPlannedDispatchIndex+=1;
    if(candidate)return candidate;
  }
  return"";
}
function inferLiveCollabChildName({item,tracker}={}){
  const trace=buildAgentDispatchTrace(item,"");
  const direct=normalizeAgentName(trace&&trace.child?trace.child:"");
  if(direct&&direct!=="unknown"&&!looksLikeCollabThreadId(direct))return direct;
  const receiverIds=extractCollabReceiverThreadIds(item,1);
  for(const receiverId of receiverIds){
    const mapped=tracker&&tracker.childNameByThread instanceof Map?normalizeAgentName(tracker.childNameByThread.get(receiverId)):"";
    if(mapped)return mapped;
  }
  const stateMessages=extractCollabStateMessages(item,4);
  const promptText=[
    safeString(item&&item.prompt,2400),
    safeString(item&&item.message,2400),
    safeString(trace&&trace.task?trace.task:"",2400),
    ...stateMessages,
  ].filter(Boolean).join("\n");
  const configuredAgentsByName=tracker&&tracker.configuredAgentsByName instanceof Map
    ?tracker.configuredAgentsByName
    :buildConfiguredAgentLookup();
  const promptCandidate=inferConfiguredAgentFromPromptText(promptText,configuredAgentsByName);
  if(promptCandidate)return promptCandidate;
  const roleSignals=inferCollabRoleSignals({promptText,child:direct,stateMessages});
  if(roleSignals.reviewerObserved&&configuredAgentsByName.has("reviewer"))return"reviewer";
  if(roleSignals.testerObserved&&configuredAgentsByName.has("tester"))return"tester";
  const plannedOwner=nextPlannedDispatchOwnerForTracker(tracker);
  if(plannedOwner)return plannedOwner;
  return normalizeLiveCollabFallbackName(receiverIds[0]||"");
}
function ensureLiveCollabChildCatalog(threadId,{name="",tracker=null}={}){
  const normalizedThreadId=safeString(threadId,160);
  if(!normalizedThreadId)return null;
  const configuredAgentsByName=tracker&&tracker.configuredAgentsByName instanceof Map
    ?tracker.configuredAgentsByName
    :buildConfiguredAgentLookup();
  const requestedName=normalizeAgentName(name);
  const resolvedName=requestedName||normalizeLiveCollabFallbackName(normalizedThreadId);
  const configured=configuredAgentsByName.get(resolvedName)||null;
  const record={
    threadId:normalizedThreadId,
    name:resolvedName,
    description:configured&&configured.description?configured.description:"",
    role:configured&&configured.role?configured.role:inferAgentRole(resolvedName,configured&&configured.description?configured.description:""),
    parentAgentName:tracker&&tracker.parentAgentName?tracker.parentAgentName:"",
    parentThreadId:tracker&&tracker.parentThreadId?tracker.parentThreadId:"",
    parentTurnId:tracker&&tracker.parentTurnId?tracker.parentTurnId:"",
    updatedAt:Date.now(),
  };
  const existing=liveCollabChildCatalogByThread.get(normalizedThreadId);
  const merged=existing?{...existing,...record}:{...record};
  liveCollabChildCatalogByThread.set(normalizedThreadId,merged);
  if(tracker&&tracker.childNameByThread instanceof Map){
    tracker.childNameByThread.set(normalizedThreadId,resolvedName);
  }
  return merged;
}
function setLiveCollabChildActivity(threadId,{name="",status="running",detail="",tracker=null}={}){
  const catalog=ensureLiveCollabChildCatalog(threadId,{name,tracker});
  if(!catalog)return null;
  const updatedAt=Date.now();
  const entry={
    ...catalog,
    source:"collab",
    sessionRef:catalog.threadId,
    activeTurnId:catalog.parentTurnId||"",
    isActive:true,
    status:safeString(status,80)||"running",
    detail:safeString(detail,240)||"",
    updatedAt,
  };
  liveCollabChildCatalogByThread.set(catalog.threadId,{...catalog,updatedAt});
  liveCollabChildActivityByThread.set(catalog.threadId,entry);
  return entry;
}
function clearLiveCollabChildActivity(threadId){
  const normalizedThreadId=safeString(threadId,160);
  if(!normalizedThreadId)return false;
  return liveCollabChildActivityByThread.delete(normalizedThreadId);
}
function clearLiveCollabChildActivityForTurn(turnId){
  const normalizedTurnId=safeString(turnId,160);
  if(!normalizedTurnId)return;
  for(const[threadId,entry]of liveCollabChildActivityByThread.entries()){
    if(safeString(entry&&entry.parentTurnId,160)!==normalizedTurnId)continue;
    liveCollabChildActivityByThread.delete(threadId);
  }
}
function liveCollabReceiverIdsForItem(item,tracker,max=4){
  const direct=extractCollabReceiverThreadIds(item,max);
  if(direct.length)return direct;
  const itemId=safeString(item&&item.id,120);
  if(!itemId||!tracker||!(tracker.receiverIdsByCallId instanceof Map))return[];
  const cached=tracker.receiverIdsByCallId.get(itemId);
  return Array.isArray(cached)?cached.slice(0,max):[];
}
function observeLiveCollabItem({item,phase="",tracker=null}={}){
  if(!item||typeof item!=="object"||!isCollabToolItemType(item.type))return null;
  pruneLiveCollabChildState();
  const normalizedPhase=safeString(phase,40).toLowerCase();
  const tool=normalizeToolNameForComparison(item.tool);
  const itemId=safeString(item.id,120);
  let receiverIds=extractCollabReceiverThreadIds(item,4);
  if(itemId&&tracker&&tracker.receiverIdsByCallId instanceof Map&&receiverIds.length){
    tracker.receiverIdsByCallId.set(itemId,receiverIds.slice(0,4));
  }
  if(!receiverIds.length){
    receiverIds=liveCollabReceiverIdsForItem(item,tracker,4);
  }
  let childName="";
  if(tool==="spawnagent"){
    const status=safeString(item.status,40).toLowerCase();
    if(status==="completed"&&receiverIds.length){
      childName=inferLiveCollabChildName({item,tracker});
      receiverIds.forEach((receiverId)=>{
        setLiveCollabChildActivity(receiverId,{
          name:childName,
          status:"spawned",
          detail:"spawn完了 / 子agent初期化中",
          tracker,
        });
      });
    }
    return{receiverIds,childName};
  }
  if(tool==="wait"){
    if(normalizedPhase==="started"&&receiverIds.length){
      receiverIds.forEach((receiverId)=>{
        childName=childName||inferLiveCollabChildName({item,tracker});
        setLiveCollabChildActivity(receiverId,{
          name:childName,
          status:"working",
          detail:"子agentが処理中",
          tracker,
        });
      });
    }
    if(normalizedPhase==="completed"&&receiverIds.length){
      receiverIds.forEach((receiverId)=>clearLiveCollabChildActivity(receiverId));
      if(itemId&&tracker&&tracker.receiverIdsByCallId instanceof Map){
        tracker.receiverIdsByCallId.delete(itemId);
      }
    }
    return{receiverIds,childName};
  }
  if(tool==="sendinput"||tool==="resumeagent"){
    if(receiverIds.length){
      receiverIds.forEach((receiverId)=>{
        childName=childName||inferLiveCollabChildName({item,tracker});
        setLiveCollabChildActivity(receiverId,{
          name:childName,
          status:"working",
          detail:tool==="sendinput"?"追加入力を処理中":"子agentを再開中",
          tracker,
        });
      });
    }
    if(normalizedPhase==="completed"&&itemId&&tracker&&tracker.receiverIdsByCallId instanceof Map){
      tracker.receiverIdsByCallId.delete(itemId);
    }
    return{receiverIds,childName};
  }
  if(tool==="closeagent"){
    if(normalizedPhase==="completed"&&receiverIds.length){
      receiverIds.forEach((receiverId)=>{
        clearLiveCollabChildActivity(receiverId);
        liveCollabChildCatalogByThread.delete(receiverId);
        if(tracker&&tracker.childNameByThread instanceof Map){
          tracker.childNameByThread.delete(receiverId);
        }
      });
    }
    if(itemId&&tracker&&tracker.receiverIdsByCallId instanceof Map){
      tracker.receiverIdsByCallId.delete(itemId);
    }
    return{receiverIds,childName};
  }
  return{receiverIds,childName};
}
function getLiveCollabChildRows(){
  pruneLiveCollabChildState();
  return Array.from(liveCollabChildActivityByThread.values()).map((entry)=>({
    name:safeString(entry&&entry.name,120)||normalizeLiveCollabFallbackName(entry&&entry.threadId?entry.threadId:""),
    description:safeString(entry&&entry.detail,240)||safeString(entry&&entry.description,400)||"",
    role:safeString(entry&&entry.role,80)||inferAgentRole(safeString(entry&&entry.name,120)||"",safeString(entry&&entry.description,400)||""),
    source:"collab",
    isActive:true,
    selected:false,
    threadId:safeString(entry&&entry.threadId,160)||null,
    activeTurnId:safeString(entry&&entry.activeTurnId,160)||null,
    sessionRef:safeString(entry&&entry.sessionRef,160)||safeString(entry&&entry.threadId,160)||null,
    status:safeString(entry&&entry.status,80)||"running",
  }));
}

let latestTurnSnapshot=null;
let latestGitAutomationSnapshot=null;
let latestAdversarialShadowReview=null;
const sessionPerformanceLimits=Object.freeze({
  maxSessions:48,
  maxSamples:120,
});
const sessionPerformanceByRef=new Map();

function toNonNegativeInt(value){
  const parsed=Number(value);
  if(!Number.isFinite(parsed))return 0;
  return Math.max(0,Math.trunc(parsed));
}
function normalizeTokenUsageTotals(usage){
  const source=usage&&typeof usage==="object"?usage:{};
  const modelContextWindow=Number.isFinite(Number(source.modelContextWindow))?Math.max(0,Math.trunc(Number(source.modelContextWindow))):null;
  return{
    totalTokens:toNonNegativeInt(source.totalTokens),
    inputTokens:toNonNegativeInt(source.inputTokens),
    cachedInputTokens:toNonNegativeInt(source.cachedInputTokens),
    outputTokens:toNonNegativeInt(source.outputTokens),
    reasoningOutputTokens:toNonNegativeInt(source.reasoningOutputTokens),
    modelContextWindow,
  };
}
function addTokenUsageTotals(base,extra){
  const left=normalizeTokenUsageTotals(base);
  const right=normalizeTokenUsageTotals(extra);
  return{
    totalTokens:left.totalTokens+right.totalTokens,
    inputTokens:left.inputTokens+right.inputTokens,
    cachedInputTokens:left.cachedInputTokens+right.cachedInputTokens,
    outputTokens:left.outputTokens+right.outputTokens,
    reasoningOutputTokens:left.reasoningOutputTokens+right.reasoningOutputTokens,
    modelContextWindow:right.modelContextWindow!==null?right.modelContextWindow:left.modelContextWindow,
  };
}
function cloneSeries(values,max=sessionPerformanceLimits.maxSamples){
  return Array.isArray(values)
    ?values.map((value)=>toNonNegativeInt(value)).slice(-Math.max(1,Math.trunc(max)))
    :[];
}
function trimSessionPerformanceSamples(record){
  if(!record||!record.history)return;
  const limit=Math.max(8,Math.trunc(sessionPerformanceLimits.maxSamples));
  if(Array.isArray(record.history.tokens)&&record.history.tokens.length>limit)record.history.tokens=record.history.tokens.slice(-limit);
  if(Array.isArray(record.history.processingMs)&&record.history.processingMs.length>limit)record.history.processingMs=record.history.processingMs.slice(-limit);
  if(Array.isArray(record.history.at)&&record.history.at.length>limit)record.history.at=record.history.at.slice(-limit);
}
function pruneSessionPerformanceRecords(){
  const max=Math.max(4,Math.trunc(sessionPerformanceLimits.maxSessions));
  if(sessionPerformanceByRef.size<=max)return;
  const sorted=[...sessionPerformanceByRef.entries()].sort((a,b)=>{
    const aAt=a&&a[1]&&Number.isFinite(Number(a[1].updatedAt))?Number(a[1].updatedAt):0;
    const bAt=b&&b[1]&&Number.isFinite(Number(b[1].updatedAt))?Number(b[1].updatedAt):0;
    return aAt-bAt;
  });
  while(sessionPerformanceByRef.size>max&&sorted.length){
    const removed=sorted.shift();
    if(!removed||!removed[0])continue;
    sessionPerformanceByRef.delete(removed[0]);
  }
}
function ensureSessionPerformanceRecord(sessionRef,agentName){
  const ref=typeof sessionRef==="string"&&sessionRef.trim()?sessionRef.trim():"";
  if(!ref)return null;
  let record=sessionPerformanceByRef.get(ref);
  const now=Date.now();
  if(!record){
    record={
      sessionRef:ref,
      agentName:safeString(agentName,120)||"",
      createdAt:now,
      updatedAt:now,
      turnsCompleted:0,
      cumulativeUsage:normalizeTokenUsageTotals(null),
      cumulativeProcessingMs:0,
      history:{
        tokens:[],
        processingMs:[],
        at:[],
      },
      inFlight:null,
    };
    sessionPerformanceByRef.set(ref,record);
    pruneSessionPerformanceRecords();
  }else{
    if(typeof agentName==="string"&&agentName.trim()){
      record.agentName=safeString(agentName,120)||record.agentName;
    }
    record.updatedAt=now;
  }
  return record;
}
function startSessionPerformanceTurn(sessionRef,turnId,agentName,startedAt){
  const record=ensureSessionPerformanceRecord(sessionRef,agentName);
  if(!record)return;
  const startTs=Number.isFinite(Number(startedAt))?Math.max(0,Math.trunc(Number(startedAt))):Date.now();
  record.inFlight={
    turnId:safeString(turnId,160)||"",
    startedAt:startTs,
    tokenUsage:normalizeTokenUsageTotals(null),
    updatedAt:Date.now(),
  };
  record.updatedAt=Date.now();
}
function updateSessionPerformanceTurnUsage(sessionRef,turnId,usage){
  const record=ensureSessionPerformanceRecord(sessionRef,"");
  if(!record)return;
  const targetTurnId=safeString(turnId,160);
  if(!record.inFlight||record.inFlight.turnId!==targetTurnId){
    return;
  }
  record.inFlight.tokenUsage=normalizeTokenUsageTotals(usage);
  record.inFlight.updatedAt=Date.now();
  record.updatedAt=Date.now();
}
function finishSessionPerformanceTurn(sessionRef,turnId,{startedAt,completedAt,usage,agentName}={}){
  const record=ensureSessionPerformanceRecord(sessionRef,agentName);
  if(!record)return;
  const targetTurnId=safeString(turnId,160);
  if(!targetTurnId)return;
  const live=record.inFlight&&record.inFlight.turnId===targetTurnId?record.inFlight:null;
  const startTs=Number.isFinite(Number(startedAt))
    ?Math.max(0,Math.trunc(Number(startedAt)))
    :(live?toNonNegativeInt(live.startedAt):Date.now());
  const endTs=Number.isFinite(Number(completedAt))
    ?Math.max(0,Math.trunc(Number(completedAt)))
    :Date.now();
  const durationMs=Math.max(0,endTs-startTs);
  const usageFromArgs=normalizeTokenUsageTotals(usage);
  const usageFromLive=live?normalizeTokenUsageTotals(live.tokenUsage):normalizeTokenUsageTotals(null);
  const turnUsage=usageFromArgs.totalTokens>0||usageFromArgs.inputTokens>0||usageFromArgs.outputTokens>0||usageFromArgs.cachedInputTokens>0||usageFromArgs.reasoningOutputTokens>0
    ?usageFromArgs
    :usageFromLive;
  record.turnsCompleted=toNonNegativeInt(record.turnsCompleted)+1;
  record.cumulativeUsage=addTokenUsageTotals(record.cumulativeUsage,turnUsage);
  record.cumulativeProcessingMs=toNonNegativeInt(record.cumulativeProcessingMs)+durationMs;
  record.history.tokens.push(toNonNegativeInt(record.cumulativeUsage.totalTokens));
  record.history.processingMs.push(toNonNegativeInt(record.cumulativeProcessingMs));
  record.history.at.push(endTs);
  trimSessionPerformanceSamples(record);
  if(live)record.inFlight=null;
  record.updatedAt=Date.now();
}
function getSessionPerformanceSnapshot(sessionRef){
  const ref=typeof sessionRef==="string"&&sessionRef.trim()?sessionRef.trim():"";
  const now=Date.now();
  const base={
    sessionRef:ref||null,
    agentName:null,
    turnsCompleted:0,
    cumulative:{
      ...normalizeTokenUsageTotals(null),
      processingMs:0,
    },
    live:{
      active:false,
      turnId:null,
      startedAt:null,
      elapsedMs:0,
      tokenUsage:normalizeTokenUsageTotals(null),
    },
    aggregate:{
      ...normalizeTokenUsageTotals(null),
      processingMs:0,
    },
    history:{
      tokens:[],
      processingMs:[],
      at:[],
    },
    updatedAt:now,
  };
  if(!ref)return base;
  const record=sessionPerformanceByRef.get(ref);
  if(!record)return base;
  const cumulativeUsage=normalizeTokenUsageTotals(record.cumulativeUsage);
  const cumulativeProcessingMs=toNonNegativeInt(record.cumulativeProcessingMs);
  let liveSnapshot={
    active:false,
    turnId:null,
    startedAt:null,
    elapsedMs:0,
    tokenUsage:normalizeTokenUsageTotals(null),
  };
  let aggregateUsage={...cumulativeUsage};
  let aggregateProcessingMs=cumulativeProcessingMs;
  if(record.inFlight&&record.inFlight.turnId){
    const startedAt=toNonNegativeInt(record.inFlight.startedAt);
    const elapsedMs=Math.max(0,now-startedAt);
    const liveUsage=normalizeTokenUsageTotals(record.inFlight.tokenUsage);
    liveSnapshot={
      active:true,
      turnId:record.inFlight.turnId,
      startedAt,
      elapsedMs,
      tokenUsage:liveUsage,
    };
    aggregateUsage=addTokenUsageTotals(cumulativeUsage,liveUsage);
    aggregateProcessingMs=cumulativeProcessingMs+elapsedMs;
  }
  return{
    sessionRef:ref,
    agentName:record.agentName||null,
    turnsCompleted:toNonNegativeInt(record.turnsCompleted),
    cumulative:{
      ...cumulativeUsage,
      processingMs:cumulativeProcessingMs,
    },
    live:liveSnapshot,
    aggregate:{
      ...aggregateUsage,
      processingMs:aggregateProcessingMs,
    },
    history:{
      tokens:cloneSeries(record.history&&record.history.tokens,80),
      processingMs:cloneSeries(record.history&&record.history.processingMs,80),
      at:cloneSeries(record.history&&record.history.at,80),
    },
    updatedAt:toNonNegativeInt(record.updatedAt)||now,
  };
}
function cloneAdversarialShadowReviewSnapshot(snapshot){
  if(!snapshot||typeof snapshot!=="object")return null;
  const severitySource=snapshot&&snapshot.severity&&typeof snapshot.severity==="object"?snapshot.severity:{};
  const signalsSource=snapshot&&snapshot.signals&&typeof snapshot.signals==="object"?snapshot.signals:{};
  return{
    evaluatedAt:typeof snapshot.evaluatedAt==="string"?snapshot.evaluatedAt:null,
    turnId:safeString(snapshot.turnId,160)||null,
    threadId:safeString(snapshot.threadId,160)||null,
    agentName:safeString(snapshot.agentName,120)||null,
    attempt:toNonNegativeInt(snapshot.attempt),
    status:safeString(snapshot.status,40)||"unknown",
    score:toNonNegativeInt(snapshot.score),
    minScore:toNonNegativeInt(snapshot.minScore),
    decision:safeString(snapshot.decision,40)||"needs_improvement",
    findingCount:toNonNegativeInt(snapshot.findingCount),
    severity:{
      critical:toNonNegativeInt(severitySource.critical),
      high:toNonNegativeInt(severitySource.high),
      medium:toNonNegativeInt(severitySource.medium),
      low:toNonNegativeInt(severitySource.low),
    },
    topFindingIds:Array.isArray(snapshot.topFindingIds)
      ?snapshot.topFindingIds.map((entry)=>safeString(entry,80)).filter(Boolean).slice(0,8)
      :[],
    signals:{
      promptChars:toNonNegativeInt(signalsSource.promptChars),
      answerChars:toNonNegativeInt(signalsSource.answerChars),
      recencyRequested:signalsSource.recencyRequested?1:0,
      answerHasDate:signalsSource.answerHasDate?1:0,
      citationRequested:signalsSource.citationRequested?1:0,
      answerHasCitation:signalsSource.answerHasCitation?1:0,
    },
  };
}
function buildAdversarialShadowRuntimeSnapshot(){
  return{
    enabled:adversarialShadowEnabled,
    mode:adversarialShadowEnabled?"shadow":"off",
    version:shadowReviewVersion,
    minScore:adversarialShadowMinScore,
    maxPromptChars:adversarialShadowMaxPromptChars,
    maxAnswerChars:adversarialShadowMaxAnswerChars,
    loop:{
      enabled:adversarialShadowEnabled&&adversarialLoopEnabled,
      maxRetries:adversarialLoopMaxRetries,
    },
    latestReview:cloneAdversarialShadowReviewSnapshot(latestAdversarialShadowReview),
  };
}
function runAdversarialShadowReview(input={},meta={}){
  if(!adversarialShadowEnabled)return null;
  const context=input&&typeof input==="object"?input:{};
  try{
    const prompt=safeString(context.prompt,adversarialShadowMaxPromptChars);
    const answer=safeString(context.answer,adversarialShadowMaxAnswerChars);
    const status=normalizeExecutionState(context.status,{terminalFallback:true});
    const review=buildAdversarialShadowReview({
      prompt,
      answer,
      status,
      minScore:adversarialShadowMinScore,
      maxPromptChars:adversarialShadowMaxPromptChars,
      maxAnswerChars:adversarialShadowMaxAnswerChars,
      responseContract:userFacingResponseContract,
    });
    const findings=Array.isArray(review&&review.red&&review.red.findings)?review.red.findings:[];
    const severity=review&&review.red&&review.red.severity&&typeof review.red.severity==="object"
      ?review.red.severity
      :{};
    const signals=review&&review.signals&&typeof review.signals==="object"?review.signals:{};
    const attempt=Number.isFinite(Number(context.attempt))?Math.max(0,Math.trunc(Number(context.attempt))):0;
    const summary={
      evaluatedAt:new Date().toISOString(),
      turnId:safeString(context.turnId,160)||null,
      threadId:safeString(context.threadId,160)||null,
      agentName:safeString(context.agentName,120)||null,
      attempt,
      status:safeString(review&&review.status,40)||status,
      score:toNonNegativeInt(review&&review.score),
      minScore:toNonNegativeInt(review&&review.minScore)||adversarialShadowMinScore,
      decision:safeString(review&&review.decision,40)||"needs_improvement",
      findingCount:Number.isFinite(Number(review&&review.red&&review.red.findingCount))
        ?Math.max(0,Math.trunc(Number(review.red.findingCount)))
        :findings.length,
      severity:{
        critical:toNonNegativeInt(severity.critical),
        high:toNonNegativeInt(severity.high),
        medium:toNonNegativeInt(severity.medium),
        low:toNonNegativeInt(severity.low),
      },
      topFindingIds:findings.map((finding)=>safeString(finding&&finding.id,80)).filter(Boolean).slice(0,8),
      signals:{
        promptChars:toNonNegativeInt(signals.promptChars),
        answerChars:toNonNegativeInt(signals.answerChars),
        recencyRequested:signals.recencyRequested?1:0,
        answerHasDate:signals.answerHasDate?1:0,
        citationRequested:signals.citationRequested?1:0,
        answerHasCitation:signals.answerHasCitation?1:0,
      },
    };
    latestAdversarialShadowReview=summary;
    const queueMs=Number.isFinite(Number(meta&&meta.queueMs))?Math.max(0,Math.trunc(Number(meta.queueMs))):0;
    logOperation("shadow.review",{
      a:safeString(context.agentName,80),
      th:safeString(context.threadId,120),
      turn:safeString(context.turnId,120),
      attempt,
      queueMs,
      status:summary.status,
      score:summary.score,
      minScore:summary.minScore,
      decision:summary.decision,
      findings:summary.findingCount,
      severity:summary.severity,
      top:summary.topFindingIds,
      signals:summary.signals,
      prompt:summarizeTextForOperationLog(prompt,adversarialShadowMaxPromptChars),
      answer:summarizeTextForOperationLog(answer,adversarialShadowMaxAnswerChars),
    },"standard");
    if(summary.decision!=="pass"){
      logOperation("shadow.review_flag",{
        a:safeString(context.agentName,80),
        th:safeString(context.threadId,120),
        turn:safeString(context.turnId,120),
        attempt,
        score:summary.score,
        minScore:summary.minScore,
        findings:summary.findingCount,
        top:summary.topFindingIds,
      },"standard");
    }
    return{
      review,
      summary,
    };
  }catch(error){
    logOperation("shadow.review_failed",{
      a:safeString(context.agentName,80),
      th:safeString(context.threadId,120),
      turn:safeString(context.turnId,120),
      attempt:Number.isFinite(Number(context&&context.attempt))?Math.max(0,Math.trunc(Number(context.attempt))):0,
      err:summarizeErrorForOperationLog(error,220),
    },"standard");
    return null;
  }
}
function queueAdversarialShadowReview(input={}){
  if(!adversarialShadowEnabled)return;
  const queuedAt=Date.now();
  setImmediate(()=>{
    const queueMs=Math.max(0,Date.now()-queuedAt);
    runAdversarialShadowReview(input,{queueMs});
  });
}

function getMimeType(filePath){const ext=path.extname(filePath).toLowerCase();if(ext===".html")return"text/html; charset=utf-8";if(ext===".js")return"application/javascript; charset=utf-8";if(ext===".css")return"text/css; charset=utf-8";if(ext===".json")return"application/json; charset=utf-8";if(ext===".svg")return"image/svg+xml";if(ext===".png")return"image/png";if(ext===".jpg"||ext===".jpeg")return"image/jpeg";if(ext===".ico")return"image/x-icon";return"application/octet-stream";}
function openBrowser(url){
  if(edgeExecutablePath){
    try{
      const edge=spawn(edgeExecutablePath,["--new-window",url],{detached:true,stdio:"ignore",windowsHide:true});
      edge.unref();
      return;
    }catch(e){
      console.error("[launcher] edge launch failed:",e.message);
    }
  }
  try{
    const cmd=`start \"\" \"${url}\"`;
    const c=spawn("cmd.exe",["/d","/s","/c",cmd],{detached:true,stdio:"ignore",windowsHide:true});
    c.unref();
  }catch(e){
    console.error("[launcher] open browser failed:",e.message);
  }
}
function canWriteResponse(res){return Boolean(res&&!res.writableEnded&&!res.destroyed&&(!res.socket||!res.socket.destroyed));}
function sendJson(res,statusCode,payload){
  if(!canWriteResponse(res))return false;
  try{
    const body=JSON.stringify(payload);
    res.writeHead(statusCode,{"Content-Type":"application/json; charset=utf-8","Content-Length":Buffer.byteLength(body),"Cache-Control":"no-store"});
    res.end(body);
    return true;
  }catch{
    return false;
  }
}
function readRequestBody(req,maxBytes=defaultRequestBodyLimitBytes){return new Promise((resolve,reject)=>{let data="";let failed=false;req.on("data",chunk=>{if(failed)return;data+=chunk.toString("utf8");if(data.length>maxBytes){failed=true;reject(new Error("Request body too large"));}});req.on("end",()=>{if(!failed)resolve(data);});req.on("error",reject);});}
function isRequestBodyTooLargeError(error){
  const message=typeof error==="string"
    ? error
    : (error&&typeof error.message==="string"?error.message:"");
  return /request body too large/i.test(message);
}
function resolveExecRequestErrorStatus(error){
  if(isRequestBodyTooLargeError(error))return 413;
  if(error instanceof SyntaxError)return 400;
  const message=safeString(error&&error.message?error.message:String(error),240).toLowerCase();
  if(/^idempotency key /.test(message))return 400;
  if(/^content-type must be /.test(message))return 415;
  if(/^unsupported content-type:/.test(message))return 415;
  if(/^cwd does not exist:/.test(message))return 400;
  if(/^cwd is not a directory:/.test(message))return 400;
  if(/^images\[\d+\]:/.test(message))return 400;
  if(/^unsupported image /.test(message))return 400;
  if(/^image\./.test(message))return 400;
  if(/^total image /.test(message))return 400;
  if(message==="prompt or image is required")return 400;
  return 500;
}
function resolveExistingDirectory(value,{baseDir=workspaceRoot}={}){
  const raw=normalizeOptionalString(value,2000);
  if(!raw)return null;
  const resolved=path.isAbsolute(raw)?path.normalize(raw):path.normalize(path.join(baseDir,raw));
  try{
    const stat=fs.statSync(resolved);
    return stat.isDirectory()?resolved:null;
  }catch{
    return null;
  }
}
function resolveExistingStaticDirectory(value,{baseDir=workspaceRoot,indexFile="index.html"}={}){
  const resolved=resolveExistingDirectory(value,{baseDir});
  if(!resolved)return null;
  if(!indexFile)return resolved;
  try{
    const stat=fs.statSync(path.join(resolved,indexFile));
    return stat.isFile()?resolved:null;
  }catch{
    return null;
  }
}
function getEnglishConversationAppStaticSource(){
  const envKey="CODEX_ENGLISH_CONVERSATION_APP_ROOT";
  const rawOverride=normalizeOptionalString(process.env[envKey],2000);
  const overrideCandidates=rawOverride
    ?[
      {root:rawOverride,baseDir:workspaceRoot,source:"env-override-root"},
      {root:path.join(rawOverride,"dist"),baseDir:workspaceRoot,source:"env-override-dist"},
      {root:path.join(rawOverride,"web","english-conversation-app"),baseDir:workspaceRoot,source:"env-override-web"},
    ]
    :[];
  const siblingCandidates=[
    {root:defaultExternalEnglishConversationAppRoot,source:"external-sibling-root"},
    {root:path.join(defaultExternalEnglishConversationAppRoot,"dist"),source:"external-sibling-dist"},
    {root:path.join(defaultExternalEnglishConversationAppRoot,"web","english-conversation-app"),source:"external-sibling-web"},
  ];
  for(const candidate of [...overrideCandidates,...siblingCandidates]){
    const root=resolveExistingStaticDirectory(candidate.root,{baseDir:candidate.baseDir||workspaceRoot,indexFile:"index.html"});
    if(root){
      return{
        root,
        source:candidate.source,
        envKey,
        defaultSiblingRoot:defaultExternalEnglishConversationAppRoot,
        bundledRoot:bundledEnglishConversationAppRoot,
      };
    }
  }
  return{
    root:bundledEnglishConversationAppRoot,
    source:"workspace-bundled",
    envKey,
    defaultSiblingRoot:defaultExternalEnglishConversationAppRoot,
    bundledRoot:bundledEnglishConversationAppRoot,
  };
}
function buildStaticAppsRuntimeSnapshot(){
  const englishConversationApp=getEnglishConversationAppStaticSource();
  return{
    englishConversationApp:{
      mountPath:"/english-conversation-app",
      root:summarizePathForOperationLog(englishConversationApp.root,220),
      source:englishConversationApp.source,
      envKey:englishConversationApp.envKey,
      defaultSiblingRoot:summarizePathForOperationLog(englishConversationApp.defaultSiblingRoot,220),
      bundledRoot:summarizePathForOperationLog(englishConversationApp.bundledRoot,220),
    },
  };
}
function normalizeStaticRequestRelativePath(rawPath){
  const decoded=String(rawPath||"").replace(/^\/+/,"");
  if(!decoded)return"index.html";
  if(/[\\/]$/.test(decoded))return path.join(decoded,"index.html");
  return decoded;
}
function buildStaticRequestTarget(pathname){
  const decoded=decodeURIComponent(pathname||"/");
  if(decoded==="/"||decoded===""){
    const relativePath="index.html";
    const absolutePath=path.resolve(webRoot,relativePath);
    return{root:webRoot,absolutePath,allowed:isPathWithin(webRoot,absolutePath)};
  }
  if(decoded==="/english-conversation-app"||decoded.startsWith("/english-conversation-app/")){
    const source=getEnglishConversationAppStaticSource();
    const relativePath=decoded==="/english-conversation-app"
      ?"index.html"
      :normalizeStaticRequestRelativePath(decoded.slice("/english-conversation-app/".length));
    const absolutePath=path.resolve(source.root,relativePath);
    return{
      root:source.root,
      absolutePath,
      allowed:isPathWithin(source.root,absolutePath),
      source:source.source,
    };
  }
  const relativePath=normalizeStaticRequestRelativePath(decoded);
  const absolutePath=path.resolve(webRoot,relativePath);
  return{root:webRoot,absolutePath,allowed:isPathWithin(webRoot,absolutePath)};
}
function serveStaticFile(req,res,pathname){
  const target=buildStaticRequestTarget(pathname);
  if(!target||!target.allowed){
    sendJson(res,403,{error:"Forbidden"});
    return;
  }
  try{
    const stat=fs.statSync(target.absolutePath);
    if(stat.isDirectory()){
      target.absolutePath=path.resolve(target.absolutePath,"index.html");
    }
  }catch{
  }
  if(!isPathWithin(target.root,target.absolutePath)){
    sendJson(res,403,{error:"Forbidden"});
    return;
  }
  fs.readFile(target.absolutePath,(err,data)=>{
    if(err){
      sendJson(res,404,{error:"Not found"});
      return;
    }
    res.writeHead(200,{
      "Content-Type":getMimeType(target.absolutePath),
      "Content-Length":data.length,
      "Cache-Control":"no-cache",
    });
    res.end(data);
  });
}
function openCmdWindow(){
  const cd=`cd /d \"${workspaceRoot}\"`;
  const cmd=`start \"\" /min cmd.exe /d /k ${cd}`;
  const c=spawn("cmd.exe",["/d","/s","/c",cmd],{cwd:workspaceRoot,detached:true,stdio:"ignore",windowsHide:true});
  c.unref();
}
function writeChunk(res,text){
  if(!res||res.writableEnded||res.destroyed||(res.socket&&res.socket.destroyed))return;
  try{
    res.write(text);
  }catch{
  }
} 
function replyLocalText(res,text){writeChunk(res,text.endsWith("\n")?text:`${text}\n`);if(!res.writableEnded)res.end();}
function isSlashCommand(prompt){return typeof prompt==="string"&&prompt.trim().startsWith("/");}
function normalizeApprovalPolicy(v){const n=(v||"on-request").trim().toLowerCase();return allowedApprovalPolicies.has(n)?n:"on-request";}
function normalizeSandboxMode(v){const n=(v||"workspace-write").trim().toLowerCase();return allowedSandboxModes.has(n)?n:"workspace-write";}
function normalizeBooleanFlag(v){if(typeof v==="boolean")return v;if(typeof v==="number")return v!==0;if(typeof v==="string"){const n=v.trim().toLowerCase();return n==="1"||n==="true"||n==="yes"||n==="on";}return false;}
function normalizeAgentName(v){if(typeof v!=="string")return null;const n=v.trim();if(!n)return null;return n.slice(0,120);} 
function normalizeExecModel(v,fallback=defaultExecModelName){
  const requested=safeString(v,120);
  if(requested){
    const normalized=tryNormalizeExecModelId(requested);
    if(!normalized)throw new Error(`invalid model: ${normalizeExecModelAlias(requested)||requested.trim()}`);
    return normalized;
  }
  return tryNormalizeExecModelId(fallback)||defaultExecModelName||defaultExecModelFallbackName;
}
function tryNormalizeExecModelReasoningEffort(value){
  const normalized=safeString(value,40).trim().toLowerCase();
  if(!normalized)return"";
  return allowedModelReasoningEfforts.has(normalized)?normalized:"";
}
function normalizeExecModelReasoningEffort(value,fallback=defaultExecModelReasoningEffort){
  const requested=safeString(value,40);
  if(requested){
    const normalized=tryNormalizeExecModelReasoningEffort(requested);
    if(!normalized)throw new Error(`invalid model_reasoning_effort: ${requested.trim()}`);
    return normalized;
  }
  return tryNormalizeExecModelReasoningEffort(fallback)||defaultExecModelReasoningEffort||defaultExecModelReasoningEffortFallback;
}
function normalizeKokoroServiceBaseUrl(value){
  const fallback="http://127.0.0.1:8880";
  const raw=safeString(value,320)||fallback;
  try{
    const parsed=new URL(raw);
    if(parsed.protocol!=="http:"&&parsed.protocol!=="https:")return fallback;
    return `${parsed.protocol}//${parsed.host}`;
  }catch{
    return fallback;
  }
}
function conversationApiConfigured(){
  return true;
}
function getConversationRuntimeSnapshot(){
  return{
    ok:true,
    mode:"app-server",
    provider:conversationProvider,
    model:conversationAppServerModel,
    configured:conversationApiConfigured(),
    setupHint:"",
    originCheck:true,
    contentType:conversationApiRequiredContentType,
    endpoint:"POST /api/conversation/direct",
    modeOptions:conversationModeValues.slice(),
    defaultMode:defaultConversationModeValue,
    persona:{
      mode:"persona_friend",
      userIdField:"personaUserId",
      memory:{
        enabled:true,
        resetEndpoint:"POST /api/conversation/persona/reset",
        storage:summarizePathForOperationLog(conversationPersonaMemoryPath,220),
      },
    },
    limits:{
      bodyBytes:conversationRequestBodyLimitBytes,
      timeoutMs:conversationRequestTimeoutMs,
      maxTokens:conversationDefaultMaxTokens,
      historyItems:14,
    },
  };
}
function getKokoroVoiceRuntimeSnapshot(){
  return{
    provider:"kokoro",
    endpoint:"POST /api/voice/kokoro",
    serviceBaseUrl:kokoroVoiceServiceBaseUrl,
    model:kokoroDefaultModel,
    voice:kokoroDefaultVoice,
    langCode:kokoroDefaultLangCode,
    originCheck:true,
    contentType:conversationApiRequiredContentType,
    limits:{
      bodyBytes:kokoroVoiceRequestBodyLimitBytes,
      timeoutMs:kokoroVoiceRequestTimeoutMs,
    },
  };
}
function normalizeConversationMessage(value){
  return safeString(value,2000);
}
function normalizeConversationMode(value){
  return normalizeConversationModePolicy(value,defaultConversationModeValue);
}
function normalizeConversationLevel(value){
  const raw=safeString(value,40).toLowerCase();
  if(raw==="beginner"||raw==="intermediate"||raw==="advanced")return raw;
  return"intermediate";
}
function normalizeConversationTopic(value){
  return safeString(value,140);
}
function normalizeConversationPersonaUserId(value){
  return normalizePersonaUserIdPolicy(value,defaultPersonaUserIdValue);
}
function normalizeConversationHistoryItems(value){
  const source=Array.isArray(value)?value:[];
  const normalized=[];
  for(const item of source){
    if(!item||typeof item!=="object")continue;
    const role=safeString(item.role,20).toLowerCase();
    if(role!=="user"&&role!=="assistant")continue;
    const text=safeString(String(item.text||"").replace(/\s+/g," "),800);
    if(!text)continue;
    normalized.push({role,text});
  }
  return normalized.slice(-14);
}
function normalizeConversationHistoryRoleLabel(role){
  return role==="assistant"?"AI":"Learner";
}
function loadConversationPersonaMemoryStore(){
  if(conversationPersonaMemoryLoaded){
    return conversationPersonaMemoryStore;
  }
  conversationPersonaMemoryLoaded=true;
  if(!fs.existsSync(conversationPersonaMemoryPath)){
    conversationPersonaMemoryStore=createDefaultPersonaMemoryStore();
    return conversationPersonaMemoryStore;
  }
  try{
    const raw=fs.readFileSync(conversationPersonaMemoryPath,"utf8");
    const parsed=raw?JSON.parse(raw):{};
    conversationPersonaMemoryStore=normalizePersonaMemoryStore(parsed);
  }catch(error){
    conversationPersonaMemoryStore=createDefaultPersonaMemoryStore();
    logOperation("conversation.persona_memory_load_failed",{
      err:summarizeErrorForOperationLog(error,220),
      path:summarizePathForOperationLog(conversationPersonaMemoryPath,220),
    },"core");
  }
  return conversationPersonaMemoryStore;
}
function persistConversationPersonaMemoryStore(){
  try{
    const normalizedStore=normalizePersonaMemoryStore(conversationPersonaMemoryStore);
    conversationPersonaMemoryStore=normalizedStore;
    fs.mkdirSync(path.dirname(conversationPersonaMemoryPath),{recursive:true,mode:0o700});
    fs.writeFileSync(conversationPersonaMemoryPath,`${JSON.stringify(normalizedStore,null,2)}\n`,"utf8");
    return true;
  }catch(error){
    logOperation("conversation.persona_memory_persist_failed",{
      err:summarizeErrorForOperationLog(error,220),
      path:summarizePathForOperationLog(conversationPersonaMemoryPath,220),
    },"core");
    return false;
  }
}
function getConversationPersonaMemoryRecord(userId){
  const store=loadConversationPersonaMemoryStore();
  const ensured=ensurePersonaMemoryRecord(store,userId);
  conversationPersonaMemoryStore=ensured.store;
  return{
    userId:ensured.userId,
    record:ensured.record,
  };
}
function buildConversationPersonaMemorySummary(record,{maxFacts=conversationPersonaMemoryContextFacts,maxTopics=conversationPersonaMemoryContextTopics}={}){
  const context=selectPersonaMemoryContext(record,{maxFacts,maxTopics});
  const facts=Array.isArray(record&&record.facts)?record.facts:[];
  const topics=Array.isArray(record&&record.topics)?record.topics:[];
  return{
    turns:Number.isFinite(Number(context.turns))?Math.max(0,Math.trunc(Number(context.turns))):0,
    factsCount:facts.length,
    topicsCount:topics.length,
    recentFacts:Array.isArray(context.facts)?context.facts:[],
    recentTopics:Array.isArray(context.topics)?context.topics:[],
    updatedAt:Number.isFinite(Number(context.updatedAt))?Math.max(0,Math.trunc(Number(context.updatedAt))):0,
  };
}
function getConversationPersonaContextForUser(userId){
  const ensured=getConversationPersonaMemoryRecord(userId);
  const context=selectPersonaMemoryContext(ensured.record,{
    maxFacts:conversationPersonaMemoryContextFacts,
    maxTopics:conversationPersonaMemoryContextTopics,
  });
  return{
    userId:ensured.userId,
    record:ensured.record,
    context,
    summary:buildConversationPersonaMemorySummary(ensured.record),
  };
}
function updateConversationPersonaMemoryForUser({userId,message,topic}){
  const ensured=getConversationPersonaMemoryRecord(userId);
  const updatedRecord=applyPersonaMemoryUpdate(ensured.record,{message,topic,nowMs:Date.now()});
  const store=loadConversationPersonaMemoryStore();
  store.users[ensured.userId]=updatedRecord;
  conversationPersonaMemoryStore=store;
  persistConversationPersonaMemoryStore();
  return{
    userId:ensured.userId,
    record:updatedRecord,
    summary:buildConversationPersonaMemorySummary(updatedRecord),
  };
}
function resetConversationPersonaMemoryForUser(userId){
  const normalizedUserId=normalizeConversationPersonaUserId(userId);
  const store=loadConversationPersonaMemoryStore();
  if(store&&store.users&&Object.prototype.hasOwnProperty.call(store.users,normalizedUserId)){
    delete store.users[normalizedUserId];
    conversationPersonaMemoryStore=store;
    persistConversationPersonaMemoryStore();
  }
  return{
    userId:normalizedUserId,
    summary:{
      turns:0,
      factsCount:0,
      topicsCount:0,
      recentFacts:[],
      recentTopics:[],
      updatedAt:0,
    },
  };
}
function buildConversationPromptFromRequest({message,history,level,topic,mode,memoryContext}){
  const conversationMode=normalizeConversationMode(mode);
  const learnerLevel=normalizeConversationLevel(level);
  const conversationTopic=normalizeConversationTopic(topic);
  const latestMessage=normalizeConversationMessage(message);
  const normalizedHistory=normalizeConversationHistoryItems(history);
  const historyLines=normalizedHistory.map((item)=>`${normalizeConversationHistoryRoleLabel(item.role)}: ${safeString(item.text,800)}`);
  const promptSections=buildConversationPromptSections({
    mode:conversationMode,
    learnerLevel,
    topic:conversationTopic,
    latestMessage,
    historyLines,
    memoryContext:conversationMode==="persona_friend"&&memoryContext&&typeof memoryContext==="object"?memoryContext:null,
  });
  const parts=Array.isArray(promptSections)&&promptSections.length
    ?promptSections
    :[
      "You are an American English conversation partner for speaking practice.",
      `Learner level: ${learnerLevel}.`,
      conversationTopic?`Focus topic: ${conversationTopic}`:"Focus topic: natural daily conversation",
      "Reply in natural spoken English, 2-4 short sentences, and ask one follow-up question to continue the conversation.",
      `Learner: ${latestMessage}`,
      "AI:",
    ];
  return parts.join("\n\n");
}
class BufferedConversationResponse extends EventEmitter{
  constructor(){
    super();
    this.statusCode=200;
    this.headers={};
    this.writableEnded=false;
    this.destroyed=false;
    this.socket={destroyed:false};
    this.buffer="";
  }
  writeHead(statusCode,headers){
    this.statusCode=Number.isFinite(Number(statusCode))?Math.trunc(Number(statusCode)):200;
    this.headers=headers&&typeof headers==="object"?{...headers}:{};
  }
  write(chunk){
    if(this.writableEnded)return false;
    const text=Buffer.isBuffer(chunk)?chunk.toString("utf8"):String(chunk||"");
    if(!text)return true;
    this.buffer+=text;
    while(true){
      const newlineIndex=this.buffer.indexOf("\n");
      if(newlineIndex<0)break;
      const line=this.buffer.slice(0,newlineIndex).trim();
      this.buffer=this.buffer.slice(newlineIndex+1);
      if(!line)continue;
      try{
        const event=JSON.parse(line);
        if(event&&typeof event==="object"){
          this.emit("event",event);
        }
      }catch{
        this.emit("event",{type:"raw",text:line});
      }
    }
    return true;
  }
  end(chunk){
    if(chunk!==undefined)this.write(chunk);
    if(this.writableEnded)return;
    this.writableEnded=true;
    this.emit("finish");
    this.emit("close");
  }
}
async function runConversationViaAppServer({message,history,level,topic,mode,memoryContext,timeoutMs}){
  const prompt=buildConversationPromptFromRequest({message,history,level,topic,mode,memoryContext});
  const responseStream=new BufferedConversationResponse();
  const effectiveTimeoutMs=Number.isFinite(Number(timeoutMs))
    ?Math.max(5000,Math.min(180000,Math.trunc(Number(timeoutMs))))
    :conversationRequestTimeoutMs;
  return new Promise((resolve,reject)=>{
    let settled=false;
    let finalText="";
    let deltaText="";
    let terminalStatus="";
    let terminalError="";
    let threadId="";
    let turnId="";
    const settle=(error,value)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timeoutId);
      if(error){
        reject(error);
        return;
      }
      resolve(value);
    };
    const timeoutId=setTimeout(()=>{
      const error=new Error("app-server conversation timed out");
      error.statusCode=504;
      settle(error);
      try{
        if(!responseStream.writableEnded)responseStream.end();
      }catch{
      }
    },effectiveTimeoutMs);
    responseStream.on("event",(event)=>{
      if(!event||typeof event!=="object")return;
      if(event.type==="turn"&&event.phase==="started"){
        threadId=safeString(event.threadId,120);
        turnId=safeString(event.turnId,120);
        return;
      }
      if(event.type==="delta"&&typeof event.text==="string"){
        deltaText=safeString(`${deltaText}${event.text}`,24000);
        return;
      }
      if(event.type==="final"&&typeof event.text==="string"){
        finalText=safeString(event.text,24000);
        return;
      }
      if(event.type==="status"){
        terminalStatus=normalizeExecutionState(event.status,{terminalFallback:true});
        return;
      }
      if(event.type==="error"&&typeof event.text==="string"){
        terminalError=safeString(event.text,1800);
        return;
      }
      if(event.type==="raw"&&typeof event.text==="string"){
        const rawText=safeString(event.text,1800);
        if(rawText){
          terminalError=rawText;
          if(rawText.startsWith("[error]")){
            terminalStatus="failed";
          }
        }
      }
    });
    responseStream.once("finish",()=>{
      const normalizedStatus=normalizeExecutionState(terminalStatus,{terminalFallback:true});
      if(normalizedStatus!=="completed"){
        const messageText=safeString(terminalError,1200)||`app-server conversation failed (${normalizedStatus})`;
        const error=new Error(messageText.startsWith("[error]")?messageText:`[error] ${messageText}`);
        error.statusCode=normalizedStatus==="interrupted"?499:502;
        settle(error);
        return;
      }
      const text=safeString(finalText||deltaText,24000);
      if(!text){
        const error=new Error("app-server conversation returned an empty response");
        error.statusCode=502;
        settle(error);
        return;
      }
      settle(null,{
        text,
        model:conversationAppServerModel,
        id:null,
        usage:{totalTokens:0,inputTokens:0,outputTokens:0},
        threadId:safeString(threadId,120)||null,
        turnId:safeString(turnId,120)||null,
      });
    });
    runCodexExecStreaming(responseStream,prompt,"workspace-write",{
      agentName:"default",
      approvalPolicy:"never",
      webSearch:false,
      cwd:workspaceRoot,
      requestUserInputPolicy:"auto-default",
      forceNewSession:true,
      disableSlashRouter:true,
      executionProfile:"conversation-app-server",
      executionIntent:"english-conversation",
      executionSource:"conversation_app_server",
    }).catch((error)=>{
      settle(error instanceof Error?error:new Error(String(error)));
    });
  });
}
function resolveConversationRequestErrorStatus(error){
  if(isRequestBodyTooLargeError(error))return 413;
  if(error instanceof SyntaxError)return 400;
  if(Number.isFinite(Number(error&&error.statusCode)))return Math.max(400,Math.min(599,Math.trunc(Number(error.statusCode))));
  const message=safeString(error&&error.message?error.message:String(error),240).toLowerCase();
  if(message==="message is required")return 400;
  if(message.startsWith("[error] app-server conversation failed"))return 502;
  if(message==="app-server conversation returned an empty response")return 502;
  if(message==="app-server conversation timed out")return 504;
  return 500;
}
function resolvePiperVoiceRequestErrorStatus(error){
  if(isRequestBodyTooLargeError(error))return 413;
  if(error instanceof SyntaxError)return 400;
  if(Number.isFinite(Number(error&&error.statusCode)))return Math.max(400,Math.min(599,Math.trunc(Number(error.statusCode))));
  const message=safeString(error&&error.message?error.message:String(error),240).toLowerCase();
  if(message==="text is required")return 400;
  if(message==="piper model is required")return 400;
  if(message.startsWith("invalid piper model"))return 400;
  if(message.startsWith("piper model must end with -high"))return 400;
  if(message==="speaker must be a non-negative integer")return 400;
  return 500;
}
function resolveKokoroVoiceRequestErrorStatus(error){
  if(isRequestBodyTooLargeError(error))return 413;
  if(error instanceof SyntaxError)return 400;
  if(Number.isFinite(Number(error&&error.statusCode)))return Math.max(400,Math.min(599,Math.trunc(Number(error.statusCode))));
  const message=safeString(error&&error.message?error.message:String(error),240).toLowerCase();
  if(message==="text is required")return 400;
  if(message.startsWith("invalid kokoro speed"))return 400;
  if(message.startsWith("kokoro upstream failed"))return 502;
  return 500;
}
function requestKokoroSpeech({text,model,voice,langCode,speed}={}){
  return new Promise((resolve,reject)=>{
    let endpointUrl;
    try{
      endpointUrl=new URL("/v1/audio/speech",kokoroVoiceServiceBaseUrl);
    }catch{
      const error=new Error("kokoro endpoint url is invalid");
      error.statusCode=500;
      reject(error);
      return;
    }
    const payload={
      model:safeString(model,80)||kokoroDefaultModel,
      input:safeString(text,24000),
      voice:safeString(voice,80)||kokoroDefaultVoice,
      response_format:"mp3",
      stream:false,
    };
    const normalizedLangCode=safeString(langCode,8)||kokoroDefaultLangCode;
    if(normalizedLangCode)payload.lang_code=normalizedLangCode;
    if(Number.isFinite(Number(speed))){
      const parsedSpeed=Number(speed);
      if(parsedSpeed<0.25||parsedSpeed>4){
        const error=new Error(`invalid kokoro speed: ${parsedSpeed}`);
        error.statusCode=400;
        reject(error);
        return;
      }
      payload.speed=parsedSpeed;
    }
    const requestBody=Buffer.from(JSON.stringify(payload),"utf8");
    const transport=endpointUrl.protocol==="https:"?https:http;
    const req=transport.request({
      protocol:endpointUrl.protocol,
      hostname:endpointUrl.hostname,
      port:endpointUrl.port?Number(endpointUrl.port):undefined,
      path:`${endpointUrl.pathname}${endpointUrl.search}`,
      method:"POST",
      headers:{
        "content-type":"application/json; charset=utf-8",
        "content-length":requestBody.length,
      },
    },upstream=>{
      const chunks=[];
      upstream.on("data",chunk=>{
        chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
      });
      upstream.on("end",()=>{
        const statusCode=Number.isFinite(Number(upstream.statusCode))?Math.trunc(Number(upstream.statusCode)):502;
        const bodyBuffer=Buffer.concat(chunks);
        if(statusCode>=200&&statusCode<300){
          const contentType=safeString(Array.isArray(upstream.headers["content-type"])?upstream.headers["content-type"][0]:upstream.headers["content-type"],120)||"audio/mpeg";
          resolve({audio:bodyBuffer,contentType});
          return;
        }
        let message=`kokoro upstream failed (HTTP ${statusCode})`;
        const rawBody=safeString(bodyBuffer.toString("utf8"),1200);
        if(rawBody){
          try{
            const parsed=JSON.parse(rawBody);
            const detail=safeString(parsed&&parsed.detail?typeof parsed.detail==="string"?parsed.detail:JSON.stringify(parsed.detail):"",320);
            const parsedMessage=safeString(parsed&&parsed.message?parsed.message:"",320);
            const parsedError=safeString(parsed&&parsed.error?parsed.error:"",320);
            message=detail||parsedMessage||parsedError||message;
          }catch{
            message=safeString(rawBody,320)||message;
          }
        }
        const error=new Error(message);
        error.statusCode=statusCode>=500?502:Math.max(400,Math.min(599,statusCode));
        error.code="kokoro_upstream_http";
        reject(error);
      });
    });
    req.setTimeout(kokoroVoiceRequestTimeoutMs,()=>{
      req.destroy(new Error(`kokoro upstream timed out after ${kokoroVoiceRequestTimeoutMs}ms`));
    });
    req.on("error",error=>{
      const wrapped=new Error(safeString(error&&error.message?error.message:"kokoro upstream request failed",220)||"kokoro upstream request failed");
      wrapped.code=safeString(error&&error.code?String(error.code):"",80)||"kokoro_upstream_error";
      if(/timed out/i.test(wrapped.message)){
        wrapped.statusCode=504;
      }else if(wrapped.code==="ECONNREFUSED"||wrapped.code==="EHOSTUNREACH"||wrapped.code==="ENOTFOUND"){
        wrapped.statusCode=503;
      }else{
        wrapped.statusCode=502;
      }
      reject(wrapped);
    });
    req.write(requestBody);
    req.end();
  });
}
function resolveRequirementGuardExtensionModulePath(){
  const override=typeof process.env.CODEX_REQUIREMENT_GUARD_MODULE==="string"?process.env.CODEX_REQUIREMENT_GUARD_MODULE.trim():"";
  const fallback=path.normalize(path.join(workspaceRoot,requirementGuardExtensionConfig.moduleRelativePath));
  const selected=override||requirementGuardExtensionConfig.moduleRelativePath;
  const resolved=path.isAbsolute(selected)?path.normalize(selected):path.normalize(path.join(workspaceRoot,selected));
  if(!resolved.startsWith(workspaceRoot))return fallback;
  return resolved;
}
function isRequirementGuardExtensionEnabled(){
  const raw=process.env[requirementGuardExtensionConfig.envFlag];
  if(requirementGuardExtensionConfig.defaultEnabled){
    if(raw===undefined)return true;
    return raw!=="0"&&raw!=="false";
  }
  return normalizeBooleanFlag(raw);
}
function loadRequirementGuardExtensionModule(){
  if(requirementGuardExtensionAttempted)return requirementGuardExtensionModule;
  requirementGuardExtensionAttempted=true;
  const modulePath=resolveRequirementGuardExtensionModulePath();
  if(!fs.existsSync(modulePath)){
    requirementGuardExtensionLoadError=null;
    return null;
  }
  try{
    const loaded=require(modulePath);
    if(loaded&&typeof loaded.transformExecRequest==="function"){
      requirementGuardExtensionModule=loaded;
      requirementGuardExtensionLoadError=null;
      return requirementGuardExtensionModule;
    }
    if(typeof loaded==="function"){
      requirementGuardExtensionModule={transformExecRequest:loaded};
      requirementGuardExtensionLoadError=null;
      return requirementGuardExtensionModule;
    }
    throw new Error("module must export transformExecRequest(input)");
  }catch(error){
    requirementGuardExtensionModule=null;
    requirementGuardExtensionLoadError=error&&error.message?error.message:String(error);
    console.error(`[requirement-guard] failed to load module (${modulePath}): ${requirementGuardExtensionLoadError}`);
    return null;
  }
}
function normalizeRequirementGuardMatchInputValue(value){
  if(typeof value==="number"&&Number.isFinite(value))return value;
  if(typeof value==="string"){
    const trimmed=value.trim();
    if(!trimmed)return null;
    const parsed=Number(trimmed);
    if(Number.isFinite(parsed))return parsed;
  }
  return null;
}
function getRequirementGuardMatcherFallbackConfig(){
  const raw=typeof process.env[requirementGuardMatcherDefaults.envKey]==="string"?process.env[requirementGuardMatcherDefaults.envKey].trim():"";
  if(!raw){
    return{
      config_key:requirementGuardMatcherDefaults.configKey,
      env_key:requirementGuardMatcherDefaults.envKey,
      source:"default",
      value:requirementGuardMatcherDefaults.defaultValue,
      default_value:requirementGuardMatcherDefaults.defaultValue,
      raw_value:null,
      config_error:null,
    };
  }
  const parsed=normalizeRequirementGuardMatchInputValue(raw);
  if(parsed===null){
    return{
      config_key:requirementGuardMatcherDefaults.configKey,
      env_key:requirementGuardMatcherDefaults.envKey,
      source:"default",
      value:requirementGuardMatcherDefaults.defaultValue,
      default_value:requirementGuardMatcherDefaults.defaultValue,
      raw_value:raw,
      config_error:`invalid ${requirementGuardMatcherDefaults.envKey}=\"${raw}\"`,
    };
  }
  return{
    config_key:requirementGuardMatcherDefaults.configKey,
    env_key:requirementGuardMatcherDefaults.envKey,
    source:"env",
    value:parsed,
    default_value:requirementGuardMatcherDefaults.defaultValue,
    raw_value:raw,
    config_error:null,
  };
}
function evaluateRequirementGuardMatch(inputValue){
  const moduleRef=loadRequirementGuardExtensionModule();
  if(moduleRef&&typeof moduleRef.evaluateMatch==="function"){
    try{
      const moduleResult=moduleRef.evaluateMatch(inputValue,{env:process.env});
      if(moduleResult&&typeof moduleResult==="object")return moduleResult;
      throw new Error("evaluateMatch must return an object");
    }catch(error){
      console.error(`[requirement-guard] evaluateMatch failed: ${error&&error.message?error.message:String(error)}`);
    }
  }
  const config=getRequirementGuardMatcherFallbackConfig();
  const normalizedInput=normalizeRequirementGuardMatchInputValue(inputValue);
  if(normalizedInput===null){
    return{
      is_match:false,
      normalized_input:null,
      expected_value:config.value,
      reason:"invalid_input",
      config_key:config.config_key,
      env_key:config.env_key,
      config_source:config.source,
      config_error:config.config_error,
      original_requirement:requirementGuardOriginalRequirement,
    };
  }
  const isMatch=normalizedInput===config.value;
  return{
    is_match:isMatch,
    normalized_input:normalizedInput,
    expected_value:config.value,
    reason:isMatch?"matched":"not_matched",
    config_key:config.config_key,
    env_key:config.env_key,
    config_source:config.source,
    config_error:config.config_error,
    original_requirement:requirementGuardOriginalRequirement,
  };
}
function getRequirementGuardMatcherSnapshot(){
  const moduleRef=requirementGuardExtensionModule;
  if(moduleRef&&typeof moduleRef.getMatchConfig==="function"){
    try{
      const moduleConfig=moduleRef.getMatchConfig(process.env);
      if(moduleConfig&&typeof moduleConfig==="object"){
        const valueCandidate=Number(moduleConfig.value);
        const defaultCandidate=Number(moduleConfig.default_value);
        return{
          inputKey:requirementGuardMatcherDefaults.inputKey,
          configKey:typeof moduleConfig.config_key==="string"&&moduleConfig.config_key?moduleConfig.config_key:requirementGuardMatcherDefaults.configKey,
          envKey:typeof moduleConfig.env_key==="string"&&moduleConfig.env_key?moduleConfig.env_key:requirementGuardMatcherDefaults.envKey,
          value:Number.isFinite(valueCandidate)?valueCandidate:requirementGuardMatcherDefaults.defaultValue,
          defaultValue:Number.isFinite(defaultCandidate)?defaultCandidate:requirementGuardMatcherDefaults.defaultValue,
          source:typeof moduleConfig.source==="string"&&moduleConfig.source?moduleConfig.source:"default",
          rawValue:typeof moduleConfig.raw_value==="string"&&moduleConfig.raw_value?moduleConfig.raw_value:null,
          configError:typeof moduleConfig.config_error==="string"&&moduleConfig.config_error?moduleConfig.config_error:null,
        };
      }
    }catch(error){
      console.error(`[requirement-guard] getMatchConfig failed: ${error&&error.message?error.message:String(error)}`);
    }
  }
  const fallbackConfig=getRequirementGuardMatcherFallbackConfig();
  return{
    inputKey:requirementGuardMatcherDefaults.inputKey,
    configKey:fallbackConfig.config_key,
    envKey:fallbackConfig.env_key,
    value:fallbackConfig.value,
    defaultValue:fallbackConfig.default_value,
    source:fallbackConfig.source,
    rawValue:fallbackConfig.raw_value,
    configError:fallbackConfig.config_error,
  };
}
function normalizeExecOptionsForRun(options){
  const source=options&&typeof options==="object"?options:{};
  const previousPlanningContext=source.previousPlanningContext&&typeof source.previousPlanningContext==="object"
    ?sanitizePlanningArtifactsForRuntime(source.previousPlanningContext)
    :null;
  const planningContext=sanitizePlanningArtifactsForRuntime(
    source.planningContext&&typeof source.planningContext==="object"
      ?source.planningContext
      :buildPlanningArtifacts({
        prompt:typeof source.prompt==="string"?source.prompt:"",
        options:source,
        contract:{planning:planningModeContract,assurance:assuranceModeContract},
      })
  );
  return{
    approvalPolicy:normalizeApprovalPolicy(source.approvalPolicy),
    webSearch:normalizeBooleanFlag(source.webSearch),
    model:normalizeExecModel(source.model,defaultExecModelName),
    modelReasoningEffort:normalizeExecModelReasoningEffort(source.modelReasoningEffort,defaultExecModelReasoningEffort),
    agentName:normalizeAgentName(source.agentName),
    cwd:normalizeWorkingDirectory(source.cwd,workspaceRoot),
    forceNewSession:Boolean(source.forceNewSession),
    attemptedFreshFallback:Boolean(source.attemptedFreshFallback),
    images:Array.isArray(source.images)?source.images:[],
    requestUserInputPolicy:normalizeRequestUserInputPolicy(source.requestUserInputPolicy,nonInteractiveRequestUserInputPolicy),
    previousPlanningContext,
    planningContext,
  };
}
function applyRequirementGuardExecExtension(input){
  const source=input&&typeof input==="object"?input:{};
  const fallback={
    prompt:safeString(source.prompt,defaultPromptCharLimit),
    sandboxMode:normalizeSandboxMode(source.sandboxMode),
    options:normalizeExecOptionsForRun(source.options),
  };
  if(!isRequirementGuardExtensionEnabled())return fallback;
  const moduleRef=loadRequirementGuardExtensionModule();
  if(!moduleRef||typeof moduleRef.transformExecRequest!=="function")return fallback;
  try{
    const extensionOutput=moduleRef.transformExecRequest({
      requirement:{id:requirementGuardExtensionConfig.id,status:requirementGuardExtensionConfig.status,originalRequirement:requirementGuardOriginalRequirement},
      prompt:fallback.prompt,
      sandboxMode:fallback.sandboxMode,
      options:{...fallback.options},
    });
    if(!extensionOutput||typeof extensionOutput!=="object")return fallback;
    const merged={
      prompt:typeof extensionOutput.prompt==="string"?safeString(extensionOutput.prompt,defaultPromptCharLimit):fallback.prompt,
      sandboxMode:typeof extensionOutput.sandboxMode==="string"?normalizeSandboxMode(extensionOutput.sandboxMode):fallback.sandboxMode,
      options:fallback.options,
    };
    if(extensionOutput.options&&typeof extensionOutput.options==="object"){
      merged.options=normalizeExecOptionsForRun({...fallback.options,...extensionOutput.options});
    }
    return merged;
  }catch(error){
    console.error(`[requirement-guard] transformExecRequest failed: ${error&&error.message?error.message:String(error)}`);
    return fallback;
  }
}
function getRequirementGuardRequirementLockSnapshot(moduleRef){
  if(!moduleRef||typeof moduleRef.getRequirementLockConfig!=="function")return null;
  try{
    const config=moduleRef.getRequirementLockConfig(process.env);
    if(!config||typeof config!=="object")return null;
    const confirmTokens=Array.isArray(config.confirm_tokens)
      ? config.confirm_tokens.map((token)=>safeString(String(token||""),80)).filter(Boolean).slice(0,20)
      : [];
    const bypassTokens=Array.isArray(config.bypass_tokens)
      ? config.bypass_tokens.map((token)=>safeString(String(token||""),80)).filter(Boolean).slice(0,20)
      : [];
    return{
      marker:typeof config.marker==="string"&&config.marker?safeString(config.marker,80):null,
      enabled:Boolean(config.enabled),
      requireConfirm:Boolean(config.require_confirm),
      enabledEnvKey:typeof config.enabled_env_key==="string"&&config.enabled_env_key?safeString(config.enabled_env_key,120):null,
      requireConfirmEnvKey:typeof config.require_confirm_env_key==="string"&&config.require_confirm_env_key?safeString(config.require_confirm_env_key,120):null,
      enabledSource:typeof config.enabled_source==="string"&&config.enabled_source?safeString(config.enabled_source,40):"default",
      requireConfirmSource:typeof config.require_confirm_source==="string"&&config.require_confirm_source?safeString(config.require_confirm_source,40):"default",
      defaultEnabled:Boolean(config.default_enabled),
      defaultRequireConfirm:Boolean(config.default_require_confirm),
      confirmTokens,
      bypassTokens,
    };
  }catch(error){
    console.error(`[requirement-guard] getRequirementLockConfig failed: ${error&&error.message?error.message:String(error)}`);
    return null;
  }
}
function getRequirementGuardScopeExpansionSnapshot(moduleRef){
  if(!moduleRef||typeof moduleRef.getScopeExpansionConfig!=="function")return null;
  try{
    const config=moduleRef.getScopeExpansionConfig(process.env);
    if(!config||typeof config!=="object")return null;
    const approveTokens=Array.isArray(config.approve_tokens)
      ? config.approve_tokens.map((token)=>safeString(String(token||""),80)).filter(Boolean).slice(0,20)
      : [];
    const rejectTokens=Array.isArray(config.reject_tokens)
      ? config.reject_tokens.map((token)=>safeString(String(token||""),80)).filter(Boolean).slice(0,20)
      : [];
    return{
      marker:typeof config.marker==="string"&&config.marker?safeString(config.marker,80):null,
      enabled:Boolean(config.enabled),
      requireApproval:Boolean(config.require_approval),
      enabledEnvKey:typeof config.enabled_env_key==="string"&&config.enabled_env_key?safeString(config.enabled_env_key,120):null,
      requireApprovalEnvKey:typeof config.require_approval_env_key==="string"&&config.require_approval_env_key?safeString(config.require_approval_env_key,120):null,
      enabledSource:typeof config.enabled_source==="string"&&config.enabled_source?safeString(config.enabled_source,40):"default",
      requireApprovalSource:typeof config.require_approval_source==="string"&&config.require_approval_source?safeString(config.require_approval_source,40):"default",
      defaultEnabled:Boolean(config.default_enabled),
      defaultRequireApproval:Boolean(config.default_require_approval),
      approveTokens,
      rejectTokens,
    };
  }catch(error){
    console.error(`[requirement-guard] getScopeExpansionConfig failed: ${error&&error.message?error.message:String(error)}`);
    return null;
  }
}
function getRequirementGuardRbjSnapshot(moduleRef){
  if(!moduleRef||typeof moduleRef.getRequirementRbjConfig!=="function")return null;
  try{
    const config=moduleRef.getRequirementRbjConfig(process.env);
    if(!config||typeof config!=="object")return null;
    const parentAgents=Array.isArray(config.parent_agents)
      ? config.parent_agents.map((entry)=>safeString(String(entry||""),80)).filter(Boolean).slice(0,10)
      : [];
    const confirmTokens=Array.isArray(config.confirm_tokens)
      ? config.confirm_tokens.map((entry)=>safeString(String(entry||""),80)).filter(Boolean).slice(0,20)
      : [];
    const bypassTokens=Array.isArray(config.bypass_tokens)
      ? config.bypass_tokens.map((entry)=>safeString(String(entry||""),80)).filter(Boolean).slice(0,20)
      : [];
    return{
      marker:typeof config.marker==="string"&&config.marker?safeString(config.marker,80):null,
      version:typeof config.version==="string"&&config.version?safeString(config.version,60):null,
      enabled:Boolean(config.enabled),
      requireConfirm:Boolean(config.require_confirm),
      maxQuestions:Number.isFinite(Number(config.max_questions))?Math.max(1,Math.trunc(Number(config.max_questions))):3,
      maxRevisions:Number.isFinite(Number(config.max_revisions))?Math.max(1,Math.trunc(Number(config.max_revisions))):2,
      minConfidence:Number.isFinite(Number(config.min_confidence))?Math.max(0,Math.min(100,Math.trunc(Number(config.min_confidence)))):80,
      redSkillToken:typeof config.red_skill_token==="string"&&config.red_skill_token?safeString(config.red_skill_token,80):"$red-requirement-auditor",
      enabledEnvKey:typeof config.enabled_env_key==="string"&&config.enabled_env_key?safeString(config.enabled_env_key,120):null,
      requireConfirmEnvKey:typeof config.require_confirm_env_key==="string"&&config.require_confirm_env_key?safeString(config.require_confirm_env_key,120):null,
      maxQuestionsEnvKey:typeof config.max_questions_env_key==="string"&&config.max_questions_env_key?safeString(config.max_questions_env_key,120):null,
      maxRevisionsEnvKey:typeof config.max_revisions_env_key==="string"&&config.max_revisions_env_key?safeString(config.max_revisions_env_key,120):null,
      minConfidenceEnvKey:typeof config.min_confidence_env_key==="string"&&config.min_confidence_env_key?safeString(config.min_confidence_env_key,120):null,
      enabledSource:typeof config.enabled_source==="string"&&config.enabled_source?safeString(config.enabled_source,40):"default",
      requireConfirmSource:typeof config.require_confirm_source==="string"&&config.require_confirm_source?safeString(config.require_confirm_source,40):"default",
      maxQuestionsSource:typeof config.max_questions_source==="string"&&config.max_questions_source?safeString(config.max_questions_source,40):"default",
      maxRevisionsSource:typeof config.max_revisions_source==="string"&&config.max_revisions_source?safeString(config.max_revisions_source,40):"default",
      minConfidenceSource:typeof config.min_confidence_source==="string"&&config.min_confidence_source?safeString(config.min_confidence_source,40):"default",
      defaultEnabled:Boolean(config.default_enabled),
      defaultRequireConfirm:Boolean(config.default_require_confirm),
      defaultMaxQuestions:Number.isFinite(Number(config.default_max_questions))?Math.max(1,Math.trunc(Number(config.default_max_questions))):3,
      defaultMaxRevisions:Number.isFinite(Number(config.default_max_revisions))?Math.max(1,Math.trunc(Number(config.default_max_revisions))):2,
      defaultMinConfidence:Number.isFinite(Number(config.default_min_confidence))?Math.max(0,Math.min(100,Math.trunc(Number(config.default_min_confidence)))):80,
      parentAgents,
      confirmTokens,
      bypassTokens,
    };
  }catch(error){
    console.error(`[requirement-guard] getRequirementRbjConfig failed: ${error&&error.message?error.message:String(error)}`);
    return null;
  }
}
function getRequirementGuardPlanningModeSnapshot(moduleRef){
  if(!moduleRef||typeof moduleRef.getPlanningModeConfig!=="function")return null;
  try{
    const config=moduleRef.getPlanningModeConfig();
    const assuranceConfig=typeof moduleRef.getAssuranceModeConfig==="function"?moduleRef.getAssuranceModeConfig():null;
    if(!config||typeof config!=="object")return null;
    return{
      schema:safeString(config.schema,80)||"planning-mode-contract.v1",
      version:safeString(config.version,80)||"",
      modes:Array.isArray(config.modes)?config.modes.map((entry)=>safeString(String(entry||""),40)).filter(Boolean).slice(0,8):[],
      assuranceSchema:safeString(assuranceConfig&&assuranceConfig.schema,80)||"assurance-mode-contract.v1",
      assuranceVersion:safeString(assuranceConfig&&assuranceConfig.version,80)||"",
      assuranceModes:Array.isArray(assuranceConfig&&assuranceConfig.modes)?assuranceConfig.modes.map((entry)=>safeString(String(entry||""),60)).filter(Boolean).slice(0,8):[],
      thresholds:config.thresholds&&typeof config.thresholds==="object"?config.thresholds:{},
      paths:{
        contract:summarizePathForOperationLog(planningModeContractPath,220),
        assuranceContract:summarizePathForOperationLog(assuranceModeContractPath,220),
        requirementSchema:summarizePathForOperationLog(requirementContractSchemaPath,220),
        dispatchSchema:summarizePathForOperationLog(dispatchPlanSchemaPath,220),
      },
    };
  }catch(error){
    console.error(`[requirement-guard] getPlanningModeConfig failed: ${error&&error.message?error.message:String(error)}`);
    return null;
  }
}
function getRequirementGuardExtensionSnapshot(){
  const extensionEnabled=isRequirementGuardExtensionEnabled();
  const moduleRef=extensionEnabled?loadRequirementGuardExtensionModule():requirementGuardExtensionModule;
  const modulePath=resolveRequirementGuardExtensionModulePath();
  const relativePath=path.relative(workspaceRoot,modulePath).replace(/\\/g,"/");
  const matcher=getRequirementGuardMatcherSnapshot();
  const requirementLock=getRequirementGuardRequirementLockSnapshot(moduleRef);
  const scopeExpansion=getRequirementGuardScopeExpansionSnapshot(moduleRef);
  const rbj=getRequirementGuardRbjSnapshot(moduleRef);
  const planningMode=getRequirementGuardPlanningModeSnapshot(moduleRef);
  return{
    id:requirementGuardExtensionConfig.id,
    status:requirementGuardExtensionConfig.status,
    originalRequirement:requirementGuardOriginalRequirement,
    enabled:extensionEnabled,
    defaultEnabled:requirementGuardExtensionConfig.defaultEnabled,
    envFlag:requirementGuardExtensionConfig.envFlag,
    modulePath:relativePath||requirementGuardExtensionConfig.moduleRelativePath,
    loaded:Boolean(moduleRef&&typeof moduleRef.transformExecRequest==="function"),
    loadError:requirementGuardExtensionLoadError||null,
    matcher,
    requirementLock,
    scopeExpansion,
    rbj,
    planningMode,
  };
}
function supportedImageRuleText(){return"PNG/JPEG/WEBP/GIF, max 10MB";}
function extractImageExtension(name){const value=safeString(name,260);if(!value)return"";const index=value.lastIndexOf(".");if(index<0)return"";return value.slice(index).toLowerCase();}
function estimateBase64DecodedBytes(base64Data){const normalized=String(base64Data||"").replace(/\s+/g,"");if(!normalized)return 0;let padding=0;if(normalized.endsWith("=="))padding=2;else if(normalized.endsWith("="))padding=1;return Math.max(0,Math.floor(normalized.length*3/4)-padding);}
function parseImageDataUrl(value){const raw=safeString(value,execRequestBodyLimitBytes);if(!raw)return null;const matched=raw.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);if(!matched)return null;const mimeType=String(matched[1]||"").trim().toLowerCase();const base64Data=String(matched[2]||"").replace(/\s+/g,"");if(!mimeType||!base64Data)return null;if(!/^[A-Za-z0-9+/]+=*$/.test(base64Data))return null;return{mimeType,base64Data,dataUrl:`data:${mimeType};base64,${base64Data}`};}
function normalizeChatImageAttachment(value){
  if(!value||typeof value!=="object")return null;
  const name=safeString(value.name||value.fileName,260);
  if(!name)throw new Error(`image.name is required (${supportedImageRuleText()})`);
  const ext=extractImageExtension(name);
  if(!allowedChatImageExtensions.has(ext))throw new Error(`Unsupported image extension (${ext||"none"}). Allowed: ${supportedImageRuleText()}`);
  const mimeType=safeString(value.mimeType||value.type,80).toLowerCase();
  if(!allowedChatImageMimeTypes.has(mimeType))throw new Error(`Unsupported image mimeType (${mimeType||"none"}). Allowed: ${supportedImageRuleText()}`);
  const expectedMime=imageMimeByExtension[ext];
  if(expectedMime&&expectedMime!==mimeType)throw new Error(`image extension and mimeType mismatch (${ext} / ${mimeType})`);
  const parsed=parseImageDataUrl(value.dataUrl||value.url||value.imageUrl);
  if(!parsed)throw new Error("image.dataUrl must be a base64 data URL.");
  if(parsed.mimeType!==mimeType)throw new Error(`image.dataUrl mimeType mismatch (${parsed.mimeType} / ${mimeType})`);
  const decodedBytes=estimateBase64DecodedBytes(parsed.base64Data);
  if(decodedBytes<=0)throw new Error("image data is empty or invalid.");
  if(decodedBytes>maxChatImageBytes)throw new Error("image exceeds max size (10MB).");
  const encodedBytes=Buffer.byteLength(parsed.dataUrl,"utf8");
  return{name,mimeType,sizeBytes:decodedBytes,encodedBytes,dataUrl:parsed.dataUrl};
}
function normalizeChatImageAttachments(imagesValue,imageValue){
  const inputItems=[];
  if(Array.isArray(imagesValue))inputItems.push(...imagesValue);
  if(imageValue&&typeof imageValue==="object")inputItems.push(imageValue);
  if(!inputItems.length)return[];
  const normalized=inputItems.map((item,index)=>{try{return normalizeChatImageAttachment(item);}catch(error){throw new Error(`images[${index}]: ${error&&error.message?error.message:"invalid image"}`);}});
  const budget=evaluateImagePayloadBudget(normalized,{
    maxDecodedBytes:maxChatImageAggregateBytes,
    maxEncodedBytes:maxChatImageAggregateEncodedBytes,
  });
  if(!budget.ok){
    if(budget.decodedExceeded){
      throw new Error(`total image decoded size exceeds aggregate limit (${formatBytes(maxChatImageAggregateBytes)}).`);
    }
    if(budget.encodedExceeded){
      throw new Error(`total image payload likely exceeds ${formatBytes(execRequestBodyLimitBytes)} request limit after base64 encoding.`);
    }
  }
  return normalized;
}
function buildImageInputVariantFactories(){
  const variants=[(url)=>({type:"image",url}),(url)=>({type:"image",image_url:url}),(url)=>({type:"input_image",image_url:url}),(url)=>({type:"input_image",imageUrl:url})];
  const seen=new Set();
  return variants.filter((factory)=>{const key=JSON.stringify(factory("data:image/png;base64,AA=="));if(seen.has(key))return false;seen.add(key);return true;});
}
function buildTurnInputCandidates(prompt,imageAttachments){
  const text=safeString(prompt,defaultPromptCharLimit);
  const textItem=text?{type:"text",text,text_elements:[]}:null;
  const attachments=Array.isArray(imageAttachments)?imageAttachments.filter((item)=>item&&typeof item.dataUrl==="string"&&item.dataUrl):[];
  if(!attachments.length){
    return textItem?[[textItem]]:[];
  }
  const variantFactories=buildImageInputVariantFactories();
  const candidates=variantFactories.map((factory)=>{
    const items=[];
    if(textItem)items.push(textItem);
    attachments.forEach((attachment)=>items.push(factory(attachment.dataUrl)));
    return items;
  }).filter((items)=>items.length>0);
  if(!candidates.length&&textItem)return[[textItem]];
  return candidates;
}
function planningContextRequiresDispatch(planningContext){
  const dispatchPlan=planningContext&&planningContext.dispatchPlan&&typeof planningContext.dispatchPlan==="object"
    ?planningContext.dispatchPlan
    :null;
  if(!dispatchPlan||dispatchPlan.proposalOnly)return false;
  return Array.isArray(dispatchPlan.dispatches)&&dispatchPlan.dispatches.length>0;
}
function getFirstMeaningfulLine(text){for(const line of(text||"").split(/\r?\n/)){const t=line.trim();if(!t||t.startsWith("WARNING:"))continue;return t;}return"";}
function probeCliTool(cmd){const r=spawnSync("cmd.exe",["/d","/s","/c",cmd],{cwd:workspaceRoot,windowsHide:true,encoding:"utf8",timeout:8000});const stdout=typeof r.stdout==="string"?r.stdout:"";const stderr=typeof r.stderr==="string"?r.stderr:"";const first=getFirstMeaningfulLine(`${stdout}\n${stderr}`);const code=Number.isInteger(r.status)?r.status:1;const ok=!r.error&&code===0;if(ok)return{available:true,version:first||"ok",error:null};return{available:false,version:null,error:first||(r.error?r.error.message:`exit code ${code}`)};}
function getDiagnosticsSnapshot(){
  const fullUtilization=buildFullUtilizationDefaultsSnapshot();
  return{
    apiVersion,
    timestamp:new Date().toISOString(),
    tools:{
      codex:probeCliTool("codex --version"),
      node:probeCliTool("node --version"),
    },
    defaults:{
      approvalPolicy:"on-request",
      sandboxMode:"workspace-write",
      webSearch:false,
      fastModeEnabled:fastModeDefault,
      automaticApprovalReviewEnabled:automaticApprovalReviewDefault,
      requestUserInputPolicy:nonInteractiveRequestUserInputPolicy,
      executionProfile:runtimeExecutionProfile,
    },
    executionVisibility:{
      profile:runtimeExecutionProfile,
      envKey:executionProfileEnvKey,
      smokeLikeProfile:isSmokeExecutionProfile(runtimeExecutionProfile)?1:0,
      fullUtilization,
    },
    nonInteractiveUserInput:{
      policy:nonInteractiveRequestUserInputPolicy,
      envKey:requestUserInputPolicyEnvKey,
    },
    adversarialShadow:buildAdversarialShadowRuntimeSnapshot(),
  };
}
function normalizeAppServerTransportMode(value){
  const raw=safeString(value,80).toLowerCase();
  if(raw==="mock"||raw==="fixture"||raw==="mock-fixture")return"mock-fixture";
  return"stdio";
}
function getAppServerTransportMode(){
  return normalizeAppServerTransportMode(process.env.CODEX_APP_SERVER_TRANSPORT);
}
function resolveAppServerSpawnTarget(cwd){
  if(process.platform==="win32"){
    const cmdPath=fs.existsSync(defaultWindowsCodexCmd)?defaultWindowsCodexCmd:"codex.cmd";
    const commandLine=`"${cmdPath}" app-server`;
    return{
      command:commandLine,
      args:[],
      options:{cwd,windowsHide:true,stdio:["pipe","pipe","pipe"],shell:true},
    };
  }
  return{
    command:"codex",
    args:["-c",defaultExecModelReasoningEffortConfig,"app-server"],
    options:{cwd,windowsHide:true,stdio:["pipe","pipe","pipe"]},
  };
}

function getOrCreateAgentState(name){const n=(name||"").trim();if(!n)return null;if(!agentStates.has(n)){agentStates.set(n,createBaseAgentState());}return agentStates.get(n);}
function getActiveAgentState(){return getOrCreateAgentState(activeAgentName);}
function resolveAutomaticApprovalReviewEnabled(value,fallback=automaticApprovalReviewDefault){
  if(value===undefined||value===null)return Boolean(fallback);
  return normalizeBooleanFlag(value);
}
function resolveFastModeEnabled(value,fallback=fastModeDefault){
  if(value===undefined||value===null)return Boolean(fallback);
  return normalizeBooleanFlag(value);
}
function resolveEffectiveServiceTier(agentState){
  if(agentState&&resolveFastModeEnabled(agentState.fastModeEnabled,false)){
    return normalizeCodexServiceTier(agentState.serviceTier,defaultCodexServiceTier);
  }
  return nonFastEffectiveServiceTier;
}
function resolveAgentName(options){
  const requested=normalizeAgentName(options&&options.agentName);
  return requested||activeAgentName;
}
function formatFeatureList(set){const list=Array.from(set||[]);return list.length?list.join(", "):"none";}
function formatAgentList(){const lines=["agents:"];for(const [name,s]of agentStates.entries()){const mark=name===activeAgentName?"*":"-";const session=s.sessionRef||"none";const exp=s.experimentalEnabled?"on":"off";const feat=formatFeatureList(s.experimentalFeatures);const fork=s.forkedFrom?`, forkedFrom=${s.forkedFrom}`:"";lines.push(`${mark} ${name} (session=${session}, experimental=${exp}, features=${feat}${fork})`);}return`${lines.join("\n")}\n`;}
function listAgentsSnapshot(){
  const items=[];
  for(const[name,s]of agentStates.entries()){
    items.push({
      name,
      isActive:name===activeAgentName,
      sessionRef:s.sessionRef||null,
      threadId:s.threadId||null,
      activeTurnId:s.activeTurnId||null,
      experimental:Boolean(s.experimentalEnabled),
      experimentalFeatures:Array.from(s.experimentalFeatures||[]),
      serviceTier:resolveEffectiveServiceTier(s),
      forkedFrom:s.forkedFrom||null,
      createdAt:Number.isFinite(s.createdAt)?s.createdAt:null,
      requestUserInputPolicy:s.lastRequestUserInputPolicy||nonInteractiveRequestUserInputPolicy,
      model:s.lastModel||defaultExecModelName,
      modelReasoningEffort:s.lastModelReasoningEffort||defaultExecModelReasoningEffort,
      fastModeEnabled:Boolean(s.fastModeEnabled),
      automaticApprovalReviewEnabled:Boolean(s.automaticApprovalReviewEnabled),
      governance:summarizeAgentGovernance(name),
    });
  }
  items.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  return items;
}
function findLatestDeclinedApprovalAudit(audits){
  if(!Array.isArray(audits))return null;
  for(let index=audits.length-1;index>=0;index-=1){
    const normalized=normalizeApprovalAuditRecord(audits[index]);
    if(normalized&&normalized.decision==="decline"){
      return normalized;
    }
  }
  return null;
}
function stripTomlInlineComment(line){
  const raw=typeof line==="string"?line:"";
  if(!raw.includes("#"))return raw;
  let result="";
  let inSingle=false;
  let inDouble=false;
  let escaped=false;
  for(const ch of raw){
    if(escaped){
      result+=ch;
      escaped=false;
      continue;
    }
    if(ch==="\\"){
      if(inDouble)escaped=true;
      result+=ch;
      continue;
    }
    if(ch==="\""&&!inSingle){
      inDouble=!inDouble;
      result+=ch;
      continue;
    }
    if(ch==="'"&&!inDouble){
      inSingle=!inSingle;
      result+=ch;
      continue;
    }
    if(ch==="#"&&!inSingle&&!inDouble)break;
    result+=ch;
  }
  return result;
}
function parseTomlStringValue(raw){
  const value=typeof raw==="string"?raw.trim():"";
  if(!value)return"";
  if((value.startsWith("\"")&&value.endsWith("\""))||(value.startsWith("'")&&value.endsWith("'"))){
    const quote=value[0];
    const inner=value.slice(1,-1);
    if(quote==="'")return inner;
    return inner
      .replace(/\\u([0-9a-fA-F]{4})/g,(_,hex)=>String.fromCharCode(parseInt(hex,16)))
      .replace(/\\n/g,"\n")
      .replace(/\\r/g,"\r")
      .replace(/\\t/g,"\t")
      .replace(/\\\"/g,"\"")
      .replace(/\\\\/g,"\\");
  }
  return value;
}
function normalizeExecModelAlias(value){
  const raw=typeof value==="string"?value.trim():"";
  if(!raw)return"";
  return legacyExecModelAliases[raw.toLowerCase()]||raw;
}
function tryNormalizeExecModelId(value){
  const normalized=normalizeExecModelAlias(safeString(value,120)||"");
  if(!normalized)return"";
  if(!/^[A-Za-z0-9._:-]+$/.test(normalized))return"";
  return normalized.slice(0,120);
}
function readTopLevelCodexConfigString(configPath,key){
  if(!configPath)return"";
  let content="";
  try{
    content=fs.readFileSync(configPath,"utf8");
  }catch{
    return"";
  }
  let sectionName="";
  for(const sourceLine of content.split(/\r?\n/)){
    const line=stripTomlInlineComment(sourceLine).trim();
    if(!line)continue;
    const sectionMatch=line.match(/^\[([^\]]+)\]$/);
    if(sectionMatch){
      sectionName=sectionMatch[1].trim();
      continue;
    }
    if(sectionName)continue;
    const kv=line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if(!kv||kv[1]!==key)continue;
    return safeString(parseTomlStringValue(kv[2]),120)||"";
  }
  return"";
}
function readTopLevelCodexConfigModel(configPath){
  return tryNormalizeExecModelId(readTopLevelCodexConfigString(configPath,"model"));
}
function readTopLevelCodexConfigModelReasoningEffort(configPath){
  return tryNormalizeExecModelReasoningEffort(readTopLevelCodexConfigString(configPath,"model_reasoning_effort"));
}
function resolveConfiguredDefaultExecModelName(){
  const envModel=tryNormalizeExecModelId(process.env.CODEX_DEFAULT_EXEC_MODEL);
  if(envModel)return envModel;
  const projectModel=readTopLevelCodexConfigModel(codexConfigPath);
  if(projectModel)return projectModel;
  const userModel=readTopLevelCodexConfigModel(userCodexConfigPath);
  if(userModel)return userModel;
  return defaultExecModelFallbackName;
}
function resolveConfiguredDefaultExecModelReasoningEffort(){
  const projectReasoningEffort=readTopLevelCodexConfigModelReasoningEffort(codexConfigPath);
  if(projectReasoningEffort)return projectReasoningEffort;
  const userReasoningEffort=readTopLevelCodexConfigModelReasoningEffort(userCodexConfigPath);
  if(userReasoningEffort)return userReasoningEffort;
  return defaultExecModelReasoningEffortFallback;
}
function normalizeParentComparableAgentName(name){
  const normalized=(name||"").trim().toLowerCase();
  if(!normalized)return"";
  if(parentAgentNames.has(normalized))return normalized;
  const scopeSep=normalized.indexOf("@");
  if(scopeSep>0){
    const base=normalized.slice(0,scopeSep);
    if(parentAgentNames.has(base))return base;
  }
  return normalized;
}
function inferAgentRole(name,description){
  const normalizedName=normalizeParentComparableAgentName(name);
  if(parentAgentNames.has(normalizedName))return"parent";
  const desc=(description||"").toLowerCase();
  if(desc.includes("parent"))return"parent";
  return"child";
}
function parseConfiguredAgentsFromCodexConfig(configPath=codexConfigPath){
  let content="";
  try{
    content=fs.readFileSync(configPath,"utf8");
  }catch{
    return[];
  }
  const records=new Map();
  let sectionName="";
  for(const sourceLine of content.split(/\r?\n/)){
    const line=stripTomlInlineComment(sourceLine).trim();
    if(!line)continue;
    const sectionMatch=line.match(/^\[([^\]]+)\]$/);
    if(sectionMatch){
      sectionName=sectionMatch[1].trim();
      continue;
    }
    if(!sectionName.startsWith("agents."))continue;
    const agentName=sectionName.slice("agents.".length).trim();
    if(!agentName)continue;
    const kv=line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if(!kv)continue;
    const key=kv[1];
    if(key!=="description"&&key!=="config_file")continue;
    const parsedValue=parseTomlStringValue(kv[2]);
    const existing=records.get(agentName)||{name:agentName,description:"",configFile:null};
    if(key==="description")existing.description=safeString(parsedValue,400)||"";
    if(key==="config_file")existing.configFile=safeString(parsedValue,240)||null;
    records.set(agentName,existing);
  }
  return Array.from(records.values()).map(item=>({
    name:item.name,
    description:item.description||"",
    configFile:item.configFile||null,
    role:inferAgentRole(item.name,item.description),
  }));
}
function resolveTopographyStatus(source,runtime){
  if(runtime){
    if(runtime.activeTurnId)return"running";
    return source==="configured"?"configured":"idle";
  }
  return source==="configured"?"configured":"idle";
}
function getAgentTopographySnapshot(){
  const configured=parseConfiguredAgentsFromCodexConfig();
  const runtime=listAgentsSnapshot();
  const liveCollabRows=getLiveCollabChildRows();
  const runtimeByName=new Map();
  for(const item of runtime){
    const name=normalizeAgentName(item&&item.name);
    if(!name)continue;
    runtimeByName.set(name,item);
  }
  const liveByName=new Map();
  for(const item of liveCollabRows){
    const name=normalizeAgentName(item&&item.name);
    if(!name)continue;
    liveByName.set(name,item);
  }
  const merged=[];
  for(const configuredAgent of configured){
    const runtimeState=runtimeByName.get(configuredAgent.name)||null;
    const liveState=liveByName.get(configuredAgent.name)||null;
    runtimeByName.delete(configuredAgent.name);
    liveByName.delete(configuredAgent.name);
    const effectiveSource=liveState
      ?(runtimeState?"configured+collab":"collab")
      :"configured";
    merged.push({
      name:configuredAgent.name,
      description:liveState&&liveState.description?liveState.description:(configuredAgent.description||""),
      configFile:configuredAgent.configFile||null,
      role:liveState&&liveState.role?liveState.role:configuredAgent.role,
      governance:summarizeAgentGovernance(configuredAgent.name),
      source:effectiveSource,
      isActive:liveState?true:(runtimeState?Boolean(runtimeState.isActive):false),
      selected:liveState?false:(runtimeState?Boolean(runtimeState.isActive):false),
      threadId:liveState&&liveState.threadId?liveState.threadId:(runtimeState&&runtimeState.threadId?runtimeState.threadId:null),
      activeTurnId:liveState&&liveState.activeTurnId?liveState.activeTurnId:(runtimeState&&runtimeState.activeTurnId?runtimeState.activeTurnId:null),
      sessionRef:liveState&&liveState.sessionRef?liveState.sessionRef:(runtimeState&&runtimeState.sessionRef?runtimeState.sessionRef:null),
      status:liveState&&liveState.status?liveState.status:resolveTopographyStatus("configured",runtimeState),
    });
  }
  for(const runtimeState of runtimeByName.values()){
    const name=normalizeAgentName(runtimeState&&runtimeState.name);
    if(!name)continue;
    const liveState=liveByName.get(name)||null;
    liveByName.delete(name);
    merged.push({
      name,
      description:liveState&&liveState.description?liveState.description:"",
      configFile:null,
      role:liveState&&liveState.role?liveState.role:inferAgentRole(name,""),
      governance:summarizeAgentGovernance(name),
      source:liveState?"runtime+collab":"runtime",
      isActive:liveState?true:Boolean(runtimeState.isActive),
      selected:liveState?false:Boolean(runtimeState.isActive),
      threadId:liveState&&liveState.threadId?liveState.threadId:(runtimeState&&runtimeState.threadId?runtimeState.threadId:null),
      activeTurnId:liveState&&liveState.activeTurnId?liveState.activeTurnId:(runtimeState&&runtimeState.activeTurnId?runtimeState.activeTurnId:null),
      sessionRef:liveState&&liveState.sessionRef?liveState.sessionRef:(runtimeState&&runtimeState.sessionRef?runtimeState.sessionRef:null),
      status:liveState&&liveState.status?liveState.status:resolveTopographyStatus("runtime",runtimeState),
    });
  }
  for(const liveState of liveByName.values()){
    const name=normalizeAgentName(liveState&&liveState.name);
    if(!name)continue;
    merged.push({
      name,
      description:liveState&&liveState.description?liveState.description:"",
      configFile:null,
      role:liveState&&liveState.role?liveState.role:inferAgentRole(name,""),
      governance:summarizeAgentGovernance(name),
      source:"collab",
      isActive:true,
      selected:false,
      threadId:liveState&&liveState.threadId?liveState.threadId:null,
      activeTurnId:liveState&&liveState.activeTurnId?liveState.activeTurnId:null,
      sessionRef:liveState&&liveState.sessionRef?liveState.sessionRef:null,
      status:liveState&&liveState.status?liveState.status:"running",
    });
  }
  return merged;
}
function getConfiguredAgentNameSet(){
  const configured=new Set();
  for(const agent of parseConfiguredAgentsFromCodexConfig()){
    const name=normalizeAgentName(agent&&agent.name);
    if(name)configured.add(name);
  }
  return configured;
}
function getAllowedAgentNameSet(){
  const configured=getConfiguredAgentNameSet();
  const allowed=new Set(configured);
  for(const agent of listAgentsSnapshot()){
    const name=normalizeAgentName(agent&&agent.name);
    if(!name)continue;
    const scopeSep=name?name.indexOf("@"):-1;
    const base=scopeSep>0?name.slice(0,scopeSep):name;
    if(base&&configured.has(base)){
      allowed.add(name);
    }
  }
  return allowed;
}
function validateRequestedAgentName(agentName){
  const requested=normalizeAgentName(agentName);
  const allowed=getAllowedAgentNameSet();
  if(!requested){
    return{ok:false,reason:"agent_name_missing",agentName:"",allowedAgents:Array.from(allowed).sort()};
  }
  if(allowed.has(requested)){
    return{ok:true,reason:"ok",agentName:requested,allowedAgents:Array.from(allowed).sort()};
  }
  const scopeSep=requested.indexOf("@");
  if(scopeSep>0){
    const base=requested.slice(0,scopeSep);
    if(allowed.has(base)){
      return{ok:true,reason:"ok",agentName:requested,baseAgentName:base,allowedAgents:Array.from(allowed).sort()};
    }
  }
  return{
    ok:false,
    reason:"agent_not_configured",
    agentName:requested,
    allowedAgents:Array.from(allowed).sort().slice(0,24),
  };
}
function parseSlashPrompt(prompt){const t=(prompt||"").trim();const i=t.indexOf(" ");if(i<0)return{command:t.toLowerCase(),argsText:""};return{command:t.slice(0,i).toLowerCase(),argsText:t.slice(i+1).trim()};}
function looksLikeSessionId(v){return sessionIdPattern.test((v||"").trim());}
function findLatestSessionId(){const home=process.env.USERPROFILE||process.env.HOME;if(!home)return null;const root=path.join(home,".codex","sessions");if(!fs.existsSync(root))return null;let newest=null;const stack=[root];while(stack.length){const cur=stack.pop();let entries=[];try{entries=fs.readdirSync(cur,{withFileTypes:true});}catch{continue;}for(const e of entries){const full=path.join(cur,e.name);if(e.isDirectory()){stack.push(full);continue;}if(!e.isFile())continue;const m=e.name.match(/([0-9a-f-]{36})\.jsonl$/i);if(!m||!looksLikeSessionId(m[1]))continue;let mt=0;try{mt=fs.statSync(full).mtimeMs;}catch{}if(!newest||mt>newest.mtimeMs)newest={sessionId:m[1],mtimeMs:mt};}}return newest?newest.sessionId:null;}
function parseMentionArgs(argsText){const raw=(argsText||"").trim();if(!raw)return null;if(raw.startsWith("\"")||raw.startsWith("'")){const q=raw[0];const end=raw.indexOf(q,1);if(end<0)return null;return{targetPath:raw.slice(1,end).trim(),message:raw.slice(end+1).trim()};}const i=raw.indexOf(" ");if(i<0)return{targetPath:raw,message:""};return{targetPath:raw.slice(0,i).trim(),message:raw.slice(i+1).trim()};}
function resolveMentionPath(targetPath){if(!targetPath)return null;const abs=path.isAbsolute(targetPath)?path.normalize(targetPath):path.normalize(path.join(workspaceRoot,targetPath));if(!abs.startsWith(workspaceRoot)||!fs.existsSync(abs))return null;const rel=path.relative(workspaceRoot,abs).replace(/\\/g,"/");return{absolute:abs,relative:rel||path.basename(abs)};}
function isUnknownThreadError(error){const t=((error&&error.message)||"").toLowerCase();return t.includes("unknown thread")||t.includes("thread not found")||t.includes("not found");}
function isResponseStreamDisconnectErrorText(value){
  const text=safeString(value,2400).toLowerCase();
  if(!text)return false;
  return text.includes("stream disconnected before completion")
    ||text.includes("response stream disconnected")
    ||text.includes("responsestreamdisconnected");
}
function isResponseStreamDisconnectErrorPayload(errorPayload){
  if(!errorPayload||typeof errorPayload!=="object")return false;
  if(isResponseStreamDisconnectErrorText(errorPayload.message))return true;
  if(isResponseStreamDisconnectErrorText(errorPayload.additionalDetails))return true;
  const info=errorPayload.codexErrorInfo;
  return Boolean(info&&typeof info==="object"&&info.responseStreamDisconnected&&typeof info.responseStreamDisconnected==="object");
}
function extractResponseStreamDisconnectDetail(errorPayload,max=2400){
  if(!errorPayload||typeof errorPayload!=="object")return"";
  return firstNonEmptyString([
    errorPayload.additionalDetails,
    errorPayload.message,
    isResponseStreamDisconnectErrorPayload(errorPayload)?"stream disconnected before completion":"",
  ],max);
}
function normalizeToolNameForComparison(value){
  return safeString(value,120).toLowerCase().replace(/[\s_-]+/g,"");
}
function isNativeCollabToolName(toolName){
  const normalized=normalizeToolNameForComparison(toolName);
  return normalized==="spawnagent"
    ||normalized==="sendinput"
    ||normalized==="wait"
    ||normalized==="resumeagent"
    ||normalized==="closeagent";
}
function isCollabToolItemType(type){
  return type==="collabAgentToolCall"||type==="collabToolCall";
}
function extractCollabStateMessages(item,max=3){
  if(!item||typeof item!=="object")return[];
  if(!item.agentsStates||typeof item.agentsStates!=="object")return[];
  const messages=[];
  for(const state of Object.values(item.agentsStates)){
    if(!state||typeof state!=="object")continue;
    const message=safeString(state.message,420);
    if(!message)continue;
    messages.push(message);
    if(messages.length>=max)break;
  }
  return messages;
}
function normalizeOwnedPathCandidate(value){
  let candidate=safeString(value,2000);
  if(!candidate)return"";
  candidate=candidate.replace(/^[-*+]\s+/,"").trim();
  if(!candidate)return"";
  const markdownLinkMatch=candidate.match(/^\[[^\]]+\]\(([^)]+)\)$/);
  if(markdownLinkMatch)candidate=markdownLinkMatch[1].trim();
  candidate=candidate.replace(/^<|>$/g,"").trim();
  if(candidate.startsWith("`")&&candidate.endsWith("`")&&candidate.length>=2){
    candidate=candidate.slice(1,-1).trim();
  }
  candidate=candidate.replace(/^\/([a-z]:[\\/])/i,"$1");
  candidate=candidate.replace(/#L\d+(?::\d+)?(?:-L\d+(?::\d+)?)?$/i,"");
  candidate=candidate.trim();
  if(!candidate)return"";
  const lowered=candidate.toLowerCase();
  if(lowered==="none"||lowered==="none."||lowered==="(none)")return"";
  const normalizedAbsolute=path.isAbsolute(candidate)?path.normalize(candidate):"";
  if(normalizedAbsolute){
    const relativeToWorkspace=path.relative(workspaceRoot,normalizedAbsolute);
    if(relativeToWorkspace&&!relativeToWorkspace.startsWith("..")&&!path.isAbsolute(relativeToWorkspace)){
      return relativeToWorkspace.replace(/\\/g,"/");
    }
    return normalizedAbsolute.replace(/\\/g,"/");
  }
  return candidate.replace(/\\/g,"/");
}
function extractOwnedPathsFromMessage(message,max=12){
  const text=safeString(message,12000);
  if(!text)return[];
  const lines=text.split(/\r?\n/);
  const headerIndex=lines.findIndex((line)=>/^owned paths\s*:?\s*$/i.test(line.trim()));
  if(headerIndex<0)return[];
  const paths=[];
  const seen=new Set();
  for(let index=headerIndex+1;index<lines.length;index+=1){
    const trimmed=lines[index].trim();
    if(!trimmed){
      if(paths.length)break;
      continue;
    }
    if(/^[A-Za-z][A-Za-z0-9 /_-]{0,80}:$/.test(trimmed)&&paths.length){
      break;
    }
    const normalizedPath=normalizeOwnedPathCandidate(trimmed);
    if(!normalizedPath)continue;
    const normalizedKey=normalizeMergePath(normalizedPath);
    if(seen.has(normalizedKey))continue;
    seen.add(normalizedKey);
    paths.push(normalizedPath);
    if(paths.length>=max)break;
  }
  return paths;
}
function extractCollabOwnedPaths(item,max=12){
  if(!item||typeof item!=="object")return[];
  if(!isCollabToolItemType(item.type))return[];
  if(!item.agentsStates||typeof item.agentsStates!=="object")return[];
  const paths=[];
  const seen=new Set();
  for(const state of Object.values(item.agentsStates)){
    if(!state||typeof state!=="object")continue;
    const messagePaths=extractOwnedPathsFromMessage(state.message,max);
    for(const ownedPath of messagePaths){
      const normalizedKey=normalizeMergePath(ownedPath);
      if(seen.has(normalizedKey))continue;
      seen.add(normalizedKey);
      paths.push(ownedPath);
      if(paths.length>=max)return paths;
    }
  }
  return paths;
}
function isNonInteractiveApprovalErrorText(value){
  const text=safeString(value,2400).toLowerCase();
  if(!text)return false;
  if(text.includes("non-interactive")&&text.includes("approval"))return true;
  if(text.includes("non interactive")&&text.includes("approval"))return true;
  if(text.includes("cannot prompt")&&text.includes("approval"))return true;
  if(text.includes("cannot ask")&&text.includes("approval"))return true;
  if(text.includes("approval required")&&text.includes("non-interactive"))return true;
  if(text.includes("requires approval")&&text.includes("non-interactive"))return true;
  if(text.includes("requestuserinput"))return true;
  if(text.includes("request user input")&&text.includes("approval"))return true;
  return false;
}
function extractNonInteractiveApprovalFromCollabItem(item){
  if(!item||typeof item!=="object")return"";
  if(!isCollabToolItemType(item.type))return"";
  const status=safeString(item.status,60).toLowerCase();
  if(status&&status!=="failed")return"";
  const messages=extractCollabStateMessages(item,4);
  const matched=messages.find((message)=>isNonInteractiveApprovalErrorText(message));
  if(!matched)return"";
  const tool=safeString(item.tool,80)||"collab tool";
  return`non-interactive approval blocked ${tool}: ${safeString(matched,600)}`;
}
class CodexAppServerClient{
  constructor(cwd){
    this.cwd=cwd;
    this.child=null;
    this.stdoutBuffer="";
    this.stderrBuffer="";
    this.startPromise=null;
    this.stopping=false;
    this.requestSeq=1;
    this.pending=new Map();
    this.turnWatchers=new Map();
    this.turnContexts=new Map();
    this.transportMode=getAppServerTransportMode();
    this.mockThreadSeq=1;
    this.mockTurnSeq=1;
    this.mockTurns=new Map();
    this.childTerminated=false;
    this.terminatedTransportError=null;
  }
  shouldTraceRpcMethod(method){
    return method==="initialize"
      ||method==="thread/start"
      ||method==="thread/resume"
      ||method==="turn/start"
      ||method==="turn/interrupt";
  }
  async ensureStarted(){
    if(this.child&&!this.stopping)return;
    if(!this.startPromise)this.startPromise=this.start();
    try{
      await this.startPromise;
    }finally{
      this.startPromise=null;
    }
  }
  async start(){
    this.stopping=false;
    this.childTerminated=false;
    this.terminatedTransportError=null;
    if(this.transportMode==="mock-fixture"){
      this.child={
        killed:false,
        stdin:{destroyed:false,write(){}},
        kill(){this.killed=true;},
      };
      this.stdoutBuffer="";
      this.stderrBuffer="";
      logOperation("appserver.start",{
        cwd:summarizePathForOperationLog(this.cwd,220),
        transport:this.transportMode,
      });
      logOperation("appserver.ready",{handshake:"mock_fixture"});
      return;
    }
    let child;
    try{
      const target=resolveAppServerSpawnTarget(this.cwd);
      child=spawn(target.command,target.args,target.options);
    }catch(e){
      throw new Error(`failed to start codex app-server: ${e.message}`);
    }
    this.child=child;
    this.stdoutBuffer="";
    this.stderrBuffer="";
    logOperation("appserver.start",{cwd:summarizePathForOperationLog(this.cwd,220)});
    const childRef=child;
    child.stdout.on("data",chunk=>{this.stdoutBuffer+=chunk.toString("utf8");this.flushStdout();});
    child.stderr.on("data",chunk=>{this.stderrBuffer+=chunk.toString("utf8");this.flushStderr();});
    if(child.stdin&&typeof child.stdin.on==="function"){
      child.stdin.on("error",error=>this.handleProcessTermination(this.buildTransportError("stdin error",error),childRef));
    }
    if(child.stdout&&typeof child.stdout.on==="function"){
      child.stdout.on("error",error=>this.handleProcessTermination(this.buildTransportError("stdout error",error),childRef));
    }
    if(child.stderr&&typeof child.stderr.on==="function"){
      child.stderr.on("error",error=>this.handleProcessTermination(this.buildTransportError("stderr error",error),childRef));
    }
    child.on("error",e=>this.handleProcessTermination(new Error(`app-server process error: ${e.message}`),childRef));
    child.on("close",code=>{
      const msg=this.stopping?"app-server stopped":`app-server exited unexpectedly (code=${code==null?"null":code})`;
      this.handleProcessTermination(new Error(msg),childRef);
    });
    await this.sendRequestRaw("initialize",{clientInfo:{name:"codex-original-ui",title:"Codex Original UI",version:"1.0.0"},capabilities:{experimentalApi:true}},20000);
    await this.sendNotificationRaw("initialized");
    logOperation("appserver.ready",{handshake:"initialize_initialized"});
  }
  stop(){
    this.stopping=true;
    logOperation("appserver.stop",{transport:this.transportMode});
    const childRef=this.child;
    if(this.transportMode!=="mock-fixture"&&childRef&&!childRef.killed){
      try{
        childRef.kill();
      }catch{
      }
    }
    this.handleProcessTermination(new Error("app-server stopped"),childRef);
  }
  buildTransportError(context,error){
    const base=error instanceof Error?error:new Error(String(error));
    const suffix=base&&typeof base.message==="string"&&base.message?base.message:String(base);
    const err=new Error(`app-server stdio ${context}: ${suffix}`);
    if(Object.prototype.hasOwnProperty.call(base,"code"))err.code=base.code;
    if(Object.prototype.hasOwnProperty.call(base,"errno"))err.errno=base.errno;
    if(Object.prototype.hasOwnProperty.call(base,"syscall"))err.syscall=base.syscall;
    err.cause=base;
    return err;
  }
  async sendRaw(msg){
    if(this.transportMode==="mock-fixture"){
      return;
    }
    const child=this.child;
    const stdin=child&&child.stdin;
    if(this.childTerminated&&this.terminatedTransportError)throw this.terminatedTransportError;
    if(!child||!stdin||stdin.destroyed)throw new Error("app-server is not running");
    const payload=`${JSON.stringify(msg)}\n`;
    await new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error)=>{
        if(settled)return;
        settled=true;
        if(error){
          const transportError=this.buildTransportError("write failed",error);
          this.handleProcessTermination(transportError,child);
          reject(transportError);
          return;
        }
        resolve();
      };
      try{
        stdin.write(payload,"utf8",finish);
      }catch(error){
        finish(error);
      }
    });
  }
  async sendNotificationRaw(method,params){
    if(this.transportMode==="mock-fixture"){
      return;
    }
    await this.sendRaw(params===undefined?{method}:{method,params});
  }
  sendRequestRaw(method,params,timeoutMs=120000){
    if(this.transportMode==="mock-fixture"){
      return this.sendMockRequest(method,params,timeoutMs);
    }
    if(!this.child||this.stopping)throw new Error("app-server is not running");
    const id=String(this.requestSeq++);
    const startedAt=nowTs();
    const traced=this.shouldTraceRpcMethod(method);
    if(traced){
      logOperation("rpc.req",{
        id,
        method:safeString(method,80),
      });
    }
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{
        this.pending.delete(id);
        if(traced){
          logOperation("rpc.timeout",{
            id,
            method:safeString(method,80),
            ms:Math.max(0,nowTs()-startedAt),
          });
        }
        reject(new Error(`request timed out: ${method}`));
      },timeoutMs);
      this.pending.set(id,{resolve,reject,timeout,method,startedAt,traced});
      void this.sendRaw({method,id,params}).catch(e=>{
        if(traced){
          logOperation("rpc.send_error",{
            id,
            method:safeString(method,80),
            err:summarizeErrorForOperationLog(e,220),
          });
        }
        if(!this.pending.has(id))return;
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(e);
      });
    });
  }
  async sendRequest(method,params,timeoutMs=120000){
    await this.ensureStarted();
    return this.sendRequestRaw(method,params,timeoutMs);
  }
  setTurnContext(threadId,turnId,context){
    this.turnContexts.set(this.turnKey(threadId,turnId),context||{});
  } 
  clearTurnContext(threadId,turnId){
    this.turnContexts.delete(this.turnKey(threadId,turnId));
  }
  watchTurn(threadId,turnId,handlers){
    const key=this.turnKey(threadId,turnId);
    this.turnWatchers.set(key,handlers||{});
    if(this.transportMode==="mock-fixture"){
      this.maybeRunMockTurn(threadId,turnId);
    }
    return()=>{
      if(this.turnWatchers.get(key)===handlers)this.turnWatchers.delete(key);
      this.clearTurnContext(threadId,turnId);
    };
  }
  async interruptTurn(threadId,turnId){
    if(!threadId||!turnId)return;
    if(this.transportMode==="mock-fixture"){
      const key=this.turnKey(threadId,turnId);
      const turn=this.mockTurns.get(key);
      if(turn)turn.interrupted=true;
      return;
    }
    try{
      await this.sendRequest("turn/interrupt",{threadId,turnId},15000);
    }catch{
    }
  }
  turnKey(threadId,turnId){
    return`${threadId}::${turnId}`;
  }
  async sendMockRequest(method,params){
    const traced=this.shouldTraceRpcMethod(method);
    const id=String(this.requestSeq++);
    const startedAt=nowTs();
    if(traced){
      logOperation("rpc.req",{
        id,
        method:safeString(method,80),
        transport:this.transportMode,
      });
    }
    try{
      const result=this.resolveMockRequest(method,params);
      if(traced){
        logOperation("rpc.res",{
          id,
          method:safeString(method,80),
          ms:Math.max(0,nowTs()-startedAt),
          transport:this.transportMode,
        });
      }
      return result;
    }catch(error){
      if(traced){
        logOperation("rpc.err",{
          id,
          method:safeString(method,80),
          ms:Math.max(0,nowTs()-startedAt),
          err:safeString(error&&error.message?error.message:String(error),220),
          transport:this.transportMode,
        });
      }
      throw error;
    }
  }
  resolveMockRequest(method,params){
    if(method==="initialize"){
      return{
        serverInfo:{name:"codex-app-server-fixture",version:"fixture.v1"},
        capabilities:{experimentalApi:true},
      };
    }
    if(method==="thread/start"){
      const threadId=`mock-thread-${this.mockThreadSeq++}`;
      return{thread:{id:threadId}};
    }
    if(method==="thread/resume"){
      const threadId=safeString(params&&params.threadId,160);
      if(!threadId)return{thread:{id:""}};
      return{thread:{id:threadId}};
    }
    if(method==="turn/start"){
      const threadId=safeString(params&&params.threadId,160);
      if(!threadId)throw new Error("turn/start missing thread id");
      const turnId=`mock-turn-${this.mockTurnSeq++}`;
      const key=this.turnKey(threadId,turnId);
      this.mockTurns.set(key,{
        threadId,
        turnId,
        input:params&&params.input,
        cwd:params&&params.cwd?params.cwd:this.cwd,
        started:false,
        interrupted:false,
      });
      return{turn:{id:turnId,status:"in_progress"}};
    }
    if(method==="turn/interrupt"){
      const threadId=safeString(params&&params.threadId,160);
      const turnId=safeString(params&&params.turnId,160);
      const turn=this.mockTurns.get(this.turnKey(threadId,turnId));
      if(turn)turn.interrupted=true;
      return{ok:true};
    }
    throw new Error(`unsupported mock-fixture request: ${method}`);
  }
  maybeRunMockTurn(threadId,turnId){
    const key=this.turnKey(threadId,turnId);
    const turn=this.mockTurns.get(key);
    if(!turn||turn.started)return;
    const watcher=this.turnWatchers.get(key);
    if(!watcher)return;
    turn.started=true;
    Promise.resolve().then(async()=>{
      const context=this.turnContexts.get(key)||{};
      const scenario=buildMockFixtureScenario({
        workspaceRoot,
        cwd:safeString(context&&context.cwd,260)||safeString(turn.cwd,260)||this.cwd,
        input:turn.input,
        threadId,
        turnId,
      });
      if(scenario&&scenario.plan&&Array.isArray(scenario.plan.plan)&&scenario.plan.plan.length){
        this.emitMockNotification(watcher,"plan/update",{
          threadId,
          turnId,
          explanation:safeString(scenario.plan.explanation,600),
          plan:scenario.plan.plan,
        });
      }
      for(const item of Array.isArray(scenario&&scenario.items)?scenario.items:[]){
        if(turn.interrupted)break;
        this.emitMockItemLifecycle(watcher,threadId,turnId,item);
      }
      const completedStatus=turn.interrupted?"interrupted":safeString(scenario&&scenario.turnStatus,40)||"completed";
      this.emitMockNotification(watcher,"turn/completed",{
        threadId,
        turnId,
        turn:{
          id:turnId,
          status:completedStatus,
        },
      });
    }).catch((error)=>{
      const currentWatcher=this.turnWatchers.get(key);
      if(currentWatcher&&typeof currentWatcher.onFatal==="function"){
        currentWatcher.onFatal(error);
      }
    }).finally(()=>{
      this.mockTurns.delete(key);
    });
  }
  emitMockItemLifecycle(watcher,threadId,turnId,item){
    if(!watcher||!item||typeof item!=="object")return;
    const startedItem={...item,status:"in_progress"};
    this.emitMockNotification(watcher,"item/started",{threadId,turnId,item:startedItem});
    if(item.type==="agentMessage"&&typeof item.text==="string"&&typeof watcher.onDelta==="function"){
      try{
        watcher.onDelta(item.text,{threadId,turnId,delta:item.text});
      }catch{
      }
    }
    this.emitMockNotification(watcher,"item/completed",{threadId,turnId,item});
  }
  emitMockNotification(watcher,method,params){
    if(!watcher)return;
    if(typeof watcher.onAny==="function"){
      try{
        watcher.onAny(method,params);
      }catch{
      }
    }
    if((method==="item/agentMessage/delta"||method==="agentMessage/delta")&&typeof watcher.onDelta==="function"){
      try{
        watcher.onDelta(typeof params&&params.delta==="string"?params.delta:"",params);
      }catch{
      }
      return;
    }
    if((method==="item/started"||method==="itemStarted")&&params&&params.item&&typeof watcher.onItemStarted==="function"){
      try{
        watcher.onItemStarted(params.item,params);
      }catch{
      }
      return;
    }
    if((method==="item/completed"||method==="itemCompleted")&&params&&params.item&&typeof watcher.onItemCompleted==="function"){
      try{
        watcher.onItemCompleted(params.item,params);
      }catch{
      }
      return;
    }
    if((method==="turn/completed"||method==="turnCompleted")&&typeof watcher.onCompleted==="function"){
      try{
        watcher.onCompleted(params&&params.turn,params);
      }catch{
      }
    }
  }
  flushStdout(){
    const lines=this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer=lines.pop()||"";
    for(const line of lines){
      const t=line.trim();
      if(!t)continue;
      this.handleMessageLine(t);
    }
  }
  flushStderr(){
    const lines=this.stderrBuffer.split(/\r?\n/);
    this.stderrBuffer=lines.pop()||"";
    for(const line of lines){
      const t=line.trim();
      if(!t||t.startsWith("WARNING:"))continue;
      console.error(`[app-server] ${t}`);
    }
  }
  handleProcessTermination(error,childRef){
    if(childRef&&this.child&&this.child!==childRef)return;
    if(childRef&&!this.child)return;
    const err=error instanceof Error?error:new Error(String(error));
    this.childTerminated=true;
    if(!this.terminatedTransportError)this.terminatedTransportError=err;
    if(!this.child&&this.pending.size===0&&this.turnWatchers.size===0&&this.turnContexts.size===0&&this.mockTurns.size===0){
      return;
    }
    logOperation("appserver.exit",{err:summarizeErrorForOperationLog(err,220)});
    const pendingEntries=[...this.pending.entries()];
    this.pending.clear();
    for(const[,p]of pendingEntries){
      clearTimeout(p.timeout);
      p.reject(err);
    }
    const turnWatcherEntries=[...this.turnWatchers.entries()];
    this.turnWatchers.clear();
    for(const[,h]of turnWatcherEntries){
      try{
        if(h&&typeof h.onFatal==="function")h.onFatal(err);
      }catch{
      }
    }
    this.turnContexts.clear();
    this.mockTurns.clear();
    this.child=null;
  }
  parseErrorMessage(payload){
    if(!payload)return"unknown app-server error";
    if(typeof payload.message==="string")return payload.message;
    if(typeof payload==="string")return payload;
    try{
      return JSON.stringify(payload);
    }catch{
      return"unknown app-server error";
    }
  }
  handleMessageLine(line){
    let msg;
    try{
      msg=JSON.parse(line);
    }catch{
      return;
    }
    if(msg&&Object.prototype.hasOwnProperty.call(msg,"id")&&msg.method&&!Object.prototype.hasOwnProperty.call(msg,"result")&&!Object.prototype.hasOwnProperty.call(msg,"error")){
      void this.handleServerRequest(msg);
      return;
    }
    if(msg&&Object.prototype.hasOwnProperty.call(msg,"id")&&(Object.prototype.hasOwnProperty.call(msg,"result")||Object.prototype.hasOwnProperty.call(msg,"error"))){
      const pendingId=String(msg.id);
      const p=this.pending.get(pendingId);
      if(!p)return;
      clearTimeout(p.timeout);
      this.pending.delete(pendingId);
      if(p.traced){
        if(Object.prototype.hasOwnProperty.call(msg,"error")){
          logOperation("rpc.err",{
            id:pendingId,
            method:safeString(p.method,80),
            ms:Math.max(0,nowTs()-Number(p.startedAt||nowTs())),
            err:safeString(this.parseErrorMessage(msg.error),220),
          });
        }else{
          logOperation("rpc.res",{
            id:pendingId,
            method:safeString(p.method,80),
            ms:Math.max(0,nowTs()-Number(p.startedAt||nowTs())),
          });
        }
      }
      if(Object.prototype.hasOwnProperty.call(msg,"error"))p.reject(new Error(this.parseErrorMessage(msg.error)));
      else p.resolve(msg.result);
      return;
    }
    if(msg&&typeof msg.method==="string")this.handleNotification(msg);
  }
  getTurnWatcherFromParams(params){
    if(!params||typeof params!=="object")return null;
    const threadId=typeof params.threadId==="string"?params.threadId:null;
    let turnId=null;
    if(typeof params.turnId==="string")turnId=params.turnId;
    else if(params.turn&&typeof params.turn.id==="string")turnId=params.turn.id;
    if(!threadId||!turnId)return null;
    const key=this.turnKey(threadId,turnId);
    const watcher=this.turnWatchers.get(key);
    return watcher?{watcher,threadId,turnId,key}:null;
  }
  handleNotification(message){
    const params=message.params;
    const located=this.getTurnWatcherFromParams(params);
    if(!located)return;
    const watcher=located.watcher;
    if(typeof watcher.onAny==="function"){
      try{
        watcher.onAny(message.method,params);
      }catch{
      }
    }
    if(message.method==="item/agentMessage/delta"||message.method==="agentMessage/delta"){
      if(typeof params.delta==="string"&&typeof watcher.onDelta==="function")watcher.onDelta(params.delta,params);
      return;
    }
    if(message.method==="item/started"||message.method==="itemStarted"){
      if(params.item&&typeof watcher.onItemStarted==="function")watcher.onItemStarted(params.item,params);
      return;
    }
    if(message.method==="item/completed"||message.method==="itemCompleted"){
      if(params.item&&typeof watcher.onItemCompleted==="function")watcher.onItemCompleted(params.item,params);
      return;
    }
    if(message.method==="turn/diff/updated"||message.method==="turnDiffUpdated"){
      if(typeof watcher.onDiffUpdated==="function")watcher.onDiffUpdated(typeof params.diff==="string"?params.diff:"",params);
      return;
    }
    if(message.method==="error"){
      const text=params&&params.error&&typeof params.error.message==="string"?params.error.message:"turn failed";
      if(typeof watcher.onError==="function")watcher.onError(text,params);
      return;
    }
    if(message.method==="turn/completed"||message.method==="turnCompleted"){
      if(typeof watcher.onCompleted==="function")watcher.onCompleted(params.turn,params);
      return;
    }
  }
  normalizeServerRequestOperation(method){
    if(method==="item/commandExecution/requestApproval"||method==="commandExecution/requestApproval")return"commandExecution";
    if(method==="item/fileChange/requestApproval"||method==="fileChange/requestApproval")return"fileChange";
    if(method==="item/tool/requestUserInput"||method==="tool/requestUserInput")return"toolRequestUserInput";
    if(method==="item/tool/call"||method==="tool/call")return"toolCall";
    return"unknown";
  }
  approvalContextForTurn(params){
    const base={
      approvalPolicy:"on-request",
      sandboxMode:"workspace-write",
      cwd:this.cwd||workspaceRoot,
      agentName:"",
      requestUserInputPolicy:nonInteractiveRequestUserInputPolicy,
      automaticApprovalReviewEnabled:automaticApprovalReviewDefault,
      governanceOverride:null,
      interactiveApprovalAvailable:false,
    };
    if(!params||typeof params!=="object")return base;
    const threadId=typeof params.threadId==="string"?params.threadId:null;
    const turnId=typeof params.turnId==="string"?params.turnId:null;
    if(!threadId||!turnId)return base;
    const ctx=this.turnContexts.get(this.turnKey(threadId,turnId));
    if(!ctx||typeof ctx!=="object")return base;
    let resolvedCwd=base.cwd;
    try{
      resolvedCwd=normalizeWorkingDirectory(ctx.cwd||this.cwd||workspaceRoot,workspaceRoot);
    }catch{
      resolvedCwd=base.cwd;
    }
    return{
      approvalPolicy:normalizeApprovalPolicy(ctx.approvalPolicy),
      sandboxMode:normalizeSandboxMode(ctx.sandboxMode),
      cwd:resolvedCwd,
      agentName:safeString(ctx.agentName,80),
      requestUserInputPolicy:normalizeRequestUserInputPolicy(ctx.requestUserInputPolicy,nonInteractiveRequestUserInputPolicy),
      automaticApprovalReviewEnabled:resolveAutomaticApprovalReviewEnabled(ctx.automaticApprovalReviewEnabled,automaticApprovalReviewDefault),
      governanceOverride:normalizeOverrideRequest(ctx.governanceOverride),
      interactiveApprovalAvailable:false,
    };
  }
  locateTurnContext(params){
    if(!params||typeof params!=="object")return null;
    const threadId=typeof params.threadId==="string"?params.threadId:null;
    const turnId=typeof params.turnId==="string"?params.turnId:null;
    if(!threadId||!turnId)return null;
    const key=this.turnKey(threadId,turnId);
    const ctx=this.turnContexts.get(key);
    if(!ctx||typeof ctx!=="object")return null;
    return{threadId,turnId,ctx};
  }
  recordTurnApprovalAudit(params,auditRecord){
    const located=this.locateTurnContext(params);
    if(!located)return;
    const trail=Array.isArray(located.ctx.approvalAuditTrail)?located.ctx.approvalAuditTrail:null;
    if(!trail)return;
    if(trail.length>=64)return;
    const normalized=normalizeApprovalAuditRecord({
      ...(auditRecord&&typeof auditRecord==="object"?auditRecord:{}),
      threadId:located.threadId,
      turnId:located.turnId,
    });
    trail.push(normalized);
  }
  extractFirstString(candidates,max=1200){
    if(!Array.isArray(candidates))return"";
    for(const candidate of candidates){
      if(typeof candidate!=="string")continue;
      const text=candidate.trim();
      if(!text)continue;
      return text.slice(0,max);
    }
    return"";
  }
  extractCommandTextFromApprovalParams(params){
    const payload=params&&typeof params==="object"?params:{};
    const item=payload.item&&typeof payload.item==="object"?payload.item:{};
    const commandObj=payload.command&&typeof payload.command==="object"?payload.command:{};
    const requestObj=payload.request&&typeof payload.request==="object"?payload.request:{};
    const actionObj=payload.action&&typeof payload.action==="object"?payload.action:{};
    const inputObj=payload.input&&typeof payload.input==="object"?payload.input:{};
    return this.extractFirstString([
      payload.commandLine,
      payload.command,
      payload.cmd,
      payload.shellCommand,
      payload.shell,
      payload.program,
      item.commandLine,
      item.command,
      item.cmd,
      commandObj.commandLine,
      commandObj.command,
      requestObj.commandLine,
      requestObj.command,
      actionObj.commandLine,
      actionObj.command,
      inputObj.commandLine,
      inputObj.command,
    ],1800);
  }
  detectRetryHint(params){
    const payload=params&&typeof params==="object"?params:{};
    const item=payload.item&&typeof payload.item==="object"?payload.item:{};
    const boolCandidates=[
      payload.retry,
      payload.isRetry,
      payload.rerun,
      payload.isRerun,
      payload.retrying,
      item.retry,
      item.isRetry,
      item.rerun,
      item.isRerun,
    ];
    for(const value of boolCandidates){
      if(typeof value==="boolean"&&value)return true;
      if(typeof value==="number"&&Number.isFinite(value)&&value>0)return true;
      if(typeof value==="string"){
        const normalized=value.trim().toLowerCase();
        if(normalized==="true"||normalized==="1"||normalized==="yes"||normalized==="on")return true;
      }
    }
    const numericCandidates=[
      payload.attempt,
      payload.attemptIndex,
      payload.retryCount,
      payload.retryAttempt,
      item.attempt,
      item.attemptIndex,
      item.retryCount,
      item.retryAttempt,
    ];
    for(const value of numericCandidates){
      const parsed=Number(value);
      if(!Number.isFinite(parsed))continue;
      if(parsed>1)return true;
    }
    return false;
  }
  extractFileChangeMeta(params,cwd){
    const payload=params&&typeof params==="object"?params:{};
    const item=payload.item&&typeof payload.item==="object"?payload.item:{};
    const requestObj=payload.request&&typeof payload.request==="object"?payload.request:{};
    const changes=Array.isArray(payload.changes)
      ?payload.changes
      :(Array.isArray(item.changes)?item.changes:(Array.isArray(requestObj.changes)?requestObj.changes:[]));
    let totalChanges=0;
    let deleteCount=0;
    let outsideWorkspaceCount=0;
    const changedPathSet=new Set();
    let baseCwd=workspaceRoot;
    try{
      baseCwd=normalizeWorkingDirectory(cwd||workspaceRoot,workspaceRoot);
    }catch{
      baseCwd=workspaceRoot;
    }
    for(const change of changes){
      if(!change||typeof change!=="object")continue;
      totalChanges+=1;
      let kind="";
      if(typeof change.kind==="string")kind=change.kind;
      else if(change.kind&&typeof change.kind.type==="string")kind=change.kind.type;
      kind=String(kind||"").trim().toLowerCase();
      if(kind==="delete"||kind==="remove"||kind==="removed")deleteCount+=1;

      const pathValue=this.extractFirstString([
        change.path,
        change.filePath,
        change.file,
        change.targetPath,
        change.target,
        change.movePath,
      ],320);
      if(!pathValue)continue;
      const resolved=path.isAbsolute(pathValue)?path.normalize(pathValue):path.resolve(baseCwd,pathValue);
      if(!isPathWithin(workspaceRoot,resolved)){
        outsideWorkspaceCount+=1;
        continue;
      }
      const relative=path.relative(workspaceRoot,resolved).replace(/\\/g,"/");
      const normalizedPath=normalizeMergePath(relative);
      if(normalizedPath)changedPathSet.add(normalizedPath);
    }
    return{
      totalChanges,
      deleteCount,
      outsideWorkspaceCount,
      changedPaths:Array.from(changedPathSet.values()).slice(0,120),
    };
  }
  classifyApprovalRisk({operation,params,sandboxMode,cwd}){
    const normalizedSandbox=normalizeSandboxMode(sandboxMode);
    const normalizedOperation=safeString(operation,60)||"unknown";
    const payload=params&&typeof params==="object"?params:{};
    const paramKeySample=Object.keys(payload).slice(0,8).map((key)=>safeString(key,48)).filter(Boolean);
    const matchedRuleIds=new Set();
    const addRule=(ruleId,signal)=>{
      const id=safeString(ruleId,64).toLowerCase();
      if(id)matchedRuleIds.add(id);
      if(signal)result.signals.push(signal);
    };
    const result={
      level:"low",
      signals:[],
      rulesVersion:riskRulesVersion,
      ruleIds:[],
      retryHint:false,
      command:"",
      fileChangeCount:0,
      deleteCount:0,
      outsideWorkspaceCount:0,
      changedPaths:[],
      inputSummary:{
        operation:normalizedOperation,
        sandboxMode:normalizedSandbox,
        ...(paramKeySample.length?{paramKeySample}:{})
      },
    };
    if(operation==="commandExecution"){
      const commandText=this.extractCommandTextFromApprovalParams(params);
      result.command=commandText;
      const normalized=commandText.toLowerCase();
      const hasDestructiveDelete=/\b(rm\s+-rf|rm\s+-r|del\s+\/[sqf]|rmdir\s+\/[sq]|rd\s+\/s|remove-item\b)\b/.test(normalized);
      const hasRemoteFetch=/\b(curl|wget|invoke-webrequest|iwr|irm)\b/.test(normalized);
      const hasPipeExec=/\|\s*(sh|bash|zsh|pwsh|powershell|iex|invoke-expression)\b/.test(normalized);
      const hasDiskOperation=/\b(format|mkfs|diskpart|dd\s+if=)\b/.test(normalized);
      const hasSystemControl=/\b(shutdown|reboot|halt)\b/.test(normalized);
      if(hasDestructiveDelete)addRule(approvalRiskRuleIds.commandDestructiveDelete,"destructive_delete_command");
      if(hasRemoteFetch&&hasPipeExec)addRule(approvalRiskRuleIds.commandRemoteFetchPipeExec,"remote_fetch_pipe_exec");
      if(hasDiskOperation)addRule(approvalRiskRuleIds.commandDiskOperation,"disk_operation_command");
      if(hasSystemControl)addRule(approvalRiskRuleIds.commandSystemControl,"system_control_command");
      result.retryHint=this.detectRetryHint(params);
      if(result.retryHint)addRule(approvalRiskRuleIds.commandRetryHint,"retry_hint");
      result.inputSummary={
        operation:normalizedOperation,
        sandboxMode:normalizedSandbox,
        commandNormalized:safeString(normalized,240),
        commandLength:commandText.length,
        hasDestructiveDelete,
        hasRemoteFetch,
        hasPipeExec,
        hasRemoteFetchPipeExec:hasRemoteFetch&&hasPipeExec,
        hasDiskOperation,
        hasSystemControl,
        retryHint:result.retryHint,
        ...(paramKeySample.length?{paramKeySample}:{})
      };
      if(result.signals.length){
        result.level="high";
      }else{
        if(normalizedSandbox==="danger-full-access"){
          result.level="medium";
          addRule(approvalRiskRuleIds.commandDangerSandboxBaseline,"danger_full_access_sandbox");
        }
        if(result.retryHint&&result.level==="low")result.level="medium";
      }
      if(normalizedSandbox==="danger-full-access"&&result.retryHint){
        result.level="high";
        addRule(approvalRiskRuleIds.commandDangerSandboxRetryEscalation,"danger_full_access_retry_hint");
      }
      result.ruleIds=Array.from(matchedRuleIds.values()).slice(0,16);
      return result;
    }
    if(operation==="fileChange"){
      const meta=this.extractFileChangeMeta(params,cwd);
      result.fileChangeCount=meta.totalChanges;
      result.deleteCount=meta.deleteCount;
      result.outsideWorkspaceCount=meta.outsideWorkspaceCount;
      result.changedPaths=Array.isArray(meta.changedPaths)?meta.changedPaths.slice(0,80):[];
      result.inputSummary={
        operation:normalizedOperation,
        sandboxMode:normalizedSandbox,
        totalChanges:meta.totalChanges,
        deleteCount:meta.deleteCount,
        outsideWorkspaceCount:meta.outsideWorkspaceCount,
        changedPathCount:Array.isArray(meta.changedPaths)?meta.changedPaths.length:0,
        changedPathSample:Array.isArray(meta.changedPaths)?meta.changedPaths.slice(0,8):[],
        ...(paramKeySample.length?{paramKeySample}:{})
      };
      if(meta.deleteCount>0){
        result.level="high";
        addRule(approvalRiskRuleIds.fileDeleteChange,"file_delete_change");
      }
      if(meta.outsideWorkspaceCount>0){
        result.level="high";
        addRule(approvalRiskRuleIds.fileOutsideWorkspace,"outside_workspace_change");
      }
      if(meta.totalChanges>=40&&result.level!=="high"){
        result.level="high";
        addRule(approvalRiskRuleIds.fileBulkChange,"bulk_file_change");
      }else if(meta.totalChanges>=10&&result.level==="low"){
        result.level="medium";
        addRule(approvalRiskRuleIds.fileMultiChange,"multi_file_change");
      }
      if(normalizedSandbox==="danger-full-access"&&meta.totalChanges>0&&result.level==="low"){
        result.level="medium";
        addRule(approvalRiskRuleIds.fileDangerSandboxBaseline,"danger_full_access_sandbox");
      }
      result.ruleIds=Array.from(matchedRuleIds.values()).slice(0,16);
      return result;
    }
    if(normalizedSandbox==="danger-full-access"){
      result.level="medium";
      addRule(approvalRiskRuleIds.genericDangerSandboxBaseline,"danger_full_access_sandbox");
    }
    result.ruleIds=Array.from(matchedRuleIds.values()).slice(0,16);
    return result;
  }
  resolveApprovalDecision({requestedPolicy,sandboxMode,operation,risk,agentName,governanceOverride,automaticApprovalReviewEnabled}){
    const requested=normalizeApprovalPolicy(requestedPolicy);
    const normalizedSandbox=normalizeSandboxMode(sandboxMode);
    const level=risk&&typeof risk.level==="string"?risk.level:"low";
    const highRisk=level==="high";
    const retryHint=Boolean(risk&&risk.retryHint);
    const governance=evaluateAgentGovernance({
      agentName:safeString(agentName,120),
      operation,
      changedPaths:Array.isArray(risk&&risk.changedPaths)?risk.changedPaths:[],
      override:governanceOverride&&typeof governanceOverride==="object"?governanceOverride:null,
    });
    const automaticReviewEnabled=resolveAutomaticApprovalReviewEnabled(automaticApprovalReviewEnabled,automaticApprovalReviewDefault);
    const withGovernance=(decision)=>({
      ...decision,
      governance,
    });
    if(requested==="untrusted"){
      return withGovernance({decision:"decline",requestedPolicy:requested,effectivePolicy:"untrusted_decline",reason:"policy_untrusted"});
    }
    if(requested==="on-request"){
      if(!automaticReviewEnabled){
        return withGovernance({decision:"decline",requestedPolicy:requested,effectivePolicy:"blocked_on_request",reason:"interactive_approval_unavailable"});
      }
      if(highRisk||retryHint){
        return withGovernance({decision:"decline",requestedPolicy:requested,effectivePolicy:"auto_review_blocked_high_risk",reason:"automatic_approval_review_blocked_high_risk"});
      }
      if(governance.decision==="deny"){
        return withGovernance({decision:"decline",requestedPolicy:requested,effectivePolicy:"agent_governance_block",reason:governance.reason});
      }
      return withGovernance({decision:"accept",requestedPolicy:requested,effectivePolicy:"automatic_approval_review_accept",reason:"automatic_approval_review_low_risk_accept"});
    }
    if(requested==="on-failure"){
      if(highRisk||retryHint){
        return withGovernance({decision:"decline",requestedPolicy:requested,effectivePolicy:"blocked_on_failure_high_risk",reason:"high_risk_requires_request"});
      }
      if(governance.decision==="deny"){
        return withGovernance({decision:"decline",requestedPolicy:requested,effectivePolicy:"agent_governance_block",reason:governance.reason});
      }
      return withGovernance({decision:"accept",requestedPolicy:requested,effectivePolicy:"on_failure_auto_accept",reason:"low_risk_auto_accept"});
    }
    if(requested==="never"){
      if(operation==="commandExecution"&&normalizedSandbox==="danger-full-access"&&highRisk){
        return withGovernance({decision:"decline",requestedPolicy:requested,effectivePolicy:"blocked_never_high_risk",reason:"danger_full_access_high_risk_guard"});
      }
      if(governance.decision==="deny"){
        return withGovernance({decision:"decline",requestedPolicy:requested,effectivePolicy:"agent_governance_block",reason:governance.reason});
      }
      return withGovernance({decision:"accept",requestedPolicy:requested,effectivePolicy:"never_auto_accept",reason:"non_interactive_auto_accept"});
    }
    return withGovernance({decision:"decline",requestedPolicy:requested,effectivePolicy:"blocked_unknown_policy",reason:"unknown_policy"});
  }
  buildApprovalAuditRecord({operation,ctx,risk,decision}){
    return normalizeApprovalAuditRecord({
      type:safeString(operation,60),
      policyRequested:safeString(decision&&decision.requestedPolicy?decision.requestedPolicy:ctx&&ctx.approvalPolicy?ctx.approvalPolicy:"on-request",40),
      policyEffective:safeString(decision&&decision.effectivePolicy?decision.effectivePolicy:"",64),
      sandbox:safeString(ctx&&ctx.sandboxMode?ctx.sandboxMode:"workspace-write",40),
      decision:safeString(decision&&decision.decision?decision.decision:"decline",20),
      reason:safeString(decision&&decision.reason?decision.reason:"",120),
      risk:safeString(risk&&risk.level?risk.level:"low",20),
      riskRulesVersion:safeString(risk&&risk.rulesVersion?risk.rulesVersion:riskRulesVersion,40),
      riskRuleIds:Array.isArray(risk&&risk.ruleIds)?risk.ruleIds:[],
      riskInputSummary:risk&&risk.inputSummary&&typeof risk.inputSummary==="object"
        ?risk.inputSummary
        :{operation:safeString(operation,60),sandboxMode:safeString(ctx&&ctx.sandboxMode?ctx.sandboxMode:"workspace-write",40)},
      riskSignals:Array.isArray(risk&&risk.signals)?risk.signals.map(signal=>safeString(signal,60)).filter(Boolean).slice(0,8):[],
      retryHint:risk&&risk.retryHint?1:0,
      fileChanges:Number.isFinite(Number(risk&&risk.fileChangeCount))?Math.max(0,Math.trunc(Number(risk.fileChangeCount))):0,
      fileDeletes:Number.isFinite(Number(risk&&risk.deleteCount))?Math.max(0,Math.trunc(Number(risk.deleteCount))):0,
      outsideWorkspaceChanges:Number.isFinite(Number(risk&&risk.outsideWorkspaceCount))?Math.max(0,Math.trunc(Number(risk.outsideWorkspaceCount))):0,
      commandSample:safeString(risk&&risk.command?risk.command:"",240),
      changedPaths:Array.isArray(risk&&risk.changedPaths)?risk.changedPaths.slice(0,6):[],
      governanceDecision:safeString(decision&&decision.governance&&decision.governance.decision?decision.governance.decision:"",40),
      governanceReason:safeString(decision&&decision.governance&&decision.governance.reason?decision.governance.reason:"",80),
      governanceContract:safeString(decision&&decision.governance&&decision.governance.contract&&decision.governance.contract.id?decision.governance.contract.id:"",80),
      governanceViolations:Number.isFinite(Number(decision&&decision.governance&&decision.governance.violationCount))?Math.max(0,Math.trunc(Number(decision.governance.violationCount))):0,
      governanceOverrideRequested:decision&&decision.governance&&decision.governance.override&&decision.governance.override.requested?1:0,
      governanceOverrideApplied:decision&&decision.governance&&decision.governance.override&&decision.governance.override.applied?1:0,
      governanceOverrideBy:safeString(decision&&decision.governance&&decision.governance.override&&decision.governance.override.requestedBy?decision.governance.override.requestedBy:"",80),
      governanceOverrideReason:safeString(decision&&decision.governance&&decision.governance.override&&decision.governance.override.reason?decision.governance.override.reason:"",160),
      governanceOverrideFailure:safeString(decision&&decision.governance&&decision.governance.override&&decision.governance.override.failureReason?decision.governance.override.failureReason:"",80),
      agent:safeString(ctx&&ctx.agentName?ctx.agentName:"",80),
    });
  }
  buildApprovalLogFields(input){
    return this.buildApprovalAuditRecord(input);
  }
  buildDynamicToolFailureResponse(message){
    const detail=safeString(message,1800);
    if(!detail)return{contentItems:[],success:false};
    return{contentItems:[{type:"inputText",text:detail}],success:false};
  }
  async handleDynamicToolCallRequest(id,params,ctx){
    const payload=params&&typeof params==="object"?params:{};
    const approvalPolicy=normalizeApprovalPolicy(ctx&&ctx.approvalPolicy);
    const sandboxMode=normalizeSandboxMode(ctx&&ctx.sandboxMode);
    const risk=this.classifyApprovalRisk({
      operation:"toolCall",
      params:payload,
      sandboxMode,
      cwd:ctx&&ctx.cwd?ctx.cwd:this.cwd,
    });
    const policyDecision=this.resolveApprovalDecision({
      requestedPolicy:approvalPolicy,
      sandboxMode,
      operation:"toolCall",
      risk,
      agentName:ctx&&ctx.agentName?ctx.agentName:"",
      governanceOverride:ctx&&ctx.governanceOverride?ctx.governanceOverride:null,
      automaticApprovalReviewEnabled:ctx&&ctx.automaticApprovalReviewEnabled,
    });
    const tool=safeString(payload.tool,80);
    const callId=safeString(payload.callId,120);
    const threadId=safeString(payload.threadId,120);
    const turnId=safeString(payload.turnId,120);
    const hasRequired=Boolean(tool&&callId&&threadId&&turnId);
    if(policyDecision.decision==="decline"){
      logOperation("tool.call_request",{
        decision:"policy_blocked",
        policyRequested:policyDecision.requestedPolicy,
        policyEffective:policyDecision.effectivePolicy,
        reason:policyDecision.reason,
        sandbox:sandboxMode,
        risk:risk.level,
        riskRulesVersion:safeString(risk&&risk.rulesVersion?risk.rulesVersion:riskRulesVersion,40),
        riskRuleIds:Array.isArray(risk&&risk.ruleIds)?risk.ruleIds.slice(0,8):[],
        riskInputSummary:normalizeRiskInputSummary(risk&&risk.inputSummary&&typeof risk.inputSummary==="object"?risk.inputSummary:{}),
        riskSignals:risk.signals.slice(0,6),
        tool:tool||"",
        callId:callId||"",
        threadId:threadId||"",
        turnId:turnId||"",
      },"standard");
      await this.sendRaw({id,result:this.buildDynamicToolFailureResponse(`dynamic tool blocked by approval policy (${policyDecision.reason})`)});
      return;
    }
    if(!hasRequired){
      logOperation("tool.call_request",{
        decision:"invalid_params",
        policy:approvalPolicy,
        tool:tool||"",
        callId:callId||"",
        threadId:threadId||"",
        turnId:turnId||"",
      });
      await this.sendRaw({id,result:this.buildDynamicToolFailureResponse("invalid dynamic tool request (tool/callId/threadId/turnId required)")});
      return;
    }
    const nativeCollab=isNativeCollabToolName(tool);
    const nonInteractivePolicy=approvalPolicy==="never";
    const decision=nativeCollab
      ?(nonInteractivePolicy?"blocked_non_interactive":"bridge_unavailable")
      :"unsupported_dynamic_tool";
    logOperation("tool.call_request",{
      decision,
      policy:approvalPolicy,
      tool,
      callId,
      threadId,
      turnId,
    });
    const feedback=nativeCollab&&nonInteractivePolicy
      ?`non-interactive approval blocked dynamic tool '${tool}' in this harness bridge`
      :nativeCollab
        ?`dynamic bridge cannot execute native collab tool '${tool}' on the client side`
        :`dynamic tool '${tool}' is not configured in this harness`;
    await this.sendRaw({id,result:this.buildDynamicToolFailureResponse(feedback)});
  }
  async handleServerRequest(message){
    const method=message.method;
    const id=message.id;
    const params=message.params||{};
    const operation=this.normalizeServerRequestOperation(method);
    const ctx=this.approvalContextForTurn(params);
    try{
      if(method==="item/commandExecution/requestApproval"||method==="commandExecution/requestApproval"){
        const risk=this.classifyApprovalRisk({operation,params,sandboxMode:ctx.sandboxMode,cwd:ctx.cwd});
        const decision=this.resolveApprovalDecision({
          requestedPolicy:ctx.approvalPolicy,
          sandboxMode:ctx.sandboxMode,
          operation,
          risk,
          agentName:ctx.agentName,
          governanceOverride:ctx.governanceOverride,
          automaticApprovalReviewEnabled:ctx.automaticApprovalReviewEnabled,
        });
        const approvalAudit=this.buildApprovalAuditRecord({operation,ctx,risk,decision});
        logOperation("approval.decision",approvalAudit,"standard");
        this.recordTurnApprovalAudit(params,approvalAudit);
        await this.sendRaw({id,result:{decision:decision.decision}});
        return;
      }
      if(method==="item/fileChange/requestApproval"||method==="fileChange/requestApproval"){
        const risk=this.classifyApprovalRisk({operation,params,sandboxMode:ctx.sandboxMode,cwd:ctx.cwd});
        const decision=this.resolveApprovalDecision({
          requestedPolicy:ctx.approvalPolicy,
          sandboxMode:ctx.sandboxMode,
          operation,
          risk,
          agentName:ctx.agentName,
          governanceOverride:ctx.governanceOverride,
          automaticApprovalReviewEnabled:ctx.automaticApprovalReviewEnabled,
        });
        const approvalAudit=this.buildApprovalAuditRecord({operation,ctx,risk,decision});
        logOperation("approval.decision",approvalAudit,"standard");
        this.recordTurnApprovalAudit(params,approvalAudit);
        await this.sendRaw({id,result:{decision:decision.decision}});
        return;
      }
      if(method==="item/tool/requestUserInput"||method==="tool/requestUserInput"){
        const risk=this.classifyApprovalRisk({operation,params,sandboxMode:ctx.sandboxMode,cwd:ctx.cwd});
        const decision=this.resolveApprovalDecision({
          requestedPolicy:ctx.approvalPolicy,
          sandboxMode:ctx.sandboxMode,
          operation,
          risk,
          agentName:ctx.agentName,
          governanceOverride:ctx.governanceOverride,
          automaticApprovalReviewEnabled:ctx.automaticApprovalReviewEnabled,
        });
        const effectiveUserInputPolicy=normalizeRequestUserInputPolicy(ctx.requestUserInputPolicy,nonInteractiveRequestUserInputPolicy);
        if(decision.decision==="decline"){
          logOperation("tool.user_input_request",{
            decision:"blocked",
            policyRequested:decision.requestedPolicy,
            policyEffective:decision.effectivePolicy,
            reason:decision.reason,
            userInputPolicy:effectiveUserInputPolicy,
          },"standard");
          await this.sendRaw({id,error:{code:-32004,message:"interactive user input is unavailable in this harness"}});
          return;
        }
        const userInputResolution=resolveNonInteractiveUserInput({policy:effectiveUserInputPolicy,params});
        if(userInputResolution.decision==="blocked"){
          logOperation("tool.user_input_request",{
            decision:"blocked_non_interactive_policy",
            policyRequested:decision.requestedPolicy,
            policyEffective:decision.effectivePolicy,
            reason:userInputResolution.reason,
            userInputPolicy:userInputResolution.policy,
            questionCount:userInputResolution.questionCount,
            answeredCount:userInputResolution.answeredCount,
            nonInteractive:decision.requestedPolicy==="never"?1:0,
          },"standard");
          await this.sendRaw({id,error:{code:-32004,message:"interactive user input is disabled in this harness (requestUserInput policy: blocked)"}});
          return;
        }
        logOperation("tool.user_input_request",{
          decision:userInputResolution.decision,
          policyRequested:decision.requestedPolicy,
          policyEffective:decision.effectivePolicy,
          reason:userInputResolution.reason,
          userInputPolicy:userInputResolution.policy,
          questionCount:userInputResolution.questionCount,
          answeredCount:userInputResolution.answeredCount,
          nonInteractive:decision.requestedPolicy==="never"?1:0,
        },"standard");
        if(Array.isArray(userInputResolution.assumptions)&&userInputResolution.assumptions.length){
          logOperation("tool.user_input_assumption",{
            policy:userInputResolution.policy,
            questionCount:userInputResolution.questionCount,
            answeredCount:userInputResolution.answeredCount,
            assumptions:userInputResolution.assumptions.slice(0,8).map(entry=>safeString(entry,220)),
          },"standard");
        }
        await this.sendRaw({id,result:{answers:userInputResolution.answers&&typeof userInputResolution.answers==="object"?userInputResolution.answers:{}}});
        return;
      }
      if(method==="item/tool/call"||method==="tool/call"){
        await this.handleDynamicToolCallRequest(id,params,ctx);
        return;
      }
      await this.sendRaw({id,error:{code:-32601,message:`unsupported server request: ${method}`}});
    }catch(error){
      logOperation("server.request_error",{
        method:safeString(method,120),
        err:summarizeErrorForOperationLog(error,220),
      });
    }
  }
}

const appServer=new CodexAppServerClient(workspaceRoot);
function handleSlashAgentCommand(res,argsText){
  const arg=(argsText||"").trim();
  if(!arg||arg==="list"){
    replyLocalText(res,formatAgentList());
    return true;
  }
  const tokens=arg.split(/\s+/);
  if(tokens[0]==="new"){
    const name=(tokens[1]||"").trim();
    if(!name){
      replyLocalText(res,"Usage: /agent new <name>");
      return true;
    }
    if(agentStates.has(name)){
      replyLocalText(res,`Agent already exists: ${name}`);
      return true;
    }
    getOrCreateAgentState(name);
    activeAgentName=name;
    replyLocalText(res,`Current agent: ${name}`);
    return true;
  }
  const target=arg;
  getOrCreateAgentState(target);
  activeAgentName=target;
  const state=getActiveAgentState();
  replyLocalText(res,`Current agent: ${target}\nSession=${state.sessionRef||"none"}`);
  return true;
}
function handleSlashExperimentalCommand(res,argsText){const active=getActiveAgentState();const arg=(argsText||"").trim();if(!arg||arg==="list"){replyLocalText(res,`Experimental: ${active.experimentalEnabled?"on":"off"}\nFeatures: ${formatFeatureList(active.experimentalFeatures)}\nUsage: /experimental on|off|enable <feature>|disable <feature>|clear`);return true;}const tokens=arg.split(/\s+/);const op=tokens[0].toLowerCase();const feature=(tokens[1]||"").trim();if(op==="on"){active.experimentalEnabled=true;replyLocalText(res,"Experimental: on");return true;}if(op==="off"){active.experimentalEnabled=false;replyLocalText(res,"Experimental: off");return true;}if(op==="clear"){active.experimentalFeatures.clear();replyLocalText(res,"Experimental features cleared.");return true;}if((op==="enable"||op==="disable")&&!feature){replyLocalText(res,"Usage: /experimental enable <feature> | disable <feature>");return true;}if(op==="enable"){active.experimentalFeatures.add(feature);replyLocalText(res,`Feature enabled: ${feature}`);return true;}if(op==="disable"){active.experimentalFeatures.delete(feature);replyLocalText(res,`Feature disabled: ${feature}`);return true;}if(active.experimentalFeatures.has(arg)){active.experimentalFeatures.delete(arg);replyLocalText(res,`Feature disabled: ${arg}`);return true;}active.experimentalFeatures.add(arg);replyLocalText(res,`Feature enabled: ${arg}`);return true;}
function handleSlashFastCommand(res,argsText){
  const active=getActiveAgentState();
  const arg=(argsText||"").trim().toLowerCase();
  if(!arg||arg==="toggle"){
    active.fastModeEnabled=!Boolean(active.fastModeEnabled);
    replyLocalText(res,`Fast mode: ${active.fastModeEnabled?"on":"off"}`);
    return true;
  }
  if(arg==="status"||arg==="show"||arg==="list"){
    replyLocalText(res,`Fast mode: ${active.fastModeEnabled?"on":"off"}\nUsage: /fast [on|off|toggle|status]`);
    return true;
  }
  if(arg==="on"){
    active.fastModeEnabled=true;
    replyLocalText(res,"Fast mode: on");
    return true;
  }
  if(arg==="off"){
    active.fastModeEnabled=false;
    replyLocalText(res,"Fast mode: off");
    return true;
  }
  replyLocalText(res,"Usage: /fast [on|off|toggle|status]");
  return true;
}
function handleSlashResumeCommand(res,argsText){const active=getActiveAgentState();const arg=(argsText||"").trim();if(!arg||arg==="--last"){const latest=findLatestSessionId();if(!latest){replyLocalText(res,"No saved session found.");return true;}active.sessionRef=latest;active.threadId=latest;active.activeTurnId=null;active.manualSessionPinned=true;replyLocalText(res,`Resume target set: ${latest}`);return true;}if(arg==="clear"){active.sessionRef=null;active.threadId=null;active.activeTurnId=null;active.manualSessionPinned=false;replyLocalText(res,"Resume target cleared.");return true;}if(agentStates.has(arg)){activeAgentName=arg;const switched=getActiveAgentState();replyLocalText(res,`Switched agent: ${arg}\nSession=${switched.sessionRef||"none"}`);return true;}active.sessionRef=arg;active.threadId=arg;active.activeTurnId=null;active.manualSessionPinned=true;if(looksLikeSessionId(arg)){replyLocalText(res,`Resume target set: ${arg}`);return true;}replyLocalText(res,`Resume target set (non-standard id): ${arg}`);return true;}
function buildForkedAgentState(source,sourceName){
  return{
    sessionRef:source.sessionRef||null,
    threadId:source.threadId||null,
    activeTurnId:null,
    experimentalEnabled:source.experimentalEnabled,
    experimentalFeatures:new Set(Array.from(source.experimentalFeatures||[])),
    serviceTier:normalizeCodexServiceTier(source.serviceTier,defaultCodexServiceTier),
    createdAt:Date.now(),
    forkedFrom:sourceName,
    manualSessionPinned:source.manualSessionPinned,
    lastSandboxMode:source.lastSandboxMode,
    lastWebSearch:source.lastWebSearch,
    lastCwd:source.lastCwd||null,
    lastRequestUserInputPolicy:source.lastRequestUserInputPolicy||null,
    lastModel:source.lastModel||defaultExecModelName,
    lastModelReasoningEffort:source.lastModelReasoningEffort||defaultExecModelReasoningEffort,
    lastFastModeEnabled:typeof source.lastFastModeEnabled==="boolean"?source.lastFastModeEnabled:resolveFastModeEnabled(source.fastModeEnabled),
    lastAutomaticApprovalReviewEnabled:typeof source.lastAutomaticApprovalReviewEnabled==="boolean"?source.lastAutomaticApprovalReviewEnabled:resolveAutomaticApprovalReviewEnabled(source.automaticApprovalReviewEnabled),
    lastPlanningContext:source.lastPlanningContext&&typeof source.lastPlanningContext==="object"
      ?sanitizePlanningArtifactsForRuntime(source.lastPlanningContext)
      :null,
    fastModeEnabled:resolveFastModeEnabled(source.fastModeEnabled),
    automaticApprovalReviewEnabled:resolveAutomaticApprovalReviewEnabled(source.automaticApprovalReviewEnabled),
  };
}
function handleSlashForkCommand(res,argsText){const sourceName=activeAgentName;const source=getActiveAgentState();const requestedName=(argsText||"").trim();const forkName=requestedName||`agent-${nextAgentNumber++}`;if(agentStates.has(forkName)){replyLocalText(res,`Agent already exists: ${forkName}`);return true;}agentStates.set(forkName,buildForkedAgentState(source,sourceName));activeAgentName=forkName;const copied=source.sessionRef?`Session copied: ${source.sessionRef}`:"Source agent has no session. A new thread will be created on next run.";replyLocalText(res,`Fork created: ${forkName}\nSource: ${sourceName}\n${copied}`);return true;}

function derivePreviousPlanningContextForRequest(agentState,cwd){
  const state=agentState&&typeof agentState==="object"?agentState:{};
  const currentCwd=safeString(cwd,320);
  if(!state.lastPlanningContext||typeof state.lastPlanningContext!=="object")return null;
  if(state.lastCwd&&currentCwd&&safeString(state.lastCwd,320)!==currentCwd)return null;
  return sanitizePlanningArtifactsForRuntime(state.lastPlanningContext);
}

function buildThreadStartConfig(agentState,webSearchEnabled,requestUserInputPolicy,model,modelReasoningEffort,fastModeEnabled,automaticApprovalReviewEnabled){
  const normalizedModel=normalizeExecModel(model,defaultExecModelName);
  const normalizedModelReasoningEffort=normalizeExecModelReasoningEffort(modelReasoningEffort,defaultExecModelReasoningEffort);
  const config={
    web_search:webSearchEnabled?"live":"disabled",
    model:normalizedModel,
    model_reasoning_effort:normalizedModelReasoningEffort,
  };
  const normalizedUserInputPolicy=normalizeRequestUserInputPolicy(requestUserInputPolicy,nonInteractiveRequestUserInputPolicy);
  config["harness.request_user_input_policy"]=normalizedUserInputPolicy;
  const experimentalEnabled=agentState&&typeof agentState.experimentalEnabled==="boolean"
    ?agentState.experimentalEnabled
    :defaultExperimentalFeatures.length>0;
  const experimentalFeatures=agentState&&agentState.experimentalFeatures instanceof Set
    ?agentState.experimentalFeatures
    :new Set(defaultExperimentalFeatures);
  const enabledFeatures=experimentalEnabled
    ?new Set(Array.from(experimentalFeatures||[]))
    :new Set();
  if(!resolveFastModeEnabled(fastModeEnabled,agentState&&agentState.fastModeEnabled)){
    enabledFeatures.delete(fastModeFeatureName);
  }
  if(!resolveAutomaticApprovalReviewEnabled(automaticApprovalReviewEnabled,agentState&&agentState.automaticApprovalReviewEnabled)){
    enabledFeatures.delete(automaticApprovalReviewFeatureName);
  }
  if(enabledFeatures.size){
    for(const feature of enabledFeatures){
      if(!feature)continue;
      config[`features.${feature}`]=true;
    }
  }
  if(enabledFeatures.has(fastModeFeatureName)){
    config.service_tier=normalizeCodexServiceTier(agentState&&agentState.serviceTier,defaultCodexServiceTier);
  }
  return config;
}
function shouldResetThreadForMode(agentState,sandboxMode,webSearchEnabled,cwd,requestUserInputPolicy,model,modelReasoningEffort,fastModeEnabled,automaticApprovalReviewEnabled){
  if(!agentState||!agentState.threadId||agentState.manualSessionPinned)return false;
  if(agentState.lastSandboxMode&&agentState.lastSandboxMode!==sandboxMode)return true;
  if(typeof agentState.lastWebSearch==="boolean"&&agentState.lastWebSearch!==webSearchEnabled)return true;
  if(agentState.lastCwd&&cwd&&agentState.lastCwd!==cwd)return true;
  if(agentState.lastRequestUserInputPolicy&&agentState.lastRequestUserInputPolicy!==requestUserInputPolicy)return true;
  const normalizedModel=normalizeExecModel(model,defaultExecModelName);
  if(agentState.lastModel&&agentState.lastModel!==normalizedModel)return true;
  const normalizedModelReasoningEffort=normalizeExecModelReasoningEffort(modelReasoningEffort,defaultExecModelReasoningEffort);
  if(agentState.lastModelReasoningEffort&&agentState.lastModelReasoningEffort!==normalizedModelReasoningEffort)return true;
  if(typeof agentState.lastFastModeEnabled==="boolean"&&agentState.lastFastModeEnabled!==Boolean(fastModeEnabled))return true;
  if(typeof agentState.lastAutomaticApprovalReviewEnabled==="boolean"&&agentState.lastAutomaticApprovalReviewEnabled!==Boolean(automaticApprovalReviewEnabled))return true;
  return false;
}
function clipText(value,max=12000){if(typeof value!=="string")return"";if(value.length<=max)return value;return value.slice(0,max);}
function summarizeTurnItemForStream(item,context={}){
  if(!item||typeof item!=="object")return null;
  const type=typeof item.type==="string"?item.type:"unknown";
  const id=typeof item.id==="string"?item.id:"";
  const status=typeof item.status==="string"?item.status:"";

  if(type==="agentMessage"){
    const text=safeString(item.text,400);
    return{id,type,status:status||"completed",label:"assistant message",detail:text?`assistant: ${text}`:"assistant message completed"};
  }
  if(type==="plan"){
    const text=safeString(item.text,400);
    return{id,type,status:status||"completed",label:"plan",detail:text||"plan item completed"};
  }
  if(type==="reasoning"){
    const summary=Array.isArray(item.summary)?item.summary.map((part)=>safeString(part,160)).filter(Boolean).slice(0,4):[];
    return{id,type,status:status||"completed",label:"reasoning",detail:summary.join(" / ")||"reasoning item completed"};
  }
  if(type==="commandExecution"){
    const command=safeString(item.command,300);
    const exitCode=Number.isFinite(item.exitCode)?` exit=${item.exitCode}`:"";
    const durationMs=Number.isFinite(item.durationMs)?` ${Math.max(0,Math.trunc(item.durationMs))}ms`:"";
    const detail=[command,`${status||"status=unknown"}${exitCode}${durationMs}`].filter(Boolean).join(" / ");
    return{id,type,status,label:"command execution",detail:detail||"command execution completed"};
  }
  if(type==="fileChange"){
    const statusText=status||"unknown";
    const mapped=Array.isArray(item.changes)?item.changes.map(mapFileChange).filter(Boolean):[];
    const preview=mapped.slice(0,4).map((change)=>`${change.kind}:${change.path}`);
    const detailParts=[`status=${statusText}`,`files=${mapped.length}`];
    if(preview.length)detailParts.push(preview.join(", "));
    return{id,type,status,label:"file change",detail:detailParts.join(" / ")};
  }
  if(type==="mcpToolCall"){
    const server=safeString(item.server,120);
    const tool=safeString(item.tool,120);
    const durationMs=Number.isFinite(item.durationMs)?` ${Math.max(0,Math.trunc(item.durationMs))}ms`:"";
    const detail=[server&&tool?`${server}.${tool}`:server||tool,`${status||"unknown"}${durationMs}`].filter(Boolean).join(" / ");
    return{id,type,status,label:"mcp tool",detail:detail||"mcp tool call completed"};
  }
  if(isCollabToolItemType(type)){
    const tool=safeString(item.tool,120);
    const contextReceiverIds=Array.isArray(context&&context.receiverIds)
      ?context.receiverIds.map((entry)=>safeString(entry,120)).filter(Boolean).slice(0,4)
      :[];
    const receiverThreadIds=contextReceiverIds.length
      ?contextReceiverIds
      :(Array.isArray(item.receiverThreadIds)?item.receiverThreadIds.map((entry)=>safeString(entry,120)).filter(Boolean).slice(0,4):[]);
    const receivers=receiverThreadIds.length;
    const detailParts=[tool||"collab tool",status||"unknown",`receivers=${receivers}`];
    const hintedChild=safeString(context&&context.childName,120);
    const dispatchTrace=buildAgentDispatchTrace(item,"");
    const traceChild=safeString(dispatchTrace&&dispatchTrace.child?dispatchTrace.child:"",120);
    const childName=hintedChild||traceChild;
    if(childName&&childName!=="unknown"&&!looksLikeCollabThreadId(childName)){
      detailParts.push(`child=${childName}`);
    }
    if(receiverThreadIds[0])detailParts.push(`thread=${receiverThreadIds[0]}`);
    const prompt=safeString(item.prompt,220);
    if(prompt)detailParts.push(prompt);
    const stateMessages=extractCollabStateMessages(item,2);
    if(stateMessages.length)detailParts.push(stateMessages.join(" | "));
    return{id,type,status,label:"collab agent tool",detail:detailParts.join(" / ")};
  }
  if(type==="webSearch"){
    const query=safeString(item.query,260);
    const action=item&&item.action&&typeof item.action.type==="string"?item.action.type:"";
    const detail=[query,action].filter(Boolean).join(" / ");
    return{id,type,status:status||"completed",label:"web search",detail:detail||"web search completed"};
  }
  if(type==="imageView"){
    const pathText=safeString(item.path,280);
    return{id,type,status:status||"completed",label:"image view",detail:pathText||"image view completed"};
  }
  return{id,type,status,label:type,detail:`item completed (${type})`};
}
function extractTokenUsageForStream(payload){
  if(!payload||typeof payload!=="object")return null;
  const source=payload&&payload.tokenUsage&&typeof payload.tokenUsage==="object"?payload.tokenUsage:payload;
  if(!source||typeof source!=="object")return null;
  const total=source.total&&typeof source.total==="object"?source.total:null;
  if(!total)return null;
  const toInt=(value)=>Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))):0;
  const modelContextWindow=Number.isFinite(Number(source.modelContextWindow))?Math.max(0,Math.trunc(Number(source.modelContextWindow))):null;
  return{
    totalTokens:toInt(total.totalTokens),
    inputTokens:toInt(total.inputTokens),
    cachedInputTokens:toInt(total.cachedInputTokens),
    outputTokens:toInt(total.outputTokens),
    reasoningOutputTokens:toInt(total.reasoningOutputTokens),
    modelContextWindow,
  };
}
function summarizeTurnPlanForStream(params){
  if(!params||typeof params!=="object")return null;
  const plan=Array.isArray(params.plan)?params.plan:[];
  if(!plan.length)return null;
  const steps=plan.map((step)=>{if(!step||typeof step!=="object")return null;const text=safeString(step.step,220);if(!text)return null;const status=typeof step.status==="string"?step.status:"pending";return{step:text,status};}).filter(Boolean).slice(0,16);
  if(!steps.length)return null;
  return{explanation:safeString(params.explanation,1000),steps};
}
function createTurnStreamStats(){
  return{
    itemCounts:Object.create(null),
    commandExecutions:0,
    commandFailures:0,
    fileChanges:0,
    changedFiles:0,
    mcpCalls:0,
    collabCalls:0,
    collabFailures:0,
    webSearches:0,
    sampleCommands:[],
    sampleMcpTools:[],
    sampleChangedPaths:[],
    collabOwnedReportKeys:new Set(),
    tokenUsage:null,
  };
}
function incrementTurnStreamItemCount(stats,key){
  if(!stats||!stats.itemCounts||typeof key!=="string"||!key)return;
  const current=Number(stats.itemCounts[key]||0);
  stats.itemCounts[key]=current+1;
}
function pushUniqueSample(list,value,max=3){
  const text=safeString(value,160);
  if(!Array.isArray(list)||!text)return;
  if(list.includes(text))return;
  list.push(text);
  if(list.length>max)list.splice(max);
}
function collectTurnStreamItemStats(stats,item){
  if(!stats||!item||typeof item!=="object")return;
  const type=safeString(item.type,60)||"unknown";
  incrementTurnStreamItemCount(stats,type);

  if(type==="commandExecution"){
    stats.commandExecutions+=1;
    if(item.status==="failed"||item.status==="declined"){
      stats.commandFailures+=1;
    }
    pushUniqueSample(stats.sampleCommands,item.command,3);
    return;
  }
  if(type==="fileChange"){
    stats.fileChanges+=1;
    const changes=Array.isArray(item.changes)?item.changes.map(mapFileChange).filter(Boolean):[];
    stats.changedFiles+=changes.length;
    changes.slice(0,3).forEach((change)=>pushUniqueSample(stats.sampleChangedPaths,change.path,3));
    return;
  }
  if(type==="mcpToolCall"){
    stats.mcpCalls+=1;
    const toolSummary=[safeString(item.server,60),safeString(item.tool,60)].filter(Boolean).join(".");
    pushUniqueSample(stats.sampleMcpTools,toolSummary,3);
    return;
  }
  if(isCollabToolItemType(type)){
    stats.collabCalls+=1;
    const status=safeString(item.status,40).toLowerCase();
    if(status==="failed"||status==="declined"||status==="interrupted"){
      stats.collabFailures+=1;
    }
    const ownedPaths=extractCollabOwnedPaths(item,12);
    if(ownedPaths.length){
      const receiverKey=Array.isArray(item.receiverThreadIds)
        ?item.receiverThreadIds.map((entry)=>safeString(entry,120)).filter(Boolean).sort().join("|")
        :"";
      const reportKey=`${receiverKey}::${ownedPaths.map((entry)=>normalizeMergePath(entry)).sort().join("|")}`;
      if(reportKey&&stats.collabOwnedReportKeys instanceof Set&&!stats.collabOwnedReportKeys.has(reportKey)){
        stats.collabOwnedReportKeys.add(reportKey);
        stats.fileChanges+=1;
        stats.changedFiles+=ownedPaths.length;
        ownedPaths.slice(0,3).forEach((ownedPath)=>pushUniqueSample(stats.sampleChangedPaths,ownedPath,3));
      }
    }
    return;
  }
  if(type==="webSearch"){
    stats.webSearches+=1;
  }
}
function firstNonEmptyString(candidates,max=120){
  if(!Array.isArray(candidates))return"";
  for(const candidate of candidates){
    if(typeof candidate==="number"&&Number.isFinite(candidate)){
      const numericText=safeString(String(candidate),max);
      if(numericText)return numericText;
      continue;
    }
    const text=safeString(candidate,max);
    if(text)return text;
  }
  return"";
}
function firstObject(candidates){
  if(!Array.isArray(candidates))return null;
  for(const candidate of candidates){
    if(candidate&&typeof candidate==="object"&&!Array.isArray(candidate))return candidate;
  }
  return null;
}
function summarizeDispatchItems(items,max=460){
  if(!Array.isArray(items)||!items.length)return"";
  const samples=[];
  for(const item of items){
    if(!item||typeof item!=="object")continue;
    const sample=firstNonEmptyString([
      item.text,
      item.message,
      item.prompt,
      item.name,
      item.path,
      item.type,
    ],180);
    if(!sample)continue;
    samples.push(sample);
    if(samples.length>=3)break;
  }
  if(!samples.length)return"";
  const combined=samples.join(" | ");
  return combined.length<=max?combined:combined.slice(0,max);
}
function buildAgentDispatchTrace(item,parentAgentName){
  if(!item||typeof item!=="object")return null;
  if(!isCollabToolItemType(item.type))return null;
  const args=firstObject([item.arguments,item.args,item.params,item.input,item.request,item.toolInput]);
  const toolRaw=firstNonEmptyString([item.tool,args&&args.tool],80);
  const tool=normalizeToolNameForComparison(toolRaw);
  const child=firstNonEmptyString([
    item.child,
    item.childAgent,
    item.childAgentName,
    item.agentType,
    item.agent_type,
    args&&args.agent_type,
    args&&args.agentType,
    args&&args.child,
    args&&args.childAgent,
    args&&args.child_agent,
    args&&args.role,
    args&&args.name,
    Array.isArray(item.receiverThreadIds)?item.receiverThreadIds[0]:"",
  ],120);
  const task=firstNonEmptyString([
    item.task,
    item.prompt,
    item.message,
    item.instructions,
    args&&args.task,
    args&&args.prompt,
    args&&args.message,
    args&&args.instructions,
  ],460)||summarizeDispatchItems(args&&args.items,460);
  const receiverThreadIds=Array.isArray(item.receiverThreadIds)
    ?item.receiverThreadIds.map((id)=>safeString(id,120)).filter(Boolean).slice(0,3)
    :[];
  const isDispatch=tool==="spawnagent"
    ||Boolean(firstNonEmptyString([item.agent_type,item.agentType,args&&args.agent_type,args&&args.agentType],40));
  if(!isDispatch)return null;
  return{
    parent:safeString(parentAgentName,80)||"unknown",
    child:child||"unknown",
    task:task||"",
    tool:toolRaw||"spawnAgent",
    item_id:safeString(item.id,120)||"",
    receivers:receiverThreadIds.length,
    receiver_threads:receiverThreadIds,
  };
}
function buildDispatchTraceKey(trace){
  if(!trace||typeof trace!=="object")return"";
  const direct=safeString(trace.item_id,160);
  if(direct)return direct;
  const parts=[
    safeString(trace.tool,80),
    safeString(trace.child,120),
    safeString(trace.task,180),
    safeString(String(trace.receivers||0),20),
  ];
  return parts.join("|");
}
function extractSkillTokensFromText(text,max=12){
  const source=safeString(text,12000);
  if(!source)return[];
  const matched=source.match(/\$[a-z0-9][a-z0-9._-]*/ig)||[];
  const tokens=[];
  for(const entry of matched){
    const normalized=safeString(entry,80).toLowerCase();
    if(!normalized||tokens.includes(normalized))continue;
    tokens.push(normalized);
    if(tokens.length>=max)break;
  }
  return tokens;
}
function uniquePathList(values,max=16){
  const unique=[];
  for(const value of Array.isArray(values)?values:[]){
    const normalized=normalizeOwnedPathCandidate(value);
    if(!normalized)continue;
    const key=normalizeMergePath(normalized);
    if(unique.some((entry)=>normalizeMergePath(entry)===key))continue;
    unique.push(normalized);
    if(unique.length>=max)break;
  }
  return unique;
}
function extractCollabReceiverThreadIds(item,max=4){
  if(!item||typeof item!=="object"||!Array.isArray(item.receiverThreadIds))return[];
  const receiverIds=[];
  const seen=new Set();
  for(const rawId of item.receiverThreadIds){
    const normalizedId=safeString(rawId,120);
    if(!normalizedId||seen.has(normalizedId))continue;
    seen.add(normalizedId);
    receiverIds.push(normalizedId);
    if(receiverIds.length>=max)break;
  }
  return receiverIds;
}
function inferCollabRoleSignals({promptText="",child="",stateMessages=[]}={}){
  const promptLower=safeString(promptText,12000).toLowerCase();
  const childLower=safeString(child,240).toLowerCase();
  const reviewerPromptHint=
    promptLower.includes("you are the independent reviewer")
    ||promptLower.includes("you are an independent reviewer")
    ||promptLower.includes("you are the independent read-only reviewer")
    ||promptLower.includes("you are an independent read-only reviewer")
    ||promptLower.includes("independent read-only reviewer task")
    ||promptLower.includes("independent read-only reviewer")
    ||promptLower.includes("independent read-only review only")
    ||promptLower.includes("independent read-only review")
    ||promptLower.includes("strictly read-only task")
    ||promptLower.includes("reviewer check:")
    ||promptLower.includes("review only");
  const testerPromptHint=
    promptLower.includes("you are the independent tester")
    ||promptLower.includes("you are an independent tester")
    ||promptLower.includes("you are the independent read-only tester")
    ||promptLower.includes("you are an independent read-only tester")
    ||promptLower.includes("independent read-only tester")
    ||promptLower.includes("independent read-only test check only")
    ||promptLower.includes("independent read-only test check")
    ||promptLower.includes("independent read-only verification only")
    ||promptLower.includes("independent read-only verification")
    ||promptLower.includes("strictly read-only verification task")
    ||promptLower.includes("tester check:")
    ||promptLower.includes("verification only");
  let reviewerObserved=0;
  let testerObserved=0;
  if(reviewerPromptHint)reviewerObserved=1;
  if(testerPromptHint)testerObserved=1;
  if(childLower.includes("reviewer"))reviewerObserved=1;
  if(childLower.includes("tester"))testerObserved=1;
  for(const message of Array.isArray(stateMessages)?stateMessages:[]){
    const lower=safeString(message,420).toLowerCase();
    if(!lower)continue;
    if(lower.includes("no findings")||lower.includes("finding"))reviewerObserved=1;
    if(lower.includes("test"))testerObserved=1;
    if((lower.includes("pass")||lower.includes("fail"))&&(reviewerPromptHint||childLower.includes("reviewer")||promptLower.includes("review")))reviewerObserved=1;
    if((lower.includes("pass")||lower.includes("fail"))&&(testerPromptHint||childLower.includes("tester")||promptLower.includes("verification")))testerObserved=1;
  }
  return{reviewerObserved,testerObserved};
}
function buildChildEvidenceLedger(itemRecords){
  const receiverRoleHints=new Map();
  for(const record of Array.isArray(itemRecords)?itemRecords:[]){
    const item=record&&record.item&&typeof record.item==="object"?record.item:null;
    if(!item||!isCollabToolItemType(item.type))continue;
    const receiverIds=extractCollabReceiverThreadIds(item,4);
    if(!receiverIds.length)continue;
    const trace=buildAgentDispatchTrace(item,"");
    const stateMessages=extractCollabStateMessages(item,4);
    const promptText=[
      safeString(item.prompt,1200),
      safeString(item.message,1200),
      safeString(trace&&trace.task?trace.task:"",1200),
      ...stateMessages,
    ].filter(Boolean).join("\n");
    const roleSignals=inferCollabRoleSignals({promptText,child:trace&&trace.child?trace.child:"",stateMessages});
    if(!roleSignals.reviewerObserved&&!roleSignals.testerObserved)continue;
    for(const receiverId of receiverIds){
      const existing=receiverRoleHints.get(receiverId)||{reviewerObserved:0,testerObserved:0};
      receiverRoleHints.set(receiverId,{
        reviewerObserved:existing.reviewerObserved||roleSignals.reviewerObserved?1:0,
        testerObserved:existing.testerObserved||roleSignals.testerObserved?1:0,
      });
    }
  }
  const ledger=new Map();
  for(const record of Array.isArray(itemRecords)?itemRecords:[]){
    const item=record&&record.item&&typeof record.item==="object"?record.item:null;
    if(!item||!isCollabToolItemType(item.type))continue;
    const trace=buildAgentDispatchTrace(item,"");
    const receiverIds=extractCollabReceiverThreadIds(item,4);
    const childTargets=receiverIds.length
      ?receiverIds
      :[safeString(trace&&trace.child?trace.child:"unknown",120)||"unknown"];
    const stateMessages=extractCollabStateMessages(item,4);
    const promptText=[
      safeString(item.prompt,1200),
      safeString(item.message,1200),
      safeString(trace&&trace.task?trace.task:"",1200),
      ...stateMessages,
    ].filter(Boolean).join("\n");
    const promptLower=promptText.toLowerCase();
    const localRoleSignals=inferCollabRoleSignals({
      promptText,
      child:trace&&trace.child?trace.child:"",
      stateMessages,
    });
    const ownedPaths=extractCollabOwnedPaths(item,12);
    const skillTokens=extractSkillTokensFromText(promptText,12);
    for(const child of childTargets){
      if(!ledger.has(child)){
        ledger.set(child,{
          agent:child,
          dispatchCount:0,
          completedCount:0,
          failedCount:0,
          ownedPaths:[],
          skills:[],
          evidenceNotes:[],
          reviewerObserved:0,
          testerObserved:0,
          firstSeenAt:record&&Number.isFinite(Number(record.ts))?Math.trunc(Number(record.ts)):0,
          lastSeenAt:record&&Number.isFinite(Number(record.ts))?Math.trunc(Number(record.ts)):0,
        });
      }
      const entry=ledger.get(child);
      const receiverHints=receiverRoleHints.get(child)||null;
      entry.dispatchCount+=1;
      if(item.status==="completed")entry.completedCount+=1;
      if(item.status==="failed"||item.status==="declined"||item.status==="interrupted")entry.failedCount+=1;
      entry.lastSeenAt=record&&Number.isFinite(Number(record.ts))?Math.trunc(Number(record.ts)):entry.lastSeenAt;
      entry.ownedPaths=uniquePathList([...entry.ownedPaths,...ownedPaths],16);
      entry.skills=Array.from(new Set([...entry.skills,...skillTokens])).slice(0,12);
      for(const message of stateMessages){
        const note=safeString(message,320);
        if(!note)continue;
        if(!entry.evidenceNotes.includes(note))entry.evidenceNotes.push(note);
        if(entry.evidenceNotes.length>6)entry.evidenceNotes.length=6;
      }
      if(localRoleSignals.reviewerObserved||(receiverHints&&receiverHints.reviewerObserved))entry.reviewerObserved=1;
      if(localRoleSignals.testerObserved||(receiverHints&&receiverHints.testerObserved))entry.testerObserved=1;
      if(promptLower.includes("reviewer verdict"))entry.reviewerObserved=1;
      if(promptLower.includes("explicit pass/fail verdict"))entry.testerObserved=1;
    }
  }
  return Array.from(ledger.values()).map((entry)=>({
    ...entry,
    dispatchCount:Math.max(0,Math.trunc(Number(entry.dispatchCount))),
    completedCount:Math.max(0,Math.trunc(Number(entry.completedCount))),
    failedCount:Math.max(0,Math.trunc(Number(entry.failedCount))),
    reviewerObserved:entry.reviewerObserved?1:0,
    testerObserved:entry.testerObserved?1:0,
    firstSeenAt:entry.firstSeenAt||0,
    lastSeenAt:entry.lastSeenAt||0,
  })).sort((left,right)=>left.agent.localeCompare(right.agent));
}
function buildDocSyncEvidence({prompt="",changedPaths=[],childEvidenceLedger=[],planningContext=null}={}){
  const promptText=safeString(prompt,40000).toLowerCase();
  const requirementContext=planningContext&&planningContext.requirementContract&&typeof planningContext.requirementContract==="object"
    ? planningContext.requirementContract
    : null;
  const requirementSignalText=requirementContext?[
    requirementContext.explicitGoal,
    requirementContext.implicitGoal,
    ...(Array.isArray(requirementContext.baselineScope)?requirementContext.baselineScope:[]),
    ...(Array.isArray(requirementContext.nonGoals)?requirementContext.nonGoals:[]),
    ...(Array.isArray(requirementContext.openQuestions)?requirementContext.openQuestions:[]),
    ...(Array.isArray(requirementContext.approvalBoundaryItems)?requirementContext.approvalBoundaryItems:[]),
    ...(Array.isArray(requirementContext.acceptanceChecks)?requirementContext.acceptanceChecks.map((entry)=>entry&&entry.title?entry.title:""):[]),
  ].filter((entry)=>typeof entry==="string"&&entry.trim()).join("\n").toLowerCase():"";
  const signalText=requirementSignalText||promptText;
  const childPaths=Array.isArray(childEvidenceLedger)
    ?childEvidenceLedger.flatMap((entry)=>Array.isArray(entry&&entry.ownedPaths)?entry.ownedPaths:[])
    :[];
  const allPaths=uniquePathList([...(Array.isArray(changedPaths)?changedPaths:[]),...childPaths],24);
  const architectureUpdated=allPaths.some((entry)=>normalizeMergePath(entry).endsWith("docs/current_architecture.md"));
  const changelogUpdated=allPaths.some((entry)=>normalizeMergePath(entry).endsWith("docs/architecture_changelog.md"));
  const harnessMapUpdated=allPaths.some((entry)=>{
    const normalized=normalizeMergePath(entry);
    return normalized.endsWith("harness_map.md")||normalized.endsWith("docs/harness_logging_map.md");
  });
  const docsOnly=allPaths.length>0&&allPaths.every((entry)=>{
    const normalized=normalizeMergePath(entry);
    return normalized.startsWith("docs/")||normalized.endsWith(".md");
  });
  const selectedAssuranceDepth=normalizeAssuranceMode(
    planningContext&&planningContext.selection&&planningContext.selection.selectedAssuranceDepth
      ||planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.assuranceDepth,
    "STANDARD_ASSURANCE"
  );
  const explicitDocSyncRequested=
    signalText.includes("architecture")
    ||signalText.includes("changelog")
    ||signalText.includes("docs sync")
    ||signalText.includes("harness map")
    ||signalText.includes("harness logging map");
  const signoffSensitivePrompt=signalText.includes("signoff")||signalText.includes("proof");
  const runtimeOrGovernanceChanged=allPaths.some((entry)=>{
    const normalized=normalizeMergePath(entry);
    return normalized==="server.js"
      ||normalized.startsWith("scripts/")
      ||normalized.startsWith(".codex/")
      ||normalized.startsWith("web/");
  });
  const lightAssurance=selectedAssuranceDepth==="LIGHT_ASSURANCE";
  const architectureReferenced=architectureUpdated||signalText.includes("current_architecture.md")||signalText.includes("architecture");
  const changelogReferenced=changelogUpdated||signalText.includes("architecture_changelog.md")||signalText.includes("changelog");
  const harnessMapReferenced=harnessMapUpdated
    ||signalText.includes("harness_map.md")
    ||signalText.includes("docs/harness_logging_map.md")
    ||signalText.includes("harness map")
    ||signalText.includes("harness logging map");
  const required=lightAssurance
    ?explicitDocSyncRequested
    :explicitDocSyncRequested
      ||signoffSensitivePrompt
      ||selectedAssuranceDepth==="SIGNOFF_ASSURANCE"
      ||(!docsOnly&&runtimeOrGovernanceChanged);
  const missing=[];
  const strictBundleSync=signoffSensitivePrompt||selectedAssuranceDepth==="SIGNOFF_ASSURANCE"||(!docsOnly&&runtimeOrGovernanceChanged);
  if(required){
    if(strictBundleSync||architectureReferenced){
      if(!architectureUpdated)missing.push("docs/CURRENT_ARCHITECTURE.md");
    }
    if(strictBundleSync||changelogReferenced){
      if(!changelogUpdated)missing.push("docs/ARCHITECTURE_CHANGELOG.md");
    }
    if(harnessMapReferenced&&!harnessMapUpdated)missing.push("docs/HARNESS_LOGGING_MAP.md");
  }
  return{
    required:required?1:0,
    status:!required?"SKIPPED":missing.length?"FAIL":"PASS",
    updatedPaths:allPaths.filter((entry)=>{
      const normalized=normalizeMergePath(entry);
      return normalized.endsWith("docs/current_architecture.md")
        ||normalized.endsWith("docs/architecture_changelog.md")
        ||normalized.endsWith("harness_map.md")
        ||normalized.endsWith("docs/harness_logging_map.md");
    }),
    architectureUpdated:architectureUpdated?1:0,
    changelogUpdated:changelogUpdated?1:0,
    harnessMapUpdated:harnessMapUpdated?1:0,
    missing,
  };
}
function evaluateAcceptanceCheckStatus(check,input={}){
  const source=check&&typeof check==="object"?check:{};
  const title=safeString(source.title,240);
  const lower=title.toLowerCase();
  const changedPaths=Array.isArray(input.changedPaths)?input.changedPaths:[];
  const childEvidenceLedger=Array.isArray(input.childEvidenceLedger)?input.childEvidenceLedger:[];
  if(!title)return{status:"SKIPPED",reason:"missing_title",evidence:[]};
  if(/needs[_ ]input|need[_ ]input|user decision|open question|譖匁乂|蛻､譁ｭ/.test(lower)){
    const pass=input.taskOutcomeStatus==="NEEDS_INPUT"||Boolean(input.needsInputRecommended);
    return{status:pass?"PASS":"FAIL",reason:pass?"needs_input_observed":"needs_input_missing",evidence:[safeString(input.taskOutcomeStatus,80)]};
  }
  if(/dispatch|specialist/.test(lower)){
    const pass=Number(input.observedSignals&&input.observedSignals.dispatchSuccessCount||0)>0;
    return{status:pass?"PASS":"FAIL",reason:pass?"dispatch_observed":"dispatch_missing",evidence:[String(Number(input.observedSignals&&input.observedSignals.dispatchSuccessCount||0))]};
  }
  if(/review|reviewer|findings/.test(lower)){
    const pass=childEvidenceLedger.some((entry)=>entry&&entry.reviewerObserved);
    return{status:pass?"PASS":"FAIL",reason:pass?"review_observed":"review_missing",evidence:childEvidenceLedger.filter((entry)=>entry&&entry.reviewerObserved).map((entry)=>entry.agent)};
  }
  if(/test|tester|eval|proof|verification|signoff/.test(lower)){
    const pass=childEvidenceLedger.some((entry)=>entry&&entry.testerObserved)||Number(input.observedSignals&&input.observedSignals.commandExecutions||0)>0;
    return{status:pass?"PASS":"FAIL",reason:pass?"verification_observed":"verification_missing",evidence:[String(Number(input.observedSignals&&input.observedSignals.commandExecutions||0))]};
  }
  if(/doc|architecture|changelog|harness_map|harness map|harness logging map/.test(lower)){
    const pass=input.docSyncEvidence&&input.docSyncEvidence.status==="PASS";
    return{status:pass?"PASS":"FAIL",reason:pass?"doc_sync_observed":"doc_sync_missing",evidence:Array.isArray(input.docSyncEvidence&&input.docSyncEvidence.updatedPaths)?input.docSyncEvidence.updatedPaths:[]};
  }
  if(/manifest|timeline|flow trace|evidence/.test(lower)){
    return{status:"PASS",reason:"artifact_generated",evidence:["evidence_manifest.json","stage_timeline.json","flow_trace_summary.json"]};
  }
  const pass=Number(input.observedSignals&&input.observedSignals.fileChanges||0)>0||["COMPLETED","PARTIAL","NEEDS_INPUT"].includes(safeString(input.taskOutcomeStatus,80).toUpperCase());
  return{status:pass?"PASS":"FAIL",reason:pass?"baseline_delivery_observed":"baseline_delivery_missing",evidence:changedPaths.slice(0,4)};
}
function buildAcceptanceCheckResults({requirementContract,observedSignals,taskOutcomeStatus,needsInputRecommended,docSyncEvidence,childEvidenceLedger}={}){
  const checks=Array.isArray(requirementContract&&requirementContract.acceptanceChecks)?requirementContract.acceptanceChecks:[];
  return checks.map((check)=>({
    id:safeString(check&&check.id,60)||"",
    title:safeString(check&&check.title,240)||"",
    blocking:check&&check.blocking===false?0:1,
    ...evaluateAcceptanceCheckStatus(check,{
      observedSignals,
      taskOutcomeStatus:safeString(taskOutcomeStatus,80).toUpperCase(),
      needsInputRecommended:Boolean(needsInputRecommended),
      docSyncEvidence,
      childEvidenceLedger,
      changedPaths:Array.isArray(observedSignals&&observedSignals.sampleChangedPaths)?observedSignals.sampleChangedPaths:[],
    }),
  }));
}
function firstObservedTimestamp(records,predicate){
  for(const record of Array.isArray(records)?records:[]){
    if(!record||typeof record!=="object")continue;
    if(typeof predicate==="function"&&!predicate(record))continue;
    const ts=Number(record.ts);
    if(Number.isFinite(ts)&&ts>0)return Math.trunc(ts);
  }
  return 0;
}
function minPositiveTimestamp(...values){
  const filtered=values.map((value)=>Number(value)).filter((value)=>Number.isFinite(value)&&value>0);
  if(!filtered.length)return 0;
  return Math.min(...filtered.map((value)=>Math.trunc(value)));
}
function stageEntry(name,startAt,endAt){
  const start=Number.isFinite(Number(startAt))&&Number(startAt)>0?Math.trunc(Number(startAt)):0;
  const end=Number.isFinite(Number(endAt))&&Number(endAt)>0?Math.trunc(Number(endAt)):0;
  if(!start&&!end){
    return{name,status:"SKIPPED",startedAt:0,endedAt:0,durationMs:0};
  }
  const normalizedEnd=end&&end>=start?end:start;
  return{
    name,
    status:start&&normalizedEnd>=start?"OBSERVED":"SKIPPED",
    startedAt:start,
    endedAt:normalizedEnd,
    durationMs:start&&normalizedEnd>=start?Math.max(0,normalizedEnd-start):0,
  };
}
function buildStageTimeline({startedAt,completedAt,streamEvents,itemRecords,planningContext,docSyncEvidence,childEvidenceLedger}={}){
  const items=Array.isArray(itemRecords)?itemRecords:[];
  const events=Array.isArray(streamEvents)?streamEvents:[];
  const firstPlanAt=firstObservedTimestamp(events,(entry)=>entry.type==="plan");
  const firstDispatchAt=firstObservedTimestamp(items,(entry)=>Boolean(buildAgentDispatchTrace(entry.item,"")));
  const firstWorkAt=firstObservedTimestamp(items,(entry)=>{
    const item=entry&&entry.item&&typeof entry.item==="object"?entry.item:{};
    return item.type==="commandExecution"||item.type==="fileChange"||item.type==="mcpToolCall";
  });
  const firstReviewAt=firstObservedTimestamp(items,(entry)=>{
    const item=entry&&entry.item&&typeof entry.item==="object"?entry.item:{};
    const trace=buildAgentDispatchTrace(item,"");
    const child=safeString(trace&&trace.child,80).toLowerCase();
    const notes=extractCollabStateMessages(item,3).join(" ").toLowerCase();
    return child.includes("reviewer")||notes.includes("no findings")||notes.includes("finding");
  });
  const firstTesterAt=firstObservedTimestamp(items,(entry)=>{
    const item=entry&&entry.item&&typeof entry.item==="object"?entry.item:{};
    const trace=buildAgentDispatchTrace(item,"");
    const child=safeString(trace&&trace.child,80).toLowerCase();
    const notes=extractCollabStateMessages(item,3).join(" ").toLowerCase();
    return child.includes("tester")||notes.includes("pass")||notes.includes("test");
  });
  const firstDocSyncAt=firstObservedTimestamp(items,(entry)=>{
    const item=entry&&entry.item&&typeof entry.item==="object"?entry.item:{};
    const paths=item.type==="fileChange"
      ?Array.isArray(item.changes)?item.changes.map((change)=>change&&change.path?change.path:""):[]
      :extractCollabOwnedPaths(item,8);
    return paths.some((pathValue)=>{
      const normalized=normalizeMergePath(pathValue);
      return normalized.endsWith("docs/current_architecture.md")
        ||normalized.endsWith("docs/architecture_changelog.md")
        ||normalized.endsWith("harness_map.md")
        ||normalized.endsWith("docs/harness_logging_map.md");
    });
  });
  const retryAt=firstObservedTimestamp(events,(entry)=>entry.type==="activity"&&/retry/i.test(safeString(entry.label,80)));
  const retryLoopCount=events.filter((entry)=>entry&&entry.type==="activity"&&/retry/i.test(safeString(entry.label,80))).length;
  const finalMessageAt=firstObservedTimestamp(items,(entry)=>{
    const item=entry&&entry.item&&typeof entry.item==="object"?entry.item:{};
    return item.type==="agentMessage"&&typeof item.text==="string";
  });
  const step1End=minPositiveTimestamp(firstPlanAt,firstDispatchAt,firstWorkAt,completedAt)||completedAt;
  const step2Start=step1End||startedAt;
  const step2End=minPositiveTimestamp(firstDispatchAt,firstWorkAt,completedAt)||completedAt;
  const step3Start=minPositiveTimestamp(firstDispatchAt,firstWorkAt);
  const step4Start=minPositiveTimestamp(firstReviewAt,firstTesterAt,firstDocSyncAt,retryAt,finalMessageAt,completedAt);
  const step3End=step3Start?Math.max(step3Start,minPositiveTimestamp(step4Start,finalMessageAt,completedAt)||completedAt):0;
  const step5Start=minPositiveTimestamp(finalMessageAt,completedAt)||completedAt;
  return{
    schema:"stage-timeline.v1",
    generatedAt:toIsoTimestamp(Date.now()),
    selectedPlanningMode:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedMode,40)||"NORMAL",
    selectedPlanningDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedPlanningDepth,60)||"STANDARD_PLANNING",
    selectedAssuranceDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedAssuranceDepth,60)||"STANDARD_ASSURANCE",
    flowPath:safeString(planningContext&&planningContext.selection&&planningContext.selection.flowPath,80)||"NORMAL_PATH",
    executionFlow:safeString(planningContext&&planningContext.selection&&planningContext.selection.executionFlow,120)||"",
    confidence:"estimated_from_runtime_events",
    stages:[
      stageEntry("Step 1 - Requirement Structuring",startedAt,step1End),
      stageEntry("Step 2 - Dispatch Planning",step2Start,step2End),
      stageEntry("Step 3 - Specialist Execution",step3Start,step3End),
      stageEntry("Step 4 - Quality Gate",step4Start,step5Start||completedAt),
      stageEntry("Step 5 - Final Outcome",step5Start,completedAt),
    ],
    checkpoints:{
      firstPlanAt:firstPlanAt||0,
      firstDispatchAt:firstDispatchAt||0,
      firstWorkAt:firstWorkAt||0,
      step4StartedAt:step4Start||0,
      step5StartedAt:step5Start||0,
      firstReviewAt:firstReviewAt||0,
      firstTesterAt:firstTesterAt||0,
      firstDocSyncAt:firstDocSyncAt||0,
      retryAt:retryAt||0,
      retryLoopCount,
      finalMessageAt:finalMessageAt||0,
      completedAt:Number.isFinite(Number(completedAt))?Math.trunc(Number(completedAt)):0,
    },
    qualityGate:{
      reviewerObserved:Array.isArray(childEvidenceLedger)&&childEvidenceLedger.some((entry)=>entry&&entry.reviewerObserved)?1:0,
      testerObserved:Array.isArray(childEvidenceLedger)&&childEvidenceLedger.some((entry)=>entry&&entry.testerObserved)?1:0,
      docSyncStatus:safeString(docSyncEvidence&&docSyncEvidence.status,20)||"SKIPPED",
    },
  };
}
function extractPlanningStatusDirective(text){
  const matched=safeString(text,8000).match(/STATUS:\s*([A-Z_]+)/i);
  if(!matched||!matched[1])return"";
  const normalized=safeString(matched[1],80).toUpperCase();
  if(normalized==="NEED_USER_INPUT"||normalized==="NEEDS_INPUT")return"NEEDS_INPUT";
  if(normalized==="REQUIREMENTS_READY")return"REQUIREMENTS_READY";
  if(normalized==="COMPLETED"||normalized==="OVER_DELIVERED_OR_COMPLETED")return"COMPLETED";
  return normalized;
}
function stripPlanningStatusDirective(text){
  return safeString(text,8000)
    .replace(/(?:^|\r?\n)STATUS:\s*[A-Z_]+\s*(?=\r?\n|$)/ig,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .trim();
}
function leadContainsCompletionClaim(text){
  const lead=safeString(text,320);
  if(!lead)return false;
  return /(?:\b(?:done|fixed|completed|resolved|implemented|shipped|reflected)\b|修正済み|反映済み|対応済み|完了(?:しました|です)?|解消(?:しました|です)?|直しました|できました|問題ありません)/i.test(lead);
}
function stripLeadingCompletionClaim(text){
  return safeString(text,8000)
    .replace(/^(?:\s*(?:yes|ok|okay|はい)[。.!?\s]*)?(?:(?:今回|この(?:件|修正|変更)|the (?:fix|change|update)|this (?:fix|change|update))[^。\n]{0,60})?(?:修正済みです|反映済みです|対応済みです|完了しました|完了です|解消しました|直しました|できました|done|fixed|completed|resolved|implemented|shipped|reflected)(?:[。.!]|\s)*/i,"")
    .trim();
}
function rewriteClientFinalTextForOutcome(text,{taskOutcomeStatus="",prompt=""}={}){
  const stripped=stripUnsolicitedClosingProposal({
    prompt,
    answer:stripPlanningStatusDirective(text),
    taskOutcomeStatus,
    responseContract:userFacingResponseContract,
  });
  const outcome=safeString(taskOutcomeStatus,40).toUpperCase();
  if(!stripped||!outcome||outcome==="COMPLETED"||!leadContainsCompletionClaim(stripped)){
    return stripped;
  }
  const softened=stripLeadingCompletionClaim(stripped);
  const lead=
    outcome==="FAILED_VALIDATION"
      ?"未完了です。必要な確認または証拠がまだ不足しています。"
      :outcome==="NEEDS_INPUT"
        ?"未完了です。ユーザー判断が必要です。"
        :outcome==="PARTIAL"
          ?"一部のみ完了です。"
          :"未完了です。";
  return softened?`${lead}\n\n${softened}`:lead;
}
function buildFlowTraceSummary({planningContext,observedSignals,parentDispatchGuard,taskOutcomeStatus,taskOutcomeReason,finalStatus,childEvidenceLedger,docSyncEvidence,acceptanceResults,familyCompletionGate=null,agentName=""}={}){
  const usedAgents=Array.from(new Set([
    safeString(agentName,80)||"",
    ...(Array.isArray(childEvidenceLedger)?childEvidenceLedger.map((entry)=>safeString(entry&&entry.agent,80)).filter(Boolean):[]),
  ])).filter(Boolean);
  const usedSkills=Array.from(new Set(
    Array.isArray(childEvidenceLedger)
      ?childEvidenceLedger.flatMap((entry)=>Array.isArray(entry&&entry.skills)?entry.skills:[])
      :[]
  )).slice(0,16);
  const passCount=Array.isArray(acceptanceResults)?acceptanceResults.filter((entry)=>entry&&entry.status==="PASS").length:0;
  const failCount=Array.isArray(acceptanceResults)?acceptanceResults.filter((entry)=>entry&&entry.status==="FAIL").length:0;
  return{
    schema:"flow-trace-summary.v1",
    generatedAt:toIsoTimestamp(Date.now()),
    selectedPlanningMode:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedMode,40)||"NORMAL",
    selectedPlanningDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedPlanningDepth,60)||"STANDARD_PLANNING",
    selectedAssuranceDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedAssuranceDepth,60)||"STANDARD_ASSURANCE",
    planningModeReasons:Array.isArray(planningContext&&planningContext.selection&&planningContext.selection.reasons)?planningContext.selection.reasons:[],
    assuranceDepthReasons:Array.isArray(planningContext&&planningContext.selection&&planningContext.selection.assuranceReasons)?planningContext.selection.assuranceReasons:[],
    flowPath:safeString(planningContext&&planningContext.selection&&planningContext.selection.flowPath,80)||"NORMAL_PATH",
    executionFlow:safeString(planningContext&&planningContext.selection&&planningContext.selection.executionFlow,120)||"",
    usedAgents,
    dispatchCount:Number.isFinite(Number(observedSignals&&observedSignals.dispatchCount))?Math.max(0,Math.trunc(Number(observedSignals.dispatchCount))):0,
    dispatchSuccessCount:Number.isFinite(Number(observedSignals&&observedSignals.dispatchSuccessCount))?Math.max(0,Math.trunc(Number(observedSignals.dispatchSuccessCount))):0,
    reviewerExecuted:Array.isArray(childEvidenceLedger)&&childEvidenceLedger.some((entry)=>entry&&entry.reviewerObserved)?1:0,
    testerExecuted:Array.isArray(childEvidenceLedger)&&childEvidenceLedger.some((entry)=>entry&&entry.testerObserved)?1:0,
    usedContracts:[
      summarizePathForOperationLog(harnessTurnContractSpecPath,220),
      summarizePathForOperationLog(taskOutcomeContractPath,220),
      summarizePathForOperationLog(planningModeContractPath,220),
      summarizePathForOperationLog(assuranceModeContractPath,220),
      familyCompletionGate&&familyCompletionGate.applies?summarizePathForOperationLog(designAcceptanceContractPath,220):"",
      summarizePathForOperationLog(planningDecisionContractSchemaPath,220),
      summarizePathForOperationLog(requirementContractSchemaPath,220),
      summarizePathForOperationLog(dispatchPlanSchemaPath,220),
    ].filter(Boolean),
    usedPolicies:[
      "AGENTS.md",
      "docs/AGENT_OPERATING_RULES.md",
      "docs/EVIDENCE_CONTRACT.md",
    ],
    usedSkills,
    finalOutcome:{
      status:safeString(finalStatus,40)||"unknown",
      taskOutcomeStatus:safeString(taskOutcomeStatus,80).toUpperCase()||"",
      taskOutcomeReason:safeString(taskOutcomeReason,120)||"",
      parentDispatchReason:safeString(parentDispatchGuard&&parentDispatchGuard.reason,120)||"",
    },
    acceptanceSummary:{
      passCount,
      failCount,
      total:Array.isArray(acceptanceResults)?acceptanceResults.length:0,
    },
    evidenceSources:["events.ndjson","items.ndjson","manifest.json","evidence_manifest.json","stage_timeline.json","flow_trace_summary.json","review_load_breakdown.json"],
    childEvidenceLedger:Array.isArray(childEvidenceLedger)?childEvidenceLedger:[],
    docSyncEvidence:docSyncEvidence&&typeof docSyncEvidence==="object"?docSyncEvidence:null,
    familyCompletionGate:familyCompletionGate&&typeof familyCompletionGate==="object"?familyCompletionGate:null,
    residualRiskSummary:Array.isArray(planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.residualRisks)
      ?planningContext.dispatchPlan.residualRisks
      :[],
  };
}
function buildReviewLoadBreakdown({planningContext,stageTimeline,childEvidenceLedger,docSyncEvidence,acceptanceResults,requiredEvidenceFailures=[],streamEvents=[]}={}){
  const timeline=stageTimeline&&typeof stageTimeline==="object"?stageTimeline:{};
  const stages=Array.isArray(timeline.stages)?timeline.stages:[];
  const qualityGate=timeline.qualityGate&&typeof timeline.qualityGate==="object"?timeline.qualityGate:{};
  const checkpoints=timeline.checkpoints&&typeof timeline.checkpoints==="object"?timeline.checkpoints:{};
  const stageDurations=Object.fromEntries(stages.map((entry)=>[safeString(entry&&entry.name,80)||"unknown",Number.isFinite(Number(entry&&entry.durationMs))?Math.max(0,Math.trunc(Number(entry.durationMs))):0]));
  const qualityGateDurationMs=Number(stageDurations["Step 4 - Quality Gate"]||0);
  const outcomeConversionTimeMs=Number(stageDurations["Step 5 - Final Outcome"]||0);
  const step4Start=Number.isFinite(Number(checkpoints.step4StartedAt))?Math.max(0,Math.trunc(Number(checkpoints.step4StartedAt))):0;
  const step5Start=Number.isFinite(Number(checkpoints.step5StartedAt))?Math.max(0,Math.trunc(Number(checkpoints.step5StartedAt))):0;
  const completedAt=Number.isFinite(Number(checkpoints.completedAt))?Math.max(0,Math.trunc(Number(checkpoints.completedAt))):0;
  const finalMessageAt=Number.isFinite(Number(checkpoints.finalMessageAt))?Math.max(0,Math.trunc(Number(checkpoints.finalMessageAt))):0;
  const retryLoopCount=Number.isFinite(Number(checkpoints.retryLoopCount))
    ?Math.max(0,Math.trunc(Number(checkpoints.retryLoopCount)))
    :Array.isArray(streamEvents)
      ?streamEvents.filter((entry)=>entry&&entry.type==="activity"&&/retry/i.test(safeString(entry.label,80))).length
      :0;
  const durationUntilNext=(start,...candidates)=>{
    const normalizedStart=Number.isFinite(Number(start))?Math.max(0,Math.trunc(Number(start))):0;
    if(!normalizedStart)return 0;
    const endCandidates=candidates
      .map((value)=>Number.isFinite(Number(value))?Math.max(0,Math.trunc(Number(value))):0)
      .filter((value)=>value>=normalizedStart);
    const next=endCandidates.length?Math.min(...endCandidates):normalizedStart;
    return Math.max(0,next-normalizedStart);
  };
  const reviewerTimeMs=durationUntilNext(checkpoints.firstReviewAt,checkpoints.firstTesterAt,checkpoints.firstDocSyncAt,step5Start,finalMessageAt,completedAt);
  const testerTimeMs=durationUntilNext(checkpoints.firstTesterAt,checkpoints.firstDocSyncAt,step5Start,finalMessageAt,completedAt);
  const docSyncVerificationTimeMs=durationUntilNext(checkpoints.firstDocSyncAt,step5Start,finalMessageAt,completedAt);
  const evidenceCollectionTimeMs=step4Start&&step5Start>=step4Start
    ?Math.max(0,step5Start-step4Start)
    :qualityGateDurationMs;
  const bottlenecks=[
    {name:"evidence_collection",durationMs:evidenceCollectionTimeMs},
    {name:"reviewer",durationMs:reviewerTimeMs},
    {name:"tester",durationMs:testerTimeMs},
    {name:"doc_sync_verification",durationMs:docSyncVerificationTimeMs},
    {name:"outcome_conversion",durationMs:outcomeConversionTimeMs},
  ].sort((left,right)=>right.durationMs-left.durationMs);
  const reviewNotes=Array.isArray(childEvidenceLedger)
    ?childEvidenceLedger.flatMap((entry)=>
      entry&&entry.reviewerObserved&&Array.isArray(entry.evidenceNotes)
        ?entry.evidenceNotes.map((note)=>`${safeString(entry.agent,80)}: ${safeString(note,240)}`)
        :[]
    ).filter(Boolean).slice(0,12)
    :[];
  const testerNotes=Array.isArray(childEvidenceLedger)
    ?childEvidenceLedger.flatMap((entry)=>
      entry&&entry.testerObserved&&Array.isArray(entry.evidenceNotes)
        ?entry.evidenceNotes.map((note)=>`${safeString(entry.agent,80)}: ${safeString(note,240)}`)
        :[]
    ).filter(Boolean).slice(0,12)
    :[];
  return{
    schema:"review-load-breakdown.v1",
    generatedAt:toIsoTimestamp(Date.now()),
    selectedPlanningDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedPlanningDepth,60)||"STANDARD_PLANNING",
    selectedAssuranceDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedAssuranceDepth,60)||"STANDARD_ASSURANCE",
    flowPath:safeString(planningContext&&planningContext.selection&&planningContext.selection.flowPath,80)||"NORMAL_PATH",
    executionFlow:safeString(planningContext&&planningContext.selection&&planningContext.selection.executionFlow,120)||"",
    timingModel:"overlapping_estimates_with_wall_clock_total",
    componentTimesMayOverlap:true,
    dominantBottleneckBasis:"largest estimated Step 4 component, even when component windows overlap",
    interpretationGuide:[
      "`totalStep4DurationMs` is the wall-clock duration of Step 4.",
      "Reviewer/tester/doc-sync component times are checkpoint-based estimates and may overlap.",
      "`dominantBottleneck` identifies the largest estimated component rather than a strict additive share of total time.",
    ],
    qualityGate:{
      reviewerRequired:planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.reviewerRequired?1:0,
      testerRequired:planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.testerRequired?1:0,
      signoffRequired:planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.signoffRequired?1:0,
      docSyncRequired:docSyncEvidence&&docSyncEvidence.required?1:0,
      dedicatedTestsRequired:planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.dedicatedTestsRequired?1:0,
      reviewerObserved:qualityGate.reviewerObserved?1:0,
      testerObserved:qualityGate.testerObserved?1:0,
      docSyncStatus:safeString(qualityGate.docSyncStatus,20)||"SKIPPED",
    },
    evidenceCollectionTimeMs,
    testerTimeMs,
    reviewerTimeMs,
    docSyncVerificationTimeMs,
    retryLoopCount,
    outcomeConversionTimeMs,
    totalStep4DurationMs:qualityGateDurationMs,
    dominantBottleneck:bottlenecks.length&&bottlenecks[0].durationMs>0?bottlenecks[0].name:"none",
    stageDurations,
    acceptanceSummary:{
      passCount:Array.isArray(acceptanceResults)?acceptanceResults.filter((entry)=>entry&&entry.status==="PASS").length:0,
      failCount:Array.isArray(acceptanceResults)?acceptanceResults.filter((entry)=>entry&&entry.status==="FAIL").length:0,
      total:Array.isArray(acceptanceResults)?acceptanceResults.length:0,
    },
    reviewerFindingSummary:reviewNotes,
    testerResultSummary:testerNotes,
    requiredEvidenceFailures:Array.isArray(requiredEvidenceFailures)?requiredEvidenceFailures.slice(0,12):[],
  };
}

async function ensureAgentThread(agentName,options){
  const state=getOrCreateAgentState(agentName);
  if(!state)throw new Error(`invalid agent: ${agentName}`);
  const sandboxMode=normalizeSandboxMode(options&&options.sandboxMode);
  const approvalPolicy=normalizeApprovalPolicy(options&&options.approvalPolicy);
  const webSearchEnabled=normalizeBooleanFlag(options&&options.webSearch);
  const model=normalizeExecModel(options&&options.model,defaultExecModelName);
  const modelReasoningEffort=normalizeExecModelReasoningEffort(options&&options.modelReasoningEffort,defaultExecModelReasoningEffort);
  const cwd=normalizeWorkingDirectory(options&&options.cwd,workspaceRoot);
  const requestUserInputPolicy=normalizeRequestUserInputPolicy(options&&options.requestUserInputPolicy,nonInteractiveRequestUserInputPolicy);
  const fastModeEnabled=resolveFastModeEnabled(options&&options.fastModeEnabled,state&&state.fastModeEnabled);
  const automaticApprovalReviewEnabled=resolveAutomaticApprovalReviewEnabled(
    options&&options.automaticApprovalReviewEnabled,
    state&&state.automaticApprovalReviewEnabled
  );
  state.fastModeEnabled=fastModeEnabled;
  state.automaticApprovalReviewEnabled=automaticApprovalReviewEnabled;

  const shouldForceReset=Boolean(options&&options.forceNewSession);
  const shouldModeReset=shouldResetThreadForMode(
    state,
    sandboxMode,
    webSearchEnabled,
    cwd,
    requestUserInputPolicy,
    model,
    modelReasoningEffort,
    fastModeEnabled,
    automaticApprovalReviewEnabled
  );
  if(shouldForceReset||shouldModeReset){
    const resetReason=shouldForceReset
      ?"force_new_session"
      :(state.lastSandboxMode&&state.lastSandboxMode!==sandboxMode
        ?"sandbox_changed"
        :(typeof state.lastWebSearch==="boolean"&&state.lastWebSearch!==webSearchEnabled
          ?"web_search_changed"
          :(state.lastCwd&&cwd&&state.lastCwd!==cwd
            ?"cwd_changed"
            :(state.lastRequestUserInputPolicy&&state.lastRequestUserInputPolicy!==requestUserInputPolicy
              ?"request_user_input_policy_changed"
              :(state.lastModel&&state.lastModel!==model
                ?"model_changed"
                :(state.lastModelReasoningEffort&&state.lastModelReasoningEffort!==modelReasoningEffort
                  ?"model_reasoning_effort_changed"
                  :"mode_reset"))))));
    logOperation("thread.reset",{
      a:safeString(agentName,80),
      reason:resetReason,
      sandbox:sandboxMode,
      approval:approvalPolicy,
      web:webSearchEnabled?1:0,
      model:safeString(model,120),
      modelReasoningEffort,
      cwd:summarizePathForOperationLog(cwd,220),
      requestUserInputPolicy,
      fastModeEnabled:fastModeEnabled?1:0,
      automaticApprovalReviewEnabled:automaticApprovalReviewEnabled?1:0,
    });
    state.sessionRef=null;
    state.threadId=null;
    state.activeTurnId=null;
    state.manualSessionPinned=false;
  }
  if(state.threadId){
    state.lastRequestUserInputPolicy=requestUserInputPolicy;
    state.lastModel=model;
    state.lastModelReasoningEffort=modelReasoningEffort;
    state.lastFastModeEnabled=fastModeEnabled;
    state.lastAutomaticApprovalReviewEnabled=automaticApprovalReviewEnabled;
    return state.threadId;
  }

  if(state.sessionRef){
    try{
      const resumed=await appServer.sendRequest("thread/resume",{threadId:state.sessionRef},45000);
      const resumedId=resumed&&resumed.thread&&typeof resumed.thread.id==="string"?resumed.thread.id:null;
      if(resumedId){
        state.threadId=resumedId;
        state.sessionRef=resumedId;
        state.lastSandboxMode=sandboxMode;
        state.lastWebSearch=webSearchEnabled;
        state.lastCwd=cwd;
        state.lastRequestUserInputPolicy=requestUserInputPolicy;
        state.lastModel=model;
        state.lastModelReasoningEffort=modelReasoningEffort;
        state.lastFastModeEnabled=fastModeEnabled;
        state.lastAutomaticApprovalReviewEnabled=automaticApprovalReviewEnabled;
        logOperation("thread.resume",{
          a:safeString(agentName,80),
          th:safeString(resumedId,120),
          sandbox:sandboxMode,
          approval:approvalPolicy,
          web:webSearchEnabled?1:0,
          model:safeString(model,120),
          modelReasoningEffort,
          cwd:summarizePathForOperationLog(cwd,220),
          requestUserInputPolicy,
          fastModeEnabled:fastModeEnabled?1:0,
          automaticApprovalReviewEnabled:automaticApprovalReviewEnabled?1:0,
        });
        return resumedId;
      }
      throw new Error("thread/resume did not return thread id");
    }catch(error){
      logOperation("thread.resume_failed",{
        a:safeString(agentName,80),
        th:safeString(state.sessionRef,120),
        err:summarizeErrorForOperationLog(error,220),
      });
      if(state.manualSessionPinned)throw new Error(`failed to resume pinned session ${state.sessionRef}: ${error.message}`);
      state.sessionRef=null;
      state.threadId=null;
      state.activeTurnId=null;
    }
  }

  const started=await appServer.sendRequest("thread/start",{cwd,approvalPolicy,sandbox:sandboxMode,config:buildThreadStartConfig(state,webSearchEnabled,requestUserInputPolicy,model,modelReasoningEffort,fastModeEnabled,automaticApprovalReviewEnabled),experimentalRawEvents:false},45000);
  const threadId=started&&started.thread&&typeof started.thread.id==="string"?started.thread.id:null;
  if(!threadId)throw new Error("thread/start did not return thread id");
  state.threadId=threadId;
  state.sessionRef=threadId;
  state.activeTurnId=null;
  state.manualSessionPinned=false;
  state.lastSandboxMode=sandboxMode;
  state.lastWebSearch=webSearchEnabled;
  state.lastCwd=cwd;
  state.lastRequestUserInputPolicy=requestUserInputPolicy;
  state.lastModel=model;
  state.lastModelReasoningEffort=modelReasoningEffort;
  state.lastFastModeEnabled=fastModeEnabled;
  state.lastAutomaticApprovalReviewEnabled=automaticApprovalReviewEnabled;
  logOperation("thread.start",{
    a:safeString(agentName,80),
    th:safeString(threadId,120),
    sandbox:sandboxMode,
    approval:approvalPolicy,
    web:webSearchEnabled?1:0,
    model:safeString(model,120),
    modelReasoningEffort,
    cwd:summarizePathForOperationLog(cwd,220),
    requestUserInputPolicy,
    fastModeEnabled:fastModeEnabled?1:0,
    automaticApprovalReviewEnabled:automaticApprovalReviewEnabled?1:0,
  });
  return threadId;
}

async function executeTurnStreaming(res,prompt,agentName,options){
  const state=getOrCreateAgentState(agentName);
  const sandboxMode=normalizeSandboxMode(options&&options.sandboxMode);
  const approvalPolicy=normalizeApprovalPolicy(options&&options.approvalPolicy);
  const webSearchEnabled=normalizeBooleanFlag(options&&options.webSearch);
  const model=normalizeExecModel(options&&options.model,defaultExecModelName);
  const modelReasoningEffort=normalizeExecModelReasoningEffort(options&&options.modelReasoningEffort,defaultExecModelReasoningEffort);
  const requestUserInputPolicy=normalizeRequestUserInputPolicy(options&&options.requestUserInputPolicy,nonInteractiveRequestUserInputPolicy);
  const cwd=normalizeWorkingDirectory(options&&options.cwd,workspaceRoot);
  const fastModeEnabled=resolveFastModeEnabled(options&&options.fastModeEnabled,state&&state.fastModeEnabled);
  const automaticApprovalReviewEnabled=resolveAutomaticApprovalReviewEnabled(
    options&&options.automaticApprovalReviewEnabled,
    state&&state.automaticApprovalReviewEnabled
  );
  state.fastModeEnabled=fastModeEnabled;
  state.automaticApprovalReviewEnabled=automaticApprovalReviewEnabled;
  const gitAutomationIgnoredPaths=isPathWithin(workspaceRoot,cwd)?gitAutomationWorkspaceIgnoredPaths:[];
  const promptSummary=summarizeTextForOperationLog(prompt,24000);
  const promptAuditSource=options&&options.promptAudit&&typeof options.promptAudit==="object"?options.promptAudit:{};
  const promptAudit={
    limit:Number.isFinite(Number(promptAuditSource.limit))?Math.max(0,Math.trunc(Number(promptAuditSource.limit))):defaultPromptCharLimit,
    inputLength:Number.isFinite(Number(promptAuditSource.inputLength))?Math.max(0,Math.trunc(Number(promptAuditSource.inputLength))):safeString(prompt,defaultPromptCharLimit).length,
    outputLength:Number.isFinite(Number(promptAuditSource.outputLength))?Math.max(0,Math.trunc(Number(promptAuditSource.outputLength))):safeString(prompt,defaultPromptCharLimit).length,
    truncated:Boolean(promptAuditSource.truncated),
  };
  const adversarialAttempt=Number.isFinite(Number(options&&options.adversarialAttempt))
    ?Math.max(0,Math.trunc(Number(options.adversarialAttempt)))
    :0;
  const adversarialRootPrompt=safeString(
    options&&typeof options.adversarialRootPrompt==="string"?options.adversarialRootPrompt:prompt,
    defaultPromptCharLimit
  );
  const parentDispatchAttempt=Number.isFinite(Number(options&&options.parentDispatchAttempt))
    ?Math.max(0,Math.trunc(Number(options.parentDispatchAttempt)))
    :0;
  const parentDispatchRootPrompt=safeString(
    options&&typeof options.parentDispatchRootPrompt==="string"?options.parentDispatchRootPrompt:prompt,
    defaultPromptCharLimit
  );
  const executionProfile=normalizeExecutionProfile(options&&options.executionProfile,runtimeExecutionProfile);
  const executionIntent=normalizeExecutionIntent(options&&options.executionIntent,"interactive");
  const planningContext=sanitizePlanningArtifactsForRuntime(
    options&&options.planningContext&&typeof options.planningContext==="object"
      ?options.planningContext
      :buildPlanningArtifacts({
        prompt,
        options:{
          ...options,
          agentName,
          sandboxMode,
          approvalPolicy,
          requestUserInputPolicy,
          fastModeEnabled,
          automaticApprovalReviewEnabled,
        },
        contract:{planning:planningModeContract,assurance:assuranceModeContract},
      })
  );
  state.lastPlanningContext=planningContext;
  const turnVisibility=buildTurnVisibilitySnapshot({
    requestProfile:executionProfile,
    executionIntent,
    requestUserInputPolicy,
    agentName,
    sandboxMode,
    approvalPolicy,
    cwd,
    model,
    modelReasoningEffort,
    webSearch:webSearchEnabled,
    executionSource:safeString(options&&options.executionSource,80)||"api_exec",
    planningContext,
  });
  const turnStats=createTurnStreamStats();

  logOperation("turn.prepare",{
    a:safeString(agentName,80),
    sandbox:sandboxMode,
    approval:approvalPolicy,
    web:webSearchEnabled?1:0,
    model:safeString(model,120),
    modelReasoningEffort,
    requestUserInputPolicy,
    fastModeEnabled:fastModeEnabled?1:0,
    automaticApprovalReviewEnabled:automaticApprovalReviewEnabled?1:0,
    cwd:summarizePathForOperationLog(cwd,220),
    prompt:promptSummary,
    promptChars:{input:promptAudit.inputLength,output:promptAudit.outputLength,truncated:promptAudit.truncated?1:0,limit:promptAudit.limit},
    images:Array.isArray(options&&options.images)?options.images.length:0,
    adversarial:{
      shadowEnabled:adversarialShadowEnabled?1:0,
      loopEnabled:adversarialShadowEnabled&&adversarialLoopEnabled?1:0,
      attempt:adversarialAttempt,
      maxRetries:adversarialLoopMaxRetries,
    },
    execution:{
      profile:turnVisibility.profile.effective,
      intent:turnVisibility.intent,
      smokeLike:turnVisibility.profile.smokeLike?1:0,
      repro:turnVisibility.profile.repro?1:0,
      recipeHash:turnVisibility&&turnVisibility.recipe?safeString(turnVisibility.recipe.hash,80):"",
      defaultsReady:turnVisibility.defaults&&turnVisibility.defaults.ready?1:0,
      turnReady:turnVisibility.turn&&turnVisibility.turn.ready?1:0,
    },
  });

  let threadId=null;
  try{
    threadId=await ensureAgentThread(agentName,{sandboxMode,approvalPolicy,webSearch:webSearchEnabled,model,modelReasoningEffort,cwd,forceNewSession:Boolean(options&&options.forceNewSession),requestUserInputPolicy,fastModeEnabled,automaticApprovalReviewEnabled});
  }catch(error){
    logOperation("turn.prepare_failed",{
      a:safeString(agentName,80),
      err:summarizeErrorForOperationLog(error,220),
    });
    replyLocalText(res,`[error] ${error.message}`);
    return;
  }

  const images=options&&Array.isArray(options.images)?options.images:[];
  const inputCandidates=buildTurnInputCandidates(prompt,images);
  if(!inputCandidates.length){
    logOperation("turn.invalid_input",{
      a:safeString(agentName,80),
      reason:"empty_prompt_and_images",
    });
    replyLocalText(res,"[error] prompt or image is required");
    return;
  }

  let turnId=null;
  let turnStartError=null;
  for(let i=0;i<inputCandidates.length;i++){
    const input=inputCandidates[i];
    try{
      const turn=await appServer.sendRequest("turn/start",{threadId,input,approvalPolicy,cwd},120000);
      turnId=turn&&turn.turn&&typeof turn.turn.id==="string"?turn.turn.id:null;
      if(!turnId)throw new Error("turn/start did not return turn id");
      turnStartError=null;
      break;
    }catch(error){
      if(isUnknownThreadError(error)&&!options.attemptedFreshFallback){
        logOperation("turn.start_retry",{
          a:safeString(agentName,80),
          th:safeString(threadId,120),
          reason:"unknown_thread",
        });
        state.sessionRef=null;
        state.threadId=null;
        state.activeTurnId=null;
        state.manualSessionPinned=false;
        executeTurnStreaming(res,prompt,agentName,{...options,cwd,forceNewSession:true,attemptedFreshFallback:true}).catch(()=>{});
        return;
      }
      turnStartError=error;
      const hasNextCandidate=i<inputCandidates.length-1;
      if(hasNextCandidate)continue;
    }
  }
  if(!turnId){
    logOperation("turn.start_failed",{
      a:safeString(agentName,80),
      th:safeString(threadId,120),
      err:summarizeErrorForOperationLog(turnStartError,220),
    });
    replyLocalText(res,`[error] ${turnStartError&&turnStartError.message?turnStartError.message:"turn/start failed"}`);
    return;
  }

  state.activeTurnId=turnId;
  logOperation("turn.start",{
    a:safeString(agentName,80),
    th:safeString(threadId,120),
    turn:safeString(turnId,120),
    sandbox:sandboxMode,
    approval:approvalPolicy,
    web:webSearchEnabled?1:0,
    model:safeString(model,120),
    modelReasoningEffort,
    prompt:promptSummary,
    requestUserInputPolicy,
  });
  const approvalAuditTrail=[];
  appServer.setTurnContext(threadId,turnId,{
    approvalPolicy,
    sandboxMode,
    cwd,
    agentName,
    model,
    modelReasoningEffort,
    requestUserInputPolicy,
    fastModeEnabled,
    automaticApprovalReviewEnabled,
    governanceOverride:options&&options.governanceOverride?options.governanceOverride:null,
    approvalAuditTrail,
  });
  const turnRecord={
    turnId,
    threadId,
    agentName,
    cwd,
    source:safeString(options&&options.executionSource,80)||"api_exec",
    executionProfile:turnVisibility.profile.effective,
    executionIntent:turnVisibility.intent,
    smokeLikeProfile:turnVisibility.profile.smokeLike?1:0,
    fullUtilizationDefaultsReady:turnVisibility.defaults&&turnVisibility.defaults.ready?1:0,
    fullUtilizationTurnReady:turnVisibility.turn&&turnVisibility.turn.ready?1:0,
    turnVisibility,
    planningContext,
    planningMode:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedMode,40)||"NORMAL",
    planningDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedPlanningDepth,60)||"STANDARD_PLANNING",
    assuranceDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedAssuranceDepth,60)||"STANDARD_ASSURANCE",
    flowPath:safeString(planningContext&&planningContext.selection&&planningContext.selection.flowPath,80)||"NORMAL_PATH",
    parentDispatchGuard:null,
    observedSignals:null,
    evidenceManifest:null,
    evidenceManifestPath:null,
    stageTimeline:null,
    stageTimelinePath:null,
    flowTraceSummary:null,
    flowTraceSummaryPath:null,
    planningDecisionContractPath:null,
    reviewLoadBreakdown:null,
    reviewLoadBreakdownPath:null,
    artifactDir:null,
    artifactManifestPath:null,
    artifactManifestSha256:null,
    status:"in_progress",
    startedAt:nowTs(),
    completedAt:null,
    turnStatusTerminal:null,
    turnTerminalEvent:null,
    taskOutcomeStatus:"",
    taskOutcomeReason:"",
    turnError:null,
    gitAutomation:null,
    gitAutomationBaseline:null,
    updatedAt:nowTs(),
  };
  if(gitAutomationConfig.enabled){
    try{
      turnRecord.gitAutomationBaseline=captureGitRepoState({
        cwd,
        remoteName:gitAutomationConfig.remoteName,
        timeoutMs:gitAutomationConfig.commandTimeoutMs,
        ignoredPaths:gitAutomationIgnoredPaths,
      });
    }catch(error){
      turnRecord.gitAutomationBaseline={
        cwd,
        gitAvailable:0,
        repoDetected:0,
        dirty:0,
        reason:error&&error.message?error.message:String(error),
        entries:[],
        changedPaths:[],
        branch:"",
        detachedHead:0,
        remoteName:gitAutomationConfig.remoteName,
        remoteConfigured:0,
        remoteUrl:"",
      };
    }
  }
  publishLatestTurnSnapshot(turnRecord,"turn_started");
  startSessionPerformanceTurn(threadId,turnId,agentName,turnRecord.startedAt);
  const artifactRecorder=createTurnArtifactRecorder({
    turnId,
    threadId,
    agentName,
    prompt,
    sandboxMode,
    approvalPolicy,
    cwd,
    idempotencyKey:safeString(options&&options.idempotencyKey?options.idempotencyKey:"",200),
    executionMeta:turnVisibility,
  });
  if(artifactRecorder&&typeof artifactRecorder.writeEvent==="function"){
    artifactRecorder.writeEvent("turn.context",{
      webSearch:webSearchEnabled?1:0,
      imageCount:images.length,
      attemptedFreshFallback:options&&options.attemptedFreshFallback?1:0,
      forceNewSession:options&&options.forceNewSession?1:0,
      riskRulesVersion,
      requestUserInputPolicy,
      modelReasoningEffort,
      adversarial:{
        shadowEnabled:adversarialShadowEnabled?1:0,
        loopEnabled:adversarialShadowEnabled&&adversarialLoopEnabled?1:0,
        attempt:adversarialAttempt,
        maxRetries:adversarialLoopMaxRetries,
      },
      execution:turnVisibility,
      governanceOverride:options&&options.governanceOverride&&typeof options.governanceOverride==="object"
        ?{
          requestedBy:safeString(options.governanceOverride.requestedBy,80)||"",
          reason:safeString(options.governanceOverride.reason,240)||"",
          ticket:safeString(options.governanceOverride.ticket,120)||"",
        }
        :null,
      promptAudit:{
        limit:promptAudit.limit,
        inputLength:promptAudit.inputLength,
        outputLength:promptAudit.outputLength,
        truncated:promptAudit.truncated,
      },
      gitAutomation:{
        config:{
          enabled:gitAutomationConfig.enabled?1:0,
          autocommitEnabled:gitAutomationConfig.autocommitEnabled?1:0,
          autopushEnabled:gitAutomationConfig.autopushEnabled?1:0,
          allowDirtyBaseline:gitAutomationConfig.allowDirtyBaseline?1:0,
          remoteName:safeString(gitAutomationConfig.remoteName,120)||"origin",
        },
        baseline:snapshotGitRepoStateForRuntime(turnRecord.gitAutomationBaseline),
      },
    });
  }
  const replaySeed={
    prompt:safeString(prompt,replayPromptMaxChars),
    promptSha256:hashSha256Hex(prompt),
    sandboxMode:safeString(sandboxMode,40)||"workspace-write",
    approvalPolicy:safeString(approvalPolicy,40)||"never",
    webSearch:webSearchEnabled?1:0,
    model:safeString(model,120)||defaultExecModelName,
    modelReasoningEffort,
    agentName:safeString(agentName,120)||defaultExecAgentName,
    cwd:safeString(cwd,220)||workspaceRoot,
    requestUserInputPolicy,
    forceNewSession:options&&options.forceNewSession?1:0,
    executionProfile:turnVisibility&&turnVisibility.profile?safeString(turnVisibility.profile.effective,60):runtimeExecutionProfile,
    executionIntent:safeString(turnVisibility&&turnVisibility.intent?turnVisibility.intent:"interactive",80)||"interactive",
    executionSource:safeString(options&&options.executionSource?options.executionSource:"api_exec",80)||"api_exec",
    recipeHash:turnVisibility&&turnVisibility.recipe?safeString(turnVisibility.recipe.hash,80):"",
    planningMode:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedMode,40)||"NORMAL",
    planningDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedPlanningDepth,60)||"STANDARD_PLANNING",
    assuranceDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedAssuranceDepth,60)||"STANDARD_ASSURANCE",
    flowPath:safeString(planningContext&&planningContext.selection&&planningContext.selection.flowPath,80)||"NORMAL_PATH",
  };

  let clientClosed=false;
  let turnFinalized=false;
  let deltaText="";
  let finalTextFromItemCompleted="";
  let errorText="";
  let sawResponseStreamDisconnect=false;
  let responseStreamDisconnectDetail="";
  let disconnectFinalizeTimer=null;
  const dispatchTraceKeys=new Set();
  const dispatchSuccessKeys=new Set();
  const dispatchFailureKeys=new Set();
  const liveCollabTurnTracker=createLiveCollabTurnTracker({
    planningContext,
    parentAgentName:agentName,
    parentThreadId:threadId,
    parentTurnId:turnId,
  });
  let dispatchCount=0;
  let dispatchSuccessCount=0;
  let dispatchFailureCount=0;
  const observedStreamEvents=[];
  const observedItemRecords=[];
  const dispatchChildren=[];
  const pushDispatchChild=(value)=>{
    const child=safeString(value,120);
    if(!child)return;
    if(dispatchChildren.includes(child))return;
    dispatchChildren.push(child);
    if(dispatchChildren.length>8)dispatchChildren.splice(8);
  };
  const traceAgentDispatch=(item,phase)=>{
    const trace=buildAgentDispatchTrace(item,agentName);
    if(!trace)return;
    const key=buildDispatchTraceKey(trace);
    if(key&&dispatchTraceKeys.has(key))return;
    if(key)dispatchTraceKeys.add(key);
    dispatchCount+=1;
    pushDispatchChild(trace.child);
    logOperation("agent.dispatch",{phase,...trace},"standard");
  };
  const recordDispatchOutcome=(item)=>{
    const trace=buildAgentDispatchTrace(item,agentName);
    if(!trace)return;
    const key=buildDispatchTraceKey(trace);
    const status=safeString(item&&item.status,40).toLowerCase();
    const receiverCount=Array.isArray(item&&item.receiverThreadIds)?item.receiverThreadIds.length:0;
    if(status==="completed"&&receiverCount>0){
      if(key&&dispatchSuccessKeys.has(key))return;
      if(key)dispatchSuccessKeys.add(key);
      dispatchSuccessCount+=1;
      pushDispatchChild(trace.child);
      logOperation("agent.dispatch_result",{result:"success",...trace,receivers:receiverCount},"standard");
      return;
    }
    if(status==="failed"||status==="declined"||status==="interrupted"){
      if(key&&dispatchFailureKeys.has(key))return;
      if(key)dispatchFailureKeys.add(key);
      dispatchFailureCount+=1;
      pushDispatchChild(trace.child);
      logOperation("agent.dispatch_result",{result:"failed",status,...trace,receivers:receiverCount},"standard");
    }
  };

  const canWrite=()=>!clientClosed&&!res.writableEnded&&!res.destroyed&&!(res.socket&&res.socket.destroyed);
  const safeWriteRaw=(text)=>{
    if(typeof text!=="string"||!text.length)return;
    if(!canWrite())return;
    try{
      res.write(text);
    }catch{
      clientClosed=true;
    }
  };
  const safeWriteEvent=(event)=>{
    if(!event||typeof event!=="object")return;
    observedStreamEvents.push({ts:Date.now(),...event});
    if(observedStreamEvents.length>600)observedStreamEvents.shift();
    if(artifactRecorder&&typeof artifactRecorder.writeStreamEvent==="function"){
      artifactRecorder.writeStreamEvent(event);
    }
    try{
      safeWriteRaw(`${JSON.stringify(event)}\n`);
    }catch{
      clientClosed=true;
    }
  };

  safeWriteEvent({type:"turn",phase:"started",agentName,threadId,turnId});
  const operatorPlanEvent=buildOperatorPlanEvent({planningContext,agentName});
  if(operatorPlanEvent){
    safeWriteEvent(operatorPlanEvent);
  }
  if(promptAudit.truncated){
    const detail=`prompt truncated by harness (${promptAudit.outputLength}/${promptAudit.inputLength} chars, limit=${promptAudit.limit})`;
    safeWriteEvent({type:"activity",label:"prompt_truncated",detail});
    if(artifactRecorder&&typeof artifactRecorder.writeEvent==="function"){
      artifactRecorder.writeEvent("turn.prompt_truncated",{detail,promptAudit});
    }
  }

  const clearDisconnectTimer=()=>{
    if(disconnectFinalizeTimer){
      clearTimeout(disconnectFinalizeTimer);
      disconnectFinalizeTimer=null;
    }
  };

  const finalizeTurn=(maybeErrorText,turnStatus="unknown")=>{
    if(turnFinalized)return;
    turnFinalized=true;
    clearDisconnectTimer();
    cleanup();
    clearLiveCollabChildActivityForTurn(turnId);
    state.activeTurnId=null;
    const normalizedStatus=normalizeExecutionState(turnStatus,{terminalFallback:true});
    let finalStatus=normalizedStatus==="in_progress"?"failed":normalizedStatus;
    let finalErrorText=safeString(maybeErrorText||errorText,4000);
    const debugFinalize=(step)=>{
      if(!debugFinalizeSteps)return;
      console.log(`[turn-finalize] ${step} turn=${turnId} thread=${threadId} status=${finalStatus}`);
    };
    turnRecord.status=finalStatus;
    setTurnTerminalState(turnRecord,finalStatus,{terminalEvent:"turn/completed",errorText:finalErrorText});
    debugFinalize("after_initial_terminal_state");
    publishLatestTurnSnapshot(turnRecord,"turn_completed");
    const itemCounts=Object.entries(turnStats.itemCounts||{}).slice(0,20).reduce((acc,[key,value])=>{acc[key]=value;return acc;},{});
    const usage=turnStats.tokenUsage&&typeof turnStats.tokenUsage==="object"?{
      totalTokens:Number.isFinite(Number(turnStats.tokenUsage.totalTokens))?Math.max(0,Math.trunc(Number(turnStats.tokenUsage.totalTokens))):0,
      inputTokens:Number.isFinite(Number(turnStats.tokenUsage.inputTokens))?Math.max(0,Math.trunc(Number(turnStats.tokenUsage.inputTokens))):0,
      outputTokens:Number.isFinite(Number(turnStats.tokenUsage.outputTokens))?Math.max(0,Math.trunc(Number(turnStats.tokenUsage.outputTokens))):0,
      reasoningOutputTokens:Number.isFinite(Number(turnStats.tokenUsage.reasoningOutputTokens))?Math.max(0,Math.trunc(Number(turnStats.tokenUsage.reasoningOutputTokens))):0,
      modelContextWindow:Number.isFinite(Number(turnStats.tokenUsage.modelContextWindow))?Math.max(0,Math.trunc(Number(turnStats.tokenUsage.modelContextWindow))):null,
    }:null;
    const observedSignals=normalizeObservedTurnSignals({
      itemCounts,
      commandExecutions:turnStats.commandExecutions,
      commandFailures:turnStats.commandFailures,
      fileChanges:turnStats.fileChanges,
      changedFiles:turnStats.changedFiles,
      sampleChangedPaths:turnStats.sampleChangedPaths,
      mcpCalls:turnStats.mcpCalls,
      collabCalls:turnStats.collabCalls,
      collabFailures:turnStats.collabFailures,
      webSearches:turnStats.webSearches,
      dispatchCount,
      dispatchSuccessCount,
      dispatchFailureCount,
      dispatchChildren,
    });
    debugFinalize("after_observed_signals");
    const parentDispatchGuard=evaluateParentDispatchGuard({
      mode:parentDispatchGuardMode,
      parentAgents:Array.from(parentAgentNames.values()),
      agentName,
      executionProfile:turnVisibility.profile.effective,
      finalStatus,
      fileChanges:turnStats.fileChanges,
      changedFiles:turnStats.changedFiles,
      commandExecutions:turnStats.commandExecutions,
      mcpCalls:turnStats.mcpCalls,
      dispatchCount,
      dispatchSuccessCount,
      dispatchFailureCount,
      collabCalls:turnStats.collabCalls,
      attempt:parentDispatchAttempt,
      maxRetries:parentDispatchGuardMaxRetries,
      routingDecisionPresent:Boolean(planningContext&&planningContext.requirementContract&&planningContext.dispatchPlan),
      plannedDispatchCount:Array.isArray(planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.dispatches)
        ?planningContext.dispatchPlan.dispatches.length
        :0,
      proposalOnly:Boolean(planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.proposalOnly),
    });
    debugFinalize("after_parent_dispatch_guard");
    turnRecord.parentDispatchGuard=parentDispatchGuard;
    if(parentDispatchGuard.violation&&parentDispatchGuard.mode==="warn"){
      const detail=`parent dispatch guard warning: ${parentDispatchGuard.reason||"unknown_violation"}`;
      safeWriteEvent({type:"activity",label:"parent_dispatch_guard_warn",detail});
    }
    if(parentDispatchGuard.violation&&parentDispatchGuard.mode==="enforce"){
      const enforcementError=`parent dispatch guard blocked completion (${parentDispatchGuard.reason||"dispatch_required"})`;
      if(!finalErrorText)finalErrorText=`[error] ${enforcementError}`;
      if(finalStatus==="completed"){
        finalStatus="failed";
      }
      safeWriteEvent({
        type:"activity",
        label:"parent_dispatch_guard_block",
        detail:safeString(enforcementError,1200),
      });
    }
    const authoritativeFinalText=(finalTextFromItemCompleted.trim()?finalTextFromItemCompleted:deltaText).trim();
    const planningDirective=extractPlanningStatusDirective(authoritativeFinalText||finalErrorText);
    const childEvidenceLedger=buildChildEvidenceLedger(observedItemRecords);
    debugFinalize("after_child_evidence_ledger");
    const docSyncEvidence=buildDocSyncEvidence({
      prompt,
      changedPaths:Array.isArray(observedSignals.sampleChangedPaths)?observedSignals.sampleChangedPaths:[],
      childEvidenceLedger,
      planningContext,
    });
    debugFinalize("after_doc_sync_evidence");
    const proposalOnly=Boolean(planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.proposalOnly);
    const reviewerEvidenceRequired=!proposalOnly&&Boolean(planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.reviewerRequired);
    const testerEvidenceRequired=!proposalOnly&&Boolean(planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.testerRequired);
    const dedicatedTestsRequired=!proposalOnly&&Boolean(planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.dedicatedTestsRequired);
    const missingRequiredEvidence=[];
    const reviewerObserved=childEvidenceLedger.some((entry)=>entry&&entry.reviewerObserved);
    const testerObserved=childEvidenceLedger.some((entry)=>entry&&entry.testerObserved)||observedSignals.commandExecutions>0;
    if(docSyncEvidence.required&&docSyncEvidence.status==="FAIL"){
      missingRequiredEvidence.push("doc_sync_missing");
    }
    if(reviewerEvidenceRequired&&!reviewerObserved){
      missingRequiredEvidence.push("reviewer_evidence_missing");
    }
    if(testerEvidenceRequired&&!testerObserved){
      missingRequiredEvidence.push("tester_evidence_missing");
    }
    if(dedicatedTestsRequired&&!testerObserved){
      missingRequiredEvidence.push("dedicated_test_evidence_missing");
    }
    debugFinalize("after_required_evidence_checks");
    const planningNeedsInput=shouldAutoInterruptForDiscoveryNeedsInput({
      planningDirective,
      planningContext,
      planningMode:turnRecord.planningMode,
      observedSignals,
    });
    if(planningNeedsInput&&finalStatus==="completed"){
      finalStatus="interrupted";
      if(!finalErrorText)finalErrorText="[needs_input] user decision required before implementation";
      safeWriteEvent({
        type:"activity",
        label:"planning_needs_input",
        detail:safeString(finalErrorText,1200),
      });
    }
    if(missingRequiredEvidence.length&&finalStatus==="completed"){
      finalStatus="failed";
      if(!finalErrorText)finalErrorText=`[error] missing evidence: ${missingRequiredEvidence.join(", ")}`;
      safeWriteEvent({
        type:"activity",
        label:"evidence_missing",
        detail:safeString(missingRequiredEvidence.join(", "),1200),
      });
    }
    const familyCompletionGate=evaluateFamilyCompletion({
      planningContext,
      prompt,
      changedPaths:Array.isArray(observedSignals.sampleChangedPaths)?observedSignals.sampleChangedPaths:[],
      executionSource:turnRecord.source||"streaming_exec",
      cwd,
      workspaceRoot,
      docSyncComplete:docSyncEvidence&&docSyncEvidence.status==="PASS",
      visualEvidence:null,
      dispatchChildren:Array.from(new Set([
        ...(Array.isArray(observedSignals.dispatchChildren)?observedSignals.dispatchChildren:[]),
        ...childEvidenceLedger.map((entry)=>safeString(entry&&entry.agent,80)).filter(Boolean),
      ])).filter(Boolean),
      sampleMcpTools:Array.isArray(turnStats&&turnStats.sampleMcpTools)?turnStats.sampleMcpTools:[],
      sampleCommands:Array.isArray(turnStats&&turnStats.sampleCommands)?turnStats.sampleCommands:[],
      commandExecutions:turnStats&&Number.isFinite(Number(turnStats.commandExecutions))?Number(turnStats.commandExecutions):0,
      designAcceptanceContract,
      tasteMemoryStore,
    });
    if(familyCompletionGate.applies&&familyCompletionGate.status==="failed_validation"&&finalStatus==="completed"){
      finalStatus="failed";
      if(!finalErrorText){
        finalErrorText=`[error] family completion gate failed: ${Array.isArray(familyCompletionGate.missingHard)?familyCompletionGate.missingHard.map((entry)=>safeString(entry&&entry.label,80)).filter(Boolean).join(", "):"missing required evidence"}`;
      }
      safeWriteEvent({
        type:"activity",
        label:"family_completion_gate_failed",
        detail:safeString(familyCompletionGate.summary,1200),
      });
    }
    turnRecord.status=finalStatus;
    setTurnTerminalState(turnRecord,finalStatus,{terminalEvent:"turn/completed",errorText:finalErrorText});
    debugFinalize("after_outcome_terminal_state");
    const taskOutcome=deriveTurnTaskOutcome({
      finalStatus,
      finalErrorText,
      approvalAudits:approvalAuditTrail,
      parentDispatchGuard,
      explicitStatus:planningNeedsInput
        ?"NEEDS_INPUT"
        :(familyCompletionGate.applies&&familyCompletionGate.status==="failed_validation"?"FAILED_VALIDATION":""),
      reason:planningNeedsInput
        ?(safeString(planningContext&&planningContext.selection&&planningContext.selection.signals&&planningContext.selection.signals.clarificationAction,40)==="ask_user_once"
          ?"clarification_required_before_implementation"
          :"interactive_approval_unavailable")
        :(familyCompletionGate.applies&&familyCompletionGate.status==="failed_validation"
          ?safeString(familyCompletionGate.missingHard&&familyCompletionGate.missingHard[0]&&familyCompletionGate.missingHard[0].reason,120)||"family_completion_gate_failed"
          :""),
      missingEvidence:missingRequiredEvidence.length>0,
    });
    const acceptanceResults=buildAcceptanceCheckResults({
      requirementContract:planningContext&&planningContext.requirementContract?planningContext.requirementContract:null,
      observedSignals,
      taskOutcomeStatus:taskOutcome.status,
      needsInputRecommended:planningContext&&planningContext.selection&&planningContext.selection.needsInputRecommended,
      docSyncEvidence,
      childEvidenceLedger,
      familyCompletionGate,
    });
    const evidenceSummary={
      passCount:acceptanceResults.filter((entry)=>entry&&entry.status==="PASS").length,
      failCount:acceptanceResults.filter((entry)=>entry&&entry.status==="FAIL").length,
      skippedCount:acceptanceResults.filter((entry)=>entry&&entry.status==="SKIPPED").length,
      total:acceptanceResults.length,
    };
    const stageTimeline=buildStageTimeline({
      startedAt:turnRecord.startedAt,
      completedAt:Number.isFinite(Number(turnRecord.completedAt))?turnRecord.completedAt:Date.now(),
      streamEvents:observedStreamEvents,
      itemRecords:observedItemRecords,
      planningContext,
      docSyncEvidence,
      childEvidenceLedger,
    });
    const reviewLoadBreakdown=buildReviewLoadBreakdown({
      planningContext,
      stageTimeline,
      childEvidenceLedger,
      docSyncEvidence,
      acceptanceResults,
      requiredEvidenceFailures:missingRequiredEvidence,
      streamEvents:observedStreamEvents,
    });
    const flowTraceSummary=buildFlowTraceSummary({
      planningContext,
      observedSignals,
      parentDispatchGuard,
      taskOutcomeStatus:taskOutcome.status,
      taskOutcomeReason:taskOutcome.reason,
      finalStatus,
      childEvidenceLedger,
      docSyncEvidence,
      acceptanceResults,
      familyCompletionGate,
      agentName,
    });
    debugFinalize("after_evidence_aggregation");
    const evidenceManifest={
      schema:"turn-evidence-manifest.v1",
      generatedAt:toIsoTimestamp(Date.now()),
      selectedPlanningMode:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedMode,40)||"NORMAL",
      selectedPlanningDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedPlanningDepth,60)||"STANDARD_PLANNING",
      selectedAssuranceDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedAssuranceDepth,60)||"STANDARD_ASSURANCE",
      flowPath:safeString(planningContext&&planningContext.selection&&planningContext.selection.flowPath,80)||"NORMAL_PATH",
      executionFlow:safeString(planningContext&&planningContext.selection&&planningContext.selection.executionFlow,120)||"",
      planningDecisionContract:planningContext&&planningContext.planningDecisionContract?planningContext.planningDecisionContract:null,
      requirementContract:planningContext&&planningContext.requirementContract?planningContext.requirementContract:null,
      dispatchPlan:planningContext&&planningContext.dispatchPlan?planningContext.dispatchPlan:null,
      acceptanceChecks:acceptanceResults,
      acceptanceSummary:evidenceSummary,
      docSyncEvidence,
      childEvidenceLedger,
      familyCompletionGate,
      reviewLoadBreakdown,
      residualRiskSummary:Array.from(new Set([
        ...(Array.isArray(planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.residualRisks)?planningContext.dispatchPlan.residualRisks:[]),
        ...missingRequiredEvidence,
      ])).slice(0,16),
      requiredEvidenceFailures:missingRequiredEvidence,
      evidenceSources:["events.ndjson","items.ndjson","manifest.json","evidence_manifest.json","stage_timeline.json","flow_trace_summary.json","review_load_breakdown.json"],
      finalOutcome:{
        status:finalStatus,
        taskOutcomeStatus:taskOutcome.status,
        taskOutcomeReason:taskOutcome.reason,
      },
    };
    const parentMaterialImplementationObserved=Boolean(
      observedSignals.fileChanges>0
      &&observedSignals.dispatchSuccessCount===0
      &&parentAgentNames.has(normalizeAgentName(agentName))
    );
    const currentTurnSummaryForConformance={
      turnId:turnRecord.turnId,
      threadId:turnRecord.threadId,
      selectedPlanningDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedPlanningDepth,80)||"STANDARD_PLANNING",
      selectedAssuranceDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedAssuranceDepth,80)||"STANDARD_ASSURANCE",
      changedPaths:Array.isArray(observedSignals.sampleChangedPaths)?observedSignals.sampleChangedPaths:[],
      finalOutcome:{
        status:finalStatus,
        terminalStatus:finalStatus,
        taskOutcomeStatus:taskOutcome.status,
        taskOutcomeReason:taskOutcome.reason,
      },
      implementationObserved:Boolean(observedSignals.fileChanges||observedSignals.commandExecutions||observedSignals.mcpCalls),
      dispatchSuccessCount:observedSignals.dispatchSuccessCount,
      requestUserInputPolicy:nonInteractiveRequestUserInputPolicy,
      residualRisks:Array.isArray(evidenceManifest.residualRiskSummary)?evidenceManifest.residualRiskSummary:[],
      assumptions:Array.isArray(planningContext&&planningContext.requirementContract&&planningContext.requirementContract.assumptions)
        ?planningContext.requirementContract.assumptions
        :[],
      parentMaterialImplementationObserved,
    };
    const routingDecision=buildRoutingDecision({
      selection:planningContext&&planningContext.selection?planningContext.selection:{},
      dispatchPlan:planningContext&&planningContext.dispatchPlan?planningContext.dispatchPlan:{},
      evidenceContract:loadConstitutionConfigJson("evidence_contract.json"),
    });
    const taskOutcomesArtifact=buildTaskOutcomesArtifact({
      childEvidenceLedger,
      finalOutcome:currentTurnSummaryForConformance.finalOutcome,
      acceptanceResults,
      changedPaths:currentTurnSummaryForConformance.changedPaths,
      evidenceRefs:["evidence_manifest.json","flow_trace_summary.json","review_load_breakdown.json"],
      turnId:turnRecord.turnId,
    });
    const reviewBundle=buildReviewBundle({
      acceptanceResults,
      childEvidenceLedger,
      requiredEvidenceFailures:missingRequiredEvidence,
      residualRisks:currentTurnSummaryForConformance.residualRisks,
      assumptions:currentTurnSummaryForConformance.assumptions,
      finalOutcome:currentTurnSummaryForConformance.finalOutcome,
    });
    const releaseDecision=buildReleaseDecision({
      finalOutcome:currentTurnSummaryForConformance.finalOutcome,
      reviewBundle,
      signoffRefs:["review_bundle.json","flow_trace_summary.json","review_load_breakdown.json"],
      replayBundleRefs:[safeString(turnRecord.threadId,160)],
      residualRisks:currentTurnSummaryForConformance.residualRisks,
      assumptions:currentTurnSummaryForConformance.assumptions,
      missingEvidence:missingRequiredEvidence,
      rationaleNotes:[
        `turn_status=${finalStatus}`,
        `task_outcome_status=${taskOutcome.status}`,
      ],
    });
    const conformanceReport=buildConformanceReport({
      latestRunSummary:currentTurnSummaryForConformance,
      selection:planningContext&&planningContext.selection?planningContext.selection:{},
      requirementContract:planningContext&&planningContext.requirementContract?planningContext.requirementContract:{},
      dispatchPlan:planningContext&&planningContext.dispatchPlan?planningContext.dispatchPlan:{},
      childEvidenceLedger,
      acceptanceResults,
      requiredEvidenceFailures:missingRequiredEvidence,
      evidenceRefs:["evidence_manifest.json","flow_trace_summary.json","review_load_breakdown.json","release_decision.json"],
      replayBundleRefs:[safeString(turnRecord.threadId,160)],
      rationaleNotes:[
        `turn_status=${finalStatus}`,
        `task_outcome_status=${taskOutcome.status}`,
      ],
    });
    const operatorViewSummary=buildOperatorViewSummary({
      latestRunSummary:{...currentTurnSummaryForConformance,currentPhase:"Release / Close"},
      reviewBundle,
      releaseDecision,
      conformanceReport,
      routingDecision,
    });
    const releaseDecisionValidation=validateReleaseDecisionState({
      terminalState:releaseDecision&&releaseDecision.terminal_state,
      spec:harnessTurnContractSpec,
    });
    if(!releaseDecisionValidation.ok){
      logOperation("contract.release_decision_state_violation",{
        terminalState:safeString(releaseDecision&&releaseDecision.terminal_state,80)||"unknown",
        reason:safeString(releaseDecisionValidation.reason,80)||"release_decision_state_not_allowed",
      },"core");
    }
    const taskOutcomeBridgeValidation=validateTurnTaskOutcomeContract({
      turnStatus:finalStatus,
      taskOutcomeStatus:taskOutcome.status,
      spec:harnessTurnContractSpec,
    });
    if(!taskOutcomeBridgeValidation.ok){
      logOperation("contract.turn_task_outcome_bridge_violation",{
        status:finalStatus,
        taskOutcomeStatus:taskOutcome.status,
        reason:safeString(taskOutcomeBridgeValidation.reason,80)||"task_outcome_bridge_mismatch",
        allowedStatuses:Array.isArray(taskOutcomeBridgeValidation.allowedStatuses)
          ?taskOutcomeBridgeValidation.allowedStatuses.slice(0,8)
          :[],
      },"core");
    }
    const taskOutcomeCompatibility=validateTaskOutcomeTurnCompatibility({
      turnStatus:finalStatus,
      taskOutcomeStatus:taskOutcome.status,
      spec:taskOutcomeContract,
    });
    if(!taskOutcomeCompatibility.ok){
      logOperation("contract.task_outcome_turn_state_violation",{
        status:finalStatus,
        taskOutcomeStatus:taskOutcome.status,
        reason:safeString(taskOutcomeCompatibility.reason,80)||"task_outcome_turn_state_mismatch",
        allowedStatuses:Array.isArray(taskOutcomeCompatibility.allowedStatuses)
          ?taskOutcomeCompatibility.allowedStatuses.slice(0,8)
          :[],
      },"core");
    }
    turnRecord.taskOutcomeStatus=taskOutcome.status;
    turnRecord.taskOutcomeReason=taskOutcome.reason;
    turnRecord.familyCompletionGate=familyCompletionGate;
    turnRecord.parentMaterialImplementationObserved=parentMaterialImplementationObserved?1:0;
    turnRecord.releaseDecisionState=releaseDecision&&releaseDecision.terminal_state?releaseDecision.terminal_state:"";
    turnRecord.observedSignals=observedSignals;
    turnRecord.evidenceManifest=evidenceManifest;
    turnRecord.stageTimeline=stageTimeline;
    turnRecord.flowTraceSummary=flowTraceSummary;
    turnRecord.reviewLoadBreakdown=reviewLoadBreakdown;
    turnRecord.fullUtilizationObserved=(observedSignals.collabCalls>0||observedSignals.dispatchCount>0)?1:0;
    debugFinalize("before_observed_snapshot");
    publishLatestTurnSnapshot(turnRecord,"turn_completed_observed");
    safeWriteEvent({
      type:"turn",
      phase:"completed",
      agentName,
      threadId,
      turnId,
      status:finalStatus,
      taskOutcomeStatus:taskOutcome.status,
      taskOutcomeReason:taskOutcome.reason,
    });
    rememberExecutionMemoryRecord({
      turnId,
      threadId,
      agentName,
      status:finalStatus,
      taskOutcomeStatus:taskOutcome.status,
      taskOutcomeReason:taskOutcome.reason,
      familyCompletionGate,
      planningMode:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedMode,40)||"NORMAL",
      planningDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedPlanningDepth,60)||"STANDARD_PLANNING",
      assuranceDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedAssuranceDepth,60)||"STANDARD_ASSURANCE",
      flowPath:safeString(planningContext&&planningContext.selection&&planningContext.selection.flowPath,80)||"NORMAL_PATH",
      terminalEvent:"turn/completed",
      errorText:finalErrorText,
      executionProfile:turnVisibility.profile.effective,
      executionIntent:turnVisibility.intent,
      executionSource:turnRecord.source||"streaming_exec",
      startedAt:turnRecord.startedAt,
      completedAt:turnRecord.completedAt,
      updatedAt:turnRecord.updatedAt,
      outputSha256:hashSha256Hex(authoritativeFinalText),
      outputChars:authoritativeFinalText.length,
      observedSignals,
      parentDispatchGuard,
    },{persist:false});
    debugFinalize("after_execution_memory");
    const completedAt=Number.isFinite(Number(turnRecord.completedAt))?Math.max(0,Math.trunc(Number(turnRecord.completedAt))):nowTs();
    const turnDurationMs=Math.max(0,completedAt-Number(turnRecord.startedAt||completedAt));
    finishSessionPerformanceTurn(threadId,turnId,{
      startedAt:turnRecord.startedAt,
      completedAt,
      usage,
      agentName,
    });
    logOperation("turn.final",{
      a:safeString(agentName,80),
      th:safeString(threadId,120),
      turn:safeString(turnId,120),
      status:finalStatus,
      ms:turnDurationMs,
      err:finalErrorText?safeString(finalErrorText,220):"",
      chars:{
        delta:deltaText.length,
        final:finalTextFromItemCompleted.length,
      },
      items:itemCounts,
      cmd:{count:turnStats.commandExecutions,failed:turnStats.commandFailures,samples:turnStats.sampleCommands.slice(0,3)},
      file:{count:turnStats.fileChanges,paths:turnStats.sampleChangedPaths.slice(0,3),changedFiles:turnStats.changedFiles},
      mcp:{count:turnStats.mcpCalls,samples:turnStats.sampleMcpTools.slice(0,3)},
      collab:turnStats.collabCalls,
      collabFailures:turnStats.collabFailures,
      webSearch:turnStats.webSearches,
      dispatch:{
        count:dispatchCount,
        success:dispatchSuccessCount,
        failed:dispatchFailureCount,
        children:dispatchChildren.slice(0,8),
      },
      taskOutcome:{
        status:taskOutcome.status,
        reason:taskOutcome.reason,
      },
      parentDispatchGuard,
      execution:{
        profile:turnVisibility.profile.effective,
        intent:turnVisibility.intent,
        smokeLike:turnVisibility.profile.smokeLike?1:0,
        repro:turnVisibility.profile.repro?1:0,
        recipeHash:turnVisibility&&turnVisibility.recipe?safeString(turnVisibility.recipe.hash,80):"",
        defaultsReady:turnVisibility.defaults&&turnVisibility.defaults.ready?1:0,
        turnReady:turnVisibility.turn&&turnVisibility.turn.ready?1:0,
        observed:turnRecord.fullUtilizationObserved?1:0,
      },
      usage,
    });
    if(gitAutomationConfig.enabled){
      let gitAutomationResult=null;
      try{
        gitAutomationResult=runGitAutomationForTurn({
          config:{
            ...gitAutomationConfig,
            ignoredPaths:gitAutomationIgnoredPaths,
          },
          cwd,
          baseline:turnRecord.gitAutomationBaseline,
          finalStatus,
          taskOutcomeStatus:taskOutcome.status,
          taskOutcomeReason:taskOutcome.reason,
          turnId,
          threadId,
          agentName,
          executionProfile:turnVisibility.profile.effective,
          executionIntent:turnVisibility.intent,
          executionSource:turnRecord.source||"streaming_exec",
        });
      }catch(error){
        gitAutomationResult={
          mode:"completed-turn",
          status:"failed",
          reason:"unexpected_git_automation_error",
          cwd,
          repoRoot:"",
          finalStatus,
          taskOutcomeStatus:taskOutcome.status,
          taskOutcomeReason:taskOutcome.reason,
          turnId,
          threadId,
          agentName,
          executionProfile:turnVisibility.profile.effective,
          executionIntent:turnVisibility.intent,
          executionSource:turnRecord.source||"streaming_exec",
          autocommitEnabled:gitAutomationConfig.autocommitEnabled?1:0,
          autopushEnabled:gitAutomationConfig.autopushEnabled?1:0,
          allowDirtyBaseline:gitAutomationConfig.allowDirtyBaseline?1:0,
          baseline:turnRecord.gitAutomationBaseline,
          current:null,
          commit:{attempted:0,status:"failed",message:"",hash:""},
          push:{attempted:0,status:"skipped",remoteName:gitAutomationConfig.remoteName,branch:""},
          startedAt:Date.now(),
          completedAt:Date.now(),
          error:error&&error.message?error.message:String(error),
        };
      }
      turnRecord.gitAutomation=gitAutomationResult;
      publishLatestGitAutomationSnapshot(gitAutomationResult);
      publishLatestTurnSnapshot(turnRecord,"turn_git_automation");
      if(artifactRecorder&&typeof artifactRecorder.writeEvent==="function"){
        artifactRecorder.writeEvent("turn.git_automation",snapshotGitAutomationResult(gitAutomationResult));
      }
      const gitAutomationDetail=formatGitAutomationActivityDetail(gitAutomationResult);
      if(gitAutomationDetail){
        safeWriteEvent({type:"activity",label:"git_automation",detail:gitAutomationDetail});
      }
      logOperation("turn.git_automation",{
        a:safeString(agentName,80),
        th:safeString(threadId,120),
        turn:safeString(turnId,120),
        status:safeString(gitAutomationResult&&gitAutomationResult.status,80)||"unknown",
        reason:safeString(gitAutomationResult&&gitAutomationResult.reason,120)||"",
        repoRoot:summarizePathForOperationLog(gitAutomationResult&&gitAutomationResult.repoRoot,220),
        commit:gitAutomationResult&&gitAutomationResult.commit&&typeof gitAutomationResult.commit==="object"
          ?{
            status:safeString(gitAutomationResult.commit.status,40)||"skipped",
            hash:safeString(gitAutomationResult.commit.hash,40)||"",
          }
          :{status:"skipped",hash:""},
        push:gitAutomationResult&&gitAutomationResult.push&&typeof gitAutomationResult.push==="object"
          ?{
            status:safeString(gitAutomationResult.push.status,40)||"skipped",
            remoteName:safeString(gitAutomationResult.push.remoteName,80)||"",
            branch:safeString(gitAutomationResult.push.branch,80)||"",
          }
          :{status:"skipped",remoteName:"",branch:""},
      },"standard");
    }
    if(artifactRecorder&&typeof artifactRecorder.finalize==="function"){
      const artifactResult=artifactRecorder.finalize({
        status:finalStatus,
        errorText:finalErrorText,
        completedAt:completedAt,
        approvalAudits:approvalAuditTrail,
        observedSignals,
        taskOutcomeStatus:taskOutcome.status,
        taskOutcomeReason:taskOutcome.reason,
        planningContext,
        planningDecisionContract:planningContext&&planningContext.planningDecisionContract?planningContext.planningDecisionContract:null,
        requirementContract:planningContext&&planningContext.requirementContract?planningContext.requirementContract:null,
        dispatchPlan:planningContext&&planningContext.dispatchPlan?planningContext.dispatchPlan:null,
        evidenceManifest,
        stageTimeline,
        flowTraceSummary,
        reviewLoadBreakdown,
        requestFrame:conformanceReport&&conformanceReport.requestFrame?conformanceReport.requestFrame:null,
        routingDecision,
        taskOutcomes:taskOutcomesArtifact,
        reviewBundle,
        releaseDecision,
        discoveryOutcome:conformanceReport&&conformanceReport.discoveryOutcome?conformanceReport.discoveryOutcome:null,
        conformanceReport,
        operatorViewSummary,
      });
      if(artifactResult){
        turnRecord.artifactDir=artifactResult.dir||null;
        turnRecord.artifactManifestPath=artifactResult.manifest||null;
        turnRecord.artifactManifestSha256=artifactResult.manifestSha256||null;
        turnRecord.artifactPromptSha256=artifactResult.promptSha256||null;
        turnRecord.evidenceManifestPath=artifactResult.evidenceManifestPath||null;
        turnRecord.stageTimelinePath=artifactResult.stageTimelinePath||null;
        turnRecord.flowTraceSummaryPath=artifactResult.flowTraceSummaryPath||null;
        turnRecord.planningDecisionContractPath=artifactResult.planningDecisionContractPath||null;
        turnRecord.reviewLoadBreakdownPath=artifactResult.reviewLoadBreakdownPath||null;
        turnRecord.requestFramePath=artifactResult.requestFramePath||null;
        turnRecord.routingDecisionPath=artifactResult.routingDecisionPath||null;
        turnRecord.taskOutcomesPath=artifactResult.taskOutcomesPath||null;
        turnRecord.reviewBundlePath=artifactResult.reviewBundlePath||null;
        turnRecord.releaseDecisionPath=artifactResult.releaseDecisionPath||null;
        turnRecord.conformanceReportPath=artifactResult.conformanceReportPath||null;
        turnRecord.operatorViewSummaryPath=artifactResult.operatorViewSummaryPath||null;
        turnRecord.releaseDecisionState=releaseDecision&&releaseDecision.terminal_state?releaseDecision.terminal_state:null;
        rememberExecutionMemoryRecord({
          turnId,
          threadId,
          agentName,
          status:finalStatus,
          taskOutcomeStatus:taskOutcome.status,
          taskOutcomeReason:taskOutcome.reason,
          planningMode:turnRecord.planningMode,
          planningDepth:turnRecord.planningDepth,
          assuranceDepth:turnRecord.assuranceDepth,
          flowPath:turnRecord.flowPath,
          terminalEvent:"turn/completed",
          errorText:finalErrorText,
          executionProfile:turnVisibility.profile.effective,
          executionIntent:turnVisibility.intent,
          executionSource:turnRecord.source||"streaming_exec",
          startedAt:turnRecord.startedAt,
          completedAt:turnRecord.completedAt,
          updatedAt:turnRecord.updatedAt,
          outputSha256:hashSha256Hex(authoritativeFinalText),
          outputChars:authoritativeFinalText.length,
          observedSignals,
          evidenceManifestPath:artifactResult.evidenceManifestPath||"",
          stageTimelinePath:artifactResult.stageTimelinePath||"",
          flowTraceSummaryPath:artifactResult.flowTraceSummaryPath||"",
          planningDecisionContractPath:artifactResult.planningDecisionContractPath||"",
          reviewLoadBreakdownPath:artifactResult.reviewLoadBreakdownPath||"",
          requestFramePath:artifactResult.requestFramePath||"",
          routingDecisionPath:artifactResult.routingDecisionPath||"",
          reviewBundlePath:artifactResult.reviewBundlePath||"",
          releaseDecisionPath:artifactResult.releaseDecisionPath||"",
          conformanceReportPath:artifactResult.conformanceReportPath||"",
          operatorViewSummaryPath:artifactResult.operatorViewSummaryPath||"",
          releaseDecisionState:releaseDecision&&releaseDecision.terminal_state?releaseDecision.terminal_state:"",
          parentMaterialImplementationObserved:parentMaterialImplementationObserved?1:0,
          parentDispatchGuard,
        },{persist:false});
        publishLatestTurnSnapshot(turnRecord,"turn_artifacts_finalized");
        rememberAuditMemoryRecord({
          turnId,
          threadId,
          artifactDir:artifactResult.dir||"",
          manifestPath:artifactResult.manifest||"",
          manifestSha256:artifactResult.manifestSha256||"",
          promptSha256:artifactResult.promptSha256||"",
          generatedAt:Date.now(),
          artifactCount:Number.isFinite(Number(artifactResult.artifactCount))?Math.max(0,Math.trunc(Number(artifactResult.artifactCount))):0,
          status:safeString(artifactResult.status,40)||finalStatus,
        },{persist:false});
        logOperation("turn.artifacts.finalized",{
          turn:safeString(turnId,120),
          th:safeString(threadId,120),
          dir:summarizePathForOperationLog(artifactResult.dir,240),
          artifactCount:Number.isFinite(Number(artifactResult.artifactCount))?Math.max(0,Math.trunc(Number(artifactResult.artifactCount))):0,
          status:safeString(artifactResult.status,40),
          redactionReplacements:Number.isFinite(Number(artifactResult.redactionReplacements))?Math.max(0,Math.trunc(Number(artifactResult.redactionReplacements))):0,
        },"standard");
      }
      maybePruneTurnArtifactsStorage("turn_finalized");
    }
    debugFinalize("after_artifacts");
    rememberReplayMemoryRecord({
      turnId,
      threadId,
      agentName,
      status:finalStatus,
      taskOutcomeStatus:taskOutcome.status,
      taskOutcomeReason:taskOutcome.reason,
      executionProfile:turnVisibility.profile.effective,
      executionIntent:turnVisibility.intent,
      executionSource:turnRecord.source||"streaming_exec",
      request:replaySeed,
      baseline:{
        outputSha256:hashSha256Hex(authoritativeFinalText),
        outputLength:authoritativeFinalText.length,
        outputSnapshot:safeString(authoritativeFinalText,replayOutputSnapshotMaxChars),
        artifactManifestPath:safeString(turnRecord.artifactManifestPath,320)||"",
        artifactManifestSha256:safeString(turnRecord.artifactManifestSha256,80)||"",
      },
      replayStats:{},
      startedAt:turnRecord.startedAt,
      completedAt:turnRecord.completedAt,
      updatedAt:Date.now(),
    },{persist:false});
    persistHarnessExecutionMemoryStore({reason:"turn_finalized"});
    maybeEmitSloAlert(buildSloRuntimeSnapshot(),{reason:"turn_finalized"});
    debugFinalize("after_memory_persist");
    if(parentDispatchGuard.retry){
      const nextAttempt=Number.isFinite(Number(parentDispatchGuard.nextAttempt))
        ?Math.max(0,Math.trunc(Number(parentDispatchGuard.nextAttempt)))
        :parentDispatchAttempt+1;
      const retryPrompt=buildParentDispatchGuardRetryPrompt({
        originalPrompt:parentDispatchRootPrompt||prompt,
        reason:parentDispatchGuard.reason,
        attempt:nextAttempt,
        maxRetries:parentDispatchGuardMaxRetries,
        maxChars:defaultPromptCharLimit,
      });
      const detail=`parent dispatch retry ${nextAttempt}/${parentDispatchGuardMaxRetries} (${parentDispatchGuard.reason||"dispatch_required"})`;
      if(canWrite()){
        safeWriteEvent({
          type:"activity",
          label:"parent_dispatch_retry",
          detail,
          turnId,
          threadId,
        });
      }
      logOperation("parent.dispatch_guard_retry",{
        a:safeString(agentName,80),
        th:safeString(threadId,120),
        turn:safeString(turnId,120),
        attemptFrom:parentDispatchAttempt,
        attemptTo:nextAttempt,
        maxRetries:parentDispatchGuardMaxRetries,
        reason:safeString(parentDispatchGuard.reason,80)||"dispatch_required",
      },"standard");
      executeTurnStreaming(res,retryPrompt||parentDispatchRootPrompt||prompt,agentName,{
        ...options,
        promptAudit:null,
        forceNewSession:false,
        attemptedFreshFallback:false,
        planningContext,
        parentDispatchAttempt:nextAttempt,
        parentDispatchRootPrompt:parentDispatchRootPrompt||safeString(prompt,defaultPromptCharLimit),
        adversarialAttempt:0,
        adversarialRootPrompt:adversarialRootPrompt||safeString(prompt,defaultPromptCharLimit),
      }).catch((retryError)=>{
        const message=`[error] parent dispatch retry failed: ${retryError&&retryError.message?retryError.message:"unknown error"}`;
        logOperation("parent.dispatch_guard_retry_failed",{
          a:safeString(agentName,80),
          th:safeString(threadId,120),
          turn:safeString(turnId,120),
          attempt:nextAttempt,
          err:summarizeErrorForOperationLog(retryError,220),
        },"standard");
        if(!clientClosed&&canWrite()){
          safeWriteEvent({type:"error",text:message});
          safeWriteEvent({type:"status",status:"failed"});
          try{
            res.end();
          }catch{
          }
        }
        if(options&&typeof options.onTerminal==="function"){
          try{
            const retryTaskOutcome=deriveTaskOutcome({
              turnStatus:"failed",
              errorText:message,
              parentDispatchViolation:true,
              spec:taskOutcomeContract,
            });
            options.onTerminal({
              status:"failed",
              error:message,
              taskOutcomeStatus:retryTaskOutcome.status,
              taskOutcomeReason:retryTaskOutcome.reason,
              threadId,
              turnId,
              agentName,
              executionProfile:turnVisibility.profile.effective,
              executionIntent:turnVisibility.intent,
              executionSource:turnRecord.source||"streaming_exec",
              artifactDir:safeString(turnRecord.artifactDir,260)||"",
              artifactManifestPath:safeString(turnRecord.artifactManifestPath,320)||"",
              artifactManifestSha256:safeString(turnRecord.artifactManifestSha256,80)||"",
            });
          }catch{
          }
        }
      });
      return;
    }
    if(finalStatus==="failed"&&sawResponseStreamDisconnect&&!options.attemptedFreshFallback&&!clientClosed&&canWrite()){
      const detail="fresh session retry 1/1 (response_stream_disconnected)";
      safeWriteEvent({
        type:"activity",
        label:"stream_recovery",
        detail,
        turnId,
        threadId,
      });
      logOperation("turn.stream_disconnect_retry",{
        a:safeString(agentName,80),
        th:safeString(threadId,120),
        turn:safeString(turnId,120),
        reason:"response_stream_disconnected",
        forceNewSession:1,
        err:safeString(responseStreamDisconnectDetail||finalErrorText,220),
      },"standard");
      state.sessionRef=null;
      state.threadId=null;
      state.activeTurnId=null;
      state.manualSessionPinned=false;
      executeTurnStreaming(res,prompt,agentName,{
        ...options,
        promptAudit:null,
        forceNewSession:true,
        attemptedFreshFallback:true,
      }).catch((retryError)=>{
        const message=`[error] stream recovery retry failed: ${retryError&&retryError.message?retryError.message:"unknown error"}`;
        logOperation("turn.stream_disconnect_retry_failed",{
          a:safeString(agentName,80),
          th:safeString(threadId,120),
          turn:safeString(turnId,120),
          err:summarizeErrorForOperationLog(retryError,220),
        },"standard");
        if(!clientClosed&&canWrite()){
          safeWriteEvent({type:"error",text:message});
          safeWriteEvent({type:"status",status:"failed"});
          try{
            res.end();
          }catch{
          }
        }
        if(options&&typeof options.onTerminal==="function"){
          try{
            const retryTaskOutcome=deriveTaskOutcome({
              turnStatus:"failed",
              errorText:message,
              spec:taskOutcomeContract,
            });
            options.onTerminal({
              status:"failed",
              error:message,
              taskOutcomeStatus:retryTaskOutcome.status,
              taskOutcomeReason:retryTaskOutcome.reason,
              threadId,
              turnId,
              agentName,
              executionProfile:turnVisibility.profile.effective,
              executionIntent:turnVisibility.intent,
              executionSource:turnRecord.source||"streaming_exec",
              artifactDir:safeString(turnRecord.artifactDir,260)||"",
              artifactManifestPath:safeString(turnRecord.artifactManifestPath,320)||"",
              artifactManifestSha256:safeString(turnRecord.artifactManifestSha256,80)||"",
            });
          }catch{
          }
        }
      });
      return;
    }
    const shadowInput={
      prompt:adversarialRootPrompt||prompt,
      answer:authoritativeFinalText,
      status:finalStatus,
      taskOutcomeStatus:taskOutcome.status,
      agentName,
      threadId,
      turnId,
      attempt:adversarialAttempt,
    };
    const loopActive=adversarialShadowEnabled&&adversarialLoopEnabled;
    let shadowReviewResult=null;
    if(adversarialShadowEnabled){
      if(loopActive){
        shadowReviewResult=runAdversarialShadowReview(shadowInput,{queueMs:0});
      }else{
        queueAdversarialShadowReview(shadowInput);
      }
    }
    const retryVerdict=shouldRetryAdversarialLoop({
      enabled:loopActive,
      finalStatus,
      taskOutcomeStatus:taskOutcome.status,
      decision:shadowReviewResult&&shadowReviewResult.summary?shadowReviewResult.summary.decision:"pass",
      attempt:adversarialAttempt,
      maxRetries:adversarialLoopMaxRetries,
      clientClosed,
      writable:canWrite(),
    });
    if(retryVerdict&&retryVerdict.retry){
      const nextAttempt=Number.isFinite(Number(retryVerdict.nextAttempt))
        ?Math.max(0,Math.trunc(Number(retryVerdict.nextAttempt)))
        :adversarialAttempt+1;
      const retryPrompt=buildAdversarialRetryPrompt({
        originalPrompt:adversarialRootPrompt||prompt,
        previousAnswer:authoritativeFinalText,
        review:shadowReviewResult&&shadowReviewResult.review?shadowReviewResult.review:null,
        executionTask:planningContextRequiresDispatch(planningContext),
        dispatchPlan:planningContext&&planningContext.dispatchPlan?planningContext.dispatchPlan:null,
        attempt:adversarialAttempt,
        maxRetries:adversarialLoopMaxRetries,
        maxChars:defaultPromptCharLimit,
      });
      const retryScore=shadowReviewResult&&shadowReviewResult.summary
        ?toNonNegativeInt(shadowReviewResult.summary.score)
        :0;
      const retryMin=shadowReviewResult&&shadowReviewResult.summary
        ?toNonNegativeInt(shadowReviewResult.summary.minScore)
        :adversarialShadowMinScore;
      const detail=`adversarial retry ${nextAttempt}/${adversarialLoopMaxRetries} (score=${retryScore}, threshold=${retryMin})`;
      if(canWrite()){
        safeWriteEvent({
          type:"activity",
          label:"adversarial_retry",
          detail,
          turnId,
          threadId,
        });
      }
      logOperation("shadow.loop_retry",{
        a:safeString(agentName,80),
        th:safeString(threadId,120),
        turn:safeString(turnId,120),
        fromAttempt:adversarialAttempt,
        toAttempt:nextAttempt,
        maxRetries:adversarialLoopMaxRetries,
        score:retryScore,
        minScore:retryMin,
        reason:safeString(retryVerdict.reason,60)||"review_failed",
      },"standard");
      executeTurnStreaming(res,retryPrompt||adversarialRootPrompt||prompt,agentName,{
        ...options,
        promptAudit:null,
        forceNewSession:false,
        attemptedFreshFallback:false,
        planningContext,
        adversarialAttempt:nextAttempt,
        adversarialRootPrompt:adversarialRootPrompt||safeString(prompt,defaultPromptCharLimit),
      }).catch((retryError)=>{
        const message=`[error] adversarial retry failed: ${retryError&&retryError.message?retryError.message:"unknown error"}`;
        logOperation("shadow.loop_retry_failed",{
          a:safeString(agentName,80),
          th:safeString(threadId,120),
          turn:safeString(turnId,120),
          attempt:nextAttempt,
          err:summarizeErrorForOperationLog(retryError,220),
        },"standard");
        if(!clientClosed&&canWrite()){
          safeWriteEvent({type:"error",text:message});
          safeWriteEvent({type:"status",status:"failed"});
          try{
            res.end();
          }catch{
          }
        }
        if(options&&typeof options.onTerminal==="function"){
          try{
            const retryTaskOutcome=deriveTaskOutcome({
              turnStatus:"failed",
              errorText:message,
              spec:taskOutcomeContract,
            });
            options.onTerminal({
              status:"failed",
              error:message,
              taskOutcomeStatus:retryTaskOutcome.status,
              taskOutcomeReason:retryTaskOutcome.reason,
              threadId,
              turnId,
              agentName,
              executionProfile:turnVisibility.profile.effective,
              executionIntent:turnVisibility.intent,
              executionSource:turnRecord.source||"streaming_exec",
              artifactDir:safeString(turnRecord.artifactDir,260)||"",
              artifactManifestPath:safeString(turnRecord.artifactManifestPath,320)||"",
              artifactManifestSha256:safeString(turnRecord.artifactManifestSha256,80)||"",
            });
          }catch{
          }
        }
      });
      return;
    }
    if(loopActive){
      logOperation("shadow.loop_stop",{
        a:safeString(agentName,80),
        th:safeString(threadId,120),
        turn:safeString(turnId,120),
        attempt:adversarialAttempt,
        reason:safeString(retryVerdict&&retryVerdict.reason?retryVerdict.reason:"",60)||"completed",
        decision:shadowReviewResult&&shadowReviewResult.summary
          ?safeString(shadowReviewResult.summary.decision,40)
          :"pass",
      },"standard");
    }
    if(options&&typeof options.onTerminal==="function"){
      try{
        options.onTerminal({
          status:finalStatus,
          error:finalErrorText,
          taskOutcomeStatus:taskOutcome.status,
          taskOutcomeReason:taskOutcome.reason,
          threadId,
          turnId,
          agentName,
          executionProfile:turnVisibility.profile.effective,
          executionIntent:turnVisibility.intent,
          executionSource:turnRecord.source||"streaming_exec",
          artifactDir:safeString(turnRecord.artifactDir,260)||"",
          artifactManifestPath:safeString(turnRecord.artifactManifestPath,320)||"",
          artifactManifestSha256:safeString(turnRecord.artifactManifestSha256,80)||"",
        });
      }catch{
      }
    }

    if(clientClosed)return;

    const clientFinalText=rewriteClientFinalTextForOutcome(authoritativeFinalText,{
      taskOutcomeStatus:taskOutcome.status,
      prompt:adversarialRootPrompt||prompt,
    });
    if(clientFinalText){
      safeWriteEvent({type:"final",text:clientFinalText});
    }

    const clientErrorText=taskOutcome.status==="NEEDS_INPUT"?"":finalErrorText;
    if(clientErrorText){
      safeWriteEvent({type:"error",text:clientErrorText});
    }

    safeWriteEvent({type:"status",status:taskOutcome.status==="NEEDS_INPUT"?"needs_input":finalStatus});

    if(canWrite()){
      try{
        debugFinalize("before_response_end");
        res.end();
      }catch{
      }
    }
  };

  const keepRunningAfterClientClose=safeString(options&&options.executionSource,80)==="web_ui";
  const onClientClose=()=>{
    if(clientClosed||turnFinalized)return;
    clientClosed=true;
    if(keepRunningAfterClientClose){
      logOperation("turn.client_closed_detached",{
        a:safeString(agentName,80),
        th:safeString(threadId,120),
        turn:safeString(turnId,120),
        executionSource:safeString(options&&options.executionSource,80)||"api_exec",
      },"standard");
      console.log(`[turn] client closed, continue in background: agent=${agentName} thread=${threadId} turn=${turnId}`);
      return;
    }
    logOperation("turn.client_closed",{
      a:safeString(agentName,80),
      th:safeString(threadId,120),
      turn:safeString(turnId,120),
    });
    console.log(`[turn] client closed, interrupt requested: agent=${agentName} thread=${threadId} turn=${turnId}`);
    appServer.interruptTurn(threadId,turnId).catch(()=>{});
    disconnectFinalizeTimer=setTimeout(()=>{
      if(turnFinalized)return;
      console.warn(`[turn] still waiting for turn/completed after disconnect: agent=${agentName} thread=${threadId} turn=${turnId}`);
      appServer.interruptTurn(threadId,turnId).catch(()=>{});
      finalizeTurn("[error] client disconnected before terminal turn/completed","interrupted");
    },30000);
  };

  const unsubscribe=appServer.watchTurn(threadId,turnId,{
    onDelta:(delta)=>{
      if(typeof delta!=="string"||!delta.length)return;
      deltaText+=delta;
      if(artifactRecorder&&typeof artifactRecorder.writeEvent==="function"){
        artifactRecorder.writeEvent("delta",{text:delta});
      }
      safeWriteEvent({type:"delta",text:delta});
    },
    onItemStarted:(item)=>{
      if(!item||typeof item!=="object")return;
      observedItemRecords.push({ts:Date.now(),phase:"started",item});
      if(observedItemRecords.length>400)observedItemRecords.shift();
      if(artifactRecorder&&typeof artifactRecorder.writeItem==="function"){
        artifactRecorder.writeItem("started",item);
      }
      if(isCollabToolItemType(item.type)){
        observeLiveCollabItem({item,phase:"started",tracker:liveCollabTurnTracker});
      }
      traceAgentDispatch(item,"started");
    },
    onItemCompleted:(item)=>{
      if(!item||typeof item!=="object")return;
      observedItemRecords.push({ts:Date.now(),phase:"completed",item});
      if(observedItemRecords.length>400)observedItemRecords.shift();
      if(artifactRecorder&&typeof artifactRecorder.writeItem==="function"){
        artifactRecorder.writeItem("completed",item);
      }
      const liveCollabSummaryContext=isCollabToolItemType(item.type)
        ?observeLiveCollabItem({item,phase:"completed",tracker:liveCollabTurnTracker})
        :null;
      traceAgentDispatch(item,"completed");
      recordDispatchOutcome(item);
      collectTurnStreamItemStats(turnStats,item);
      const summary=summarizeTurnItemForStream(item,liveCollabSummaryContext||{});
      if(summary){
        safeWriteEvent({type:"item",item:summary});
      }
      const nonInteractiveFeedback=extractNonInteractiveApprovalFromCollabItem(item);
      if(nonInteractiveFeedback){
        if(!errorText)errorText=`[error] ${nonInteractiveFeedback}`;
        safeWriteEvent({type:"activity",label:"non_interactive_approval",detail:safeString(nonInteractiveFeedback,1200),itemId:typeof item.id==="string"?item.id:""});
      }
      if(item.type==="agentMessage"&&typeof item.text==="string"){
        finalTextFromItemCompleted=item.text;
      }
      turnRecord.updatedAt=nowTs();
    },
    onDiffUpdated:(diff)=>{
      if(artifactRecorder&&typeof artifactRecorder.captureDiff==="function"){
        artifactRecorder.captureDiff(typeof diff==="string"?diff:"");
      }
      const normalizedDiff=clipText(typeof diff==="string"?diff:"",160000);
      safeWriteEvent({type:"diff",text:normalizedDiff});
    },
    onAny:(method,params)=>{
      if(typeof method!=="string")return;
      if(artifactRecorder&&typeof artifactRecorder.writeNotification==="function"){
        artifactRecorder.writeNotification(method,params&&typeof params==="object"?params:{});
      }
      const lower=method.toLowerCase();
      if(lower==="item/agentmessage/delta"||lower==="agentmessage/delta")return;

      const planSummary=summarizeTurnPlanForStream(params);
      if(planSummary){
        safeWriteEvent({type:"plan",explanation:planSummary.explanation,steps:planSummary.steps});
      }

      const usage=extractTokenUsageForStream(params);
      if(usage){
        turnStats.tokenUsage=usage;
        updateSessionPerformanceTurnUsage(threadId,turnId,usage);
        safeWriteEvent({type:"tokenUsage",usage,threadId,turnId});
      }

      if(lower.includes("mcp")&&params&&typeof params==="object"&&typeof params.message==="string"){
        const detail=safeString(params.message,1200);
        if(detail){
          safeWriteEvent({type:"activity",label:method,detail,itemId:typeof params.itemId==="string"?params.itemId:""});
        }
      }
    },
    onError:(msg,params)=>{
      const payloadError=params&&params.error&&typeof params.error==="object"?params.error:null;
      if(payloadError&&isResponseStreamDisconnectErrorPayload(payloadError)){
        sawResponseStreamDisconnect=true;
        const detail=extractResponseStreamDisconnectDetail(payloadError,4000);
        if(detail)responseStreamDisconnectDetail=detail;
      }else if(isResponseStreamDisconnectErrorText(msg)){
        sawResponseStreamDisconnect=true;
        const detail=safeString(msg,4000);
        if(detail)responseStreamDisconnectDetail=detail;
      }
      if(typeof msg==="string"&&!errorText)errorText=msg;
      if(artifactRecorder&&typeof artifactRecorder.writeEvent==="function"){
        artifactRecorder.writeEvent("turn.error",{message:safeString(msg,2200)});
      }
      if(isNonInteractiveApprovalErrorText(msg)){
        const detail=`non-interactive approval blocked delegated execution: ${safeString(msg,900)}`;
        safeWriteEvent({type:"activity",label:"non_interactive_approval",detail});
      }
      if(typeof msg==="string"&&msg.trim()){
        safeWriteEvent({type:"activity",label:"error",detail:safeString(msg,1200)});
      }
    },
    onCompleted:(turn)=>{
      const status=normalizeExecutionState(turn&&turn.status,{terminalFallback:true});
      const finalStatus=status==="in_progress"?"failed":status;
      console.log(`[turn] completed: agent=${agentName} thread=${threadId} turn=${turnId} status=${finalStatus}`);
      let completionError="";
      if(turn&&turn.status==="failed"&&turn.error&&typeof turn.error.message==="string"){
        completionError=`[error] ${turn.error.message}`;
        if(isResponseStreamDisconnectErrorPayload(turn.error)||isResponseStreamDisconnectErrorText(turn.error.message)){
          sawResponseStreamDisconnect=true;
          const detail=extractResponseStreamDisconnectDetail(turn.error,4000)||safeString(turn.error.message,4000);
          if(detail)responseStreamDisconnectDetail=detail;
        }
        if(isNonInteractiveApprovalErrorText(turn.error.message)){
          safeWriteEvent({type:"activity",label:"non_interactive_approval",detail:safeString(turn.error.message,1200)});
        }
      }
      if(artifactRecorder&&typeof artifactRecorder.writeEvent==="function"){
        artifactRecorder.writeEvent("turn.completed.notification",{
          status:finalStatus,
          error:safeString(completionError,1200),
        });
      }
      finalizeTurn(completionError,finalStatus);
    },
    onFatal:(error)=>{
      if(artifactRecorder&&typeof artifactRecorder.writeEvent==="function"){
        artifactRecorder.writeEvent("turn.fatal",{error:summarizeErrorForOperationLog(error,1200)});
      }
      finalizeTurn(`[error] ${error&&error.message?error.message:"app-server terminated"}`,"failed");
    }
  });

  const cleanup=()=>{
    res.off("close",onClientClose);
    unsubscribe();
  };

  res.once("close",onClientClose);
}

async function runCodexExecStreaming(res,prompt,sandboxMode,options={}){
  const normalized=options||{};
  const targetAgentName=resolveAgentName(normalized);
  if(!normalized.disableSlashRouter&&isSlashCommand(prompt)){
    const {command,argsText}=parseSlashPrompt(prompt);
    logOperation("slash.command",{
      a:safeString(targetAgentName,80),
      cmd:safeString(command,80),
    });
    if(command==="/agent"){
      handleSlashAgentCommand(res,argsText);
      return;
    }
    if(command==="/experimental"){
      handleSlashExperimentalCommand(res,argsText);
      return;
    }
    if(command==="/fast"){
      handleSlashFastCommand(res,argsText);
      return;
    }
    if(command==="/resume"){
      handleSlashResumeCommand(res,argsText);
      return;
    }
    if(command==="/fork"){
      handleSlashForkCommand(res,argsText);
      return;
    }
    if(command==="/mention"){
      const mention=parseMentionArgs(argsText);
      if(!mention||!mention.targetPath){
        replyLocalText(res,"Usage: /mention <path> [message]");
        return;
      }
      const resolved=resolveMentionPath(mention.targetPath);
      if(!resolved){
        replyLocalText(res,`Path not found in workspace: ${mention.targetPath}`);
        return;
      }
      const rewritten=mention.message?`Target file: ${resolved.relative}\nRequest: ${mention.message}`:`Target file: ${resolved.relative}\nRequest: Review and improve this file.`;
      logOperation("slash.mention",{
        a:safeString(targetAgentName,80),
        target:safeString(resolved.relative,220),
        request:summarizeTextForOperationLog(mention.message||"",1200),
      });
      runCodexExecStreaming(res,rewritten,sandboxMode,{
        ...normalized,
        disableSlashRouter:true,
        agentName:targetAgentName,
        executionIntent:normalizeExecutionIntent(normalized.executionIntent||"slash-mention","slash-mention"),
        executionSource:safeString(normalized.executionSource,80)||"slash_mention",
      }).catch(error=>{
        if(!res.writableEnded)replyLocalText(res,`[error] ${error.message}`);
      });
      return;
    }
  }
  await executeTurnStreaming(res,prompt,targetAgentName,{
    sandboxMode,
    approvalPolicy:normalizeApprovalPolicy(normalized.approvalPolicy),
    webSearch:normalizeBooleanFlag(normalized.webSearch),
    fastModeEnabled:resolveFastModeEnabled(normalized.fastModeEnabled),
    automaticApprovalReviewEnabled:resolveAutomaticApprovalReviewEnabled(normalized.automaticApprovalReviewEnabled),
    model:normalizeExecModel(normalized.model,defaultExecModelName),
    modelReasoningEffort:normalizeExecModelReasoningEffort(normalized.modelReasoningEffort,defaultExecModelReasoningEffort),
    cwd:normalizeWorkingDirectory(normalized.cwd,workspaceRoot),
    requestUserInputPolicy:normalizeRequestUserInputPolicy(normalized.requestUserInputPolicy,nonInteractiveRequestUserInputPolicy),
    forceNewSession:Boolean(normalized.forceNewSession),
    attemptedFreshFallback:Boolean(normalized.attemptedFreshFallback),
    images:Array.isArray(normalized.images)?normalized.images:[],
    planningContext:normalized&&normalized.planningContext&&typeof normalized.planningContext==="object"
      ?normalized.planningContext
      :null,
    promptAudit:normalized&&normalized.promptAudit&&typeof normalized.promptAudit==="object"?normalized.promptAudit:null,
    idempotencyKey:safeString(normalized.idempotencyKey,200),
    governanceOverride:normalizeOverrideRequest(normalized.governanceOverride),
    executionProfile:normalizeExecutionProfile(normalized.executionProfile,runtimeExecutionProfile),
    executionIntent:normalizeExecutionIntent(normalized.executionIntent,"interactive"),
    executionSource:safeString(normalized.executionSource,80)||"api_exec",
    onTerminal:typeof normalized.onTerminal==="function"?normalized.onTerminal:null,
  });
}

const nowTs=()=>Date.now();
function normalizeOptionalString(value,max=2000){if(typeof value!=="string")return null;const trimmed=value.trim();if(!trimmed)return null;return trimmed.slice(0,max);}
function normalizeWorkingDirectory(value,fallbackCwd=workspaceRoot){
  const raw=normalizeOptionalString(value,2000);
  const resolved=raw?path.resolve(raw):path.resolve(fallbackCwd||workspaceRoot);
  if(!fs.existsSync(resolved))throw new Error(`cwd does not exist: ${resolved}`);
  const stat=fs.statSync(resolved);
  if(!stat.isDirectory())throw new Error(`cwd is not a directory: ${resolved}`);
  return resolved;
}
function normalizeMergePath(pathValue){return String(pathValue||"").replace(/\\/g,"/").toLowerCase();}
function normalizePatchKind(kind){
  if(kind&&typeof kind==="object"&&typeof kind.type==="string")return kind.type;
  if(typeof kind==="string")return kind;
  return "unknown";
}
function mapFileChange(change){
  const pathValue=change&&typeof change.path==="string"?change.path:"";
  if(!pathValue)return null;
  const kind=normalizePatchKind(change.kind);
  const mapped={path:pathValue,normalizedPath:normalizeMergePath(pathValue),kind,diff:typeof change.diff==="string"?change.diff:""};
  if(kind==="update"&&change&&change.kind&&typeof change.kind.move_path==="string"){
    mapped.movePath=change.kind.move_path;
  }
  return mapped;
}
function safeString(value,max=12000){
  if(typeof value!=="string")return"";
  const trimmed=value.trim();
  if(!trimmed)return"";
  return trimmed.slice(0,max);
}
function normalizePocBatchMode(value){
  const raw=typeof value==="string"?value.trim().toLowerCase():"";
  return allowedPocBatchModes.has(raw)?raw:"mock";
}
function normalizePocIntervalSec(value){
  const parsed=Number(value);
  if(!Number.isFinite(parsed))return pocSchedulerDefaultIntervalSec;
  return Math.max(pocSchedulerMinIntervalSec,Math.trunc(parsed));
}
function clonePocBatchRuns(){
  return pocBatchRuns.map((item)=>({
    runId:safeString(item&&item.runId,120)||"",
    mode:normalizePocBatchMode(item&&item.mode),
    status:safeString(item&&item.status,40)||"unknown",
    summary:safeString(item&&item.summary,240)||"(no summary)",
    prompt:safeString(item&&item.prompt,360)||"",
    error:safeString(item&&item.error,240)||"",
    source:safeString(item&&item.source,80)||"manual",
    startedAt:Number.isFinite(Number(item&&item.startedAt))?Math.trunc(Number(item.startedAt)):0,
    finishedAt:Number.isFinite(Number(item&&item.finishedAt))?Math.trunc(Number(item.finishedAt)):0,
  }));
}
function getPocStatusSnapshot(){
  return{
    ok:true,
    interactivePath:"POST /api/exec",
    batchPath:"POST /api/batch/run",
    sharedHarness:"policy + logging + retry",
    capabilities:getRunnerCapabilities(),
    scheduler:{
      enabled:Boolean(pocSchedulerState.enabled),
      intervalSec:normalizePocIntervalSec(pocSchedulerState.intervalSec),
      nextTickAt:Number.isFinite(Number(pocSchedulerState.nextTickAt))?Math.max(0,Math.trunc(Number(pocSchedulerState.nextTickAt))):0,
      defaultPrompt:safeString(pocSchedulerState.defaultPrompt,240)||pocSchedulerDefaultPrompt,
    },
    lastBatchRuns:clonePocBatchRuns(),
  };
}
function pushPocBatchRun(entry){
  if(!entry||typeof entry!=="object")return;
  pocBatchRuns.unshift(entry);
  if(pocBatchRuns.length>pocBatchHistoryLimit)pocBatchRuns.length=pocBatchHistoryLimit;
}
function clearPocSchedulerTimer(){
  if(pocSchedulerState.timer!==null){
    clearTimeout(pocSchedulerState.timer);
    pocSchedulerState.timer=null;
  }
}
function schedulePocSchedulerTick(){
  clearPocSchedulerTimer();
  if(!pocSchedulerState.enabled)return;
  const intervalMs=normalizePocIntervalSec(pocSchedulerState.intervalSec)*1000;
  pocSchedulerState.nextTickAt=nowTs()+intervalMs;
  pocSchedulerState.timer=setTimeout(()=>{
    runPocSchedulerTick().catch((error)=>{
      logOperation("poc.scheduler.error",{err:summarizeErrorForOperationLog(error,220)},"standard");
    });
  },intervalMs);
  if(typeof pocSchedulerState.timer.unref==="function"){
    pocSchedulerState.timer.unref();
  }
}
async function executePocBatchRun({prompt,mode,cwd,source}){
  const normalizedPrompt=safeString(prompt,24000);
  const normalizedMode=normalizePocBatchMode(mode);
  const normalizedCwd=normalizeWorkingDirectory(cwd,workspaceRoot);
  const startedAt=nowTs();
  logOperation("poc.batch.start",{
    mode:normalizedMode,
    source:safeString(source,80)||"manual",
    cwd:summarizePathForOperationLog(normalizedCwd,220),
    prompt:summarizeTextForOperationLog(normalizedPrompt,24000),
  },"standard");
  const rawResult=await runBatchJob({prompt:normalizedPrompt,mode:normalizedMode,cwd:normalizedCwd});
  const finishedAt=nowTs();
  const normalizedStatus=normalizeExecutionState(rawResult&&rawResult.status,{terminalFallback:true});
  const status=isTerminalExecutionState(normalizedStatus)?normalizedStatus:"failed";
  const runRecord={
    runId:safeString(rawResult&&rawResult.runId,120)||`poc-${startedAt}`,
    mode:normalizedMode,
    status,
    summary:safeString(rawResult&&rawResult.summary,240)||"(no summary)",
    prompt:normalizedPrompt,
    error:safeString(rawResult&&rawResult.error,240)||"",
    source:safeString(source,80)||"manual",
    startedAt,
    finishedAt,
  };
  pushPocBatchRun(runRecord);
  logOperation("poc.batch.finish",{
    runId:safeString(runRecord.runId,120),
    mode:runRecord.mode,
    status:runRecord.status,
    source:runRecord.source,
    ms:Math.max(0,finishedAt-startedAt),
    err:safeString(runRecord.error,200),
  },"standard");
  return{
    ok:rawResult&&rawResult.ok!==false&&runRecord.status!=="failed",
    ...runRecord,
    output:rawResult&&typeof rawResult.output==="object"?rawResult.output:null,
  };
}
async function runPocSchedulerTick(){
  if(!pocSchedulerState.enabled)return;
  if(pocSchedulerState.running){
    schedulePocSchedulerTick();
    return;
  }
  pocSchedulerState.running=true;
  try{
    await executePocBatchRun({
      prompt:pocSchedulerState.defaultPrompt,
      mode:"mock",
      cwd:workspaceRoot,
      source:"scheduler",
    });
  }finally{
    pocSchedulerState.running=false;
    schedulePocSchedulerTick();
  }
}
function setPocSchedulerConfig({enabled,intervalSec}){
  const nextEnabled=Boolean(enabled);
  const nextInterval=normalizePocIntervalSec(intervalSec);
  pocSchedulerState.enabled=nextEnabled;
  pocSchedulerState.intervalSec=nextInterval;
  if(!nextEnabled){
    pocSchedulerState.nextTickAt=0;
    clearPocSchedulerTimer();
  }else{
    schedulePocSchedulerTick();
  }
  logOperation("poc.scheduler.config",{
    enabled:nextEnabled?1:0,
    intervalSec:nextInterval,
    nextTickAt:pocSchedulerState.nextTickAt||0,
  },"standard");
  return{
    enabled:nextEnabled,
    intervalSec:nextInterval,
    nextTickAt:pocSchedulerState.nextTickAt||0,
  };
}
function isTerminalExecutionState(state){
  return state==="completed"||state==="interrupted"||state==="failed";
}
function normalizeExecutionState(state,{terminalFallback=false}={}){
  const normalized=typeof state==="string"?state.trim().toLowerCase():"";
  if(normalized==="completed")return"completed";
  if(normalized==="failed")return"failed";
  if(normalized==="interrupted"||normalized==="cancelled"||normalized==="canceled")return"interrupted";
  if(normalized==="inprogress"||normalized==="in_progress"||normalized==="running"||normalized==="queued"||normalized==="pending")return"in_progress";
  return terminalFallback?"failed":"in_progress";
}
function deriveTurnTaskOutcome({finalStatus,finalErrorText,approvalAudits,parentDispatchGuard,explicitStatus="",reason="",partial=false,missingEvidence=false}={}){
  const declinedAudit=findLatestDeclinedApprovalAudit(approvalAudits);
  return deriveTaskOutcome({
    turnStatus:finalStatus,
    explicitStatus,
    reason,
    approvalReason:declinedAudit&&declinedAudit.reason?declinedAudit.reason:"",
    governanceReason:declinedAudit&&declinedAudit.governanceReason?declinedAudit.governanceReason:"",
    errorText:finalErrorText,
    parentDispatchViolation:Boolean(parentDispatchGuard&&parentDispatchGuard.violation&&parentDispatchGuard.mode==="enforce"),
    partial,
    missingEvidence,
    spec:taskOutcomeContract,
  });
}
function setTurnTerminalState(record,terminalState,{terminalEvent,errorText}={}){
  if(!record||typeof record!=="object")return;
  const previousState=normalizeExecutionState(record.status,{terminalFallback:false})||"in_progress";
  const normalized=normalizeExecutionState(terminalState,{terminalFallback:true});
  const finalState=normalized==="in_progress"?"failed":normalized;
  const normalizedEvent=safeString(terminalEvent,120)||"turn/completed";
  const transition=validateTurnTransition({
    from:previousState,
    to:finalState,
    spec:harnessTurnContractSpec,
  });
  if(!transition.ok){
    logOperation("contract.turn_transition_violation",{
      from:previousState,
      to:finalState,
      reason:safeString(transition.reason,80)||"transition_not_allowed",
    },"core");
  }
  const terminalValidation=validateTurnTerminalContract({
    status:finalState,
    terminalEvent:normalizedEvent,
    spec:harnessTurnContractSpec,
  });
  if(!terminalValidation.ok){
    logOperation("contract.turn_terminal_violation",{
      status:finalState,
      event:normalizedEvent,
      reason:safeString(terminalValidation.reason,80)||"terminal_contract_violation",
      expectedEvent:safeString(terminalValidation.expectedTerminalEvent,120)||"",
    },"core");
  }
  record.status=finalState;
  record.turnStatusTerminal=finalState;
  record.turnTerminalEvent=terminalValidation.ok
    ?normalizedEvent
    :(safeString(terminalValidation.expectedTerminalEvent,120)||"turn/completed");
  record.turnError=safeString(errorText,1000)||null;
  record.completedAt=record.completedAt||nowTs();
  record.updatedAt=nowTs();
}
function snapshotTurnRecord(record){
  if(!record||typeof record!=="object")return null;
  const status=normalizeExecutionState(record.status,{terminalFallback:false});
  const terminalFromRecord=normalizeExecutionState(record.turnStatusTerminal,{terminalFallback:false});
  const terminalStatus=isTerminalExecutionState(status)
    ?status
    :(isTerminalExecutionState(terminalFromRecord)?terminalFromRecord:null);
  const turnVisibility=record.turnVisibility&&typeof record.turnVisibility==="object"?record.turnVisibility:null;
  const observedSignals=normalizeObservedTurnSignals(record.observedSignals);
  const parentDispatchGuard=record.parentDispatchGuard&&typeof record.parentDispatchGuard==="object"
    ?{
      mode:safeString(record.parentDispatchGuard.mode,20)||"off",
      enabled:record.parentDispatchGuard.enabled?1:0,
      required:record.parentDispatchGuard.required?1:0,
      satisfied:record.parentDispatchGuard.satisfied?1:0,
      violation:record.parentDispatchGuard.violation?1:0,
      reason:safeString(record.parentDispatchGuard.reason,80)||"",
      retry:record.parentDispatchGuard.retry?1:0,
      attempt:Number.isFinite(Number(record.parentDispatchGuard.attempt))?Math.max(0,Math.trunc(Number(record.parentDispatchGuard.attempt))):0,
      maxRetries:Number.isFinite(Number(record.parentDispatchGuard.maxRetries))?Math.max(0,Math.trunc(Number(record.parentDispatchGuard.maxRetries))):0,
      nextAttempt:Number.isFinite(Number(record.parentDispatchGuard.nextAttempt))?Math.max(0,Math.trunc(Number(record.parentDispatchGuard.nextAttempt))):0,
      parentAgent:record.parentDispatchGuard.parentAgent?1:0,
      smokeLikeProfile:record.parentDispatchGuard.smokeLikeProfile?1:0,
      finalStatus:safeString(record.parentDispatchGuard.finalStatus,40)||"",
      dispatch:record.parentDispatchGuard.dispatch&&typeof record.parentDispatchGuard.dispatch==="object"
        ?{
          attempts:Number.isFinite(Number(record.parentDispatchGuard.dispatch.attempts))?Math.max(0,Math.trunc(Number(record.parentDispatchGuard.dispatch.attempts))):0,
          successes:Number.isFinite(Number(record.parentDispatchGuard.dispatch.successes))?Math.max(0,Math.trunc(Number(record.parentDispatchGuard.dispatch.successes))):0,
          failures:Number.isFinite(Number(record.parentDispatchGuard.dispatch.failures))?Math.max(0,Math.trunc(Number(record.parentDispatchGuard.dispatch.failures))):0,
          collabCalls:Number.isFinite(Number(record.parentDispatchGuard.dispatch.collabCalls))?Math.max(0,Math.trunc(Number(record.parentDispatchGuard.dispatch.collabCalls))):0,
        }
        :{attempts:0,successes:0,failures:0,collabCalls:0},
    }
    :null;
  return{
    turn_id:safeString(String(record.turnId||""),160)||null,
    thread_id:safeString(String(record.threadId||""),160)||null,
    agent_name:safeString(record.agentName||record.name||"",160)||null,
    cwd:summarizePathForOperationLog(record.cwd,220)||null,
    source:safeString(record.source,80)||null,
    execution_profile:normalizeExecutionProfile(record.executionProfile,runtimeExecutionProfile),
    execution_intent:normalizeExecutionIntent(record.executionIntent,"interactive"),
    planning_mode:safeString(record.planningMode,40)||"NORMAL",
    planning_depth:safeString(record.planningDepth,60)||"STANDARD_PLANNING",
    assurance_depth:safeString(record.assuranceDepth,60)||"STANDARD_ASSURANCE",
    flow_path:safeString(record.flowPath,80)||"NORMAL_PATH",
    smoke_like_profile:record.smokeLikeProfile?1:0,
    full_utilization_defaults_ready:record.fullUtilizationDefaultsReady?1:0,
    full_utilization_turn_ready:record.fullUtilizationTurnReady?1:0,
    full_utilization_observed:record.fullUtilizationObserved?1:0,
    parent_dispatch_guard:parentDispatchGuard,
    observed_signals:observedSignals,
    artifact_dir:summarizePathForOperationLog(record.artifactDir,240)||null,
    artifact_manifest_path:summarizePathForOperationLog(record.artifactManifestPath,260)||null,
    artifact_manifest_sha256:safeString(record.artifactManifestSha256,80)||null,
    evidence_manifest_path:summarizePathForOperationLog(record.evidenceManifestPath,260)||null,
    stage_timeline_path:summarizePathForOperationLog(record.stageTimelinePath,260)||null,
    flow_trace_summary_path:summarizePathForOperationLog(record.flowTraceSummaryPath,260)||null,
    planning_decision_contract_path:summarizePathForOperationLog(record.planningDecisionContractPath,260)||null,
    review_load_breakdown_path:summarizePathForOperationLog(record.reviewLoadBreakdownPath,260)||null,
    request_frame_path:summarizePathForOperationLog(record.requestFramePath,260)||null,
    routing_decision_path:summarizePathForOperationLog(record.routingDecisionPath,260)||null,
    task_outcomes_path:summarizePathForOperationLog(record.taskOutcomesPath,260)||null,
    review_bundle_path:summarizePathForOperationLog(record.reviewBundlePath,260)||null,
    release_decision_path:summarizePathForOperationLog(record.releaseDecisionPath,260)||null,
    conformance_report_path:summarizePathForOperationLog(record.conformanceReportPath,260)||null,
    operator_view_summary_path:summarizePathForOperationLog(record.operatorViewSummaryPath,260)||null,
    release_decision_state:safeString(record.releaseDecisionState,80)||null,
    parent_material_implementation_observed:record.parentMaterialImplementationObserved?1:0,
    planning:record.planningContext&&typeof record.planningContext==="object"?record.planningContext:null,
    family_completion_gate:record.familyCompletionGate&&typeof record.familyCompletionGate==="object"?record.familyCompletionGate:null,
    visibility:turnVisibility,
    status,
    terminal_status:terminalStatus,
    task_outcome_status:safeString(record.taskOutcomeStatus,80).toUpperCase()||null,
    task_outcome_reason:safeString(record.taskOutcomeReason,120)||null,
    terminal_event:safeString(record.turnTerminalEvent,120)||null,
    git_automation:snapshotGitAutomationResult(record.gitAutomation),
    started_at:Number.isFinite(Number(record.startedAt))?Math.max(0,Math.trunc(Number(record.startedAt))):null,
    completed_at:Number.isFinite(Number(record.completedAt))?Math.max(0,Math.trunc(Number(record.completedAt))):null,
    updated_at:Number.isFinite(Number(record.updatedAt))?Math.max(0,Math.trunc(Number(record.updatedAt))):nowTs(),
  };
}
function snapshotGitRepoStateForRuntime(state){
  const source=state&&typeof state==="object"?state:null;
  if(!source)return null;
  return{
    cwd:summarizePathForOperationLog(source.cwd,220)||null,
    repoRoot:summarizePathForOperationLog(source.repoRoot,220)||null,
    gitAvailable:source.gitAvailable?1:0,
    repoDetected:source.repoDetected?1:0,
    dirty:source.dirty?1:0,
    reason:safeString(source.reason,120)||"",
    branch:safeString(source.branch,120)||"",
    detachedHead:source.detachedHead?1:0,
    remoteName:safeString(source.remoteName,120)||"",
    remoteConfigured:source.remoteConfigured?1:0,
    entryCount:Array.isArray(source.entries)?source.entries.length:0,
    changedPaths:Array.isArray(source.changedPaths)?source.changedPaths.slice(0,12):[],
  };
}
function snapshotGitAutomationResult(result){
  const source=result&&typeof result==="object"?result:null;
  if(!source)return null;
  const commit=source.commit&&typeof source.commit==="object"?source.commit:{};
  const push=source.push&&typeof source.push==="object"?source.push:{};
  return{
    mode:safeString(source.mode,40)||"completed-turn",
    status:safeString(source.status,80)||"unknown",
    reason:safeString(source.reason,120)||"",
    cwd:summarizePathForOperationLog(source.cwd,220)||null,
    repoRoot:summarizePathForOperationLog(source.repoRoot,220)||null,
    finalStatus:safeString(source.finalStatus,40)||"",
    taskOutcomeStatus:safeString(source.taskOutcomeStatus,80).toUpperCase()||"",
    taskOutcomeReason:safeString(source.taskOutcomeReason,120)||"",
    agentName:safeString(source.agentName,120)||"",
    turnId:safeString(source.turnId,160)||"",
    threadId:safeString(source.threadId,160)||"",
    executionProfile:safeString(source.executionProfile,80)||"",
    executionIntent:safeString(source.executionIntent,80)||"",
    executionSource:safeString(source.executionSource,80)||"",
    autocommitEnabled:source.autocommitEnabled?1:0,
    autopushEnabled:source.autopushEnabled?1:0,
    allowDirtyBaseline:source.allowDirtyBaseline?1:0,
    baseline:snapshotGitRepoStateForRuntime(source.baseline),
    current:snapshotGitRepoStateForRuntime(source.current),
    commit:{
      attempted:commit.attempted?1:0,
      status:safeString(commit.status,40)||"skipped",
      message:safeString(commit.message,160)||"",
      hash:safeString(commit.hash,40)||"",
    },
    push:{
      attempted:push.attempted?1:0,
      status:safeString(push.status,40)||"skipped",
      remoteName:safeString(push.remoteName,120)||"",
      branch:safeString(push.branch,120)||"",
      remoteConfigured:push.remoteConfigured?1:0,
    },
    startedAt:Number.isFinite(Number(source.startedAt))?Math.max(0,Math.trunc(Number(source.startedAt))):null,
    completedAt:Number.isFinite(Number(source.completedAt))?Math.max(0,Math.trunc(Number(source.completedAt))):null,
  };
}
function cloneTurnRecordSnapshot(snapshot){
  if(!snapshot||typeof snapshot!=="object")return null;
  return{
    ...snapshot,
  };
}
function summarizePlanningForTurnLog(planning){
  const source=planning&&typeof planning==="object"?planning:null;
  if(!source)return null;
  const selection=source.selection&&typeof source.selection==="object"?source.selection:null;
  const requirement=source.requirementContract&&typeof source.requirementContract==="object"?source.requirementContract:null;
  const dispatchPlan=source.dispatchPlan&&typeof source.dispatchPlan==="object"?source.dispatchPlan:null;
  return{
    schema:safeString(source.schema,60)||"",
    policyVersion:safeString(source.policyVersion,80)||"",
    selection:selection?{
      selectedMode:safeString(selection.selectedMode,40)||"",
      selectedPlanningDepth:safeString(selection.selectedPlanningDepth,60)||"",
      selectedAssuranceDepth:safeString(selection.selectedAssuranceDepth,60)||"",
      flowPath:safeString(selection.flowPath,80)||"",
      executionFlow:safeString(selection.executionFlow,120)||"",
      needsInputRecommended:selection.needsInputRecommended?1:0,
    }:null,
    requirementSummary:requirement?{
      acceptanceCheckCount:Array.isArray(requirement.acceptanceChecks)?requirement.acceptanceChecks.length:0,
      openQuestionCount:Array.isArray(requirement.openQuestions)?requirement.openQuestions.length:0,
      approvalBoundaryCount:Array.isArray(requirement.approvalBoundaryItems)?requirement.approvalBoundaryItems.length:0,
      userValueThesis:safeString(requirement.userValueFrame&&requirement.userValueFrame.valueThesis,240)||"",
      qualityAxisCount:Array.isArray(requirement.userValueFrame&&requirement.userValueFrame.qualityAxes)?requirement.userValueFrame.qualityAxes.length:0,
      mustAvoidCount:Array.isArray(requirement.userValueFrame&&requirement.userValueFrame.mustAvoid)?requirement.userValueFrame.mustAvoid.length:0,
    }:null,
    dispatchSummary:dispatchPlan?{
      proposalOnly:dispatchPlan.proposalOnly?1:0,
      reviewerRequired:dispatchPlan.reviewerRequired?1:0,
      testerRequired:dispatchPlan.testerRequired?1:0,
      signoffRequired:dispatchPlan.signoffRequired?1:0,
      dispatchCount:Array.isArray(dispatchPlan.dispatches)?dispatchPlan.dispatches.length:0,
    }:null,
  };
}
function safeJsonStringifyForConsole(value){
  try{
    return JSON.stringify(value);
  }catch(error){
    return JSON.stringify({
      serialization_error:safeString(error&&error.message?error.message:String(error),240)||"unknown_serialization_error",
      keys:value&&typeof value==="object"?Object.keys(value).slice(0,24):[],
    });
  }
}
function publishLatestTurnSnapshot(record,eventType){
  const snapshot=snapshotTurnRecord(record);
  if(!snapshot)return null;
  latestTurnSnapshot=snapshot;
  if(eventType){
    const logPayload={
      event_type:eventType,
      event_at:new Date().toISOString(),
      ...snapshot,
      planning:summarizePlanningForTurnLog(snapshot.planning),
    };
    console.log(`[turn-state] ${safeJsonStringifyForConsole(logPayload)}`);
  }
  try{
    updateCurrentLogSurface({trigger:eventType||"turn_snapshot"});
  }catch(error){
    logOperation("current_logs.update_failed",{
      trigger:safeString(eventType,80)||"turn_snapshot",
      err:summarizeErrorForOperationLog(error,220),
    },"core");
  }
  return snapshot;
}
function getLatestTurnSnapshot(){
  return cloneTurnRecordSnapshot(latestTurnSnapshot);
}
function summarizePersistedArtifactPath(targetPath){
  const normalized=safeString(targetPath,320)||"";
  if(normalized)return summarizePathForOperationLog(normalized,260)||normalized;
  return "";
}
function buildPersistedTurnSnapshot(record){
  const normalized=normalizeExecutionMemoryRecord(record);
  if(!normalized)return null;
  const auditRecord=harnessAuditMemoryStore.get(normalized.turnId);
  const artifactManifestPath=normalized.artifactManifestPath
    ||(auditRecord&&auditRecord.manifestPath?auditRecord.manifestPath:"")
    ||(normalized.evidenceManifestPath?path.join(path.dirname(resolveWorkspaceRuntimePath(normalized.evidenceManifestPath)),"manifest.json"):"");
  const artifactDir=normalized.artifactDir
    ||(auditRecord&&auditRecord.artifactDir?auditRecord.artifactDir:"")
    ||(artifactManifestPath?path.dirname(resolveWorkspaceRuntimePath(artifactManifestPath)):"");
  const terminalStatus=isTerminalExecutionState(normalized.status)?normalized.status:null;
  return{
    turn_id:normalized.turnId,
    thread_id:normalized.threadId||null,
    agent_name:normalized.agentName||null,
    cwd:summarizePersistedArtifactPath(normalized.cwd)||null,
    source:normalized.source||null,
    execution_profile:normalized.executionProfile,
    execution_intent:normalized.executionIntent,
    planning_mode:normalized.planningMode,
    planning_depth:normalized.planningDepth,
    assurance_depth:normalized.assuranceDepth,
    flow_path:normalized.flowPath,
    smoke_like_profile:normalized.smokeLikeProfile||isSmokeExecutionProfile(normalized.executionProfile)?1:0,
    full_utilization_defaults_ready:0,
    full_utilization_turn_ready:0,
    full_utilization_observed:0,
    parent_dispatch_guard:normalized.parentDispatchGuard||null,
    observed_signals:normalized.observedSignals,
    artifact_dir:summarizePersistedArtifactPath(artifactDir)||null,
    artifact_manifest_path:summarizePersistedArtifactPath(artifactManifestPath)||null,
    artifact_manifest_sha256:normalized.artifactManifestSha256||null,
    evidence_manifest_path:summarizePersistedArtifactPath(normalized.evidenceManifestPath)||null,
    stage_timeline_path:summarizePersistedArtifactPath(normalized.stageTimelinePath)||null,
    flow_trace_summary_path:summarizePersistedArtifactPath(normalized.flowTraceSummaryPath)||null,
    planning_decision_contract_path:summarizePersistedArtifactPath(normalized.planningDecisionContractPath)||null,
    review_load_breakdown_path:summarizePersistedArtifactPath(normalized.reviewLoadBreakdownPath)||null,
    request_frame_path:summarizePersistedArtifactPath(normalized.requestFramePath)||null,
    routing_decision_path:summarizePersistedArtifactPath(normalized.routingDecisionPath)||null,
    task_outcomes_path:summarizePersistedArtifactPath(normalized.taskOutcomesPath)||null,
    review_bundle_path:summarizePersistedArtifactPath(normalized.reviewBundlePath)||null,
    release_decision_path:summarizePersistedArtifactPath(normalized.releaseDecisionPath)||null,
    conformance_report_path:summarizePersistedArtifactPath(normalized.conformanceReportPath)||null,
    operator_view_summary_path:summarizePersistedArtifactPath(normalized.operatorViewSummaryPath)||null,
    release_decision_state:safeString(normalized.releaseDecisionState,80)||null,
    parent_material_implementation_observed:normalized.parentMaterialImplementationObserved?1:0,
    planning:null,
    visibility:null,
    status:normalized.status,
    terminal_status:terminalStatus,
    family_completion_gate:normalized.familyCompletionGate||null,
    task_outcome_status:normalized.taskOutcomeStatus||null,
    task_outcome_reason:normalized.taskOutcomeReason||null,
    terminal_event:normalized.status==="blocked"?"turn/blocked":"turn/completed",
    git_automation:null,
    started_at:normalized.startedAt||null,
    completed_at:normalized.completedAt||null,
    updated_at:normalized.updatedAt||nowTs(),
  };
}
function isOperatorSurfaceTurnSnapshot(snapshot){
  if(!snapshot||typeof snapshot!=="object")return false;
  const profile=normalizeExecutionProfile(snapshot.execution_profile,runtimeExecutionProfile);
  const intent=normalizeExecutionIntent(snapshot.execution_intent,"interactive");
  const loweredIntent=safeString(intent,120).toLowerCase();
  const agentName=safeString(snapshot.agent_name,160).toLowerCase();
  if(isSmokeExecutionProfile(profile))return false;
  if(profile==="proof-runtime")return false;
  if(isAuxiliaryOperatorRunContext(snapshot))return false;
  if(loweredIntent.includes("baseline"))return false;
  if(loweredIntent.includes("probe"))return false;
  if(loweredIntent.includes("operator-surface-refresh"))return false;
  if(loweredIntent.includes("web-ui"))return false;
  if(agentName.includes("@chat-"))return false;
  return true;
}
function getLatestPersistedTurnSnapshot({operatorSurfaceOnly=false}={}){
  if(!harnessMemoryLoaded){
    loadHarnessExecutionMemoryStore();
  }
  const records=[...harnessExecutionMemoryStore.values()]
    .map((entry)=>normalizeExecutionMemoryRecord(entry))
    .filter((entry)=>entry&&typeof entry==="object")
    .sort((left,right)=>Math.max(Number(right.completedAt||0),Number(right.updatedAt||0))-Math.max(Number(left.completedAt||0),Number(left.updatedAt||0)));
  const selected=operatorSurfaceOnly
    ?(records.find((entry)=>isOperatorSurfaceTurnSnapshot(buildPersistedTurnSnapshot(entry)))||null)
    :(records[0]||null);
  return buildPersistedTurnSnapshot(selected);
}
function getLatestOperatorTurnSnapshot(){
  const live=getLatestTurnSnapshot();
  if(isOperatorSurfaceTurnSnapshot(live))return live;
  return getLatestPersistedTurnSnapshot({operatorSurfaceOnly:true})||null;
}
function publishLatestGitAutomationSnapshot(result){
  const snapshot=snapshotGitAutomationResult(result);
  latestGitAutomationSnapshot=snapshot;
  return snapshot;
}
function getLatestGitAutomationSnapshot(){
  const snapshot=latestGitAutomationSnapshot;
  if(!snapshot||typeof snapshot!=="object")return null;
  return{
    ...snapshot,
  };
}
function buildGitAutomationRuntimeSnapshot(){
  return{
    enabled:gitAutomationConfig.enabled?1:0,
    mode:"completed-turn",
    autocommitEnabled:gitAutomationConfig.autocommitEnabled?1:0,
    autopushEnabled:gitAutomationConfig.autopushEnabled?1:0,
    allowDirtyBaseline:gitAutomationConfig.allowDirtyBaseline?1:0,
    remoteName:safeString(gitAutomationConfig.remoteName,120)||"origin",
    commitPrefix:safeString(gitAutomationConfig.commitPrefix,120)||"chore(codex):",
    commandTimeoutMs:Number.isFinite(Number(gitAutomationConfig.commandTimeoutMs))?Math.max(0,Math.trunc(Number(gitAutomationConfig.commandTimeoutMs))):0,
    pushTimeoutMs:Number.isFinite(Number(gitAutomationConfig.pushTimeoutMs))?Math.max(0,Math.trunc(Number(gitAutomationConfig.pushTimeoutMs))):0,
    envKeys:gitAutomationConfig&&gitAutomationConfig.envKeys&&typeof gitAutomationConfig.envKeys==="object"
      ?gitAutomationConfig.envKeys
      :{},
    latestResult:getLatestGitAutomationSnapshot(),
  };
}
function formatGitAutomationActivityDetail(result){
  const source=result&&typeof result==="object"?result:{};
  const repoLabel=safeString(source.repoRoot,220)||safeString(source.cwd,220)||"(unknown repo)";
  const status=safeString(source.status,80)||"unknown";
  const reason=safeString(source.reason,120);
  const commitHash=source.commit&&typeof source.commit==="object"?safeString(source.commit.hash,40):"";
  const pushStatus=source.push&&typeof source.push==="object"?safeString(source.push.status,40):"";
  const detail=[`repo=${repoLabel}`,`status=${status}`];
  if(commitHash)detail.push(`commit=${commitHash}`);
  if(pushStatus&&pushStatus!=="skipped")detail.push(`push=${pushStatus}`);
  if(reason)detail.push(`reason=${reason}`);
  return safeString(detail.join(" "),1200);
}
function parseOverviewTimestamp(value){
  const numeric=Number(value);
  if(Number.isFinite(numeric)&&numeric>0)return Math.max(0,Math.trunc(numeric));
  const raw=safeString(value,120);
  if(!raw)return 0;
  const parsed=Date.parse(raw);
  return Number.isFinite(parsed)&&parsed>0?Math.max(0,Math.trunc(parsed)):0;
}
function readJsonObjectFile(filePath){
  const target=safeString(filePath,400);
  if(!target)return null;
  try{
    if(!fs.existsSync(target))return null;
    const parsed=JSON.parse(fs.readFileSync(target,"utf8"));
    return parsed&&typeof parsed==="object"?parsed:null;
  }catch{
    return null;
  }
}
function listBundleSummaryCandidates(rootDir,summaryFileName){
  const candidates=[];
  try{
    if(!fs.existsSync(rootDir))return candidates;
    const entries=fs.readdirSync(rootDir,{withFileTypes:true});
    for(const entry of entries){
      if(!entry||typeof entry.name!=="string"||!entry.isDirectory())continue;
      const dirPath=path.join(rootDir,entry.name);
      const summaryPath=path.join(dirPath,summaryFileName);
      const summary=readJsonObjectFile(summaryPath);
      if(!summary)continue;
      let updatedAt=0;
      try{
        updatedAt=parseOverviewTimestamp(fs.statSync(summaryPath).mtimeMs);
      }catch{
        updatedAt=0;
      }
      candidates.push({
        name:entry.name,
        dirPath,
        summaryPath,
        summary,
        generatedAt:parseOverviewTimestamp(summary.generatedAt)||parseOverviewTimestamp(summary.generated_at),
        updatedAt,
      });
    }
  }catch{
    return[];
  }
  candidates.sort((left,right)=>{
    const leftTime=left.generatedAt||left.updatedAt||0;
    const rightTime=right.generatedAt||right.updatedAt||0;
    if(rightTime!==leftTime)return rightTime-leftTime;
    if((right.updatedAt||0)!==(left.updatedAt||0))return(right.updatedAt||0)-(left.updatedAt||0);
    return String(right.name||"").localeCompare(String(left.name||""));
  });
  return candidates;
}
function buildRuntimeProofBundleSnapshot(candidate){
  const summary=candidate&&candidate.summary&&typeof candidate.summary==="object"?candidate.summary:{};
  const runtime=summary.runtime&&typeof summary.runtime==="object"?summary.runtime:{};
  const liveExec=summary.liveExec&&typeof summary.liveExec==="object"?summary.liveExec:{};
  const observedSignals=liveExec.observedSignals&&typeof liveExec.observedSignals==="object"?liveExec.observedSignals:{};
  const probeReport=summary.probePersistence&&summary.probePersistence.report&&typeof summary.probePersistence.report==="object"
    ?summary.probePersistence.report
    :{};
  const probeRecords=Array.isArray(probeReport.records)?probeReport.records:[];
  return{
    kind:"runtime_proof",
    name:safeString(candidate&&candidate.name,160)||"",
    dir:summarizePathForOperationLog(candidate&&candidate.dirPath,260),
    summaryPath:summarizePathForOperationLog(candidate&&candidate.summaryPath,260),
    generatedAt:candidate&&candidate.generatedAt?candidate.generatedAt:0,
    updatedAt:candidate&&candidate.updatedAt?candidate.updatedAt:0,
    runtime:{
      requestUserInputPolicy:safeString(runtime&&runtime.nonInteractiveUserInput&&runtime.nonInteractiveUserInput.policy,40)||"",
      parentDispatchGuardMode:safeString(runtime&&runtime.parentDispatchGuard&&runtime.parentDispatchGuard.mode,20)||"",
      parentDispatchGuardMaxRetries:Number.isFinite(Number(runtime&&runtime.parentDispatchGuard&&runtime.parentDispatchGuard.maxRetries))
        ?Math.max(0,Math.trunc(Number(runtime.parentDispatchGuard.maxRetries)))
        :0,
      evalSuiteId:safeString(runtime&&runtime.evalHarness&&runtime.evalHarness.suite&&runtime.evalHarness.suite.suiteId,120)||"",
      evalCaseCount:Number.isFinite(Number(runtime&&runtime.evalHarness&&runtime.evalHarness.suite&&runtime.evalHarness.suite.caseCount))
        ?Math.max(0,Math.trunc(Number(runtime.evalHarness.suite.caseCount)))
        :0,
    },
    liveExec:{
      status:normalizeExecutionState(liveExec.status,{terminalFallback:true}),
      taskOutcomeStatus:safeString(liveExec.taskOutcomeStatus,80).toUpperCase()||"",
      taskOutcomeReason:safeString(liveExec.taskOutcomeReason,120)||"",
      fileChanges:Number.isFinite(Number(observedSignals.fileChanges))?Math.max(0,Math.trunc(Number(observedSignals.fileChanges))):0,
      dispatchCount:Number.isFinite(Number(observedSignals.dispatchCount))?Math.max(0,Math.trunc(Number(observedSignals.dispatchCount))):0,
      dispatchSuccessCount:Number.isFinite(Number(observedSignals.dispatchSuccessCount))?Math.max(0,Math.trunc(Number(observedSignals.dispatchSuccessCount))):0,
      collabCalls:Number.isFinite(Number(observedSignals.collabCalls))?Math.max(0,Math.trunc(Number(observedSignals.collabCalls))):0,
      proofFile:summarizePathForOperationLog(liveExec.proofFile,260),
      artifactManifestPath:summarizePathForOperationLog(liveExec.artifactManifestPath,260),
    },
    probePersistence:{
      persistedRecords:Number.isFinite(Number(probeReport.persistedRecords))?Math.max(0,Math.trunc(Number(probeReport.persistedRecords))):0,
      records:probeRecords.slice(0,6).map((record)=>({
        caseId:safeString(record&&record.caseId,120)||"",
        title:safeString(record&&record.title,200)||"",
        turnId:safeString(record&&record.turnId,160)||"",
        status:normalizeExecutionState(record&&record.status,{terminalFallback:true}),
        taskOutcomeStatus:safeString(record&&record.taskOutcomeStatus,80).toUpperCase()||"",
        taskOutcomeReason:safeString(record&&record.taskOutcomeReason,120)||"",
        parentDispatchGuard:record&&record.parentDispatchGuard&&typeof record.parentDispatchGuard==="object"
          ?{
            mode:safeString(record.parentDispatchGuard.mode,20)||"off",
            reason:safeString(record.parentDispatchGuard.reason,120)||"",
            required:record.parentDispatchGuard.required?1:0,
            satisfied:record.parentDispatchGuard.satisfied?1:0,
            violation:record.parentDispatchGuard.violation?1:0,
          }
          :null,
      })),
    },
  };
}
function buildSignoffBundleSnapshot(candidate){
  const summary=candidate&&candidate.summary&&typeof candidate.summary==="object"?candidate.summary:{};
  const runtime=summary.runtime&&typeof summary.runtime==="object"?summary.runtime:{};
  const coreHarnessWorkflow=summary.coreHarnessWorkflow&&typeof summary.coreHarnessWorkflow==="object"
    ?summary.coreHarnessWorkflow
    :{};
  const naturalTask=summary.naturalTask&&typeof summary.naturalTask==="object"?summary.naturalTask:{};
  const naturalAssertions=naturalTask.assertions&&typeof naturalTask.assertions==="object"?naturalTask.assertions:{};
  const rootAssertions=summary.assertions&&typeof summary.assertions==="object"?summary.assertions:{};
  return{
    kind:"signoff",
    name:safeString(candidate&&candidate.name,160)||"",
    bundlePath:repoRelativePath(workspaceRoot,candidate&&candidate.dirPath)||summarizePathForOperationLog(candidate&&candidate.dirPath,260),
    dir:summarizePathForOperationLog(candidate&&candidate.dirPath,260),
    summaryPath:summarizePathForOperationLog(candidate&&candidate.summaryPath,260),
    generatedAt:candidate&&candidate.generatedAt?candidate.generatedAt:0,
    updatedAt:candidate&&candidate.updatedAt?candidate.updatedAt:0,
    runtime:{
      executionProfile:normalizeExecutionProfile(runtime.executionProfile,runtimeExecutionProfile),
      requestUserInputPolicy:safeString(runtime&&runtime.nonInteractiveUserInput&&runtime.nonInteractiveUserInput.policy,40)||"",
      parentDispatchGuardMode:safeString(runtime&&runtime.parentDispatchGuard&&runtime.parentDispatchGuard.mode,20)||"",
      fullUtilizationReady:runtime&&runtime.fullUtilization&&runtime.fullUtilization.ready?1:0,
    },
    coreHarnessWorkflow:{
      runId:safeString(coreHarnessWorkflow.runId,160)||"",
      suiteId:safeString(coreHarnessWorkflow.suiteId,120)||"",
      sampleSize:Number.isFinite(Number(coreHarnessWorkflow.sampleSize))?Math.max(0,Math.trunc(Number(coreHarnessWorkflow.sampleSize))):0,
      passedCases:Number.isFinite(Number(coreHarnessWorkflow.passedCases))?Math.max(0,Math.trunc(Number(coreHarnessWorkflow.passedCases))):0,
      failedCases:Number.isFinite(Number(coreHarnessWorkflow.failedCases))?Math.max(0,Math.trunc(Number(coreHarnessWorkflow.failedCases))):0,
      passRate:Number.isFinite(Number(coreHarnessWorkflow.passRate))?Number(Number(coreHarnessWorkflow.passRate).toFixed(4)):0,
      scoreRate:Number.isFinite(Number(coreHarnessWorkflow.scoreRate))?Number(Number(coreHarnessWorkflow.scoreRate).toFixed(4)):0,
    },
    naturalTask:{
      turnId:safeString(naturalTask.turnId,160)||"",
      threadId:safeString(naturalTask.threadId,160)||"",
      targetPath:summarizePathForOperationLog(naturalTask.targetPath,260),
      artifactManifestPath:summarizePathForOperationLog(naturalTask.artifactManifestPath,260),
      parentDispatchSatisfied:naturalAssertions.parentDispatchSatisfied?1:0,
      dispatchCountObserved:naturalAssertions.dispatchCountObserved?1:0,
      implementationObserved:naturalAssertions.implementationObserved?1:0,
      reviewerObserved:naturalAssertions.reviewerObserved?1:0,
    },
    assertions:{
      runtimePostureSafe:rootAssertions.runtimePostureSafe?1:0,
      coreHarnessWorkflowPassed:rootAssertions.coreHarnessWorkflowPassed?1:0,
      naturalTaskTracePassed:rootAssertions.naturalTaskTracePassed?1:0,
      allPassed:summary.allPassed?1:0,
    },
  };
}
function buildBundleOverview(rootDir,summaryFileName,buildSnapshot){
  const candidates=listBundleSummaryCandidates(rootDir,summaryFileName);
  return{
    storageRoot:summarizePathForOperationLog(rootDir,220),
    bundleCount:candidates.length,
    latest:candidates.length?buildSnapshot(candidates[0]):null,
    recent:candidates.slice(0,5).map((candidate)=>({
      name:safeString(candidate&&candidate.name,160)||"",
      dir:summarizePathForOperationLog(candidate&&candidate.dirPath,260),
      summaryPath:summarizePathForOperationLog(candidate&&candidate.summaryPath,260),
      generatedAt:candidate&&candidate.generatedAt?candidate.generatedAt:0,
      updatedAt:candidate&&candidate.updatedAt?candidate.updatedAt:0,
    })),
  };
}
function buildEvalHistoryOverview({limit=6}={}){
  return readEvalRunHistory({limit:Math.max(1,Math.min(20,Math.trunc(Number(limit)||6)))})
    .slice()
    .reverse()
    .map((entry)=>{
      const run=Array.isArray(entry&&entry.runs)?entry.runs[0]:null;
      const suite=entry&&entry.suite&&typeof entry.suite==="object"?entry.suite:{};
      return{
        runId:safeString(entry&&entry.runId,160)||"",
        generatedAt:parseOverviewTimestamp(entry&&entry.generatedAt),
        suiteId:safeString(suite.suiteId,120)||"",
        caseCount:Number.isFinite(Number(suite.caseCount))?Math.max(0,Math.trunc(Number(suite.caseCount))):0,
        variantLabel:safeString(run&&run.variant&&run.variant.label,80)||"",
        sampleSize:Number.isFinite(Number(run&&run.sampleSize))?Math.max(0,Math.trunc(Number(run.sampleSize))):0,
        passedCases:Number.isFinite(Number(run&&run.passedCases))?Math.max(0,Math.trunc(Number(run.passedCases))):0,
        failedCases:Number.isFinite(Number(run&&run.failedCases))?Math.max(0,Math.trunc(Number(run.failedCases))):0,
        passRate:Number.isFinite(Number(run&&run.passRate))?Number(Number(run.passRate).toFixed(4)):0,
        scoreRate:Number.isFinite(Number(run&&run.scoreRate))?Number(Number(run.scoreRate).toFixed(4)):0,
        probePersistedRecords:Number.isFinite(Number(entry&&entry.probePersistence&&entry.probePersistence.persistedRecords))
          ?Math.max(0,Math.trunc(Number(entry.probePersistence.persistedRecords)))
          :0,
      };
    });
}
function buildExecutionMemoryOverview({limit=10,window=60}={}){
  const normalizedWindow=Math.max(1,Math.min(200,Math.trunc(Number(window)||60)));
  const normalizedLimit=Math.max(1,Math.min(20,Math.trunc(Number(limit)||10)));
  const records=[...harnessExecutionMemoryStore.values()]
    .map((entry)=>normalizeExecutionMemoryRecord(entry))
    .filter((entry)=>entry&&typeof entry==="object")
    .sort((left,right)=>Math.max(Number(right.completedAt||0),Number(right.updatedAt||0))-Math.max(Number(left.completedAt||0),Number(left.updatedAt||0)));
  const windowRecords=records.slice(0,normalizedWindow);
  const statusCounts={};
  const taskOutcomeCounts={};
  let guardViolations=0;
  let implementationObserved=0;
  for(const record of windowRecords){
    const status=normalizeExecutionState(record.status,{terminalFallback:true});
    statusCounts[status]=(statusCounts[status]||0)+1;
    const taskOutcome=safeString(record.taskOutcomeStatus,80).toUpperCase()||"UNSPECIFIED";
    taskOutcomeCounts[taskOutcome]=(taskOutcomeCounts[taskOutcome]||0)+1;
    if(record.parentDispatchGuard&&record.parentDispatchGuard.violation)guardViolations+=1;
    if(record.observedSignals&&(
      Number(record.observedSignals.fileChanges||0)>0
      ||Number(record.observedSignals.commandExecutions||0)>0
      ||Number(record.observedSignals.mcpCalls||0)>0
    )){
      implementationObserved+=1;
    }
  }
  const recent=records.slice(0,normalizedLimit).map((record)=>({
    turnId:record.turnId,
    threadId:record.threadId,
    agentName:record.agentName,
    status:record.status,
    taskOutcomeStatus:record.taskOutcomeStatus,
    taskOutcomeReason:record.taskOutcomeReason,
    executionProfile:record.executionProfile,
    executionIntent:record.executionIntent,
    executionSource:record.executionSource,
    completedAt:record.completedAt,
    fileChanges:Number.isFinite(Number(record.observedSignals&&record.observedSignals.fileChanges))
      ?Math.max(0,Math.trunc(Number(record.observedSignals.fileChanges)))
      :0,
    commandExecutions:Number.isFinite(Number(record.observedSignals&&record.observedSignals.commandExecutions))
      ?Math.max(0,Math.trunc(Number(record.observedSignals.commandExecutions)))
      :0,
    collabCalls:Number.isFinite(Number(record.observedSignals&&record.observedSignals.collabCalls))
      ?Math.max(0,Math.trunc(Number(record.observedSignals.collabCalls)))
      :0,
    dispatchCount:Number.isFinite(Number(record.observedSignals&&record.observedSignals.dispatchCount))
      ?Math.max(0,Math.trunc(Number(record.observedSignals.dispatchCount)))
      :0,
    dispatchSuccessCount:Number.isFinite(Number(record.observedSignals&&record.observedSignals.dispatchSuccessCount))
      ?Math.max(0,Math.trunc(Number(record.observedSignals.dispatchSuccessCount)))
      :0,
    parentDispatchGuard:{
      mode:safeString(record.parentDispatchGuard&&record.parentDispatchGuard.mode,20)||"off",
      reason:safeString(record.parentDispatchGuard&&record.parentDispatchGuard.reason,120)||"",
      required:record.parentDispatchGuard&&record.parentDispatchGuard.required?1:0,
      satisfied:record.parentDispatchGuard&&record.parentDispatchGuard.satisfied?1:0,
      violation:record.parentDispatchGuard&&record.parentDispatchGuard.violation?1:0,
    },
  }));
  const patterns=[...harnessPatternMemoryStore.values()]
    .filter((entry)=>entry&&typeof entry==="object")
    .sort((left,right)=>{
      const rightCount=Number(right.count||0);
      const leftCount=Number(left.count||0);
      if(rightCount!==leftCount)return rightCount-leftCount;
      return Number(right.updatedAt||0)-Number(left.updatedAt||0);
    })
    .slice(0,6)
    .map((entry)=>({
      signature:safeString(entry.signature,220)||"",
      code:safeString(entry.code,120)||"",
      severity:safeString(entry.severity,20)||"",
      status:normalizeExecutionState(entry.status,{terminalFallback:true}),
      executionProfile:normalizeExecutionProfile(entry.executionProfile,runtimeExecutionProfile),
      executionIntent:normalizeExecutionIntent(entry.executionIntent,"interactive"),
      count:Number.isFinite(Number(entry.count))?Math.max(0,Math.trunc(Number(entry.count))):0,
      lastSeenAt:parseOverviewTimestamp(entry.lastSeenAt),
      hint:safeString(entry.hint,220)||"",
    }));
  return{
    sampleSize:windowRecords.length,
    statusCounts,
    taskOutcomeCounts,
    guardViolations,
    implementationObserved,
    recent,
    patterns,
  };
}
function overviewBaseAgentName(name){
  const normalized=safeString(name,120).toLowerCase();
  if(!normalized)return"";
  const scopeSep=normalized.indexOf("@");
  if(scopeSep>0)return normalized.slice(0,scopeSep);
  return normalized;
}
function compareOverviewAgentEntries(left,right){
  const leftActive=left&&left.active?1:0;
  const rightActive=right&&right.active?1:0;
  if(rightActive!==leftActive)return rightActive-leftActive;
  const leftConfigured=left&&left.source==="configured"?1:0;
  const rightConfigured=right&&right.source==="configured"?1:0;
  if(rightConfigured!==leftConfigured)return rightConfigured-leftConfigured;
  return String(left&&left.name||"").localeCompare(String(right&&right.name||""));
}
function buildTopographyOverview(topographyAgents,assignmentsByRole){
  const rows=Array.isArray(topographyAgents)?topographyAgents:[];
  const summary={
    total:0,
    configured:0,
    runtimeOnly:0,
    active:0,
    parents:0,
    specialists:0,
    verification:0,
    retired:0,
    scopedRuntime:0,
  };
  const lanes={parents:[],specialists:[],verification:[],retired:[]};
  const entries=rows.map((row)=>{
    const governance=row&&row.governance&&typeof row.governance==="object"?row.governance:{};
    const baseName=overviewBaseAgentName(row&&row.name);
    const role=safeString(row&&row.role,40)||inferAgentRole(baseName,"");
    let lane="specialists";
    if(governance.legacyOnly){
      lane="retired";
    }else if(governance.verificationOnly||governance.readOnly){
      lane="verification";
    }else if(role==="parent"){
      lane="parents";
    }
    const entry={
      name:safeString(row&&row.name,120)||"",
      baseName,
      role,
      lane,
      source:safeString(row&&row.source,40)||"runtime",
      status:safeString(row&&row.status,40)||"idle",
      active:row&&row.isActive?1:0,
      threadId:safeString(row&&row.threadId,160)||"",
      activeTurnId:safeString(row&&row.activeTurnId,160)||"",
      sessionRef:safeString(row&&row.sessionRef,160)||"",
      description:safeString(row&&row.description,400)||"",
      configFile:safeString(row&&row.configFile,240)||"",
      skills:assignmentsByRole.get(baseName)||[],
      governance:{
        enforced:governance.enforced?1:0,
        readOnly:governance.readOnly?1:0,
        verificationOnly:governance.verificationOnly?1:0,
        legacyOnly:governance.legacyOnly?1:0,
        requiresParentOverride:governance.requiresParentOverride?1:0,
        scopePaths:Array.isArray(governance.scopePaths)?governance.scopePaths.slice(0,8):[],
      },
    };
    return entry;
  }).sort(compareOverviewAgentEntries);
  for(const entry of entries){
    summary.total+=1;
    if(entry.source==="configured")summary.configured+=1;
    else summary.runtimeOnly+=1;
    if(entry.active)summary.active+=1;
    if(entry.name.includes("@"))summary.scopedRuntime+=1;
    if(entry.lane==="parents")summary.parents+=1;
    else if(entry.lane==="verification")summary.verification+=1;
    else if(entry.lane==="retired")summary.retired+=1;
    else summary.specialists+=1;
    lanes[entry.lane].push(entry);
  }
  return{summary,lanes,agents:entries};
}
function buildSkillPortfolioOverview(){
  const policy=loadSkillPortfolioPolicy();
  const catalog=loadSkillCatalog();
  const outcomeInfo=parseOutcomeEventsFromJsonl(defaultSkillOutcomesPath);
  const report=evaluateSkillPortfolio({policy,catalog,outcomeEvents:outcomeInfo.events});
  const assignments=Object.entries(catalog&&catalog.assignments&&typeof catalog.assignments==="object"?catalog.assignments:{})
    .map(([role,skills])=>({
      role:safeString(role,120)||"",
      skills:Array.isArray(skills)?skills.map((entry)=>safeString(entry,120)).filter(Boolean):[],
    }))
    .filter((entry)=>entry.role)
    .sort((left,right)=>left.role.localeCompare(right.role));
  return{
    status:safeString(report&&report.status,40)||"FAIL",
    policy:{
      schema:safeString(policy&&policy.schema,120)||"",
      version:safeString(policy&&policy.version,120)||"",
      path:summarizePathForOperationLog(policy&&policy.policyPath,220),
      source:safeString(policy&&policy.source,40)||"",
    },
    catalog:{
      schema:safeString(catalog&&catalog.schema,120)||"",
      version:safeString(catalog&&catalog.version,120)||"",
      path:summarizePathForOperationLog(catalog&&catalog.catalogPath,220),
      source:safeString(catalog&&catalog.source,40)||"",
      updatedAt:safeString(catalog&&catalog.updatedAt,40)||"",
    },
    outcomeEvents:{
      path:summarizePathForOperationLog(outcomeInfo&&outcomeInfo.path,220),
      source:safeString(outcomeInfo&&outcomeInfo.source,40)||"",
      count:Array.isArray(outcomeInfo&&outcomeInfo.events)?outcomeInfo.events.length:0,
      parseErrors:Array.isArray(outcomeInfo&&outcomeInfo.parseErrors)?outcomeInfo.parseErrors.slice(0,8):[],
    },
    portfolio:report&&report.portfolio&&typeof report.portfolio==="object"?report.portfolio:{},
    roleChecks:Array.isArray(report&&report.roleChecks)
      ?report.roleChecks.map((entry)=>({
        role:safeString(entry&&entry.role,120)||"",
        pass:entry&&entry.pass?1:0,
        assignedCount:Number.isFinite(Number(entry&&entry.assignedCount))?Math.max(0,Math.trunc(Number(entry.assignedCount))):0,
        minSkills:Number.isFinite(Number(entry&&entry.minSkills))?Math.max(0,Math.trunc(Number(entry.minSkills))):0,
        missingClasses:Array.isArray(entry&&entry.missingClasses)?entry.missingClasses.slice(0,8):[],
        missingSkills:Array.isArray(entry&&entry.missingSkills)?entry.missingSkills.slice(0,8):[],
      }))
      :[],
    issues:Array.isArray(report&&report.issues)?report.issues.slice(0,10):[],
    warnings:Array.isArray(report&&report.warnings)?report.warnings.slice(0,10):[],
    missingProposals:Array.isArray(report&&report.missingProposals)?report.missingProposals.slice(0,10):[],
    assignments,
  };
}
function buildRuntimeApiSnapshot(){
  const active=getActiveAgentState();
  const latestTurn=getLatestTurnSnapshot();
  const requirementGuard=getRequirementGuardExtensionSnapshot();
  const sessionPerformance=getSessionPerformanceSnapshot(active&&active.sessionRef?active.sessionRef:null);
  const nonInteractiveUserInput={policy:nonInteractiveRequestUserInputPolicy,envKey:requestUserInputPolicyEnvKey};
  const adversarialShadow=buildAdversarialShadowRuntimeSnapshot();
  const harnessMemory=buildHarnessMemoryRuntimeSnapshot();
  const workspaceGuard=buildWorkspaceGuardSnapshot();
  const slo=buildSloRuntimeSnapshot();
  const staticApps=buildStaticAppsRuntimeSnapshot();
  const gitAutomation=buildGitAutomationRuntimeSnapshot();
  const evalHarness={
    suite:buildEvalSuiteSummary(defaultEvalSuite),
    configPath:summarizePathForOperationLog(evalSuiteConfigPath,220),
    historyPath:summarizePathForOperationLog(evalRunHistoryPath,220),
    historyEnvKey:evalRunHistoryPathEnvKey,
    maxCases:evalMaxCases,
    maxVariants:evalDefaultMaxVariants,
    caseTimeoutMs:evalCaseTimeoutMs,
  };
  const fullUtilization=buildFullUtilizationDefaultsSnapshot();
  const parentDispatchGuard=buildParentDispatchGuardDefaultsSnapshot();
  const executionVisibility={
    profile:runtimeExecutionProfile,
    envKey:executionProfileEnvKey,
    smokeLikeProfile:isSmokeExecutionProfile(runtimeExecutionProfile)?1:0,
    fullUtilization,
    parentDispatchGuard,
  };
  return{
    apiVersion,
    mode:"app-server",
    workspaceRoot,
    activeAgent:activeAgentName,
    sessionRef:active?active.sessionRef:null,
    agentCount:agentStates.size,
    experimental:active?active.experimentalEnabled:false,
    experimentalFeatures:active?Array.from(active.experimentalFeatures||[]):[],
    serviceTier:active?resolveEffectiveServiceTier(active):nonFastEffectiveServiceTier,
    fastModeEnabled:active?Boolean(active.fastModeEnabled):fastModeDefault,
    automaticApprovalReviewEnabled:active?Boolean(active.automaticApprovalReviewEnabled):automaticApprovalReviewDefault,
    agents:listAgentsSnapshot(),
    requirementGuard,
    requirement_guard:requirementGuard,
    latestTurn,
    latest_turn:latestTurn,
    sessionPerformance,
    session_performance:sessionPerformance,
    operationLog:operationLog.runtimeSnapshot(),
    loggingSurface:{
      mode:loggingMode,
      envKey:loggingModeEnvKey,
      currentRoot:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentRoot),
      bundlesRoot:repoRelativePath(workspaceRoot,loggingSurfacePaths.bundlesRoot),
      archiveRoot:repoRelativePath(workspaceRoot,loggingSurfacePaths.archiveRoot),
    },
    executionProfile:runtimeExecutionProfile,
    execution_profile:runtimeExecutionProfile,
    executionVisibility,
    execution_visibility:executionVisibility,
    fullUtilization,
    full_utilization:fullUtilization,
    parentDispatchGuard,
    parent_dispatch_guard:parentDispatchGuard,
    nonInteractiveUserInput,
    non_interactive_user_input:nonInteractiveUserInput,
    operatorDefaults:{
      fastModeEnabled:fastModeDefault,
      automaticApprovalReviewEnabled:automaticApprovalReviewDefault,
      envKeys:{
        fastModeDefault:fastModeDefaultEnvKey,
        automaticApprovalReview:automaticApprovalReviewEnvKey,
      },
    },
    adversarialShadow,
    adversarial_shadow:adversarialShadow,
    staticApps,
    static_apps:staticApps,
    gitAutomation,
    git_automation:gitAutomation,
    harnessMemory,
    harness_memory:harnessMemory,
    slo,
    evalHarness,
    eval_harness:evalHarness,
    contractSpec:{
      schema:safeString(harnessTurnContractSpec&&harnessTurnContractSpec.schema,80)||"harness-turn-contract.v1",
      path:summarizePathForOperationLog(harnessTurnContractSpecPath,220),
      terminalEvent:safeString(harnessTurnContractSpec&&harnessTurnContractSpec.turn&&harnessTurnContractSpec.turn.terminalEvent,120)||"turn/completed",
      releaseDecisionStates:Array.isArray(harnessTurnContractSpec&&harnessTurnContractSpec.releaseDecisionStates)?harnessTurnContractSpec.releaseDecisionStates:[],
      taskOutcomeBridge:harnessTurnContractSpec&&harnessTurnContractSpec.taskOutcomeBridge
        ?harnessTurnContractSpec.taskOutcomeBridge
        :{allowedByTurnState:{}},
    },
    taskOutcomeContract:{
      ...summarizeTaskOutcomeContract(taskOutcomeContract),
      path:summarizePathForOperationLog(taskOutcomeContractPath,220),
    },
    userFacingResponseContract:{
      ...summarizeUserFacingResponseContract(userFacingResponseContract),
      path:summarizePathForOperationLog(userFacingResponseContractPath,220),
    },
    planningContracts:{
      schema:safeString(planningModeContract&&planningModeContract.schema,80)||"planning-mode-contract.v1",
      version:safeString(planningModeContract&&planningModeContract.version,80)||"",
      path:summarizePathForOperationLog(planningModeContractPath,220),
      assuranceSchema:safeString(assuranceModeContract&&assuranceModeContract.schema,80)||"assurance-mode-contract.v1",
      assuranceVersion:safeString(assuranceModeContract&&assuranceModeContract.version,80)||"",
      assurancePath:summarizePathForOperationLog(assuranceModeContractPath,220),
      familyProfileSchema:safeString(taskFamilyProfilesContract&&taskFamilyProfilesContract.schema,80)||"task-family-profiles.v1",
      familyProfileVersion:safeString(taskFamilyProfilesContract&&taskFamilyProfilesContract.version,80)||"",
      familyProfilePath:summarizePathForOperationLog(taskFamilyProfilesPath,220),
      planningDecisionSchemaPath:summarizePathForOperationLog(planningDecisionContractSchemaPath,220),
      requirementSchemaPath:summarizePathForOperationLog(requirementContractSchemaPath,220),
      dispatchSchemaPath:summarizePathForOperationLog(dispatchPlanSchemaPath,220),
      requestFrameContractPath:summarizePathForOperationLog(requestFrameContractPath,220),
      routingDecisionContractPath:summarizePathForOperationLog(routingDecisionContractPath,220),
      discoveryOutcomeContractPath:summarizePathForOperationLog(discoveryOutcomeContractPath,220),
      reviewBundleContractPath:summarizePathForOperationLog(reviewBundleContractPath,220),
      releaseDecisionContractPath:summarizePathForOperationLog(releaseDecisionContractPath,220),
      conformanceInvariantsContractPath:summarizePathForOperationLog(conformanceInvariantsContractPath,220),
      evidenceContractMachinePath:summarizePathForOperationLog(evidenceContractMachinePath,220),
      modes:Array.isArray(planningModeContract&&planningModeContract.modes)?planningModeContract.modes:[],
      assuranceModes:Array.isArray(assuranceModeContract&&assuranceModeContract.modes)?assuranceModeContract.modes:[],
      families:Array.isArray(taskFamilyProfilesContract&&taskFamilyProfilesContract.families)
        ?taskFamilyProfilesContract.families.map((entry)=>safeString(entry&&entry.id,80)).filter(Boolean)
        :[],
    },
    intentFirst:{
      ...summarizeIntentFirstRuntime({contract:designAcceptanceContract,store:tasteMemoryStore}),
      contractPath:summarizePathForOperationLog(designAcceptanceContractPath,220),
      tasteMemorySeedPath:summarizePathForOperationLog(tasteMemorySeedPath,220),
      tasteMemoryPath:summarizePathForOperationLog(tasteMemoryMemoryPath,220),
    },
    workspaceGuard,
    workspace_guard:workspaceGuard,
    controlApi:{
      tokenHeader:controlApiTokenHeaderName,
      token:controlApiToken,
      originCheck:true,
      actionAllowlist:Array.from(controlApiActionAllowlist),
    },
    execApi:{
      tokenHeader:controlApiTokenHeaderName,
      tokenRequired:true,
      originCheck:true,
      contentType:execApiRequiredContentType,
      idempotencyStatusApi:"/api/exec/idempotency/:key",
      replayApi:{
        listPath:"/api/replay/turns",
        getPath:"/api/replay/turn/:turnId",
        runPath:"POST /api/replay/turn",
      },
      evalApi:{
        suitesPath:"/api/eval/suites",
        runPath:"POST /api/eval/run",
        historyPath:"/api/eval/history",
      },
      sloApi:"/api/slo/status",
      defaultModel:defaultExecModelName,
      modelReasoningEffort:defaultExecModelReasoningEffort,
      supportedModelReasoningEfforts:Array.from(allowedModelReasoningEfforts),
    },
    conversationApi:getConversationRuntimeSnapshot(),
    piperVoiceApi:getPiperRuntimeSnapshot({workspaceRoot}),
    piper_voice_api:getPiperRuntimeSnapshot({workspaceRoot}),
    kokoroVoiceApi:getKokoroVoiceRuntimeSnapshot(),
    kokoro_voice_api:getKokoroVoiceRuntimeSnapshot(),
    evidenceArtifacts:{
      enabled:turnArtifactsEnabled,
      root:summarizePathForOperationLog(turnArtifactsRoot,220),
      maxBytes:turnArtifactsMaxBytes,
      maxDays:turnArtifactsMaxDays,
      redaction:{
        enabled:turnArtifactsRedactionEnabled?1:0,
        placeholder:turnArtifactsRedactionPlaceholder,
      },
    },
    idempotency:{
      ttlMs:execIdempotencyTtlMs,
      persistent:true,
      storage:summarizePathForOperationLog(harnessMemoryPath,220),
      statusApi:{
        path:"/api/exec/idempotency/:key",
        waitMaxMs:execIdempotencyStatusWaitMaxMs,
      },
    },
    governancePolicy:getAgentGovernancePolicySnapshot(),
  };
}
function sanitizeRuntimeSnapshotForOverview(runtimeSnapshot){
  const source=runtimeSnapshot&&typeof runtimeSnapshot==="object"?runtimeSnapshot:{};
  let cloned={};
  try{
    cloned=JSON.parse(JSON.stringify(source));
  }catch{
    cloned={...source};
  }
  if(cloned.controlApi&&typeof cloned.controlApi==="object"){
    cloned.controlApi={
      ...cloned.controlApi,
      token:"",
      tokenRedacted:1,
    };
  }
  return cloned;
}
function buildHarnessOverviewSnapshot(){
  if(!harnessMemoryLoaded){
    loadHarnessExecutionMemoryStore();
  }
  const runtime=sanitizeRuntimeSnapshotForOverview(buildRuntimeApiSnapshot());
  const skillPortfolio=buildSkillPortfolioOverview();
  const assignmentsByRole=new Map(skillPortfolio.assignments.map((entry)=>[entry.role,entry.skills]));
  const topology=buildTopographyOverview(getAgentTopographySnapshot(),assignmentsByRole);
  return{
    apiVersion,
    mode:"harness-overview",
    generatedAt:Date.now(),
    workspaceRoot,
    pages:{
      console:"/01.HarnesUI/index.html",
      overview:"/01.HarnesUI/overview.html",
    },
    apis:{
      runtime:"/api/runtime",
      overview:"/api/harness/overview",
      topography:"/api/agent-topography",
      conversationRuntime:"/api/conversation/runtime",
      evalSuites:"/api/eval/suites",
      evalHistory:"/api/eval/history",
      replayTurns:"/api/replay/turns",
      sloStatus:"/api/slo/status",
    },
    runtime,
    topology,
    contracts:{
      governance:runtime.governancePolicy,
      turn:runtime.contractSpec,
      taskOutcome:runtime.taskOutcomeContract,
      planning:runtime.planningContracts,
    },
    evidence:{
      current:{
        root:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentRoot),
        operatorSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentOperatorSummaryPath),
        indexPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentIndexPath),
        designConformanceSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentDesignConformancePath),
        latestRunSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestRunSummaryPath),
        reviewLoadBreakdownPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentReviewLoadBreakdownPath),
        latestSignoffSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestSignoffSummaryPath),
      },
      runtimeProof:buildBundleOverview(runtimeProofsRoot,"runtime_proof_summary.json",buildRuntimeProofBundleSnapshot),
      signoff:buildBundleOverview(signoffBundlesRoot,"signoff_summary.json",buildSignoffBundleSnapshot),
    },
    eval:{
      suite:runtime.evalHarness&&runtime.evalHarness.suite?runtime.evalHarness.suite:{},
      recentRuns:buildEvalHistoryOverview({limit:6}),
    },
    memory:{
      harness:runtime.harnessMemory,
      execution:buildExecutionMemoryOverview({limit:10,window:60}),
      replay:{
        recent:listReplayMemorySnapshots({limit:6}),
      },
    },
    health:{
      latestTurn:runtime.latestTurn,
      fullUtilization:runtime.fullUtilization,
      slo:runtime.slo,
    },
    skillPortfolio,
  };
}
function resolveWorkspaceRuntimePath(targetPath){
  const raw=safeString(targetPath,400);
  if(!raw)return"";
  if(path.isAbsolute(raw))return path.normalize(raw);
  return path.normalize(path.join(workspaceRoot,raw));
}
function readWorkspaceJsonArtifact(targetPath){
  const resolved=resolveWorkspaceRuntimePath(targetPath);
  if(!resolved)return null;
  return readJsonObjectFile(resolved)||readLoggingSurfaceJson(resolved);
}
function isLikelyChangedPath(entry){
  const value=safeString(entry,260);
  if(!value)return false;
  if(/\s{2,}/.test(value)&&!/[\\/]/.test(value))return false;
  if(!/[\\/]/.test(value)&&!/^[A-Za-z]:/.test(value))return false;
  return true;
}
function collectChangedPathsFromArtifacts({manifest,evidenceManifest,flowTraceSummary}={}){
  const manifestObserved=manifest&&manifest.execution&&manifest.execution.observed&&typeof manifest.execution.observed==="object"
    ?manifest.execution.observed
    :{};
  const childEvidenceLedger=Array.isArray(evidenceManifest&&evidenceManifest.childEvidenceLedger)
    ?evidenceManifest.childEvidenceLedger
    :Array.isArray(flowTraceSummary&&flowTraceSummary.childEvidenceLedger)
      ?flowTraceSummary.childEvidenceLedger
      :[];
  return uniquePathList([
    ...(Array.isArray(manifestObserved.changedPaths)?manifestObserved.changedPaths:[]),
    ...(Array.isArray(manifestObserved.sampleChangedPaths)?manifestObserved.sampleChangedPaths:[]),
    ...childEvidenceLedger.flatMap((entry)=>Array.isArray(entry&&entry.ownedPaths)?entry.ownedPaths:[]),
  ].filter(isLikelyChangedPath),24);
}
function buildLatestBundleReference(rootDir,summaryFileName,buildSnapshot){
  const candidates=listBundleSummaryCandidates(rootDir,summaryFileName);
  if(!candidates.length)return null;
  const candidate=candidates[0];
  const snapshot=buildSnapshot(candidate);
  return{
    ...snapshot,
    bundlePath:repoRelativePath(workspaceRoot,candidate.dirPath),
    summaryPath:repoRelativePath(workspaceRoot,candidate.summaryPath),
  };
}
function toOperatorCanonicalKey(key){
  const raw=safeString(key,160);
  if(!raw)return"";
  return raw.replace(/_([a-z0-9])/g,(_,char)=>String(char).toUpperCase());
}
function isOperatorEmptyValue(value){
  if(value==null)return true;
  if(typeof value==="string")return !value.trim();
  if(Array.isArray(value))return value.length===0;
  if(typeof value==="object")return !Array.isArray(value)&&Object.keys(value).length===0;
  return false;
}
function canonicalizeOperatorFacingValue(value){
  if(Array.isArray(value))return value.map((entry)=>canonicalizeOperatorFacingValue(entry));
  if(!value||typeof value!=="object")return value;
  const source=value&&typeof value==="object"?value:{};
  const result={};
  const keys=Object.keys(source).sort((left,right)=>{
    const leftSnake=left.includes("_")?1:0;
    const rightSnake=right.includes("_")?1:0;
    return leftSnake-rightSnake;
  });
  for(const key of keys){
    const canonicalKey=toOperatorCanonicalKey(key)||key;
    const normalizedValue=canonicalizeOperatorFacingValue(source[key]);
    if(Object.prototype.hasOwnProperty.call(result,canonicalKey)){
      if(isOperatorEmptyValue(result[canonicalKey])&&!isOperatorEmptyValue(normalizedValue)){
        result[canonicalKey]=normalizedValue;
      }
      continue;
    }
    result[canonicalKey]=normalizedValue;
  }
  return result;
}
function isCompletedOperatorOutcome(finalOutcome){
  const taskOutcomeStatus=safeString(finalOutcome&&finalOutcome.taskOutcomeStatus,80).toUpperCase();
  if(taskOutcomeStatus==="COMPLETED")return true;
  return safeString(finalOutcome&&finalOutcome.status,40).toLowerCase()==="completed";
}
function normalizeOperatorResidualSemantics({finalOutcome,residualRisks}={}){
  const notes=Array.isArray(residualRisks)?residualRisks.map((entry)=>safeString(entry,320)).filter(Boolean):[];
  const completed=isCompletedOperatorOutcome(finalOutcome);
  const blockerPattern=/(implementation is intentionally paused|user decision|open questions|needs[_\s-]?input|awaiting approval|awaiting user|unresolved blocker|blocked\b|before signoff|requires dedicated verification)/i;
  const normalized={
    residualRisks:[],
    informationalNotes:[],
    operatorCaveats:[],
  };
  for(const note of notes){
    if(completed&&blockerPattern.test(note)){
      normalized.informationalNotes.push(
        /implementation is intentionally paused until user decisions resolve the open questions/i.test(note)
          ?"Historical planning note only: discovery handling originally surfaced open questions, but this recorded run completed without an unresolved user-decision blocker."
          :/requires dedicated verification before signoff/i.test(note)
            ?"Historical planning note only: dedicated verification was required for signoff and has already been satisfied on this completed run."
          :`Historical planning note only: ${note}`
      );
      continue;
    }
    normalized.residualRisks.push(note);
  }
  return{
    residualRisks:Array.from(new Set(normalized.residualRisks)).slice(0,12),
    informationalNotes:Array.from(new Set(normalized.informationalNotes)).slice(0,12),
    operatorCaveats:Array.from(new Set(normalized.operatorCaveats)).slice(0,12),
  };
}
function isSignoffSummaryAllPassed(signoffSummary){
  if(!signoffSummary||typeof signoffSummary!=="object")return false;
  if(typeof signoffSummary.allPassed!=="undefined"){
    return signoffSummary.allPassed===true||Number(signoffSummary.allPassed||0)===1;
  }
  return Boolean(signoffSummary.assertions&&signoffSummary.assertions.allPassed);
}
function normalizeSignoffTransportMode(signoffSummary){
  const raw=safeString(
    signoffSummary&&(
      signoffSummary.transportMode
      ||(signoffSummary.runtime&&signoffSummary.runtime.transportMode)
    ),
    80
  ).toLowerCase();
  if(!raw)return"";
  if(raw==="live"||raw==="stdio")return"stdio";
  if(raw==="mock"||raw==="fixture"||raw==="mock-fixture")return"mock-fixture";
  return raw;
}
function selectPreferredSignoffCandidate(candidates){
  const entries=Array.isArray(candidates)?candidates.filter(Boolean):[];
  if(!entries.length)return null;
  const latestPassingLive=entries.find((entry)=>
    isSignoffSummaryAllPassed(entry.summary)
    &&normalizeSignoffTransportMode(entry.summary)==="stdio"
  );
  if(latestPassingLive)return latestPassingLive;
  const latestPassing=entries.find((entry)=>isSignoffSummaryAllPassed(entry.summary));
  if(latestPassing)return latestPassing;
  const latestLive=entries.find((entry)=>normalizeSignoffTransportMode(entry.summary)==="stdio");
  if(latestLive)return latestLive;
  return entries[0]||null;
}
function hasResolvedOperatorOutcome(finalOutcome){
  const taskOutcomeStatus=safeString(finalOutcome&&finalOutcome.taskOutcomeStatus,80).toUpperCase();
  if(taskOutcomeStatus)return true;
  const terminalStatus=normalizeExecutionState(finalOutcome&&finalOutcome.terminalStatus,{terminalFallback:false});
  return Boolean(terminalStatus&&isTerminalExecutionState(terminalStatus));
}
function buildRelatedSignoffSummaryRef(signoffSummary,relatedToRun){
  if(!signoffSummary||!relatedToRun)return null;
  const bundlePath=safeString(signoffSummary.bundlePath,260)
    ||safeString(signoffSummary.bundleRef&&signoffSummary.bundleRef.bundlePath,260)
    ||"";
  const summaryPath=safeString(signoffSummary.summaryPath,260)
    ||safeString(signoffSummary.bundleRef&&signoffSummary.bundleRef.summaryPath,260)
    ||"";
  const allPassed=isSignoffSummaryAllPassed(signoffSummary);
  return{
    bundlePath,
    summaryPath,
    allPassed,
    relatedToRun:1,
  };
}
function isAuxiliaryOperatorRunContext(latestTurn){
  const source=safeString(latestTurn&&latestTurn.source,120).toLowerCase();
  const intent=safeString(latestTurn&&latestTurn.execution_intent,120).toLowerCase();
  const profile=normalizeExecutionProfile(latestTurn&&latestTurn.execution_profile,runtimeExecutionProfile);
  return Boolean(
    profile.startsWith("eval")
    ||profile==="proof-runtime"
    ||profile==="smoke-test"
    ||intent==="eval"
    ||intent.includes("probe")
    ||intent.includes("replay")
    ||source==="eval_harness"
    ||source.startsWith("replay:")
  );
}
function isSignoffBundleRunContext(latestTurn,signoffSummary){
  const artifactPath=safeString(latestTurn&&latestTurn.artifact_manifest_path,260);
  const bundlePath=safeString(
    signoffSummary&&(
      signoffSummary.bundlePath
      ||(signoffSummary.bundleRef&&signoffSummary.bundleRef.bundlePath)
    ),
    260
  );
  const latestTurnId=safeString(latestTurn&&latestTurn.turn_id,160);
  const naturalTaskTurnId=safeString(signoffSummary&&signoffSummary.naturalTask&&signoffSummary.naturalTask.turnId,160);
  if(bundlePath&&artifactPath&&artifactPath.replace(/\\/g,"/").startsWith(bundlePath.replace(/\\/g,"/")))return true;
  if(latestTurnId&&naturalTaskTurnId&&latestTurnId===naturalTaskTurnId)return true;
  return false;
}
function shouldPreferLatestCompletedSignoffRun({latestTurn,signoffSummary}={}){
  const bundlePath=safeString(
    signoffSummary&&(
      signoffSummary.bundlePath
      ||(signoffSummary.bundleRef&&signoffSummary.bundleRef.bundlePath)
    ),
    260
  );
  if(!bundlePath)return false;
  if(!latestTurn)return true;
  const latestStatus=safeString(latestTurn.status,40).toLowerCase();
  const latestTaskOutcomeStatus=safeString(latestTurn.task_outcome_status,80).toUpperCase();
  const latestIntent=safeString(latestTurn.execution_intent,120).toLowerCase();
  const completed=latestStatus==="completed"&&latestTaskOutcomeStatus==="COMPLETED";
  if(latestStatus==="in_progress")return true;
  if(isAuxiliaryOperatorRunContext(latestTurn))return true;
  if(isSignoffBundleRunContext(latestTurn,signoffSummary))return false;
  if(!completed)return true;
  return !latestIntent.includes("signoff");
}
function buildOperatorDecisionSummary({finalOutcome,signoffReady,designConformant,postureSafe,requiredEvidenceFailures=[]}={}){
  const completed=isCompletedOperatorOutcome(finalOutcome);
  const taskOutcomeStatus=safeString(finalOutcome&&finalOutcome.taskOutcomeStatus,80).toUpperCase();
  if(signoffReady&&designConformant&&postureSafe&&completed)return"SAFE_TO_SIGNOFF";
  if(requiredEvidenceFailures.length)return"ATTENTION_REQUIRED";
  if(taskOutcomeStatus==="FAILED_VALIDATION"||taskOutcomeStatus==="BLOCKED"||taskOutcomeStatus==="NEEDS_INPUT")return"DO_NOT_SIGNOFF";
  if(completed)return"REVIEW_SUMMARY_BEFORE_SIGNOFF";
  return"ATTENTION_REQUIRED";
}
function buildCurrentRuntimeSnapshotFile(){
  const runtime=sanitizeRuntimeSnapshotForOverview(buildRuntimeApiSnapshot());
  const canonicalRuntime=canonicalizeOperatorFacingValue({
    activeAgent:runtime.activeAgent,
    latestTurn:runtime.latestTurn,
    harnessMemory:runtime.harnessMemory,
    evalHarness:runtime.evalHarness,
    planningContracts:runtime.planningContracts,
    governancePolicy:runtime.governancePolicy,
    gitAutomation:runtime.gitAutomation,
    fullUtilization:runtime.fullUtilization,
    staticApps:runtime.staticApps,
  });
  return{
    schema:"current-runtime-snapshot.v2",
    generatedAt:toIsoTimestamp(Date.now()),
    loggingMode,
    loggingModeEnvKey,
    defaultExecAgent:defaultExecAgentName,
    currentSurface:{
      operatorSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentOperatorSummaryPath),
      designConformanceSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentDesignConformancePath),
      conformanceReportPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentConformanceReportPath),
      operatorViewSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentOperatorViewSummaryPath),
      runtimeSnapshotPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentRuntimeSnapshotPath),
      latestRunSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestRunSummaryPath),
      reviewLoadBreakdownPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentReviewLoadBreakdownPath),
      latestSignoffSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestSignoffSummaryPath),
    },
    storage:{
      current:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentRoot),
      bundles:{
        signoff:repoRelativePath(workspaceRoot,loggingSurfacePaths.signoffBundlesRoot),
        proof:repoRelativePath(workspaceRoot,loggingSurfacePaths.proofBundlesRoot),
        replay:repoRelativePath(workspaceRoot,loggingSurfacePaths.replayBundlesRoot),
      },
      archive:{
        admin:repoRelativePath(workspaceRoot,loggingSurfacePaths.adminRoot),
        raw:repoRelativePath(workspaceRoot,loggingSurfacePaths.archiveRawRoot),
        legacy:repoRelativePath(workspaceRoot,loggingSurfacePaths.archiveLegacyRoot),
        operationLogs:repoRelativePath(workspaceRoot,loggingSurfacePaths.archiveOperationLogsRoot),
        turns:repoRelativePath(workspaceRoot,loggingSurfacePaths.archiveTurnsRoot),
        runtimeState:repoRelativePath(workspaceRoot,loggingSurfacePaths.runtimeStateRoot),
      },
    },
    posture:{
      executionProfile:runtime.executionProfile,
      requestUserInputPolicy:runtime.nonInteractiveUserInput,
      parentDispatchGuard:runtime.parentDispatchGuard,
      operationLog:runtime.operationLog,
      evidenceArtifacts:runtime.evidenceArtifacts,
    },
    runtime:canonicalRuntime,
    latestBundles:{
      signoff:buildLatestBundleReference(signoffBundlesRoot,"signoff_summary.json",buildSignoffBundleSnapshot),
      proof:buildLatestBundleReference(runtimeProofsRoot,"runtime_proof_summary.json",buildRuntimeProofBundleSnapshot),
    },
  };
}
function buildLatestSignoffSummaryFile(){
  const candidates=listBundleSummaryCandidates(signoffBundlesRoot,"signoff_summary.json");
  const preferredCandidate=selectPreferredSignoffCandidate(candidates);
  const latest=preferredCandidate
    ?buildSignoffBundleSnapshot(preferredCandidate)
    :buildLatestBundleReference(signoffBundlesRoot,"signoff_summary.json",buildSignoffBundleSnapshot);
  if(!latest)return null;
  const allPassed=isSignoffSummaryAllPassed(latest);
  return{
    schema:"latest-signoff-summary.v2",
    generatedAt:toIsoTimestamp(Date.now()),
    allPassed:allPassed?1:0,
    runtimePostureSafe:latest&&latest.assertions&&latest.assertions.runtimePostureSafe?1:0,
    coreHarnessWorkflowPassed:latest&&latest.assertions&&latest.assertions.coreHarnessWorkflowPassed?1:0,
    naturalTaskTracePassed:latest&&latest.assertions&&latest.assertions.naturalTaskTracePassed?1:0,
    signoffReady:allPassed?1:0,
    bundleRef:{
      bundleName:latest.name,
      bundlePath:latest.bundlePath,
      summaryPath:latest.summaryPath,
    },
    finalDecision:allPassed?"RELEASE_APPROVED":"RELEASE_BLOCKED",
  };
}
function buildLatestRunSummaryFromSignoffBundle(signoffSummary){
  const bundlePath=safeString(
    signoffSummary&&(
      signoffSummary.bundlePath
      ||(signoffSummary.bundleRef&&signoffSummary.bundleRef.bundlePath)
    ),
    260
  );
  const signoffSummaryPath=safeString(
    signoffSummary&&(
      signoffSummary.summaryPath
      ||(signoffSummary.bundleRef&&signoffSummary.bundleRef.summaryPath)
    ),
    260
  );
  const signoffBundleSummary=readWorkspaceJsonArtifact(signoffSummaryPath);
  if(!signoffBundleSummary||typeof signoffBundleSummary!=="object")return null;
  const bundleLatestRun=readWorkspaceJsonArtifact(signoffBundleSummary.paths&&signoffBundleSummary.paths.latestRunSummary)||{};
  const signoffTracePath=safeString(
    signoffBundleSummary.paths&&(
      signoffBundleSummary.paths.signoffTaskTraceSummary
      ||signoffBundleSummary.paths.naturalTaskTraceSummary
    ),
    260
  );
  const traceSummary=readWorkspaceJsonArtifact(signoffTracePath)||{};
  const flowTraceSummary=traceSummary.flowTraceSummary&&typeof traceSummary.flowTraceSummary==="object"
    ?traceSummary.flowTraceSummary
    :{};
  const artifactManifestPath=safeString(traceSummary.artifactManifestPath,260)||"";
  const artifactManifest=readWorkspaceJsonArtifact(artifactManifestPath)||{};
  const artifactDir=artifactManifestPath?path.dirname(resolveWorkspaceRuntimePath(artifactManifestPath)):"";
  const evidenceManifestPath=artifactDir?repoRelativePath(workspaceRoot,path.join(artifactDir,"evidence_manifest.json")):"";
  const evidenceManifest=readWorkspaceJsonArtifact(evidenceManifestPath)||{};
  const reviewLoadBreakdown=readWorkspaceJsonArtifact(signoffBundleSummary.paths&&signoffBundleSummary.paths.reviewLoadBreakdown)||{};
  const finalOutcome=bundleLatestRun.finalOutcome&&typeof bundleLatestRun.finalOutcome==="object"
    ?bundleLatestRun.finalOutcome
    :(traceSummary.turn&&typeof traceSummary.turn==="object"?traceSummary.turn:{});
  const normalizedResiduals=normalizeOperatorResidualSemantics({
    finalOutcome,
    residualRisks:Array.isArray(bundleLatestRun.residualRisks)
      ?bundleLatestRun.residualRisks
      :Array.isArray(flowTraceSummary.residualRiskSummary)
        ?flowTraceSummary.residualRiskSummary
        :[],
  });
  const changedPaths=uniquePathList([
    ...(Array.isArray(traceSummary.observedSignals&&traceSummary.observedSignals.sampleChangedPaths)?traceSummary.observedSignals.sampleChangedPaths:[]),
    ...(Array.isArray(flowTraceSummary.childEvidenceLedger)
      ?flowTraceSummary.childEvidenceLedger.flatMap((entry)=>Array.isArray(entry&&entry.ownedPaths)?entry.ownedPaths:[])
      :[]),
  ].filter(isLikelyChangedPath),24);
  return{
    schema:"latest-run-summary.v2",
    generatedAt:toIsoTimestamp(Date.now()),
    available:true,
    currentPhase:"Release / Close",
    taskId:safeString(bundleLatestRun.turnId||traceSummary.turnId||artifactManifest.turn&&artifactManifest.turn.turnId,160)||"",
    turnId:safeString(bundleLatestRun.turnId||traceSummary.turnId||artifactManifest.turn&&artifactManifest.turn.turnId,160)||"",
    threadId:safeString(traceSummary.threadId||artifactManifest.turn&&artifactManifest.turn.threadId,160)||"",
    agentName:safeString(artifactManifest.turn&&artifactManifest.turn.agentName,160)||defaultExecAgentName,
    executionProfile:safeString(bundleLatestRun.executionProfile,80)||"full-runtime",
    executionIntent:"signoff_sample",
    selectedPlanningDepth:safeString(bundleLatestRun.selectedPlanningDepth||flowTraceSummary.selectedPlanningDepth,80)||"",
    selectedAssuranceDepth:safeString(bundleLatestRun.selectedAssuranceDepth||flowTraceSummary.selectedAssuranceDepth,80)||"",
    planningMode:safeString(flowTraceSummary.selectedPlanningMode,40)||"",
    flowPath:safeString(flowTraceSummary.flowPath,80)||"",
    finalOutcome:{
      status:safeString(finalOutcome.status,40)||"",
      terminalStatus:safeString(finalOutcome.terminalStatus||finalOutcome.status,40)||"",
      taskOutcomeStatus:safeString(finalOutcome.taskOutcomeStatus,80)||"",
      taskOutcomeReason:safeString(finalOutcome.taskOutcomeReason,120)||"",
    },
    dispatchCount:Number(bundleLatestRun.dispatchCount||traceSummary.observedSignals&&traceSummary.observedSignals.dispatchCount||0),
    dispatchSuccessCount:Number(bundleLatestRun.dispatchSuccessCount||traceSummary.observedSignals&&traceSummary.observedSignals.dispatchSuccessCount||0),
    implementationObserved:Boolean(
      Number(traceSummary.observedSignals&&traceSummary.observedSignals.fileChanges||0)>0
      ||Number(traceSummary.observedSignals&&traceSummary.observedSignals.commandExecutions||0)>0
      ||Number(traceSummary.observedSignals&&traceSummary.observedSignals.mcpCalls||0)>0
    ),
    reviewerObserved:Boolean(bundleLatestRun.reviewerObserved||flowTraceSummary.reviewerExecuted),
    testerObserved:Boolean(bundleLatestRun.testerObserved||flowTraceSummary.testerExecuted),
    usedAgents:Array.isArray(bundleLatestRun.usedAgents)&&bundleLatestRun.usedAgents.length
      ?bundleLatestRun.usedAgents
      :Array.isArray(flowTraceSummary.usedAgents)?flowTraceSummary.usedAgents:[],
    usedPolicies:Array.isArray(flowTraceSummary.usedPolicies)?flowTraceSummary.usedPolicies:[],
    usedContracts:Array.isArray(flowTraceSummary.usedContracts)?flowTraceSummary.usedContracts:[],
    usedSkills:Array.isArray(flowTraceSummary.usedSkills)?flowTraceSummary.usedSkills:[],
    changedPaths,
    evidenceClassesCollected:[
      "runtime",
      (flowTraceSummary.reviewerExecuted||flowTraceSummary.testerExecuted)?"verification":"",
      bundleLatestRun.docSyncSummary&&bundleLatestRun.docSyncSummary.status==="PASS"?"documentation":"",
      normalizedResiduals.residualRisks.length?"risk":"",
    ].filter(Boolean),
    residualRisks:normalizedResiduals.residualRisks,
    informationalNotes:normalizedResiduals.informationalNotes,
    assumptions:Array.isArray(evidenceManifest.requirementContract&&evidenceManifest.requirementContract.assumptions)
      ?evidenceManifest.requirementContract.assumptions.map((entry)=>safeString(entry,240)).filter(Boolean).slice(0,8)
      :[],
    operatorCaveats:normalizedResiduals.operatorCaveats,
    parentDispatchGuardSummary:traceSummary.parentDispatchGuard&&typeof traceSummary.parentDispatchGuard==="object"?traceSummary.parentDispatchGuard:{},
    requestUserInputSummary:{
      policy:nonInteractiveRequestUserInputPolicy,
      blockedByDefault:nonInteractiveRequestUserInputPolicy==="blocked"?1:0,
    },
    docSyncSummary:bundleLatestRun.docSyncSummary&&typeof bundleLatestRun.docSyncSummary==="object"
      ?bundleLatestRun.docSyncSummary
      :(flowTraceSummary.docSyncEvidence&&typeof flowTraceSummary.docSyncEvidence==="object"?flowTraceSummary.docSyncEvidence:null),
    releaseState:isSignoffSummaryAllPassed(signoffSummary)?"RELEASE_APPROVED":"RELEASE_BLOCKED",
    parentMaterialImplementationObserved:0,
    signoffSummaryRef:buildRelatedSignoffSummaryRef(signoffSummary,true),
    evidenceRefs:{
      bundlePath:bundlePath||"",
      signoffSummaryPath:signoffSummaryPath||"",
      naturalTaskTraceSummaryPath:safeString(signoffBundleSummary.paths&&signoffBundleSummary.paths.naturalTaskTraceSummary,260)||"",
      coreHarnessWorkflowRunPath:safeString(signoffBundleSummary.paths&&signoffBundleSummary.paths.coreHarnessWorkflowRun,260)||"",
    },
    childEvidenceLedger:Array.isArray(flowTraceSummary.childEvidenceLedger)?flowTraceSummary.childEvidenceLedger:[],
    reviewLoadBreakdown,
  };
}
function buildLatestRunSummaryFile(){
  const signoffSummary=buildLatestSignoffSummaryFile();
  const signoffBundleRunSummary=buildLatestRunSummaryFromSignoffBundle(signoffSummary);
  if(signoffBundleRunSummary&&isSignoffSummaryAllPassed(signoffSummary))return signoffBundleRunSummary;
  const latestTurn=getLatestOperatorTurnSnapshot();
  const latestTurnArtifactPath=safeString(latestTurn&&latestTurn.artifact_manifest_path,260);
  const latestTurnIntent=safeString(latestTurn&&latestTurn.execution_intent,120).toLowerCase();
  const latestTurnProfile=normalizeExecutionProfile(latestTurn&&latestTurn.execution_profile,runtimeExecutionProfile);
  const signoffBundlePath=safeString(
    signoffSummary&&(
      signoffSummary.bundlePath
      ||(signoffSummary.bundleRef&&signoffSummary.bundleRef.bundlePath)
    ),
    260
  );
  const preferLatestSignoffFallback=Boolean(
    shouldPreferLatestCompletedSignoffRun({latestTurn,signoffSummary})
    ||(
      signoffSummary
      &&signoffBundlePath
      &&latestTurn
      &&latestTurnArtifactPath
      &&!String(latestTurnArtifactPath).replace(/\\/g,"/").startsWith(String(signoffBundlePath).replace(/\\/g,"/"))
      &&(latestTurnProfile==="proof-runtime"||latestTurnIntent.includes("probe"))
    )
  );
  if(!latestTurn||preferLatestSignoffFallback){
    const latestSignoffCandidates=listBundleSummaryCandidates(signoffBundlesRoot,"signoff_summary.json");
    const latestSignoffCandidate=selectPreferredSignoffCandidate(latestSignoffCandidates);
    const signoffBundleSummary=latestSignoffCandidate&&latestSignoffCandidate.summary&&typeof latestSignoffCandidate.summary==="object"
      ?latestSignoffCandidate.summary
      :{};
    const signoffTracePath=signoffBundleSummary.paths&&(
      signoffBundleSummary.paths.naturalTaskTraceSummary
      ||signoffBundleSummary.paths.signoffTaskTraceSummary
    );
    const traceSummary=readWorkspaceJsonArtifact(signoffTracePath);
    if(traceSummary&&typeof traceSummary==="object"){
      const flowTraceSummary=traceSummary.flowTraceSummary&&typeof traceSummary.flowTraceSummary==="object"
        ?traceSummary.flowTraceSummary
        :{};
      const signoffNaturalTask=signoffBundleSummary.naturalTask&&typeof signoffBundleSummary.naturalTask==="object"
        ?signoffBundleSummary.naturalTask
        :{};
      const signoffTask=signoffBundleSummary.signoffTask&&typeof signoffBundleSummary.signoffTask==="object"
        ?signoffBundleSummary.signoffTask
        :{};
      const artifactManifestPath=safeString(traceSummary.artifactManifestPath,260)||"";
      const artifactDir=artifactManifestPath?path.dirname(resolveWorkspaceRuntimePath(artifactManifestPath)):"";
      const evidenceManifestPath=artifactDir?repoRelativePath(workspaceRoot,path.join(artifactDir,"evidence_manifest.json")):"";
      const reviewLoadBreakdownPath=artifactDir?repoRelativePath(workspaceRoot,path.join(artifactDir,"review_load_breakdown.json")):"";
      const stageTimelinePath=artifactDir?repoRelativePath(workspaceRoot,path.join(artifactDir,"stage_timeline.json")):"";
      const reviewLoadBreakdown=readWorkspaceJsonArtifact(reviewLoadBreakdownPath);
      const finalOutcome={
        status:safeString(traceSummary.turn&&traceSummary.turn.status,40)||"",
        terminalStatus:safeString(traceSummary.turn&&traceSummary.turn.status,40)||"",
        taskOutcomeStatus:safeString(traceSummary.turn&&traceSummary.turn.taskOutcomeStatus,80)||"",
        taskOutcomeReason:safeString(traceSummary.turn&&traceSummary.turn.taskOutcomeReason,120)||"",
      };
      const normalizedResiduals=normalizeOperatorResidualSemantics({
        finalOutcome,
        residualRisks:Array.isArray(flowTraceSummary.residualRiskSummary)?flowTraceSummary.residualRiskSummary:[],
      });
      const changedPaths=uniquePathList([
        ...(Array.isArray(traceSummary.sampleChangedPaths)?traceSummary.sampleChangedPaths:[]),
        ...(Array.isArray(flowTraceSummary.childEvidenceLedger)
          ?flowTraceSummary.childEvidenceLedger.flatMap((entry)=>Array.isArray(entry&&entry.ownedPaths)?entry.ownedPaths:[])
          :[]),
      ].filter(isLikelyChangedPath),24);
      return{
        schema:"latest-run-summary.v2",
        generatedAt:toIsoTimestamp(Date.now()),
        available:true,
        currentPhase:"Release / Close",
        taskId:safeString(traceSummary.turnId||signoffTask.turnId||signoffNaturalTask.turnId,160)||"",
        turnId:safeString(traceSummary.turnId||signoffTask.turnId||signoffNaturalTask.turnId,160)||"",
        threadId:safeString(traceSummary.threadId||signoffTask.threadId||signoffNaturalTask.threadId,160)||"",
        agentName:safeString(traceSummary.replay&&traceSummary.replay.agentName,160)||defaultExecAgentName,
        executionProfile:safeString(traceSummary.replay&&traceSummary.replay.executionProfile,80)||"full-runtime",
        executionIntent:safeString(traceSummary.replay&&traceSummary.replay.executionIntent,120)||"signoff_sample",
        selectedPlanningDepth:safeString(flowTraceSummary.selectedPlanningDepth,80)||"",
        selectedAssuranceDepth:safeString(flowTraceSummary.selectedAssuranceDepth,80)||"",
        planningMode:safeString(flowTraceSummary.selectedPlanningMode,40)||"",
        flowPath:safeString(flowTraceSummary.flowPath,80)||"",
        finalOutcome,
        dispatchCount:Number(traceSummary.observedSignals&&traceSummary.observedSignals.dispatchCount||0),
        dispatchSuccessCount:Number(traceSummary.observedSignals&&traceSummary.observedSignals.dispatchSuccessCount||0),
        implementationObserved:Boolean(
          Number(traceSummary.observedSignals&&traceSummary.observedSignals.fileChanges||0)>0
          ||Number(traceSummary.observedSignals&&traceSummary.observedSignals.commandExecutions||0)>0
          ||Number(traceSummary.observedSignals&&traceSummary.observedSignals.mcpCalls||0)>0
        ),
        reviewerObserved:Boolean(flowTraceSummary.reviewerExecuted),
        testerObserved:Boolean(flowTraceSummary.testerExecuted),
        usedAgents:Array.isArray(flowTraceSummary.usedAgents)?flowTraceSummary.usedAgents:[],
        usedPolicies:Array.isArray(flowTraceSummary.usedPolicies)?flowTraceSummary.usedPolicies:[],
        usedContracts:Array.isArray(flowTraceSummary.usedContracts)?flowTraceSummary.usedContracts:[],
        usedSkills:Array.isArray(flowTraceSummary.usedSkills)?flowTraceSummary.usedSkills:[],
        changedPaths,
        evidenceClassesCollected:[
          "runtime",
          (flowTraceSummary.reviewerExecuted||flowTraceSummary.testerExecuted)?"verification":"",
          flowTraceSummary.docSyncEvidence&&flowTraceSummary.docSyncEvidence.status==="PASS"?"documentation":"",
          normalizedResiduals.residualRisks.length?"risk":"",
        ].filter(Boolean),
        residualRisks:normalizedResiduals.residualRisks,
        informationalNotes:normalizedResiduals.informationalNotes,
        assumptions:Array.isArray(traceSummary.evidenceManifest&&traceSummary.evidenceManifest.requirementContract&&traceSummary.evidenceManifest.requirementContract.assumptions)
          ?traceSummary.evidenceManifest.requirementContract.assumptions.map((entry)=>safeString(entry,240)).filter(Boolean).slice(0,8)
          :[],
        operatorCaveats:normalizedResiduals.operatorCaveats,
        parentDispatchGuardSummary:traceSummary.parentDispatchGuard&&typeof traceSummary.parentDispatchGuard==="object"?traceSummary.parentDispatchGuard:{},
        requestUserInputSummary:{
          policy:nonInteractiveRequestUserInputPolicy,
          blockedByDefault:nonInteractiveRequestUserInputPolicy==="blocked"?1:0,
        },
        docSyncSummary:flowTraceSummary.docSyncEvidence&&typeof flowTraceSummary.docSyncEvidence==="object"
          ?flowTraceSummary.docSyncEvidence
          :null,
        familyCompletionGate:normalizeFamilyCompletionGateSnapshot(flowTraceSummary&&flowTraceSummary.familyCompletionGate),
        releaseState:safeString(traceSummary.releaseDecision&&traceSummary.releaseDecision.terminal_state,80)
          ||safeString(traceSummary.releaseDecisionState,80)
          ||(isCompletedOperatorOutcome(finalOutcome)?"RELEASE_APPROVED_WITH_ASSUMPTIONS":"HARNESS_FAILURE"),
        parentMaterialImplementationObserved:0,
        signoffSummaryRef:buildRelatedSignoffSummaryRef(signoffSummary,true),
        evidenceRefs:{
          bundlePath:safeString(signoffSummary&&signoffSummary.bundleRef&&signoffSummary.bundleRef.bundlePath,260)||safeString(signoffSummary&&signoffSummary.bundlePath,260)||"",
          signoffSummaryPath:safeString(signoffSummary&&signoffSummary.bundleRef&&signoffSummary.bundleRef.summaryPath,260)||safeString(signoffSummary&&signoffSummary.summaryPath,260)||"",
          naturalTaskTraceSummaryPath:safeString(signoffBundleSummary.paths&&signoffBundleSummary.paths.naturalTaskTraceSummary,260)||"",
          coreHarnessWorkflowRunPath:safeString(signoffBundleSummary.paths&&signoffBundleSummary.paths.coreHarnessWorkflowRun,260)||"",
        },
        childEvidenceLedger:Array.isArray(flowTraceSummary.childEvidenceLedger)?flowTraceSummary.childEvidenceLedger:[],
        reviewLoadBreakdown,
      };
    }
    return signoffBundleRunSummary||{
      schema:"latest-run-summary.v2",
      generatedAt:toIsoTimestamp(Date.now()),
      available:false,
      currentPhase:"Intake / Frame",
      reason:"no_turn_recorded_yet",
    };
  }
  const manifest=readWorkspaceJsonArtifact(latestTurn.artifact_manifest_path);
  const evidenceManifest=readWorkspaceJsonArtifact(latestTurn.evidence_manifest_path);
  const flowTraceSummary=readWorkspaceJsonArtifact(latestTurn.flow_trace_summary_path);
  const reviewLoadBreakdown=readWorkspaceJsonArtifact(latestTurn.review_load_breakdown_path);
  const changedPaths=collectChangedPathsFromArtifacts({manifest,evidenceManifest,flowTraceSummary});
  const docSyncSummary=evidenceManifest&&typeof evidenceManifest.docSyncEvidence==="object"
    ?evidenceManifest.docSyncEvidence
    :(flowTraceSummary&&typeof flowTraceSummary.docSyncEvidence==="object"?flowTraceSummary.docSyncEvidence:null);
  const childEvidenceLedger=Array.isArray(flowTraceSummary&&flowTraceSummary.childEvidenceLedger)
    ?flowTraceSummary.childEvidenceLedger
    :Array.isArray(evidenceManifest&&evidenceManifest.childEvidenceLedger)
      ?evidenceManifest.childEvidenceLedger
      :[];
  const usedAgents=Array.isArray(flowTraceSummary&&flowTraceSummary.usedAgents)
    ?flowTraceSummary.usedAgents
    :uniquePathList(childEvidenceLedger.map((entry)=>safeString(entry&&entry.agent,80)).filter(Boolean),16);
  const finalOutcome={
    status:latestTurn.status,
    terminalStatus:latestTurn.terminal_status,
    taskOutcomeStatus:latestTurn.task_outcome_status,
    taskOutcomeReason:latestTurn.task_outcome_reason,
  };
  const normalizedResiduals=normalizeOperatorResidualSemantics({
    finalOutcome,
    residualRisks:Array.isArray(evidenceManifest&&evidenceManifest.residualRiskSummary)
      ?evidenceManifest.residualRiskSummary
      :Array.isArray(flowTraceSummary&&flowTraceSummary.residualRiskSummary)
        ?flowTraceSummary.residualRiskSummary
        :[],
  });
  const evidenceClassesCollected=[
    changedPaths.length?"implementation":"",
    (Array.isArray(childEvidenceLedger)&&childEvidenceLedger.some((entry)=>entry&&(entry.reviewerObserved||entry.testerObserved)))||Number(latestTurn.observed_signals&&latestTurn.observed_signals.commandExecutions||0)>0
      ?"verification"
      :"",
    latestTurn.artifact_manifest_path?"runtime":"",
    docSyncSummary&&docSyncSummary.status==="PASS"?"documentation":"",
    normalizedResiduals.residualRisks.length?"risk":"",
  ].filter(Boolean);
  const relatedSignoffSummary=signoffBundlePath&&latestTurn.artifact_manifest_path
    ?String(latestTurn.artifact_manifest_path).replace(/\\/g,"/").startsWith(String(signoffBundlePath).replace(/\\/g,"/"))
    :Boolean(signoffSummary&&safeString(latestTurn.execution_intent,120).toLowerCase().includes("signoff"));
  const resolvedOutcome=hasResolvedOperatorOutcome(finalOutcome);
  const relatedSignoffRef=buildRelatedSignoffSummaryRef(signoffSummary,relatedSignoffSummary&&resolvedOutcome);
  const latestRunSummaryResult={
    schema:"latest-run-summary.v2",
    generatedAt:toIsoTimestamp(Date.now()),
    available:true,
    currentPhase:"Release / Close",
    taskId:latestTurn.turn_id,
    turnId:latestTurn.turn_id,
    threadId:latestTurn.thread_id,
    agentName:latestTurn.agent_name,
    executionProfile:latestTurn.execution_profile,
    executionIntent:latestTurn.execution_intent,
    selectedPlanningDepth:latestTurn.planning_depth,
    selectedAssuranceDepth:latestTurn.assurance_depth,
    planningMode:latestTurn.planning_mode,
    flowPath:latestTurn.flow_path,
    finalOutcome,
    dispatchCount:Number(latestTurn.observed_signals&&latestTurn.observed_signals.dispatchCount||0),
    dispatchSuccessCount:Number(latestTurn.observed_signals&&latestTurn.observed_signals.dispatchSuccessCount||0),
    implementationObserved:Boolean(
      Number(latestTurn.observed_signals&&latestTurn.observed_signals.fileChanges||0)>0
      ||Number(latestTurn.observed_signals&&latestTurn.observed_signals.commandExecutions||0)>0
      ||Number(latestTurn.observed_signals&&latestTurn.observed_signals.mcpCalls||0)>0
    ),
    reviewerObserved:Array.isArray(childEvidenceLedger)&&childEvidenceLedger.some((entry)=>entry&&entry.reviewerObserved),
    testerObserved:Array.isArray(childEvidenceLedger)&&childEvidenceLedger.some((entry)=>entry&&entry.testerObserved),
    usedAgents,
    usedPolicies:Array.isArray(flowTraceSummary&&flowTraceSummary.usedPolicies)?flowTraceSummary.usedPolicies:[],
    usedContracts:Array.isArray(flowTraceSummary&&flowTraceSummary.usedContracts)?flowTraceSummary.usedContracts:[],
    usedSkills:Array.isArray(flowTraceSummary&&flowTraceSummary.usedSkills)?flowTraceSummary.usedSkills:[],
    changedPaths,
    evidenceClassesCollected,
    residualRisks:normalizedResiduals.residualRisks,
    informationalNotes:normalizedResiduals.informationalNotes,
    assumptions:Array.isArray(evidenceManifest&&evidenceManifest.requirementContract&&evidenceManifest.requirementContract.assumptions)
      ?evidenceManifest.requirementContract.assumptions.map((entry)=>safeString(entry,240)).filter(Boolean).slice(0,8)
      :[],
    operatorCaveats:Array.from(new Set([
      ...normalizedResiduals.operatorCaveats,
      signoffSummary&&relatedSignoffSummary===false
        ?"Latest signoff summary is nearby reference evidence, not a summary of this exact run."
        :"",
      isCompletedOperatorOutcome(finalOutcome)&&signoffSummary&&relatedSignoffSummary&&!isSignoffSummaryAllPassed(signoffSummary)
        ?"The run completed, but the related latest signoff bundle has not passed every assertion yet."
        :"",
    ].filter(Boolean))).slice(0,8),
    parentDispatchGuardSummary:latestTurn.parent_dispatch_guard,
    requestUserInputSummary:{
      policy:nonInteractiveRequestUserInputPolicy,
      blockedByDefault:nonInteractiveRequestUserInputPolicy==="blocked"?1:0,
    },
    docSyncSummary,
    familyCompletionGate:normalizeFamilyCompletionGateSnapshot(
      latestTurn.family_completion_gate
      ||(evidenceManifest&&evidenceManifest.familyCompletionGate)
      ||(flowTraceSummary&&flowTraceSummary.familyCompletionGate)
    ),
    releaseState:safeString(latestTurn.release_decision_state,80)||safeString(latestTurn.releaseDecisionState,80)||"",
    parentMaterialImplementationObserved:latestTurn.parent_material_implementation_observed?1:0,
    signoffSummaryRef:relatedSignoffRef,
    evidenceRefs:{
      bundlePath:relatedSignoffRef?safeString(relatedSignoffRef.bundlePath,260)||"": "",
      signoffSummaryPath:relatedSignoffRef?safeString(relatedSignoffRef.summaryPath,260)||"": "",
      naturalTaskTraceSummaryPath:relatedSignoffRef&&signoffSummary&&signoffSummary.bundleRef&&signoffSummary.bundleRef.summaryPath
        ?path.posix.join(path.posix.dirname(String(signoffSummary.bundleRef.summaryPath).replace(/\\/g,"/")),"natural_task_trace_summary.json")
        :"",
    },
    childEvidenceLedger,
    reviewLoadBreakdown,
  };
  if(signoffBundleRunSummary){
    if(!safeString(latestRunSummaryResult.threadId,160))latestRunSummaryResult.threadId=safeString(signoffBundleRunSummary.threadId,160)||"";
    if(!Array.isArray(latestRunSummaryResult.usedPolicies)||!latestRunSummaryResult.usedPolicies.length)latestRunSummaryResult.usedPolicies=Array.isArray(signoffBundleRunSummary.usedPolicies)?signoffBundleRunSummary.usedPolicies:[];
    if(!Array.isArray(latestRunSummaryResult.usedContracts)||!latestRunSummaryResult.usedContracts.length)latestRunSummaryResult.usedContracts=Array.isArray(signoffBundleRunSummary.usedContracts)?signoffBundleRunSummary.usedContracts:[];
    if(!Array.isArray(latestRunSummaryResult.usedSkills)||!latestRunSummaryResult.usedSkills.length)latestRunSummaryResult.usedSkills=Array.isArray(signoffBundleRunSummary.usedSkills)?signoffBundleRunSummary.usedSkills:[];
    if(!Array.isArray(latestRunSummaryResult.changedPaths)||!latestRunSummaryResult.changedPaths.length)latestRunSummaryResult.changedPaths=Array.isArray(signoffBundleRunSummary.changedPaths)?signoffBundleRunSummary.changedPaths:[];
    if(!latestRunSummaryResult.docSyncSummary||!Object.keys(latestRunSummaryResult.docSyncSummary).length)latestRunSummaryResult.docSyncSummary=signoffBundleRunSummary.docSyncSummary||{};
    if(!latestRunSummaryResult.evidenceRefs||!safeString(latestRunSummaryResult.evidenceRefs.bundlePath,260)){
      latestRunSummaryResult.evidenceRefs=signoffBundleRunSummary.evidenceRefs||latestRunSummaryResult.evidenceRefs;
    }
  }
  return latestRunSummaryResult;
}
function normalizeCurrentSurfacePath(value){
  const raw=safeString(value,260)||"";
  if(!raw)return"";
  if(raw.startsWith("logs/"))return raw.replace(/\\/g,"/");
  return repoRelativePath(workspaceRoot,raw)||raw.replace(/\\/g,"/");
}
function normalizeCurrentLatestSignoffSummary(latestSignoffSummary){
  const bundleRef=latestSignoffSummary&&latestSignoffSummary.bundleRef&&typeof latestSignoffSummary.bundleRef==="object"
    ?latestSignoffSummary.bundleRef
    :{};
  const bundlePath=normalizeCurrentSurfacePath(bundleRef.bundlePath||latestSignoffSummary&&latestSignoffSummary.bundlePath||"");
  const summaryPath=normalizeCurrentSurfacePath(bundleRef.summaryPath||latestSignoffSummary&&latestSignoffSummary.summaryPath||"");
  const allPassed=Boolean(latestSignoffSummary&&(
    latestSignoffSummary.allPassed===true
    ||Number(latestSignoffSummary.allPassed||0)===1
  ));
  const runtimePostureSafe=Boolean(latestSignoffSummary&&(
    latestSignoffSummary.runtimePostureSafe===true
    ||Number(latestSignoffSummary.runtimePostureSafe||0)===1
  ));
  const coreHarnessWorkflowPassed=Boolean(latestSignoffSummary&&(
    latestSignoffSummary.coreHarnessWorkflowPassed===true
    ||Number(latestSignoffSummary.coreHarnessWorkflowPassed||0)===1
  ));
  const naturalTaskTracePassed=Boolean(latestSignoffSummary&&(
    latestSignoffSummary.naturalTaskTracePassed===true
    ||Number(latestSignoffSummary.naturalTaskTracePassed||0)===1
  ));
  const signoffReady=Boolean(latestSignoffSummary&&(
    latestSignoffSummary.signoffReady===true
    ||Number(latestSignoffSummary.signoffReady||0)===1
  ))||allPassed;
  return{
    schema:"latest-signoff-summary.v3",
    generatedAt:toIsoTimestamp(Date.now()),
    allPassed,
    runtimePostureSafe,
    coreHarnessWorkflowPassed,
    naturalTaskTracePassed,
    signoffReady,
    bundleRef:{
      bundleName:safeString(bundleRef.bundleName,160)||safeString(path.basename(bundlePath),160)||"",
      bundlePath,
      summaryPath,
    },
    finalDecision:safeString(latestSignoffSummary&&latestSignoffSummary.finalDecision,80)||(signoffReady?"RELEASE_APPROVED":"RELEASE_BLOCKED"),
  };
}
function normalizeCurrentDesignConformanceSummary(designConformanceSummary){
  const keys=[
    "defaultExecAgentIsDefault",
    "requestUserInputPolicyBlocked",
    "parentDispatchGuardEnforced",
    "retiredWorkerNotRoutable",
    "planningDepthSelectorWorking",
    "assuranceDepthSelectorWorking",
    "specialistDispatchObservedWhenImplementationOccurred",
    "reviewerObservedWhenRequired",
    "testerObservedWhenRequired",
    "taskOutcomeSemanticsValid",
    "docSyncEvidencePresentWhenRequired",
    "signoffCriteriaSatisfied",
    "overallDesignConformance",
  ];
  const normalized={
    schema:"design-conformance-summary.v3",
    generatedAt:toIsoTimestamp(Date.now()),
  };
  keys.forEach((key)=>{
    const source=designConformanceSummary&&designConformanceSummary[key]&&typeof designConformanceSummary[key]==="object"
      ?designConformanceSummary[key]
      :{};
    normalized[key]={
      status:safeString(source.status||source.passFail,20)||"fail",
      reason:safeString(source.reason,400)||"",
      evidenceRef:normalizeCurrentSurfacePath(source.evidenceRef||source.evidencePath||""),
    };
  });
  return normalized;
}
function normalizeCurrentReviewLoadBreakdown(reviewLoadBreakdown){
  const source=reviewLoadBreakdown&&typeof reviewLoadBreakdown==="object"?reviewLoadBreakdown:{};
  return{
    schema:"review-load-breakdown.v3",
    generatedAt:toIsoTimestamp(Date.now()),
    totalStep4DurationMs:Number(source.totalStep4DurationMs||0),
    evidenceCollectionTimeMs:Number(source.evidenceCollectionTimeMs||0),
    reviewerTimeMs:Number(source.reviewerTimeMs||0),
    testerTimeMs:Number(source.testerTimeMs||0),
    docSyncVerificationTimeMs:Number(source.docSyncVerificationTimeMs||0),
    retryLoopCount:Number(source.retryLoopCount||0),
    outcomeConversionTimeMs:Number(source.outcomeConversionTimeMs||0),
    dominantBottleneck:safeString(source.dominantBottleneck,80)||"none",
    timingModel:safeString(source.timingModel,120)||"overlapping_estimates_with_wall_clock_total",
    componentTimesMayOverlap:Boolean(source.componentTimesMayOverlap),
    dominantBottleneckBasis:safeString(source.dominantBottleneckBasis,160)||"",
    interpretationGuide:Array.isArray(source.interpretationGuide)
      ?source.interpretationGuide
      :[],
    qualityGate:source.qualityGate&&typeof source.qualityGate==="object"?source.qualityGate:{},
    acceptanceSummary:source.acceptanceSummary&&typeof source.acceptanceSummary==="object"?source.acceptanceSummary:{},
    reviewerFindingSummary:Array.isArray(source.reviewerFindingSummary)?source.reviewerFindingSummary:[],
    testerResultSummary:Array.isArray(source.testerResultSummary)?source.testerResultSummary:[],
    requiredEvidenceFailures:Array.isArray(source.requiredEvidenceFailures)?source.requiredEvidenceFailures:[],
    stageDurations:source.stageDurations&&typeof source.stageDurations==="object"?source.stageDurations:{},
  };
}
function normalizeCurrentLatestRunSummary(latestRunSummary,latestSignoffSummary){
  const source=latestRunSummary&&typeof latestRunSummary==="object"?latestRunSummary:{};
  const signoffBundleFallback=buildLatestRunSummaryFromSignoffBundle({
    allPassed:Boolean(latestSignoffSummary&&latestSignoffSummary.allPassed),
    bundleRef:latestSignoffSummary&&latestSignoffSummary.bundleRef&&typeof latestSignoffSummary.bundleRef==="object"
      ?latestSignoffSummary.bundleRef
      :{},
    bundlePath:latestSignoffSummary&&latestSignoffSummary.bundleRef&&latestSignoffSummary.bundleRef.bundlePath,
    summaryPath:latestSignoffSummary&&latestSignoffSummary.bundleRef&&latestSignoffSummary.bundleRef.summaryPath,
  });
  const fallbackSource=signoffBundleFallback&&typeof signoffBundleFallback==="object"
    ?signoffBundleFallback
    :{};
  const finalOutcome=source.finalOutcome&&typeof source.finalOutcome==="object"?source.finalOutcome:{};
  const evidenceRefs=source.evidenceRefs&&typeof source.evidenceRefs==="object"?source.evidenceRefs:{};
  const fallbackEvidenceRefs=fallbackSource.evidenceRefs&&typeof fallbackSource.evidenceRefs==="object"
    ?fallbackSource.evidenceRefs
    :{};
  const selectedUsedPolicies=Array.isArray(source.usedPolicies)&&source.usedPolicies.length
    ?source.usedPolicies
    :(Array.isArray(fallbackSource.usedPolicies)?fallbackSource.usedPolicies:[]);
  const selectedUsedContracts=Array.isArray(source.usedContracts)&&source.usedContracts.length
    ?source.usedContracts
    :(Array.isArray(fallbackSource.usedContracts)?fallbackSource.usedContracts:[]);
  const selectedUsedSkills=Array.isArray(source.usedSkills)&&source.usedSkills.length
    ?source.usedSkills
    :(Array.isArray(fallbackSource.usedSkills)?fallbackSource.usedSkills:[]);
  const selectedChangedPaths=Array.isArray(source.changedPaths)&&source.changedPaths.length
    ?source.changedPaths
    :(Array.isArray(fallbackSource.changedPaths)?fallbackSource.changedPaths:[]);
  const selectedDocSyncSummary=source.docSyncSummary&&typeof source.docSyncSummary==="object"&&Object.keys(source.docSyncSummary).length
    ?source.docSyncSummary
    :(fallbackSource.docSyncSummary&&typeof fallbackSource.docSyncSummary==="object"
      ?fallbackSource.docSyncSummary
      :{});
  return{
    schema:"latest-run-summary.v3",
    generatedAt:toIsoTimestamp(Date.now()),
    runId:safeString(source.runId||source.taskId||source.turnId||fallbackSource.runId||fallbackSource.taskId||fallbackSource.turnId,160)||"",
    threadId:safeString(source.threadId||fallbackSource.threadId,160)||"",
    turnId:safeString(source.turnId||fallbackSource.turnId||fallbackSource.taskId,160)||"",
    selectedPlanningDepth:safeString(source.selectedPlanningDepth||fallbackSource.selectedPlanningDepth,80)||"",
    selectedAssuranceDepth:safeString(source.selectedAssuranceDepth||fallbackSource.selectedAssuranceDepth,80)||"",
    finalOutcome:Object.keys(finalOutcome).length
      ?finalOutcome
      :(fallbackSource.finalOutcome&&typeof fallbackSource.finalOutcome==="object"?fallbackSource.finalOutcome:{}),
    usedAgents:Array.isArray(source.usedAgents)?source.usedAgents:[],
    usedPolicies:selectedUsedPolicies,
    usedContracts:selectedUsedContracts,
    usedSkills:selectedUsedSkills,
    dispatchCount:Number(source.dispatchCount||fallbackSource.dispatchCount||0),
    dispatchSuccessCount:Number(source.dispatchSuccessCount||fallbackSource.dispatchSuccessCount||0),
    implementationObserved:Boolean(source.implementationObserved||fallbackSource.implementationObserved),
    reviewerObserved:Boolean(source.reviewerObserved||fallbackSource.reviewerObserved),
    testerObserved:Boolean(source.testerObserved||fallbackSource.testerObserved),
    changedPaths:selectedChangedPaths.map((entry)=>normalizeCurrentSurfacePath(entry)).filter(Boolean),
    docSyncSummary:selectedDocSyncSummary,
    evidenceRefs:{
      bundlePath:normalizeCurrentSurfacePath(
        latestSignoffSummary&&latestSignoffSummary.bundleRef&&latestSignoffSummary.bundleRef.bundlePath
        ||evidenceRefs.bundlePath
        ||fallbackEvidenceRefs.bundlePath
        ||""
      ),
      signoffSummaryPath:normalizeCurrentSurfacePath(
        latestSignoffSummary&&latestSignoffSummary.bundleRef&&latestSignoffSummary.bundleRef.summaryPath
        ||evidenceRefs.signoffSummaryPath
        ||fallbackEvidenceRefs.signoffSummaryPath
        ||""
      ),
      naturalTaskTraceSummaryPath:normalizeCurrentSurfacePath(
        evidenceRefs.naturalTaskTraceSummaryPath
        ||evidenceRefs.naturalTaskTraceSummary
        ||fallbackEvidenceRefs.naturalTaskTraceSummaryPath
        ||""
      ),
      coreHarnessWorkflowRunPath:normalizeCurrentSurfacePath(
        evidenceRefs.coreHarnessWorkflowRunPath
        ||evidenceRefs.coreHarnessWorkflowRun
        ||fallbackEvidenceRefs.coreHarnessWorkflowRunPath
        ||""
      ),
    },
    residualRisks:Array.isArray(source.residualRisks)?source.residualRisks:[],
    informationalNotes:Array.isArray(source.informationalNotes)?source.informationalNotes:[],
    assumptions:Array.isArray(source.assumptions)?source.assumptions:[],
    operatorCaveats:Array.isArray(source.operatorCaveats)?source.operatorCaveats:[],
    signoffRef:{
      allPassed:Boolean(latestSignoffSummary&&latestSignoffSummary.allPassed),
      bundlePath:normalizeCurrentSurfacePath(latestSignoffSummary&&latestSignoffSummary.bundleRef&&latestSignoffSummary.bundleRef.bundlePath||""),
      summaryPath:normalizeCurrentSurfacePath(latestSignoffSummary&&latestSignoffSummary.bundleRef&&latestSignoffSummary.bundleRef.summaryPath||""),
    },
  };
}
function normalizeCurrentOperatorSummary({operatorSummary,designConformanceSummary,latestRunSummary,reviewLoadBreakdown,latestSignoffSummary}){
  const source=operatorSummary&&typeof operatorSummary==="object"?operatorSummary:{};
  const posture=source.postureSummary&&typeof source.postureSummary==="object"
    ?source.postureSummary
    :source.posture&&typeof source.posture==="object"
      ?source.posture
      :{};
  const designConformanceStatus=safeString(designConformanceSummary&&designConformanceSummary.overallDesignConformance&&designConformanceSummary.overallDesignConformance.status,20)||"fail";
  const latestRunStatus=safeString(
    latestRunSummary&&latestRunSummary.finalOutcome&&(
      latestRunSummary.finalOutcome.taskOutcomeStatus
      ||latestRunSummary.finalOutcome.status
    ),
    80
  )||"UNKNOWN";
  const signoffReady=Boolean(latestSignoffSummary&&latestSignoffSummary.signoffReady);
  const signoffStatus=Boolean(latestSignoffSummary&&latestSignoffSummary.allPassed)?"PASS":"FAIL";
  const hasReviewLoadSummary=
    Number(reviewLoadBreakdown&&reviewLoadBreakdown.totalStep4DurationMs||0)>0
    ||Number(reviewLoadBreakdown&&reviewLoadBreakdown.evidenceCollectionTimeMs||0)>0
    ||Number(reviewLoadBreakdown&&reviewLoadBreakdown.reviewerTimeMs||0)>0
    ||Number(reviewLoadBreakdown&&reviewLoadBreakdown.testerTimeMs||0)>0
    ||Number(reviewLoadBreakdown&&reviewLoadBreakdown.docSyncVerificationTimeMs||0)>0
    ||(Boolean(safeString(reviewLoadBreakdown&&reviewLoadBreakdown.dominantBottleneck,80))
      &&safeString(reviewLoadBreakdown&&reviewLoadBreakdown.dominantBottleneck,80)!=="none");
  const reviewLoadStatus=hasReviewLoadSummary?"REVIEW_SUMMARY_AVAILABLE":"MISSING";
  const recommendedDecision=signoffReady&&designConformanceStatus==="pass"&&latestRunStatus==="COMPLETED"
    ?"SAFE_TO_SIGNOFF"
    :latestRunStatus==="UNKNOWN"||reviewLoadStatus==="MISSING"
      ?"CURRENT_TRUTH_INCOMPLETE"
      :latestRunStatus==="COMPLETED"
        ?"REVIEW_BEFORE_SIGNOFF"
        :"DO_NOT_SIGNOFF";
  const topLineDecision=recommendedDecision;
  const whyThisIsSafe=[];
  if(latestRunStatus==="COMPLETED")whyThisIsSafe.push("Latest run completed.");
  if(designConformanceStatus==="pass")whyThisIsSafe.push("Design conformance checks are passing.");
  if(signoffReady)whyThisIsSafe.push("Latest signoff checks passed.");
  const whyThisMayNeedAttention=[];
  if(Array.isArray(latestRunSummary&&latestRunSummary.residualRisks)&&latestRunSummary.residualRisks.length){
    whyThisMayNeedAttention.push(`Residual risks: ${latestRunSummary.residualRisks.join("; ")}`);
  }
  if(Array.isArray(latestRunSummary&&latestRunSummary.informationalNotes)&&latestRunSummary.informationalNotes.length){
    whyThisMayNeedAttention.push(`Informational notes: ${latestRunSummary.informationalNotes.join("; ")}`);
  }
  if(reviewLoadBreakdown&&reviewLoadBreakdown.dominantBottleneck&&reviewLoadBreakdown.dominantBottleneck!=="none"){
    whyThisMayNeedAttention.push(`Dominant Step 4 bottleneck: ${reviewLoadBreakdown.dominantBottleneck}.`);
  }
  if(reviewLoadStatus==="MISSING")whyThisMayNeedAttention.push("Current review-load summary is missing.");
  if(designConformanceStatus!=="pass")whyThisMayNeedAttention.push("Design conformance summary is not fully passing.");
  if(!signoffReady)whyThisMayNeedAttention.push("Latest signoff bundle is not fully passing.");
  return{
    schema:"operator-summary.v3",
    generatedAt:toIsoTimestamp(Date.now()),
    topLineDecision,
    recommendedDecision,
    designConformanceStatus,
    latestRunStatus,
    signoffStatus,
    reviewLoadStatus,
    whyThisIsSafe,
    whyThisMayNeedAttention,
    openOnlyIfNeeded:[
      "logs/current/design_conformance_summary.json",
      "logs/current/latest_run_summary.json",
      "logs/current/review_load_breakdown.json",
      "logs/current/latest_signoff_summary.json",
      ...(latestSignoffSummary&&latestSignoffSummary.bundleRef&&latestSignoffSummary.bundleRef.bundlePath
        ?[latestSignoffSummary.bundleRef.bundlePath]
        :[]),
    ],
    postureSummary:{
      loggingMode:safeString(posture.loggingMode,40)||"OPERATOR",
      requestUserInputPolicy:safeString(posture.requestUserInputPolicy,40)||"blocked",
      parentDispatchGuardMode:safeString(posture.parentDispatchGuardMode,40)||"enforce",
      defaultExecAgent:designConformanceStatus==="pass"
        ?"default"
        :(safeString(posture.defaultExecAgent,80)||defaultExecAgentName||"unknown"),
      runtimePostureSafe:Boolean(latestSignoffSummary&&latestSignoffSummary.runtimePostureSafe),
    },
    refs:{
      designConformanceSummary:"logs/current/design_conformance_summary.json",
      latestRunSummary:"logs/current/latest_run_summary.json",
      reviewLoadBreakdown:"logs/current/review_load_breakdown.json",
      latestSignoffSummary:"logs/current/latest_signoff_summary.json",
      bundlePath:normalizeCurrentSurfacePath(latestSignoffSummary&&latestSignoffSummary.bundleRef&&latestSignoffSummary.bundleRef.bundlePath||""),
    },
  };
}
function parseWorkflowCasePreview(caseEntry){
  const preview=safeString(caseEntry&&caseEntry.output&&caseEntry.output.preview,4000);
  if(!preview)return null;
  try{
    return JSON.parse(preview);
  }catch{
    return null;
  }
}
function getWorkflowCaseById(coreHarnessWorkflowRun,caseId){
  const runs=Array.isArray(coreHarnessWorkflowRun&&coreHarnessWorkflowRun.report&&coreHarnessWorkflowRun.report.runs)
    ?coreHarnessWorkflowRun.report.runs
    :[];
  const cases=runs[0]&&Array.isArray(runs[0].cases)?runs[0].cases:[];
  return cases.find((entry)=>safeString(entry&&entry.caseId,120)===caseId)||null;
}
function buildCurrentReviewLoadBreakdownFile(latestRunSummary){
  const source=latestRunSummary&&latestRunSummary.reviewLoadBreakdown&&typeof latestRunSummary.reviewLoadBreakdown==="object"
    ?latestRunSummary.reviewLoadBreakdown
    :{};
  return{
    schema:"current-review-load-breakdown.v2",
    generatedAt:toIsoTimestamp(Date.now()),
    turnId:latestRunSummary&&latestRunSummary.turnId?latestRunSummary.turnId:null,
    threadId:latestRunSummary&&latestRunSummary.threadId?latestRunSummary.threadId:null,
    evidenceCollectionTimeMs:Number(source.evidenceCollectionTimeMs||0),
    testerTimeMs:Number(source.testerTimeMs||0),
    reviewerTimeMs:Number(source.reviewerTimeMs||0),
    docSyncVerificationTimeMs:Number(source.docSyncVerificationTimeMs||0),
    retryLoopCount:Number(source.retryLoopCount||0),
    outcomeConversionTimeMs:Number(source.outcomeConversionTimeMs||0),
    totalStep4DurationMs:Number(source.totalStep4DurationMs||0),
    dominantBottleneck:safeString(source.dominantBottleneck,80)||"none",
    timingModel:safeString(source.timingModel,80)||"overlapping_estimates_with_wall_clock_total",
    componentTimesMayOverlap:Boolean(source.componentTimesMayOverlap!==undefined?source.componentTimesMayOverlap:true),
    dominantBottleneckBasis:safeString(source.dominantBottleneckBasis,160)
      ||"largest estimated Step 4 component, even when component windows overlap",
    interpretationGuide:Array.isArray(source.interpretationGuide)
      ?source.interpretationGuide
      :[
        "`totalStep4DurationMs` is the wall-clock Step 4 duration.",
        "Component times are heuristic slices derived from review/test/doc-sync checkpoints and may overlap.",
        "`dominantBottleneck` points to the largest estimated component rather than a strict additive share of total time.",
      ],
    qualityGate:source.qualityGate&&typeof source.qualityGate==="object"?source.qualityGate:{},
    acceptanceSummary:source.acceptanceSummary&&typeof source.acceptanceSummary==="object"?source.acceptanceSummary:{},
    reviewerFindingSummary:Array.isArray(source.reviewerFindingSummary)?source.reviewerFindingSummary:[],
    testerResultSummary:Array.isArray(source.testerResultSummary)?source.testerResultSummary:[],
    requiredEvidenceFailures:Array.isArray(source.requiredEvidenceFailures)?source.requiredEvidenceFailures:[],
    stageDurations:source.stageDurations&&typeof source.stageDurations==="object"?source.stageDurations:{},
  };
}
function buildCurrentDesignConformanceSummary({runtimeSnapshot,latestRunSummary,latestSignoffSummary}){
  const runtime=runtimeSnapshot&&runtimeSnapshot.runtime&&typeof runtimeSnapshot.runtime==="object"?runtimeSnapshot.runtime:{};
  const latestTurn=runtime.latestTurn&&typeof runtime.latestTurn==="object"?runtime.latestTurn:{};
  const check=(pass,reason,evidenceRef)=>({
    status:pass?"pass":"fail",
    reason,
    evidenceRef,
  });
  const latestRunEvidenceRef=repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestRunSummaryPath);
  const signoffEvidenceRef=latestSignoffSummary
    ?repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestSignoffSummaryPath)
    :latestRunEvidenceRef;
  const signoffCandidates=listBundleSummaryCandidates(signoffBundlesRoot,"signoff_summary.json");
  const latestSignoffCandidate=selectPreferredSignoffCandidate(signoffCandidates);
  const signoffBundleSummary=latestSignoffCandidate&&latestSignoffCandidate.summary&&typeof latestSignoffCandidate.summary==="object"
    ?latestSignoffCandidate.summary
    :{};
  const signoffRuntime=signoffBundleSummary.runtime&&typeof signoffBundleSummary.runtime==="object"?signoffBundleSummary.runtime:{};
  const signoffTask=signoffBundleSummary.signoffTask&&typeof signoffBundleSummary.signoffTask==="object"?signoffBundleSummary.signoffTask:{};
  const naturalTask=signoffBundleSummary.naturalTask&&typeof signoffBundleSummary.naturalTask==="object"?signoffBundleSummary.naturalTask:{};
  const signoffTaskAssertions=signoffTask.assertions&&typeof signoffTask.assertions==="object"?signoffTask.assertions:{};
  const naturalTaskAssertions=naturalTask.assertions&&typeof naturalTask.assertions==="object"?naturalTask.assertions:{};
  const latestTurnTerminalStatus=safeString(latestTurn.terminalStatus,40)||safeString(latestTurn.terminal_status,40)||"unknown";
  const latestTurnTaskOutcomeStatus=safeString(latestTurn.taskOutcomeStatus,80)||safeString(latestTurn.task_outcome_status,80)||"unknown";
  const coreHarnessWorkflowRun=readWorkspaceJsonArtifact(signoffBundleSummary.paths&&signoffBundleSummary.paths.coreHarnessWorkflowRun)||{};
  const requestUserInputBlocked=getWorkflowCaseById(coreHarnessWorkflowRun,"needs_input_blocked_policy");
  const workerRejected=getWorkflowCaseById(coreHarnessWorkflowRun,"retired_worker_rejected");
  const workerScopedRejected=getWorkflowCaseById(coreHarnessWorkflowRun,"retired_worker_scoped_rejected");
  const fastPlanning=getWorkflowCaseById(coreHarnessWorkflowRun,"planning_mode_fast_selected");
  const discoveryPlanning=getWorkflowCaseById(coreHarnessWorkflowRun,"planning_mode_discovery_selected");
  const reviewerTesterRequired=getWorkflowCaseById(coreHarnessWorkflowRun,"reviewer_tester_required_case");
  const dedicatedTestsRequired=getWorkflowCaseById(coreHarnessWorkflowRun,"dedicated_test_required_for_new_logic");
  const failedValidationBridge=getWorkflowCaseById(coreHarnessWorkflowRun,"turn_task_outcome_bridge_failed_validation");
  const blockedBridge=getWorkflowCaseById(coreHarnessWorkflowRun,"turn_task_outcome_bridge_blocked");
  const missingEvidence=getWorkflowCaseById(coreHarnessWorkflowRun,"failed_validation_missing_evidence");
  const checks={
    defaultExecAgentIsDefault:check(
      Boolean(signoffRuntime.fullUtilization&&signoffRuntime.fullUtilization.checks&&signoffRuntime.fullUtilization.checks.defaultExecAgentIsDefault),
      Boolean(signoffRuntime.fullUtilization&&signoffRuntime.fullUtilization.checks&&signoffRuntime.fullUtilization.checks.defaultExecAgentIsDefault)
        ?"default exec agent is 'default'"
        :`default exec agent is '${defaultExecAgentName}'`,
      signoffEvidenceRef
    ),
    requestUserInputPolicyBlocked:check(
      signoffRuntime&&signoffRuntime.nonInteractiveUserInput&&signoffRuntime.nonInteractiveUserInput.policy==="blocked"&&Boolean(requestUserInputBlocked&&requestUserInputBlocked.passed),
      signoffRuntime&&signoffRuntime.nonInteractiveUserInput&&signoffRuntime.nonInteractiveUserInput.policy==="blocked"
        ?"non-interactive request-user-input policy is blocked"
        :`non-interactive request-user-input policy is '${safeString(runtimeSnapshot&&runtimeSnapshot.posture&&runtimeSnapshot.posture.requestUserInputPolicy&&runtimeSnapshot.posture.requestUserInputPolicy.policy,40)||"unknown"}'`,
      signoffEvidenceRef
    ),
    parentDispatchGuardEnforced:check(
      signoffRuntime&&signoffRuntime.parentDispatchGuard&&signoffRuntime.parentDispatchGuard.mode==="enforce",
      signoffRuntime&&signoffRuntime.parentDispatchGuard&&signoffRuntime.parentDispatchGuard.mode==="enforce"
        ?"parent dispatch guard mode is enforce"
        :`parent dispatch guard mode is '${safeString(runtimeSnapshot&&runtimeSnapshot.posture&&runtimeSnapshot.posture.parentDispatchGuard&&runtimeSnapshot.posture.parentDispatchGuard.mode,20)||"unknown"}'`,
      signoffEvidenceRef
    ),
    retiredWorkerNotRoutable:check(
      Boolean(workerRejected&&workerRejected.passed)&&Boolean(workerScopedRejected&&workerScopedRejected.passed),
      Boolean(workerRejected&&workerRejected.passed)&&Boolean(workerScopedRejected&&workerScopedRejected.passed)
        ?"worker is retained only as a legacy contract and not routable for active execution"
        :"worker routability rejection was not fully proven by workflow probes",
      signoffEvidenceRef
    ),
    planningDepthSelectorWorking:check(
      Boolean(fastPlanning&&fastPlanning.passed)&&Boolean(discoveryPlanning&&discoveryPlanning.passed),
      Boolean(fastPlanning&&fastPlanning.passed)&&Boolean(discoveryPlanning&&discoveryPlanning.passed)
        ?"planning depth probes passed for FAST and DISCOVERY"
        :"planning depth probes are incomplete or failing",
      signoffEvidenceRef
    ),
    assuranceDepthSelectorWorking:check(
      Boolean(reviewerTesterRequired&&reviewerTesterRequired.passed)
      &&Boolean(dedicatedTestsRequired&&dedicatedTestsRequired.passed)
      &&safeString(reviewerTesterRequired&&reviewerTesterRequired.reason,80)!=="json_fields_mismatch"
      &&safeString(dedicatedTestsRequired&&dedicatedTestsRequired.reason,80)!=="json_fields_mismatch",
      Boolean(reviewerTesterRequired&&reviewerTesterRequired.passed)&&Boolean(dedicatedTestsRequired&&dedicatedTestsRequired.passed)
        ?"assurance depth escalated to SIGNOFF_ASSURANCE when required"
        :"assurance depth probes are incomplete or failing",
      signoffEvidenceRef
    ),
    specialistDispatchObservedWhenImplementationOccurred:check(
      Boolean(naturalTaskAssertions.implementationObserved)
        &&Boolean(naturalTaskAssertions.parentDispatchSatisfied)
        &&Boolean(naturalTaskAssertions.dispatchCountObserved),
      Boolean(naturalTaskAssertions.implementationObserved)
        ?"natural task trace shows implementation with delegated specialist dispatch"
        :"natural task trace does not prove delegated implementation",
      signoffEvidenceRef
    ),
    reviewerObservedWhenRequired:check(
      Boolean(signoffTaskAssertions.signoffReviewerExecuted),
      Boolean(signoffTaskAssertions.signoffReviewerExecuted)
        ?"reviewer observed on signoff-required run"
        :"reviewer missing on signoff-required run",
      signoffEvidenceRef
    ),
    testerObservedWhenRequired:check(
      Boolean(signoffTaskAssertions.signoffTesterExecuted),
      Boolean(signoffTaskAssertions.signoffTesterExecuted)
        ?"tester observed on signoff-required run"
        :"tester missing on signoff-required run",
      signoffEvidenceRef
    ),
    taskOutcomeSemanticsValid:check(
      Boolean(failedValidationBridge&&failedValidationBridge.passed)
        &&Boolean(blockedBridge&&blockedBridge.passed)
        &&Boolean(missingEvidence&&missingEvidence.passed),
      Boolean(failedValidationBridge&&failedValidationBridge.passed)
        ?`terminal=${latestTurnTerminalStatus} taskOutcome=${latestTurnTaskOutcomeStatus}`
        :"task outcome bridge probes are incomplete or failing",
      signoffEvidenceRef
    ),
    docSyncEvidencePresentWhenRequired:check(
      Boolean(signoffTaskAssertions.evidenceBulletPresent)
        &&Boolean(signoffTaskAssertions.changelogUpdated)
        &&Boolean(signoffTaskAssertions.reviewBreakdownPresent),
      Boolean(signoffTaskAssertions.evidenceBulletPresent)
        ?"doc sync evidence is present when required"
        :"doc sync evidence is incomplete for the signoff-required run",
      signoffEvidenceRef
    ),
    signoffCriteriaSatisfied:check(
      Boolean(latestSignoffSummary&&Number(latestSignoffSummary.allPassed||0)===1),
      latestSignoffSummary&&Number(latestSignoffSummary.allPassed||0)===1
        ?"latest signoff bundle passed all assertions"
        :"latest signoff bundle is missing or not fully passing",
      signoffEvidenceRef
    ),
  };
  const allPass=Object.values(checks).every((entry)=>entry&&entry.status==="pass");
  return{
    schema:"design-conformance-summary.v2",
    generatedAt:toIsoTimestamp(Date.now()),
    ...checks,
    overallDesignConformance:{
      status:allPass?"pass":"fail",
      reason:allPass?"all tracked design conformance checks passed":"one or more tracked design conformance checks failed",
      evidenceRef:signoffEvidenceRef||latestRunEvidenceRef,
    },
  };
}
function buildCurrentOperatorSummaryFile({runtimeSnapshot,latestRunSummary,latestSignoffSummary,reviewLoadBreakdown,designConformanceSummary,conformanceReport,operatorViewSummary}){
  const finalOutcome=latestRunSummary&&latestRunSummary.finalOutcome&&typeof latestRunSummary.finalOutcome==="object"
    ?latestRunSummary.finalOutcome
    :{};
  const overallConformance=designConformanceSummary&&designConformanceSummary.overallDesignConformance&&typeof designConformanceSummary.overallDesignConformance==="object"
    ?designConformanceSummary.overallDesignConformance
    :{};
  const requiredEvidenceFailures=Array.isArray(reviewLoadBreakdown&&reviewLoadBreakdown.requiredEvidenceFailures)
    ?reviewLoadBreakdown.requiredEvidenceFailures
    :[];
  const residualRisks=Array.isArray(latestRunSummary&&latestRunSummary.residualRisks)?latestRunSummary.residualRisks:[];
  const informationalNotes=Array.isArray(latestRunSummary&&latestRunSummary.informationalNotes)?latestRunSummary.informationalNotes:[];
  const operatorCaveats=Array.isArray(latestRunSummary&&latestRunSummary.operatorCaveats)?latestRunSummary.operatorCaveats:[];
  const runtimePosture=runtimeSnapshot&&runtimeSnapshot.posture&&typeof runtimeSnapshot.posture==="object"
    ?runtimeSnapshot.posture
    :{};
  const postureSafe=Boolean(latestSignoffSummary&&Number(latestSignoffSummary.runtimePostureSafe||0)===1);
  const designConformant=safeString(overallConformance.status,40)==="pass";
  const signoffReady=Boolean(latestSignoffSummary&&Number(latestSignoffSummary.signoffReady||0)===1);
  const latestRunStatus=isCompletedOperatorOutcome(finalOutcome)
    ?"COMPLETED"
    :(safeString(finalOutcome.taskOutcomeStatus,80).toUpperCase()||safeString(finalOutcome.status,80).toUpperCase()||"UNKNOWN");
  const reviewLoadStatus=requiredEvidenceFailures.length
    ?"ATTENTION_REQUIRED"
    :safeString(reviewLoadBreakdown&&reviewLoadBreakdown.dominantBottleneck,80)&&safeString(reviewLoadBreakdown&&reviewLoadBreakdown.dominantBottleneck,80)!=="none"
      ?"REVIEW_SUMMARY_AVAILABLE"
      :"NO_REVIEW_LOAD_RECORDED";
  const topLineDecision=signoffReady&&designConformant&&latestRunStatus==="COMPLETED"
    ?"SAFE_TO_SIGNOFF"
    :(safeString(conformanceReport&&conformanceReport.releaseDecision&&conformanceReport.releaseDecision.terminal_state,80)
      ||buildOperatorDecisionSummary({
        finalOutcome,
        signoffReady,
        designConformant,
        postureSafe,
        requiredEvidenceFailures,
      }));
  const refs={
    designConformanceSummary:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentDesignConformancePath),
    latestRunSummary:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestRunSummaryPath),
    reviewLoadBreakdown:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentReviewLoadBreakdownPath),
    latestSignoffSummary:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestSignoffSummaryPath),
    bundlePath:latestSignoffSummary&&latestSignoffSummary.bundleRef?safeString(latestSignoffSummary.bundleRef.bundlePath,260)||"": "",
  };
  const whyThisIsSafe=[
    isCompletedOperatorOutcome(finalOutcome)
      ?`Latest run completed with task outcome ${safeString(finalOutcome.taskOutcomeStatus,80)||safeString(finalOutcome.status,40)||"unknown"}.`
      :"",
    postureSafe
      ?"Runtime posture keeps request-user-input blocked and parent dispatch guard enforced."
      :"",
    designConformant
      ?"Tracked design-conformance checks are passing."
      :"",
    signoffReady
      ?"Latest signoff bundle assertions all passed."
      :"",
  ].filter(Boolean);
  const whyThisMayNeedAttention=Array.from(new Set([
    requiredEvidenceFailures.length?`Required evidence failures: ${requiredEvidenceFailures.join("; ")}`:"",
    residualRisks.length?`Residual risks remain: ${residualRisks.join("; ")}`:"",
    informationalNotes.length?`Informational notes were separated from residual risks to keep completed-outcome semantics clean.`:"",
    safeString(reviewLoadBreakdown&&reviewLoadBreakdown.dominantBottleneck,80)&&safeString(reviewLoadBreakdown&&reviewLoadBreakdown.dominantBottleneck,80)!=="none"
      ?`Dominant Step 4 bottleneck estimate: ${safeString(reviewLoadBreakdown&&reviewLoadBreakdown.dominantBottleneck,80)}.`
      :"",
    !signoffReady&&latestSignoffSummary
      ?"Latest signoff bundle is not fully passing yet."
      :"",
    !designConformant
      ?"Design conformance summary is not fully passing."
      :"",
  ].filter(Boolean))).slice(0,8);
  return{
    schema:"operator-summary.v3",
    generatedAt:toIsoTimestamp(Date.now()),
    topLineDecision,
    designConformanceStatus:safeString(overallConformance.status,40)||"unknown",
    latestRunStatus:latestRunStatus,
    signoffStatus:signoffReady?"PASS":"FAIL",
    reviewLoadStatus:reviewLoadStatus,
    whyThisIsSafe,
    whyThisMayNeedAttention,
    openOnlyIfNeeded:Object.values(refs).filter(Boolean),
    postureSummary:{
      loggingMode:"OPERATOR",
      requestUserInputPolicy:postureSafe?"blocked":(safeString(runtimePosture.requestUserInputPolicy&&runtimePosture.requestUserInputPolicy.policy,40)||"unknown"),
      parentDispatchGuardMode:postureSafe?"enforce":(safeString(runtimePosture.parentDispatchGuard&&runtimePosture.parentDispatchGuard.mode,40)||"unknown"),
      defaultExecAgent:designConformant?"default":(safeString(runtimeSnapshot&&runtimeSnapshot.defaultExecAgent,80)||defaultExecAgentName||"unknown"),
      runtimePostureSafe:postureSafe?true:false,
    },
    refs,
  };
}
function buildCurrentIndexFile({runtimeSnapshot,latestRunSummary,latestSignoffSummary,reviewLoadBreakdown}){
  return{
    schema:"current-log-index.v2",
    generatedAt:toIsoTimestamp(Date.now()),
    firstLookFiles:[
      {
        question:"What should a human open first?",
        path:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentOperatorSummaryPath),
      },
    ],
    detailedFiles:[
      {
        question:"What happened on the latest run?",
        path:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestRunSummaryPath),
      },
      {
        question:"Is Step 4 review load too heavy?",
        path:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentReviewLoadBreakdownPath),
      },
      {
        question:"What is the current runtime posture and storage map?",
        path:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentRuntimeSnapshotPath),
      },
      {
        question:"Is the harness still built according to the intended design?",
        path:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentDesignConformancePath),
      },
      {
        question:"What is the current constitution conformance report?",
        path:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentConformanceReportPath),
      },
      {
        question:"What does the operator need on one screen?",
        path:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentOperatorViewSummaryPath),
      },
      ...(latestSignoffSummary
        ?[
          {
            question:"Is the latest signoff bundle ready to trust?",
            path:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestSignoffSummaryPath),
          },
        ]
        :[]),
    ],
    surfaces:{
      current:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentRoot),
      bundles:repoRelativePath(workspaceRoot,loggingSurfacePaths.bundlesRoot),
      archive:repoRelativePath(workspaceRoot,loggingSurfacePaths.archiveRoot),
    },
    latest:{
      turnId:latestRunSummary&&latestRunSummary.turnId?latestRunSummary.turnId:null,
      taskOutcomeStatus:latestRunSummary&&latestRunSummary.finalOutcome?latestRunSummary.finalOutcome.taskOutcomeStatus:null,
      signoffBundle:latestSignoffSummary&&latestSignoffSummary.bundleName?latestSignoffSummary.bundleName:null,
      dominantReviewBottleneck:reviewLoadBreakdown&&reviewLoadBreakdown.dominantBottleneck?reviewLoadBreakdown.dominantBottleneck:"none",
      loggingMode:runtimeSnapshot&&runtimeSnapshot.loggingMode?runtimeSnapshot.loggingMode:loggingMode,
    },
  };
}
function updateCurrentLogSurface({trigger=""}={}){
  ensureLoggingSurfaceDir(loggingSurfacePaths.currentRoot);
  const runtimeSnapshot=buildCurrentRuntimeSnapshotFile();
  const latestSignoffSummaryRaw=buildLatestSignoffSummaryFile();
  const latestRunSummaryRaw=buildLatestRunSummaryFile();
  const reviewLoadBreakdownRaw=buildCurrentReviewLoadBreakdownFile(latestRunSummaryRaw);
  const designConformanceSummaryRaw=buildCurrentDesignConformanceSummary({
    runtimeSnapshot,
    latestRunSummary:latestRunSummaryRaw,
    latestSignoffSummary:latestSignoffSummaryRaw,
  });
  const conformanceReport=buildConformanceReport({
    latestRunSummary:latestRunSummaryRaw,
    signoffSummary:latestSignoffSummaryRaw,
    childEvidenceLedger:latestRunSummaryRaw&&Array.isArray(latestRunSummaryRaw.childEvidenceLedger)?latestRunSummaryRaw.childEvidenceLedger:[],
    requiredEvidenceFailures:reviewLoadBreakdownRaw&&Array.isArray(reviewLoadBreakdownRaw.requiredEvidenceFailures)?reviewLoadBreakdownRaw.requiredEvidenceFailures:[],
    evidenceRefs:[
      repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestRunSummaryPath),
      repoRelativePath(workspaceRoot,loggingSurfacePaths.currentReviewLoadBreakdownPath),
      repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestSignoffSummaryPath),
    ],
    rationaleNotes:[
      `trigger=${safeString(trigger,80)||"runtime_update"}`,
    ],
  });
  const operatorViewSummary=buildOperatorViewSummary({
    latestRunSummary:latestRunSummaryRaw,
    reviewBundle:conformanceReport.reviewBundle,
    releaseDecision:conformanceReport.releaseDecision,
    conformanceReport,
    routingDecision:conformanceReport.routingDecision,
  });
  const operatorSummaryRaw=buildCurrentOperatorSummaryFile({
    runtimeSnapshot,
    latestRunSummary:latestRunSummaryRaw,
    latestSignoffSummary:latestSignoffSummaryRaw,
    reviewLoadBreakdown:reviewLoadBreakdownRaw,
    designConformanceSummary:designConformanceSummaryRaw,
    conformanceReport,
    operatorViewSummary,
  });
  const latestSignoffSummary=normalizeCurrentLatestSignoffSummary(latestSignoffSummaryRaw);
  const latestRunSummary=normalizeCurrentLatestRunSummary(latestRunSummaryRaw,latestSignoffSummary);
  const reviewLoadBreakdown=normalizeCurrentReviewLoadBreakdown(reviewLoadBreakdownRaw);
  const designConformanceSummary=normalizeCurrentDesignConformanceSummary(designConformanceSummaryRaw);
  const operatorSummary=normalizeCurrentOperatorSummary({
    operatorSummary:operatorSummaryRaw,
    designConformanceSummary,
    latestRunSummary,
    reviewLoadBreakdown,
    latestSignoffSummary,
  });
  writeLoggingSurfaceJson(loggingSurfacePaths.currentOperatorSummaryPath,operatorSummary);
  writeLoggingSurfaceJson(loggingSurfacePaths.currentLatestRunSummaryPath,latestRunSummary);
  writeLoggingSurfaceJson(loggingSurfacePaths.currentReviewLoadBreakdownPath,reviewLoadBreakdown);
  writeLoggingSurfaceJson(loggingSurfacePaths.currentDesignConformancePath,designConformanceSummary);
  if(latestSignoffSummary){
    writeLoggingSurfaceJson(loggingSurfacePaths.currentLatestSignoffSummaryPath,latestSignoffSummary);
  }else if(fs.existsSync(loggingSurfacePaths.currentLatestSignoffSummaryPath)){
    try{
      fs.unlinkSync(loggingSurfacePaths.currentLatestSignoffSummaryPath);
    }catch{
    }
  }
  [
    loggingSurfacePaths.currentRuntimeSnapshotPath,
    loggingSurfacePaths.currentIndexPath,
    loggingSurfacePaths.currentConformanceReportPath,
    loggingSurfacePaths.currentOperatorViewSummaryPath,
  ].forEach((targetPath)=>{
    if(!targetPath||!fs.existsSync(targetPath))return;
    try{
      fs.unlinkSync(targetPath);
    }catch{
    }
  });
  logOperation("current_logs.updated",{
    trigger:safeString(trigger,80)||"runtime",
    currentRoot:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentRoot),
    operatorSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentOperatorSummaryPath),
    latestTurnId:latestRunSummary&&latestRunSummary.turnId?safeString(latestRunSummary.turnId,160):"",
    signoffBundle:latestSignoffSummary&&latestSignoffSummary.bundleName?safeString(latestSignoffSummary.bundleName,160):"",
  },"core");
}
async function requestHandler(req,res){
  const url=new URL(req.url,`http://${req.headers.host}`);
  const pathname=url.pathname;

  if(req.method==="GET"&&pathname==="/api/runtime"){
    sendJson(res,200,buildRuntimeApiSnapshot());
    return;
  }

   if(req.method==="GET"&&pathname==="/api/intent/profile"){
    sendJson(res,200,buildIntentFirstApiSnapshot());
    return;
  }

  if(req.method==="POST"&&pathname==="/api/intent/profile"){
    try{
      const validation=validateControlMutationRequest(req,{action:"exec",enforceActionAllowlist:false});
      if(!validation.ok){
        sendJson(res,validation.status,{ok:false,error:validation.error});
        return;
      }
      const contentTypeValidation=validateJsonMutationContentType(req,{required:true,expectedMime:execApiRequiredContentType});
      if(!contentTypeValidation.ok){
        sendJson(res,contentTypeValidation.status,{ok:false,error:contentTypeValidation.error});
        return;
      }
      const raw=await readRequestBody(req,defaultRequestBodyLimitBytes);
      const body=raw?JSON.parse(raw):{};
      const action=safeString(body&&body.action,80).toLowerCase();
      if(action&&action!=="update_intent_profile"){
        sendJson(res,400,{ok:false,error:`unsupported action: ${action}`});
        return;
      }
      sendJson(res,200,updateIntentProfileStore(body&&body.profile&&typeof body.profile==="object"?body.profile:{}));
    }catch(error){
      sendJson(res,400,{ok:false,error:error&&error.message?error.message:String(error)});
    }
    return;
  }

  if(req.method==="POST"&&pathname==="/api/intent/profile/reset"){
    try{
      const validation=validateControlMutationRequest(req,{action:"exec",enforceActionAllowlist:false});
      if(!validation.ok){
        sendJson(res,validation.status,{ok:false,error:validation.error});
        return;
      }
      const contentTypeValidation=validateJsonMutationContentType(req,{required:true,expectedMime:execApiRequiredContentType});
      if(!contentTypeValidation.ok){
        sendJson(res,contentTypeValidation.status,{ok:false,error:contentTypeValidation.error});
        return;
      }
      const raw=await readRequestBody(req,defaultRequestBodyLimitBytes);
      const body=raw?JSON.parse(raw):{};
      const action=safeString(body&&body.action,80).toLowerCase();
      if(action&&action!=="reset_intent_profile"){
        sendJson(res,400,{ok:false,error:`unsupported action: ${action}`});
        return;
      }
      sendJson(res,200,resetIntentProfileStore());
    }catch(error){
      sendJson(res,400,{ok:false,error:error&&error.message?error.message:String(error)});
    }
    return;
  }

  if(req.method==="POST"&&pathname==="/api/workspace/lock"){
    try{
      const validation=validateControlMutationRequest(req,{action:"exec",enforceActionAllowlist:false});
      if(!validation.ok){
        sendJson(res,validation.status,{ok:false,error:validation.error});
        return;
      }
      const contentTypeValidation=validateJsonMutationContentType(req,{required:true,expectedMime:execApiRequiredContentType});
      if(!contentTypeValidation.ok){
        sendJson(res,contentTypeValidation.status,{ok:false,error:contentTypeValidation.error});
        return;
      }
      const raw=await readRequestBody(req,defaultRequestBodyLimitBytes);
      const body=raw?JSON.parse(raw):{};
      const action=safeString(body&&body.action,80).toLowerCase();
      if(action!=="lock_workspace_directory"){
        sendJson(res,400,{ok:false,error:`unsupported action: ${action||"(empty)"}`});
        return;
      }
      const requestedPath=safeString(body&&body.path,2000);
      if(!requestedPath){
        sendJson(res,400,{ok:false,error:"path is required"});
        return;
      }
      sendJson(res,200,lockWorkspaceDirectory(requestedPath));
    }catch(error){
      sendJson(res,400,{ok:false,error:error&&error.message?error.message:String(error)});
    }
    return;
  }

  if(req.method==="POST"&&pathname==="/api/workspace/unlock"){
    try{
      const validation=validateControlMutationRequest(req,{action:"exec",enforceActionAllowlist:false});
      if(!validation.ok){
        sendJson(res,validation.status,{ok:false,error:validation.error});
        return;
      }
      const contentTypeValidation=validateJsonMutationContentType(req,{required:true,expectedMime:execApiRequiredContentType});
      if(!contentTypeValidation.ok){
        sendJson(res,contentTypeValidation.status,{ok:false,error:contentTypeValidation.error});
        return;
      }
      const raw=await readRequestBody(req,defaultRequestBodyLimitBytes);
      const body=raw?JSON.parse(raw):{};
      const action=safeString(body&&body.action,80).toLowerCase();
      if(action!=="unlock_workspace_directory"){
        sendJson(res,400,{ok:false,error:`unsupported action: ${action||"(empty)"}`});
        return;
      }
      sendJson(res,200,unlockWorkspaceDirectory());
    }catch(error){
      sendJson(res,400,{ok:false,error:error&&error.message?error.message:String(error)});
    }
    return;
  }

  if(req.method==="GET"&&pathname==="/api/harness/overview"){
    sendJson(res,200,buildHarnessOverviewSnapshot());
    return;
  }

  if(req.method==="GET"&&pathname==="/api/conversation/runtime"){
    sendJson(res,200,getConversationRuntimeSnapshot());
    return;
  }

  if(req.method==="GET"&&pathname==="/api/conversation/persona/memory"){
    try{
      const personaUserId=normalizeConversationPersonaUserId(url.searchParams.get("personaUserId"));
      const snapshot=getConversationPersonaContextForUser(personaUserId);
      sendJson(res,200,{
        ok:true,
        mode:"persona_friend",
        persona:{
          userId:snapshot.userId,
          memory:snapshot.summary,
        },
      });
    }catch(error){
      sendJson(res,500,{ok:false,error:error&&error.message?error.message:String(error)});
    }
    return;
  }

  if(req.method==="GET"&&pathname==="/api/agent-topography"){
    sendJson(res,200,{agents:getAgentTopographySnapshot()});
    return;
  }

  if(req.method==="GET"&&pathname==="/api/batch/status"){
    sendJson(res,200,getPocStatusSnapshot());
    return;
  }

  if(req.method==="POST"&&pathname==="/api/batch/run"){
    try{
      const raw=await readRequestBody(req,execRequestBodyLimitBytes);
      const body=raw?JSON.parse(raw):{};
      const prompt=safeString(body.prompt,24000);
      if(!prompt){
        sendJson(res,400,{ok:false,error:"prompt is required"});
        return;
      }
      const mode=normalizePocBatchMode(body.mode);
      const cwd=normalizeWorkingDirectory(body.cwd,workspaceRoot);
      const workspaceGuardViolation=buildWorkspaceGuardViolation(cwd);
      if(workspaceGuardViolation){
        logOperation("api.batch_blocked",{
          path:pathname,
          reason:safeString(workspaceGuardViolation.payload&&workspaceGuardViolation.payload.code,80)||"outside_locked_workspace",
          cwd:summarizePathForOperationLog(cwd,220),
          lockedRoot:summarizePathForOperationLog(workspaceGuardLockedRoot,220),
        },"standard");
        sendJson(res,workspaceGuardViolation.statusCode,workspaceGuardViolation.payload);
        return;
      }
      const result=await executePocBatchRun({prompt,mode,cwd,source:"manual"});
      sendJson(res,200,result);
    }catch(error){
      sendJson(res,500,{ok:false,error:error&&error.message?error.message:String(error)});
    }
    return;
  }

  if(req.method==="POST"&&pathname==="/api/batch/scheduler"){
    try{
      const raw=await readRequestBody(req,defaultRequestBodyLimitBytes);
      const body=raw?JSON.parse(raw):{};
      const scheduler=setPocSchedulerConfig({
        enabled:normalizeBooleanFlag(body.enabled),
        intervalSec:body.intervalSec,
      });
      sendJson(res,200,{ok:true,scheduler});
    }catch(error){
      sendJson(res,500,{ok:false,error:error&&error.message?error.message:String(error)});
    }
    return;
  }

  if(req.method==="POST"&&pathname==="/api/requirement-guard/validate"){
    try{
      const raw=await readRequestBody(req);
      const body=raw?JSON.parse(raw):{};
      const inputValue=Object.prototype.hasOwnProperty.call(body,requirementGuardMatcherDefaults.inputKey)
        ? body[requirementGuardMatcherDefaults.inputKey]
        : body.inputValue;
      if(inputValue===undefined){
        sendJson(res,400,{ok:false,error:`${requirementGuardMatcherDefaults.inputKey} is required`});
        return;
      }
      const result=evaluateRequirementGuardMatch(inputValue);
      const matcher=getRequirementGuardMatcherSnapshot();
      sendJson(res,200,{
        ok:true,
        requirement:{
          id:requirementGuardExtensionConfig.id,
          originalRequirement:requirementGuardOriginalRequirement,
        },
        matcher,
        result,
      });
    }catch(error){
      sendJson(res,400,{ok:false,error:error&&error.message?error.message:String(error)});
    }
    return;
  }

  if(req.method==="GET"&&pathname==="/api/diagnostics"){
    sendJson(res,200,getDiagnosticsSnapshot());
    return;
  }

  if(req.method==="GET"&&pathname==="/api/slo/status"){
    const snapshot=buildSloRuntimeSnapshot();
    maybeEmitSloAlert(snapshot,{reason:"api_slo_status"});
    sendJson(res,200,{ok:true,slo:snapshot});
    return;
  }

  if(req.method==="GET"&&pathname==="/api/eval/suites"){
    sendJson(res,200,{
      ok:true,
      suites:[buildEvalSuiteSummary(defaultEvalSuite)],
      defaults:{
        maxCases:evalMaxCases,
        maxVariants:evalDefaultMaxVariants,
        caseTimeoutMs:evalCaseTimeoutMs,
      },
    });
    return;
  }

  if(req.method==="GET"&&pathname==="/api/eval/history"){
    const validation=validateControlMutationRequest(req,{action:"exec",enforceActionAllowlist:false});
    if(!validation.ok){
      sendJson(res,validation.status,{ok:false,error:validation.error});
      return;
    }
    const limitRaw=Number(url.searchParams.get("limit"));
    const limit=Number.isFinite(limitRaw)?Math.max(1,Math.min(evalRunHistoryMaxLines,Math.trunc(limitRaw))):20;
    sendJson(res,200,{
      ok:true,
      history:readEvalRunHistory({limit}),
      historyPath:summarizePathForOperationLog(evalRunHistoryPath,220),
    });
    return;
  }

  if(req.method==="POST"&&pathname==="/api/eval/run"){
    try{
      const validation=validateControlMutationRequest(req,{action:"exec",enforceActionAllowlist:false});
      if(!validation.ok){
        sendJson(res,validation.status,{ok:false,error:validation.error});
        return;
      }
      const contentTypeValidation=validateJsonMutationContentType(req,{required:true,expectedMime:execApiRequiredContentType});
      if(!contentTypeValidation.ok){
        sendJson(res,contentTypeValidation.status,{ok:false,error:contentTypeValidation.error});
        return;
      }
      const raw=await readRequestBody(req,defaultRequestBodyLimitBytes);
      const body=raw?JSON.parse(raw):{};
      let suite=defaultEvalSuite;
      if(body&&body.suite&&typeof body.suite==="object"){
        suite=normalizeEvalSuite(body.suite,{fallbackId:"custom-suite.v1"});
      }else if(typeof body.suiteId==="string"&&safeString(body.suiteId,120)&&safeString(body.suiteId,120)!==safeString(defaultEvalSuite.suiteId,120)){
        sendJson(res,400,{ok:false,error:`unknown suiteId: ${safeString(body.suiteId,120)}`});
        return;
      }
      const variantsInput=Array.isArray(body.variants)
        ?body.variants
        :[
          body.variantA&&typeof body.variantA==="object"?body.variantA:null,
          body.variantB&&typeof body.variantB==="object"?body.variantB:null,
        ].filter(Boolean);
      const fallbackVariant={
        label:"A",
        agentName:defaultExecAgentName,
        model:defaultExecModelName,
        sandboxMode:"workspace-write",
        approvalPolicy:"never",
        webSearch:0,
        cwd:workspaceRoot,
        requestUserInputPolicy:"blocked",
        executionProfile:"eval-standard",
        executionIntent:"eval",
        executionSource:"eval_harness",
      };
      const normalizedVariants=(variantsInput.length?variantsInput:[fallbackVariant])
        .slice(0,evalDefaultMaxVariants)
        .map((entry,index)=>normalizeEvalVariant(entry,index));
      const maxCasesRaw=Number(body.maxCases);
      const maxCases=Number.isFinite(maxCasesRaw)?Math.max(1,Math.min(evalMaxCases,Math.trunc(maxCasesRaw))):Math.min(evalMaxCases,suite.cases.length);
      const timeoutRaw=Number(body.caseTimeoutMs);
      const timeoutMs=Number.isFinite(timeoutRaw)?Math.max(10000,Math.min(900000,Math.trunc(timeoutRaw))):evalCaseTimeoutMs;
      const persistProbeResults=normalizeBooleanFlag(
        Object.prototype.hasOwnProperty.call(body,"persistProbeResultsToMemory")
          ?body.persistProbeResultsToMemory
          :body.persistProbeResults
      );
      const reportId=`eval-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const runs=[];
      for(const variant of normalizedVariants){
        const summary=await executeEvalVariantOnSuite({
          variant,
          suite,
          maxCases,
          timeoutMs,
          evalRunId:reportId,
          persistProbeResults,
        });
        runs.push(summary);
      }
      const persistedProbeRecords=runs.reduce((acc,run)=>{
        const records=run&&run.probePersistence&&Array.isArray(run.probePersistence.records)?run.probePersistence.records:[];
        if(records.length)acc.push(...records);
        return acc;
      },[]);
      if(persistProbeResults&&persistedProbeRecords.length){
        persistHarnessExecutionMemoryStore({reason:"eval_probe_results"});
      }
      const comparison=runs.length>=2?compareEvalRuns(runs[0],runs[1]):{winner:"single",reason:"single_variant"};
      const report={
        runId:reportId,
        generatedAt:Date.now(),
        suite:buildEvalSuiteSummary(suite),
        maxCases,
        timeoutMs,
        runs,
        comparison,
        probePersistence:{
          requested:persistProbeResults?1:0,
          persistedRecords:persistedProbeRecords.length,
          storage:summarizePathForOperationLog(harnessMemoryPath,220),
          records:persistedProbeRecords,
        },
      };
      appendEvalRunHistory(report);
      sendJson(res,200,{ok:true,report});
    }catch(error){
      sendJson(res,500,{ok:false,error:error&&error.message?error.message:String(error)});
    }
    return;
  }

  if(req.method==="GET"&&pathname==="/api/replay/turns"){
    const validation=validateControlMutationRequest(req,{action:"exec",enforceActionAllowlist:false});
    if(!validation.ok){
      sendJson(res,validation.status,{ok:false,error:validation.error});
      return;
    }
    const limitRaw=Number(url.searchParams.get("limit"));
    const limit=Number.isFinite(limitRaw)?Math.max(1,Math.min(200,Math.trunc(limitRaw))):20;
    sendJson(res,200,{ok:true,turns:listReplayMemorySnapshots({limit})});
    return;
  }

  if(req.method==="GET"&&pathname.startsWith("/api/replay/turn/")){
    try{
      const validation=validateControlMutationRequest(req,{action:"exec",enforceActionAllowlist:false});
      if(!validation.ok){
        sendJson(res,validation.status,{ok:false,error:validation.error});
        return;
      }
      const encodedTurnId=pathname.slice("/api/replay/turn/".length);
      const turnId=safeString(decodeURIComponent(encodedTurnId),160);
      if(!turnId){
        sendJson(res,400,{ok:false,error:"turnId is required"});
        return;
      }
      const includePrompt=String(url.searchParams.get("include_prompt")||"")==="1";
      const record=getReplayMemoryRecord(turnId);
      if(!record){
        sendJson(res,404,{ok:false,error:"replay turn not found"});
        return;
      }
      sendJson(res,200,{ok:true,replay:buildReplayMemorySnapshot(record,{includePrompt})});
    }catch(error){
      sendJson(res,400,{ok:false,error:error&&error.message?error.message:String(error)});
    }
    return;
  }

  if(req.method==="POST"&&pathname==="/api/replay/turn"){
    try{
      const validation=validateControlMutationRequest(req,{action:"exec",enforceActionAllowlist:false});
      if(!validation.ok){
        sendJson(res,validation.status,{ok:false,error:validation.error});
        return;
      }
      const contentTypeValidation=validateJsonMutationContentType(req,{required:true,expectedMime:execApiRequiredContentType});
      if(!contentTypeValidation.ok){
        sendJson(res,contentTypeValidation.status,{ok:false,error:contentTypeValidation.error});
        return;
      }
      const raw=await readRequestBody(req,defaultRequestBodyLimitBytes);
      const body=raw?JSON.parse(raw):{};
      const turnId=safeString(body.turnId,160);
      if(!turnId){
        sendJson(res,400,{ok:false,error:"turnId is required"});
        return;
      }
      const sourceRecord=getReplayMemoryRecord(turnId);
      if(!sourceRecord){
        sendJson(res,404,{ok:false,error:"replay turn not found"});
        return;
      }
      const overrides=body.overrides&&typeof body.overrides==="object"?body.overrides:{};
      const requestedProfile=normalizeExecutionProfile(overrides.executionProfile,sourceRecord.request.executionProfile);
      const reproProfile=isReproExecutionProfile(requestedProfile);
      const replayPayload={
        prompt:sourceRecord.request.prompt,
        sandboxMode:normalizeSandboxMode(overrides.sandboxMode||sourceRecord.request.sandboxMode),
        approvalPolicy:normalizeApprovalPolicy(overrides.approvalPolicy||sourceRecord.request.approvalPolicy),
        webSearch:reproProfile?0:normalizeBooleanFlag(Object.prototype.hasOwnProperty.call(overrides,"webSearch")?overrides.webSearch:sourceRecord.request.webSearch),
        model:normalizeExecModel(overrides.model,sourceRecord.request.model),
        modelReasoningEffort:normalizeExecModelReasoningEffort(overrides.modelReasoningEffort,sourceRecord.request.modelReasoningEffort),
        forceNewSession:reproProfile?1:normalizeBooleanFlag(Object.prototype.hasOwnProperty.call(overrides,"forceNewSession")?overrides.forceNewSession:sourceRecord.request.forceNewSession),
        agentName:normalizeAgentName(overrides.agentName)||sourceRecord.request.agentName,
        cwd:normalizeWorkingDirectory(overrides.cwd,sourceRecord.request.cwd||workspaceRoot),
        requestUserInputPolicy:reproProfile
          ?"blocked"
          :normalizeRequestUserInputPolicy(overrides.requestUserInputPolicy,sourceRecord.request.requestUserInputPolicy),
        executionProfile:requestedProfile,
        executionIntent:normalizeExecutionIntent(overrides.executionIntent,sourceRecord.request.executionIntent||"replay"),
        executionSource:safeString(overrides.executionSource,80)||`replay:${turnId}`,
        idempotencyKey:safeString(body.idempotencyKey,200)||`replay-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      };
      const timeoutRaw=Number(body.timeoutMs);
      const timeoutMs=Number.isFinite(timeoutRaw)?Math.max(10000,Math.min(900000,Math.trunc(timeoutRaw))):evalCaseTimeoutMs;
      const replayResult=await runInternalExecRequest(replayPayload,{timeoutMs});
      const diff=buildReplayDiffMetrics(sourceRecord.baseline.outputSnapshot,replayResult.finalText);
      updateReplayMemoryStats(turnId,{
        status:replayResult.status,
        outputSha256:hashSha256Hex(String(replayResult.finalText||"")),
        similarity:diff.similarity,
      });
      sendJson(res,200,{
        ok:true,
        source:buildReplayMemorySnapshot(sourceRecord),
        replay:{
          httpStatus:replayResult.httpStatus,
          status:replayResult.status,
          turnId:safeString(replayResult.turnId,160)||"",
          threadId:safeString(replayResult.threadId,160)||"",
          elapsedMs:Math.max(0,Math.trunc(Number(replayResult.elapsedMs)||0)),
          outputSha256:hashSha256Hex(String(replayResult.finalText||"")),
          outputChars:String(replayResult.finalText||"").length,
          outputPreview:safeString(replayResult.finalText,400),
          errorText:safeString(replayResult.errorText,1200)||"",
        },
        diff,
      });
    }catch(error){
      sendJson(res,500,{ok:false,error:error&&error.message?error.message:String(error)});
    }
    return;
  }

  if(req.method==="POST"&&pathname==="/api/voice/piper/prepare"){
    try{
      const originValidation=validateLocalOriginRequest(req);
      if(!originValidation.ok){
        logOperation("api.voice.piper_prepare_blocked",{
          reason:safeString(originValidation.error,180),
          status:Number.isFinite(Number(originValidation.status))?Math.trunc(Number(originValidation.status)):403,
          origin:safeString(requestHeaderValue(req,"origin"),220),
          referer:safeString(requestHeaderValue(req,"referer"),220),
          host:safeString(requestHeaderValue(req,"host"),120),
        },"standard");
        sendJson(res,originValidation.status,{ok:false,error:originValidation.error});
        return;
      }
      const contentTypeValidation=validateJsonMutationContentType(req,{required:true,expectedMime:conversationApiRequiredContentType});
      if(!contentTypeValidation.ok){
        logOperation("api.voice.piper_prepare_blocked",{
          reason:safeString(contentTypeValidation.error,180),
          status:Number.isFinite(Number(contentTypeValidation.status))?Math.trunc(Number(contentTypeValidation.status)):415,
          origin:safeString(requestHeaderValue(req,"origin"),220),
          referer:safeString(requestHeaderValue(req,"referer"),220),
          host:safeString(requestHeaderValue(req,"host"),120),
          contentType:safeString(requestHeaderValue(req,"content-type"),120),
        },"standard");
        sendJson(res,contentTypeValidation.status,{ok:false,error:contentTypeValidation.error});
        return;
      }
      const raw=await readRequestBody(req,piperVoiceRequestBodyLimitBytes);
      const body=raw?JSON.parse(raw):{};
      const model=safeString(body.model,120)||defaultPiperModelId;
      const speaker=Object.prototype.hasOwnProperty.call(body,"speaker")?body.speaker:null;
      const autoDownload=Object.prototype.hasOwnProperty.call(body,"autoDownload")
        ? normalizeBooleanFlag(body.autoDownload)
        : true;
      const warmup=Object.prototype.hasOwnProperty.call(body,"warmup")
        ? normalizeBooleanFlag(body.warmup)
        : true;
      const warmupText=safeString(body.warmupText,240)||"piper warmup";
      const startedAt=nowTs();
      logOperation("api.voice.piper_prepare",{
        model:safeString(model,120),
        speaker:Number.isFinite(Number(speaker))?Math.max(0,Math.trunc(Number(speaker))):null,
        autoDownload:autoDownload?1:0,
        warmup:warmup?1:0,
      },"standard");
      const prepared=await preparePiperModel({
        workspaceRoot,
        model,
        speaker,
        autoDownload,
        warmup,
        warmupText,
      });
      const latencyMs=Math.max(0,nowTs()-startedAt);
      logOperation("api.voice.piper_prepare_done",{
        model:safeString(prepared&&prepared.modelId,120)||safeString(model,120),
        speaker:Number.isFinite(Number(prepared&&prepared.speaker))?Math.max(0,Math.trunc(Number(prepared.speaker))):null,
        downloadedModel:prepared&&prepared.downloadedModel?1:0,
        warmedUp:prepared&&prepared.warmedUp?1:0,
        ms:latencyMs,
      },"standard");
      sendJson(res,200,{
        ok:true,
        provider:"piper",
        model:safeString(prepared&&prepared.modelId,120)||safeString(model,120),
        speaker:Number.isFinite(Number(prepared&&prepared.speaker))?Math.max(0,Math.trunc(Number(prepared.speaker))):null,
        downloadedModel:prepared&&prepared.downloadedModel?1:0,
        warmedUp:prepared&&prepared.warmedUp?1:0,
        autoDownload:autoDownload?1:0,
        warmup:warmup?1:0,
        latencyMs,
      });
    }catch(error){
      const statusCode=resolvePiperVoiceRequestErrorStatus(error);
      logOperation("api.voice.piper_prepare_failed",{
        status:statusCode,
        err:summarizeErrorForOperationLog(error,220),
        code:safeString(error&&error.code?String(error.code):"",80),
      },"standard");
      sendJson(res,statusCode,{
        ok:false,
        error:error&&error.message?error.message:String(error),
        code:safeString(error&&error.code?String(error.code):"",80)||undefined,
      });
    }
    return;
  }

  if(req.method==="POST"&&pathname==="/api/voice/piper"){
    try{
      const originValidation=validateLocalOriginRequest(req);
      if(!originValidation.ok){
        logOperation("api.voice.piper_blocked",{
          reason:safeString(originValidation.error,180),
          status:Number.isFinite(Number(originValidation.status))?Math.trunc(Number(originValidation.status)):403,
          origin:safeString(requestHeaderValue(req,"origin"),220),
          referer:safeString(requestHeaderValue(req,"referer"),220),
          host:safeString(requestHeaderValue(req,"host"),120),
        },"standard");
        sendJson(res,originValidation.status,{ok:false,error:originValidation.error});
        return;
      }
      const contentTypeValidation=validateJsonMutationContentType(req,{required:true,expectedMime:conversationApiRequiredContentType});
      if(!contentTypeValidation.ok){
        logOperation("api.voice.piper_blocked",{
          reason:safeString(contentTypeValidation.error,180),
          status:Number.isFinite(Number(contentTypeValidation.status))?Math.trunc(Number(contentTypeValidation.status)):415,
          origin:safeString(requestHeaderValue(req,"origin"),220),
          referer:safeString(requestHeaderValue(req,"referer"),220),
          host:safeString(requestHeaderValue(req,"host"),120),
          contentType:safeString(requestHeaderValue(req,"content-type"),120),
        },"standard");
        sendJson(res,contentTypeValidation.status,{ok:false,error:contentTypeValidation.error});
        return;
      }
      const raw=await readRequestBody(req,piperVoiceRequestBodyLimitBytes);
      const body=raw?JSON.parse(raw):{};
      const text=safeString(typeof body.text==="string"?body.text:body.message,24000);
      if(!text){
        sendJson(res,400,{ok:false,error:"text is required"});
        return;
      }
      const model=safeString(body.model,120)||defaultPiperModelId;
      const speaker=Object.prototype.hasOwnProperty.call(body,"speaker")?body.speaker:null;
      const autoDownload=Object.prototype.hasOwnProperty.call(body,"autoDownload")
        ? normalizeBooleanFlag(body.autoDownload)
        : true;
      const startedAt=nowTs();
      logOperation("api.voice.piper",{
        model:safeString(model,120),
        speaker:Number.isFinite(Number(speaker))?Math.max(0,Math.trunc(Number(speaker))):null,
        chars:text.length,
        autoDownload:autoDownload?1:0,
      },"standard");
      const playback=await speakWithPiper({
        workspaceRoot,
        text,
        model,
        speaker,
        autoDownload,
      });
      const latencyMs=Math.max(0,nowTs()-startedAt);
      logOperation("api.voice.piper_done",{
        model:safeString(playback&&playback.modelId,120)||safeString(model,120),
        speaker:Number.isFinite(Number(playback&&playback.speaker))?Math.max(0,Math.trunc(Number(playback.speaker))):null,
        downloadedModel:playback&&playback.downloadedModel?1:0,
        ms:latencyMs,
      },"standard");
      sendJson(res,200,{
        ok:true,
        provider:"piper",
        model:safeString(playback&&playback.modelId,120)||safeString(model,120),
        speaker:Number.isFinite(Number(playback&&playback.speaker))?Math.max(0,Math.trunc(Number(playback.speaker))):null,
        downloadedModel:playback&&playback.downloadedModel?1:0,
        autoDownload:autoDownload?1:0,
        latencyMs,
      });
    }catch(error){
      const statusCode=resolvePiperVoiceRequestErrorStatus(error);
      logOperation("api.voice.piper_failed",{
        status:statusCode,
        err:summarizeErrorForOperationLog(error,220),
        code:safeString(error&&error.code?String(error.code):"",80),
      },"standard");
      sendJson(res,statusCode,{
        ok:false,
        error:error&&error.message?error.message:String(error),
        code:safeString(error&&error.code?String(error.code):"",80)||undefined,
      });
    }
    return;
  }

  if(req.method==="POST"&&pathname==="/api/voice/kokoro"){
    try{
      const originValidation=validateLocalOriginRequest(req);
      if(!originValidation.ok){
        logOperation("api.voice.kokoro_blocked",{
          reason:safeString(originValidation.error,180),
          status:Number.isFinite(Number(originValidation.status))?Math.trunc(Number(originValidation.status)):403,
          origin:safeString(requestHeaderValue(req,"origin"),220),
          referer:safeString(requestHeaderValue(req,"referer"),220),
          host:safeString(requestHeaderValue(req,"host"),120),
        },"standard");
        sendJson(res,originValidation.status,{ok:false,error:originValidation.error});
        return;
      }
      const contentTypeValidation=validateJsonMutationContentType(req,{required:true,expectedMime:conversationApiRequiredContentType});
      if(!contentTypeValidation.ok){
        logOperation("api.voice.kokoro_blocked",{
          reason:safeString(contentTypeValidation.error,180),
          status:Number.isFinite(Number(contentTypeValidation.status))?Math.trunc(Number(contentTypeValidation.status)):415,
          origin:safeString(requestHeaderValue(req,"origin"),220),
          referer:safeString(requestHeaderValue(req,"referer"),220),
          host:safeString(requestHeaderValue(req,"host"),120),
          contentType:safeString(requestHeaderValue(req,"content-type"),120),
        },"standard");
        sendJson(res,contentTypeValidation.status,{ok:false,error:contentTypeValidation.error});
        return;
      }
      const raw=await readRequestBody(req,kokoroVoiceRequestBodyLimitBytes);
      const body=raw?JSON.parse(raw):{};
      const text=safeString(typeof body.text==="string"?body.text:body.message,24000);
      if(!text){
        sendJson(res,400,{ok:false,error:"text is required"});
        return;
      }
      const model=safeString(body.model,80)||kokoroDefaultModel;
      const voice=safeString(body.voice,80)||kokoroDefaultVoice;
      const langCode=safeString(body.langCode,8)||safeString(body.lang_code,8)||kokoroDefaultLangCode;
      const speed=Object.prototype.hasOwnProperty.call(body,"speed")?Number(body.speed):undefined;
      const startedAt=nowTs();
      logOperation("api.voice.kokoro",{
        model:safeString(model,80),
        voice:safeString(voice,80),
        langCode:safeString(langCode,8),
        chars:text.length,
        speed:Number.isFinite(Number(speed))?Number(speed):null,
      },"standard");
      const result=await requestKokoroSpeech({text,model,voice,langCode,speed});
      const latencyMs=Math.max(0,nowTs()-startedAt);
      logOperation("api.voice.kokoro_done",{
        model:safeString(model,80),
        voice:safeString(voice,80),
        langCode:safeString(langCode,8),
        bytes:result&&result.audio?result.audio.length:0,
        ms:latencyMs,
      },"standard");
      const contentType=safeString(result&&result.contentType?result.contentType:"audio/mpeg",120)||"audio/mpeg";
      const audioBuffer=result&&result.audio?result.audio:Buffer.alloc(0);
      res.writeHead(200,{
        "Content-Type":contentType,
        "Content-Length":audioBuffer.length,
        "Cache-Control":"no-store",
      });
      res.end(audioBuffer);
    }catch(error){
      const statusCode=resolveKokoroVoiceRequestErrorStatus(error);
      logOperation("api.voice.kokoro_failed",{
        status:statusCode,
        err:summarizeErrorForOperationLog(error,220),
        code:safeString(error&&error.code?String(error.code):"",80),
      },"standard");
      sendJson(res,statusCode,{
        ok:false,
        error:error&&error.message?error.message:String(error),
        code:safeString(error&&error.code?String(error.code):"",80)||undefined,
      });
    }
    return;
  }

  if(req.method==="POST"&&pathname==="/api/conversation/direct"){
    try{
      const originValidation=validateLocalOriginRequest(req);
      if(!originValidation.ok){
        logOperation("api.conversation.blocked",{
          reason:safeString(originValidation.error,180),
          status:Number.isFinite(Number(originValidation.status))?Math.trunc(Number(originValidation.status)):403,
          origin:safeString(requestHeaderValue(req,"origin"),220),
          referer:safeString(requestHeaderValue(req,"referer"),220),
          host:safeString(requestHeaderValue(req,"host"),120),
        },"standard");
        sendJson(res,originValidation.status,{ok:false,error:originValidation.error});
        return;
      }
      const contentTypeValidation=validateJsonMutationContentType(req,{required:true,expectedMime:conversationApiRequiredContentType});
      if(!contentTypeValidation.ok){
        logOperation("api.conversation.blocked",{
          reason:safeString(contentTypeValidation.error,180),
          status:Number.isFinite(Number(contentTypeValidation.status))?Math.trunc(Number(contentTypeValidation.status)):415,
          origin:safeString(requestHeaderValue(req,"origin"),220),
          referer:safeString(requestHeaderValue(req,"referer"),220),
          host:safeString(requestHeaderValue(req,"host"),120),
          contentType:safeString(requestHeaderValue(req,"content-type"),120),
        },"standard");
        sendJson(res,contentTypeValidation.status,{ok:false,error:contentTypeValidation.error});
        return;
      }
      const raw=await readRequestBody(req,conversationRequestBodyLimitBytes);
      const body=raw?JSON.parse(raw):{};
      const message=normalizeConversationMessage(body.message||body.prompt);
      if(!message){
        sendJson(res,400,{ok:false,error:"message is required"});
        return;
      }
      const mode=normalizeConversationMode(body.mode);
      const personaUserId=normalizeConversationPersonaUserId(body.personaUserId);
      const level=normalizeConversationLevel(body.level);
      const topic=normalizeConversationTopic(body.topic);
      const history=normalizeConversationHistoryItems(body.history);
      let personaContext={facts:[],topics:[],turns:0,updatedAt:0};
      let personaSummary={
        turns:0,
        factsCount:0,
        topicsCount:0,
        recentFacts:[],
        recentTopics:[],
        updatedAt:0,
      };
      if(mode==="persona_friend"){
        const personaSnapshot=getConversationPersonaContextForUser(personaUserId);
        personaContext=personaSnapshot.context;
        personaSummary=personaSnapshot.summary;
      }
      const model=conversationAppServerModel;
      const startedAt=nowTs();
      logOperation("api.conversation.direct",{
        provider:conversationProvider,
        model:safeString(model,120),
        mode,
        personaUserId:mode==="persona_friend"?safeString(personaUserId,120):"",
        personaFacts:mode==="persona_friend"&&personaContext&&Array.isArray(personaContext.facts)?personaContext.facts.length:0,
        level,
        topic:safeString(topic,120),
        historyItems:history.length,
        message:summarizeTextForOperationLog(message,2400),
      },"standard");
      const response=await runConversationViaAppServer({
        message,
        history,
        level,
        topic,
        mode,
        memoryContext:mode==="persona_friend"?personaContext:null,
        timeoutMs:conversationRequestTimeoutMs,
      });
      if(mode==="persona_friend"){
        const updatedPersona=updateConversationPersonaMemoryForUser({
          userId:personaUserId,
          message,
          topic,
        });
        personaSummary=updatedPersona.summary;
      }
      const latencyMs=Math.max(0,nowTs()-startedAt);
      logOperation("api.conversation.direct_done",{
        provider:conversationProvider,
        model:safeString(response&&response.model,120)||safeString(model,120),
        mode,
        personaUserId:mode==="persona_friend"?safeString(personaUserId,120):"",
        personaFacts:mode==="persona_friend"?Number.isFinite(Number(personaSummary.factsCount))?Math.max(0,Math.trunc(Number(personaSummary.factsCount))):0:0,
        ms:latencyMs,
        usage:response&&response.usage&&typeof response.usage==="object"?{
          totalTokens:Number.isFinite(Number(response.usage.totalTokens))?Math.max(0,Math.trunc(Number(response.usage.totalTokens))):0,
          inputTokens:Number.isFinite(Number(response.usage.inputTokens))?Math.max(0,Math.trunc(Number(response.usage.inputTokens))):0,
          outputTokens:Number.isFinite(Number(response.usage.outputTokens))?Math.max(0,Math.trunc(Number(response.usage.outputTokens))):0,
        }:{totalTokens:0,inputTokens:0,outputTokens:0},
      },"standard");
      sendJson(res,200,{
        ok:true,
        route:"conversation-app-server",
        provider:conversationProvider,
        model:safeString(response&&response.model,120)||safeString(model,120),
        mode,
        id:safeString(response&&response.id,120)||null,
        text:safeString(response&&response.text,24000),
        usage:response&&response.usage&&typeof response.usage==="object"?response.usage:{totalTokens:0,inputTokens:0,outputTokens:0},
        latencyMs,
        persona:mode==="persona_friend"?{
          userId:personaUserId,
          memory:personaSummary,
        }:null,
      });
    }catch(error){
      const statusCode=resolveConversationRequestErrorStatus(error);
      logOperation("api.conversation.direct_failed",{
        status:statusCode,
        err:summarizeErrorForOperationLog(error,220),
        origin:safeString(requestHeaderValue(req,"origin"),220),
        referer:safeString(requestHeaderValue(req,"referer"),220),
        host:safeString(requestHeaderValue(req,"host"),120),
      },"standard");
      sendJson(res,statusCode,{ok:false,error:error&&error.message?error.message:String(error)});
    }
    return;
  }

  if(req.method==="POST"&&pathname==="/api/conversation/persona/reset"){
    try{
      const originValidation=validateLocalOriginRequest(req);
      if(!originValidation.ok){
        logOperation("api.conversation.persona_reset_blocked",{
          reason:safeString(originValidation.error,180),
          status:Number.isFinite(Number(originValidation.status))?Math.trunc(Number(originValidation.status)):403,
          origin:safeString(requestHeaderValue(req,"origin"),220),
          referer:safeString(requestHeaderValue(req,"referer"),220),
          host:safeString(requestHeaderValue(req,"host"),120),
        },"standard");
        sendJson(res,originValidation.status,{ok:false,error:originValidation.error});
        return;
      }
      const contentTypeValidation=validateJsonMutationContentType(req,{required:true,expectedMime:conversationApiRequiredContentType});
      if(!contentTypeValidation.ok){
        logOperation("api.conversation.persona_reset_blocked",{
          reason:safeString(contentTypeValidation.error,180),
          status:Number.isFinite(Number(contentTypeValidation.status))?Math.trunc(Number(contentTypeValidation.status)):415,
          origin:safeString(requestHeaderValue(req,"origin"),220),
          referer:safeString(requestHeaderValue(req,"referer"),220),
          host:safeString(requestHeaderValue(req,"host"),120),
          contentType:safeString(requestHeaderValue(req,"content-type"),120),
        },"standard");
        sendJson(res,contentTypeValidation.status,{ok:false,error:contentTypeValidation.error});
        return;
      }
      const raw=await readRequestBody(req,defaultRequestBodyLimitBytes);
      const body=raw?JSON.parse(raw):{};
      const personaUserId=normalizeConversationPersonaUserId(body.personaUserId);
      const resetResult=resetConversationPersonaMemoryForUser(personaUserId);
      logOperation("api.conversation.persona_reset",{
        personaUserId:safeString(personaUserId,120),
      },"standard");
      sendJson(res,200,{
        ok:true,
        mode:"persona_friend",
        persona:{
          userId:resetResult.userId,
          memory:resetResult.summary,
        },
      });
    }catch(error){
      const statusCode=isRequestBodyTooLargeError(error)?413:error instanceof SyntaxError?400:500;
      logOperation("api.conversation.persona_reset_failed",{
        status:statusCode,
        err:summarizeErrorForOperationLog(error,220),
      },"standard");
      sendJson(res,statusCode,{ok:false,error:error&&error.message?error.message:String(error)});
    }
    return;
  }

  if(req.method==="POST"&&pathname==="/api/open-cmd"){
    try{
      if(!openCmdWindowEnabled){
        logOperation("api.open_cmd_blocked",{
          reason:"open-cmd disabled by CODEX_ALLOW_OPEN_CMD_WINDOW",
          status:403,
          origin:safeString(requestHeaderValue(req,"origin"),220),
          referer:safeString(requestHeaderValue(req,"referer"),220),
          host:safeString(requestHeaderValue(req,"host"),120),
          hasToken:requestHeaderValue(req,controlApiTokenHeaderName)?1:0,
          action:"",
        },"standard");
        sendJson(res,403,{ok:false,error:"open-cmd is disabled by runtime policy"});
        return;
      }
      const raw=await readRequestBody(req,defaultRequestBodyLimitBytes);
      const body=raw?JSON.parse(raw):{};
      const action=safeString(body&&body.action,80);
      const validation=validateControlMutationRequest(req,{action,requireAction:true});
      if(!validation.ok){
        logOperation("api.open_cmd_blocked",{
          reason:safeString(validation.error,140),
          status:Number.isFinite(Number(validation.status))?Math.trunc(Number(validation.status)):403,
          origin:safeString(requestHeaderValue(req,"origin"),220),
          referer:safeString(requestHeaderValue(req,"referer"),220),
          host:safeString(requestHeaderValue(req,"host"),120),
          hasToken:requestHeaderValue(req,controlApiTokenHeaderName)?1:0,
          action,
        },"standard");
        sendJson(res,validation.status,{ok:false,error:validation.error});
        return;
      }
      logOperation("api.open_cmd",{
        action,
        origin:safeString(requestHeaderValue(req,"origin"),220),
        referer:safeString(requestHeaderValue(req,"referer"),220),
        host:safeString(requestHeaderValue(req,"host"),120),
      },"standard");
      openCmdWindow();
      sendJson(res,200,{ok:true});
    }catch(e){
      sendJson(res,400,{ok:false,error:e&&e.message?e.message:String(e)});
    }
    return;
  }

  if(req.method==="GET"&&pathname.startsWith("/api/exec/idempotency/")){
    try{
      const validation=validateControlMutationRequest(req,{action:"exec",enforceActionAllowlist:false});
      if(!validation.ok){
        logOperation("api.exec_idempotency_status_blocked",{
          reason:safeString(validation.error,180),
          status:Number.isFinite(Number(validation.status))?Math.trunc(Number(validation.status)):403,
          origin:safeString(requestHeaderValue(req,"origin"),220),
          referer:safeString(requestHeaderValue(req,"referer"),220),
          host:safeString(requestHeaderValue(req,"host"),120),
          hasToken:requestHeaderValue(req,controlApiTokenHeaderName)?1:0,
        },"standard");
        sendJson(res,validation.status,{ok:false,error:validation.error});
        return;
      }
      const encodedKey=pathname.slice("/api/exec/idempotency/".length);
      if(!encodedKey){
        sendJson(res,400,{ok:false,error:"idempotency key is required"});
        return;
      }
      let decodedKey="";
      try{
        decodedKey=decodeURIComponent(encodedKey);
      }catch{
        sendJson(res,400,{ok:false,error:"invalid idempotency key encoding"});
        return;
      }
      const key=normalizeIdempotencyKey(decodedKey);
      if(!key){
        sendJson(res,400,{ok:false,error:"idempotency key is required"});
        return;
      }
      const waitMs=normalizeExecIdempotencyWaitMs(url.searchParams.get("wait_ms"));
      const record=await waitForExecIdempotencyRecord(key,{waitMs});
      if(!record){
        sendJson(res,404,{ok:false,error:"idempotency key not found"});
        return;
      }
      const snapshot=buildExecIdempotencySnapshot(key,record);
      const latestTurn=getLatestTurnSnapshot();
      const turnSnapshot=snapshot&&snapshot.outcome&&snapshot.outcome.turnId&&latestTurn&&latestTurn.turn_id===snapshot.outcome.turnId
        ?latestTurn
        :null;
      sendJson(res,200,{ok:true,idempotency:snapshot,turn:turnSnapshot});
    }catch(error){
      sendJson(res,400,{ok:false,error:error&&error.message?error.message:String(error)});
    }
    return;
  }

  if(req.method==="POST"&&pathname==="/api/exec"){
    let idempotencyKey="";
    try{
      const mutationValidation=validateControlMutationRequest(req,{action:"exec",enforceActionAllowlist:false});
      if(!mutationValidation.ok){
        logOperation("api.exec_blocked",{
          reason:safeString(mutationValidation.error,180),
          status:Number.isFinite(Number(mutationValidation.status))?Math.trunc(Number(mutationValidation.status)):403,
          origin:safeString(requestHeaderValue(req,"origin"),220),
          referer:safeString(requestHeaderValue(req,"referer"),220),
          host:safeString(requestHeaderValue(req,"host"),120),
          hasToken:requestHeaderValue(req,controlApiTokenHeaderName)?1:0,
        },"standard");
        sendJson(res,mutationValidation.status,{ok:false,error:mutationValidation.error});
        return;
      }
      const contentTypeValidation=validateJsonMutationContentType(req,{required:true,expectedMime:execApiRequiredContentType});
      if(!contentTypeValidation.ok){
        logOperation("api.exec_blocked",{
          reason:safeString(contentTypeValidation.error,180),
          status:Number.isFinite(Number(contentTypeValidation.status))?Math.trunc(Number(contentTypeValidation.status)):415,
          origin:safeString(requestHeaderValue(req,"origin"),220),
          referer:safeString(requestHeaderValue(req,"referer"),220),
          host:safeString(requestHeaderValue(req,"host"),120),
          contentType:safeString(requestHeaderValue(req,"content-type"),120),
        },"standard");
        sendJson(res,contentTypeValidation.status,{ok:false,error:contentTypeValidation.error});
        return;
      }
      const raw=await readRequestBody(req,execRequestBodyLimitBytes);
      const body=raw?JSON.parse(raw):{};
      idempotencyKey=extractExecIdempotencyKey(req,body);
      const rawPrompt=typeof body.prompt==="string"?body.prompt:"";
      const prompt=safeString(rawPrompt,defaultPromptCharLimit);
      const sandboxMode=normalizeSandboxMode(body.sandboxMode);
      const approvalPolicy=normalizeApprovalPolicy(body.approvalPolicy);
      const webSearch=normalizeBooleanFlag(body.webSearch);
      const fastModeEnabled=resolveFastModeEnabled(body.fastModeEnabled);
      const automaticApprovalReviewEnabled=resolveAutomaticApprovalReviewEnabled(body.automaticApprovalReviewEnabled);
      const model=normalizeExecModel(body.model,defaultExecModelName);
      const modelReasoningEffort=normalizeExecModelReasoningEffort(body.modelReasoningEffort,defaultExecModelReasoningEffort);
      const forceNewSession=normalizeBooleanFlag(body.forceNewSession);
      const agentName=normalizeAgentName(body.agentName);
      const cwd=normalizeWorkingDirectory(body.cwd,workspaceRoot);
      const images=normalizeChatImageAttachments(body.images,body.image);
      const requestUserInputPolicy=normalizeRequestUserInputPolicy(body.requestUserInputPolicy,nonInteractiveRequestUserInputPolicy);
      const requestExecutionProfile=normalizeExecutionProfile(body.executionProfile,runtimeExecutionProfile);
      const requestExecutionIntent=normalizeExecutionIntent(body.executionIntent,"interactive");
      const requestExecutionSource=safeString(body.executionSource,80)||"api_exec";
      const workspaceGuardRequirement=resolveWorkspaceGuardRequirement({
        prompt,
        executionSource:requestExecutionSource,
      });
      if(workspaceGuardRequirement.workspaceLockRequired&&!workspaceGuardLockedRoot){
        logOperation("api.exec_blocked",{
          method:req.method,
          path:pathname,
          reason:"workspace_lock_required",
          executionSource:requestExecutionSource,
          cwd:summarizePathForOperationLog(cwd,220),
          prompt:summarizeTextForOperationLog(prompt,24000),
        },"standard");
        sendJson(res,409,{
          ok:false,
          error:"workspace lock required for this design-sensitive execution source",
          code:"workspace_lock_required",
          executionSource:requestExecutionSource,
          workspaceGuard:buildWorkspaceGuardSnapshot(),
        });
        return;
      }
      const reproProfileRequested=isReproExecutionProfile(requestExecutionProfile);
      const governanceOverride=extractGovernanceOverride(body);
      const requestedAgentState=getOrCreateAgentState(agentName);
      const previousPlanningContext=derivePreviousPlanningContextForRequest(requestedAgentState,cwd);
      const extensionApplied=applyRequirementGuardExecExtension({
        prompt,
        sandboxMode,
        options:{approvalPolicy,webSearch,fastModeEnabled,automaticApprovalReviewEnabled,model,modelReasoningEffort,agentName,cwd,images,requestUserInputPolicy,governanceOverride,forceNewSession,previousPlanningContext},
      });
      const execPrompt=extensionApplied.prompt;
      const execPromptAudit=buildPromptAudit({
        rawPrompt,
        normalizedPrompt:execPrompt,
        maxChars:defaultPromptCharLimit,
      });
      const execSandboxMode=extensionApplied.sandboxMode;
      const execOptions=extensionApplied.options;
      const resolvedExecAgent=resolveAgentName(execOptions);
      const agentValidation=validateRequestedAgentName(resolvedExecAgent);
      if(!agentValidation.ok){
        logOperation("api.exec_blocked",{
          method:req.method,
          path:pathname,
          reason:safeString(agentValidation.reason,120)||"agent_not_configured",
          agent:safeString(resolvedExecAgent,80),
          allowedAgents:Array.isArray(agentValidation.allowedAgents)?agentValidation.allowedAgents.slice(0,12):[],
        },"standard");
        sendJson(res,400,{
          ok:false,
          error:`agent is not configured for runtime use: ${safeString(resolvedExecAgent,80)||"unknown"}`,
          code:"agent_not_configured",
          allowedAgents:Array.isArray(agentValidation.allowedAgents)?agentValidation.allowedAgents.slice(0,24):[],
        });
        return;
      }
      if(reproProfileRequested){
        execOptions.webSearch=false;
        execOptions.forceNewSession=true;
        execOptions.requestUserInputPolicy="blocked";
      }
      const resolvedRequestUserInputPolicy=normalizeRequestUserInputPolicy(
        execOptions&&execOptions.requestUserInputPolicy,
        requestUserInputPolicy
      );
      const resolvedExecModel=normalizeExecModel(execOptions&&execOptions.model,model);
      const resolvedExecModelReasoningEffort=normalizeExecModelReasoningEffort(execOptions&&execOptions.modelReasoningEffort,modelReasoningEffort);
      execOptions.agentName=resolvedExecAgent;
      execOptions.requestUserInputPolicy=resolvedRequestUserInputPolicy;
      execOptions.model=resolvedExecModel;
      execOptions.modelReasoningEffort=resolvedExecModelReasoningEffort;
      execOptions.promptAudit=execPromptAudit;
      execOptions.executionProfile=requestExecutionProfile;
      execOptions.executionIntent=requestExecutionIntent;
      execOptions.executionSource=requestExecutionSource;
      execOptions.reproProfile=reproProfileRequested?1:0;
      execOptions.governanceOverride=normalizeOverrideRequest(execOptions&&execOptions.governanceOverride?execOptions.governanceOverride:governanceOverride);
      const resolvedExecCwd=execOptions&&execOptions.cwd?execOptions.cwd:cwd;
      const workspaceGuardViolation=buildWorkspaceGuardViolation(resolvedExecCwd);
      if(workspaceGuardViolation){
        logOperation("api.exec_blocked",{
          method:req.method,
          path:pathname,
          reason:safeString(workspaceGuardViolation.payload&&workspaceGuardViolation.payload.code,80)||"outside_locked_workspace",
          executionSource:requestExecutionSource,
          cwd:summarizePathForOperationLog(resolvedExecCwd,220),
          lockedRoot:summarizePathForOperationLog(workspaceGuardLockedRoot,220),
        },"standard");
        sendJson(res,workspaceGuardViolation.statusCode,workspaceGuardViolation.payload);
        return;
      }
      logOperation("api.exec",{
        method:req.method,
        path:pathname,
        agent:safeString(resolvedExecAgent,80),
        sandbox:safeString(execSandboxMode,40),
        approval:safeString(execOptions&&execOptions.approvalPolicy?execOptions.approvalPolicy:approvalPolicy,40),
        web:execOptions&&execOptions.webSearch?1:0,
        fastModeEnabled:resolveFastModeEnabled(execOptions&&execOptions.fastModeEnabled,fastModeEnabled)?1:0,
        automaticApprovalReviewEnabled:resolveAutomaticApprovalReviewEnabled(execOptions&&execOptions.automaticApprovalReviewEnabled,automaticApprovalReviewEnabled)?1:0,
        model:safeString(resolvedExecModel,120),
        modelReasoningEffort:resolvedExecModelReasoningEffort,
        cwd:summarizePathForOperationLog(resolvedExecCwd,220),
        prompt:summarizeTextForOperationLog(execPrompt,24000),
        promptChars:{
          input:execPromptAudit.inputLength,
          output:execPromptAudit.outputLength,
          truncated:execPromptAudit.truncated?1:0,
          limit:execPromptAudit.limit,
        },
        requestUserInputPolicy:resolvedRequestUserInputPolicy,
        executionProfile:requestExecutionProfile,
        reproProfile:reproProfileRequested?1:0,
        executionIntent:requestExecutionIntent,
        executionSource:requestExecutionSource,
        images:Array.isArray(execOptions&&execOptions.images)?execOptions.images.length:0,
        forceNewSession:execOptions&&execOptions.forceNewSession?1:0,
        idempotencyKey:safeString(idempotencyKey,120),
        governanceOverrideBy:safeString(execOptions&&execOptions.governanceOverride&&execOptions.governanceOverride.requestedBy?execOptions.governanceOverride.requestedBy:"",80),
      });
      if(execPromptAudit.truncated){
        logOperation("api.exec_prompt_truncated",{
          method:req.method,
          path:pathname,
          inputChars:execPromptAudit.inputLength,
          outputChars:execPromptAudit.outputLength,
          limit:execPromptAudit.limit,
          idempotencyKey:safeString(idempotencyKey,120),
        },"standard");
      }
      if(!execPrompt&&!execOptions.images.length){
        logOperation("api.exec_failed",{
          method:req.method,
          path:pathname,
          reason:"empty_prompt_and_images",
        });
        sendJson(res,400,{ok:false,error:"prompt or image is required"});
        return;
      }
      const idempotencyClaim=claimExecIdempotencyKey(idempotencyKey,{
        path:pathname,
        method:req.method,
        agent:safeString(resolvedExecAgent,80),
        sandbox:safeString(execSandboxMode,40),
        approval:safeString(execOptions&&execOptions.approvalPolicy?execOptions.approvalPolicy:approvalPolicy,40),
        model:safeString(resolvedExecModel,120),
        modelReasoningEffort:resolvedExecModelReasoningEffort,
        cwd:summarizePathForOperationLog(resolvedExecCwd,220),
        requestUserInputPolicy:resolvedRequestUserInputPolicy,
        executionProfile:requestExecutionProfile,
        executionIntent:requestExecutionIntent,
        executionSource:requestExecutionSource,
        reproProfile:reproProfileRequested?1:0,
        governanceOverrideBy:safeString(execOptions&&execOptions.governanceOverride&&execOptions.governanceOverride.requestedBy?execOptions.governanceOverride.requestedBy:"",80),
        requestHash:hashSha256Hex(JSON.stringify({
          prompt:execPrompt,
          sandboxMode:execSandboxMode,
          approvalPolicy:execOptions&&execOptions.approvalPolicy?execOptions.approvalPolicy:approvalPolicy,
          webSearch:Boolean(execOptions&&execOptions.webSearch),
          fastModeEnabled:resolveFastModeEnabled(execOptions&&execOptions.fastModeEnabled,fastModeEnabled),
          automaticApprovalReviewEnabled:resolveAutomaticApprovalReviewEnabled(execOptions&&execOptions.automaticApprovalReviewEnabled,automaticApprovalReviewEnabled),
          model:resolvedExecModel,
          modelReasoningEffort:resolvedExecModelReasoningEffort,
          agentName:resolvedExecAgent,
          cwd:resolvedExecCwd,
          requestUserInputPolicy:resolvedRequestUserInputPolicy,
          executionProfile:requestExecutionProfile,
          executionIntent:requestExecutionIntent,
          executionSource:requestExecutionSource,
          governanceOverride:execOptions&&execOptions.governanceOverride&&typeof execOptions.governanceOverride==="object"
            ?{
              requestedBy:safeString(execOptions.governanceOverride.requestedBy,80)||"",
              reason:safeString(execOptions.governanceOverride.reason,240)||"",
              ticket:safeString(execOptions.governanceOverride.ticket,120)||"",
            }
            :null,
          images:Array.isArray(execOptions&&execOptions.images)?execOptions.images.length:0,
        })),
      });
      if(!idempotencyClaim.ok){
        const existing=idempotencyClaim.record||{};
        const snapshot=buildExecIdempotencySnapshot(idempotencyKey,existing);
        const duplicateTerminalStatus=resolveExecTerminalStatusFromSnapshot(snapshot);
        const duplicateResolved=Boolean(snapshot&&isResolvedExecLifecycleState(snapshot.lifecycleState||snapshot.state));
        const duplicateCompleted=duplicateResolved&&isSuccessfulExecTerminalStatus(duplicateTerminalStatus);
        const duplicateReason=safeString(idempotencyClaim.reason,80)||"duplicate";
        const requestHashMismatch=duplicateReason==="request_hash_mismatch";
        logOperation("api.exec_idempotency_duplicate",{
          key:safeString(idempotencyKey,120),
          state:safeString(existing.state,40)||"unknown",
          terminalStatus:duplicateTerminalStatus,
          createdAt:Number.isFinite(Number(existing.createdAt))?Math.max(0,Math.trunc(Number(existing.createdAt))):0,
          updatedAt:Number.isFinite(Number(existing.updatedAt))?Math.max(0,Math.trunc(Number(existing.updatedAt))):0,
          duplicateCompleted:duplicateCompleted?1:0,
          reason:duplicateReason,
          requestHashMismatch:requestHashMismatch?1:0,
        },"standard");
        if(requestHashMismatch){
          sendJson(res,409,{
            ok:false,
            duplicate:true,
            error:"idempotency request hash mismatch",
            code:"idempotency_request_hash_mismatch",
            reason:"request_hash_mismatch",
            idempotency:snapshot,
            requestHash:safeString(idempotencyClaim.requestHash,160)||undefined,
            existingRequestHash:safeString(idempotencyClaim.existingRequestHash,160)||undefined,
          });
          return;
        }
        if(duplicateResolved){
          sendJson(res,200,{
            ok:duplicateCompleted,
            duplicate:true,
            idempotency:snapshot,
            result:snapshot&&snapshot.outcome?snapshot.outcome:null,
          });
          return;
        }
        sendJson(res,409,{
          ok:false,
          duplicate:true,
          error:"duplicate idempotency key",
          idempotency:snapshot,
        });
        return;
      }
      execOptions.idempotencyKey=idempotencyKey;
      execOptions.onTerminal=(terminal)=>{
        finalizeExecIdempotencyKey(idempotencyKey,terminal&&typeof terminal==="object"
          ?terminal
          :{status:"failed",error:"missing terminal outcome"});
      };
      res.writeHead(200,{"Content-Type":"application/x-ndjson; charset=utf-8","Cache-Control":"no-store","Transfer-Encoding":"chunked"});
      res.once("close",()=>{
        markExecIdempotencyResponseClosed(idempotencyKey);
      });
      runCodexExecStreaming(res,execPrompt,execSandboxMode,execOptions).catch(error=>{
        logOperation("api.exec_stream_failed",{
          method:req.method,
          path:pathname,
          err:summarizeErrorForOperationLog(error,220),
        });
        finalizeExecIdempotencyKey(idempotencyKey,{
          status:"failed",
          error:error&&error.message?error.message:String(error),
        });
        if(res.writableEnded)return;
        writeChunk(res,`${JSON.stringify({type:"error",text:`[error] ${error.message}`})}\n`);
        try{
          res.end();
        }catch{
        }
      });
    }catch(e){
      if(idempotencyKey)releaseExecIdempotencyKey(idempotencyKey);
      const statusCode=resolveExecRequestErrorStatus(e);
      logOperation("api.exec_failed",{
        method:req.method,
        path:pathname,
        status:statusCode,
        err:summarizeErrorForOperationLog(e,220),
      });
      sendJson(res,statusCode,{ok:false,error:e&&e.message?e.message:String(e)});
    }
    return;
  }

  if(req.method==="GET"){
    serveStaticFile(req,res,pathname);
    return;
  }

  if(pathname.startsWith("/api/")){
    sendJson(res,404,{ok:false,error:"Unknown API route",path:pathname});
    return;
  }
  sendJson(res,405,{error:"Method not allowed"});
}
async function stopHarnessServer(){
  if(shuttingDown)return;
  shuttingDown=true;
  clearPocSchedulerTimer();
  pocSchedulerState.enabled=false;
  pocSchedulerState.nextTickAt=0;
  persistHarnessExecutionMemoryStore({reason:"shutdown"});
  logOperation("server.shutdown",{exitCode:0});
  appServer.stop();
  const serverRef=webServer;
  webServer=null;
  webPort=null;
  if(serverRef){
    await Promise.race([
      new Promise((resolve)=>{try{serverRef.close(()=>resolve());}catch{resolve();}}),
      new Promise((resolve)=>setTimeout(resolve,3000)),
    ]);
  }
  shuttingDown=false;
}
function shutdown(exitCode=0){
  if(shuttingDown)return;
  stopHarnessServer().finally(()=>{
    process.exit(exitCode);
  });
}

function probeExistingServer(port){return new Promise(resolve=>{const req=http.request({hostname:"127.0.0.1",port,path:"/api/runtime",method:"GET",timeout:1200},res=>{let data="";res.on("data",chunk=>{data+=chunk.toString("utf8");});res.on("end",()=>{if(res.statusCode!==200){resolve(false);return;}try{const parsed=JSON.parse(data);resolve(parsed&&parsed.mode==="app-server"&&parsed.apiVersion===apiVersion);}catch{resolve(false);}});});req.on("error",()=>resolve(false));req.on("timeout",()=>{req.destroy();resolve(false);});req.end();});}

function listenOn(port){return new Promise((resolve,reject)=>{const onError=error=>{webServer.off("listening",onListening);reject(error);};const onListening=()=>{webServer.off("error",onError);resolve(port);};webServer.once("error",onError);webServer.once("listening",onListening);webServer.listen(port,"127.0.0.1");});}

async function main(){const preferredPort=Number.isInteger(forcedUiPort)&&forcedUiPort>0?forcedUiPort:57525;webServer=http.createServer((req,res)=>{requestHandler(req,res).catch(error=>{console.error("[server] unhandled request error:",error);sendJson(res,500,{error:"server error"});});});
  loadHarnessExecutionMemoryStore();
  if(refreshCurrentLogsOnly){
    updateCurrentLogSurface({trigger:refreshCurrentLogsTrigger});
    process.stdout.write(`${JSON.stringify({
      ok:true,
      mode:"refresh-current-logs-only",
      trigger:refreshCurrentLogsTrigger,
      currentRoot:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentRoot),
      latestRunSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestRunSummaryPath),
      designConformanceSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentDesignConformancePath),
      latestSignoffSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestSignoffSummaryPath),
    },null,2)}\n`);
    process.exit(0);
    return;
  }
  try{webPort=await listenOn(preferredPort);}catch(error){if(error.code==="EADDRINUSE"){const existingIsOurs=await probeExistingServer(preferredPort);const fixedUrl=buildAutoOpenUrl(preferredPort);if(existingIsOurs){if(autoOpenBrowser)openBrowser(fixedUrl);process.exit(0);return;}throw new Error(`Fixed UI port ${preferredPort} is already in use by another app.`);}throw error;}
  const url=buildAutoOpenUrl(webPort);if(autoOpenBrowser)openBrowser(url);
  const startupTurnArtifactPrune=maybePruneTurnArtifactsStorage("server_start",{force:true});
  const fullUtilization=buildFullUtilizationDefaultsSnapshot();
  const parentDispatchGuard=buildParentDispatchGuardDefaultsSnapshot();
  logOperation("server.started",{
    port:webPort,
    autoOpenBrowser:autoOpenBrowser?1:0,
    autoOpenPath:autoOpenPath||"/",
    autoOpenBrowserEngine:edgeExecutablePath?"edge":"system-default",
    executionProfile:runtimeExecutionProfile,
    executionProfileEnvKey:executionProfileEnvKey,
    executionProfileSmokeLike:isSmokeExecutionProfile(runtimeExecutionProfile)?1:0,
    fullUtilization,
    parentDispatchGuard,
    gitAutomation:buildGitAutomationRuntimeSnapshot(),
    operationLog:operationLog.runtimeSnapshot(),
    requestUserInputPolicy:nonInteractiveRequestUserInputPolicy,
    controlApiTokenHash:hashSha256Hex(controlApiToken).slice(0,16),
    execApiGuard:{
      tokenHeader:controlApiTokenHeaderName,
      originCheck:1,
      contentType:execApiRequiredContentType,
    },
    turnArtifactsEnabled:turnArtifactsEnabled?1:0,
    turnArtifactsRoot:summarizePathForOperationLog(turnArtifactsRoot,220),
    turnArtifactsMaxBytes,
    turnArtifactsMaxDays,
    turnArtifactsRedactionEnabled:turnArtifactsRedactionEnabled?1:0,
    turnArtifactsPrunedOnStart:startupTurnArtifactPrune&&startupTurnArtifactPrune.deletedDirs>0?1:0,
    turnArtifactsPrunedBytes:startupTurnArtifactPrune?Math.max(0,Math.trunc(Number(startupTurnArtifactPrune.deletedBytes)||0)):0,
    adversarialShadow:{
      enabled:adversarialShadowEnabled?1:0,
      minScore:adversarialShadowMinScore,
      maxPromptChars:adversarialShadowMaxPromptChars,
      maxAnswerChars:adversarialShadowMaxAnswerChars,
      loopEnabled:adversarialShadowEnabled&&adversarialLoopEnabled?1:0,
      loopMaxRetries:adversarialLoopMaxRetries,
      version:shadowReviewVersion,
    },
    execIdempotencyTtlMs:execIdempotencyTtlMs,
    execIdempotencyStatusWaitMaxMs,
    harnessMemory:buildHarnessMemoryRuntimeSnapshot(),
    evalHarness:{
      suiteId:safeString(defaultEvalSuite&&defaultEvalSuite.suiteId,120)||"unknown",
      caseCount:Array.isArray(defaultEvalSuite&&defaultEvalSuite.cases)?defaultEvalSuite.cases.length:0,
      maxCases:evalMaxCases,
      maxVariants:evalDefaultMaxVariants,
      caseTimeoutMs:evalCaseTimeoutMs,
    },
    slo:{
      windowTurns:sloWindowTurns,
      failureRateMax:sloFailureRateMax,
      latencyP95MaxMs:sloLatencyP95MaxMs,
      idempotencyConflictRateMax:sloIdempotencyConflictRateMax,
    },
    turnContract:{
      schema:safeString(harnessTurnContractSpec&&harnessTurnContractSpec.schema,80)||"harness-turn-contract.v1",
      path:summarizePathForOperationLog(harnessTurnContractSpecPath,220),
    },
  });
  updateCurrentLogSurface({trigger:"server_started"});
}

async function startHarnessServer(){
  if(webServer&&typeof webServer.listening==="boolean"&&webServer.listening){
    return{port:webPort};
  }
  await main();
  return{port:webPort};
}

if(require.main===module){
  process.on("SIGINT",()=>shutdown(0));
  process.on("SIGTERM",()=>shutdown(0));
  process.on("uncaughtException",error=>{logOperation("server.uncaught_exception",{err:summarizeErrorForOperationLog(error,220)});console.error("[server] uncaught exception:",error);shutdown(1);});
  process.on("unhandledRejection",error=>{logOperation("server.unhandled_rejection",{err:summarizeErrorForOperationLog(error,220)});console.error("[server] unhandled rejection:",error);shutdown(1);});

  main().catch(error=>{logOperation("server.start_failed",{err:summarizeErrorForOperationLog(error,220)});console.error("[launcher] failed to start:",error);process.exit(1);});
}

module.exports={
  startHarnessServer,
  stopHarnessServer,
  refreshCurrentLogSurface:(trigger="manual")=>{
    loadHarnessExecutionMemoryStore();
    updateCurrentLogSurface({trigger:safeString(trigger,80)||"manual"});
    return{
      currentRoot:loggingSurfacePaths.currentRoot,
      operatorSummaryPath:loggingSurfacePaths.currentOperatorSummaryPath,
      runtimeSnapshotPath:loggingSurfacePaths.currentRuntimeSnapshotPath,
      designConformancePath:loggingSurfacePaths.currentDesignConformancePath,
      latestRunSummaryPath:loggingSurfacePaths.currentLatestRunSummaryPath,
      reviewLoadBreakdownPath:loggingSurfacePaths.currentReviewLoadBreakdownPath,
      latestSignoffSummaryPath:loggingSurfacePaths.currentLatestSignoffSummaryPath,
      indexPath:loggingSurfacePaths.currentIndexPath,
    };
  },
  getHarnessServerState:()=>({
    port:webPort,
    listening:Boolean(webServer&&webServer.listening),
    transport:getAppServerTransportMode(),
  }),
  __riskAudit:{
    riskRulesVersion,
    approvalRiskRuleIds,
    normalizeRiskRuleIds,
    normalizeRiskInputSummary,
    normalizeApprovalAuditRecord,
    applyTurnArtifactRedactionToText,
    redactTurnArtifactValue,
    pruneTurnArtifactsStorage,
    buildExecIdempotencySnapshot,
    normalizeExecIdempotencyWaitMs,
    CodexAppServerClient,
    TurnArtifactRecorder,
  },
  __staticMount:{
    bundledEnglishConversationAppRoot,
    defaultExternalEnglishConversationAppRoot,
    getEnglishConversationAppStaticSource,
    buildStaticRequestTarget,
  },
  __codexModes:{
    automaticApprovalReviewFeatureName,
    buildForkedAgentState,
    createBaseAgentState,
    buildThreadStartConfig,
    defaultCodexServiceTier,
    defaultExperimentalFeatures,
    fastModeFeatureName,
    normalizeCodexServiceTier,
  },
  __topography:{
    createLiveCollabTurnTracker,
    observeLiveCollabItem,
    getAgentTopographySnapshot,
    getLiveCollabChildRows,
    clearLiveCollabChildState:()=>{
      liveCollabChildActivityByThread.clear();
      liveCollabChildCatalogByThread.clear();
    },
  },
};
