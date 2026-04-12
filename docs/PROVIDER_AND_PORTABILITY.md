# Provider And Portability

Authority role: `navigation / portability summary only`  
Authority registry: `authority-registry.v1`

This page exists to stop overclaiming.

## Current Truth

Today, the repo is first-class in this posture:

- local-first
- Codex App Server centered
- governed execution through `POST /api/exec`
- governed evaluation and release through `POST /api/eval/run`

That is the real product center.

## What "Portable" Means Here

`portable_local` in this repo means:

- deployment posture is not hard-coded to one owner-only setup
- the governed runtime can be used in a more general local/reviewed-team posture
- stronger owner-local defaults are not treated as universal truth

It does **not** mean:

- every model provider is first-class already
- every endpoint family is interchangeable
- the repo is already a generic provider marketplace

## Honest Portability Claim

Good claim:

- posture-portable local governed harness
- deployment-portable within the repo's authority and review model

Bad claim:

- fully provider-agnostic agent runtime
- same breadth of provider integration as broad runtime products

## What Exists Around The Core

Adjacent surfaces do exist:

- companion app platform
- externalization and repo-closure exports
- provider/deployment evidence packets in the closure flow

But those do not add up to a broad runtime provider matrix on their own.

## What Would Need To Exist To Claim Broad Provider Portability

To honestly compete on a Hermes-style provider axis, the repo would need visible first-class support for:

- provider configuration surface
- provider-specific runtime adapters
- provider capability matrix
- provider-specific quick starts
- parity claims backed by tests or proof bundles

Until then, the repo should not market itself as the broadest portable runtime.

## How To Talk About It Today

Use wording like:

- Codex-first today
- local-first and governance-first
- posture-portable, not provider-maximal
- built for adoptability before provider breadth

## Best Companion Links

- product front door: `../README.md`
- capability surface: `CAPABILITY_SURFACE.md`
- product positioning: `PRODUCT_POSITIONING.md`
- active architecture: `CURRENT_ARCHITECTURE.md`
