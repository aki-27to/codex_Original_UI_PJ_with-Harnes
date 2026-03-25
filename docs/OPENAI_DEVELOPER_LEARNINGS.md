# OPENAI_DEVELOPER_LEARNINGS

Updated: 2026-03-25T11:25:33.023Z

This file is auto-synced from OpenAI Developers Blog.
It is not constitutional guidance and does not silently override `AGENTS.md` or frozen Step 1/2 behavior.

## How to use

- Treat these notes as retrieval-first working memory, not as automatic runtime policy.
- Source is locked to https://developers.openai.com/blog and the configured allowlist only.
- High-risk targets stay proposal-only until separately reviewed and validated.
- Requirement-Driven Foundation V1 remains frozen; external learnings cannot silently expand Step 1/2.
- Runtime retrieval may inject a small advisory block only for targeted runtime paths.

## Topic: agents

### From prompts to products: One year of Responses | OpenAI Developers

- Source: https://developers.openai.com/blog/one-year-of-responses
- Relevance: high
- Portability: portable
- Blog card date: Mar 11
- Summary: Five stories from developers building agentic products with the Responses API in its first year.
- Guidance:
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents. Equipping models with a set of hosted tools allowed AI to evolve from chat assistants to systems that can take action on your behalf. Today, the Responses API supports a number of tools to po
  - Agent behavior monitoring
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents.
  - Tracking behavior changes across agent versions

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Portability: portable
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repo-local skills in .agents/skills/
  - Repo-local skills, AGENTS.md , and GitHub Actions let us turn recurring engineering work, such as verification, release preparation, integration testing for examples, and PR review, into repeatable workflows.
  - In these repos, we use skills to capture repository-specific workflows. A skill is a small package of operational knowledge: a SKILL.md manifest, plus optional scripts/ , references/ , and assets/ . The Codex customization docs describe why this works well: skills are a good fit for repeatable workflows because they ca
  - repository policy in AGENTS.md

### Building frontend UIs with Codex and Figma | OpenAI Developers

- Source: https://developers.openai.com/blog/building-frontend-uis-with-codex-and-figma
- Relevance: high
- Portability: portable
- Blog card date: Feb 26
- Summary: Use Codex and Figma to bring real, running interfaces into Figma, refine them, and bring changes back to Codex.
- Guidance:
  - One of the core use cases of the Figma MCP server is retrieving context from Figma files and using that context in code generation. The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - These selection URLs are linked directly to a frame or node on the Figma canvas. They could be a single element or a collection of components, but essentially it’s the source data that an agent will use for code generation. Selections can come from Figma Design, Make, or FigJam files. Once you have the URL, open Codex
  - help me implement this Figma design in code, use my existing design system components as much as possible. Your browser does not support the video tag. Prompts like this will instruct the agent to call the get_design_context tool from the Figma MCP server. This tool helps extract critical design information from Figma

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Portability: portable
- Blog card date: Feb 23
- Summary: In September 2025, OpenAI introduced GPT-5-Codex as the first version of GPT-5 optimized for agentic coding. In December 2025, we launched 5.2 which was the moment that people began to believe that using autonomous coding agents could be reliable. In particular, we saw a huge jump in how long the model could reliably f
- Guidance:
  - I wanted to stress-test that threshold. So I gave Codex a blank repo, full access, and one job: build a design tool from scratch. Then I let it run with GPT-5.3-Codex at “Extra High” reasoning. Codex ran for about 25 hours uninterrupted, used about 13M tokens, and generated about 30k lines of code.
  - This was an experiment, not a production rollout. But it performed well on the parts that matter for long-horizon work: following the spec, staying on task, running verification, and repairing failures as it went.
  - These screenshots are useful because they make the core shift visible: agentic coding is increasingly about time horizon, not just one-shot intelligence.
  - Section focus: Takeaways for long-horizon Codex tasks

### Shell + Skills + Compaction: Tips for long-running agents that do real work | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-shell-tips
- Relevance: high
- Portability: portable
- Blog card date: Feb 11
- Summary: Practical patterns for building with skills, hosted shell, and server-side compaction in the Responses API.
- Guidance:
  - Skills (aligned with the Agent Skills open standard): reusable, versioned instructions you can mount into containers so that agents can execute tasks more reliably.
  - We’re shifting from single-turn assistants to long-running agents that handle real knowledge work: reading large datasets, updating files, and writing apps.
  - Based on developer feedback and our own experience building Codex and internal agents, we’re releasing a new set of agentic primitives that make long-horizon work more practical:
  - This post focuses on the nonobvious tips and patterns we’ve seen work best so far, both in our work at OpenAI and in production at Glean, an early skills customer.

