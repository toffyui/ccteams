#!/usr/bin/env node
/**
 * ccteams — Claude Code agent-team package manager
 *
 * Commands:
 *   list [--json]   List available teams
 *   use <team>      Apply a team to the current project
 *   current         Show the currently-applied team
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listTeams } from '../lib/teams.js';
import { readManifest } from '../lib/manifest.js';
import { useTeam } from '../lib/use.js';

const args = process.argv.slice(2);
const command = args[0];

// Read the version from package.json (single source of truth), resolved relative
// to this file so it works regardless of where ccteams is installed.
function getVersion() {
  try {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── version ───────────────────────────────────────────────────────────────────
if (command === '--version' || command === '-V' || command === 'version') {
  console.log(`ccteams ${getVersion()}`);
  process.exit(0);
}

// ── list ────────────────────────────────────────────────────────────────────
if (command === 'list') {
  const teams = listTeams();
  const jsonFlag = args.includes('--json');

  if (jsonFlag) {
    // Print ONLY valid JSON — no decorative text, nothing else.
    const output = teams.map(({ name, summary, description, tags, requiresAgentTeams }) => ({
      name,
      summary,
      description,
      tags,
      requiresAgentTeams,
    }));
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    process.exit(0);
  }

  if (teams.length === 0) {
    console.log('No teams found.');
    process.exit(0);
  }

  // Color follows the NO_COLOR / FORCE_COLOR conventions, then falls back to TTY
  // detection (so piped/captured output stays plain).
  const color = !process.env.NO_COLOR && (process.env.FORCE_COLOR ? true : !!process.stdout.isTTY);
  const bold = (s) => (color ? `\x1b[1;36m${s}\x1b[0m` : s); // bold cyan (team names)
  const dim = (s) => (color ? `\x1b[2m${s}\x1b[0m` : s); // dim (secondary text)

  const details = args.includes('--details') || args.includes('-d');

  if (details) {
    // Full view: name + complete description + tags, one block per team.
    console.log('Available teams:\n');
    for (const t of teams) {
      console.log(`  ${bold(t.name)}`);
      console.log(`    ${t.description}`);
      if (t.tags.length > 0) {
        console.log(`    ${dim('tags:')} ${dim(t.tags.join(', '))}`);
      }
      console.log();
    }
    console.log(dim('  Apply: ccteams use <team>    Optional: add --agent-teams to run members in parallel.'));
    process.exit(0);
  }

  // Compact view (default): name (bold cyan) + a short one-line summary. One row
  // per team, no wrapping, so the list stays scannable. `--details` shows the full
  // descriptions and tags.
  const nameWidth = Math.max(...teams.map((t) => t.name.length));

  console.log('Available teams:\n');
  for (const t of teams) {
    console.log(`  ${bold(t.name.padEnd(nameWidth))}  ${t.summary}`);
  }
  console.log(dim('\n  Apply: ccteams use <team>    Full details: ccteams list --details'));
  console.log(dim('  Optional: add --agent-teams to run a team’s members in parallel.'));
  process.exit(0);
}

// ── current ──────────────────────────────────────────────────────────────────
if (command === 'current') {
  const manifest = readManifest(process.cwd());
  if (!manifest?.appliedTeam) {
    console.log('No team currently applied. Run: ccteams use <team>');
    process.exit(0);
  }
  console.log(`Current team: ${manifest.appliedTeam}`);
  console.log(`Applied at  : ${manifest.appliedAt}`);
  console.log(`Files placed: ${manifest.placedFiles?.length ?? 0}`);
  process.exit(0);
}

// ── use ──────────────────────────────────────────────────────────────────────
if (command === 'use') {
  // Parse position-agnostic: strip --agent-teams from the args list, whatever
  // position it appears in, then take the first remaining non-flag word as the
  // team name.
  const agentTeamsFlag = args.includes('--agent-teams');
  const useArgs = args.slice(1).filter((a) => a !== '--agent-teams');
  const teamName = useArgs[0];

  if (!teamName) {
    console.error('Usage: ccteams use [--agent-teams] <team-name>');
    process.exit(1);
  }

  const result = useTeam(teamName, process.cwd(), { agentTeams: agentTeamsFlag });
  if (!result.success) {
    console.error(`Error: ${result.message}`);
    process.exit(1);
  }
  console.log(result.message);
  process.exit(0);
}

// ── no args / unknown command ────────────────────────────────────────────────
const usageText = `
ccteams — Claude Code agent-team package manager

Usage:
  ccteams list                        List all available teams (compact)
  ccteams list --details              List teams with full descriptions and tags
  ccteams list --json                 Machine-readable JSON list (for scripts/slash commands)
  ccteams use <team>                  Apply a team to the current project
  ccteams use <team> --agent-teams    Apply a team AND enable agent-teams mode
  ccteams current                     Show the currently-applied team
  ccteams --version                   Print the ccteams version

Flags:
  --agent-teams   Enable CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in .claude/settings.json
                  for the applied team. Position-agnostic: works before or after <team>.
                  Teams that declare "requiresAgentTeams" set this automatically.

Agent teams mode:
  By default a team is orchestrated: one lead delegates to members one at a time,
  and they report back. With --agent-teams, members become parallel teammates that
  run at once and message each other directly — better for big, splittable work.
  It uses Claude Code's experimental agent-teams feature and takes effect after you
  restart the session.

Examples:
  ccteams list
  ccteams use frontend
  ccteams use go-api --agent-teams
  ccteams use --agent-teams rails
  ccteams current
`.trimStart();

if (command === undefined || command === '--help' || command === '-h') {
  console.log(usageText);
  process.exit(0);
}

console.error(`Unknown command: "${command}"\n`);
console.error(usageText);
process.exit(1);
