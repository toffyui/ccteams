#!/usr/bin/env node
/**
 * ccteams — Claude Code agent-team package manager
 *
 * Commands:
 *   list [--json]   List available teams
 *   use <team>      Apply a team to the current project
 *   current         Show the currently-applied team
 */

import { listTeams } from '../lib/teams.js';
import { readManifest } from '../lib/manifest.js';
import { useTeam } from '../lib/use.js';

const args = process.argv.slice(2);
const command = args[0];

// ── list ────────────────────────────────────────────────────────────────────
if (command === 'list') {
  const teams = listTeams();
  const jsonFlag = args.includes('--json');

  if (jsonFlag) {
    // Print ONLY valid JSON — no decorative text, nothing else.
    const output = teams.map(({ name, description, tags, requiresAgentTeams }) => ({
      name,
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

  console.log('Available teams:\n');
  for (const t of teams) {
    console.log(`  ${t.name}${t.requiresAgentTeams ? '  [requires agent teams]' : ''}`);
    console.log(`    ${t.description}`);
    if (t.tags.length > 0) {
      console.log(`    tags: ${t.tags.join(', ')}`);
    }
    console.log();
  }
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
  ccteams list                        List all available teams
  ccteams list --json                 Machine-readable JSON list (for scripts/slash commands)
  ccteams use <team>                  Apply a team to the current project
  ccteams use <team> --agent-teams    Apply a team AND enable Claude Code agent-teams mode
  ccteams current                     Show the currently-applied team

Flags:
  --agent-teams   Enable CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in .claude/settings.json
                  for the applied team. Position-agnostic: works before or after <team>.
                  Teams that declare "requiresAgentTeams" set this automatically.

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
