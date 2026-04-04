# AGI Readiness

- Run: eval-1775264897008-443e2a6a
- Raw final score: 0.860278
- Display final score: 0.860278
- Catastrophic risk (CVaR): 0.04
- Promotion comparison mode: self_snapshot
- Promote: n/a
- Repo-wide coverage breadth: 0.333333
- Evaluated breadth: 1
- Weakest capability family: G_breadth
- Weakest hard gate: I_eval

## Domain Coverage
- deterministic_code: score=0.920 floor=0.70 status=pass
- web_creative: score=0.000 floor=0.70 status=fail
- planning: score=0.880 floor=0.70 status=pass
- workflow_execution: score=0.000 floor=0.70 status=fail
- evaluation_review: score=0.000 floor=0.70 status=fail
- tool_use_browser_like: score=0.000 floor=0.70 status=fail

## Blocked Reasons
- breadth coverage incomplete across supported families: web_creative, workflow_execution, evaluation_review, tool_use_browser_like

## Next Bottlenecks
- scope/coverage bottleneck: breadth coverage incomplete across supported families: web_creative, workflow_execution, evaluation_review, tool_use_browser_like
- capability bottleneck: weakest family is G_breadth
- governance bottleneck: hard gate pressure at I_eval
