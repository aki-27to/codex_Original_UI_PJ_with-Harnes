import { appConfig } from './config.js';
import { ChatSettings } from './types.js';

export function createDefaultSettings(): ChatSettings {
  return {
    assistantName: 'Codex',
    provider: appConfig.defaultProvider,
    runtimeModel: appConfig.defaultCodexModel,
    gradingModel: appConfig.defaultMiniModel,
    mode: 'deep-dive',
    engineVariant: 'improved',
    reasoningEffort: appConfig.defaultReasoningEffort,
    verbosity: appConfig.defaultVerbosity,
    webSearch: false,
    externalWebAccess: true,
    relationship: 'sharp but fair collaborator',
    speechStyle: 'Japanese, conversational, compressed, with stance',
    debugMode: true,
    memoryVisible: true,
    projectContext: [
      'Project root: C:\\Users\\akima\\dev\\talkApp',
      'Goal: Build a conversation R&D app that can keep improving.',
    ].join('\n'),
    collaborationNotes: 'Keep the first sentence sharp. Avoid praise, lists, and generic summaries.',
    sliders: {
      warmth: 42,
      sharpness: 64,
      humor: 36,
      density: 58,
      challenge: 55,
      brevity: 74,
      weirdness: 52,
    },
  };
}
