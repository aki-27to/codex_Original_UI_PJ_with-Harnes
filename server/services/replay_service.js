"use strict";

function createReplayService(deps) {
  const {
    fs,
    path,
    validateControlMutationRequest,
    sendJson,
    listReplayMemorySnapshots,
    getReplayMemoryRecord,
    buildReplayMemorySnapshot,
    safeString,
    validateJsonMutationContentType,
    execApiRequiredContentType,
    readRequestBody,
    defaultRequestBodyLimitBytes,
    normalizeExecutionProfile,
    isReproExecutionProfile,
    normalizeSandboxMode,
    normalizeApprovalPolicy,
    normalizeBooleanFlag,
    normalizeExecModel,
    normalizeExecModelReasoningEffort,
    normalizeAgentName,
    normalizeWorkingDirectory,
    normalizeCodexMemoryMode,
    workspaceRoot,
    normalizeRequestUserInputPolicy,
    normalizeExecutionIntent,
    crypto,
    evalCaseTimeoutMs,
    runInternalExecRequest,
    buildReplayDiffMetrics,
    updateReplayMemoryStats,
    hashSha256Hex,
    getAppServerCapabilitySnapshot,
  } = deps;

  function readJsonIfExists(filePath) {
    const normalized = safeString(filePath, 1000);
    if (!normalized || !fs || !fs.existsSync(normalized)) return null;
    try {
      return JSON.parse(fs.readFileSync(normalized, "utf8"));
    } catch {
      return null;
    }
  }

  function readNdjsonRecords(filePath, maxLines = 12000) {
    const normalized = safeString(filePath, 1000);
    if (!normalized || !fs || !fs.existsSync(normalized)) return [];
    try {
      const raw = fs.readFileSync(normalized, "utf8");
      return String(raw || "")
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(0, Math.max(1, Math.trunc(Number(maxLines) || 12000)))
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((entry) => entry && typeof entry === "object");
    } catch {
      return [];
    }
  }

  function normalizeReplayMode(value, fallback = "auto") {
    const raw = safeString(value, 40).toLowerCase().replace(/[\s-]+/g, "_");
    if (raw === "live" || raw === "live_rerun") return "live";
    if (raw === "artifact" || raw === "artifact_snapshot") return "artifact";
    if (raw === "auto" || raw === "default") return "auto";
    return fallback;
  }

  function buildArtifactReplayResult(sourceRecord, capabilitySnapshot) {
    const manifestPath = safeString(sourceRecord && sourceRecord.baseline && sourceRecord.baseline.artifactManifestPath, 1000);
    if (!manifestPath || !fs || !fs.existsSync(manifestPath)) {
      return null;
    }
    const manifest = readJsonIfExists(manifestPath);
    const artifactDir = path.dirname(manifestPath);
    const itemsPath = path.join(artifactDir, "items.ndjson");
    const eventsPath = path.join(artifactDir, "events.ndjson");
    if (!fs.existsSync(itemsPath) && !fs.existsSync(eventsPath)) {
      return null;
    }
    const itemRecords = readNdjsonRecords(itemsPath, 20000);
    let recoveredText = "";
    let completedAgentMessageCount = 0;
    for (const entry of itemRecords) {
      const phase = safeString(entry && entry.phase, 40);
      const item = entry && entry.item && typeof entry.item === "object" ? entry.item : {};
      if (phase !== "completed") continue;
      if (safeString(item.type, 40) !== "agentMessage") continue;
      const text = typeof item.text === "string" ? item.text : "";
      if (!text) continue;
      recoveredText = text;
      completedAgentMessageCount += 1;
    }
    const baselineText = String(sourceRecord && sourceRecord.baseline && sourceRecord.baseline.outputSnapshot || "");
    const finalText = recoveredText || baselineText;
    if (!finalText) {
      return null;
    }
    const capabilityHints = capabilitySnapshot && capabilitySnapshot.features && capabilitySnapshot.features.rawTurnItemInjection
      ? { rawTurnItemInjection: safeString(capabilitySnapshot.features.rawTurnItemInjection.status, 40) || "unknown" }
      : { rawTurnItemInjection: "unknown" };
    return {
      mode: "artifact_snapshot",
      httpStatus: 200,
      stream: false,
      elapsedMs: Math.max(
        0,
        Math.trunc(
          Number(sourceRecord && sourceRecord.completedAt || 0) - Number(sourceRecord && sourceRecord.startedAt || 0)
        )
      ),
      status: safeString(manifest && manifest.terminal && manifest.terminal.status, 40)
        || safeString(sourceRecord && sourceRecord.status, 40)
        || "completed",
      finalText,
      errorText: safeString(manifest && manifest.terminal && manifest.terminal.error, 1200) || "",
      taskOutcomeStatus: safeString(sourceRecord && sourceRecord.taskOutcomeStatus, 80).toUpperCase() || "",
      taskOutcomeReason: safeString(sourceRecord && sourceRecord.taskOutcomeReason, 120) || "",
      turnId: safeString(manifest && manifest.turn && manifest.turn.turnId, 160)
        || safeString(sourceRecord && sourceRecord.turnId, 160)
        || "",
      threadId: safeString(manifest && manifest.turn && manifest.turn.threadId, 160)
        || safeString(sourceRecord && sourceRecord.threadId, 160)
        || "",
      events: [],
      duplicate: 0,
      payload: {
        artifactReplay: {
          manifestPath,
          itemsPath: fs.existsSync(itemsPath) ? itemsPath : "",
          eventsPath: fs.existsSync(eventsPath) ? eventsPath : "",
          itemCount: itemRecords.length,
          completedAgentMessageCount,
          recoveredFrom: recoveredText ? "items" : "baseline_snapshot",
          capabilityHints,
        },
      },
    };
  }

  function validateReplayRead(req, res) {
    const validation = validateControlMutationRequest(req, { action: "exec", enforceActionAllowlist: false });
    if (!validation.ok) {
      sendJson(res, validation.status, { ok: false, error: validation.error });
      return null;
    }
    return validation;
  }

  function handleReplayTurnsRequest({ req, res, url }) {
    if (!validateReplayRead(req, res)) {
      return;
    }
    const limitRaw = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.trunc(limitRaw))) : 20;
    sendJson(res, 200, { ok: true, turns: listReplayMemorySnapshots({ limit }) });
  }

  function handleReplayTurnDetailRequest({ req, res, url, pathname }) {
    try {
      if (!validateReplayRead(req, res)) {
        return;
      }
      const encodedTurnId = pathname.slice("/api/replay/turn/".length);
      const turnId = safeString(decodeURIComponent(encodedTurnId), 160);
      if (!turnId) {
        sendJson(res, 400, { ok: false, error: "turnId is required" });
        return;
      }
      const includePrompt = String(url.searchParams.get("include_prompt") || "") === "1";
      const record = getReplayMemoryRecord(turnId);
      if (!record) {
        sendJson(res, 404, { ok: false, error: "replay turn not found" });
        return;
      }
      sendJson(res, 200, { ok: true, replay: buildReplayMemorySnapshot(record, { includePrompt }) });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error && error.message ? error.message : String(error) });
    }
  }

  async function handleReplayTurnRequest({ req, res }) {
    try {
      if (!validateReplayRead(req, res)) {
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
      const turnId = safeString(body.turnId, 160);
      if (!turnId) {
        sendJson(res, 400, { ok: false, error: "turnId is required" });
        return;
      }
      const sourceRecord = getReplayMemoryRecord(turnId);
      if (!sourceRecord) {
        sendJson(res, 404, { ok: false, error: "replay turn not found" });
        return;
      }
      const overrides = body.overrides && typeof body.overrides === "object" ? body.overrides : {};
      const requestedProfile = normalizeExecutionProfile(
        overrides.executionProfile,
        sourceRecord.request.executionProfile
      );
      const reproProfile = isReproExecutionProfile(requestedProfile);
      const replayPayload = {
        prompt: sourceRecord.request.prompt,
        sandboxMode: normalizeSandboxMode(overrides.sandboxMode || sourceRecord.request.sandboxMode),
        approvalPolicy: normalizeApprovalPolicy(
          overrides.approvalPolicy || sourceRecord.request.approvalPolicy
        ),
        webSearch: reproProfile
          ? 0
          : normalizeBooleanFlag(
              Object.prototype.hasOwnProperty.call(overrides, "webSearch")
                ? overrides.webSearch
                : sourceRecord.request.webSearch
            ),
        model: normalizeExecModel(overrides.model, sourceRecord.request.model),
        modelReasoningEffort: normalizeExecModelReasoningEffort(
          overrides.modelReasoningEffort,
          sourceRecord.request.modelReasoningEffort
        ),
        forceNewSession: reproProfile
          ? 1
          : normalizeBooleanFlag(
              Object.prototype.hasOwnProperty.call(overrides, "forceNewSession")
                ? overrides.forceNewSession
                : sourceRecord.request.forceNewSession
            ),
        agentName: normalizeAgentName(overrides.agentName) || sourceRecord.request.agentName,
        cwd: normalizeWorkingDirectory(overrides.cwd, sourceRecord.request.cwd || workspaceRoot),
        requestUserInputPolicy: reproProfile
          ? "blocked"
          : normalizeRequestUserInputPolicy(
              overrides.requestUserInputPolicy,
              sourceRecord.request.requestUserInputPolicy
            ),
        memoryMode: typeof normalizeCodexMemoryMode === "function"
          ? normalizeCodexMemoryMode(overrides.memoryMode, sourceRecord.request.memoryMode)
          : "default",
        resetCodexMemory: normalizeBooleanFlag(
          Object.prototype.hasOwnProperty.call(overrides, "resetCodexMemory")
            ? overrides.resetCodexMemory
            : sourceRecord.request.resetCodexMemory
        ),
        executionProfile: requestedProfile,
        executionIntent: normalizeExecutionIntent(
          overrides.executionIntent,
          sourceRecord.request.executionIntent || "replay"
        ),
        executionSource: safeString(overrides.executionSource, 80) || `replay:${turnId}`,
        idempotencyKey:
          safeString(body.idempotencyKey, 200)
          || `replay-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      };
      const timeoutRaw = Number(body.timeoutMs);
      const timeoutMs = Number.isFinite(timeoutRaw)
        ? Math.max(10000, Math.min(900000, Math.trunc(timeoutRaw)))
        : evalCaseTimeoutMs;
      const capabilitySnapshot = typeof getAppServerCapabilitySnapshot === "function"
        ? getAppServerCapabilitySnapshot()
        : null;
      const rawTurnItemInjectionStatus = safeString(
        capabilitySnapshot
        && capabilitySnapshot.features
        && capabilitySnapshot.features.rawTurnItemInjection
        && capabilitySnapshot.features.rawTurnItemInjection.status,
        40
      ) || "unknown";
      const requestedReplayMode = normalizeReplayMode(body.replayMode, "auto");
      const artifactReplayResult = buildArtifactReplayResult(sourceRecord, capabilitySnapshot);
      const resolvedReplayMode = requestedReplayMode === "live"
        ? "live"
        : (requestedReplayMode === "artifact"
          ? (artifactReplayResult ? "artifact" : "live")
          : (artifactReplayResult && rawTurnItemInjectionStatus === "supported" ? "artifact" : "live"));
      const replayResult = resolvedReplayMode === "artifact"
        ? artifactReplayResult
        : await runInternalExecRequest(replayPayload, { timeoutMs });
      const diff = buildReplayDiffMetrics(sourceRecord.baseline.outputSnapshot, replayResult.finalText);
      updateReplayMemoryStats(turnId, {
        status: replayResult.status,
        outputSha256: hashSha256Hex(String(replayResult.finalText || "")),
        similarity: diff.similarity,
      });
      sendJson(res, 200, {
        ok: true,
        source: buildReplayMemorySnapshot(sourceRecord),
        replay: {
          mode: safeString(replayResult.mode, 40) || (resolvedReplayMode === "artifact" ? "artifact_snapshot" : "live_rerun"),
          httpStatus: replayResult.httpStatus,
          status: replayResult.status,
          turnId: safeString(replayResult.turnId, 160) || "",
          threadId: safeString(replayResult.threadId, 160) || "",
          elapsedMs: Math.max(0, Math.trunc(Number(replayResult.elapsedMs) || 0)),
          outputSha256: hashSha256Hex(String(replayResult.finalText || "")),
          outputChars: String(replayResult.finalText || "").length,
          outputPreview: safeString(replayResult.finalText, 400),
          errorText: safeString(replayResult.errorText, 1200) || "",
          requestedMode: requestedReplayMode,
          rawTurnItemInjectionStatus,
          artifact: replayResult.payload && replayResult.payload.artifactReplay
            ? replayResult.payload.artifactReplay
            : null,
        },
        diff,
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error && error.message ? error.message : String(error) });
    }
  }

  return {
    handleReplayTurnsRequest,
    handleReplayTurnDetailRequest,
    handleReplayTurnRequest,
  };
}

module.exports = {
  createReplayService,
};
