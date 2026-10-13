import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { CATALOGO_ESTACIONES_PREFECTURA } from './estaciones-prefectura'
import {
  estacionParaLocalidad,
  LOCALIDADES_DUDOSAS,
  TRAMOS_PREFECTURA,
  TRAMOS_PREFECTURA_VERSION,
} from './tramos-prefectura'

// Padrón de escuelas (solo lectura). Las CUE de Corrientes empiezan con "18".
const padron: Array<{ cue_anexo: string; departamento: string; localidad: string }> = JSON.parse(
  readFileSync(new URL('../../../data/natalidad/escuelas-2026-padron.json', import.meta.url), 'utf8'),
)

const localidadesCorrientes = new Set(
  padron.filter((e) => e.cue_anexo.startsWith('18')).map((e) => e.localidad),
)

describe('TRAMOS_PREFECTURA', () => {
  it('declara la versión de los tramos', () => {
    expect(TRAMOS_PREFECTURA_VERSION).toBe('tramos-prefectura-v1')
  })

  it('tiene exactamente un tramo por estación de Corrientes del catálogo', () => {
    const estacionesCorrientes = CATALOGO_ESTACIONES_PREFECTURA.filter((e) => e.rol === 'corrientes')
    const estacionIds = TRAMOS_PREFECTURA.map((t) => t.estacionId)
    expect(new Set(estacionIds).size).toBe(estacionIds.length)
    expect(estacionIds.sort()).toEqual(estacionesCorrientes.map((e) => e.estacionId).sort())
  })

  it('cada estacionId existe en el catálogo con rol corrientes y el mismo río', () => {
    for (const tramo of TRAMOS_PREFECTURA) {
      const estacion = CATALOGO_ESTACIONES_PREFECTURA.find((e) => e.estacionId === tramo.estacionId)
      expect(estacion, tramo.estacionId).toBeDefined()
      expect(estacion?.rol).toBe('corrientes')
      expect(tramo.rio).toBe(estacion?.rio)
    }
  })

  it('todos los tramos quedan en estado propuesta y propuestos por el asistente', () => {
    for (const tramo of TRAMOS_PREFECTURA) {
      expect(tramo.estado).toBe('propuesta')
      expect(tramo.propuestoPor).toBe('asistente')
    }
  })

  it('ninguna localidad aparece en dos tramos', () => {
    const todas = TRAMOS_PREFECTURA.flatMap((t) => t.localidades)
    expect(new Set(todas).size).toBe(todas.length)
  })

  it('cada localidad propuesta existe en el padrón de Corrientes', () => {
    for (const tramo of TRAMOS_PREFECTURA) {
      for (const localidad of tramo.localidades) {
        expect(localidadesCorrientes.has(localidad), localidad).toBe(true)
      }
    }
  })

  it('cada tramo tiene al menos una localidad y una justificación no vacía', () => {
    for (const tramo of TRAMOS_PREFECTURA) {
      expect(tramo.localidades.length, tramo.tramoId).toBeGreaterThan(0)
      expect(tramo.justificacion.trim(), tramo.tramoId).not.toBe('')
    }
  })

  it('las localidades dudosas traen motivo y no están en ningún tramo', () => {
    const enTramos = new Set(TRAMOS_PREFECTURA.flatMap((t) => t.localidades))
    for (const dudosa of LOCALIDADES_DUDOSAS) {
      expect(dudosa.motivo.trim(), dudosa.localidad).not.toBe('')
      expect(enTramos.has(dudosa.localidad), dudosa.localidad).toBe(false)
    }
  })
})

describe('estacionParaLocalidad', () => {
  it('no devuelve nada por defecto mientras no haya tramos aprobados', () => {
    expect(estacionParaLocalidad('ITATI')).toBeNull()
    expect(estacionParaLocalidad('PASO DE LOS LIBRES')).toBeNull()
  })

  it('resuelve Itatí a pna-itati solo con incluirPropuestas', () => {
    expect(estacionParaLocalidad('ITATI', { incluirPropuestas: true })).toMatchObject({
      estacionId: 'pna-itati',
    })
  })

  it('resuelve Paso de los Libres a pna-paso-de-los-libres con incluirPropuestas', () => {
    expect(
      estacionParaLocalidad('PASO DE LOS LIBRES', { incluirPropuestas: true }),
    ).toMatchObject({ estacionId: 'pna-paso-de-los-libres' })
  })

  it('normaliza acentos, mayúsculas y espacios', () => {
    expect(estacionParaLocalidad('  itatí ', { incluirPropuestas: true })).toMatchObject({
      estacionId: 'pna-itati',
    })
    expect(estacionParaLocalidad('Ita Ibaté', { incluirPropuestas: true })).toMatchObject({
      estacionId: 'pna-ita-ibate',
    })
  })

  it('devuelve null para localidades sin tramo', () => {
    expect(estacionParaLocalidad('LAGUNA BRAVA', { incluirPropuestas: true })).toBeNull()
    expect(estacionParaLocalidad('', { incluirPropuestas: true })).toBeNull()
  })
})
