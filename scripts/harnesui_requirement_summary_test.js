#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function extractBlock(source, pattern, label) {
  const match = source.match(pattern);
  assert(match && match[0], `${label} not found in app.js`);
  return match[0];
}

function extractFunction(source, name) {
  return extractBlock(source, new RegExp(`function ${name}\\([^]*?\\n\\}`, "m"), name);
}

function loadSnapshotHelper() {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "01.HarnesUI", "app.js"), "utf8");
  const context = {
    Object,
    toArr(value) {
      return Array.isArray(value) ? value : (value == null ? [] : [value]);
    },
    t1(value, max = 999) {
      return String(value == null ? "" : value).slice(0, max);
    },
    planningContextForUi(turn) {
      return turn && turn.planning && typeof turn.planning === "object" ? turn.planning : {};
    },
    requirementContractForUi(turn) {
      const planning = context.planningContextForUi(turn);
      return planning.requirementContract && typeof planning.requirementContract === "object" ? planning.requirementContract : {};
    },
  };
  vm.runInNewContext(
    [
      extractBlock(source, /const QUALITY_AXIS_LABELS_FOR_UI=Object\.freeze\(\{[^]*?\n\}\);/, "QUALITY_AXIS_LABELS_FOR_UI"),
      extractBlock(source, /const REQUIREMENT_TEXT_LABELS_FOR_UI=Object\.freeze\(\{[^]*?\n\}\);/, "REQUIREMENT_TEXT_LABELS_FOR_UI"),
      extractFunction(source, "qualityAxisLabelForUi"),
      extractFunction(source, "requirementTextLabelForUi"),
      extractFunction(source, "normalizeRequirementCompareKeyForUi"),
      extractFunction(source, "requirementKeysOverlapForUi"),
      extractFunction(source, "distinctRequirementCandidateForUi"),
      extractFunction(source, "collectDistinctRequirementCandidatesForUi"),
      extractFunction(source, "stripQuestionLeadForUi"),
      extractFunction(source, "requirementLooksFragmentaryForUi"),
      extractFunction(source, "preferredRequirementNarrativeForUi"),
      extractFunction(source, "joinIntentPhrasesForUi"),
      extractFunction(source, "inferQuestionIntentDirectionForUi"),
      extractFunction(source, "inferQuestionIntentHypothesisForUi"),
      extractFunction(source, "compactTextListForUi"),
      extractFunction(source, "acceptanceCheckLabelsForUi"),
      extractFunction(source, "summarizeInlineListForUi"),
      extractFunction(source, "requirementStatusLabelForUi"),
      extractFunction(source, "requirementValidationLabelForUi"),
      extractBlock(source, /const REQUIREMENT_FIELD_LABELS_FOR_UI=Object\.freeze\(\{[^]*?\n\}\);/, "REQUIREMENT_FIELD_LABELS_FOR_UI"),
      extractFunction(source, "requirementFieldLabelForUi"),
      extractFunction(source, "collectRequirementProvenanceCountsForUi"),
      extractFunction(source, "summarizeRequirementProvenanceForUi"),
      extractFunction(source, "buildRequirementLockSnapshotForUi"),
      extractFunction(source, "requirementGroupsForUi"),
      "this.__helper__ = { buildRequirementLockSnapshotForUi, requirementGroupsForUi };",
    ].join("\n"),
    context
  );
  return context.__helper__;
}

function assertLineStarts(items, prefix, message) {
  assert(items.some((entry) => String(entry).startsWith(prefix)), message);
}

function assertRowLabel(rows, label, message) {
  assert((rows || []).some((entry) => entry && entry.label === label), message);
}

