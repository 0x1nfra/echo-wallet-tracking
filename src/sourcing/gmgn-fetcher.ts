/**
 * GmgnFetcher — polls GMGN trending endpoint and applies pre-filters.
 * Cloudflare-protected: uses browser-like headers. Fail-soft on all HTTP errors.
 */

const GMGN_URL = 'https://gmgn.ai/defi/quotation/v1/rank/sol/swaps/1h';

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://gmgn.ai/',
  'Origin': 'https://gmgn.ai',
};

// Pre-filter thresholds
const MIN_HOLDER_COUNT = 100;
const MIN_LIQUIDITY_USD = 10_000;
const MIN_AGE_SECONDS = 3600;       // 1 hour
const MAX_AGE_SECONDS = 259200;     // 72 hours
const MIN_BLUECHIP_PCT = 1;         // bluechip_owner_percentage >= 1%

export interface GmgnToken {
  address: string;         // token mint
  symbol: string | null;
  name: string | null;
  liquidity: number | null;
  holder_count: number | null;
  open_timestamp: number | null;  // unix seconds — token creation time
  is_honeypot: number | null;
  bluechip_owner_percentage: number | null;
}

export class GmgnFetcher {
  async fetch(): Promise<GmgnToken[]> {
    let resp: Response;
    try {
      const headers: Record<string, string> = { ...BROWSER_HEADERS };
      // Optional: attach cf_clearance cookie for Cloudflare bypass if provided
      const cfClearance = process.env.GMGN_CF_CLEARANCE;
      if (cfClearance) {
        headers['Cookie'] = `cf_clearance=${cfClearance}`;
      }

      resp = await fetch(GMGN_URL, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      console.warn('[gmgn] fetch error (network/timeout):', err instanceof Error ? err.message : err);
      return [];
    }

    if (!resp.ok) {
      console.warn(`[gmgn] HTTP ${resp.status} — fail-soft, returning empty`);
      return [];
    }

    let data: unknown;
    try {
      data = await resp.json();
    } catch (err) {
      console.warn('[gmgn] JSON parse error:', err instanceof Error ? err.message : err);
      return [];
    }

    // GMGN rank endpoint returns: { code: 0, data: { rank: [...] } }
    const dataObj = (data as Record<string, unknown>)?.data;
    const rank = (dataObj as Record<string, unknown> | undefined)?.rank;
    if (!Array.isArray(rank)) {
      console.warn('[gmgn] unexpected response shape — missing data.rank array');
      return [];
    }

    return rank.map((item: Record<string, unknown>) => ({
      address: String(item.address ?? item.token_address ?? ''),
      symbol: typeof item.symbol === 'string' ? item.symbol : null,
      name: typeof item.name === 'string' ? item.name : null,
      liquidity: typeof item.liquidity === 'number' ? item.liquidity : null,
      holder_count: typeof item.holder_count === 'number' ? item.holder_count : null,
      open_timestamp: typeof item.open_timestamp === 'number' ? item.open_timestamp : null,
      is_honeypot: typeof item.is_honeypot === 'number' ? item.is_honeypot : null,
      bluechip_owner_percentage: typeof item.bluechip_owner_percentage === 'number'
        ? item.bluechip_owner_percentage : null,
    })).filter(t => t.address.length > 0);
  }

  applyPreFilters(tokens: GmgnToken[]): { passed: GmgnToken[]; filteredCount: number } {
    const nowSec = Math.floor(Date.now() / 1000);
    let filteredCount = 0;

    const passed = tokens.filter(t => {
      // is_honeypot check
      if (t.is_honeypot === 1) { filteredCount++; return false; }
      // holder_count check
      if (t.holder_count === null || t.holder_count < MIN_HOLDER_COUNT) { filteredCount++; return false; }
      // liquidity check
      if (t.liquidity === null || t.liquidity < MIN_LIQUIDITY_USD) { filteredCount++; return false; }
      // age check — open_timestamp null means unknown, skip to be safe
      if (t.open_timestamp === null) { filteredCount++; return false; }
      const ageSec = nowSec - t.open_timestamp;
      if (ageSec < MIN_AGE_SECONDS || ageSec > MAX_AGE_SECONDS) { filteredCount++; return false; }
      // bluechip_owner_percentage check — null means unavailable, skip to be safe
      if (t.bluechip_owner_percentage === null || t.bluechip_owner_percentage < MIN_BLUECHIP_PCT) {
        filteredCount++; return false;
      }
      return true;
    });

    return { passed, filteredCount };
  }
}
