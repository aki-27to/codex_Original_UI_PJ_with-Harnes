import { persistentMemoryPath } from '../shared/paths.js';
import { FeedbackEntry, PersistentMemory, SessionMemory } from '../shared/types.js';
import { nowIso } from '../shared/utils.js';
import { readJsonFile, writeJsonFile } from '../storage/fileStore.js';

const defaultPersistentMemory: PersistentMemory = {
  interests: {},
  styleLikes: {},
  styleDislikes: {},
  responseWins: {},
  responseLosses: {},
  tempoPreference: 'balanced',
  updatedAt: nowIso(),
};

export function createSessionMemory(): SessionMemory {
  return {
    recentTopics: [],
    recentFeedbackSignals: [],
    recentStyles: [],
  };
}

export async function loadPersistentMemory(): Promise<PersistentMemory> {
  return readJsonFile(persistentMemoryPath, defaultPersistentMemory);
}

export async function savePersistentMemory(memory: PersistentMemory): Promise<void> {
  await writeJsonFile(persistentMemoryPath, memory);
}

export async function applyFeedbackToMemory(entry: FeedbackEntry): Promise<PersistentMemory> {
  const memory = await loadPersistentMemory();
  const text = entry.messageText.toLowerCase();
  for (const token of text.split(/\s+/u).filter(Boolean).slice(0, 8)) {
    memory.interests[token] = (memory.interests[token] ?? 0) + 1;
  }

  if (entry.label === 'hit' || entry.label === 'okay') {
    memory.responseWins[entry.label] = (memory.responseWins[entry.label] ?? 0) + 1;
  } else {
    memory.responseLosses[entry.label] = (memory.responseLosses[entry.label] ?? 0) + 1;
  }

  if (entry.label === 'shorter') {
    memory.tempoPreference = 'short';
  }
  if (entry.label === 'too_much') {
    memory.styleDislikes['overexplaining'] = (memory.styleDislikes['overexplaining'] ?? 0) + 1;
  }
  if (entry.label === 'ai_smell') {
    memory.styleDislikes['ai_smell'] = (memory.styleDislikes['ai_smell'] ?? 0) + 1;
  }
  if (entry.label === 'sharper') {
    memory.styleLikes['sharpness'] = (memory.styleLikes['sharpness'] ?? 0) + 1;
  }

  memory.updatedAt = nowIso();
  await savePersistentMemory(memory);
  return memory;
}
