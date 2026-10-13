import { desc, eq, lt } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { smnAlerta } from '@/lib/db/schema'
import { listarDepartamentos, VERSION_GEOGRAFIA } from './departamentos'
import { adquirirLease, publicarResultado } from '../riesgo/job-run'
import { actualizarSaludFuente } from '../riesgo/jobs/salud-fuente'

export type NodoXml = {
  nombre: string
  texto: string
  hijos: NodoXml[]
}

const ENTIDADES_XML: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}
const TAMANO_MAXIMO_XML = 2_000_000
const TAMANO_RAW_MAXIMO = 50_000
const RSS_URL = 'https://ssl.smn.gob.ar/CAP/AR.php'
const TIPO_JOB = 'sync-smn-alertas'
const DURACION_LEASE_MS = 10 * 60 * 1000
// Cron cada 15 min (`7-59/15 * * * *`): el TTL acompaña esa cadencia.
const PROVIDER_SALUD = 'smn-alertas'
const TTL_SALUD_MINUTOS = 60
// Uso abierto no comercial con atribución, según el equipo (2026-10-13);
// pendiente de confirmar contra los términos oficiales del SMN.
const LICENCIA_SALUD = 'SMN CAP — uso no comercial con atribución (CC BY-NC)'
const ERROR_SALUD_NO_DISPONIBLE = 'fallo al sincronizar alertas del SMN'
const ERROR_SALUD_LIMITE = 'SMN limitó las consultas (HTTP 429)'

export class OrigenSmnBloqueadoError extends Error {
  constructor(url: string) {
    super(`El origen SMN devolvió HTML en lugar de XML (${url}); no se actualizaron alertas.`)
    this.name = 'OrigenSmnBloqueadoError'
  }
}

export class HttpSmnError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
    this.name = 'HttpSmnError'
  }
}

function caracterXmlValido(codigo: number): boolean {
  return (
    codigo === 0x9 ||
    codigo === 0xa ||
    codigo === 0xd ||
    (codigo >= 0x20 && codigo <= 0xd7ff) ||
    (codigo >= 0xe000 && codigo <= 0xfffd) ||
    (codigo >= 0x10000 && codigo <= 0x10ffff)
  )
}

