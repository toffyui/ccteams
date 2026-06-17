# ccteams — Agent-Team Package Manager for Claude Code

Switch between pre-built Claude Code agent teams like `nvm` switches Node versions. An **agent team** is a bundle of subagents (with specific roles, expertise, and behaviors) plus orchestration rules that control how they collaborate — managed as a single unit in your project's `.claude/` directory.

## Two parts, two installs

ccteams ships as **two independent components** you install separately. Both are needed for the full experience:

| Component | What it does | How you get it |
|-----------|-------------|---|
| **CLI binary** | Commands to list, select, and apply teams | `npm install -g ccteams` (via npm) |
| **Claude Code plugin** | Slash commands for the same tasks inside Claude Code | Marketplace: `/plugin marketplace add toffyui/ccteams` + `/plugin install ccteams@ccteams` |

Installing the npm CLI **alone** does not give you the slash commands. Installing the plugin **alone** does not give you the `ccteams` command-line tool. You need both to use ccteams fully.

## Install

### Step 1: Install the CLI

```bash
npm install -g ccteams
ccteams list
```

Verify it prints available agent teams.

### Step 2: Install the Claude Code plugin

In Claude Code, run:

```
/plugin marketplace add toffyui/ccteams
/plugin install ccteams@ccteams
/reload-plugins
```

Or restart Claude Code. The slash commands `/ccteams:list-teams`, `/ccteams:use-team`, and `/ccteams:choose-team` will then be available.

## Usage

### Command Line (CLI)

```bash
ccteams list              # Show all available teams
ccteams list --json       # JSON output of teams
ccteams current           # Show the currently active team (if any)
ccteams use <team-name>   # Apply a team to the current directory
```

### Claude Code (Slash commands)

```
/ccteams:list-teams                    # List available teams
/ccteams:use-team <team-name>          # Apply a team
/ccteams:choose-team <natural-language> # Find and apply a team by description ("for backend work", "frontend-focused", etc.)
```

## Available teams

ccteams ships with these teams out of the box. Each is a builder + reviewer pair (except `research`, which is a single read-only researcher).

| Team | What it's for |
|------|---------------|
| `generalist` | Stack-agnostic, end-to-end feature team: scope → design → build → QA → ship. Use when no stack-specific team fits or for general cross-stack work. |
| `next-ts` | Next.js (App Router) + TypeScript + Tailwind — RSC, Server Actions, type-safe data fetching, accessible UI. |
| `frontend` | Framework-agnostic UI/UX and accessibility — UI work that isn't Next.js-specific, or focused on a11y/responsive/UX quality. |
| `go-api` | Go HTTP API backend — idiomatic services with `net/http` and `database/sql`. |
| `python-fastapi` | Python FastAPI + Pydantic v2 — async HTTP APIs with full type coverage and validation. |
| `rails` | Ruby on Rails — ActiveRecord, convention-over-configuration, the full Rails stack. |
| `debug` | Stack-agnostic bug hunting — reproduce → root-cause → minimal fix → regression test. |
| `research` | Stack-agnostic technical research — compare options and produce a written recommendation. Writes no code. |

Run `ccteams list` for the full descriptions and tags, or `/ccteams:choose-team <what you need>` to let Claude pick one for you.

## One team per session (and monorepos)

ccteams applies **one team per project at a time**. `ccteams use <team>` is an exclusive switch — like `nvm` switching Node versions — and applying a new team cleanly replaces the previous one.

This is partly a Claude Code constraint: subagents in `.claude/agents/` are **global to the project** and cannot be scoped to a subdirectory. You can't, for example, have the `next-ts` team active only in `apps/web/` and `go-api` only in `apps/api/` at the same time with isolation.

**Monorepo workaround:** pick the team that matches the area you're actively working on. Claude Code loads `CLAUDE.md` files along the path to the files you're editing, so launching `claude` from the subdirectory you're working in gives you that subtree's `CLAUDE.md` context — but the applied team's agents themselves remain available repo-wide.

