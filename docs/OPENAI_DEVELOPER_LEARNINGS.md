# OPENAI_DEVELOPER_LEARNINGS

Updated: 2026-03-23T12:24:56.934Z

This file is auto-synced from the official OpenAI Developers blog learning lane.
It is not constitutional guidance and does not silently override `AGENTS.md` or frozen Step 1/2 behavior.

## How to use

- Treat these notes as retrieval-first working memory, not as automatic runtime policy.
- Source is locked to https://developers.openai.com/blog and official hosts only.
- High-risk targets stay proposal-only until separately reviewed and validated.
- Requirement-Driven Foundation V1 remains frozen; external learnings cannot silently expand Step 1/2.

## Topic: agents

### From prompts to products: One year of Responses | OpenAI Developers

- Source: https://developers.openai.com/blog/one-year-of-responses
- Relevance: high
- Blog card date: Mar 11
- Summary: Five stories from developers building agentic products with the Responses API in its first year.
- Guidance:
  - Agent behavior monitoring
  - Failure detection and alerting
  - Developer investigation and debugging tools
  - Tracking behavior changes across agent versions

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repository policy in AGENTS.md
  - repo-local skills in .agents/skills/
  - optional scripts and references inside those skills
  - Codex GitHub Action when the same workflow should run in CI

### Building frontend UIs with Codex and Figma | OpenAI Developers

- Source: https://developers.openai.com/blog/building-frontend-uis-with-codex-and-figma
- Relevance: high
- Blog card date: Feb 26
- Summary: Use Codex and Figma to bring real, running interfaces into Figma, refine them, and bring changes back to Codex.
- Guidance:
  - Decide to either create a new Figma file or use an existing one.
  - Determine which workspace to place the file in.
  - Set up the application for UI capture.
  - Open a new browser session of your application.

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Blog card date: Feb 23
- Summary: OpenAI Developer Blog
- Guidance:
  - It’s better at multi-step execution (plan → implement → validate → repair).
  - It’s easier to steer mid-flight without resetting the whole run (course corrections don’t wipe progress).
  - Plan
  - Edit code

### Shell + Skills + Compaction: Tips for long-running agents that do real work | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-shell-tips
- Relevance: high
- Blog card date: Feb 11
- Summary: Practical patterns for building with skills, hosted shell, and server-side compaction in the Responses API.
- Guidance:
  - Skills (aligned with the Agent Skills open standard): reusable, versioned instructions you can mount into containers so that agents can execute tasks more reliably.
  - Upgraded shell tool: an OpenAI hosted container with controlled internet access, where an agent can install dependencies, run scripts, and write outputs (for example, reports and artifacts).
  - Server-side compaction : an easy way to automatically compact long agentic runs so that you never hit context limits.
  - Hosted containers managed by OpenAI.

## Topic: automation

### From prompts to products: One year of Responses | OpenAI Developers

- Source: https://developers.openai.com/blog/one-year-of-responses
- Relevance: high
- Blog card date: Mar 11
- Summary: Five stories from developers building agentic products with the Responses API in its first year.
- Guidance:
  - Agent behavior monitoring
  - Failure detection and alerting
  - Developer investigation and debugging tools
  - Tracking behavior changes across agent versions

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repository policy in AGENTS.md
  - repo-local skills in .agents/skills/
  - optional scripts and references inside those skills
  - Codex GitHub Action when the same workflow should run in CI

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Blog card date: Feb 23
- Summary: OpenAI Developer Blog
- Guidance:
  - It’s better at multi-step execution (plan → implement → validate → repair).
  - It’s easier to steer mid-flight without resetting the whole run (course corrections don’t wipe progress).
  - Plan
  - Edit code

## Topic: codex

### From prompts to products: One year of Responses | OpenAI Developers

- Source: https://developers.openai.com/blog/one-year-of-responses
- Relevance: high
- Blog card date: Mar 11
- Summary: Five stories from developers building agentic products with the Responses API in its first year.
- Guidance:
  - Agent behavior monitoring
  - Failure detection and alerting
  - Developer investigation and debugging tools
  - Tracking behavior changes across agent versions

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repository policy in AGENTS.md
  - repo-local skills in .agents/skills/
  - optional scripts and references inside those skills
  - Codex GitHub Action when the same workflow should run in CI

### Building frontend UIs with Codex and Figma | OpenAI Developers

- Source: https://developers.openai.com/blog/building-frontend-uis-with-codex-and-figma
- Relevance: high
- Blog card date: Feb 26
- Summary: Use Codex and Figma to bring real, running interfaces into Figma, refine them, and bring changes back to Codex.
- Guidance:
  - Decide to either create a new Figma file or use an existing one.
  - Determine which workspace to place the file in.
  - Set up the application for UI capture.
  - Open a new browser session of your application.

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Blog card date: Feb 23
- Summary: OpenAI Developer Blog
- Guidance:
  - It’s better at multi-step execution (plan → implement → validate → repair).
  - It’s easier to steer mid-flight without resetting the whole run (course corrections don’t wipe progress).
  - Plan
  - Edit code

