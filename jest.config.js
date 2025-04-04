/** @type {import('ts-jest').JestConfigWithTsJest} **/

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  verbose: true,
  testTimeout: 30000, 
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/types/**',
    '!src/server.ts'
  ],
  coverageReporters: ['text', 'lcov'],
  coverageDirectory: 'coverage',
  forceExit: true, // Force Jest to exit after all tests complete
  detectOpenHandles: true, // Detect and report on open handles preventing Jest from exiting
};