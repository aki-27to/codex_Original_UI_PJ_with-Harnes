import { promptSourcePath } from '../shared/paths.js';
import { readTextFile } from '../storage/fileStore.js';

let cachedPrompt = '';

export async function loadVoicePrompt(): Promise<string> {
  if (cachedPrompt) {
    return cachedPrompt;
  }
  cachedPrompt = (await readTextFile(promptSourcePath, '')).trim();
  return cachedPrompt;
}
