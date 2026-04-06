import { ChatSettings, GroundingDecision, TurnAnalysis } from '../shared/types.js';

export function groundingRouter(
  analysis: TurnAnalysis,
  settings: ChatSettings,
  providerSupportsWebSearch: boolean,
): GroundingDecision {
  const required = analysis.priority === 'accuracy' || analysis.riskTags.length > 0;

  if (!required) {
    return {
      required: false,
      reason: 'conversation-first turn',
      providerAllowed: false,
      fallbackNotice: '',
    };
  }

  if (settings.webSearch && providerSupportsWebSearch) {
    return {
      required: true,
      reason: `risk tags: ${analysis.riskTags.join(', ') || 'fact-first'}`,
      providerAllowed: true,
      fallbackNotice: '',
    };
  }

  return {
    required: true,
    reason: `risk tags: ${analysis.riskTags.join(', ') || 'fact-first'}`,
    providerAllowed: false,
    fallbackNotice: 'This topic needs verification. If live grounding is unavailable, keep the answer conditional.',
  };
}
