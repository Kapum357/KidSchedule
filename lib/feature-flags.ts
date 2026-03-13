/**
 * KidSchedule – Feature Flags Engine
 */

import { createHash } from 'crypto';

export interface FeatureFlagConfig {
  enabled: boolean;
  percentage?: number; // 0-100
  allowedUsers?: string[];
  blockedUsers?: string[];
}

/**
 * Parse feature flag from environment variable
 * Supports formats:
 * - "on" | "true" | "1" → enabled for all
 * - "50" → 50% rollout
 * - "user1,user2" → specific users
 * - "50:user1,user2:blocked1" → percentage + users
 */
function parseFeatureFlag(envValue: string | undefined): FeatureFlagConfig | null {
  if (!envValue) return null;

  const parts = envValue.split(':');
  const config: FeatureFlagConfig = { enabled: false };

  // First part: on/off or percentage
  const first = parts[0].toLowerCase();
  if (first === 'on' || first === 'true' || first === '1') {
    config.enabled = true;
  } else if (first === 'off' || first === 'false' || first === '0') {
    config.enabled = false;
  } else {
    const percentage = parseInt(first, 10);
    if (!isNaN(percentage) && percentage >= 0 && percentage <= 100) {
      config.percentage = percentage;
      config.enabled = true; // Will check percentage
    }
  }

  // Second part: allowed users
  if (parts[1]) {
    config.allowedUsers = parts[1].split(',').map(u => u.trim()).filter(u => u);
  }

  // Third part: blocked users
  if (parts[2]) {
    config.blockedUsers = parts[2].split(',').map(u => u.trim()).filter(u => u);
  }

  return config;
}

/**
 * Check if feature is enabled for a user
 */
export function isFeatureEnabled(feature: string, userId?: string): boolean {
  const envKey = `FEATURE_${feature.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  const config = parseFeatureFlag(process.env[envKey]);

  if (!config) return false;

  // Check blocked users first
  if (config.blockedUsers && userId && config.blockedUsers.includes(userId)) {
    return false;
  }

  // Check allowed users
  if (config.allowedUsers && userId && config.allowedUsers.includes(userId)) {
    return true;
  }

  // If no user-specific rules, check global enable
  if (!config.enabled) return false;

  // If percentage rollout
  if (config.percentage !== undefined && userId) {
    const hash = createHash('md5').update(userId).digest('hex');
    const hashInt = parseInt(hash.substring(0, 8), 16);
    const percentage = (hashInt % 100);
    return percentage < config.percentage;
  }

  // If percentage but no userId, default to enabled (for server-side features)
  if (config.percentage !== undefined) {
    return true;
  }

  return config.enabled;
}

/**
 * Get feature flag configuration (for debugging/admin)
 */
export function getFeatureConfig(feature: string): FeatureFlagConfig | null {
  const envKey = `FEATURE_${feature.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  return parseFeatureFlag(process.env[envKey]);
}

/**
 * List all active feature flags
 */
export function getAllFeatureFlags(): Record<string, FeatureFlagConfig | null> {
  const flags: Record<string, FeatureFlagConfig | null> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('FEATURE_')) {
      const feature = key.substring(8).toLowerCase().replace(/_/g, '-');
      flags[feature] = parseFeatureFlag(value);
    }
  }

  return flags;
}