### Shell + Skills + Compaction: Tips for long-running agents that do real work | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-shell-tips
- Relevance: high
- Blog card date: Feb 11
- Summary: Practical patterns for building with skills, hosted shell, and server-side compaction in the Responses API.
- Guidance:
  - Skills (aligned with the Agent Skills open standard): reusable, versioned instructions you can mount into containers so that agents can execute tasks more reliably.
  - Upgraded shell tool: an OpenAI hosted container with controlled internet access, where an agent can install dependencies, run scripts, and write outputs (for example, reports and artifacts).
  - Server-side compaction : an easy way to automatically compact long agentic runs so that you never hit context limits.
  - Hosted containers managed by OpenAI.

## Topic: context

### Designing delightful frontends with GPT-5.4 | OpenAI Developers

- Source: https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4
- Relevance: high
- Blog card date: Mar 20
- Summary: Practical techniques for steering GPT-5.4 toward polished, production-ready frontend designs.
- Guidance:
  - stronger image understanding throughout the design process
  - more functionally complete apps and websites
  - better use of tools to inspect, test, and verify its own work
  - Select low reasoning level to begin with.

### From prompts to products: One year of Responses | OpenAI Developers

- Source: https://developers.openai.com/blog/one-year-of-responses
- Relevance: high
- Blog card date: Mar 11
- Summary: Five stories from developers building agentic products with the Responses API in its first year.
- Guidance:
  - Agent behavior monitoring
  - Failure detection and alerting
  - Developer investigation and debugging tools
  - Tracking behavior changes across agent versions

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repository policy in AGENTS.md
  - repo-local skills in .agents/skills/
  - optional scripts and references inside those skills
  - Codex GitHub Action when the same workflow should run in CI

### Building frontend UIs with Codex and Figma | OpenAI Developers

- Source: https://developers.openai.com/blog/building-frontend-uis-with-codex-and-figma
- Relevance: high
- Blog card date: Feb 26
- Summary: Use Codex and Figma to bring real, running interfaces into Figma, refine them, and bring changes back to Codex.
- Guidance:
  - Decide to either create a new Figma file or use an existing one.
  - Determine which workspace to place the file in.
  - Set up the application for UI capture.
  - Open a new browser session of your application.

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Blog card date: Feb 23
- Summary: OpenAI Developer Blog
- Guidance:
  - It’s better at multi-step execution (plan → implement → validate → repair).
  - It’s easier to steer mid-flight without resetting the whole run (course corrections don’t wipe progress).
  - Plan
  - Edit code

### Shell + Skills + Compaction: Tips for long-running agents that do real work | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-shell-tips
- Relevance: high
- Blog card date: Feb 11
- Summary: Practical patterns for building with skills, hosted shell, and server-side compaction in the Responses API.
- Guidance:
  - Skills (aligned with the Agent Skills open standard): reusable, versioned instructions you can mount into containers so that agents can execute tasks more reliably.
  - Upgraded shell tool: an OpenAI hosted container with controlled internet access, where an agent can install dependencies, run scripts, and write outputs (for example, reports and artifacts).
  - Server-side compaction : an easy way to automatically compact long agentic runs so that you never hit context limits.
  - Hosted containers managed by OpenAI.

## Topic: evals

### Designing delightful frontends with GPT-5.4 | OpenAI Developers

- Source: https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4
- Relevance: high
- Blog card date: Mar 20
- Summary: Practical techniques for steering GPT-5.4 toward polished, production-ready frontend designs.
- Guidance:
  - stronger image understanding throughout the design process
  - more functionally complete apps and websites
  - better use of tools to inspect, test, and verify its own work
  - Select low reasoning level to begin with.

### From prompts to products: One year of Responses | OpenAI Developers

- Source: https://developers.openai.com/blog/one-year-of-responses
- Relevance: high
- Blog card date: Mar 11
- Summary: Five stories from developers building agentic products with the Responses API in its first year.
- Guidance:
  - Agent behavior monitoring
  - Failure detection and alerting
  - Developer investigation and debugging tools
  - Tracking behavior changes across agent versions

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repository policy in AGENTS.md
  - repo-local skills in .agents/skills/
  - optional scripts and references inside those skills
  - Codex GitHub Action when the same workflow should run in CI

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Blog card date: Feb 23
- Summary: OpenAI Developer Blog
- Guidance:
  - It’s better at multi-step execution (plan → implement → validate → repair).
  - It’s easier to steer mid-flight without resetting the whole run (course corrections don’t wipe progress).
  - Plan
  - Edit code

