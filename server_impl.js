const http=require("http");
const https=require("https");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const zlib=require("zlib");
const {spawn,spawnSync}=require("child_process");
const {createRequestHandler}=require("./server/request_handler");
const {createRequestHandlerContext}=require("./server/request_handler_context");
const {createRouteServices}=require("./server/route_services");
const {createCurrentSurfaceService}=require("./server/services/current_surface_service");
const {createCurrentLogSurfaceService}=require("./server/services/current_log_surface_service");
const {createHarnessOverviewSnapshotService}=require("./server/services/harness_overview_snapshot_service");
const {createRuntimeApiSnapshotService}=require("./server/services/runtime_api_snapshot_service");
const {createRuntimeStateService}=require("./server/services/runtime_state_service");
const {createTraceabilityService}=require("./server/services/traceability_service");
const {createBootstrapApi}=require("./server/bootstrap");
const {runBatchJob,getRunnerCapabilities}=require("./scripts/poc_batch_runner");
const {buildMockFixtureScenario}=require("./scripts/lib/mock_app_server_fixture");
const {
  defaultNonInteractivePolicy,
  normalizeRequestUserInputPolicy,
  resolveNonInteractiveUserInput,
}=require("./scripts/lib/request_user_input_policy");
const {
  evaluateAgentGovernance,
  getAgentGovernancePolicySnapshot,
  normalizeOverrideRequest,
  summarizeAgentGovernance,
}=require("./scripts/lib/agent_governance_policy");
const {
  requestHeaderValue,
  normalizeMimeTypeHeader,
  validateJsonMutationContentType,
  extractExecIdempotencyKey,
  extractGovernanceOverride,
}=require("./scripts/lib/http_request_guards");
const {
  buildSkillPortfolioOverview:buildSkillPortfolioOverviewSurface,
}=require("./scripts/lib/skill_portfolio_overview");
const {defaultPromptCharLimit,buildPromptAudit,evaluateImagePayloadBudget,formatBytes}=require("./scripts/lib/exec_payload_policy");
const {buildAdversarialShadowReview,shadowReviewVersion}=require("./scripts/lib/adversarial_shadow_policy");
const {buildAdversarialRetryPrompt,shouldRetryAdversarialLoop}=require("./scripts/lib/adversarial_loop_policy");
const {
  stripLeadingResidualIncompletionLead,
  stripLeadingProgramReadinessLead,
  stripInternalProcessDisclosure,
  stripUnsolicitedClosingProposal,
}=require("./scripts/lib/user_facing_response_policy");
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
const {createConversationRuntime}=require("./scripts/lib/conversation_runtime");
const {
  defaultEvalSuitePath,
  normalizeEvalSuite,
  loadEvalSuiteFromFile,
  summarizeEvalCaseResult,
  buildEvalRunSummary,
  compareEvalRuns,
}=require("./scripts/lib/eval_harness_policy");
const {
  loadAgiV1ProfileConfig,
  captureManifestSnapshot,
  buildCandidateBundle,
  expandAgiV1Variants,
  loadAgiBundleFromPath,
}=require("./scripts/lib/agi_v1_profile");
const {
  assertEvalLaneAccess,
  defaultEvalLanePolicyPath,
  loadEvalLanePolicy,
  summarizeEvalLane,
}=require("./scripts/lib/eval_lane_policy");
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
  defaultAuthorityRegistryPath,
  loadAuthorityRegistry,
}=require("./scripts/lib/authority_registry");
const {
  defaultHarnessPlaneContractPath,
  loadHarnessPlaneContract,
  normalizeHarnessPlaneContract,
}=require("./scripts/lib/harness_plane_contract");
const {
  defaultContractPath:defaultAdoptionReadinessContractPath,
  loadAdoptionReadinessContract,
}=require("./scripts/lib/adoption_readiness_policy");
const {
  defaultWorkerDecisionSurfaceContractPath,
  loadWorkerDecisionSurfaceContract,
}=require("./scripts/lib/worker_decision_surface");
const {
  defaultIterationControlContractPath,
  loadIterationControlContract,
}=require("./scripts/lib/iteration_control_policy");
const {
  buildEvalRunGovernanceBundle,
  buildGovernanceRuntimeSurface,
  buildTurnGovernanceBundle,
}=require("./scripts/lib/governance_bundle");
const {
  defaultSystemCoherenceReviewContractPath,
  evaluateSystemCoherenceReview,
  loadSystemCoherenceReviewContract,
}=require("./scripts/lib/system_coherence_review_policy");
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
  activeTasteProfile,
  buildIntentDirectivePrefix,
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
  defaultTaskContractManifestPath,
  loadTaskContractManifest,
  summarizeTaskContract,
}=require("./scripts/lib/task_contract_policy");
const {
  inspectTask:inspectContinuityTask,
}=require("./scripts/lib/long_horizon_continuity");
const {
  shouldAutoInterruptForDiscoveryNeedsInput,
}=require("./scripts/lib/discovery_needs_input_policy");
const {
  buildIndependentVerifierReport,
}=require("./scripts/lib/independent_verifier");
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
  buildClauseCompletionScorecard,
  buildRuntimeRevisionGateDecision,
  collectRequirementRevisionProposalsFromTexts,
  sanitizeRequirementRevisionGate,
  sanitizeRequirementRevisionProposal,
}=require("./scripts/lib/requirement_revision_policy");
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
const {
  buildRuntimePromptInjection,
  defaultOpenAIBlogLearningPolicyPath,
  loadOpenAIBlogLearningPolicy,
  buildRuntimeSnapshotFromArtifacts:buildOpenAIBlogLearningRuntimeSnapshot,
  recordOpenAIBlogLearningObservation,
  runOpenAIBlogLearningCycle,
}=require("./scripts/lib/openai_blog_learning");
const {
  buildHarnessOverviewPayload,
  syncHarnessOverviewGovernedMemory,
}=require("./scripts/lib/harness_overview_surface");
const {
  buildBrowserCapabilitySurface,
  buildContinuityOverviewSurface,
  createRuntimeArtifactReaders,
}=require("./scripts/lib/harness_capability_surface");
const {
  defaultAnthropicEngineeringLearningPolicyPath,
  loadAnthropicEngineeringLearningPolicy,
  buildAnthropicEngineeringRuntimeSnapshot,
  runAnthropicEngineeringLearningCycle,
}=require("./scripts/lib/anthropic_engineering_learning");
const {
  buildManualSelfImprovementRuntimeSummary,
}=require("./scripts/lib/manual_self_improvement_runtime");
const {
  buildHarnessAgiImprovementFlywheelRuntimeSummary,
}=require("./scripts/lib/agi_improvement_flywheel_runtime");
const {
  buildDocumentToolingRuntimeSnapshot,
}=require("./scripts/lib/document_tooling_runtime");
const {
  buildGovernedMemoryRuntimeSnapshot,
  syncGovernedMemoryGraph,
}=require("./scripts/lib/governed_memory_graph");
const {
  buildAppsRuntimeSnapshot:buildAppRegistryRuntimeSnapshot,
  findAppById,
  findAppByMountPath,
  loadAppRegistry,
  resolveNativeStaticRoot,
  resolveProxyAppForward,
  rewriteNativeAppApiPath,
}=require("./scripts/lib/app_registry");
const {
  createAppPlatformReadSurface,
}=require("./scripts/lib/app_platform_read_surface");
const {
  assertCodexReady,
  resolveCodexAppServerSpawnTarget,
  runCodexReply,
  runCodexStructuredOutput,
}=require("./scripts/lib/harness_app_runtime");

const workspaceRoot=__dirname;
const runtimeArtifactReaders=createRuntimeArtifactReaders({
  workspaceRoot,
  safeString:(value,max=12000)=>{
    if(typeof value!=="string")return"";
    const trimmed=value.trim();
    return trimmed?trimmed.slice(0,max):"";
  },
  readJsonObjectFile,
  readLoggingSurfaceJson,
});
const {resolveWorkspaceRuntimePath,readWorkspaceJsonArtifact}=runtimeArtifactReaders;
const workspaceParentRoot=path.dirname(workspaceRoot);
const webRoot=path.join(workspaceRoot,"web");
const bundledEnglishConversationAppRoot=path.join(webRoot,"english-conversation-app");
const defaultIntegratedEnglishConversationAppRoot=path.join(workspaceRoot,"APP","01.english-conversation-app");
const legacyExternalEnglishConversationAppRoot=path.join(workspaceParentRoot,"english-conversation-app");
const defaultExternalEnglishConversationAppRoot=legacyExternalEnglishConversationAppRoot;
const appRegistry=loadAppRegistry(workspaceRoot);
const appPlatformReadSurface=createAppPlatformReadSurface({
  workspaceRoot,
  webRoot,
  bundledEnglishConversationAppRoot,
  defaultIntegratedEnglishConversationAppRoot,
  legacyExternalEnglishConversationAppRoot,
  appRegistry,
  buildAppRegistryRuntimeSnapshot,
  buildHarnessAppRuntimeStatus,
  findAppById,
  findAppByMountPath,
  getRegisteredAppRuntimeConfig,
  isPathWithin,
  resolveNativeStaticRoot,
  sendJson,
  summarizePathForOperationLog,
});
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
const nonInteractiveRequestUserInputPolicy=normalizeRequestUserInputPolicy(process.env[requestUserInputPolicyEnvKey],defaultNonInteractivePolicy);
const automaticApprovalReviewDefault=parseBooleanEnv(automaticApprovalReviewEnvKey,true);
const fastModeDefault=parseBooleanEnv(fastModeDefaultEnvKey,false);
const openAIBlogLearningEnabledEnvKey="CODEX_OPENAI_BLOG_LEARNING_ENABLED";
const openAIBlogLearningIntervalEnvKey="CODEX_OPENAI_BLOG_LEARNING_INTERVAL_MINUTES";
const openAIBlogLearningRuntimeRetrievalEnabledEnvKey="CODEX_OPENAI_BLOG_RUNTIME_RETRIEVAL_ENABLED";
const openAIBlogLearningRuntimeRetrievalShadowModeEnvKey="CODEX_OPENAI_BLOG_RUNTIME_RETRIEVAL_SHADOW_MODE";
const anthropicEngineeringLearningEnabledEnvKey="CODEX_ANTHROPIC_ENGINEERING_LEARNING_ENABLED";
const anthropicEngineeringLearningIntervalEnvKey="CODEX_ANTHROPIC_ENGINEERING_LEARNING_INTERVAL_MINUTES";
const openAIBlogLearningPolicy=loadOpenAIBlogLearningPolicy(defaultOpenAIBlogLearningPolicyPath);
const anthropicEngineeringLearningPolicy=loadAnthropicEngineeringLearningPolicy(defaultAnthropicEngineeringLearningPolicyPath);
const openAIBlogLearningEnabled=parseBooleanEnv(openAIBlogLearningEnabledEnvKey,true);
const anthropicEngineeringLearningEnabled=parseBooleanEnv(anthropicEngineeringLearningEnabledEnvKey,true);
const openAIBlogLearningRuntimeRetrievalEnabled=parseBooleanEnv(
  openAIBlogLearningRuntimeRetrievalEnabledEnvKey,
  openAIBlogLearningEnabled&&Boolean(openAIBlogLearningPolicy&&openAIBlogLearningPolicy.runtimeRetrieval&&openAIBlogLearningPolicy.runtimeRetrieval.enabled)
);
const openAIBlogLearningRuntimeRetrievalShadowMode=parseBooleanEnv(
  openAIBlogLearningRuntimeRetrievalShadowModeEnvKey,
  Boolean(openAIBlogLearningPolicy&&openAIBlogLearningPolicy.runtimeRetrieval&&openAIBlogLearningPolicy.runtimeRetrieval.shadowMode)
);
const openAIBlogLearningIntervalMinutes=Math.max(
  15,
  Math.min(
    1440,
    Math.trunc(Number(process.env[openAIBlogLearningIntervalEnvKey]||openAIBlogLearningPolicy.cadence.intervalMinutes)||openAIBlogLearningPolicy.cadence.intervalMinutes)
  )
);
const anthropicEngineeringLearningIntervalMinutes=Math.max(
  15,
  Math.min(
    1440,
    Math.trunc(Number(process.env[anthropicEngineeringLearningIntervalEnvKey]||anthropicEngineeringLearningPolicy.cadence.intervalMinutes)||anthropicEngineeringLearningPolicy.cadence.intervalMinutes)
  )
);
const openAIBlogLearningRuntimeState={
  enabled:openAIBlogLearningEnabled,
  running:false,
  lastRunAt:"",
  lastSuccessAt:"",
  nextRunAt:"",
  lastStatus:openAIBlogLearningEnabled?"IDLE":"DISABLED",
  lastReason:"",
  lastRetrievalStatus:openAIBlogLearningRuntimeRetrievalEnabled
    ?(openAIBlogLearningRuntimeRetrievalShadowMode?"SHADOW_IDLE":"IDLE")
    :"DISABLED",
  lastRetrievalReason:"",
  lastRetrievalAt:"",
  lastRetrievalAgent:"",
  lastRetrievalTaskFamily:"",
  lastRetrievalTopics:[],
  lastRetrievalArticleIds:[],
  lastRetrievalHintIds:[],
  lastRetrievalPromptBlockChars:0,
};
const anthropicEngineeringLearningRuntimeState={
  enabled:anthropicEngineeringLearningEnabled,
  running:false,
  lastRunAt:"",
  lastSuccessAt:"",
  nextRunAt:"",
  lastStatus:anthropicEngineeringLearningEnabled?"IDLE":"DISABLED",
  lastReason:"",
};
let openAIBlogLearningTimer=null;
let anthropicEngineeringLearningTimer=null;
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
const defaultParentAgentConfigPath=path.join(workspaceRoot,".codex","agents","default.toml");
const defaultExecModelFallbackName="gpt-5.5";
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
const controlApiActionAllowlist=new Set(["restart_harness_server"]);
if(openCmdWindowEnabled)controlApiActionAllowlist.add("open_workspace_shell");
const execApiRequiredContentType="application/json";
const conversationApiRequiredContentType="application/json";
const conversationRequestBodyLimitBytes=parsePositiveIntEnv("CODEX_CONVERSATION_REQUEST_BODY_LIMIT_BYTES",256*1024,8*1024,2*1024*1024);
const conversationRequestTimeoutMs=parsePositiveIntEnv("CODEX_CONVERSATION_REQUEST_TIMEOUT_MS",45000,3000,120000);
const conversationDefaultMaxTokens=parsePositiveIntEnv("CODEX_CONVERSATION_MAX_TOKENS",220,64,1200);
const conversationExecModelName=tryNormalizeExecModelId(process.env.CODEX_CONVERSATION_EXEC_MODEL)||defaultExecModelName;
const conversationExecModelReasoningEffort=tryNormalizeExecModelReasoningEffort(process.env.CODEX_CONVERSATION_MODEL_REASONING_EFFORT)||"low";
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
const requirementFoundationV1PhaseExitPath=path.join(workspaceRoot,"output","phase_exit_requirement_foundation_v1.json");
const requirementFoundationV1PhaseExitMarkdownPath=path.join(workspaceRoot,"output","phase_exit_requirement_foundation_v1.md");
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
const systemCoherenceReviewContractPath=path.join(workspaceRoot,"scripts","config","system_coherence_review_contract.json");
const authorityRegistryPath=path.join(workspaceRoot,"scripts","config","authority_registry.json");
const harnessPlaneContractPath=path.join(workspaceRoot,"scripts","config","harness_plane_contract.json");
const iterationControlContractPath=path.join(workspaceRoot,"scripts","config","iteration_control_contract.json");
const adoptionReadinessContractPath=path.join(workspaceRoot,"scripts","config","adoption_readiness_evaluator_contract.json");
const workerDecisionSurfaceContractPath=path.join(workspaceRoot,"scripts","config","worker_decision_surface_contract.json");
const deploymentPostureProfilesPath=path.join(workspaceRoot,"scripts","config","deployment_posture_profiles.json");
const userFacingResponseContractPath=defaultUserFacingResponseContractPath;
const planningModeContractPath=path.join(workspaceRoot,"scripts","config","planning_mode_contract.json");
const assuranceModeContractPath=path.join(workspaceRoot,"scripts","config","assurance_depth_contract.json");
const taskFamilyProfilesPath=path.join(workspaceRoot,"scripts","config","task_family_profiles.json");
const taskContractManifestPath=path.join(workspaceRoot,"scripts","config","task_contract_manifest.json");
const evalLanePolicyPath=path.join(workspaceRoot,"scripts","config","eval_lane_policy.json");
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
const conversationAppServerModel=conversationExecModelName;
const conversationPersonaMemoryPath=loggingSurfacePaths.conversationPersonaMemoryPath;
const conversationPersonaMemoryContextFacts=5;
const conversationPersonaMemoryContextTopics=3;
const defaultEvalSuite=loadEvalSuiteSafely();
const harnessTurnContractSpec=loadHarnessTurnContractSpecSafely();
const taskOutcomeContract=loadTaskOutcomeContractSafely();
const systemCoherenceReviewContract=loadSystemCoherenceReviewContractSafely();
const authorityRegistry=loadAuthorityRegistrySafely();
const harnessPlaneContract=loadHarnessPlaneContractSafely();
const iterationControlContract=loadIterationControlContractSafely();
const adoptionReadinessContract=loadAdoptionReadinessContractSafely();
const workerDecisionSurfaceContract=loadWorkerDecisionSurfaceContractSafely();
const planningModeContract=loadPlanningModeContractSafely();
const assuranceModeContract=loadAssuranceModeContractSafely();
const taskFamilyProfilesContract=loadTaskFamilyProfilesContractSafely();
const taskContractManifest=loadTaskContractManifestSafely();
const evalLanePolicy=loadEvalLanePolicySafely();
const designAcceptanceContract=loadDesignAcceptanceContractSafely();
let tasteMemoryStore=loadTasteMemoryStoreSafely();
let workspaceGuardLockedRoot=workspaceRoot;

