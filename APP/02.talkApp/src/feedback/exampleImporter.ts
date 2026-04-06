import { antiExamplesPath, goldensPath } from '../shared/paths.js';
import { ExampleRecord } from '../shared/types.js';
import { createId } from '../shared/utils.js';
import { readJsonFile, writeJsonFile } from '../storage/fileStore.js';

export interface ImportRequest {
  content: string;
  filename: string;
  target: 'golden' | 'anti';
}

export async function importExamples(request: ImportRequest): Promise<{ imported: number }> {
  const extension = request.filename.toLowerCase().split('.').pop() || '';
  let records: ExampleRecord[] = [];

  if (extension === 'json') {
    records = parseJsonExamples(request.content);
  } else if (extension === 'csv') {
    records = parseCsvExamples(request.content);
  } else if (extension === 'md') {
    records = parseMarkdownExamples(request.content);
  } else {
    throw new Error('Supported formats are .json, .csv, and .md');
  }

  const targetPath = request.target === 'golden' ? goldensPath : antiExamplesPath;
  const current = await readJsonFile(targetPath, [] as ExampleRecord[]);
  await writeJsonFile(targetPath, [...records, ...current]);
  return { imported: records.length };
}

function parseJsonExamples(content: string): ExampleRecord[] {
  const parsed = JSON.parse(content) as Array<Partial<ExampleRecord>>;
  return parsed.map(normalizeExample);
}

function parseCsvExamples(content: string): ExampleRecord[] {
  const [headerLine, ...lines] = content.trim().split(/\r?\n/gu);
  const headers = headerLine.split(',').map((item) => item.trim());
  return lines
    .map((line) => line.split(','))
    .map((values) => Object.fromEntries(values.map((value, index) => [headers[index], value.trim()])))
    .map((row) => normalizeExample({
      category: row.category,
      user: row.user,
      good: row.good,
      acceptable: row.acceptable,
      bad: row.bad,
      tags: row.tags ? row.tags.split('|') : [],
      source: 'csv-import',
    }));
}

function parseMarkdownExamples(content: string): ExampleRecord[] {
  const blocks = content.split(/^---$/gmu).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block) => {
    const user = captureBlock(block, 'User');
    const good = captureBlock(block, 'Good');
    const bad = captureBlock(block, 'Bad');
    const category = captureBlock(block, 'Category') || 'markdown-import';
    const tags = captureBlock(block, 'Tags').split(',').map((tag) => tag.trim()).filter(Boolean);
    return normalizeExample({
      category,
      user,
      good,
      bad,
      tags,
      source: 'markdown-import',
    });
  });
}

function captureBlock(content: string, label: string): string {
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, 'imu');
  const match = content.match(pattern);
  return match ? match[1].trim() : '';
}

function normalizeExample(input: Partial<ExampleRecord>): ExampleRecord {
  return {
    id: input.id || createId('example'),
    category: input.category || 'imported',
    user: input.user || '',
    good: input.good || '',
    acceptable: input.acceptable,
    bad: input.bad,
    tags: Array.isArray(input.tags) ? input.tags.filter(Boolean) : [],
    source: input.source || 'imported',
    notes: input.notes,
  };
}
