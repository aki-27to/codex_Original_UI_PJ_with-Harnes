"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");

const defaultPiperModelId = "en_US-lessac-high";
const defaultPiperModelBaseUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0";
const modelDownloadLocks = new Map();

function safeString(value, max = 12000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, max);
}

function createStatusError(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = Number.isFinite(Number(statusCode)) ? Math.max(400, Math.min(599, Math.trunc(Number(statusCode)))) : 500;
  if (code) error.code = safeString(String(code), 80) || undefined;
  return error;
}

function normalizeLocaleToken(token) {
  const raw = safeString(token, 24);
  if (!raw) return "";
  if (!raw.includes("_")) return raw.toLowerCase();
  const [language, region] = raw.split("_");
  if (!language || !region) return "";
  return `${language.toLowerCase()}_${region.toUpperCase()}`;
}

function normalizePiperModelId(value, { requireHigh = true } = {}) {
  const raw = safeString(value, 120);
  if (!raw) throw createStatusError(400, "piper model is required", "piper_model_required");
  const matched = raw.match(/^([a-z]{2}(?:_[a-z]{2})?)-([a-z0-9_]+(?:-[a-z0-9_]+)*)-(high|medium|low)$/i);
  if (!matched) {
    throw createStatusError(400, `invalid piper model: ${raw}`, "piper_model_invalid");
  }
  const locale = normalizeLocaleToken(matched[1]);
  const voice = safeString(matched[2], 80).toLowerCase();
  const quality = safeString(matched[3], 12).toLowerCase();
  if (!locale || !voice || !quality) {
    throw createStatusError(400, `invalid piper model: ${raw}`, "piper_model_invalid");
  }
  if (requireHigh && quality !== "high") {
    throw createStatusError(400, `piper model must end with -high: ${raw}`, "piper_model_not_high");
  }
  return `${locale}-${voice}-${quality}`;
}

function normalizePiperSpeaker(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw createStatusError(400, "speaker must be a non-negative integer", "piper_speaker_invalid");
  }
  return parsed;
}

function parsePositiveIntOrFallback(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const next = Math.trunc(parsed);
  if (next < min || next > max) return fallback;
  return next;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  }
  return fallback;
}

function resolveWorkspaceBundledPiperBin(workspaceRoot) {
  const root = path.resolve(workspaceRoot || process.cwd());
  const candidates =
    process.platform === "win32"
      ? [path.join(root, "tools", "piper", "piper.exe"), path.join(root, "tools", "piper", "piper")]
      : [path.join(root, "tools", "piper", "piper"), path.join(root, "tools", "piper", "piper.exe")];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore local filesystem probe failures
    }
  }
  return "";
}

function resolveRuntimeConfig(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
  const modelRoot = path.resolve(
    options.modelRoot ||
      process.env.CODEX_PIPER_MODEL_ROOT ||
      path.join(workspaceRoot, "models", "piper")
  );
  const configuredPiperBin = safeString(options.piperBin || process.env.CODEX_PIPER_BIN, 320);
  const bundledPiperBin = resolveWorkspaceBundledPiperBin(workspaceRoot);
  const piperBin = configuredPiperBin || bundledPiperBin || "piper";
  const modelBaseUrl =
    safeString(options.modelBaseUrl || process.env.CODEX_PIPER_MODEL_BASE_URL, 800) || defaultPiperModelBaseUrl;
  const downloadTimeoutMs = parsePositiveIntOrFallback(
    options.downloadTimeoutMs || process.env.CODEX_PIPER_DOWNLOAD_TIMEOUT_MS,
    180000,
    5000,
    900000
  );
  const playbackTimeoutMs = parsePositiveIntOrFallback(
    options.playbackTimeoutMs || process.env.CODEX_PIPER_PLAYBACK_TIMEOUT_MS,
    120000,
    3000,
    900000
  );
  const textMaxChars = parsePositiveIntOrFallback(
    options.textMaxChars || process.env.CODEX_PIPER_TEXT_MAX_CHARS,
    24000,
    200,
    120000
  );
  const autoDownloadDefault = normalizeBoolean(
    options.autoDownloadDefault !== undefined ? options.autoDownloadDefault : process.env.CODEX_PIPER_AUTO_DOWNLOAD,
    true
  );
  return {
    workspaceRoot,
    modelRoot,
    piperBin,
    modelBaseUrl: modelBaseUrl.replace(/\/+$/, ""),
    downloadTimeoutMs,
    playbackTimeoutMs,
    textMaxChars,
    autoDownloadDefault,
  };
}

