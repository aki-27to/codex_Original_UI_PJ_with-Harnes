# ANTHROPIC_ENGINEERING_LEARNINGS

Updated: 2026-03-25T11:25:33.281Z

This file is auto-synced from the Anthropic Engineering secondary learning lane.
Only portable agent-engineering principles are retained here; Claude-specific mechanics do not become runtime policy.

## How to use

- Treat these notes as retrieval-first working memory, not as automatic runtime policy.
- Source is locked to https://www.anthropic.com/engineering and the configured allowlist only.
- High-risk targets stay proposal-only until separately reviewed and validated.
- Requirement-Driven Foundation V1 remains frozen; external learnings cannot silently expand Step 1/2.
- Runtime retrieval is disabled for this lane unless separately enabled and validated.

## Topic: agents

### Quantifying infrastructure noise in agentic coding evals

- Source: https://www.anthropic.com/engineering/infrastructure-noise
- Relevance: high
- Portability: portable
- Summary: Infrastructure configuration can swing agentic coding benchmarks by several percentage points—sometimes more than the leaderboard gap between top models.
- Guidance:
  - Agentic coding evals are different: models are given a full environment where they write programs, run tests, install dependencies, and iterate over multiple turns.
  - Static benchmarks score a model's output directly—the runtime environment doesn’t factor into the result. Agentic coding evals are different: models are given a full environment where they write programs, run tests, install dependencies, and iterate over multiple turns. The runtime is no longer a passive container, but
  - Agentic coding benchmarks like SWE-bench and Terminal-Bench are commonly used to compare the software engineering capabilities of frontier models—with top spots on leaderboards often separated by just a few percentage points.
  - Agentic coding benchmarks like SWE-bench and Terminal-Bench are commonly used to compare the software engineering capabilities of frontier models—with top spots on leaderboards often separated by just a few percentage points. These scores are often treated as precise measurements of relative model capability and increa

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Harness design is key to performance at the frontier of agentic coding. Here's how we pushed Claude further in frontend design and long-running autonomous software engineering.
- Guidance:
  - This work originated with earlier efforts on our frontend design skill and long-running coding agent harness ,
  - We've previously shown that harness design has a substantial impact on the effectiveness of long running agentic coding. In an earlier experiment , we used an initializer agent to decompose a product spec into a task list, and a coding agent that implemented the tasks one feature at a time before handing off artifacts
  - We've previously shown that harness design has a substantial impact on the effectiveness of long running agentic coding.
  - I then applied these techniques to long-running autonomous coding, carrying over two lessons from our earlier harness work: decomposing the build into tractable chunks, and using structured artifacts to hand off context between sessions. The final result was a three-agent architecture—planner, generator, and evaluator—

### Demystifying evals for AI agents

- Source: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Relevance: high
- Portability: portable
- Blog card date: Jan 09, 2026
- Summary: The capabilities that make agents useful also make them difficult to evaluate. The strategies that work across deployments combine techniques to match the complexity of the systems they measure.
- Guidance:
  - As we described in Building effective agents , agents operate over many turns: calling tools, modifying state, and adapting based on intermediate results. These same capabilities that make AI agents useful—autonomy, intelligence, and flexibility—also make them harder to evaluate.
  - As we described in Building effective agents , agents operate over many turns: calling tools, modifying state, and adapting based on intermediate results.
  - Through our internal work and with customers at the frontier of agent development, we’ve learned how to design more rigorous and useful evals for agents. Here's what's worked across a range of agent architectures and use cases in real-world deployment.
  - Through our internal work and with customers at the frontier of agent development, we’ve learned how to design more rigorous and useful evals for agents.

### Effective harnesses for long-running agents

- Source: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Relevance: high
- Portability: mixed
- Blog card date: Nov 26, 2025
- Summary: Agents still face challenges working across many context windows. We looked to human engineers for inspiration in creating a more effective harness for long-running agents.
- Guidance:
  - The core challenge of long-running agents is that they must work in discrete sessions, and each new session begins with no memory of what came before.
  - The core challenge of long-running agents is that they must work in discrete sessions, and each new session begins with no memory of what came before. Imagine a software project staffed by engineers working in shifts, where each new engineer arrives with no memory of what happened on the previous shift. Because context
  - However, getting agents to make consistent progress across multiple context windows remains an open problem.
  - As AI agents become more capable, developers are increasingly asking them to take on complex tasks requiring work that spans hours, or even days.

