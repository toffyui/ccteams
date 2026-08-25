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
import { findTeam, listTeams, resolveSkillDir } from './teams.js';
import { readManifest, writeManifest, resolvePlacedFiles } from './manifest.js';

// Single source of truth for the experimental env var name.
// If Claude Code ever renames it, change here only.
const AGENT_TEAMS_ENV = 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS';

// ── Model profiles ────────────────────────────────────────────────────────────
// Teams ship agents with a role encoded in their default model: `sonnet` marks
// the execution tier (builders, shippers), `opus` marks the judgment tier
// (reviewers, architects, advisors). A profile remaps each tier at apply time;
// the shipped files themselves never change.
export const PROFILES = {
  budget: { sonnet: 'haiku', opus: 'sonnet' },
  balanced: {}, // ship defaults as-is
  max: { sonnet: 'opus', opus: 'opus' },
};
const DEFAULT_PROFILE = 'balanced';

// Every hook artifact ccteams places lives at .claude/hooks/ccteams-*, and every
// hook entry it writes into settings.json references that path. This marker is
// the ownership signal: cleanup strips exactly the entries that contain it and
// never touches user-authored hooks.
const HOOK_MARKER = '.claude/hooks/ccteams-';

/**
 * Rewrite the `model:` line inside an agent file's YAML frontmatter according
 * to a profile mapping. Only the frontmatter block (between the leading `---`
 * fences) is touched; a `model:` mention in the body is left alone.
 */
export function applyProfileToAgent(content, profile) {
  const mapping = PROFILES[profile] ?? {};
  if (Object.keys(mapping).length === 0) return content;
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return content;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') break; // end of frontmatter
    const m = lines[i].match(/^model:\s*(\S+)\s*$/);
    if (m && mapping[m[1]]) {
      lines[i] = `model: ${mapping[m[1]]}`;
      break;
    }
  }
  return lines.join('\n');
}

/**
 * Remove every ccteams-owned hook entry from a settings.json `hooks` object,
 * in place. An entry is ours iff any of its commands references HOOK_MARKER.
 * Returns true if anything was removed.
 */