function run() {
  const { buildRequirementLockSnapshotForUi, requirementGroupsForUi } = loadSnapshotHelper();

  const progressSnapshot = buildRequirementLockSnapshotForUi({
    planning: {
      requirementContract: {
        explicitGoal: "ワークスペースの意味とここに何も記載しなかった場合の挙動を説明する",
        implicitGoal: "ユーザーが本当に知りたいのは、AIがどの解釈で進むかが先に分かること",
        openQuestions: ["ワークスペースの意味とここに何も記載しなかった場合の挙動を説明する"],
        acceptanceChecks: [],
        baselineScope: [],
        overDeliveryScope: [],
        nonGoals: [],
        assumptions: [],
        intentInterpretation: {
          presentation: "progress_hypothesis",
          questionLike: true,
          direction: "既存UIを大きく崩さず、AIの進行方向が一目で読めるようにする",
          hypothesis: "ユーザーが本当に知りたいのは、AIがどの解釈で進むかが先に分かること",
        },
        userValueFrame: {
          valueThesis: "依頼された変更を正しく、局所的に、あとからの手戻り圧を増やさない形で届ける",
          userWants: ["既存UIを大きく崩さず、AIの進行方向が一目で読めるようにする"],
          userShouldFeelGet: [],
          mustAvoid: [],
          hardConstraints: [],
          qualityAxes: ["bounded_scope"],
          completedMeans: [],
        },
      },
    },
  });

  assert.strictEqual(progressSnapshot.goalGroupTitle, "進行仮説", "question-style goals should still be recognized as progress hypotheses");
  assert.strictEqual(progressSnapshot.intentDirectionLabel, "向かう先", "question-style explanation goals should foreground where the AI is heading");
  assert.strictEqual(progressSnapshot.explicitGoalLabel, "扱う論点", "question-style explanation goals should relabel the literal topic");
  assert.strictEqual(
    progressSnapshot.intentDirection,
    "既存UIを大きく崩さず、AIの進行方向が一目で読めるようにする",
    "progress hypotheses should prefer the likely user intent over the literal question wording"
  );
  assert.deepStrictEqual(progressSnapshot.openQuestions, [], "goal-equivalent open questions should be filtered out from the unresolved bucket");
  assert.deepStrictEqual(progressSnapshot.qualityAxes, ["スコープの適切さ"], "quality axis ids should be localized for the UI");
  assert.strictEqual(
    progressSnapshot.headline,
    "既存UIを大きく崩さず、AIの進行方向が一目で読めるようにする",
    "requirement lock headline should use the inferred direction when available"
  );

  const progressGroups = requirementGroupsForUi(progressSnapshot);
  assert.strictEqual(progressGroups.length, 1, "requirement lock should now collapse into a single narrative card");
  assert.strictEqual(progressGroups[0].title, "AIの方針", "the single requirement card should focus on the AI's direction");
  assert.strictEqual(progressGroups[0].summary, "既存UIを大きく崩さず、AIの進行方向が一目で読めるようにする", "the summary should foreground the essence of the AI's current interpretation");
  assertRowLabel(progressGroups[0].rows, "進め方", "single-card requirement lock should explain how the AI intends to proceed");
  assert.ok(
    !(progressGroups[0].rows || []).some((entry) => entry && entry.label === "意図の仮説"),
    "single-card requirement lock should avoid reviving detailed sub-buckets when a concise direction is enough"
  );

  const blockedSnapshot = buildRequirementLockSnapshotForUi({
    planning: {
      requirementContract: {
        explicitGoal: "このUIの部分をごちゃごちゃさせずに整理する",
        implicitGoal: "",
        openQuestions: ["最優先したい方向は何かを確認する"],
        acceptanceChecks: [],
        baselineScope: ["要件ロックの表示を 1 枠にまとめる"],
        overDeliveryScope: [],
        nonGoals: ["要件確認の範囲を超えた UI 改変"],
        assumptions: ["実装詳細はまだ固めない"],
        status: "BLOCKED",
        statusReason: "Open questions remain: 1.",
        validation: {
          verdict: "BLOCK",
          summary: { passCount: 2, warnCount: 0, blockCount: 1, total: 3 },
          checks: [{ status: "BLOCK", detail: "最優先方向の確認が必要" }],
        },
        userValueFrame: {
          valueThesis: "依頼された Web 体験を、手順の煩いよりも第一印象と情報の強さが先に伝わる形で届ける",
          userWants: [],
          userShouldFeelGet: [],
          mustAvoid: ["無駄なカード分割"],
          hardConstraints: ["要件確認の範囲を超えて実装しない"],
          qualityAxes: ["bounded_scope"],
          completedMeans: ["AIがどう解釈してどう進むかがすぐ読める"],
        },
      },
    },
  });
  const blockedGroups = requirementGroupsForUi(blockedSnapshot);
  assert.strictEqual(blockedGroups.length, 1, "blocked requirement locks should still use the single-card surface");
  assertRowLabel(blockedGroups[0].rows, "進め方", "blocked requirement locks should still explain the intended approach");
  assertRowLabel(blockedGroups[0].rows, "止まる理由", "blocked requirement locks should expose the current blocking reason");
  assertRowLabel(blockedGroups[0].rows, "守る線", "blocked requirement locks should keep the non-goal boundary visible");

  const displayContractSnapshot = buildRequirementLockSnapshotForUi({
    planning: {
      requirementContract: {
        explicitGoal: "raw prompt goal",
        implicitGoal: "",
        lockedGoal: "validated requirement contract goal",
        openQuestions: ["which version matters most"],
        acceptanceChecks: [{ title: "Show structured requirement cards" }],
        baselineScope: ["Requirement Lock panel"],
        overDeliveryScope: ["Add a delight lane"],
        nonGoals: ["Do not widen execution scope"],
        assumptions: [],
        status: "LOCKED",
        statusReason: "Ready to proceed.",
        validation: {
          verdict: "PASS",
          summary: { passCount: 4, warnCount: 0, blockCount: 0, total: 4 },
          checks: [{ status: "PASS", detail: "Core contract is ready." }],
        },
        userValueFrame: {
          valueThesis: "Operators should read a clear contract instead of the raw wording.",
          userWants: ["A cleaner requirement summary"],
          userShouldFeelGet: [],
          mustAvoid: ["raw echo"],
          hardConstraints: ["Do not skip blocking questions"],
          qualityAxes: ["clarity"],
          completedMeans: ["The UI shows a locked goal and the next question plan"],
        },
        requestCoverage: {
          rawRequestClauses: [
            { id: "req-1", text: "A cleaner requirement summary", kind: "explicit_request", lane: "core" },
            { id: "req-2", text: "Do not widen execution scope", kind: "non_target", lane: "core" },
            { id: "req-3", text: "Which area should the UI emphasize first?", kind: "taste_value", lane: "taste" },
            { id: "req-4", text: "Show the next question plan", kind: "verification_method", lane: "core" },
            { id: "req-5", text: "Delay the delight lane if needed", kind: "taste_value", lane: "defaultable" },
          ],
          coreObligations: ["req-1", "req-2", "req-4"],
          mappedRequirements: [
            { clauseId: "req-1", requirementRefs: ["userValueFrame.userWants"] },
            { clauseId: "req-2", requirementRefs: ["nonGoals"] },
          ],
          parkedItems: [{ clauseId: "req-3", reason: "Taste stays outside the locked core contract." }],
          droppedItems: [{ clauseId: "req-5", reasonCode: "deferred_nonblocking", reason: "Not needed for the first lock." }],
          coverageSummary: {
            totalClauses: 5,
            mappedCount: 2,
            coreTotal: 3,
            coreMapped: 2,
            coreUnmapped: 1,
            parkedCount: 1,
            droppedCount: 1,
          },
        },
        displayContract: {
          headline: "validated requirement contract goal",
          goal: "validated requirement contract goal",
          goalMode: "locked",
          goalLabel: "locked_goal",
          nextAction: "Confirm only the one missing priority question.",
          holdReason: "One taste question can still refine the wording.",
          targetOutcome: "The operator sees the contract, the next question, and the delight lane.",
          boundaries: ["Do not widen execution scope", "Avoid raw echo"],
          askNext: [{ question: "Which area should the UI emphasize first?", category: "taste", reason: "priority_axis" }],
          delightTitles: ["Add a delight lane"],
        },
      },
    },
  });
  const displayGroups = requirementGroupsForUi(displayContractSnapshot);
  assert.strictEqual(displayContractSnapshot.displayGoalMode, "locked", "display contract should carry the locked goal mode into the snapshot");
  assert.deepStrictEqual(displayContractSnapshot.displayAskNext, ["Which area should the UI emphasize first?"], "display contract should surface the prioritized next question");
  assert.deepStrictEqual(displayContractSnapshot.delightTitles, ["Add a delight lane"], "display contract should preserve the delight lane titles");
  assert.ok(displayContractSnapshot.metaParts.includes("依頼反映 2 / 3"), "Requirement Lock should summarize mapped core request coverage");
  assert.ok(displayContractSnapshot.metaParts.includes("保留 1"), "Requirement Lock should summarize parked request items");
  assert.ok(displayContractSnapshot.metaParts.includes("除外 1"), "Requirement Lock should summarize dropped request items");
  assert.strictEqual(displayGroups[0].summary, "validated requirement contract goal", "display contract should let the UI foreground the locked goal");
  assertRowLabel(displayGroups[0].rows, "進め方", "display contract should still produce a clear next action row");

  const stitchReplaySnapshot = buildRequirementLockSnapshotForUi({
    planning: {
      requirementContract: {
        explicitGoal: "以下に従ってWEB UIを刷新してください。",
        implicitGoal: "",
        lockedGoal: "Stitch の「Home - SURUGA-K」内の「TOP - 三重非破壊検査（画像サンプル反映版）」画面の画像とコードを取得し、WEB UI に忠実再現する",
        openQuestions: [],
        acceptanceChecks: [
          { title: "Stitch の「TOP - 三重非破壊検査（画像サンプル反映版）」画面の構成と主要要素を WEB UI に再現する" },
          { title: "取得した Stitch の画像とコードを基準に実装する" },
        ],
        baselineScope: [
          "Stitch project: Home - SURUGA-K / ID 10142073172180669410",
          "Stitch screen: TOP - 三重非破壊検査（画像サンプル反映版） / ID 6be8048471f94faaad7a7d18601c6d2f",
          "Stitch の画像とコードを取得して実装の基準にする",
        ],
        overDeliveryScope: [],
        nonGoals: ["指定されていない screen へ広げない"],
        assumptions: [],
        status: "LOCKED",
        statusReason: "Ready to proceed.",
        validation: {
          verdict: "PASS",
          summary: { passCount: 4, warnCount: 0, blockCount: 0, total: 4 },
          checks: [{ status: "PASS", detail: "Core contract is ready." }],
        },
        userValueFrame: {
          valueThesis: "指定された Stitch screen を基準に、WEB UI を忠実再現する",
          userWants: ["指定 screen の見た目と構成を WEB UI に再現する"],
          userShouldFeelGet: [],
          mustAvoid: ["完全再現から外れる独自アレンジを入れない"],
          hardConstraints: ["指定された Stitch screen を基準にする"],
          qualityAxes: ["bounded_scope"],
          completedMeans: ["TOP 画面の構成と見た目が WEB UI で再現される"],
        },
        displayContract: {
          headline: "Stitch の「Home - SURUGA-K」内の「TOP - 三重非破壊検査（画像サンプル反映版）」画面の画像とコードを取得し、WEB UI に忠実再現する",
          goal: "Stitch の「Home - SURUGA-K」内の「TOP - 三重非破壊検査（画像サンプル反映版）」画面の画像とコードを取得し、WEB UI に忠実再現する",
          goalMode: "locked",
          goalLabel: "locked_goal",
          nextAction: "まず Stitch の「TOP - 三重非破壊検査（画像サンプル反映版）」画面の画像とコードを取得する。現UIとの差分を埋める。hosted URL は curl -L で取得する",
          holdReason: "",
          targetOutcome: "「TOP - 三重非破壊検査（画像サンプル反映版）」画面の構成と見た目が WEB UI で再現される",
          boundaries: [
            "指定された Stitch screen を基準にする",
            "完全再現から外れる独自アレンジを入れない",
            "指定されていない screen へ広げない",
          ],
          askNext: [],
          delightTitles: [],
        },
      },
    },
  });
  const stitchReplayGroups = requirementGroupsForUi(stitchReplaySnapshot);
  assert.strictEqual(
    stitchReplayGroups[0].summary,
    "Stitch の「Home - SURUGA-K」内の「TOP - 三重非破壊検査（画像サンプル反映版）」画面の画像とコードを取得し、WEB UI に忠実再現する",
    "Requirement Lock should foreground the actual Stitch replay objective instead of a generic UI refresh phrase"
  );
  assert.ok(
    stitchReplayGroups[0].rows.some((entry) => entry && entry.label === "進め方" && /画像とコードを取得/.test(entry.text)),
    "Stitch replay cards should tell the operator to fetch the hosted assets first"
  );
  assert.ok(
    stitchReplayGroups[0].rows.some((entry) => entry && entry.label === "守る線" && /Stitch screen/.test(entry.text)),
    "Stitch replay cards should keep the replay boundary visible"
  );
  assert.ok(
    stitchReplayGroups[0].rows.some((entry) => entry && entry.label === "確認対象" && /Home - SURUGA-K/.test(entry.text) && /TOP - 三重非破壊検査/.test(entry.text)),
    "Stitch replay cards should let the operator confirm the referenced project and screen from the UI"
  );
  assert.ok(
    !stitchReplayGroups[0].rows.some((entry) => entry && entry.label === "補足"),
    "locked Stitch replay cards should stay compact instead of surfacing generic success prose"
  );

  const fragmentaryGoalSnapshot = buildRequirementLockSnapshotForUi({
    planning: {
      requirementContract: {
        explicitGoal: "UIに最終表示するときは",
        implicitGoal: "",
        lockedGoal: "",
        openQuestions: ["What acceptance checks define success?"],
        acceptanceChecks: [],
        baselineScope: [],
        overDeliveryScope: [],
        nonGoals: ["契約ダッシュボードには戻さない"],
        assumptions: [],
        status: "BLOCKED",
        statusReason: "Open questions remain: 1.",
        validation: {
          verdict: "BLOCK",
          summary: { passCount: 1, warnCount: 0, blockCount: 1, total: 2 },
          checks: [{ status: "BLOCK", detail: "Acceptance checks are still too weak to judge completion safely." }],
        },
        intentInterpretation: {
          presentation: "progress_hypothesis",
          questionLike: true,
          direction: "UIの最終表示で何を伝えるかを先に定める",
          hypothesis: "最終表示で必要な情報と完成条件を先に固めたい",
        },
        userValueFrame: {
          valueThesis: "最終表示で伝わる価値を先に固める",
          userWants: [],
          userShouldFeelGet: [],
          mustAvoid: [],
          hardConstraints: [],
          qualityAxes: ["bounded_scope"],
          completedMeans: [],
        },
        displayContract: {
          headline: "UIに最終表示するときは",
          goal: "UIに最終表示するときは",
          goalMode: "locked",
          goalLabel: "locked_goal",
          nextAction: "Clarify: What acceptance checks define success?",
          holdReason: "Acceptance checks are still too weak to judge completion safely.",
          targetOutcome: "",
          boundaries: [],
          askNext: [{ question: "What acceptance checks define success?", category: "blocking", reason: "missing_acceptance" }],
          delightTitles: [],
        },
      },
    },
  });
  const fragmentaryGroups = requirementGroupsForUi(fragmentaryGoalSnapshot);
  assert.strictEqual(fragmentaryGoalSnapshot.displayGoalMode, "hypothesis", "blocked contracts should downgrade stale locked display modes");
  assert.strictEqual(fragmentaryGoalSnapshot.headline, "UIの最終表示で何を伝えるかを先に定める", "dangling goal clauses should yield to the interpreted direction");
  assert.strictEqual(fragmentaryGroups[0].summaryLabel, "いまの見立て", "blocked requirement cards should not present a locked summary label");
  assert.strictEqual(fragmentaryGroups[0].summary, "UIの最終表示で何を伝えるかを先に定める", "single-card requirement lock should foreground the interpreted direction instead of a clause fragment");
  assert.ok(
    fragmentaryGroups[0].rows.some((entry) => entry && entry.text && entry.text.includes("何を満たせば成功と言えるか？")),
    "acceptance-check questions should be localized inside the compact requirement card"
  );

  const approvalBoundaryFallbackSnapshot = buildRequirementLockSnapshotForUi({
    planning: {
      requirementContract: {
        explicitGoal: "clean up the requirement lock copy",
        implicitGoal: "",
        lockedGoal: "",
        openQuestions: [],
        approvalBoundaryItems: ["remove the legacy summary card"],
        acceptanceChecks: [],
        baselineScope: ["Requirement Lock panel"],
        overDeliveryScope: [],
        nonGoals: ["Do not widen execution scope"],
        assumptions: [],
        status: "BLOCKED",
        statusReason: "Approval is still required.",
        validation: {
          verdict: "BLOCK",
          summary: { passCount: 1, warnCount: 0, blockCount: 1, total: 2 },
          checks: [{ status: "BLOCK", detail: "Approval is still required." }],
        },
        userValueFrame: {
          valueThesis: "Keep the contract safe and explicit.",
          userWants: [],
          userShouldFeelGet: [],
          mustAvoid: [],
          hardConstraints: [],
          qualityAxes: ["clarity"],
          completedMeans: [],
        },
        displayContract: {
          headline: "working hypothesis",
          goal: "working hypothesis",
          goalMode: "hypothesis",
          goalLabel: "working_hypothesis",
          nextAction: "Clarify the approval boundary.",
          holdReason: "Approval is still required.",
          targetOutcome: "A safe locked contract.",
          boundaries: [],
          askNext: [],
          delightTitles: [],
        },
      },
    },
  });
  assert.ok(
    approvalBoundaryFallbackSnapshot.displayBoundaries.some((entry) => String(entry).includes("Boundary note: remove the legacy summary card")),
    "UI fallback boundaries should surface approval-boundary items even without displayContract boundaries"
  );

  const repairReviewSnapshot = buildRequirementLockSnapshotForUi({
    planning: {
      requirementContract: {
        explicitGoal: "最近要件まわりの修正について、良くなったかと修正内容を教えてほしい",
        implicitGoal: "",
        openQuestions: ["最近要件まわりの修正について、良くなったか"],
        acceptanceChecks: [],
        baselineScope: [],
        overDeliveryScope: [],
        nonGoals: [],
        assumptions: [],
        intentInterpretation: {
          presentation: "progress_hypothesis",
          questionLike: true,
          direction: "最近の修正が狙いどおり改善できたかを確認し、変更点を具体的に説明する",
          hypothesis: "表面の見た目だけでなく、意図が伝わる状態まで説明してほしい",
        },
        userValueFrame: {
          valueThesis: "依頼された変更を正しく、局所的に、あとからの手戻り圧を増やさない形で届ける",
          userWants: [],
          userShouldFeelGet: [],
          mustAvoid: [],
          hardConstraints: [],
          qualityAxes: ["bounded_scope"],
          completedMeans: [],
        },
      },
    },
  });
  assert.strictEqual(
    repairReviewSnapshot.intentDirection,
    "最近の修正が狙いどおり改善できたかを確認し、変更点を具体的に説明する",
    "question-style repair review prompts should be reframed as a user-intent direction instead of echoed literally"
  );
  assert.deepStrictEqual(
    repairReviewSnapshot.openQuestions,
    [],
    "question fragments already covered by the inferred direction should not remain in the unresolved bucket"
  );

  const literalVsInterpretationSnapshot = buildRequirementLockSnapshotForUi({
    planning: {
      requirementContract: {
        explicitGoal: "これは literal に読んでいるのか、解釈したうえで理解しているのかを知りたい",
        implicitGoal: "",
        openQuestions: ["これは literal に読んでいるのか、解釈したうえで理解しているのかを知りたい"],
        acceptanceChecks: [],
        baselineScope: [],
        overDeliveryScope: [],
        nonGoals: [],
        assumptions: [],
        intentInterpretation: {
          presentation: "progress_hypothesis",
          questionLike: true,
          direction: "表面の文言をそのまま読むのではなく、どう解釈して何を進めるかを見せる",
          hypothesis: "見た目よりも、内部の意図理解が正しいかを確かめたい",
        },
        userValueFrame: {
          valueThesis: "進め方が読みやすく、見た目だけではなく意図まで説明できること",
          userWants: ["これは literal に読んでいるのか、解釈したうえで理解しているのかを知りたい"],
          userShouldFeelGet: [],
          mustAvoid: [],
          hardConstraints: [],
          qualityAxes: ["bounded_scope"],
          completedMeans: [],
        },
      },
    },
  });
  assert.strictEqual(
    literalVsInterpretationSnapshot.goalGroupTitle,
    "進行仮説",
    "meta questions about literal intake should still surface a progress hypothesis when an interpreted direction exists"
  );
  assert.strictEqual(
    literalVsInterpretationSnapshot.intentDirection,
    "表面の文言をそのまま読むのではなく、どう解釈して何を進めるかを見せる",
    "literal-vs-interpretation questions should produce an interpreted direction instead of a generic reason label"
  );
  assert.strictEqual(
    literalVsInterpretationSnapshot.intentHypothesis,
    "見た目よりも、内部の意図理解が正しいかを確かめたい",
    "user-intent hypotheses should be AI-interpreted instead of echoing the raw question"
  );
  assert.deepStrictEqual(
    literalVsInterpretationSnapshot.openQuestions,
    [],
    "raw question restatements should not survive as unresolved items once the direction already covers them"
  );

  const noInterpretationSnapshot = buildRequirementLockSnapshotForUi({
    planning: {
      requirementContract: {
        explicitGoal: "これをもっと読みやすくする",
        implicitGoal: "",
        openQuestions: [],
        acceptanceChecks: [],
        baselineScope: [],
        overDeliveryScope: [],
        nonGoals: [],
        assumptions: [],
        intentInterpretation: {
          presentation: "goal",
          questionLike: true,
          direction: "",
          hypothesis: "",
        },
        userValueFrame: {
          valueThesis: "読みやすく整理する",
          userWants: ["これをもっと読みやすくする"],
          userShouldFeelGet: [],
          mustAvoid: [],
          hardConstraints: [],
          qualityAxes: ["bounded_scope"],
          completedMeans: [],
        },
      },
    },
  });
  assert.strictEqual(
    noInterpretationSnapshot.goalGroupTitle,
    "ゴール",
    "when the contract says no interpretation exists, UI should not fabricate a progress hypothesis"
  );
  assert.strictEqual(
    noInterpretationSnapshot.intentDirection,
    "",
    "when the contract says no interpretation exists, UI should not invent a derived direction"
  );
  assert.strictEqual(
    noInterpretationSnapshot.intentHypothesis,
    "",
    "when the contract says no interpretation exists, UI should not invent a derived hypothesis"
  );

  const missingInterpretationSnapshot = buildRequirementLockSnapshotForUi({
    planning: {
      requirementContract: {
        explicitGoal: "これをもっと読みやすくする",
        implicitGoal: "",
        openQuestions: [],
        acceptanceChecks: [],
        baselineScope: [],
        overDeliveryScope: [],
        nonGoals: [],
        assumptions: [],
        userValueFrame: {
          valueThesis: "読みやすく整理する",
          userWants: ["これをもっと読みやすくする"],
          userShouldFeelGet: [],
          mustAvoid: [],
          hardConstraints: [],
          qualityAxes: ["bounded_scope"],
          completedMeans: [],
        },
      },
    },
  });
  assert.strictEqual(
    missingInterpretationSnapshot.goalGroupTitle,
    "ゴール",
    "when intentInterpretation is missing, UI should stay on the normal goal presentation"
  );
  assert.strictEqual(
    missingInterpretationSnapshot.intentDirection,
    "",
    "when intentInterpretation is missing, UI should not fall back to a fabricated direction"
  );
  assert.strictEqual(
    missingInterpretationSnapshot.intentHypothesis,
    "",
    "when intentInterpretation is missing, UI should not fall back to a fabricated hypothesis"
  );

  const emptySnapshot = buildRequirementLockSnapshotForUi({
    planning: {
      requirementContract: {
        explicitGoal: "",
        implicitGoal: "",
        openQuestions: [],
        acceptanceChecks: [],
        baselineScope: [],
        overDeliveryScope: [],
        nonGoals: [],
        assumptions: [],
        userValueFrame: {
          valueThesis: "依頼された変更を正しく、局所的に、あとからの手戻り圧を増やさない形で届ける",
          userWants: [],
          userShouldFeelGet: [],
          mustAvoid: ["不要なスコープ拡大"],
          hardConstraints: [],
          qualityAxes: ["bounded_scope"],
          completedMeans: ["依頼された変更が分かりやすく伝わる"],
        },
      },
    },
  });
  assert.strictEqual(
    emptySnapshot.hasRequirement,
    false,
    "UI should not mark requirement lock as present when only the default user-value frame exists"
  );

  console.log("[harnesui-requirement-summary-test] PASS");
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[harnesui-requirement-summary-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