## Topic: context

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Harness design is key to performance at the frontier of agentic coding. Here's how we pushed Claude further in frontend design and long-running autonomous software engineering.
- Guidance:
  - This work originated with earlier efforts on our frontend design skill and long-running coding agent harness ,
  - We've previously shown that harness design has a substantial impact on the effectiveness of long running agentic coding. In an earlier experiment , we used an initializer agent to decompose a product spec into a task list, and a coding agent that implemented the tasks one feature at a time before handing off artifacts
  - We've previously shown that harness design has a substantial impact on the effectiveness of long running agentic coding.
  - I then applied these techniques to long-running autonomous coding, carrying over two lessons from our earlier harness work: decomposing the build into tractable chunks, and using structured artifacts to hand off context between sessions. The final result was a three-agent architecture—planner, generator, and evaluator—

### Demystifying evals for AI agents

- Source: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Relevance: high
- Portability: portable
- Blog card date: Jan 09, 2026
- Summary: The capabilities that make agents useful also make them difficult to evaluate. The strategies that work across deployments combine techniques to match the complexity of the systems they measure.
- Guidance:
  - As we described in Building effective agents , agents operate over many turns: calling tools, modifying state, and adapting based on intermediate results. These same capabilities that make AI agents useful—autonomy, intelligence, and flexibility—also make them harder to evaluate.
  - As we described in Building effective agents , agents operate over many turns: calling tools, modifying state, and adapting based on intermediate results.
  - Through our internal work and with customers at the frontier of agent development, we’ve learned how to design more rigorous and useful evals for agents. Here's what's worked across a range of agent architectures and use cases in real-world deployment.
  - Through our internal work and with customers at the frontier of agent development, we’ve learned how to design more rigorous and useful evals for agents.

### Effective harnesses for long-running agents

- Source: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Relevance: high
- Portability: mixed
- Blog card date: Nov 26, 2025
- Summary: Agents still face challenges working across many context windows. We looked to human engineers for inspiration in creating a more effective harness for long-running agents.
- Guidance:
  - The core challenge of long-running agents is that they must work in discrete sessions, and each new session begins with no memory of what came before.
  - The core challenge of long-running agents is that they must work in discrete sessions, and each new session begins with no memory of what came before. Imagine a software project staffed by engineers working in shifts, where each new engineer arrives with no memory of what happened on the previous shift. Because context
  - However, getting agents to make consistent progress across multiple context windows remains an open problem.
  - As AI agents become more capable, developers are increasingly asking them to take on complex tasks requiring work that spans hours, or even days.

## Topic: evals

### Quantifying infrastructure noise in agentic coding evals

- Source: https://www.anthropic.com/engineering/infrastructure-noise
- Relevance: high
- Portability: portable
- Summary: Infrastructure configuration can swing agentic coding benchmarks by several percentage points—sometimes more than the leaderboard gap between top models.
- Guidance:
  - Agentic coding evals are different: models are given a full environment where they write programs, run tests, install dependencies, and iterate over multiple turns.
  - Static benchmarks score a model's output directly—the runtime environment doesn’t factor into the result. Agentic coding evals are different: models are given a full environment where they write programs, run tests, install dependencies, and iterate over multiple turns. The runtime is no longer a passive container, but
  - Agentic coding benchmarks like SWE-bench and Terminal-Bench are commonly used to compare the software engineering capabilities of frontier models—with top spots on leaderboards often separated by just a few percentage points.
  - Agentic coding benchmarks like SWE-bench and Terminal-Bench are commonly used to compare the software engineering capabilities of frontier models—with top spots on leaderboards often separated by just a few percentage points. These scores are often treated as precise measurements of relative model capability and increa

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Harness design is key to performance at the frontier of agentic coding. Here's how we pushed Claude further in frontend design and long-running autonomous software engineering.
- Guidance:
  - This work originated with earlier efforts on our frontend design skill and long-running coding agent harness ,
  - We've previously shown that harness design has a substantial impact on the effectiveness of long running agentic coding. In an earlier experiment , we used an initializer agent to decompose a product spec into a task list, and a coding agent that implemented the tasks one feature at a time before handing off artifacts
  - We've previously shown that harness design has a substantial impact on the effectiveness of long running agentic coding.
  - I then applied these techniques to long-running autonomous coding, carrying over two lessons from our earlier harness work: decomposing the build into tractable chunks, and using structured artifacts to hand off context between sessions. The final result was a three-agent architecture—planner, generator, and evaluator—

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

