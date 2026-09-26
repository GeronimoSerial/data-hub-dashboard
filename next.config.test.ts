import { describe, it, expect } from 'vitest'
import nextConfig from './next.config.mjs'

describe('next.config headers', () => {
  it('sets Referrer-Policy: no-referrer for /problematicas/verificaciones', async () => {
    const headers = await nextConfig.headers!()

    const entry = headers.find(
      (h) => h.source === '/problematicas/verificaciones/:path*',
    )

    expect(entry).toBeDefined()
    expect(entry!.headers).toContainEqual({
      key: 'Referrer-Policy',
      value: 'no-referrer',
    })
  })
})
