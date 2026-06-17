# Backlog — ccteams

Parked ideas. Ship the core first; build these only when there's real demand.

## Multiple teams at once / monorepo support
- Today ccteams applies ONE team per project (`ccteams use` is an exclusive switch, like nvm).
- Confirmed Claude Code constraint (via official docs, 2026-06-17): subagents are GLOBAL to a
  project — they CANNOT be scoped to a subdirectory. Nested `.claude/agents/` is not loaded.
  Only CLAUDE.md is path-scoped (loaded along the path to files being edited).
- So "frontend team in apps/web, backend team in apps/api, simultaneously and isolated" is
  NOT possible in Claude Code regardless of what ccteams does.
- Possible future approaches if demand appears (A and B converge to the same end state — all
  agents visible globally, CLAUDE.md steers by path):
  - A. "Composite teams": ship a pre-bundled team (e.g. `monorepo-web-api`) whose
    orchestration.md routes by path ("under apps/web/ delegate to next-builder; under
    apps/api/ delegate to go-builder"). No CLI change.
  - B. Multi-team compose: `ccteams use frontend backend` merges both teams' agents into
    `.claude/agents/` and imports both orchestration files. Needs manifest + collision +
    co-existing-orchestration design.
- For now: document "one team per session" in the README, and the monorepo workaround
  (launch `claude` from the subdirectory you're working in to pick up that subtree's CLAUDE.md).
