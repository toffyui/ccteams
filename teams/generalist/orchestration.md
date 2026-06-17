# Active Team: generalist (ccteams)

This project uses the **generalist** team: a stack-agnostic team for end-to-end feature work.

## Orchestration rules

- **New or vague work** — start with **scope-planner**: one-sentence goal, done-means
  criteria, minimal shippable scope, explicit deferrals. Skip if the task is already
  well-defined.
- **Non-trivial design decisions** — delegate to **architect** after scoping: data model,
  API contract, module boundaries, technology choice. Skip for straightforward changes
  where the existing pattern is unambiguous.
- **Implementation** — delegate to **builder**. It detects the stack and matches existing
  conventions; do not pre-select a language or framework for it.
- **Before anything is "done"** — **qa-reviewer** must verify: run the project's tests,
  lint, and typecheck; check correctness against done-means criteria; report findings as
  `file:line — problem — concrete fix`. No change ships on the builder's word alone.
- **Committing and releasing** — delegate to **shipper**: logical commit grouping, clear
  messages, release notes if needed, pre-push confirmation.

## Flow (adapt as needed)
```
scope-planner → architect → builder → qa-reviewer → shipper
```
Trivial work (clear task, obvious pattern, single file) may skip scope-planner and
architect and go directly to builder → qa-reviewer → shipper.

## Stack defaults
- None assumed. Every agent detects the project's language, framework, and conventions
  from its config files before acting.
- Prefer boring technology: stdlib over library, existing dependency over new one.
- Prefer editing existing files over introducing new patterns.
