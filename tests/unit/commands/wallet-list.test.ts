import { createTestDb } from '../db/setup.js';
import { wallets } from '../../../src/db/schema.js';
import { desc, eq } from 'drizzle-orm';

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
}

describe('wallet list command — db operations and formatting', () => {
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

  it('returns empty array for empty db', () => {
    const rows = db.select().from(wallets).where(eq(wallets.status, 'tracked')).all();
    expect(rows).toHaveLength(0);
  });

  it('truncates address correctly', () => {
    const addr = 'ABCDEFGH12345678901234567890123456789012WXYZ';
    const truncated = truncateAddress(addr);
    expect(truncated).toBe('ABCDEFGH...WXYZ');
    expect(truncated.slice(0, 8)).toBe(addr.slice(0, 8));
    expect(truncated.slice(-4)).toBe(addr.slice(-4));
    expect(truncated).toMatch(/^.{8}\.\.\..{4}$/);
  });

  it('null label when no label provided', () => {
    const addr = 'NoLabel1111111111111111111111111111111111111';
    db.insert(wallets).values({ address: addr, label: null }).run();
    const rows = db.select().from(wallets).where(eq(wallets.address, addr)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBeNull();
  });

  it('orders by added_at descending (newest first)', () => {
    const now = Date.now();
    const olderAddr = 'OlderAddr1111111111111111111111111111111111';
    const newerAddr = 'NewerAddr1111111111111111111111111111111111';

    db.insert(wallets).values({ address: olderAddr, label: 'older', added_at: now - 10000 }).run();
    db.insert(wallets).values({ address: newerAddr, label: 'newer', added_at: now }).run();

    const rows = db
      .select()
      .from(wallets)
      .where(eq(wallets.status, 'tracked'))
      .orderBy(desc(wallets.added_at))
      .all();

    expect(rows).toHaveLength(2);
    expect(rows[0].address).toBe(newerAddr);
    expect(rows[1].address).toBe(olderAddr);
  });
});
