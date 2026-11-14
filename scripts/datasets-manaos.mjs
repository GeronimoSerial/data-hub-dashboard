#!/usr/bin/env node
/**
 * Construye los datasets de referencia de Manaos (B12.1) desde descargas públicas.
 *
 *   node scripts/datasets-manaos.mjs descargar --dir <dir>
 *   node scripts/datasets-manaos.mjs construir --dir <dir> [--seduc <archivo.csv>]
 *
 * `<dir>` debe ser un directorio nuevo FUERA del repositorio: los archivos
 * descargados son datos no confiables, solo se leen, nunca se ejecutan.
 *
 * Fuentes (recuperación y licencias en docs/ejecucion-enos/B0/datos-escuelas-territorio.md):
 *   - INEP, Censo Escolar 2024 (identidad de las escuelas, sin coordenadas).
 *   - IBGE, CNEFE 2022 (puntos de espécie 4, enseñanza) y Malha Municipal 2025.
 *   - OpenStreetMap, amenity=school (ODbL), para elevar el conjunto confiable.
 *   - Opcional `--seduc`: CSV con CO_ENTIDADE y LATITUDE/LONGITUDE (o lat/lon) de la
 *     SEDUC-AM o la SEMED. Sus coordenadas tienen precedencia sobre las demás.
 *
 * Salidas (el formato de `scripts/region-cargar.mjs`):
 *   data/regiones/manaos/{localizaciones,departamentos,mascara}.json
 *   public/data/{municipios-manaos,mascara-manaos}.geojson
 *
 * Una escuela solo recibe coordenadas con una coincidencia confiable: nunca por
 * CEP. Sin coincidencia confiable queda con lat y lon nulos.
 */
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const ejecutar = promisify(execFile)
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')

export const FUENTES = {
  inep: 'https://download.inep.gov.br/dados_abertos/microdados_censo_escolar_2024.zip',
  cnefe: 'https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/Municipio/13_AM/',
  malha: 'https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2025/UFs/AM/AM_Municipios_2025.zip',
}
export const CSV_INEP = 'microdados_censo_escolar_2024_defeso/dados/microdados_ed_basica_2024.csv'
export const MD5_INEP = 'microdados_censo_escolar_2024_defeso/dados/md5_microdados_ed_basica_2024.txt'
export const FECHA_FUENTES = '2026-11-13'
export const DISTANCIA_AMBIGUA_M = 200
export const DISTANCIA_OSM_M = 500
export const TOLERANCIA_SIMPLIFICACION = 0.0005
export const GEOCALIDAD = {
  seduc: 'seduc',
  osmRef: 'osm-ref-inep',
  cnefeNombreCalle: 'cnefe-nombre-calle',
  cnefeNombre: 'cnefe-nombre',
  osmCalle: 'osm-calle',
}

// ── Texto ────────────────────────────────────────────────────────────────────

export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

const TIPOS_VIA = new Set(['R', 'RUA', 'AV', 'AVENIDA', 'ESTRADA', 'EST', 'TRAVESSA', 'TV', 'TRAV', 'BECO', 'ALAMEDA', 'AL', 'RODOVIA', 'ROD', 'VILA', 'PRACA', 'PC', 'VIA', 'LOTEAMENTO', 'CONJUNTO', 'CONJ'])

/** Núcleo de una dirección: sin tipo de vía ni signos, para comparar INEP con CNEFE. */
export function nucleoCalle(texto) {
  return normalizar(texto).split(' ').filter((t) => t && !TIPOS_VIA.has(t)).join(' ')
}

const PALABRAS_VACIAS = new Set(['DE', 'DO', 'DA', 'DOS', 'DAS', 'E'])

/** Palabras significativas de una dirección (sin tipo de vía ni conectores). */
export function tokensCalle(texto) {
  return nucleoCalle(texto).split(' ').filter((t) => t && !PALABRAS_VACIAS.has(t))
}

/** Dos direcciones son compatibles si las palabras de la más corta están todas en la otra. */
export function callesCompatibles(a, b) {
  const ta = new Set(tokensCalle(a))
  const tb = new Set(tokensCalle(b))
  if (!ta.size || !tb.size) return false
  const [corta, larga] = ta.size <= tb.size ? [ta, tb] : [tb, ta]
  return [...corta].every((t) => larga.has(t))
}

