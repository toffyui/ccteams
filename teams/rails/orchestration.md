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
