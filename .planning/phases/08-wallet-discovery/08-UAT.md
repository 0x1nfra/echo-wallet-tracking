---
status: testing
phase: 08-wallet-discovery
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md
started: 2026-03-25T00:00:00Z
updated: 2026-03-25T00:00:00Z
---

## Current Test

number: 2
name: wallet discover --dry-run
expected: |
  Running `wallet discover <some-mint-address> --dry-run` completes without adding
  any wallets to the DB and prints a summary table with a "DRY RUN" notice —
  candidates are evaluated but no rows inserted.
awaiting: user response

## Tests

### 1. wallet discover command exists
expected: Running `npx ts-node src/cli.ts wallet discover --help` shows the discover subcommand with --min-score and --dry-run flags listed in usage output.
result: pass

### 2. wallet discover --dry-run
expected: Running `wallet discover <some-mint-address> --dry-run` completes without adding any wallets to the DB and prints a summary table with a "DRY RUN" notice — candidates are evaluated but no rows inserted.
result: [pending]

### 3. wallet list shows Probationary Wallets section
expected: Running `wallet list` shows three sections: Active Wallets, Flagged Wallets, and a separate Probationary Wallets table. Probationary wallets do NOT appear in the Active or Flagged sections.
result: [pending]

### 4. Dashboard Active + Probationary sections
expected: Opening the dashboard in a browser shows two wallet table sections: "Active Wallets" and "Probationary Wallets (excluded from signals)". Probationary wallets appear only in the second section.
result: [pending]

### 5. /api/wallets response shape
expected: A GET request to `/api/wallets` returns a JSON object with two keys: `{ active: [...], probationary: [...] }` — not a flat array. Each entry includes a `probation_until` field.
result: [pending]

### 6. Probationary wallets excluded from token signals
expected: A wallet with an active probation_until timestamp in the future does NOT appear in the smart wallet count for token signals — its holdings are invisible to the signal engine until probation expires.
result: [pending]

### 7. wallet discover real run (above threshold accepted)
expected: Running `wallet discover <mint>` without --dry-run finds early buyers, scores them, and wallets scoring >= 70 are added to the tracker in probationary status. The CLI prints a table showing added/rejected/already-tracked counts.
result: [pending]

## Summary

total: 7
passed: 1
issues: 0
pending: 6
skipped: 0

## Gaps

[none yet]
