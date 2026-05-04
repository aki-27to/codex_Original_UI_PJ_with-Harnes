# OPENAI_DEVELOPER_LEARNINGS

Updated: 2026-05-04T12:17:15.908Z

This file is auto-synced from OpenAI Developers Blog.
It is not constitutional guidance and does not silently override `AGENTS.md` or frozen Step 1/2 behavior.

## How to use

- Treat these notes as retrieval-first working memory, not as automatic runtime policy.
- Source is locked to https://developers.openai.com/blog and the configured allowlist only.
- High-risk targets stay proposal-only until separately reviewed and validated.
- Requirement-Driven Foundation V1 remains frozen; external learnings cannot silently expand Step 1/2.
- Runtime retrieval may inject a small advisory block only for targeted runtime paths.

## Topic: agents

### How Perplexity Brought Voice Search to Millions Using the Realtime API | OpenAI Developers

- Source: https://developers.openai.com/blog/realtime-perplexity-computer
- Relevance: high
- Portability: portable
- Blog card date: Mar 25
- Summary: Lessons from how Perplexity Computer's voice agent was built with the Realtime API.
- Guidance:
  - For Perplexity Comet , our agentic browser, and Perplexity Computer , our powerful, general-purpose digital worker, a big part of that was making these fully usable through voice.
  - Long-form content, especially dense multi-hour podcasts, was one of our clearest tests of context management.
  - One other subtle thing we learned was that not all context should enter the model in the same way.
  - One of our internal test cases was a noisy San Francisco bar because that felt like a real product moment.

### From prompts to products: One year of Responses | OpenAI Developers

- Source: https://developers.openai.com/blog/one-year-of-responses
- Relevance: high
- Portability: portable
- Blog card date: Mar 11
- Summary: Five stories from developers building agentic products with the Responses API in its first year.
- Guidance:
  - Agent behavior monitoring
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents.
  - Tracking behavior changes across agent versions
  - Raindrop is the monitoring platform behind the world’s most ambitious AI companies to catch when their agents go off the rails in production.

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Portability: portable
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repo-local skills in .agents/skills/
  - Repo-local skills, AGENTS.md , and GitHub Actions let us turn recurring engineering work, such as verification, release preparation, integration testing for examples, and PR review, into repeatable workflows.
  - repository policy in AGENTS.md
  - In these repos, we use skills to capture repository-specific workflows.

### Building frontend UIs with Codex and Figma | OpenAI Developers

- Source: https://developers.openai.com/blog/building-frontend-uis-with-codex-and-figma
- Relevance: high
- Portability: portable
- Blog card date: Feb 26
- Summary: Use Codex and Figma to bring real, running interfaces into Figma, refine them, and bring changes back to Codex.
- Guidance:
  - One of the core use cases of the Figma MCP server is retrieving context from Figma files and using that context in code generation. The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - The Codex desktop application is purpose-built for agentic coding.
  - Decide to either create a new Figma file or use an existing one.

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Portability: portable
- Blog card date: Feb 23
- Summary: This was an experiment, not a production rollout. But it performed well on the parts that matter for long-horizon work: following the spec, staying on task, running verification, and repairing failures as it went.
- Guidance:
  - These screenshots are useful because they make the core shift visible: agentic coding is increasingly about time horizon, not just one-shot intelligence.
  - Section focus: Takeaways for long-horizon Codex tasks
  - Section focus: Why Codex can stay coherent on long tasks
  - This is not only “models got smarter.” The practical change is that agents can stay coherent for longer, complete larger chunks of work end-to-end, and recover from errors without losing the thread.

## Topic: automation

### From prompts to products: One year of Responses | OpenAI Developers

- Source: https://developers.openai.com/blog/one-year-of-responses
- Relevance: high
- Portability: portable
- Blog card date: Mar 11
- Summary: Five stories from developers building agentic products with the Responses API in its first year.
- Guidance:
  - Agent behavior monitoring
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents.
  - Tracking behavior changes across agent versions
  - Raindrop is the monitoring platform behind the world’s most ambitious AI companies to catch when their agents go off the rails in production.

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Portability: portable
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repo-local skills in .agents/skills/
  - Repo-local skills, AGENTS.md , and GitHub Actions let us turn recurring engineering work, such as verification, release preparation, integration testing for examples, and PR review, into repeatable workflows.
  - repository policy in AGENTS.md
  - In these repos, we use skills to capture repository-specific workflows.

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Portability: portable
- Blog card date: Feb 23
- Summary: This was an experiment, not a production rollout. But it performed well on the parts that matter for long-horizon work: following the spec, staying on task, running verification, and repairing failures as it went.
- Guidance:
  - These screenshots are useful because they make the core shift visible: agentic coding is increasingly about time horizon, not just one-shot intelligence.
  - Section focus: Takeaways for long-horizon Codex tasks
  - Section focus: Why Codex can stay coherent on long tasks
  - This is not only “models got smarter.” The practical change is that agents can stay coherent for longer, complete larger chunks of work end-to-end, and recover from errors without losing the thread.

