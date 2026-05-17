# Skill Governance Output Contract

Use this shape when a skill-governance result needs to be durable or reviewable.

```json
{
  "skill_decision": {
    "status": "ADOPTABLE | REVISE_MINOR | REVISE_MAJOR | DRAFT_ONLY | ROLLBACK_CANDIDATE | ARCHIVED | BLOCKED",
    "reason": "short evidence-backed reason"
  },
  "skill_surface": {
    "id": "skill id",
    "path": "skill path",
    "scope": "repo-local | plugin | user-global | system | external"
  },
  "evidence": [
    {
      "surface": "file, command, log, artifact, review, or user feedback",
      "result": "pass | fail | blocked | not_checked",
      "note": "short finding"
    }
  ],
  "lifecycle": {
    "state": "draft | cataloged | used | evidence_observed | effective | neutral | harmful | promote | keep | rollback | archive",
    "promotion_condition": "condition required before stronger adoption",
    "rollback_condition": "condition requiring demotion or archive"
  },
  "open_issues": [
    "missing evidence, overlap, trigger risk, or unresolved adoption risk"
  ]
}
```
