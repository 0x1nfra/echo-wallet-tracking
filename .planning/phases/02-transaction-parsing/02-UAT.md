---
status: complete
phase: 02-transaction-parsing
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md]
started: 2026-03-13T00:00:00Z
updated: 2026-03-13T00:00:00Z
---

## Current Test

<!-- OVERWRITE each test - shows where we are -->

## Current Test

[testing complete]

## Tests

### 1. wallet add triggers history import
expected: Run `echo wallet add <address>` (or equivalent). The CLI fetches and imports the wallet's swap history. While in progress, status shows 'importing'. On completion, CLI confirms with "import complete" or similar.
result: pass

### 2. wallet list shows importing status in yellow
expected: While a wallet is being imported (or immediately after adding), run `echo wallet list`. The wallet in 'importing' state appears highlighted in yellow.
result: pass

### 3. wallet add --full-history flag
expected: Run `echo wallet add <address> --full-history`. The import runs without the 180-day time cap — fetching the wallet's full history back to genesis. Command completes successfully.
result: pass

### 4. crash recovery on restart
expected: If you kill the CLI mid-import (Ctrl+C), then restart the CLI, it automatically resumes the interrupted import for any wallet stuck in 'importing' state — without any manual intervention.
result: skipped

### 5. swaps stored after import
expected: After a wallet import completes, query the database (e.g., `sqlite3 data/echo.db "SELECT COUNT(*) FROM swaps WHERE wallet_address='<address>'"`) and see a non-zero row count — swaps were persisted correctly.
result: pass

### 6. FIFO cost basis applied to sells
expected: After import, inspect sell rows in the swaps table — sells with a matching prior buy should have non-null `cost_basis_sol` and `realized_pnl_sol`. Sells with no prior buy (orphan sells) should have NULL for both fields.
result: pass

## Summary

total: 6
passed: 5
issues: 0
pending: 0
skipped: 1
skipped: 0

## Gaps

[none yet]
