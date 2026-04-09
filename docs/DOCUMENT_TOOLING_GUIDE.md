# Document Tooling Guide

This repo now exposes a single local entrypoint for three adjacent tools:

- `Microsoft MarkItDown`
- `OpenDataLoader PDF`
- `SkillNet`

The goal is not to hide the upstream tools. The goal is to make the local harness answer three operator questions quickly:

1. Which tool should I use for this task?
2. Is that tool already installed on this machine?
3. What is the shortest command path through this repo?

## Entry Point

- Bootstrap local install: `node scripts/document_tooling.js bootstrap`
- Status: `node scripts/document_tooling.js status`
- Recommendation: `node scripts/document_tooling.js recommend "extract tables with bounding boxes from a scanned PDF"`
- Pass-through execution: `node scripts/document_tooling.js run <tool-id> -- <tool args...>`

If the tool is missing, the hub prints the upstream install command instead of failing silently.

## Local Install Model

- The harness now prefers a workspace-local install under `.tooling/document-tools`.
- Python packages are installed into `.tooling/document-tools/venv`.
- Local wrappers are materialized into `.tooling/document-tools/bin`.
- A local JDK is downloaded into `.tooling/document-tools/jdk` so `OpenDataLoader PDF` can run without a host-wide Java install.
- The cache root is `.uv-cache`.

This keeps the toolchain local to the repo instead of mutating the host Python environment.

## Default Routing

- Use `markitdown` for mixed office documents and fast Markdown conversion.
- Use `opendataloader-pdf` when PDF structure, layout, bounding boxes, accessibility, or tagged-PDF style processing matters.
- Use `skillnet` for skill search, creation, evaluation, and relationship analysis.

## Examples

```bash
node scripts/document_tooling.js bootstrap
node scripts/document_tooling.js status
node scripts/document_tooling.js recommend "convert a DOCX knowledge base into markdown"
node scripts/document_tooling.js run markitdown -- input.pdf -o output.md
node scripts/document_tooling.js run opendataloader-pdf -- input.pdf
node scripts/document_tooling.js run skillnet -- search pdf
```

## Upstream Install Commands

- MarkItDown: `pip install "markitdown[pdf,docx,pptx]"`
- OpenDataLoader PDF: `pip install opendataloader-pdf`
- SkillNet: `pip install skillnet-ai`

## Notes

- `bootstrap` uses `uv` to create a local Python environment and install all three Python-side tools.
- `bootstrap` also downloads a local Temurin JDK into the workspace so `OpenDataLoader PDF` can run without a system Java install.
- The runtime snapshot probes availability, a short version string, and the workspace-local install roots.
- The hub is intentionally small. It is an operator bridge, not a replacement for upstream documentation.
