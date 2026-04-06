import { antiExamplesPath, goldensPath, promptsDir } from '../src/shared/paths.js';
import { ExampleRecord } from '../src/shared/types.js';
import { readJsonFile, writeTextFile } from '../src/storage/fileStore.js';
import path from 'node:path';

const goldens = await readJsonFile(goldensPath, [] as ExampleRecord[]);
const antiExamples = await readJsonFile(antiExamplesPath, [] as ExampleRecord[]);

const voicePrompt = [
  '# Runtime voice prompt',
  '',
  'Good reply properties:',
  '- sharp first sentence',
  '- stance without posturing',
  '- compressed explanation',
  '- one new angle, not total coverage',
  '',
  'Avoid:',
  '- thanking the user',
  '- summary-first framing',
  '- generic praise',
  '- list-heavy structure',
  '',
  'Goldens:',
  ...goldens.slice(0, 8).flatMap((item) => [
    `User: ${item.user}`,
    `Good: ${item.good}`,
    item.bad ? `Bad: ${item.bad}` : '',
    '',
  ]),
  'Anti-patterns:',
  ...antiExamples.slice(0, 8).flatMap((item) => [
    `User: ${item.user}`,
    `Avoid: ${item.bad || ''}`,
    '',
  ]),
].join('\n');

await writeTextFile(path.join(promptsDir, 'system', 'voice.md'), voicePrompt);
console.log('[rebuild:fewshots] wrote prompts/system/voice.md');
