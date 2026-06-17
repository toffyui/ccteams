/**
 * teams.js — discover and read team packages from the ccteams source repo.
 *
 * Teams live at <ccteams-repo-root>/teams/<team-name>/ and are resolved relative
 * to this file's location (import.meta.url), so the path works regardless of
 * where the user runs ccteams from (process.cwd is the user's project, not ours).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve the ccteams source root from this file's location.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEAMS_DIR = path.resolve(__dirname, '..', 'teams');

/**
 * Return an array of all available team descriptors.
 * Each element: { name, description, tags, teamDir }
 */
export function listTeams() {
  if (!fs.existsSync(TEAMS_DIR)) {
    return [];
  }

  const entries = fs.readdirSync(TEAMS_DIR, { withFileTypes: true });
  const teams = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const teamDir = path.join(TEAMS_DIR, entry.name);
    const jsonPath = path.join(teamDir, 'team.json');
    if (!fs.existsSync(jsonPath)) continue;

    let meta;
    try {
      meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch {
      // Skip malformed team packages silently — user-visible error would be noise.
      continue;
    }

    teams.push({
      name: meta.name ?? entry.name,
      // Short one-line label for `list`; falls back to the description.
      summary: meta.summary ?? meta.description ?? '',
      description: meta.description ?? '',
      tags: meta.tags ?? [],
      // Optional: signals that CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS is required.
      requiresAgentTeams: meta.requiresAgentTeams === true,
      teamDir,
    });
  }

  return teams;
}

/**
 * Return a single team descriptor by name, or null if not found.
 */
export function findTeam(name) {
  return listTeams().find((t) => t.name === name) ?? null;
}
