import { ChatMessage, ChatSettings, ReplyDebug, ReplyResult, RuntimeProvider, SessionMemory } from '../shared/types.js';
import { createId } from '../shared/utils.js';
import { analyzeTurn } from './analyzeTurn.js';
import { detectStage } from './detectStage.js';
import { groundingRouter } from './groundingRouter.js';
import { createSessionMemory, loadPersistentMemory } from './memoryStore.js';
import { generateWithRuntime } from '../runtime/createRuntime.js';

export async function runBaselineEngine(options: {
  messages: ChatMessage[];
  settings: ChatSettings;
  provider: RuntimeProvider | '';
  model: string;
  sessionMemory?: SessionMemory;
  useRuntime?: boolean;
}): Promise<ReplyResult> {
  const analysis = analyzeTurn(options.messages, options.settings);
  const stage = detectStage(options.messages, analysis);
  const persistent = await loadPersistentMemory();
  const sessionMemory = options.sessionMemory ?? createSessionMemory();
  const grounding = groundingRouter(analysis, options.settings, options.provider === 'responses');

  const latestUser = [...options.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const fallback = simpleBaselineReply(options.messages, latestUser, analysis);

  let text = fallback;
  let responseId = '';
  let citations: Array<{ title: string; url: string }> = [];

  if (options.useRuntime !== false && options.provider) {
    const runtime = await generateWithRuntime(options.provider, {
      model: options.model,
      prompt: buildBaselinePrompt(latestUser, analysis, grounding, options.settings),
      useWebSearch: grounding.providerAllowed,
      externalWebAccess: options.settings.externalWebAccess,
    });
    if (runtime.text.trim()) {
      text = runtime.text.trim();
      responseId = runtime.responseId;
      citations = runtime.citations;
    }
  }

  const debug: ReplyDebug = {
    analysis,
    stage,
    moves: [],
    candidates: [],
    chosenCandidateId: '',
    grounding,
    detectors: {
      aiSmell: [],
      genericness: [],
      overexplaining: [],
      praise: [],
      questionOveruse: [],
      repetition: [],
      styleDrift: [],
      cheapEdginess: [],
    },
    memorySnapshot: {
      session: sessionMemory,
      persistent,
    },
    rationale: 'baseline direct answer path',
    filteredPatterns: [],
  };

  return {
    replyId: createId('reply'),
    text,
    debug,
    citations,
    provider: options.provider || 'codex-exec',
    model: options.model,
    responseId,
  };
}

function buildBaselinePrompt(
  userText: string,
  analysis: ReplyDebug['analysis'],
  grounding: ReplyDebug['grounding'],
  settings: ChatSettings,
): string {
  return [
    'Answer in natural Japanese.',
    'Be concise and safe.',
    'No bullets. No thanks. No generic praise.',
    `Mode: ${settings.mode}. Intent: ${analysis.intent}. Desired length: ${analysis.desiredLength}.`,
    grounding.fallbackNotice ? `Grounding notice: ${grounding.fallbackNotice}` : '',
    '',
    `User: ${userText}`,
  ].filter(Boolean).join('\n');
}

function simpleBaselineReply(
  messages: ChatMessage[],
  userText: string,
  analysis: ReplyDebug['analysis'],
): string {
  const recentAssistant = [...messages].reverse().find((message) => message.role === 'assistant')?.content.trim();
  if (recentAssistant) {
    const repeatedLead = recentAssistant.slice(0, 18).trim();
    return `${repeatedLead} and the safest continuation is still a balanced explanation of ${userText}.`;
  }
  if (analysis.priority === 'accuracy') {
    return 'Thank you for the question. In summary, this topic needs verification before a confident answer.';
  }
  if (analysis.intent === 'vent') {
    return 'Thank you for sharing that. Please make sure you get some rest.';
  }
  if (analysis.intent === 'review') {
    return `Thank you for the feedback. ${userText} has room for improvement. Let me summarize the pros and cons.`;
  }
  return `Thank you for the question. In summary, a direct explanation of ${userText} would probably be the safest answer.`;
}
