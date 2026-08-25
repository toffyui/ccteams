/**
 * manifest.js — read/write .claude/.ccteams-manifest.json in the user's project.
 *
 * The manifest tracks what ccteams placed so we can clean up on team switches
 * without touching hand-written agent files.
 *
 * Schema:
 * {
 *   "version": "2",                    // schema version, bump if format changes
 *   "appliedTeam": "<team-name>",      // name of the currently-applied team
 *   "appliedAt": "<ISO-8601>",         // timestamp for diagnostics
 *   "placedFiles": ["<rel-path>", ...],// every file ccteams wrote, for clean removal
 *   "agentTeamsFlagSet": <boolean>,    // true if ccteams wrote the experimental env key
 *   "profile": "<profile-name>"        // model profile the team was applied with
 * }
 *
 * v1 stored placedFiles as absolute paths, which broke when a project was
 * cloned to a different absolute location (the collision guard then treated
 * every ccteams-placed file as hand-written). v2 stores project-relative
 * paths; resolvePlacedFiles() handles reading both formats.
 */

import fs from 'fs';
import path from 'path';

const MANIFEST_VERSION = '2';

/**
 * Resolve the manifest path inside the given project root.
 */
export function manifestPath(projectRoot) {
  return path.join(projectRoot, '.claude', '.ccteams-manifest.json');
}

/**
 * Read the manifest from disk. Returns null if it does not exist or is invalid.
 */
export function readManifest(projectRoot) {
  const mPath = manifestPath(projectRoot);
  if (!fs.existsSync(mPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(mPath, 'utf8'));
  } catch {
    // Corrupted manifest — treat as absent so we start fresh.
    return null;
  }
}

/**
 * Resolve a manifest's placedFiles to absolute paths under projectRoot.
 *
 * v2 manifests store project-relative paths, so a project cloned or moved to
 * a new absolute location still resolves correctly. v1 manifests stored
 * absolute paths; when one was written under a different root (prefix does
 * not match projectRoot), re-root it on its ".claude/" segment — every file
 * ccteams has ever placed lives under <projectRoot>/.claude/, so this
 * migration is complete.
 */
export function resolvePlacedFiles(manifest, projectRoot) {
  const marker = `${path.sep}.claude${path.sep}`;
  return (manifest?.placedFiles ?? []).map((f) => {
    if (!path.isAbsolute(f)) return path.join(projectRoot, f);
    if (f.startsWith(projectRoot + path.sep)) return f;
    const i = f.indexOf(marker);
    return i === -1 ? f : path.join(projectRoot, f.slice(i + 1));
  });
}

/**
 * Write a new manifest to disk.
 * placedFiles may be passed as absolute paths; they are stored project-relative
 * (see resolvePlacedFiles for why).
 * agentTeamsFlagSet tracks whether ccteams injected the experimental env key so
 * we can remove it on switch without clobbering a user's pre-existing value.
 */
export function writeManifest(projectRoot, { appliedTeam, placedFiles, agentTeamsFlagSet = false, profile = 'balanced' }) {
  const mPath = manifestPath(projectRoot);
  const data = {
    version: MANIFEST_VERSION,
    appliedTeam,
    appliedAt: new Date().toISOString(),
    placedFiles: placedFiles.map((f) =>
      path.isAbsolute(f) ? path.relative(projectRoot, f) : f,
    ),
    agentTeamsFlagSet,
    profile,
  };
  fs.mkdirSync(path.dirname(mPath), { recursive: true });
  fs.writeFileSync(mPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}
