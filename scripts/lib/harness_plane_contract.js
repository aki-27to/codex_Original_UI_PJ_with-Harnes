"use strict";

const fs = require("fs");
const path = require("path");

const defaultHarnessPlaneContractPath = path.join(__dirname, "..", "config", "harness_plane_contract.json");

const defaultHarnessPlaneContract = Object.freeze({
  schema: "single-harness-multi-plane-contract.v1",
  version: "2026-04-12.r1",
  sourceDoc: "docs/SINGLE_HARNESS_MULTI_PLANE.md",
  repoIdentity: Object.freeze({
    mode: "single_governed_harness",
    positioning: "execution-centered governed harness with embedded evaluation and governance",
    boundaryRule: "split_trust_boundary_not_repo",
    parallelHarnessesForbidden: true,
  }),
  primaryRoutes: Object.freeze({
    execution: "POST /api/exec",
    evaluation: "POST /api/eval/run",
  }),
  planes: Object.freeze({}),
  trustBoundaries: Object.freeze({
    executionCannotDependOn: Object.freeze([]),
    evaluationReadsExecutionArtifacts: Object.freeze([]),
    protectedEvalAssetRoots: Object.freeze([]),
    protectedEvalAssetsVisibleOnlyTo: Object.freeze([]),
    governancePromotionRequires: Object.freeze([]),
    workerCurrentTruthOwner: "worker_centric",
    sovereignCanBeLegacyAliasOnly: true,
  }),
  currentTruthSurfaces: Object.freeze({
    headlineGovernanceSurface: "output/governance_public/worker_decision_surface.json",
    programReadinessSurface: "output/agi_readiness/goal_completion_status.json",
    subjectiveCompanionSurface: "output/agi_readiness/subjective_goal_completion_status.json",
    compatibilitySurface: "output/agi_readiness/compatibility_completion_status.json",
    legacyAliasSurface: "output/agi_readiness/sovereign_goal_completion_status.json",
  }),
  strictChecks: Object.freeze([]),
  requiredDocs: Object.freeze([]),
});

function safeString(value, max = 400) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function uniqueStrings(values, max = 32) {
  const out = [];
  for (const entry of Array.isArray(values) ? values : []) {
    const text = safeString(entry, 240);
    if (!text || out.includes(text)) {
      continue;
    }
    out.push(text);
    if (out.length >= max) {
      break;
    }
  }
  return Object.freeze(out);
}

function normalizePlaneEntry(rawKey, rawValue) {
  const key = safeString(rawKey, 80).toLowerCase().replace(/[\s-]+/g, "_");
  const value = rawValue && typeof rawValue === "object" ? rawValue : {};
  return Object.freeze({
    id: key,
    label: safeString(value.label, 120) || key,
    primaryRoute: safeString(value.primaryRoute, 120),
    headlineSurface: safeString(value.headlineSurface, 260),
    promotionRule: safeString(value.promotionRule, 160),
    responsibilities: uniqueStrings(value.responsibilities, 24),
    optimizationTargets: uniqueStrings(value.optimizationTargets, 24),
    forbiddenProtectedInputs: uniqueStrings(value.forbiddenProtectedInputs, 24),
    protectedAssetRoots: uniqueStrings(value.protectedAssetRoots, 16),
    surfaceRoots: uniqueStrings(value.surfaceRoots, 16),
    operatorSurfaces: uniqueStrings(value.operatorSurfaces, 24),
    supportingSurfaces: uniqueStrings(value.supportingSurfaces, 24),
  });
}

function normalizePlanes(value) {
  const source = value && typeof value === "object" ? value : defaultHarnessPlaneContract.planes;
  const entries = {};
  for (const [key, rawPlane] of Object.entries(source)) {
    const normalized = normalizePlaneEntry(key, rawPlane);
    if (!normalized.id) {
      continue;
    }
    entries[normalized.id] = normalized;
  }
  return Object.freeze(entries);
}

function normalizeStrictChecks(values) {
  const out = [];
  const seen = new Set();
  for (const entry of Array.isArray(values) ? values : []) {
    const source = entry && typeof entry === "object" ? entry : {};
    const id = safeString(source.id, 160).toLowerCase();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(Object.freeze({
      id,
      scope: safeString(source.scope, 120) || "unspecified",
    }));
  }
  return Object.freeze(out);
}

