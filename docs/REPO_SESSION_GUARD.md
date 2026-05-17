# Repository Session Guard

Purpose: keep each Codex work session from inheriting unrelated dirty state.

## Commands

- `npm run repo:start-clean`
  - Run before starting a new material task when the repo is dirty.
  - Stages known non-private dirty paths, commits them, and pushes the current upstream branch.
  - Quarantines untracked private/local artifacts in `.git/info/exclude` instead of committing them.
  - Fails closed on tracked private/local artifacts or unknown dirty paths unless explicitly overridden.

- `npm run repo:start-clean:dry-run`
  - Shows the autonomous close-before-start plan without modifying files, commits, or remotes.

- `npm run repo:preflight`
  - Run before starting a new code/docs/config task.
  - Fails when the working tree is not clean.
  - Classifies dirty paths as `intended_change_candidate`, `generated_or_runtime`, `private_or_local_artifact`, or `unknown_dirty`.

- `npm run repo:closeout`
  - Run before final reporting for a code/docs/config task.
  - Fails when dirty files remain, when local commits are ahead of upstream, or when upstream sync cannot be proven.

Use `-- --json --allow-dirty` for diagnostic readout without failing the shell:

```powershell
npm run repo:start-clean:dry-run
npm run repo:start-clean:json
npm run repo:preflight:diagnose
npm run repo:closeout:diagnose
npm run repo:preflight:json
npm run repo:closeout:json
```

## Policy

- A new task should start by running `repo:start-clean` when dirty, then `repo:preflight status=CLEAN`.
- A finished task should reach `repo:closeout status=CLEAN_READY`.
- Generated and runtime artifacts may be committed by `repo:start-clean` when they are part of the visible dirty state; use housekeeping first when they are transient noise.
- Private or machine-local untracked files are quarantined into `.git/info/exclude`, not shared `.gitignore`, unless the exclusion is repo-generic.
- Tracked private/local files and unknown dirty paths block autonomous close by default.
- If a task intentionally leaves WIP, record it as WIP branch/commit or report the closeout state as not clean.

## Non-Goals

- `repo:preflight` and `repo:closeout` do not delete, reset, stash, commit, or push.
- `repo:start-clean` commits and pushes, but still does not delete, reset, or stash.
- These scripts do not replace task-specific tests.
- These scripts do not decide whether a dirty source file is correct; they force it to be closed or isolated before the next task.
