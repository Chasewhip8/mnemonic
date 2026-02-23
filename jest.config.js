module.exports = {
  preset: 'ts-jest',
  testEnvironment: './test/environment.js',
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/packages/'],
  testTimeout: 120000,
};
