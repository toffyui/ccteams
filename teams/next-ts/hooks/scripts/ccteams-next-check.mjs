#!/usr/bin/env node
/**
 * ccteams next-ts PostToolUse check — deterministic enforcement of the
 * next-ts playbook's grep-able rules. Runs after every Edit/Write; findings
 * go to stderr with exit code 2, which Claude Code feeds back to the agent.
 *
 * Design rules:
 *  - NEVER break the session: any internal error exits 0 silently.
 *  - Findings are nudges to the agent, not hard blocks — the edit already
 *    happened; exit 2 on PostToolUse only injects feedback.
 *  - Keep messages short: this text lands in the model's context every time.
 */

const CHECKED_EXT = /\.(tsx|ts|jsx|js|mjs)$/;
const SKIP_PATH = /(node_modules|\.test\.|\.spec\.|__tests__|\.next\/)/;

function fileIsClient(src) {
  // "use client" must be the first statement; allow comments/whitespace above.
  const head = src.slice(0, 1000);
  return /^(\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*['"]use client['"]/.test(head);
}

function check(filePath, src) {
  const findings = [];
  const isClient = fileIsClient(src);
  const isTs = /\.(ts|tsx)$/.test(filePath);
  const isRouteFile = /(^|\/)app\/(.+\/)?(page|layout|template)\.(tsx|jsx|js)$/.test(
    filePath.replace(/\\/g, '/'),
  );

  if (isClient && isRouteFile) {
    findings.push(
      `route-level "use client": this ${/page\./.test(filePath) ? 'page' : 'layout/template'} and its entire import tree now render client-side. Push "use client" down to the smallest interactive leaf component instead.`,
    );
  }

  if (isClient) {
    const envLeak = src.match(/process\.env\.(?!NEXT_PUBLIC_|NODE_ENV\b)([A-Za-z_][A-Za-z0-9_]*)/);
    if (envLeak) {
      findings.push(
        `client file reads process.env.${envLeak[1]}: non-NEXT_PUBLIC_ env vars are undefined in the browser (or a secret leak if inlined). Read it on the server or rename it NEXT_PUBLIC_ only if it is truly public.`,
      );
    }
    if (/useEffect/.test(src) && /\bfetch\s*\(/.test(src)) {
      findings.push(
        `useEffect + fetch in a client file: if this loads initial data, fetch it in a Server Component with await and pass it down — useEffect fetching causes request waterfalls and layout flicker. Ignore if this is a genuine post-interaction fetch.`,
      );
    }
  } else if (/\bfetch\s*\(/.test(src) && !/(cache:|next:|revalidate|no-store|force-cache)/.test(src)) {
    findings.push(
      `fetch() without explicit cache intent in a server file: the default flipped between Next 14 (cached) and 15 (uncached). State it explicitly — { cache: 'no-store' }, { next: { revalidate: N } }, or { cache: 'force-cache' }.`,
    );
  }

  if (isTs) {
    if (/@ts-ignore/.test(src)) {
      findings.push(
        `@ts-ignore present: prefer @ts-expect-error with a one-line reason, or fix the type. An unexplained suppression will be rejected by the reviewer.`,
      );
    }
    if (/\bas any\b/.test(src)) {
      findings.push(
        `"as any" present: type the boundary properly (unknown + narrowing, a generic, or a precise type). If it must stay, add a written reason for the reviewer.`,
      );
    }
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
    `ccteams next-ts check — ${rel}:\n` +
      findings.map((f) => `  - ${f}`).join('\n') +
      `\nFix these now, or state in your report why each is intentional.\n`,
  );
  process.exit(2);
}

main().catch(() => process.exit(0));
