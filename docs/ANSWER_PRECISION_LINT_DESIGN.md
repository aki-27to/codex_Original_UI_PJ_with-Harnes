# Intent Fidelity Frame Design

## 1) Overview

This document supersedes the earlier narrow "answer precision lint" design.

The answer precision lint is still useful, but it is not the center of the problem. It only detects one downstream symptom: a judgment answer that lacks enough rationale.

The higher-level problem is intent drift:

> The assistant reads the latest prompt too locally, over-follows the user's surface suggestion, misses the user's underlying frustration or decision point, and then produces an answer that is procedurally plausible but not adoptable.

The best first-class primitive is therefore a pre-answer intent frame, not another post-answer lint.

This design introduces:

```text
intent_fidelity_frame
```

The frame captures the small set of checks that a strong human operator performs before answering:

- What is the user literally asking?
- What is the user actually trying to decide or fix?
- What must this answer not miss?
- What would be a misleading or appeasing answer?
- What independent standard makes the answer defensible?

The goal is not to make every answer longer. The goal is to make every important answer better targeted.

## 2) Design Position

This frame sits between the task requirement system and the final answer.

```text
user prompt / conversation context
        ↓
intent_fidelity_frame
        ↓
answer generation
        ↓
answer precision lint / reporting warnings
```

Existing system boundaries remain:

- `requirement_contract` is the formal task-execution requirement lock.
- `intent_fidelity_frame` is the lightweight per-turn user-intent and answer-targeting frame.
- `answer precision lint` is the post-answer sensor for thin rationale.
- `task_outcome_contract` remains the completion and adoption-readiness gate.

The frame does not replace the requirement contract. It covers the conversational gap before a full task contract is justified.

## 3) Human Model

The system should imitate the useful parts of strong human reasoning, not human inner monologue.

A strong human operator usually does these checks before answering:

1. Identify the user's real decision point.
2. Distinguish the surface question from the underlying complaint, fear, or goal.
3. Notice when the user is testing judgment rather than asking for information.
4. Avoid agreeing just because the user proposed a direction.
5. Choose a response shape that fits the current need.
6. State the answer at the level of detail that helps the user act.

The frame externalizes those checks into a compact object.

## 4) Problem

The existing user-facing response policy already handles several output risks, such as:

- optional closing proposals that extend the conversation unnecessarily;
- premature completion claims;
- leading with background readiness debt instead of the user's task verdict;
- internal process disclosure;
- thin rationale on obvious judgment prompts.

That is not enough for the broader failure pattern.

The recurring failures are:

- answering the latest sentence while losing the full conversation arc;
- treating a user proposal as a conclusion instead of a hypothesis;
- explaining adjacent mechanics while missing the user's actual concern;
- producing a locally correct answer that is globally off-intent;
- giving a rationale without stating the certainty boundary or independent basis;
- using a lint or phase label as a substitute for real intent understanding.

## 5) Non-Goals

This design must not:

- create a large multi-mode answer taxonomy at the start;
- force every answer into a long structured explanation;
- expose internal reasoning traces to the user by default;
- use the frame as a silent task-contract rewrite;
- override exact reply contracts, slash commands, or machine-readable output requirements;
- automatically retry or block answers in the first implementation;
- treat user satisfaction signals as correctness without an independent standard.

## 6) Core Frame

The frame should start as a small object:

```json
{
  "literal_request": "What the user explicitly asked.",
  "inferred_intent": "What the user is likely trying to decide, fix, or evaluate.",
  "active_frustration_or_risk": "The current complaint, risk, or failure mode that must not be missed.",
  "decision_at_stake": "The concrete decision or judgment the answer should support, if any.",
  "must_answer": "The one point this answer must directly answer.",
  "must_not_do": "The behavior that would make the answer off-intent.",
  "independent_standard": "The non-appeasing basis for judging what is actually best.",
  "confidence": "high | medium | low",
  "response_mode": "short | rationale | correction | design | review | implementation_report"
}
```

The highest-value fields are:

- `must_answer`
- `must_not_do`
- `independent_standard`

These prevent the most expensive failures: missing the point, appeasing the user, and optimizing for a local answer instead of the user's real decision.

## 7) Example

Conversation context:

```text
The user has repeatedly said the assistant is too shallow, reads too little context,
over-agrees with user suggestions, and creates scattered patches instead of a unified design.
```

Latest prompt:

```text
どういうかんじで入れるのがベストかな？
人間工学に基づいて、天才人間はどういう風に物事を考えていると思いますか？
それを模倣してみたい
```

Frame:

