/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'frontend',
      rootDir: '<rootDir>/packages/frontend',
      testEnvironment: 'jsdom',
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^.+\\.(css|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',
      },
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)'],
      transform: {
        '^.+\\.(ts|tsx|js|jsx)$': 'babel-jest',
      },
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
      testPathIgnorePatterns: ['/node_modules/', '/.next/', '/e2e/'],
    },
  ],
};
