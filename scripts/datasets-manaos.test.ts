import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepararVersion, type EntradaVersion } from '../lib/infraestructura/datasets/codec'
import { validarReferencia } from '../lib/infraestructura/datasets/validacion'
import {
  asignarCoordenadas,
  callesCompatibles,
  centroide,
  entradaDepartamentos,
  entradaLocalizaciones,
  entradaMascara,
  escuelasInep,
  escuelasOsm,
  featuresMunicipios,
  filasLocalizaciones,
  leerDbf,
  leerRegistros,
  leerSeduc,
  leerShp,
  lineasDeTexto,
  municipiosDelArea,
  normalizar,
  poligonoToca,
  puntosCnefe,
  resumenCalidad,
  simplificarLinea,
  construirMascara,
} from './datasets-manaos.mjs'
import { leerCargaDatasets, leerRegion } from './region-cargar.mjs'

const validar = (entrada: unknown) => validarReferencia(entrada as EntradaVersion)
const RAIZ = join(__dirname, '..')
const FIXTURES = join(__dirname, '__fixtures__', 'manaos')
const BBOX = { latMin: -3.7, latMax: -2.3, lonMin: -60.8, lonMax: -59.2 }
// Los CSV del INEP y del IBGE están en latin-1; la respuesta de Overpass, en UTF-8.
const texto = (archivo: string) => readFileSync(join(FIXTURES, archivo), archivo.endsWith('.json') ? 'utf8' : 'latin1')

async function cargarFixtures() {
  const inep = escuelasInep(await leerRegistros(lineasDeTexto(texto('inep.csv'))), new Set(['1301100', '1301159', '1302504', '1302603', '1303205']))
  const cnefe = puntosCnefe(await leerRegistros(lineasDeTexto(texto('cnefe.csv'))))
  const osm = escuelasOsm(JSON.parse(texto('osm.json')))
  return { inep, cnefe, osm }
}

const porCodigo = (lista: Array<{ codigo: string }>, codigo: string) => lista.find((e) => e.codigo === codigo)! as Record<string, unknown>

describe('texto de direcciones', () => {
  it('normaliza acentos, signos y mayúsculas', () => {
    expect(normalizar('Escola Estadual Pedro dos Santos, nº 5')).toBe('ESCOLA ESTADUAL PEDRO DOS SANTOS N 5')
  })

  it('compara calles sin tipo de vía ni conectores y rechaza calles distintas', () => {
    expect(callesCompatibles('AVENIDA NUNES DE MELO', 'NUNES DE MELO')).toBe(true)
    expect(callesCompatibles('LAGO DO MIRA', 'LAGO DO MIRA')).toBe(true)
    expect(callesCompatibles('RUA CORONEL SOARES', 'RUA FRANCISCO BARRONCAS')).toBe(false)
    expect(callesCompatibles('', 'RUA FRANCISCO BARRONCAS')).toBe(false)
  })
})

