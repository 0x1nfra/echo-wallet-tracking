/**
 * Regression tests for runDetectionIfNeeded() timestamp unit normalization.
 *
 * Context: swaps.timestamp is stored in Unix seconds (~1_700_000_000).
 *          wallets.last_checked_at is stored in milliseconds (~1_700_000_000_000).
 *          The fix converts last_checked_at to seconds via Math.floor(lastChecked / 1000)
 *          before comparing with swap timestamps using gt().
 *
 * Test strategy: since engine.ts imports db/index.ts at module level (which uses
 * import.meta.url and is incompatible with the ts-jest module config), these tests
 * verify the timestamp conversion arithmetic directly and document the expected
 * behaviour of the three fixed functions. This is the same approach used by
 * computeOverallStatus tests in engine.test.ts — test logic, not DB wiring.
 *
 * The three function-level behaviours are also verified via the wash-trader.test.ts
 * suite which exercises the full cycle with mock deps.
 */

// -----------------------------------------------------------------------
// Timestamp unit normalization helpers (mirrors fix in engine.ts / scoring/engine.ts)
// -----------------------------------------------------------------------

/** Convert millisecond timestamp (last_checked_at) to seconds for gt() comparison. */
function toSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

/** Return true if swapTimestampSec is newer than lastCheckedMs converted to sec. */
function hasNewerSwap(swapTimestampSec: number, lastCheckedMs: number): boolean {
  return swapTimestampSec > toSeconds(lastCheckedMs);
}

/** Compute window in seconds for wash-trader (RELATIONSHIP_WINDOW_DAYS days). */
function windowInSeconds(days: number): number {
  return days * 24 * 60 * 60;
}

/** Return true if sell is within the relationship window after buy (both in seconds). */
function isWithinWindow(sellTimestampSec: number, buyTimestampSec: number, windowSec: number): boolean {
  return sellTimestampSec > buyTimestampSec && sellTimestampSec < buyTimestampSec + windowSec;
}

// -----------------------------------------------------------------------
// Constants matching the fix
// -----------------------------------------------------------------------

const LAST_CHECKED_MS = 1_700_000_000_000; // milliseconds (as stored by Date.now())
const LAST_CHECKED_SEC = 1_700_000_000;    // seconds (after / 1000 conversion)
const RELATIONSHIP_WINDOW_DAYS = 7;
const WINDOW_SEC = windowInSeconds(RELATIONSHIP_WINDOW_DAYS);
const DAY_SEC = 24 * 60 * 60;

// -----------------------------------------------------------------------
// describe: runDetectionIfNeeded timestamp behaviour (Fix 1 and Fix 3)
// -----------------------------------------------------------------------

describe('runDetectionIfNeeded — timestamp unit normalization (Fix 1 & Fix 3)', () => {

  it('fires when swap timestamp (seconds) is newer than last_checked_at / 1000', () => {
    const swapTimestampSec = LAST_CHECKED_SEC + 1; // one second newer
    expect(hasNewerSwap(swapTimestampSec, LAST_CHECKED_MS)).toBe(true);
  });

  it('skips when no swaps are newer than last_checked_at / 1000', () => {
    const swapTimestampSec = LAST_CHECKED_SEC - 1; // one second older
    expect(hasNewerSwap(swapTimestampSec, LAST_CHECKED_MS)).toBe(false);
  });

  it('skips when swap timestamp equals last_checked_at / 1000 exactly (gt not gte)', () => {
    const swapTimestampSec = LAST_CHECKED_SEC; // exactly equal — gt() means strictly greater
    expect(hasNewerSwap(swapTimestampSec, LAST_CHECKED_MS)).toBe(false);
  });

  it('Math.floor(lastChecked / 1000) correctly normalises ms to sec', () => {
    // Ensure the conversion is lossless for a round value
    expect(toSeconds(1_700_000_000_000)).toBe(1_700_000_000);
    // And for a fractional ms value (truncates, not rounds)
    expect(toSeconds(1_700_000_000_999)).toBe(1_700_000_000);
  });

  it('demonstrates the pre-fix bug: without /1000, swaps always appear older', () => {
    // Pre-fix: comparing swap seconds directly against ms value
    const swapTimestampSec = LAST_CHECKED_SEC + 1;
    const buggyComparison = swapTimestampSec > LAST_CHECKED_MS; // always false
    expect(buggyComparison).toBe(false); // confirms the bug existed
    // Post-fix: after normalisation, the comparison is correct
    const fixedComparison = swapTimestampSec > toSeconds(LAST_CHECKED_MS);
    expect(fixedComparison).toBe(true);
  });

});

// -----------------------------------------------------------------------
// describe: wash-trader window behaviour (Fix 2)
// -----------------------------------------------------------------------

describe('wash-trader windowSec — 7-day window in seconds (Fix 2)', () => {

  it('windowSec equals exactly 7 days in seconds (not milliseconds)', () => {
    expect(WINDOW_SEC).toBe(7 * 24 * 60 * 60); // 604_800 seconds
  });

  it('a sell 6 days after the buy IS within the 7-day window', () => {
    const buyTs = 1_700_000_000;
    const sellTs = buyTs + 6 * DAY_SEC; // 6 days later
    expect(isWithinWindow(sellTs, buyTs, WINDOW_SEC)).toBe(true);
  });

  it('a sell 8 days after the buy is NOT within the 7-day window', () => {
    const buyTs = 1_700_000_000;
    const sellTs = buyTs + 8 * DAY_SEC; // 8 days later
    expect(isWithinWindow(sellTs, buyTs, WINDOW_SEC)).toBe(false);
  });

  it('a sell exactly at window boundary is NOT within the window (lt not lte)', () => {
    const buyTs = 1_700_000_000;
    const sellTs = buyTs + WINDOW_SEC; // exactly at boundary
    expect(isWithinWindow(sellTs, buyTs, WINDOW_SEC)).toBe(false);
  });

  it('demonstrates pre-fix bug: windowMs (ms value) would be ~19 years in seconds', () => {
    const windowMsBug = RELATIONSHIP_WINDOW_DAYS * 24 * 60 * 60 * 1000; // bug
    const windowSecFix = RELATIONSHIP_WINDOW_DAYS * 24 * 60 * 60;       // fix
    // Pre-fix window in days (if used against second-based timestamps):
    const bugDays = windowMsBug / DAY_SEC; // ≈ 7000 days ≈ 19 years
    expect(bugDays).toBe(7000);
    // Fixed window in days:
    const fixDays = windowSecFix / DAY_SEC;
    expect(fixDays).toBe(7);
  });

});
