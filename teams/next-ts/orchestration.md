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
