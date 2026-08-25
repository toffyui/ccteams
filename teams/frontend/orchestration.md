# Active Team: frontend (ccteams)

This project uses the **frontend** team: framework-agnostic UI, UX, and accessibility.

## Orchestration rules

- For any UI implementation work — components, layout, styling, responsive behavior —
  delegate to **ui-builder**. It detects and matches the project's existing framework
  and conventions; do not pre-select a framework for it.
- Before any user-facing change is considered done, **ux-reviewer** must verify it:
  WCAG accessibility, keyboard navigation, responsive layout, and UX consistency.
  No UI change ships on the builder's word alone.
- Accessibility is non-negotiable, not optional polish. Semantic HTML, keyboard
  reachability, visible focus, and labeled inputs are baseline requirements.

## Stack defaults
- No assumed framework — ui-builder detects from `package.json` and existing files.
- WCAG AA minimum: 4.5:1 contrast for normal text, 3:1 for large text and UI components.
- Mobile-first responsive layout using the project's existing breakpoint system.

## Team playbook
This team ships `.claude/skills/frontend-playbook/SKILL.md`. Every delegation prompt to
ui-builder or ux-reviewer must begin with: "Read `.claude/skills/frontend-playbook/SKILL.md`
first and follow its operating loop." When reviewing their reports, hold them to the
playbook's gates: the change was run and walked by keyboard (Tab/Enter/Escape, focus
order matches visual order) — no keyboard walkthrough, send it back; it was resized at
320/768/1280 with no horizontal overflow; every interactive element uses a semantic
element with a visible focus state, and new CSS reuses existing tokens rather than
inventing literals.

## Deterministic hooks (installed with this team)
A PostToolUse hook (`.claude/hooks/ccteams-frontend-check.mjs`) greps every edited
file for the playbook's mechanical failure patterns — `onClick` on div/span,
`<img>` without `alt`, `outline: none` without a `:focus-visible` replacement,
z-index escalation — and feeds findings back to the editing agent automatically.
Treat hook feedback as a playbook gate: the builder fixes it in the same turn or
states in its report why the flagged line is intentional; the reviewer confirms one
or the other happened. The hook covers only grep-able rules — it does not replace
the reviewer's keyboard walkthrough and responsive checks.

## Working method (mandatory — every agent on this team)

The full method is installed at `.claude/skills/working-method/SKILL.md`; read it
when in doubt. When delegating, copy this digest verbatim into EVERY delegation
prompt:

> Working method (non-negotiable):
> 1. Restate the goal in one sentence + a "done means" criterion before acting.
> 2. Read the actual files before forming opinions; verify every path/function you reference exists in this project.
> 3. Name your riskiest assumption and check it first, while it is cheap.
> 4. The diff is a claim; execution is evidence. Run the project's build/lint/tests and report their real output.
> 5. Label claims VERIFIED (ran it) / REASONED (read it) / ASSUMED (unchecked) — never upgrade one silently.
> 6. Before finishing: re-read the original request; every requirement met, nothing promised-but-undone.

Also, on every delegation and review:
- If `.claude/skills/team-lessons/SKILL.md` has entries, include the relevant ones
  in the delegation prompt and hold reports to them like playbook rules.
- When a mistake surfaces that neither the playbook nor team-lessons predicted,
  draft an entry (symptom → wrong instinct → correct move) and propose adding it
  to team-lessons.
