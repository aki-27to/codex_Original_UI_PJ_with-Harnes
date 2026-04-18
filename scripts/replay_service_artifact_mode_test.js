#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createReplayService } = require("../server/services/replay_service");

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "replay-artifact-test-"));
  const artifactDir = path.join(tempRoot, "bundle");
  fs.mkdirSync(artifactDir, { recursive: true });

  const manifestPath = path.join(artifactDir, "manifest.json");
  const itemsPath = path.join(artifactDir, "items.ndjson");
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({
      terminal: { status: "completed", error: "" },
      turn: { turnId: "turn-source", threadId: "thread-source" },
    })}\n`,
    "utf8"
  );
  fs.writeFileSync(
    itemsPath,
    `${JSON.stringify({
      phase: "completed",
      item: { type: "agentMessage", text: "artifact replay output" },
    })}\n`,
    "utf8"
  );

  let captured = null;
  let liveRerunCount = 0;
  const replayService = createReplayService({
    fs,
    path,
    validateControlMutationRequest() {
      return { ok: true, status: 200, error: "" };
    },
    sendJson(_res, status, payload) {
      captured = { status, payload };
    },
    listReplayMemorySnapshots() {
      return [];
    },
    getReplayMemoryRecord(turnId) {
      if (turnId !== "turn-source") return null;
      return {
        turnId,
        threadId: "thread-source",
        agentName: "default",
        status: "completed",
        taskOutcomeStatus: "COMPLETED",
        taskOutcomeReason: "completed_default",
        request: {
          prompt: "Replay me",
          sandboxMode: "workspace-write",
          approvalPolicy: "never",
          webSearch: 0,
          model: "gpt-5.4",
          modelReasoningEffort: "medium",
          agentName: "default",
          cwd: process.cwd(),
          requestUserInputPolicy: "blocked",
          memoryMode: "read_only",
          resetCodexMemory: 0,
          forceNewSession: 0,
          executionProfile: "standard",
          executionIntent: "replay",
          executionSource: "api_exec",
        },
        baseline: {
          outputSnapshot: "artifact replay output",
          artifactManifestPath: manifestPath,
          artifactManifestSha256: "",
        },
        startedAt: 100,
        completedAt: 160,
      };
    },
    buildReplayMemorySnapshot(record) {
      return record;
    },
    safeString(value, max = 2000) {
      if (typeof value !== "string") return "";
      return value.slice(0, max);
    },
    validateJsonMutationContentType() {
      return { ok: true, status: 200, error: "" };
    },
    execApiRequiredContentType: "application/json",
    async readRequestBody() {
      return JSON.stringify({ turnId: "turn-source" });
    },
    defaultRequestBodyLimitBytes: 1024 * 1024,
    normalizeExecutionProfile(value, fallback) {
      return typeof value === "string" && value ? value : fallback;
    },
    isReproExecutionProfile() {
      return false;
    },
    normalizeSandboxMode(value) {
      return value || "workspace-write";
    },
    normalizeApprovalPolicy(value) {
      return value || "never";
    },
    normalizeBooleanFlag(value) {
      return value === true || value === 1 || value === "1";
    },
    normalizeExecModel(value, fallback) {
      return value || fallback;
    },
    normalizeExecModelReasoningEffort(value, fallback) {
      return value || fallback;
    },
    normalizeAgentName(value) {
      return value || "";
    },
    normalizeWorkingDirectory(value, fallback) {
      return value || fallback;
    },
    normalizeCodexMemoryMode(value, fallback) {
      return value || fallback || "default";
    },
    workspaceRoot: process.cwd(),
    normalizeRequestUserInputPolicy(value, fallback) {
      return value || fallback;
    },
    normalizeExecutionIntent(value, fallback) {
      return value || fallback;
    },
    crypto: require("crypto"),
    evalCaseTimeoutMs: 10000,
    async runInternalExecRequest() {
      liveRerunCount += 1;
      return { status: "completed", finalText: "live replay output", errorText: "", turnId: "live", threadId: "live" };
    },
    buildReplayDiffMetrics(left, right) {
      return {
        similarity: String(left || "") === String(right || "") ? 1 : 0,
      };
    },
    updateReplayMemoryStats() {},
    hashSha256Hex(value) {
      return require("crypto").createHash("sha256").update(String(value || "")).digest("hex");
    },
    getAppServerCapabilitySnapshot() {
      return {
        features: {
          rawTurnItemInjection: { status: "supported" },
        },
      };
    },
  });

  await replayService.handleReplayTurnRequest({ req: {}, res: {} });

  assert.strictEqual(liveRerunCount, 0, "artifact replay should bypass live rerun when the experimental path is available");
  assert(captured && captured.status === 200, "replay service should return success");
  assert.strictEqual(captured.payload.ok, true, "replay response should stay ok");
  assert.strictEqual(captured.payload.replay.mode, "artifact_snapshot", "replay mode should surface artifact snapshot");
  assert.strictEqual(
    captured.payload.replay.outputPreview,
    "artifact replay output",
    "artifact replay should recover the stored output"
  );
  assert.strictEqual(captured.payload.diff.similarity, 1, "artifact replay should diff against the stored baseline");
  assert(
    captured.payload.replay.artifact && captured.payload.replay.artifact.recoveredFrom === "items",
    "artifact replay metadata should report how the output was recovered"
  );

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log("PASS replay_service_artifact_mode_test");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
