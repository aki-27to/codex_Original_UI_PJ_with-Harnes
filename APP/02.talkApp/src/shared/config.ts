import { existsSync, readFileSync } from 'node:fs';
import { RuntimeProvider } from './types.js';
import { envFile } from './paths.js';

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const text = readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/gu)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(envFile);

function normalizeApiKey(value: string | undefined): string {
  const normalized = (value ?? '').trim();
  if (!normalized) {
    return '';
  }

  const lowered = normalized.toLowerCase();
  if (['your_openai_api_key', 'changeme', 'sk-invalid'].includes(lowered)) {
    return '';
  }

  return normalized;
}

function normalizeBaseUrl(value: string | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) {
    return '';
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

function sanitizeProvider(value: string | undefined): RuntimeProvider {
  if (value === 'responses' || value === 'codex-exec' || value === 'harness' || value === 'auto') {
    return value;
  }
  return 'auto';
}

export const appConfig = {
  host: (process.env.HOST ?? '127.0.0.1').trim(),
  port: Number.parseInt(process.env.PORT ?? '3000', 10) || 3000,
  defaultProvider: sanitizeProvider(process.env.AI_PROVIDER),
  defaultResponsesModel: (process.env.OPENAI_MODEL ?? 'gpt-5.4').trim(),
  defaultCodexModel: (process.env.CODEX_EXEC_MODEL ?? 'gpt-5.4').trim(),
  defaultMiniModel: (process.env.MINI_MODEL ?? 'gpt-5.4-mini').trim(),
  defaultReasoningEffort: (process.env.OPENAI_REASONING_EFFORT ?? 'medium').trim() as
    | 'minimal'
    | 'low'
    | 'medium'
    | 'high'
    | 'xhigh',
  defaultVerbosity: (process.env.OPENAI_VERBOSITY ?? 'medium').trim() as 'low' | 'medium' | 'high',
  openAiApiKey: normalizeApiKey(process.env.OPENAI_API_KEY),
  harnessBaseUrl: normalizeBaseUrl(process.env.TALKAPP_HARNESS_BASE_URL ?? 'http://127.0.0.1:57525'),
  codexExecTimeoutMs: Number.parseInt(process.env.CODEX_EXEC_TIMEOUT_MS ?? '180000', 10) || 180000,
  codexExecMaxRuns: Number.parseInt(process.env.CODEX_EXEC_MAX_CONCURRENT_RUNS ?? '2', 10) || 2,
};
