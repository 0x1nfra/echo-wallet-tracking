import path from 'path';
import { validateVolumeMount, VolumeCheckError } from '../../../src/startup/volume-check.js';

jest.useFakeTimers();

describe('validateVolumeMount', () => {
  const existingSyncOriginal = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.useFakeTimers();
  });

  it('Test 1: resolves immediately when directory exists', async () => {
    // Use a directory that is guaranteed to exist on the test machine
    const dbPath = path.join(process.cwd(), 'existing-dir', 'echo.db');
    const dir = path.dirname(dbPath);

    const fsMock = await import('fs');
    const existsSyncSpy = jest.spyOn(fsMock, 'existsSync').mockReturnValue(true);

    const promise = validateVolumeMount(dbPath);
    // Should resolve without advancing timers
    await expect(promise).resolves.toBeUndefined();

    existsSyncSpy.mockRestore();
  });

  it('Test 2: polls every 2s up to 30s then throws VolumeCheckError', async () => {
    const dbPath = '/nonexistent-volume/data/echo.db';

    const fsMock = await import('fs');
    const existsSyncSpy = jest.spyOn(fsMock, 'existsSync').mockReturnValue(false);
    const readdirSyncSpy = jest.spyOn(fsMock, 'readdirSync').mockReturnValue([] as any);

    let error: unknown;
    const promise = validateVolumeMount(dbPath).catch((err: unknown) => {
      error = err;
    });

    // Advance through all 15 polling intervals (2s each = 30s total)
    for (let i = 0; i < 15; i++) {
      await Promise.resolve();
      jest.advanceTimersByTime(2000);
    }
    await Promise.resolve();
    await promise;

    expect(error).toBeInstanceOf(VolumeCheckError);
    existsSyncSpy.mockRestore();
    readdirSyncSpy.mockRestore();
  });

  it('Test 3: VolumeCheckError message includes expected path, directory listing, and fix hint', async () => {
    const dbPath = '/data/echo.db';

    const fsMock = await import('fs');
    const existsSyncSpy = jest.spyOn(fsMock, 'existsSync').mockReturnValue(false);
    const readdirSyncSpy = jest.spyOn(fsMock, 'readdirSync').mockReturnValue(['tmp', 'etc'] as any);

    let caughtError: unknown;
    const promise = validateVolumeMount(dbPath).catch((err: unknown) => {
      caughtError = err;
    });

    for (let i = 0; i < 15; i++) {
      await Promise.resolve();
      jest.advanceTimersByTime(2000);
    }
    await Promise.resolve();
    await promise;

    expect(caughtError).toBeInstanceOf(VolumeCheckError);
    const err = caughtError as VolumeCheckError;
    expect(err.message).toContain('/data'); // expected directory
    expect(err.message).toContain('tmp'); // directory listing
    expect(err.message).toContain('Set DATABASE_URL to a path on your Railway volume'); // fix hint
    expect(err.dbPath).toBe(dbPath);

    existsSyncSpy.mockRestore();
    readdirSyncSpy.mockRestore();
  });

  it('Test 4: resolves when directory appears on second poll (late mount)', async () => {
    const dbPath = '/data/echo.db';

    const fsMock = await import('fs');
    let callCount = 0;
    const existsSyncSpy = jest.spyOn(fsMock, 'existsSync').mockImplementation(() => {
      callCount++;
      return callCount >= 2; // first poll fails, second succeeds
    });

    let resolved = false;
    const promise = validateVolumeMount(dbPath).then(() => {
      resolved = true;
    });

    // First check (immediate) returns false
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Advance 2s — second poll returns true
    jest.advanceTimersByTime(2000);
    await Promise.resolve();
    await promise;

    expect(resolved).toBe(true);
    existsSyncSpy.mockRestore();
  });
});