## Topic: automation

### From prompts to products: One year of Responses | OpenAI Developers

- Source: https://developers.openai.com/blog/one-year-of-responses
- Relevance: high
- Portability: portable
- Blog card date: Mar 11
- Summary: Five stories from developers building agentic products with the Responses API in its first year.
- Guidance:
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents. Equipping models with a set of hosted tools allowed AI to evolve from chat assistants to systems that can take action on your behalf. Today, the Responses API supports a number of tools to po
  - Agent behavior monitoring
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents.
  - Tracking behavior changes across agent versions

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Portability: portable
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repo-local skills in .agents/skills/
  - Repo-local skills, AGENTS.md , and GitHub Actions let us turn recurring engineering work, such as verification, release preparation, integration testing for examples, and PR review, into repeatable workflows.
  - In these repos, we use skills to capture repository-specific workflows. A skill is a small package of operational knowledge: a SKILL.md manifest, plus optional scripts/ , references/ , and assets/ . The Codex customization docs describe why this works well: skills are a good fit for repeatable workflows because they ca
  - repository policy in AGENTS.md

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Portability: portable
- Blog card date: Feb 23
- Summary: In September 2025, OpenAI introduced GPT-5-Codex as the first version of GPT-5 optimized for agentic coding. In December 2025, we launched 5.2 which was the moment that people began to believe that using autonomous coding agents could be reliable. In particular, we saw a huge jump in how long the model could reliably f
- Guidance:
  - I wanted to stress-test that threshold. So I gave Codex a blank repo, full access, and one job: build a design tool from scratch. Then I let it run with GPT-5.3-Codex at “Extra High” reasoning. Codex ran for about 25 hours uninterrupted, used about 13M tokens, and generated about 30k lines of code.
  - This was an experiment, not a production rollout. But it performed well on the parts that matter for long-horizon work: following the spec, staying on task, running verification, and repairing failures as it went.
  - These screenshots are useful because they make the core shift visible: agentic coding is increasingly about time horizon, not just one-shot intelligence.
  - Section focus: Takeaways for long-horizon Codex tasks

## Topic: codex

### From prompts to products: One year of Responses | OpenAI Developers

- Source: https://developers.openai.com/blog/one-year-of-responses
- Relevance: high
- Portability: portable
- Blog card date: Mar 11
- Summary: Five stories from developers building agentic products with the Responses API in its first year.
- Guidance:
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents. Equipping models with a set of hosted tools allowed AI to evolve from chat assistants to systems that can take action on your behalf. Today, the Responses API supports a number of tools to po
  - Agent behavior monitoring
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents.
  - Tracking behavior changes across agent versions

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Portability: portable
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repo-local skills in .agents/skills/
  - Repo-local skills, AGENTS.md , and GitHub Actions let us turn recurring engineering work, such as verification, release preparation, integration testing for examples, and PR review, into repeatable workflows.
  - In these repos, we use skills to capture repository-specific workflows. A skill is a small package of operational knowledge: a SKILL.md manifest, plus optional scripts/ , references/ , and assets/ . The Codex customization docs describe why this works well: skills are a good fit for repeatable workflows because they ca
  - repository policy in AGENTS.md

### Building frontend UIs with Codex and Figma | OpenAI Developers

- Source: https://developers.openai.com/blog/building-frontend-uis-with-codex-and-figma
- Relevance: high
- Portability: portable
- Blog card date: Feb 26
- Summary: Use Codex and Figma to bring real, running interfaces into Figma, refine them, and bring changes back to Codex.
- Guidance:
  - One of the core use cases of the Figma MCP server is retrieving context from Figma files and using that context in code generation. The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - These selection URLs are linked directly to a frame or node on the Figma canvas. They could be a single element or a collection of components, but essentially it’s the source data that an agent will use for code generation. Selections can come from Figma Design, Make, or FigJam files. Once you have the URL, open Codex
  - help me implement this Figma design in code, use my existing design system components as much as possible. Your browser does not support the video tag. Prompts like this will instruct the agent to call the get_design_context tool from the Figma MCP server. This tool helps extract critical design information from Figma

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Portability: portable
- Blog card date: Feb 23
- Summary: In September 2025, OpenAI introduced GPT-5-Codex as the first version of GPT-5 optimized for agentic coding. In December 2025, we launched 5.2 which was the moment that people began to believe that using autonomous coding agents could be reliable. In particular, we saw a huge jump in how long the model could reliably f
- Guidance:
  - I wanted to stress-test that threshold. So I gave Codex a blank repo, full access, and one job: build a design tool from scratch. Then I let it run with GPT-5.3-Codex at “Extra High” reasoning. Codex ran for about 25 hours uninterrupted, used about 13M tokens, and generated about 30k lines of code.
  - This was an experiment, not a production rollout. But it performed well on the parts that matter for long-horizon work: following the spec, staying on task, running verification, and repairing failures as it went.
  - These screenshots are useful because they make the core shift visible: agentic coding is increasingly about time horizon, not just one-shot intelligence.
  - Section focus: Takeaways for long-horizon Codex tasks

