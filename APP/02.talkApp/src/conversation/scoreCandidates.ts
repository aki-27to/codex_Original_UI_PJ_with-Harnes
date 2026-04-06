import { Candidate, CandidateScore, ChatMessage, ChatSettings, DetectorSummary, TurnAnalysis } from '../shared/types.js';
import { average, clamp } from '../shared/utils.js';
import { detectAiSmell } from './antiAIFilter.js';

export function scoreCandidate(
  candidate: Omit<Candidate, 'score' | 'detectorHits'>,
  analysis: TurnAnalysis,
  settings: ChatSettings,
  history: ChatMessage[],
): Candidate {
  const detectors = detectAiSmell(candidate.draft);
  const repetitionPenalty = detectors.repetition.length ? 0.42 : similarityPenalty(candidate.draft, history);

  const score: CandidateScore = {
    interestingness: clamp(scoreInterestingness(candidate.draft, candidate.moves), 0, 1),
    humanNaturalness: clamp(1 - detectorCount(detectors) * 0.08, 0, 1),
    conversationality: clamp(candidate.draft.length < 170 ? 0.9 : 0.68, 0, 1),
    stance: clamp(/I think|rather|still|closer|replaceable/i.test(candidate.draft) ? 0.84 : 0.58, 0, 1),
    sharpness: clamp(settings.sliders.sharpness / 100 * 0.45 + (/not enough|still|replaceable|flat/i.test(candidate.draft) ? 0.26 : 0.12), 0, 1),
    compression: clamp(1 - Math.max(0, candidate.draft.length - 120) / 220, 0, 1),
    empathyFit: clamp(scoreEmpathy(candidate.draft, analysis), 0, 1),
    groundedness: clamp(scoreGroundedness(candidate.draft, analysis), 0, 1),
    nonAiSmell: clamp(1 - detectorCount(detectors) * 0.1, 0, 1),
    repetitionPenalty,
    nextTurnPotential: clamp(scoreNextTurnPotential(candidate.draft), 0, 1),
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

  return {
    ...candidate,
    score,
    detectorHits: flattenDetectors(detectors),
  };
}

function detectorCount(detectors: DetectorSummary): number {
  return flattenDetectors(detectors).length;
}

function flattenDetectors(detectors: DetectorSummary): string[] {
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

function scoreInterestingness(text: string, moves: string[]): number {
  let score = 0.44;
  if (moves.includes('discovery') || moves.includes('twist')) score += 0.18;
  if (moves.includes('compare') || moves.includes('history') || moves.includes('trend')) score += 0.12;
  if (/rather|missing|frame|texture|replaceable|residue/i.test(text)) score += 0.12;
  return score;
}

function scoreEmpathy(text: string, analysis: TurnAnalysis): number {
  if (analysis.intent === 'vent') {
    return /mood|room|recover|mixed causes|more than fatigue/i.test(text) ? 0.92 : 0.56;
  }
  if (analysis.intent === 'reflection') {
    return /residue|aftertaste|language lags|affected/i.test(text) ? 0.82 : 0.6;
  }
  return /probably|closer|likely/i.test(text) ? 0.72 : 0.55;
}

function scoreGroundedness(text: string, analysis: TurnAnalysis): number {
  if (!analysis.riskTags.length) {
    return 0.82;
  }
  return /verify|latest|conditions|check/i.test(text) ? 0.92 : 0.46;
}

function scoreNextTurnPotential(text: string): number {
  if (/[?？]$/.test(text)) {
    return 0.58;
  }
  if (/still|first|later|before|next/i.test(text)) {
    return 0.84;
  }
  return /[.!?。！？]/.test(text) ? 0.76 : 0.64;
}

function similarityPenalty(text: string, history: ChatMessage[]): number {
  const recentReplies = history.filter((message) => message.role === 'assistant').slice(-3).map((message) => message.content);
  if (!recentReplies.length) {
    return 0.12;
  }

  const penalties = recentReplies.map((reply) => {
    const sameStart = reply.slice(0, 14) === text.slice(0, 14);
    const sameMood = /probably|rather/i.test(reply) && /probably|rather/i.test(text);
    return sameStart || sameMood ? 0.5 : 0.12;
  });

  return Math.max(...penalties);
}
