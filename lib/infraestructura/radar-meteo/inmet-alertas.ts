import { and, eq, gt, like, lt } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { smnAlerta } from '@/lib/db/schema'
import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
import { listarDepartamentos, obtenerVersionGeografia } from './departamentos'
import { adquirirLease, publicarResultado } from '../riesgo/job-run'
import { actualizarSaludFuente } from '../riesgo/jobs/salud-fuente'
import type { PoligonoCAP } from './smn-alertas'

export const INMET_URL_AVISOS = 'https://apiprevmet3.inmet.gov.br/avisos/ativos'

const TIPO_JOB = 'sync-inmet-alertas'
const PREFIJO_ID = 'inmet:'
const USER_AGENT = 'ENOS-alertas/1.0'
const TIMEOUT_MS = 15_000
const DURACION_LEASE_MS = 10 * 60 * 1000
const TAMANO_RAW_MAXIMO = 50_000
// Horario de Brasilia (UTC-03:00). Supuesto: la API no declara zona horaria.
const DESFASE_BRASILIA = '-03:00'
const PROVIDER_SALUD = 'inmet-alertas'
const TTL_SALUD_MINUTOS = 60
const LICENCIA_SALUD =
  'INMET — dados públicos de avisos; atribuição ao INMET; API não documentada, licença por confirmar'
const ERROR_SALUD_NO_DISPONIBLE = 'fallo al sincronizar alertas del INMET'
const ERROR_SALUD_LIMITE = 'INMET limitó las consultas (HTTP 429)'

export type AvisoInmet = {
  id: string
  idAviso: number
  sender: 'INMET'
  sent: string
  onset: string
  expires: string
  event: string
  severity: 'Minor' | 'Moderate' | 'Severe' | 'Extreme'
  headline: string
  description: string | null
  instruction: string | null
  geocodes: string[]
  poligonos: PoligonoCAP[]
  encerrado: boolean
  raw: string
}

type Unidad = { id: string; nombre: string }

// Fields are assigned explicitly: Node's strip-only TypeScript mode (used by
// scripts/jobs.mjs in production) rejects constructor parameter properties.
export class HttpInmetError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`HTTP ${status}`)
    this.name = 'HttpInmetError'
    this.status = status
  }
}

export class RespuestaInmetInvalidaError extends Error {
  constructor() {
    super('Respuesta INMET con forma inválida')
    this.name = 'RespuestaInmetInvalidaError'
  }
}

const SEVERIDAD_CAP = new Map<string, AvisoInmet['severity']>([
  ['Perigo Potencial', 'Moderate'],
  ['Perigo', 'Severe'],
  ['Grande Perigo', 'Extreme'],
])

export function severidadInmetACap(severidade: string): AvisoInmet['severity'] {
  return SEVERIDAD_CAP.get(severidade.trim()) ?? 'Moderate'
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function textoOpcional(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

function fechaBrasilia(valor: unknown): string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(valor)) {
    throw new RespuestaInmetInvalidaError()
  }
  const instante = Date.parse(`${valor.replace(' ', 'T')}:00${DESFASE_BRASILIA}`)
  if (!Number.isFinite(instante)) throw new RespuestaInmetInvalidaError()
  return new Date(instante).toISOString()
}

// riscos e instrucoes llegan como cadenas con forma de lista Python; si no
// lo son, se conserva el texto tal cual.
function listaComoPython(valor: string): string[] {
  const bruto = valor.trim()
  if (!bruto.startsWith('[') || !bruto.endsWith(']')) return [valor]
  if (bruto === '[]') return []
  const citas = [...bruto.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)]
  if (citas.length === 0) return [valor]
  return citas.map((cita) => (cita[1] ?? cita[2]).replace(/\\(.)/g, '$1'))
}

function textoDeLista(valor: unknown): string | null {
  let items: string[]
  if (Array.isArray(valor)) items = valor.filter((item): item is string => typeof item === 'string')
  else if (typeof valor === 'string') items = listaComoPython(valor)
  else return null
  const texto = items.map((item) => item.trim()).filter(Boolean).join('\n')
  return texto || null
}

