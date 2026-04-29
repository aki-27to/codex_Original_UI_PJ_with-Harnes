# ANTHROPIC_ENGINEERING_LEARNINGS

Updated: 2026-04-29T19:58:33.575Z

This file is auto-synced from the Anthropic Engineering secondary learning lane.
Only portable agent-engineering principles are retained here; Claude-specific mechanics do not become runtime policy.

## How to use

- Treat these notes as retrieval-first working memory, not as automatic runtime policy.
- Source is locked to https://www.anthropic.com/engineering and the configured allowlist only.
- High-risk targets stay proposal-only until separately reviewed and validated.
- Requirement-Driven Foundation V1 remains frozen; external learnings cannot silently expand Step 1/2.
- Runtime retrieval is disabled for this lane unless separately enabled and validated.

## Topic: agents

### Scaling Managed Agents: Decoupling the brain from the hands

- Source: https://www.anthropic.com/engineering/managed-agents
- Relevance: high
- Portability: mixed
- Blog card date: Apr 08, 2026
- Summary: Harnesses encode assumptions that go stale as models improve. Managed Agents—our hosted service for long-horizon agent work—is built around interfaces that stay stable as harnesses change.
- Guidance:
  - Building Managed Agents meant solving an old problem in computing: how to design a system for “ programs as yet unthought of .” Decades ago, operating systems solved this problem by virtualizing hardware into abstractions— process, file —general enough for programs that didn't exist yet.
  - Managed Agents follow the same pattern.
  - A running topic on the Engineering Blog is how to build effective agents and design harnesses for long-running work .

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Harness design is key to performance at the frontier of agentic coding. Here's how we pushed Claude further in frontend design and long-running autonomous software engineering.
- Guidance:
  - We've previously shown that harness design has a substantial impact on the effectiveness of long running agentic coding.
  - Two insights shaped the harness I built for frontend design.
  - Design quality: Does the design feel like a coherent whole rather than a collection of parts? Strong work here means the colors, typography, layout, imagery, and other details combine to create a distinct mood and identity.
  - For more complex tasks, the agent still tends to go off the rails over time.

### Quantifying infrastructure noise in agentic coding evals

- Source: https://www.anthropic.com/engineering/infrastructure-noise
- Relevance: high
- Portability: portable
- Blog card date: Feb 05, 2026
- Summary: Infrastructure configuration can swing agentic coding benchmarks by several percentage points—sometimes more than the leaderboard gap between top models.
- Guidance:
  - Agentic coding evals are different: models are given a full environment where they write programs, run tests, install dependencies, and iterate over multiple turns.
  - Agentic coding benchmarks like SWE-bench and Terminal-Bench are commonly used to compare the software engineering capabilities of frontier models—with top spots on leaderboards often separated by just a few percentage points.
  - Eval developers have begun accounting for this.
  - Terminal-Bench 2.0, for instance, specifies recommended CPU and RAM on a per-task basis in their latest 2.0 release.

### Building Effective AI Agents

- Source: https://www.anthropic.com/engineering/building-effective-agents
- Relevance: high
- Portability: portable
- Blog card date: pinned
- Summary: We've worked with dozens of teams building LLM agents across industries. Consistently, the most successful implementations use simple, composable patterns rather than complex frameworks.
- Guidance:
  - In this post, we share what we’ve learned from working with our customers and building agents ourselves, and give practical advice for developers on building effective agents.
  - Agents , on the other hand, are systems where LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks.
  - Strands Agents SDK by AWS ;
  - Over the past year, we've worked with dozens of teams building large language model (LLM) agents across industries.

### Code execution with MCP: building more efficient AI agents

- Source: https://www.anthropic.com/engineering/code-execution-with-mcp
- Relevance: high
- Portability: portable
- Blog card date: pinned
- Summary: Direct tool calls consume context for each definition and result. Agents scale better by writing code to call tools instead. Here's how it works with MCP.
- Guidance:
  - In this blog we'll explore how code execution can enable agents to interact with MCP servers more efficiently, handling more tools while using fewer tokens.
  - Connecting agents to tools and data traditionally requires a custom integration for each pairing, creating fragmentation and duplicated effort that makes it difficult to scale truly connected systems.
  - The Model Context Protocol (MCP) is an open standard for connecting AI agents to external systems.
  - Tool definitions overload the context window;

## Topic: codex

### Building Effective AI Agents

- Source: https://www.anthropic.com/engineering/building-effective-agents
- Relevance: high
- Portability: portable
- Blog card date: pinned
- Summary: We've worked with dozens of teams building LLM agents across industries. Consistently, the most successful implementations use simple, composable patterns rather than complex frameworks.
- Guidance:
  - In this post, we share what we’ve learned from working with our customers and building agents ourselves, and give practical advice for developers on building effective agents.
  - Agents , on the other hand, are systems where LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks.
  - Strands Agents SDK by AWS ;
  - Over the past year, we've worked with dozens of teams building large language model (LLM) agents across industries.

## Topic: context

### Scaling Managed Agents: Decoupling the brain from the hands

