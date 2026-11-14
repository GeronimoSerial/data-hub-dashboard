// Cliente de la API de telemetría de ANA (ServiceANA.asmx, GET heredado, sin
// autenticación). Descarga XML y lo pasa a parsers puros.
//
// Los mensajes de error son fijos: nunca incluyen el cuerpo de la respuesta.

import { type NodoXml, parsearXmlSeguro } from '../../radar-meteo/smn-alertas'

export const ANA_BASE_URL = 'http://telemetriaws1.ana.gov.br/ServiceANA.asmx'
// DataHora de ANA: hora de Brasília (UTC-3), inferido (ver docs/ejecucion-enos/B0/rio-y-alertas.md)
export const ANA_OFFSET_HORAS = -3

const TIMEOUT_MS_DEFAULT = 20_000
const TAMANO_MAXIMO_RESPUESTA = 5_000_000
const MS_POR_HORA = 3_600_000
const PATRON_CODIGO_ESTACION = /^\d{8}$/
const PATRON_DATA_HORA = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
const PATRON_HTML = /^\s*<(!doctype\s+html|html)[\s>]/i

export type LecturaAna = {
  codigoEstacao: string
  /** ISO UTC */
  medidaEn: string
  /** Nivel en cm dividido por 100. */
  lecturaM: number | null
  chuvaMm: number | null
}

export type EstacionAna = {
  codigo: string
  nome: string
  rio: string | null
  lat: number | null
  lon: number | null
  telemetrica: boolean
  operando: boolean
  responsavel: string | null
  escalaInicio: string | null
  telemInicio: string | null
  ultimaAtualizacao: string | null
}

// Fields are assigned explicitly: Node's strip-only TypeScript mode (used by
// scripts/jobs.mjs in production) rejects constructor parameter properties.
export class HttpAnaError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`HTTP ${status}`)
    this.name = 'HttpAnaError'
    this.status = status
  }
}

export class ErrorRedAna extends Error {
  constructor(mensaje = 'error de red al consultar ANA') {
    super(mensaje)
    this.name = 'ErrorRedAna'
  }
}

export class RespuestaAnaInvalidaError extends Error {
  constructor() {
    super('ANA devolvió una respuesta que no es XML válido')
    this.name = 'RespuestaAnaInvalidaError'
  }
}