export function numeroCalle(texto) {
  const limpio = normalizar(texto)
  return /^\d+$/.test(limpio) && Number(limpio) > 0 ? limpio : null
}

/** Número finito o NaN: una cadena vacía no es 0. */
export function numeroFinito(valor) {
  const texto = String(valor ?? '').trim().replace(',', '.')
  return texto === '' ? Number.NaN : Number(texto)
}

export function distanciaM(a, b) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.sqrt(h))
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** Una línea de CSV con comillas dobles; sin saltos de línea dentro de un campo. */
export function parsearLinea(linea, delimitador = ';') {
  const campos = []
  let actual = ''
  let entreComillas = false
  for (let i = 0; i < linea.length; i += 1) {
    const c = linea[i]
    if (entreComillas) {
      if (c === '"' && linea[i + 1] === '"') { actual += '"'; i += 1 } else if (c === '"') entreComillas = false
      else actual += c
    } else if (c === '"') entreComillas = true
    else if (c === delimitador) { campos.push(actual); actual = '' } else actual += c
  }
  campos.push(actual)
  return campos
}

/** Recorre un flujo de líneas y entrega los registros como objetos por encabezado. */
export async function leerRegistros(flujoLineas, { delimitador = ';', filtro = () => true } = {}) {
  const registros = []
  let encabezado = null
  for await (const linea of flujoLineas) {
    if (!linea) continue
    const campos = parsearLinea(linea.replace(/\r$/, ''), delimitador)
    if (!encabezado) { encabezado = campos.map((c) => c.replace(/^﻿/, '')); continue }
    const registro = Object.fromEntries(encabezado.map((nombre, i) => [nombre, campos[i] ?? '']))
    if (filtro(registro)) registros.push(registro)
  }
  return registros
}

export function lineasDeTexto(texto) {
  return texto.split('\n')
}

function lineasDeArchivo(ruta, codificacion) {
  return createInterface({ input: createReadStream(ruta, { encoding: codificacion }), crlfDelay: Infinity })
}

function lineasDeZip(ruta, miembro, codificacion) {
  const hijo = spawn('unzip', ['-p', ruta, ...(miembro ? [miembro] : [])], { stdio: ['ignore', 'pipe', 'ignore'] })
  hijo.stdout.setEncoding(codificacion)
  return createInterface({ input: hijo.stdout, crlfDelay: Infinity })
}

// ── Shapefile (polígonos) y GeoJSON ──────────────────────────────────────────

export function leerDbf(buffer, codificacion = 'utf8') {
  const n = buffer.readUInt32LE(4)
  const largoCabecera = buffer.readUInt16LE(8)
  const largoRegistro = buffer.readUInt16LE(10)
  const campos = []
  for (let o = 32; buffer[o] !== 0x0d; o += 32) {
    campos.push({ nombre: buffer.toString('latin1', o, o + 11).split('\0')[0], largo: buffer[o + 16] })
  }
  const decodificador = new TextDecoder(codificacion)
  return Array.from({ length: n }, (_, i) => {
    let p = largoCabecera + i * largoRegistro + 1
    const fila = {}
    for (const { nombre, largo } of campos) {
      fila[nombre] = decodificador.decode(buffer.subarray(p, p + largo)).trim()
      p += largo
    }
    return fila
  })
}

function areaFirmada(anillo) {
  let suma = 0
  for (let i = 0; i < anillo.length - 1; i += 1) suma += anillo[i][0] * anillo[i + 1][1] - anillo[i + 1][0] * anillo[i][1]
  return suma / 2
}