describe('lectura de las fuentes grabadas', () => {
  it('lee las escuelas en actividad del INEP y descarta las inactivas y las de otros municipios', async () => {
    const registros = await leerRegistros(lineasDeTexto(texto('inep.csv')))
    expect(registros).toHaveLength(8)
    const inactiva = { ...registros[0], CO_ENTIDADE: '13999999', TP_SITUACAO_FUNCIONAMENTO: '2' }
    const otraUf = { ...registros[1], CO_ENTIDADE: '35000001', SG_UF: 'SP' }
    const escuelas = escuelasInep([...registros, inactiva, otraUf, registros[0]], new Set(['1301100']))
    expect(escuelas.map((e) => e.codigo)).toEqual(['13020331', '13020803'])
    expect(escuelas[0]).toEqual({ codigo: '13020331', nombre: 'ESCOLA MUNICIPAL LORI', municipio: '1301100', direccion: 'LAGO DO MIRA', numero: '', bairro: 'ZONA RURAL' })
  })

  it('toma de CNEFE solo la espécie 4 con coordenadas numéricas', async () => {
    const registros = await leerRegistros(lineasDeTexto(texto('cnefe.csv')))
    const ruido = [{ ...registros[0], COD_ESPECIE: '1' }, { ...registros[0], LATITUDE: '' }]
    const puntos = puntosCnefe([...registros, ...ruido])
    expect(puntos).toHaveLength(registros.length)
    expect(puntos[0]).toMatchObject({ municipio: '1301100', nombre: 'ESCOLA MUNICIPAL LORI', calle: 'DO MIRA', lat: -3.562332, lon: -60.041141 })
  })

  it('toma de OSM el centro de las vías y la referencia INEP', () => {
    const osm = escuelasOsm({ elements: [
      { type: 'way', id: 1, center: { lat: -3.1, lon: -60 }, tags: { name: 'Escola Álvaro', ref: 'INEP-13027174' } },
      { type: 'node', id: 2, lat: -3.2, lon: -60.1, tags: { name: 'Sem referência' } },
      { type: 'node', id: 3, tags: { name: 'Sin punto' } },
    ] })
    expect(osm).toEqual([
      { nombre: 'ESCOLA ALVARO', codigoInep: '13027174', lat: -3.1, lon: -60 },
      { nombre: 'SEM REFERENCIA', codigoInep: null, lat: -3.2, lon: -60.1 },
    ])
  })
})

describe('asignación de coordenadas confiables', () => {
  it('asigna cada nivel de calidad con las coordenadas esperadas y deja el resto en nulo', async () => {
    const { inep, cnefe, osm } = await cargarFixtures()
    const resultado = asignarCoordenadas(inep, { cnefe, osm })
    const de = (codigo: string) => porCodigo(resultado, codigo)
    expect(de('13020331')).toMatchObject({ lat: -3.562332, lon: -60.041141, geoCalidad: 'cnefe-nombre-calle' })
    expect(de('13022687').geoCalidad).toBe('osm-calle')
    expect(de('13027174').geoCalidad).toBe('osm-ref-inep')
    expect(de('13000519')).toMatchObject({ lat: null, lon: null, geoCalidad: null })
    expect(de('13000551')).toMatchObject({ lat: null, lon: null, geoCalidad: null })
  })

  it('nunca asigna coordenadas por el CEP', () => {
    const escuela = { codigo: '13000001', nombre: 'ESCOLA NOVA', municipio: '1302603', direccion: 'RUA A', numero: '10', bairro: '', cep: '69000000' }
    const punto = { municipio: '1302603', nombre: 'ESCOLA OUTRA', calle: 'RUA B', calleCompleta: 'RUA B', numero: '99', lat: -3.1, lon: -60 }
    expect(asignarCoordenadas([escuela], { cnefe: [punto] })[0]).toMatchObject({ lat: null, lon: null, geoCalidad: null })
  })

  it('rechaza un nombre idéntico con candidatos separados más de 200 m', () => {
    const escuela = { codigo: '13000002', nombre: 'ESCOLA SAO JOSE', municipio: '1302603', direccion: '', numero: '', bairro: '' }
    const base = { municipio: '1302603', nombre: 'ESCOLA SAO JOSE', calle: '', calleCompleta: '', numero: null }
    const lejos = [{ ...base, lat: -3.1, lon: -60 }, { ...base, lat: -3.1, lon: -59.99 }]
    const cerca = [{ ...base, lat: -3.1, lon: -60 }, { ...base, lat: -3.1, lon: -59.9995 }]
    expect(asignarCoordenadas([escuela], { cnefe: lejos })[0].lat).toBeNull()
    expect(asignarCoordenadas([escuela], { cnefe: cerca })[0]).toMatchObject({ geoCalidad: 'cnefe-nombre', lat: -3.1 })
  })

  it('rechaza un nombre idéntico cuando la calle del INEP contradice la de CNEFE', () => {
    const escuela = { codigo: '13000003', nombre: 'ESCOLA ESTADUAL PEDRO SANTAREM', municipio: '1302603', direccion: 'RUA CORONEL SOARES', numero: 'S/N', bairro: '' }
    const punto = { municipio: '1302603', nombre: 'ESCOLA ESTADUAL PEDRO SANTAREM', calle: 'FRANCISCO BARRONCAS', calleCompleta: 'RUA FRANCISCO BARRONCAS', numero: '1239', lat: -3.1, lon: -60 }
    expect(asignarCoordenadas([escuela], { cnefe: [punto] })[0]).toMatchObject({ lat: null, geoCalidad: null })
  })

  it('exige que OSM tenga un único candidato a menos de 500 m del punto de la calle', async () => {
    const { inep, cnefe, osm } = await cargarFixtures()
    const escuela = porCodigo(inep, '13022687')
    const lejano = osm.map((o: { nombre: string; lat: number }) => (o.nombre === normalizar(escuela.nombre) ? { ...o, lat: o.lat + 0.01 } : o))
    expect(porCodigo(asignarCoordenadas(inep, { cnefe, osm: lejano }), '13022687').geoCalidad).toBeNull()
    const duplicado = [...osm, ...osm.filter((o: { nombre: string }) => o.nombre === normalizar(escuela.nombre))]
    expect(porCodigo(asignarCoordenadas(inep, { cnefe, osm: duplicado }), '13022687').geoCalidad).toBeNull()
  })

  it('las coordenadas de la SEDUC tienen precedencia sobre las demás fuentes', async () => {
    const { inep, cnefe, osm } = await cargarFixtures()
    const seduc = leerSeduc(await leerRegistros(lineasDeTexto('CO_ENTIDADE,LATITUDE,LONGITUDE\n13020331,"-3,5",-60.5\n13000519,-3.2,-60.2\nmalo,1,2\n'), { delimitador: ',' }))
    const resultado = asignarCoordenadas(inep, { cnefe, osm, seduc })
    expect(porCodigo(resultado, '13020331')).toMatchObject({ lat: -3.5, lon: -60.5, geoCalidad: 'seduc' })
    expect(porCodigo(resultado, '13000519')).toMatchObject({ lat: -3.2, lon: -60.2, geoCalidad: 'seduc' })
    expect(seduc.size).toBe(2)
  })
})

