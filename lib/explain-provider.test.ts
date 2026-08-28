import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ExplainRequestError,
  ExplainResponseError,
  ExplainTimeoutError,
  ExplainUnavailableError,
  createOpenAiExplainProvider,
  getExplainProvider,
  loadExplainProviderConfig,
  resetExplainProvider,
} from './explain-provider'
import type { ExplainContext } from './explain-resource'

const context: ExplainContext = {
  id: 'r1',
  title: 'Mapa',
  description: 'Muestra establecimientos.',
  format: 'Mapa',
  topic: 'Matrícula',
  level: 'Transversal',
  type: 'Georreferencial',
  tags: [],
  authorized: false,
}

afterEach(() => {
  resetExplainProvider()
  vi.unstubAllGlobals()
})

describe('explain provider config', () => {
  it('is unavailable without credentials (tests/build safe)', () => {
    expect(loadExplainProviderConfig({})).toBeNull()
    expect(loadExplainProviderConfig({ AI_MODEL: 'x' })).toBeNull()
  })

  it('reads the env contract when a key is present', () => {
    const config = loadExplainProviderConfig({
      AI_API_KEY: 'secret',
      AI_MODEL: 'pequeño',
      AI_TIMEOUT_MS: '5000',
    })
    expect(config?.apiKey).toBe('secret')
    expect(config?.model).toBe('pequeño')
    expect(config?.timeoutMs).toBe(5000)
  })

  it('exposes a safe unavailable provider when unconfigured', async () => {
    const provider = getExplainProvider()
    expect(provider.available).toBe(false)
    await expect(provider.explain(context)).rejects.toBeInstanceOf(
      ExplainUnavailableError,
    )
    resetExplainProvider()
  })

  it('memorizes the provider per process', () => {
    process.env.AI_API_KEY = 'k'
    const a = getExplainProvider()
    const b = getExplainProvider()
    expect(a).toBe(b)
    delete process.env.AI_API_KEY
    resetExplainProvider()
  })
})

describe('openai provider', () => {
  const config = {
    kind: 'openai' as const,
    apiKey: 'k',
    baseUrl: 'https://example.test/v1',
    model: 'm',
    timeoutMs: 20000,
  }

  it('parses and validates a valid JSON response', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'Resumen',
                  usefulFor: ['A'],
                  firstLook: 'B',
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch
    const provider = createOpenAiExplainProvider(config, fetchImpl)
    const result = await provider.explain(context)
    expect(result.summary).toBe('Resumen')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('throws when the response does not respect the schema', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"summary":""}' } }],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch
    const provider = createOpenAiExplainProvider(config, fetchImpl)
    await expect(provider.explain(context)).rejects.toBeInstanceOf(
      ExplainResponseError,
    )
  })

  it('throws ExplainRequestError on HTTP errors and malformed payloads', async () => {
    const httpError = createOpenAiExplainProvider(config, (async () =>
      new Response('boom', { status: 500 })) as unknown as typeof fetch)
    await expect(httpError.explain(context)).rejects.toBeInstanceOf(
      ExplainRequestError,
    )

    const badJson = createOpenAiExplainProvider(config, (async () =>
      new Response('not-json', { status: 200 })) as unknown as typeof fetch)
    await expect(badJson.explain(context)).rejects.toBeInstanceOf(
      ExplainResponseError,
    )
  })

  it('aborts and throws ExplainTimeoutError when the deadline passes', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    ) as unknown as typeof fetch
    const provider = createOpenAiExplainProvider(
      { ...config, timeoutMs: 1000 },
      fetchImpl,
    )
    const promise = provider.explain(context)
    const assertion = expect(promise).rejects.toBeInstanceOf(ExplainTimeoutError)
    await vi.advanceTimersByTimeAsync(1100)
    await assertion
    vi.useRealTimers()
  })
})