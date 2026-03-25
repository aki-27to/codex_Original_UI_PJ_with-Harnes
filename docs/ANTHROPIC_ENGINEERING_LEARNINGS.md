# ANTHROPIC_ENGINEERING_LEARNINGS

Updated: 2026-03-25T11:02:27.227Z

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
- Summary: Anthropic is an AI safety and research company that's working to build reliable, interpretable, and steerable AI systems.
- Guidance:
  - Agentic coding benchmarks like SWE-bench and Terminal-Bench are commonly used to compare the software engineering capabilities of frontier models—with top spots on leaderboards often separated by just a few percentage points.
  - Agentic coding evals are different: models are given a full environment where they write programs, run tests, install dependencies, and iterate over multiple turns.
  - Eval developers have begun accounting for this.
  - Terminal-Bench 2.0, for instance, specifies recommended CPU and RAM on a per-task basis in their latest 2.0 release.

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Anthropic is an AI safety and research company that's working to build reliable, interpretable, and steerable AI systems.
- Guidance:
  - Design quality: Does the design feel like a coherent whole rather than a collection of parts? Strong work here means the colors, typography, layout, imagery, and other details combine to create a distinct mood and identity.
  - Originality: Is there evidence of custom decisions, or is this template layouts, library defaults, and AI-generated patterns? A human designer should recognize deliberate creative choices. Unmodified stock components—or telltale signs of AI generation like purple gradients over white cards—fail here.
  - Craft: Technical execution: typography hierarchy, spacing consistency, color harmony, contrast ratios. This is a competence check rather than a creativity check. Most reasonable implementations do fine here by default; failing means broken fundamentals.
  - Functionality: Usability independent of aesthetics. Can users understand what the interface does, find primary actions, and complete tasks without guessing?

### Demystifying evals for AI agents

- Source: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Relevance: high
- Portability: mixed
- Blog card date: Jan 09, 2026
- Summary: Demystifying evals for AI agents
- Guidance:
  - A task (a.k.a problem or test case ) is a single test with defined inputs and success criteria.
  - Each attempt at a task is a trial . Because model outputs vary between runs, we run multiple trials to produce more consistent results.
  - A grader is logic that scores some aspect of the agent’s performance. A task can have multiple graders, each containing multiple assertions (sometimes called checks ) .
  - A transcript (also called a trace or trajectory ) is the complete record of a trial, including outputs, tool calls, reasoning, intermediate results, and any other interactions. For the Anthropic API, this is the full messages array at the end of an eval run - containing all the calls to the API and all of the returned

### Effective harnesses for long-running agents

- Source: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Relevance: high
- Portability: mixed
- Blog card date: Nov 26, 2025
- Summary: Anthropic is an AI safety and research company that's working to build reliable, interpretable, and steerable AI systems.
- Guidance:
  - Coding agent: Every subsequent session asks the model to make incremental progress, then leave structured updates. 1
  - Run pwd to see the directory you’re working in. You’ll only be able to edit files in this directory.
  - Read the git logs and progress files to get up to speed on what was recently worked on.
  - Read the features list file and choose the highest-priority feature that’s not yet done to work on.

## Topic: context

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Anthropic is an AI safety and research company that's working to build reliable, interpretable, and steerable AI systems.
- Guidance:
  - Design quality: Does the design feel like a coherent whole rather than a collection of parts? Strong work here means the colors, typography, layout, imagery, and other details combine to create a distinct mood and identity.
  - Originality: Is there evidence of custom decisions, or is this template layouts, library defaults, and AI-generated patterns? A human designer should recognize deliberate creative choices. Unmodified stock components—or telltale signs of AI generation like purple gradients over white cards—fail here.
  - Craft: Technical execution: typography hierarchy, spacing consistency, color harmony, contrast ratios. This is a competence check rather than a creativity check. Most reasonable implementations do fine here by default; failing means broken fundamentals.
  - Functionality: Usability independent of aesthetics. Can users understand what the interface does, find primary actions, and complete tasks without guessing?