## Topic: frontend

### Designing delightful frontends with GPT-5.4 | OpenAI Developers

- Source: https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4
- Relevance: high
- Blog card date: Mar 20
- Summary: Practical techniques for steering GPT-5.4 toward polished, production-ready frontend designs.
- Guidance:
  - stronger image understanding throughout the design process
  - more functionally complete apps and websites
  - better use of tools to inspect, test, and verify its own work
  - Select low reasoning level to begin with.

### From prompts to products: One year of Responses | OpenAI Developers

- Source: https://developers.openai.com/blog/one-year-of-responses
- Relevance: high
- Blog card date: Mar 11
- Summary: Five stories from developers building agentic products with the Responses API in its first year.
- Guidance:
  - Agent behavior monitoring
  - Failure detection and alerting
  - Developer investigation and debugging tools
  - Tracking behavior changes across agent versions

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repository policy in AGENTS.md
  - repo-local skills in .agents/skills/
  - optional scripts and references inside those skills
  - Codex GitHub Action when the same workflow should run in CI

### Building frontend UIs with Codex and Figma | OpenAI Developers

- Source: https://developers.openai.com/blog/building-frontend-uis-with-codex-and-figma
- Relevance: high
- Blog card date: Feb 26
- Summary: Use Codex and Figma to bring real, running interfaces into Figma, refine them, and bring changes back to Codex.
- Guidance:
  - Decide to either create a new Figma file or use an existing one.
  - Determine which workspace to place the file in.
  - Set up the application for UI capture.
  - Open a new browser session of your application.

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Blog card date: Feb 23
- Summary: OpenAI Developer Blog
- Guidance:
  - It’s better at multi-step execution (plan → implement → validate → repair).
  - It’s easier to steer mid-flight without resetting the whole run (course corrections don’t wipe progress).
  - Plan
  - Edit code

### Shell + Skills + Compaction: Tips for long-running agents that do real work | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-shell-tips
- Relevance: high
- Blog card date: Feb 11
- Summary: Practical patterns for building with skills, hosted shell, and server-side compaction in the Responses API.
- Guidance:
  - Skills (aligned with the Agent Skills open standard): reusable, versioned instructions you can mount into containers so that agents can execute tasks more reliably.
  - Upgraded shell tool: an OpenAI hosted container with controlled internet access, where an agent can install dependencies, run scripts, and write outputs (for example, reports and artifacts).
  - Server-side compaction : an easy way to automatically compact long agentic runs so that you never hit context limits.
  - Hosted containers managed by OpenAI.

## Topic: safety

### Designing delightful frontends with GPT-5.4 | OpenAI Developers

- Source: https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4
- Relevance: high
- Blog card date: Mar 20
- Summary: Practical techniques for steering GPT-5.4 toward polished, production-ready frontend designs.
- Guidance:
  - stronger image understanding throughout the design process
  - more functionally complete apps and websites
  - better use of tools to inspect, test, and verify its own work
  - Select low reasoning level to begin with.

## Topic: skills

### Designing delightful frontends with GPT-5.4 | OpenAI Developers

- Source: https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4
- Relevance: high
- Blog card date: Mar 20
- Summary: Practical techniques for steering GPT-5.4 toward polished, production-ready frontend designs.
- Guidance:
  - stronger image understanding throughout the design process
  - more functionally complete apps and websites
  - better use of tools to inspect, test, and verify its own work
  - Select low reasoning level to begin with.

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repository policy in AGENTS.md
  - repo-local skills in .agents/skills/
  - optional scripts and references inside those skills
  - Codex GitHub Action when the same workflow should run in CI

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Blog card date: Feb 23
- Summary: OpenAI Developer Blog
- Guidance:
  - It’s better at multi-step execution (plan → implement → validate → repair).
  - It’s easier to steer mid-flight without resetting the whole run (course corrections don’t wipe progress).
  - Plan
  - Edit code

### Shell + Skills + Compaction: Tips for long-running agents that do real work | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-shell-tips
- Relevance: high
- Blog card date: Feb 11
- Summary: Practical patterns for building with skills, hosted shell, and server-side compaction in the Responses API.
- Guidance:
  - Skills (aligned with the Agent Skills open standard): reusable, versioned instructions you can mount into containers so that agents can execute tasks more reliably.
  - Upgraded shell tool: an OpenAI hosted container with controlled internet access, where an agent can install dependencies, run scripts, and write outputs (for example, reports and artifacts).
  - Server-side compaction : an easy way to automatically compact long agentic runs so that you never hit context limits.
  - Hosted containers managed by OpenAI.

