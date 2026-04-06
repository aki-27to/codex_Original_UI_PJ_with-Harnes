import { createDefaultSettings } from '../src/shared/defaultSettings.js';
import { runEvalLoops } from '../src/evals/runners/runEvalSuite.js';

const settings = createDefaultSettings();
const reports = await runEvalLoops(settings);

for (const report of reports) {
  console.log(`[eval] ${report.loops.join(', ')} pairwise=${report.pairwiseWinRate}% interestingnessLift=${report.improvements.interestingnessLiftPct}% aiSmellDrop=${report.improvements.aiSmellDropPct}% groundednessDelta=${report.improvements.groundednessDelta}`);
}
