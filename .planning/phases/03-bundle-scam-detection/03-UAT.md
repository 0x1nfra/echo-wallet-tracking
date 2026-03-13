---
status: complete
phase: 03-bundle-scam-detection
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md]
started: 2026-03-13T00:00:00Z
updated: 2026-03-13T00:00:00Z
---

## Current Test

<!-- OVERWRITE each test - shows where we are -->

number: 6
name: flagged wallets excluded from scoring gate
expected: |
  [testing complete]

## Tests

### 1. wallet list shows two-section output
expected: Run `pnpm echo wallet list`. The output should show two distinct sections: "Clean Wallets" (wallets with confirmed_passing or pending status) and "Flagged Wallets" (wallets with suspected/review/confirmed_suspicious status). Each section header is visually distinct with status colors.
result: pass

### 2. wallet flag command manually flags a wallet
expected: Run `pnpm echo wallet flag <wallet_address> --tier suspected`. The command succeeds without error and the wallet now appears in the Flagged Wallets section when running `wallet list`. The flag should show detector as "manual".
result: issue
reported: "Command ran, confirmation accepted, but final status shows 'confirmed_passing' instead of 'suspected'. Wallet not moved to Flagged Wallets section."
severity: major

### 3. wallet review shows flagged wallets with evidence
expected: Run `pnpm echo wallet review`. The command shows all currently flagged wallets with their detection tier (suspected/review/confirmed_suspicious) and evidence summary. If no flagged wallets exist, shows an empty state message.
result: issue
reported: "Shows 'No wallets currently flagged for review' even after flagging a wallet in Test 2. Flagged wallet not appearing."
severity: major

### 4. wallet clear-flag prompts confirmation before clearing
expected: After flagging a wallet, run `pnpm echo wallet clear-flag <wallet_address>`. The command displays the current flag evidence, then asks for confirmation before clearing. After confirming, the wallet returns to Clean Wallets in `wallet list`.
result: pass
note: Two duplicate manual/suspected flag rows were shown during clear — wallet flag may insert duplicate rows

### 5. detection auto-triggers after wallet import
expected: Run `pnpm echo wallet add <address>` followed by the history import. After import completes, running `wallet list` shows the wallet with a detection_status (not null/empty) — either confirmed_passing or a flagged status. The detection ran automatically without a separate command.
result: pass

### 6. flagged wallets excluded from scoring gate
expected: This is internal but verifiable: after manually flagging a wallet with `pnpm echo wallet flag <address> --tier confirmed_suspicious`, it should NOT appear as eligible for scoring. This can be confirmed via the wallet review output — the wallet shows as flagged and its status in `wallet list` shows as a flagged variant, not confirmed_passing.
result: issue
reported: "Wallet flagged with --tier confirmed_suspicious still shows confirmed_passing in wallet list. Remains in Clean Wallets, not excluded from scoring."
severity: major

## Summary

total: 6
passed: 3
issues: 3
pending: 0
skipped: 0

## Gaps

- truth: "After running wallet flag --tier suspected, the wallet's detection_status is updated to suspected and it appears in Flagged Wallets section"
  status: failed
  reason: "User reported: Command ran, confirmation accepted, but final status shows 'confirmed_passing' instead of 'suspected'. Wallet not moved to Flagged Wallets section."
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "wallet review shows all wallets with active (non-cleared) flags and their evidence"
  status: failed
  reason: "User reported: Shows 'No wallets currently flagged for review' even after flagging a wallet in Test 2. Flagged wallet not appearing."
  severity: major
  test: 3
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "After manually flagging a wallet with --tier confirmed_suspicious, it is excluded from scoring and appears in Flagged Wallets section"
  status: failed
  reason: "User reported: Wallet flagged with --tier confirmed_suspicious still shows confirmed_passing in wallet list. Remains in Clean Wallets, not excluded from scoring."
  severity: major
  test: 6
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
