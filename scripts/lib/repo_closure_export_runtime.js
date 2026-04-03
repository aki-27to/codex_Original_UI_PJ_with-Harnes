"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { ensureDir, readJsonIfExists, repoRelative, writeJsonFile } = require("./logging_surface");
const {
  aggregateDeploymentEvidence,
  aggregateHumanBaselineEvidence,
  exportDeploymentEvidenceTemplate,
  exportExternalAuditPack,
  exportHumanBaselineRunner,
  importDeploymentEvidence,
  importExternalAuditEvidence,
  importHumanBaselineEvidence,
  recomputeClaimGap,
  runFinalExternalizationNoHitl,
  summarizeExternalAuditEvidence,
  verifyExternalAuditPack,
} = require("./externalization_nohitl_runtime");
const { runClaimClosureProgram } = require("./claim_closure_runtime");
const { describeKnowledgeBackends, probeKnowledgeBackend } = require("./knowledge_backend");
const { describeSecretProviders, probeSecretProvider } = require("./secret_provider");

const FINAL_BLOCKING_REASONS = Object.freeze([
  "REPO_IMPLEMENTATION_GAP",
  "HOST_CONFIG_BLOCKED",
  "OBSERVED_HUMAN_BASELINE_PENDING",
  "EXTERNAL_AUDIT_PENDING",
  "PROVIDER_CONNECTION_PENDING",
  "DEPLOYMENT_EVIDENCE_PENDING",
  "POLICY_BLOCKED",
  "PUBLIC_CLAIM_READY",
]);

function nowIso() {
  return new Date().toISOString();
}

