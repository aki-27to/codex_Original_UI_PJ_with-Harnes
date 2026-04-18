const fs = require("fs");
const path = require("path");

const date = "2026-04-18";
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "output", "ops");
const outputPath = path.join(outputDir, `parent_mode_switch_explainer_${date}.md`);

const lines = [
  "# Parent Agent Mode Switch Explainer",
  "",
  `- date: ${date}`,
  "- terminal_status: COMPLETED",
  "- scope: why the parent agent previously switched from discussion mode to execution mode",
  "",
  "## 1. Philosophical Question Layer",
  "The user's question was not only \"what is the ideal agent\" but also \"why does the current harness still not feel like a constitutional high-autonomy worker.\"",
  "That layer is explanatory: it asks for the source of the felt gap between governance and lived autonomy.",
  "",
  "## 2. Execution / Contract Layer",
  "The surrounding execution contract changed the request from pure explanation into an implementation task.",
  "The parent agent therefore had to treat the gap as something to lock into enforceable repo artifacts instead of leaving it as conversation-only analysis.",
  "That is why the agent switched from discussion mode to execution mode.",
  "",
  "## 3. Concrete Repo Actions Taken",
  "- Added a self-steering runtime contract surface so choice state and correction state were explicit.",
  "- Tightened adoption-readiness evaluation so latent intent required artifact-grounded evidence.",
  "- Tightened correction-learning so recurrence prevention had to exist before promotion claims.",
  "- Added and ran dedicated verification commands for the new contract surface.",
  "",
  "## Repo Evidence",
  "- scripts/config/self_steering_runtime_contract.json",
  "- scripts/config/adoption_readiness_evaluator_contract.json",
  "- scripts/config/correction_learning_contract.json",
  "- package.json",
  "- docs/CURRENT_ARCHITECTURE.md",
  "- docs/ARCHITECTURE_CHANGELOG.md",
  "",
  "## Grounded Summary",
  `On ${date}, the parent agent did not merely answer the philosophical question in prose.`,
  "It converted the perceived autonomy gap into contract, verification, and synchronization work inside the repository.",
  "That is why the behavior looked like \"sudden construction\" instead of \"continued explanation.\"",
  "",
  "COMPLETED",
  ""
];

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, lines.join("\n"), "utf8");

process.stdout.write(`${outputPath}\n`);
