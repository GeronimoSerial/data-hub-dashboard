import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { esDatasetReferencia } from '@/lib/infraestructura/datasets/catalogo'
import { prepararVersion } from '@/lib/infraestructura/datasets/codec'
import { validarReferencia } from '@/lib/infraestructura/datasets/validacion'
import { construirEnvelope, construirEstaciones, serializar } from './estacoes-ana.mjs'

const RAIZ = join(import.meta.dirname, '..')
const FECHA = '2026-11-13'
const FIXTURE = readFileSync(join(RAIZ, 'lib/infraestructura/hidrometria/__fixtures__/ana/inventario-14990000.xml'), 'utf8')
const BLOQUE = FIXTURE.slice(FIXTURE.indexOf('<Table '), FIXTURE.indexOf('</Table>') + '</Table>'.length)
const BBOX = JSON.parse(readFileSync(join(RAIZ, 'config/regiones/manaos.json'), 'utf8')).bboxPlausible as {
  latMin: number; latMax: number; lonMin: number; lonMax: number
}

// Copia del registro de Manaus Porto con campos sustituidos. Solo cambia el texto indicado.
function estacion({ codigo, lat = '-3.1383', lon = '-60.0272', nome = 'MANAUS' }: {
  codigo: string; lat?: string; lon?: string; nome?: string
}) {
  return BLOQUE.replace('<Codigo>14990000</Codigo>', `<Codigo>${codigo}</Codigo>`)
    .replace('<Latitude>-3.1383</Latitude>', `<Latitude>${lat}</Latitude>`)
    .replace('<Longitude>-60.0272</Longitude>', `<Longitude>${lon}</Longitude>`)
    .replace('<Nome>MANAUS</Nome>', `<Nome>${nome}</Nome>`)
}

function xmlCon(...bloques: string[]) {
  return FIXTURE.replace('</Estacoes>', `${bloques.join('\n')}\n</Estacoes>`)
}

describe('construirEstaciones: registro de Manaus Porto', () => {
  it('convierte el registro 14990000 del fixture en el objeto exacto', () => {
    expect(construirEstaciones(FIXTURE, BBOX, FECHA)).toEqual([
      {
        estacionId: '14990000',
        nome: 'MANAUS',
        rio: 'RIO NEGRO',
        lat: -3.1383,
        lon: -60.0272,
        telemetrica: true,
        operando: true,
        responsavel: 'ANA',
        escalaInicio: '1902-09-01',
        telemInicio: '2001-06-01',
        ultimaAtualizacao: '2025-03-24',
        alertaM: 27,
        evacuacionM: 29,
        fuente: 'ana-hidroinventario',
        consultadaEl: FECHA,
      },
    ])
  })

  it('decodifica entidades XML en el nombre', () => {
    const [registro] = construirEstaciones(xmlCon(estacion({ codigo: '14000020', nome: 'PORTO &amp; RIO &#x41;' })), BBOX, FECHA)
    expect(registro.nome).toBe('PORTO & RIO A')
  })
})

describe('construirEstaciones: filtros', () => {
  it('descarta estaciones fuera del bbox y sin coordenadas', () => {
    const xml = xmlCon(
      estacion({ codigo: '14000001', lat: '-10.0' }),
      estacion({ codigo: '14000002', lat: '' }),
    )
    expect(construirEstaciones(xml, BBOX, FECHA).map((r) => r.estacionId)).toEqual(['14990000'])
  })

  it('incluye los bordes del bbox y excluye lo justo fuera', () => {
    const xml = xmlCon(
      estacion({ codigo: '14000010', lat: String(BBOX.latMin), lon: String(BBOX.lonMin) }),
      estacion({ codigo: '14000011', lat: String(BBOX.latMin - 0.0001) }),
      estacion({ codigo: '14000012', lon: String(BBOX.lonMax + 0.01) }),
    )
    expect(construirEstaciones(xml, BBOX, FECHA).map((r) => r.estacionId)).toEqual(['14000010', '14990000'])
  })

  it('ordena por estacionId', () => {
    const xml = xmlCon(estacion({ codigo: '14500000' }), estacion({ codigo: '14100000' }))
    expect(construirEstaciones(xml, BBOX, FECHA).map((r) => r.estacionId)).toEqual(['14100000', '14500000', '14990000'])
  })

  it('es determinista: misma entrada, misma salida byte a byte', () => {
    const xml = xmlCon(estacion({ codigo: '14100000' }))
    const primera = serializar(construirEnvelope(construirEstaciones(xml, BBOX, FECHA), FECHA))
    const segunda = serializar(construirEnvelope(construirEstaciones(xml, BBOX, FECHA), FECHA))
    expect(segunda).toBe(primera)
    expect(primera.endsWith('\n')).toBe(true)
  })
})

