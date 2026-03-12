/**
 * Sniper Detector (DETC-03) — stub for RED phase
 */

import type { DetectorConfig, DetectorResult } from './types.js';

export interface SniperDb {
  all: (sql: unknown, params: unknown) => Promise<Array<Record<string, unknown>>>;
}

export interface SniperDeps {
  db: SniperDb;
}

export async function detectSniper(
  _config: DetectorConfig,
  _deps?: Partial<SniperDeps>
): Promise<DetectorResult> {
  throw new Error('Not implemented');
}