describe('filas y resumen de localizaciones', () => {
  it('anula las coordenadas fuera del área, ordena por código y cuenta las escuelas sin ubicación', async () => {
    const { inep, cnefe, osm } = await cargarFixtures()
    const asignadas = asignarCoordenadas(inep, { cnefe, osm })
    const fuera = asignadas.map((e: { codigo: string }) => (e.codigo === '13020331' ? { ...e, lat: 10, lon: 10 } : e))
    const filas = filasLocalizaciones(fuera, new Map([['1301100', 'Careiro']]), BBOX)
    expect(filas.map((f: { cueAnexo: string }) => f.cueAnexo)).toEqual([...filas.map((f: { cueAnexo: string }) => f.cueAnexo)].sort())
    expect(filas.find((f: { cueAnexo: string }) => f.cueAnexo === '13020331')).toEqual({ cueAnexo: '13020331', nombre: 'ESCOLA MUNICIPAL LORI', departamento: 'Careiro', localidad: 'ZONA RURAL', lat: null, lon: null, geoCalidad: null })
    expect(resumenCalidad(filas)).toEqual({
      total: 8, conCoordenadas: 5, sinCoordenadas: 3,
      porCalidad: { 'cnefe-nombre-calle': 2, 'osm-calle': 2, 'osm-ref-inep': 1 },
    })
  })

  it('produce una entrada que acepta la validación y el versionado de la aplicación', async () => {
    const { inep, cnefe, osm } = await cargarFixtures()
    const filas = filasLocalizaciones(asignarCoordenadas(inep, { cnefe, osm }), new Map(), BBOX)
    const entrada = entradaLocalizaciones(filas, resumenCalidad(filas))
    expect(() => validar(entrada)).not.toThrow()
    expect(prepararVersion(entrada as EntradaVersion).registros).toHaveLength(8)
  })
})