### Shell + Skills + Compaction: Tips for long-running agents that do real work | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-shell-tips
- Relevance: high
- Portability: portable
- Blog card date: Feb 11
- Summary: Practical patterns for building with skills, hosted shell, and server-side compaction in the Responses API.
- Guidance:
  - Skills (aligned with the Agent Skills open standard): reusable, versioned instructions you can mount into containers so that agents can execute tasks more reliably.
  - We’re shifting from single-turn assistants to long-running agents that handle real knowledge work: reading large datasets, updating files, and writing apps.
  - Based on developer feedback and our own experience building Codex and internal agents, we’re releasing a new set of agentic primitives that make long-horizon work more practical:
  - This post focuses on the nonobvious tips and patterns we’ve seen work best so far, both in our work at OpenAI and in production at Glean, an early skills customer.

## Topic: context

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
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents. Equipping models with a set of hosted tools allowed AI to evolve from chat assistants to systems that can take action on your behalf. Today, the Responses API supports a number of tools to po
  - Agent behavior monitoring
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents.
  - Tracking behavior changes across agent versions

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Portability: portable
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repo-local skills in .agents/skills/
  - Repo-local skills, AGENTS.md , and GitHub Actions let us turn recurring engineering work, such as verification, release preparation, integration testing for examples, and PR review, into repeatable workflows.
  - In these repos, we use skills to capture repository-specific workflows. A skill is a small package of operational knowledge: a SKILL.md manifest, plus optional scripts/ , references/ , and assets/ . The Codex customization docs describe why this works well: skills are a good fit for repeatable workflows because they ca
  - repository policy in AGENTS.md

### Building frontend UIs with Codex and Figma | OpenAI Developers

- Source: https://developers.openai.com/blog/building-frontend-uis-with-codex-and-figma
- Relevance: high
- Portability: portable
- Blog card date: Feb 26
- Summary: Use Codex and Figma to bring real, running interfaces into Figma, refine them, and bring changes back to Codex.
- Guidance:
  - One of the core use cases of the Figma MCP server is retrieving context from Figma files and using that context in code generation. The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - These selection URLs are linked directly to a frame or node on the Figma canvas. They could be a single element or a collection of components, but essentially it’s the source data that an agent will use for code generation. Selections can come from Figma Design, Make, or FigJam files. Once you have the URL, open Codex
  - help me implement this Figma design in code, use my existing design system components as much as possible. Your browser does not support the video tag. Prompts like this will instruct the agent to call the get_design_context tool from the Figma MCP server. This tool helps extract critical design information from Figma

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Portability: portable
- Blog card date: Feb 23
- Summary: In September 2025, OpenAI introduced GPT-5-Codex as the first version of GPT-5 optimized for agentic coding. In December 2025, we launched 5.2 which was the moment that people began to believe that using autonomous coding agents could be reliable. In particular, we saw a huge jump in how long the model could reliably f
- Guidance:
  - I wanted to stress-test that threshold. So I gave Codex a blank repo, full access, and one job: build a design tool from scratch. Then I let it run with GPT-5.3-Codex at “Extra High” reasoning. Codex ran for about 25 hours uninterrupted, used about 13M tokens, and generated about 30k lines of code.
  - This was an experiment, not a production rollout. But it performed well on the parts that matter for long-horizon work: following the spec, staying on task, running verification, and repairing failures as it went.
  - These screenshots are useful because they make the core shift visible: agentic coding is increasingly about time horizon, not just one-shot intelligence.
  - Section focus: Takeaways for long-horizon Codex tasks

