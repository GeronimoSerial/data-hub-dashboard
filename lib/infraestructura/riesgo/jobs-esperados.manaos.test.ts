import { describe, expect, it } from 'vitest'
import type { RegionConfig } from '../region/esquema'
import { cargarRegion } from '../region/registro'
import { aplicaJobARegion, jobsEsperadosParaRegion } from './jobs-esperados'

const corrientes = cargarRegion('corrientes')
const manaos = cargarRegion('manaos')

// Lista productora completa de Corrientes hoy (ids y orden). Debe quedar igual.
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

// Manaos: sin prefectura ni ina (fuentesRio), fuentesAlertas inmet, sin synop ni capa DEM de Corrientes.
const IDS_MANAOS = [
  'sync-radar-meteo',
  'sync-radar-ensemble',
  'sync-inmet-alertas',
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
  'veredicto-diario',
  'veredicto-cierre',
  'importar-altimetria-v04',
  'sync-ana-niveis',
  'sync-sgb-niveis',
]

describe('lista esperada por región: reglas de Motor v0.4 (smn, synop, capa DEM)', () => {
  it('Corrientes conserva la lista completa actual (ids y orden)', () => {
    const nombres = jobsEsperadosParaRegion(corrientes, 'productor').map((job) => job.nombre)
    expect(nombres).toEqual(IDS_CORRIENTES)
  })

  it('Manaos real excluye sync-smn-alertas, sync-synop-lluvia e importar-exposicion-rio-dem', () => {
    const nombres = jobsEsperadosParaRegion(manaos, 'productor').map((job) => job.nombre)
    expect(nombres).toEqual(IDS_MANAOS)
  })

  it('aplicaJobARegion: los tres jobs no aplican a Manaos', () => {
    expect(aplicaJobARegion('sync-smn-alertas', manaos)).toBe(false)
    expect(aplicaJobARegion('sync-synop-lluvia', manaos)).toBe(false)
    expect(aplicaJobARegion('importar-exposicion-rio-dem', manaos)).toBe(false)
  })

  it('sync-smn-alertas aplica sólo si fuentesAlertas incluye smn', () => {
    const conSmn: RegionConfig = { ...manaos, fuentesAlertas: ['inmet', 'smn'] }
    expect(aplicaJobARegion('sync-smn-alertas', conSmn)).toBe(true)
    expect(aplicaJobARegion('sync-smn-alertas', manaos)).toBe(false)
  })

  it('sync-synop-lluvia aplica sólo si fuentesLluvia incluye synop', () => {
    const conSynop: RegionConfig = { ...manaos, fuentesLluvia: ['synop'] }
    expect(aplicaJobARegion('sync-synop-lluvia', conSynop)).toBe(true)
    expect(aplicaJobARegion('sync-synop-lluvia', { ...manaos, fuentesLluvia: [] })).toBe(false)
  })

  it('importar-exposicion-rio-dem aplica sólo si capasEstaticas incluye exposicion-rio-dem', () => {
    const conCapa: RegionConfig = { ...manaos, capasEstaticas: ['exposicion-rio-dem'] }
    expect(aplicaJobARegion('importar-exposicion-rio-dem', conCapa)).toBe(true)
    expect(aplicaJobARegion('importar-exposicion-rio-dem', { ...manaos, capasEstaticas: [] })).toBe(false)
  })
})
