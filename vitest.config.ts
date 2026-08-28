import { defineConfig, configDefaults } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, '.next/**'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
