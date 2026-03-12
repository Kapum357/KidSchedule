/**
 * Jest Configuration
 * 
 * Unit testing configuration for KidSchedule.
 * Used for testing engines, services, and utilities.
 * @type {import('jest').Config}
 */
module.exports = {
  // Use ts-jest for TypeScript support
  preset: 'ts-jest',
  testEnvironment: 'jsdom',

  // Test file patterns
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.{ts,tsx}',
    '<rootDir>/tests/unit/**/*.spec.{ts,tsx}',
    '<rootDir>/tests/integration/**/*.test.{ts,tsx}',
    '<rootDir>/tests/integration/**/*.spec.{ts,tsx}',
    '<rootDir>/lib/**/*.test.{ts,tsx}',
    '<rootDir>/lib/**/*.spec.{ts,tsx}',
  ],

  // Module path aliases (match tsconfig paths)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^uuid$': '<rootDir>/tests/__mocks__/uuid.js',
  },

  // Coverage configuration
  collectCoverageFrom: [
    'lib/**/*.ts',
    '!lib/**/*.d.ts',
    '!lib/**/index.ts',
    '!lib/persistence/migrations/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // Transform configuration
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Test timeout
  testTimeout: 10000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,
};