## Topic: codex

### From prompts to products: One year of Responses | OpenAI Developers

- Source: https://developers.openai.com/blog/one-year-of-responses
- Relevance: high
- Portability: portable
- Blog card date: Mar 11
- Summary: Five stories from developers building agentic products with the Responses API in its first year.
- Guidance:
  - Agent behavior monitoring
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents.
  - Tracking behavior changes across agent versions
  - Raindrop is the monitoring platform behind the world’s most ambitious AI companies to catch when their agents go off the rails in production.

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Portability: portable
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repo-local skills in .agents/skills/
  - Repo-local skills, AGENTS.md , and GitHub Actions let us turn recurring engineering work, such as verification, release preparation, integration testing for examples, and PR review, into repeatable workflows.
  - repository policy in AGENTS.md
  - In these repos, we use skills to capture repository-specific workflows.

### Building frontend UIs with Codex and Figma | OpenAI Developers

- Source: https://developers.openai.com/blog/building-frontend-uis-with-codex-and-figma
- Relevance: high
- Portability: portable
- Blog card date: Feb 26
- Summary: Use Codex and Figma to bring real, running interfaces into Figma, refine them, and bring changes back to Codex.
- Guidance:
  - One of the core use cases of the Figma MCP server is retrieving context from Figma files and using that context in code generation. The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - The Codex desktop application is purpose-built for agentic coding.
  - Decide to either create a new Figma file or use an existing one.

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Portability: portable
- Blog card date: Feb 23
- Summary: This was an experiment, not a production rollout. But it performed well on the parts that matter for long-horizon work: following the spec, staying on task, running verification, and repairing failures as it went.
- Guidance:
  - These screenshots are useful because they make the core shift visible: agentic coding is increasingly about time horizon, not just one-shot intelligence.
  - Section focus: Takeaways for long-horizon Codex tasks
  - Section focus: Why Codex can stay coherent on long tasks
  - This is not only “models got smarter.” The practical change is that agents can stay coherent for longer, complete larger chunks of work end-to-end, and recover from errors without losing the thread.

## Topic: context

### How Perplexity Brought Voice Search to Millions Using the Realtime API | OpenAI Developers

- Source: https://developers.openai.com/blog/realtime-perplexity-computer
- Relevance: high
- Portability: portable
- Blog card date: Mar 25
- Summary: Lessons from how Perplexity Computer's voice agent was built with the Realtime API.
- Guidance:
  - For Perplexity Comet , our agentic browser, and Perplexity Computer , our powerful, general-purpose digital worker, a big part of that was making these fully usable through voice.
  - Long-form content, especially dense multi-hour podcasts, was one of our clearest tests of context management.
  - One other subtle thing we learned was that not all context should enter the model in the same way.
  - One of our internal test cases was a noisy San Francisco bar because that felt like a real product moment.

### Designing delightful frontends with GPT-5.4 | OpenAI Developers

- Source: https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4
- Relevance: high
- Portability: portable
- Blog card date: Mar 20
- Summary: Practical techniques for steering GPT-5.4 toward polished, production-ready frontend designs.
- Guidance:
  - better use of tools to inspect, test, and verify its own work
  - stronger image understanding throughout the design process
  - GPT-5.4 has learned this wide spectrum of design approaches and understands many different ways a website can be built.
  - Define your design system and constraints upfront (i.e., typography, color palette, layout).

### From prompts to products: One year of Responses | OpenAI Developers

- Source: https://developers.openai.com/blog/one-year-of-responses
- Relevance: high
- Portability: portable
- Blog card date: Mar 11
- Summary: Five stories from developers building agentic products with the Responses API in its first year.
- Guidance:
  - Agent behavior monitoring
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents.
  - Tracking behavior changes across agent versions
  - Raindrop is the monitoring platform behind the world’s most ambitious AI companies to catch when their agents go off the rails in production.

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Portability: portable
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repo-local skills in .agents/skills/
  - Repo-local skills, AGENTS.md , and GitHub Actions let us turn recurring engineering work, such as verification, release preparation, integration testing for examples, and PR review, into repeatable workflows.
  - repository policy in AGENTS.md
  - In these repos, we use skills to capture repository-specific workflows.

### Building frontend UIs with Codex and Figma | OpenAI Developers