- Source: https://www.anthropic.com/engineering/managed-agents
- Relevance: high
- Portability: mixed
- Blog card date: Apr 08, 2026
- Summary: Harnesses encode assumptions that go stale as models improve. Managed Agents—our hosted service for long-horizon agent work—is built around interfaces that stay stable as harnesses change.
- Guidance:
  - Building Managed Agents meant solving an old problem in computing: how to design a system for “ programs as yet unthought of .” Decades ago, operating systems solved this problem by virtualizing hardware into abstractions— process, file —general enough for programs that didn't exist yet.
  - Managed Agents follow the same pattern.
  - A running topic on the Engineering Blog is how to build effective agents and design harnesses for long-running work .

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Harness design is key to performance at the frontier of agentic coding. Here's how we pushed Claude further in frontend design and long-running autonomous software engineering.
- Guidance:
  - We've previously shown that harness design has a substantial impact on the effectiveness of long running agentic coding.
  - Two insights shaped the harness I built for frontend design.
  - Design quality: Does the design feel like a coherent whole rather than a collection of parts? Strong work here means the colors, typography, layout, imagery, and other details combine to create a distinct mood and identity.
  - For more complex tasks, the agent still tends to go off the rails over time.

### Building Effective AI Agents

- Source: https://www.anthropic.com/engineering/building-effective-agents
- Relevance: high
- Portability: portable
- Blog card date: pinned
- Summary: We've worked with dozens of teams building LLM agents across industries. Consistently, the most successful implementations use simple, composable patterns rather than complex frameworks.
- Guidance:
  - In this post, we share what we’ve learned from working with our customers and building agents ourselves, and give practical advice for developers on building effective agents.
  - Agents , on the other hand, are systems where LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks.
  - Strands Agents SDK by AWS ;
  - Over the past year, we've worked with dozens of teams building large language model (LLM) agents across industries.

### Code execution with MCP: building more efficient AI agents

- Source: https://www.anthropic.com/engineering/code-execution-with-mcp
- Relevance: high
- Portability: portable
- Blog card date: pinned
- Summary: Direct tool calls consume context for each definition and result. Agents scale better by writing code to call tools instead. Here's how it works with MCP.
- Guidance:
  - In this blog we'll explore how code execution can enable agents to interact with MCP servers more efficiently, handling more tools while using fewer tokens.
  - Connecting agents to tools and data traditionally requires a custom integration for each pairing, creating fragmentation and duplicated effort that makes it difficult to scale truly connected systems.
  - The Model Context Protocol (MCP) is an open standard for connecting AI agents to external systems.
  - Tool definitions overload the context window;

## Topic: evals

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Harness design is key to performance at the frontier of agentic coding. Here's how we pushed Claude further in frontend design and long-running autonomous software engineering.
- Guidance:
  - We've previously shown that harness design has a substantial impact on the effectiveness of long running agentic coding.
  - Two insights shaped the harness I built for frontend design.
  - Design quality: Does the design feel like a coherent whole rather than a collection of parts? Strong work here means the colors, typography, layout, imagery, and other details combine to create a distinct mood and identity.
  - For more complex tasks, the agent still tends to go off the rails over time.

### Quantifying infrastructure noise in agentic coding evals

- Source: https://www.anthropic.com/engineering/infrastructure-noise
- Relevance: high
- Portability: portable
- Blog card date: Feb 05, 2026
- Summary: Infrastructure configuration can swing agentic coding benchmarks by several percentage points—sometimes more than the leaderboard gap between top models.
- Guidance:
  - Agentic coding evals are different: models are given a full environment where they write programs, run tests, install dependencies, and iterate over multiple turns.
  - Agentic coding benchmarks like SWE-bench and Terminal-Bench are commonly used to compare the software engineering capabilities of frontier models—with top spots on leaderboards often separated by just a few percentage points.
  - Eval developers have begun accounting for this.
  - Terminal-Bench 2.0, for instance, specifies recommended CPU and RAM on a per-task basis in their latest 2.0 release.

### Designing AI resistant technical evaluations

- Source: https://www.anthropic.com/engineering/AI-resistant-technical-evaluations
- Relevance: high
- Portability: mixed
- Blog card date: Jan 21, 2026
- Summary: What we learned from three iterations of a performance engineering take-home that Claude keeps beating.
- Guidance:
  - Evaluating technical candidates becomes harder as AI capabilities improve.
  - I've now iterated through three versions of our take-home in an attempt to ensure it still carries signal. Each time, I’ve learned something new about what makes evaluations robust to AI assistance and what doesn't.
  - Each time, I’ve learned something new about what makes evaluations robust to AI assistance and what doesn't.
  - A take-home that distinguishes well between human skill levels today may be trivially solved by models tomorrow—rendering it useless for evaluation.

### Building Effective AI Agents

- Source: https://www.anthropic.com/engineering/building-effective-agents
- Relevance: high
- Portability: portable
- Blog card date: pinned
- Summary: We've worked with dozens of teams building LLM agents across industries. Consistently, the most successful implementations use simple, composable patterns rather than complex frameworks.
- Guidance:
  - In this post, we share what we’ve learned from working with our customers and building agents ourselves, and give practical advice for developers on building effective agents.
  - Agents , on the other hand, are systems where LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks.
  - Strands Agents SDK by AWS ;
  - Over the past year, we've worked with dozens of teams building large language model (LLM) agents across industries.

