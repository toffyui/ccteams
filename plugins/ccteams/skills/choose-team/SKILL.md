---
name: choose-team
description: Pick and apply the best ccteams agent team for a described need using natural language — reads team metadata, selects the closest match, and applies it.
argument-hint: [natural language request]
allowed-tools: Bash
---

Select and apply the agent team that best matches the user's natural-language
request. Follow these steps exactly:

1. Run `ccteams list --json` via Bash. This returns a JSON array where each element
   has `name`, `description`, `tags`, and `requiresAgentTeams`.

2. Read the user's request and compare it against each team's `description` and
   `tags`. Identify the ONE team that is the best fit.

3. If NO team is a plausible match for the request, do NOT force a pick.
   Present the available teams and ask the user to choose directly — do not apply
   any team without a confident match.

4. If a good match is found, tell the user which team you chose and give a single
   sentence explaining why it fits their request.

5. Decide whether to pass `--agent-teams`:
   Pass `--agent-teams` if the user's request contains any of these phrases or clear
   synonyms: "in agent-teams mode", "as a team", "have them work in parallel",
   "collaborative", "team mode", "teammates", "member messaging", "parallel teammates".
   Also pass it if the chosen team has `requiresAgentTeams: true` in the JSON.
   Otherwise, run the plain form.

   `--agent-teams` enables Claude Code's experimental agent-teams feature
   (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in .claude/settings.json), which allows
   teammates to message each other directly. It is optional and opt-in — only set it
   when the user asked for it or the team itself requires it.

6. Run the appropriate command via Bash:
   - With flag:    `ccteams use <chosen-team-name> --agent-teams`
   - Without flag: `ccteams use <chosen-team-name>`

7. Relay ccteams's full output to the user — do not truncate or paraphrase it.

8. Explicitly repeat the session-restart instruction: agents load at session
   start only; the switch is NOT instantly active. The user must run `/exit`
   then `claude` to activate the new team.
