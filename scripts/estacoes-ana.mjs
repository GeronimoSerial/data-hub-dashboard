#!/usr/bin/env node
/**
 * `node scripts/estacoes-ana.mjs`: genera el dataset de referencia `estacoes-ana`
 * (estaciones hidrométricas de la ANA dentro del bbox de la región) a partir del
 * inventario HidroInventario. La salida es una entrada de `datasets-infraestructura.mjs
 * importar` (la que lee `region:cargar`) y es determinista: la misma entrada y el mismo
 * --fecha producen el mismo archivo byte a byte.
 *
 * El XML de la ANA se trata como dato no confiable: solo se lee texto, nunca se ejecuta.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const URL_INVENTARIO = 'http://telemetriaws1.ana.gov.br/ServiceANA.asmx/HidroInventario'
// El servicio exige todos los parámetros aunque vayan vacíos (responde 500 si falta alguno).
const PARAMETROS = {
  codEstDE: '14000000', codEstATE: '14999999', codBacia: '', codSubBacia: '', codRio: '', codEstado: '',
  codMunicipio: '', nmEstacao: '', nmEst: '', nmRio: '', nmEstado: '', nmMunicipio: '', sgResp: '', sgOper: '',
  telemetrica: '', tpEst: '', nuAnoRecente: '', tpEstacao: '',
}
const TIMEOUT_MS = 20_000
const TAMANO_MAXIMO_XML = 8 * 1024 * 1024
const FUENTE = 'ANA, Inventário de estações hidrométricas (HidroInventario, ServiceANA)'
const USO = 'Uso: node scripts/estacoes-ana.mjs [--desde-archivo <xml>] [--salida <json>] [--region manaos] [--fecha YYYY-MM-DD]'
const OPCIONES = new Map([
  ['--desde-archivo', 'desdeArchivo'], ['--salida', 'salida'], ['--region', 'region'], ['--fecha', 'fecha'],
])

// Umbrales por estación. Solo Manaus Porto (14990000). Escala del SGB SACE, Manaus:
// alerta 27,00 m (alerta), inundação 27,50 m, inundação severa 29,00 m.
// Mapeo: alertaM = alerta (27.00); evacuacionM = inundação severa (29.00).
// Fuente: https://sace.sgb.gov.br/niveis/relatorio.php?apenas_grafico=sim&bacia=amazonas&pm=8&s=33&sr=106
export const UMBRALES = Object.freeze({
  '14990000': Object.freeze({ alertaM: 27.0, evacuacionM: 29.0 }),
})

// Error de invocación o de configuración: sale con código 2, como region-cargar.mjs.
export class ErrorUso extends Error {
  constructor(mensaje) {
    super(mensaje)
    this.name = 'ErrorUso'
  }
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

// Una sola pasada: así "&amp;lt;" queda como "&lt;" y no se decodifica dos veces.
function decodificar(texto) {
  return texto.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, entidad) => {
    if (entidad[0] !== '#') return ENTIDADES[entidad]
    const codigo = entidad[1] === 'x' ? parseInt(entidad.slice(2), 16) : parseInt(entidad.slice(1), 10)
    if (!Number.isInteger(codigo) || codigo > 0x10ffff) throw new Error(`referencia de carácter inválida: &${entidad};`)
    return String.fromCodePoint(codigo)
  })
}

// Cada registro del DataSet es un elemento <Table>; sus hijos son campos planos.
function bloquesTabla(xml) {
  return [...xml.matchAll(/<Table(?=[\s>])[^>]*>([\s\S]*?)<\/Table>/g)].map((m) => m[1])
}

// Campos planos <Nombre>valor</Nombre> o <Nombre />, con el texto decodificado y recortado.
function camposDe(bloque) {
  const campos = {}
  for (const [, nombre, valor = ''] of bloque.matchAll(/<([A-Za-z][\w.-]*)(?:\s[^>]*?)?(?:\/>|>([^<]*)<\/\1>)/g)) {
    campos[nombre] = decodificar(valor).trim()
  }
  return campos
}

const texto = (valor) => (valor ? valor : null)

function coordenada(valor, maximo) {
  if (!valor) return null
  const numero = Number(valor)
  if (!Number.isFinite(numero) || Math.abs(numero) > maximo) throw new Error(`coordenada inválida: "${valor}"`)
  return numero
}

// Fechas del inventario ("1902-09-01 00:00:00") a YYYY-MM-DD; cualquier otra forma es null.
function fecha(valor) {
  const coincidencia = /^(\d{4}-\d{2}-\d{2})/.exec(valor ?? '')
  return coincidencia ? coincidencia[1] : null
}

const esTelemetrica = (valor) => valor === '1'

export function construirEstaciones(xml, bbox, consultadaEl) {
  if (typeof xml !== 'string' || xml.length > TAMANO_MAXIMO_XML) throw new Error('XML de inventario rechazado por tamaño')
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML de inventario rechazado: contiene DOCTYPE o ENTITY')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(consultadaEl)) throw new Error(`fecha de consulta inválida: "${consultadaEl}"`)

  const vistos = new Set()
  const estaciones = []
  for (const bloque of bloquesTabla(xml)) {
    const campos = camposDe(bloque)
    const codigo = campos.Codigo ?? ''
    if (!/^\d{8}$/.test(codigo)) throw new Error(`código de estación inválido: "${codigo}"`)
    if (vistos.has(codigo)) throw new Error(`código de estación duplicada: ${codigo}`)
    vistos.add(codigo)

    const lat = coordenada(campos.Latitude, 90)
    const lon = coordenada(campos.Longitude, 180)
    if (lat === null || lon === null) continue
    if (lat < bbox.latMin || lat > bbox.latMax || lon < bbox.lonMin || lon > bbox.lonMax) continue

    const umbral = UMBRALES[codigo] ?? { alertaM: null, evacuacionM: null }
    estaciones.push({
      estacionId: codigo,
      nome: texto(campos.Nome),
      rio: texto(campos.RioNome),
      lat,
      lon,
      telemetrica: esTelemetrica(campos.TipoEstacaoTelemetrica),
      operando: campos.Operando === '1',
      responsavel: texto(campos.ResponsavelSigla),
      escalaInicio: fecha(campos.PeriodoEscalaInicio),
      telemInicio: fecha(campos.PeriodoTelemetricaInicio),
      ultimaAtualizacao: fecha(campos.UltimaAtualizacao),
      alertaM: umbral.alertaM,
      evacuacionM: umbral.evacuacionM,
      fuente: 'ana-hidroinventario',
      consultadaEl,
    })
  }
  return estaciones.sort((a, b) => (a.estacionId < b.estacionId ? -1 : a.estacionId > b.estacionId ? 1 : 0))
}

export function construirEnvelope(estaciones, consultadaEl) {
  return {
    datasetId: 'estacoes-ana',
    nombre: 'Estações hidrométricas (ANA)',
    revision: `ana-hidroinventario-${consultadaEl}`,
    fuente: FUENTE,
    formato: 'array',
    clave: 'estacionId',
    datos: estaciones,
  }
}

export function serializar(envelope) {
  return `${JSON.stringify(envelope, null, 2)}\n`
}

export async function descargarInventario(fetchImpl = fetch) {
  const url = new URL(URL_INVENTARIO)
  for (const [clave, valor] of Object.entries(PARAMETROS)) url.searchParams.set(clave, valor)
  const respuesta = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!respuesta.ok) throw new Error(`la ANA respondió ${respuesta.status}`)
  const xml = await respuesta.text()
  if (xml.length > TAMANO_MAXIMO_XML || /<html/i.test(xml.slice(0, 300)) || !xml.includes('<DataSet')) {
    throw new Error('la ANA devolvió algo que no es un DataSet XML')
  }
  return xml
}

export function leerArgumentos(argv) {
  const opciones = {
    region: 'manaos',
    fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Manaus' }),
    desdeArchivo: null,
    salida: null,
  }
  for (let indice = 0; indice < argv.length; indice += 2) {
    const clave = OPCIONES.get(argv[indice])
    const valor = argv[indice + 1]
    if (!clave || valor === undefined || valor.startsWith('--')) throw new ErrorUso(USO)
    opciones[clave] = valor
  }
  if (!/^[a-z0-9-]+$/.test(opciones.region)) throw new ErrorUso(`región inválida: "${opciones.region}"`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opciones.fecha)) throw new ErrorUso(`fecha inválida: "${opciones.fecha}"`)
  return opciones
}

export function leerBbox(region) {
  const archivo = join(RAIZ, 'config', 'regiones', `${region}.json`)
  if (!existsSync(archivo)) throw new ErrorUso(`región desconocida: "${region}" (no existe ${archivo})`)
  const bbox = JSON.parse(readFileSync(archivo, 'utf8')).bboxPlausible
  for (const campo of ['latMin', 'latMax', 'lonMin', 'lonMax']) {
    if (!Number.isFinite(bbox?.[campo])) throw new ErrorUso(`bboxPlausible.${campo} ausente en ${region}.json`)
  }
  return bbox
}

// Devuelve la línea de resumen; lanza ErrorUso para los errores de invocación.
export async function main(argv = process.argv.slice(2), fetchImpl = fetch) {
  const opciones = leerArgumentos(argv)
  const bbox = leerBbox(opciones.region)
  const xml = opciones.desdeArchivo
    ? readFileSync(resolve(opciones.desdeArchivo), 'utf8')
    : await descargarInventario(fetchImpl)
  const estaciones = construirEstaciones(xml, bbox, opciones.fecha)
  const salida = opciones.salida
    ? resolve(opciones.salida)
    : join(RAIZ, 'data', 'regiones', opciones.region, 'estacoes-ana.json')
  mkdirSync(dirname(salida), { recursive: true })
  writeFileSync(salida, serializar(construirEnvelope(estaciones, opciones.fecha)))
  return `${estaciones.length} estaciones en ${salida}`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (linea) => { console.log(linea) },
    (error) => {
      console.error(error instanceof ErrorUso ? error.message : `error: ${String(error.message).slice(0, 500)}`)
      process.exitCode = error instanceof ErrorUso ? 2 : 1
    },
  )
}
