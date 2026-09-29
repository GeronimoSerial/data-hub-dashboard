import { vi } from 'vitest'

export function fetchOk(body: unknown) {
  return vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status: 200 }))
}

export function fetchJsonPorUrl(body: (url: string) => unknown) {
  return vi.fn(async (url: string) => new Response(JSON.stringify(body(url)), { status: 200 }))
}
