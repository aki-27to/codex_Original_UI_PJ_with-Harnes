import { runBaselineEngine } from '../../conversation/baselineEngine.js';
import { runImprovedEngine } from '../../conversation/replyEngine.js';
import { failuresPath, evalReportsDir } from '../../shared/paths.js';
import {
  ChatMessage,
  ChatSettings,
  EvalCaseResult,
  EvalReport,
  FailureRecord,
  RuntimeProvider,
} from '../../shared/types.js';
import { createId, nowIso, toPct, average } from '../../shared/utils.js';
import { writeJsonFile } from '../../storage/fileStore.js';
import { buildEvalDataset } from '../datasets/buildDataset.js';
import { gradeReplyText } from '../scorers/heuristicScorers.js';
import path from 'node:path';

export async function runEvalLoops(baseSettings: ChatSettings): Promise<EvalReport[]> {
  const loops = [
    { name: 'loop-1-baseline-tuning', settings: { ...baseSettings, sliders: { ...baseSettings.sliders, brevity: 45, sharpness: 45, weirdness: 30 } } },
    { name: 'loop-2-anti-ai-tuning', settings: { ...baseSettings, sliders: { ...baseSettings.sliders, brevity: 68, sharpness: 58, weirdness: 40 } } },
    { name: 'loop-3-final-tuning', settings: { ...baseSettings, sliders: { ...baseSettings.sliders, brevity: 74, sharpness: 64, weirdness: 52 } } },
  ];

  const reports: EvalReport[] = [];
  for (const loop of loops) {
    reports.push(await runSingleEvalLoop(loop.name, loop.settings));
  }
  return reports;
}

export async function runSingleEvalLoop(loopName: string, settings: ChatSettings): Promise<EvalReport> {
  const dataset = buildEvalDataset();
  const results: EvalCaseResult[] = [];
  const failures: FailureRecord[] = [];

  for (const testCase of dataset) {
    const messages: ChatMessage[] = testCase.turns.map((turn, index) => ({
      id: `${testCase.id}_${index}`,
      role: turn.role,
      content: turn.content,
      createdAt: nowIso(),
    }));

    const baseline = await runBaselineEngine({
      messages,
      settings: { ...settings, engineVariant: 'baseline' },
      provider: '' as RuntimeProvider,
      model: settings.runtimeModel,
      useRuntime: false,
    });

    const improved = await runImprovedEngine({
      messages,
      settings: { ...settings, engineVariant: 'improved' },
      provider: '' as RuntimeProvider,
      model: settings.runtimeModel,
      useRuntime: false,
    });

    const baselineScore = gradeReplyText(
      baseline.text,
      baseline.debug.analysis,
      settings,
      messages,
      0,
    );
    const improvedScore = gradeReplyText(
      improved.text,
      improved.debug.analysis,
      settings,
      messages,
      improved.debug.moves.length,
    );

    const winner = improvedScore.total > baselineScore.total + 0.02
      ? 'improved'
      : baselineScore.total > improvedScore.total + 0.02
        ? 'baseline'
        : 'tie';

    const notes: string[] = [];
    if (winner !== 'improved') {
      failures.push({
        id: createId('failure'),
        category: testCase.category,
        user: messages.filter((message) => message.role === 'user').map((message) => message.content).join(' | '),
        reply: improved.text,
        failureTags: winner === 'baseline' ? ['lost_pairwise'] : ['tie'],
        why: `${loopName}: baseline=${baselineScore.total.toFixed(3)} improved=${improvedScore.total.toFixed(3)}`,
        createdAt: nowIso(),
      });
      notes.push('improved did not clearly win');
    }

    results.push({
      caseId: testCase.id,
      category: testCase.category,
      baseline: baselineScore,
      improved: improvedScore,
      winner,
      notes,
    });
  }

  await writeJsonFile(failuresPath, failures);

  const pairwiseWins = results.filter((result) => result.winner === 'improved').length;
  const baselineScores = results.map((result) => result.baseline);
  const improvedScores = results.map((result) => result.improved);

  const report: EvalReport = {
    id: createId('report'),
    createdAt: nowIso(),
    datasetName: 'core-180',
    totalCases: results.length,
    pairwiseWinRate: toPct(pairwiseWins / results.length),
    baselineAverage: averageScores(baselineScores),
    improvedAverage: averageScores(improvedScores),
    improvements: {
      aiSmellDropPct: lift(averageOf(baselineScores, 'nonAiSmell'), averageOf(improvedScores, 'nonAiSmell')),
      interestingnessLiftPct: lift(averageOf(baselineScores, 'interestingness'), averageOf(improvedScores, 'interestingness')),
      groundednessDelta: Number((averageOf(improvedScores, 'groundedness') - averageOf(baselineScores, 'groundedness')).toFixed(3)),
      repetitionDropPct: lift(1 - averageOf(baselineScores, 'repetitionPenalty'), 1 - averageOf(improvedScores, 'repetitionPenalty')),
    },
    loops: [loopName],
    failureIds: failures.slice(0, 40).map((failure) => failure.id),
    results,
  };

  await writeJsonFile(path.join(evalReportsDir, `${loopName}.json`), report);
  return report;
}

function averageScores(scores: EvalCaseResult['baseline'][]): Record<string, number> {
  return {
    interestingness: averageOf(scores, 'interestingness'),
    humanNaturalness: averageOf(scores, 'humanNaturalness'),
    conversationality: averageOf(scores, 'conversationality'),
    stance: averageOf(scores, 'stance'),
    sharpness: averageOf(scores, 'sharpness'),
    compression: averageOf(scores, 'compression'),
    empathyFit: averageOf(scores, 'empathyFit'),
    groundedness: averageOf(scores, 'groundedness'),
    nonAiSmell: averageOf(scores, 'nonAiSmell'),
    repetitionPenalty: averageOf(scores, 'repetitionPenalty'),
    nextTurnPotential: averageOf(scores, 'nextTurnPotential'),
    total: averageOf(scores, 'total'),
  };
}

function averageOf(
  scores: EvalCaseResult['baseline'][],
  key: keyof EvalCaseResult['baseline'],
): number {
  return Number(average(scores.map((score) => score[key] as number)).toFixed(3));
}

function lift(before: number, after: number): number {
  if (before === 0) {
    return 0;
  }
  return Number((((after - before) / before) * 100).toFixed(2));
}
