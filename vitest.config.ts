import { defineConfig, configDefaults } from 'vitest/config'
import path from 'node:path'

// Some tests build timestamps with the local-time Date constructor while the
// code formats them in the province's time zone. Pin the runner's zone so the
// suite behaves the same on a developer machine and on a UTC CI runner.
process.env.TZ = 'America/Argentina/Buenos_Aires'

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, '.next/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