/** Lee un .shp de polígonos (tipo 5): una geometría GeoJSON por registro, en el orden del archivo. */
export function leerShp(buffer) {
  const geometrias = []
  let p = 100
  while (p + 8 <= buffer.length) {
    const largo = buffer.readInt32BE(p + 4) * 2
    const tipo = buffer.readInt32LE(p + 8)
    if (tipo === 0) { geometrias.push(null); p += 8 + largo; continue }
    if (tipo !== 5) throw new Error(`Tipo de forma no soportado: ${tipo}`)
    const partes = buffer.readInt32LE(p + 44)
    const puntos = buffer.readInt32LE(p + 48)
    const inicioPartes = p + 52
    const inicioPuntos = inicioPartes + 4 * partes
    const indices = Array.from({ length: partes }, (_, i) => buffer.readInt32LE(inicioPartes + 4 * i))
    indices.push(puntos)
    const poligonos = []
    for (let i = 0; i < partes; i += 1) {
      const anillo = []
      for (let k = indices[i]; k < indices[i + 1]; k += 1) {
        anillo.push([buffer.readDoubleLE(inicioPuntos + 16 * k), buffer.readDoubleLE(inicioPuntos + 16 * k + 8)])
      }
      if (areaFirmada(anillo) <= 0) poligonos.push([anillo.slice().reverse()])
      else if (poligonos.length) poligonos.at(-1).push(anillo)
    }
    geometrias.push(poligonos.length === 1
      ? { type: 'Polygon', coordinates: poligonos[0] }
      : { type: 'MultiPolygon', coordinates: poligonos })
    p += 8 + largo
  }
  return geometrias
}

function distanciaSegmento(punto, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const largo2 = dx * dx + dy * dy
  const t = largo2 ? Math.max(0, Math.min(1, ((punto[0] - a[0]) * dx + (punto[1] - a[1]) * dy) / largo2)) : 0
  return Math.hypot(punto[0] - (a[0] + t * dx), punto[1] - (a[1] + t * dy))
}

/** Douglas-Peucker iterativo sobre una línea. */
export function simplificarLinea(puntos, tolerancia) {
  if (puntos.length < 3) return puntos
  const conservar = new Uint8Array(puntos.length)
  conservar[0] = 1
  conservar[puntos.length - 1] = 1
  const pila = [[0, puntos.length - 1]]
  while (pila.length) {
    const [i, j] = pila.pop()
    let maxima = 0
    let indice = -1
    for (let k = i + 1; k < j; k += 1) {
      const d = distanciaSegmento(puntos[k], puntos[i], puntos[j])
      if (d > maxima) { maxima = d; indice = k }
    }
    if (indice > -1 && maxima > tolerancia) {
      conservar[indice] = 1
      pila.push([i, indice], [indice, j])
    }
  }
  return puntos.filter((_, k) => conservar[k])
}

const redondear = (v) => Math.round(v * 1e5) / 1e5

function simplificarAnillo(anillo, tolerancia) {
  const simple = simplificarLinea(anillo, tolerancia).map(([x, y]) => [redondear(x), redondear(y)])
  return simple.length >= 4 ? simple : null
}

export function simplificarGeometria(geometria, tolerancia = TOLERANCIA_SIMPLIFICACION) {
  const poligonos = (geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates)
    .map(([exterior, ...huecos]) => {
      const ext = simplificarAnillo(exterior, tolerancia)
      return ext ? [ext, ...huecos.map((h) => simplificarAnillo(h, tolerancia)).filter(Boolean)] : null
    })
    .filter(Boolean)
  return poligonos.length === 1 ? { type: 'Polygon', coordinates: poligonos[0] } : { type: 'MultiPolygon', coordinates: poligonos }
}

export function cajaGeometria(geometria) {
  const caja = { lonMin: Infinity, lonMax: -Infinity, latMin: Infinity, latMax: -Infinity }
  const poligonos = geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates
  for (const [exterior] of poligonos) {
    for (const [lon, lat] of exterior) {
      caja.lonMin = Math.min(caja.lonMin, lon); caja.lonMax = Math.max(caja.lonMax, lon)
      caja.latMin = Math.min(caja.latMin, lat); caja.latMax = Math.max(caja.latMax, lat)
    }
  }
  return caja
}

export function cajaToca(caja, bbox) {
  return caja.lonMax >= bbox.lonMin && caja.lonMin <= bbox.lonMax && caja.latMax >= bbox.latMin && caja.latMin <= bbox.latMax
}

export function enCaja(punto, bbox) {
  return punto.lon >= bbox.lonMin && punto.lon <= bbox.lonMax && punto.lat >= bbox.latMin && punto.lat <= bbox.latMax
}

