# Active Team: research (ccteams)

This project uses the **research** team: technical evaluation before implementation.

## Orchestration rules

- Use **tech-researcher** for any question of the form "which X", "compare A vs B",
  "should we use Y", or "what are the tradeoffs of Z" — before any builder starts work.
- tech-researcher produces a written recommendation only. It does not write code,
  edit files, or make implementation decisions beyond the recommendation.
- After a recommendation is accepted, switch to the appropriate implementation team
  (e.g., `ccteams use go-api`) and hand the decision there.

## When NOT to use this team
- You have already decided on an approach and need it implemented — use a builder team.
- The question is about a bug in existing code — use the debug team.
- The question requires writing or modifying code to answer (e.g., a performance
  spike) — use a builder team for the spike, then return here if needed.
