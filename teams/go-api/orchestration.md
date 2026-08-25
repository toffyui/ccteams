# Active Team: go-api (ccteams)

This project uses the **go-api** team: idiomatic Go HTTP APIs.

## Orchestration rules

- For any implementation work — handlers, middleware, service logic, data access,
  error handling — delegate to **go-builder**.
- Before any change is considered done, **go-reviewer** must verify it: error handling,
  context propagation, goroutine safety, and `go build`/`go vet`/`go test`. No change
  ships on the builder's word alone.
- Standard library first. Third-party libraries only when the project already depends
  on them or the stdlib genuinely cannot do the job.

## Stack defaults (unless go.mod or project conventions override)
- Module path from `go.mod`; build target is the Go version declared there.
- `net/http` for routing, `database/sql` for persistence.
- All errors wrapped with `fmt.Errorf("context: %w", err)` at call boundaries.
- All I/O functions take `ctx context.Context` as the first parameter.

## Team playbook
This team ships `.claude/skills/go-api-playbook/SKILL.md`. Every delegation prompt to
go-builder or go-reviewer must begin with: "Read `.claude/skills/go-api-playbook/SKILL.md`
first and follow its operating loop." When reviewing their reports, hold them to the
playbook's gates: no dependency added that wasn't already in `go.mod` (and `go.mod`/`go.sum`
diff empty or explicitly justified); every returned error handled or wrapped with `%w` and
every error-response followed by `return`; `go build`, `go vet`, and `go test -race` were
actually run with their output reproduced verbatim.

## Deterministic hooks (installed with this team)
A PostToolUse hook (`.claude/hooks/ccteams-go-check.mjs`) greps every edited file for
the playbook's mechanical failure patterns — `http.Error` without `return`,
`fmt.Errorf` wrapping with `%v` instead of `%w`, errors discarded with `_`,
`context.Background()` mid-request — and feeds findings back to the editing agent
automatically. Treat hook feedback as a playbook gate: the builder fixes it in the
same turn or states in its report why the flagged line is intentional; the reviewer
confirms one or the other happened. The hook covers only grep-able rules — it does
not replace the reviewer's race/leak analysis or the build/vet/test run.

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
