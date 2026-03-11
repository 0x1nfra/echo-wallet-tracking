import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('DB Connection - WAL mode', () => {
  it('PRAGMA journal_mode returns wal after setting WAL mode on a file database', () => {
    const tmpFile = path.join(os.tmpdir(), `echo-test-${Date.now()}.db`);
    const sqlite = new Database(tmpFile);
    sqlite.pragma('journal_mode = WAL');

    const result = sqlite.pragma('journal_mode') as Array<{ journal_mode: string }>;
    const journalMode = result[0]?.journal_mode;

    expect(journalMode).toBe('wal');

    sqlite.close();
    fs.unlinkSync(tmpFile);
    const walFile = `${tmpFile}-wal`;
    const shmFile = `${tmpFile}-shm`;
    if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
    if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);
  });

  it('PRAGMA foreign_keys is enabled after setting it', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    const result = sqlite.pragma('foreign_keys') as Array<{ foreign_keys: number }>;
    expect(result[0]?.foreign_keys).toBe(1);

    sqlite.close();
  });
});
