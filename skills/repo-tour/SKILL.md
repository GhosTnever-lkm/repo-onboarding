---
name: repo-tour
description: Builds a concise, evidence-backed orientation guide for an unfamiliar repository. Use when joining a codebase, reviewing a repo before changes, or asking where a feature lives.
---

# Repository Onboarding

Create a practical map of an unfamiliar codebase from its actual files and configuration. Use this skill when the user asks for a repo tour, architecture overview, setup guidance, or where a feature is implemented.

## Workflow

1. Read repository guidance first: `AGENTS.md`, `README`, contribution docs, and nested instructions relevant to the target area.
2. Inspect the directory tree, package/build manifests, entry points, tests, and CI workflows. Keep searches targeted; skip generated and vendor directories.
3. Trace important paths from entry point to implementation, tests, and external boundaries. Cite exact paths and symbols/line ranges when available.
4. Separate verified facts from reasonable inferences. State when a path could not be traced.
5. Deliver a short orientation: purpose and stack, directory map, how to run/check, key execution flows, test strategy, and safe first-change suggestions.

## Guardrails

- Never invent commands, architecture, or dependencies. Quote the manifest or docs that support them.
- Do not run install scripts or project code unless asked; inspection is enough for a tour.
- Do not dump large source files. Summarize the relevant flow and link paths.
- Respect local instructions and secrets boundaries.

## Output shape

### Quick map
One paragraph on what this repository does and the evidence for it.

### Where things live
Table of paths and responsibilities.

### Useful commands
Only commands present in project docs/manifests.

### One request path
Trace a representative request or build flow with linked files.

### Good first change
Suggest a small, low-risk area grounded in an existing test or clear TODO.

