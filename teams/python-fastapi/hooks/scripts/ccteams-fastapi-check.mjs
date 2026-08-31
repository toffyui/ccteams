#!/usr/bin/env node
/**
 * ccteams python-fastapi PostToolUse check — deterministic enforcement of the
 * playbook's grep-able rules. Findings go to stderr with exit code 2, which
 * Claude Code feeds back to the agent. Internal errors always exit 0.
 */

const CHECKED_EXT = /\.py$/;
const SKIP_PATH = /(\.venv\/|site-packages\/|test_|_test\.py$|\/tests?\/|conftest\.py$|\/migrations\/|\/alembic\/)/;

function check(filePath, src) {
  const findings = [];
  const lines = src.split('\n');

  // Bare except swallows asyncio.CancelledError (playbook #8).
  lines.forEach((l, i) => {
    if (/^\s*except\s*:\s*$/.test(l)) {
      findings.push(
        `line ${i + 1}: bare except: — it swallows asyncio.CancelledError and breaks task cancellation. Catch the specific exception (or at minimum Exception, re-raising CancelledError).`,
      );
    }
  });

  // Pydantic v1 API in a v2 world (playbook #3/#4).
  lines.forEach((l, i) => {
    if (/@validator\s*\(/.test(l)) {
      findings.push(
        `line ${i + 1}: @validator is Pydantic v1 — use @field_validator (mode="before"/"after") in v2.`,
      );
    }
    if (/\.parse_obj\s*\(|\.parse_raw\s*\(/.test(l)) {
      findings.push(
        `line ${i + 1}: parse_obj/parse_raw are Pydantic v1 — use model_validate/model_validate_json in v2.`,
      );
    }
    if (/\.dict\s*\(\)/.test(l)) {
      findings.push(
        `line ${i + 1}: .dict() is Pydantic v1 — use .model_dump() in v2 (ignore if this is not a Pydantic model).`,
      );
    }
  });

  // Mutable default arguments (playbook #6).
  lines.forEach((l, i) => {
    if (/def\s+\w+\s*\(.*=\s*(\[\]|\{\})/.test(l)) {
      findings.push(
        `line ${i + 1}: mutable default argument — it is shared across ALL calls. Default to None and create the list/dict inside the function.`,
      );
    }
  });

  // Blocking calls inside an async module (playbook #1).
  if (/async def/.test(src)) {
    lines.forEach((l, i) => {
      if (/\btime\.sleep\s*\(/.test(l)) {
        findings.push(
          `line ${i + 1}: time.sleep in an async module blocks the event loop — use await asyncio.sleep(...).`,
        );
      }
      if (/\brequests\.(get|post|put|patch|delete|head|request)\s*\(/.test(l)) {
        findings.push(
          `line ${i + 1}: requests.* in an async module blocks the event loop — use httpx.AsyncClient (or run_in_executor if the sync call must stay).`,
        );
      }
    });
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
      'ccteams python-fastapi check: hook payload had no tool_input.file_path — the hook input schema may have changed; checks are not running.\n',
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
    `ccteams python-fastapi check — ${rel}:\n` +
      findings.map((f) => `  - ${f}`).join('\n') +
      `\nFix these now, or state in your report why each is intentional.\n`,
  );
  process.exit(2);
}

main().catch(() => process.exit(0));
