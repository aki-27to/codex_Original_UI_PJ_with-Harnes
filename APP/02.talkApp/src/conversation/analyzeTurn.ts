import { ChatMessage, ChatSettings, IntentType, TurnAnalysis } from '../shared/types.js';
import { compactText } from '../shared/utils.js';

const riskLexicon = [
  { tag: 'news', words: ['\u{30cb}\u{30e5}\u{30fc}\u{30b9}', '\u{5831}\u{9053}', '\u{6700}\u{65b0}', '\u{4eca}\u{65e5}', '\u{4eca}\u{9031}', '\u{901f}\u{5831}', '\u{6700}\u{8fd1}', '\u{30c8}\u{30ec}\u{30f3}\u{30c9}'] },
  { tag: 'medical', words: ['\u{75c5}\u{6c17}', '\u{75c7}\u{72b6}', '\u{8a3a}\u{65ad}', '\u{6cbb}\u{7642}', '\u{85ac}', '\u{30e1}\u{30f3}\u{30bf}\u{30eb}', '\u{4f53}\u{8abf}', '\u{75db}\u{307f}'] },
  { tag: 'financial', words: ['\u{682a}', '\u{6295}\u{8cc7}', 'NISA', '\u{7a0e}\u{91d1}', '\u{30ed}\u{30fc}\u{30f3}', '\u{4fdd}\u{967a}', '\u{8cc7}\u{7523}', '\u{70ba}\u{66ff}'] },
  { tag: 'legal', words: ['\u{6cd5}\u{5f8b}', '\u{5951}\u{7d04}', '\u{9055}\u{6cd5}', '\u{8a34}\u{8a1f}', '\u{898f}\u{7d04}', '\u{52b4}\u{50cd}\u{6cd5}', '\u{8457}\u{4f5c}\u{6a29}'] },
  { tag: 'schedule', words: ['\u{3044}\u{3064}', '\u{65e5}\u{7a0b}', '\u{671f}\u{9650}', '\u{7de0}\u{5207}', '\u{30b9}\u{30b1}\u{30b8}\u{30e5}\u{30fc}\u{30eb}', '\u{4e88}\u{5b9a}', '\u{4f55}\u{6642}'] },
];

const ventWords = ['\u{3057}\u{3093}\u{3069}', '\u{3064}\u{3089}\u{3044}', '\u{75b2}\u{308c}', '\u{30e0}\u{30ab}\u{3064}\u{304f}', '\u{8179}\u{7acb}\u{3064}', '\u{304d}\u{3064}\u{3044}', '\u{843d}\u{3061}\u{308b}', '\u{7121}\u{7406}', '\u{75c5}\u{3080}'];
const feelingWords = ['\u{597d}\u{304d}', '\u{826f}\u{304b}\u{3063}\u{305f}', '\u{523a}\u{3055}\u{308b}', '\u{30e2}\u{30e4}\u{308b}', '\u{5fae}\u{5999}'];
const smalltalkWords = ['\u{96d1}\u{8ac7}', '\u{3057}\u{3083}\u{3079}', '\u{8a71}\u{305d}', '\u{306a}\u{3093}\u{304b}\u{8a71}\u{305d}', '\u{6687}'];
const reviewWords = ['\u{30ec}\u{30d3}\u{30e5}\u{30fc}', '\u{5f31}\u{3044}', '\u{30c0}\u{30b5}\u{3044}', '\u{30ad}\u{30c4}\u{304f}\u{306a}\u{3044}', '\u{5fae}\u{5999}', '\u{8584}\u{3044}', '\u{304a}\u{3082}\u{3093}\u{306a}\u{3044}', '\u{3064}\u{307e}\u{3089}\u{306a}\u{3044}'];
const brainstormWords = ['\u{4f01}\u{753b}', '\u{58c1}\u{6253}\u{3061}', '\u{30a2}\u{30a4}\u{30c7}\u{30a2}', '\u{4f7f}\u{3048}\u{308b}', '\u{6d3b}\u{304d}\u{308b}', '\u{3069}\u{3046}\u{4f5c}\u{308b}', '\u{3069}\u{3046}\u{4f38}\u{3070}\u{3059}'];
const reflectionWords = ['\u{611f}\u{60f3}', '\u{8a00}\u{8a9e}\u{5316}', '\u{4f55}\u{304c}\u{3088}\u{304b}\u{3063}\u{305f}', '\u{3069}\u{3046}\u{898b}\u{3048}\u{305f}', '\u{81ea}\u{5206}\u{3067}\u{3082}\u{308f}\u{304b}\u{3089}\u{306a}\u{3044}'];
const analysisWords = ['\u{69cb}\u{9020}', '\u{672c}\u{8cea}', '\u{62bd}\u{8c61}', '\u{6bd4}\u{8f03}', '\u{306a}\u{305c}', '\u{3069}\u{3046}\u{3044}\u{3046}\u{5ea7}\u{6a19}\u{8ef8}', '\u{6587}\u{8108}'];
const seriousnessMediumWords = ['\u{4ed5}\u{4e8b}', '\u{4f01}\u{753b}', '\u{30ec}\u{30d3}\u{30e5}\u{30fc}', '\u{610f}\u{601d}\u{6c7a}\u{5b9a}', '\u{30ad}\u{30e3}\u{30ea}\u{30a2}', '\u{75c5}\u{307f}', '\u{5236}\u{5ea6}'];
const knowledgeHighWords = ['\u{69cb}\u{9020}', '\u{5ea7}\u{6a19}\u{8ef8}', '\u{6587}\u{8108}', '\u{62bd}\u{8c61}', '\u{672c}\u{8cea}', '\u{89e3}\u{91c8}', '\u{30ec}\u{30a4}\u{30e4}\u{30fc}'];
const knowledgeMidWords = ['\u{306a}\u{3093}\u{3067}', '\u{3069}\u{3046}\u{3044}\u{3046}', '\u{8a00}\u{8a9e}\u{5316}', '\u{6574}\u{7406}'];

