import { defineConfig } from 'tsdown'

export default defineConfig({
  cwd: process.cwd(),
  dts: {
    generator: 'tsgo',
  },
  outExtensions: () => ({ js: '.js' }),
  platform: 'node',
})
