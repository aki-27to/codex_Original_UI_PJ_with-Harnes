# Release Candidate Scope

Generated: 2026-04-18T00:00:00Z
Candidate id: `rc-2026-04-18-core-harness-governed-apps`
Status: `ready_for_ship_decision`

This artifact narrows the current dirty worktree into a release candidate that can be judged with matching evidence.

## In Scope

- Core harness runtime and UI:
  `package.json`, `server.js`, `server_impl.js`, `server/**`, `web/01.HarnesUI/**`, `scripts/run_repo_quality_gate.js`, relevant `scripts/lib/**`, `scripts/config/**`, and verification scripts tied to route/service split, app-server bridge, current surface, and repo-quality ownership.
- Governance doc-sync and public current-truth artifacts:
  `docs/**`, `output/governance_public/**`, `output/continuity_public/**`, `output/memory_public/**`, `output/agi_readiness/**`, `protected/**`.
- Governed app and integration surfaces already wired into runtime or verification:
  `APP/03.ai-debate-chat` source files, `APP/04.godot/01.TTL` source project files, `docs/integrations/godot/**`, `tools/godot-mcp-server/**`, `tools/godot-runtime/**`.

## Out Of Scope

- Local app capture noise:
  `APP/03.ai-debate-chat/.playwright-cli/**`, `APP/03.ai-debate-chat/*-run.png`, `APP/03.ai-debate-chat/ui-*.png`, `APP/03.ai-debate-chat/write_probe.txt`.
- Per-project Godot cache and duplicate binaries:
  `APP/04.godot/**/.godot/**`, `APP/04.godot/**/Godot_v*.exe`.
- Raw temp and log noise:
  `.tmp/**`, `output/*.err.log`, `output/*.out.log`, `output/tmp-review/**`, `tmp_agent_topography_*.log`.

## Verification Plan

1. `node scripts/run_repo_quality_gate.js governance`
2. `node scripts/run_repo_quality_gate.js runtime`
3. `node scripts/run_repo_quality_gate.js surfaces`
4. `npm run regression:public`

## Verification Result

- Passed: `governance`, `runtime`, `surfaces`
- Passed: `npm run regression:public`
- Passed: `node scripts/current_surface_truth_test.js`
- Fresh signoff bundle: `signoff-2026-04-18T05-27-13-996Z-f97810`
- Current latest signoff decision: `RELEASE_APPROVED`
- Public governance export refreshed after the new signoff bundle

## Ship Rule

Do not answer "ship the whole repo diff" for the mixed worktree.
Answer only "ship this bounded candidate" after the same candidate passes the listed gates and current-truth artifacts are regenerated against that candidate.
