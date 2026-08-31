#!/usr/bin/env node
/**
 * ccteams frontend PostToolUse check — deterministic enforcement of the
 * frontend playbook's grep-able rules (accessibility and layout smells).
 * Findings go to stderr with exit code 2, which Claude Code feeds back to
 * the agent. Internal errors always exit 0.
 */

const CHECKED_EXT = /\.(tsx|jsx|html|vue|svelte|css|scss)$/;
const SKIP_PATH = /(node_modules|\.test\.|\.spec\.|__tests__|dist\/|build\/)/;

function check(filePath, src) {
  const findings = [];
  const isStyle = /\.(css|scss)$/.test(filePath);

  if (!isStyle) {
    // Clickable div/span (playbook #1).
    const clickable = src.match(/<(div|span)\b[^>]*\bonClick=/) || src.match(/<(div|span)\b[^>]*\@click=/);
    if (clickable) {
      findings.push(
        `onClick on a <${clickable[1]}>: not focusable, not Enter/Space-operable, silent to screen readers — use <button type="button"> (or <a href> if it navigates).`,
      );
    }

    // <img> without alt (playbook #4).
    if (/<img\b(?![^>]*\balt\s*=)[^>]*\/?>/.test(src)) {
      findings.push(
        `<img> without alt: meaningful images need real alt text; decorative ones need alt="" — never omit the attribute.`,
      );
    }
  }

  // Focus indicator removed without replacement (playbook #2).
  if (/outline:\s*['"]?(none|0)\b/.test(src) && !/:focus-visible/.test(src)) {
    findings.push(
      `outline: none without a :focus-visible replacement in this file: never remove a focus indicator without a visible substitute meeting 3:1 contrast.`,
    );
  }

  // z-index escalation (playbook #5).
  const z = src.match(/z-?[iI]ndex:\s*['"]?(\d{4,})/);
  if (z) {
    findings.push(
      `z-index ${z[1]}: escalation smell — find the stacking context (a parent with transform/opacity/filter/z-index traps children) or use the project's layer scale instead of outbidding.`,
    );
  }

  return findings;
}

async function main() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  // A matched Edit/Write payload always carries tool_input.file_path today.
  // If it comes back missing, that is not "irrelevant file" — our schema
  // assumption broke (hook input format drift). Exit 1: Claude Code surfaces
  // stderr of non-2 errors to the user, so drift is loud instead of a silent
  // no-op. Internal script errors still fail silent (catch -> exit 0) below.
  const filePath = input?.tool_input?.file_path;
  if (typeof filePath !== 'string' || filePath.length === 0) {
    process.stderr.write(
      'ccteams frontend check: hook payload had no tool_input.file_path — the hook input schema may have changed; checks are not running.\n',
    );
    process.exit(1);
  }
  if (!CHECKED_EXT.test(filePath) || SKIP_PATH.test(filePath)) return;

  const fs = await import('fs');
  if (!fs.existsSync(filePath)) return;
  const src = fs.readFileSync(filePath, 'utf8');

  const findings = check(filePath, src);
  if (findings.length === 0) return;

  const rel = input?.cwd && filePath.startsWith(input.cwd)
    ? filePath.slice(input.cwd.length + 1)
    : filePath;
  process.stderr.write(
    `ccteams frontend check — ${rel}:\n` +
      findings.map((f) => `  - ${f}`).join('\n') +
      `\nFix these now, or state in your report why each is intentional.\n`,
  );
  process.exit(2);
}

main().catch(() => process.exit(0));
