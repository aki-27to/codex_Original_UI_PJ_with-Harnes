import { EvalCase } from '../../shared/types.js';

const categories = {
  smalltalk: [
    'This is not interesting at all.',
    'The chat keeps drifting into explanation mode.',
    'I wanted banter, not a neat summary.',
    'Everything comes back too straight and too clean.',
  ],
  deepDive: [
    'I loved this movie but cannot verbalize what exactly was good.',
    'This work feels split more by viewpoint than by content quality.',
    'Why does it hit some people hard and do nothing to others?',
    'I can explain it, but it still does not feel resolved.',
  ],
  work: [
    'How does this help in business?',
    'What makes someone feel one layer deeper in meetings?',
    'If I apply this idea to work, where do I look first?',
    'Why can some people create angle in meetings while others cannot?',
  ],
  feeling: [
    'I have felt low for a while.',
    'I cannot tell whether this is just fatigue or something else.',
    'Sleep is not resetting me.',
    'My mood feels underwater all the time.',
  ],
  review: [
    'Is this plan weak?',
    'Was that reply too harsh?',
    'This idea is not terrible, but it still looks weak.',
    'If someone says this is thin, where do I fix it?',
  ],
  grounded: [
    'What is the biggest news story today?',
    'Can this policy be used in Japan right now?',
    'Does this medicine have side effects?',
    'When is next week’s press conference?',
  ],
  reflection: [
    'I liked it, but I still cannot explain what got me.',
    'I still do not know what exactly I am uneasy about.',
    'I am not convinced, but I also cannot fully argue back.',
    'How would you cut this vague discomfort into language?',
  ],
  longConversation: [
    'The first reply was fine, but the next angle got weak.',
    'I want to go one layer deeper from the earlier point.',
    'What changes if we look at it from another axis?',
    'If we land here, I do not want it to sound too summarizing.',
  ],
  styleDrift: [
    'Do not fall back into the same polished tone again.',
    'Keep the edge, but do not sound like the previous summary.',
    'I want the next turn to feel like a continuation, not a reset.',
    'Do not go back to the same safe wording as before.',
  ],
};

export function buildEvalDataset(): EvalCase[] {
  const cases: EvalCase[] = [];
  let index = 1;

  for (const [category, prompts] of Object.entries(categories)) {
    for (let round = 0; round < 20; round += 1) {
      const prompt = prompts[round % prompts.length];
      cases.push({
        id: `case_${String(index).padStart(3, '0')}`,
        category,
        turns: buildTurns(category, prompt, round),
        expectedTags: expectedTagsFor(category),
        forbiddenTags: forbiddenTagsFor(category),
        riskLevel: riskLevelFor(category),
      });
      index += 1;
    }
  }

  return cases;
}

function buildTurns(category: string, prompt: string, round: number) {
  if (category === 'longConversation') {
    return [
      { role: 'user' as const, content: 'The first reply was not bad.' },
      { role: 'assistant' as const, content: 'It had a spine, but the second beat drifted toward explanation.' },
      { role: 'user' as const, content: prompt },
      { role: 'user' as const, content: round % 2 === 0 ? 'I want more edge.' : 'But do not overdo the edge.' },
    ];
  }

  if (category === 'styleDrift') {
    return [
      { role: 'user' as const, content: 'The previous answer sounded too neat.' },
      { role: 'assistant' as const, content: 'Thank you for the question. In summary, the safest answer is to stay balanced.' },
      { role: 'user' as const, content: prompt },
    ];
  }

  return [{ role: 'user' as const, content: prompt }];
}

function expectedTagsFor(category: string): string[] {
  switch (category) {
    case 'smalltalk':
      return ['interestingness', 'next_turn'];
    case 'deepDive':
      return ['discovery', 'abstraction'];
    case 'work':
      return ['stance', 'compression'];
    case 'feeling':
      return ['empathy_fit', 'compression'];
    case 'review':
      return ['light_pushback', 'stance'];
    case 'grounded':
      return ['groundedness'];
    case 'reflection':
      return ['discovery', 'emotion'];
    case 'longConversation':
      return ['repetition_control', 'next_turn'];
    case 'styleDrift':
      return ['style_drift_control', 'repetition_control'];
    default:
      return ['interestingness'];
  }
}

function forbiddenTagsFor(category: string): string[] {
  if (category === 'grounded') {
    return ['hallucination', 'cheap_edge'];
  }
  if (category === 'styleDrift') {
    return ['ai_smell', 'style_drift', 'overexplaining'];
  }
  return ['ai_smell', 'overexplaining'];
}

function riskLevelFor(category: string): EvalCase['riskLevel'] {
  if (category === 'grounded') {
    return 'high';
  }
  if (category === 'work' || category === 'review' || category === 'longConversation' || category === 'styleDrift') {
    return 'medium';
  }
  return 'low';
}