## IMPORTANT: Session restart required

After running `ccteams use`, `/ccteams:use-team`, or `/ccteams:choose-team`, **you must restart Claude Code** for the new agent team to load. The agents are instantiated at session start, not mid-session.

**To restart:** type `/exit` (or close Claude Code) and start a new session.

## How teams are applied to your project

When you apply a team with `ccteams use <team>` or `/ccteams:use-team <team>`:

1. The team's agent definitions are copied into `.claude/agents/`.
2. A `.claude/active-team.md` file is created, documenting the active team and its purpose.
3. Your project's `.claude/CLAUDE.md` is updated with an import statement (`@.claude/active-team.md`) to include the team's orchestration rules.
4. A `.claude/.ccteams-manifest.json` is written to track which team is active and allow clean switching.
5. If the team requires experimental agent-team features (member messaging, collaboration), `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is automatically set in `.claude/settings.json`.

ccteams includes a **collision guard**: it will refuse to apply a team if any of its agents share a name with agents you've written by hand in `.claude/agents/`. This prevents accidental overwrites.

## Committing `.claude/` — your choice

You have two options:

**Option A (shared teams):** Commit `.claude/agents/`, `.claude/active-team.md`, and `.claude/.ccteams-manifest.json` to git. Teammates pulling the repo will automatically have the same team active.

**Option B (local teams):** Add `.claude/agents/`, `.claude/active-team.md`, and `.claude/.ccteams-manifest.json` to `.gitignore`. Each developer can run `ccteams use` locally to activate their preferred team.

**Recommendation:** If your project benefits from consistent team composition (e.g., a shared code style or mandatory QA agents), commit the team. Otherwise, keep it local.

## Creating your own agent team

An agent team lives in `teams/<name>/`:

```
teams/<name>/
├── team.json               # Metadata: name, description, tags, optional flags
├── orchestration.md        # The CLAUDE.md rules to import (defines roles, goals, behavior)
└── agents/
    ├── agent1.md           # YAML frontmatter + agent system prompt
    ├── agent2.md
    └── ...
```

### `team.json` schema

```json
{
  "name": "my-team",
  "description": "A short pitch of what this team does",
  "tags": ["backend", "api", "performance"],
  "requiresAgentTeams": false
}
```

Set `"requiresAgentTeams": true` if your team uses agent-to-agent messaging or collaborative member features.

### Agent files (`.md`)

Each agent file is a standard Claude Code subagent: YAML frontmatter (`name`, `description`, and optional `tools`) followed by its system prompt:

```markdown
---
name: my-agent
description: Backend API specialist. Use for building and reviewing REST/GraphQL endpoints, data layers, and integrations.
tools: Read, Write, Edit, Bash, Glob, Grep
---

You are a Python backend expert. Your job is to...
```

The `description` is what Claude uses to decide when to delegate to this agent, so make it specific. Omit `tools` to inherit all available tools.

For examples to copy from, see `teams/next-ts/` (a stack-specific team) and `teams/debug/` (a stack-agnostic team). `next-ts/` is the cleanest reference for the builder + reviewer shape.

### Orchestrated vs. collaborative teams

All teams that ship today are **orchestrated**: one lead delegates to specialized subagents that report back independently. This is the simple, predictable default.

ccteams also supports **collaborative** teams — where subagents message each other directly — via `"requiresAgentTeams": true` in `team.json`. That relies on Claude Code's experimental agent-teams feature (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), which ccteams sets automatically in `.claude/settings.json` when you apply such a team. No collaborative team ships by default, but the format supports authoring one.

## Development / local testing

### Test the plugin locally (session-only)

```bash
claude --plugin-dir ./plugins/ccteams
```

This loads the plugin for the current session only — no permanent install. Useful for development.

### Test the CLI locally

```bash
npm install -g .
ccteams list
```

Installs the CLI from the repo's current source.

## License

MIT © toffyui. See [LICENSE](./LICENSE) for the full text.
