import { Candidate, ChatSettings, ConversationMove, TurnAnalysis } from '../shared/types.js';
import { compactText, createId } from '../shared/utils.js';

type Scene =
  | 'boring'
  | 'verbalize'
  | 'business'
  | 'tired'
  | 'weak_plan'
  | 'harsh'
  | 'high_risk'
  | 'general';

const sceneBoring = ['\u{304a}\u{3082}\u{3093}\u{306a}\u{3044}', '\u{3064}\u{307e}\u{3089}\u{306a}\u{3044}', '\u{8584}\u{3044}', 'AI\u{3063}\u{307d}\u{3044}'];
const sceneVerbalize = ['\u{8a00}\u{8a9e}\u{5316}\u{3067}\u{304d}', '\u{3046}\u{307e}\u{304f}\u{8a00}\u{3048}\u{306a}\u{3044}', '\u{4f55}\u{304c}\u{3088}\u{304b}\u{3063}\u{305f}\u{304b}\u{308f}\u{304b}\u{3089}\u{306a}\u{3044}'];
const sceneBusiness = ['\u{30d3}\u{30b8}\u{30cd}\u{30b9}', '\u{4ed5}\u{4e8b}', '\u{6d3b}\u{304d}\u{308b}', '\u{4f7f}\u{3048}\u{308b}', '\u{4f1a}\u{8b70}'];
const sceneTired = ['\u{3057}\u{3093}\u{3069}\u{3044}', '\u{75b2}\u{308c}\u{305f}', '\u{305a}\u{3063}\u{3068}\u{3064}\u{3089}\u{3044}', '\u{7121}\u{7406}'];
const sceneWeakPlan = ['\u{3053}\u{306e}\u{4f01}\u{753b}\u{3001}\u{5f31}\u{3044}', '\u{5f31}\u{3044}\u{ff1f}', '\u{4f01}\u{753b}'];
const sceneHarsh = ['\u{30ad}\u{30c4}\u{304f}\u{306a}\u{3044}', '\u{5f37}\u{3059}\u{304e}', '\u{8a00}\u{3044}\u{65b9}\u{304d}\u{3064}\u{3044}'];

export function generateCandidates(
  userText: string,
  analysis: TurnAnalysis,
  moves: ConversationMove[],
  settings: ChatSettings,
): Array<Omit<Candidate, 'score' | 'detectorHits'>> {
  const topic = extractTopic(userText);
  const scene = resolveScene(userText, analysis);
  const templates = buildTemplates(scene, topic, settings);

  return [
    { id: createId('cand'), label: 'diagnostic', moves: uniqueMoves([...moves, 'cut', 'stance']), draft: templates.diagnostic },
    { id: createId('cand'), label: 'emotional', moves: uniqueMoves([...moves, 'emotion', 'leave_space']), draft: templates.emotional },
    { id: createId('cand'), label: 'compare', moves: uniqueMoves([...moves, 'compare', 'discovery']), draft: templates.compare },
    { id: createId('cand'), label: 'twist', moves: uniqueMoves([...moves, 'twist', 'abstract']), draft: templates.twist },
    { id: createId('cand'), label: 'light-pushback', moves: uniqueMoves([...moves, 'light_pushback', 'stance']), draft: templates.pushback },
    { id: createId('cand'), label: 'short-hit', moves: uniqueMoves([...moves, 'cut']), draft: templates.shortHit },
    { id: createId('cand'), label: 'example', moves: uniqueMoves([...moves, 'example', 'compare']), draft: templates.example },
    { id: createId('cand'), label: 'landing', moves: uniqueMoves([...moves, 'leave_space', 'stance']), draft: templates.landing },
  ];
}

function extractTopic(userText: string): string {
  const normalized = compactText(userText, 80);
  if (!normalized) {
    return 'this topic';
  }
  return normalized.length <= 32 ? normalized : `${normalized.slice(0, 32)}...`;
}

function resolveScene(userText: string, analysis: TurnAnalysis): Scene {
  if (analysis.priority === 'accuracy') {
    return 'high_risk';
  }
  if (sceneBoring.some((word) => userText.includes(word))) {
    return 'boring';
  }
  if (sceneVerbalize.some((word) => userText.includes(word))) {
    return 'verbalize';
  }
  if (sceneBusiness.some((word) => userText.includes(word))) {
    return 'business';
  }
  if (sceneTired.some((word) => userText.includes(word))) {
    return 'tired';
  }
  if (sceneWeakPlan.some((word) => userText.includes(word))) {
    return 'weak_plan';
  }
  if (sceneHarsh.some((word) => userText.includes(word))) {
    return 'harsh';
  }
  return 'general';
}

