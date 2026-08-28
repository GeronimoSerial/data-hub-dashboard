import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

export default [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      '.codegraph/**',
      '.atl/**',
      'public/**',
      'scripts/**',
      'next-env.d.ts',
      'tsconfig.tsbuildinfo',
      'pnpm-lock.yaml',
      '*.config.mjs',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
]