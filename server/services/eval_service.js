"use strict";

function createEvalService(deps) {
  const {
    validateControlMutationRequest,
    sendJson,
    evalRunHistoryMaxLines,
    readEvalRunHistory,
    summarizePathForOperationLog,
    evalRunHistoryPath,
    validateJsonMutationContentType,
    execApiRequiredContentType,
    readRequestBody,
    defaultRequestBodyLimitBytes,
    defaultEvalSuite,
    normalizeEvalSuite,
    safeString,
    loadAgiV1ProfileConfig,
    workspaceRoot,
    defaultExecAgentName,
    defaultExecModelName,
    normalizeEvalVariant,
    expandAgiV1Variants,
    evalDefaultMaxVariants,
    evalMaxCases,
    evalCaseTimeoutMs,
    normalizeBooleanFlag,
    evalLanePolicy,
    assertEvalLaneAccess,
    crypto,
    captureManifestSnapshot,
    executeEvalVariantOnSuite,
    persistHarnessExecutionMemoryStore,
    syncGovernedMemoryGraphFromLiveRuntime,
    logOperation,
    summarizeErrorForOperationLog,
    compareEvalRuns,
    buildIndependentVerifierReport,
    buildCandidateBundle,
    loadAgiBundleFromPath,
    path,
    buildEvalRunGovernanceBundle,
    adoptionReadinessContract,
    iterationControlContract,
    buildReleaseDecision,
    buildEvalSuiteSummary,
    appendEvalRunHistory,
    summarizeEvalLane,
    harnessMemoryPath,
  } = deps;

  function handleEvalSuitesRequest({ res }) {
    sendJson(res, 200, {
      ok: true,
      suites: [buildEvalSuiteSummary(defaultEvalSuite)],
      lanes: Array.isArray(evalLanePolicy && evalLanePolicy.lanes)
        ? evalLanePolicy.lanes.map((entry) => summarizeEvalLane(entry))
        : [],
      defaults: {
        maxCases: evalMaxCases,
        maxVariants: evalDefaultMaxVariants,
        caseTimeoutMs: evalCaseTimeoutMs,
      },
    });
  }

  function handleEvalHistoryRequest({ req, res, url }) {
    const validation = validateControlMutationRequest(req, { action: "exec", enforceActionAllowlist: false });
    if (!validation.ok) {
      sendJson(res, validation.status, { ok: false, error: validation.error });
      return;
    }
    const limitRaw = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(evalRunHistoryMaxLines, Math.trunc(limitRaw)))
      : 20;
    sendJson(res, 200, {
      ok: true,
      history: readEvalRunHistory({ limit }),
      historyPath: summarizePathForOperationLog(evalRunHistoryPath, 220),
    });
  }

  async function handleEvalRunRequest({ req, res }) {
    try {
      const validation = validateControlMutationRequest(req, { action: "exec", enforceActionAllowlist: false });
      if (!validation.ok) {
        sendJson(res, validation.status, { ok: false, error: validation.error });
        return;
      }
      const contentTypeValidation = validateJsonMutationContentType(req, {
        required: true,
        expectedMime: execApiRequiredContentType,
      });
      if (!contentTypeValidation.ok) {
        sendJson(res, contentTypeValidation.status, { ok: false, error: contentTypeValidation.error });
        return;
      }
      const raw = await readRequestBody(req, defaultRequestBodyLimitBytes);
      const body = raw ? JSON.parse(raw) : {};
      let suite = defaultEvalSuite;
      if (body && body.suite && typeof body.suite === "object") {
        suite = normalizeEvalSuite(body.suite, { fallbackId: "custom-suite.v1" });
      } else if (
        typeof body.suiteId === "string" &&
        safeString(body.suiteId, 120) &&
        safeString(body.suiteId, 120) !== safeString(defaultEvalSuite.suiteId, 120)
      ) {
        sendJson(res, 400, { ok: false, error: `unknown suiteId: ${safeString(body.suiteId, 120)}` });
        return;
      }
      const evaluationOptions = body && body.evaluation && typeof body.evaluation === "object" ? body.evaluation : {};
      const requestedEvaluationProfile = safeString(
        evaluationOptions.profile ||
          body.profile ||
          (suite && suite.evaluation && typeof suite.evaluation === "object" ? suite.evaluation.profile : ""),
        80
      ).toLowerCase();
      const agiProfile =
        requestedEvaluationProfile === "agi_v1"
          ? loadAgiV1ProfileConfig(safeString(evaluationOptions.profileConfigPath, 260) || undefined, {
              workspaceRoot,
              overrides:
                evaluationOptions.profileConfig && typeof evaluationOptions.profileConfig === "object"
                  ? evaluationOptions.profileConfig
                  : null,
            })
          : null;
      if (agiProfile && agiProfile.validation && agiProfile.validation.ok === false) {
        sendJson(res, 400, {
          ok: false,
          error: "invalid agi_v1 profile configuration",
          validation: agiProfile.validation,
        });
        return;
      }
      const variantsInput = Array.isArray(body.variants)
        ? body.variants
        : [
            body.variantA && typeof body.variantA === "object" ? body.variantA : null,
            body.variantB && typeof body.variantB === "object" ? body.variantB : null,
          ].filter(Boolean);
      const fallbackVariant = {
        label: "A",
        agentName: defaultExecAgentName,
        model: defaultExecModelName,
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        webSearch: 0,
        cwd: workspaceRoot,
        requestUserInputPolicy: "blocked",
        executionProfile: "eval-standard",
        executionIntent: "eval",
        executionSource: "eval_harness",
      };
      const baseNormalizedVariants = (variantsInput.length ? variantsInput : [fallbackVariant])
        .slice(0, evalDefaultMaxVariants)
        .map((entry, index) => normalizeEvalVariant(entry, index));
      const normalizedVariants = (agiProfile
        ? expandAgiV1Variants(baseNormalizedVariants, agiProfile)
        : baseNormalizedVariants
      ).slice(0, agiProfile ? evalDefaultMaxVariants * 2 : evalDefaultMaxVariants);
      if (agiProfile) {
        const uniqueCandidateIds = Array.from(
          new Set(normalizedVariants.map((entry) => safeString(entry && entry.candidateId, 120)).filter(Boolean))
        );
        if (uniqueCandidateIds.length > 1) {
          sendJson(res, 400, {
            ok: false,
            error: "agi_v1 accepts one candidateId per run; compare against an incumbent bundle instead of parallel candidates",
          });
          return;
        }
      }
      const requestedSuiteLength = Array.isArray(suite && suite.cases) ? suite.cases.length : 0;
      const maxCaseLimit = agiProfile
        ? Math.max(evalMaxCases, Math.min(120, requestedSuiteLength || evalMaxCases))
        : evalMaxCases;
      const maxCasesRaw = Number(body.maxCases);
      const maxCases = Number.isFinite(maxCasesRaw)
        ? Math.max(1, Math.min(maxCaseLimit, Math.trunc(maxCasesRaw)))
        : Math.min(maxCaseLimit, suite.cases.length);
      const timeoutRaw = Number(body.caseTimeoutMs);
      const timeoutMs = Number.isFinite(timeoutRaw)
        ? Math.max(10000, Math.min(900000, Math.trunc(timeoutRaw)))
        : evalCaseTimeoutMs;
      const persistProbeResults = normalizeBooleanFlag(
        Object.prototype.hasOwnProperty.call(body, "persistProbeResultsToMemory")
          ? body.persistProbeResultsToMemory
          : body.persistProbeResults
      );
      const laneId =
        safeString(body && body.laneId, 80).toLowerCase().replace(/[\s-]+/g, "_") ||
        safeString(evalLanePolicy && evalLanePolicy.publicLaneId, 80).toLowerCase() ||
        "public_regression";
      const evalActor = safeString(body && body.actor, 80).toLowerCase() || "developer";
      const configuredEvalLane = Array.isArray(evalLanePolicy && evalLanePolicy.lanes)
        ? evalLanePolicy.lanes.find((entry) => safeString(entry && entry.id, 80) === laneId) || null
        : null;
      if (configuredEvalLane) {
        try {
          assertEvalLaneAccess({
            policy: evalLanePolicy,
            laneId,
            actor: evalActor,
            accessMode: "execute",
            env: process.env,
          });
        } catch (error) {
          const message = safeString(error && error.message ? error.message : String(error), 220) || "eval_lane_access_denied";
          const status = /eval_lane_unlock_required/i.test(message) ? 423 : /unknown_eval_lane/i.test(message) ? 404 : 403;
          sendJson(res, status, { ok: false, error: message, laneId, actor: evalActor });
          return;
        }
      }
      const reportId = `eval-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const manifestInput =
        agiProfile && evaluationOptions.manifest && typeof evaluationOptions.manifest === "object"
          ? evaluationOptions.manifest
          : {};
      const manifestTrackedPaths = agiProfile
        ? Array.from(
            new Set(
              [
                ...(Array.isArray(manifestInput.suitePaths) ? manifestInput.suitePaths : []),
                ...(Array.isArray(manifestInput.evaluatorPaths) ? manifestInput.evaluatorPaths : []),
                ...(Array.isArray(manifestInput.datasetPaths) ? manifestInput.datasetPaths : []),
                ...(Array.isArray(manifestInput.promptTemplatePaths) ? manifestInput.promptTemplatePaths : []),
                ...(Array.isArray(manifestInput.trackedPaths) ? manifestInput.trackedPaths : []),
              ]
                .map((entry) => safeString(entry, 260))
                .filter(Boolean)
            )
          )
        : [];
      const manifestPre = agiProfile ? captureManifestSnapshot({ workspaceRoot, paths: manifestTrackedPaths }) : [];
      const runs = [];
      for (const variant of normalizedVariants) {
        const summary = await executeEvalVariantOnSuite({
          variant,
          suite,
          maxCases,
          maxCaseLimit,
          timeoutMs,
          evalRunId: reportId,
          persistProbeResults,
        });
        runs.push(summary);
      }
      const manifestPost = agiProfile ? captureManifestSnapshot({ workspaceRoot, paths: manifestTrackedPaths }) : [];
      const persistedProbeRecords = runs.reduce((acc, run) => {
        const records = run && run.probePersistence && Array.isArray(run.probePersistence.records) ? run.probePersistence.records : [];
        if (records.length) {
          acc.push(...records);
        }
        return acc;
      }, []);
      if (persistProbeResults && persistedProbeRecords.length) {
        persistHarnessExecutionMemoryStore({ reason: "eval_probe_results" });
        try {
          syncGovernedMemoryGraphFromLiveRuntime("eval_probe_results");
        } catch (error) {
          logOperation(
            "governed_memory.sync_failed",
            {
              reason: "eval_probe_results",
              err: summarizeErrorForOperationLog(error, 220),
            },
            "core"
          );
        }
      }
      const comparison = runs.length >= 2 ? compareEvalRuns(runs[0], runs[1]) : { winner: "single", reason: "single_variant" };
      const laneVerifierPolicy = configuredEvalLane;
      const verifier = buildIndependentVerifierReport({
        laneId,
        suite,
        runs,
        policy: laneVerifierPolicy && laneVerifierPolicy.verifierPolicy ? laneVerifierPolicy.verifierPolicy : null,
        source: "api_eval_run",
      });
      let agiV1Report = null;
      if (agiProfile) {
        const incumbentBundlePath = safeString(
          evaluationOptions && evaluationOptions.promotion && evaluationOptions.promotion.incumbentBundlePath,
          400
        );
        const incumbentBundle = incumbentBundlePath
          ? loadAgiBundleFromPath(path.isAbsolute(incumbentBundlePath) ? incumbentBundlePath : path.join(workspaceRoot, incumbentBundlePath))
          : evaluationOptions &&
              evaluationOptions.promotion &&
              evaluationOptions.promotion.incumbentBundle &&
              typeof evaluationOptions.promotion.incumbentBundle === "object"
            ? evaluationOptions.promotion.incumbentBundle
            : null;
        agiV1Report = buildCandidateBundle({
          workspaceRoot,
          suite,
          runs,
          profile: agiProfile,
          evaluationOptions,
          runId: reportId,
          laneId,
          manifestPre,
          manifestPost,
          incumbentBundle,
          artifactOutputRoot: path.join(workspaceRoot, "output", "agi_v1", reportId),
        });
      }
      const evalGovernanceBundle = buildEvalRunGovernanceBundle({
        suite,
        runs,
        verifier,
        comparison,
        reportId,
        adoptionReadinessContract,
        iterationControlContract,
        buildReleaseDecision,
      });
      const report = {
        runId: reportId,
        generatedAt: Date.now(),
        laneId,
        suite: buildEvalSuiteSummary(suite),
        maxCases,
        timeoutMs,
        runs,
        comparison,
        verifier,
        adoptionReadiness: evalGovernanceBundle.adoptionReadiness,
        iterationDecision: evalGovernanceBundle.iterationDecision,
        escalationDecision: evalGovernanceBundle.escalationDecision,
        releaseDecision: evalGovernanceBundle.releaseDecision,
        probePersistence: {
          requested: persistProbeResults ? 1 : 0,
          persistedRecords: persistedProbeRecords.length,
          storage: summarizePathForOperationLog(harnessMemoryPath, 220),
          records: persistedProbeRecords,
        },
        agiV1: agiV1Report,
      };
      appendEvalRunHistory(report);
      sendJson(res, 200, { ok: true, report });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error && error.message ? error.message : String(error) });
    }
  }

  return {
    handleEvalSuitesRequest,
    handleEvalHistoryRequest,
    handleEvalRunRequest,
  };
}

module.exports = {
  createEvalService,
};
