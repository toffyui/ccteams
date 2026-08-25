#!/usr/bin/env node
/**
 * ccteams react-native PostToolUse check — deterministic enforcement of the
 * playbook's grep-able rules. Findings go to stderr with exit code 2, which
 * Claude Code feeds back to the agent. Internal errors always exit 0.
 */

const CHECKED_EXT = /\.(tsx|ts|jsx|js)$/;
const SKIP_PATH = /(node_modules|\.test\.|\.spec\.|__tests__|\/android\/|\/ios\/)/;

function check(filePath, src) {
  const findings = [];

  // .map inside a ScrollView mounts every item at once (playbook #1).
  if (/<ScrollView/.test(src) && /\.map\s*\(/.test(src)) {
    findings.push(
      `ScrollView + .map in the same file: if the list can grow, every item mounts at once — use FlatList (or FlashList with a measured estimatedItemSize). Ignore for short fixed lists.`,
    );
  }

  // Index as key breaks state/animation on insert/remove (playbook #3).
  if (/key=\{(index|i|idx)\}/.test(src) || /keyExtractor=.*=>.*\bindex\b/.test(src)) {
    findings.push(
      `array index used as key/keyExtractor: items lose state and animate wrongly when the array changes — use a stable unique ID from the data.`,
    );
  }

  // DOM APIs do not exist in RN (playbook #4).
  const dom = src.match(/\b(localStorage|sessionStorage|document\.(getElementById|querySelector)|window\.alert)\b/);
  if (dom) {
    findings.push(
      `${dom[1]} used: there is no DOM in React Native — persistence is AsyncStorage/expo-secure-store, alerts are Alert.alert, measurement is onLayout.`,
    );
  }

  // KeyboardAvoidingView behavior differs per platform (playbook #6).
  if (/behavior=["']padding["']/.test(src) && !/Platform/.test(src)) {
    findings.push(
      `KeyboardAvoidingView behavior="padding" without a Platform check: padding is the iOS shape; Android usually needs undefined (adjustResize handles it). Use Platform.OS === 'ios' ? 'padding' : undefined and test both platforms.`,
    );
  }

  // Inline renderItem defeats list memoization (playbook #2).
  if (/renderItem=\{\s*\(\s*\{?\s*item/.test(src) && !/useCallback/.test(src)) {
    findings.push(
      `inline renderItem arrow without useCallback: a new function reference every render defeats item memoization — hoist renderItem with useCallback and styles into StyleSheet.create.`,
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
    `ccteams react-native check — ${rel}:\n` +
      findings.map((f) => `  - ${f}`).join('\n') +
      `\nFix these now, or state in your report why each is intentional.\n`,
  );
  process.exit(2);
}

main().catch(() => process.exit(0));