### Shell + Skills + Compaction: Tips for long-running agents that do real work | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-shell-tips
- Relevance: high
- Portability: portable
- Blog card date: Feb 11
- Summary: Practical patterns for building with skills, hosted shell, and server-side compaction in the Responses API.
- Guidance:
  - Skills (aligned with the Agent Skills open standard): reusable, versioned instructions you can mount into containers so that agents can execute tasks more reliably.
  - We’re shifting from single-turn assistants to long-running agents that handle real knowledge work: reading large datasets, updating files, and writing apps.
  - Based on developer feedback and our own experience building Codex and internal agents, we’re releasing a new set of agentic primitives that make long-horizon work more practical:
  - This post focuses on the nonobvious tips and patterns we’ve seen work best so far, both in our work at OpenAI and in production at Glean, an early skills customer.

## Topic: evals

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
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents. Equipping models with a set of hosted tools allowed AI to evolve from chat assistants to systems that can take action on your behalf. Today, the Responses API supports a number of tools to po
  - Agent behavior monitoring
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents.
  - Tracking behavior changes across agent versions

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Portability: portable
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repo-local skills in .agents/skills/
  - Repo-local skills, AGENTS.md , and GitHub Actions let us turn recurring engineering work, such as verification, release preparation, integration testing for examples, and PR review, into repeatable workflows.
  - In these repos, we use skills to capture repository-specific workflows. A skill is a small package of operational knowledge: a SKILL.md manifest, plus optional scripts/ , references/ , and assets/ . The Codex customization docs describe why this works well: skills are a good fit for repeatable workflows because they ca
  - repository policy in AGENTS.md

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Portability: portable
- Blog card date: Feb 23
- Summary: In September 2025, OpenAI introduced GPT-5-Codex as the first version of GPT-5 optimized for agentic coding. In December 2025, we launched 5.2 which was the moment that people began to believe that using autonomous coding agents could be reliable. In particular, we saw a huge jump in how long the model could reliably f
- Guidance:
  - I wanted to stress-test that threshold. So I gave Codex a blank repo, full access, and one job: build a design tool from scratch. Then I let it run with GPT-5.3-Codex at “Extra High” reasoning. Codex ran for about 25 hours uninterrupted, used about 13M tokens, and generated about 30k lines of code.
  - This was an experiment, not a production rollout. But it performed well on the parts that matter for long-horizon work: following the spec, staying on task, running verification, and repairing failures as it went.
  - These screenshots are useful because they make the core shift visible: agentic coding is increasingly about time horizon, not just one-shot intelligence.
  - Section focus: Takeaways for long-horizon Codex tasks

## Topic: frontend

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
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents. Equipping models with a set of hosted tools allowed AI to evolve from chat assistants to systems that can take action on your behalf. Today, the Responses API supports a number of tools to po
  - Agent behavior monitoring
  - One year ago, we introduced the Responses API — a foundation for developers and enterprises to build useful and reliable agents.
  - Tracking behavior changes across agent versions

### Using skills to accelerate OSS maintenance | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-agents-sdk
- Relevance: high
- Portability: portable
- Blog card date: Mar 9
- Summary: Using skills and GitHub Actions to optimize Codex workflows in the OpenAI Agents SDK repos.
- Guidance:
  - repo-local skills in .agents/skills/
  - Repo-local skills, AGENTS.md , and GitHub Actions let us turn recurring engineering work, such as verification, release preparation, integration testing for examples, and PR review, into repeatable workflows.
  - In these repos, we use skills to capture repository-specific workflows. A skill is a small package of operational knowledge: a SKILL.md manifest, plus optional scripts/ , references/ , and assets/ . The Codex customization docs describe why this works well: skills are a good fit for repeatable workflows because they ca
  - repository policy in AGENTS.md

### Building frontend UIs with Codex and Figma | OpenAI Developers