function poligonoGeoJson(valor: unknown): PoligonoCAP[] {
  if (typeof valor !== 'string' || !valor.trim()) return []
  let geometria: unknown
  try {
    geometria = JSON.parse(valor)
  } catch {
    return []
  }
  if (!esObjeto(geometria) || geometria.type !== 'Polygon' || !Array.isArray(geometria.coordinates)) {
    return []
  }
  return geometria.coordinates
    .map((anillo: unknown) =>
      Array.isArray(anillo)
        ? anillo
            .filter((punto): punto is [number, number] =>
              Array.isArray(punto) && Number.isFinite(punto[0]) && Number.isFinite(punto[1]),
            )
            .map(([lon, lat]): [number, number] => [lon, lat])
        : [],
    )
    .filter((anillo: PoligonoCAP) => anillo.length >= 3)
}

function avisoDesdeCrudo(crudo: unknown): AvisoInmet {
  if (!esObjeto(crudo)) throw new RespuestaInmetInvalidaError()
  const codigo = textoOpcional(crudo.codigo)
  const descricao = textoOpcional(crudo.descricao)
  const severidade = textoOpcional(crudo.severidade)
  if (
    !codigo ||
    !descricao ||
    !severidade ||
    typeof crudo.id_aviso !== 'number' ||
    typeof crudo.encerrado !== 'boolean' ||
    typeof crudo.geocodes !== 'string'
  ) {
    throw new RespuestaInmetInvalidaError()
  }

  const onset = fechaBrasilia(crudo.inicio)
  const expires = fechaBrasilia(crudo.fim)
  const actualizado = typeof crudo.updated_at === 'string' ? Date.parse(crudo.updated_at) : Number.NaN
  const copia: Record<string, unknown> = { ...crudo }
  delete copia.icone

  return {
    id: `${PREFIJO_ID}${codigo}`,
    idAviso: crudo.id_aviso,
    sender: 'INMET',
    sent: Number.isFinite(actualizado) ? new Date(actualizado).toISOString() : onset,
    onset,
    expires,
    event: descricao,
    severity: severidadInmetACap(severidade),
    // Fuente no oficial (API no documentada): la etiqueta viaja en el titular que muestra la interfaz.
    headline: `${descricao} — ${severidade} (aviso não oficial, fonte INMET)`,
    description: textoDeLista(crudo.riscos),
    instruction: textoDeLista(crudo.instrucoes),
    geocodes: crudo.geocodes.split(',').map((codigoIbge) => codigoIbge.trim()).filter(Boolean),
    poligonos: poligonoGeoJson(crudo.poligono),
    encerrado: crudo.encerrado,
    raw: JSON.stringify(copia).slice(0, TAMANO_RAW_MAXIMO),
  }
}

export function parsearAvisosInmet(cuerpo: unknown): AvisoInmet[] {
  if (!esObjeto(cuerpo) || !Array.isArray(cuerpo.hoje) || !Array.isArray(cuerpo.futuro)) {
    throw new RespuestaInmetInvalidaError()
  }
  return [...cuerpo.hoje, ...cuerpo.futuro].map(avisoDesdeCrudo)
}

async function pedirAvisos(fetchImpl: typeof fetch): Promise<unknown> {
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS)
  try {
    const respuesta = await fetchImpl(INMET_URL_AVISOS, {
      signal: controlador.signal,
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!respuesta.ok) throw new HttpInmetError(respuesta.status)
    const contenido = await respuesta.text()
    try {
      return JSON.parse(contenido)
    } catch {
      throw new RespuestaInmetInvalidaError()
    }
  } finally {
    clearTimeout(temporizador)
  }
}

// Reintenta errores de red y 5xx; no reintenta 4xx (429 incluido) ni formas inválidas.
async function descargarAvisos(fetchImpl: typeof fetch): Promise<unknown> {
  let intento = 0
  for (;;) {
    try {
      return await pedirAvisos(fetchImpl)
    } catch (error) {
      const reintentable =
        !(error instanceof RespuestaInmetInvalidaError) &&
        !(error instanceof HttpInmetError && error.status < 500)
      if (!reintentable || intento === 2) throw error
      intento++
      await new Promise((resolver) => setTimeout(resolver, 250 * intento))
    }
  }
}

function claveCuartoHora(ahora: Date): string {
  const fecha = new Date(ahora)
  fecha.setUTCMinutes(Math.floor(fecha.getUTCMinutes() / 15) * 15, 0, 0)
  return fecha.toISOString().slice(0, 16)
}

