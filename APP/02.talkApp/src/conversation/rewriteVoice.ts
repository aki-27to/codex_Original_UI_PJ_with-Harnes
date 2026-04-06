import { ChatSettings, TurnAnalysis } from '../shared/types.js';
import { applyAntiAiRewrite } from './antiAIFilter.js';

export function rewriteVoice(text: string, analysis: TurnAnalysis, settings: ChatSettings): string {
  let next = applyAntiAiRewrite(text);

  if (settings.sliders.brevity >= 70) {
    next = compressReply(next, 2);
  }

  if (analysis.priority === 'accuracy' && analysis.riskTags.length > 0 && !/verify|check|latest|condition/i.test(next)) {
    next = `${next} Verify the conditions before asserting.`;
  }

  return normalizeWhitespace(next);
}

function compressReply(text: string, maxSentences: number): string {
  const sentences = text
    .split(/(?<=[.!?。！？])/u)
    .map((part) => part.trim())
    .filter(Boolean);

  if (sentences.length <= maxSentences) {
    return text.trim();
  }

  return sentences.slice(0, maxSentences).join(' ').trim();
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .replace(/\s{2,}/gu, ' ')
    .trim();
}