function stripCcteamsHooks(settings) {
  if (!settings.hooks || typeof settings.hooks !== 'object') return false;
  let removed = false;
  for (const event of Object.keys(settings.hooks)) {
    const entries = settings.hooks[event];
    if (!Array.isArray(entries)) continue;
    const kept = entries.filter(
      (entry) =>
        !(Array.isArray(entry?.hooks) &&
          entry.hooks.some((h) => typeof h?.command === 'string' && h.command.includes(HOOK_MARKER))),
    );
    if (kept.length !== entries.length) removed = true;
    if (kept.length === 0) delete settings.hooks[event];
    else settings.hooks[event] = kept;
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return removed;
}

// The import line we append/check in the project's root CLAUDE.md.
const ACTIVE_TEAM_IMPORT = '@.claude/active-team.md';

// team-lessons is the USER-OWNED home for learning-loop entries (lessons the
// team accumulates in this project). CONTRACT: ccteams scaffolds it once if
// absent and never tracks, overwrites, or deletes it — it must survive team
// switches, re-applies, and package updates. The name is reserved: teams may
// not ship a skill called "team-lessons".
const TEAM_LESSONS_SKILL_NAME = 'team-lessons';
const TEAM_LESSONS_TEMPLATE = `---
name: team-lessons
description: Project-specific lessons learned — failure-catalog entries accumulated via the learning loop. Owned by this project; ccteams never overwrites this file.
---

# Team Lessons (this project)

Durable, project-specific additions to the active team's playbook. ccteams
scaffolded this file once and will never touch it again — it survives team
switches and package updates.

Entries arrive via the learning loop: when a mistake surfaces that the
playbook did not predict, the orchestrator proposes an entry here in the
standard format. Keep it lean — before adding, check whether an existing
entry (here or in the playbook) already covers the case and sharpen that
instead. If a lesson is universal to the stack rather than specific to this
project, contribute it upstream to the team's playbook in the ccteams repo.

## Failure catalog — symptom → wrong instinct → correct move

(none yet)
`;

/**
 * Read .claude/settings.json. Returns {} if the file is absent, and null if it
 * exists but cannot be parsed — callers must abort rather than write, because
 * writing from an empty object would silently destroy the user's settings.
 */
function readSettings(dotClaudeDir) {
  const p = path.join(dotClaudeDir, 'settings.json');
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
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
 * opts.profile — model profile name (see PROFILES); defaults to "balanced".
 *
 * Returns an object: { success, message }
 */
export function useTeam(teamName, projectRoot = process.cwd(), opts = {}) {
  const { agentTeams = false, profile = DEFAULT_PROFILE } = opts;
  if (!PROFILES[profile]) {
    return {
      success: false,
      message: `Unknown profile "${profile}". Available: ${Object.keys(PROFILES).join(', ')}`,
    };
  }
  // ── 0. Resolve the team ──────────────────────────────────────────────────
  const team = findTeam(teamName);
  if (!team) {
    const available = listTeams().map((t) => t.name).join(', ');
    return {
      success: false,
      message: `Unknown team "${teamName}". Available: ${available || '(none)'}`,
    };
  }

  // ── 1. Ensure .claude/agents/ and .claude/skills/ exist ─────────────────
  const dotClaudeDir = path.join(projectRoot, '.claude');
  const agentsDir = path.join(dotClaudeDir, 'agents');
  const skillsDestRoot = path.join(dotClaudeDir, 'skills');
  const hooksDestDir = path.join(dotClaudeDir, 'hooks');
  // A plain file squatting on any of these paths would make mkdirSync throw a
  // raw EEXIST/ENOTDIR — turn that into a clean, actionable error instead.
  for (const p of [dotClaudeDir, agentsDir, skillsDestRoot]) {
    if (fs.existsSync(p) && !fs.statSync(p).isDirectory()) {
      return {
        success: false,
        message: `ccteams: "${path.relative(projectRoot, p)}" exists and is not a directory. Remove it and retry.`,
      };
    }
  }
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.mkdirSync(skillsDestRoot, { recursive: true });

  // ── 2. Read previous manifest (needed for guard and cleanup) ─────────────
  const manifest = readManifest(projectRoot);

  // Resolve what ccteams placed last time to absolute paths under THIS
  // projectRoot (handles v1 manifests written under a different root — see
  // resolvePlacedFiles). Files in this set are safe to overwrite; files NOT
  // in this set are hand-written.
  const prevPlacedFiles = resolvePlacedFiles(manifest, projectRoot);
  const prevPlacedSet = new Set(prevPlacedFiles);

  // ── 2.5. Resolve incoming agent file list ────────────────────────────────
  const sourceAgentsDir = path.join(team.teamDir, 'agents');
  const agentFiles = fs.existsSync(sourceAgentsDir)
    ? fs.readdirSync(sourceAgentsDir).filter((f) => f.endsWith('.md'))
    : [];

  // ── 2.6. Resolve effective skill list ────────────────────────────────────
  // working-method is always first; team.skills may add more (deduped).
  // The team-lessons name is reserved for the user-owned lessons file — a team
  // shipping a skill under that name would break the never-overwrite contract,
  // so it is skipped with a warning instead of placed.
  const skillWarnings = [];
  const rawSkillNames = ['working-method', ...team.skills.filter((s) => s !== 'working-method')]
    .filter((skillName) => {
      if (skillName === TEAM_LESSONS_SKILL_NAME) {
        skillWarnings.push(
          `  Warning: skill name "${TEAM_LESSONS_SKILL_NAME}" is reserved for the user-owned lessons file — skipped.`,
        );
        return false;
      }
      return true;
    });

  // Map each skill name to { skillName, srcDir } — filter out unresolvable ones
  // but collect a warning for each so we can surface it in the return message.
  const resolvedSkills = rawSkillNames.flatMap((skillName) => {
    const srcDir = resolveSkillDir(team, skillName);
    if (!srcDir) {
      skillWarnings.push(`  Warning: skill "${skillName}" not found — skipped.`);
      return [];
    }
    return [{ skillName, srcDir }];
  });

  // Build the full list of (srcFile → destFile) pairs for the incoming skills.
  // Flat skill dirs are the norm; recurse anyway in case a skill has subdirs.
  const incomingSkillFilePairs = [];
  for (const { skillName, srcDir } of resolvedSkills) {
    const destDir = path.join(skillsDestRoot, skillName);
    // Walk recursively to support potential nested files inside a skill dir.
    const walk = (dir, relBase) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const srcPath = path.join(dir, entry.name);
        const relPath = relBase ? path.join(relBase, entry.name) : entry.name;
        if (entry.isDirectory()) {
          walk(srcPath, relPath);
        } else {
          incomingSkillFilePairs.push({ src: srcPath, dest: path.join(destDir, relPath) });
        }
      }
    };
    walk(srcDir, '');
  }

  // ── 2.7. Resolve incoming hook artifacts ─────────────────────────────────
  // A team may ship hooks at <teamDir>/hooks/:
  //   hooks.json      — settings.json-shaped hook config (event → matcher entries)
  //   scripts/*.mjs   — check scripts, copied into .claude/hooks/
  // Every script must be named ccteams-* so the HOOK_MARKER ownership rule
  // holds; anything else is a packaging error and is skipped with a warning.
  const hooksSrcDir = path.join(team.teamDir, 'hooks');
  const hooksConfigPath = path.join(hooksSrcDir, 'hooks.json');
  let teamHooksConfig = null;
  if (fs.existsSync(hooksConfigPath)) {
    try {
      teamHooksConfig = JSON.parse(fs.readFileSync(hooksConfigPath, 'utf8'));
    } catch {
      skillWarnings.push(`  Warning: ${teamName}/hooks/hooks.json is not valid JSON — hooks skipped.`);
    }
  }
  const hooksScriptsDir = path.join(hooksSrcDir, 'scripts');
  const incomingHookFilePairs = [];
  if (teamHooksConfig && fs.existsSync(hooksScriptsDir)) {
    for (const f of fs.readdirSync(hooksScriptsDir)) {
      if (!fs.statSync(path.join(hooksScriptsDir, f)).isFile()) continue;
      if (!f.startsWith('ccteams-')) {
        skillWarnings.push(`  Warning: hook script "${f}" is not named ccteams-* — skipped.`);
        continue;
      }
      incomingHookFilePairs.push({
        src: path.join(hooksScriptsDir, f),
        dest: path.join(hooksDestDir, f),
      });
    }
  }

  // ── 2.8. COLLISION GUARD — validate before any mutation ──────────────────
  // We compute the "protected" set NOW, before deleting anything, so the check
  // is based on the current disk state. A file is protected if it exists in
  // .claude/agents/ AND was NOT placed by ccteams last time (not in prevPlacedSet).
  // This is evaluated before any deletion so we never half-apply on failure.
  const collisions = agentFiles.filter((agentFile) => {
    const dest = path.join(agentsDir, agentFile);
    return fs.existsSync(dest) && !prevPlacedSet.has(dest);
  });

  // Extend collision guard to incoming skill and hook dest files, same logic.
  const skillCollisions = incomingSkillFilePairs.filter(
    ({ dest }) => fs.existsSync(dest) && !prevPlacedSet.has(dest),
  );
  const hookCollisions = incomingHookFilePairs.filter(
    ({ dest }) => fs.existsSync(dest) && !prevPlacedSet.has(dest),
  );

  if (collisions.length > 0 || skillCollisions.length > 0 || hookCollisions.length > 0) {
    const agentList = collisions.map((f) => `.claude/agents/${f}`);
    const skillList = [...skillCollisions, ...hookCollisions].map(({ dest }) =>
      path.relative(projectRoot, dest),
    );
    const allConflicts = [...agentList, ...skillList].join(', ');
    return {
      success: false,
      message:
        `ccteams: refusing to overwrite hand-written file(s): ${allConflicts}.\n` +
        `Rename or remove them, then retry.`,
    };
  }

  // ── 2.9. Read settings.json BEFORE any mutation ──────────────────────────
  // If the file exists but is corrupt we abort here, while nothing has been
  // deleted yet: proceeding would later rewrite settings.json from scratch and
  // silently destroy whatever the user had in it.
  const settings = readSettings(dotClaudeDir);
  if (settings === null) {
    return {
      success: false,
      message:
        'ccteams: .claude/settings.json exists but is not valid JSON — fix or remove it, then retry.',
    };
  }

  // ── 3. Remove previously ccteams-placed files ────────────────────────────
  // Deletion is driven entirely by the manifest's placedFiles paths — those
  // now point directly into .claude/agents/ or .claude/skills/, no subdir
  // logic needed for file removal itself.
  for (const f of prevPlacedFiles) {
    if (fs.existsSync(f)) {
      fs.rmSync(f, { force: true });
    }
  }

  // After file removal, prune any now-empty directories under .claude/skills/.
  // We only remove empty dirs — non-empty dirs (hand-written content) are left alone.
  if (fs.existsSync(skillsDestRoot)) {
    for (const entry of fs.readdirSync(skillsDestRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillSubdir = path.join(skillsDestRoot, entry.name);
      // Recursive empty-dir pruner: removes only dirs that are (or become) empty.
      const pruneEmpty = (dir) => {
        for (const child of fs.readdirSync(dir, { withFileTypes: true })) {
          if (child.isDirectory()) pruneEmpty(path.join(dir, child.name));
        }
        if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
      };
      pruneEmpty(skillSubdir);
    }
    // Remove .claude/skills/ itself if now empty.
    if (fs.readdirSync(skillsDestRoot).length === 0) fs.rmdirSync(skillsDestRoot);
  }

  // Prune .claude/hooks/ if the removal above emptied it.
  if (fs.existsSync(hooksDestDir) && fs.readdirSync(hooksDestDir).length === 0) {
    fs.rmdirSync(hooksDestDir);
  }

  // ── 3.5. Manage ccteams-owned keys in settings.json ─────────────────────
  // OWNERSHIP RULE: ccteams only removes what it wrote itself. For the env key
  // that is manifest-tracked (a user's pre-existing hand-set flag is never
  // touched); for hook entries the ownership signal is the HOOK_MARKER path in
  // the command string, so user-authored hooks are never removed.
  // `settings` was read and validated in step 2.9, before any mutation.
  let settingsChanged = false;
  let agentTeamsFlagSet = false;

  // enableAgentTeams: true if the team requires it OR the user opted in with --agent-teams.
  const enableAgentTeams = team.requiresAgentTeams || agentTeams;

  if (enableAgentTeams) {
    // JSON-merge: set only our key inside env, preserve everything else.
    if (!settings.env || typeof settings.env !== 'object') {
      settings.env = {};
    }
    settings.env[AGENT_TEAMS_ENV] = '1';
    settingsChanged = true;
    agentTeamsFlagSet = true;
  } else if (manifest?.agentTeamsFlagSet === true) {
    // Previous team set the flag and this one doesn't need it — clean up.
    if (settings.env && typeof settings.env === 'object') {
      delete settings.env[AGENT_TEAMS_ENV];
      // Drop the env object entirely if now empty to keep settings tidy.
      if (Object.keys(settings.env).length === 0) {
        delete settings.env;
      }
      settingsChanged = true;
    }
  }

  // Strip the previous team's hook entries (marker-based, so this is correct
  // even when the previous manifest is missing), then merge this team's.
  if (stripCcteamsHooks(settings)) settingsChanged = true;
  let hookEventsMerged = [];
  if (teamHooksConfig && incomingHookFilePairs.length > 0) {
    if (!settings.hooks || typeof settings.hooks !== 'object') settings.hooks = {};
    for (const [event, entries] of Object.entries(teamHooksConfig)) {
      if (!Array.isArray(entries)) continue;
      if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
      settings.hooks[event].push(...entries);
      hookEventsMerged.push(event);
      settingsChanged = true;
    }
  }

  if (settingsChanged) writeSettings(dotClaudeDir, settings);

  // ── 4. Copy agents directly into .claude/agents/ ────────────────────────
  // The profile remaps each agent's `model:` frontmatter at copy time (see
  // PROFILES); "balanced" is a plain copy of the shipped defaults.
  const placedFiles = [];

  for (const agentFile of agentFiles) {
    const src = path.join(sourceAgentsDir, agentFile);
    const dest = path.join(agentsDir, agentFile);
    const content = applyProfileToAgent(fs.readFileSync(src, 'utf8'), profile);
    fs.writeFileSync(dest, content, 'utf8');
    placedFiles.push(dest);
  }

  // ── 4.5. Copy skill directories into .claude/skills/<skillName>/ ─────────
  const placedSkillNames = [];

  for (const { src, dest } of incomingSkillFilePairs) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    placedFiles.push(dest);
  }

  // Record skill names that were actually placed for the success message.
  for (const { skillName } of resolvedSkills) {
    placedSkillNames.push(skillName);
  }

  // ── 4.6. Copy hook scripts into .claude/hooks/ ───────────────────────────
  for (const { src, dest } of incomingHookFilePairs) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    placedFiles.push(dest);
  }

  // ── 4.8. Scaffold the user-owned team-lessons skill (once, never again) ──
  // Deliberately NOT pushed to placedFiles: the manifest must never own this
  // file, so switches and re-applies can never delete or overwrite it.
  const lessonsPath = path.join(skillsDestRoot, TEAM_LESSONS_SKILL_NAME, 'SKILL.md');
  let lessonsCreated = false;
  if (!fs.existsSync(lessonsPath)) {
    fs.mkdirSync(path.dirname(lessonsPath), { recursive: true });
    fs.writeFileSync(lessonsPath, TEAM_LESSONS_TEMPLATE, 'utf8');
    lessonsCreated = true;
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
  writeManifest(projectRoot, { appliedTeam: teamName, placedFiles, agentTeamsFlagSet, profile });

  // ── 8. Return success with restart instruction ───────────────────────────
  const lines = [
    `Team "${teamName}" applied successfully.`,
    '',
    `  Agents placed : .claude/agents/ (${agentFiles.length} file${agentFiles.length !== 1 ? 's' : ''})`,
    `  Model profile : ${profile}${profile === DEFAULT_PROFILE ? ' (default)' : ''}`,
    `  Skills placed : .claude/skills/ (${placedSkillNames.length} skill${placedSkillNames.length !== 1 ? 's' : ''}: ${placedSkillNames.join(', ')})`,
    `  Team lessons  : .claude/skills/team-lessons/SKILL.md (${lessonsCreated ? 'created' : 'preserved'} — user-owned, never overwritten)`,
    `  Orchestration : .claude/active-team.md`,
    `  CLAUDE.md     : ${claudeMdPath}`,
  ];

  if (hookEventsMerged.length > 0) {
    lines.push(
      `  Hooks placed  : .claude/hooks/ (${incomingHookFilePairs.length} script${incomingHookFilePairs.length !== 1 ? 's' : ''}; ${hookEventsMerged.join(', ')} wired in .claude/settings.json)`,
    );
  }

  // Surface any skill-resolution warnings inline in the success message.
  if (skillWarnings.length > 0) {
    lines.push('', ...skillWarnings);
  }

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