/** Centroide del anillo exterior de mayor área (suficiente para ubicar la etiqueta). */
export function centroide(geometria) {
  const poligonos = geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates
  const [exterior] = poligonos.reduce((mejor, actual) => (Math.abs(areaFirmada(actual[0])) > Math.abs(areaFirmada(mejor[0])) ? actual : mejor))
  const area = areaFirmada(exterior)
  let cx = 0
  let cy = 0
  for (let i = 0; i < exterior.length - 1; i += 1) {
    const f = exterior[i][0] * exterior[i + 1][1] - exterior[i + 1][0] * exterior[i][1]
    cx += (exterior[i][0] + exterior[i + 1][0]) * f
    cy += (exterior[i][1] + exterior[i + 1][1]) * f
  }
  return { lat: redondear(cy / (6 * area)), lon: redondear(cx / (6 * area)) }
}

function puntoEnAnillo([x, y], anillo) {
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i, i += 1) {
    const [xi, yi] = anillo[i]
    const [xj, yj] = anillo[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

function segmentosSeCruzan(a, b, c, d) {
  const orientacion = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return orientacion(a, b, c) !== orientacion(a, b, d) && orientacion(c, d, a) !== orientacion(c, d, b)
}

/** Intersección exacta de un polígono con el rectángulo: vértice dentro, arista que cruza o esquina dentro. */
export function poligonoToca(geometria, bbox) {
  const rect = [[bbox.lonMin, bbox.latMin], [bbox.lonMax, bbox.latMin], [bbox.lonMax, bbox.latMax], [bbox.lonMin, bbox.latMax], [bbox.lonMin, bbox.latMin]]
  const poligonos = geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates
  for (const [exterior] of poligonos) {
    if (exterior.some(([lon, lat]) => enCaja({ lon, lat }, bbox))) return true
    if (rect.slice(0, 4).some((esquina) => puntoEnAnillo(esquina, exterior))) return true
    for (let i = 0; i < exterior.length - 1; i += 1) {
      for (let k = 0; k < 4; k += 1) if (segmentosSeCruzan(exterior[i], exterior[i + 1], rect[k], rect[k + 1])) return true
    }
  }
  return false
}

/** Municipios cuyo contorno interseca el bbox plausible de la región. */
export function municipiosDelArea(geometrias, filas, bbox) {
  return filas.flatMap((fila, i) => {
    const geometria = geometrias[i]
    if (!geometria || !cajaToca(cajaGeometria(geometria), bbox) || !poligonoToca(geometria, bbox)) return []
    return [{ codigo: fila.CD_MUN, nombre: fila.NM_MUN, geometria: simplificarGeometria(geometria) }]
  }).sort((a, b) => a.codigo.localeCompare(b.codigo))
}

export function featuresMunicipios(municipios) {
  return municipios.map((m) => ({
    type: 'Feature',
    properties: { id: m.codigo, nombre: m.nombre, centroide: centroide(m.geometria) },
    geometry: m.geometria,
  }))
}

export async function construirMascara(municipios) {
  const { union } = await import('@turf/union')
  const { difference } = await import('@turf/difference')
  const { featureCollection, feature } = await import('@turf/helpers')
  const unidos = union(featureCollection(municipios.map((m) => feature(m.geometria))))
  const mundo = feature({ type: 'Polygon', coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, 90], [-180, -90]]] })
  const recortada = difference(featureCollection([mundo, unidos]))
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: simplificarGeometria(recortada.geometry, 0) }] }
}

// ── Escuelas ─────────────────────────────────────────────────────────────────

/**
 * Escuelas en actividad de los municipios indicados, desde registros del Censo Escolar.
 * @param {Array<Record<string, string>>} registros
 * @param {Set<string>} codigosMunicipio
 */
