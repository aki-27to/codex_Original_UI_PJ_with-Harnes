export type ChatRole = 'system' | 'user' | 'assistant';

export type ConversationStage = 'open' | 'deepen' | 'pivot' | 'land';

export type ConversationMove =
  | 'cut'
  | 'compare'
  | 'abstract'
  | 'discovery'
  | 'trend'
  | 'timeless'
  | 'history'
  | 'geography'
  | 'emotion'
  | 'example'
  | 'light_pushback'
  | 'leave_space'
  | 'metaphor'
  | 'twist'
  | 'stance';

export type IntentType =
  | 'information'
  | 'feeling'
  | 'smalltalk'
  | 'brainstorm'
  | 'review'
  | 'reflection'
  | 'analysis'
  | 'vent'
  | 'grounded';

export type RuntimeProvider = 'auto' | 'responses' | 'codex-exec' | 'harness';

export type EngineVariant = 'baseline' | 'improved' | 'cost-save';

export type ConversationMode =
  | 'smalltalk'
  | 'deep-dive'
  | 'brainstorm'
  | 'aftertalk'
  | 'planning'
  | 'spicy-review'
  | 'fact-first';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  responseId?: string;
  metadata?: Record<string, unknown>;
}

export interface StyleControls {
  warmth: number;
  sharpness: number;
  humor: number;
  density: number;
  challenge: number;
  brevity: number;
  weirdness: number;
}

export interface ChatSettings {
  assistantName: string;
  provider: RuntimeProvider;
  runtimeModel: string;
  gradingModel: string;
  mode: ConversationMode;
  engineVariant: EngineVariant;
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  verbosity: 'low' | 'medium' | 'high';
  webSearch: boolean;
  externalWebAccess: boolean;
  relationship: string;
  speechStyle: string;
  debugMode: boolean;
  memoryVisible: boolean;
  projectContext: string;
  collaborationNotes: string;
  sliders: StyleControls;
}

export interface TurnAnalysis {
  intent: IntentType;
  emotion: 'low' | 'medium' | 'high';
  energy: 'low' | 'medium' | 'high';
  desiredLength: 'short' | 'medium' | 'long';
  seriousness: 'low' | 'medium' | 'high';
  knowledgeLevel: 'low' | 'medium' | 'high';
  priority: 'conversation' | 'accuracy';
  wants: 'answer' | 'reply';
  topicSummary: string;
  riskTags: string[];
}

export interface CandidateScore {
  interestingness: number;
  humanNaturalness: number;
  conversationality: number;
  stance: number;
  sharpness: number;
  compression: number;
  empathyFit: number;
  groundedness: number;
  nonAiSmell: number;
  repetitionPenalty: number;
  nextTurnPotential: number;
  total: number;
}

export interface Candidate {
  id: string;
  moves: ConversationMove[];
  label: string;
  draft: string;
  score: CandidateScore;
  detectorHits: string[];
}

export interface DetectorSummary {
  aiSmell: string[];
  genericness: string[];
  overexplaining: string[];
  praise: string[];
  questionOveruse: string[];
  repetition: string[];
  styleDrift: string[];
  cheapEdginess: string[];
}

export interface GroundingDecision {
  required: boolean;
  reason: string;
  providerAllowed: boolean;
  fallbackNotice: string;
}

export interface SessionMemory {
  recentTopics: string[];
  recentFeedbackSignals: string[];
  recentStyles: string[];
  lastStage?: ConversationStage;
}

export interface PersistentMemory {
  interests: Record<string, number>;
  styleLikes: Record<string, number>;
  styleDislikes: Record<string, number>;
  responseWins: Record<string, number>;
  responseLosses: Record<string, number>;
  tempoPreference: 'short' | 'balanced' | 'dense';
  updatedAt: string;
}

export interface ReplyDebug {
  analysis: TurnAnalysis;
  stage: ConversationStage;
  moves: ConversationMove[];
  candidates: Candidate[];
  chosenCandidateId: string;
  grounding: GroundingDecision;
  detectors: DetectorSummary;
  memorySnapshot: {
    session: SessionMemory;
    persistent: PersistentMemory;
  };
  rationale: string;
  filteredPatterns: string[];
}

export interface ReplyResult {
  replyId: string;
  text: string;
  debug: ReplyDebug;
  citations: Array<{ title: string; url: string }>;
  provider: RuntimeProvider;
  model: string;
  responseId: string;
  warning?: string;
}

export type FeedbackLabel =
  | 'hit'
  | 'okay'
  | 'thin'
  | 'ai_smell'
  | 'too_much'
  | 'shorter'
  | 'sharper'
  | 'wrong_direction';

export interface FeedbackEntry {
  id: string;
  replyId: string;
  label: FeedbackLabel;
  messageText: string;
  replyText: string;
  note: string;
  createdAt: string;
  promotedTo?: 'golden' | 'anti';
}

export interface PreferencePairEntry {
  id: string;
  replyId: string;
  leftCandidateId: string;
  rightCandidateId: string;
  chosenCandidateId: string;
  createdAt: string;
}

export interface ExampleRecord {
  id: string;
  category: string;
  user: string;
  good: string;
  acceptable?: string;
  bad?: string;
  tags: string[];
  source: string;
  notes?: string;
}

export interface FailureRecord {
  id: string;
  category: string;
  user: string;
  reply: string;
  failureTags: string[];
  why: string;
  createdAt: string;
}

export interface EvalCase {
  id: string;
  category: string;
  turns: Array<{ role: ChatRole; content: string }>;
  expectedTags: string[];
  forbiddenTags: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface EvalCaseResult {
  caseId: string;
  category: string;
  baseline: CandidateScore;
  improved: CandidateScore;
  winner: 'baseline' | 'improved' | 'tie';
  notes: string[];
}

export interface EvalReport {
  id: string;
  createdAt: string;
  datasetName: string;
  totalCases: number;
  pairwiseWinRate: number;
  baselineAverage: Record<string, number>;
  improvedAverage: Record<string, number>;
  improvements: {
    aiSmellDropPct: number;
    interestingnessLiftPct: number;
    groundednessDelta: number;
    repetitionDropPct: number;
  };
  loops: string[];
  failureIds: string[];
  results: EvalCaseResult[];
}

export interface RuntimeAvailability {
  ready: boolean;
  error: string;
  defaultModel: string;
  supportsWebSearch: boolean;
}

export interface RuntimeStatus {
  ready: boolean;
  defaultProvider: RuntimeProvider;
  selectedProvider: RuntimeProvider | '';
  defaultReasoningEffort: ChatSettings['reasoningEffort'];
  defaultVerbosity: ChatSettings['verbosity'];
  promptSource: string;
  providers: Record<'responses' | 'codex-exec' | 'harness', RuntimeAvailability>;
}
