import { explanationSchema, type ExplainContext, type ResourceExplanation } from './explain-resource'

export type ExplainProviderKind = 'openai'

export type ExplainProviderConfig = {
  kind: ExplainProviderKind
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
}

export type ExplainProvider = {
  name: string
  available: boolean
  explain(context: ExplainContext, signal?: AbortSignal): Promise<ResourceExplanation>
}

export class ExplainUnavailableError extends Error {
  constructor() {
    super('El proveedor de explicaciones no está configurado')
    this.name = 'ExplainUnavailableError'
  }
}

export class ExplainTimeoutError extends Error {
  constructor() {
    super('El proveedor de explicaciones tardó demasiado')
    this.name = 'ExplainTimeoutError'
  }
}

export class ExplainRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExplainRequestError'
  }
}

export class ExplainResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExplainResponseError'
  }
}

/** Environment contract for the AI provider. Never logs key or content. */
export function loadExplainProviderConfig(env: Record<string, string | undefined> = process.env): ExplainProviderConfig | null {
  const apiKey = env.AI_API_KEY || env.OPENAI_API_KEY
  if (!apiKey?.trim()) return null
  const timeoutMs = Number(env.AI_TIMEOUT_MS ?? '')
  return {
    kind: 'openai',
    apiKey: apiKey.trim(),
    baseUrl: (env.AI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: env.AI_MODEL?.trim() || 'gpt-4o-mini',
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000,
  }
}

function buildPrompt(context: ExplainContext) {
  return [
    {
      role: 'system' as const,
      content:
        'Sos un asistente que explica recursos educativos a usuarios no técnicos. ' +
        'Explicá de forma breve y clara qué es el recurso y cómo interpretarlo. ' +
        'No especules, no inventes datos, no afirmes causalidad y no uses jerga técnica interna. ' +
        'Si no hay suficiente contexto, decilo. Respondé únicamente JSON válido con el schema exacto: ' +
        '{"summary": string, "usefulFor": string[] (máximo 3), "firstLook": string | null}.',
    },
    {
      role: 'user' as const,
      content:
        `Recurso: ${context.title}. ${context.description} ` +
        `Formato: ${context.format}. Tema: ${context.topic}. Nivel: ${context.level}. Tipo: ${context.type}.` +
        (context.tags.length ? ` Etiquetas: ${context.tags.join(', ')}.` : ''),
    },
  ]
}

export function createOpenAiExplainProvider(
  config: ExplainProviderConfig,
  fetchImpl: typeof fetch = fetch,
): ExplainProvider {
  return {
    name: 'openai',
    available: true,
    async explain(context, signal) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
      const onOuterAbort = () => controller.abort()
      if (signal) {
        if (signal.aborted) controller.abort()
        else signal.addEventListener('abort', onOuterAbort, { once: true })
      }

      let response: Response
      try {
        response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: buildPrompt(context),
            temperature: 0.2,
            max_tokens: 320,
          }),
          signal: controller.signal,
        })
      } catch (error) {
        if (controller.signal.aborted) throw new ExplainTimeoutError()
        throw new ExplainRequestError(error instanceof Error ? error.message : 'Error de red')
      } finally {
        clearTimeout(timeout)
        signal?.removeEventListener('abort', onOuterAbort)
      }

      if (!response.ok) {
        throw new ExplainRequestError(`El proveedor respondió ${response.status}`)
      }

      let payload: { choices?: { message?: { content?: unknown } }[] }
      try {
        payload = (await response.json()) as typeof payload
      } catch {
        throw new ExplainResponseError('Respuesta no es JSON válido')
      }

      const content = payload.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) {
        throw new ExplainResponseError('Respuesta vacía del proveedor')
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        throw new ExplainResponseError('No se pudo parsear la respuesta del proveedor')
      }

      const result = explanationSchema.safeParse(parsed)
      if (!result.success) {
        throw new ExplainResponseError('La respuesta no respeta el schema esperado')
      }
      return result.data
    },
  }
}

let cachedProvider: ExplainProvider | undefined

export function getExplainProvider(): ExplainProvider {
  if (cachedProvider !== undefined) return cachedProvider
  const config = loadExplainProviderConfig()
  cachedProvider = config ? createOpenAiExplainProvider(config) : {
    name: 'unavailable',
    available: false,
    async explain() {
      throw new ExplainUnavailableError()
    },
  }
  return cachedProvider
}

export function resetExplainProvider() {
  cachedProvider = undefined
}