describe('construirEstaciones: umbrales', () => {
  it('asigna alerta y evacuación solo a 14990000', () => {
    const [otra, manaus] = construirEstaciones(xmlCon(estacion({ codigo: '14100000' })), BBOX, FECHA)
    expect(otra).toMatchObject({ estacionId: '14100000', alertaM: null, evacuacionM: null })
    expect(manaus).toMatchObject({ estacionId: '14990000', alertaM: 27, evacuacionM: 29 })
  })
})

describe('construirEstaciones: rechazos', () => {
  it('rechaza un código duplicado', () => {
    expect(() => construirEstaciones(xmlCon(estacion({ codigo: '14990000' })), BBOX, FECHA)).toThrow(/duplicad/)
  })

  it('rechaza un código que no tiene 8 dígitos', () => {
    expect(() => construirEstaciones(xmlCon(estacion({ codigo: '1499' })), BBOX, FECHA)).toThrow(/código/)
  })

  it('rechaza XML con DOCTYPE o ENTITY', () => {
    expect(() => construirEstaciones(`<!DOCTYPE x [<!ENTITY a "b">]>${FIXTURE}`, BBOX, FECHA)).toThrow(/DOCTYPE|ENTITY/)
  })
})

describe('construirEnvelope: formato del importador', () => {
  it('produce una entrada que el importador acepta', () => {
    const envelope = construirEnvelope(construirEstaciones(FIXTURE, BBOX, FECHA), FECHA)
    expect(Object.keys(envelope)).toEqual(['datasetId', 'nombre', 'revision', 'fuente', 'formato', 'clave', 'datos'])
    expect(envelope).toMatchObject({ datasetId: 'estacoes-ana', revision: `ana-hidroinventario-${FECHA}`, formato: 'array', clave: 'estacionId' })
    expect(esDatasetReferencia('estacoes-ana')).toBe(true)
    expect(() => validarReferencia(envelope as Parameters<typeof validarReferencia>[0])).not.toThrow()
    expect(() => prepararVersion(envelope as Parameters<typeof prepararVersion>[0])).not.toThrow()
  })
})

describe('data/regiones/manaos/estacoes-ana.json publicado', () => {
  const archivo = join(RAIZ, 'data/regiones/manaos/estacoes-ana.json')
  const leerPublicado = () => JSON.parse(readFileSync(archivo, 'utf8'))

  it('pasa la validación del importador y está dentro del bbox de la región', () => {
    const publicado = leerPublicado()
    expect(esDatasetReferencia('estacoes-ana')).toBe(true)
    expect(() => validarReferencia(publicado)).not.toThrow()
    expect(() => prepararVersion(publicado)).not.toThrow()
    for (const registro of publicado.datos) {
      expect(registro.lat).toBeGreaterThanOrEqual(BBOX.latMin)
      expect(registro.lat).toBeLessThanOrEqual(BBOX.latMax)
      expect(registro.lon).toBeGreaterThanOrEqual(BBOX.lonMin)
      expect(registro.lon).toBeLessThanOrEqual(BBOX.lonMax)
    }
  })

  it('serializa exactamente como el generador', () => {
    expect(readFileSync(archivo, 'utf8')).toBe(serializar(leerPublicado()))
  })
})
