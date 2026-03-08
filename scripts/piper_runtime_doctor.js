#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  defaultPiperModelId,
  resolveRuntimeConfig,
  ensurePiperModelAssets,
  preparePiperModel,
} = require("./lib/piper_voice_runtime");

function safeString(value, max = 240) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];
  const parsed = {
    model: defaultPiperModelId,
    speaker: null,
    allowDownload: false,
    warmup: true,
    json: false,
    help: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--help" || token === "-h") {
      parsed.help = true;
      return parsed;
    }
    if (token === "--model" && i + 1 < args.length) {
      parsed.model = safeString(args[i + 1], 120) || defaultPiperModelId;
      i += 1;
      continue;
    }
    if (token === "--speaker" && i + 1 < args.length) {
      const raw = safeString(args[i + 1], 24);
      if (raw && /^\d+$/.test(raw)) {
        parsed.speaker = Number(raw);
      }
      i += 1;
      continue;
    }
    if (token === "--allow-download") {
      parsed.allowDownload = true;
      continue;
    }
    if (token === "--no-warmup") {
      parsed.warmup = false;
      continue;
    }
    if (token === "--json") {
      parsed.json = true;
      continue;
    }
  }
  return parsed;
}

function printUsage() {
  console.log("Usage: node scripts/piper_runtime_doctor.js [options]");
  console.log("");
  console.log("Options:");
  console.log("  --model <model-id>     Target model id (default: en_US-lessac-high)");
  console.log("  --speaker <id>         Optional speaker id (multi-speaker models)");
  console.log("  --allow-download       Allow model auto-download if missing (default: off)");
  console.log("  --no-warmup            Skip synthesis warmup check");
  console.log("  --json                 Print JSON output");
  console.log("  -h, --help             Show this help");
}

function looksLikeFilePath(value) {
  const raw = safeString(value, 500);
  if (!raw) return false;
  return raw.includes("\\") || raw.includes("/") || raw.endsWith(".exe");
}

function printHuman(result) {
  console.log(`[doctor] workspace: ${result.workspaceRoot}`);
  console.log(`[doctor] model: ${result.model}`);
  console.log(`[doctor] autoDownload: ${result.autoDownload ? "on" : "off"}`);
  console.log(`[doctor] warmup: ${result.warmup ? "on" : "off"}`);
  console.log(`[doctor] piper bin: ${result.piperBin}`);
  if (result.piperBinLooksLikePath) {
    console.log(`[doctor] piper bin exists: ${result.piperBinExists ? "yes" : "no"}`);
  }
  if (result.modelReady) {
    console.log(`[doctor] model ready: yes (${result.modelDir})`);
  } else {
    console.log("[doctor] model ready: no");
  }
  if (result.synthesisReady) {
    console.log("[doctor] synthesis check: PASS");
  } else {
    console.log("[doctor] synthesis check: FAIL");
  }
  if (!result.ok) {
    console.log(`[doctor] error: ${result.error || "unknown error"}`);
    if (result.code) {
      console.log(`[doctor] code: ${result.code}`);
    }
  } else {
    console.log("[doctor] overall: READY");
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return 0;
  }

  const workspaceRoot = path.resolve(__dirname, "..");
  const config = resolveRuntimeConfig({ workspaceRoot });
  const result = {
    ok: false,
    workspaceRoot,
    model: args.model,
    autoDownload: args.allowDownload,
    warmup: args.warmup,
    piperBin: config.piperBin,
    piperBinLooksLikePath: looksLikeFilePath(config.piperBin),
    piperBinExists: false,
    modelReady: false,
    modelDir: "",
    synthesisReady: false,
    code: "",
    error: "",
  };
  if (result.piperBinLooksLikePath) {
    result.piperBinExists = fs.existsSync(config.piperBin);
  }

  try {
    const assets = await ensurePiperModelAssets({
      workspaceRoot,
      model: args.model,
      autoDownload: args.allowDownload,
    });
    result.modelReady = true;
    result.modelDir = assets.modelDir;

    if (result.piperBinLooksLikePath && !result.piperBinExists) {
      result.code = "piper_bin_missing";
      result.error = `piper executable was not found at configured path: ${result.piperBin}`;
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printHuman(result);
      }
      return 3;
    }

    const prepared = await preparePiperModel({
      workspaceRoot,
      model: args.model,
      speaker: args.speaker,
      autoDownload: args.allowDownload,
      warmup: args.warmup,
    });
    result.synthesisReady = prepared.warmedUp || !args.warmup;
    result.ok = true;
  } catch (error) {
    const rawCode = safeString(error && error.code ? String(error.code) : "", 80);
    result.code = rawCode;
    result.error = safeString(error && error.message ? error.message : String(error), 400);
    if (
      rawCode === "EPERM" &&
      (!result.piperBinLooksLikePath || !result.piperBinExists)
    ) {
      result.code = "piper_bin_missing_or_blocked";
      if (!result.error) {
        result.error = "piper command is missing or blocked in this environment";
      }
    }
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  if (result.ok) return 0;
  if (result.code === "piper_model_missing") return 2;
  if (result.code === "piper_bin_missing") return 3;
  if (result.code === "piper_bin_missing_or_blocked") return 3;
  return 1;
}

run()
  .then((exitCode) => {
    process.exitCode = Number.isFinite(Number(exitCode)) ? Math.trunc(Number(exitCode)) : 1;
  })
  .catch((error) => {
    const message = error && error.message ? error.message : String(error);
    console.error(`[doctor] fatal: ${message}`);
    process.exitCode = 1;
  });
