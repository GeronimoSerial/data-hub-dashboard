import { describe, expect, it } from 'vitest'
import type { RegionConfig } from '../region/esquema'
import { cargarRegion } from '../region/registro'
import { jobsEsperadosParaRegion } from './jobs-esperados'

const manaos = cargarRegion('manaos')
const corrientes = cargarRegion('corrientes')
const soloAna: RegionConfig = { ...manaos, id: 'prueba-solo-ana', fuentesRio: ['ana'] }

const NIVELES_RIO = ['sync-ana-niveis', 'sync-sgb-niveis']

describe('jobs de niveles del río ANA y SGB en la lista esperada', () => {
  it('Manaos (fuentesRio ana, sgb) espera ambos jobs cada 60 minutos', () => {
    const lista = jobsEsperadosParaRegion(manaos, 'productor')
    for (const nombre of NIVELES_RIO) {
      const job = lista.find((item) => item.nombre === nombre)
      expect(job, nombre).toBeDefined()
      expect(job?.intervaloMinutos, nombre).toBe(60)
      expect(job?.habilitado, nombre).toBe(true)
    }
  })

  it('Manaos excluye los jobs de Prefectura e INA', () => {
    const nombres = jobsEsperadosParaRegion(manaos, 'productor').map((job) => job.nombre)
    expect(nombres.filter((nombre) => nombre.startsWith('sync-prefectura-') || nombre.startsWith('sync-ina-'))).toEqual([])
  })

  it('Corrientes (fuentesRio prefectura, ina) no espera ninguno de los dos', () => {
    const nombres = jobsEsperadosParaRegion(corrientes, 'productor').map((job) => job.nombre)
    for (const nombre of NIVELES_RIO) {
      expect(nombres).not.toContain(nombre)
    }
  })

  it('una región con sólo ana espera sync-ana-niveis y no sync-sgb-niveis', () => {
    const nombres = jobsEsperadosParaRegion(soloAna, 'productor').map((job) => job.nombre)
    expect(nombres).toContain('sync-ana-niveis')
    expect(nombres).not.toContain('sync-sgb-niveis')
  })
})
