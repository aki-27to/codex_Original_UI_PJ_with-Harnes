import { ChatSettings, ConversationMove, ConversationStage, TurnAnalysis } from '../shared/types.js';
import { dedupe, pickTop } from '../shared/utils.js';

export function routeMoves(
  analysis: TurnAnalysis,
  stage: ConversationStage,
  settings: ChatSettings,
): ConversationMove[] {
  const moves: ConversationMove[] = [];

  if (analysis.intent === 'vent') {
    moves.push('emotion', 'discovery', 'leave_space');
  }

  if (analysis.intent === 'review') {
    moves.push('cut', 'stance', 'light_pushback');
  }

  if (analysis.intent === 'brainstorm') {
    moves.push('compare', 'discovery', 'twist');
  }

  if (analysis.intent === 'reflection') {
    moves.push('emotion', 'abstract', 'metaphor');
  }

  if (analysis.intent === 'grounded') {
    moves.push('example', 'compare');
  }

  if (stage === 'open') {
    moves.push('stance', 'compare');
  }

  if (stage === 'deepen') {
    moves.push('discovery', 'abstract');
  }

  if (stage === 'pivot') {
    moves.push('twist', 'history', 'trend');
  }

  if (stage === 'land') {
    moves.push('leave_space', 'stance');
  }

  if (settings.sliders.weirdness >= 65) {
    moves.push('twist', 'metaphor');
  }

  if (settings.sliders.sharpness >= 60) {
    moves.push('cut', 'light_pushback');
  }

  if (settings.mode === 'fact-first') {
    moves.push('example');
  }

  return pickTop(dedupe(moves), 3);
}
