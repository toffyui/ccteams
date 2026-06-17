/**
 * use.js — implements `ccteams use <team>`.
 *
 * All paths under the user's project are resolved from process.cwd() so that
 * running `ccteams use frontend` from any directory affects that directory's .claude/.
 *
 * CLAUDE.md target decision: we always target ./CLAUDE.md (cwd root), NOT
 * .claude/CLAUDE.md. Rationale: the @import directive in CLAUDE.md is
 * project-level configuration that most users keep at the repo root; the
 * .claude/ subdirectory CLAUDE.md is for project-scoped agent configuration
 * that ccteams should not own. We create ./CLAUDE.md if it does not exist.
 *
 * settings.json target: <cwd>/.claude/settings.json (project-level settings).
 * ccteams only manages a single env key defined by AGENT_TEAMS_ENV. It JSON-merges
 * into the existing file, preserving all unrelated keys.
 *
 * Agent placement: agents are copied directly into .claude/agents/<file>.md.
 * Safety is provided by two mechanisms:
 *   1. The manifest (placedFiles array) tracks every file ccteams wrote, so on a
 *      team switch we delete ONLY those tracked files and never touch others.
 *   2. The collision guard (see step 2.8) aborts before any mutation if an
 *      incoming agent filename would overwrite a hand-written file that ccteams
 *      did not place itself.
 */

import fs from 'fs';
import path from 'path';
import { findTeam, listTeams } from './teams.js';
import { readManifest, writeManifest } from './manifest.js';

// Single source of truth for the experimental env var name.
// If Claude Code ever renames it, change here only.
const AGENT_TEAMS_ENV = 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS';

// The import line we append/check in the project's root CLAUDE.md.
const ACTIVE_TEAM_IMPORT = '@.claude/active-team.md';

/**
 * Read .claude/settings.json, returning {} if absent or unparseable.
 */
function readSettings(dotClaudeDir) {
  const p = path.join(dotClaudeDir, 'settings.json');
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    // Unparseable — return empty so we don't corrupt it further; write will overwrite.
    return {};
  }
}

/**
 * Write settings back to .claude/settings.json with 2-space indent + trailing newline.
 */
