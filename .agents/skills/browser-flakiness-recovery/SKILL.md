---
name: "browser-flakiness-recovery"
description: "Recover from browser, Playwright, DevTools, or MCP UI-tool flakiness. Use when browser evidence fails, is flaky, or cannot be collected and Codex must retry, fall back, or truthfully defer."
---

# browser-flakiness-recovery

## Purpose

Avoid turning browser-tool failure into either false completion or needless user diagnosis.

Treat browser evidence as an evaluator input, not as a generator claim. Playwright, DevTools, MCP, screenshot, HTTP, and source-inspection results are untrusted until their command, artifact, or error output is inspected against the fixed verification need for the current task.

## Procedure

1. Classify the failure as tool startup, browser install, page load, selector drift, permission/sandbox, or visual-review mismatch.
2. Retry only when the failure is likely transient and retry cost is bounded.
3. Fall back to source inspection, HTTP/header checks, or existing screenshot evidence when appropriate.
4. If evidence remains missing, report blocked or failed validation with exact command/error context.
5. Keep the generator/evaluator boundary explicit: a fallback can reduce uncertainty, but it does not become visual acceptance unless the required browser or screenshot evidence was actually obtained.

## Output Contract

Return a concise result with:

- `outcome`: the decision, artifact, or behavior change this skill produced.
- `evidence`: files, commands, logs, or artifacts checked.
- `open_issues`: missing checks, residual risks, or follow-up work.

## Evidence

- Playwright MCP diagnostics
- command output and error class
- fallback source/HTTP inspection
- skipped evidence reason

## Failure Guard

Do not claim visual or browser verification passed when the browser path was skipped or blocked.
