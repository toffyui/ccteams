#!/usr/bin/env node
/**
 * ccteams django PostToolUse check — deterministic enforcement of the django
 * playbook's grep-able rules. Findings go to stderr with exit code 2, which
 * Claude Code feeds back to the agent. Internal errors always exit 0.
 */

const CHECKED_EXT = /\.py$/;
const SKIP_PATH = /(\.venv\/|site-packages\/|\/migrations\/|test_|_test\.py$|\/tests?\/|conftest\.py$)/;

function check(filePath, src) {
  const findings = [];
  const lines = src.split('\n');

  lines.forEach((l, i) => {
    const n = i + 1;

    // Naive datetimes under USE_TZ (playbook #6).
    if (/\bdatetime\.now\s*\(\)/.test(l) || /\bdatetime\.today\s*\(\)/.test(l)) {
      findings.push(
        `line ${n}: datetime.now()/today() is naive under USE_TZ=True — use django.utils.timezone.now().`,
      );
    }

    // Serializer leaks every column (playbook #11).
    if (/fields\s*=\s*["']__all__["']/.test(l)) {
      findings.push(
        `line ${n}: fields = '__all__' serializes (and mass-assigns) every column, leaking new fields silently — use an explicit fields list with read_only where server-controlled.`,
      );
    }

    // SQL injection via raw/extra (playbook #12).
    if (/\.raw\s*\(\s*f["']/.test(l) || /\.raw\s*\(.*(%\s*\(|\.format\()/.test(l)) {
      findings.push(
        `line ${n}: .raw() with f-string/%/format interpolation — SQL injection. Pass params: .raw("... WHERE x = %s", [val]).`,
      );
    }
    if (/\.extra\s*\(/.test(l)) {
      findings.push(
        `line ${n}: .extra() is a deprecated injection-prone API — express it with the ORM or a parameterized .raw().`,
      );
    }

    // Bare except (shared Python failure; swallows more than you think).
    if (/^\s*except\s*:\s*$/.test(l)) {
      findings.push(
        `line ${n}: bare except: — catch the specific exception; a bare except hides real failures (and KeyboardInterrupt/SystemExit).`,
      );
    }

    // Business logic in signals (playbook #7).
    if (/@receiver\s*\(\s*post_save/.test(l)) {
      findings.push(
        `line ${n}: post_save signal — logic here is invisible at the call site and fires during tests/loaddata/bulk ops (and NOT during bulk_create/bulk_update). Prefer the caller or an overridden save(); keep the signal only if it must run for every save from every path.`,
      );
    }
  });

  return findings;
}

async function main() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  const filePath = input?.tool_input?.file_path;
  if (!filePath || !CHECKED_EXT.test(filePath) || SKIP_PATH.test(filePath)) return;

  const fs = await import('fs');
  if (!fs.existsSync(filePath)) return;
  const src = fs.readFileSync(filePath, 'utf8');

  const findings = check(filePath, src);
  if (findings.length === 0) return;

  const rel = input?.cwd && filePath.startsWith(input.cwd)
    ? filePath.slice(input.cwd.length + 1)
    : filePath;
  process.stderr.write(
    `ccteams django check — ${rel}:\n` +
      findings.map((f) => `  - ${f}`).join('\n') +
      `\nFix these now, or state in your report why each is intentional.\n`,
  );
  process.exit(2);
}

main().catch(() => process.exit(0));
