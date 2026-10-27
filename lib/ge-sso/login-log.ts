import { normalizeCue } from '@/lib/infraestructura/cue'

/** Fixed prefix so Coolify logs can be filtered with `grep ge-sso-login`. */
export const PREFIJO_LOG_LOGIN = 'ge-sso-login'

/**
 * Diagnostic context of one `POST /api/auth/ge-login` attempt. The handler fills
 * it as it goes; `emitirLogLogin` writes it as one JSON line. It only holds
 * whitelisted fields: never the api_key/secret, tokens, cookies or the body.
 */
export type TrazaLoginGe = {
  requestId: string
  cueRecibido: string | null
  cueNormalizado: string | null
  usuarioGe: string | null
  motivo: string | null
  reenviadoStaging: boolean
}

const MAX_CAMPO = 64

function recortar(valor: string): string {
  return valor.length > MAX_CAMPO ? valor.slice(0, MAX_CAMPO) : valor
}

function escalarComoTexto(valor: unknown): string | null {
  if (typeof valor === 'string') return recortar(valor)
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  return null
}

export function nuevaTrazaLoginGe(request: Request): TrazaLoginGe {
  const entrante = request.headers.get('x-request-id')?.trim()
  return {
    requestId: entrante ? recortar(entrante) : crypto.randomUUID(),
    cueRecibido: null,
    cueNormalizado: null,
    usuarioGe: null,
    motivo: null,
    reenviadoStaging: false,
  }
}

/** Copies the CUE and the GE user id from the raw body, without keeping the body. */
export function identificarIntento(traza: TrazaLoginGe, raw: unknown): void {
  if (typeof raw !== 'object' || raw === null) return
  const body = raw as Record<string, unknown>
  traza.cueRecibido = escalarComoTexto(body.CUE ?? body.cue)
  traza.cueNormalizado = traza.cueRecibido ? (normalizeCue(traza.cueRecibido)?.value ?? null) : null
  const usuario = escalarComoTexto(body.USUARIO)
  const email = escalarComoTexto(body.email)
  traza.usuarioGe = usuario !== null ? `ge-${usuario}` : email
}

function resultadoPorStatus(status: number): string {
  if (status < 400) return 'ok'
  if (status >= 500) return '5xx'
  return String(status)
}

export function emitirLogLogin(traza: TrazaLoginGe, status: number): void {
  const linea = {
    evento: PREFIJO_LOG_LOGIN,
    timestamp: new Date().toISOString(),
    requestId: traza.requestId,
    cueRecibido: traza.cueRecibido,
    cueNormalizado: traza.cueNormalizado,
    usuarioGe: traza.usuarioGe,
    resultado: resultadoPorStatus(status),
    status,
    motivo: traza.motivo ?? (status < 400 ? 'ok' : 'desconocido'),
    reenviadoStaging: traza.reenviadoStaging,
  }
  const salida = status >= 500 ? console.error : status >= 400 ? console.warn : console.info
  salida(`${PREFIJO_LOG_LOGIN} ${JSON.stringify(linea)}`)
}
