# Active Team: rails (ccteams)

This project uses the **rails** team: Ruby on Rails, convention-over-configuration.

## Orchestration rules

- For any implementation work — models, controllers, views, jobs, migrations —
  delegate to **rails-builder**.
- Before any change is considered done, **rails-reviewer** must verify it: N+1 queries,
  mass-assignment safety, missing validations, migration reversibility, and
  rspec/rails test + rubocop. No change ships on the builder's word alone.
- Fat model / skinny controller. If a controller action has substantial business logic,
  it belongs in the model or a service object — redirect the builder accordingly.

## Stack defaults (unless Gemfile.lock or project conventions override)
- Rails version from `Gemfile.lock`.
- Strong parameters on every create/update action.
- Reversible migrations with explicit indexes on foreign keys.
- Named scopes for reusable query fragments; `includes` for association traversal.

## Team playbook
This team ships `.claude/skills/rails-playbook/SKILL.md`. Every delegation prompt to
rails-builder or rails-reviewer must begin with: "Read `.claude/skills/rails-playbook/SKILL.md`
first and follow its operating loop." Hold their reports to the playbook's gates:
- No uniqueness validation without a matching unique index in `db/schema.rb`; every FK
  and where-filtered column has an index.
- No N+1: association traversal in a view/serializer loop must have `includes`/`preload`
  at the query origin.
- The verification recipe's real command output is pasted (migrate + schema diff, tests,
  rubocop, boot check) — a summary is not verification.

## Deterministic hooks (installed with this team)
A PostToolUse hook (`.claude/hooks/ccteams-rails-check.mjs`) greps every edited file
for the playbook's mechanical failure patterns — SQL interpolation in `where`,
`update_attribute`/`update_column`, `save(validate: false)`, `default_scope`, params
mass-assignment, `Time.now`/`Date.today` — and feeds findings back to the editing
agent automatically. Treat hook feedback as a playbook gate: the builder fixes it in
the same turn or states in its report why the flagged line is intentional; the
reviewer confirms one or the other happened. The hook covers only grep-able rules —
it does not replace the reviewer's N+1 analysis or the test run.

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