function crearShp(poligonos: number[][][][]) {
  // Cada polígono: lista de anillos; el primero es el exterior en sentido horario (convención del formato).
  const registros = poligonos.map((anillos) => {
    const puntos = anillos.flat()
    const contenido = Buffer.alloc(44 + 8 + 4 * anillos.length + 16 * puntos.length)
    contenido.writeInt32LE(5, 0)
    contenido.writeInt32LE(anillos.length, 36)
    contenido.writeInt32LE(puntos.length, 40)
    let indice = 0
    anillos.forEach((anillo, i) => { contenido.writeInt32LE(indice, 44 + 4 * i); indice += anillo.length })
    puntos.forEach(([x, y], i) => {
      contenido.writeDoubleLE(x, 44 + 4 * anillos.length + 16 * i)
      contenido.writeDoubleLE(y, 44 + 4 * anillos.length + 16 * i + 8)
    })
    const cabecera = Buffer.alloc(8)
    cabecera.writeInt32BE(0, 0)
    cabecera.writeInt32BE(contenido.length / 2, 4)
    return Buffer.concat([cabecera, contenido])
  })
  return Buffer.concat([Buffer.alloc(100), ...registros])
}

const horario = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x0, y1], [x1, y1], [x1, y0], [x0, y0]]
const antihorario = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]

function crearDbf(filas: Array<{ CD_MUN: string; NM_MUN: string }>) {
  const campos = [{ nombre: 'CD_MUN', largo: 7 }, { nombre: 'NM_MUN', largo: 20 }]
  const largoRegistro = 1 + campos.reduce((s, c) => s + c.largo, 0)
  const cabecera = Buffer.alloc(32 + 32 * campos.length + 1)
  cabecera.writeUInt32LE(filas.length, 4)
  cabecera.writeUInt16LE(cabecera.length, 8)
  cabecera.writeUInt16LE(largoRegistro, 10)
  campos.forEach((c, i) => {
    cabecera.write(c.nombre, 32 + 32 * i, 'latin1')
    cabecera[32 + 32 * i + 16] = c.largo
  })
  cabecera[cabecera.length - 1] = 0x0d
  const cuerpo = filas.map((f) => Buffer.from(` ${f.CD_MUN.padEnd(7)}${f.NM_MUN.padEnd(20)}`, 'utf8'))
  return Buffer.concat([cabecera, ...cuerpo])
}

