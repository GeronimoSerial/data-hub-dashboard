import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Unit tests of the ENOS e2e seed. Kept apart from the root config, which excludes e2e/**.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/mapa-enos/**/*.test.ts'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '../..') } },
})