function resolveModelDescriptor(config, modelValue) {
  const modelId = normalizePiperModelId(modelValue || defaultPiperModelId, { requireHigh: true });
  const matched = modelId.match(/^([a-z]{2}(?:_[A-Z]{2})?)-([a-z0-9_]+(?:-[a-z0-9_]+)*)-(high|medium|low)$/i);
  if (!matched) {
    throw createStatusError(400, `invalid piper model: ${modelId}`, "piper_model_invalid");
  }
  const locale = normalizeLocaleToken(matched[1]);
  const language = locale.split("_")[0].toLowerCase();
  const voice = safeString(matched[2], 80).toLowerCase();
  const quality = safeString(matched[3], 12).toLowerCase();
  const modelDir = path.join(config.modelRoot, modelId);
  const onnxPath = path.join(modelDir, `${modelId}.onnx`);
  const configPath = path.join(modelDir, `${modelId}.onnx.json`);
  const modelUrl = `${config.modelBaseUrl}/${language}/${locale}/${voice}/${quality}/${modelId}.onnx`;
  const modelConfigUrl = `${config.modelBaseUrl}/${language}/${locale}/${voice}/${quality}/${modelId}.onnx.json`;
  return {
    modelId,
    locale,
    language,
    voice,
    quality,
    modelDir,
    onnxPath,
    configPath,
    modelUrl,
    modelConfigUrl,
  };
}

