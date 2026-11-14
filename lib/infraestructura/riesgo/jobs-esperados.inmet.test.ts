import { describe, expect, it } from 'vitest'
import type { RegionConfig } from '../region/esquema'
import { cargarRegion } from '../region/registro'
import { aplicaJobARegion, jobsEsperadosParaRegion } from './jobs-esperados'

const corrientes = cargarRegion('corrientes')
const manaos = cargarRegion('manaos')
const sinAlertas = { ...manaos, fuentesAlertas: undefined } as unknown as RegionConfig

describe('sync-inmet-alertas en la lista esperada', () => {
  it('Manaos espera sync-inmet-alertas cada 15 minutos y lo habilita', () => {
    const job = jobsEsperadosParaRegion(manaos, 'productor').find((item) => item.nombre === 'sync-inmet-alertas')
    expect(job).toBeDefined()
    expect(job?.intervaloMinutos).toBe(15)
    expect(job?.habilitado).toBe(true)
  })

  it('Manaos excluye sync-smn-alertas', () => {
    const nombres = jobsEsperadosParaRegion(manaos, 'productor').map((job) => job.nombre)
    expect(nombres).not.toContain('sync-smn-alertas')
  })

  it('Corrientes excluye sync-inmet-alertas y conserva sync-smn-alertas', () => {
    const nombres = jobsEsperadosParaRegion(corrientes, 'productor').map((job) => job.nombre)
    expect(nombres).not.toContain('sync-inmet-alertas')
    expect(nombres).toContain('sync-smn-alertas')
  })

  it('una región con fuentesAlertas smn e inmet espera ambos jobs', () => {
    const ambas: RegionConfig = { ...manaos, fuentesAlertas: ['smn', 'inmet'] }
    const nombres = jobsEsperadosParaRegion(ambas, 'productor').map((job) => job.nombre)
    expect(nombres).toContain('sync-smn-alertas')
    expect(nombres).toContain('sync-inmet-alertas')
  })

  it('sin fuentesAlertas no espera ni smn ni inmet', () => {
    const nombres = jobsEsperadosParaRegion(sinAlertas, 'productor').map((job) => job.nombre)
    expect(nombres).not.toContain('sync-smn-alertas')
    expect(nombres).not.toContain('sync-inmet-alertas')
  })

  it('aplicaJobARegion sigue la misma regla por fuentesAlertas', () => {
    expect(aplicaJobARegion('sync-inmet-alertas', manaos)).toBe(true)
    expect(aplicaJobARegion('sync-inmet-alertas', corrientes)).toBe(false)
    expect(aplicaJobARegion('sync-inmet-alertas', sinAlertas)).toBe(false)
  })
})
