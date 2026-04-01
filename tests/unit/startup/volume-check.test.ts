import { validateVolumeMount, VolumeCheckError } from '../../../src/startup/volume-check.js';

/**
 * Tests for validateVolumeMount using dependency injection to avoid needing
 * jest.mock (which requires @jest/globals in ESM mode, not installed).
 *
 * Fake setTimeout is injected to avoid real delays.
 */

/** Build a fake setTimeout that resolves immediately (no real delays) */
function immediateTimeout(fn: () => void, _ms: number): NodeJS.Timeout {
  fn();
  return 0 as unknown as NodeJS.Timeout;
}

describe('validateVolumeMount', () => {
  it('Test 1: resolves immediately when directory exists', async () => {
    const dbPath = '/data/echo.db';
    let existsSyncCallCount = 0;

    await expect(
      validateVolumeMount(dbPath, {
        existsSync: () => { existsSyncCallCount++; return true; },
        setTimeout: immediateTimeout,
      }),
    ).resolves.toBeUndefined();

    // Only one call — no polling needed
    expect(existsSyncCallCount).toBe(1);
  });

  it('Test 2: polls up to 15 times (30s at 2s intervals) then throws VolumeCheckError', async () => {
    const dbPath = '/nonexistent-volume/data/echo.db';
    let existsSyncCallCount = 0;

    await expect(
      validateVolumeMount(dbPath, {
        existsSync: () => { existsSyncCallCount++; return false; },
        readdirSync: () => [],
        setTimeout: immediateTimeout,
      }),
    ).rejects.toBeInstanceOf(VolumeCheckError);

    // 1 initial check + 15 polled checks = 16 total
    expect(existsSyncCallCount).toBe(16);
  });

  it('Test 3: VolumeCheckError message includes expected path, directory listing, and fix hint', async () => {
    const dbPath = '/data/echo.db';

    let caughtError: unknown;
    try {
      await validateVolumeMount(dbPath, {
        existsSync: () => false,
        readdirSync: () => ['tmp', 'etc'],
        setTimeout: immediateTimeout,
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(VolumeCheckError);
    const err = caughtError as VolumeCheckError;
    expect(err.message).toContain('/data'); // expected directory
    expect(err.message).toContain('tmp'); // directory listing from parent
    expect(err.message).toContain('Set DATABASE_URL to a path on your Railway volume'); // fix hint
    expect(err.dbPath).toBe(dbPath);
  });

  it('Test 4: resolves when directory appears on second poll (late mount)', async () => {
    const dbPath = '/data/echo.db';
    let callCount = 0;

    await expect(
      validateVolumeMount(dbPath, {
        existsSync: () => {
          callCount++;
          return callCount >= 2; // first call returns false, second returns true
        },
        setTimeout: immediateTimeout,
      }),
    ).resolves.toBeUndefined();

    // Resolved after 2 calls: initial check (false) + first poll (true)
    expect(callCount).toBe(2);
  });
});
