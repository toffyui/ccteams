# Active Team: react-native (ccteams)

This project uses the **react-native** team: Expo + React Native + TypeScript.

## Orchestration rules

- For any new feature or any decision touching native capabilities (camera, push
  notifications, BLE, IAP, background tasks, permissions, EAS Build/Submit, store
  submission, or uncertainty about managed vs dev build): **start with rn-advisor**.
  It makes and explains the native-leaning decision, then hands off to rn-builder
  with a concrete instruction.
- For straightforward in-Expo UI work (a new screen, component, or styling change
  with no native uncertainty): go directly to **rn-builder**.
- Before any change is considered done, **rn-reviewer** must verify it. No change
  ships on the builder's word alone.

## Workflow

```
Native uncertainty?
  YES → rn-advisor (recommendation + checklist) → rn-builder (implement) → rn-reviewer (verify)
  NO  →                                            rn-builder (implement) → rn-reviewer (verify)
```

## Detecting the project type

- Assume **Expo managed workflow** unless `ios/` or `android/` directories are
  present in the repo root — those indicate a bare React Native project.
- Detect the router from the presence of an `app/` directory + `expo-router` in
  `package.json` (Expo Router), or `@react-navigation/native` (React Navigation).
- Detect the package manager from the lockfile before running any install command.

## Hard rules

- Nothing ships without rn-reviewer's PASS verdict.
- Prefer staying in Expo managed workflow. Any recommendation that forces a dev
  build or ejects from managed must be called out explicitly by rn-advisor before
  rn-builder implements it.
- rn-advisor is read-only — it produces recommendations, not code. Never ask it
  to write or edit files.
- Prefer editing existing files over creating new ones. Match the project's existing
  conventions before introducing new patterns.

## Stack defaults (unless the repo overrides them)

- TypeScript `strict`, no `any` at boundaries.
- Expo SDK modules over raw native APIs; community libs as a fallback when an
  Expo SDK equivalent does not exist.
- Expo Router (file-based, `app/` dir) if present; React Navigation otherwise.
- `StyleSheet.create` for static styles; `useSafeAreaInsets` / `<SafeAreaView>`
  for notch and home-indicator clearance.
- `FlatList` or `FlashList` for variable-length lists — never `.map` in `ScrollView`.

## Team playbook

This team ships `.claude/skills/react-native-playbook/SKILL.md`. Every delegation prompt
to rn-advisor, rn-builder, or rn-reviewer must begin with: "Read
`.claude/skills/react-native-playbook/SKILL.md` first and follow its operating loop."
When reviewing their reports, hold them to these playbook gates:
- Runtime was classified (Expo Go vs dev client) before any native change, and native
  deps/config-plugin changes state the rebuild requirement — no "install and reload".
- No `.map` over unbounded data in a `ScrollView`, and `FlatList`/`FlashList` use a
  stable `keyExtractor` (never index); safe-area insets used instead of hardcoded offsets.
- The builder actually ran `npx tsc --noEmit` and `npx expo-doctor` (output quoted), with
  per-platform manual checks named when devices weren't run.

## Deterministic hooks (installed with this team)
A PostToolUse hook (`.claude/hooks/ccteams-rn-check.mjs`) greps every edited file for
the playbook's mechanical failure patterns — `.map` inside `ScrollView`, index as
key, DOM APIs (`localStorage`/`document.*`), unconditional `behavior="padding"`,
inline `renderItem` without `useCallback` — and feeds findings back to the editing
agent automatically. Treat hook feedback as a playbook gate: the builder fixes it in
the same turn or states in its report why the flagged line is intentional; the
reviewer confirms one or the other happened. The hook covers only grep-able rules —
it does not replace the reviewer's dual-platform verification.

## Working method (mandatory — every agent on this team)

The full method is installed at `.claude/skills/working-method/SKILL.md`; read it
when in doubt. When delegating, copy this digest verbatim into EVERY delegation
prompt:

> Working method (non-negotiable):
> 1. Restate the goal in one sentence + a "done means" criterion before acting.
> 2. Read the actual files before forming opinions; verify every path/function you reference exists in this project.
> 3. Name your riskiest assumption and check it first, while it is cheap.
> 4. The diff is a claim; execution is evidence. Run the project's build/lint/tests and report their real output.
> 5. Label claims VERIFIED (ran it) / REASONED (read it) / ASSUMED (unchecked) — never upgrade one silently.
> 6. Before finishing: re-read the original request; every requirement met, nothing promised-but-undone.

Also, on every delegation and review:
- If `.claude/skills/team-lessons/SKILL.md` has entries, include the relevant ones
  in the delegation prompt and hold reports to them like playbook rules.
- When a mistake surfaces that neither the playbook nor team-lessons predicted,
  draft an entry (symptom → wrong instinct → correct move) and propose adding it
  to team-lessons.
