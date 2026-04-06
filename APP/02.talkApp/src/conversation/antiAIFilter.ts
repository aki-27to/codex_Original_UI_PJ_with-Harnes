import { Candidate, DetectorSummary } from '../shared/types.js';

const aiSmellPatterns = [
  '\u{3054}\u{8cea}\u{554f}\u{3042}\u{308a}\u{304c}\u{3068}\u{3046}\u{3054}\u{3056}\u{3044}\u{307e}\u{3059}',
  '\u{7d20}\u{6674}\u{3089}\u{3057}\u{3044}\u{8996}\u{70b9}',
  '\u{4ee5}\u{4e0b}\u{306b}\u{307e}\u{3068}\u{3081}\u{307e}\u{3059}',
  '\u{30dd}\u{30a4}\u{30f3}\u{30c8}\u{306f}',
  '\u{7d50}\u{8ad6}\u{304b}\u{3089}\u{8a00}\u{3046}\u{3068}',
  'Thank you for',
  'Let me summarize',
  'Here are the key points',
  'In summary',
];

const praisePatterns = [
  '\u{826f}\u{3044}\u{8996}\u{70b9}',
  '\u{7d20}\u{6674}\u{3089}\u{3057}\u{3044}',
  '\u{92ed}\u{3044}',
  '\u{5927}\u{4e8b}\u{306a}\u{30dd}\u{30a4}\u{30f3}\u{30c8}',
  'great question',
  'important point',
  'good perspective',
];

const genericPatterns = [
  '\u{6539}\u{5584}\u{306e}\u{4f59}\u{5730}\u{304c}\u{3042}\u{308a}\u{307e}\u{3059}',
  '\u{30b1}\u{30fc}\u{30b9}\u{30d0}\u{30a4}\u{30b1}\u{30fc}\u{30b9}',
  '\u{4e00}\u{9577}\u{4e00}\u{77ed}',
  '\u{72b6}\u{6cc1}\u{306b}\u{3088}\u{308a}\u{307e}\u{3059}',
  '\u{6574}\u{7406}\u{3059}\u{308b}\u{3068}',
  'room for improvement',
  'pros and cons',
  'safest answer',
  'depends on the situation',
  'please make sure you get some rest',
];

const monotoneEndings = [
  '\u{3067}\u{3059}\u{3002}\u{3067}\u{3059}\u{3002}',
  '\u{307e}\u{3059}\u{3002}\u{307e}\u{3059}\u{3002}',
  '\u{3067}\u{3057}\u{3087}\u{3046}\u{3002}\u{3067}\u{3057}\u{3087}\u{3046}\u{3002}',
];

const cheapEdgeWords = [
  '\u{30b4}\u{30df}',
  '\u{7d42}\u{308f}\u{3063}\u{3066}\u{308b}',
  '\u{30af}\u{30bd}',
  '\u{3076}\u{3063}\u{3061}\u{3083}\u{3051}\u{5168}\u{90e8}\u{30c0}\u{30e1}',
];

export function detectAiSmell(text: string): DetectorSummary {
  const lines = text.split(/\n+/u);
  const questionCount = (text.match(/[?？]/gu) || []).length;
  const sentenceCount = Math.max(1, (text.match(/[。.!！?？]/gu) || []).length);

  return {
    aiSmell: aiSmellPatterns.filter((pattern) => text.includes(pattern)),
    genericness: genericPatterns.filter((pattern) => text.includes(pattern)),
    overexplaining: text.length > 220 || sentenceCount >= 5 ? ['long_reply'] : [],
    praise: praisePatterns.filter((pattern) => text.includes(pattern)),
    questionOveruse: questionCount > 1 ? ['too_many_questions'] : [],
    repetition: hasRepeatedStart(lines) ? ['repeated_opening'] : [],
    styleDrift: monotoneEndings.some((pattern) => text.includes(pattern)) ? ['monotone_endings'] : [],
    cheapEdginess: cheapEdgeWords.some((pattern) => text.includes(pattern)) ? ['cheap_edge'] : [],
  };
}

export function collectDetectorHits(summary: DetectorSummary): string[] {
  return [
    ...summary.aiSmell,
    ...summary.genericness,
    ...summary.overexplaining,
    ...summary.praise,
    ...summary.questionOveruse,
    ...summary.repetition,
    ...summary.styleDrift,
    ...summary.cheapEdginess,
  ];
}

function hasRepeatedStart(lines: string[]): boolean {
  const seen = new Set<string>();
  for (const line of lines.map((value) => value.trim()).filter(Boolean)) {
    const start = line.slice(0, 14);
    if (seen.has(start)) {
      return true;
    }
    seen.add(start);
  }
  return false;
}

export function applyAntiAiRewrite(text: string): string {
  let next = text.trim();
  for (const prefix of [
    '\u{3054}\u{8cea}\u{554f}\u{3042}\u{308a}\u{304c}\u{3068}\u{3046}\u{3054}\u{3056}\u{3044}\u{307e}\u{3059}\u{3002}',
    '\u{3054}\u{8cea}\u{554f}\u{3042}\u{308a}\u{304c}\u{3068}\u{3046}\u{3054}\u{3056}\u{3044}\u{307e}\u{3059}',
    '\u{4ee5}\u{4e0b}\u{306b}\u{307e}\u{3068}\u{3081}\u{307e}\u{3059}\u{3002}',
    '\u{4ee5}\u{4e0b}\u{306b}\u{307e}\u{3068}\u{3081}\u{307e}\u{3059}',
  ]) {
    if (next.startsWith(prefix)) {
      next = next.slice(prefix.length).trim();
    }
  }
  return next.replace(/\n{3,}/gu, '\n\n').trim();
}

export function stripCandidateIfNeeded(candidate: Candidate): Candidate {
  const summary = detectAiSmell(candidate.draft);
  return {
    ...candidate,
    detectorHits: collectDetectorHits(summary),
  };
}
