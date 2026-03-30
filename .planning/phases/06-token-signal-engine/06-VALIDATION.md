---
phase: 6
slug: token-signal-engine
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-15
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7 + ts-jest (existing — 139 tests green) |
| **Config file** | jest.config.cjs (existing) |
| **Quick run command** | `pnpm test -- --testPathPattern="scorer"` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

No Wave 0 required — test infrastructure is fully established from Phase 1.

---

## Sampling Rate

- **After every task commit:** Run targeted test pattern (see Per-Task Verification Map)
- **After every plan wave:** Run `pnpm test` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green + `pnpm exec tsc --noEmit` clean
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| migration-0005 | 06-01 | 1 | SGNL-01, SGNL-03 | integration (DB schema) | `pnpm test -- --testPathPattern="db"` | ✅ existing | ⬜ pending |
| scorer-tdd | 06-02 | 1 | SGNL-01, SGNL-03 | unit (pure function) | `pnpm test -- --testPathPattern="scorer"` | ❌ created by plan | ⬜ pending |
| engine-build | 06-03 T1 | 2 | SGNL-01, SGNL-02, SGNL-03 | integration (DB + scorer) | `pnpm test -- --testPathPattern="signals"` | ❌ created by plan | ⬜ pending |
| loop-cli-wire | 06-03 T2 | 2 | SGNL-02 | regression (full suite) | `pnpm test` | ✅ existing (loop.ts, cli.ts) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Automated Verify Coverage

All 4 tasks have automated verify commands. No task gaps — sampling continuity is maintained throughout both waves.

### Wave 1 (parallel — Plans 06-01 and 06-02)

- **06-01 Task 1**: `pnpm test -- --testPathPattern="db"` — verifies migration applied, no regressions
- **06-02 Feature**: `pnpm test -- --testPathPattern="scorer"` — TDD: RED then GREEN cycle

### Wave 2 (Plan 06-03, depends on Wave 1)

- **06-03 Task 1**: `pnpm test -- --testPathPattern="signals"` — engine integration tests
- **06-03 Task 2**: `pnpm test` — full regression suite after loop + CLI wiring

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `echo signal list` displays table output | SGNL-02 | Requires running process + real DB data | Start monitor with tracked wallets, wait 1 cycle, run `pnpm tsx src/cli.ts signal list` — table must appear |
| MonitorLoop prints signal log line each cycle | SGNL-02 | Requires running 30s cycle | Start `pnpm tsx src/cli.ts monitor start`, observe `[monitor] signals — N updated, M suppressed` after each cycle |
| Coordinated token scores lower than equivalent uncoordinated token | SGNL-03 | Requires real wallet flag data | Insert bundler flag for a holder, compare signal score before/after — coordinated version must score lower |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] No Wave 0 required — test infra established from Phase 1
- [x] No watch-mode flags in any verify command
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