```json
{
  "literal_request": "Ask how to add the new mechanism and how to imitate strong human reasoning.",
  "inferred_intent": "Unify the harness around a better intent-understanding layer rather than adding scattered answer-quality patches.",
  "active_frustration_or_risk": "A narrow lint or phase label would miss the user's actual concern about context, judgment, and non-appeasement.",
  "decision_at_stake": "Whether to add a pre-answer intent frame as a central layer.",
  "must_answer": "Explain the best insertion point and the human reasoning pattern to imitate.",
  "must_not_do": "Merely agree with the user's proposal or propose another isolated detector.",
  "independent_standard": "Intent fidelity, low cognitive overhead, observability, reversibility, and coherence with existing requirement contracts.",
  "confidence": "high",
  "response_mode": "design"
}
```

## 8) Runtime Behavior

The first runtime behavior should be observational.

The assistant should build the frame before answering when the prompt appears to involve one or more of these conditions:

- disagreement, correction, or dissatisfaction from the user;
- design, judgment, comparison, or best-practice decision;
- conversation-history dependence;
- concern about intent, scope, quality, or completion;
- prior assistant answer was challenged as shallow, wrong, off-intent, or too agreeable.

The frame should not be shown to the user by default. It should guide answer generation and be logged only in a compact, privacy-conscious operation surface if runtime logging is enabled.

Initial behavior:

```text
build frame
generate answer
run lightweight adherence checks
emit warning if the answer misses must_answer or violates must_not_do
do not rewrite the answer automatically
do not fail the task outcome
```

## 9) Adherence Checks

The first checker should be simple and deterministic where possible.

It should warn when:

- `must_answer` is empty for a high-stakes or high-friction prompt;
- `must_not_do` is empty after user dissatisfaction or correction;
- `independent_standard` is empty for a judgment request;
- the final answer does not contain a direct answer to `must_answer`;
- the final answer contains a pattern similar to `must_not_do`;
- the answer agrees with the user's proposed direction without stating an independent basis.

Suggested warning kinds:

```js
{
  kind: "missing_intent_frame_field",
  missing: ["must_answer", "independent_standard"],
  mode: "warning"
}
```

```js
{
  kind: "answer_misses_must_answer",
  mode: "warning"
}
```

```js
{
  kind: "possible_user_appeasement",
  mode: "warning"
}
```

These checks should remain warnings at first. They are not proof that the answer is bad; they are evidence that the answer may need review.

## 10) Relationship To Existing Thin-Rationale Lint

The existing `thin_decision_rationale` warning becomes a subordinate sensor.

It answers this narrower question:

```text
When a judgment answer is needed, did the answer include enough rationale?
```

The intent frame answers the broader question:

```text
Did the assistant understand what this turn is really about before answering?
```

The relationship is:

```text
intent_fidelity_frame
  ├─ chooses the response target and independent standard
  └─ may activate thin_decision_rationale after generation
```

The previous binary classifier:

```text
Does this prompt need a decision rationale?
YES / NO
```

should remain useful, but only as one detector under the larger frame.

## 11) Proposed API

Add frame-building and detection functions near the existing user-facing response policy utilities.

```js
function promptNeedsIntentFidelityFrame(prompt, context = {}) {
  // returns true when the prompt needs explicit intent targeting before answer generation.
}

function buildIntentFidelityFrame({
  prompt = "",
  recentUserMessages = [],
  previousAssistantAnswer = "",
  requirementSnapshot = null,
  responseContract = defaultUserFacingResponseContract,
} = {}) {
  // returns a compact frame object.
}

function detectIntentFrameAdherence({
  frame = null,
  answer = "",
  responseContract = defaultUserFacingResponseContract,
} = {}) {
  // returns null when no warning is needed.
  // returns a warning object when the answer appears to miss the frame.
}
```

The first implementation may use heuristics. It should not claim deep semantic certainty.

## 12) Trigger Heuristics

`promptNeedsIntentFidelityFrame(prompt, context)` should return `true` for obvious cases.

Japanese prompt signals:

- `違う`
- `理解していない`
- `意図`
- `浅い`
- `迎合`
- `ベスト`
- `なぜ`
- `理由`
- `設計`
- `思想`
- `統一感`
- `核心`
- `ちゃんと`
- `全体`
- `文脈`
- `どう実装`
- `どうするのがよい`
- `どうするのがベスト`

English prompt signals:

- `intent`
- `wrong`
- `misunderstood`
- `shallow`
- `appease`
- `best`
- `why`
- `rationale`
- `design`
- `principle`
- `coherent`
- `context`
- `overall`
- `should`
- `compare`