function decodificarXml(texto: string): string {
  if (/&(?!(?:amp|lt|gt|quot|apos|#[^;]*);)/i.test(texto)) {
    throw new Error('Entidad XML no permitida')
  }

  return texto.replace(/&([^;]+);/g, (entidad, contenido: string) => {
    if (contenido.startsWith('#')) {
      const hexadecimal = contenido[1]?.toLowerCase() === 'x'
      const digitos = hexadecimal ? contenido.slice(2) : contenido.slice(1)
      const sintaxisValida = hexadecimal ? /^[\da-f]+$/i.test(digitos) : /^\d+$/.test(digitos)
      const codigo = sintaxisValida
        ? Number.parseInt(digitos, hexadecimal ? 16 : 10)
        : Number.NaN

      return Number.isInteger(codigo) && caracterXmlValido(codigo)
        ? String.fromCodePoint(codigo)
        : '\uFFFD'
    }

    const reemplazo = ENTIDADES_XML[contenido]
    if (reemplazo === undefined) throw new Error(`Entidad XML no permitida: ${entidad}`)
    return reemplazo
  })
}

/** Parser limitado a RSS/CAP: rechaza DTD y entidades y no resuelve referencias externas. */
export function parsearXmlSeguro(xml: string): NodoXml {
  if (xml.length > TAMANO_MAXIMO_XML || /<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error('XML rechazado por tamaño o DTD')
  }

  const raiz: NodoXml = { nombre: '#document', texto: '', hijos: [] }
  const pila = [raiz]
  const tokens = xml.match(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[^>]*\?>|<[^>]*>|[^<]+/g) ?? []

  for (const token of tokens) {
    if (token.startsWith('<![CDATA[')) {
      pila.at(-1)!.texto += token.slice(9, -3)
      continue
    }
    if (token.startsWith('<!--') || token.startsWith('<?')) continue
    if (token.startsWith('<!')) continue

    if (token.startsWith('</')) {
      const nombreCierre = token.slice(2, -1).trim().split(':').at(-1)
      if (pila.length === 1 || pila.at(-1)!.nombre !== nombreCierre) {
        throw new Error('XML mal formado')
      }
      pila.pop()
      continue
    }

    if (token.startsWith('<')) {
      const cierreVacio = /\/$/.test(token.slice(0, -1).trim())
      const cuerpo = token.slice(1, cierreVacio ? -2 : -1).trim()
      const coincidencia = /^([\w:.-]+)(?:\s+[^>]*)?$/.exec(cuerpo)
      if (!coincidencia) throw new Error('Etiqueta XML inválida')

      const nodo: NodoXml = {
        nombre: coincidencia[1].split(':').at(-1)!,
        texto: '',
        hijos: [],
      }
      pila.at(-1)!.hijos.push(nodo)
      if (!cierreVacio) pila.push(nodo)
      continue
    }

    pila.at(-1)!.texto += decodificarXml(token)
  }

  if (pila.length !== 1) throw new Error('XML mal formado')
  return raiz
}

function nodos(nodo: NodoXml, nombre: string): NodoXml[] {
  return nodo.hijos.filter((hijo) => hijo.nombre === nombre)
}

function hijo(nodo: NodoXml, nombre: string): NodoXml | undefined {
  return nodos(nodo, nombre)[0]
}

function texto(nodo: NodoXml | undefined): string | null {
  const valor = nodo?.texto.trim()
  return valor || null
}

function descendientes(nodo: NodoXml, nombre: string): NodoXml[] {
  return [
    ...nodos(nodo, nombre),
    ...nodo.hijos.flatMap((hijoXml) => descendientes(hijoXml, nombre)),
  ]
}

export type PoligonoCAP = Array<[number, number]>
export type AlertaCAP = {
  identifier: string
  sender: string
  sent: string
  msgType: string
  references: string[]
  onset: string | null
  expires: string | null
  event: string
  severity: string
  urgency: string | null
  certainty: string | null
  headline: string | null
  description: string | null
  instruction: string | null
  poligonos: PoligonoCAP[]
  raw: string
}

export function planificarMensajeCAP(
  alerta: Pick<AlertaCAP, 'identifier' | 'msgType' | 'references'>,
  tieneInterseccion: boolean,
) {
  if (alerta.msgType === 'Cancel') {
    return {
      cancelar: alerta.references.length ? alerta.references : [alerta.identifier],
      reemplazar: [],
      guardar: false,
    }
  }
  if (alerta.msgType === 'Update') {
    return { cancelar: [], reemplazar: alerta.references, guardar: tieneInterseccion }
  }
  return { cancelar: [], reemplazar: [], guardar: tieneInterseccion }
}

export function severidadCAPEnEspanol(severity: string): string {
  const traducciones: Record<string, string> = {
    Minor: 'Leve',
    Moderate: 'Moderada',
    Severe: 'Severa',
    Extreme: 'Extrema',
    Unknown: 'Desconocida',
  }
  return traducciones[severity] ?? severity
}

function parsearPuntosCAP(area: NodoXml): PoligonoCAP[] {
  return nodos(area, 'polygon')
    .map((poligono) =>
      poligono.texto
        .trim()
        .split(/\s+/)
        .map((par) => {
          const [latitud, longitud] = par.split(',').map(Number)
          if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
            throw new Error('Coordenada CAP inválida')
          }
          return [longitud, latitud] as [number, number]
        }),
    )
    .filter((poligono) => poligono.length >= 3)
}

export function parsearCAP(xml: string): AlertaCAP {
  const raiz = parsearXmlSeguro(xml)
  const alerta = descendientes(raiz, 'alert')[0]
  if (!alerta) throw new Error('CAP sin elemento alert')

  const info = hijo(alerta, 'info')
  const areas = descendientes(info ?? alerta, 'area')
  const poligonos = areas.flatMap(parsearPuntosCAP)
  const referencias = (texto(hijo(alerta, 'references')) ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((referencia) => referencia.split(',')[1])
    .filter((referencia): referencia is string => Boolean(referencia))
  const requerido = (nombre: string): string => {
    const valor = texto(hijo(alerta, nombre))
    if (!valor) throw new Error(`CAP sin ${nombre}`)
    return valor
  }
  const valorInfo = (nombre: string): string | null => texto(hijo(info ?? alerta, nombre))

  return {
    identifier: requerido('identifier'),
    sender: requerido('sender'),
    sent: requerido('sent'),
    msgType: texto(hijo(alerta, 'msgType')) ?? 'Alert',
    references: referencias,
    onset: valorInfo('onset'),
    expires: valorInfo('expires'),
    event: valorInfo('event') ?? 'Aviso meteorológico',
    severity: valorInfo('severity') ?? 'Unknown',
    urgency: valorInfo('urgency'),
    certainty: valorInfo('certainty'),
    headline: valorInfo('headline'),
    description: valorInfo('description'),
    instruction: valorInfo('instruction'),
    poligonos,
    raw: xml.slice(0, TAMANO_RAW_MAXIMO),
  }
}

type Punto = [number, number]
type Anillo = Punto[]

function dentro(punto: Punto, anillo: Anillo): boolean {
  let contenido = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const actual = anillo[i]
    const anterior = anillo[j]
    const cruzaLatitud = (actual[1] > punto[1]) !== (anterior[1] > punto[1])
    const longitudInterseccion =
      ((anterior[0] - actual[0]) * (punto[1] - actual[1])) /
        (anterior[1] - actual[1]) +
      actual[0]
    if (cruzaLatitud && punto[0] < longitudInterseccion) contenido = !contenido
  }
  return contenido
}

function orientacion(a: Punto, b: Punto, c: Punto): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

function segmentosSeCruzan(a: Punto, b: Punto, c: Punto, d: Punto): boolean {
  const o1 = orientacion(a, b, c)
  const o2 = orientacion(a, b, d)
  const o3 = orientacion(c, d, a)
  const o4 = orientacion(c, d, b)
  const cruzaEnAmbosEjes =
    Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
      Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
    Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <=
      Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]))
  return o1 * o2 <= 0 && o3 * o4 <= 0 && cruzaEnAmbosEjes
}

