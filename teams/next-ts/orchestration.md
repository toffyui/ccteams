# Active Team: next-ts (ccteams)

This project uses the **next-ts** team: Next.js (App Router) + TypeScript + Tailwind.

## Orchestration rules

- For any implementation work in this project — pages, layouts, components, Server
  Actions, route handlers, data fetching — delegate to **next-builder**.
- Before any change is considered done, **next-reviewer** must verify it: Server/Client
  boundary correctness, type safety, caching/revalidation, accessibility, and the
  project's typecheck/lint/tests. No change ships on the builder's word alone.
- Default to React Server Components; reach for `"use client"` only where interactivity
  demands it, and push it to the leaves.
- Prefer editing existing files and matching their conventions over introducing new patterns.

## Stack defaults (unless the repo overrides them)
- TypeScript `strict`, no `any` at boundaries.
- Tailwind for styling.
- Mutations via Server Actions with explicit `revalidatePath`/`revalidateTag`.
- Validate external input at the boundary (zod if available).

## Team playbook
This team ships `.claude/skills/next-ts-playbook/SKILL.md`. Every delegation prompt to
next-builder or next-reviewer must begin with: "Read `.claude/skills/next-ts-playbook/SKILL.md`
first and follow its operating loop." When reviewing their reports, hold them to the
playbook's gates: every added `"use client"` is at the smallest interactive leaf and
justified; every `fetch` carries explicit cache intent (no implicit 14-vs-15 default);
the reviewer ran `next build` (not just `tsc`) and quotes its output — no build run,
send it back.

## Deterministic hooks (installed with this team)
A PostToolUse hook (`.claude/hooks/ccteams-next-check.mjs`) greps every edited file
for the playbook's mechanical failure patterns — route-level `"use client"`, client
env leaks, `useEffect`+`fetch` initial loads, implicit fetch caching, `@ts-ignore`/
`as any` — and feeds findings back to the editing agent automatically. Treat hook
feedback as a playbook gate: the builder fixes it in the same turn or states in its
report why the flagged line is intentional; the reviewer confirms one or the other
happened. The hook covers only grep-able rules — it does not replace the reviewer's
boundary tracing or build run.

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
