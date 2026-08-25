#!/usr/bin/env node
/**
 * ccteams go-api PostToolUse check — deterministic enforcement of the
 * go-api playbook's grep-able rules. Runs after every Edit/Write; findings
 * go to stderr with exit code 2, which Claude Code feeds back to the agent.
 *
 * Design rules (shared across all ccteams check scripts):
 *  - NEVER break the session: any internal error exits 0 silently.
 *  - Findings are nudges to the agent, not hard blocks.
 *  - Keep messages short: this text lands in the model's context every time.
 */

const CHECKED_EXT = /\.go$/;
const SKIP_PATH = /(vendor\/|_test\.go$)/;

function check(filePath, src) {
  const findings = [];
  const lines = src.split('\n');
  const isMainPkg = /^package main\b/m.test(src) || /(^|\/)main\.go$/.test(filePath);

  // http.Error without a return on the next statement — the handler keeps
  // running and writes a second body onto a committed 500 (playbook #12).
  for (let i = 0; i < lines.length; i++) {
    if (!/http\.Error\s*\(/.test(lines[i]) || /return/.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && (lines[j].trim() === '' || lines[j].trim().startsWith('//'))) j++;
    const next = lines[j]?.trim() ?? '';
    if (!next.startsWith('return')) {
      findings.push(
        `line ${i + 1}: http.Error(...) is not followed by return — the handler keeps executing and writes a second body onto the committed error response. Add return (ignore if this is already the last statement of the handler).`,
      );
    }
  }

  // Error wrapping with %v loses the chain (playbook #2).
  lines.forEach((l, i) => {
    if (/fmt\.Errorf\s*\(.*%v/.test(l) && /\berr\b/.test(l)) {
      findings.push(
        `line ${i + 1}: fmt.Errorf with %v on an error — use %w so errors.Is/As still work up the chain.`,
      );
    }
  });

  // Errors discarded with _ (playbook #1). `var _ Iface = ...` assertions are excluded.
  lines.forEach((l, i) => {
    if (/^\s*_\s*=\s*\w/.test(l) && !/^\s*var\s/.test(l)) {
      findings.push(
        `line ${i + 1}: value discarded with _ — if it is an error, handle it or add a comment stating why discarding is safe.`,
      );
    }
  });

  // context.Background() mid-request detaches from cancellation (playbook #10).
  if (!isMainPkg && /context\.Background\s*\(\)/.test(src)) {
    findings.push(
      `context.Background() outside package main: if this code runs inside a request, plumb the caller's ctx instead — Background() detaches from cancellation and deadlines. Ignore in setup/bootstrap code.`,
    );
  }

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
    `ccteams go-api check — ${rel}:\n` +
      findings.map((f) => `  - ${f}`).join('\n') +
      `\nFix these now, or state in your report why each is intentional.\n`,
  );
  process.exit(2);
}

main().catch(() => process.exit(0));
