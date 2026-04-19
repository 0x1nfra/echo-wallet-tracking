/**
 * D-03 Live Verification Script — Shyft action type discovery
 *
 * Purpose: Fetch a real Shyft /sol/v1/transaction/parsed response for one or
 * more known bundled-transaction signatures and print all actions[].type values
 * observed. Run this before modifying extractNativeTransfers in shyft-provider.ts.
 *
 * Usage:
 *   npx tsx scripts/verify-shyft-action-types.ts
 *
 * Prerequisites:
 *   - SHYFT_API_KEY must be set in .env or the environment
 *   - Replace the placeholder signature(s) below with real bundled-tx signatures
 *     (pull from signal_events table or from a recent bundler-flagged wallet in the DB)
 */

import 'dotenv/config';
import axios from 'axios';

const apiKey = process.env.SHYFT_API_KEY;
if (!apiKey) {
  throw new Error('SHYFT_API_KEY not set');
}

// TODO: Replace with real signatures for transactions known to contain bundled
// SOL pre-funding (e.g. from signal_events table or a bundler-flagged wallet).
// You can identify candidates by checking detection results in the database:
//   SELECT DISTINCT tx_signature FROM bundler_evidence LIMIT 5;
const KNOWN_BUNDLED_TX_SIGNATURES: string[] = [
  'REPLACE_WITH_BUNDLED_TX_SIG',
  // 'REPLACE_WITH_SECOND_BUNDLED_TX_SIG',
  // 'REPLACE_WITH_THIRD_BUNDLED_TX_SIG',
];

// Shyft internal types — mirrors ShyftProvider internal shape exactly
interface ShyftAction {
  type: string;
  info: Record<string, unknown>;
}

interface ShyftRawTx {
  signatures: string[];
  slot: number;
  timestamp: number;
  fee: number;
  fee_payer: string;
  status: string;
  type?: string;
  actions: ShyftAction[];
}

const client = axios.create({ baseURL: 'https://api.shyft.to', timeout: 30_000 });

async function verifySig(signature: string): Promise<boolean> {
  const short = signature.length > 16 ? signature.slice(0, 8) + '...' + signature.slice(-8) : signature;
  try {
    const res = await client.get('/sol/v1/transaction/parsed', {
      params: { network: 'mainnet-beta', txn_signature: signature },
      headers: { 'x-api-key': apiKey },
    });

    const raw: ShyftRawTx | undefined = res?.data?.result;
    if (!raw) {
      console.log(`[verify-shyft] FAILED tx=${short} reason=no result in response`);
      return false;
    }

    const actions = raw.actions ?? [];
    const uniqueSortedTypes = Array.from(new Set(actions.map(a => a.type))).sort();

    console.log(`[verify-shyft] tx=${short}`);
    console.log(`[verify-shyft]   status=${raw.status}`);
    console.log(`[verify-shyft]   type=${raw.type ?? 'undefined'}`);
    console.log(`[verify-shyft]   actions.length=${actions.length}`);
    console.log(`[verify-shyft]   action_types=${JSON.stringify(uniqueSortedTypes)}`);
    console.log(`[verify-shyft]   sample action[0]=${JSON.stringify(actions[0])}`);
    return true;
  } catch (err: unknown) {
    const httpStatus = (err as { response?: { status?: number } }).response?.status;
    const message = err instanceof Error ? err.message : String(err);
    const short2 = httpStatus ? `status=${httpStatus}` : `body=${message.slice(0, 120)}`;
    console.log(`[verify-shyft] FAILED tx=${short} ${short2}`);
    return false;
  }
}

async function main() {
  const results = await Promise.allSettled(
    KNOWN_BUNDLED_TX_SIGNATURES.map(sig => verifySig(sig))
  );

  // Aggregate: collect all action types observed across successful fetches
  // We re-derive the "native transfer candidate" types from the printed lines.
  // (The aggregate below is a second-pass filter on the observed types for convenience.)
  const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;

  console.log('');
  console.log(`[verify-shyft] SUMMARY ${successCount}/${KNOWN_BUNDLED_TX_SIGNATURES.length} signatures fetched successfully`);
  console.log('[verify-shyft] SUMMARY observed native-transfer-candidate types: see action_types= lines above (filter for TRANSFER substring or exact SOL_TRANSFER)');

  // Exit code: 0 if at least one signature fetched successfully, 1 if all failed
  process.exit(successCount > 0 ? 0 : 1);
}

main();
