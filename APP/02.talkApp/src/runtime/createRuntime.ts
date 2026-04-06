import { appConfig } from '../shared/config.js';
import { RuntimeProvider, RuntimeStatus } from '../shared/types.js';
import { assertCodexExecReady, generateWithCodexExec } from './codexExecRuntime.js';
import { generateWithHarness, getHarnessRuntimeStatus } from './harnessRuntime.js';
import { generateWithResponses, responsesReady } from './responsesRuntime.js';
import { RuntimeGenerateOptions, RuntimeGenerateResult } from './types.js';
import { promptSourcePath } from '../shared/paths.js';

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  const harness = await getHarnessRuntimeStatus();
  let codexReady = false;
  let codexError = '';

  try {
    await assertCodexExecReady();
    codexReady = true;
  } catch (error) {
    codexError = error instanceof Error ? error.message : 'codex-exec unavailable';
  }

  const responses = {
    ready: responsesReady(),
    error: responsesReady() ? '' : 'OPENAI_API_KEY is not set.',
    defaultModel: appConfig.defaultResponsesModel,
    supportsWebSearch: true,
  };

  const codexExec = {
    ready: codexReady,
    error: codexReady ? '' : codexError,
    defaultModel: appConfig.defaultCodexModel,
    supportsWebSearch: false,
  };

  return {
    ready: harness.ready || codexReady || responses.ready,
    defaultProvider: appConfig.defaultProvider,
    selectedProvider: chooseProvider(appConfig.defaultProvider, harness.ready, codexExec.ready, responses.ready),
    defaultReasoningEffort: appConfig.defaultReasoningEffort,
    defaultVerbosity: appConfig.defaultVerbosity,
    promptSource: promptSourcePath,
    providers: {
      harness,
      'codex-exec': codexExec,
      responses,
    },
  };
}

export function chooseProvider(
  requested: RuntimeProvider,
  harnessReady: boolean,
  codexReady: boolean,
  responsesAreReady: boolean,
): RuntimeProvider | '' {
  if (requested === 'harness') {
    return harnessReady ? 'harness' : '';
  }
  if (requested === 'codex-exec') {
    return codexReady ? 'codex-exec' : '';
  }
  if (requested === 'responses') {
    return responsesAreReady ? 'responses' : '';
  }
  if (harnessReady) {
    return 'harness';
  }
  if (codexReady) {
    return 'codex-exec';
  }
  if (responsesAreReady) {
    return 'responses';
  }
  return '';
}

export async function generateWithRuntime(
  provider: RuntimeProvider | '',
  options: RuntimeGenerateOptions,
): Promise<RuntimeGenerateResult> {
  if (provider === 'harness') {
    return generateWithHarness(options);
  }
  if (provider === 'responses') {
    return generateWithResponses(options);
  }
  if (provider === 'codex-exec') {
    return generateWithCodexExec(options);
  }
  throw new Error('No runtime provider is available.');
}
