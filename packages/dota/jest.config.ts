import type { Config } from 'jest'

const config: Config = {
  verbose: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './src/',
  testMatch: ['<rootDir>/**/*.test.ts'],
  transformIgnorePatterns: ['(?!@dotabod/settings)'],
  moduleNameMapper: {
    '^(..?/.+).jsx?$': '$1',
  },
  transform: {
    '^.+\\.(ts|tsx)?$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx'],
}

export default config
