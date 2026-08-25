# Active Team: django (ccteams)

This project uses the **django** team: Django + Django REST Framework, batteries-included,
convention-over-configuration.

## Orchestration rules

- For models, migrations, views, forms, admin, management commands, and Django plumbing —
  delegate to **django-builder**.
- For REST API work — serializers, viewsets, routers, permissions, authentication,
  pagination, throttling — delegate to **drf-api**. If a feature is plain server-rendered
  Django (templates, forms, admin), it stays with django-builder; if it exposes JSON over
  DRF, it goes to drf-api.
- Before any change is considered done, **django-reviewer** must verify it: N+1 queries,
  migration safety and reversibility, missing model/serializer validation, permission
  gaps, and the project's test runner (`pytest` or `manage.py test`). No change ships on
  the builder's word alone.
- Fat model / thin view. Business logic lives on the model, a model manager, or a service
  function — not in the view or serializer. Redirect builders accordingly.

## Stack defaults (unless the project's settings or lockfile override)
- Django version from `pyproject.toml` / `requirements.txt` / `Pipfile.lock`. Stay within
  that version's API.
- Migrations are generated with `makemigrations`, reviewed, and never auto-applied by an
  agent — the user runs `migrate` after review.
- `select_related` / `prefetch_related` for any query that crosses an association.
- DRF for JSON APIs; serializers own field-level validation, views own permissions.
- Settings split by environment; secrets via environment variables, never committed.

## Team playbook
This team ships `.claude/skills/django-playbook/SKILL.md`. Every delegation prompt to
django-builder, drf-api, or django-reviewer must begin with: "Read
`.claude/skills/django-playbook/SKILL.md` first and follow its operating loop." Hold their
reports to the playbook's gates:
- No model change without a matching migration (`makemigrations --check --dry-run` exits
  zero); no writable serializer with `fields = '__all__'`.
- No N+1: relation traversal in a template loop or nested/`SerializerMethodField`
  serializer must have `select_related`/`prefetch_related` on the originating queryset;
  every API view declares explicit `permission_classes`.
- The verification recipe's real command output is pasted (`check`, migration check,
  tests, lint) — a summary is not verification.

## Deterministic hooks (installed with this team)
A PostToolUse hook (`.claude/hooks/ccteams-django-check.mjs`) greps every edited file
for the playbook's mechanical failure patterns — naive `datetime.now()`,
`fields = '__all__'`, injection-prone `.raw()`/`.extra()`, bare `except:`,
`post_save` signals — and feeds findings back to the editing agent automatically.
Treat hook feedback as a playbook gate: the builder fixes it in the same turn or
states in its report why the flagged line is intentional; the reviewer confirms one
or the other happened. The hook covers only grep-able rules — it does not replace
the reviewer's N+1/permission analysis or the migration check.

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
