import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { importExamples } from '../src/feedback/exampleImporter.js';

const filename = process.argv[2];
const target = process.argv[3] === 'anti' ? 'anti' : 'golden';

if (!filename) {
  console.error('Usage: npm run import:examples -- <filepath> [golden|anti]');
  process.exit(1);
}

const fullPath = path.resolve(process.cwd(), filename);
const content = await readFile(fullPath, 'utf8');
const result = await importExamples({
  filename: path.basename(fullPath),
  content,
  target,
});
console.log(`[import:examples] imported=${result.imported} target=${target}`);
