import fs from 'fs';
import path from 'path';

export class VolumeCheckError extends Error {
  constructor(
    public readonly dbPath: string,
    public readonly dirContents: string,
  ) {
    const dir = path.dirname(dbPath);
    const parentDir = path.dirname(dir);
    super(
      `[startup] Volume mount check failed after 30s\n` +
        `  Expected database directory: ${dir}\n` +
        `  Contents of ${parentDir}: ${dirContents || '(empty)'}\n` +
        `  Fix: Set DATABASE_URL to a path on your Railway volume (e.g. DATABASE_URL=/data/echo.db)\n` +
        `      Then add a volume mount at ${dir} in Railway dashboard.`,
    );
    this.name = 'VolumeCheckError';
  }
}

const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 30000;

export interface VolumeCheckOptions {
  /** Override fs.existsSync for testing */
  existsSync?: (p: string) => boolean;
  /** Override fs.readdirSync for testing */
  readdirSync?: (p: string) => string[];
  /** Override setTimeout for testing */
  setTimeout?: (fn: () => void, ms: number) => NodeJS.Timeout;
}

/**
 * Poll-wait for the database directory to exist on a mounted volume.
 * Retries every 2 seconds for up to 30 seconds (Railway volume mount timing edge case).
 * Throws VolumeCheckError with actionable message if directory never appears.
 */
export async function validateVolumeMount(
  dbPath: string,
  opts: VolumeCheckOptions = {},
): Promise<void> {
  const existsSyncFn = opts.existsSync ?? fs.existsSync;
  const readdirSyncFn = opts.readdirSync ?? ((p: string) => fs.readdirSync(p) as string[]);
  const setTimeoutFn = opts.setTimeout ?? setTimeout;

  const dir = path.dirname(dbPath);

  if (existsSyncFn(dir)) {
    return;
  }

  const attempts = MAX_WAIT_MS / POLL_INTERVAL_MS; // 15 attempts

  for (let i = 0; i < attempts; i++) {
    await new Promise<void>((resolve) => setTimeoutFn(resolve, POLL_INTERVAL_MS));

    if (existsSyncFn(dir)) {
      return;
    }
  }

  // All attempts exhausted — build structured error
  const parentDir = path.dirname(dir);
  let dirContents: string;
  try {
    const entries = readdirSyncFn(parentDir);
    dirContents = entries.length > 0 ? entries.join(', ') : '(empty)';
  } catch {
    dirContents = '(unreadable)';
  }

  throw new VolumeCheckError(dbPath, dirContents);
}