### Demystifying evals for AI agents

- Source: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Relevance: high
- Portability: mixed
- Blog card date: Jan 09, 2026
- Summary: Demystifying evals for AI agents
- Guidance:
  - A task (a.k.a problem or test case ) is a single test with defined inputs and success criteria.
  - Each attempt at a task is a trial . Because model outputs vary between runs, we run multiple trials to produce more consistent results.
  - A grader is logic that scores some aspect of the agent’s performance. A task can have multiple graders, each containing multiple assertions (sometimes called checks ) .
  - A transcript (also called a trace or trajectory ) is the complete record of a trial, including outputs, tool calls, reasoning, intermediate results, and any other interactions. For the Anthropic API, this is the full messages array at the end of an eval run - containing all the calls to the API and all of the returned

### Effective harnesses for long-running agents

- Source: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Relevance: high
- Portability: mixed
- Blog card date: Nov 26, 2025
- Summary: Anthropic is an AI safety and research company that's working to build reliable, interpretable, and steerable AI systems.
- Guidance:
  - Coding agent: Every subsequent session asks the model to make incremental progress, then leave structured updates. 1
  - Run pwd to see the directory you’re working in. You’ll only be able to edit files in this directory.
  - Read the git logs and progress files to get up to speed on what was recently worked on.
  - Read the features list file and choose the highest-priority feature that’s not yet done to work on.

## Topic: evals

### Quantifying infrastructure noise in agentic coding evals

- Source: https://www.anthropic.com/engineering/infrastructure-noise
- Relevance: high
- Portability: portable
- Summary: Anthropic is an AI safety and research company that's working to build reliable, interpretable, and steerable AI systems.
- Guidance:
  - Agentic coding benchmarks like SWE-bench and Terminal-Bench are commonly used to compare the software engineering capabilities of frontier models—with top spots on leaderboards often separated by just a few percentage points.
  - Agentic coding evals are different: models are given a full environment where they write programs, run tests, install dependencies, and iterate over multiple turns.
  - Eval developers have begun accounting for this.
  - Terminal-Bench 2.0, for instance, specifies recommended CPU and RAM on a per-task basis in their latest 2.0 release.

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Anthropic is an AI safety and research company that's working to build reliable, interpretable, and steerable AI systems.
- Guidance:
  - Design quality: Does the design feel like a coherent whole rather than a collection of parts? Strong work here means the colors, typography, layout, imagery, and other details combine to create a distinct mood and identity.
  - Originality: Is there evidence of custom decisions, or is this template layouts, library defaults, and AI-generated patterns? A human designer should recognize deliberate creative choices. Unmodified stock components—or telltale signs of AI generation like purple gradients over white cards—fail here.
  - Craft: Technical execution: typography hierarchy, spacing consistency, color harmony, contrast ratios. This is a competence check rather than a creativity check. Most reasonable implementations do fine here by default; failing means broken fundamentals.
  - Functionality: Usability independent of aesthetics. Can users understand what the interface does, find primary actions, and complete tasks without guessing?

### Designing AI resistant technical evaluations

- Source: https://www.anthropic.com/engineering/AI-resistant-technical-evaluations
- Relevance: high
- Portability: mixed
- Blog card date: Jan 21, 2026
- Summary: What we learned from three iterations of a performance engineering take-home that Claude keeps beating.

### Demystifying evals for AI agents

- Source: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Relevance: high
- Portability: mixed
- Blog card date: Jan 09, 2026
- Summary: Demystifying evals for AI agents
- Guidance:
  - A task (a.k.a problem or test case ) is a single test with defined inputs and success criteria.
  - Each attempt at a task is a trial . Because model outputs vary between runs, we run multiple trials to produce more consistent results.
  - A grader is logic that scores some aspect of the agent’s performance. A task can have multiple graders, each containing multiple assertions (sometimes called checks ) .
  - A transcript (also called a trace or trajectory ) is the complete record of a trial, including outputs, tool calls, reasoning, intermediate results, and any other interactions. For the Anthropic API, this is the full messages array at the end of an eval run - containing all the calls to the API and all of the returned

