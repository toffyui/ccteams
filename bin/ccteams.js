#!/usr/bin/env node
/**
 * ccteams — Claude Code agent-team package manager
 *
 * Commands:
 *   list [--json]   List available teams
 *   use <team>      Apply a team to the current project
 *   current         Show the currently-applied team
 *   upgrade         Upgrade ccteams to the latest version via npm
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { listTeams } from '../lib/teams.js';
import { readManifest } from '../lib/manifest.js';
import { useTeam } from '../lib/use.js';
import { maybeNotifyFromCache, refreshCacheInBackground } from '../lib/update-check.js';

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

const args = process.argv.slice(2);
const command = args[0];

// Determine whether to show update notifications for this invocation.
// Suppressed when: CI env, NO_UPDATE_NOTIFIER env, non-TTY stdout, --version, list --json.
const isJsonList = command === 'list' && args.includes('--json');
const isVersionCmd = command === '--version' || command === '-V' || command === 'version';
const suppressNotifier =
  !!process.env.NO_UPDATE_NOTIFIER ||
  !!process.env.CI ||
  !process.stdout.isTTY ||
  isVersionCmd ||
  isJsonList;

const currentVersion = getVersion();

// Fire-and-forget: fetch the registry in the background so the cache is warm for the
// next run. We never await this — it must not block or race with process.exit().
if (!suppressNotifier) {
  refreshCacheInBackground(currentVersion);
}

/**
 * Print a one-line update notice from the cache (synchronous, no network).
 * Call this right before every process.exit() on non-suppressed paths.
 */
function notifyIfUpdate() {
  if (!suppressNotifier) maybeNotifyFromCache(currentVersion);
}

// ── version ───────────────────────────────────────────────────────────────────
if (isVersionCmd) {
  console.log(`ccteams ${currentVersion}`);
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
    notifyIfUpdate();
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
    notifyIfUpdate();
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
  notifyIfUpdate();
  process.exit(0);
}

// ── current ──────────────────────────────────────────────────────────────────
if (command === 'current') {
  const manifest = readManifest(process.cwd());
  if (!manifest?.appliedTeam) {
    notifyIfUpdate();
    console.log('No team currently applied. Run: ccteams use <team>');
    process.exit(0);
  }
  console.log(`Current team: ${manifest.appliedTeam}`);
  console.log(`Applied at  : ${manifest.appliedAt}`);
  console.log(`Profile     : ${manifest.profile ?? 'balanced'}`);
  console.log(`Files placed: ${manifest.placedFiles?.length ?? 0}`);
  notifyIfUpdate();
  process.exit(0);
}

// ── use ──────────────────────────────────────────────────────────────────────
if (command === 'use') {
  // Parse position-agnostic: strip flags from the args list, whatever position
  // they appear in, then take the first remaining non-flag word as the team name.
  const agentTeamsFlag = args.includes('--agent-teams');

  // --profile <name> or --profile=<name>, anywhere in the arg list.
  let profile = 'balanced';
  const rest = [];
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--agent-teams') continue;
    if (a === '--profile') {
      profile = args[++i]; // may be undefined — validated by useTeam
      continue;
    }
    if (a.startsWith('--profile=')) {
      profile = a.slice('--profile='.length);
      continue;
    }
    rest.push(a);
  }
  const teamName = rest[0];

  if (!teamName || !profile) {
    console.error('Usage: ccteams use [--agent-teams] [--profile budget|balanced|max] <team-name>');
    process.exit(1);
  }

  const result = useTeam(teamName, process.cwd(), { agentTeams: agentTeamsFlag, profile });
  if (!result.success) {
    console.error(`Error: ${result.message}`);
    process.exit(1);
  }
  console.log(result.message);
  notifyIfUpdate();
  process.exit(0);
}

// ── upgrade ───────────────────────────────────────────────────────────────────
if (command === 'upgrade') {
  console.log(`Upgrading ccteams (current: ${currentVersion})...`);
  try {
    // stdio: 'inherit' pipes npm's output directly to the terminal so the user
    // can see progress and any permission errors in real time.
    execSync('npm install -g ccteams', { stdio: 'inherit' });
    // Re-read package.json after the install to report the version that was actually
    // installed, not the version that was running when upgrade was invoked.
    console.log(`\nccteams upgraded successfully. Run \`ccteams --version\` to confirm.`);
  } catch {
    console.error(
      '\nFailed to upgrade ccteams globally.\n' +
        'If this is a permissions error, try: sudo npm install -g ccteams\n' +
        'Or use a Node version manager (nvm, fnm) to avoid needing sudo.',
    );
    process.exit(1);
  }
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
  ccteams use <team> --profile <p>    Apply a team with a model profile (see below)
  ccteams current                     Show the currently-applied team
  ccteams upgrade                     Upgrade ccteams to the latest npm version
  ccteams --version                   Print the ccteams version

Flags:
  --agent-teams   Enable CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in .claude/settings.json
                  for the applied team. Position-agnostic: works before or after <team>.
                  Teams that declare "requiresAgentTeams" set this automatically.
  --profile <p>   Remap each agent's model at apply time. Teams ship with sonnet on the
                  execution tier (builders) and opus on the judgment tier (reviewers,
                  architects). Profiles:
                    budget    haiku builders, sonnet reviewers — cheapest
                    balanced  ship defaults (sonnet/opus) — the default
                    max       opus everywhere — highest quality

Hooks:
  Every stack-specific team bundles deterministic check hooks: scripts placed in
  .claude/hooks/ and wired into .claude/settings.json (PostToolUse). They grep every
  edit for the team's known failure patterns and feed findings straight back to the
  agent — enforcement instead of prompt-level asking. Removed cleanly on team switch;
  your own hooks in settings.json are never touched. (generalist/debug/research are
  stack-agnostic and ship none — their rules are judgment calls, not grep patterns.)

Agent teams mode:
  By default a team is orchestrated: one lead delegates to members one at a time,
  and they report back. With --agent-teams, members become parallel teammates that
  run at once and message each other directly — better for big, splittable work.
  It uses Claude Code's experimental agent-teams feature and takes effect after you
  restart the session.

Examples:
  ccteams list
  ccteams use frontend
  ccteams use next-ts --profile budget
  ccteams use go-api --agent-teams
  ccteams use --agent-teams rails
  ccteams current
  ccteams upgrade
`.trimStart();

if (command === undefined || command === '--help' || command === '-h') {
  notifyIfUpdate();
  console.log(usageText);
  process.exit(0);
}

console.error(`Unknown command: "${command}"\n`);
console.error(usageText);
process.exit(1);