function poligonoIntersectaDepartamento(poligono: PoligonoCAP, departamento: Punto[][]): boolean {
  const [exterior, ...huecos] = departamento
  const puntoDentroDepartamento = (punto: Punto): boolean =>
    dentro(punto, exterior) && !huecos.some((hueco) => dentro(punto, hueco))
  const unVerticeDentro = poligono.some(puntoDentroDepartamento)
  const departamentoDentro = exterior.some((punto) => dentro(punto, poligono))
  const cruzaBordes = departamento.some((anillo) =>
    poligono.some((a, indice) =>
      anillo.some((b, indiceAnillo) =>
        segmentosSeCruzan(
          a,
          poligono[(indice + 1) % poligono.length],
          b,
          anillo[(indiceAnillo + 1) % anillo.length],
        ),
      ),
    ),
  )
  return unVerticeDentro || departamentoDentro || cruzaBordes
}

export function departamentosIntersectados(poligonos: PoligonoCAP[]) {
  return listarDepartamentos()
    .filter((departamento) =>
      poligonos.some((poligono) =>
        departamento.geometria.some((geometria) =>
          poligonoIntersectaDepartamento(poligono, geometria),
        ),
      ),
    )
    .map(({ id, nombre }) => ({ id, nombre }))
}

function esPaginaHtml(contenido: string, tipoContenido: string | null): boolean {
  const tipo = tipoContenido?.split(';')[0].trim().toLowerCase()
  const comienzo = contenido.replace(/^\uFEFF/, '').trimStart().slice(0, 80).toLowerCase()
  return tipo === 'text/html' || comienzo.startsWith('<!doctype html') || comienzo.startsWith('<html')
}