export function escuelasInep(registros, codigosMunicipio) {
  const vistos = new Set()
  return registros.flatMap((r) => {
    if (r.SG_UF !== 'AM' || r.TP_SITUACAO_FUNCIONAMENTO !== '1' || !codigosMunicipio.has(r.CO_MUNICIPIO) || vistos.has(r.CO_ENTIDADE)) return []
    vistos.add(r.CO_ENTIDADE)
    return [{
      codigo: r.CO_ENTIDADE,
      nombre: r.NO_ENTIDADE,
      municipio: r.CO_MUNICIPIO,
      direccion: r.DS_ENDERECO,
      numero: r.NU_ENDERECO,
      bairro: r.NO_BAIRRO,
    }]
  })
}

/** Puntos de CNEFE espécie 4 (enseñanza) con coordenadas numéricas. */
export function puntosCnefe(registros) {
  return registros.flatMap((r) => {
    const lat = numeroFinito(r.LATITUDE)
    const lon = numeroFinito(r.LONGITUDE)
    if (r.COD_ESPECIE !== '4' || !Number.isFinite(lat) || !Number.isFinite(lon) || !r.DSC_ESTABELECIMENTO) return []
    return [{ municipio: r.COD_MUNICIPIO, nombre: normalizar(r.DSC_ESTABELECIMENTO), calle: nucleoCalle(r.NOM_SEGLOGR), calleCompleta: `${r.NOM_TIPO_SEGLOGR ?? ''} ${r.NOM_TITULO_SEGLOGR ?? ''} ${r.NOM_SEGLOGR ?? ''}`.trim(), numero: numeroCalle(r.NUM_ENDERECO), lat, lon }]
  })
}

/**
 * Escuelas de OSM: centro del nodo o de la vía, y la referencia INEP cuando existe.
 * @param {{ elements?: any[] }} overpass
 */
export function escuelasOsm(overpass) {
  return (overpass.elements ?? []).flatMap((e) => {
    const lat = e.lat ?? e.center?.lat
    const lon = e.lon ?? e.center?.lon
    const nombre = e.tags?.name
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []
    const ref = /^INEP-?(\d{8})$/i.exec(e.tags?.ref ?? '')
    return [{ nombre: nombre ? normalizar(nombre) : '', codigoInep: ref?.[1] ?? null, lat, lon }]
  })
}

/** Lee un CSV con CO_ENTIDADE y coordenadas (LATITUDE/LONGITUDE o lat/lon). */
export function leerSeduc(registros) {
  return new Map(registros.flatMap((r) => {
    const codigo = String(r.CO_ENTIDADE ?? r.co_entidade ?? '').trim()
    const lat = numeroFinito(r.LATITUDE ?? r.lat ?? r.latitude)
    const lon = numeroFinito(r.LONGITUDE ?? r.lon ?? r.longitude)
    return /^\d{8}$/.test(codigo) && Number.isFinite(lat) && Number.isFinite(lon) ? [[codigo, { lat, lon }]] : []
  }))
}

function centroDe(candidatos) {
  const lat = candidatos.reduce((s, c) => s + c.lat, 0) / candidatos.length
  const lon = candidatos.reduce((s, c) => s + c.lon, 0) / candidatos.length
  return { lat, lon }
}

function dispersionMaxima(candidatos) {
  let maxima = 0
  for (let i = 0; i < candidatos.length; i += 1) {
    for (let j = i + 1; j < candidatos.length; j += 1) maxima = Math.max(maxima, distanciaM(candidatos[i], candidatos[j]))
  }
  return maxima
}

function indicePor(lista, clave) {
  const indice = new Map()
  for (const item of lista) {
    const k = clave(item)
    if (!indice.has(k)) indice.set(k, [])
    indice.get(k).push(item)
  }
  return indice
}

/**
 * Asigna coordenadas solo con coincidencias confiables, en orden de precedencia:
 *   seduc > osm-ref-inep > cnefe-nombre-calle > cnefe-nombre > osm-calle.
 * Nunca se usa el CEP. Un nombre idéntico con candidatos separados más de 200 m, o con
 * una calle que contradice la del INEP, no se acepta.
 */
/**
 * @param {any[]} escuelas
 * @param {{ cnefe?: any[], osm?: any[], seduc?: Map<string, { lat: number, lon: number }> }} [fuentes]
 */