## Topic: frontend

### Scaling Managed Agents: Decoupling the brain from the hands

- Source: https://www.anthropic.com/engineering/managed-agents
- Relevance: high
- Portability: mixed
- Blog card date: Apr 08, 2026
- Summary: Harnesses encode assumptions that go stale as models improve. Managed Agents—our hosted service for long-horizon agent work—is built around interfaces that stay stable as harnesses change.
- Guidance:
  - Building Managed Agents meant solving an old problem in computing: how to design a system for “ programs as yet unthought of .” Decades ago, operating systems solved this problem by virtualizing hardware into abstractions— process, file —general enough for programs that didn't exist yet.
  - Managed Agents follow the same pattern.
  - A running topic on the Engineering Blog is how to build effective agents and design harnesses for long-running work .

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Harness design is key to performance at the frontier of agentic coding. Here's how we pushed Claude further in frontend design and long-running autonomous software engineering.
- Guidance:
  - We've previously shown that harness design has a substantial impact on the effectiveness of long running agentic coding.
  - Two insights shaped the harness I built for frontend design.
  - Design quality: Does the design feel like a coherent whole rather than a collection of parts? Strong work here means the colors, typography, layout, imagery, and other details combine to create a distinct mood and identity.
  - For more complex tasks, the agent still tends to go off the rails over time.

### Designing AI resistant technical evaluations

- Source: https://www.anthropic.com/engineering/AI-resistant-technical-evaluations
- Relevance: high
- Portability: mixed
- Blog card date: Jan 21, 2026
- Summary: What we learned from three iterations of a performance engineering take-home that Claude keeps beating.
- Guidance:
  - Evaluating technical candidates becomes harder as AI capabilities improve.
  - I've now iterated through three versions of our take-home in an attempt to ensure it still carries signal. Each time, I’ve learned something new about what makes evaluations robust to AI assistance and what doesn't.
  - Each time, I’ve learned something new about what makes evaluations robust to AI assistance and what doesn't.
  - A take-home that distinguishes well between human skill levels today may be trivially solved by models tomorrow—rendering it useless for evaluation.

### Building Effective AI Agents

- Source: https://www.anthropic.com/engineering/building-effective-agents
- Relevance: high
- Portability: portable
- Blog card date: pinned
- Summary: We've worked with dozens of teams building LLM agents across industries. Consistently, the most successful implementations use simple, composable patterns rather than complex frameworks.
- Guidance:
  - In this post, we share what we’ve learned from working with our customers and building agents ourselves, and give practical advice for developers on building effective agents.
  - Agents , on the other hand, are systems where LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks.
  - Strands Agents SDK by AWS ;
  - Over the past year, we've worked with dozens of teams building large language model (LLM) agents across industries.

### Code execution with MCP: building more efficient AI agents

- Source: https://www.anthropic.com/engineering/code-execution-with-mcp
- Relevance: high
- Portability: portable
- Blog card date: pinned
- Summary: Direct tool calls consume context for each definition and result. Agents scale better by writing code to call tools instead. Here's how it works with MCP.
- Guidance:
  - In this blog we'll explore how code execution can enable agents to interact with MCP servers more efficiently, handling more tools while using fewer tokens.
  - Connecting agents to tools and data traditionally requires a custom integration for each pairing, creating fragmentation and duplicated effort that makes it difficult to scale truly connected systems.
  - The Model Context Protocol (MCP) is an open standard for connecting AI agents to external systems.
  - Tool definitions overload the context window;

## Topic: skills

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Harness design is key to performance at the frontier of agentic coding. Here's how we pushed Claude further in frontend design and long-running autonomous software engineering.
- Guidance:
  - We've previously shown that harness design has a substantial impact on the effectiveness of long running agentic coding.
  - Two insights shaped the harness I built for frontend design.
  - Design quality: Does the design feel like a coherent whole rather than a collection of parts? Strong work here means the colors, typography, layout, imagery, and other details combine to create a distinct mood and identity.
  - For more complex tasks, the agent still tends to go off the rails over time.

### Designing AI resistant technical evaluations

- Source: https://www.anthropic.com/engineering/AI-resistant-technical-evaluations
- Relevance: high
- Portability: mixed
- Blog card date: Jan 21, 2026
- Summary: What we learned from three iterations of a performance engineering take-home that Claude keeps beating.
- Guidance:
  - Evaluating technical candidates becomes harder as AI capabilities improve.
  - I've now iterated through three versions of our take-home in an attempt to ensure it still carries signal. Each time, I’ve learned something new about what makes evaluations robust to AI assistance and what doesn't.
  - Each time, I’ve learned something new about what makes evaluations robust to AI assistance and what doesn't.
  - A take-home that distinguishes well between human skill levels today may be trivially solved by models tomorrow—rendering it useless for evaluation.