async function descargarXml(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs = 12_000,
): Promise<string> {
  for (let intento = 0; intento < 3; intento++) {
    const controlador = new AbortController()
    const temporizador = setTimeout(() => controlador.abort(), timeoutMs)
    try {
      const respuesta = await fetchImpl(url, { signal: controlador.signal })
      const contenido = await respuesta.text()
      if (esPaginaHtml(contenido, respuesta.headers.get('content-type'))) {
        throw new OrigenSmnBloqueadoError(url)
      }
      if (!respuesta.ok) throw new HttpSmnError(respuesta.status)
      return contenido
    } catch (error) {
      if (error instanceof OrigenSmnBloqueadoError || intento === 2) throw error
      await new Promise((resolver) => setTimeout(resolver, 250 * (intento + 1)))
    } finally {
      clearTimeout(temporizador)
    }
  }
  throw new Error('Fallo al descargar XML del SMN')
}

function claveCuartoHora(ahora: Date): string {
  const fecha = new Date(ahora)
  fecha.setUTCMinutes(Math.floor(fecha.getUTCMinutes() / 15) * 15, 0, 0)
  return fecha.toISOString().slice(0, 16)
}

function esUrlCapPermitida(valor: string): boolean {
  try {
    const url = new URL(valor)
    const rutaPermitida =
      /^\/CAP\/[\w.-]+\.xml$/i.test(url.pathname) ||
      /^\/feeds\/CAP\/xml_generados\/[\w.-]+\.xml$/i.test(url.pathname)
    return url.protocol === 'https:' && url.hostname === 'ssl.smn.gob.ar' && rutaPermitida
  } catch {
    return false
  }
}

export function extraerUrlsCAP(xmlFeed: string): string[] {
  const feed = parsearXmlSeguro(xmlFeed)
  return descendientes(feed, 'item')
    .flatMap((item) => nodos(item, 'link').map((link) => link.texto.trim()))
    .filter(esUrlCapPermitida)
}

async function descargarAlertasCorrientes(
  fetchImpl: typeof fetch,
): Promise<{ alertas: AlertaCAP[]; cantidadFeed: number }> {
  const xmlFeed = await descargarXml(RSS_URL, fetchImpl)
  const urls = extraerUrlsCAP(xmlFeed)

  const documentos: string[] = []
  for (let inicio = 0; inicio < urls.length; inicio += 5) {
    const lote = urls.slice(inicio, inicio + 5)
    documentos.push(...(await Promise.all(lote.map((url) => descargarXml(url, fetchImpl)))))
  }
  return { alertas: documentos.map(parsearCAP), cantidadFeed: urls.length }
}

async function guardarAlertas(
  alertas: AlertaCAP[],
  ahora: Date,
): Promise<number> {
  const db = getDb()
  let guardadas = 0

  for (const alerta of alertas) {
    const departamentos = departamentosIntersectados(alerta.poligonos)
    const plan = planificarMensajeCAP(alerta, departamentos.length > 0)

    if (plan.cancelar.length) {
      for (const id of plan.cancelar) {
        await db
          .update(smnAlerta)
          .set({ cancelada: true, expires: ahora.toISOString(), fetchedAt: ahora.toISOString() })
          .where(eq(smnAlerta.id, id))
      }
      continue
    }

    for (const id of plan.reemplazar) {
      await db
        .update(smnAlerta)
        .set({ expires: alerta.sent, fetchedAt: ahora.toISOString() })
        .where(eq(smnAlerta.id, id))
    }
    if (!plan.guardar) continue

    const valores = {
      id: alerta.identifier,
      sender: alerta.sender,
      sent: alerta.sent,
      onset: alerta.onset,
      expires: alerta.expires,
      event: alerta.event,
      severity: alerta.severity,
      urgency: alerta.urgency,
      certainty: alerta.certainty,
      headline: alerta.headline,
      description: alerta.description,
      instruction: alerta.instruction,
      nivelSat: null,
      departamentos,
      poligonos: alerta.poligonos,
      raw: alerta.raw,
      fetchedAt: ahora.toISOString(),
      cancelada: false,
    }
    await db
      .insert(smnAlerta)
      .values(valores)
      .onConflictDoUpdate({ target: smnAlerta.id, set: valores })
    guardadas++
  }

  await db
    .delete(smnAlerta)
    .where(lt(smnAlerta.fetchedAt, new Date(ahora.getTime() - 90 * 86_400_000).toISOString()))
  return guardadas
}