async function fileExists(targetPath) {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function removeFileQuietly(targetPath) {
  try {
    await fs.promises.unlink(targetPath);
  } catch {
    // ignore cleanup failures
  }
}

function downloadUrlToFile(urlString, destinationPath, timeoutMs, maxRedirects = 6) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const tempPath = `${destinationPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const fail = async (error) => {
      if (settled) return;
      settled = true;
      await removeFileQuietly(tempPath);
      reject(error);
    };

    const succeed = async () => {
      if (settled) return;
      settled = true;
      try {
        await fs.promises.rename(tempPath, destinationPath);
      } catch (error) {
        await removeFileQuietly(tempPath);
        reject(error);
        return;
      }
      resolve();
    };

    const requestOnce = (currentUrl, redirectsLeft) => {
      let urlObj;
      try {
        urlObj = new URL(currentUrl);
      } catch (error) {
        fail(createStatusError(500, `invalid download url: ${currentUrl}`, "piper_download_url_invalid"));
        return;
      }
      const transport = urlObj.protocol === "https:" ? https : urlObj.protocol === "http:" ? http : null;
      if (!transport) {
        fail(createStatusError(500, `unsupported url protocol: ${urlObj.protocol}`, "piper_download_protocol"));
        return;
      }
      const request = transport.get(
        urlObj,
        {
          timeout: timeoutMs,
          headers: {
            "user-agent": "codex-app-server/piper-model-downloader",
          },
        },
        (response) => {
          const statusCode = Number(response.statusCode || 0);
          const location = response.headers && response.headers.location ? String(response.headers.location) : "";
          if ((statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308) && location) {
            response.resume();
            if (redirectsLeft <= 0) {
              fail(createStatusError(502, "model download exceeded redirect limit", "piper_download_redirect_limit"));
              return;
            }
            const nextUrl = new URL(location, urlObj).toString();
            requestOnce(nextUrl, redirectsLeft - 1);
            return;
          }
          if (statusCode !== 200) {
            response.resume();
            fail(createStatusError(502, `model download failed (HTTP ${statusCode})`, "piper_download_http"));
            return;
          }

          const writeStream = fs.createWriteStream(tempPath, { flags: "w" });
          let streamFailed = false;
          const onStreamFailure = (error) => {
            if (streamFailed) return;
            streamFailed = true;
            response.destroy();
            writeStream.destroy();
            fail(createStatusError(502, `model download stream failed: ${error.message}`, "piper_download_stream"));
          };

          response.on("error", onStreamFailure);
          writeStream.on("error", onStreamFailure);
          writeStream.on("finish", () => {
            succeed().catch(() => {});
          });
          response.pipe(writeStream);
        }
      );

      request.on("timeout", () => {
        request.destroy(new Error(`download timeout after ${timeoutMs}ms`));
      });
      request.on("error", (error) => {
        const message = safeString(error && error.message ? error.message : String(error), 240) || "download request failed";
        fail(createStatusError(502, `model download failed: ${message}`, "piper_download_failed"));
      });
    };

    requestOnce(urlString, maxRedirects);
  });
}

async function ensurePiperModelAssets(options = {}) {
  const config = resolveRuntimeConfig(options);
  const descriptor = resolveModelDescriptor(config, options.model || defaultPiperModelId);
  const autoDownload = options.autoDownload === undefined
    ? config.autoDownloadDefault
    : normalizeBoolean(options.autoDownload, config.autoDownloadDefault);
  const hasOnnx = await fileExists(descriptor.onnxPath);
  const hasConfig = await fileExists(descriptor.configPath);
  if (hasOnnx && hasConfig) {
    return {
      downloadedModel: false,
      modelId: descriptor.modelId,
      onnxPath: descriptor.onnxPath,
      configPath: descriptor.configPath,
      modelDir: descriptor.modelDir,
    };
  }
  if (!autoDownload) {
    throw createStatusError(
      404,
      `piper model is missing: ${descriptor.modelId} (run: node scripts/piper_model_setup.js --model ${descriptor.modelId})`,
      "piper_model_missing"
    );
  }

  const lockKey = descriptor.modelId;
  if (modelDownloadLocks.has(lockKey)) {
    await modelDownloadLocks.get(lockKey);
  } else {
    const lockPromise = (async () => {
      await fs.promises.mkdir(descriptor.modelDir, { recursive: true });
      if (!(await fileExists(descriptor.onnxPath))) {
        await downloadUrlToFile(descriptor.modelUrl, descriptor.onnxPath, config.downloadTimeoutMs);
      }
      if (!(await fileExists(descriptor.configPath))) {
        await downloadUrlToFile(descriptor.modelConfigUrl, descriptor.configPath, config.downloadTimeoutMs);
      }
    })();
    modelDownloadLocks.set(lockKey, lockPromise);
    try {
      await lockPromise;
    } finally {
      modelDownloadLocks.delete(lockKey);
    }
  }

  const finalOnnx = await fileExists(descriptor.onnxPath);
  const finalConfig = await fileExists(descriptor.configPath);
  if (!finalOnnx || !finalConfig) {
    throw createStatusError(502, `piper model download incomplete: ${descriptor.modelId}`, "piper_model_download_incomplete");
  }

  return {
    downloadedModel: true,
    modelId: descriptor.modelId,
    onnxPath: descriptor.onnxPath,
    configPath: descriptor.configPath,
    modelDir: descriptor.modelDir,
  };
}

function runCommand(command, args, { cwd, inputText = "", timeoutMs = 120000, label = "command" } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    let timer = null;
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      reject(error);
      return;
    }

    const finalize = (error, result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        finalize(createStatusError(504, `${label} timed out after ${timeoutMs}ms`, "piper_timeout"));
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 512000) stdout = stdout.slice(-512000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 512000) stderr = stderr.slice(-512000);
    });
    child.on("error", (error) => finalize(error));
    child.on("close", (code, signal) => {
      finalize(null, {
        code: Number.isFinite(Number(code)) ? Math.trunc(Number(code)) : -1,
        signal: signal || "",
        stdout,
        stderr,
      });
    });

    try {
      if (child.stdin && !child.stdin.destroyed) {
        child.stdin.end(typeof inputText === "string" ? inputText : "");
      }
    } catch {
      // ignore stdin write failures
    }
  });
}

function formatCommandErrorOutput(result) {
  if (!result || typeof result !== "object") return "";
  const stderr = safeString(result.stderr || "", 320);
  const stdout = safeString(result.stdout || "", 320);
  if (stderr) return stderr;
  if (stdout) return stdout;
  return "";
}

async function playWaveFile(filePath, config) {
  if (process.platform === "win32") {
    const escaped = filePath.replace(/'/g, "''");
    const script = `$ErrorActionPreference='Stop';$player=New-Object System.Media.SoundPlayer '${escaped}';$player.Load();$player.PlaySync();`;
    const result = await runCommand(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { cwd: config.workspaceRoot, timeoutMs: config.playbackTimeoutMs, label: "windows playback" }
    );
    if (result.code !== 0) {
      throw createStatusError(500, `audio playback failed: ${formatCommandErrorOutput(result) || "powershell playback failed"}`, "piper_playback_failed");
    }
    return;
  }
  if (process.platform === "darwin") {
    const result = await runCommand("afplay", [filePath], {
      cwd: config.workspaceRoot,
      timeoutMs: config.playbackTimeoutMs,
      label: "afplay playback",
    });
    if (result.code !== 0) {
      throw createStatusError(500, `audio playback failed: ${formatCommandErrorOutput(result) || "afplay failed"}`, "piper_playback_failed");
    }
    return;
  }
  const tryLinux = async (binary) => {
    try {
      const result = await runCommand(binary, [filePath], {
        cwd: config.workspaceRoot,
        timeoutMs: config.playbackTimeoutMs,
        label: `${binary} playback`,
      });
      if (result.code !== 0) {
        throw createStatusError(500, `audio playback failed: ${formatCommandErrorOutput(result) || `${binary} failed`}`, "piper_playback_failed");
      }
      return true;
    } catch (error) {
      if (error && error.code === "ENOENT") return false;
      throw error;
    }
  };
  if (await tryLinux("aplay")) return;
  if (await tryLinux("paplay")) return;
  throw createStatusError(500, "audio playback failed: no supported player command found", "piper_playback_failed");
}

async function synthesizeToWaveFile({ text, modelPath, speaker, outputPath, config }) {
  const args = ["--model", modelPath, "--output_file", outputPath];
  if (speaker !== null) {
    args.push("--speaker", String(speaker));
  }
  let result;
  try {
    result = await runCommand(config.piperBin, args, {
      cwd: config.workspaceRoot,
      inputText: `${text}\n`,
      timeoutMs: config.playbackTimeoutMs,
      label: "piper synthesis",
    });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw createStatusError(503, "piper executable was not found. Install Piper or set CODEX_PIPER_BIN.", "piper_bin_missing");
    }
    throw error;
  }
  if (result.code !== 0) {
    throw createStatusError(500, `piper synthesis failed: ${formatCommandErrorOutput(result) || "unknown synthesis error"}`, "piper_synthesis_failed");
  }
}

async function preparePiperModel(options = {}) {
  const config = resolveRuntimeConfig(options);
  const modelAssets = await ensurePiperModelAssets({
    ...options,
    workspaceRoot: config.workspaceRoot,
    modelRoot: config.modelRoot,
    piperBin: config.piperBin,
    modelBaseUrl: config.modelBaseUrl,
    downloadTimeoutMs: config.downloadTimeoutMs,
    playbackTimeoutMs: config.playbackTimeoutMs,
    textMaxChars: config.textMaxChars,
  });
  const warmup = normalizeBoolean(
    Object.prototype.hasOwnProperty.call(options, "warmup") ? options.warmup : true,
    true
  );
  const speaker = normalizePiperSpeaker(options.speaker);
  let warmedUp = false;
  if (warmup) {
    const warmupText = safeString(options.warmupText, Math.max(200, config.textMaxChars)) || "piper warmup";
    const outputPath = path.join(
      os.tmpdir(),
      `codex_piper_warmup_${Date.now()}_${Math.random().toString(16).slice(2)}.wav`
    );
    try {
      await synthesizeToWaveFile({
        text: warmupText,
        modelPath: modelAssets.onnxPath,
        speaker,
        outputPath,
        config,
      });
      warmedUp = true;
    } finally {
      await removeFileQuietly(outputPath);
    }
  }
  return {
    ok: true,
    modelId: modelAssets.modelId,
    speaker,
    warmedUp,
    downloadedModel: modelAssets.downloadedModel,
    modelDir: modelAssets.modelDir,
    onnxPath: modelAssets.onnxPath,
    configPath: modelAssets.configPath,
  };
}

async function speakWithPiper(options = {}) {
  const config = resolveRuntimeConfig(options);
  const text = safeString(options.text, config.textMaxChars);
  if (!text) throw createStatusError(400, "text is required", "piper_text_required");
  const speaker = normalizePiperSpeaker(options.speaker);
  const modelAssets = await ensurePiperModelAssets({
    ...options,
    workspaceRoot: config.workspaceRoot,
    modelRoot: config.modelRoot,
    piperBin: config.piperBin,
    modelBaseUrl: config.modelBaseUrl,
    downloadTimeoutMs: config.downloadTimeoutMs,
    playbackTimeoutMs: config.playbackTimeoutMs,
    textMaxChars: config.textMaxChars,
  });

  const outputPath = path.join(
    os.tmpdir(),
    `codex_piper_${Date.now()}_${Math.random().toString(16).slice(2)}.wav`
  );
  try {
    await synthesizeToWaveFile({
      text,
      modelPath: modelAssets.onnxPath,
      speaker,
      outputPath,
      config,
    });
    await playWaveFile(outputPath, config);
  } finally {
    await removeFileQuietly(outputPath);
  }

  return {
    ok: true,
    modelId: modelAssets.modelId,
    speaker,
    downloadedModel: modelAssets.downloadedModel,
    modelDir: modelAssets.modelDir,
    onnxPath: modelAssets.onnxPath,
    configPath: modelAssets.configPath,
  };
}

function getPiperRuntimeSnapshot(options = {}) {
  const config = resolveRuntimeConfig(options);
  const defaultModel = normalizePiperModelId(defaultPiperModelId, { requireHigh: true });
  return {
    ok: true,
    provider: "piper",
    endpoint: "POST /api/voice/piper",
    prepareEndpoint: "POST /api/voice/piper/prepare",
    defaultModel,
    modelRoot: config.modelRoot,
    modelBaseUrl: config.modelBaseUrl,
    piperBin: config.piperBin,
    autoDownloadDefault: config.autoDownloadDefault,
    limits: {
      textMaxChars: config.textMaxChars,
      downloadTimeoutMs: config.downloadTimeoutMs,
      playbackTimeoutMs: config.playbackTimeoutMs,
    },
  };
}

module.exports = {
  defaultPiperModelId,
  normalizePiperModelId,
  normalizePiperSpeaker,
  resolveRuntimeConfig,
  ensurePiperModelAssets,
  preparePiperModel,
  speakWithPiper,
  getPiperRuntimeSnapshot,
};
