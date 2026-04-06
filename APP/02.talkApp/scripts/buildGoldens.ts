import { goldensPath, antiExamplesPath, failuresPath } from '../src/shared/paths.js';
import { ExampleRecord, FailureRecord } from '../src/shared/types.js';
import { createId, nowIso } from '../src/shared/utils.js';
import { writeJsonFile } from '../src/storage/fileStore.js';

const goldens: ExampleRecord[] = [
  {
    id: createId('golden'),
    category: 'smalltalk',
    user: 'This is not interesting at all.',
    good: 'It feels dull because it answers, but does not actually return the ball.',
    acceptable: 'The explanation is not wrong, but the conversational angle is still weak.',
    bad: 'Thank you for the feedback. Let me summarize a few improvement points.',
    tags: ['discovery', 'compression', 'stance'],
    source: 'seed',
  },
  {
    id: createId('golden'),
    category: 'reflection',
    user: 'I loved this movie but cannot verbalize what exactly was good.',
    good: 'Maybe it was not simply good. Maybe it changed your mood a little after it ended.',
    acceptable: 'The hit probably came before the reasons did.',
    bad: 'Possible reasons include directing, music, and script quality.',
    tags: ['emotion', 'discovery', 'compression'],
    source: 'seed',
  },
  {
    id: createId('golden'),
    category: 'work',
    user: 'How does this help in business?',
    good: 'The value is less a tactic and more a habit of choosing a better axis to look through.',
    acceptable: 'It works better as a lens than as a recipe.',
    bad: 'This can be applied to business in three ways.',
    tags: ['compare', 'abstraction', 'stance'],
    source: 'seed',
  },
  {
    id: createId('golden'),
    category: 'feeling',
    user: 'I have felt low for a while.',
    good: 'This sounds like more than fatigue. It sounds like your own mood has been pushed behind everything else for a while.',
    acceptable: 'It may be fatigue, but it also feels like recovery room has been missing.',
    bad: 'That sounds difficult. Please get some rest.',
    tags: ['emotion', 'compression', 'empathy_fit'],
    source: 'seed',
  },
  {
    id: createId('golden'),
    category: 'review',
    user: 'Is this plan weak?',
    good: 'It is not empty. It is just not specific enough to itself yet. It still looks replaceable.',
    acceptable: 'There is structure, but the contour is not unique yet.',
    bad: 'There is room for improvement, but there are also good points.',
    tags: ['stance', 'light_pushback', 'compression'],
    source: 'seed',
  },
  {
    id: createId('golden'),
    category: 'review',
    user: 'Was that reply too harsh?',
    good: 'A little. The edge got prioritized too much. That part should come back down.',
    acceptable: 'The force came out first. The temperature should come back a notch.',
    bad: 'I apologize. I will answer more politely.',
    tags: ['stance', 'repair', 'compression'],
    source: 'seed',
  },
];

const antiExamples: ExampleRecord[] = goldens.map((item) => ({
  ...item,
  id: createId('anti'),
  good: '',
  acceptable: undefined,
  bad: item.bad,
  source: 'seed-anti',
}));

const failures: FailureRecord[] = [
  {
    id: createId('failure'),
    category: 'ai-smell',
    user: 'This is not interesting at all.',
    reply: 'Thank you for the question. Let me summarize the key points below.',
    failureTags: ['ai_smell', 'genericness'],
    why: 'Starts with politeness and summary framing.',
    createdAt: nowIso(),
  },
  {
    id: createId('failure'),
    category: 'grounding',
    user: 'What is the biggest news story today?',
    reply: 'It confidently guesses without verification.',
    failureTags: ['hallucination', 'overconfidence'],
    why: 'Claims freshness without grounding.',
    createdAt: nowIso(),
  },
];

await writeJsonFile(goldensPath, goldens);
await writeJsonFile(antiExamplesPath, antiExamples);
await writeJsonFile(failuresPath, failures);
console.log(`[seed:data] goldens=${goldens.length} anti=${antiExamples.length} failures=${failures.length}`);
