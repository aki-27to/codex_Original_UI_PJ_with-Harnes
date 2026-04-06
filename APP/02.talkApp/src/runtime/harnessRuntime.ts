import { appConfig } from '../shared/config.js';
import { RuntimeAvailability } from '../shared/types.js';
import { RuntimeGenerateOptions, RuntimeGenerateResult } from './types.js';

function buildHarnessUrl(pathname: string): string {
  const base = (appConfig.harnessBaseUrl || '').trim();
  if (!base) {
    return '';
  }
  return `${base.replace(/\/+$/u, '')}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

export async function getHarnessRuntimeStatus(): Promise<RuntimeAvailability> {
  const runtimeUrl = buildHarnessUrl('/api/apps/talkapp/runtime');
  if (!runtimeUrl) {
    return {
      ready: false,
      error: 'TALKAPP_HARNESS_BASE_URL is not configured.',
      defaultModel: appConfig.defaultCodexModel,
      supportsWebSearch: false,
    };
  }

  try {
    const response = await fetch(runtimeUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(4_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ready: false,
        error: data?.error || `Harness runtime failed with status ${response.status}.`,
        defaultModel: appConfig.defaultCodexModel,
        supportsWebSearch: false,
      };
    }
    return {
      ready: Boolean(data?.ai?.ready),
      error: data?.ai?.ready ? '' : String(data?.ai?.error || 'Harness app runtime is unavailable.'),
      defaultModel: String(data?.ai?.model || appConfig.defaultCodexModel),
      supportsWebSearch: false,
    };
  } catch (error) {
    return {
      ready: false,
      error: error instanceof Error ? error.message : 'Harness app runtime is unavailable.',
      defaultModel: appConfig.defaultCodexModel,
      supportsWebSearch: false,
    };
  }
}

export async function generateWithHarness(options: RuntimeGenerateOptions): Promise<RuntimeGenerateResult> {
  const replyUrl = buildHarnessUrl('/api/apps/talkapp/reply');
  if (!replyUrl) {
    throw new Error('TALKAPP_HARNESS_BASE_URL is not configured.');
  }

  const response = await fetch(replyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: options.prompt,
      model: options.model || appConfig.defaultCodexModel,
      useWebSearch: Boolean(options.useWebSearch),
      externalWebAccess: Boolean(options.externalWebAccess),
    }),
    signal: AbortSignal.timeout(appConfig.codexExecTimeoutMs),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Harness runtime failed with status ${response.status}.`);
  }

  return {
    text: typeof data.text === 'string' ? data.text.trim() : '',
    provider: 'harness',
    model: typeof data.model === 'string' && data.model.trim() ? data.model.trim() : appConfig.defaultCodexModel,
    responseId: typeof data.responseId === 'string' ? data.responseId : '',
    citations: Array.isArray(data.citations) ? data.citations : [],
    warning: typeof data.warning === 'string' ? data.warning : '',
  };
}
