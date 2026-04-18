"use strict";

function createBootstrapApi(ctx) {
  async function stopHarnessServer() {
    if (ctx.state.shuttingDown) {
      return;
    }
    ctx.state.shuttingDown = true;
    ctx.clearPocSchedulerTimer();
    ctx.clearOpenAIBlogLearningTimer();
    ctx.clearAnthropicEngineeringLearningTimer();
    ctx.pocSchedulerState.enabled = false;
    ctx.pocSchedulerState.nextTickAt = 0;
    ctx.persistHarnessExecutionMemoryStore({ reason: "shutdown" });
    ctx.logOperation("server.shutdown", { exitCode: 0 });
    ctx.appServer.stop();
    const serverRef = ctx.state.webServer;
    ctx.state.webServer = null;
    ctx.state.webPort = null;
    if (serverRef) {
      await Promise.race([
        new Promise((resolve) => {
          try {
            serverRef.close(() => resolve());
          } catch {
            resolve();
          }
        }),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
    ctx.state.shuttingDown = false;
  }

  function shutdown(exitCode = 0) {
    if (ctx.state.shuttingDown) {
      return;
    }
    stopHarnessServer().finally(() => {
      process.exit(exitCode);
    });
  }

  function probeExistingServer(port) {
    return new Promise((resolve) => {
      const req = ctx.http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/api/runtime",
          method: "GET",
          timeout: 5000,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk.toString("utf8");
          });
          res.on("end", () => {
            if (res.statusCode !== 200) {
              resolve(false);
              return;
            }
            try {
              const parsed = JSON.parse(data);
              resolve(parsed && parsed.mode === "app-server" && parsed.apiVersion === ctx.apiVersion);
            } catch {
              resolve(false);
            }
          });
        }
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  }

  function listenOn(port) {
    return new Promise((resolve, reject) => {
      const onError = (error) => {
        ctx.state.webServer.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        ctx.state.webServer.off("error", onError);
        resolve(port);
      };
      ctx.state.webServer.once("error", onError);
      ctx.state.webServer.once("listening", onListening);
      ctx.state.webServer.listen(port, "127.0.0.1");
    });
  }

  async function main() {
    const preferredPort =
      Number.isInteger(ctx.forcedUiPort) && ctx.forcedUiPort > 0 ? ctx.forcedUiPort : 57525;
    ctx.state.webServer = ctx.http.createServer((req, res) => {
      ctx.requestHandler(req, res).catch((error) => {
        console.error("[server] unhandled request error:", error);
        ctx.sendJson(res, 500, { error: "server error" });
      });
    });
    ctx.loadHarnessExecutionMemoryStore();
    if (ctx.refreshCurrentLogsOnly) {
      ctx.updateCurrentLogSurface({ trigger: ctx.refreshCurrentLogsTrigger });
      process.stdout.write(
        `${JSON.stringify(
          {
            ok: true,
            mode: "refresh-current-logs-only",
            trigger: ctx.refreshCurrentLogsTrigger,
            currentRoot: ctx.repoRelativePath(ctx.workspaceRoot, ctx.loggingSurfacePaths.currentRoot),
            latestRunSummaryPath: ctx.repoRelativePath(
              ctx.workspaceRoot,
              ctx.loggingSurfacePaths.currentLatestRunSummaryPath
            ),
            designConformanceSummaryPath: ctx.repoRelativePath(
              ctx.workspaceRoot,
              ctx.loggingSurfacePaths.currentDesignConformancePath
            ),
            latestSignoffSummaryPath: ctx.repoRelativePath(
              ctx.workspaceRoot,
              ctx.loggingSurfacePaths.currentLatestSignoffSummaryPath
            ),
          },
          null,
          2
        )}\n`
      );
      process.exit(0);
      return;
    }
    try {
      ctx.state.webPort = await listenOn(preferredPort);
    } catch (error) {
      if (error.code === "EADDRINUSE") {
        const existingIsOurs = await probeExistingServer(preferredPort);
        const fixedUrl = ctx.buildAutoOpenUrl(preferredPort);
        if (existingIsOurs) {
          if (ctx.autoOpenBrowser) {
            ctx.openBrowser(fixedUrl);
          }
          process.exit(0);
          return;
        }
        throw new Error(`Fixed UI port ${preferredPort} is already in use by another app.`);
      }
      throw error;
    }
    const url = ctx.buildAutoOpenUrl(ctx.state.webPort);
    if (ctx.autoOpenBrowser) {
      ctx.openBrowser(url);
    }
    const startupTurnArtifactPrune = ctx.maybePruneTurnArtifactsStorage("server_start", { force: true });
    const fullUtilization = ctx.buildFullUtilizationDefaultsSnapshot();
    const parentDispatchGuard = ctx.buildParentDispatchGuardDefaultsSnapshot();
    ctx.logOperation("server.started", {
      port: ctx.state.webPort,
      autoOpenBrowser: ctx.autoOpenBrowser ? 1 : 0,
      autoOpenPath: ctx.autoOpenPath || "/",
      autoOpenBrowserEngine: ctx.edgeExecutablePath ? "edge" : "system-default",
      executionProfile: ctx.runtimeExecutionProfile,
      executionProfileEnvKey: ctx.executionProfileEnvKey,
      executionProfileSmokeLike: ctx.isSmokeExecutionProfile(ctx.runtimeExecutionProfile) ? 1 : 0,
      fullUtilization,
      parentDispatchGuard,
      gitAutomation: ctx.buildGitAutomationRuntimeSnapshot(),
      operationLog: ctx.operationLog.runtimeSnapshot(),
      requestUserInputPolicy: ctx.nonInteractiveRequestUserInputPolicy,
      controlApiTokenHash: ctx.hashSha256Hex(ctx.controlApiToken).slice(0, 16),
      execApiGuard: {
        tokenHeader: ctx.controlApiTokenHeaderName,
        originCheck: 1,
        contentType: ctx.execApiRequiredContentType,
      },
      turnArtifactsEnabled: ctx.turnArtifactsEnabled ? 1 : 0,
      turnArtifactsRoot: ctx.summarizePathForOperationLog(ctx.turnArtifactsRoot, 220),
      turnArtifactsMaxBytes: ctx.turnArtifactsMaxBytes,
      turnArtifactsMaxDays: ctx.turnArtifactsMaxDays,
      turnArtifactsRedactionEnabled: ctx.turnArtifactsRedactionEnabled ? 1 : 0,
      turnArtifactsPrunedOnStart:
        startupTurnArtifactPrune && startupTurnArtifactPrune.deletedDirs > 0 ? 1 : 0,
      turnArtifactsPrunedBytes: startupTurnArtifactPrune
        ? Math.max(0, Math.trunc(Number(startupTurnArtifactPrune.deletedBytes) || 0))
        : 0,
      adversarialShadow: {
        enabled: ctx.adversarialShadowEnabled ? 1 : 0,
        minScore: ctx.adversarialShadowMinScore,
        maxPromptChars: ctx.adversarialShadowMaxPromptChars,
        maxAnswerChars: ctx.adversarialShadowMaxAnswerChars,
        loopEnabled: ctx.adversarialShadowEnabled && ctx.adversarialLoopEnabled ? 1 : 0,
        loopMaxRetries: ctx.adversarialLoopMaxRetries,
        version: ctx.shadowReviewVersion,
      },
      execIdempotencyTtlMs: ctx.execIdempotencyTtlMs,
      execIdempotencyStatusWaitMaxMs: ctx.execIdempotencyStatusWaitMaxMs,
      harnessMemory: ctx.buildHarnessMemoryRuntimeSnapshot(),
      evalHarness: {
        suiteId: ctx.safeString(ctx.defaultEvalSuite && ctx.defaultEvalSuite.suiteId, 120) || "unknown",
        caseCount: Array.isArray(ctx.defaultEvalSuite && ctx.defaultEvalSuite.cases)
          ? ctx.defaultEvalSuite.cases.length
          : 0,
        maxCases: ctx.evalMaxCases,
        maxVariants: ctx.evalDefaultMaxVariants,
        caseTimeoutMs: ctx.evalCaseTimeoutMs,
      },
      slo: {
        windowTurns: ctx.sloWindowTurns,
        failureRateMax: ctx.sloFailureRateMax,
        latencyP95MaxMs: ctx.sloLatencyP95MaxMs,
        idempotencyConflictRateMax: ctx.sloIdempotencyConflictRateMax,
      },
      turnContract: {
        schema:
          ctx.safeString(ctx.harnessTurnContractSpec && ctx.harnessTurnContractSpec.schema, 80)
          || "harness-turn-contract.v1",
        path: ctx.summarizePathForOperationLog(ctx.harnessTurnContractSpecPath, 220),
      },
      externalLearning: {
        enabled: ctx.openAIBlogLearningEnabled ? 1 : 0,
        intervalMinutes: ctx.openAIBlogLearningIntervalMinutes,
        policyPath: ctx.summarizePathForOperationLog(ctx.defaultOpenAIBlogLearningPolicyPath, 220),
        sourceUrl: ctx.safeString(
          ctx.openAIBlogLearningPolicy
            && ctx.openAIBlogLearningPolicy.source
            && ctx.openAIBlogLearningPolicy.source.indexUrl,
          220
        ),
        runtimeRetrievalEnabled: ctx.openAIBlogLearningRuntimeRetrievalEnabled ? 1 : 0,
        runtimeRetrievalShadowMode: ctx.openAIBlogLearningRuntimeRetrievalShadowMode ? 1 : 0,
      },
      secondaryLearning: {
        anthropicEngineering: {
          enabled: ctx.anthropicEngineeringLearningEnabled ? 1 : 0,
          intervalMinutes: ctx.anthropicEngineeringLearningIntervalMinutes,
          policyPath: ctx.summarizePathForOperationLog(
            ctx.defaultAnthropicEngineeringLearningPolicyPath,
            220
          ),
          sourceUrl: ctx.safeString(
            ctx.anthropicEngineeringLearningPolicy
              && ctx.anthropicEngineeringLearningPolicy.source
              && ctx.anthropicEngineeringLearningPolicy.source.indexUrl,
            220
          ),
          portabilityMode:
            ctx.anthropicEngineeringLearningPolicy
            && ctx.anthropicEngineeringLearningPolicy.filters
            && ctx.anthropicEngineeringLearningPolicy.filters.requirePortablePrinciples
              ? 1
              : 0,
        },
      },
    });
    ctx.updateCurrentLogSurface({ trigger: "server_started" });
    ctx.startOpenAIBlogLearningLoop();
    ctx.startAnthropicEngineeringLearningLoop();
  }

  async function startHarnessServer() {
    if (ctx.state.webServer && typeof ctx.state.webServer.listening === "boolean" && ctx.state.webServer.listening) {
      return { port: ctx.state.webPort };
    }
    await main();
    return { port: ctx.state.webPort };
  }

  function isBrokenPipeLikeError(error) {
    if (!error) {
      return false;
    }
    const code = ctx.safeString(error && error.code ? String(error.code) : "", 40).toUpperCase();
    if (code === "EPIPE" || code === "EOF") {
      return true;
    }
    const message = ctx
      .safeString(error && error.message ? String(error.message) : String(error), 240)
      .toLowerCase();
    return message.includes("epipe") || message.includes("broken pipe") || message.includes("write eof");
  }

  function attachProcessPipeErrorGuard(stream, label) {
    if (!stream || typeof stream.on !== "function") {
      return;
    }
    stream.on("error", (error) => {
      if (isBrokenPipeLikeError(error)) {
        ctx.logOperation("server.process_pipe_ignored", {
          stream: ctx.safeString(label, 40) || "unknown",
          err: ctx.summarizeErrorForOperationLog(error, 220),
        });
        return;
      }
      ctx.logOperation("server.process_pipe_error", {
        stream: ctx.safeString(label, 40) || "unknown",
        err: ctx.summarizeErrorForOperationLog(error, 220),
      });
    });
  }

  function handleFatalServerProcessError(kind, error) {
    if (isBrokenPipeLikeError(error)) {
      ctx.logOperation("server.broken_pipe_ignored", {
        source: ctx.safeString(kind, 40) || "unknown",
        err: ctx.summarizeErrorForOperationLog(error, 220),
      });
      return;
    }
    ctx.logOperation(kind, { err: ctx.summarizeErrorForOperationLog(error, 220) });
    console.error("[server] fatal process error:", error);
    shutdown(1);
  }

  function runHarnessServerCli() {
    attachProcessPipeErrorGuard(process.stdout, "stdout");
    attachProcessPipeErrorGuard(process.stderr, "stderr");
    process.on("SIGINT", () => shutdown(0));
    process.on("SIGTERM", () => shutdown(0));
    process.on("uncaughtException", (error) =>
      handleFatalServerProcessError("server.uncaught_exception", error)
    );
    process.on("unhandledRejection", (error) =>
      handleFatalServerProcessError("server.unhandled_rejection", error)
    );

    main().catch((error) => {
      ctx.logOperation("server.start_failed", {
        err: ctx.summarizeErrorForOperationLog(error, 220),
      });
      console.error("[launcher] failed to start:", error);
      process.exit(1);
    });
  }

  return {
    stopHarnessServer,
    shutdown,
    probeExistingServer,
    listenOn,
    main,
    startHarnessServer,
    isBrokenPipeLikeError,
    attachProcessPipeErrorGuard,
    handleFatalServerProcessError,
    runHarnessServerCli,
  };
}

module.exports = {
  createBootstrapApi,
};
