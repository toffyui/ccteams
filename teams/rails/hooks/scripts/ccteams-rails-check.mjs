#!/usr/bin/env node
/**
 * ccteams rails PostToolUse check — deterministic enforcement of the rails
 * playbook's grep-able rules. Findings go to stderr with exit code 2, which
 * Claude Code feeds back to the agent. Internal errors always exit 0.
 */

const CHECKED_EXT = /\.rb$/;
const SKIP_PATH = /(\/spec\/|\/test\/|db\/migrate\/|vendor\/)/;

function check(filePath, src) {
  const findings = [];
  const lines = src.split('\n');

  lines.forEach((l, i) => {
    const n = i + 1;

    // String interpolation inside a SQL condition — injection (playbook #5).
    if (/where\s*\(\s*["'].*#\{/.test(l) || /find_by_sql\s*\(\s*["'].*#\{/.test(l)) {
      findings.push(
        `line ${n}: string interpolation inside a SQL condition — SQL injection. Use hash conditions (where(name: name)) or placeholders (where("name = ?", name)).`,
      );
    }

    // Validation/callback-skipping writers (playbook #2). Receiver-less calls
    // (implicit self inside the model) count too, so no leading dot required.
    if (/\bupdate_attribute\s*\(/.test(l)) {
      findings.push(
        `line ${n}: update_attribute skips validations — use update! unless skipping is deliberate (then say so in a comment).`,
      );
    }
    if (/\bupdate_columns?\s*\(/.test(l)) {
      findings.push(
        `line ${n}: update_column skips validations, callbacks AND updated_at — use update! unless skipping is deliberate (then say so in a comment).`,
      );
    }
    if (/save\s*\(\s*validate:\s*false\s*\)/.test(l)) {
      findings.push(
        `line ${n}: save(validate: false) writes unvalidated data — fix the data or the validation; bypassing is only for known-legacy migrations, with a comment.`,
      );
    }

    // default_scope leaks into every query and join (playbook #3).
    if (/^\s*default_scope\b/.test(l)) {
      findings.push(
        `line ${n}: default_scope leaks into every query, association, and join — use an explicit named scope applied at call sites.`,
      );
    }

    // Mass assignment straight from params (playbook #9).
    if (/\.(new|create!?|update!?)\s*\(\s*params\[/.test(l)) {
      findings.push(
        `line ${n}: params passed straight into the model — mass-assignment hole. Use params.require(...).permit(...).`,
      );
    }

    // Zone-naive time (playbook #10).
    if (/\bTime\.now\b/.test(l) || /\bDate\.today\b/.test(l)) {
      findings.push(
        `line ${n}: Time.now/Date.today use the server zone — use Time.current/Date.current (zone-aware).`,
      );
    }
  });

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
      'ccteams rails check: hook payload had no tool_input.file_path — the hook input schema may have changed; checks are not running.\n',
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
    `ccteams rails check — ${rel}:\n` +
      findings.map((f) => `  - ${f}`).join('\n') +
      `\nFix these now, or state in your report why each is intentional.\n`,
  );
  process.exit(2);
}

main().catch(() => process.exit(0));
