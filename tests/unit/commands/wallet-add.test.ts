import { createTestDb } from '../db/setup.js';
import { wallets } from '../../../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('wallet add command — db operations', () => {
  let db: ReturnType<typeof createTestDb>['db'];
  let sqlite: ReturnType<typeof createTestDb>['sqlite'];

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    db.delete(wallets).run();
  });

  it('inserts a new wallet', () => {
    db.insert(wallets).values({ address: '9WzDXwBbbbbbbb1', label: null }).run();
    const rows = db.select().from(wallets).where(eq(wallets.address, '9WzDXwBbbbbbbb1')).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe('9WzDXwBbbbbbbb1');
  });

  it('stores label when provided', () => {
    db.insert(wallets).values({ address: '9WzDXwBbbbbbbb2', label: 'TestLabel' }).run();
    const rows = db.select().from(wallets).where(eq(wallets.address, '9WzDXwBbbbbbbb2')).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('TestLabel');
  });

  it('throws UNIQUE error on duplicate', () => {
    db.insert(wallets).values({ address: '9WzDXwBbbbbbbb3', label: null }).run();
    expect(() => {
      db.insert(wallets).values({ address: '9WzDXwBbbbbbbb3', label: null }).run();
    }).toThrow(/UNIQUE constraint failed/);
  });
});
