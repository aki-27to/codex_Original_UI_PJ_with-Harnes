"use strict";

function createExecService(deps) {
  const {
    validateControlMutationRequest,
    logOperation,
    safeString,
    requestHeaderValue,
    controlApiTokenHeaderName,
    sendJson,
    normalizeIdempotencyKey,
    normalizeExecIdempotencyWaitMs,
    waitForExecIdempotencyRecord,
    buildExecIdempotencySnapshot,
    getLatestTurnSnapshot,
    validateJsonMutationContentType,
    execApiRequiredContentType,
    readRequestBody,
    execRequestBodyLimitBytes,
    extractExecIdempotencyKey,
    defaultPromptCharLimit,
    normalizeSandboxMode,
    normalizeApprovalPolicy,
    normalizeWebSearchMode,
    normalizeBooleanFlag,
    resolveFastModeEnabled,
    resolveAutomaticApprovalReviewEnabled,
    normalizeExecModel,
    defaultExecModelName,
    normalizeExecModelReasoningEffort,
    defaultExecModelReasoningEffort,
    normalizeAgentName,
    normalizeWorkingDirectory,
    workspaceRoot,
    normalizeChatImageAttachments,
    normalizeRequestUserInputPolicy,
    nonInteractiveRequestUserInputPolicy,
    normalizeExecutionProfile,
    runtimeExecutionProfile,
    normalizeExecutionIntent,
    resolveWorkspaceGuardRequirement,
    workspaceGuardLockedRoot,
    buildWorkspaceGuardSnapshot,
    getOrCreateAgentState,
    derivePreviousPlanningContextForRequest,
    applyRequirementGuardExecExtension,
    buildPromptAudit,
    resolveAgentName,
    validateRequestedAgentName,
    isReproExecutionProfile,
    extractGovernanceOverride,
    normalizeOverrideRequest,
    buildWorkspaceGuardViolation,
    summarizePathForOperationLog,
    summarizeTextForOperationLog,
    claimExecIdempotencyKey,
    hashSha256Hex,
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
    summarizeErrorForOperationLog,
  } = deps;

  async function handleExecIdempotencyRequest({ req, res, url, pathname }) {
    try {
      const validation = validateControlMutationRequest(req, { action: "exec", enforceActionAllowlist: false });
      if (!validation.ok) {
        logOperation(
          "api.exec_idempotency_status_blocked",
          {
            reason: safeString(validation.error, 180),
            status: Number.isFinite(Number(validation.status)) ? Math.trunc(Number(validation.status)) : 403,
            origin: safeString(requestHeaderValue(req, "origin"), 220),
            referer: safeString(requestHeaderValue(req, "referer"), 220),
            host: safeString(requestHeaderValue(req, "host"), 120),
            hasToken: requestHeaderValue(req, controlApiTokenHeaderName) ? 1 : 0,
          },
          "standard"
        );
        sendJson(res, validation.status, { ok: false, error: validation.error });
        return;
      }
      const encodedKey = pathname.slice("/api/exec/idempotency/".length);
      if (!encodedKey) {
        sendJson(res, 400, { ok: false, error: "idempotency key is required" });
        return;
      }
      let decodedKey = "";
      try {
        decodedKey = decodeURIComponent(encodedKey);
      } catch {
        sendJson(res, 400, { ok: false, error: "invalid idempotency key encoding" });
        return;
      }
      const key = normalizeIdempotencyKey(decodedKey);
      if (!key) {
        sendJson(res, 400, { ok: false, error: "idempotency key is required" });
        return;
      }
      const waitMs = normalizeExecIdempotencyWaitMs(url.searchParams.get("wait_ms"));
      const record = await waitForExecIdempotencyRecord(key, { waitMs });
      if (!record) {
        sendJson(res, 404, { ok: false, error: "idempotency key not found" });
        return;
      }
      const snapshot = buildExecIdempotencySnapshot(key, record);
      const latestTurn = getLatestTurnSnapshot();
      const turnSnapshot =
        snapshot &&
        snapshot.outcome &&
        snapshot.outcome.turnId &&
        latestTurn &&
        latestTurn.turn_id === snapshot.outcome.turnId
          ? latestTurn
          : null;
      sendJson(res, 200, { ok: true, idempotency: snapshot, turn: turnSnapshot });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error && error.message ? error.message : String(error) });
    }
  }

  async function handleExecRequest({ req, res, pathname }) {
    let idempotencyKey = "";
    try {
      const mutationValidation = validateControlMutationRequest(req, { action: "exec", enforceActionAllowlist: false });
      if (!mutationValidation.ok) {
        logOperation(
          "api.exec_blocked",
          {
            reason: safeString(mutationValidation.error, 180),
            status: Number.isFinite(Number(mutationValidation.status)) ? Math.trunc(Number(mutationValidation.status)) : 403,
            origin: safeString(requestHeaderValue(req, "origin"), 220),
            referer: safeString(requestHeaderValue(req, "referer"), 220),
            host: safeString(requestHeaderValue(req, "host"), 120),
            hasToken: requestHeaderValue(req, controlApiTokenHeaderName) ? 1 : 0,
          },
          "standard"
        );
        sendJson(res, mutationValidation.status, { ok: false, error: mutationValidation.error });
        return;
      }
      const contentTypeValidation = validateJsonMutationContentType(req, {
        required: true,
        expectedMime: execApiRequiredContentType,
      });
      if (!contentTypeValidation.ok) {
        logOperation(
          "api.exec_blocked",
          {
            reason: safeString(contentTypeValidation.error, 180),
            status: Number.isFinite(Number(contentTypeValidation.status)) ? Math.trunc(Number(contentTypeValidation.status)) : 415,
            origin: safeString(requestHeaderValue(req, "origin"), 220),
            referer: safeString(requestHeaderValue(req, "referer"), 220),
            host: safeString(requestHeaderValue(req, "host"), 120),
            contentType: safeString(requestHeaderValue(req, "content-type"), 120),
          },
          "standard"
        );
        sendJson(res, contentTypeValidation.status, { ok: false, error: contentTypeValidation.error });
        return;
      }
      const raw = await readRequestBody(req, execRequestBodyLimitBytes);
      const body = raw ? JSON.parse(raw) : {};
      idempotencyKey = extractExecIdempotencyKey(req, body, { normalizeIdempotencyKey });
      const rawPrompt = typeof body.prompt === "string" ? body.prompt : "";
      const prompt = safeString(rawPrompt, defaultPromptCharLimit);
      const sandboxMode = normalizeSandboxMode(body.sandboxMode);
      const approvalPolicy = normalizeApprovalPolicy(body.approvalPolicy);
      const webSearchMode = normalizeWebSearchMode(
        Object.prototype.hasOwnProperty.call(body, "webSearchMode") ? body.webSearchMode : body.webSearch,
        "disabled"
      );
      const webSearch = normalizeBooleanFlag(body.webSearch);
      const fastModeEnabled = resolveFastModeEnabled(body.fastModeEnabled);
      const automaticApprovalReviewEnabled = resolveAutomaticApprovalReviewEnabled(body.automaticApprovalReviewEnabled);
      const model = normalizeExecModel(body.model, defaultExecModelName);
      const modelReasoningEffort = normalizeExecModelReasoningEffort(body.modelReasoningEffort, defaultExecModelReasoningEffort);
      const forceNewSession = normalizeBooleanFlag(body.forceNewSession);
      const agentName = normalizeAgentName(body.agentName);
      const cwd = normalizeWorkingDirectory(body.cwd, workspaceRoot);
      const images = normalizeChatImageAttachments(body.images, body.image);
      const requestUserInputPolicy = normalizeRequestUserInputPolicy(body.requestUserInputPolicy, nonInteractiveRequestUserInputPolicy);
      const requestExecutionProfile = normalizeExecutionProfile(body.executionProfile, runtimeExecutionProfile);
      const requestExecutionIntent = normalizeExecutionIntent(body.executionIntent, "interactive");
      const requestExecutionSource = safeString(body.executionSource, 80) || "api_exec";
      const workspaceGuardRequirement = resolveWorkspaceGuardRequirement({
        prompt,
        executionSource: requestExecutionSource,
      });
      if (workspaceGuardRequirement.workspaceLockRequired && !workspaceGuardLockedRoot) {
        logOperation(
          "api.exec_blocked",
          {
            method: req.method,
            path: pathname,
            reason: "workspace_lock_required",
            executionSource: requestExecutionSource,
            cwd: summarizePathForOperationLog(cwd, 220),
            prompt: summarizeTextForOperationLog(prompt, 24000),
          },
          "standard"
        );
        sendJson(res, 409, {
          ok: false,
          error: "workspace lock required for this design-sensitive execution source",
          code: "workspace_lock_required",
          executionSource: requestExecutionSource,
          workspaceGuard: buildWorkspaceGuardSnapshot(),
        });
        return;
      }
      const reproProfileRequested = isReproExecutionProfile(requestExecutionProfile);
      const governanceOverride = extractGovernanceOverride(body, { normalizeOverrideRequest });
      const requestedAgentState = getOrCreateAgentState(agentName);
      const previousPlanningContext = derivePreviousPlanningContextForRequest(requestedAgentState, cwd);
      const extensionApplied = applyRequirementGuardExecExtension({
        prompt,
        sandboxMode,
        options: {
          approvalPolicy,
          webSearch,
          webSearchMode,
          fastModeEnabled,
          automaticApprovalReviewEnabled,
          model,
          modelReasoningEffort,
          agentName,
          cwd,
          images,
          requestUserInputPolicy,
          governanceOverride,
          forceNewSession,
          previousPlanningContext,
        },
      });
      const execPrompt = extensionApplied.prompt;
      const execPromptAudit = buildPromptAudit({
        rawPrompt,
        normalizedPrompt: execPrompt,
        maxChars: defaultPromptCharLimit,
      });
      const execSandboxMode = extensionApplied.sandboxMode;
      const execOptions = extensionApplied.options;
      const resolvedExecAgent = resolveAgentName(execOptions);
      const agentValidation = validateRequestedAgentName(resolvedExecAgent);
      if (!agentValidation.ok) {
        logOperation(
          "api.exec_blocked",
          {
            method: req.method,
            path: pathname,
            reason: safeString(agentValidation.reason, 120) || "agent_not_configured",
            agent: safeString(resolvedExecAgent, 80),
            allowedAgents: Array.isArray(agentValidation.allowedAgents) ? agentValidation.allowedAgents.slice(0, 12) : [],
          },
          "standard"
        );
        sendJson(res, 400, {
          ok: false,
          error: `agent is not configured for runtime use: ${safeString(resolvedExecAgent, 80) || "unknown"}`,
          code: "agent_not_configured",
          allowedAgents: Array.isArray(agentValidation.allowedAgents) ? agentValidation.allowedAgents.slice(0, 24) : [],
        });
        return;
      }
      if (reproProfileRequested) {
        execOptions.webSearch = false;
        execOptions.webSearchMode = "disabled";
        execOptions.forceNewSession = true;
        execOptions.requestUserInputPolicy = "blocked";
      }
      const resolvedRequestUserInputPolicy = normalizeRequestUserInputPolicy(execOptions && execOptions.requestUserInputPolicy, requestUserInputPolicy);
      const resolvedExecModel = normalizeExecModel(execOptions && execOptions.model, model);
      const resolvedExecModelReasoningEffort = normalizeExecModelReasoningEffort(execOptions && execOptions.modelReasoningEffort, modelReasoningEffort);
      execOptions.agentName = resolvedExecAgent;
      execOptions.requestUserInputPolicy = resolvedRequestUserInputPolicy;
      execOptions.model = resolvedExecModel;
      execOptions.modelReasoningEffort = resolvedExecModelReasoningEffort;
      execOptions.promptAudit = execPromptAudit;
      execOptions.executionProfile = requestExecutionProfile;
      execOptions.executionIntent = requestExecutionIntent;
      execOptions.executionSource = requestExecutionSource;
      execOptions.reproProfile = reproProfileRequested ? 1 : 0;
      execOptions.governanceOverride = normalizeOverrideRequest(execOptions && execOptions.governanceOverride ? execOptions.governanceOverride : governanceOverride);
      const resolvedExecCwd = execOptions && execOptions.cwd ? execOptions.cwd : cwd;
      const workspaceGuardViolation = buildWorkspaceGuardViolation(resolvedExecCwd);
      if (workspaceGuardViolation) {
        logOperation(
          "api.exec_blocked",
          {
            method: req.method,
            path: pathname,
            reason: safeString(workspaceGuardViolation.payload && workspaceGuardViolation.payload.code, 80) || "outside_locked_workspace",
            executionSource: requestExecutionSource,
            cwd: summarizePathForOperationLog(resolvedExecCwd, 220),
            lockedRoot: summarizePathForOperationLog(workspaceGuardLockedRoot, 220),
          },
          "standard"
        );
        sendJson(res, workspaceGuardViolation.statusCode, workspaceGuardViolation.payload);
        return;
      }
      logOperation("api.exec", {
        method: req.method,
        path: pathname,
        agent: safeString(resolvedExecAgent, 80),
        sandbox: safeString(execSandboxMode, 40),
        approval: safeString(execOptions && execOptions.approvalPolicy ? execOptions.approvalPolicy : approvalPolicy, 40),
        web: execOptions && execOptions.webSearch ? 1 : 0,
        webMode: normalizeWebSearchMode(
          execOptions && Object.prototype.hasOwnProperty.call(execOptions, "webSearchMode") ? execOptions.webSearchMode : webSearchMode,
          "disabled"
        ),
        fastModeEnabled: resolveFastModeEnabled(execOptions && execOptions.fastModeEnabled, fastModeEnabled) ? 1 : 0,
        automaticApprovalReviewEnabled: resolveAutomaticApprovalReviewEnabled(execOptions && execOptions.automaticApprovalReviewEnabled, automaticApprovalReviewEnabled) ? 1 : 0,
        model: safeString(resolvedExecModel, 120),
        modelReasoningEffort: resolvedExecModelReasoningEffort,
        cwd: summarizePathForOperationLog(resolvedExecCwd, 220),
        prompt: summarizeTextForOperationLog(execPrompt, 24000),
        promptChars: {
          input: execPromptAudit.inputLength,
          output: execPromptAudit.outputLength,
          truncated: execPromptAudit.truncated ? 1 : 0,
          limit: execPromptAudit.limit,
        },
        requestUserInputPolicy: resolvedRequestUserInputPolicy,
        executionProfile: requestExecutionProfile,
        reproProfile: reproProfileRequested ? 1 : 0,
        executionIntent: requestExecutionIntent,
        executionSource: requestExecutionSource,
        images: Array.isArray(execOptions && execOptions.images) ? execOptions.images.length : 0,
        forceNewSession: execOptions && execOptions.forceNewSession ? 1 : 0,
        idempotencyKey: safeString(idempotencyKey, 120),
        governanceOverrideBy: safeString(execOptions && execOptions.governanceOverride && execOptions.governanceOverride.requestedBy ? execOptions.governanceOverride.requestedBy : "", 80),
      });
      if (execPromptAudit.truncated) {
        logOperation(
          "api.exec_prompt_truncated",
          {
            method: req.method,
            path: pathname,
            inputChars: execPromptAudit.inputLength,
            outputChars: execPromptAudit.outputLength,
            limit: execPromptAudit.limit,
            idempotencyKey: safeString(idempotencyKey, 120),
          },
          "standard"
        );
      }
      if (!execPrompt && !execOptions.images.length) {
        logOperation("api.exec_failed", {
          method: req.method,
          path: pathname,
          reason: "empty_prompt_and_images",
        });
        sendJson(res, 400, { ok: false, error: "prompt or image is required" });
        return;
      }
      const idempotencyClaim = claimExecIdempotencyKey(idempotencyKey, {
        path: pathname,
        method: req.method,
        agent: safeString(resolvedExecAgent, 80),
        sandbox: safeString(execSandboxMode, 40),
        approval: safeString(execOptions && execOptions.approvalPolicy ? execOptions.approvalPolicy : approvalPolicy, 40),
        model: safeString(resolvedExecModel, 120),
        modelReasoningEffort: resolvedExecModelReasoningEffort,
        cwd: summarizePathForOperationLog(resolvedExecCwd, 220),
        requestUserInputPolicy: resolvedRequestUserInputPolicy,
        executionProfile: requestExecutionProfile,
        executionIntent: requestExecutionIntent,
        executionSource: requestExecutionSource,
        reproProfile: reproProfileRequested ? 1 : 0,
        governanceOverrideBy: safeString(execOptions && execOptions.governanceOverride && execOptions.governanceOverride.requestedBy ? execOptions.governanceOverride.requestedBy : "", 80),
        requestHash: hashSha256Hex(
          JSON.stringify({
            prompt: execPrompt,
            sandboxMode: execSandboxMode,
            approvalPolicy: execOptions && execOptions.approvalPolicy ? execOptions.approvalPolicy : approvalPolicy,
            webSearch: Boolean(execOptions && execOptions.webSearch),
            webSearchMode: normalizeWebSearchMode(
              execOptions && Object.prototype.hasOwnProperty.call(execOptions, "webSearchMode") ? execOptions.webSearchMode : webSearchMode,
              "disabled"
            ),
            fastModeEnabled: resolveFastModeEnabled(execOptions && execOptions.fastModeEnabled, fastModeEnabled),
            automaticApprovalReviewEnabled: resolveAutomaticApprovalReviewEnabled(execOptions && execOptions.automaticApprovalReviewEnabled, automaticApprovalReviewEnabled),
            model: resolvedExecModel,
            modelReasoningEffort: resolvedExecModelReasoningEffort,
            agentName: resolvedExecAgent,
            cwd: resolvedExecCwd,
            requestUserInputPolicy: resolvedRequestUserInputPolicy,
            executionProfile: requestExecutionProfile,
            executionIntent: requestExecutionIntent,
            executionSource: requestExecutionSource,
            governanceOverride: execOptions && execOptions.governanceOverride && typeof execOptions.governanceOverride === "object"
              ? {
                  requestedBy: safeString(execOptions.governanceOverride.requestedBy, 80) || "",
                  reason: safeString(execOptions.governanceOverride.reason, 240) || "",
                  ticket: safeString(execOptions.governanceOverride.ticket, 120) || "",
                }
              : null,
            images: Array.isArray(execOptions && execOptions.images) ? execOptions.images.length : 0,
          })
        ),
      });
      if (!idempotencyClaim.ok) {
        const existing = idempotencyClaim.record || {};
        const snapshot = buildExecIdempotencySnapshot(idempotencyKey, existing);
        const duplicateTerminalStatus = resolveExecTerminalStatusFromSnapshot(snapshot);
        const duplicateResolved = Boolean(snapshot && isResolvedExecLifecycleState(snapshot.lifecycleState || snapshot.state));
        const duplicateCompleted = duplicateResolved && isSuccessfulExecTerminalStatus(duplicateTerminalStatus);
        const duplicateReason = safeString(idempotencyClaim.reason, 80) || "duplicate";
        const requestHashMismatch = duplicateReason === "request_hash_mismatch";
        logOperation(
          "api.exec_idempotency_duplicate",
          {
            key: safeString(idempotencyKey, 120),
            state: safeString(existing.state, 40) || "unknown",
            terminalStatus: duplicateTerminalStatus,
            createdAt: Number.isFinite(Number(existing.createdAt)) ? Math.max(0, Math.trunc(Number(existing.createdAt))) : 0,
            updatedAt: Number.isFinite(Number(existing.updatedAt)) ? Math.max(0, Math.trunc(Number(existing.updatedAt))) : 0,
            duplicateCompleted: duplicateCompleted ? 1 : 0,
            reason: duplicateReason,
            requestHashMismatch: requestHashMismatch ? 1 : 0,
          },
          "standard"
        );
        if (requestHashMismatch) {
          sendJson(res, 409, {
            ok: false,
            duplicate: true,
            error: "idempotency request hash mismatch",
            code: "idempotency_request_hash_mismatch",
            reason: "request_hash_mismatch",
            idempotency: snapshot,
            requestHash: safeString(idempotencyClaim.requestHash, 160) || undefined,
            existingRequestHash: safeString(idempotencyClaim.existingRequestHash, 160) || undefined,
          });
          return;
        }
        if (duplicateResolved) {
          sendJson(res, 200, {
            ok: duplicateCompleted,
            duplicate: true,
            idempotency: snapshot,
            result: snapshot && snapshot.outcome ? snapshot.outcome : null,
          });
          return;
        }
        sendJson(res, 409, {
          ok: false,
          duplicate: true,
          error: "duplicate idempotency key",
          idempotency: snapshot,
        });
        return;
      }
      execOptions.idempotencyKey = idempotencyKey;
      let activeExecReleased = false;
      const releaseActiveExec = () => {
        if (activeExecReleased) {
          return;
        }
        activeExecReleased = true;
        decrementActiveExecRequestCount();
      };
      incrementActiveExecRequestCount();
      execOptions.onTerminal = (terminal) => {
        try {
          finalizeExecIdempotencyKey(
            idempotencyKey,
            terminal && typeof terminal === "object" ? terminal : { status: "failed", error: "missing terminal outcome" }
          );
        } finally {
          releaseActiveExec();
        }
      };
      res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "Transfer-Encoding": "chunked" });
      res.once("close", () => {
        markExecIdempotencyResponseClosed(idempotencyKey);
      });
      runCodexExecStreaming(res, execPrompt, execSandboxMode, execOptions).catch((error) => {
        logOperation("api.exec_stream_failed", {
          method: req.method,
          path: pathname,
          err: summarizeErrorForOperationLog(error, 220),
        });
        finalizeExecIdempotencyKey(idempotencyKey, {
          status: "failed",
          error: error && error.message ? error.message : String(error),
        });
        releaseActiveExec();
        if (res.writableEnded) {
          return;
        }
        writeChunk(res, `${JSON.stringify({ type: "error", text: `[error] ${error.message}` })}\n`);
        try {
          res.end();
        } catch {
        }
      });
    } catch (error) {
      if (idempotencyKey) {
        releaseExecIdempotencyKey(idempotencyKey);
      }
      const statusCode = resolveExecRequestErrorStatus(error);
      logOperation("api.exec_failed", {
        method: req.method,
        path: pathname,
        status: statusCode,
        err: summarizeErrorForOperationLog(error, 220),
      });
      sendJson(res, statusCode, { ok: false, error: error && error.message ? error.message : String(error) });
    }
  }

  return {
    handleExecIdempotencyRequest,
    handleExecRequest,
  };
}

module.exports = {
  createExecService,
};
