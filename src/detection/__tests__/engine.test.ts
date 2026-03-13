/**
 * Engine computeOverallStatus Tests (DETC-05 gap closure)
 *
 * Verifies that manual flags (detector not in SEVERITY_ORDER) are honoured
 * as authoritative confidence tiers rather than silently discarded.
 */

import { computeOverallStatus } from '../engine.js';
import type { ActiveFlag, DetectionTier } from '../types.js';

// -----------------------------------------------------------------------
// Helper
// -----------------------------------------------------------------------

function makeFlag(detector: string, confidence: DetectionTier, cleared = false): ActiveFlag {
  return {
    detector: detector as any,
    confidence,
    cleared,
    threshold_multiplier: 1.0,
  };
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('computeOverallStatus', () => {

  // Empty / cleared-only cases
  describe('no active flags', () => {
    it('returns confirmed_passing when flag list is empty', () => {
      expect(computeOverallStatus([])).toBe('confirmed_passing');
    });

    it('returns confirmed_passing when only flag is cleared', () => {
      const flags = [makeFlag('manual', 'suspected', true)];
      expect(computeOverallStatus(flags)).toBe('confirmed_passing');
    });

    it('returns confirmed_passing when all flags are cleared', () => {
      const flags = [
        makeFlag('manual', 'confirmed_suspicious', true),
        makeFlag('bundler', 'review', true),
      ];
      expect(computeOverallStatus(flags)).toBe('confirmed_passing');
    });
  });

  // Manual-only flags
  describe('manual-only flags', () => {
    it('returns suspected for a single uncleared manual flag at suspected tier', () => {
      const flags = [makeFlag('manual', 'suspected')];
      expect(computeOverallStatus(flags)).toBe('suspected');
    });

    it('returns review for a single uncleared manual flag at review tier', () => {
      const flags = [makeFlag('manual', 'review')];
      expect(computeOverallStatus(flags)).toBe('review');
    });

    it('returns confirmed_suspicious for a single uncleared manual flag at confirmed_suspicious tier', () => {
      const flags = [makeFlag('manual', 'confirmed_suspicious')];
      expect(computeOverallStatus(flags)).toBe('confirmed_suspicious');
    });
  });

  // Severity-order-only flags (existing behaviour must be unchanged)
  describe('severity-order-only flags', () => {
    it('returns the confidence of a single uncleared bundler flag', () => {
      const flags = [makeFlag('bundler', 'review')];
      expect(computeOverallStatus(flags)).toBe('review');
    });

    it('returns worst confidence when multiple ranked detectors present', () => {
      // bundler=review and sniper=suspected — bundler is earlier in SEVERITY_ORDER so wins
      const flags = [
        makeFlag('bundler', 'review'),
        makeFlag('sniper', 'suspected'),
      ];
      expect(computeOverallStatus(flags)).toBe('review');
    });
  });

  // Mixed: manual + ranked detector
  describe('mixed manual and ranked-detector flags', () => {
    it('returns ranked-detector tier when ranked tier is worse than manual', () => {
      // bundler=review, manual=suspected — review is worse than suspected
      const flags = [
        makeFlag('bundler', 'review'),
        makeFlag('manual', 'suspected'),
      ];
      expect(computeOverallStatus(flags)).toBe('review');
    });

    it('returns manual tier when manual tier is worse than ranked detector', () => {
      // bundler=suspected, manual=confirmed_suspicious — confirmed_suspicious is worse
      const flags = [
        makeFlag('bundler', 'suspected'),
        makeFlag('manual', 'confirmed_suspicious'),
      ];
      expect(computeOverallStatus(flags)).toBe('confirmed_suspicious');
    });

    it('returns confirmed_suspicious when both manual and ranked are at confirmed_suspicious', () => {
      const flags = [
        makeFlag('dev_wallet', 'confirmed_suspicious'),
        makeFlag('manual', 'confirmed_suspicious'),
      ];
      expect(computeOverallStatus(flags)).toBe('confirmed_suspicious');
    });

    it('ignores cleared manual flag when ranked detector flag is active', () => {
      // manual cleared at confirmed_suspicious — should not affect result
      const flags = [
        makeFlag('bundler', 'suspected'),
        makeFlag('manual', 'confirmed_suspicious', true), // cleared
      ];
      expect(computeOverallStatus(flags)).toBe('suspected');
    });
  });

});
