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
