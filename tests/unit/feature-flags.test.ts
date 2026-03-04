/**
 * Feature Flags Engine – Unit Tests
 */

import { isFeatureEnabled, getFeatureConfig, getAllFeatureFlags } from '../../lib/feature-flags';

// Mock process.env
const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

describe('Feature Flags', () => {
  describe('isFeatureEnabled', () => {
    it('returns false for undefined feature', () => {
      expect(isFeatureEnabled('nonexistent')).toBe(false);
    });

    it('returns true for enabled feature', () => {
      process.env.FEATURE_TEST_FEATURE = 'on';
      expect(isFeatureEnabled('test-feature')).toBe(true);
    });

    it('returns false for disabled feature', () => {
      process.env.FEATURE_TEST_FEATURE = 'off';
      expect(isFeatureEnabled('test-feature')).toBe(false);
    });

    it('handles percentage rollout', () => {
      process.env.FEATURE_TEST_FEATURE = '50';
      // User ID that should be enabled (hash % 100 < 50)
      expect(isFeatureEnabled('test-feature', 'user-1')).toBe(true);
      // User ID that should be disabled
      expect(isFeatureEnabled('test-feature', 'user-999')).toBe(false);
    });

    it('allows specific users', () => {
      process.env.FEATURE_TEST_FEATURE = '0:user1,user2';
      expect(isFeatureEnabled('test-feature', 'user1')).toBe(true);
      expect(isFeatureEnabled('test-feature', 'user2')).toBe(true);
      expect(isFeatureEnabled('test-feature', 'user3')).toBe(false);
    });

    it('blocks specific users', () => {
      process.env.FEATURE_TEST_FEATURE = '100::blocked-user';
      expect(isFeatureEnabled('test-feature', 'blocked-user')).toBe(false);
      expect(isFeatureEnabled('test-feature', 'allowed-user')).toBe(true);
    });

    it('handles complex config: percentage + allowed + blocked', () => {
      process.env.FEATURE_TEST_FEATURE = '25:always-on::always-off';
      expect(isFeatureEnabled('test-feature', 'always-on')).toBe(true);
      expect(isFeatureEnabled('test-feature', 'always-off')).toBe(false);
      // For other users, depends on hash
    });
  });

  describe('getFeatureConfig', () => {
    it('parses simple on/off', () => {
      process.env.FEATURE_TEST = 'on';
      expect(getFeatureConfig('test')).toEqual({ enabled: true });
    });

    it('parses percentage', () => {
      process.env.FEATURE_TEST = '75';
      expect(getFeatureConfig('test')).toEqual({ enabled: true, percentage: 75 });
    });

    it('parses allowed users', () => {
      process.env.FEATURE_TEST = 'off:user1,user2';
      expect(getFeatureConfig('test')).toEqual({
        enabled: false,
        allowedUsers: ['user1', 'user2']
      });
    });

    it('parses blocked users', () => {
      process.env.FEATURE_TEST = 'on::blocked1,blocked2';
      expect(getFeatureConfig('test')).toEqual({
        enabled: true,
        blockedUsers: ['blocked1', 'blocked2']
      });
    });
  });

  describe('getAllFeatureFlags', () => {
    it('returns all feature flags', () => {
      process.env.FEATURE_FLAG1 = 'on';
      process.env.FEATURE_FLAG2 = '50';
      process.env.OTHER_VAR = 'ignore';

      const flags = getAllFeatureFlags();
      expect(flags['flag1']).toEqual({ enabled: true });
      expect(flags['flag2']).toEqual({ enabled: true, percentage: 50 });
      expect(flags['other-var']).toBeUndefined();
    });
  });
});