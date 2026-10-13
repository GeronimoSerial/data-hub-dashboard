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

const aprobados = TRAMOS_PREFECTURA.filter((t) => t.estado === 'aprobada')
const propuestas = TRAMOS_PREFECTURA.filter((t) => t.estado === 'propuesta')

describe('TRAMOS_PREFECTURA', () => {
  it('declara la versión de los tramos', () => {
    expect(TRAMOS_PREFECTURA_VERSION).toBe('tramos-prefectura-v2')
  })

  it('tiene exactamente un tramo aprobado por estación de Corrientes del catálogo', () => {
    const estacionesCorrientes = CATALOGO_ESTACIONES_PREFECTURA.filter((e) => e.rol === 'corrientes')
    const estacionIds = aprobados.map((t) => t.estacionId)
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

  it('los 18 tramos de puerto quedan aprobados por GeronimoSerial el 2026-10-13', () => {
    expect(aprobados).toHaveLength(18)
    for (const tramo of aprobados) {
      expect(tramo.aprobadoPor, tramo.tramoId).toBe('GeronimoSerial')
      expect(tramo.aprobadoEl, tramo.tramoId).toBe('2026-10-13')
      expect(tramo.localidades, tramo.tramoId).toHaveLength(1)
      expect(tramo.propuestoPor, tramo.tramoId).toBe('asistente')
    }
  })

  it('las propuestas del asistente no tienen aprobación y citan la distancia medida', () => {
    expect(propuestas.length).toBeGreaterThan(0)
    for (const tramo of propuestas) {
      expect(tramo.propuestoPor, tramo.tramoId).toBe('asistente')
      expect(tramo.aprobadoPor, tramo.tramoId).toBeUndefined()
      expect(tramo.aprobadoEl, tramo.tramoId).toBeUndefined()
      expect(tramo.justificacion, tramo.tramoId).toMatch(/\d+,\d km/)
      expect(tramo.justificacion, tramo.tramoId).toContain('coordenadas PNA sin verificar')
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

  it('el tramo de Ituzaingó no incluye Colonia Liebig', () => {
    const ituzaingo = TRAMOS_PREFECTURA.find((t) => t.tramoId === 'parana-ituzaingo')
    expect(ituzaingo?.localidades).toEqual(['ITUZAINGO'])
    expect(ituzaingo?.justificacion).not.toContain('Liebig')
  })

  it('las localidades dudosas traen motivo con distancia medida y no están en ningún tramo', () => {
    const enTramos = new Set(TRAMOS_PREFECTURA.flatMap((t) => t.localidades))
    for (const dudosa of LOCALIDADES_DUDOSAS) {
      expect(dudosa.motivo.trim(), dudosa.localidad).not.toBe('')
      expect(dudosa.motivo, dudosa.localidad).toMatch(/\d+,\d km/)
      expect(enTramos.has(dudosa.localidad), dudosa.localidad).toBe(false)
    }
  })
})

describe('estacionParaLocalidad', () => {
  it('resuelve tramos aprobados por defecto', () => {
    expect(estacionParaLocalidad('ITATI')).toMatchObject({ estacionId: 'pna-itati' })
    expect(estacionParaLocalidad('PASO DE LOS LIBRES')).toMatchObject({
      estacionId: 'pna-paso-de-los-libres',
    })
    expect(estacionParaLocalidad('ITUZAINGO')).toMatchObject({ estacionId: 'pna-ituzaingo' })
  })

  it('no resuelve Colonia Liebig ni por defecto ni como propuesta', () => {
    expect(estacionParaLocalidad('COLONIA LIEBIG')).toBeNull()
    expect(estacionParaLocalidad('COLONIA LIEBIG', { incluirPropuestas: true })).toBeNull()
  })

  it('no devuelve propuestas por defecto y sí con incluirPropuestas', () => {
    expect(estacionParaLocalidad('RAMADA PASO')).toBeNull()
    expect(estacionParaLocalidad('RAMADA PASO', { incluirPropuestas: true })).toMatchObject({
      estacionId: 'pna-itati',
      estado: 'propuesta',
    })
  })

  it('normaliza acentos, mayúsculas y espacios', () => {
    expect(estacionParaLocalidad('  itatí ')).toMatchObject({ estacionId: 'pna-itati' })
    expect(estacionParaLocalidad('Ita Ibaté')).toMatchObject({ estacionId: 'pna-ita-ibate' })
  })

  it('devuelve null para localidades sin tramo', () => {
    expect(estacionParaLocalidad('LAGUNA BRAVA', { incluirPropuestas: true })).toBeNull()
    expect(estacionParaLocalidad('', { incluirPropuestas: true })).toBeNull()
  })
})
