---
status: resolved
phase: 03-bundle-scam-detection
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md]
started: 2026-03-13T00:00:00Z
updated: 2026-03-13T08:30:00Z
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
  status: resolved
  reason: "User reported: Command ran, confirmation accepted, but final status shows 'confirmed_passing' instead of 'suspected'. Wallet not moved to Flagged Wallets section."
  severity: major
  test: 2
  root_cause: |
    computeOverallStatus (src/detection/engine.ts:13-27) resolves the worst detector by
    scanning SEVERITY_ORDER = ['bundler', 'dev_wallet', 'wash_trader', 'sniper']
    (src/detection/thresholds.ts:90). When the wallet flag command inserts a flag row with
    detector = 'manual' (the default, set in wallet.ts:246), SEVERITY_ORDER.find() never
    matches it (line 18). The guard on line 19 returns 'confirmed_passing' immediately,
    discarding the manually inserted flag entirely. The wallets.detection_status is then
    written as 'confirmed_passing' (wallet.ts:306-307), overwriting or ignoring the user's
    intent. 'manual' is intentionally absent from the DetectorId type (types.ts:13) and
    SEVERITY_ORDER, so the function has no path to honour a manual flag.
  artifacts:
    - file: src/detection/engine.ts
      lines: "13-27"
      note: "computeOverallStatus — SEVERITY_ORDER.find() misses 'manual', falls through to confirmed_passing on line 19"
    - file: src/detection/thresholds.ts
      lines: "90"
      note: "SEVERITY_ORDER does not include 'manual'"
    - file: src/commands/wallet.ts
      lines: "284-307"
      note: "wallet flag command inserts detector='manual', then calls computeOverallStatus which silently discards it"
    - file: src/detection/types.ts
      lines: "13"
      note: "DetectorId type does not include 'manual' — intentional per project decision"
  missing:
    - "computeOverallStatus has no special-case branch for flags whose detector is not in SEVERITY_ORDER; it must treat a 'manual' flag as authoritative and use its confidence value directly rather than routing through SEVERITY_ORDER priority resolution"
  debug_session: ""

- truth: "wallet review shows all wallets with active (non-cleared) flags and their evidence"
  status: resolved
  reason: "User reported: Shows 'No wallets currently flagged for review' even after flagging a wallet in Test 2. Flagged wallet not appearing."
  severity: major
  test: 3
  root_cause: |
    wallet review (wallet.ts:118-124) queries wallets WHERE detection_status IN
    ('suspected', 'review', 'confirmed_suspicious'). Because computeOverallStatus silently
    returns 'confirmed_passing' for manual flags (see Test 2 root cause), the wallet's
    detection_status is never written as a flagged tier. The review query therefore finds
    zero matching rows and prints the empty-state message. This is a direct downstream
    consequence of the same root cause: the manual flag is inserted into wallet_flags but
    the status field on the wallets row is never updated to reflect it.
  artifacts:
    - file: src/commands/wallet.ts
      lines: "118-124"
      note: "wallet review filters by wallets.detection_status — relies entirely on that column being correct"
    - file: src/detection/engine.ts
      lines: "18-19"
      note: "computeOverallStatus returns confirmed_passing when no SEVERITY_ORDER detector matches, leaving detection_status wrong"
  missing:
    - "No independent issue in the review command itself; it is correct. The fix must be in computeOverallStatus so the wallets.detection_status column is set to the flagged tier before review queries it."
  debug_session: ""

- truth: "After manually flagging a wallet with --tier confirmed_suspicious, it is excluded from scoring and appears in Flagged Wallets section"
  status: resolved
  reason: "User reported: Wallet flagged with --tier confirmed_suspicious still shows confirmed_passing in wallet list. Remains in Clean Wallets, not excluded from scoring."
  severity: major
  test: 6
  root_cause: |
    Same root cause as Tests 2 and 3. computeOverallStatus returns 'confirmed_passing' for
    any flag whose detector is not in SEVERITY_ORDER, including 'manual'. The wallet's
    detection_status therefore stays 'confirmed_passing'. getEligibleWallets
    (engine.ts:100-105) selects wallets WHERE detection_status = 'confirmed_passing', so
    the flagged wallet remains in the scoring pool. wallet list also places the wallet in
    the Clean Wallets section because its status reads 'confirmed_passing'. The fix needed
    is a special case in computeOverallStatus: if any uncleared flag has a detector not
    found in SEVERITY_ORDER (i.e. a manual flag), treat its confidence value as the
    authoritative tier directly, bypassing the SEVERITY_ORDER resolution path.
  artifacts:
    - file: src/detection/engine.ts
      lines: "13-27"
      note: "computeOverallStatus — no path exists to return the confidence of a 'manual' flag"
    - file: src/detection/engine.ts
      lines: "100-105"
      note: "getEligibleWallets selects on confirmed_passing; a wallet whose status is wrong due to the bug stays in scoring pool"
    - file: src/commands/wallet.ts
      lines: "299-307"
      note: "wallet flag calls computeOverallStatus and writes the (incorrect) result back to wallets.detection_status"
  missing:
    - "computeOverallStatus needs a pre-pass (or post-pass) over uncleared flags that are not in SEVERITY_ORDER: pick the worst confidence tier among them (using TIER_ORDER which already exists on line 11) and factor that into the final result alongside the SEVERITY_ORDER resolution, so manual flags are never silently ignored"
  debug_session: ""