export function asignarCoordenadas(escuelas, { cnefe = [], osm = [], seduc = new Map() } = {}) {
  const cnefePorNombre = indicePor(cnefe, (p) => `${p.municipio}|${p.nombre}`)
  const cnefePorCalle = indicePor(cnefe.filter((p) => p.calle && p.numero), (p) => `${p.municipio}|${p.calle}|${p.numero}`)
  const osmPorNombre = indicePor(osm.filter((o) => o.nombre), (o) => o.nombre)
  const osmPorCodigo = new Map(osm.filter((o) => o.codigoInep).map((o) => [o.codigoInep, o]))

  return escuelas.map((escuela) => {
    const sinCoordenadas = { ...escuela, lat: null, lon: null, geoCalidad: null }
    const manual = seduc.get(escuela.codigo)
    if (manual) return { ...escuela, ...manual, geoCalidad: GEOCALIDAD.seduc }
    const porRef = osmPorCodigo.get(escuela.codigo)
    if (porRef) return { ...escuela, lat: porRef.lat, lon: porRef.lon, geoCalidad: GEOCALIDAD.osmRef }

    const nombre = normalizar(escuela.nombre)
    const calle = nucleoCalle(escuela.direccion)
    const numero = numeroCalle(escuela.numero)
    const candidatos = cnefePorNombre.get(`${escuela.municipio}|${nombre}`) ?? []
    if (candidatos.length && dispersionMaxima(candidatos) <= DISTANCIA_AMBIGUA_M) {
      const coinciden = calle ? candidatos.filter((c) => callesCompatibles(escuela.direccion, c.calleCompleta)) : []
      const contradicen = calle ? candidatos.filter((c) => c.calle && !callesCompatibles(escuela.direccion, c.calleCompleta)) : []
      if (coinciden.length) {
        return { ...escuela, ...centroDe(coinciden), geoCalidad: GEOCALIDAD.cnefeNombreCalle }
      }
      if (!contradicen.length) return { ...escuela, ...centroDe(candidatos), geoCalidad: GEOCALIDAD.cnefeNombre }
    }

    const puntosCalle = calle && numero ? (cnefePorCalle.get(`${escuela.municipio}|${calle}|${numero}`) ?? []) : []
    if (puntosCalle.length && dispersionMaxima(puntosCalle) <= DISTANCIA_AMBIGUA_M) {
      const referencia = centroDe(puntosCalle)
      const cercanas = (osmPorNombre.get(nombre) ?? []).filter((o) => distanciaM(o, referencia) <= DISTANCIA_OSM_M)
      if (cercanas.length === 1 && (osmPorNombre.get(nombre) ?? []).length === 1) {
        return { ...escuela, lat: cercanas[0].lat, lon: cercanas[0].lon, geoCalidad: GEOCALIDAD.osmCalle }
      }
    }
    return sinCoordenadas
  })
}

export function filasLocalizaciones(escuelasConCoordenadas, nombresMunicipio, bbox) {
  return escuelasConCoordenadas
    .map((e) => {
      const dentro = e.lat !== null && enCaja(e, bbox)
      return {
        cueAnexo: e.codigo,
        nombre: e.nombre,
        departamento: nombresMunicipio.get(e.municipio) ?? '',
        localidad: e.bairro ?? '',
        lat: dentro ? redondear(e.lat) : null,
        lon: dentro ? redondear(e.lon) : null,
        geoCalidad: dentro ? e.geoCalidad : null,
      }
    })
    .sort((a, b) => a.cueAnexo.localeCompare(b.cueAnexo))
}

export function resumenCalidad(filas) {
  const resumen = { total: filas.length, conCoordenadas: 0, sinCoordenadas: 0, porCalidad: {} }
  for (const f of filas) {
    if (f.lat === null) { resumen.sinCoordenadas += 1; continue }
    resumen.conCoordenadas += 1
    resumen.porCalidad[f.geoCalidad] = (resumen.porCalidad[f.geoCalidad] ?? 0) + 1
  }
  return resumen
}

// ── Entradas de región:cargar ────────────────────────────────────────────────