function normalizeHarnessPlaneContract(input) {
  const payload = input && typeof input === "object" ? input : {};
  return Object.freeze({
    schema: safeString(payload.schema, 120) || defaultHarnessPlaneContract.schema,
    version: safeString(payload.version, 120) || defaultHarnessPlaneContract.version,
    sourceDoc: safeString(payload.sourceDoc, 260) || defaultHarnessPlaneContract.sourceDoc,
    repoIdentity: Object.freeze({
      mode: safeString(payload.repoIdentity && payload.repoIdentity.mode, 120) || defaultHarnessPlaneContract.repoIdentity.mode,
      positioning: safeString(payload.repoIdentity && payload.repoIdentity.positioning, 240) || defaultHarnessPlaneContract.repoIdentity.positioning,
      boundaryRule: safeString(payload.repoIdentity && payload.repoIdentity.boundaryRule, 160) || defaultHarnessPlaneContract.repoIdentity.boundaryRule,
      parallelHarnessesForbidden: payload.repoIdentity && Object.prototype.hasOwnProperty.call(payload.repoIdentity, "parallelHarnessesForbidden")
        ? payload.repoIdentity.parallelHarnessesForbidden !== false
        : defaultHarnessPlaneContract.repoIdentity.parallelHarnessesForbidden,
    }),
    primaryRoutes: Object.freeze({
      execution: safeString(payload.primaryRoutes && payload.primaryRoutes.execution, 120) || defaultHarnessPlaneContract.primaryRoutes.execution,
      evaluation: safeString(payload.primaryRoutes && payload.primaryRoutes.evaluation, 120) || defaultHarnessPlaneContract.primaryRoutes.evaluation,
    }),
    planes: normalizePlanes(payload.planes),
    trustBoundaries: Object.freeze({
      executionCannotDependOn: uniqueStrings(payload.trustBoundaries && payload.trustBoundaries.executionCannotDependOn, 24),
      evaluationReadsExecutionArtifacts: uniqueStrings(payload.trustBoundaries && payload.trustBoundaries.evaluationReadsExecutionArtifacts, 24),
      protectedEvalAssetRoots: uniqueStrings(payload.trustBoundaries && payload.trustBoundaries.protectedEvalAssetRoots, 16),
      protectedEvalAssetsVisibleOnlyTo: uniqueStrings(payload.trustBoundaries && payload.trustBoundaries.protectedEvalAssetsVisibleOnlyTo, 8),
      governancePromotionRequires: uniqueStrings(payload.trustBoundaries && payload.trustBoundaries.governancePromotionRequires, 12),
      workerCurrentTruthOwner: safeString(payload.trustBoundaries && payload.trustBoundaries.workerCurrentTruthOwner, 120) || defaultHarnessPlaneContract.trustBoundaries.workerCurrentTruthOwner,
      sovereignCanBeLegacyAliasOnly: payload.trustBoundaries && Object.prototype.hasOwnProperty.call(payload.trustBoundaries, "sovereignCanBeLegacyAliasOnly")
        ? payload.trustBoundaries.sovereignCanBeLegacyAliasOnly !== false
        : defaultHarnessPlaneContract.trustBoundaries.sovereignCanBeLegacyAliasOnly,
    }),
    currentTruthSurfaces: Object.freeze({
      headlineGovernanceSurface: safeString(payload.currentTruthSurfaces && payload.currentTruthSurfaces.headlineGovernanceSurface, 260) || defaultHarnessPlaneContract.currentTruthSurfaces.headlineGovernanceSurface,
      programReadinessSurface: safeString(payload.currentTruthSurfaces && payload.currentTruthSurfaces.programReadinessSurface, 260) || defaultHarnessPlaneContract.currentTruthSurfaces.programReadinessSurface,
      subjectiveCompanionSurface: safeString(payload.currentTruthSurfaces && payload.currentTruthSurfaces.subjectiveCompanionSurface, 260) || defaultHarnessPlaneContract.currentTruthSurfaces.subjectiveCompanionSurface,
      compatibilitySurface: safeString(payload.currentTruthSurfaces && payload.currentTruthSurfaces.compatibilitySurface, 260) || defaultHarnessPlaneContract.currentTruthSurfaces.compatibilitySurface,
      legacyAliasSurface: safeString(payload.currentTruthSurfaces && payload.currentTruthSurfaces.legacyAliasSurface, 260) || defaultHarnessPlaneContract.currentTruthSurfaces.legacyAliasSurface,
    }),
    strictChecks: normalizeStrictChecks(payload.strictChecks),
    requiredDocs: uniqueStrings(payload.requiredDocs, 24),
  });
}

function loadHarnessPlaneContract(filePath = defaultHarnessPlaneContractPath) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  return normalizeHarnessPlaneContract(raw ? JSON.parse(raw) : {});
}

function summarizeHarnessPlaneContract(contract) {
  const normalized = normalizeHarnessPlaneContract(contract);
  const planeIds = Object.keys(normalized.planes);
  const summarizedPlanes = {};
  for (const planeId of planeIds) {
    const plane = normalized.planes[planeId];
    summarizedPlanes[planeId] = {
      label: plane.label,
      primaryRoute: plane.primaryRoute,
      headlineSurface: plane.headlineSurface,
      promotionRule: plane.promotionRule,
      responsibilities: plane.responsibilities,
      optimizationTargets: plane.optimizationTargets,
      forbiddenProtectedInputs: plane.forbiddenProtectedInputs,
      protectedAssetRoots: plane.protectedAssetRoots,
      surfaceRoots: plane.surfaceRoots,
      operatorSurfaces: plane.operatorSurfaces,
      supportingSurfaces: plane.supportingSurfaces,
    };
  }
  return {
    schema: normalized.schema,
    version: normalized.version,
    sourceDoc: normalized.sourceDoc,
    repoIdentity: normalized.repoIdentity,
    primaryRoutes: normalized.primaryRoutes,
    planeIds,
    planes: summarizedPlanes,
    trustBoundaries: normalized.trustBoundaries,
    currentTruthSurfaces: normalized.currentTruthSurfaces,
    strictChecks: normalized.strictChecks.map((entry) => entry.id),
    requiredDocs: normalized.requiredDocs,
  };
}

module.exports = {
  defaultHarnessPlaneContractPath,
  loadHarnessPlaneContract,
  normalizeHarnessPlaneContract,
  summarizeHarnessPlaneContract,
};
