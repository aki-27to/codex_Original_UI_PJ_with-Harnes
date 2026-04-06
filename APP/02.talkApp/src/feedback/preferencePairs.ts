import { preferencePairsPath } from '../shared/paths.js';
import { PreferencePairEntry } from '../shared/types.js';
import { createId, nowIso } from '../shared/utils.js';
import { readJsonFile, writeJsonFile } from '../storage/fileStore.js';

export async function listPreferencePairs(): Promise<PreferencePairEntry[]> {
  return readJsonFile(preferencePairsPath, [] as PreferencePairEntry[]);
}

export async function addPreferencePair(input: Omit<PreferencePairEntry, 'id' | 'createdAt'>): Promise<PreferencePairEntry> {
  const items = await listPreferencePairs();
  const entry: PreferencePairEntry = {
    ...input,
    id: createId('pref'),
    createdAt: nowIso(),
  };
  items.unshift(entry);
  await writeJsonFile(preferencePairsPath, items.slice(0, 500));
  return entry;
}
