import { describe, expect, it } from 'vitest'
import type { RegionConfig } from '../region/esquema'
import { cargarRegion } from '../region/registro'
import { aplicaJobARegion, JOBS_ESPERADOS_PRODUCTOR, jobsEsperadosParaRegion } from './jobs-esperados'

const corrientes = cargarRegion('corrientes')

// Orden y ids actuales de la lista esperada de Corrientes (rol productor).
const IDS_CORRIENTES = [
  'sync-radar-meteo',
  'sync-radar-ensemble',
  'sync-smn-alertas',
  'verificar-radar-meteo',
  'sync-imerg',
  'climatologia-caudal',
  'climatologia-precipitacion',
  'climatologia-imerg',
  'calcular-riesgo',
  'sync-pronostico-caudal',
  'sync-ensemble',
  'situacion-corte',
  'sonda-cadena-datos',
  'episodios-derivados',
  'sync-seasonal',
  'sync-prefectura-alturas',
  'veredicto-diario',
  'veredicto-cierre',
  'sync-synop-lluvia',
  'sync-prefectura-historico',
  'importar-exposicion-rio-dem',
  'importar-altimetria-v04',
  'sync-ina-serie-diaria',
  'sync-ina-pronostico',
]

const sinPrefecturaNiIna: RegionConfig = { ...corrientes, id: 'prueba-ana-sgb', fuentesRio: ['ana', 'sgb'] }
const soloIna: RegionConfig = { ...corrientes, id: 'prueba-solo-ina', fuentesRio: ['ina'] }

describe('jobsEsperadosParaRegion', () => {
  it('Corrientes conserva exactamente la lista actual (ids, orden y campos)', () => {
    const lista = jobsEsperadosParaRegion(corrientes, 'productor')
    expect(lista.map((job) => job.nombre)).toEqual(IDS_CORRIENTES)
    expect(lista).toEqual(JOBS_ESPERADOS_PRODUCTOR)
  })

  it('una región sin Prefectura ni INA excluye sync-prefectura-* y sync-ina-*', () => {
    const nombres = jobsEsperadosParaRegion(sinPrefecturaNiIna, 'productor').map((job) => job.nombre)
    expect(nombres.filter((nombre) => nombre.startsWith('sync-prefectura-') || nombre.startsWith('sync-ina-'))).toEqual([])
    expect(nombres).toHaveLength(IDS_CORRIENTES.length - 4)
    expect(nombres).toContain('importar-exposicion-rio-dem')
    expect(nombres).toContain('sync-imerg')
  })

  it('una región con sólo INA conserva sync-ina-* y excluye sync-prefectura-*', () => {
    const nombres = jobsEsperadosParaRegion(soloIna, 'productor').map((job) => job.nombre)
    expect(nombres).toContain('sync-ina-serie-diaria')
    expect(nombres).toContain('sync-ina-pronostico')
    expect(nombres.some((nombre) => nombre.startsWith('sync-prefectura-'))).toBe(false)
  })

  it('aplicaJobARegion deriva la regla de fuentesRio, no del id de la región', () => {
    expect(aplicaJobARegion('sync-prefectura-alturas', corrientes)).toBe(true)
    expect(aplicaJobARegion('sync-prefectura-alturas', sinPrefecturaNiIna)).toBe(false)
    expect(aplicaJobARegion('sync-ina-pronostico', sinPrefecturaNiIna)).toBe(false)
    expect(aplicaJobARegion('sync-imerg', sinPrefecturaNiIna)).toBe(true)
  })
})
