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
