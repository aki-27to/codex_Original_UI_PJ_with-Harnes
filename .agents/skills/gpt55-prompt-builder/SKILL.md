---
name: "gpt55-prompt-builder"
description: "Use when the user asks to create, rewrite, review, or harden prompts for GPT-5.5 based on OpenAI's GPT-5.5 prompt guidance."
---

# gpt55-prompt-builder

## Purpose

Create GPT-5.5 prompts as outcome-first execution contracts, not legacy process-heavy prompt stacks. The skill turns a user's desired behavior into a concise prompt package with goals, constraints, evidence, autonomy rules, validation, output shape, and stop conditions.

## Source Boundary

Primary source: `https://developers.openai.com/api/docs/guides/prompt-guidance?model=gpt-5.5`.

Use the official source when the user asks for current OpenAI guidance, cites the source, requests a production prompt, or asks to migrate an older prompt. If the page cannot be fetched in the current environment, state that source fetch was unavailable and separate source-derived principles from local assumptions.

Do not claim the prompt is officially optimal, model-guaranteed, or production-proven without eval evidence. Do not carry over GPT-5.4 or older model-specific guidance unless the user explicitly asks for compatibility notes.

## Procedure

1. Lock the prompt target: target model, product surface, user, task, tools, risk level, output format, and whether the result is a system, developer, user, or reusable template prompt.
2. Extract the task contract: desired outcome, success criteria, hard constraints, available context or evidence, required final answer contents, and stop conditions.
3. Apply GPT-5.5 prompt guidance:
   - prefer shorter, outcome-first prompts;
   - describe what good looks like, what constraints matter, what evidence is available, and what final output should contain;
   - avoid inheriting every instruction from an older prompt stack;
   - separate personality from collaboration style;
   - define proceed-versus-ask rules, instruction priority, tool persistence, validation, and output contracts when relevant;
   - keep preambles, phase handling, and assistant-item replay explicit for tool-heavy Responses workflows.
4. Choose the smallest adequate package: a single prompt, a system/developer/user split, a reusable template with variables, or a prompt plus eval checklist.
5. Remove prompt noise: delete duplicated rules, generic model advice, vague praise, broad `ALWAYS` or `NEVER` language, and process steps that unnecessarily constrain the model's solution path.
6. Add validation: include a checklist or 2-3 small test cases that would expose missing success criteria, over-asking, wrong output format, unsafe action, or unsupported citation behavior.
7. Report the source status, assumptions, and remaining risks before calling the prompt ready.

## Output Contract

Return:

- `prompt_package`: the final prompt text or layered prompt blocks.
- `target_contract`: model, surface, audience, task outcome, success criteria, constraints, tool assumptions, and risk level.
- `design_notes`: why the prompt uses GPT-5.5 outcome-first structure and which legacy instructions were omitted or softened.
- `source_status`: whether the official GPT-5.5 prompt guidance was fetched, cited, unavailable, or not needed.
- `validation_checklist`: checks for outcome clarity, constraints, evidence, autonomy, tool rules, output format, and stop conditions.
- `test_cases`: minimal examples or eval inputs when the prompt will be reused.
- `open_issues`: missing product context, unsupported claims, model/API ambiguity, or evaluation still needed.

## Evidence

Use available evidence in this order:

1. The user's requested prompt purpose and target surface.
2. Existing prompt text, product requirements, API surface, tool list, policy boundary, or eval failures.
3. OpenAI GPT-5.5 prompt guidance from the official source URL.
4. Test cases, eval results, transcript examples, or user acceptance feedback.

## Verification

Before marking a prompt package ready:

- confirm the prompt states the desired outcome before detailed process;
- confirm success criteria and final output requirements are visible;
- confirm constraints and permission boundaries are explicit;
- confirm question-asking rules do not block low-risk progress;
- confirm tool, citation, retrieval, and validation rules exist when correctness depends on them;
- confirm the prompt avoids unsupported claims about GPT-5.5 behavior;
- confirm reusable prompts include at least one failure-oriented test case or an explicit reason tests were not possible.

## Gotchas

- Shorter does not mean vague. Keep the prompt compact while preserving success criteria, evidence, and stop conditions.
- Personality controls how the assistant sounds; collaboration style controls how it works. Do not use either as a substitute for goals or validation.
- A prompt that passed once is not a durable pattern until it survives replay or adjacent test cases.
- If the user asks for a prompt for a non-GPT-5.5 model, preserve that target and do not silently retarget it to GPT-5.5.

## Failure Guard

Do not present a generated prompt as production-ready when the official source was not checked, the target model is ambiguous, the output contract is missing, or no validation path exists. Do not weaken safety, privacy, permission, citation, or tool-boundary rules in the name of shorter GPT-5.5 prompting.