function fechaBrasiliaDdMmAaaa(fecha: Date): string {
  const local = new Date(fecha.getTime() + ANA_OFFSET_HORAS * MS_POR_HORA)
  const dia = String(local.getUTCDate()).padStart(2, '0')
  const mes = String(local.getUTCMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${local.getUTCFullYear()}`
}

function fechaAnaAIso(valor: string): string | null {
  const coincidencia = PATRON_DATA_HORA.exec(valor.trim())
  if (!coincidencia) return null
  const [anio, mes, dia, hora, minuto, segundo] = coincidencia.slice(1).map(Number)
  if (hora > 23 || minuto > 59 || segundo > 59) return null
  const local = Date.UTC(anio, mes - 1, dia, hora, minuto, segundo)
  const calendario = new Date(local)
  if (calendario.getUTCMonth() !== mes - 1 || calendario.getUTCDate() !== dia) return null
  return new Date(local - ANA_OFFSET_HORAS * MS_POR_HORA).toISOString()
}

function numeroOpcional(valor: string | null): number | null {
  if (valor === null) return null
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

function textoHijo(nodo: NodoXml, nombre: string): string | null {
  const valor = nodo.hijos.find((hijo) => hijo.nombre === nombre)?.texto.trim()
  return valor ? valor : null
}

function buscarNodos(nodo: NodoXml, nombre: string): NodoXml[] {
  return nodo.hijos.flatMap((hijo) =>
    hijo.nombre === nombre ? [hijo, ...buscarNodos(hijo, nombre)] : buscarNodos(hijo, nombre),
  )
}

function parsearRaiz(xml: string): NodoXml {
  if (xml.length > TAMANO_MAXIMO_RESPUESTA || PATRON_HTML.test(xml)) {
    throw new RespuestaAnaInvalidaError()
  }
  const cuerpo = xml.trim()
  if (cuerpo === '' || cuerpo === 'Sem dados') {
    return { nombre: '#document', texto: '', hijos: [] }
  }
  try {
    return parsearXmlSeguro(cuerpo)
  } catch {
    throw new RespuestaAnaInvalidaError()
  }
}

/** Filas de DadosHidrometeorologicos en orden ascendente. Filas con DataHora inválida se descartan. */
export function parsearDadosAna(xml: string): LecturaAna[] {
  const raiz = parsearRaiz(xml)
  return buscarNodos(raiz, 'DadosHidrometereologicos')
    .flatMap((fila): LecturaAna[] => {
      const medidaEn = fechaAnaAIso(textoHijo(fila, 'DataHora') ?? '')
      if (medidaEn === null) return []
      const nivel = numeroOpcional(textoHijo(fila, 'Nivel'))
      return [
        {
          codigoEstacao: textoHijo(fila, 'CodEstacao') ?? '',
          medidaEn,
          lecturaM: nivel === null ? null : nivel / 100,
          chuvaMm: numeroOpcional(textoHijo(fila, 'Chuva')),
        },
      ]
    })
    .sort((a, b) => Date.parse(a.medidaEn) - Date.parse(b.medidaEn))
}

export function parsearInventarioAna(xml: string): EstacionAna[] {
  const raiz = parsearRaiz(xml)
  return buscarNodos(raiz, 'Table').map((fila) => ({
    codigo: textoHijo(fila, 'Codigo') ?? '',
    nome: textoHijo(fila, 'Nome') ?? '',
    rio: textoHijo(fila, 'RioNome'),
    lat: numeroOpcional(textoHijo(fila, 'Latitude')),
    lon: numeroOpcional(textoHijo(fila, 'Longitude')),
    telemetrica: textoHijo(fila, 'TipoEstacaoTelemetrica') === '1',
    operando: textoHijo(fila, 'Operando') === '1',
    responsavel: textoHijo(fila, 'ResponsavelSigla'),
    escalaInicio: textoHijo(fila, 'PeriodoEscalaInicio'),
    telemInicio: textoHijo(fila, 'PeriodoTelemetricaInicio'),
    ultimaAtualizacao: textoHijo(fila, 'UltimaAtualizacao'),
  }))
}

/** Descarga las lecturas de una estación entre dos instantes (días en hora de Brasília). */
export async function descargarDadosAna(p: {
  codigoEstacao: string
  desde: Date
  hasta: Date
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<LecturaAna[]> {
  if (!PATRON_CODIGO_ESTACION.test(p.codigoEstacao)) {
    throw new Error('código de estación ANA inválido')
  }
  const fetchImpl = p.fetchImpl ?? fetch
  const timeoutMs = p.timeoutMs ?? TIMEOUT_MS_DEFAULT
  const url =
    `${ANA_BASE_URL}/DadosHidrometeorologicos?codEstacao=${p.codigoEstacao}` +
    `&dataInicio=${fechaBrasiliaDdMmAaaa(p.desde)}&dataFim=${fechaBrasiliaDdMmAaaa(p.hasta)}`

  const controlador = new AbortController()
  let temporizador: ReturnType<typeof setTimeout> | undefined
  // A fetch may ignore the abort signal, so the timeout is enforced by its own promise too.
  const limite = new Promise<never>((_resolve, reject) => {
    temporizador = setTimeout(() => {
      controlador.abort()
      reject(new ErrorRedAna('timeout al consultar ANA'))
    }, timeoutMs)
  })

  const solicitud = (async (): Promise<string> => {
    const respuesta = await fetchImpl(url, {
      headers: { Accept: 'text/xml' },
      signal: controlador.signal,
    })
    if (!respuesta.ok) throw new HttpAnaError(respuesta.status)
    const tipo = respuesta.headers.get('content-type')
    if (tipo !== null && /text\/html/i.test(tipo)) throw new RespuestaAnaInvalidaError()
    return respuesta.text()
  })()

  let cuerpo: string
  try {
    cuerpo = await Promise.race([solicitud, limite])
  } catch (error) {
    if (
      error instanceof HttpAnaError ||
      error instanceof RespuestaAnaInvalidaError ||
      error instanceof ErrorRedAna
    ) {
      throw error
    }
    throw new ErrorRedAna()
  } finally {
    clearTimeout(temporizador)
  }
  return parsearDadosAna(cuerpo)
}