function writeSettings(dotClaudeDir, data) {
  const p = path.join(dotClaudeDir, 'settings.json');
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Apply a named team to the current project.
 * projectRoot defaults to process.cwd().
 * opts.agentTeams — user explicitly opted in with --agent-teams flag.
 *
 * Returns an object: { success, message }
 */
export function useTeam(teamName, projectRoot = process.cwd(), opts = {}) {
  const { agentTeams = false } = opts;
  // ── 0. Resolve the team ──────────────────────────────────────────────────
  const team = findTeam(teamName);
  if (!team) {
    const available = listTeams().map((t) => t.name).join(', ');
    return {
      success: false,
      message: `Unknown team "${teamName}". Available: ${available || '(none)'}`,
    };
  }

  // ── 1. Ensure .claude/agents/ exists ────────────────────────────────────
  const dotClaudeDir = path.join(projectRoot, '.claude');
  const agentsDir = path.join(dotClaudeDir, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });

  // ── 2. Read previous manifest (needed for guard and cleanup) ─────────────
  const manifest = readManifest(projectRoot);

  // Build a Set of absolute paths that ccteams placed last time. Files in this
  // set are safe to overwrite; files NOT in this set are hand-written.
  const prevPlacedSet = new Set(manifest?.placedFiles ?? []);

  // ── 2.5. Resolve incoming agent file list ────────────────────────────────
  const sourceAgentsDir = path.join(team.teamDir, 'agents');
  const agentFiles = fs.existsSync(sourceAgentsDir)
    ? fs.readdirSync(sourceAgentsDir).filter((f) => f.endsWith('.md'))
    : [];

  // ── 2.8. COLLISION GUARD — validate before any mutation ──────────────────
  // We compute the "protected" set NOW, before deleting anything, so the check
  // is based on the current disk state. A file is protected if it exists in
  // .claude/agents/ AND was NOT placed by ccteams last time (not in prevPlacedSet).
  // This is evaluated before any deletion so we never half-apply on failure.
  const collisions = agentFiles.filter((agentFile) => {
    const dest = path.join(agentsDir, agentFile);
    return fs.existsSync(dest) && !prevPlacedSet.has(dest);
  });

  if (collisions.length > 0) {
    const list = collisions.map((f) => `.claude/agents/${f}`).join(', ');
    return {
      success: false,
      message:
        `ccteams: refusing to overwrite hand-written agent(s): ${list}.\n` +
        `Rename or remove them, then retry.`,
    };
  }

  // ── 3. Remove previously ccteams-placed files ────────────────────────────
  // Deletion is driven entirely by the manifest's placedFiles paths — those
  // now point directly into .claude/agents/, so no subdir logic needed.
  if (manifest?.placedFiles) {
    for (const f of manifest.placedFiles) {
      if (fs.existsSync(f)) {
        fs.rmSync(f, { force: true });
      }
    }
  }

  // ── 3.5. Manage the experimental agent-teams env key in settings.json ────
  // OWNERSHIP RULE: ccteams only removes the key on switch if its OWN previous
  // manifest says it set it — a user's pre-existing hand-set flag is never
  // touched. We never remove what we didn't write.
  const settings = readSettings(dotClaudeDir);
  let agentTeamsFlagSet = false;

  // enableAgentTeams: true if the team requires it OR the user opted in with --agent-teams.
  const enableAgentTeams = team.requiresAgentTeams || agentTeams;

  if (enableAgentTeams) {
    // JSON-merge: set only our key inside env, preserve everything else.
    if (!settings.env || typeof settings.env !== 'object') {
      settings.env = {};
    }
    settings.env[AGENT_TEAMS_ENV] = '1';
    writeSettings(dotClaudeDir, settings);
    agentTeamsFlagSet = true;
  } else if (manifest?.agentTeamsFlagSet === true) {
    // Previous team set the flag and this one doesn't need it — clean up.
    if (settings.env && typeof settings.env === 'object') {
      delete settings.env[AGENT_TEAMS_ENV];
      // Drop the env object entirely if now empty to keep settings tidy.
      if (Object.keys(settings.env).length === 0) {
        delete settings.env;
      }
      writeSettings(dotClaudeDir, settings);
    }
  }

  // ── 4. Copy agents directly into .claude/agents/ ────────────────────────
  const placedFiles = [];

  for (const agentFile of agentFiles) {
    const src = path.join(sourceAgentsDir, agentFile);
    const dest = path.join(agentsDir, agentFile);
    fs.copyFileSync(src, dest);
    placedFiles.push(dest);
  }

  // ── 5. Place orchestration.md as .claude/active-team.md ─────────────────
  const orchSrc = path.join(team.teamDir, 'orchestration.md');
  const orchDest = path.join(dotClaudeDir, 'active-team.md');
  if (fs.existsSync(orchSrc)) {
    fs.copyFileSync(orchSrc, orchDest);
    placedFiles.push(orchDest);
  }

  // ── 6. Append @import to ./CLAUDE.md if not already present ─────────────
  // We target the repo-root CLAUDE.md (cwd/CLAUDE.md), not .claude/CLAUDE.md.
  // See module-level comment for rationale.
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  let claudeMdContent = fs.existsSync(claudeMdPath)
    ? fs.readFileSync(claudeMdPath, 'utf8')
    : '';

  // Match on a line boundary so a mid-prose mention doesn't suppress the directive.
  const hasImportLine = claudeMdContent
    .split('\n')
    .some((l) => l.trim() === ACTIVE_TEAM_IMPORT);
  if (!hasImportLine) {
    const separator =
      claudeMdContent.length > 0 && !claudeMdContent.endsWith('\n\n')
        ? claudeMdContent.endsWith('\n')
          ? '\n'
          : '\n\n'
        : '';
    claudeMdContent += separator + ACTIVE_TEAM_IMPORT + '\n';
    fs.writeFileSync(claudeMdPath, claudeMdContent, 'utf8');
  }

  // ── 7. Write manifest ────────────────────────────────────────────────────
  writeManifest(projectRoot, { appliedTeam: teamName, placedFiles, agentTeamsFlagSet });

  // ── 8. Return success with restart instruction ───────────────────────────
  const lines = [
    `Team "${teamName}" applied successfully.`,
    '',
    `  Agents placed : .claude/agents/ (${agentFiles.length} file${agentFiles.length !== 1 ? 's' : ''})`,
    `  Orchestration : .claude/active-team.md`,
    `  CLAUDE.md     : ${claudeMdPath}`,
  ];

  if (agentTeamsFlagSet) {
    const reason = team.requiresAgentTeams
      ? `required by the ${teamName} team`
      : 'you opted in with --agent-teams';
    lines.push(
      '',
      `  Agent teams   : ENABLED (${reason}; ${AGENT_TEAMS_ENV}=1 written to .claude/settings.json)`,
    );
  }

  lines.push(
    '',
    'ACTION REQUIRED: agents load at session start only.',
    'Restart your Claude Code session to activate the team:',
    '  /exit',
    '  claude',
  );

  return { success: true, message: lines.join('\n') };
}