// Best-effort: a failed health write must never change the sync outcome.
async function registrarSaludSmn(
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
    console.warn('[smn-alertas] no se pudo registrar la salud de la fuente')
  }
}

export async function syncSmnAlertas(opts: { ahora?: Date; fetchImpl?: typeof fetch } = {}) {
  const ahora = opts.ahora ?? new Date()
  const fetchImpl = opts.fetchImpl ?? fetch
  const clave = claveCuartoHora(ahora)
  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente: clave,
    version: VERSION_GEOGRAFIA,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, estado: 'omitido' as const }

  try {
    // Complete source validation happens before any database writes.
    const resultado = await descargarAlertasCorrientes(fetchImpl)
    const guardadas = await guardarAlertas(resultado.alertas, ahora)
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores: { procesadas: resultado.alertas.length, guardadas },
      ahora,
    })
    await registrarSaludSmn('ok', null, ahora)
    return { ejecutado: true, estado: 'completo' as const, procesadas: resultado.alertas.length, guardadas }
  } catch (error) {
    if (error instanceof OrigenSmnBloqueadoError) {
      await publicarResultado({
        jobRunId: lease.jobRunId,
        leaseOwner: lease.leaseOwner,
        estado: 'fallido',
        errorSaneado: `bloqueado_por_origen: ${error.message}`,
        ahora,
      })
      // Mensaje fijo: el cuerpo HTML del origen nunca se persiste.
      await registrarSaludSmn('no_disponible', ERROR_SALUD_NO_DISPONIBLE, ahora)
      return { ejecutado: false, estado: 'bloqueado_por_origen' as const, mensaje: error.message }
    }

    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: error instanceof Error ? error.message.slice(0, 250) : 'Fallo en la descarga CAP',
      ahora,
    })
    if (error instanceof HttpSmnError && error.status === 429) {
      await registrarSaludSmn('degradado', ERROR_SALUD_LIMITE, ahora)
    } else {
      await registrarSaludSmn('no_disponible', ERROR_SALUD_NO_DISPONIBLE, ahora)
    }
    throw error
  }
}

export async function alertasSmnActivas(ahora = new Date()) {
  const filas = await getDb()
    .select()
    .from(smnAlerta)
    .where(eq(smnAlerta.cancelada, false))
    .orderBy(desc(smnAlerta.sent))

  // CAP permits explicit offsets, so compare instants instead of ISO text.
  // Upcoming alerts (onset in the future) are included too: the SMN usually
  // publishes them a day or two ahead and they are the most useful warning.
  // Active alerts come first, then upcoming ones by start time.
  const ahoraMs = ahora.getTime()
  return filas
    .filter((alerta) => {
      if (!alerta.onset || !alerta.expires) return false
      const onsetMs = Date.parse(alerta.onset)
      const expiresMs = Date.parse(alerta.expires)
      return Number.isFinite(onsetMs) && Number.isFinite(expiresMs) && ahoraMs < expiresMs
    })
    .sort((a, b) => {
      const onsetA = Date.parse(a.onset!)
      const onsetB = Date.parse(b.onset!)
      const activaA = onsetA <= ahoraMs
      const activaB = onsetB <= ahoraMs
      if (activaA !== activaB) return activaA ? -1 : 1
      return activaA ? 0 : onsetA - onsetB
    })
}
