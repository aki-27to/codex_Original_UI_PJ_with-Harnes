import { ChatMessage, ConversationStage, TurnAnalysis } from '../shared/types.js';

const pivotWords = ['\u{3066}\u{3044}\u{3046}\u{304b}', '\u{9006}\u{306b}', '\u{3080}\u{3057}\u{308d}', '\u{5225}\u{306e}\u{8ef8}', '\u{9055}\u{3046}\u{898b}\u{65b9}', '\u{4e00}\u{65b9}\u{3067}'];
const landWords = ['\u{305d}\u{3093}\u{306a}\u{611f}\u{3058}', '\u{307e}\u{3042}\u{305d}\u{3093}\u{306a}\u{3082}\u{3093}', '\u{308f}\u{304b}\u{3063}\u{305f}', '\u{4e86}\u{89e3}', '\u{305d}\u{308c}\u{3067}\u{3044}\u{304f}', '\u{7de0}\u{3081}\u{308b}'];

export function detectStage(messages: ChatMessage[], analysis: TurnAnalysis): ConversationStage {
  const userTurns = messages.filter((message) => message.role === 'user').length;
  const latest = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';

  if (userTurns <= 1) {
    return 'open';
  }

  if (pivotWords.some((word) => latest.includes(word))) {
    return 'pivot';
  }

  if (landWords.some((word) => latest.includes(word))) {
    return 'land';
  }

  if (analysis.intent === 'brainstorm' || analysis.intent === 'analysis' || analysis.intent === 'reflection') {
    return 'deepen';
  }

  if (userTurns >= 4 && analysis.energy === 'low') {
    return 'land';
  }

  return 'deepen';
}