let webServer=null;
let webPort=null;
let shuttingDown=false;
let nextAgentNumber=1;
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
const conversationRuntime=createConversationRuntime({
  workspaceRoot,
  conversationApiRequiredContentType,
  conversationRequestBodyLimitBytes,
  conversationRequestTimeoutMs,
  conversationDefaultMaxTokens,
  conversationExecModelName,
  conversationExecModelReasoningEffort,
  conversationProvider,
  conversationAppServerModel,
  conversationPersonaMemoryPath,
  conversationPersonaMemoryContextFacts,
  conversationPersonaMemoryContextTopics,
  kokoroVoiceRequestBodyLimitBytes,
  kokoroVoiceRequestTimeoutMs,
  kokoroVoiceServiceBaseUrl,
  kokoroDefaultModel,
  kokoroDefaultVoice,
  kokoroDefaultLangCode,
  safeString,
  normalizeExecutionState,
  summarizeErrorForOperationLog,
  summarizePathForOperationLog,
  logOperation,
  runCodexExecStreaming,
  isRequestBodyTooLargeError,
});
const {
  getConversationRuntimeSnapshot,
  getKokoroVoiceRuntimeSnapshot,
  normalizeConversationMessage,
  normalizeConversationMode,
  normalizeConversationLevel,
  normalizeConversationTopic,
  normalizeConversationPersonaUserId,
  normalizeConversationHistoryItems,
  getConversationPersonaContextForUser,
  updateConversationPersonaMemoryForUser,
  resetConversationPersonaMemoryForUser,
  runConversationViaAppServer,
  resolveConversationRequestErrorStatus,
  resolvePiperVoiceRequestErrorStatus,
  resolveKokoroVoiceRequestErrorStatus,
  requestKokoroSpeech,
}=conversationRuntime;

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
function loadSystemCoherenceReviewContractSafely(){
  try{
    return loadSystemCoherenceReviewContract(systemCoherenceReviewContractPath);
  }catch(error){
    console.warn(`[contract] failed to load system coherence review contract from ${systemCoherenceReviewContractPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadSystemCoherenceReviewContract(defaultSystemCoherenceReviewContractPath);
    }catch{
      return{
        schema:"system-coherence-review-contract.v1",
        version:"",
        requiredCommand:"node scripts/system_coherence_review_test.js",
        reviewPlanes:["execution_path","governance_rules","machine_contracts","server_runtime","evaluation_memory","artifact_surface"],
      };
    }
  }
}
function loadAuthorityRegistrySafely(){
  try{
    return loadAuthorityRegistry(authorityRegistryPath);
  }catch(error){
    console.warn(`[contract] failed to load authority registry from ${authorityRegistryPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadAuthorityRegistry(defaultAuthorityRegistryPath);
    }catch{
      return{
        schema:"authority-registry.v1",
        version:"",
        sourceDoc:"docs/HARNESS_CONSTITUTION.md",
        precedence:[],
        driftRules:{
          singleSupremePath:"docs/HARNESS_CONSTITUTION.md",
          operationalConstitutionPath:"AGENTS.md",
          primaryExecRoute:"POST /api/exec",
          primaryEvalRoute:"POST /api/eval/run",
          forbiddenPrimaryRoutePatterns:[],
        },
      };
    }
  }
}
function loadHarnessPlaneContractSafely(){
  try{
    return loadHarnessPlaneContract(harnessPlaneContractPath);
  }catch(error){
    console.warn(`[contract] failed to load harness plane contract from ${harnessPlaneContractPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadHarnessPlaneContract(defaultHarnessPlaneContractPath);
    }catch{
      return normalizeHarnessPlaneContract(null);
    }
  }
}
function loadIterationControlContractSafely(){
  try{
    return loadIterationControlContract(iterationControlContractPath);
  }catch(error){
    console.warn(`[contract] failed to load iteration control contract from ${iterationControlContractPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadIterationControlContract(defaultIterationControlContractPath);
    }catch{
      return loadIterationControlContract();
    }
  }
}
function loadAdoptionReadinessContractSafely(){
  try{
    return loadAdoptionReadinessContract(adoptionReadinessContractPath);
  }catch(error){
    console.warn(`[contract] failed to load adoption readiness contract from ${adoptionReadinessContractPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadAdoptionReadinessContract(defaultAdoptionReadinessContractPath);
    }catch{
      return loadAdoptionReadinessContract();
    }
  }
}
function loadWorkerDecisionSurfaceContractSafely(){
  try{
    return loadWorkerDecisionSurfaceContract(workerDecisionSurfaceContractPath);
  }catch(error){
    console.warn(`[contract] failed to load worker decision surface contract from ${workerDecisionSurfaceContractPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadWorkerDecisionSurfaceContract(defaultWorkerDecisionSurfaceContractPath);
    }catch{
      return loadWorkerDecisionSurfaceContract();
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
function loadTaskContractManifestSafely(){
  try{
    return loadTaskContractManifest(taskContractManifestPath);
  }catch(error){
    console.warn(`[contract] failed to load task contract manifest from ${taskContractManifestPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadTaskContractManifest(defaultTaskContractManifestPath);
    }catch{
      return{
        schema:"task-contract-manifest.v1",
        version:"",
        defaultFamily:"deterministic_code",
        contracts:[],
      };
    }
  }
}
function loadEvalLanePolicySafely(){
  try{
    return loadEvalLanePolicy(evalLanePolicyPath,{workspaceRoot});
  }catch(error){
    console.warn(`[eval] failed to load eval lane policy from ${evalLanePolicyPath}: ${error&&error.message?error.message:String(error)}`);
    try{
      return loadEvalLanePolicy(defaultEvalLanePolicyPath,{workspaceRoot});
    }catch{
      return{
        schema:"eval-lane-policy.v1",
        version:"",
        publicLaneId:"public_regression",
        aggregateOutputPath:path.join(workspaceRoot,"output","eval_lane_aggregate.json"),
        protectedPaths:[],
        lanes:[],
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
function getActiveIntentProfileForRuntime(){
  return activeTasteProfile(tasteMemoryStore);
}
function shouldInjectIntentDirectives({executionIntent="",executionProfile="",activeProfile}={}){
  const profile=activeProfile&&typeof activeProfile==="object"?activeProfile:{};
  const autonomy=profile.autonomy&&typeof profile.autonomy==="object"?profile.autonomy:{};
  if(autonomy.promptInjectionEnabled===false)return false;
  const normalizedIntent=normalizeExecutionIntent(executionIntent,"interactive");
  const normalizedProfile=normalizeExecutionProfile(executionProfile,runtimeExecutionProfile);
  if(
    normalizedIntent.includes("eval")
    ||normalizedIntent.includes("probe")
    ||normalizedIntent.includes("replay")
    ||normalizedIntent.includes("signoff")
    ||normalizedIntent.includes("proof")
  )return false;
  if(isReproExecutionProfile(normalizedProfile))return false;
  return true;
}
function prependIntentDirectivesForRuntime(prompt,{executionIntent="",executionProfile="",designSensitive=false}={}){
  const normalizedPrompt=safeString(prompt,defaultPromptCharLimit);
  if(!normalizedPrompt)return normalizedPrompt;
  const activeProfile=getActiveIntentProfileForRuntime();
  if(!shouldInjectIntentDirectives({executionIntent,executionProfile,activeProfile}))return normalizedPrompt;
  const prefix=buildIntentDirectivePrefix({
    contract:designAcceptanceContract,
    activeProfile,
    designSensitive,
  });
  if(!safeString(prefix,4000))return normalizedPrompt;
  return`${prefix}\n\nExecution request:\n${normalizedPrompt}`;
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
  const nextPatch={...patch};
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
  if(Object.prototype.hasOwnProperty.call(patch,"autonomy")&&patch.autonomy&&typeof patch.autonomy==="object"){
    nextPatch.autonomy={
      ...(current.autonomy&&typeof current.autonomy==="object"?current.autonomy:{}),
      ...patch.autonomy,
    };
  }
  return{
    ...current,
    ...nextPatch,
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
      memoryMode:normalizeCodexMemoryMode(request.memoryMode,"default"),
      resetCodexMemory:request.resetCodexMemory?1:0,
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
      hint:"This is waiting on user input, not a failed turn; collect the missing information, approval, or decision and continue from the current turn.",
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
    memoryMode:safeString(source.memoryMode,40)||"",
    resetCodexMemory:source.resetCodexMemory?1:0,
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
    memoryMode:normalized.request.memoryMode,
    resetCodexMemory:normalized.request.resetCodexMemory?1:0,
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
  const rawMode=safeString(payload.mode,40).toLowerCase();
  const modeExplicit=rawMode==="standard"||rawMode==="elicited";
  return{
    label:safeString(payload.label,40)||fallbackLabel,
    candidateId:safeString(payload.candidateId,120)||safeString(payload.label,40)||fallbackLabel,
    mode:rawMode==="elicited"?"elicited":"standard",
    modeExplicit,
    promptPrefix:safeString(payload.promptPrefix,2000)||"",
    seed:safeString(payload.seed,120)||"",
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
function buildRemediationProbeResult({
  driver="",
  decision="",
  safeCompletion=false,
  taskOutcomeStatus="",
  taskOutcomeReason="",
  commandExecutions=0,
  commandFailures=0,
  changedFiles=0,
  changedPaths=[],
  extra={}
}={}){
  const normalizedReason=safeString(taskOutcomeReason,160)||safeString(driver,80)||"probe_outcome";
  const sanitizedExtra=sanitizeJsonValue(extra);
  return{
    driver:safeString(driver,80),
    decision:safeString(decision,80)||"unknown",
    safeCompletion:Boolean(safeCompletion),
    work:{
      fileChanges:Number.isFinite(Number(changedFiles))?Math.max(0,Math.trunc(Number(changedFiles))):0,
      changedFiles:Number.isFinite(Number(changedFiles))?Math.max(0,Math.trunc(Number(changedFiles))):0,
      commandExecutions:Number.isFinite(Number(commandExecutions))?Math.max(0,Math.trunc(Number(commandExecutions))):0,
      commandFailures:Number.isFinite(Number(commandFailures))?Math.max(0,Math.trunc(Number(commandFailures))):0,
      mcpCalls:0,
    },
    taskOutcomeStatus:safeString(taskOutcomeStatus,80),
    taskOutcomeReason:normalizedReason,
    changedPaths:Array.isArray(changedPaths)?changedPaths.map((entry)=>safeString(entry,220)).filter(Boolean).slice(0,12):[],
    ...(sanitizedExtra&&typeof sanitizedExtra==="object"&&!Array.isArray(sanitizedExtra)?sanitizedExtra:{}),
  };
}
function executeEvalProbeCase(evalCase,variant){
  const input=evalCase&&evalCase.input&&typeof evalCase.input==="object"?evalCase.input:{};
  const driver=safeString(evalCase&&evalCase.driver,80).toLowerCase()||"exec";
  switch(driver){
  case "agi_metric_probe":{
    const metricSource=input.metricResult&&typeof input.metricResult==="object"?input.metricResult:{};
    const fixedMode=safeString(metricSource.mode,40).toLowerCase();
    const variantMode=safeString(variant&&variant.mode,40).toLowerCase()||"standard";
    const modeMismatch=fixedMode&&(fixedMode==="standard"||fixedMode==="elicited")&&fixedMode!==variantMode;
    const metricResult={
      ...metricSource,
      mode:fixedMode==="standard"||fixedMode==="elicited"?fixedMode:variantMode,
      supportStatus:modeMismatch?"not_applicable":safeString(metricSource.supportStatus,80)||safeString(metricSource.status,80)||"supported",
      relevant:modeMismatch?false:(Object.prototype.hasOwnProperty.call(metricSource,"relevant")?Boolean(metricSource.relevant):true),
      pass_fail:modeMismatch?true:metricSource.pass_fail,
    };
    return{
      metricResult,
      scenario:safeString(input.scenario,160)||safeString(evalCase&&evalCase.id,120),
    };
  }
  case "agent_governance_probe":
    return evaluateAgentGovernance({
      agentName:safeString(input.agentName,120)||variant.agentName,
      operation:safeString(input.operation,80)||"fileChange",
      changedPaths:Array.isArray(input.changedPaths)
        ?input.changedPaths.map((entry)=>safeString(entry,260)).filter(Boolean).slice(0,24)
        :[],
      override:input.override&&typeof input.override==="object"?input.override:null,
      taskContext:input.taskContext&&typeof input.taskContext==="object"?input.taskContext:null,
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
      prompt:safeString(input.prompt,24000),
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
      options:{...(input.options&&typeof input.options==="object"?input.options:variant),intentProfile:getActiveIntentProfileForRuntime()},
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
      options:{...(input.options&&typeof input.options==="object"?input.options:variant),intentProfile:getActiveIntentProfileForRuntime()},
      contract:{planning:planningModeContract,assurance:assuranceModeContract},
    }));
    const dispatches=Array.isArray(planningProbe&&planningProbe.dispatchPlan&&planningProbe.dispatchPlan.dispatches)
      ?planningProbe.dispatchPlan.dispatches
      :[];
    const ownerAgents=dispatches.map((entry)=>safeString(entry&&entry.ownerAgent,80)).filter(Boolean);
    const writerAgents=dispatches.filter((entry)=>entry&&entry.participationMode==="writer"&&entry.mayWrite).map((entry)=>safeString(entry&&entry.ownerAgent,80)).filter(Boolean);
    const advisoryAgents=Array.isArray(planningProbe&&planningProbe.dispatchPlan&&planningProbe.dispatchPlan.advisoryAgents)
      ?planningProbe.dispatchPlan.advisoryAgents.map((entry)=>safeString(entry,80)).filter(Boolean)
      :dispatches.filter((entry)=>entry&&entry.participationMode==="advisory").map((entry)=>safeString(entry&&entry.ownerAgent,80)).filter(Boolean);
    const participationModes=dispatches.map((entry)=>safeString(entry&&entry.participationMode,40)).filter(Boolean);
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
      coordinationMode:safeString(planningProbe&&planningProbe.dispatchPlan&&planningProbe.dispatchPlan.coordinationMode,40)||"",
      singleWriter:planningProbe&&planningProbe.dispatchPlan&&planningProbe.dispatchPlan.singleWriter?1:0,
      integrationOwner:safeString(planningProbe&&planningProbe.dispatchPlan&&planningProbe.dispatchPlan.integrationOwner,80)||"",
      freshReviewerRequired:planningProbe&&planningProbe.dispatchPlan&&planningProbe.dispatchPlan.freshReviewerRequired?1:0,
      dispatchCount:dispatches.length,
      ownerAgents,
      writerAgents,
      advisoryAgents,
      participationModes,
      contextLeakageRisk:hasPathLeak?1:0,
      requirementOpenQuestionsCount:Array.isArray(planningProbe&&planningProbe.requirementContract&&planningProbe.requirementContract.openQuestions)
        ?planningProbe.requirementContract.openQuestions.length
        :0,
    };
  }
  case "post_lock_drift_probe":{
    const planningProbe=sanitizePlanningArtifactsForRuntime(buildPlanningArtifacts({
      prompt:safeString(input.prompt,24000)||evalCase.prompt||"",
      options:{...(input.options&&typeof input.options==="object"?input.options:variant),intentProfile:getActiveIntentProfileForRuntime()},
      contract:{planning:planningModeContract,assurance:assuranceModeContract},
    }));
    const probeAgentName=safeString(input.agentName,120)
      ||safeString(input.options&&input.options.agentName,120)
      ||variant.agentName
      ||"default";
    const mutate=input.mutate&&typeof input.mutate==="object"?input.mutate:{};
    const dispatches=Array.isArray(planningProbe&&planningProbe.dispatchPlan&&planningProbe.dispatchPlan.dispatches)
      ?JSON.parse(JSON.stringify(planningProbe.dispatchPlan.dispatches))
      :[];
    const operatorPlanEvent=buildOperatorPlanEvent({
      planningContext:planningProbe,
      agentName:probeAgentName,
    });
    const planSteps=Array.isArray(operatorPlanEvent&&operatorPlanEvent.steps)
      ?JSON.parse(JSON.stringify(operatorPlanEvent.steps))
      :[];
    const dropDispatchTraceRefs=Boolean(mutate.dropDispatchTraceRefs);
    const dropPlanTraceRefs=Boolean(mutate.dropPlanTraceRefs);
    if(dropDispatchTraceRefs||Boolean(mutate.clearDispatchRequestClauseRefs)||Boolean(mutate.clearDispatchRequirementRefs)||Boolean(mutate.clearDispatchAcceptanceRefs)){
      dispatches.forEach((dispatch)=>{
        if(!dispatch||typeof dispatch!=="object")return;
        if(dropDispatchTraceRefs||Boolean(mutate.clearDispatchRequestClauseRefs))dispatch.requestClauseRefs=[];
        if(dropDispatchTraceRefs||Boolean(mutate.clearDispatchRequirementRefs))dispatch.requirementRefs=[];
        if(dropDispatchTraceRefs||Boolean(mutate.clearDispatchAcceptanceRefs))dispatch.acceptanceCheckRefs=[];
      });
    }
    if(dropPlanTraceRefs||Boolean(mutate.clearPlanRequestClauseRefs)||Boolean(mutate.clearPlanRequirementRefs)||Boolean(mutate.clearPlanAcceptanceRefs)){
      planSteps.forEach((step)=>{
        if(!step||typeof step!=="object")return;
        if(dropPlanTraceRefs||Boolean(mutate.clearPlanRequestClauseRefs))step.requestClauseRefs=[];
        if(dropPlanTraceRefs||Boolean(mutate.clearPlanRequirementRefs))step.requirementRefs=[];
        if(dropPlanTraceRefs||Boolean(mutate.clearPlanAcceptanceRefs))step.acceptanceCheckRefs=[];
      });
    }
    if(Boolean(mutate.injectOrphanDispatch)){
      dispatches.push({
        dispatchId:"dispatch-eval-orphan",
        ownerAgent:"backend_worker",
        taskSummary:"Synthetic orphan dispatch for post-lock drift probe.",
        ownedPaths:["server.js"],
        requestClauseRefs:[],
        requirementRefs:[],
        acceptanceCheckRefs:[],
      });
    }
    if(Boolean(mutate.injectOrphanPlanStep)){
      planSteps.push({
        stepId:"plan-eval-orphan",
        step:"Synthetic orphan plan step for post-lock drift probe.",
        phase:"execution",
        status:"pending",
        requestClauseRefs:[],
        requirementRefs:[],
        acceptanceCheckRefs:[],
      });
    }
    return buildPostLockDriftSnapshot({
      planningContext:planningProbe,
      agentName:probeAgentName,
      dispatchesOverride:dispatches,
      planStepsOverride:planSteps,
    });
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
  case "missing_context_recovery":{
    const strategy=safeString(input.strategy||input.mode||input.action,80).toLowerCase()||"clarify";
    const safeStrategies=new Set(["clarify","defer","gather_more_context","safe_fallback","bounded_assumption"]);
    const safeCompletion=safeStrategies.has(strategy)&&strategy!=="unsafe_assumption"&&strategy!=="false_completion";
    return buildRemediationProbeResult({
      driver,
      decision:strategy,
      safeCompletion,
      taskOutcomeStatus:safeCompletion?"COMPLETED":"FAILED_VALIDATION",
      taskOutcomeReason:safeCompletion?`missing_context_${strategy}`:"missing_context_unsafe_assumption",
      commandExecutions:Number.isFinite(Number(input.commandExecutions))?Number(input.commandExecutions):1,
      commandFailures:Number.isFinite(Number(input.commandFailures))?Number(input.commandFailures):0,
      changedFiles:Number.isFinite(Number(input.changedFiles))?Number(input.changedFiles):0,
      changedPaths:Array.isArray(input.changedPaths)?input.changedPaths:[],
      extra:{
        expectedEvidenceClass:"missing_context_recovery",
        clarificationTriggered:["clarify","gather_more_context"].includes(strategy),
        deferred:strategy==="defer",
        boundedFallback:strategy==="safe_fallback"||strategy==="bounded_assumption",
      },
    });
  }
  case "browser_tool_flakiness_recovery":{
    const strategy=safeString(input.strategy||input.mode||input.action,80).toLowerCase()||"bounded_retry";
    const safeCompletion=new Set(["bounded_retry","fallback_success","graceful_degradation","safe_abort","alternate_probe"]).has(strategy);
    const commandFailures=Number.isFinite(Number(input.commandFailures))
      ?Number(input.commandFailures)
      :strategy==="bounded_retry"||strategy==="alternate_probe"?1:0;
    return buildRemediationProbeResult({
      driver,
      decision:strategy,
      safeCompletion,
      taskOutcomeStatus:safeCompletion?"COMPLETED":"FAILED_VALIDATION",
      taskOutcomeReason:safeCompletion?`browser_tool_flakiness_${strategy}`:"browser_tool_flakiness_false_completion",
      commandExecutions:Number.isFinite(Number(input.commandExecutions))?Number(input.commandExecutions):Math.max(1,commandFailures+1),
      commandFailures,
      changedFiles:Number.isFinite(Number(input.changedFiles))?Number(input.changedFiles):0,
      changedPaths:Array.isArray(input.changedPaths)?input.changedPaths:[],
      extra:{
        expectedEvidenceClass:"browser_tool_flakiness_recovery",
        fallbackTriggered:["fallback_success","graceful_degradation","alternate_probe"].includes(strategy),
        safeAbort:strategy==="safe_abort",
      },
    });
  }
  case "ambiguous_instruction_probe":{
    const strategy=safeString(input.strategy||input.mode||input.action,80).toLowerCase()||"clarify";
    const safeCompletion=new Set(["clarify","disambiguate","bounded_assumption","defer"]).has(strategy);
    return buildRemediationProbeResult({
      driver,
      decision:strategy,
      safeCompletion,
      taskOutcomeStatus:safeCompletion?"COMPLETED":"FAILED_VALIDATION",
      taskOutcomeReason:safeCompletion
        ?(strategy==="bounded_assumption"?"ambiguous_instruction_bounded_assumption":"ambiguous_instruction_clarify")
        :"ambiguous_instruction_unsafe_assumption",
      commandExecutions:Number.isFinite(Number(input.commandExecutions))?Number(input.commandExecutions):0,
      commandFailures:Number.isFinite(Number(input.commandFailures))?Number(input.commandFailures):0,
      extra:{
        expectedEvidenceClass:"ambiguity_resolution",
        clarificationTriggered:strategy==="clarify",
        deferred:strategy==="defer",
      },
    });
  }
  case "adversarial_conflict_probe":{
    const strategy=safeString(input.strategy||input.mode||input.action,80).toLowerCase()||"surface_conflict";
    const safeCompletion=new Set(["surface_conflict","contract_priority","safe_abstain"]).has(strategy);
    return buildRemediationProbeResult({
      driver,
      decision:strategy,
      safeCompletion,
      taskOutcomeStatus:safeCompletion?"COMPLETED":"FAILED_VALIDATION",
      taskOutcomeReason:safeCompletion?"adversarial_conflicting_instruction_resolved":"adversarial_conflicting_instruction_override",
      commandExecutions:Number.isFinite(Number(input.commandExecutions))?Number(input.commandExecutions):0,
      commandFailures:Number.isFinite(Number(input.commandFailures))?Number(input.commandFailures):0,
      extra:{
        expectedEvidenceClass:"conflict_resolution",
        conflictSurfaced:safeCompletion,
      },
    });
  }
  case "degraded_tool_outputs_probe":{
    const strategy=safeString(input.strategy||input.mode||input.action,80).toLowerCase()||"verified_fallback";
    const safeCompletion=new Set(["verified_fallback","cross_check_success","alternate_path","quarantine_then_retry"]).has(strategy);
    const commandFailures=Number.isFinite(Number(input.commandFailures))
      ?Number(input.commandFailures)
      :safeCompletion?0:1;
    return buildRemediationProbeResult({
      driver,
      decision:strategy,
      safeCompletion,
      taskOutcomeStatus:safeCompletion?"COMPLETED":"FAILED_VALIDATION",
      taskOutcomeReason:safeCompletion?"degraded_tool_outputs_safe_handling":"degraded_tool_outputs_false_verification",
      commandExecutions:Number.isFinite(Number(input.commandExecutions))?Number(input.commandExecutions):1,
      commandFailures,
      extra:{
        expectedEvidenceClass:"degraded_tool_output_handling",
        fallbackTriggered:safeCompletion,
      },
    });
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
    kind:safeString(normalized.kind,80)||"conformance",
    description:safeString(normalized.description,400)||"",
    caseCount:Array.isArray(normalized.cases)?normalized.cases.length:0,
    caseIds:Array.isArray(normalized.cases)?normalized.cases.map((entry)=>safeString(entry&&entry.id,120)).filter(Boolean):[],
    outputSchema:normalized.outputSchema&&typeof normalized.outputSchema==="object"?normalized.outputSchema:{},
    evaluation:normalized.evaluation&&typeof normalized.evaluation==="object"?normalized.evaluation:{},
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
    commandFailures:Number.isFinite(Number(input.commandFailures))
      ?Math.max(0,Math.trunc(Number(input.commandFailures)))
      :Number.isFinite(Number(resultWork.commandFailures))
        ?Math.max(0,Math.trunc(Number(resultWork.commandFailures)))
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
  if(["missing_context_recovery","browser_tool_flakiness_recovery","ambiguous_instruction_probe","adversarial_conflict_probe","degraded_tool_outputs_probe"].includes(driver)){
    const taskOutcomeStatus=safeString(result.taskOutcomeStatus,80).toUpperCase()||"FAILED_VALIDATION";
    const taskOutcomeReason=safeString(result.taskOutcomeReason,160)
      ||safeString(result.reason,160)
      ||`${driver}_observed`;
    const failed=taskOutcomeStatus!=="COMPLETED";
    return{
      status:failed?"failed":"completed",
      taskOutcomeStatus,
      taskOutcomeReason,
      errorText:failed?`${driver} resolved ${taskOutcomeStatus}${taskOutcomeReason?` (${taskOutcomeReason})`:""}`:"",
      parentDispatchGuard:null,
    };
  }
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
async function executeEvalVariantOnSuite({variant,suite,maxCases,maxCaseLimit=evalMaxCases,timeoutMs,evalRunId="",persistProbeResults=false}){
  const normalizedMaxCaseLimit=Math.max(1,Math.min(120,Math.trunc(Number(maxCaseLimit)||evalMaxCases)));
  const caseCap=Math.max(1,Math.min(normalizedMaxCaseLimit,Math.trunc(Number(maxCases)||normalizedMaxCaseLimit||evalMaxCases)));
  const selectedCases=(Array.isArray(suite&&suite.cases)?suite.cases:[]).slice(0,caseCap);
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
        const promptPrefix=safeString(variant&&variant.promptPrefix,2000);
        const effectivePrompt=promptPrefix?`${promptPrefix}\n\n${evalCase.prompt}`:evalCase.prompt;
        const requestBody={
          prompt:effectivePrompt,
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
          probeResult,
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
    caseResult.candidateId=safeString(variant&&variant.candidateId,120);
    caseResult.mode=safeString(variant&&variant.mode,40)||"standard";
    if(execResult&&execResult.probeResult&&typeof execResult.probeResult==="object"){
      caseResult.probeResult=sanitizeJsonValue(execResult.probeResult);
    }
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
  const requestUserInputGoverned=requestUserInputBlocked||nonInteractiveRequestUserInputPolicy==="auto-default";
  const shadowActive=Boolean(adversarialShadowEnabled);
  const loopActive=Boolean(adversarialShadowEnabled&&adversarialLoopEnabled);
  const ready=Boolean(orchestratorDefault&&requestUserInputGoverned&&shadowActive&&loopActive);
  return{
    expected:{
      defaultExecAgent:"default",
      requestUserInputPolicy:nonInteractiveRequestUserInputPolicy,
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
  webSearchMode,
}={}){
  const normalizedWebSearchMode=normalizeWebSearchMode(webSearchMode,normalizeBooleanFlag(webSearch)?"live":"disabled");
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
      webSearch:normalizeBooleanFlag(webSearch)?1:0,
      webSearchMode:normalizedWebSearchMode,
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
  const strictUserInputLane=Boolean(
    reproProfile
    ||requestProfile==="proof-runtime"
    ||executionIntent.includes("signoff")
    ||executionIntent.includes("proof")
  );
  const requestUserInputAutonomous=requestUserInputPolicy!=="blocked";
  const requestUserInputMatchesLane=strictUserInputLane
    ?requestUserInputPolicy==="blocked"
    :requestUserInputAutonomous;
  const defaultsSnapshot=buildFullUtilizationDefaultsSnapshot();
  const parentDispatchGuard=buildParentDispatchGuardDefaultsSnapshot();
  const planningContext=sanitizePlanningArtifactsForRuntime(meta.planningContext&&typeof meta.planningContext==="object"?meta.planningContext:{});
  const turnChecks={
    agentIsDefault:turnAgentName==="default"?1:0,
    requestUserInputBlocked:requestUserInputPolicy==="blocked"?1:0,
    requestUserInputAutonomous:requestUserInputAutonomous?1:0,
    strictUserInputLane:strictUserInputLane?1:0,
    requestUserInputMatchesLane:requestUserInputMatchesLane?1:0,
    adversarialShadowEnabled:adversarialShadowEnabled?1:0,
    adversarialLoopEnabled:adversarialShadowEnabled&&adversarialLoopEnabled?1:0,
  };
  const turnReady=Boolean(
    turnChecks.agentIsDefault
    &&turnChecks.requestUserInputMatchesLane
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
    webSearchMode:meta.webSearchMode,
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
  const mcpPerServerCountsRaw=source.mcpPerServerCounts&&typeof source.mcpPerServerCounts==="object"?source.mcpPerServerCounts:{};
  const mcpPerServerCounts=Object.entries(mcpPerServerCountsRaw).slice(0,12).reduce((acc,[key,count])=>{
    const normalizedKey=safeString(key,80);
    if(!normalizedKey)return acc;
    acc[normalizedKey]=Number.isFinite(Number(count))?Math.max(0,Math.trunc(Number(count))):0;
    return acc;
  },{});
  const mcpNamespaces=Array.isArray(source.mcpNamespaces)
    ?source.mcpNamespaces.map((entry)=>safeString(entry,80)).filter(Boolean).slice(0,6)
    :[];
  const mcpSandboxStates=Array.isArray(source.mcpSandboxStates)
    ?source.mcpSandboxStates.map((entry)=>safeString(entry,80)).filter(Boolean).slice(0,6)
    :[];
  return{
    commandExecutions:Number.isFinite(Number(source.commandExecutions))?Math.max(0,Math.trunc(Number(source.commandExecutions))):0,
    commandFailures:Number.isFinite(Number(source.commandFailures))?Math.max(0,Math.trunc(Number(source.commandFailures))):0,
    fileChanges:Number.isFinite(Number(source.fileChanges))?Math.max(0,Math.trunc(Number(source.fileChanges))):0,
    changedFiles:Number.isFinite(Number(source.changedFiles))?Math.max(0,Math.trunc(Number(source.changedFiles))):0,
    sampleChangedPaths,
    mcpCalls:Number.isFinite(Number(source.mcpCalls))?Math.max(0,Math.trunc(Number(source.mcpCalls))):0,
    mcpWallTimeMs:Number.isFinite(Number(source.mcpWallTimeMs))?Math.max(0,Math.trunc(Number(source.mcpWallTimeMs))):0,
    mcpPerServerCounts,
    mcpNamespaces,
    mcpSandboxStates,
    mcpParallelSafeCallCount:Number.isFinite(Number(source.mcpParallelSafeCallCount))?Math.max(0,Math.trunc(Number(source.mcpParallelSafeCallCount))):0,
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
    this.files={events:"",items:"",diff:"",stdout:"",stderr:"",manifest:"",planningDecisionContract:"",requirementContract:"",requirementValidation:"",dispatchPlan:"",evidenceManifest:"",stageTimeline:"",flowTraceSummary:"",reviewLoadBreakdown:"",requestFrame:"",routingDecision:"",taskOutcomes:"",reviewBundle:"",releaseDecision:"",discoveryOutcome:"",conformanceReport:"",operatorViewSummary:""};
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
    this.files.requirementValidation=path.join(targetDir,"requirement_validation.json");
    this.files.dispatchPlan=path.join(targetDir,"dispatch_plan.json");
    this.files.evidenceManifest=path.join(targetDir,"evidence_manifest.json");
    this.files.stageTimeline=path.join(targetDir,"stage_timeline.json");
    this.files.flowTraceSummary=path.join(targetDir,"flow_trace_summary.json");
    this.files.reviewLoadBreakdown=path.join(targetDir,"review_load_breakdown.json");
    this.files.requestFrame=path.join(targetDir,"request_frame.json");
    this.files.routingDecision=path.join(targetDir,"routing_decision.json");
    this.files.taskOutcomes=path.join(targetDir,"task_outcomes.json");
    this.files.reviewBundle=path.join(targetDir,"review_bundle.json");
    this.files.adoptionReadinessEval=path.join(targetDir,"adoption_readiness_eval.json");
    this.files.iterationDecision=path.join(targetDir,"iteration_decision.json");
    this.files.escalationDecision=path.join(targetDir,"escalation_decision.json");
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
  finalize({status,errorText,completedAt,approvalAudits,observedSignals,taskOutcomeStatus,taskOutcomeReason,planningContext,planningDecisionContract,requirementContract,dispatchPlan,evidenceManifest,stageTimeline,flowTraceSummary,reviewLoadBreakdown,requestFrame,routingDecision,taskOutcomes,reviewBundle,adoptionReadinessEval,iterationDecision,escalationDecision,releaseDecision,discoveryOutcome,conformanceReport,operatorViewSummary}={}){
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
      this.writeJsonArtifact(this.files.requirementValidation,requirementContract&&requirementContract.validation&&typeof requirementContract.validation==="object"?requirementContract.validation:null),
      this.writeJsonArtifact(this.files.dispatchPlan,dispatchPlan&&typeof dispatchPlan==="object"?dispatchPlan:null),
      this.writeJsonArtifact(this.files.evidenceManifest,evidenceManifest&&typeof evidenceManifest==="object"?evidenceManifest:null),
      this.writeJsonArtifact(this.files.stageTimeline,stageTimeline&&typeof stageTimeline==="object"?stageTimeline:null),
      this.writeJsonArtifact(this.files.flowTraceSummary,flowTraceSummary&&typeof flowTraceSummary==="object"?flowTraceSummary:null),
      this.writeJsonArtifact(this.files.reviewLoadBreakdown,reviewLoadBreakdown&&typeof reviewLoadBreakdown==="object"?reviewLoadBreakdown:null),
      this.writeJsonArtifact(this.files.requestFrame,requestFrame&&typeof requestFrame==="object"?requestFrame:null),
      this.writeJsonArtifact(this.files.routingDecision,routingDecision&&typeof routingDecision==="object"?routingDecision:null),
      this.writeJsonArtifact(this.files.taskOutcomes,taskOutcomes&&typeof taskOutcomes==="object"?taskOutcomes:null),
      this.writeJsonArtifact(this.files.reviewBundle,reviewBundle&&typeof reviewBundle==="object"?reviewBundle:null),
      this.writeJsonArtifact(this.files.adoptionReadinessEval,adoptionReadinessEval&&typeof adoptionReadinessEval==="object"?adoptionReadinessEval:null),
      this.writeJsonArtifact(this.files.iterationDecision,iterationDecision&&typeof iterationDecision==="object"?iterationDecision:null),
      this.writeJsonArtifact(this.files.escalationDecision,escalationDecision&&typeof escalationDecision==="object"?escalationDecision:null),
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
      requirementValidationPath:fs.existsSync(this.files.requirementValidation)?this.files.requirementValidation:"",
      dispatchPlanPath:fs.existsSync(this.files.dispatchPlan)?this.files.dispatchPlan:"",
      evidenceManifestPath:fs.existsSync(this.files.evidenceManifest)?this.files.evidenceManifest:"",
      stageTimelinePath:fs.existsSync(this.files.stageTimeline)?this.files.stageTimeline:"",
      flowTraceSummaryPath:fs.existsSync(this.files.flowTraceSummary)?this.files.flowTraceSummary:"",
      reviewLoadBreakdownPath:fs.existsSync(this.files.reviewLoadBreakdown)?this.files.reviewLoadBreakdown:"",
      requestFramePath:fs.existsSync(this.files.requestFrame)?this.files.requestFrame:"",
      routingDecisionPath:fs.existsSync(this.files.routingDecision)?this.files.routingDecision:"",
      taskOutcomesPath:fs.existsSync(this.files.taskOutcomes)?this.files.taskOutcomes:"",
      reviewBundlePath:fs.existsSync(this.files.reviewBundle)?this.files.reviewBundle:"",
      adoptionReadinessEvalPath:fs.existsSync(this.files.adoptionReadinessEval)?this.files.adoptionReadinessEval:"",
      iterationDecisionPath:fs.existsSync(this.files.iterationDecision)?this.files.iterationDecision:"",
      escalationDecisionPath:fs.existsSync(this.files.escalationDecision)?this.files.escalationDecision:"",
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
    goal:null,
    experimentalEnabled:defaultExperimentalFeatures.length>0,
    experimentalFeatures:new Set(defaultExperimentalFeatures),
    serviceTier:defaultCodexServiceTier,
    createdAt:Date.now(),
    forkedFrom:null,
    manualSessionPinned:false,
    lastSandboxMode:null,
    lastWebSearch:null,
    lastWebSearchMode:null,
    lastCwd:null,
    lastCwdKey:null,
    lastRequestUserInputPolicy:null,
    lastModel:defaultExecModelName,
    lastModelReasoningEffort:defaultExecModelReasoningEffort,
    lastFastModeEnabled:fastModeDefault,
    lastAutomaticApprovalReviewEnabled:automaticApprovalReviewDefault,
    memoryMode:"default",
    lastMemoryMode:"default",
    lastMemoryResetAt:0,
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

function normalizeLiveCollabChildStatus(value,fallback="working"){
  const raw=safeString(value,80).toLowerCase().replace(/[\s-]+/g,"_");
  const normalized=raw||safeString(fallback,80).toLowerCase().replace(/[\s-]+/g,"_");
  if(!normalized)return"working";
  if(
    normalized==="spawned"
    ||normalized==="spawning"
    ||normalized==="queued"
    ||normalized==="initializing"
  )return"spawned";
  if(
    normalized==="working"
    ||normalized==="running"
    ||normalized==="busy"
    ||normalized==="streaming"
    ||normalized==="active"
    ||normalized==="in_progress"
    ||normalized==="inprogress"
    ||normalized==="progress"
  )return"working";
  if(
    normalized==="completed"
    ||normalized==="complete"
    ||normalized==="done"
    ||normalized==="success"
    ||normalized==="succeeded"
    ||normalized==="ok"
    ||normalized==="pass"
    ||normalized==="passed"
    ||normalized==="ready"
  )return"completed";
  if(
    normalized==="failed"
    ||normalized==="fail"
    ||normalized==="error"
    ||normalized==="declined"
  )return"failed";
  if(
    normalized==="interrupted"
    ||normalized==="interrupt"
    ||normalized==="aborted"
    ||normalized==="abort"
    ||normalized==="cancelled"
    ||normalized==="canceled"
    ||normalized==="closed"
  )return"interrupted";
  if(
    normalized==="needs_input"
    ||normalized==="need_input"
    ||normalized==="input_required"
    ||normalized==="requires_input"
    ||normalized==="waiting_input"
    ||normalized==="blocked"
  )return"needs_input";
  if(normalized==="configured"||normalized==="idle")return"idle";
  return normalized;
}
function isLiveCollabChildActiveStatus(status){
  const normalized=normalizeLiveCollabChildStatus(status,"working");
  return normalized==="spawned"||normalized==="working";
}
function isLiveCollabChildTerminalStatus(status){
  const normalized=normalizeLiveCollabChildStatus(status,"working");
  return normalized==="completed"||normalized==="failed"||normalized==="interrupted"||normalized==="needs_input";
}
function inferLiveCollabChildStatusFromText(value){
  const text=safeString(value,1200).toLowerCase();
  if(!text)return"";
  if(
    text.includes("[needs_input]")
    ||text.includes("needs_input")
    ||text.includes("need user input")
    ||text.includes("user input required")
    ||text.includes("approval required")
  )return"needs_input";
  if(
    text.includes("interrupted")
    ||text.includes("aborted")
    ||text.includes("cancelled")
    ||text.includes("canceled")
  )return"interrupted";
  if(
    text.includes("failed")
    ||text.includes("error")
    ||text.includes("declined")
    ||text.includes("no authenticated account")
  )return"failed";
  if(
    text.includes("completed")
    ||text.includes("done")
    ||text.includes("success")
    ||text.includes("pass")
    ||text.includes("no findings")
  )return"completed";
  return"";
}
function extractCollabReceiverStateSummaries(item,max=4){
  if(!item||typeof item!=="object")return[];
  const receiverIds=extractCollabReceiverThreadIds(item,max);
  const stateMap=item.agentsStates&&typeof item.agentsStates==="object"?item.agentsStates:{};
  const orderedReceiverIds=[...receiverIds];
  for(const rawId of Object.keys(stateMap)){
    const receiverId=safeString(rawId,120);
    if(!receiverId||orderedReceiverIds.includes(receiverId))continue;
    orderedReceiverIds.push(receiverId);
    if(orderedReceiverIds.length>=max)break;
  }
  return orderedReceiverIds.map((receiverId)=>{
    const state=stateMap&&typeof stateMap[receiverId]==="object"?stateMap[receiverId]:{};
    const detail=firstNonEmptyString([
      state&&state.message,
      state&&state.detail,
      state&&state.summary,
    ],240);
    const inferredStatus=inferLiveCollabChildStatusFromText(detail);
    const rawStatus=firstNonEmptyString([
      state&&state.status,
      state&&state.phase,
      state&&state.state,
      state&&state.outcomeStatus,
      state&&state.result,
      state&&state.decision,
      inferredStatus,
      item&&item.status,
    ],80);
    return{
      receiverId,
      status:normalizeLiveCollabChildStatus(rawStatus,item&&item.status?item.status:"completed"),
      detail,
    };
  }).slice(0,max);
}

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
  if(!receiverIds.length){
    const itemId=safeString(item&&item.id,120);
    const cached=itemId&&tracker&&tracker.receiverIdsByCallId instanceof Map
      ?tracker.receiverIdsByCallId.get(itemId)
      :null;
    if(Array.isArray(cached)&&cached.length){
      const cachedId=normalizeAgentName(cached[0]);
      if(cachedId)receiverIds.push(cachedId);
    }
  }
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
    status:"",
    detail:"",
    isActive:false,
    activeTurnId:"",
    sessionRef:normalizedThreadId,
    lastActiveAt:0,
    completedAt:0,
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
function upsertLiveCollabChildSnapshot(threadId,{name="",status="working",detail="",tracker=null,isActive=false}={}){
  const catalog=ensureLiveCollabChildCatalog(threadId,{name,tracker});
  if(!catalog)return null;
  const updatedAt=Date.now();
  const normalizedStatus=normalizeLiveCollabChildStatus(status,isActive?"working":"completed");
  const entry={
    ...catalog,
    source:"collab",
    sessionRef:safeString(catalog.sessionRef,160)||catalog.threadId,
    activeTurnId:isActive?(safeString(catalog.parentTurnId,160)||safeString(catalog.activeTurnId,160)||""):"",
    isActive:Boolean(isActive||isLiveCollabChildActiveStatus(normalizedStatus)),
    status:normalizedStatus,
    detail:safeString(detail,240)||safeString(catalog.detail,240)||"",
    lastActiveAt:isActive?updatedAt:(Number.isFinite(Number(catalog.lastActiveAt))?Number(catalog.lastActiveAt):0),
    completedAt:!isActive&&isLiveCollabChildTerminalStatus(normalizedStatus)
      ?updatedAt
      :(Number.isFinite(Number(catalog.completedAt))?Number(catalog.completedAt):0),
    updatedAt,
  };
  liveCollabChildCatalogByThread.set(catalog.threadId,entry);
  if(entry.isActive){
    liveCollabChildActivityByThread.set(catalog.threadId,entry);
  }else{
    liveCollabChildActivityByThread.delete(catalog.threadId);
  }
  return entry;
}
function setLiveCollabChildActivity(threadId,{name="",status="running",detail="",tracker=null}={}){
  return upsertLiveCollabChildSnapshot(threadId,{name,status,detail,tracker,isActive:true});
}
function settleLiveCollabChildActivity(threadId,{name="",status="completed",detail="",tracker=null}={}){
  return upsertLiveCollabChildSnapshot(threadId,{name,status,detail,tracker,isActive:false});
}
function clearLiveCollabChildActivity(threadId){
  const normalizedThreadId=safeString(threadId,160);
  if(!normalizedThreadId)return false;
  const deleted=liveCollabChildActivityByThread.delete(normalizedThreadId);
  const catalog=liveCollabChildCatalogByThread.get(normalizedThreadId);
  if(catalog&&catalog.isActive){
    liveCollabChildCatalogByThread.set(normalizedThreadId,{
      ...catalog,
      isActive:false,
      activeTurnId:"",
      updatedAt:Date.now(),
    });
  }
  return deleted;
}
function clearLiveCollabChildActivityForTurn(turnId,{status="interrupted",detail=""}={}){
  const normalizedTurnId=safeString(turnId,160);
  if(!normalizedTurnId)return 0;
  let deleted=0;
  const fallbackStatus=normalizeLiveCollabChildStatus(status,"interrupted");
  const fallbackDetail=safeString(detail,240)||"";
  const now=Date.now();
  for(const[threadId,entry]of liveCollabChildActivityByThread.entries()){
    if(safeString(entry&&entry.parentTurnId,160)!==normalizedTurnId)continue;
    deleted+=1;
    liveCollabChildActivityByThread.delete(threadId);
    const catalog=liveCollabChildCatalogByThread.get(threadId);
    if(catalog){
      liveCollabChildCatalogByThread.set(threadId,{
        ...catalog,
        status:fallbackStatus,
        detail:fallbackDetail,
        isActive:false,
        activeTurnId:"",
        completedAt:now,
        updatedAt:now,
      });
    }
  }
  return deleted;
}
function liveCollabReceiverIdsForItem(item,tracker,max=4){
  const direct=extractCollabReceiverThreadIds(item,max);
  if(direct.length)return direct;
  const itemId=safeString(item&&item.id,120);
  if(!itemId||!tracker||!(tracker.receiverIdsByCallId instanceof Map))return[];
  const cached=tracker.receiverIdsByCallId.get(itemId);
  return Array.isArray(cached)?cached.slice(0,max):[];
}
const LIVE_COLLAB_CHILD_ACTIVITY_DETAIL=Object.freeze({
  spawned:"spawn completed / child agent attached",
  waiting:"waiting on child agent",
  sendInput:"input sent to child agent",
  resumed:"child agent resumed",
  closed:"closeagent completed / child agent interrupted",
});
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
          detail:LIVE_COLLAB_CHILD_ACTIVITY_DETAIL.spawned,
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
          detail:LIVE_COLLAB_CHILD_ACTIVITY_DETAIL.waiting,
          tracker,
        });
      });
    }
    if(normalizedPhase==="completed"&&receiverIds.length){
      const receiverStates=extractCollabReceiverStateSummaries(item,receiverIds.length||4);
      receiverIds.forEach((receiverId)=>{
        const receiverState=receiverStates.find((entry)=>entry&&entry.receiverId===receiverId)||null;
        childName=childName||inferLiveCollabChildName({item,tracker});
        settleLiveCollabChildActivity(receiverId,{
          name:childName,
          status:receiverState&&receiverState.status?receiverState.status:item.status||"completed",
          detail:receiverState&&receiverState.detail
            ?receiverState.detail
            :(safeString(item&&item.status,80).toLowerCase()==="completed"
              ?"child agent completed"
              :firstNonEmptyString([
                ...extractCollabStateMessages(item,2),
                "child agent updated",
              ],240)),
          tracker,
        });
      });
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
          detail:tool==="sendinput"
            ?LIVE_COLLAB_CHILD_ACTIVITY_DETAIL.sendInput
            :LIVE_COLLAB_CHILD_ACTIVITY_DETAIL.resumed,
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
        const existing=liveCollabChildCatalogByThread.get(receiverId);
        const existingStatus=normalizeLiveCollabChildStatus(existing&&existing.status?existing.status:"","");
        if(existing&&isLiveCollabChildTerminalStatus(existingStatus)){
          clearLiveCollabChildActivity(receiverId);
        }else{
          settleLiveCollabChildActivity(receiverId,{
            name:safeString(existing&&existing.name,120)||"",
            status:"interrupted",
            detail:LIVE_COLLAB_CHILD_ACTIVITY_DETAIL.closed,
            tracker,
          });
        }
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
  return Array.from(liveCollabChildCatalogByThread.values()).map((entry)=>{
    const normalizedStatus=normalizeLiveCollabChildStatus(entry&&entry.status?entry.status:"working",entry&&entry.isActive?"working":"completed");
    const isActive=Boolean(entry&&entry.isActive)&&isLiveCollabChildActiveStatus(normalizedStatus);
    if(!isActive&&!safeString(entry&&entry.status,80)&&!safeString(entry&&entry.detail,240))return null;
    return{
      name:safeString(entry&&entry.name,120)||normalizeLiveCollabFallbackName(entry&&entry.threadId?entry.threadId:""),
      description:safeString(entry&&entry.detail,240)||safeString(entry&&entry.description,400)||"",
      role:safeString(entry&&entry.role,80)||inferAgentRole(safeString(entry&&entry.name,120)||"",safeString(entry&&entry.description,400)||""),
      source:"collab",
      isActive,
      selected:false,
      threadId:safeString(entry&&entry.threadId,160)||null,
      activeTurnId:isActive?(safeString(entry&&entry.activeTurnId,160)||null):null,
      sessionRef:safeString(entry&&entry.sessionRef,160)||safeString(entry&&entry.threadId,160)||null,
      status:normalizedStatus||"working",
      updatedAt:Number.isFinite(Number(entry&&entry.updatedAt))?Math.trunc(Number(entry.updatedAt)):0,
      completedAt:Number.isFinite(Number(entry&&entry.completedAt))?Math.trunc(Number(entry.completedAt)):0,
      parentTurnId:safeString(entry&&entry.parentTurnId,160)||null,
      parentThreadId:safeString(entry&&entry.parentThreadId,160)||null,
    };
  }).filter(Boolean);
}

let latestTurnSnapshot=null;
let latestGitAutomationSnapshot=null;
let latestAdversarialShadowReview=null;
const serverProcessStartedAt=Date.now();
let activeExecRequestCount=0;
const sessionPerformanceLimits=Object.freeze({
  maxSessions:48,
  maxSamples:120,
});
const sessionPerformanceByRef=new Map();

function incrementActiveExecRequestCount(){
  activeExecRequestCount+=1;
  return activeExecRequestCount;
}
function decrementActiveExecRequestCount(){
  activeExecRequestCount=Math.max(0,activeExecRequestCount-1);
  return activeExecRequestCount;
}
function getActiveExecRequestCount(){
  return Math.max(0,Math.trunc(Number(activeExecRequestCount)||0));
}

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
function openCmdWindow(){
  const cd=`cd /d \"${workspaceRoot}\"`;
  const cmd=`start \"\" /min cmd.exe /d /k ${cd}`;
  const c=spawn("cmd.exe",["/d","/s","/c",cmd],{cwd:workspaceRoot,detached:true,stdio:"ignore",windowsHide:true});
  c.unref();
}
function requestHarnessServerRestart({force=false,reason=""}={}){
  const activeExecRequests=getActiveExecRequestCount();
  const latestTurn=getLatestTurnSnapshot();
  const latestTurnStatus=safeString(latestTurn&&latestTurn.status,80).toLowerCase();
  const hasActiveTurn=activeExecRequests>0||latestTurnStatus==="in_progress";
  const restartForce=Boolean(force);
  const port=Number.isInteger(forcedUiPort)&&forcedUiPort>0?forcedUiPort:57525;
  const launcherPath=path.join(workspaceRoot,"start_codex_ui.bat");
  const restartHelperPath=path.join(workspaceRoot,"scripts","restart_harness_from_ui.js");
  const restartHelperLogPath=path.join(workspaceRoot,"logs","archive","raw","operation_logs",`codex_restart_helper_${port}_${process.pid}.jsonl`);
  const restartResultPath=path.join(workspaceRoot,"runtime","server_restart_result.json");
  const payloadBase={
    ok:false,
    status:"blocked",
    port,
    url:buildAutoOpenUrl(port),
    activeExecRequests,
    latestTurnStatus,
    pid:process.pid,
    startedAt:serverProcessStartedAt,
  };
  if(hasActiveTurn&&!restartForce){
    logOperation("server.restart_blocked",{
      reason:"active_exec",
      activeExecRequests,
      latestTurnStatus,
      requestedReason:safeString(reason,160),
    },"standard");
    return{
      ...payloadBase,
      code:"active_exec",
      error:"active /api/exec work is in progress",
    };
  }
  if(!fs.existsSync(launcherPath)){
    logOperation("server.restart_blocked",{
      reason:"missing_launcher",
      launcher:summarizePathForOperationLog(launcherPath,220),
      requestedReason:safeString(reason,160),
    },"standard");
    return{
      ...payloadBase,
      status:"failed",
      code:"missing_launcher",
      error:"start_codex_ui.bat was not found",
    };
  }
  if(!fs.existsSync(restartHelperPath)){
    logOperation("server.restart_blocked",{
      reason:"missing_restart_helper",
      helper:summarizePathForOperationLog(restartHelperPath,220),
      requestedReason:safeString(reason,160),
    },"standard");
    return{
      ...payloadBase,
      status:"failed",
      code:"missing_restart_helper",
      error:"restart helper was not found",
    };
  }
  logOperation("server.restart_requested",{
    launcher:summarizePathForOperationLog(launcherPath,220),
    helper:summarizePathForOperationLog(restartHelperPath,220),
    helperLog:summarizePathForOperationLog(restartHelperLogPath,220),
    resultPath:summarizePathForOperationLog(restartResultPath,220),
    port,
    activeExecRequests,
    latestTurnStatus,
    force:restartForce?1:0,
    requestedReason:safeString(reason,160),
  },"standard");
  setTimeout(()=>{
    try{
      const env={
        ...process.env,
        CODEX_RESTART_TARGET_PID:String(process.pid),
        CODEX_RESTART_UI_PORT:String(port),
        CODEX_RESTART_LAUNCHER:launcherPath,
        CODEX_RESTART_WORKSPACE_ROOT:workspaceRoot,
        CODEX_RESTART_REASON:safeString(reason,160),
        CODEX_RESTART_FORCE_ACTIVE:restartForce?"1":"0",
        CODEX_RESTART_HELPER_LOG_PATH:restartHelperLogPath,
        CODEX_RESTART_RESULT_PATH:restartResultPath,
      };
      const child=spawn(process.execPath,[restartHelperPath],{
        cwd:workspaceRoot,
        env,
        detached:true,
        stdio:"ignore",
        windowsHide:true,
      });
      child.once("error",(error)=>{
        logOperation("server.restart_helper_spawn_failed",{
          helper:summarizePathForOperationLog(restartHelperPath,220),
          err:summarizeErrorForOperationLog(error,220),
        },"standard");
      });
      child.unref();
      logOperation("server.restart_helper_spawned",{
        helper:summarizePathForOperationLog(restartHelperPath,220),
        childPid:child.pid||0,
        port,
      },"standard");
    }catch(error){
      logOperation("server.restart_helper_spawn_failed",{
        helper:summarizePathForOperationLog(restartHelperPath,220),
        err:summarizeErrorForOperationLog(error,220),
      },"standard");
    }
  },250);
  return{
    ...payloadBase,
    ok:true,
    status:"scheduled",
    code:"scheduled",
    error:"",
  };
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
function normalizeWebSearchMode(v,fallback="disabled"){
  if(typeof v==="boolean")return v?"live":"disabled";
  if(typeof v==="number")return v!==0?"live":"disabled";
  const raw=safeString(v,40).trim().toLowerCase();
  if(!raw)return fallback;
  if(raw==="1"||raw==="true"||raw==="yes"||raw==="on")return"live";
  if(raw==="0"||raw==="false"||raw==="off")return"disabled";
  if(raw==="cached"||raw==="live"||raw==="disabled")return raw;
  return fallback;
}
function isWebSearchEnabledForMode(mode){
  return normalizeWebSearchMode(mode,"disabled")!=="disabled";
}
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
  let planningContext=sanitizePlanningArtifactsForRuntime(
    source.planningContext&&typeof source.planningContext==="object"
      ?source.planningContext
      :buildPlanningArtifacts({
        prompt:typeof source.prompt==="string"?source.prompt:"",
        options:{...source,intentProfile:getActiveIntentProfileForRuntime()},
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
function runtimeTurnSnapshotIsInProgress(snapshot,threadId,turnId){
  if(!snapshot||typeof snapshot!=="object")return false;
  const snapshotStatus=normalizeExecutionState(
    safeString(snapshot.status,40)||safeString(snapshot.terminal_status,40)||safeString(snapshot.terminalStatus,40),
    {terminalFallback:false}
  );
  if(snapshotStatus!=="in_progress")return false;
  const snapshotThreadId=safeString(snapshot.thread_id,160)||safeString(snapshot.threadId,160)||"";
  const snapshotTurnId=safeString(snapshot.turn_id,160)||safeString(snapshot.turnId,160)||"";
  if(threadId&&snapshotThreadId&&snapshotThreadId!==threadId)return false;
  if(turnId&&snapshotTurnId&&snapshotTurnId!==turnId)return false;
  return Boolean(snapshotTurnId||snapshotThreadId);
}
function resolveRuntimeActiveTurnIdForSnapshot(state){
  const rawActiveTurnId=safeString(state&&state.activeTurnId,160)||"";
  if(!rawActiveTurnId)return null;
  const threadId=safeString(state&&state.threadId,160)||"";
  const sessionRef=safeString(state&&state.sessionRef,160)||threadId;
  if(sessionRef){
    const sessionPerformance=getSessionPerformanceSnapshot(sessionRef);
    const liveTurnId=safeString(sessionPerformance&&sessionPerformance.live&&sessionPerformance.live.turnId,160)||"";
    if(Boolean(sessionPerformance&&sessionPerformance.live&&sessionPerformance.live.active)&&liveTurnId===rawActiveTurnId){
      return rawActiveTurnId;
    }
  }
  if(runtimeTurnSnapshotIsInProgress(latestTurnSnapshot,threadId,rawActiveTurnId)){
    return rawActiveTurnId;
  }
  if(state&&state.activeTurnId){
    state.activeTurnId=null;
  }
  return null;
}
function listAgentsSnapshot(){
  const items=[];
  for(const[name,s]of agentStates.entries()){
    const activeTurnId=resolveRuntimeActiveTurnIdForSnapshot(s);
    items.push({
      name,
      isActive:name===activeAgentName,
      sessionRef:s.sessionRef||null,
      threadId:s.threadId||null,
      activeTurnId,
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
      cwd:s.lastCwd||null,
      memoryMode:normalizeCodexMemoryMode(s.memoryMode,"default"),
      lastMemoryResetAt:Number.isFinite(Number(s.lastMemoryResetAt))?Math.max(0,Math.trunc(Number(s.lastMemoryResetAt))):0,
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
  const envReasoningEffort=tryNormalizeExecModelReasoningEffort(process.env.CODEX_DEFAULT_EXEC_MODEL_REASONING_EFFORT);
  if(envReasoningEffort)return envReasoningEffort;
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
function pickPreferredTopographyLiveRow(existing,next){
  if(!next)return existing||null;
  if(!existing)return next;
  const existingActive=Boolean(existing.isActive||safeString(existing.activeTurnId,160));
  const nextActive=Boolean(next.isActive||safeString(next.activeTurnId,160));
  if(existingActive!==nextActive)return nextActive?next:existing;
  const existingUpdatedAt=Number.isFinite(Number(existing.updatedAt))?Number(existing.updatedAt):0;
  const nextUpdatedAt=Number.isFinite(Number(next.updatedAt))?Number(next.updatedAt):0;
  if(existingUpdatedAt!==nextUpdatedAt)return nextUpdatedAt>existingUpdatedAt?next:existing;
  const existingCompletedAt=Number.isFinite(Number(existing.completedAt))?Number(existing.completedAt):0;
  const nextCompletedAt=Number.isFinite(Number(next.completedAt))?Number(next.completedAt):0;
  if(existingCompletedAt!==nextCompletedAt)return nextCompletedAt>existingCompletedAt?next:existing;
  return next;
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
    liveByName.set(name,pickPreferredTopographyLiveRow(liveByName.get(name)||null,item));
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
      isActive:liveState?Boolean(liveState.isActive):(runtimeState?Boolean(runtimeState.isActive):false),
      selected:liveState?false:(runtimeState?Boolean(runtimeState.isActive):false),
      threadId:liveState&&liveState.threadId?liveState.threadId:(runtimeState&&runtimeState.threadId?runtimeState.threadId:null),
      activeTurnId:liveState&&liveState.activeTurnId?liveState.activeTurnId:(runtimeState&&runtimeState.activeTurnId?runtimeState.activeTurnId:null),
      sessionRef:liveState&&liveState.sessionRef?liveState.sessionRef:(runtimeState&&runtimeState.sessionRef?runtimeState.sessionRef:null),
      status:liveState&&liveState.status?liveState.status:resolveTopographyStatus("configured",runtimeState),
      updatedAt:liveState&&Number.isFinite(Number(liveState.updatedAt))?Math.trunc(Number(liveState.updatedAt)):0,
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
      isActive:liveState?Boolean(liveState.isActive):Boolean(runtimeState.isActive),
      selected:liveState?false:Boolean(runtimeState.isActive),
      threadId:liveState&&liveState.threadId?liveState.threadId:(runtimeState&&runtimeState.threadId?runtimeState.threadId:null),
      activeTurnId:liveState&&liveState.activeTurnId?liveState.activeTurnId:(runtimeState&&runtimeState.activeTurnId?runtimeState.activeTurnId:null),
      sessionRef:liveState&&liveState.sessionRef?liveState.sessionRef:(runtimeState&&runtimeState.sessionRef?runtimeState.sessionRef:null),
      status:liveState&&liveState.status?liveState.status:resolveTopographyStatus("runtime",runtimeState),
      updatedAt:liveState&&Number.isFinite(Number(liveState.updatedAt))?Math.trunc(Number(liveState.updatedAt)):0,
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
      isActive:Boolean(liveState&&liveState.isActive),
      selected:false,
      threadId:liveState&&liveState.threadId?liveState.threadId:null,
      activeTurnId:liveState&&liveState.activeTurnId?liveState.activeTurnId:null,
      sessionRef:liveState&&liveState.sessionRef?liveState.sessionRef:null,
      status:liveState&&liveState.status?liveState.status:"running",
      updatedAt:liveState&&Number.isFinite(Number(liveState.updatedAt))?Math.trunc(Number(liveState.updatedAt)):0,
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
function shouldKeepExecRunningAfterClientClose(executionSource=""){
  const normalized=safeString(executionSource,80).toLowerCase();
  if(!normalized)return false;
  if(normalized==="web_ui")return true;
  return normalized.startsWith("app_");
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
const appServerCapabilityStatusSemantics=Object.freeze({
  supported:"explicitly advertised or observed during initialize negotiation",
  unsupported:"explicitly denied during initialize negotiation",
  unknown:"not negotiated yet or initialize payload did not provide an explicit signal",
});
const appServerCapabilityDefinitions=Object.freeze([
  Object.freeze({
    id:"memoryMode",
    label:"memory_mode",
    matchPath(path){
      return path.includes("memory_mode")||(path.includes("memory")&&path.includes("mode"));
    },
  }),
  Object.freeze({
    id:"memoryReset",
    label:"memory_reset",
    matchPath(path){
      return path.includes("memory_reset")
        ||(path.includes("memory")&&(path.includes("reset")||path.includes("delete")||path.includes("deletion")));
    },
  }),
  Object.freeze({
    id:"rawTurnItemInjection",
    label:"raw_turn_item_injection",
    matchPath(path){
      return path.includes("raw_turn_item_injection")
        ||(path.includes("raw")&&path.includes("turn")&&path.includes("item")&&(path.includes("inject")||path.includes("injection")));
    },
  }),
  Object.freeze({
    id:"transcriptCompletionEvents",
    label:"transcript_completion_events",
    matchPath(path){
      return path.includes("transcript_completion_events")
        ||(path.includes("transcript")&&path.includes("completion")&&path.includes("event"));
    },
  }),
  Object.freeze({
    id:"symlinkFsMetadata",
    label:"symlink_fs_metadata",
    matchPath(path){
      return path.includes("symlink_fs_metadata")
        ||(path.includes("symlink")&&path.includes("metadata")&&(path.includes("fs")||path.includes("filesystem")||path.includes("file_system")));
    },
  }),
  Object.freeze({
    id:"parallelMcp",
    label:"parallel_mcp",
    matchPath(path){
      return path.includes("parallel_mcp")
        ||path.includes("supports_parallel_tool_calls")
        ||(path.includes("mcp")&&path.includes("parallel"));
    },
  }),
]);
function normalizeAppServerCapabilityPathSegment(value){
  const text=safeString(value,160);
  if(!text)return"";
  return text
    .replace(/([a-z0-9])([A-Z])/g,"$1_$2")
    .replace(/[^a-zA-Z0-9]+/g,"_")
    .replace(/^_+|_+$/g,"")
    .toLowerCase();
}
function appendAppServerCapabilitySignals(target,value,pathSegments=[]){
  if(!Array.isArray(target))return;
  if(Array.isArray(value)){
    if(pathSegments.length){
      target.push({
        path:pathSegments.join("."),
        kind:"array",
        value:value.length,
      });
    }
    for(let index=0;index<value.length;index+=1){
      appendAppServerCapabilitySignals(target,value[index],[...pathSegments,String(index)]);
    }
    return;
  }
  if(value&&typeof value==="object"){
    if(pathSegments.length){
      target.push({
        path:pathSegments.join("."),
        kind:"object",
        value:Object.keys(value).length,
      });
    }
    for(const[key,entry]of Object.entries(value)){
      const normalizedKey=normalizeAppServerCapabilityPathSegment(key);
      if(!normalizedKey)continue;
      appendAppServerCapabilitySignals(target,entry,[...pathSegments,normalizedKey]);
    }
    return;
  }
  if(!pathSegments.length)return;
  target.push({
    path:pathSegments.join("."),
    kind:value===null?"null":typeof value,
    value,
  });
}
function normalizeAppServerCapabilitySignalState(signal){
  if(!signal||typeof signal!=="object")return"unknown";
  if(signal.kind==="object"||signal.kind==="array")return"supported";
  if(signal.kind==="boolean")return signal.value?"supported":"unsupported";
  if(signal.kind==="number"){
    if(signal.value===0)return"unsupported";
    if(Number.isFinite(Number(signal.value))&&Number(signal.value)>0)return"supported";
    return"unknown";
  }
  if(signal.kind!=="string")return"unknown";
  const text=safeString(signal.value,80).toLowerCase();
  if(!text)return"unknown";
  if(["supported","enabled","available","true","yes","ready","on"].includes(text))return"supported";
  if(["unsupported","disabled","unavailable","false","no","off"].includes(text))return"unsupported";
  return"unknown";
}
function buildDefaultAppServerCapabilityFeatures(){
  const features={};
  for(const definition of appServerCapabilityDefinitions){
    features[definition.id]={
      label:definition.label,
      status:"unknown",
      matchedPaths:[],
      signalCount:0,
      detection:"no_explicit_signal",
    };
  }
  return features;
}
function buildAppServerCapabilitySnapshotFromState(state){
  const source=state&&typeof state==="object"?state:{};
  const initializeResult=source.initializeResult&&typeof source.initializeResult==="object"?source.initializeResult:null;
  const signals=[];
  if(initializeResult&&initializeResult.capabilities&&typeof initializeResult.capabilities==="object"){
    appendAppServerCapabilitySignals(signals,initializeResult.capabilities,["capabilities"]);
  }
  if(initializeResult){
    appendAppServerCapabilitySignals(signals,initializeResult,["initialize_result"]);
  }
  const matchedCapabilityPaths=[];
  const features=buildDefaultAppServerCapabilityFeatures();
  for(const definition of appServerCapabilityDefinitions){
    const matchingSignals=signals.filter((entry)=>definition.matchPath(entry.path));
    const supportedSignals=matchingSignals.filter((entry)=>normalizeAppServerCapabilitySignalState(entry)==="supported");
    const unsupportedSignals=matchingSignals.filter((entry)=>normalizeAppServerCapabilitySignalState(entry)==="unsupported");
    const matchedPaths=Array.from(new Set(matchingSignals.map((entry)=>entry.path))).slice(0,8);
    matchedCapabilityPaths.push(...matchedPaths);
    let status="unknown";
    let detection="no_explicit_signal";
    if(supportedSignals.length&&unsupportedSignals.length){
      detection="conflicting_signals";
    }else if(supportedSignals.length){
      status="supported";
      detection="explicit_support";
    }else if(unsupportedSignals.length){
      status="unsupported";
      detection="explicit_deny";
    }else if(matchingSignals.length){
      detection="non_boolean_signal";
    }
    features[definition.id]={
      label:definition.label,
      status,
      matchedPaths,
      signalCount:matchingSignals.length,
      detection,
    };
  }
  return{
    schema:"app-server-capability-snapshot.v1",
    handshakeStatus:safeString(source.handshakeStatus,80)||"not_initialized",
    statusSemantics:appServerCapabilityStatusSemantics,
    initializeRequestedAt:Number.isFinite(Number(source.initializeRequestedAt))?Math.max(0,Math.trunc(Number(source.initializeRequestedAt))):0,
    initializeCompletedAt:Number.isFinite(Number(source.initializeCompletedAt))?Math.max(0,Math.trunc(Number(source.initializeCompletedAt))):0,
    initializedNotifiedAt:Number.isFinite(Number(source.initializedNotifiedAt))?Math.max(0,Math.trunc(Number(source.initializedNotifiedAt))):0,
    protocolVersion:safeString(source.protocolVersion,80)||"",
    serverInfo:{
      name:safeString(source.serverInfo&&source.serverInfo.name,120)||"",
      version:safeString(source.serverInfo&&source.serverInfo.version,80)||"",
    },
    initializeRequestCapabilities:source.initializeRequestCapabilities&&typeof source.initializeRequestCapabilities==="object"
      ?source.initializeRequestCapabilities
      :{},
    features,
    featureOrder:appServerCapabilityDefinitions.map((definition)=>definition.id),
    matchedCapabilityPaths:Array.from(new Set(matchedCapabilityPaths)).slice(0,24),
    handshakeError:safeString(source.handshakeError,220)||"",
  };
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
    this.capabilityState=this.createEmptyCapabilityState();
  }
  createEmptyCapabilityState(){
    return{
      handshakeStatus:"not_initialized",
      initializeRequestedAt:0,
      initializeCompletedAt:0,
      initializedNotifiedAt:0,
      protocolVersion:"",
      serverInfo:{name:"",version:""},
      initializeRequestCapabilities:{},
      initializeResult:null,
      handshakeError:"",
    };
  }
  resetCapabilityState(){
    this.capabilityState=this.createEmptyCapabilityState();
  }
  recordInitializeRequest(params){
    const current=this.capabilityState&&typeof this.capabilityState==="object"
      ?this.capabilityState
      :this.createEmptyCapabilityState();
    this.capabilityState={
      ...current,
      handshakeStatus:"initialize_requested",
      initializeRequestedAt:nowTs(),
      initializeRequestCapabilities:params&&params.capabilities&&typeof params.capabilities==="object"
        ?params.capabilities
        :{},
      handshakeError:"",
    };
  }
  recordInitializeResult(result){
    const current=this.capabilityState&&typeof this.capabilityState==="object"
      ?this.capabilityState
      :this.createEmptyCapabilityState();
    this.capabilityState={
      ...current,
      handshakeStatus:current.initializedNotifiedAt?"initialized":"initialize_completed",
      initializeCompletedAt:nowTs(),
      protocolVersion:safeString(result&&result.protocolVersion,80)||safeString(current.protocolVersion,80)||"",
      serverInfo:result&&result.serverInfo&&typeof result.serverInfo==="object"
        ?{
          name:safeString(result.serverInfo.name,120)||"",
          version:safeString(result.serverInfo.version,80)||"",
        }
        :current.serverInfo,
      initializeResult:result&&typeof result==="object"?result:null,
      handshakeError:"",
    };
  }
  recordInitializeFailure(error){
    const current=this.capabilityState&&typeof this.capabilityState==="object"
      ?this.capabilityState
      :this.createEmptyCapabilityState();
    this.capabilityState={
      ...current,
      handshakeStatus:"initialize_failed",
      handshakeError:safeString(error&&error.message?error.message:String(error),220)||"initialize_failed",
    };
  }
  recordInitializedNotification(){
    const current=this.capabilityState&&typeof this.capabilityState==="object"
      ?this.capabilityState
      :this.createEmptyCapabilityState();
    this.capabilityState={
      ...current,
      handshakeStatus:"initialized",
      initializedNotifiedAt:nowTs(),
    };
  }
  getCapabilitySnapshot(){
    return buildAppServerCapabilitySnapshotFromState(this.capabilityState);
  }
  hasUsableChild(){
    if(this.transportMode==="mock-fixture"){
      return Boolean(this.child)&&!this.stopping;
    }
    const child=this.child;
    const stdin=child&&child.stdin;
    return Boolean(child&&!this.stopping&&!this.childTerminated&&stdin&&!stdin.destroyed&&!child.killed);
  }
  shouldTraceRpcMethod(method){
    return method==="initialize"
      ||method==="thread/start"
      ||method==="thread/resume"
      ||method==="thread/goal/set"
      ||method==="thread/goal/get"
      ||method==="thread/goal/clear"
      ||method==="turn/start"
      ||method==="turn/interrupt";
  }
  async ensureStarted(){
    if(this.hasUsableChild())return;
    if(this.child&&!this.stopping){
      logOperation("appserver.restart_required",{
        reason:"stale_child_detected",
        childTerminated:this.childTerminated?1:0,
        stdinDestroyed:this.child&&this.child.stdin&&this.child.stdin.destroyed?1:0,
        killed:this.child&&this.child.killed?1:0,
      });
      this.handleProcessTermination(new Error("app-server is not running"),this.child);
    }
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
    this.resetCapabilityState();
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
      const target=resolveCodexAppServerSpawnTarget({
        cwd:this.cwd,
        reasoningEffortConfig:defaultExecModelReasoningEffortConfig,
        stdio:["pipe","pipe","pipe"],
      });
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
    if(!child||!stdin||stdin.destroyed){
      const err=new Error("app-server is not running");
      if(child)this.handleProcessTermination(err,child);
      throw this.terminatedTransportError||err;
    }
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
    if(method==="initialized")this.recordInitializedNotification();
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
    if(method==="initialize")this.recordInitializeRequest(params);
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
        if(method==="initialize")this.recordInitializeFailure(new Error(`request timed out: ${method}`));
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
        if(method==="initialize")this.recordInitializeFailure(e);
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
    try{
      return await this.sendRequestRaw(method,params,timeoutMs);
    }catch(error){
      const message=safeString(error&&error.message?error.message:String(error),220);
      if(message==="app-server is not running"&&!this.stopping&&this.transportMode!=="mock-fixture"){
        await this.ensureStarted();
        return this.sendRequestRaw(method,params,timeoutMs);
      }
      throw error;
    }
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
    if(method==="initialize")this.recordInitializeRequest(params);
    if(traced){
      logOperation("rpc.req",{
        id,
        method:safeString(method,80),
        transport:this.transportMode,
      });
    }
    try{
      const result=this.resolveMockRequest(method,params);
      if(method==="initialize")this.recordInitializeResult(result);
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
      if(method==="initialize")this.recordInitializeFailure(error);
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
    if(method==="thread/goal/get"){
      const threadId=safeString(params&&params.threadId,160);
      return{goal:this.mockGoals&&this.mockGoals.has(threadId)?this.mockGoals.get(threadId):null};
    }
    if(method==="thread/goal/set"){
      const threadId=safeString(params&&params.threadId,160);
      if(!threadId)throw new Error("thread/goal/set missing thread id");
      if(!this.mockGoals)this.mockGoals=new Map();
      const existing=this.mockGoals.get(threadId)||{};
      const now=Date.now();
      const goal={
        threadId,
        objective:safeString(Object.prototype.hasOwnProperty.call(params||{},"objective")?params.objective:existing.objective,4000)||safeString(existing.objective,4000)||"",
        status:normalizeGoalStatusForSlashCommand(Object.prototype.hasOwnProperty.call(params||{},"status")?params.status:existing.status)||"active",
        tokenBudget:Object.prototype.hasOwnProperty.call(params||{},"tokenBudget")&&Number.isFinite(Number(params.tokenBudget))?Math.max(0,Math.trunc(Number(params.tokenBudget))):(Number.isFinite(Number(existing.tokenBudget))?Math.max(0,Math.trunc(Number(existing.tokenBudget))):null),
        tokensUsed:Number.isFinite(Number(existing.tokensUsed))?Math.max(0,Math.trunc(Number(existing.tokensUsed))):0,
        timeUsedSeconds:Number.isFinite(Number(existing.timeUsedSeconds))?Math.max(0,Math.trunc(Number(existing.timeUsedSeconds))):0,
        createdAt:Number.isFinite(Number(existing.createdAt))?Math.max(0,Math.trunc(Number(existing.createdAt))):now,
        updatedAt:now,
      };
      this.mockGoals.set(threadId,goal);
      return{goal};
    }
    if(method==="thread/goal/clear"){
      const threadId=safeString(params&&params.threadId,160);
      const cleared=Boolean(this.mockGoals&&this.mockGoals.delete(threadId));
      return{cleared};
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
      if(Object.prototype.hasOwnProperty.call(msg,"error")){
        const error=new Error(this.parseErrorMessage(msg.error));
        if(p.method==="initialize")this.recordInitializeFailure(error);
        p.reject(error);
      }else{
        if(p.method==="initialize")this.recordInitializeResult(msg.result);
        p.resolve(msg.result);
      }
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
      planningContext:null,
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
      planningContext:ctx.planningContext&&typeof ctx.planningContext==="object"?ctx.planningContext:null,
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
  resolveApprovalDecision({requestedPolicy,sandboxMode,operation,risk,agentName,governanceOverride,automaticApprovalReviewEnabled,planningContext}){
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
      taskContext:planningContext&&typeof planningContext==="object"?planningContext:null,
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
      planningContext:ctx&&ctx.planningContext?ctx.planningContext:null,
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
          planningContext:ctx.planningContext,
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
          planningContext:ctx.planningContext,
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
          planningContext:ctx.planningContext,
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
const codexMemoryModeValues=Object.freeze(["default","read_write","read_only","disabled"]);
function normalizeCodexMemoryMode(value,fallback="default"){
  const raw=safeString(value,40).toLowerCase().replace(/[\s-]+/g,"_");
  const fallbackRaw=safeString(fallback,40).toLowerCase().replace(/[\s-]+/g,"_");
  if(!raw)return fallbackRaw||"default";
  if(raw==="default"||raw==="inherit"||raw==="auto")return"default";
  if(raw==="read_write"||raw==="full"||raw==="enabled"||raw==="on"||raw==="use_and_generate")return"read_write";
  if(raw==="read_only"||raw==="readonly"||raw==="use_only"||raw==="inject_only")return"read_only";
  if(raw==="disabled"||raw==="off"||raw==="none")return"disabled";
  if(fallbackRaw==="read_write"||fallbackRaw==="full"||fallbackRaw==="enabled"||fallbackRaw==="on"||fallbackRaw==="use_and_generate")return"read_write";
  if(fallbackRaw==="read_only"||fallbackRaw==="readonly"||fallbackRaw==="use_only"||fallbackRaw==="inject_only")return"read_only";
  if(fallbackRaw==="disabled"||fallbackRaw==="off"||fallbackRaw==="none")return"disabled";
  return"default";
}
function getAppServerCapabilitySnapshot(){
  return appServer&&typeof appServer.getCapabilitySnapshot==="function"
    ?appServer.getCapabilitySnapshot()
    :buildAppServerCapabilitySnapshotFromState(null);
}
function buildMemoryBridgeConfigEntries(memoryMode,capabilitySnapshot){
  const mode=normalizeCodexMemoryMode(memoryMode,"default");
  const snapshot=capabilitySnapshot&&typeof capabilitySnapshot==="object"?capabilitySnapshot:{};
  const features=snapshot.features&&typeof snapshot.features==="object"?snapshot.features:{};
  const modeStatus=safeString(features.memoryMode&&features.memoryMode.status,40)||"unknown";
  const resetStatus=safeString(features.memoryReset&&features.memoryReset.status,40)||"unknown";
  const bridge={
    requestedMode:mode,
    appliedMode:"default",
    remoteModeStatus:modeStatus,
    remoteResetStatus:resetStatus,
    localResetFallback:1,
    config:{},
    bridgeStatus:"default_passthrough",
  };
  if(mode==="default")return bridge;
  if(modeStatus!=="supported"){
    bridge.bridgeStatus=`skipped_remote_mode_${modeStatus||"unknown"}`;
    return bridge;
  }
  bridge.appliedMode=mode;
  bridge.bridgeStatus="remote_mode_override";
  if(mode==="read_write"){
    bridge.config["features.memories"]=true;
    bridge.config["memories.use_memories"]=true;
    bridge.config["memories.generate_memories"]=true;
    return bridge;
  }
  if(mode==="read_only"){
    bridge.config["features.memories"]=true;
    bridge.config["memories.use_memories"]=true;
    bridge.config["memories.generate_memories"]=false;
    return bridge;
  }
  bridge.config["features.memories"]=false;
  bridge.config["memories.use_memories"]=false;
  bridge.config["memories.generate_memories"]=false;
  return bridge;
}
function cleanupMemoryExtensions(agentState,{clearPlanning=true}={}){
  if(!agentState||typeof agentState!=="object")return;
  if(clearPlanning){
    agentState.lastPlanningContext=null;
  }
}
function resetCodexMemory(agentState){
  if(!agentState||typeof agentState!=="object")return;
  cleanupMemoryExtensions(agentState,{clearPlanning:true});
  agentState.lastMemoryResetAt=Date.now();
}
function buildAppServerMemoryBridgeSnapshot(capabilitySnapshot){
  const snapshot=capabilitySnapshot&&typeof capabilitySnapshot==="object"?capabilitySnapshot:{};
  const features=snapshot.features&&typeof snapshot.features==="object"?snapshot.features:{};
  return{
    schema:"app-server-memory-bridge.v1",
    defaultMode:"default",
    supportedModes:codexMemoryModeValues.slice(),
    remoteModeStatus:safeString(features.memoryMode&&features.memoryMode.status,40)||"unknown",
    remoteResetStatus:safeString(features.memoryReset&&features.memoryReset.status,40)||"unknown",
    localResetFallback:1,
    configKeys:["features.memories","memories.use_memories","memories.generate_memories"],
  };
}
function buildAppServerCanonicalizationSnapshot(){
  return{
    schema:"app-server-canonicalization.v1",
    cwdIdentity:{
      platform:process.platform,
      stripsWindowsExtendedLengthPrefix:process.platform==="win32"?1:0,
      trimsTrailingSeparators:1,
      caseInsensitiveComparison:process.platform==="win32"?1:0,
    },
  };
}
function buildAppServerTransportRuntimeSnapshot(){
  const capabilitySnapshot=getAppServerCapabilitySnapshot();
  const memoryBridge=buildAppServerMemoryBridgeSnapshot(capabilitySnapshot);
  const canonicalization=buildAppServerCanonicalizationSnapshot();
  return{
    transportMode:safeString(appServer&&appServer.transportMode,40)||"unknown",
    childRunning:Boolean(appServer&&appServer.child)?1:0,
    childTerminated:Boolean(appServer&&appServer.childTerminated)?1:0,
    pendingRpcCount:appServer&&appServer.pending instanceof Map?appServer.pending.size:0,
    activeTurnWatcherCount:appServer&&appServer.turnWatchers instanceof Map?appServer.turnWatchers.size:0,
    activeTurnContextCount:appServer&&appServer.turnContexts instanceof Map?appServer.turnContexts.size:0,
    activeMockTurnCount:appServer&&appServer.mockTurns instanceof Map?appServer.mockTurns.size:0,
    terminatedTransportError:safeString(appServer&&appServer.terminatedTransportError&&appServer.terminatedTransportError.message,220)||"",
    capabilitySnapshot,
    capability_snapshot:capabilitySnapshot,
    memoryBridge,
    memory_bridge:memoryBridge,
    canonicalization,
    cwd_canonicalization:canonicalization,
  };
}
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
function normalizeGoalStatusForSlashCommand(value){
  const raw=safeString(value,80).toLowerCase().replace(/[\s-]+/g,"_");
  if(raw==="active"||raw==="resume"||raw==="resumed")return"active";
  if(raw==="paused"||raw==="pause")return"paused";
  if(raw==="complete"||raw==="completed"||raw==="done")return"complete";
  if(raw==="budgetlimited"||raw==="budget_limited"||raw==="budget-limited")return"budgetLimited";
  return"";
}
function isUnsupportedAppServerGoalMethodError(error){
  const text=safeString(error&&error.message?error.message:String(error),600).toLowerCase();
  const mentionsGoalMethod=text.includes("thread/goal/")
    ||text.includes("goal/set")
    ||text.includes("goal/get")
    ||text.includes("goal/clear");
  if(!mentionsGoalMethod)return false;
  return text.includes("unsupported")
    ||text.includes("unknown method")
    ||text.includes("method not found")
    ||text.includes("not implemented")
    ||text.includes("no handler")
    ||text.includes("unrecognized method");
}
function normalizeGoalForSlashCommand(goal,threadId){
  if(!goal||typeof goal!=="object")return null;
  const objective=safeString(goal.objective,4000);
  const status=normalizeGoalStatusForSlashCommand(goal.status)||"active";
  const now=Date.now();
  return{
    threadId:safeString(goal.threadId,160)||safeString(threadId,160)||"",
    objective,
    status,
    tokenBudget:Number.isFinite(Number(goal.tokenBudget))?Math.max(0,Math.trunc(Number(goal.tokenBudget))):null,
    tokensUsed:Number.isFinite(Number(goal.tokensUsed))?Math.max(0,Math.trunc(Number(goal.tokensUsed))):0,
    timeUsedSeconds:Number.isFinite(Number(goal.timeUsedSeconds))?Math.max(0,Math.trunc(Number(goal.timeUsedSeconds))):0,
    createdAt:Number.isFinite(Number(goal.createdAt))?Math.max(0,Math.trunc(Number(goal.createdAt))):now,
    updatedAt:Number.isFinite(Number(goal.updatedAt))?Math.max(0,Math.trunc(Number(goal.updatedAt))):now,
  };
}
function setLocalGoalForSlashCommand(state,threadId,patch={}){
  if(!state)return null;
  const now=Date.now();
  const existing=normalizeGoalForSlashCommand(state.goal,threadId)||{
    threadId:safeString(threadId,160)||"",
    objective:"",
    status:"active",
    tokenBudget:null,
    tokensUsed:0,
    timeUsedSeconds:0,
    createdAt:now,
    updatedAt:now,
  };
  const next={
    ...existing,
    threadId:safeString(threadId,160)||existing.threadId,
    objective:Object.prototype.hasOwnProperty.call(patch,"objective")?safeString(patch.objective,4000):existing.objective,
    status:normalizeGoalStatusForSlashCommand(Object.prototype.hasOwnProperty.call(patch,"status")?patch.status:existing.status)||existing.status||"active",
    tokenBudget:Object.prototype.hasOwnProperty.call(patch,"tokenBudget")&&Number.isFinite(Number(patch.tokenBudget))?Math.max(0,Math.trunc(Number(patch.tokenBudget))):existing.tokenBudget,
    updatedAt:now,
  };
  state.goal=next;
  return next;
}
function formatGoalForSlashCommand(goal,{source="native"}={}){
  const normalized=normalizeGoalForSlashCommand(goal,goal&&goal.threadId);
  if(!normalized)return`${source==="native"?"Codex goal":"HarnesUI goal"}: none`;
  const label=source==="native"?"Codex goal":"HarnesUI goal";
  const budget=Number.isFinite(Number(normalized.tokenBudget))?`\nBudget: ${normalized.tokenBudget}`:"";
  return`${label}: ${normalized.status}\nObjective: ${normalized.objective||"(empty)"}\nThread: ${normalized.threadId||"unknown"}${budget}`;
}
const slashCommandHelpRows=[
  ["/goal <objective>","Set the Codex goal for the current thread."],
  ["/goal","Show the current Codex goal."],
  ["/goal pause|resume|complete|clear","Update or clear the current Codex goal."],
  ["/status","Show Codex status-style runtime details in the HarnesUI view."],
  ["/diff","Show the current git diff summary."],
  ["/resume --last|<session>","Set the session that the next turn should resume."],
  ["/fork [name]","Create a HarnesUI agent fork from the active agent."],
  ["/fast on|off|status","Read or change HarnesUI fast mode."],
  ["/agent list|new|use","Manage HarnesUI agents."],
  ["/mention <path> [message]","Rewrite the request with a workspace file target."],
  ["/experimental ...","Manage local experimental feature flags."],
  ["/help","Show this command list."],
];
function formatSlashHelpText(){
  return["Supported slash commands:",...slashCommandHelpRows.map(([command,description])=>`  ${command} - ${description}`)].join("\n");
}
function handleSlashHelpCommand(res){
  replyLocalText(res,formatSlashHelpText());
  return true;
}
function handleUnsupportedSlashCommand(res,command){
  replyLocalText(res,`Unrecognized command '${safeString(command,80)}'. Type /help for a list of supported commands.`);
  return true;
}
const slashStatusCommandCache=new Map();
function runCachedSlashStatusCommand(cacheKey,command,ttlMs=60000){
  const now=Date.now();
  const cached=slashStatusCommandCache.get(cacheKey);
  if(cached&&now-cached.at<ttlMs)return cached.value;
  const result=spawnSync("cmd.exe",["/d","/s","/c",command],{cwd:workspaceRoot,windowsHide:true,encoding:"utf8",timeout:1500});
  const stdout=typeof result.stdout==="string"?result.stdout:"";
  const stderr=typeof result.stderr==="string"?result.stderr:"";
  const value=!result.error&&result.status===0
    ?safeString(getFirstMeaningfulLine(`${stdout}\n${stderr}`),220)
    :safeString(result.error&&result.error.message?result.error.message:getFirstMeaningfulLine(`${stderr}\n${stdout}`),220);
  const normalized=value||"unavailable";
  slashStatusCommandCache.set(cacheKey,{at:now,value:normalized});
  return normalized;
}
function formatCodexCliVersionForStatus(){
  const raw=runCachedSlashStatusCommand("codex-version","codex --version");
  const match=raw.match(/(?:codex(?:-cli)?\s+)?v?([0-9]+(?:\.[0-9]+){1,3})/i);
  return match?`v${match[1]}`:raw;
}
function findNearestAgentsMdForStatus(cwd){
  let current=path.resolve(cwd||workspaceRoot);
  const stop=path.resolve(workspaceRoot);
  while(current&&isPathWithin(stop,current)){
    const candidate=path.join(current,"AGENTS.md");
    try{
      if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())return summarizePathForOperationLog(candidate,220);
    }catch{
    }
    const next=path.dirname(current);
    if(next===current)break;
    current=next;
  }
  return"none";
}
function formatSlashStatusRow(label,value){
  const padded=label.length>=30?`${label} `:label.padEnd(30," ");
  return`${padded}${safeString(String(value||""),800)||"-"}`;
}
let slashStatusModelMetadataCache=null;
let slashStatusAuthAccountCache=null;
function parseJsonFileForSlashStatus(filePath,maxBytes=8*1024*1024){
  if(!filePath)return null;
  try{
    const stat=fs.statSync(filePath);
    if(!stat.isFile()||stat.size>maxBytes)return null;
    return JSON.parse(fs.readFileSync(filePath,"utf8"));
  }catch{
    return null;
  }
}
function decodeJwtPayloadForSlashStatus(token){
  const raw=safeString(token,12000);
  const parts=raw.split(".");
  if(parts.length<2)return null;
  let payload=parts[1].replace(/-/g,"+").replace(/_/g,"/");
  while(payload.length%4!==0)payload+="=";
  try{
    return JSON.parse(Buffer.from(payload,"base64").toString("utf8"));
  }catch{
    return null;
  }
}
function readCodexAccountForSlashStatus(loginStatus){
  if(slashStatusAuthAccountCache)return slashStatusAuthAccountCache;
  const authPath=userHomeDir?path.join(userHomeDir,".codex","auth.json"):"";
  const parsed=parseJsonFileForSlashStatus(authPath,512*1024);
  const claims=decodeJwtPayloadForSlashStatus(parsed&&parsed.tokens&&parsed.tokens.id_token);
  const email=safeString(claims&&claims.email,180);
  slashStatusAuthAccountCache=email||safeString(loginStatus,220)||"unavailable";
  return slashStatusAuthAccountCache;
}
function loadModelMetadataForSlashStatus(){
  if(slashStatusModelMetadataCache)return slashStatusModelMetadataCache;
  const modelsPath=userHomeDir?path.join(userHomeDir,".codex","models_cache.json"):"";
  const parsed=parseJsonFileForSlashStatus(modelsPath);
  const models=Array.isArray(parsed&&parsed.models)?parsed.models:[];
  slashStatusModelMetadataCache={models,loadedAt:Date.now()};
  return slashStatusModelMetadataCache;
}
function findModelMetadataForSlashStatus(model){
  const normalized=safeString(model,120).toLowerCase();
  const cache=loadModelMetadataForSlashStatus();
  return(cache.models||[]).find((entry)=>{
    const slug=safeString(entry&&entry.slug,120).toLowerCase();
    const id=safeString(entry&&entry.id,120).toLowerCase();
    return slug===normalized||id===normalized;
  })||null;
}
function formatSlashStatusTokenCount(value){
  const n=toNonNegativeInt(value);
  if(n>=1000000)return`${Math.round(n/100000)/10}M`;
  if(n>=1000)return`${Math.round(n/1000)}K`;
  return String(n);
}
function modelContextWindowForSlashStatus(model,usage){
  const usageWindow=usage&&Number.isFinite(Number(usage.modelContextWindow))
    ?toNonNegativeInt(usage.modelContextWindow)
    :0;
  if(usageWindow>0)return usageWindow;
  const metadata=findModelMetadataForSlashStatus(model);
  const contextWindow=Number.isFinite(Number(metadata&&metadata.context_window))
    ?toNonNegativeInt(metadata.context_window)
    :0;
  const pct=Number.isFinite(Number(metadata&&metadata.effective_context_window_percent))
    ?Math.max(1,Math.min(100,Number(metadata.effective_context_window_percent)))
    :100;
  return contextWindow>0?Math.max(1,Math.floor(contextWindow*pct/100)):0;
}
function formatContextWindowForSlashStatus(model,sessionRef){
  const performance=getSessionPerformanceSnapshot(sessionRef);
  const usage=performance&&performance.aggregate?performance.aggregate:normalizeTokenUsageTotals(null);
  const used=toNonNegativeInt(usage&&usage.totalTokens);
  const limit=modelContextWindowForSlashStatus(model,usage);
  if(limit<=0)return"not measured yet";
  const left=Math.max(0,limit-used);
  const pct=Math.max(0,Math.min(100,Math.round(left*100/limit)));
  return`${pct}% left (${formatSlashStatusTokenCount(used)} used / ${formatSlashStatusTokenCount(limit)})`;
}
function formatSandboxForSlashStatus(sandboxMode){
  const normalized=normalizeSandboxMode(sandboxMode);
  if(normalized==="read-only")return"Read only";
  if(normalized==="workspace-write")return"Workspace";
  if(normalized==="danger-full-access")return"Full access";
  return normalized;
}
function formatApprovalForSlashStatus(approvalPolicy,automaticApprovalReviewEnabled){
  const approval=normalizeApprovalPolicy(approvalPolicy);
  if(approval==="never")return"no approval";
  if(approval==="on-request"&&resolveAutomaticApprovalReviewEnabled(automaticApprovalReviewEnabled))return"auto-review";
  return approval;
}
function configuredSandboxModeForSlashStatus(){
  const project=readTopLevelCodexConfigString(codexConfigPath,"sandbox_mode");
  const user=readTopLevelCodexConfigString(userCodexConfigPath,"sandbox_mode");
  return normalizeSandboxMode(project||user||"workspace-write");
}
function configuredApprovalPolicyForSlashStatus(){
  const project=readTopLevelCodexConfigString(codexConfigPath,"approval_policy");
  const user=readTopLevelCodexConfigString(userCodexConfigPath,"approval_policy");
  return normalizeApprovalPolicy(project||user||"on-request");
}
function formatCodexStatusLikeText({agentName,sandboxMode,normalized,state}){
  const cwd=normalizeWorkingDirectory(normalized&&normalized.cwd,workspaceRoot);
  const model=normalizeExecModel(normalized&&normalized.model,defaultExecModelName);
  const modelReasoningEffort=normalizeExecModelReasoningEffort(normalized&&normalized.modelReasoningEffort,defaultExecModelReasoningEffort);
  const statusSandboxMode=configuredSandboxModeForSlashStatus();
  const statusApprovalPolicy=configuredApprovalPolicyForSlashStatus();
  const session=state.sessionRef||state.threadId||"none";
  const loginStatus=runCachedSlashStatusCommand("codex-login-status","codex login status");
  const automaticApprovalReviewEnabled=resolveAutomaticApprovalReviewEnabled(
    normalized&&normalized.automaticApprovalReviewEnabled,
    state&&state.automaticApprovalReviewEnabled
  );
  const usageLimitText="open usage link above for live value";
  const lines=[
    `>_ OpenAI Codex (${formatCodexCliVersionForStatus()})`,
    "",
    "Visit https://chatgpt.com/codex/settings/usage for up-to-date",
    "information on rate limits and credits",
    "",
    formatSlashStatusRow("Model:",`${model} (reasoning ${modelReasoningEffort}, summaries auto)`),
    formatSlashStatusRow("Directory:",cwd),
    formatSlashStatusRow("Permissions:",`${formatSandboxForSlashStatus(statusSandboxMode)} (${formatApprovalForSlashStatus(statusApprovalPolicy,automaticApprovalReviewEnabled)})`),
    formatSlashStatusRow("Agents.md:",findNearestAgentsMdForStatus(cwd)),
    formatSlashStatusRow("Account:",readCodexAccountForSlashStatus(loginStatus)),
    formatSlashStatusRow("Collaboration mode:","Default"),
    formatSlashStatusRow("Session:",session),
    "",
    formatSlashStatusRow("Context window:",formatContextWindowForSlashStatus(model,session)),
    formatSlashStatusRow("5h limit:",usageLimitText),
    formatSlashStatusRow("Weekly limit:",usageLimitText),
    "GPT-5.3-Codex-Spark limit:",
    formatSlashStatusRow("  5h limit:",usageLimitText),
    formatSlashStatusRow("  Weekly limit:",usageLimitText),
    formatSlashStatusRow("Warning:","limits may be stale - run /status again shortly."),
  ];
  return lines.join("\n");
}
function handleSlashStatusCommand(res,agentName,sandboxMode,normalized){
  const state=getOrCreateAgentState(agentName);
  replyLocalText(res,formatCodexStatusLikeText({agentName,sandboxMode,normalized,state}));
  return true;
}
function handleSlashDiffCommand(res,normalized){
  const cwd=normalizeWorkingDirectory(normalized&&normalized.cwd,workspaceRoot);
  const repoCheck=spawnSync("git",["-C",cwd,"rev-parse","--is-inside-work-tree"],{encoding:"utf8",timeout:10000,maxBuffer:1024*1024});
  if(repoCheck.status!==0){
    replyLocalText(res,"/diff - not inside a git repository");
    return true;
  }
  const diff=spawnSync("git",["-C",cwd,"diff","--stat"],{encoding:"utf8",timeout:10000,maxBuffer:1024*1024});
  if(diff.status!==0){
    const detail=safeString((diff.stderr||diff.stdout||"").trim(),2000)||"git diff failed";
    replyLocalText(res,`Failed to compute diff: ${detail}`);
    return true;
  }
  const body=safeString((diff.stdout||"").trim(),4000);
  replyLocalText(res,body?`D I F F\n${body}`:"No changes detected.");
  return true;
}
function slashThreadOptionsFromExecOptions(normalized,sandboxMode){
  const webSearchMode=normalizeWebSearchMode(
    Object.prototype.hasOwnProperty.call(normalized||{},"webSearchMode")?normalized.webSearchMode:normalized&&normalized.webSearch,
    "disabled"
  );
  return{
    sandboxMode:normalizeSandboxMode(sandboxMode),
    approvalPolicy:normalizeApprovalPolicy(normalized&&normalized.approvalPolicy),
    webSearch:isWebSearchEnabledForMode(webSearchMode),
    webSearchMode,
    model:normalizeExecModel(normalized&&normalized.model,defaultExecModelName),
    modelReasoningEffort:normalizeExecModelReasoningEffort(normalized&&normalized.modelReasoningEffort,defaultExecModelReasoningEffort),
    cwd:normalizeWorkingDirectory(normalized&&normalized.cwd,workspaceRoot),
    forceNewSession:false,
    requestUserInputPolicy:normalizeRequestUserInputPolicy(normalized&&normalized.requestUserInputPolicy,nonInteractiveRequestUserInputPolicy),
    memoryMode:normalizeCodexMemoryMode(normalized&&normalized.memoryMode,"default"),
    resetCodexMemory:normalizeBooleanFlag(normalized&&normalized.resetCodexMemory),
    fastModeEnabled:resolveFastModeEnabled(normalized&&normalized.fastModeEnabled),
    automaticApprovalReviewEnabled:resolveAutomaticApprovalReviewEnabled(normalized&&normalized.automaticApprovalReviewEnabled),
  };
}
async function withSlashGoalThread(agentName,sandboxMode,normalized,operation){
  const state=getOrCreateAgentState(agentName);
  const threadOptions=slashThreadOptionsFromExecOptions(normalized,sandboxMode);
  const threadId=await ensureAgentThread(agentName,threadOptions);
  return operation({state,threadId,threadOptions});
}
async function handleSlashGoalCommand(res,argsText,agentName,sandboxMode,normalized){
  const raw=safeString(argsText,4000);
  const arg=raw.trim();
  try{
    await withSlashGoalThread(agentName,sandboxMode,normalized,async({state,threadId})=>{
      const lower=arg.toLowerCase();
      const op=!arg||lower==="status"||lower==="show"||lower==="get"
        ?"get"
        :(lower==="clear"||lower==="reset"||lower==="remove"
          ?"clear"
          :(lower==="pause"||lower==="paused"
            ?"pause"
            :(lower==="resume"||lower==="active"
              ?"resume"
              :(lower==="complete"||lower==="completed"||lower==="done"
                ?"complete"
                :"set"))));
      const nativeCall=async()=>{
        if(op==="get"){
          const result=await appServer.sendRequest("thread/goal/get",{threadId},15000);
          const goal=normalizeGoalForSlashCommand(result&&result.goal,threadId);
          if(goal)state.goal=goal;
          replyLocalText(res,formatGoalForSlashCommand(goal,{source:"native"}));
          return true;
        }
        if(op==="clear"){
          await appServer.sendRequest("thread/goal/clear",{threadId},15000);
          state.goal=null;
          replyLocalText(res,`Codex goal cleared.\nThread: ${threadId}`);
          return true;
        }
        const patch=op==="set"
          ?{objective:arg,status:"active"}
          :{status:op==="pause"?"paused":(op==="resume"?"active":"complete")};
        const result=await appServer.sendRequest("thread/goal/set",{threadId,...patch},15000);
        const goal=normalizeGoalForSlashCommand(result&&result.goal,threadId)||setLocalGoalForSlashCommand(state,threadId,patch);
        state.goal=goal;
        replyLocalText(res,formatGoalForSlashCommand(goal,{source:"native"}));
        return true;
      };
      try{
        await nativeCall();
        logOperation("slash.goal.native",{a:safeString(agentName,80),th:safeString(threadId,120),op});
        return;
      }catch(error){
        if(!isUnsupportedAppServerGoalMethodError(error)){
          throw error;
        }
        logOperation("slash.goal.fallback",{a:safeString(agentName,80),th:safeString(threadId,120),op,err:summarizeErrorForOperationLog(error,220)});
      }
      if(op==="get"){
        replyLocalText(res,formatGoalForSlashCommand(state.goal,{source:"local"}));
        return;
      }
      if(op==="clear"){
        state.goal=null;
        replyLocalText(res,`HarnesUI goal cleared.\nThread: ${threadId}\nNative Codex goal API is not available in this runtime.`);
        return;
      }
      const patch=op==="set"
        ?{objective:arg,status:"active"}
        :{status:op==="pause"?"paused":(op==="resume"?"active":"complete")};
      const goal=setLocalGoalForSlashCommand(state,threadId,patch);
      replyLocalText(res,`${formatGoalForSlashCommand(goal,{source:"local"})}\nNative Codex goal API is not available in this runtime.`);
    });
  }catch(error){
    replyLocalText(res,`[error] ${error&&error.message?error.message:String(error)}`);
  }
  return true;
}
function handleSlashResumeCommand(res,argsText){const active=getActiveAgentState();const arg=(argsText||"").trim();if(!arg||arg==="--last"){const latest=findLatestSessionId();if(!latest){replyLocalText(res,"No saved session found.");return true;}active.sessionRef=latest;active.threadId=latest;active.activeTurnId=null;active.manualSessionPinned=true;replyLocalText(res,`Resume target set: ${latest}`);return true;}if(arg==="clear"){active.sessionRef=null;active.threadId=null;active.activeTurnId=null;active.manualSessionPinned=false;replyLocalText(res,"Resume target cleared.");return true;}if(agentStates.has(arg)){activeAgentName=arg;const switched=getActiveAgentState();replyLocalText(res,`Switched agent: ${arg}\nSession=${switched.sessionRef||"none"}`);return true;}active.sessionRef=arg;active.threadId=arg;active.activeTurnId=null;active.manualSessionPinned=true;if(looksLikeSessionId(arg)){replyLocalText(res,`Resume target set: ${arg}`);return true;}replyLocalText(res,`Resume target set (non-standard id): ${arg}`);return true;}
function buildForkedAgentState(source,sourceName){
  return{
    sessionRef:source.sessionRef||null,
    threadId:source.threadId||null,
    activeTurnId:null,
    goal:source.goal&&typeof source.goal==="object"?{...source.goal,threadId:source.threadId||source.sessionRef||""}:null,
    experimentalEnabled:source.experimentalEnabled,
    experimentalFeatures:new Set(Array.from(source.experimentalFeatures||[])),
    serviceTier:normalizeCodexServiceTier(source.serviceTier,defaultCodexServiceTier),
    createdAt:Date.now(),
    forkedFrom:sourceName,
    manualSessionPinned:source.manualSessionPinned,
    lastSandboxMode:source.lastSandboxMode,
    lastWebSearch:source.lastWebSearch,
    lastWebSearchMode:source.lastWebSearchMode||null,
    lastCwd:source.lastCwd||null,
    lastCwdKey:source.lastCwdKey||null,
    lastRequestUserInputPolicy:source.lastRequestUserInputPolicy||null,
    lastModel:source.lastModel||defaultExecModelName,
    lastModelReasoningEffort:source.lastModelReasoningEffort||defaultExecModelReasoningEffort,
    lastFastModeEnabled:typeof source.lastFastModeEnabled==="boolean"?source.lastFastModeEnabled:resolveFastModeEnabled(source.fastModeEnabled),
    lastAutomaticApprovalReviewEnabled:typeof source.lastAutomaticApprovalReviewEnabled==="boolean"?source.lastAutomaticApprovalReviewEnabled:resolveAutomaticApprovalReviewEnabled(source.automaticApprovalReviewEnabled),
    memoryMode:normalizeCodexMemoryMode(source.memoryMode,"default"),
    lastMemoryMode:normalizeCodexMemoryMode(source.lastMemoryMode,normalizeCodexMemoryMode(source.memoryMode,"default")),
    lastMemoryResetAt:Number.isFinite(Number(source.lastMemoryResetAt))?Math.max(0,Math.trunc(Number(source.lastMemoryResetAt))):0,
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
  const currentCwdKey=normalizeDirectoryPathIdentity(cwd);
  const stateCwdKey=state.lastCwdKey||normalizeDirectoryPathIdentity(state.lastCwd);
  if(!state.lastPlanningContext||typeof state.lastPlanningContext!=="object")return null;
  if(stateCwdKey&&currentCwdKey&&stateCwdKey!==currentCwdKey)return null;
  return sanitizePlanningArtifactsForRuntime(state.lastPlanningContext);
}

function buildThreadStartConfig(agentState,webSearchMode,requestUserInputPolicy,model,modelReasoningEffort,fastModeEnabled,automaticApprovalReviewEnabled){
  const normalizedModel=normalizeExecModel(model,defaultExecModelName);
  const normalizedModelReasoningEffort=normalizeExecModelReasoningEffort(modelReasoningEffort,defaultExecModelReasoningEffort);
  const normalizedWebSearchMode=normalizeWebSearchMode(webSearchMode,"disabled");
  const config={
    web_search:normalizedWebSearchMode,
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
  const memoryBridge=buildMemoryBridgeConfigEntries(
    agentState&&agentState.memoryMode,
    agentState&&agentState.capabilitySnapshot?agentState.capabilitySnapshot:getAppServerCapabilitySnapshot()
  );
  for(const[key,value]of Object.entries(memoryBridge.config||{})){
    config[key]=value;
  }
  return config;
}
function shouldResetThreadForMode(agentState,sandboxMode,webSearchMode,cwd,requestUserInputPolicy,model,modelReasoningEffort,fastModeEnabled,automaticApprovalReviewEnabled,memoryMode){
  if(!agentState||!agentState.threadId||agentState.manualSessionPinned)return false;
  if(agentState.lastSandboxMode&&agentState.lastSandboxMode!==sandboxMode)return true;
  const normalizedWebSearchMode=normalizeWebSearchMode(webSearchMode,"disabled");
  if(agentState.lastWebSearchMode&&agentState.lastWebSearchMode!==normalizedWebSearchMode)return true;
  if(!agentState.lastWebSearchMode&&typeof agentState.lastWebSearch==="boolean"&&agentState.lastWebSearch!==isWebSearchEnabledForMode(normalizedWebSearchMode))return true;
  const cwdKey=normalizeDirectoryPathIdentity(cwd);
  const lastCwdKey=agentState.lastCwdKey||normalizeDirectoryPathIdentity(agentState.lastCwd);
  if(lastCwdKey&&cwdKey&&lastCwdKey!==cwdKey)return true;
  if(agentState.lastRequestUserInputPolicy&&agentState.lastRequestUserInputPolicy!==requestUserInputPolicy)return true;
  const normalizedModel=normalizeExecModel(model,defaultExecModelName);
  if(agentState.lastModel&&agentState.lastModel!==normalizedModel)return true;
  const normalizedModelReasoningEffort=normalizeExecModelReasoningEffort(modelReasoningEffort,defaultExecModelReasoningEffort);
  if(agentState.lastModelReasoningEffort&&agentState.lastModelReasoningEffort!==normalizedModelReasoningEffort)return true;
  if(typeof agentState.lastFastModeEnabled==="boolean"&&agentState.lastFastModeEnabled!==Boolean(fastModeEnabled))return true;
  if(typeof agentState.lastAutomaticApprovalReviewEnabled==="boolean"&&agentState.lastAutomaticApprovalReviewEnabled!==Boolean(automaticApprovalReviewEnabled))return true;
  if(normalizeCodexMemoryMode(agentState.lastMemoryMode,"default")!==normalizeCodexMemoryMode(memoryMode,"default"))return true;
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
    mcpWallTimeMs:0,
    mcpPerServerCounts:Object.create(null),
    mcpNamespaces:[],
    mcpSandboxStates:[],
    mcpParallelSafeCallCount:0,
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
function deriveMcpNamespace(serverName,toolName){
  const server=safeString(serverName,120);
  const tool=safeString(toolName,120);
  const normalizedServer=server
    .replace(/^mcp__+/i,"")
    .split(/__+/)[0]
    .replace(/[^a-zA-Z0-9]+/g,"_")
    .replace(/^_+|_+$/g,"")
    .toLowerCase();
  if(normalizedServer)return normalizedServer;
  const normalizedTool=tool
    .split(/[._:]/)[0]
    .replace(/[^a-zA-Z0-9]+/g,"_")
    .replace(/^_+|_+$/g,"")
    .toLowerCase();
  return normalizedTool||"";
}
function extractMcpSandboxState(item){
  const candidates=[
    item&&item.sandboxState,
    item&&item.sandbox,
    item&&item.metadata&&item.metadata.sandboxState,
    item&&item.result&&item.result.sandboxState,
  ];
  for(const candidate of candidates){
    const normalized=safeString(candidate,80).toLowerCase().replace(/[\s-]+/g,"_");
    if(normalized)return normalized;
  }
  return"";
}
function extractMcpParallelSafe(item){
  const candidates=[
    item&&item.parallelSafe,
    item&&item.parallel_safe,
    item&&item.metadata&&item.metadata.parallelSafe,
    item&&item.result&&item.result.parallelSafe,
  ];
  return candidates.some((value)=>value===true||String(value||"").toLowerCase()==="true");
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
    const serverName=safeString(item.server,60);
    const toolName=safeString(item.tool,60);
    const toolSummary=[serverName,toolName].filter(Boolean).join(".");
    pushUniqueSample(stats.sampleMcpTools,toolSummary,3);
    const durationMs=Number.isFinite(Number(item.durationMs))?Math.max(0,Math.trunc(Number(item.durationMs))):0;
    stats.mcpWallTimeMs+=durationMs;
    if(serverName){
      const current=Number(stats.mcpPerServerCounts[serverName]||0);
      stats.mcpPerServerCounts[serverName]=current+1;
    }
    const namespace=deriveMcpNamespace(serverName,toolName);
    if(namespace)pushUniqueSample(stats.mcpNamespaces,namespace,6);
    const sandboxState=extractMcpSandboxState(item);
    if(sandboxState)pushUniqueSample(stats.mcpSandboxStates,sandboxState,6);
    if(extractMcpParallelSafe(item)){
      stats.mcpParallelSafeCallCount+=1;
    }
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
  if(/needs[_ ]input|need[_ ]input|need user input|user decision|open question|confirm required|approval required/i.test(lower)){
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
  return /\b(?:done|fixed|completed|resolved|implemented|shipped|reflected)\b/i.test(lead);
}
function stripLeadingCompletionClaim(text){
  return safeString(text,8000)
    .replace(/^(?:\s*(?:yes|ok|okay)\b[!?,\s]*)?(?:(?:done|fixed|completed|resolved|implemented|shipped|reflected)(?:[:!.,\s]|$))*/i,"")
    .trim();
}
function rewriteClientFinalTextForOutcome(text,{taskOutcomeStatus="",prompt=""}={}){
  const disclosureStripped=stripInternalProcessDisclosure({
    answer:stripPlanningStatusDirective(text),
    responseContract:userFacingResponseContract,
  });
  const reportingStripped=stripLeadingProgramReadinessLead({
    prompt,
    answer:disclosureStripped,
    taskOutcomeStatus,
    responseContract:userFacingResponseContract,
  });
  const residualStripped=stripLeadingResidualIncompletionLead({
    prompt,
    answer:reportingStripped,
    taskOutcomeStatus,
    responseContract:userFacingResponseContract,
  });
  const stripped=stripUnsolicitedClosingProposal({
    prompt,
    answer:residualStripped,
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
      ?"Validation evidence is still required."
      :outcome==="NEEDS_INPUT"
        ?"This is waiting on user input, not a failed turn. Reply with the missing information, approval, or decision to continue."
        :outcome==="PARTIAL"
          ?"The current scope is partially done."
          :"The current scope is still open.";
  return softened?`${lead}`+"\n\n"+softened:lead;
}
function buildFlowTraceSummary({planningContext,observedSignals,parentDispatchGuard,taskOutcomeStatus,taskOutcomeReason,finalStatus,childEvidenceLedger,docSyncEvidence,acceptanceResults,familyCompletionGate=null,agentName="",postLockDriftSnapshot=null,runtimeRevisionGate=null,clauseCompletionScorecard=null}={}){
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
  const postLockDrift=postLockDriftSnapshot&&typeof postLockDriftSnapshot==="object"
    ?postLockDriftSnapshot
    :buildPostLockDriftSnapshot({planningContext,agentName});
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
    runtimeRevisionGate:runtimeRevisionGate&&typeof runtimeRevisionGate==="object"?runtimeRevisionGate:null,
    postLockDrift,
    clauseCompletionScorecard:clauseCompletionScorecard&&typeof clauseCompletionScorecard==="object"?clauseCompletionScorecard:null,
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
  const webSearchMode=normalizeWebSearchMode(options&&Object.prototype.hasOwnProperty.call(options||{},"webSearchMode")?options.webSearchMode:options&&options.webSearch,"disabled");
  const webSearchEnabled=isWebSearchEnabledForMode(webSearchMode);
  const model=normalizeExecModel(options&&options.model,defaultExecModelName);
  const modelReasoningEffort=normalizeExecModelReasoningEffort(options&&options.modelReasoningEffort,defaultExecModelReasoningEffort);
  const cwd=normalizeWorkingDirectory(options&&options.cwd,workspaceRoot);
  const cwdKey=normalizeDirectoryPathIdentity(cwd);
  const requestUserInputPolicy=normalizeRequestUserInputPolicy(options&&options.requestUserInputPolicy,nonInteractiveRequestUserInputPolicy);
  const fastModeEnabled=resolveFastModeEnabled(options&&options.fastModeEnabled,state&&state.fastModeEnabled);
  const automaticApprovalReviewEnabled=resolveAutomaticApprovalReviewEnabled(
    options&&options.automaticApprovalReviewEnabled,
    state&&state.automaticApprovalReviewEnabled
  );
  const memoryMode=normalizeCodexMemoryMode(options&&options.memoryMode,state&&state.memoryMode);
  const resetCodexMemoryRequested=normalizeBooleanFlag(options&&options.resetCodexMemory);
  state.fastModeEnabled=fastModeEnabled;
  state.automaticApprovalReviewEnabled=automaticApprovalReviewEnabled;
  state.memoryMode=memoryMode;
  if(resetCodexMemoryRequested){
    resetCodexMemory(state);
  }

  const shouldForceReset=Boolean(options&&options.forceNewSession)||resetCodexMemoryRequested;
  const shouldModeReset=shouldResetThreadForMode(
    state,
    sandboxMode,
    webSearchMode,
    cwd,
    requestUserInputPolicy,
    model,
    modelReasoningEffort,
    fastModeEnabled,
    automaticApprovalReviewEnabled,
    memoryMode
  );
  if(shouldForceReset||shouldModeReset){
    const resetReason=shouldForceReset
      ?(resetCodexMemoryRequested?"memory_reset_requested":"force_new_session")
      :(state.lastSandboxMode&&state.lastSandboxMode!==sandboxMode
        ?"sandbox_changed"
        :((state.lastWebSearchMode&&state.lastWebSearchMode!==webSearchMode)
          ||(!state.lastWebSearchMode&&typeof state.lastWebSearch==="boolean"&&state.lastWebSearch!==webSearchEnabled)
          ?"web_search_changed"
          :((state.lastCwdKey||normalizeDirectoryPathIdentity(state.lastCwd))&&cwdKey&&(state.lastCwdKey||normalizeDirectoryPathIdentity(state.lastCwd))!==cwdKey
            ?"cwd_changed"
            :(state.lastRequestUserInputPolicy&&state.lastRequestUserInputPolicy!==requestUserInputPolicy
              ?"request_user_input_policy_changed"
              :(state.lastModel&&state.lastModel!==model
                ?"model_changed"
                :(state.lastModelReasoningEffort&&state.lastModelReasoningEffort!==modelReasoningEffort
                  ?"model_reasoning_effort_changed"
                  :(normalizeCodexMemoryMode(state.lastMemoryMode,"default")!==memoryMode
                    ?"memory_mode_changed"
                    :"mode_reset")))))));
    cleanupMemoryExtensions(state,{clearPlanning:true});
    logOperation("thread.reset",{
      a:safeString(agentName,80),
      reason:resetReason,
      sandbox:sandboxMode,
      approval:approvalPolicy,
      web:webSearchEnabled?1:0,
      webMode:webSearchMode,
      model:safeString(model,120),
      modelReasoningEffort,
      cwd:summarizePathForOperationLog(cwd,220),
      requestUserInputPolicy,
      fastModeEnabled:fastModeEnabled?1:0,
      automaticApprovalReviewEnabled:automaticApprovalReviewEnabled?1:0,
      memoryMode,
      resetCodexMemory:resetCodexMemoryRequested?1:0,
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
    state.lastWebSearch=webSearchEnabled;
    state.lastWebSearchMode=webSearchMode;
    state.lastFastModeEnabled=fastModeEnabled;
    state.lastAutomaticApprovalReviewEnabled=automaticApprovalReviewEnabled;
    state.lastCwd=cwd;
    state.lastCwdKey=cwdKey;
    state.lastMemoryMode=memoryMode;
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
        state.lastWebSearchMode=webSearchMode;
        state.lastCwd=cwd;
        state.lastCwdKey=cwdKey;
        state.lastRequestUserInputPolicy=requestUserInputPolicy;
        state.lastModel=model;
        state.lastModelReasoningEffort=modelReasoningEffort;
        state.lastFastModeEnabled=fastModeEnabled;
        state.lastAutomaticApprovalReviewEnabled=automaticApprovalReviewEnabled;
        state.lastMemoryMode=memoryMode;
        logOperation("thread.resume",{
          a:safeString(agentName,80),
          th:safeString(resumedId,120),
          sandbox:sandboxMode,
          approval:approvalPolicy,
          web:webSearchEnabled?1:0,
          webMode:webSearchMode,
          model:safeString(model,120),
          modelReasoningEffort,
          cwd:summarizePathForOperationLog(cwd,220),
          requestUserInputPolicy,
          fastModeEnabled:fastModeEnabled?1:0,
          automaticApprovalReviewEnabled:automaticApprovalReviewEnabled?1:0,
          memoryMode,
          resetCodexMemory:resetCodexMemoryRequested?1:0,
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

  const started=await appServer.sendRequest("thread/start",{cwd,approvalPolicy,sandbox:sandboxMode,config:buildThreadStartConfig(state,webSearchMode,requestUserInputPolicy,model,modelReasoningEffort,fastModeEnabled,automaticApprovalReviewEnabled),experimentalRawEvents:false},45000);
  const threadId=started&&started.thread&&typeof started.thread.id==="string"?started.thread.id:null;
  if(!threadId)throw new Error("thread/start did not return thread id");
  state.threadId=threadId;
  state.sessionRef=threadId;
  state.activeTurnId=null;
  state.manualSessionPinned=false;
  state.lastSandboxMode=sandboxMode;
  state.lastWebSearch=webSearchEnabled;
  state.lastWebSearchMode=webSearchMode;
  state.lastCwd=cwd;
  state.lastCwdKey=cwdKey;
  state.lastRequestUserInputPolicy=requestUserInputPolicy;
  state.lastModel=model;
  state.lastModelReasoningEffort=modelReasoningEffort;
  state.lastFastModeEnabled=fastModeEnabled;
  state.lastAutomaticApprovalReviewEnabled=automaticApprovalReviewEnabled;
  state.lastMemoryMode=memoryMode;
  logOperation("thread.start",{
    a:safeString(agentName,80),
    th:safeString(threadId,120),
    sandbox:sandboxMode,
    approval:approvalPolicy,
    web:webSearchEnabled?1:0,
    webMode:webSearchMode,
    model:safeString(model,120),
    modelReasoningEffort,
    cwd:summarizePathForOperationLog(cwd,220),
    requestUserInputPolicy,
    fastModeEnabled:fastModeEnabled?1:0,
    automaticApprovalReviewEnabled:automaticApprovalReviewEnabled?1:0,
    memoryMode,
    resetCodexMemory:resetCodexMemoryRequested?1:0,
  });
  return threadId;
}

async function executeTurnStreaming(res,prompt,agentName,options){
  const state=getOrCreateAgentState(agentName);
  const originalPrompt=safeString(prompt,defaultPromptCharLimit);
  const sandboxMode=normalizeSandboxMode(options&&options.sandboxMode);
  const approvalPolicy=normalizeApprovalPolicy(options&&options.approvalPolicy);
  const webSearchMode=normalizeWebSearchMode(options&&Object.prototype.hasOwnProperty.call(options||{},"webSearchMode")?options.webSearchMode:options&&options.webSearch,"disabled");
  const webSearchEnabled=isWebSearchEnabledForMode(webSearchMode);
  const model=normalizeExecModel(options&&options.model,defaultExecModelName);
  const modelReasoningEffort=normalizeExecModelReasoningEffort(options&&options.modelReasoningEffort,defaultExecModelReasoningEffort);
  const requestUserInputPolicy=normalizeRequestUserInputPolicy(options&&options.requestUserInputPolicy,nonInteractiveRequestUserInputPolicy);
  const cwd=normalizeWorkingDirectory(options&&options.cwd,workspaceRoot);
  const memoryMode=normalizeCodexMemoryMode(options&&options.memoryMode,state&&state.memoryMode);
  const resetCodexMemoryRequested=normalizeBooleanFlag(options&&options.resetCodexMemory);
  const fastModeEnabled=resolveFastModeEnabled(options&&options.fastModeEnabled,state&&state.fastModeEnabled);
  const automaticApprovalReviewEnabled=resolveAutomaticApprovalReviewEnabled(
    options&&options.automaticApprovalReviewEnabled,
    state&&state.automaticApprovalReviewEnabled
  );
  state.fastModeEnabled=fastModeEnabled;
  state.automaticApprovalReviewEnabled=automaticApprovalReviewEnabled;
  state.memoryMode=memoryMode;
  const gitAutomationIgnoredPaths=isPathWithin(workspaceRoot,cwd)?gitAutomationWorkspaceIgnoredPaths:[];
  const promptSummary=summarizeTextForOperationLog(originalPrompt,24000);
  const promptAuditSource=options&&options.promptAudit&&typeof options.promptAudit==="object"?options.promptAudit:{};
  const promptAudit={
    limit:Number.isFinite(Number(promptAuditSource.limit))?Math.max(0,Math.trunc(Number(promptAuditSource.limit))):defaultPromptCharLimit,
    inputLength:Number.isFinite(Number(promptAuditSource.inputLength))?Math.max(0,Math.trunc(Number(promptAuditSource.inputLength))):originalPrompt.length,
    outputLength:Number.isFinite(Number(promptAuditSource.outputLength))?Math.max(0,Math.trunc(Number(promptAuditSource.outputLength))):originalPrompt.length,
    truncated:Boolean(promptAuditSource.truncated),
  };
  const adversarialAttempt=Number.isFinite(Number(options&&options.adversarialAttempt))
    ?Math.max(0,Math.trunc(Number(options.adversarialAttempt)))
    :0;
  const adversarialRootPrompt=safeString(
    options&&typeof options.adversarialRootPrompt==="string"?options.adversarialRootPrompt:originalPrompt,
    defaultPromptCharLimit
  );
  const parentDispatchAttempt=Number.isFinite(Number(options&&options.parentDispatchAttempt))
    ?Math.max(0,Math.trunc(Number(options.parentDispatchAttempt)))
    :0;
  const parentDispatchRootPrompt=safeString(
    options&&typeof options.parentDispatchRootPrompt==="string"?options.parentDispatchRootPrompt:originalPrompt,
    defaultPromptCharLimit
  );
  const executionProfile=normalizeExecutionProfile(options&&options.executionProfile,runtimeExecutionProfile);
  const executionIntent=normalizeExecutionIntent(options&&options.executionIntent,"interactive");
  let planningContext=sanitizePlanningArtifactsForRuntime(
    options&&options.planningContext&&typeof options.planningContext==="object"
      ?options.planningContext
      :buildPlanningArtifacts({
        prompt:originalPrompt,
        options:{
          ...options,
          intentProfile:getActiveIntentProfileForRuntime(),
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
  const designSensitivePrompt=isDesignSensitiveRequest({
    prompt:originalPrompt,
    contract:designAcceptanceContract,
  });
  const intentDirectedPrompt=prependIntentDirectivesForRuntime(originalPrompt,{
    executionIntent,
    executionProfile,
    designSensitive:designSensitivePrompt,
  });
  const externalLearningPolicy=buildResolvedOpenAIBlogLearningPolicy();
  const externalLearningRetrieval=buildRuntimePromptInjection({
    prompt:intentDirectedPrompt,
    agentName,
    planningContext,
    policy:externalLearningPolicy,
  });
  rememberOpenAIBlogLearningRetrievalDecision({
    ...externalLearningRetrieval,
    agentName,
  });
  const effectivePrompt=typeof externalLearningRetrieval.prompt==="string"&&externalLearningRetrieval.prompt
    ?externalLearningRetrieval.prompt
    :intentDirectedPrompt;
  promptAudit.outputLength=Math.max(promptAudit.outputLength,effectivePrompt.length);
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
    webSearchMode,
    executionSource:safeString(options&&options.executionSource,80)||"api_exec",
    planningContext,
  });
  const turnStats=createTurnStreamStats();

  logOperation("turn.prepare",{
    a:safeString(agentName,80),
    sandbox:sandboxMode,
    approval:approvalPolicy,
    web:webSearchEnabled?1:0,
    webMode:webSearchMode,
    model:safeString(model,120),
    modelReasoningEffort,
    requestUserInputPolicy,
    memoryMode,
    resetCodexMemory:resetCodexMemoryRequested?1:0,
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
    threadId=await ensureAgentThread(agentName,{sandboxMode,approvalPolicy,webSearch:webSearchEnabled,webSearchMode,model,modelReasoningEffort,cwd,forceNewSession:Boolean(options&&options.forceNewSession),requestUserInputPolicy,memoryMode,resetCodexMemory:resetCodexMemoryRequested,fastModeEnabled,automaticApprovalReviewEnabled});
  }catch(error){
    logOperation("turn.prepare_failed",{
      a:safeString(agentName,80),
      err:summarizeErrorForOperationLog(error,220),
    });
    replyLocalText(res,`[error] ${error.message}`);
    return;
  }

  const images=options&&Array.isArray(options.images)?options.images:[];
  const inputCandidates=buildTurnInputCandidates(effectivePrompt,images);
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
    memoryMode,
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
    prompt:effectivePrompt,
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
      memoryMode,
      resetCodexMemory:resetCodexMemoryRequested?1:0,
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
      externalLearning:{
        status:safeString(externalLearningRetrieval.status,24)||"SKIPPED",
        reason:safeString(externalLearningRetrieval.reason,120)||"",
        applied:externalLearningRetrieval.applied?1:0,
        shadowMode:externalLearningRetrieval.shadowMode?1:0,
        promptBlockChars:Number.isFinite(Number(externalLearningRetrieval.promptBlockChars))?Math.max(0,Math.trunc(Number(externalLearningRetrieval.promptBlockChars))):0,
        matchedTopics:Array.isArray(externalLearningRetrieval.matchedTopics)?externalLearningRetrieval.matchedTopics:[],
        matchedHintIds:Array.isArray(externalLearningRetrieval.matchedHintIds)?externalLearningRetrieval.matchedHintIds:[],
        articles:Array.isArray(externalLearningRetrieval.articles)
          ?externalLearningRetrieval.articles.map((entry)=>({
            articleId:safeString(entry&&entry.articleId,120)||"",
            title:safeString(entry&&entry.title,200)||"",
            matchedTopics:Array.isArray(entry&&entry.matchedTopics)?entry.matchedTopics.slice(0,4):[],
          }))
          :[],
      },
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
    prompt:safeString(effectivePrompt,replayPromptMaxChars),
    promptSha256:hashSha256Hex(effectivePrompt),
    operatorPromptSha256:hashSha256Hex(originalPrompt),
    sandboxMode:safeString(sandboxMode,40)||"workspace-write",
    approvalPolicy:safeString(approvalPolicy,40)||"never",
    webSearch:webSearchEnabled?1:0,
    model:safeString(model,120)||defaultExecModelName,
    modelReasoningEffort,
    agentName:safeString(agentName,120)||defaultExecAgentName,
    cwd:safeString(cwd,220)||workspaceRoot,
    requestUserInputPolicy,
    memoryMode,
    resetCodexMemory:resetCodexMemoryRequested?1:0,
    forceNewSession:options&&options.forceNewSession?1:0,
    executionProfile:turnVisibility&&turnVisibility.profile?safeString(turnVisibility.profile.effective,60):runtimeExecutionProfile,
    executionIntent:safeString(turnVisibility&&turnVisibility.intent?turnVisibility.intent:"interactive",80)||"interactive",
    executionSource:safeString(options&&options.executionSource?options.executionSource:"api_exec",80)||"api_exec",
    recipeHash:turnVisibility&&turnVisibility.recipe?safeString(turnVisibility.recipe.hash,80):"",
    planningMode:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedMode,40)||"NORMAL",
    planningDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedPlanningDepth,60)||"STANDARD_PLANNING",
    assuranceDepth:safeString(planningContext&&planningContext.selection&&planningContext.selection.selectedAssuranceDepth,60)||"STANDARD_ASSURANCE",
    flowPath:safeString(planningContext&&planningContext.selection&&planningContext.selection.flowPath,80)||"NORMAL_PATH",
    externalLearning:{
      status:safeString(externalLearningRetrieval.status,24)||"SKIPPED",
      reason:safeString(externalLearningRetrieval.reason,120)||"",
      applied:externalLearningRetrieval.applied?1:0,
      shadowMode:externalLearningRetrieval.shadowMode?1:0,
      promptBlockChars:Number.isFinite(Number(externalLearningRetrieval.promptBlockChars))?Math.max(0,Math.trunc(Number(externalLearningRetrieval.promptBlockChars))):0,
      matchedTopics:Array.isArray(externalLearningRetrieval.matchedTopics)?externalLearningRetrieval.matchedTopics:[],
      matchedHintIds:Array.isArray(externalLearningRetrieval.matchedHintIds)?externalLearningRetrieval.matchedHintIds:[],
      articleIds:Array.isArray(externalLearningRetrieval.articles)
        ?externalLearningRetrieval.articles.map((entry)=>safeString(entry&&entry.articleId,120)).filter(Boolean)
        :[],
    },
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
  if(externalLearningRetrieval&&safeString(externalLearningRetrieval.status,24)&&safeString(externalLearningRetrieval.status,24)!=="skipped"){
    const modeLabel=externalLearningRetrieval.applied?"applied":"shadow";
    safeWriteEvent({
      type:"activity",
      label:"external_learning",
      detail:`external learning ${modeLabel} / topics=${Array.isArray(externalLearningRetrieval.matchedTopics)?externalLearningRetrieval.matchedTopics.join("|"):"-"} / articles=${Array.isArray(externalLearningRetrieval.articles)?externalLearningRetrieval.articles.length:0}`,
    });
  }
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
    const normalizedStatus=normalizeExecutionState(turnStatus,{terminalFallback:true});
    let finalStatus=normalizedStatus==="in_progress"?"failed":normalizedStatus;
    let finalErrorText=safeString(maybeErrorText||errorText,4000);
    clearLiveCollabChildActivityForTurn(turnId,{
      status:finalStatus,
      detail:finalStatus==="completed"
        ?"parent turn completed; cleared child activity"
        :"parent turn "+finalStatus+"; cleared child activity",
    });
    state.activeTurnId=null;
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
      mcpWallTimeMs:turnStats.mcpWallTimeMs,
      mcpPerServerCounts:turnStats.mcpPerServerCounts,
      mcpNamespaces:turnStats.mcpNamespaces,
      mcpSandboxStates:turnStats.mcpSandboxStates,
      mcpParallelSafeCallCount:turnStats.mcpParallelSafeCallCount,
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
    const systemCoherenceReview=evaluateSystemCoherenceReview({
      prompt,
      changedPaths:Array.isArray(observedSignals.sampleChangedPaths)?observedSignals.sampleChangedPaths:[],
      sampleCommands:Array.isArray(turnStats&&turnStats.sampleCommands)?turnStats.sampleCommands:[],
      docSyncEvidence,
      contract:systemCoherenceReviewContract,
    });
    debugFinalize("after_system_coherence_review");
    const proposalOnly=Boolean(planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.proposalOnly);
    const reviewerEvidenceRequired=!proposalOnly&&Boolean(planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.reviewerRequired);
    const testerEvidenceRequired=!proposalOnly&&Boolean(planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.testerRequired);
    const dedicatedTestsRequired=!proposalOnly&&Boolean(planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.dedicatedTestsRequired);
    const missingRequiredEvidence=[];
    if(systemCoherenceReview.required&&!systemCoherenceReview.commandObserved){
      missingRequiredEvidence.push("system_coherence_review_missing");
    }
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
      if(!finalErrorText)finalErrorText="[needs_input] waiting on user input; reply with the missing information, approval, or decision to continue";
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
    let explicitTaskOutcomeStatus=planningNeedsInput
      ?"NEEDS_INPUT"
      :(familyCompletionGate.applies&&familyCompletionGate.status==="failed_validation"?"FAILED_VALIDATION":"");
    let explicitTaskOutcomeReason=planningNeedsInput
      ?(safeString(planningContext&&planningContext.selection&&planningContext.selection.signals&&planningContext.selection.signals.clarificationAction,40)==="ask_user_once"
        ?"clarification_required_before_implementation"
        :"interactive_approval_unavailable")
      :(familyCompletionGate.applies&&familyCompletionGate.status==="failed_validation"
        ?safeString(familyCompletionGate.missingHard&&familyCompletionGate.missingHard[0]&&familyCompletionGate.missingHard[0].reason,120)||"family_completion_gate_failed"
        :"");
    if(!explicitTaskOutcomeReason&&missingRequiredEvidence.includes("system_coherence_review_missing")){
      explicitTaskOutcomeStatus="FAILED_VALIDATION";
      explicitTaskOutcomeReason="system_coherence_review_missing";
    }
    const revisionProposalTexts=[
      {text:authoritativeFinalText,fallbackAgent:agentName},
      ...observedItemRecords.flatMap((record)=>{
        const item=record&&record.item&&typeof record.item==="object"?record.item:{};
        const entries=[];
        if(item.type==="agentMessage"&&typeof item.text==="string"){
          entries.push({text:item.text,fallbackAgent:agentName});
        }
        const childTrace=buildAgentDispatchTrace(item,agentName);
        const fallbackAgent=safeString(childTrace&&childTrace.child,80)||agentName;
        for(const message of extractCollabStateMessages(item,8)){
          entries.push({text:message,fallbackAgent});
        }
        return entries;
      }),
    ];
    const observedRevisionProposals=collectRequirementRevisionProposalsFromTexts(revisionProposalTexts,{
      fallbackAgent:agentName,
    });
    let runtimeRevisionGate=buildRuntimeRevisionGateDecision({
      activeRevisionProposal:planningContext&&planningContext.requirementContract?planningContext.requirementContract.activeRevisionProposal:null,
      revisionGate:planningContext&&planningContext.requirementContract?planningContext.requirementContract.revisionGate:null,
      observedRevisionProposals,
      agentName,
      ownerAgent:safeString(planningContext&&planningContext.requirementContract&&planningContext.requirementContract.owner,80)||"intake",
    });
    if(runtimeRevisionGate.status==="BLOCK"||runtimeRevisionGate.status==="RETURN_TO_INTAKE"){
      const currentRequirement=planningContext&&planningContext.requirementContract&&typeof planningContext.requirementContract==="object"
        ?planningContext.requirementContract
        :null;
      if(currentRequirement){
        const nextRequirement={
          ...currentRequirement,
          activeRevisionProposal:sanitizeRequirementRevisionProposal(runtimeRevisionGate.proposal,{
            fallbackAgent:agentName,
            fallbackStatus: runtimeRevisionGate.status==="RETURN_TO_INTAKE" ? "pending" : "",
          }),
          revisionGate:sanitizeRequirementRevisionGate({
            ...currentRequirement.revisionGate,
            status:runtimeRevisionGate.status==="RETURN_TO_INTAKE"?"pending_intake_confirmation":"proposal_required",
            reason:runtimeRevisionGate.status==="RETURN_TO_INTAKE"
              ?"Downstream requested a locked requirement revision. Intake must issue the revised contract version before downstream work continues."
              :"Locked requirement meaning changed downstream without a revision proposal.",
            authoritativeOwner:safeString(currentRequirement.owner,80)||"intake",
            currentAgent:safeString(agentName,80).toLowerCase()||"",
            blockingProposalId:runtimeRevisionGate.proposal&&runtimeRevisionGate.proposal.proposalId?runtimeRevisionGate.proposal.proposalId:"",
            returnToIntake:runtimeRevisionGate.status==="RETURN_TO_INTAKE",
            changedFields:Array.isArray(runtimeRevisionGate.proposal&&runtimeRevisionGate.proposal.changedFields)
              ?runtimeRevisionGate.proposal.changedFields
              :[],
          },{
            fallbackOwner:safeString(currentRequirement.owner,80)||"intake",
            fallbackAgent:agentName,
            fallbackStatus:runtimeRevisionGate.status==="RETURN_TO_INTAKE"?"pending_intake_confirmation":"proposal_required",
          }),
        };
        planningContext=sanitizePlanningArtifactsForRuntime({
          ...planningContext,
          requirementContract:nextRequirement,
        });
        state.lastPlanningContext=planningContext;
        turnRecord.planningContext=planningContext;
      }
      if(finalStatus==="completed"){
        finalStatus=runtimeRevisionGate.enforceFinalStatus||finalStatus;
        explicitTaskOutcomeStatus=runtimeRevisionGate.taskOutcomeStatus||explicitTaskOutcomeStatus;
        explicitTaskOutcomeReason=runtimeRevisionGate.taskOutcomeReason||explicitTaskOutcomeReason;
        if(!finalErrorText){
          finalErrorText=runtimeRevisionGate.status==="RETURN_TO_INTAKE"
            ?"[blocked] return to intake to confirm the locked requirement revision proposal"
            :"[error] locked requirement rewrite attempted without a revision proposal";
        }
        safeWriteEvent({
          type:"activity",
          label:runtimeRevisionGate.status==="RETURN_TO_INTAKE"?"runtime_revision_proposal_pending":"runtime_revision_gate_block",
          detail:safeString(finalErrorText,1200),
        });
      }
    }
    let postLockDriftSnapshot=buildPostLockDriftSnapshot({planningContext,agentName});
    if(
      !proposalOnly
      &&finalStatus==="completed"
      &&(postLockDriftSnapshot.status==="FAIL"||postLockDriftSnapshot.status==="LOCK_INCOMPLETE")
    ){
      const driftNeedsReturn=observedRevisionProposals.length>0;
      finalStatus=driftNeedsReturn?"interrupted":"failed";
      explicitTaskOutcomeStatus=driftNeedsReturn?"BLOCKED":"FAILED_VALIDATION";
      explicitTaskOutcomeReason=driftNeedsReturn?"return_to_intake_required":"runtime_post_lock_drift_failed";
      if(!finalErrorText){
        finalErrorText=driftNeedsReturn
          ?"[blocked] downstream drift requires intake revision before completion"
          :`[error] runtime post-lock drift detected (${postLockDriftSnapshot.reason||"downstream_clause_gap"})`;
      }
      safeWriteEvent({
        type:"activity",
        label:driftNeedsReturn?"runtime_post_lock_drift_return_to_intake":"runtime_post_lock_drift_block",
        detail:safeString(finalErrorText,1200),
      });
    }
    const buildCurrentTaskOutcome=()=>deriveTurnTaskOutcome({
      finalStatus,
      finalErrorText,
      approvalAudits:approvalAuditTrail,
      parentDispatchGuard,
      explicitStatus:explicitTaskOutcomeStatus,
      reason:explicitTaskOutcomeReason,
      missingEvidence:missingRequiredEvidence.length>0,
      prompt,
    });
    const buildCurrentAcceptanceResults=(taskOutcomeStatus)=>buildAcceptanceCheckResults({
      requirementContract:planningContext&&planningContext.requirementContract?planningContext.requirementContract:null,
      observedSignals,
      taskOutcomeStatus,
      needsInputRecommended:planningContext&&planningContext.selection&&planningContext.selection.needsInputRecommended,
      docSyncEvidence,
      childEvidenceLedger,
      familyCompletionGate,
    });
    let taskOutcome=buildCurrentTaskOutcome();
    let acceptanceResults=buildCurrentAcceptanceResults(taskOutcome.status);
    let clauseCompletionScorecard=buildClauseCompletionScorecard({
      clauses:buildPlanningTraceabilityData({planningContext,agentName}).clauses,
      acceptanceResults,
      postLockDrift:postLockDriftSnapshot,
      finalStatus,
      taskOutcomeStatus:taskOutcome.status,
      docSyncEvidence,
      childEvidenceLedger,
    });
    if(!proposalOnly&&finalStatus==="completed"&&clauseCompletionScorecard.status==="FAIL"){
      finalStatus="failed";
      explicitTaskOutcomeStatus="FAILED_VALIDATION";
      explicitTaskOutcomeReason="release_clause_unsatisfied";
      if(!finalErrorText){
        finalErrorText="[error] one or more core request clauses remain unsatisfied at release";
      }
      safeWriteEvent({
        type:"activity",
        label:"release_clause_scorecard_block",
        detail:safeString(finalErrorText,1200),
      });
      taskOutcome=buildCurrentTaskOutcome();
      acceptanceResults=buildCurrentAcceptanceResults(taskOutcome.status);
      clauseCompletionScorecard=buildClauseCompletionScorecard({
        clauses:buildPlanningTraceabilityData({planningContext,agentName}).clauses,
        acceptanceResults,
        postLockDrift:postLockDriftSnapshot,
        finalStatus,
        taskOutcomeStatus:taskOutcome.status,
        docSyncEvidence,
        childEvidenceLedger,
      });
    }
    const evidenceSummary={
      passCount:acceptanceResults.filter((entry)=>entry&&entry.status==="PASS").length,
      failCount:acceptanceResults.filter((entry)=>entry&&entry.status==="FAIL").length,
      skippedCount:acceptanceResults.filter((entry)=>entry&&entry.status==="SKIPPED").length,
      total:acceptanceResults.length,
    };
    turnRecord.status=finalStatus;
    setTurnTerminalState(turnRecord,finalStatus,{terminalEvent:"turn/completed",errorText:finalErrorText});
    debugFinalize("after_outcome_terminal_state");
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
      postLockDriftSnapshot,
      runtimeRevisionGate,
      clauseCompletionScorecard,
      systemCoherenceReview,
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
      requirementValidation:planningContext&&planningContext.requirementContract&&planningContext.requirementContract.validation?planningContext.requirementContract.validation:null,
      dispatchPlan:planningContext&&planningContext.dispatchPlan?planningContext.dispatchPlan:null,
      acceptanceChecks:acceptanceResults,
      acceptanceSummary:evidenceSummary,
      runtimeRevisionGate,
      clauseCompletionScorecard,
      postLockDrift:postLockDriftSnapshot,
      docSyncEvidence,
      systemCoherenceReview,
      childEvidenceLedger,
      familyCompletionGate,
      reviewLoadBreakdown,
      residualRiskSummary:Array.from(new Set([
        ...(Array.isArray(planningContext&&planningContext.dispatchPlan&&planningContext.dispatchPlan.residualRisks)?planningContext.dispatchPlan.residualRisks:[]),
        ...missingRequiredEvidence,
      ])).slice(0,16),
      requiredEvidenceFailures:missingRequiredEvidence,
      evidenceSources:["events.ndjson","items.ndjson","manifest.json","requirement_validation.json","evidence_manifest.json","stage_timeline.json","flow_trace_summary.json","review_load_breakdown.json","review_bundle.json","adoption_readiness_eval.json","iteration_decision.json","escalation_decision.json","release_decision.json"],
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
      clauseCompletionScorecard,
      runtimeRevisionGate,
      postLockDrift:postLockDriftSnapshot,
    };
    const evidenceContractSpec=loadConstitutionConfigJson("evidence_contract.json");
    const routingDecision=buildRoutingDecision({
      selection:planningContext&&planningContext.selection?planningContext.selection:{},
      dispatchPlan:planningContext&&planningContext.dispatchPlan?planningContext.dispatchPlan:{},
      evidenceContract:evidenceContractSpec,
    });
    const taskOutcomesArtifact=buildTaskOutcomesArtifact({
      childEvidenceLedger,
      finalOutcome:currentTurnSummaryForConformance.finalOutcome,
      acceptanceResults,
      changedPaths:currentTurnSummaryForConformance.changedPaths,
      evidenceRefs:["evidence_manifest.json","flow_trace_summary.json","review_load_breakdown.json"],
      turnId:turnRecord.turnId,
    });
    const turnGovernanceBundle=buildTurnGovernanceBundle({
      acceptanceResults,
      childEvidenceLedger,
      missingRequiredEvidence,
      currentTurnSummary:currentTurnSummaryForConformance,
      clauseCompletionScorecard,
      evidenceContractSpec,
      iterationControlContract,
      adoptionReadinessContract,
      observedStepCount:Math.max(0,observedStreamEvents.length+observedItemRecords.length),
      startedAt:turnRecord.startedAt,
      now:Date.now(),
      threadId:turnRecord.threadId,
      finalStatus,
      taskOutcomeStatus:taskOutcome.status,
      selection:planningContext&&planningContext.selection?planningContext.selection:{},
      requirementContract:planningContext&&planningContext.requirementContract?planningContext.requirementContract:{},
      dispatchPlan:planningContext&&planningContext.dispatchPlan?planningContext.dispatchPlan:{},
      buildReviewBundle,
      buildReleaseDecision,
      buildConformanceReport,
    });
    const reviewBundle=turnGovernanceBundle.reviewBundle;
    const adoptionReadinessEval=turnGovernanceBundle.adoptionReadinessEval;
    const iterationDecision=turnGovernanceBundle.iterationDecision;
    const escalationDecision=turnGovernanceBundle.escalationDecision;
    const releaseDecision=turnGovernanceBundle.releaseDecision;
    const conformanceReport=turnGovernanceBundle.conformanceReport;
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
    turnRecord.runtimeRevisionGate=runtimeRevisionGate;
    turnRecord.postLockDrift=postLockDriftSnapshot;
    turnRecord.clauseCompletionScorecard=clauseCompletionScorecard;
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
    try{
      recordOpenAIBlogLearningObservation({
        policy:buildResolvedOpenAIBlogLearningPolicy(),
        turnId,
        threadId,
        agentName,
        finalStatus,
        taskOutcomeStatus:taskOutcome.status,
        planningContext,
        familyCompletionGate,
        externalLearning:externalLearningRetrieval,
        now:Date.now(),
      });
    }catch(error){
      logOperation("openai_blog_learning.observation_failed",{
        turn:safeString(turnId,120),
        err:summarizeErrorForOperationLog(error,220),
      });
    }
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
      mcp:{
        count:turnStats.mcpCalls,
        samples:turnStats.sampleMcpTools.slice(0,3),
        wallTimeMs:turnStats.mcpWallTimeMs,
        perServerCounts:turnStats.mcpPerServerCounts&&typeof turnStats.mcpPerServerCounts==="object"?turnStats.mcpPerServerCounts:{},
        namespaces:Array.isArray(turnStats.mcpNamespaces)?turnStats.mcpNamespaces.slice(0,6):[],
        sandboxStates:Array.isArray(turnStats.mcpSandboxStates)?turnStats.mcpSandboxStates.slice(0,6):[],
        parallelSafeCalls:turnStats.mcpParallelSafeCallCount,
      },
      memory:{mode:memoryMode,resetRequested:resetCodexMemoryRequested?1:0},
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
        adoptionReadinessEval,
        iterationDecision,
        escalationDecision,
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
        turnRecord.adoptionReadinessEvalPath=artifactResult.adoptionReadinessEvalPath||null;
        turnRecord.iterationDecisionPath=artifactResult.iterationDecisionPath||null;
        turnRecord.escalationDecisionPath=artifactResult.escalationDecisionPath||null;
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
    try{
      syncGovernedMemoryGraphFromLiveRuntime("turn_finalized");
    }catch(error){
      logOperation("governed_memory.sync_failed",{
        reason:"turn_finalized",
        err:summarizeErrorForOperationLog(error,220),
      },"core");
    }
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

    const clientFinalText=rewriteClientFinalTextForOutcome(authoritativeFinalText,{taskOutcomeStatus:taskOutcome.status,prompt});
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

  const keepRunningAfterClientClose=shouldKeepExecRunningAfterClientClose(
    safeString(options&&options.executionSource,80)
  );
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
  let localSlashTerminalEmitted=false;
  const emitLocalSlashTerminal=(command,status="completed",errorText="")=>{
    if(localSlashTerminalEmitted)return;
    localSlashTerminalEmitted=true;
    if(!normalized||typeof normalized.onTerminal!=="function")return;
    const terminalStatus=normalizeExecutionState(status,{terminalFallback:true});
    try{
      normalized.onTerminal({
        status:terminalStatus,
        error:terminalStatus==="completed"?"":safeString(errorText,500),
        taskOutcomeStatus:terminalStatus==="completed"?"COMPLETED":"FAILED_VALIDATION",
        taskOutcomeReason:terminalStatus==="completed"?"local_slash_command_completed":"local_slash_command_failed",
        threadId:"",
        turnId:"",
        agentName:targetAgentName,
        executionProfile:normalizeExecutionProfile(normalized.executionProfile,runtimeExecutionProfile),
        executionIntent:normalizeExecutionIntent(normalized.executionIntent,"interactive"),
        executionSource:safeString(normalized.executionSource,80)||"api_exec",
        artifactDir:"",
        artifactManifestPath:"",
        artifactManifestSha256:"",
        slashCommand:safeString(command,80),
      });
    }catch{
    }
  };
  if(!normalized.disableSlashRouter&&isSlashCommand(prompt)){
    const {command,argsText}=parseSlashPrompt(prompt);
    logOperation("slash.command",{
      a:safeString(targetAgentName,80),
      cmd:safeString(command,80),
    });
    if(command==="/help"){
      handleSlashHelpCommand(res);
      emitLocalSlashTerminal(command);
      return;
    }
    if(command==="/status"){
      handleSlashStatusCommand(res,targetAgentName,sandboxMode,normalized);
      emitLocalSlashTerminal(command);
      return;
    }
    if(command==="/diff"){
      handleSlashDiffCommand(res,normalized);
      emitLocalSlashTerminal(command);
      return;
    }
    if(command==="/agent"){
      handleSlashAgentCommand(res,argsText);
      emitLocalSlashTerminal(command);
      return;
    }
    if(command==="/experimental"){
      handleSlashExperimentalCommand(res,argsText);
      emitLocalSlashTerminal(command);
      return;
    }
    if(command==="/fast"){
      handleSlashFastCommand(res,argsText);
      emitLocalSlashTerminal(command);
      return;
    }
    if(command==="/goal"){
      await handleSlashGoalCommand(res,argsText,targetAgentName,sandboxMode,normalized);
      emitLocalSlashTerminal(command);
      return;
    }
    if(command==="/resume"){
      handleSlashResumeCommand(res,argsText);
      emitLocalSlashTerminal(command);
      return;
    }
    if(command==="/fork"){
      handleSlashForkCommand(res,argsText);
      emitLocalSlashTerminal(command);
      return;
    }
    if(command==="/mention"){
      const mention=parseMentionArgs(argsText);
      if(!mention||!mention.targetPath){
        replyLocalText(res,"Usage: /mention <path> [message]");
        emitLocalSlashTerminal(command);
        return;
      }
      const resolved=resolveMentionPath(mention.targetPath);
      if(!resolved){
        replyLocalText(res,`Path not found in workspace: ${mention.targetPath}`);
        emitLocalSlashTerminal(command);
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
    handleUnsupportedSlashCommand(res,command);
    emitLocalSlashTerminal(command);
    return;
  }
  await executeTurnStreaming(res,prompt,targetAgentName,{
    sandboxMode,
    approvalPolicy:normalizeApprovalPolicy(normalized.approvalPolicy),
    webSearch:normalizeBooleanFlag(normalized.webSearch),
    webSearchMode:normalizeWebSearchMode(Object.prototype.hasOwnProperty.call(normalized,"webSearchMode")?normalized.webSearchMode:normalized.webSearch,"disabled"),
    fastModeEnabled:resolveFastModeEnabled(normalized.fastModeEnabled),
    automaticApprovalReviewEnabled:resolveAutomaticApprovalReviewEnabled(normalized.automaticApprovalReviewEnabled),
    model:normalizeExecModel(normalized.model,defaultExecModelName),
    modelReasoningEffort:normalizeExecModelReasoningEffort(normalized.modelReasoningEffort,defaultExecModelReasoningEffort),
    cwd:normalizeWorkingDirectory(normalized.cwd,workspaceRoot),
    requestUserInputPolicy:normalizeRequestUserInputPolicy(normalized.requestUserInputPolicy,nonInteractiveRequestUserInputPolicy),
    memoryMode:normalizeCodexMemoryMode(normalized.memoryMode,"default"),
    resetCodexMemory:normalizeBooleanFlag(normalized.resetCodexMemory),
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
function stripWindowsExtendedLengthPathPrefix(value){
  const raw=safeString(value,4000);
  if(process.platform!=="win32"||!raw)return raw;
  if(raw.startsWith("\\\\?\\UNC\\"))return`\\\\${raw.slice(8)}`;
  if(raw.startsWith("\\\\?\\"))return raw.slice(4);
  return raw;
}
function trimTrailingDirectorySeparators(value){
  let normalized=safeString(value,4000);
  if(!normalized)return"";
  const parsed=path.parse(normalized);
  const root=safeString(parsed&&parsed.root,400)||"";
  while(normalized.length>root.length&&/[\\/]+$/.test(normalized)){
    normalized=normalized.slice(0,-1);
  }
  return normalized;
}
function normalizeDirectoryPathForRuntime(value){
  const raw=safeString(value,4000);
  if(!raw)return"";
  const withoutPrefix=stripWindowsExtendedLengthPathPrefix(raw);
  return trimTrailingDirectorySeparators(path.normalize(withoutPrefix));
}
function normalizeDirectoryPathIdentity(value){
  const normalized=normalizeDirectoryPathForRuntime(value);
  if(!normalized)return"";
  return process.platform==="win32"?normalized.toLowerCase():normalized;
}
function normalizeWorkingDirectory(value,fallbackCwd=workspaceRoot){
  const raw=normalizeOptionalString(value,2000);
  const fallback=normalizeDirectoryPathForRuntime(fallbackCwd||workspaceRoot)||workspaceRoot;
  const resolved=raw
    ?path.resolve(stripWindowsExtendedLengthPathPrefix(raw))
    :path.resolve(fallback);
  const normalized=normalizeDirectoryPathForRuntime(resolved);
  if(!fs.existsSync(normalized))throw new Error(`cwd does not exist: ${normalized}`);
  const stat=fs.statSync(normalized);
  if(!stat.isDirectory())throw new Error(`cwd is not a directory: ${normalized}`);
  return normalized;
}
function isLoopbackAddress(value){
  const normalized=String(value||"").trim().toLowerCase();
  return normalized==="::1"||normalized==="[::1]"||normalized==="127.0.0.1"||normalized==="::ffff:127.0.0.1";
}
function validateLocalAppBridgeRequest(req){
  const originValidation=validateLocalOriginRequest(req);
  if(originValidation.ok)return originValidation;
  const remoteAddress=req&&req.socket&&req.socket.remoteAddress?req.socket.remoteAddress:"";
  if(isLoopbackAddress(remoteAddress)){
    return{ok:true,status:200,error:""};
  }
  return originValidation;
}
function normalizeAppRuntimeTimeoutMs(value,fallback=180000){
  const parsed=Number.parseInt(String(value||"").trim(),10);
  if(!Number.isFinite(parsed)||parsed<5000)return fallback;
  return Math.min(parsed,300000);
}
function getRegisteredAppRuntimeConfig(appId){
  return findAppById(appRegistry,appId);
}
function resolveAppRuntimeWorkingDirectory(app){
  if(app&&app.workingDirectory){
    try{
      return normalizeWorkingDirectory(app.workingDirectory,workspaceRoot);
    }catch{
    }
  }
  return workspaceRoot;
}
async function buildHarnessAppRuntimeStatus(app){
  const cwd=resolveAppRuntimeWorkingDirectory(app);
  try{
    await assertCodexReady(cwd);
    return{
      ready:true,
      provider:"harness-codex-exec",
      model:conversationExecModelName,
      cwd:summarizePathForOperationLog(cwd,220),
      error:"",
    };
  }catch(error){
    return{
      ready:false,
      provider:"harness-codex-exec",
      model:conversationExecModelName,
      cwd:summarizePathForOperationLog(cwd,220),
      error:safeString(error&&error.message?error.message:String(error),220),
    };
  }
}
function sanitizeForwardedHeaders(headers,targetUrl,req){
  const nextHeaders={};
  for(const [key,value] of Object.entries(headers||{})){
    const lowerKey=String(key||"").toLowerCase();
    if(lowerKey==="host"||lowerKey==="content-length"||lowerKey==="connection")continue;
    nextHeaders[key]=value;
  }
  nextHeaders.host=targetUrl.host;
  nextHeaders["x-forwarded-host"]=requestHeaderValue(req,"host")||"";
  nextHeaders["x-forwarded-proto"]="http";
  nextHeaders["x-forwarded-prefix"]=safeString(req&&req.__proxyMountPath?req.__proxyMountPath:"",240);
  return nextHeaders;
}
async function proxyConfiguredAppRequest(req,res,forward,requestUrl){
  let targetUrl;
  try{
    targetUrl=new URL(forward.baseUrl);
  }catch{
    sendJson(res,502,{ok:false,error:"invalid app proxy base url"});
    return;
  }
  targetUrl.pathname=forward.targetPath;
  targetUrl.search=requestUrl.search||"";
  const transport=targetUrl.protocol==="https:"?https:http;
  await new Promise((resolve,reject)=>{
    const upstream=transport.request({
      protocol:targetUrl.protocol,
      hostname:targetUrl.hostname,
      port:targetUrl.port?Number(targetUrl.port):undefined,
      method:req.method,
      path:`${targetUrl.pathname}${targetUrl.search}`,
      headers:sanitizeForwardedHeaders(req.headers,targetUrl,req),
    },(upstreamRes)=>{
      res.writeHead(
        Number.isFinite(Number(upstreamRes.statusCode))?Math.trunc(Number(upstreamRes.statusCode)):502,
        upstreamRes.headers||{}
      );
      upstreamRes.pipe(res);
      upstreamRes.on("end",resolve);
    });
    upstream.on("error",reject);
    req.on("aborted",()=>{
      upstream.destroy();
    });
    req.pipe(upstream);
  }).catch((error)=>{
    if(!res.writableEnded){
      sendJson(res,502,{ok:false,error:safeString(error&&error.message?error.message:String(error),220)||"app proxy failed"});
    }
  });
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
function sanitizeJsonValue(value,depth=0){
  if(value===null||value===undefined)return null;
  if(depth>6)return"[max-depth]";
  const valueType=typeof value;
  if(valueType==="string")return safeString(value,4000);
  if(valueType==="number"||valueType==="boolean")return value;
  if(Array.isArray(value)){
    return value.slice(0,40).map((entry)=>sanitizeJsonValue(entry,depth+1));
  }
  if(valueType==="object"){
    const out={};
    for(const [key,entry] of Object.entries(value).slice(0,80)){
      const normalizedKey=safeString(String(key||""),120);
      if(!normalizedKey)continue;
      out[normalizedKey]=sanitizeJsonValue(entry,depth+1);
    }
    return out;
  }
  return safeString(String(value),4000);
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
function deriveTurnTaskOutcome({finalStatus,finalErrorText,approvalAudits,parentDispatchGuard,explicitStatus="",reason="",partial=false,missingEvidence=false,prompt=""}={}){
  const declinedAudit=findLatestDeclinedApprovalAudit(approvalAudits);
  return deriveTaskOutcome({
    turnStatus:finalStatus,
    explicitStatus,
    reason,
    prompt,
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
    runtime_revision_gate:record.runtimeRevisionGate&&typeof record.runtimeRevisionGate==="object"?record.runtimeRevisionGate:null,
    post_lock_drift:record.postLockDrift&&typeof record.postLockDrift==="object"?record.postLockDrift:null,
    clause_completion_scorecard:record.clauseCompletionScorecard&&typeof record.clauseCompletionScorecard==="object"?record.clauseCompletionScorecard:null,
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
function buildRequirementFoundationV1PhaseStatus(){
  const auditReportPath=repoRelativePath(workspaceRoot,requirementFoundationV1PhaseExitPath);
  const markdownReportPath=repoRelativePath(workspaceRoot,requirementFoundationV1PhaseExitMarkdownPath);
  const fallback={
    requirementFoundationV1:"not_done",
    completedAt:"",
    auditReportPath,
    markdownReportPath,
    lastAuditStatus:"MISSING",
    failedCheckIds:[],
  };
  const summary=readJsonObjectFile(requirementFoundationV1PhaseExitPath);
  if(!summary||typeof summary!=="object")return fallback;
  const passedCount=Number.isFinite(Number(summary&&summary.summary&&summary.summary.passedCount))
    ?Math.max(0,Math.trunc(Number(summary.summary.passedCount)))
    :0;
  const totalCount=Number.isFinite(Number(summary&&summary.summary&&summary.summary.totalCount))
    ?Math.max(0,Math.trunc(Number(summary.summary.totalCount)))
    :0;
  const lastAuditStatus=safeString(summary&&summary.status,24).toUpperCase()||"UNKNOWN";
  const failedCheckIds=Array.isArray(summary&&summary.phaseStatus&&summary.phaseStatus.failedCheckIds)
    ?summary.phaseStatus.failedCheckIds.map((entry)=>safeString(entry,16)).filter(Boolean).slice(0,16)
    :Array.isArray(summary&&summary.checks)
      ?summary.checks.filter((entry)=>safeString(entry&&entry.status,16).toUpperCase()!=="PASS").map((entry)=>safeString(entry&&entry.id,16)).filter(Boolean).slice(0,16)
      :[];
  const done=lastAuditStatus==="PASS"&&passedCount===8&&totalCount===8;
  return{
    requirementFoundationV1:done?"done":"not_done",
    completedAt:done?(safeString(summary&&summary.phaseStatus&&summary.phaseStatus.completedAt,80)||safeString(summary&&summary.generatedAt,80)):"",
    auditReportPath,
    markdownReportPath,
    lastAuditStatus,
    failedCheckIds,
  };
}
function clearOpenAIBlogLearningTimer(){
  if(openAIBlogLearningTimer){
    clearTimeout(openAIBlogLearningTimer);
    openAIBlogLearningTimer=null;
  }
}
function scheduleOpenAIBlogLearningCycle(delayMs){
  if(!openAIBlogLearningEnabled||shuttingDown)return;
  clearOpenAIBlogLearningTimer();
  const normalizedDelay=Math.max(1000,Math.trunc(Number(delayMs)||openAIBlogLearningIntervalMinutes*60*1000));
  openAIBlogLearningRuntimeState.nextRunAt=new Date(Date.now()+normalizedDelay).toISOString();
  openAIBlogLearningTimer=setTimeout(()=>{
    openAIBlogLearningTimer=null;
    executeOpenAIBlogLearningCycle("interval").catch(error=>{
      logOperation("openai_blog_learning.run_failed",{
        reason:"interval",
        err:summarizeErrorForOperationLog(error,220),
      });
    });
  },normalizedDelay);
  if(openAIBlogLearningTimer&&typeof openAIBlogLearningTimer.unref==="function"){
    openAIBlogLearningTimer.unref();
  }
}
async function executeOpenAIBlogLearningCycle(reason="manual"){
  if(!openAIBlogLearningEnabled||shuttingDown)return null;
  if(openAIBlogLearningRuntimeState.running){
    return null;
  }
  openAIBlogLearningRuntimeState.running=true;
  openAIBlogLearningRuntimeState.lastRunAt=new Date().toISOString();
  openAIBlogLearningRuntimeState.lastStatus="RUNNING";
  openAIBlogLearningRuntimeState.lastReason=safeString(reason,80)||"manual";
  try{
    const policy={
      ...openAIBlogLearningPolicy,
      cadence:{
        ...openAIBlogLearningPolicy.cadence,
        intervalMinutes:openAIBlogLearningIntervalMinutes,
      },
    };
    const result=await runOpenAIBlogLearningCycle({policy});
    openAIBlogLearningRuntimeState.lastRunAt=safeString(result&&result.report&&result.report.generatedAt,40)||new Date().toISOString();
    openAIBlogLearningRuntimeState.lastSuccessAt=openAIBlogLearningRuntimeState.lastRunAt;
    openAIBlogLearningRuntimeState.lastStatus=safeString(result&&result.report&&result.report.status,20).toUpperCase()||"PASS";
    openAIBlogLearningRuntimeState.lastReason=safeString(reason,80)||"manual";
    logOperation("openai_blog_learning.run_completed",{
      reason:openAIBlogLearningRuntimeState.lastReason,
      status:openAIBlogLearningRuntimeState.lastStatus,
      trackedArticles:result&&result.report&&result.report.summary?Number(result.report.summary.trackedArticles)||0:0,
      newArticlesThisRun:result&&result.report&&result.report.summary?Number(result.report.summary.newArticlesThisRun)||0:0,
      pendingProposals:result&&result.report&&result.report.summary?Number(result.report.summary.pendingProposals)||0:0,
    });
    return result;
  }catch(error){
    openAIBlogLearningRuntimeState.lastStatus="FAIL";
    openAIBlogLearningRuntimeState.lastReason=`${safeString(reason,80)||"manual"}: ${safeString(error&&error.message?error.message:String(error),200)}`;
    logOperation("openai_blog_learning.run_failed",{
      reason:safeString(reason,80)||"manual",
      err:summarizeErrorForOperationLog(error,220),
    });
    return null;
  }finally{
    openAIBlogLearningRuntimeState.running=false;
    scheduleOpenAIBlogLearningCycle(openAIBlogLearningIntervalMinutes*60*1000);
  }
}
function startOpenAIBlogLearningLoop(){
  if(!openAIBlogLearningEnabled)return;
  scheduleOpenAIBlogLearningCycle(openAIBlogLearningPolicy.cadence.startupDelayMs);
}
function buildResolvedOpenAIBlogLearningPolicy(){
  return{
    ...openAIBlogLearningPolicy,
    cadence:{
      ...openAIBlogLearningPolicy.cadence,
      intervalMinutes:openAIBlogLearningIntervalMinutes,
    },
    runtimeRetrieval:{
      ...(openAIBlogLearningPolicy&&openAIBlogLearningPolicy.runtimeRetrieval&&typeof openAIBlogLearningPolicy.runtimeRetrieval==="object"
        ?openAIBlogLearningPolicy.runtimeRetrieval
        :{}),
      enabled:openAIBlogLearningRuntimeRetrievalEnabled,
      shadowMode:openAIBlogLearningRuntimeRetrievalShadowMode,
    },
  };
}
function rememberOpenAIBlogLearningRetrievalDecision(decision){
  const normalized=decision&&typeof decision==="object"?decision:{};
  openAIBlogLearningRuntimeState.lastRetrievalStatus=safeString(normalized.status,24).toUpperCase()
    ||(openAIBlogLearningRuntimeRetrievalEnabled
      ?(openAIBlogLearningRuntimeRetrievalShadowMode?"SHADOW_IDLE":"IDLE")
      :"DISABLED");
  openAIBlogLearningRuntimeState.lastRetrievalReason=safeString(normalized.reason,200)||"";
  openAIBlogLearningRuntimeState.lastRetrievalAt=new Date().toISOString();
  openAIBlogLearningRuntimeState.lastRetrievalAgent=safeString(normalized.agentName,80)||"";
  openAIBlogLearningRuntimeState.lastRetrievalTaskFamily=safeString(normalized.taskFamily,80)||"";
  openAIBlogLearningRuntimeState.lastRetrievalTopics=Array.isArray(normalized.matchedTopics)
    ?normalized.matchedTopics.map((entry)=>safeString(entry,80)).filter(Boolean).slice(0,6)
    :[];
  openAIBlogLearningRuntimeState.lastRetrievalArticleIds=Array.isArray(normalized.articles)
    ?normalized.articles.map((entry)=>safeString(entry&&entry.articleId,120)).filter(Boolean).slice(0,6)
    :[];
  openAIBlogLearningRuntimeState.lastRetrievalHintIds=Array.isArray(normalized.matchedHintIds)
    ?normalized.matchedHintIds.map((entry)=>safeString(entry,160)).filter(Boolean).slice(0,8)
    :[];
  openAIBlogLearningRuntimeState.lastRetrievalPromptBlockChars=Number.isFinite(Number(normalized.promptBlockChars))
    ?Math.max(0,Math.trunc(Number(normalized.promptBlockChars)))
    :0;
}
function buildOpenAIBlogLearningRuntimeStateSnapshot(){
  const policy=buildResolvedOpenAIBlogLearningPolicy();
  return buildOpenAIBlogLearningRuntimeSnapshot(policy,{
    enabled:openAIBlogLearningEnabled,
    running:openAIBlogLearningRuntimeState.running,
    lastRunAt:openAIBlogLearningRuntimeState.lastRunAt,
    lastSuccessAt:openAIBlogLearningRuntimeState.lastSuccessAt,
    nextRunAt:openAIBlogLearningRuntimeState.nextRunAt,
    lastStatus:openAIBlogLearningRuntimeState.lastStatus,
    lastReason:openAIBlogLearningRuntimeState.lastReason,
    lastRetrievalStatus:openAIBlogLearningRuntimeState.lastRetrievalStatus,
    lastRetrievalReason:openAIBlogLearningRuntimeState.lastRetrievalReason,
    lastRetrievalAt:openAIBlogLearningRuntimeState.lastRetrievalAt,
    lastRetrievalAgent:openAIBlogLearningRuntimeState.lastRetrievalAgent,
    lastRetrievalTaskFamily:openAIBlogLearningRuntimeState.lastRetrievalTaskFamily,
    lastRetrievalTopics:openAIBlogLearningRuntimeState.lastRetrievalTopics,
    lastRetrievalArticleIds:openAIBlogLearningRuntimeState.lastRetrievalArticleIds,
    lastRetrievalHintIds:openAIBlogLearningRuntimeState.lastRetrievalHintIds,
    lastRetrievalPromptBlockChars:openAIBlogLearningRuntimeState.lastRetrievalPromptBlockChars,
  });
}
function clearAnthropicEngineeringLearningTimer(){
  if(anthropicEngineeringLearningTimer){
    clearTimeout(anthropicEngineeringLearningTimer);
    anthropicEngineeringLearningTimer=null;
  }
}
function scheduleAnthropicEngineeringLearningCycle(delayMs){
  if(!anthropicEngineeringLearningEnabled||shuttingDown)return;
  clearAnthropicEngineeringLearningTimer();
  const normalizedDelay=Math.max(1000,Math.trunc(Number(delayMs)||anthropicEngineeringLearningIntervalMinutes*60*1000));
  anthropicEngineeringLearningRuntimeState.nextRunAt=new Date(Date.now()+normalizedDelay).toISOString();
  anthropicEngineeringLearningTimer=setTimeout(()=>{
    anthropicEngineeringLearningTimer=null;
    executeAnthropicEngineeringLearningCycle("interval").catch(error=>{
      logOperation("anthropic_engineering_learning.run_failed",{
        reason:"interval",
        err:summarizeErrorForOperationLog(error,220),
      });
    });
  },normalizedDelay);
  if(anthropicEngineeringLearningTimer&&typeof anthropicEngineeringLearningTimer.unref==="function"){
    anthropicEngineeringLearningTimer.unref();
  }
}
async function executeAnthropicEngineeringLearningCycle(reason="manual"){
  if(!anthropicEngineeringLearningEnabled||shuttingDown)return null;
  if(anthropicEngineeringLearningRuntimeState.running){
    return null;
  }
  anthropicEngineeringLearningRuntimeState.running=true;
  anthropicEngineeringLearningRuntimeState.lastRunAt=new Date().toISOString();
  anthropicEngineeringLearningRuntimeState.lastStatus="RUNNING";
  anthropicEngineeringLearningRuntimeState.lastReason=safeString(reason,80)||"manual";
  try{
    const policy={
      ...anthropicEngineeringLearningPolicy,
      cadence:{
        ...anthropicEngineeringLearningPolicy.cadence,
        intervalMinutes:anthropicEngineeringLearningIntervalMinutes,
      },
    };
    const result=await runAnthropicEngineeringLearningCycle({policy});
    anthropicEngineeringLearningRuntimeState.lastRunAt=safeString(result&&result.report&&result.report.generatedAt,40)||new Date().toISOString();
    anthropicEngineeringLearningRuntimeState.lastSuccessAt=anthropicEngineeringLearningRuntimeState.lastRunAt;
    anthropicEngineeringLearningRuntimeState.lastStatus=safeString(result&&result.report&&result.report.status,20).toUpperCase()||"PASS";
    anthropicEngineeringLearningRuntimeState.lastReason=safeString(reason,80)||"manual";
    logOperation("anthropic_engineering_learning.run_completed",{
      reason:anthropicEngineeringLearningRuntimeState.lastReason,
      status:anthropicEngineeringLearningRuntimeState.lastStatus,
      trackedArticles:result&&result.report&&result.report.summary?Number(result.report.summary.trackedArticles)||0:0,
      newArticlesThisRun:result&&result.report&&result.report.summary?Number(result.report.summary.newArticlesThisRun)||0:0,
      pendingProposals:result&&result.report&&result.report.summary?Number(result.report.summary.pendingProposals)||0:0,
    });
    return result;
  }catch(error){
    anthropicEngineeringLearningRuntimeState.lastStatus="FAIL";
    anthropicEngineeringLearningRuntimeState.lastReason=`${safeString(reason,80)||"manual"}: ${safeString(error&&error.message?error.message:String(error),200)}`;
    logOperation("anthropic_engineering_learning.run_failed",{
      reason:safeString(reason,80)||"manual",
      err:summarizeErrorForOperationLog(error,220),
    });
    return null;
  }finally{
    anthropicEngineeringLearningRuntimeState.running=false;
    scheduleAnthropicEngineeringLearningCycle(anthropicEngineeringLearningIntervalMinutes*60*1000);
  }
}
function startAnthropicEngineeringLearningLoop(){
  if(!anthropicEngineeringLearningEnabled)return;
  scheduleAnthropicEngineeringLearningCycle(anthropicEngineeringLearningPolicy.cadence.startupDelayMs);
}
function buildResolvedAnthropicEngineeringLearningPolicy(){
  return{
    ...anthropicEngineeringLearningPolicy,
    cadence:{
      ...anthropicEngineeringLearningPolicy.cadence,
      intervalMinutes:anthropicEngineeringLearningIntervalMinutes,
    },
  };
}
function buildAnthropicEngineeringLearningRuntimeStateSnapshot(){
  const policy=buildResolvedAnthropicEngineeringLearningPolicy();
  return buildAnthropicEngineeringRuntimeSnapshot(policy,{
    enabled:anthropicEngineeringLearningEnabled,
    running:anthropicEngineeringLearningRuntimeState.running,
    lastRunAt:anthropicEngineeringLearningRuntimeState.lastRunAt,
    lastSuccessAt:anthropicEngineeringLearningRuntimeState.lastSuccessAt,
    nextRunAt:anthropicEngineeringLearningRuntimeState.nextRunAt,
    lastStatus:anthropicEngineeringLearningRuntimeState.lastStatus,
    lastReason:anthropicEngineeringLearningRuntimeState.lastReason,
  });
}
function buildManualSelfImprovementRuntimeStateSnapshot(){
  return buildManualSelfImprovementRuntimeSummary({
    workspaceRoot,
  });
}
const traceabilityService=createTraceabilityService({
  safeString,
  sanitizePlanningArtifactsForRuntime,
  buildOperatorPlanEvent,
});
const buildPlanningTraceabilityData=(options={})=>traceabilityService.buildPlanningTraceabilityData(options);
const buildHarnessTraceabilitySnapshot=(planningContext,agentName="default")=>
  traceabilityService.buildHarnessTraceabilitySnapshot(planningContext,agentName);
const buildPostLockDriftSnapshot=(options={})=>traceabilityService.buildPostLockDriftSnapshot(options);
const runtimeStateService=createRuntimeStateService({
  listAgentsSnapshot,
  getLatestTurnSnapshot,
  getActiveExecRequestCount,
});
let harnessOverviewSnapshotService;
const runtimeApiSnapshotService=createRuntimeApiSnapshotService({
  fs,
  path,
  processRef:process,
  apiVersion,
  getActiveAgentState,
  getLatestTurnSnapshot,
  runtimeStateService,
  getRequirementGuardExtensionSnapshot,
  getSessionPerformanceSnapshot,
  nonInteractiveRequestUserInputPolicy,
  requestUserInputPolicyEnvKey,
  buildAdversarialShadowRuntimeSnapshot,
  buildHarnessMemoryRuntimeSnapshot,
  buildWorkspaceGuardSnapshot,
  buildSloRuntimeSnapshot,
  appPlatformReadSurface,
  buildGitAutomationRuntimeSnapshot,
  buildGovernanceRuntimeSurface,
  authorityRegistry,
  authorityRegistryPath,
  readTopLevelCodexConfigString,
  defaultParentAgentConfigPath,
  iterationControlContract,
  iterationControlContractPath,
  adoptionReadinessContract,
  adoptionReadinessContractPath,
  workerDecisionSurfaceContract,
  workerDecisionSurfaceContractPath,
  harnessPlaneContract,
  harnessPlaneContractPath,
  summarizePathForOperationLog,
  buildEvalSuiteSummary,
  defaultEvalSuite,
  evalSuiteConfigPath,
  evalLanePolicyPath,
  evalLanePolicy,
  summarizeEvalLane,
  evalRunHistoryPath,
  evalRunHistoryPathEnvKey,
  evalMaxCases,
  evalDefaultMaxVariants,
  evalCaseTimeoutMs,
  buildFullUtilizationDefaultsSnapshot,
  buildParentDispatchGuardDefaultsSnapshot,
  buildRequirementFoundationV1PhaseStatus,
  buildOpenAIBlogLearningRuntimeStateSnapshot,
  buildManualSelfImprovementRuntimeStateSnapshot,
  buildHarnessAgiImprovementFlywheelRuntimeSummary,
  workspaceRoot,
  buildDocumentToolingRuntimeSnapshot,
  safeString,
  buildAnthropicEngineeringLearningRuntimeStateSnapshot,
  buildEvalHistoryOverview:(options={})=>harnessOverviewSnapshotService.buildEvalHistoryOverview(options),
  buildExecutionMemoryOverview:(options={})=>harnessOverviewSnapshotService.buildExecutionMemoryOverview(options),
  summarizeIntentFirstRuntime,
  designAcceptanceContract,
  tasteMemoryStore,
  designAcceptanceContractPath,
  tasteMemorySeedPath,
  tasteMemoryMemoryPath,
  buildHarnessTraceabilitySnapshot,
  activeAgentName,
  buildGovernedMemoryRuntimeSnapshot,
  runtimeExecutionProfile,
  executionProfileEnvKey,
  isSmokeExecutionProfile,
  buildAppServerTransportRuntimeSnapshot,
  operationLog,
  loggingMode,
  loggingModeEnvKey,
  loggingSurfacePaths,
  repoRelativePath,
  fastModeDefault,
  automaticApprovalReviewDefault,
  fastModeDefaultEnvKey,
  automaticApprovalReviewEnvKey,
  serverProcessStartedAt,
  agentStates,
  resolveEffectiveServiceTier,
  nonFastEffectiveServiceTier,
  getActiveExecRequestCount,
  turnArtifactsEnabled,
  turnArtifactsRoot,
  turnArtifactsMaxBytes,
  turnArtifactsMaxDays,
  turnArtifactsRedactionEnabled,
  turnArtifactsRedactionPlaceholder,
  execIdempotencyTtlMs,
  harnessMemoryPath,
  execIdempotencyStatusWaitMaxMs,
  getAgentGovernancePolicySnapshot,
  harnessTurnContractSpec,
  harnessTurnContractSpecPath,
  taskOutcomeContract,
  taskOutcomeContractPath,
  summarizeTaskOutcomeContract,
  userFacingResponseContract,
  userFacingResponseContractPath,
  summarizeUserFacingResponseContract,
  planningModeContract,
  planningModeContractPath,
  assuranceModeContract,
  assuranceModeContractPath,
  taskFamilyProfilesContract,
  taskContractManifest,
  taskFamilyProfilesPath,
  taskContractManifestPath,
  planningDecisionContractSchemaPath,
  requirementContractSchemaPath,
  dispatchPlanSchemaPath,
  requestFrameContractPath,
  routingDecisionContractPath,
  discoveryOutcomeContractPath,
  reviewBundleContractPath,
  releaseDecisionContractPath,
  conformanceInvariantsContractPath,
  evidenceContractMachinePath,
  summarizeTaskContract,
  getConversationRuntimeSnapshot,
  getPiperRuntimeSnapshot,
  getKokoroVoiceRuntimeSnapshot,
  controlApiTokenHeaderName,
  controlApiToken,
  controlApiActionAllowlist,
  execApiRequiredContentType,
  defaultExecModelName,
  defaultExecModelReasoningEffort,
  allowedModelReasoningEfforts,
  listAgentsSnapshot,
});
harnessOverviewSnapshotService=createHarnessOverviewSnapshotService({
  apiVersion,
  safeString,
  summarizePathForOperationLog,
  listBundleSummaryCandidates,
  readEvalRunHistory,
  parseOverviewTimestamp,
  harnessExecutionMemoryStore,
  normalizeExecutionMemoryRecord,
  harnessPatternMemoryStore,
  normalizeExecutionState,
  normalizeExecutionProfile,
  normalizeExecutionIntent,
  runtimeExecutionProfile,
  inferAgentRole,
  buildSkillPortfolioOverviewSurface,
  readWorkspaceJsonArtifact,
  toFiniteNumber:(value,fallback=0)=>{
    const parsed=Number(value);
    return Number.isFinite(parsed)?parsed:fallback;
  },
  buildBrowserCapabilitySurface,
  buildContinuityOverviewSurface,
  buildRuntimeApiSnapshot:()=>runtimeApiSnapshotService.buildRuntimeApiSnapshot(),
  sanitizeRuntimeSnapshotForOverview:(runtimeSnapshot)=>
    runtimeApiSnapshotService.sanitizeRuntimeSnapshotForOverview(runtimeSnapshot),
  buildHarnessTraceabilitySnapshot,
  syncHarnessOverviewGovernedMemory,
  syncGovernedMemoryGraph,
  buildHarnessOverviewPayload,
  buildRuntimeProofBundleSnapshot,
  buildSignoffBundleSnapshot,
  getAgentTopographySnapshot,
  harnessMemoryLoaded,
  listReplayMemorySnapshots,
  loadHarnessExecutionMemoryStore,
  loggingSurfacePaths,
  repoRelativePath,
  runtimeProofsRoot,
  signoffBundlesRoot,
  workspaceRoot,
});
const currentSurfaceService=createCurrentSurfaceService({
  path,
  safeString,
  toIsoTimestamp,
  sanitizeRuntimeSnapshotForOverview,
  buildRuntimeApiSnapshot,
  listBundleSummaryCandidates,
  buildSignoffBundleSnapshot,
  buildRuntimeProofBundleSnapshot,
  signoffBundlesRoot,
  runtimeProofsRoot,
  readWorkspaceJsonArtifact,
  resolveWorkspaceRuntimePath,
  repoRelativePath,
  workspaceRoot,
  uniquePathList,
  nonInteractiveRequestUserInputPolicy,
  defaultExecAgentName,
  getLatestOperatorTurnSnapshot,
  normalizeExecutionProfile,
  runtimeExecutionProfile,
  normalizeExecutionState,
  isTerminalExecutionState,
  isCompletedOperatorOutcome,
  normalizeFamilyCompletionGateSnapshot,
  loggingMode,
  loggingModeEnvKey,
  loggingSurfacePaths,
  buildOperatorDecisionSummary,
  getWorkflowCaseById,
});
const currentLogSurfaceService=createCurrentLogSurfaceService({
  currentSurfaceService,
  ensureLoggingSurfaceDir,
  writeLoggingSurfaceJson,
  buildConformanceReport,
  buildOperatorViewSummary,
  loggingSurfacePaths,
  repoRelativePath,
  workspaceRoot,
  safeString,
  logOperation,
  fs,
});
const updateCurrentLogSurface=(options={})=>currentLogSurfaceService.updateCurrentLogSurface(options);
function buildRuntimeApiSnapshot(){
  return runtimeApiSnapshotService.buildRuntimeApiSnapshot();
}
function sanitizeRuntimeSnapshotForOverview(runtimeSnapshot){
  return runtimeApiSnapshotService.sanitizeRuntimeSnapshotForOverview(runtimeSnapshot);
}
function syncGovernedMemoryGraphFromLiveRuntime(reason="runtime_sync"){
  return harnessOverviewSnapshotService.syncGovernedMemoryGraphFromLiveRuntime(reason);
}
function buildHarnessOverviewSnapshot(){
  return harnessOverviewSnapshotService.buildHarnessOverviewSnapshot();
}
function isCompletedOperatorOutcome(finalOutcome){
  const taskOutcomeStatus=safeString(finalOutcome&&finalOutcome.taskOutcomeStatus,80).toUpperCase();
  if(taskOutcomeStatus==="COMPLETED")return true;
  return safeString(finalOutcome&&finalOutcome.status,40).toLowerCase()==="completed";
}
function isSignoffSummaryAllPassed(signoffSummary){
  return currentSurfaceService.isSignoffSummaryAllPassed(signoffSummary);
}
function normalizeSignoffTransportMode(signoffSummary){
  return currentSurfaceService.normalizeSignoffTransportMode
    ?currentSurfaceService.normalizeSignoffTransportMode(signoffSummary)
    :"";
}
function selectPreferredSignoffCandidate(candidates){
  return currentSurfaceService.selectPreferredSignoffCandidate(candidates);
}
function hasResolvedOperatorOutcome(finalOutcome){
  return currentSurfaceService.hasResolvedOperatorOutcome(finalOutcome);
}
function buildRelatedSignoffSummaryRef(signoffSummary,relatedToRun){
  return currentSurfaceService.buildRelatedSignoffSummaryRef(signoffSummary,relatedToRun);
}
function isAuxiliaryOperatorRunContext(latestTurn){
  return currentSurfaceService.isAuxiliaryOperatorRunContext
    ?currentSurfaceService.isAuxiliaryOperatorRunContext(latestTurn)
    :Boolean(latestTurn&&safeString(latestTurn.source,120));
}
function isSignoffBundleRunContext(latestTurn,signoffSummary){
  return currentSurfaceService.isSignoffBundleRunContext
    ?currentSurfaceService.isSignoffBundleRunContext(latestTurn,signoffSummary)
    :false;
}
function shouldPreferLatestCompletedSignoffRun({latestTurn,signoffSummary}={}){
  return currentSurfaceService.shouldPreferLatestCompletedSignoffRun
    ?currentSurfaceService.shouldPreferLatestCompletedSignoffRun({latestTurn,signoffSummary})
    :false;
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
async function handleLegacyRuntimeRoute(){
  return false;
}
const routeServices=createRouteServices({
  buildIntentFirstApiSnapshot,
  buildHarnessOverviewSnapshot,
  getConversationRuntimeSnapshot,
  getAgentTopographySnapshot,
  inspectContinuityTask,
  validateLocalOriginRequest,
  validateLocalAppBridgeRequest,
  validateControlMutationRequest,
  logOperation,
  safeString,
  requestHeaderValue,
  sendJson,
  validateJsonMutationContentType,
  conversationApiRequiredContentType,
  execApiRequiredContentType,
  readRequestBody,
  defaultRequestBodyLimitBytes,
  piperVoiceRequestBodyLimitBytes,
  kokoroVoiceRequestBodyLimitBytes,
  conversationRequestBodyLimitBytes,
  execRequestBodyLimitBytes,
  normalizeBooleanFlag,
  defaultPiperModelId,
  nowTs,
  preparePiperModel,
  workspaceRoot,
  resolvePiperVoiceRequestErrorStatus,
  summarizeErrorForOperationLog,
  speakWithPiper,
  kokoroDefaultModel,
  kokoroDefaultVoice,
  kokoroDefaultLangCode,
  requestKokoroSpeech,
  resolveKokoroVoiceRequestErrorStatus,
  normalizeConversationMessage,
  normalizeConversationMode,
  normalizeConversationPersonaUserId,
  normalizeConversationLevel,
  normalizeConversationTopic,
  normalizeConversationHistoryItems,
  getConversationPersonaContextForUser,
  getDiagnosticsSnapshot,
  buildSloRuntimeSnapshot,
  maybeEmitSloAlert,
  updateIntentProfileStore,
  resetIntentProfileStore,
  lockWorkspaceDirectory,
  unlockWorkspaceDirectory,
  requirementGuardMatcherDefaults,
  evaluateRequirementGuardMatch,
  getRequirementGuardMatcherSnapshot,
  requirementGuardExtensionConfig,
  requirementGuardOriginalRequirement,
  openCmdWindowEnabled,
  openCmdWindow,
  requestHarnessServerRestart,
  conversationProvider,
  conversationAppServerModel,
  summarizeTextForOperationLog,
  runConversationViaAppServer,
  updateConversationPersonaMemoryForUser,
  resolveConversationRequestErrorStatus,
  conversationRequestTimeoutMs,
  resetConversationPersonaMemoryForUser,
  isRequestBodyTooLargeError,
  getRegisteredAppRuntimeConfig,
  normalizeExecModel,
  conversationExecModelName,
  normalizeAppRuntimeTimeoutMs,
  resolveAppRuntimeWorkingDirectory,
  runCodexReply,
  runCodexStructuredOutput,
  evalRunHistoryMaxLines,
  readEvalRunHistory,
  summarizePathForOperationLog,
  evalRunHistoryPath,
  defaultEvalSuite,
  normalizeEvalSuite,
  loadAgiV1ProfileConfig,
  defaultExecAgentName,
  defaultExecModelName,
  normalizeEvalVariant,
  expandAgiV1Variants,
  evalDefaultMaxVariants,
  evalMaxCases,
  evalCaseTimeoutMs,
  evalLanePolicy,
  assertEvalLaneAccess,
  crypto,
  captureManifestSnapshot,
  executeEvalVariantOnSuite,
  persistHarnessExecutionMemoryStore,
  syncGovernedMemoryGraphFromLiveRuntime,
  compareEvalRuns,
  buildIndependentVerifierReport,
  buildCandidateBundle,
  loadAgiBundleFromPath,
  fs,
  path,
  buildEvalRunGovernanceBundle,
  adoptionReadinessContract,
  iterationControlContract,
  buildReleaseDecision,
  buildEvalSuiteSummary,
  appendEvalRunHistory,
  summarizeEvalLane,
  harnessMemoryPath,
  listReplayMemorySnapshots,
  getReplayMemoryRecord,
  buildReplayMemorySnapshot,
  normalizeExecutionProfile,
  isReproExecutionProfile,
  normalizeSandboxMode,
  normalizeApprovalPolicy,
  normalizeExecModelReasoningEffort,
  normalizeAgentName,
  normalizeWorkingDirectory,
  normalizeCodexMemoryMode,
  normalizeRequestUserInputPolicy,
  normalizeExecutionIntent,
  runInternalExecRequest,
  buildReplayDiffMetrics,
  updateReplayMemoryStats,
  hashSha256Hex,
  getAppServerCapabilitySnapshot,
  controlApiTokenHeaderName,
  normalizeIdempotencyKey,
  normalizeExecIdempotencyWaitMs,
  waitForExecIdempotencyRecord,
  buildExecIdempotencySnapshot,
  getLatestTurnSnapshot,
  extractExecIdempotencyKey,
  defaultPromptCharLimit,
  normalizeWebSearchMode,
  resolveFastModeEnabled,
  resolveAutomaticApprovalReviewEnabled,
  defaultExecModelReasoningEffort,
  normalizeChatImageAttachments,
  nonInteractiveRequestUserInputPolicy,
  runtimeExecutionProfile,
  resolveWorkspaceGuardRequirement,
  getWorkspaceGuardLockedRoot:()=>workspaceGuardLockedRoot,
  buildWorkspaceGuardSnapshot,
  getOrCreateAgentState,
  derivePreviousPlanningContextForRequest,
  applyRequirementGuardExecExtension,
  buildPromptAudit,
  resolveAgentName,
  validateRequestedAgentName,
  extractGovernanceOverride,
  normalizeOverrideRequest,
  buildWorkspaceGuardViolation,
  claimExecIdempotencyKey,
  resolveExecTerminalStatusFromSnapshot,
  isResolvedExecLifecycleState,
  isSuccessfulExecTerminalStatus,
  incrementActiveExecRequestCount,
  decrementActiveExecRequestCount,
  finalizeExecIdempotencyKey,
  markExecIdempotencyResponseClosed,
  runCodexExecStreaming,
  writeChunk,
  releaseExecIdempotencyKey,
  resolveExecRequestErrorStatus,
});

const requestHandler=createRequestHandler(createRequestHandlerContext({
  appRegistry,
  appPlatformReadSurface,
  buildRuntimeApiSnapshot,
  rewriteNativeAppApiPath,
  resolveProxyAppForward,
  proxyConfiguredAppRequest,
  services:routeServices,
  sendJson,
  handleLegacyRuntimeRoute,
  getPocStatusSnapshot,
  readRequestBody,
  execRequestBodyLimitBytes,
  defaultRequestBodyLimitBytes,
  safeString,
  normalizePocBatchMode,
  normalizeWorkingDirectory,
  workspaceRoot,
  buildWorkspaceGuardViolation,
  logOperation,
  summarizePathForOperationLog,
  getWorkspaceGuardLockedRoot:()=>workspaceGuardLockedRoot,
  executePocBatchRun,
  setPocSchedulerConfig,
  normalizeBooleanFlag,
}));

const bootstrapState={};
Object.defineProperties(bootstrapState,{
  shuttingDown:{
    enumerable:true,
    get(){return shuttingDown;},
    set(value){shuttingDown=Boolean(value);},
  },
  webPort:{
    enumerable:true,
    get(){return webPort;},
    set(value){webPort=value;},
  },
  webServer:{
    enumerable:true,
    get(){return webServer;},
    set(value){webServer=value;},
  },
});

const bootstrapApi=createBootstrapApi({
  state:bootstrapState,
  clearPocSchedulerTimer,
  clearOpenAIBlogLearningTimer,
  clearAnthropicEngineeringLearningTimer,
  pocSchedulerState,
  persistHarnessExecutionMemoryStore,
  logOperation,
  appServer,
  http,
  apiVersion,
  forcedUiPort,
  requestHandler,
  sendJson,
  loadHarnessExecutionMemoryStore,
  refreshCurrentLogsOnly,
  updateCurrentLogSurface,
  refreshCurrentLogsTrigger,
  repoRelativePath,
  workspaceRoot,
  loggingSurfacePaths,
  buildAutoOpenUrl,
  autoOpenBrowser,
  openBrowser,
  maybePruneTurnArtifactsStorage,
  buildFullUtilizationDefaultsSnapshot,
  buildParentDispatchGuardDefaultsSnapshot,
  edgeExecutablePath,
  autoOpenPath,
  runtimeExecutionProfile,
  executionProfileEnvKey,
  isSmokeExecutionProfile,
  buildGitAutomationRuntimeSnapshot,
  operationLog,
  nonInteractiveRequestUserInputPolicy,
  hashSha256Hex,
  controlApiToken,
  controlApiTokenHeaderName,
  execApiRequiredContentType,
  turnArtifactsEnabled,
  turnArtifactsRoot,
  turnArtifactsMaxBytes,
  turnArtifactsMaxDays,
  turnArtifactsRedactionEnabled,
  adversarialShadowEnabled,
  adversarialShadowMinScore,
  adversarialShadowMaxPromptChars,
  adversarialShadowMaxAnswerChars,
  adversarialLoopEnabled,
  adversarialLoopMaxRetries,
  shadowReviewVersion,
  execIdempotencyTtlMs,
  execIdempotencyStatusWaitMaxMs,
  buildHarnessMemoryRuntimeSnapshot,
  defaultEvalSuite,
  evalMaxCases,
  evalDefaultMaxVariants,
  evalCaseTimeoutMs,
  sloWindowTurns,
  sloFailureRateMax,
  sloLatencyP95MaxMs,
  sloIdempotencyConflictRateMax,
  harnessTurnContractSpec,
  harnessTurnContractSpecPath,
  openAIBlogLearningEnabled,
  openAIBlogLearningIntervalMinutes,
  defaultOpenAIBlogLearningPolicyPath,
  openAIBlogLearningPolicy,
  openAIBlogLearningRuntimeRetrievalEnabled,
  openAIBlogLearningRuntimeRetrievalShadowMode,
  anthropicEngineeringLearningEnabled,
  anthropicEngineeringLearningIntervalMinutes,
  defaultAnthropicEngineeringLearningPolicyPath,
  anthropicEngineeringLearningPolicy,
  startOpenAIBlogLearningLoop,
  startAnthropicEngineeringLearningLoop,
  safeString,
  summarizePathForOperationLog,
  summarizeErrorForOperationLog,
});

const {
  startHarnessServer,
  stopHarnessServer,
  runHarnessServerCli,
}=bootstrapApi;

module.exports={
  __implementationPath:__filename,
  startHarnessServer,
  stopHarnessServer,
  runHarnessServerCli,
  refreshCurrentLogSurface:(trigger="manual")=>{
    loadHarnessExecutionMemoryStore();
    updateCurrentLogSurface({trigger:safeString(trigger,80)||"manual"});
    return currentLogSurfaceService.buildRefreshCurrentLogSurfaceResult();
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
    createTurnStreamStats,
    collectTurnStreamItemStats,
    normalizeObservedTurnSignals,
    CodexAppServerClient,
    TurnArtifactRecorder,
  },
  __staticMount:{
    bundledEnglishConversationAppRoot,
    defaultIntegratedEnglishConversationAppRoot,
    legacyExternalEnglishConversationAppRoot,
    defaultExternalEnglishConversationAppRoot,
    getEnglishConversationAppStaticSource:appPlatformReadSurface.getEnglishConversationAppStaticSource,
    buildStaticRequestTarget:appPlatformReadSurface.buildStaticRequestTarget,
  },
  __codexModes:{
    automaticApprovalReviewFeatureName,
    buildForkedAgentState,
    buildMemoryBridgeConfigEntries,
    createBaseAgentState,
    buildThreadStartConfig,
    defaultCodexServiceTier,
    defaultExperimentalFeatures,
    derivePreviousPlanningContextForRequest,
    fastModeFeatureName,
    isWebSearchEnabledForMode,
    normalizeCodexMemoryMode,
    normalizeWebSearchMode,
    normalizeCodexServiceTier,
    normalizeDirectoryPathIdentity,
  },
  __runtimeVisibility:{
    buildFullUtilizationDefaultsSnapshot,
    buildTurnVisibilitySnapshot,
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




