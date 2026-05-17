# Proof / Closeout Output Contract

Use this shape when a closeout result needs to be durable or reviewable.

```json
{
  "task_state": {
    "status": "COMPLETED | PARTIAL | FAILED_VALIDATION | BLOCKED | NEEDS_INPUT",
    "reason": "short evidence-backed reason"
  },
  "changed_surface": [
    {
      "path_or_surface": "file, module, API, UI flow, config, doc, log, or artifact",
      "ownership": "task_owned | unrelated | unknown",
      "verification_needed": "short description"
    }
  ],
  "verification_status": [
    {
      "check": "command or artifact inspected",
      "result": "pass | fail | blocked | not_run",
      "evidence": "output, path, screenshot, report, or reason",
      "risk": "residual risk if any"
    }
  ],
  "open_issues": [
    "missing check, failed check, blocker, assumption, or adoption risk"
  ],
  "next_session_brief": {
    "needed": true,
    "next_action": "exact next action when work remains",
    "verification_path": "how to prove completion next time"
  }
}
```
