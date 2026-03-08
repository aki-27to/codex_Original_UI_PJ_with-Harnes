#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  defaultPiperModelId,
  ensurePiperModelAssets,
  preparePiperModel,
  getPiperRuntimeSnapshot,
} = require("./lib/piper_voice_runtime");

function printUsage() {
  console.log("Usage: node scripts/piper_model_setup.js [--model <model-id>] [--check-only] [--no-warmup]");
  console.log("");
  console.log("Examples:");
  console.log("  node scripts/piper_model_setup.js");
  console.log("  node scripts/piper_model_setup.js --model en_US-lessac-high");
  console.log("  node scripts/piper_model_setup.js --model en_US-lessac-high --no-warmup");
  console.log("  node scripts/piper_model_setup.js --model en_US-lessac-high --check-only");
}

function parseArgs(argv) {
  let model = defaultPiperModelId;
  let checkOnly = false;
  let warmup = true;
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || "");
    if (token === "--help" || token === "-h") {
      return { help: true, model, checkOnly, warmup };
    }
    if (token === "--check-only") {
      checkOnly = true;
      continue;
    }
    if (token === "--no-warmup") {
      warmup = false;
      continue;
    }
    if (token === "--model") {
      const next = String(argv[i + 1] || "").trim();
      if (!next) {
        throw new Error("--model requires a value");
      }
      model = next;
      i += 1;
      continue;
    }
    throw new Error(`unknown argument: ${token}`);
  }
  return { help: false, model, checkOnly, warmup };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const workspaceRoot = path.resolve(__dirname, "..");
  const runtime = getPiperRuntimeSnapshot({ workspaceRoot });
  console.log(`[piper] workspace: ${workspaceRoot}`);
  console.log(`[piper] model root: ${runtime.modelRoot}`);
  console.log(`[piper] base url: ${runtime.modelBaseUrl}`);
  console.log(`[piper] piper bin: ${runtime.piperBin}`);
  console.log(`[piper] target model: ${args.model}`);
  console.log(`[piper] mode: ${args.checkOnly ? "check-only" : "prepare"}`);
  console.log(`[piper] warmup: ${args.warmup ? "on" : "off"}`);

  const result = args.checkOnly
    ? await ensurePiperModelAssets({
        workspaceRoot,
        model: args.model,
        autoDownload: false,
      })
    : await preparePiperModel({
        workspaceRoot,
        model: args.model,
        autoDownload: true,
        warmup: args.warmup,
      });
  console.log(`[piper] ready: ${result.modelId}`);
  console.log(`[piper] downloaded: ${result.downloadedModel ? "yes" : "no (already present)"}`);
  if (!args.checkOnly) {
    console.log(`[piper] warmed up: ${result.warmedUp ? "yes" : "no"}`);
  }
  console.log(`[piper] onnx: ${result.onnxPath}`);
  console.log(`[piper] config: ${result.configPath}`);
}

main().catch((error) => {
  const status = Number.isFinite(Number(error && error.statusCode)) ? Math.trunc(Number(error.statusCode)) : 1;
  const code = error && error.code ? String(error.code) : "error";
  const message = error && error.message ? String(error.message) : String(error);
  console.error(`[piper] ${code}: ${message}`);
  process.exit(status >= 400 ? 1 : status);
});