function buildTemplates(scene: Scene, topic: string, settings: ChatSettings) {
  const challenge = settings.sliders.challenge >= 60;

  if (scene === 'boring') {
    return {
      diagnostic: 'It feels flat because it answers, but does not really return the ball.',
      emotional: 'The miss is probably not knowledge depth. It is angle depth.',
      compare: 'A smart answer and a conversational answer are different things. Right now it feels like only the first one is there.',
      twist: 'The issue is less content weakness and more lack of taste in where to cut.',
      pushback: 'Strictly speaking, it is not just boring. It is too straight and too complete.',
      shortHit: 'Answering is not enough.',
      example: 'The same content can feel alive or dead depending on whether it starts with summary or with a shift in angle.',
      landing: 'What needs work is not information volume. It is viewpoint texture.',
    };
  }

  if (scene === 'verbalize') {
    return {
      diagnostic: 'Maybe it was not simply good. Maybe it altered your mood a little after it ended.',
      emotional: 'When language lags, the hit probably arrived before the reasons did.',
      compare: 'This sounds closer to being affected by it than neatly evaluating it.',
      twist: 'The residue matters more than the checklist.',
      pushback: 'If you split it into script, acting, and music too early, it probably goes thin.',
      shortHit: 'It feels more like residue than review.',
      example: 'Sometimes the right handle is not “I liked it” but “it stayed in my body longer than expected.”',
      landing: 'Catch the aftertaste first. Explanation can come later.',
    };
  }

  if (scene === 'business') {
    return {
      diagnostic: 'The business value is less a tactic and more a way of choosing the viewing axis.',
      emotional: 'The people who feel one layer deeper in meetings often differ more in framing than in raw knowledge.',
      compare: 'Adding facts helps less than changing the comparison frame.',
      twist: 'The leverage is not the answer. It is the habit of spotting where the frame is wrong.',
      pushback: challenge
        ? 'If you turn it into a cheap template too fast, it loses most of its value.'
        : 'It works better as a lens than as a step-by-step recipe.',
      shortHit: 'Use it as a lens, not a trick.',
      example: 'In planning work, the strongest person is often the one who says the comparison axis is off.',
      landing: 'Port the frame, not just the method.',
    };
  }

  if (scene === 'tired') {
    return {
      diagnostic: 'This sounds like more than fatigue. It sounds like your own mood has been pushed behind everything else for a while.',
      emotional: 'It may not be lack of rest alone. It may be lack of room to recover at all.',
      compare: 'Body drain and mood drain can stack. Fixing only one of them often does not move enough.',
      twist: 'The load might be less “busy” and more “constantly processing yourself.”',
      pushback: 'Trying to brute-force your way back may already be a little too late for this stage.',
      shortHit: 'This sounds like more than tiredness.',
      example: 'When sleep does not reset anything, it is often not only a sleep problem.',
      landing: 'Do not force a single cause too early. Mixed causes fit this better.',
    };
  }

  if (scene === 'weak_plan') {
    return {
      diagnostic: 'It is not empty. It is just not specific enough to itself yet.',
      emotional: 'The heat is scattered because the proposal still looks exchangeable with nearby alternatives.',
      compare: 'This looks less like an information gap and more like a contour gap.',
      twist: 'It feels less like a hole and more like missing a proper noun.',
      pushback: 'Kind wording would say room to improve. Stricter wording would say it is still replaceable.',
      shortHit: 'It has structure, but not identity yet.',
      example: 'If the same one-line summary still fits three other plans, the plan is not sharp enough yet.',
      landing: 'Do not add more pieces first. Find the one point that only this plan can own.',
    };
  }

  if (scene === 'harsh') {
    return {
      diagnostic: 'That landed harder than intended. I pushed sharpness too far.',
      emotional: 'The angle was fine. The temperature matching was not.',
      compare: 'Having a spine and leaving the other person behind are not the same thing.',
      twist: 'The reply had shape, but the landing was too front-footed.',
      pushback: 'I would not blunt it completely. I would lower the force, not remove the edge.',
      shortHit: 'Fair. That was too hard.',
      example: 'Keep the blade, change the contact point.',
      landing: 'I would keep the precision and pull back the pressure.',
    };
  }

  if (scene === 'high_risk') {
    return {
      diagnostic: 'This is a verify-first topic, not a style-first topic.',
      emotional: 'The risky part here is false confidence, not lack of flair.',
      compare: 'Some topics can take conversational looseness. This type cannot.',
      twist: 'The stronger move is to mark what is still unverified before trying to sound sharp.',
      pushback: 'Saying it cleanly right now matters less than checking the conditions that change the answer.',
      shortHit: 'Verify before asserting.',
      example: 'News, law, medical, and finance all punish confident shortcuts.',
      landing: 'Hold the claim a little. Check the ground first.',
    };
  }

  return {
    diagnostic: `${topic} probably gets better once the friction is named before the explanation expands.`,
    emotional: `The user likely wants the contour of ${topic}, not just more information about it.`,
    compare: `${topic} looks like a content problem on the surface, but often it is a framing problem underneath.`,
    twist: `What is missing may matter more here than what is already being said about ${topic}.`,
    pushback: challenge
      ? `${topic} feels over-explained before it earns its own angle.`
      : `${topic} is organized, but still a little too clean and literal.`,
    shortHit: `${topic} needs angle, not volume.`,
    example: `A summary-first answer flattens ${topic}. A shifted frame gives it life.`,
    landing: 'Push the angle first. Fill the rest later.',
  };
}

function uniqueMoves(moves: ConversationMove[]): ConversationMove[] {
  return [...new Set(moves)].slice(0, 3);
}