- Source: https://developers.openai.com/blog/building-frontend-uis-with-codex-and-figma
- Relevance: high
- Portability: portable
- Blog card date: Feb 26
- Summary: Use Codex and Figma to bring real, running interfaces into Figma, refine them, and bring changes back to Codex.
- Guidance:
  - One of the core use cases of the Figma MCP server is retrieving context from Figma files and using that context in code generation. The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - The Codex desktop application is purpose-built for agentic coding.
  - Decide to either create a new Figma file or use an existing one.

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Portability: portable
- Blog card date: Feb 23
- Summary: This was an experiment, not a production rollout. But it performed well on the parts that matter for long-horizon work: following the spec, staying on task, running verification, and repairing failures as it went.
- Guidance:
  - These screenshots are useful because they make the core shift visible: agentic coding is increasingly about time horizon, not just one-shot intelligence.
  - Section focus: Takeaways for long-horizon Codex tasks
  - Section focus: Why Codex can stay coherent on long tasks
  - This is not only “models got smarter.” The practical change is that agents can stay coherent for longer, complete larger chunks of work end-to-end, and recover from errors without losing the thread.

## Topic: evals

### How Perplexity Brought Voice Search to Millions Using the Realtime API | OpenAI Developers

- Source: https://developers.openai.com/blog/realtime-perplexity-computer
- Relevance: high
- Portability: portable
- Blog card date: Mar 25
- Summary: Lessons from how Perplexity Computer's voice agent was built with the Realtime API.
- Guidance:
  - For Perplexity Comet , our agentic browser, and Perplexity Computer , our powerful, general-purpose digital worker, a big part of that was making these fully usable through voice.
  - Long-form content, especially dense multi-hour podcasts, was one of our clearest tests of context management.
  - One other subtle thing we learned was that not all context should enter the model in the same way.
  - One of our internal test cases was a noisy San Francisco bar because that felt like a real product moment.

### Designing delightful frontends with GPT-5.4 | OpenAI Developers

- Source: https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4
- Relevance: high
- Portability: portable
- Blog card date: Mar 20
- Summary: Practical techniques for steering GPT-5.4 toward polished, production-ready frontend designs.
- Guidance:
  - better use of tools to inspect, test, and verify its own work
  - stronger image understanding throughout the design process
  - GPT-5.4 has learned this wide spectrum of design approaches and understands many different ways a website can be built.
  - Define your design system and constraints upfront (i.e., typography, color palette, layout).

### From prompts to products: One year of Responses | OpenAI Developers

- Source: https://developers.openai.com/blog/one-year-of-responses
- Relevance: high
- Portability: portable
- Blog card date: Mar 11
- Summary: Five stories from developers building agentic products with the Responses API in its first year.
- Guidance:
  - Agent behavior monitoring
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents.
  - Tracking behavior changes across agent versions
  - Raindrop is the monitoring platform behind the world’s most ambitious AI companies to catch when their agents go off the rails in production.

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Portability: portable
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repo-local skills in .agents/skills/
  - Repo-local skills, AGENTS.md , and GitHub Actions let us turn recurring engineering work, such as verification, release preparation, integration testing for examples, and PR review, into repeatable workflows.
  - repository policy in AGENTS.md
  - In these repos, we use skills to capture repository-specific workflows.

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Portability: portable
- Blog card date: Feb 23
- Summary: This was an experiment, not a production rollout. But it performed well on the parts that matter for long-horizon work: following the spec, staying on task, running verification, and repairing failures as it went.
- Guidance:
  - These screenshots are useful because they make the core shift visible: agentic coding is increasingly about time horizon, not just one-shot intelligence.
  - Section focus: Takeaways for long-horizon Codex tasks
  - Section focus: Why Codex can stay coherent on long tasks
  - This is not only “models got smarter.” The practical change is that agents can stay coherent for longer, complete larger chunks of work end-to-end, and recover from errors without losing the thread.

## Topic: frontend

### How Perplexity Brought Voice Search to Millions Using the Realtime API | OpenAI Developers

- Source: https://developers.openai.com/blog/realtime-perplexity-computer
- Relevance: high
- Portability: portable
- Blog card date: Mar 25
- Summary: Lessons from how Perplexity Computer's voice agent was built with the Realtime API.
- Guidance:
  - For Perplexity Comet , our agentic browser, and Perplexity Computer , our powerful, general-purpose digital worker, a big part of that was making these fully usable through voice.
  - Long-form content, especially dense multi-hour podcasts, was one of our clearest tests of context management.
  - One other subtle thing we learned was that not all context should enter the model in the same way.
  - One of our internal test cases was a noisy San Francisco bar because that felt like a real product moment.

