/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
    '!src/scripts/**',           // ad-hoc data/import scripts
    '!src/**/tmpclaude-*/**',    // agent scratch (IM-18 cleaned these up but guard anyway)
  ],
  coverageDirectory: 'coverage',
  // Conservative initial floor — picked so the current suite clears it and
  // future PRs don't silently regress. Current baseline (2026-04-19):
  //   statements 30.6%, branches 30.3%, functions 26.7%, lines 30.7%.
  // Thresholds sit 2–5 points below that so adding a single uncovered file
  // doesn't trip the gate; ratchet up as coverage improves. (IM-16)
  coverageThreshold: {
    global: {
      statements: 28,
      branches: 20,
      functions: 25,
      lines: 28,
    },
  },
  verbose: true,
};
