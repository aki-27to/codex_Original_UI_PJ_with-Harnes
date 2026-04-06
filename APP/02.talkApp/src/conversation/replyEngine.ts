import { generateWithRuntime } from '../runtime/createRuntime.js';
import {
  ChatMessage,
  ChatSettings,
  ReplyDebug,
  ReplyResult,
  RuntimeProvider,
  SessionMemory,
} from '../shared/types.js';
import { createId } from '../shared/utils.js';
import { analyzeTurn } from './analyzeTurn.js';
import { detectAiSmell, detectAiSmell as inspectText } from './antiAIFilter.js';
import { detectStage } from './detectStage.js';
import { generateCandidates } from './generateCandidates.js';
import { groundingRouter } from './groundingRouter.js';
import { createSessionMemory, loadPersistentMemory } from './memoryStore.js';
import { rewriteVoice } from './rewriteVoice.js';
import { routeMoves } from './routeMoves.js';
import { scoreCandidate } from './scoreCandidates.js';

export async function runImprovedEngine(options: {
  messages: ChatMessage[];
  settings: ChatSettings;
  provider: RuntimeProvider | '';
  model: string;
  sessionMemory?: SessionMemory;
  useRuntime?: boolean;
}): Promise<ReplyResult> {
  const analysis = analyzeTurn(options.messages, options.settings);
  const stage = detectStage(options.messages, analysis);
  const moves = routeMoves(analysis, stage, options.settings);
  const latestUser = [...options.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const persistent = await loadPersistentMemory();
  const sessionMemory = options.sessionMemory ?? createSessionMemory();
  const grounding = groundingRouter(analysis, options.settings, options.provider === 'responses');

  const candidates = generateCandidates(latestUser, analysis, moves, options.settings)
    .map((candidate) => scoreCandidate(candidate, analysis, options.settings, options.messages))
    .sort((left, right) => right.score.total - left.score.total);

  const selected = candidates[0];
  const rewritten = rewriteVoice(selected.draft, analysis, options.settings);
  const filteredPatterns = detectAiSmell(selected.draft).aiSmell;

  let text = grounding.fallbackNotice ? `${rewritten} ${grounding.fallbackNotice}`.trim() : rewritten;
  let responseId = '';
  let citations: Array<{ title: string; url: string }> = [];
  let warning = '';

  if (options.useRuntime !== false && options.provider) {
    try {
      const polished = await generateWithRuntime(options.provider, {
        model: options.model,
        prompt: buildPolishPrompt({
          latestUser,
          selectedDraft: text,
          analysis,
          stage,
          moves,
          settings: options.settings,
          grounding,
        }),
        useWebSearch: grounding.providerAllowed,
        externalWebAccess: options.settings.externalWebAccess,
      });
      if (polished.text.trim()) {
        text = polished.text.trim();
        responseId = polished.responseId;
        citations = polished.citations;
        warning = polished.warning ?? '';
      }
    } catch (error) {
      warning = error instanceof Error ? error.message : 'Runtime polish failed.';
    }
  }

  const detectors = inspectText(text);
  const debug: ReplyDebug = {
    analysis,
    stage,
    moves,
    candidates,
    chosenCandidateId: selected.id,
    grounding,
    detectors,
    memorySnapshot: {
      session: sessionMemory,
      persistent,
    },
    rationale: buildRationale(moves, analysis, stage),
    filteredPatterns,
  };

  return {
    replyId: createId('reply'),
    text,
    debug,
    citations,
    provider: options.provider || 'codex-exec',
    model: options.model,
    responseId,
    warning,
  };
}

function buildPolishPrompt(options: {
  latestUser: string;
  selectedDraft: string;
  analysis: ReplyDebug['analysis'];
  stage: ReplyDebug['stage'];
  moves: ReplyDebug['moves'];
  settings: ChatSettings;
  grounding: ReplyDebug['grounding'];
}): string {
  return [
    'Rewrite the draft into natural Japanese conversation.',
    'Keep the angle, stance, and compression.',
    'No bullets. No thanks. No generic praise. No summary framing.',
    'Return one assistant reply only.',
    `Mode: ${options.settings.mode}`,
    `Stage: ${options.stage}`,
    `Moves: ${options.moves.join(', ')}`,
    `Intent: ${options.analysis.intent}. Desired length: ${options.analysis.desiredLength}.`,
    options.grounding.fallbackNotice ? `Grounding rule: ${options.grounding.fallbackNotice}` : '',
    '',
    `User said: ${options.latestUser}`,
    `Draft meaning: ${options.selectedDraft}`,
  ].filter(Boolean).join('\n');
}

function buildRationale(moves: string[], analysis: ReplyDebug['analysis'], stage: ReplyDebug['stage']): string {
  return `Stage=${stage}, intent=${analysis.intent}, priority=${analysis.priority}, moves=${moves.join('+')}`;
}