export function entradaLocalizaciones(filas, resumen) {
  return {
    datasetId: 'localizaciones',
    nombre: 'Escuelas en actividad de Manaos y su entorno (INEP)',
    revision: `censo-escolar-2024+cnefe-2022@${FECHA_FUENTES}`,
    fuente: 'INEP Censo Escolar 2024; coordenadas: IBGE CNEFE 2022 y OpenStreetMap (ver geoCalidad)',
    licencia: 'Ver docs/ejecucion-enos/B0/datos-escuelas-territorio.md',
    fechaFuente: FECHA_FUENTES,
    formato: 'array',
    clave: 'cueAnexo',
    datos: filas,
    metadatos: { resumen },
  }
}

export function entradaDepartamentos(features) {
  return {
    datasetId: 'departamentos',
    nombre: 'Municipios del área de Manaos (IBGE)',
    revision: `malha-municipal-2025@${FECHA_FUENTES}`,
    fuente: 'IBGE Malha Municipal 2025 (geoftp.ibge.gov.br), simplificada',
    licencia: 'Datos abiertos del IBGE; citar la fuente',
    fechaFuente: FECHA_FUENTES,
    formato: 'features',
    clave: 'properties.id',
    datos: { type: 'FeatureCollection', features },
  }
}

export function entradaMascara(coleccion) {
  return {
    datasetId: 'mascara',
    nombre: 'Máscara del área de Manaos',
    revision: `malha-municipal-2025@${FECHA_FUENTES}`,
    fuente: 'IBGE Malha Municipal 2025 (geoftp.ibge.gov.br), unión de los municipios del área',
    licencia: 'Datos abiertos del IBGE; citar la fuente',
    fechaFuente: FECHA_FUENTES,
    formato: 'features',
    clave: '',
    claves: ['mascara'],
    datos: coleccion,
  }
}

// ── Flujo de línea de comandos ───────────────────────────────────────────────

const USO = 'Uso: node scripts/datasets-manaos.mjs descargar|construir --dir <directorio> [--seduc <archivo.csv>]'
const CONSULTA_OVERPASS = '[out:json][timeout:110];area["ISO3166-2"="BR-AM"][admin_level=4]->.am;(node["amenity"="school"](area.am);way["amenity"="school"](area.am););out tags center;'

function argumento(argv, nombre) {
  const i = argv.indexOf(nombre)
  return i > -1 ? argv[i + 1] : undefined
}

function directorioFuera(dir) {
  if (!dir) throw new Error(USO)
  const ruta = resolve(dir)
  if (ruta === RAIZ || ruta.startsWith(`${RAIZ}/`)) throw new Error('--dir debe estar fuera del repositorio')
  return ruta
}

// download.inep.gov.br reinicia la conexión si el agente de usuario no parece un navegador;
// Overpass responde 406 a los agentes que parecen un navegador.
const AGENTE_NAVEGADOR = 'Mozilla/5.0 (compatible; enos-datasets-manaos/1.0)'
const AGENTE_PROPIO = 'enos-datasets-manaos/1.0'

async function curl(args, agente = AGENTE_PROPIO) {
  await ejecutar('curl', ['-sS', '-fL', '-m', '600', '-A', agente, ...args])
}