describe('territorio', () => {
  const dentro = horario(-60.5, -3.5, -60, -3)
  const hueco = antihorario(-60.3, -3.3, -60.2, -3.2)
  const lejos = horario(-50, -1, -49, 0)

  it('lee polígonos con hueco y multipolígonos de un shapefile', () => {
    const [conHueco, multi] = leerShp(crearShp([[dentro, hueco], [dentro, horario(-59.9, -3.4, -59.8, -3.3)]])) as Array<{ type: string; coordinates: unknown[] }>
    expect(conHueco.type).toBe('Polygon')
    expect(conHueco.coordinates).toHaveLength(2)
    expect(multi.type).toBe('MultiPolygon')
    expect(multi.coordinates).toHaveLength(2)
  })

  it('lee los atributos del dbf en UTF-8', () => {
    expect(leerDbf(crearDbf([{ CD_MUN: '1300300', NM_MUN: 'Autazes' }, { CD_MUN: '1301159', NM_MUN: 'Careiro da Várzea' }])))
      .toEqual([{ CD_MUN: '1300300', NM_MUN: 'Autazes' }, { CD_MUN: '1301159', NM_MUN: 'Careiro da Várzea' }])
  })

  it('selecciona los municipios que intersecan el área con vértice, arista o esquina', () => {
    const sinVertices = { type: 'Polygon', coordinates: [antihorario(-61, -4, -59, -2)] } // rodea el área
    const cruce = { type: 'Polygon', coordinates: [antihorario(-62, -3.1, -58, -3.0)] } // franja que la atraviesa
    const vecino = { type: 'Polygon', coordinates: [antihorario(-59.1, -3.6, -58.5, -3.0)] } // su caja la toca, el polígono no
    const diagonal = { type: 'Polygon', coordinates: [[[-59.0, -2.0], [-61.0, -2.0], [-59.0, -4.0], [-59.0, -2.0]]] }
    expect(poligonoToca(sinVertices, BBOX)).toBe(true)
    expect(poligonoToca(cruce, BBOX)).toBe(true)
    expect(poligonoToca(vecino, BBOX)).toBe(false)
    expect(poligonoToca({ type: 'Polygon', coordinates: [antihorario(-50, -1, -49, 0)] }, BBOX)).toBe(false)
    expect(poligonoToca(diagonal, BBOX)).toBe(true)
  })

  it('arma municipios, centroides y máscara con hueco a partir del shapefile', async () => {
    const geometrias = leerShp(crearShp([[dentro], [lejos], [horario(-60, -3.5, -59.5, -3)]]))
    const municipios = municipiosDelArea(geometrias, [{ CD_MUN: '1300300', NM_MUN: 'Autazes' }, { CD_MUN: '1300001', NM_MUN: 'Lejos' }, { CD_MUN: '1301100', NM_MUN: 'Careiro' }], BBOX)
    expect(municipios.map((m: { codigo: string }) => m.codigo)).toEqual(['1300300', '1301100'])
    expect(centroide(municipios[0].geometria)).toEqual({ lat: -3.25, lon: -60.25 })
    const features = featuresMunicipios(municipios)
    expect(features[0].properties).toEqual({ id: '1300300', nombre: 'Autazes', centroide: { lat: -3.25, lon: -60.25 } })
    const mascara = await construirMascara(municipios)
    const [exterior, agujero] = mascara.features[0].geometry.coordinates
    expect(exterior).toHaveLength(5)
    expect(agujero).toHaveLength(5) // el hueco es la unión de los dos municipios
    expect(() => validar(entradaDepartamentos(features))).not.toThrow()
    expect(() => validar(entradaMascara(mascara))).not.toThrow()
  })

  it('simplifica una línea conservando los extremos y las esquinas', () => {
    const linea = [[0, 0], [1, 0.00001], [2, 0], [3, 2], [4, 0]]
    expect(simplificarLinea(linea, 0.001)).toEqual([[0, 0], [2, 0], [3, 2], [4, 0]])
  })
})

describe('datasets publicados de Manaos', () => {
  const region = leerRegion('manaos')

  it('región:cargar encuentra las cuatro entradas con las claves fijas de la aplicación', () => {
    const entradas = leerCargaDatasets(region)
    expect(entradas.map((e: { clave: string }) => e.clave)).toEqual(['localizaciones', 'departamentos', 'mascara', 'estacoes-ana'])
  })

  it('las entradas versionadas validan y el mapa de municipios coincide con los archivos públicos', () => {
    const leer = (relativa: string) => JSON.parse(readFileSync(join(RAIZ, relativa), 'utf8'))
    const localizaciones = leer('data/regiones/manaos/localizaciones.json')
    const departamentos = leer('data/regiones/manaos/departamentos.json')
    const mascara = leer('data/regiones/manaos/mascara.json')
    for (const entrada of [localizaciones, departamentos, mascara]) expect(() => validar(entrada)).not.toThrow()
    expect(departamentos.datos.features).toHaveLength(12)
    expect(leer('public/data/municipios-manaos.geojson').features).toEqual(departamentos.datos.features)
    expect(leer('public/data/mascara-manaos.geojson')).toEqual(mascara.datos)
    const resumen = localizaciones.metadatos.resumen
    expect(resumen.total).toBe(localizaciones.datos.length)
    expect(resumen.conCoordenadas + resumen.sinCoordenadas).toBe(resumen.total)
    expect(resumen.conCoordenadas).toBeGreaterThan(0)
    expect(resumen.sinCoordenadas).toBeGreaterThan(0)
    for (const fila of localizaciones.datos) {
      if (fila.lat === null) expect(fila).toMatchObject({ lon: null, geoCalidad: null })
      else expect(fila.lat).toBeGreaterThanOrEqual(BBOX.latMin)
    }
  })
})