async function guardarAvisos(
  avisos: AvisoInmet[],
  unidades: Unidad[],
  ahora: Date,
): Promise<{ guardadas: number; canceladas: number }> {
  const db = getDb()
  const ahoraIso = ahora.toISOString()
  let guardadas = 0

  for (const aviso of avisos) {
    const departamentos = unidades
      .filter((unidad) => aviso.geocodes.includes(unidad.id))
      .map(({ id, nombre }) => ({ id, nombre }))
    if (departamentos.length === 0) continue

    const valores = {
      id: aviso.id,
      sender: aviso.sender,
      sent: aviso.sent,
      onset: aviso.onset,
      expires: aviso.expires,
      event: aviso.event,
      severity: aviso.severity,
      urgency: null,
      certainty: null,
      headline: aviso.headline,
      description: aviso.description,
      instruction: aviso.instruction,
      nivelSat: null,
      departamentos,
      poligonos: aviso.poligonos,
      raw: aviso.raw,
      fetchedAt: ahoraIso,
      cancelada: aviso.encerrado,
    }
    await db
      .insert(smnAlerta)
      .values(valores)
      .onConflictDoUpdate({ target: smnAlerta.id, set: valores })
    guardadas++
  }

  // Barrido: el feed es una foto de avisos activos y futuros; un aviso vigente
  // que ya no aparece terminó o fue cancelado. Solo filas con prefijo INMET.
  const idsEnFeed = new Set(avisos.map((aviso) => aviso.id))
  const candidatas = await db
    .select({ id: smnAlerta.id })
    .from(smnAlerta)
    .where(
      and(
        like(smnAlerta.id, `${PREFIJO_ID}%`),
        eq(smnAlerta.cancelada, false),
        gt(smnAlerta.expires, ahoraIso),
      ),
    )
  let canceladas = 0
  for (const { id } of candidatas) {
    if (idsEnFeed.has(id)) continue
    await db
      .update(smnAlerta)
      .set({ cancelada: true, fetchedAt: ahoraIso })
      .where(eq(smnAlerta.id, id))
    canceladas++
  }

  await db
    .delete(smnAlerta)
    .where(
      and(
        like(smnAlerta.id, `${PREFIJO_ID}%`),
        lt(smnAlerta.fetchedAt, new Date(ahora.getTime() - 90 * 86_400_000).toISOString()),
      ),
    )
  return { guardadas, canceladas }
}

// Best-effort: a failed health write must never change the sync outcome.
async function registrarSaludInmet(
  estado: 'ok' | 'degradado' | 'no_disponible',
  ultimoErrorSaneado: string | null,
  ahora: Date,
) {
  try {
    await actualizarSaludFuente(getDb(), {
      provider: PROVIDER_SALUD,
      ttlMinutos: TTL_SALUD_MINUTOS,
      licencia: LICENCIA_SALUD,
      estado,
      ultimoErrorSaneado,
      ahoraIso: ahora.toISOString(),
    })
  } catch {
    console.warn('[inmet-alertas] no se pudo registrar la salud de la fuente')
  }
}

function errorSaneado(error: unknown): string {
  if (error instanceof HttpInmetError) return error.message
  if (error instanceof RespuestaInmetInvalidaError) return error.message
  return ERROR_SALUD_NO_DISPONIBLE
}

export async function syncInmetAlertas(
  opts: { ahora?: Date; fetchImpl?: typeof fetch; unidades?: () => Unidad[] } = {},
) {
  await cargarReferencias()
  const ahora = opts.ahora ?? new Date()
  const fetchImpl = opts.fetchImpl ?? fetch
  const unidades = opts.unidades
    ? opts.unidades()
    : listarDepartamentos().map(({ id, nombre }) => ({ id, nombre }))
  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente: claveCuartoHora(ahora),
    version: obtenerVersionGeografia(),
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, estado: 'omitido' as const }

  try {
    // The whole feed is validated before any database write.
    const avisos = parsearAvisosInmet(await descargarAvisos(fetchImpl))
    const { guardadas, canceladas } = await guardarAvisos(avisos, unidades, ahora)
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores: { procesadas: avisos.length, guardadas, canceladas },
      ahora,
    })
    await registrarSaludInmet('ok', null, ahora)
    return {
      ejecutado: true,
      estado: 'completo' as const,
      procesadas: avisos.length,
      guardadas,
      canceladas,
    }
  } catch (error) {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: errorSaneado(error),
      ahora,
    })
    if (error instanceof HttpInmetError && error.status === 429) {
      await registrarSaludInmet('degradado', ERROR_SALUD_LIMITE, ahora)
    } else {
      await registrarSaludInmet('no_disponible', ERROR_SALUD_NO_DISPONIBLE, ahora)
    }
    throw error
  }
}