export function analyzeTurn(messages: ChatMessage[], settings: ChatSettings): TurnAnalysis {
  const latestUser = [...messages].reverse().find((message) => message.role === 'user');
  const text = latestUser?.content ?? '';
  const intent = detectIntent(text, settings.mode);
  const riskTags = riskLexicon.filter((item) => containsAny(text, item.words)).map((item) => item.tag);

  const emotion = containsAny(text, ventWords)
    ? 'high'
    : containsAny(text, feelingWords)
      ? 'medium'
      : 'low';

  const energy = /[!?！？]{2,}|www|lol/iu.test(text) || text.length > 120
    ? 'high'
    : text.length > 40
      ? 'medium'
      : 'low';

  const desiredLength = settings.sliders.brevity >= 75
    ? 'short'
    : settings.sliders.density >= 68
      ? 'long'
      : 'medium';

  const seriousness = riskTags.length
    ? 'high'
    : containsAny(text, seriousnessMediumWords)
      ? 'medium'
      : 'low';

  const knowledgeLevel = containsAny(text, knowledgeHighWords)
    ? 'high'
    : containsAny(text, knowledgeMidWords)
      ? 'medium'
      : 'low';

  const wants = intent === 'smalltalk' || intent === 'review' || intent === 'reflection' || intent === 'vent'
    ? 'reply'
    : 'answer';

  return {
    intent,
    emotion,
    energy,
    desiredLength,
    seriousness,
    knowledgeLevel,
    priority: riskTags.length || settings.mode === 'fact-first' ? 'accuracy' : 'conversation',
    wants,
    topicSummary: compactText(text, 120),
    riskTags,
  };
}

function detectIntent(text: string, mode: ChatSettings['mode']): IntentType {
  if (mode === 'fact-first') {
    return 'grounded';
  }
  if (containsAny(text, smalltalkWords)) {
    return 'smalltalk';
  }
  if (containsAny(text, ventWords)) {
    return 'vent';
  }
  if (containsAny(text, reviewWords)) {
    return 'review';
  }
  if (containsAny(text, brainstormWords)) {
    return 'brainstorm';
  }
  if (containsAny(text, reflectionWords)) {
    return 'reflection';
  }
  if (containsAny(text, analysisWords)) {
    return 'analysis';
  }
  if (riskLexicon.some((item) => containsAny(text, item.words))) {
    return 'grounded';
  }
  return 'information';
}

function containsAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}
