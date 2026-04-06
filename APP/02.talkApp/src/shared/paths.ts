import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, '..', '..');
export const docsDir = path.join(repoRoot, 'docs');
export const dataDir = path.join(repoRoot, 'data');
export const frontendDir = path.join(repoRoot, 'app', 'frontend');
export const frontendDistDir = path.join(frontendDir, 'dist');
export const promptsDir = path.join(repoRoot, 'prompts');
export const envFile = path.join(repoRoot, '.env');
export const voiceBiblePath = path.join(docsDir, 'VOICE_BIBLE.md');
export const promptSourcePath = path.join(promptsDir, 'system', 'voice.md');
export const codexChatSchemaPath = path.join(repoRoot, 'schemas', 'talkapp-chat.schema.json');
export const persistentMemoryPath = path.join(dataDir, 'memory', 'persistentMemory.json');
export const feedbackPath = path.join(dataDir, 'feedback', 'feedback.json');
export const preferencePairsPath = path.join(dataDir, 'feedback', 'preferencePairs.json');
export const goldensPath = path.join(dataDir, 'goldens', 'examples.json');
export const antiExamplesPath = path.join(dataDir, 'anti_examples', 'examples.json');
export const failuresPath = path.join(dataDir, 'failures', 'failures.json');
export const evalReportsDir = path.join(dataDir, 'eval_reports');
