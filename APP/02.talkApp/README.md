# talkApp

`talkApp` is a local conversation R&D app for building a Japanese chat AI that becomes more interesting over time.

It is not just a chat UI. The repo includes:

- a baseline and an improved conversation engine
- debug output for internal routing and candidate scoring
- eval runners and saved reports
- feedback and pairwise preference collection
- golden examples, anti-examples, and failure mining
- runtime abstraction for `codex exec` and OpenAI Responses API

## Requirements

- Node.js 20.10 or newer
- One of:
  - signed-in Codex CLI
  - `OPENAI_API_KEY` set in `.env`

## Setup

```powershell
cd C:\Users\akima\dev\talkApp
Copy-Item .env.example .env
npm install
npm run seed:data
npm run rebuild:fewshots
```

## Run

```powershell
.\start-talkapp.bat
```

or

```powershell
npm start
```

Open:

```text
http://127.0.0.1:3000/
```

## Dev mode

```powershell
npm run dev
```

## Evals

```powershell
npm run evals
```

Reports are written to `data/eval_reports/`.

## Example importer

```powershell
npm run import:examples -- C:\path\to\examples.json golden
```

Supported formats:

- `.json`
- `.csv`
- `.md`

## Main directories

- `app/backend/`
  - Express server
- `app/frontend/`
  - React + TypeScript UI
- `src/conversation/`
  - conversation engine pipeline
- `src/evals/`
  - datasets, scorers, runners
- `src/feedback/`
  - feedback, pairwise preference, importer
- `data/`
  - goldens, anti_examples, feedback, failures, eval_reports, memory
- `docs/`
  - product spec, voice bible, eval notes, tuning guide, assumptions, experiment log

## Runtime modes

- `codex-exec`
  - no API key required
  - uses `codex exec`
  - no live web search
- `responses`
  - requires `OPENAI_API_KEY`
  - uses OpenAI Responses API
  - can enable web search

## Notes

- The baseline engine is intentionally weaker.
- The current eval stack is heuristic-first. The UI is designed to collect better human preference data over time.