### Effective harnesses for long-running agents

- Source: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Relevance: high
- Portability: mixed
- Blog card date: Nov 26, 2025
- Summary: Anthropic is an AI safety and research company that's working to build reliable, interpretable, and steerable AI systems.
- Guidance:
  - Coding agent: Every subsequent session asks the model to make incremental progress, then leave structured updates. 1
  - Run pwd to see the directory you’re working in. You’ll only be able to edit files in this directory.
  - Read the git logs and progress files to get up to speed on what was recently worked on.
  - Read the features list file and choose the highest-priority feature that’s not yet done to work on.

## Topic: frontend

### Quantifying infrastructure noise in agentic coding evals

- Source: https://www.anthropic.com/engineering/infrastructure-noise
- Relevance: high
- Portability: portable
- Summary: Anthropic is an AI safety and research company that's working to build reliable, interpretable, and steerable AI systems.
- Guidance:
  - Agentic coding benchmarks like SWE-bench and Terminal-Bench are commonly used to compare the software engineering capabilities of frontier models—with top spots on leaderboards often separated by just a few percentage points.
  - Agentic coding evals are different: models are given a full environment where they write programs, run tests, install dependencies, and iterate over multiple turns.
  - Eval developers have begun accounting for this.
  - Terminal-Bench 2.0, for instance, specifies recommended CPU and RAM on a per-task basis in their latest 2.0 release.

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Anthropic is an AI safety and research company that's working to build reliable, interpretable, and steerable AI systems.
- Guidance:
  - Design quality: Does the design feel like a coherent whole rather than a collection of parts? Strong work here means the colors, typography, layout, imagery, and other details combine to create a distinct mood and identity.
  - Originality: Is there evidence of custom decisions, or is this template layouts, library defaults, and AI-generated patterns? A human designer should recognize deliberate creative choices. Unmodified stock components—or telltale signs of AI generation like purple gradients over white cards—fail here.
  - Craft: Technical execution: typography hierarchy, spacing consistency, color harmony, contrast ratios. This is a competence check rather than a creativity check. Most reasonable implementations do fine here by default; failing means broken fundamentals.
  - Functionality: Usability independent of aesthetics. Can users understand what the interface does, find primary actions, and complete tasks without guessing?

### Designing AI resistant technical evaluations

- Source: https://www.anthropic.com/engineering/AI-resistant-technical-evaluations
- Relevance: high
- Portability: mixed
- Blog card date: Jan 21, 2026
- Summary: What we learned from three iterations of a performance engineering take-home that Claude keeps beating.

### Demystifying evals for AI agents

- Source: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Relevance: high
- Portability: mixed
- Blog card date: Jan 09, 2026
- Summary: Demystifying evals for AI agents
- Guidance:
  - A task (a.k.a problem or test case ) is a single test with defined inputs and success criteria.
  - Each attempt at a task is a trial . Because model outputs vary between runs, we run multiple trials to produce more consistent results.
  - A grader is logic that scores some aspect of the agent’s performance. A task can have multiple graders, each containing multiple assertions (sometimes called checks ) .
  - A transcript (also called a trace or trajectory ) is the complete record of a trial, including outputs, tool calls, reasoning, intermediate results, and any other interactions. For the Anthropic API, this is the full messages array at the end of an eval run - containing all the calls to the API and all of the returned

### Effective harnesses for long-running agents

