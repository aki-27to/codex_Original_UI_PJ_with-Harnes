import { appConfig } from '../shared/config.js';
import { RuntimeGenerateOptions, RuntimeGenerateResult } from './types.js';

export function responsesReady(): boolean {
  return Boolean(appConfig.openAiApiKey);
}

export async function generateWithResponses(options: RuntimeGenerateOptions): Promise<RuntimeGenerateResult> {
  if (!responsesReady()) {
    throw new Error('OPENAI_API_KEY is not configured.');
  }

  const payload = {
    model: options.model || appConfig.defaultResponsesModel,
    input: options.prompt,
    store: false,
    text: {
      verbosity: 'medium',
    },
    tools: options.useWebSearch
      ? [
          {
            type: 'web_search',
            external_web_access: Boolean(options.externalWebAccess),
          },
        ]
      : undefined,
    truncation: 'auto',
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${appConfig.openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90_000),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message ?? `Responses API failed with status ${response.status}`);
  }

  const outputText = typeof data.output_text === 'string'
    ? data.output_text
    : Array.isArray(data.output)
      ? data.output
          .flatMap((item: any) => item?.content ?? [])
          .map((content: any) => content?.text ?? '')
          .filter(Boolean)
          .join('\n')
      : '';

  const citations: Array<{ title: string; url: string }> = [];
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!Array.isArray(item?.content)) {
        continue;
      }
      for (const content of item.content) {
        if (!Array.isArray(content?.annotations)) {
          continue;
        }
        for (const annotation of content.annotations) {
          if (annotation?.type === 'url_citation' && annotation.url) {
            citations.push({
              title: annotation.title || annotation.url,
              url: annotation.url,
            });
          }
        }
      }
    }
  }

  return {
    text: outputText.trim(),
    provider: 'responses',
    model: options.model || appConfig.defaultResponsesModel,
    responseId: typeof data.id === 'string' ? data.id : '',
    citations,
  };
}
