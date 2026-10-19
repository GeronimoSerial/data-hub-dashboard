import { registrarEventoGeSso, type EventoGeSso } from './evento'

export interface StagingForwardConfig {
  url?: string | null
  until?: string | null
  enabled?: string | null
  apiKey?: string | null
}

export function obtenerConfigStagingForward(): StagingForwardConfig {
  return {
    url: process.env.GE_SSO_STAGING_FORWARD_URL?.trim() || null,
    until: process.env.GE_SSO_STAGING_FORWARD_UNTIL?.trim() || null,
    enabled: process.env.GE_SSO_STAGING_FORWARD_ENABLED?.trim() || null,
    apiKey: process.env.GE_SSO_STAGING_FORWARD_API_KEY?.trim() || null,
  }
}

export function esStagingForwardActivo(
  config = obtenerConfigStagingForward(),
  ahora = Date.now(),
): boolean {
  if (!config.url) return false
  if (config.enabled === 'false') return false
  if (config.until) {
    const hasta = Date.parse(config.until)
    if (!Number.isNaN(hasta) && ahora > hasta) return false
  }
  return true
}

export async function reenviarGeLoginAStaging({
  raw,
  origin,
  ip,
  cors,
  evento,
  config = obtenerConfigStagingForward(),
  fetcher = globalThis.fetch,
}: {
  raw: unknown
  origin: string
  ip: string
  cors: Record<string, string>
  evento: Omit<EventoGeSso, 'resultado' | 'ip'>
  config?: StagingForwardConfig
  fetcher?: typeof fetch
}): Promise<Response> {
  const targetBase = config.url?.replace(/\/$/, '')
  if (!targetBase) {
    throw new Error('Configuración de reenvío incompleta')
  }

  const bodyAEnviar =
    typeof raw === 'object' && raw !== null
      ? { ...(raw as Record<string, unknown>) }
      : {}

  if (config.apiKey) {
    if ('secret' in bodyAEnviar) {
      bodyAEnviar.secret = config.apiKey
    } else {
      bodyAEnviar.api_key = config.apiKey
    }
  }

  try {
    const res = await fetcher(`${targetBase}/api/auth/ge-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        'x-ge-sso-forwarded': 'true',
      },
      body: JSON.stringify(bodyAEnviar),
      signal: AbortSignal.timeout(10_000),
    })

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      await registrarEventoGeSso({
        ...evento,
        ip,
        resultado: 'error_reenvio_staging',
      })
      return new Response(JSON.stringify(data ?? { error: 'Error en entorno de pruebas' }), {
        status: res.status,
        headers: {
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'Content-Type': 'application/json',
          ...cors,
        },
      })
    }

    await registrarEventoGeSso({
      ...evento,
      ip,
      resultado: 'reenviado_staging',
    })

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: {
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'Content-Type': 'application/json',
        ...cors,
      },
    })
  } catch (err) {
    console.error('[ge-sso] Error al reenviar login a staging:', err)
    await registrarEventoGeSso({
      ...evento,
      ip,
      resultado: 'fallo_red_reenvio_staging',
    })
    return new Response(
      JSON.stringify({ error: 'No se pudo comunicar con el entorno de prueba' }),
      {
        status: 502,
        headers: {
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'Content-Type': 'application/json',
          ...cors,
        },
      },
    )
  }
}
