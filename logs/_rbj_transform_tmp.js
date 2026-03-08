const hook = require("../scripts/extensions/requirement_guard_hook.js");
const basePrompt = process.argv[2] || "";
const inputBase = {
  prompt: basePrompt,
  sandboxMode: "workspace-write",
  options: {
    agentName: "intake",
    approvalPolicy: "never",
    cwd: process.cwd(),
  },
};
const before = hook.transformExecRequest({
  ...inputBase,
  env: {
    CODEX_REQUIREMENT_LOCK_ENABLED: "1",
    CODEX_SCOPE_EXPANSION_ENABLED: "1",
    CODEX_REQUIREMENT_RBJ_ENABLED: "0",
  },
});
const after = hook.transformExecRequest({
  ...inputBase,
  env: {
    CODEX_REQUIREMENT_LOCK_ENABLED: "1",
    CODEX_SCOPE_EXPANSION_ENABLED: "1",
    CODEX_REQUIREMENT_RBJ_ENABLED: "1",
    CODEX_REQUIREMENT_RBJ_MAX_QUESTIONS: "3",
    CODEX_REQUIREMENT_RBJ_MAX_REVISIONS: "2",
  },
});
console.log(JSON.stringify({ beforePrompt: before.prompt, afterPrompt: after.prompt }));