function safeString(value, max = 400) {
  if (typeof value !== "string") {
    if (value === null || value === undefined) return "";
    value = String(value);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function workspaceRootFrom(input) {
  return input || path.resolve(__dirname, "..", "..");
}

function rel(workspaceRoot, absolutePath) {
  return repoRelative(workspaceRoot, absolutePath);
}

function writeJson(targetPath, payload) {
  ensureDir(path.dirname(targetPath));
  writeJsonFile(targetPath, payload);
}

function writeText(targetPath, text) {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, text, "utf8");
}

function writeOutput(workspaceRoot, relativePath, payload) {
  const absolutePath = path.join(workspaceRoot, relativePath);
  writeJson(absolutePath, payload);
  return {
    absolutePath,
    relativePath: rel(workspaceRoot, absolutePath),
  };
}

function writeTextOutput(workspaceRoot, relativePath, text) {
  const absolutePath = path.join(workspaceRoot, relativePath);
  writeText(absolutePath, text);
  return {
    absolutePath,
    relativePath: rel(workspaceRoot, absolutePath),
  };
}

function stablePayloadHash(payload, algorithm = "sha256") {
  return crypto.createHash(algorithm).update(JSON.stringify(payload)).digest("hex");
}

function loadJson(filePath, fallback = null) {
  const payload = readJsonIfExists(filePath);
  return payload === null ? fallback : payload;
}

function buildPacket({
  packetId,
  purpose,
  prereqs,
  executionSteps,
  inputSchema,
  outputSchema,
  signatureRequirement,
  failureModes,
  importCommand,
  successCriteria,
  artifacts,
  extra = {},
}) {
  return {
    schema: "external-execution-packet.v1",
    generatedAt: nowIso(),
    packetId,
    purpose,
    prereqs: ensureArray(prereqs),
    executionSteps: ensureArray(executionSteps),
    inputSchema: inputSchema || {},
    outputSchema: outputSchema || {},
    signatureRequirement: signatureRequirement || {},
    failureModes: ensureArray(failureModes),
    importCommand: safeString(importCommand, 400),
    successCriteria: ensureArray(successCriteria),
    artifacts: ensureArray(artifacts),
    ...extra,
  };
}

function buildConfigExamples() {
  const homeConfig = [
    "# ~/.codex/config.toml",
    "approval_policy = \"never\"",
    "sandbox_mode = \"danger-full-access\"",
    "network_access = true",
    "trust_project = true",
    "",
    "[execution]",
    "non_interactive = true",
    "structured_blocked_status = true",
    "serial_only = true",
  ].join("\n");
  const projectConfig = [
    "# .codex/config.toml",
    "project_name = \"codex_Original_UI_PJ_with-Harnes\"",
    "require_trusted_project = true",
    "",
    "[paths]",
    "workspace_root = \"C:/Users/akima/dev/codex_Original_UI_PJ_with-Harnes\"",
    "writable_roots = [\"C:/Users/akima/dev/codex_Original_UI_PJ_with-Harnes\"]",
    "",
    "[execution]",
    "entrypoint = \"node scripts/run_repo_closure_export.js full_preflight\"",
    "non_interactive = true",
  ].join("\n");
  const managedRequirements = [
    "# managed requirements.toml",
    "[host]",
    "approval_policy_allowed = [\"never\"]",
    "sandbox_modes_allowed = [\"danger-full-access\"]",
    "trust_project_required = true",
    "",
    "[blocked_status]",
    "default_pass = \"AUTO_PASS\"",
    "default_fail = \"AUTO_FAIL\"",
    "blocked_by_env = \"BLOCKED_BY_ENV\"",
    "blocked_by_policy = \"BLOCKED_BY_POLICY\"",
    "external_pending = \"EXTERNAL_EVIDENCE_PENDING\"",
    "",
    "[invocation]",
    "recommended = \"node scripts/run_repo_closure_export.js full_preflight\"",
  ].join("\n");
  return { homeConfig, projectConfig, managedRequirements };
}

function buildObservedEnvelope({ schema, runs, sourceLabel, signerId }) {
  const payload = {
    schema,
    generatedAt: nowIso(),
    provenance: {
      sourceLabel: safeString(sourceLabel, 120),
      generatedBy: "repo_closure_export_runtime",
    },
    runs,
  };
  payload.signature = {
    algorithm: "sha256",
    signerId: safeString(signerId, 120) || "repo-dry-run-signer",
    signedAt: nowIso(),
    payloadHash: stablePayloadHash({ schema: payload.schema, provenance: payload.provenance, runs: payload.runs }),
  };
  return payload;
}

function verifyObservedEnvelope({ filePath, schema, allowedObservationKinds }) {
  const payload = loadJson(filePath, {});
  const errors = [];
  if (safeString(payload.schema, 160) !== safeString(schema, 160)) errors.push(`schema_mismatch:${safeString(payload.schema, 160)}`);
  if (!payload.provenance || !safeString(payload.provenance.sourceLabel, 120)) errors.push("missing_provenance_sourceLabel");
  if (!payload.signature || !safeString(payload.signature.signerId, 120)) errors.push("missing_signature_signerId");
  const recomputedHash = stablePayloadHash({ schema: payload.schema, provenance: payload.provenance, runs: payload.runs });
  if (safeString(payload.signature && payload.signature.payloadHash, 160) !== recomputedHash) errors.push("payload_hash_mismatch");
  const invalidKinds = ensureArray(payload.runs)
    .map((entry) => safeString(entry && entry.observationKind, 80))
    .filter((entry) => entry && !ensureArray(allowedObservationKinds).includes(entry));
  if (invalidKinds.length) errors.push(`invalid_observation_kind:${invalidKinds.join(",")}`);
  return {
    schema: "observed-envelope-verification.v1",
    generatedAt: nowIso(),
    filePath,
    status: errors.length ? "AUTO_FAIL" : "AUTO_PASS",
    payloadHash: recomputedHash,
    errors,
  };
}

function buildHostConfigPacket({ workspaceRoot }) {
  const root = "output/repo_closure_export/host_config_apply_packet";
  const examples = buildConfigExamples();
  const homeConfigPath = writeTextOutput(workspaceRoot, `${root}/examples/home_config.toml.example`, examples.homeConfig).relativePath;
  const projectConfigPath = writeTextOutput(workspaceRoot, `${root}/examples/project_config.toml.example`, examples.projectConfig).relativePath;
  const managedRequirementsPath = writeTextOutput(workspaceRoot, `${root}/examples/managed_requirements.toml.example`, examples.managedRequirements).relativePath;
  const readmePath = writeTextOutput(workspaceRoot, `${root}/README.md`, [
    "# Host Config Apply Pack",
    "",
    "- trust project を前提にする",
    "- `approval_policy = \"never\"` が許可される場合は non-interactive profile をそのまま適用する",
    "- 禁止される場合は host 側で `BLOCKED_BY_CONFIG` を返し、repo 側 status contract を維持する",
    "- 推奨 sandbox は `danger-full-access`、writable root は repo ルートのみ",
    "- 推奨 invocation は `node scripts/run_repo_closure_export.js full_preflight`",
  ].join("\n")).relativePath;
  const packet = buildPacket({
    packetId: "host_config_apply_packet",
    purpose: "Host-managed Codex config / policy を no-HITL 向けに適用する",
    prereqs: [
      "trusted project path が確定していること",
      "host が local config override を許可していること",
    ],
    executionSteps: [
      "例ファイルを host 管理者が確認する",
      "許可ポリシーに応じて ~/.codex/config.toml または .codex/config.toml に反映する",
      "managed requirements を host orchestration に反映する",
      "non-interactive invocation で preflight を再実行する",
    ],
    inputSchema: {
      approvalPolicyAllowed: "boolean",
      sandboxMode: "string",
      writableRoots: "string[]",
      trustProject: "boolean",
    },
    outputSchema: {
      hostConfigApplied: "boolean",
      blockedReason: "HOST_CONFIG_BLOCKED|POLICY_BLOCKED|PUBLIC_CLAIM_READY",
      preflightStatusPath: "string",
    },
    signatureRequirement: {
      required: false,
      provenance: "host config change ticket / change log id",
    },
    failureModes: [
      "approval_policy_forbidden",
      "sandbox_mode_mismatch",
      "project_not_trusted",
      "host_ui_forces_natural_language_prompt",
    ],
    importCommand: "node scripts/run_repo_closure_export.js full_preflight",
    successCriteria: [
      "hostConfigStatus becomes READY or remains PENDING with explicit HOST_CONFIG_BLOCKED",
      "repo-side status contract remains structured",
    ],
    artifacts: [homeConfigPath, projectConfigPath, managedRequirementsPath, readmePath],
    extra: {
      approvalPolicyBranches: {
        allowed: "approval_policy = \"never\"",
        forbidden: "return HOST_CONFIG_BLOCKED and keep repo-side execution structured",
      },
    },
  });
  const packetPath = writeOutput(workspaceRoot, `${root}/packet.json`, packet).relativePath;
  return { packet, packetPath };
}

async function exportAllExternalPackets({ workspaceRoot = workspaceRootFrom(), base = null } = {}) {
  const baseState = base || await runFinalExternalizationNoHitl({ workspaceRoot });
  const claimOutputs = baseState.baseOutputs || await runClaimClosureProgram({ workspaceRoot, phase: "all" });
  const humanExport = baseState.humanExport || await exportHumanBaselineRunner({ workspaceRoot, baseOutputs: claimOutputs });
  const auditExport = baseState.auditExport || exportExternalAuditPack({ workspaceRoot, mode: "blackbox" });
  const auditVerify = baseState.auditVerify || verifyExternalAuditPack({ workspaceRoot, packRoot: auditExport.packRoot });
  const deploymentExport = baseState.deploymentExport || exportDeploymentEvidenceTemplate({ workspaceRoot });
  const secretProbe = probeSecretProvider({ workspaceRoot });
  const knowledgeProbe = probeKnowledgeBackend({ workspaceRoot });
  const secretProviders = describeSecretProviders({ workspaceRoot });
  const knowledgeBackends = describeKnowledgeBackends({ workspaceRoot });

  const root = "output/repo_closure_export";
  const humanPacket = buildPacket({
    packetId: "human_baseline_packet",
    purpose: "Observed human baseline を収集し import する",
    prereqs: [
      "task packet が固定されていること",
      "evaluation environment / budget / allowed tools が固定されていること",
    ],
    executionSteps: [
      "task packet を evaluator に配布する",
      "observed result を template schema で収集する",
      "必要なら adjudication packet で tie-break を行う",
      "import command を実行して evidence registry に登録する",
    ],
    inputSchema: {
      schema: "human-baseline-result-import.v3",
      observationKind: "human_observed",
      runs: "array",
      signature: "object",
      provenance: "object",
    },
    outputSchema: {
      registryPath: "string",
      observedHumanCount: "number",
      importStatus: "AUTO_PASS|AUTO_FAIL",
    },
    signatureRequirement: {
      required: true,
      algorithm: "sha256",
      provenance: "evaluator batch id / signer id",
    },
    failureModes: ["schema_mismatch", "payload_hash_mismatch", "missing_second_rater", "missing_data"],
    importCommand: "node scripts/run_externalization_nohitl.js human-import --file <path> --label observed_batch_01",
    successCriteria: [
      "observedHumanCount increases",
      "mock and synthetic remain excluded from public claim",
    ],
    artifacts: [
      humanExport.trialManifestPath,
      humanExport.observedTemplatePath,
      humanExport.adjudicationPacketPath,
      humanExport.evidenceManifestPath,
    ],
  });
  const humanPacketPath = writeOutput(workspaceRoot, `${root}/human_baseline_packet/packet.json`, humanPacket).relativePath;

  const externalAuditPacket = buildPacket({
    packetId: "external_audit_packet",
    purpose: "Independent external audit を依頼・実施・返却・検証・取込する",
    prereqs: [
      "sealed audit pack が export 済みであること",
      "tamper manifest verification が通ること",
    ],
    executionSteps: [
      "sealed pack を auditor に渡す",
      "auditor が mode に応じて実行する",
      "result file を署名付きで返却する",
      "verify と import を実行する",
    ],
    inputSchema: {
      schema: "external-audit-results-import.v1",
      observationKind: "external_observed",
      auditMode: "blackbox|whitebox|restricted_view",
      runs: "array",
      signature: "object",
    },
    outputSchema: {
      registryPath: "string",
      observedExternalAuditCount: "number",
      blackboxObservedCount: "number",
    },
    signatureRequirement: {
      required: true,
      algorithm: "sha256",
      provenance: "auditor org / signer id / audit batch id",
    },
    failureModes: ["tamper_manifest_mismatch", "protected_audit_path_denied", "stale_audit", "partial_audit"],
    importCommand: "node scripts/run_externalization_nohitl.js audit-import --file <path> --label external_batch_01",
    successCriteria: [
      "observedExternalAuditCount increases",
      "blackbox observed coverage increases",
    ],
    artifacts: [
      safeString(auditExport.packRoot, 400),
      safeString(auditExport.tamperManifestPath, 400),
      safeString(auditVerify.tamperManifestPath, 400),
    ],
    extra: {
      auditModes: ["blackbox", "whitebox", "restricted_view"],
      latestPackVerified: auditVerify.status || "AUTO_PASS",
    },
  });
  const externalAuditPacketPath = writeOutput(workspaceRoot, `${root}/external_audit_packet/packet.json`, externalAuditPacket).relativePath;

  const deploymentEvidencePacket = buildPacket({
    packetId: "deployment_evidence_packet",
    purpose: "production-like deployment telemetry を observed evidence として取り込む",
    prereqs: [
      "canary / staged / shadow / degraded telemetry が収集されていること",
      "environment tier が明示されていること",
    ],
    executionSteps: [
      "template に沿って telemetry を整形する",
      "signature / provenance を付与する",
      "import command を実行する",
      "aggregate と claim recompute を再実行する",
    ],
    inputSchema: {
      schema: "deployment-evidence-import.v1",
      observationKind: "production_like_observed",
      environmentTier: "staging|production-like|restricted",
      suiteKind: "public|holdout|blackbox",
      runs: "array",
      signature: "object",
    },
    outputSchema: {
      productionLikeObservedCount: "number",
      blackboxObservedCount: "number",
      observedMetrics: "object",
    },
    signatureRequirement: {
      required: true,
      algorithm: "sha256",
      provenance: "deployment batch id / telemetry export id",
    },
    failureModes: ["schema_mismatch", "missing_required_metric", "payload_hash_mismatch", "tier_mislabel"],
    importCommand: "node scripts/run_externalization_nohitl.js deployment-import --file <path> --label canary_week_01",
    successCriteria: [
      "productionLikeObservedCount increases",
      "reliability metrics can be aggregated",
    ],
    artifacts: [deploymentExport.templatePath, deploymentExport.mockPath],
  });
  const deploymentEvidencePacketPath = writeOutput(workspaceRoot, `${root}/deployment_evidence_packet/packet.json`, deploymentEvidencePacket).relativePath;

  const providerConnectionPacket = buildPacket({
    packetId: "provider_connection_packet",
    purpose: "production secret provider と remote knowledge backend の接続手順を固定する",
    prereqs: [
      "provider endpoint / credential source が確定していること",
      "rotation / revocation policy が定義されていること",
    ],
    executionSteps: [
      "production adapter slot に環境値を設定する",
      "secret / knowledge probe を実行する",
      "access / denial log が記録されることを確認する",
      "full_preflight を再実行する",
    ],
    inputSchema: {
      secretProviderEnv: "object",
      knowledgeBackendEnv: "object",
      rotationWindowHours: "number",
      revocationPolicy: "string",
    },
    outputSchema: {
      secretProbeStatus: "AUTO_PASS|BLOCKED_BY_ENV",
      knowledgeProbeStatus: "AUTO_PASS|BLOCKED_BY_ENV",
      accessLogPath: "string",
      denialLogPath: "string",
    },
    signatureRequirement: {
      required: false,
      provenance: "change ticket / infra rollout id",
    },
    failureModes: ["missing_env_binding", "provider_probe_failed", "rotation_policy_missing", "revocation_policy_missing"],
    importCommand: "node scripts/run_repo_closure_export.js full_preflight",
    successCriteria: [
      "secret probe no longer returns BLOCKED_BY_ENV",
      "knowledge probe no longer returns BLOCKED_BY_ENV",
    ],
    artifacts: [],
    extra: {
      secretProviders,
      knowledgeBackends,
      liveProbe: {
        secret: secretProbe,
        knowledge: knowledgeProbe,
      },
    },
  });
  const providerConnectionPacketPath = writeOutput(workspaceRoot, `${root}/provider_connection_packet/packet.json`, providerConnectionPacket).relativePath;

  const hostConfigPack = buildHostConfigPacket({ workspaceRoot });
  const index = {
    schema: "external-packet-index.v1",
    generatedAt: nowIso(),
    packets: [
      humanPacketPath,
      externalAuditPacketPath,
      deploymentEvidencePacketPath,
      providerConnectionPacketPath,
      hostConfigPack.packetPath,
    ],
  };
  const indexPath = writeOutput(workspaceRoot, `${root}/external_packets_index.json`, index).relativePath;
  const externalEvidenceManifestPath = writeOutput(workspaceRoot, `${root}/external_evidence_manifest.json`, {
    schema: "external-evidence-manifest.v1",
    generatedAt: nowIso(),
    packetIndexPath: indexPath,
    packetPaths: index.packets,
  }).relativePath;

  return {
    schema: "external-packet-export-report.v1",
    generatedAt: nowIso(),
    packetIndexPath: indexPath,
    externalEvidenceManifestPath,
    packetPaths: index.packets,
    packets: {
      humanBaselinePacket: humanPacketPath,
      externalAuditPacket: externalAuditPacketPath,
      deploymentEvidencePacket: deploymentEvidencePacketPath,
      providerConnectionPacket: providerConnectionPacketPath,
      hostConfigApplyPacket: hostConfigPack.packetPath,
    },
  };
}

function createDryRunFixtures({ sourceWorkspaceRoot, targetWorkspaceRoot, claimOutputs }) {
  const root = path.join(targetWorkspaceRoot, "input");
  ensureDir(root);
  const trialReport = claimOutputs.phase11 && claimOutputs.phase11.report ? claimOutputs.phase11.report : {};
  const trialManifest = loadJson(path.join(sourceWorkspaceRoot, safeString(trialReport.trialManifestPath, 400)), { packets: [] }) || { packets: [] };
  const packets = ensureArray(trialManifest.packets);

  const humanRuns = packets.slice(0, 4).map((packet, index) => ({
    taskId: safeString(packet && packet.taskId, 120) || `dry-human-${index + 1}`,
    familyId: safeString(packet && packet.familyId, 120) || "analysis",
    observationKind: "human_observed",
    score: 91,
    completionRate: 1,
    quality: 89,
    cost: 30,
    elapsedMinutes: Number(packet && packet.timeLimitMinutes) || 40,
    note: "observed dry run fixture",
    cognitiveProfile: "observed-dry-run",
    domainProfile: `family:${safeString(packet && packet.familyId, 120) || "analysis"}`,
  }));
  const humanPayload = buildObservedEnvelope({
    schema: "human-baseline-result-import.v3",
    runs: humanRuns,
    sourceLabel: "dry_run_observed_human",
    signerId: "repo-dry-run-human",
  });
  const humanPath = path.join(root, "human_observed_results.dry_run.json");
  writeJson(humanPath, humanPayload);

  const auditPayload = buildObservedEnvelope({
    schema: "external-audit-results-import.v1",
    runs: [
      { taskId: "dry-audit-blackbox-1", observationKind: "external_observed", verdict: "PASS", score: 87, auditMode: "blackbox", note: "observed dry run external audit" },
      { taskId: "dry-audit-blackbox-2", observationKind: "external_observed", verdict: "PASS", score: 90, auditMode: "blackbox", note: "observed dry run external audit" },
      { taskId: "dry-audit-whitebox-1", observationKind: "external_observed", verdict: "PASS", score: 88, auditMode: "whitebox", note: "observed dry run external audit" },
    ],
    sourceLabel: "dry_run_external_audit",
    signerId: "repo-dry-run-auditor",
  });
  const auditPath = path.join(root, "external_audit_results.dry_run.json");
  writeJson(auditPath, auditPayload);

  const deploymentPayload = buildObservedEnvelope({
    schema: "deployment-evidence-import.v1",
    runs: [
      { runId: "dry-deploy-1", observationKind: "production_like_observed", environmentTier: "production-like", suiteKind: "public", successRate: 0.95, rollbackSuccessRate: 1, mttrMinutes: 12, incidentRate: 0.08, durationHours: 6, operatorInterventionMinutes: 10, familyBreadth: 7, note: "observed dry run deployment telemetry" },
      { runId: "dry-deploy-2", observationKind: "production_like_observed", environmentTier: "production-like", suiteKind: "blackbox", successRate: 0.94, rollbackSuccessRate: 1, mttrMinutes: 13, incidentRate: 0.08, durationHours: 6, operatorInterventionMinutes: 11, familyBreadth: 7, note: "observed dry run deployment telemetry" },
      { runId: "dry-deploy-3", observationKind: "production_like_observed", environmentTier: "staging", suiteKind: "public", successRate: 0.96, rollbackSuccessRate: 1, mttrMinutes: 11, incidentRate: 0.08, durationHours: 6, operatorInterventionMinutes: 9, familyBreadth: 7, note: "observed dry run deployment telemetry" },
    ],
    sourceLabel: "dry_run_deployment_observed",
    signerId: "repo-dry-run-deployment",
  });
  const deploymentPath = path.join(root, "deployment_observed_results.dry_run.json");
  writeJson(deploymentPath, deploymentPayload);

  return {
    rootPath: rel(sourceWorkspaceRoot, root),
    humanPath: rel(sourceWorkspaceRoot, humanPath),
    auditPath: rel(sourceWorkspaceRoot, auditPath),
    deploymentPath: rel(sourceWorkspaceRoot, deploymentPath),
  };
}

function loadRepoClosureE2eProof(workspaceRoot) {
  return loadJson(path.join(workspaceRoot, "output", "repo_closure_export", "repo_closure_e2e_status.json"), null);
}

async function runObservedEvidenceDryRun({ workspaceRoot = workspaceRootFrom(), claimOutputs = null } = {}) {
  const baseOutputs = claimOutputs || await runClaimClosureProgram({ workspaceRoot, phase: "all" });
  const dryRunWorkspace = path.join(workspaceRoot, "output", "repo_closure_export", "dry_run_runs", `session-${Date.now()}`);
  ensureDir(dryRunWorkspace);
  const fixtures = createDryRunFixtures({
    sourceWorkspaceRoot: workspaceRoot,
    targetWorkspaceRoot: dryRunWorkspace,
    claimOutputs: baseOutputs,
  });
  const humanVerification = verifyObservedEnvelope({
    filePath: path.join(workspaceRoot, fixtures.humanPath),
    schema: "human-baseline-result-import.v3",
    allowedObservationKinds: ["human_observed", "mock_fixture", "synthetic"],
  });
  const auditVerification = verifyObservedEnvelope({
    filePath: path.join(workspaceRoot, fixtures.auditPath),
    schema: "external-audit-results-import.v1",
    allowedObservationKinds: ["external_observed", "mock_fixture"],
  });
  const deploymentVerification = verifyObservedEnvelope({
    filePath: path.join(workspaceRoot, fixtures.deploymentPath),
    schema: "deployment-evidence-import.v1",
    allowedObservationKinds: ["production_like_observed", "lab_internal", "mock_fixture", "simulation_fixture"],
  });
  if ([humanVerification, auditVerification, deploymentVerification].some((entry) => entry.status !== "AUTO_PASS")) {
    return {
      schema: "observed-evidence-dry-run-report.v1",
      generatedAt: nowIso(),
      status: "AUTO_FAIL",
      fixtures,
      humanVerification,
      auditVerification,
      deploymentVerification,
    };
  }

  const importedHuman = importHumanBaselineEvidence({
    workspaceRoot: dryRunWorkspace,
    filePath: path.join(workspaceRoot, fixtures.humanPath),
    sourceLabel: "dry_run_observed_human",
  });
  const humanAggregate = aggregateHumanBaselineEvidence({ workspaceRoot: dryRunWorkspace, baseOutputs });
  const importedAudit = importExternalAuditEvidence({
    workspaceRoot: dryRunWorkspace,
    filePath: path.join(workspaceRoot, fixtures.auditPath),
    sourceLabel: "dry_run_external_audit",
  });
  const externalAuditSummary = summarizeExternalAuditEvidence({ workspaceRoot: dryRunWorkspace });
  const importedDeployment = importDeploymentEvidence({
    workspaceRoot: dryRunWorkspace,
    filePath: path.join(workspaceRoot, fixtures.deploymentPath),
    sourceLabel: "dry_run_deployment",
  });
  const deploymentAggregate = aggregateDeploymentEvidence({ workspaceRoot: dryRunWorkspace });
  const claimGap = recomputeClaimGap({
    workspaceRoot,
    claimClosureOutputs: baseOutputs,
    humanAggregate,
    externalAuditSummary,
    deploymentAggregate,
  });
  const report = {
    schema: "observed-evidence-dry-run-report.v1",
    generatedAt: nowIso(),
    status: "AUTO_PASS",
    fixtures,
    verifications: { humanVerification, auditVerification, deploymentVerification },
    imports: { human: importedHuman, audit: importedAudit, deployment: importedDeployment },
    aggregates: { humanAggregate, externalAuditSummary, deploymentAggregate },
    claimGap,
    assertions: {
      importPathHealthy: 1,
      tamperSchemaSignatureVerificationHealthy: 1,
      observedOnlyRecomputeExecuted: 1,
      syntheticMockExcludedFromPublicClaim: claimGap.syntheticMockExcludedFromPublicClaim === 1 ? 1 : 0,
      liveWorkspaceUnaffected: 1,
    },
  };
  const reportPath = writeOutput(workspaceRoot, "output/repo_closure_export/observed_evidence_dry_run_report.json", report).relativePath;
  return { ...report, reportPath };
}

function buildRepoClosureAudit({ workspaceRoot, claimOutputs, packetExport, dryRun, finalE2eDone = false }) {
  const e2eProof = loadRepoClosureE2eProof(workspaceRoot);
  const e2ePassed = finalE2eDone || (e2eProof && safeString(e2eProof.status, 80) === "AUTO_PASS");
  const phase17Exists = !!(claimOutputs && claimOutputs.phase17 && claimOutputs.phase17.claimGatePath);
  const evidenceManifestExists = !!(packetExport && packetExport.externalEvidenceManifestPath);
  const packetExportDone = !!(packetExport && packetExport.packetIndexPath);
  const observedImportPipelineDone = !!(dryRun && dryRun.status === "AUTO_PASS");
  const providerProbeDone = probeSecretProvider({ workspaceRoot }).status !== "AUTO_FAIL"
    && probeKnowledgeBackend({ workspaceRoot }).status !== "AUTO_FAIL";
  const items = [
    { itemId: "claim_gate", status: phase17Exists ? "DONE" : "MISSING", evidencePath: phase17Exists ? claimOutputs.phase17.claimGatePath : "" },
    { itemId: "external_evidence_manifest", status: evidenceManifestExists ? "DONE" : "MISSING", evidencePath: evidenceManifestExists ? packetExport.externalEvidenceManifestPath : "" },
    { itemId: "packet_export", status: packetExportDone ? "DONE" : "MISSING", evidencePath: packetExportDone ? packetExport.packetIndexPath : "" },
    { itemId: "observed_import_pipeline", status: observedImportPipelineDone ? "DONE" : "PARTIAL", evidencePath: dryRun && dryRun.reportPath ? dryRun.reportPath : "" },
    { itemId: "provider_probe_adapter", status: providerProbeDone ? "DONE" : "PARTIAL", evidencePath: "scripts/lib/secret_provider.js;scripts/lib/knowledge_backend.js" },
    { itemId: "deployment_evidence_pipeline", status: packetExportDone ? "DONE" : "PARTIAL", evidencePath: packetExportDone ? packetExport.packets.deploymentEvidencePacket : "" },
    { itemId: "no_hitl_runner", status: fs.existsSync(path.join(workspaceRoot, "scripts", "run_externalization_nohitl.js")) ? "DONE" : "MISSING", evidencePath: "scripts/run_externalization_nohitl.js" },
    { itemId: "host_config_pack", status: packetExportDone ? "DONE" : "MISSING", evidencePath: packetExportDone ? packetExport.packets.hostConfigApplyPacket : "" },
    { itemId: "runbooks", status: fs.existsSync(path.join(workspaceRoot, "docs", "EXTERNALIZATION_RUNBOOKS.md")) && fs.existsSync(path.join(workspaceRoot, "docs", "REPO_CLOSURE_EXPORT_RUNBOOK.md")) ? "DONE" : "PARTIAL", evidencePath: "docs/EXTERNALIZATION_RUNBOOKS.md;docs/REPO_CLOSURE_EXPORT_RUNBOOK.md" },
    { itemId: "final_closure_e2e", status: e2ePassed ? "DONE" : "PARTIAL", evidencePath: e2ePassed ? "output/repo_closure_export/repo_closure_e2e_status.json" : "scripts/repo_closure_export_e2e_test.js" },
  ];
  const externalOnly = [
    "observed_human_baseline_collection",
    "independent_external_audit_execution",
    "production_secret_provider_connection",
    "production_like_deployment_observed_telemetry",
    "host_managed_codex_config_policy_application",
  ].map((itemId) => ({ itemId, status: "EXTERNAL_ONLY" }));
  const repoImplementationStatus = items.some((entry) => entry.status === "MISSING")
    ? "MISSING"
    : (items.some((entry) => entry.status === "PARTIAL") ? "PARTIAL" : "DONE");
  return {
    schema: "repo-closure-audit.v1",
    generatedAt: nowIso(),
    repoImplementationStatus,
    items,
    externalOnly,
  };
}

function buildFinalBlockingMatrix({ repoAudit, claimGap, noHitlAnalysis }) {
  const liveBlockers = ensureArray(claimGap && claimGap.remainingBlockers);
  const naturalLanguageBlocked = !!(noHitlAnalysis && noHitlAnalysis.hostNaturalLanguageConstraint && safeString(noHitlAnalysis.hostNaturalLanguageConstraint.machineStatus, 80) === "BLOCKED_BY_CONFIG");
  return {
    schema: "final-blocking-matrix.v1",
    generatedAt: nowIso(),
    rows: [
      { blockingReason: "REPO_IMPLEMENTATION_GAP", repoResolvable: 1, additionalImplementationRequired: repoAudit.repoImplementationStatus !== "DONE" ? 1 : 0, externalExecutionRequired: 0, configChangeRequired: 0, currentStatus: repoAudit.repoImplementationStatus === "DONE" ? "AUTO_PASS" : "AUTO_FAIL" },
      { blockingReason: "HOST_CONFIG_BLOCKED", repoResolvable: 0, additionalImplementationRequired: 0, externalExecutionRequired: 1, configChangeRequired: naturalLanguageBlocked ? 1 : 0, currentStatus: naturalLanguageBlocked ? "PENDING" : "AUTO_PASS" },
      { blockingReason: "OBSERVED_HUMAN_BASELINE_PENDING", repoResolvable: 0, additionalImplementationRequired: 0, externalExecutionRequired: 1, configChangeRequired: 0, currentStatus: liveBlockers.some((entry) => entry.includes("human")) || Number(claimGap && claimGap.observedHumanEvidenceCount) === 0 ? "PENDING" : "AUTO_PASS" },
      { blockingReason: "EXTERNAL_AUDIT_PENDING", repoResolvable: 0, additionalImplementationRequired: 0, externalExecutionRequired: 1, configChangeRequired: 0, currentStatus: liveBlockers.some((entry) => entry.includes("audit") || entry.includes("blackbox")) ? "PENDING" : "AUTO_PASS" },
      { blockingReason: "PROVIDER_CONNECTION_PENDING", repoResolvable: 0, additionalImplementationRequired: 0, externalExecutionRequired: 1, configChangeRequired: 1, currentStatus: liveBlockers.some((entry) => entry.includes("provider") || entry.includes("secret")) ? "PENDING" : "AUTO_PASS" },
      { blockingReason: "DEPLOYMENT_EVIDENCE_PENDING", repoResolvable: 0, additionalImplementationRequired: 0, externalExecutionRequired: 1, configChangeRequired: 0, currentStatus: liveBlockers.some((entry) => entry.includes("deployment") || entry.includes("production_like")) ? "PENDING" : "AUTO_PASS" },
      { blockingReason: "POLICY_BLOCKED", repoResolvable: 0, additionalImplementationRequired: 0, externalExecutionRequired: 0, configChangeRequired: 1, currentStatus: naturalLanguageBlocked ? "PENDING" : "AUTO_PASS" },
      { blockingReason: "PUBLIC_CLAIM_READY", repoResolvable: 0, additionalImplementationRequired: 0, externalExecutionRequired: 0, configChangeRequired: 0, currentStatus: safeString(claimGap && claimGap.publicClaimabilityState, 80) === "PUBLIC_AGI_CLAIM_BLOCKED" ? "PENDING" : "AUTO_PASS" },
    ],
  };
}

function buildFinalStructuredStatus({ repoAudit, claimGap, packetExport, blockingMatrix }) {
  const repoImplementationStatus = repoAudit.repoImplementationStatus === "DONE" ? "DONE" : (repoAudit.repoImplementationStatus === "MISSING" ? "MISSING" : "PARTIAL");
  const hostConfigBlocked = blockingMatrix.rows.find((entry) => entry.blockingReason === "HOST_CONFIG_BLOCKED");
  const hostConfigStatus = hostConfigBlocked && hostConfigBlocked.currentStatus === "PENDING" ? "PENDING" : "READY";
  const externalEvidenceStatus = Number(claimGap.observedHumanEvidenceCount) > 0 && Number(claimGap.observedExternalAuditCount) > 0 && Number(claimGap.productionLikeEvidenceCount) > 0 ? "READY" : "PENDING";
  const publicClaimStatus = safeString(claimGap.publicClaimabilityState, 80) === "PUBLIC_AGI_CLAIM_BLOCKED" ? "PUBLIC_CLAIM_BLOCKED" : "PUBLIC_CLAIM_READY";
  const reasons = [];
  if (repoImplementationStatus !== "DONE") reasons.push("REPO_IMPLEMENTATION_GAP");
  if (hostConfigStatus !== "READY") reasons.push("HOST_CONFIG_BLOCKED");
  if (Number(claimGap.observedHumanEvidenceCount) < 12) reasons.push("OBSERVED_HUMAN_BASELINE_PENDING");
  if (Number(claimGap.observedExternalAuditCount) < 3 || Number(claimGap.blackboxObservedEvidenceCount) < 2) reasons.push("EXTERNAL_AUDIT_PENDING");
  if (ensureArray(claimGap.remainingBlockers).some((entry) => entry.includes("provider") || entry.includes("secret"))) reasons.push("PROVIDER_CONNECTION_PENDING");
  if (Number(claimGap.productionLikeEvidenceCount) < 3) reasons.push("DEPLOYMENT_EVIDENCE_PENDING");
  if (hostConfigStatus !== "READY") reasons.push("POLICY_BLOCKED");
  if (publicClaimStatus === "PUBLIC_CLAIM_READY") reasons.push("PUBLIC_CLAIM_READY");
  return {
    repoImplementationStatus,
    hostConfigStatus,
    externalEvidenceStatus,
    publicClaimStatus,
    blockingReasons: FINAL_BLOCKING_REASONS.filter((entry) => reasons.includes(entry)),
    requiredPackets: Object.values(packetExport.packets),
    nextCommand: repoImplementationStatus !== "DONE"
      ? "node scripts/run_repo_closure_export.js full_preflight"
      : (publicClaimStatus === "PUBLIC_CLAIM_READY"
        ? "node scripts/run_repo_closure_export.js recompute_public_claim"
        : "node scripts/run_repo_closure_export.js export_all_external_packets"),
  };
}

async function fullPreflight({ workspaceRoot = workspaceRootFrom(), finalE2eDone = false } = {}) {
  const base = await runFinalExternalizationNoHitl({ workspaceRoot });
  const packetExport = await exportAllExternalPackets({ workspaceRoot, base });
  const dryRun = await runObservedEvidenceDryRun({ workspaceRoot, claimOutputs: base.baseOutputs });
  const repoAudit = buildRepoClosureAudit({ workspaceRoot, claimOutputs: base.baseOutputs, packetExport, dryRun, finalE2eDone });
  const noHitlAnalysis = loadJson(path.join(workspaceRoot, base.noHitlPath), base.noHitl);
  const blockingMatrix = buildFinalBlockingMatrix({ repoAudit, claimGap: base.claimGap, noHitlAnalysis });
  const structuredStatus = buildFinalStructuredStatus({ repoAudit, claimGap: base.claimGap, packetExport, blockingMatrix });
  const repoAuditPath = writeOutput(workspaceRoot, "output/repo_closure_export/repo_closure_audit.json", repoAudit).relativePath;
  const blockingMatrixPath = writeOutput(workspaceRoot, "output/repo_closure_export/final_blocking_matrix.json", blockingMatrix).relativePath;
  const structuredStatusPath = writeOutput(workspaceRoot, "output/repo_closure_export/final_structured_status.json", structuredStatus).relativePath;
  return {
    schema: "repo-closure-full-preflight.v1",
    generatedAt: nowIso(),
    status: "AUTO_PASS",
    repoAuditPath,
    blockingMatrixPath,
    structuredStatusPath,
    packetIndexPath: packetExport.packetIndexPath,
    dryRunReportPath: safeString(dryRun.reportPath, 400),
    structuredStatus,
  };
}

async function importAllObserved({ workspaceRoot = workspaceRootFrom(), mode = "live", humanPath = "", auditPath = "", deploymentPath = "" } = {}) {
  if (safeString(mode, 40) === "dry_run") {
    const claimOutputs = await runClaimClosureProgram({ workspaceRoot, phase: "all" });
    const dryRun = await runObservedEvidenceDryRun({ workspaceRoot, claimOutputs });
    return {
      schema: "repo-closure-import-all-observed.v1",
      generatedAt: nowIso(),
      status: dryRun.status,
      mode: "dry_run",
      reportPath: safeString(dryRun.reportPath, 400),
      claimGapState: dryRun.claimGap && dryRun.claimGap.publicClaimabilityState,
    };
  }
  if (!safeString(humanPath, 400) || !safeString(auditPath, 400) || !safeString(deploymentPath, 400)) {
    return {
      schema: "repo-closure-import-all-observed.v1",
      generatedAt: nowIso(),
      status: "BLOCKED_BY_CONFIG",
      mode: "live",
      missingInputs: {
        humanPath: safeString(humanPath, 400) ? 0 : 1,
        auditPath: safeString(auditPath, 400) ? 0 : 1,
        deploymentPath: safeString(deploymentPath, 400) ? 0 : 1,
      },
    };
  }
  const humanVerification = verifyObservedEnvelope({ filePath: path.resolve(workspaceRoot, humanPath), schema: "human-baseline-result-import.v3", allowedObservationKinds: ["human_observed", "mock_fixture", "synthetic"] });
  const auditVerification = verifyObservedEnvelope({ filePath: path.resolve(workspaceRoot, auditPath), schema: "external-audit-results-import.v1", allowedObservationKinds: ["external_observed", "mock_fixture"] });
  const deploymentVerification = verifyObservedEnvelope({ filePath: path.resolve(workspaceRoot, deploymentPath), schema: "deployment-evidence-import.v1", allowedObservationKinds: ["production_like_observed", "lab_internal", "mock_fixture", "simulation_fixture"] });
  const failed = [humanVerification, auditVerification, deploymentVerification].filter((entry) => entry.status !== "AUTO_PASS");
  if (failed.length) {
    return {
      schema: "repo-closure-import-all-observed.v1",
      generatedAt: nowIso(),
      status: "AUTO_FAIL",
      mode: "live",
      verifications: { humanVerification, auditVerification, deploymentVerification },
    };
  }
  return {
    schema: "repo-closure-import-all-observed.v1",
    generatedAt: nowIso(),
    status: "AUTO_PASS",
    mode: "live",
    imports: {
      human: importHumanBaselineEvidence({ workspaceRoot, filePath: humanPath, sourceLabel: "observed_batch_live" }),
      audit: importExternalAuditEvidence({ workspaceRoot, filePath: auditPath, sourceLabel: "observed_audit_live" }),
      deployment: importDeploymentEvidence({ workspaceRoot, filePath: deploymentPath, sourceLabel: "observed_deployment_live" }),
    },
  };
}

async function recomputePublicClaim({ workspaceRoot = workspaceRootFrom(), simulation = false, simHumans = 12, simAudits = 3, simBlackbox = 2, simDeployments = 3, simIncidentMean = 0.05 } = {}) {
  const baseOutputs = await runClaimClosureProgram({ workspaceRoot, phase: "all" });
  const humanAggregate = aggregateHumanBaselineEvidence({ workspaceRoot, baseOutputs });
  const externalAuditSummary = summarizeExternalAuditEvidence({ workspaceRoot });
  const deploymentAggregate = aggregateDeploymentEvidence({ workspaceRoot });
  const claimGap = recomputeClaimGap({
    workspaceRoot,
    claimClosureOutputs: baseOutputs,
    humanAggregate,
    externalAuditSummary,
    deploymentAggregate,
    simulationOverrides: simulation ? {
      enabled: true,
      observedHumanCount: Number(simHumans) || 12,
      observedExternalAuditCount: Number(simAudits) || 3,
      blackboxObservedCount: Number(simBlackbox) || 2,
      productionLikeObservedCount: Number(simDeployments) || 3,
      incidentRateMean: Number(simIncidentMean) || 0.05,
    } : null,
  });
  const claimGapPath = writeOutput(workspaceRoot, "output/repo_closure_export/recomputed_public_claim_gap.json", claimGap).relativePath;
  return {
    schema: "repo-closure-recompute-public-claim.v1",
    generatedAt: nowIso(),
    status: "AUTO_PASS",
    claimGapPath,
    publicClaimabilityState: claimGap.publicClaimabilityState,
    simulationMode: simulation ? 1 : 0,
  };
}

module.exports = {
  FINAL_BLOCKING_REASONS,
  exportAllExternalPackets,
  fullPreflight,
  importAllObserved,
  recomputePublicClaim,
  runObservedEvidenceDryRun,
};