### Demystifying evals for AI agents

- Source: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Relevance: high
- Portability: portable
- Blog card date: Jan 09, 2026
- Summary: The capabilities that make agents useful also make them difficult to evaluate. The strategies that work across deployments combine techniques to match the complexity of the systems they measure.
- Guidance:
  - As we described in Building effective agents , agents operate over many turns: calling tools, modifying state, and adapting based on intermediate results. These same capabilities that make AI agents useful—autonomy, intelligence, and flexibility—also make them harder to evaluate.
  - As we described in Building effective agents , agents operate over many turns: calling tools, modifying state, and adapting based on intermediate results.
  - Through our internal work and with customers at the frontier of agent development, we’ve learned how to design more rigorous and useful evals for agents. Here's what's worked across a range of agent architectures and use cases in real-world deployment.
  - Through our internal work and with customers at the frontier of agent development, we’ve learned how to design more rigorous and useful evals for agents.

## Topic: frontend

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Harness design is key to performance at the frontier of agentic coding. Here's how we pushed Claude further in frontend design and long-running autonomous software engineering.
- Guidance:
  - This work originated with earlier efforts on our frontend design skill and long-running coding agent harness ,
  - We've previously shown that harness design has a substantial impact on the effectiveness of long running agentic coding. In an earlier experiment , we used an initializer agent to decompose a product spec into a task list, and a coding agent that implemented the tasks one feature at a time before handing off artifacts
  - We've previously shown that harness design has a substantial impact on the effectiveness of long running agentic coding.
  - I then applied these techniques to long-running autonomous coding, carrying over two lessons from our earlier harness work: decomposing the build into tractable chunks, and using structured artifacts to hand off context between sessions. The final result was a three-agent architecture—planner, generator, and evaluator—

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

### Demystifying evals for AI agents

- Source: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Relevance: high
- Portability: portable
- Blog card date: Jan 09, 2026
- Summary: The capabilities that make agents useful also make them difficult to evaluate. The strategies that work across deployments combine techniques to match the complexity of the systems they measure.
- Guidance:
  - As we described in Building effective agents , agents operate over many turns: calling tools, modifying state, and adapting based on intermediate results. These same capabilities that make AI agents useful—autonomy, intelligence, and flexibility—also make them harder to evaluate.
  - As we described in Building effective agents , agents operate over many turns: calling tools, modifying state, and adapting based on intermediate results.
  - Through our internal work and with customers at the frontier of agent development, we’ve learned how to design more rigorous and useful evals for agents. Here's what's worked across a range of agent architectures and use cases in real-world deployment.
  - Through our internal work and with customers at the frontier of agent development, we’ve learned how to design more rigorous and useful evals for agents.

### Effective harnesses for long-running agents

- Source: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Relevance: high
- Portability: mixed
- Blog card date: Nov 26, 2025
- Summary: Agents still face challenges working across many context windows. We looked to human engineers for inspiration in creating a more effective harness for long-running agents.
- Guidance:
  - The core challenge of long-running agents is that they must work in discrete sessions, and each new session begins with no memory of what came before.
  - The core challenge of long-running agents is that they must work in discrete sessions, and each new session begins with no memory of what came before. Imagine a software project staffed by engineers working in shifts, where each new engineer arrives with no memory of what happened on the previous shift. Because context
  - However, getting agents to make consistent progress across multiple context windows remains an open problem.
  - As AI agents become more capable, developers are increasingly asking them to take on complex tasks requiring work that spans hours, or even days.

## Topic: skills

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Harness design is key to performance at the frontier of agentic coding. Here's how we pushed Claude further in frontend design and long-running autonomous software engineering.
- Guidance:
  - This work originated with earlier efforts on our frontend design skill and long-running coding agent harness ,
  - We've previously shown that harness design has a substantial impact on the effectiveness of long running agentic coding. In an earlier experiment , we used an initializer agent to decompose a product spec into a task list, and a coding agent that implemented the tasks one feature at a time before handing off artifacts
  - We've previously shown that harness design has a substantial impact on the effectiveness of long running agentic coding.
  - I then applied these techniques to long-running autonomous coding, carrying over two lessons from our earlier harness work: decomposing the build into tractable chunks, and using structured artifacts to hand off context between sessions. The final result was a three-agent architecture—planner, generator, and evaluator—

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

