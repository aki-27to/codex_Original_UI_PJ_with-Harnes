#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const { createExecService } = require("../server/services/exec_service");

const workspaceRoot = path.resolve(__dirname, "..");

function safeString(value, limit) {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  const max = Number.isFinite(Number(limit)) ? Math.max(0, Math.trunc(Number(limit))) : text.length;
  return text.slice(0, max);
}

function createResponse() {
  return {
    writableEnded: false,
    writeHead() {},
    once() {},
    end() {
      this.writableEnded = true;
    },
  };
}

async function captureExecPrompt(body) {
  let captured = null;
  let extensionPrompt = null;
  const deps = {
    validateControlMutationRequest: () => ({ ok: true }),
    logOperation: () => {},
    safeString,
    requestHeaderValue: () => "",
    controlApiTokenHeaderName: "x-control-token",
    sendJson(_res, status, payload) {
      throw new Error(`unexpected sendJson ${status}: ${JSON.stringify(payload)}`);
    },
    normalizeIdempotencyKey: (value) => safeString(value || `test-${Math.random()}`, 120),
    normalizeExecIdempotencyWaitMs: () => 0,
    waitForExecIdempotencyRecord: async () => null,
    buildExecIdempotencySnapshot: () => null,
    getLatestTurnSnapshot: () => null,
    validateJsonMutationContentType: () => ({ ok: true }),
    execApiRequiredContentType: "application/json",
    readRequestBody: async () => JSON.stringify(body),
    execRequestBodyLimitBytes: 1024 * 1024,
    extractExecIdempotencyKey: (_req, requestBody) => requestBody.idempotencyKey || `key-${Math.random()}`,
    defaultPromptCharLimit: 20000,
    normalizeSandboxMode: (value) => value || "workspace-write",
    normalizeApprovalPolicy: (value) => value || "on-request",
    normalizeWebSearchMode: (value, fallback = "disabled") => value || fallback,
    normalizeBooleanFlag: (value) => Boolean(value),
    resolveFastModeEnabled: (value, fallback = false) => (value == null ? Boolean(fallback) : Boolean(value)),
    resolveAutomaticApprovalReviewEnabled: (value, fallback = false) => (value == null ? Boolean(fallback) : Boolean(value)),
    normalizeExecModel: (value, fallback) => value || fallback,
    defaultExecModelName: "gpt-5.5",
    normalizeExecModelReasoningEffort: (value, fallback) => value || fallback,
    defaultExecModelReasoningEffort: "xhigh",
    normalizeAgentName: (value) => value || "default",
    normalizeWorkingDirectory: (value, fallback) => value || fallback,
    workspaceRoot,
    normalizeChatImageAttachments: () => [],
    normalizeRequestUserInputPolicy: (value, fallback = "blocked") => value || fallback,
    normalizeCodexMemoryMode: (value, fallback = "default") => value || fallback,
    nonInteractiveRequestUserInputPolicy: "blocked",
    normalizeExecutionProfile: (value, fallback) => value || fallback,
    runtimeExecutionProfile: "interactive",
    normalizeExecutionIntent: (value, fallback) => value || fallback,
    resolveWorkspaceGuardRequirement: () => ({ workspaceLockRequired: false }),
    getWorkspaceGuardLockedRoot: () => workspaceRoot,
    buildWorkspaceGuardSnapshot: () => ({}),
    getOrCreateAgentState: () => ({}),
    derivePreviousPlanningContextForRequest: () => null,
    applyRequirementGuardExecExtension(input) {
      extensionPrompt = input.prompt;
      return { prompt: input.prompt, sandboxMode: input.sandboxMode, options: input.options };
    },
    buildPromptAudit: ({ rawPrompt, normalizedPrompt, maxChars }) => ({
      inputLength: rawPrompt.length,
      outputLength: normalizedPrompt.length,
      truncated: false,
      limit: maxChars,
    }),
    resolveAgentName: (options) => options.agentName || "default",
    validateRequestedAgentName: () => ({ ok: true }),
    isReproExecutionProfile: () => false,
    extractGovernanceOverride: () => null,
    normalizeOverrideRequest: (value) => value || null,
    buildWorkspaceGuardViolation: () => null,
    summarizePathForOperationLog: (value) => safeString(value, 220),
    summarizeTextForOperationLog: (value) => safeString(value, 24000),
    claimExecIdempotencyKey: () => ({ ok: true }),
    hashSha256Hex: () => "hash",
    resolveExecTerminalStatusFromSnapshot: () => "",
    isResolvedExecLifecycleState: () => false,
    isSuccessfulExecTerminalStatus: () => false,
    incrementActiveExecRequestCount: () => {},
    decrementActiveExecRequestCount: () => {},
    finalizeExecIdempotencyKey: () => {},
    markExecIdempotencyResponseClosed: () => {},
    runCodexExecStreaming: async (res, prompt, sandboxMode, options) => {
      captured = { prompt, sandboxMode, options, extensionPrompt };
      if (typeof options.onTerminal === "function") {
        options.onTerminal({ status: "completed" });
      }
      res.end();
    },
    writeChunk: () => {},
    releaseExecIdempotencyKey: () => {},
    resolveExecRequestErrorStatus: () => 500,
    summarizeErrorForOperationLog: (error) => safeString(error && error.message ? error.message : error, 220),
  };

  const service = createExecService(deps);
  await service.handleExecRequest({
    req: { method: "POST" },
    res: createResponse(),
    pathname: "/api/exec",
  });
  assert(captured, "runCodexExecStreaming should receive a request");
  return captured;
}

async function main() {
  const webUi = await captureExecPrompt({
    prompt: "AIの最終回答で変更ファイルが分かるようにして",
    executionSource: "web_ui",
    idempotencyKey: "web-ui",
  });
  assert(webUi.prompt.includes("HarnesUI response-format hint"), "web_ui requests should receive the HarnesUI answer-format hint");
  assert(webUi.prompt.includes("`変更ファイル`"), "web_ui answer-format hint should ask for a changed-file section");
  assert.strictEqual(webUi.extensionPrompt, webUi.prompt, "requirement guard should receive the guided prompt");

  const apiExec = await captureExecPrompt({
    prompt: "AIの最終回答で変更ファイルが分かるようにして",
    executionSource: "api_exec",
    idempotencyKey: "api-exec",
  });
  assert(!apiExec.prompt.includes("HarnesUI response-format hint"), "non-HarnesUI API callers should not receive UI-specific answer guidance");

  const exact = await captureExecPrompt({
    prompt: "Return exactly one line: frontend-ok",
    executionSource: "web_ui",
    idempotencyKey: "exact",
  });
  assert(!exact.prompt.includes("HarnesUI response-format hint"), "exact output contracts must not be polluted by answer-format guidance");

  const slash = await captureExecPrompt({
    prompt: "/status",
    executionSource: "web_ui",
    idempotencyKey: "slash",
  });
  assert(!slash.prompt.includes("HarnesUI response-format hint"), "local slash command output must not receive changed-file answer guidance");

  process.stdout.write("PASS harnesui_response_format_guidance_test\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