- Source: https://developers.openai.com/blog/building-frontend-uis-with-codex-and-figma
- Relevance: high
- Portability: portable
- Blog card date: Feb 26
- Summary: Use Codex and Figma to bring real, running interfaces into Figma, refine them, and bring changes back to Codex.
- Guidance:
  - One of the core use cases of the Figma MCP server is retrieving context from Figma files and using that context in code generation. The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - The Figma MCP server can capture information from Figma Design, Make, and FigJam files and pass it to Codex as part of the building process.
  - These selection URLs are linked directly to a frame or node on the Figma canvas. They could be a single element or a collection of components, but essentially it’s the source data that an agent will use for code generation. Selections can come from Figma Design, Make, or FigJam files. Once you have the URL, open Codex
  - help me implement this Figma design in code, use my existing design system components as much as possible. Your browser does not support the video tag. Prompts like this will instruct the agent to call the get_design_context tool from the Figma MCP server. This tool helps extract critical design information from Figma

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Portability: portable
- Blog card date: Feb 23
- Summary: In September 2025, OpenAI introduced GPT-5-Codex as the first version of GPT-5 optimized for agentic coding. In December 2025, we launched 5.2 which was the moment that people began to believe that using autonomous coding agents could be reliable. In particular, we saw a huge jump in how long the model could reliably f
- Guidance:
  - I wanted to stress-test that threshold. So I gave Codex a blank repo, full access, and one job: build a design tool from scratch. Then I let it run with GPT-5.3-Codex at “Extra High” reasoning. Codex ran for about 25 hours uninterrupted, used about 13M tokens, and generated about 30k lines of code.
  - This was an experiment, not a production rollout. But it performed well on the parts that matter for long-horizon work: following the spec, staying on task, running verification, and repairing failures as it went.
  - These screenshots are useful because they make the core shift visible: agentic coding is increasingly about time horizon, not just one-shot intelligence.
  - Section focus: Takeaways for long-horizon Codex tasks

### Shell + Skills + Compaction: Tips for long-running agents that do real work | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-shell-tips
- Relevance: high
- Portability: portable
- Blog card date: Feb 11
- Summary: Practical patterns for building with skills, hosted shell, and server-side compaction in the Responses API.
- Guidance:
  - Skills (aligned with the Agent Skills open standard): reusable, versioned instructions you can mount into containers so that agents can execute tasks more reliably.
  - We’re shifting from single-turn assistants to long-running agents that handle real knowledge work: reading large datasets, updating files, and writing apps.
  - Based on developer feedback and our own experience building Codex and internal agents, we’re releasing a new set of agentic primitives that make long-horizon work more practical:
  - This post focuses on the nonobvious tips and patterns we’ve seen work best so far, both in our work at OpenAI and in production at Glean, an early skills customer.

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
  - In these repos, we use skills to capture repository-specific workflows. A skill is a small package of operational knowledge: a SKILL.md manifest, plus optional scripts/ , references/ , and assets/ . The Codex customization docs describe why this works well: skills are a good fit for repeatable workflows because they ca
  - repository policy in AGENTS.md

### Run long horizon tasks with Codex | OpenAI Developers

- Source: https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Relevance: high
- Portability: portable
- Blog card date: Feb 23
- Summary: In September 2025, OpenAI introduced GPT-5-Codex as the first version of GPT-5 optimized for agentic coding. In December 2025, we launched 5.2 which was the moment that people began to believe that using autonomous coding agents could be reliable. In particular, we saw a huge jump in how long the model could reliably f
- Guidance:
  - I wanted to stress-test that threshold. So I gave Codex a blank repo, full access, and one job: build a design tool from scratch. Then I let it run with GPT-5.3-Codex at “Extra High” reasoning. Codex ran for about 25 hours uninterrupted, used about 13M tokens, and generated about 30k lines of code.
  - This was an experiment, not a production rollout. But it performed well on the parts that matter for long-horizon work: following the spec, staying on task, running verification, and repairing failures as it went.
  - These screenshots are useful because they make the core shift visible: agentic coding is increasingly about time horizon, not just one-shot intelligence.
  - Section focus: Takeaways for long-horizon Codex tasks

### Shell + Skills + Compaction: Tips for long-running agents that do real work | OpenAI Developers

- Source: https://developers.openai.com/blog/skills-shell-tips
- Relevance: high
- Portability: portable
- Blog card date: Feb 11
- Summary: Practical patterns for building with skills, hosted shell, and server-side compaction in the Responses API.
- Guidance:
  - Skills (aligned with the Agent Skills open standard): reusable, versioned instructions you can mount into containers so that agents can execute tasks more reliably.
  - We’re shifting from single-turn assistants to long-running agents that handle real knowledge work: reading large datasets, updating files, and writing apps.
  - Based on developer feedback and our own experience building Codex and internal agents, we’re releasing a new set of agentic primitives that make long-horizon work more practical:
  - This post focuses on the nonobvious tips and patterns we’ve seen work best so far, both in our work at OpenAI and in production at Glean, an early skills customer.