- Source: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Relevance: high
- Portability: mixed
- Blog card date: Nov 26, 2025
- Summary: Anthropic is an AI safety and research company that's working to build reliable, interpretable, and steerable AI systems.
- Guidance:
  - Coding agent: Every subsequent session asks the model to make incremental progress, then leave structured updates. 1
  - Run pwd to see the directory you’re working in. You’ll only be able to edit files in this directory.
  - Read the git logs and progress files to get up to speed on what was recently worked on.
  - Read the features list file and choose the highest-priority feature that’s not yet done to work on.

## Topic: safety

### Quantifying infrastructure noise in agentic coding evals

- Source: https://www.anthropic.com/engineering/infrastructure-noise
- Relevance: high
- Portability: portable
- Summary: Anthropic is an AI safety and research company that's working to build reliable, interpretable, and steerable AI systems.
- Guidance:
  - Agentic coding benchmarks like SWE-bench and Terminal-Bench are commonly used to compare the software engineering capabilities of frontier models—with top spots on leaderboards often separated by just a few percentage points.
  - Agentic coding evals are different: models are given a full environment where they write programs, run tests, install dependencies, and iterate over multiple turns.
  - Eval developers have begun accounting for this.
  - Terminal-Bench 2.0, for instance, specifies recommended CPU and RAM on a per-task basis in their latest 2.0 release.

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Anthropic is an AI safety and research company that's working to build reliable, interpretable, and steerable AI systems.
- Guidance:
  - Design quality: Does the design feel like a coherent whole rather than a collection of parts? Strong work here means the colors, typography, layout, imagery, and other details combine to create a distinct mood and identity.
  - Originality: Is there evidence of custom decisions, or is this template layouts, library defaults, and AI-generated patterns? A human designer should recognize deliberate creative choices. Unmodified stock components—or telltale signs of AI generation like purple gradients over white cards—fail here.
  - Craft: Technical execution: typography hierarchy, spacing consistency, color harmony, contrast ratios. This is a competence check rather than a creativity check. Most reasonable implementations do fine here by default; failing means broken fundamentals.
  - Functionality: Usability independent of aesthetics. Can users understand what the interface does, find primary actions, and complete tasks without guessing?

### Effective harnesses for long-running agents

- Source: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Relevance: high
- Portability: mixed
- Blog card date: Nov 26, 2025
- Summary: Anthropic is an AI safety and research company that's working to build reliable, interpretable, and steerable AI systems.
- Guidance:
  - Coding agent: Every subsequent session asks the model to make incremental progress, then leave structured updates. 1
  - Run pwd to see the directory you’re working in. You’ll only be able to edit files in this directory.
  - Read the git logs and progress files to get up to speed on what was recently worked on.
  - Read the features list file and choose the highest-priority feature that’s not yet done to work on.

## Topic: skills

### Harness design for long-running application development

- Source: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Relevance: high
- Portability: portable
- Blog card date: Mar 24, 2026
- Summary: Anthropic is an AI safety and research company that's working to build reliable, interpretable, and steerable AI systems.
- Guidance:
  - Design quality: Does the design feel like a coherent whole rather than a collection of parts? Strong work here means the colors, typography, layout, imagery, and other details combine to create a distinct mood and identity.
  - Originality: Is there evidence of custom decisions, or is this template layouts, library defaults, and AI-generated patterns? A human designer should recognize deliberate creative choices. Unmodified stock components—or telltale signs of AI generation like purple gradients over white cards—fail here.
  - Craft: Technical execution: typography hierarchy, spacing consistency, color harmony, contrast ratios. This is a competence check rather than a creativity check. Most reasonable implementations do fine here by default; failing means broken fundamentals.
  - Functionality: Usability independent of aesthetics. Can users understand what the interface does, find primary actions, and complete tasks without guessing?

### Designing AI resistant technical evaluations

- Source: https://www.anthropic.com/engineering/AI-resistant-technical-evaluations
- Relevance: high
- Portability: mixed
- Blog card date: Jan 21, 2026
- Summary: What we learned from three iterations of a performance engineering take-home that Claude keeps beating.

