import { CandidateScore, ChatMessage, ChatSettings, TurnAnalysis } from '../../shared/types.js';
import { average } from '../../shared/utils.js';
import { detectAiSmell } from '../../conversation/antiAIFilter.js';

export function gradeReplyText(
  text: string,
  analysis: TurnAnalysis,
  settings: ChatSettings,
  history: ChatMessage[],
  moveCount: number,
): CandidateScore {
  const detectors = detectAiSmell(text);
  const aiPenalty = flatten(detectors).length * 0.1;
  const repetitionPenalty = detectors.repetition.length ? 0.45 : repetitionAgainstHistory(text, history);

  const score: CandidateScore = {
    interestingness: clamp(0.42 + moveCount * 0.08 + (/というより|むしろ|欠けてる|輪郭/u.test(text) ? 0.14 : 0), 0, 1),
    humanNaturalness: clamp(1 - aiPenalty, 0, 1),
    conversationality: clamp(text.length < 180 ? 0.87 : 0.64, 0, 1),
    stance: clamp(/と思う|まだ|近い|筋はある/u.test(text) ? 0.82 : 0.5, 0, 1),
    sharpness: clamp(settings.sliders.sharpness / 100 * 0.35 + (/答えてるだけ|まだ|弱いというより/u.test(text) ? 0.35 : 0.12), 0, 1),
    compression: clamp(1 - Math.max(0, text.length - 130) / 230, 0, 1),
    empathyFit: clamp(scoreEmpathy(text, analysis), 0, 1),
    groundedness: clamp(scoreGroundedness(text, analysis), 0, 1),
    nonAiSmell: clamp(1 - aiPenalty, 0, 1),
    repetitionPenalty,
    nextTurnPotential: clamp(scoreNextTurn(text), 0, 1),
    total: 0,
  };

  score.total = average([
    score.interestingness,
    score.humanNaturalness,
    score.conversationality,
    score.stance,
    score.sharpness,
    score.compression,
    score.empathyFit,
    score.groundedness,
    score.nonAiSmell,
    1 - score.repetitionPenalty,
    score.nextTurnPotential,
  ]);

  return score;
}

function scoreEmpathy(text: string, analysis: TurnAnalysis): number {
  if (analysis.intent === 'vent') {
    return /しんど|後回し|混ざってる|余白/u.test(text) ? 0.9 : 0.58;
  }
  if (analysis.intent === 'reflection') {
    return /侵食|残り方|言語化/u.test(text) ? 0.82 : 0.62;
  }
  return /たぶん|近い/u.test(text) ? 0.7 : 0.58;
}

function scoreGroundedness(text: string, analysis: TurnAnalysis): number {
  if (!analysis.riskTags.length) {
    return 0.82;
  }
  return /確認|最新|条件|断定/u.test(text) ? 0.92 : 0.44;
}

function scoreNextTurn(text: string): number {
  if (/[?？]$/.test(text)) {
    return 0.56;
  }
  if (/まだ|まず|そこから|先/u.test(text)) {
    return 0.84;
  }
  return /。/.test(text) ? 0.76 : 0.64;
}

function repetitionAgainstHistory(text: string, history: ChatMessage[]): number {
  const recentReplies = history.filter((item) => item.role === 'assistant').slice(-3).map((item) => item.content);
  if (!recentReplies.length) {
    return 0.15;
  }
  return recentReplies.some((reply) => reply.slice(0, 14) === text.slice(0, 14)) ? 0.45 : 0.15;
}

function flatten(detectors: ReturnType<typeof detectAiSmell>): string[] {
  return [
    ...detectors.aiSmell,
    ...detectors.genericness,
    ...detectors.overexplaining,
    ...detectors.praise,
    ...detectors.questionOveruse,
    ...detectors.repetition,
    ...detectors.styleDrift,
    ...detectors.cheapEdginess,
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
