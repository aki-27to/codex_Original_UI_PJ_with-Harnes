import { feedbackPath, failuresPath, goldensPath, antiExamplesPath } from '../shared/paths.js';
import { ExampleRecord, FailureRecord, FeedbackEntry } from '../shared/types.js';
import { createId, nowIso } from '../shared/utils.js';
import { readJsonFile, writeJsonFile } from '../storage/fileStore.js';
import { applyFeedbackToMemory } from '../conversation/memoryStore.js';

export async function listFeedback(): Promise<FeedbackEntry[]> {
  return readJsonFile(feedbackPath, [] as FeedbackEntry[]);
}

export async function addFeedback(input: Omit<FeedbackEntry, 'id' | 'createdAt'>): Promise<FeedbackEntry> {
  const items = await listFeedback();
  const entry: FeedbackEntry = {
    ...input,
    id: createId('feedback'),
    createdAt: nowIso(),
  };
  items.unshift(entry);
  await writeJsonFile(feedbackPath, items.slice(0, 500));
  await applyFeedbackToMemory(entry);
  return entry;
}

export async function promoteFeedback(feedbackId: string, target: 'golden' | 'anti'): Promise<void> {
  const items = await listFeedback();
  const targetItem = items.find((item) => item.id === feedbackId);
  if (!targetItem) {
    throw new Error('Feedback item was not found.');
  }

  targetItem.promotedTo = target;
  await writeJsonFile(feedbackPath, items);

  if (target === 'golden') {
    const examples = await readJsonFile(goldensPath, [] as ExampleRecord[]);
    examples.unshift({
      id: createId('golden'),
      category: 'promoted-feedback',
      user: targetItem.messageText,
      good: targetItem.replyText,
      tags: [targetItem.label],
      source: 'feedback',
      notes: targetItem.note,
    });
    await writeJsonFile(goldensPath, examples);
    return;
  }

  const failures = await readJsonFile(failuresPath, [] as FailureRecord[]);
  failures.unshift({
    id: createId('failure'),
    category: 'promoted-feedback',
    user: targetItem.messageText,
    reply: targetItem.replyText,
    failureTags: [targetItem.label],
    why: targetItem.note || targetItem.label,
    createdAt: nowIso(),
  });
  await writeJsonFile(failuresPath, failures);

  const antiExamples = await readJsonFile(antiExamplesPath, [] as ExampleRecord[]);
  antiExamples.unshift({
    id: createId('anti'),
    category: 'promoted-feedback',
    user: targetItem.messageText,
    good: '',
    bad: targetItem.replyText,
    tags: [targetItem.label],
    source: 'feedback',
    notes: targetItem.note,
  });
  await writeJsonFile(antiExamplesPath, antiExamples);
}
