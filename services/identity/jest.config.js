/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testTimeout: 15000,
};