### Designing delightful frontends with GPT-5.4 | OpenAI Developers

- Source: https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4
- Relevance: high
- Portability: portable
- Blog card date: Mar 20
- Summary: Practical techniques for steering GPT-5.4 toward polished, production-ready frontend designs.
- Guidance:
  - better use of tools to inspect, test, and verify its own work
  - stronger image understanding throughout the design process
  - GPT-5.4 has learned this wide spectrum of design approaches and understands many different ways a website can be built.
  - Define your design system and constraints upfront (i.e., typography, color palette, layout).

### From prompts to products: One year of Responses | OpenAI Developers

- Source: https://developers.openai.com/blog/one-year-of-responses
- Relevance: high
- Portability: portable
- Blog card date: Mar 11
- Summary: Five stories from developers building agentic products with the Responses API in its first year.
- Guidance:
  - Agent behavior monitoring
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents.
  - Tracking behavior changes across agent versions
  - Raindrop is the monitoring platform behind the world’s most ambitious AI companies to catch when their agents go off the rails in production.

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Portability: portable
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repo-local skills in .agents/skills/
  - Repo-local skills, AGENTS.md , and GitHub Actions let us turn recurring engineering work, such as verification, release preparation, integration testing for examples, and PR review, into repeatable workflows.
  - repository policy in AGENTS.md
  - In these repos, we use skills to capture repository-specific workflows.

### Building frontend UIs with Codex and Figma | OpenAI Developers

- Source: https://developers.openai.com/blog/building-frontend-uis-with-codex-and-figma
- Relevance: high
- Portability: portable
- Blog card date: Feb 26
- Summary: Use Codex and Figma to bring real, running interfaces into Figma, refine them, and bring changes back to Codex.
- Guidance:
  - One of the core use cases of the Figma MCP server is retrieving context from Figma files and using that context in code generation. The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - The Codex desktop application is purpose-built for agentic coding.
  - Decide to either create a new Figma file or use an existing one.

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Portability: portable
- Blog card date: Feb 23
- Summary: This was an experiment, not a production rollout. But it performed well on the parts that matter for long-horizon work: following the spec, staying on task, running verification, and repairing failures as it went.
- Guidance:
  - These screenshots are useful because they make the core shift visible: agentic coding is increasingly about time horizon, not just one-shot intelligence.
  - Section focus: Takeaways for long-horizon Codex tasks
  - Section focus: Why Codex can stay coherent on long tasks
  - This is not only “models got smarter.” The practical change is that agents can stay coherent for longer, complete larger chunks of work end-to-end, and recover from errors without losing the thread.

## Topic: safety

### Designing delightful frontends with GPT-5.4 | OpenAI Developers

- Source: https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4
- Relevance: high
- Portability: portable
- Blog card date: Mar 20
- Summary: Practical techniques for steering GPT-5.4 toward polished, production-ready frontend designs.
- Guidance:
  - better use of tools to inspect, test, and verify its own work
  - stronger image understanding throughout the design process
  - GPT-5.4 has learned this wide spectrum of design approaches and understands many different ways a website can be built.
  - Define your design system and constraints upfront (i.e., typography, color palette, layout).

## Topic: skills

### Designing delightful frontends with GPT-5.4 | OpenAI Developers

- Source: https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4
- Relevance: high
- Portability: portable
- Blog card date: Mar 20
- Summary: Practical techniques for steering GPT-5.4 toward polished, production-ready frontend designs.
- Guidance:
  - better use of tools to inspect, test, and verify its own work
  - stronger image understanding throughout the design process
  - GPT-5.4 has learned this wide spectrum of design approaches and understands many different ways a website can be built.
  - Define your design system and constraints upfront (i.e., typography, color palette, layout).

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Portability: portable
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repo-local skills in .agents/skills/
  - Repo-local skills, AGENTS.md , and GitHub Actions let us turn recurring engineering work, such as verification, release preparation, integration testing for examples, and PR review, into repeatable workflows.
  - repository policy in AGENTS.md
  - In these repos, we use skills to capture repository-specific workflows.

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Portability: portable
- Blog card date: Feb 23
- Summary: This was an experiment, not a production rollout. But it performed well on the parts that matter for long-horizon work: following the spec, staying on task, running verification, and repairing failures as it went.
- Guidance:
  - These screenshots are useful because they make the core shift visible: agentic coding is increasingly about time horizon, not just one-shot intelligence.
  - Section focus: Takeaways for long-horizon Codex tasks
  - Section focus: Why Codex can stay coherent on long tasks
  - This is not only “models got smarter.” The practical change is that agents can stay coherent for longer, complete larger chunks of work end-to-end, and recover from errors without losing the thread.

