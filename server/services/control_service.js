"use strict";

function createControlService(deps) {
  const {
    validateControlMutationRequest,
    sendJson,
    validateJsonMutationContentType,
    execApiRequiredContentType,
    readRequestBody,
    defaultRequestBodyLimitBytes,
    safeString,
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
    logOperation,
    requestHeaderValue,
    controlApiTokenHeaderName,
    openCmdWindow,
  } = deps;

  async function readMutationBody(req, res, { action = "exec", requireAction = false } = {}) {
    const validation = validateControlMutationRequest(req, {
      action,
      requireAction,
      enforceActionAllowlist: false,
    });
    if (!validation.ok) {
      sendJson(res, validation.status, { ok: false, error: validation.error });
      return null;
    }
    const contentTypeValidation = validateJsonMutationContentType(req, {
      required: true,
      expectedMime: execApiRequiredContentType,
    });
    if (!contentTypeValidation.ok) {
      sendJson(res, contentTypeValidation.status, {
        ok: false,
        error: contentTypeValidation.error,
      });
      return null;
    }
    const raw = await readRequestBody(req, defaultRequestBodyLimitBytes);
    return raw ? JSON.parse(raw) : {};
  }

  async function handleIntentProfileUpdateRequest({ req, res }) {
    try {
      const body = await readMutationBody(req, res);
      if (body === null) return;
      const action = safeString(body && body.action, 80).toLowerCase();
      if (action && action !== "update_intent_profile") {
        sendJson(res, 400, { ok: false, error: `unsupported action: ${action}` });
        return;
      }
      sendJson(
        res,
        200,
        updateIntentProfileStore(
          body && body.profile && typeof body.profile === "object" ? body.profile : {}
        )
      );
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error && error.message ? error.message : String(error),
      });
    }
  }

  async function handleIntentProfileResetRequest({ req, res }) {
    try {
      const body = await readMutationBody(req, res);
      if (body === null) return;
      const action = safeString(body && body.action, 80).toLowerCase();
      if (action && action !== "reset_intent_profile") {
        sendJson(res, 400, { ok: false, error: `unsupported action: ${action}` });
        return;
      }
      sendJson(res, 200, resetIntentProfileStore());
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error && error.message ? error.message : String(error),
      });
    }
  }

  async function handleWorkspaceLockRequest({ req, res }) {
    try {
      const body = await readMutationBody(req, res);
      if (body === null) return;
      const action = safeString(body && body.action, 80).toLowerCase();
      if (action !== "lock_workspace_directory") {
        sendJson(res, 400, {
          ok: false,
          error: `unsupported action: ${action || "(empty)"}`,
        });
        return;
      }
      const requestedPath = safeString(body && body.path, 2000);
      if (!requestedPath) {
        sendJson(res, 400, { ok: false, error: "path is required" });
        return;
      }
      sendJson(res, 200, lockWorkspaceDirectory(requestedPath));
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error && error.message ? error.message : String(error),
      });
    }
  }

  async function handleWorkspaceUnlockRequest({ req, res }) {
    try {
      const body = await readMutationBody(req, res);
      if (body === null) return;
      const action = safeString(body && body.action, 80).toLowerCase();
      if (action !== "unlock_workspace_directory") {
        sendJson(res, 400, {
          ok: false,
          error: `unsupported action: ${action || "(empty)"}`,
        });
        return;
      }
      sendJson(res, 200, unlockWorkspaceDirectory());
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error && error.message ? error.message : String(error),
      });
    }
  }

  async function handleRequirementGuardValidateRequest({ req, res }) {
    try {
      const raw = await readRequestBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const inputValue = Object.prototype.hasOwnProperty.call(body, requirementGuardMatcherDefaults.inputKey)
        ? body[requirementGuardMatcherDefaults.inputKey]
        : body.inputValue;
      if (inputValue === undefined) {
        sendJson(res, 400, {
          ok: false,
          error: `${requirementGuardMatcherDefaults.inputKey} is required`,
        });
        return;
      }
      const result = evaluateRequirementGuardMatch(inputValue);
      const matcher = getRequirementGuardMatcherSnapshot();
      sendJson(res, 200, {
        ok: true,
        requirement: {
          id: requirementGuardExtensionConfig.id,
          originalRequirement: requirementGuardOriginalRequirement,
        },
        matcher,
        result,
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error && error.message ? error.message : String(error),
      });
    }
  }

  async function handleOpenCmdRequest({ req, res }) {
    try {
      if (!openCmdWindowEnabled) {
        logOperation(
          "api.open_cmd_blocked",
          {
            reason: "open-cmd disabled by CODEX_ALLOW_OPEN_CMD_WINDOW",
            status: 403,
            origin: safeString(requestHeaderValue(req, "origin"), 220),
            referer: safeString(requestHeaderValue(req, "referer"), 220),
            host: safeString(requestHeaderValue(req, "host"), 120),
            hasToken: requestHeaderValue(req, controlApiTokenHeaderName) ? 1 : 0,
            action: "",
          },
          "standard"
        );
        sendJson(res, 403, { ok: false, error: "open-cmd is disabled by runtime policy" });
        return;
      }
      const body = await readMutationBody(req, res, {
        action: "",
        requireAction: false,
      });
      if (body === null) return;
      const action = safeString(body && body.action, 80);
      const validation = validateControlMutationRequest(req, { action, requireAction: true });
      if (!validation.ok) {
        logOperation(
          "api.open_cmd_blocked",
          {
            reason: safeString(validation.error, 140),
            status: Number.isFinite(Number(validation.status))
              ? Math.trunc(Number(validation.status))
              : 403,
            origin: safeString(requestHeaderValue(req, "origin"), 220),
            referer: safeString(requestHeaderValue(req, "referer"), 220),
            host: safeString(requestHeaderValue(req, "host"), 120),
            hasToken: requestHeaderValue(req, controlApiTokenHeaderName) ? 1 : 0,
            action,
          },
          "standard"
        );
        sendJson(res, validation.status, { ok: false, error: validation.error });
        return;
      }
      logOperation(
        "api.open_cmd",
        {
          action,
          origin: safeString(requestHeaderValue(req, "origin"), 220),
          referer: safeString(requestHeaderValue(req, "referer"), 220),
          host: safeString(requestHeaderValue(req, "host"), 120),
        },
        "standard"
      );
      openCmdWindow();
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error && error.message ? error.message : String(error),
      });
    }
  }

  return Object.freeze({
    handleIntentProfileUpdateRequest,
    handleIntentProfileResetRequest,
    handleWorkspaceLockRequest,
    handleWorkspaceUnlockRequest,
    handleRequirementGuardValidateRequest,
    handleOpenCmdRequest,
  });
}

module.exports = {
  createControlService,
};
