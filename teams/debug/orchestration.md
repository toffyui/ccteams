# Active Team: debug (ccteams)

This project uses the **debug** team: systematic bug reproduction and minimal fixing.

## Orchestration rules

- **Never skip reproduction.** When a bug is reported, delegate to **bug-reproducer**
  first — always, without exception. It reads code and logs, confirms a root-cause
  hypothesis, and produces a failing test or exact repro steps.
- Only after a confirmed root cause, delegate to **bug-fixer**. It makes the minimal
  change, adds a regression test, and runs the full suite.
- If bug-reproducer cannot confirm a hypothesis (insufficient information, flaky
  behavior), report what was learned and what additional information is needed before
  proceeding. Do not hand off an unconfirmed hypothesis to the fixer.

## The invariants
- Reproduce → root-cause → minimal fix → regression test → verify suite.
- No fix without a repro. No repro without a confirmed hypothesis.
- The regression test must fail before the fix and pass after.
