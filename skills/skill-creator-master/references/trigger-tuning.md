# Trigger Tuning Guide

Use this guide when a skill is over-triggering or under-triggering.

## Diagnose

1. Collect user prompts that should trigger but did not.
2. Collect user prompts that triggered but should not have.
3. Label each case by domain, action verb, and file/tool context.

## Rewrite Strategy

Rewrite `description` using this formula:

`<capability sentence>. Use when <explicit contexts and user intents>.`

## Patterns That Improve Precision

1. Add action verbs:
   - create, update, validate, migrate, audit, optimize
2. Add object context:
   - `SKILL.md`, `agents/openai.yaml`, `scripts/`, `references/`
3. Add operational context:
   - new skill creation, existing skill refactor, trigger diagnostics
4. Add exclusion hints when confusion is common:
   - "for Codex skills only"

## Anti-Patterns

1. Generic claims like "helps with coding tasks".
2. Missing "when to use" phrase.
3. Overly broad domain scope.
4. Long narrative descriptions with weak keywords.

## Quick A/B Loop

1. Propose one description revision.
2. Replay known positive/negative examples mentally.
3. Keep the revision only if both precision and recall improve.
