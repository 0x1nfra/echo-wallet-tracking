---
phase: 1
slug: data-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7 + ts-jest 29.1 (existing in package.json) |
| **Config file** | none — Wave 0 creates `jest.config.cjs` |
| **Quick run command** | `pnpm test -- --testPathPattern=tests/unit/db` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --testPathPattern=tests/unit/db`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| schema | 01 | 0 | DATA-01 | unit (in-memory DB) | `pnpm test -- --testPathPattern=tests/unit/db/schema` | ❌ W0 | ⬜ pending |
| wal | 01 | 0 | DATA-02 | unit | `pnpm test -- --testPathPattern=tests/unit/db/connection` | ❌ W0 | ⬜ pending |
| wallet-add | 01 | 1 | DATA-03 | unit | `pnpm test -- --testPathPattern=tests/unit/commands/wallet-add` | ❌ W0 | ⬜ pending |
| wallet-remove | 01 | 1 | DATA-04 | unit | `pnpm test -- --testPathPattern=tests/unit/commands/wallet-remove` | ❌ W0 | ⬜ pending |
| wallet-list | 01 | 1 | DATA-05 | unit | `pnpm test -- --testPathPattern=tests/unit/commands/wallet-list` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `jest.config.cjs` — ESM-compatible Jest config with ts-jest ESM preset + `--experimental-vm-modules`
- [ ] `tests/unit/db/setup.ts` — shared in-memory DB fixture (createTestDb helper)
- [ ] `tests/unit/db/schema.test.ts` — stubs for DATA-01 (table creation, insert/select per table)
- [ ] `tests/unit/db/connection.test.ts` — stubs for DATA-02 (WAL pragma)
- [ ] `tests/unit/commands/wallet-add.test.ts` — stubs for DATA-03
- [ ] `tests/unit/commands/wallet-remove.test.ts` — stubs for DATA-04
- [ ] `tests/unit/commands/wallet-list.test.ts` — stubs for DATA-05

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DB file persists across process restarts | DATA-01 | Requires process lifecycle | Run `echo wallet add <addr>`, kill process, restart, run `echo wallet list` — address must appear |
| WAL mode survives concurrent read during write | DATA-02 | Requires concurrent processes | Run write loop + simultaneous read in parallel; no SQLITE_BUSY errors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
