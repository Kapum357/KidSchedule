/**
 * Jest Setup Configuration
 *
 * Provides global test utilities and matchers for all unit tests.
 */

import '@testing-library/jest-dom';

// Global test utilities
global.console = {
  ...console,
  // Suppress console logs in tests unless explicitly needed
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};