export async function descargar(dir) {
  const ruta = directorioFuera(dir)
  mkdirSync(join(ruta, 'cnefe'), { recursive: true })
  await curl(['-o', join(ruta, 'malha.zip'), FUENTES.malha])
  // download.inep.gov.br sirve la cadena de certificados incompleta: se usa -k y se verifica el MD5 publicado.
  await curl(['-k', '-o', join(ruta, 'inep.zip'), FUENTES.inep], AGENTE_NAVEGADOR)
  const indice = await ejecutar('curl', ['-sS', '-fL', '-m', '120', FUENTES.cnefe])
  const zips = [...new Set([...indice.stdout.matchAll(/href="(\d{7}_[^"]+\.zip)"/g)].map((m) => m[1]))]
  if (zips.length < 60) throw new Error(`Listado de CNEFE inesperado: ${zips.length} archivos`)
  for (const zip of zips) await curl(['-o', join(ruta, 'cnefe', zip), `${FUENTES.cnefe}${zip}`])
  await curl(['-X', 'POST', '-o', join(ruta, 'osm.json'), 'https://overpass-api.de/api/interpreter', '--data-urlencode', `data=${CONSULTA_OVERPASS}`])
  const md5 = (await ejecutar('unzip', ['-p', join(ruta, 'inep.zip'), MD5_INEP])).stdout.match(/[0-9a-f]{32}/i)?.[0]
  const calculado = await new Promise((resolver, rechazar) => {
    const hash = createHash('md5')
    const hijo = spawn('unzip', ['-p', join(ruta, 'inep.zip'), CSV_INEP], { stdio: ['ignore', 'pipe', 'ignore'] })
    hijo.stdout.on('data', (trozo) => hash.update(trozo))
    hijo.on('error', rechazar)
    hijo.on('close', () => resolver(hash.digest('hex')))
  })
  if (calculado !== md5?.toLowerCase()) throw new Error(`MD5 del CSV del INEP no coincide: publicado ${md5}, calculado ${calculado}`)
  console.log(`INEP md5 verificado: ${calculado}`)
  console.log(`Descargado en ${ruta}`)
}

export async function construir(dir, seducArchivo, regionJson = join(RAIZ, 'config', 'regiones', 'manaos.json')) {
  const ruta = directorioFuera(dir)
  const region = JSON.parse(readFileSync(regionJson, 'utf8'))
  const bbox = region.bboxPlausible

  const malhaDir = join(ruta, 'malha')
  mkdirSync(malhaDir, { recursive: true })
  await ejecutar('unzip', ['-o', '-q', join(ruta, 'malha.zip'), '-d', malhaDir])
  const base = join(malhaDir, 'AM_Municipios_2025')
  const filas = leerDbf(readFileSync(`${base}.dbf`))
  const municipios = municipiosDelArea(leerShp(readFileSync(`${base}.shp`)), filas, bbox)
  const codigos = new Set(municipios.map((m) => m.codigo))
  const nombres = new Map(municipios.map((m) => [m.codigo, m.nombre]))

  const inep = escuelasInep(
    await leerRegistros(lineasDeZip(join(ruta, 'inep.zip'), CSV_INEP, 'latin1'), { filtro: (r) => r.SG_UF === 'AM' }),
    codigos,
  )
  const cnefe = []
  for (const archivo of readdirSync(join(ruta, 'cnefe')).filter((f) => codigos.has(f.slice(0, 7)))) {
    cnefe.push(...puntosCnefe(await leerRegistros(lineasDeZip(join(ruta, 'cnefe', archivo), null, 'latin1'), { filtro: (r) => r.COD_ESPECIE === '4' })))
  }
  const osm = escuelasOsm(JSON.parse(readFileSync(join(ruta, 'osm.json'), 'utf8')))
  const seduc = seducArchivo ? leerSeduc(await leerRegistros(lineasDeArchivo(resolve(seducArchivo), 'utf8'), { delimitador: ',' })) : new Map()

  const localizaciones = filasLocalizaciones(asignarCoordenadas(inep, { cnefe, osm, seduc }), nombres, bbox)
  const resumen = resumenCalidad(localizaciones)
  const features = featuresMunicipios(municipios)
  const mascara = await construirMascara(municipios)

  const escribir = (relativa, valor) => {
    const destino = join(RAIZ, relativa)
    mkdirSync(dirname(destino), { recursive: true })
    writeFileSync(destino, `${JSON.stringify(valor)}\n`)
  }
  escribir('data/regiones/manaos/localizaciones.json', entradaLocalizaciones(localizaciones, resumen))
  escribir('data/regiones/manaos/departamentos.json', entradaDepartamentos(features))
  escribir('data/regiones/manaos/mascara.json', entradaMascara(mascara))
  escribir('public/data/municipios-manaos.geojson', { type: 'FeatureCollection', features })
  escribir('public/data/mascara-manaos.geojson', mascara)
  console.log(JSON.stringify({ municipios: municipios.length, resumen }, null, 2))
}

export async function main(argv = process.argv.slice(2)) {
  const [orden] = argv
  const dir = argumento(argv, '--dir')
  if (orden === 'descargar') return descargar(dir)
  if (orden === 'construir') return construir(dir, argumento(argv, '--seduc'))
  throw new Error(USO)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

