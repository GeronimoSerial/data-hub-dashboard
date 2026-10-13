import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  buscarEstacionPrefectura,
  CATALOGO_ESTACIONES_PREFECTURA,
  CATALOGO_ESTACIONES_PREFECTURA_VERSION,
} from './estaciones-prefectura'
import { parsearAlturasPrefectura } from './prefectura-parser'

const fixture = readFileSync(
  new URL('./__fixtures__/prefectura-index.html', import.meta.url),
  'utf8',
)

describe('CATALOGO_ESTACIONES_PREFECTURA', () => {
  it('declara la versión del catálogo', () => {
    expect(CATALOGO_ESTACIONES_PREFECTURA_VERSION).toBe('estaciones-prefectura-v1')
  })

  it('tiene estacionId e idHistorico únicos', () => {
    const ids = CATALOGO_ESTACIONES_PREFECTURA.map((e) => e.estacionId)
    const historicos = CATALOGO_ESTACIONES_PREFECTURA.map((e) => e.idHistorico)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(historicos).size).toBe(historicos.length)
  })

  it('usa slugs ASCII con prefijo pna- y sin acentos', () => {
    for (const entrada of CATALOGO_ESTACIONES_PREFECTURA) {
      expect(entrada.estacionId).toMatch(/^pna-[a-z0-9]+(-[a-z0-9]+)*$/)
    }
    const libres = CATALOGO_ESTACIONES_PREFECTURA.find((e) => e.idHistorico === 610)
    expect(libres).toMatchObject({
      estacionId: 'pna-paso-de-los-libres',
      nombrePna: 'PASO DE LOS LIBRES',
      rio: 'uruguay',
      rol: 'corrientes',
    })
  })

  it('incluye las estaciones de Corrientes y el contexto aguas arriba con su río y rol', () => {
    const paranaCorrientes = CATALOGO_ESTACIONES_PREFECTURA.filter(
      (e) => e.rio === 'parana' && e.rol === 'corrientes',
    ).map((e) => e.idHistorico)
    const uruguayCorrientes = CATALOGO_ESTACIONES_PREFECTURA.filter(
      (e) => e.rio === 'uruguay' && e.rol === 'corrientes',
    ).map((e) => e.idHistorico)
    const contexto = CATALOGO_ESTACIONES_PREFECTURA.filter(
      (e) => e.rol === 'contexto-aguas-arriba',
    ).map((e) => ({ id: e.idHistorico, rio: e.rio }))

    expect(paranaCorrientes).toEqual([90, 100, 110, 120, 130, 150, 160, 170, 190])
    expect(uruguayCorrientes).toEqual([560, 570, 580, 590, 600, 610, 620, 630, 640])
    expect(contexto).toEqual([
      { id: 20, rio: 'parana' },
      { id: 50, rio: 'parana' },
      { id: 80, rio: 'parana' },
    ])
  })

  it('no guarda umbrales ni coordenadas en el catálogo', () => {
    for (const entrada of CATALOGO_ESTACIONES_PREFECTURA) {
      expect(Object.keys(entrada).sort()).toEqual(
        ['estacionId', 'idHistorico', 'nombrePna', 'rio', 'rol'],
      )
    }
  })
})

describe('buscarEstacionPrefectura', () => {
  it('resuelve por idHistorico', () => {
    expect(buscarEstacionPrefectura({ puerto: 'PASO DE LOS LIBRES', idHistorico: 610 })).toMatchObject({
      estacionId: 'pna-paso-de-los-libres',
    })
  })

  it('resuelve por nombre normalizado cuando idHistorico es null', () => {
    expect(buscarEstacionPrefectura({ puerto: 'Corrientes', idHistorico: null })).toMatchObject({
      estacionId: 'pna-corrientes',
      idHistorico: 130,
    })
    expect(buscarEstacionPrefectura({ puerto: '  ita ibate ', idHistorico: null })).toMatchObject({
      estacionId: 'pna-ita-ibate',
    })
    expect(buscarEstacionPrefectura({ puerto: 'Ituzaingó', idHistorico: null })).toMatchObject({
      estacionId: 'pna-ituzaingo',
    })
  })

  it('resuelve Bompland con la ortografía publicada por PNA', () => {
    expect(buscarEstacionPrefectura({ puerto: 'BOMPLAND', idHistorico: null })).toMatchObject({
      idHistorico: 620,
    })
  })

  it('devuelve null para estaciones fuera del catálogo', () => {
    expect(buscarEstacionPrefectura({ puerto: 'ANDRESITO', idHistorico: 10 })).toBeNull()
    expect(buscarEstacionPrefectura({ puerto: 'BOUVIER', idHistorico: 500 })).toBeNull()
  })

  it('nunca resuelve estaciones de caudal (flujo)', () => {
    expect(buscarEstacionPrefectura({ puerto: 'CAXIA (BRASIL)', idHistorico: 8 })).toBeNull()
    expect(buscarEstacionPrefectura({ puerto: 'REPRESA CAPANEMA (BRASIL)', idHistorico: 9 })).toBeNull()
    expect(buscarEstacionPrefectura({ puerto: 'GUAYRA (BRASIL)', idHistorico: 21 })).toBeNull()
    expect(buscarEstacionPrefectura({ puerto: 'REPRESA ITAIPU (BRASIL)', idHistorico: 22 })).toBeNull()
    expect(buscarEstacionPrefectura({ puerto: 'ITAIPU', idHistorico: null })).toBeNull()
  })

  it('resuelve las filas del fixture que pertenecen al catálogo', () => {
    const filas = parsearAlturasPrefectura(fixture)
    const resueltas = new Map(
      filas.map((fila) => [fila.puerto, buscarEstacionPrefectura(fila)?.estacionId ?? null]),
    )

    expect(resueltas.get('PASO DE LOS LIBRES')).toBe('pna-paso-de-los-libres')
    expect(resueltas.get('CORRIENTES')).toBe('pna-corrientes')
    expect(resueltas.get('ITATI')).toBe('pna-itati')
    expect(resueltas.get('PASO DE LA PATRIA')).toBe('pna-paso-de-la-patria')
    expect(resueltas.get('IGUAZU')).toBe('pna-iguazu')
    expect(resueltas.get('ANDRESITO')).toBeNull()
  })
})
