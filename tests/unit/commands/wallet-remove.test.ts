import { createTestDb } from '../db/setup.js';
import { wallets } from '../../../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('wallet remove command — db operations', () => {
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

  it('removes existing wallet', () => {
    const addr = 'RemoveMe111111111111111111111111111111111111';
    db.insert(wallets).values({ address: addr, label: null }).run();

    const result = db.delete(wallets).where(eq(wallets.address, addr)).run();
    expect(result.changes).toBe(1);

    const rows = db.select().from(wallets).where(eq(wallets.address, addr)).all();
    expect(rows).toHaveLength(0);
  });

  it('returns 0 changes for unknown address', () => {
    const result = db.delete(wallets).where(eq(wallets.address, 'NonExistentAddr1111111111111111111111111111')).run();
    expect(result.changes).toBe(0);
  });
});
