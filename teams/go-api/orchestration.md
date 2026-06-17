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
