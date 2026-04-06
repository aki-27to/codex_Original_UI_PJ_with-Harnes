import { RuntimeProvider } from '../shared/types.js';

export interface RuntimeGenerateOptions {
  prompt: string;
  model: string;
  useWebSearch?: boolean;
  externalWebAccess?: boolean;
}

export interface RuntimeGenerateResult {
  text: string;
  provider: Exclude<RuntimeProvider, 'auto'>;
  model: string;
  responseId: string;
  citations: Array<{ title: string; url: string }>;
  warning?: string;
}
