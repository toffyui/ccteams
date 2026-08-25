# Active Team: python-fastapi (ccteams)

This project uses the **python-fastapi** team: FastAPI + Pydantic v2 + async Python.

## Orchestration rules

- For any implementation work — routes, Pydantic models, dependency injection,
  service logic — delegate to **fastapi-builder**.
- Before any change is considered done, **fastapi-reviewer** must verify it: async
  correctness, Pydantic boundary validation, dependency injection hygiene, and
  ruff/mypy/pytest. No change ships on the builder's word alone.
- Pydantic v2 API everywhere. Deprecated v1 patterns (`@validator`, `class Config`)
  must not be introduced into new code.

## Stack defaults (unless project configuration overrides)
- FastAPI + Pydantic v2. All handlers `async def`.
- Separate request/response models; DB models not exposed at API boundary.
- Dependencies for auth, DB sessions, and cross-cutting concerns.
- Typecheck: mypy or pyright if configured; run before declaring done.

## Team playbook
This team ships `.claude/skills/python-fastapi-playbook/SKILL.md`. Every delegation prompt
to fastapi-builder or fastapi-reviewer must begin with: "Read
`.claude/skills/python-fastapi-playbook/SKILL.md` first and follow its operating loop."
When reviewing their reports, hold them to the playbook's gates: no blocking call left
inside an `async def` and no coroutine call missing `await`; Pydantic idioms match the
project's pinned major version and every ORM-returning route has a `response_model`; the
app import/boot check plus `pytest` (and any configured `ruff`/`mypy`) were actually run
with output reproduced verbatim, and the lockfile diff is empty or explicitly justified.

## Deterministic hooks (installed with this team)
A PostToolUse hook (`.claude/hooks/ccteams-fastapi-check.mjs`) greps every edited
file for the playbook's mechanical failure patterns — bare `except:`, Pydantic v1
API (`@validator`/`parse_obj`/`.dict()`), mutable default arguments, blocking calls
(`time.sleep`/`requests.*`) in async modules — and feeds findings back to the editing
agent automatically. Treat hook feedback as a playbook gate: the builder fixes it in
the same turn or states in its report why the flagged line is intentional; the
reviewer confirms one or the other happened. The hook covers only grep-able rules —
it does not replace the reviewer's async-correctness analysis or the test run.

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