Context signals:

- previous assistant answer was corrected by the user;
- the user asked about design direction or implementation strategy;
- the turn depends on earlier conversation history;
- the task touches requirement understanding, acceptance, completion, or answer quality.

Bypass conditions:

- exact reply contract is detected;
- prompt starts with `/`;
- prompt is empty;
- the response must be strictly machine-readable;
- the task is a simple command report or factual lookup with no judgment.

## 13) Frame Construction Heuristics

Initial frame construction should be conservative.

Recommended rules:

- `literal_request`: summarize the latest user prompt.
- `inferred_intent`: summarize the likely purpose using recent user messages, not only the latest sentence.
- `active_frustration_or_risk`: populate when the user uses correction, dissatisfaction, or strong quality language.
- `decision_at_stake`: populate when the user asks for best, should, design, compare, or implementation judgment.
- `must_answer`: one sentence, preferably derived from the user's final question.
- `must_not_do`: derive from explicit user criticism and known failure mode.
- `independent_standard`: derive from repo constitution, requirement contract, evidence contract, or practical engineering quality.
- `confidence`: `high` only when the prompt and recent context point in the same direction.
- `response_mode`: choose the smallest answer shape that satisfies `must_answer`.

The frame should prefer "unknown" or `medium` confidence over overclaiming inferred intent.

## 14) Tests

Add tests in phases.

### Case 1: correction triggers frame

Prompt:

```text
今も結局俺の意図を理解してくれていない。解釈が異なる
```

Expected:

```js
promptNeedsIntentFidelityFrame(prompt) === true
```

### Case 2: design-best prompt triggers frame

Prompt:

```text
これをどう実装するのがベストか？
```

Expected:

```js
promptNeedsIntentFidelityFrame(prompt) === true
```

### Case 3: simple factual prompt bypasses frame

Prompt:

```text
今の時刻を教えて
```

Expected:

```js
promptNeedsIntentFidelityFrame(prompt) === false
```

### Case 4: frame requires independent standard

Prompt:

```text
俺の提案通りにした方がよい？
```

Expected:

```js
const frame = buildIntentFidelityFrame({ prompt })
frame.independent_standard.length > 0
```

### Case 5: answer misses must_answer

Frame:

```js
{
  must_answer: "Explain whether the central layer should be pre-answer intent framing.",
  must_not_do: "Only propose another isolated lint.",
  independent_standard: "Intent fidelity and coherence with requirement contracts."
}
```

Answer:

```text
薄い理由検出のキーワードを増やすのがよいです。
```

Expected:

```js
detectIntentFrameAdherence({ frame, answer }).kind === "answer_misses_must_answer"
```

## 15) Adoption Path

### Phase 1: Design And Unit Tests

Add:

- `promptNeedsIntentFidelityFrame`
- `buildIntentFidelityFrame`
- `detectIntentFrameAdherence`
- focused tests

Do not connect to runtime output yet.

Decision state:

```text
frame behavior validated by unit tests
```

### Phase 2: Shadow Runtime Observation

Build the frame in runtime for triggered prompts and log compact observations.

Runtime surface:

- emit `response.intent_frame` when a frame is built;
- emit `response.intent_frame_warning` when adherence checks warn;
- include only compact summaries, not long hidden reasoning;
- preserve the already computed final answer text;
- treat frame failures as observations, never task failure.

Decision state:

```text
runtime observable, non-blocking
```

### Phase 3: Contract Promotion

If useful, promote the stable pieces into `scripts/config/user_facing_response_contract.json`.

Only promote fields and triggers that survived replay evidence.

Decision state:

```text
intent frame promoted to contract
```

### Phase 4: Selective Answer Repair

Only after replay evidence shows low false positives, allow selective repair for high-friction conversational answers.

Do not retry implementation tasks only because the final report has a frame warning. For those, keep the warning as a review signal unless the user explicitly requested response-quality evaluation.

Decision state:

```text
limited repair behavior
```

## 16) Best Practice Recommendation

The best next implementation is:

```text
one pre-answer intent frame
+ one adherence warning
+ keep existing thin-rationale lint as a subordinate sensor
+ no automatic retry at first
+ no broad response taxonomy
```

This is better than adding more answer lints because the user's main failure mode is not only shallow rationale. It is answer-target drift.

The correct first move is therefore to make the target explicit before generation:

```text
What must this answer hit?
What must it avoid?
What independent standard should govern the judgment?
```

That is the smallest mechanism that captures the useful part of strong human reasoning while staying testable, reversible, and consistent with the harness's intent-first architecture.
