import { afterEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

// Base migrada sin sembrar: el dataset 'estaciones-prefectura' no está publicado.
usarDbTemporal('estado-datos-sin-prefectura-', { seed: false })

const regionPrevia = process.env.REGION

async function estadoDatosSeguroEnRegion(region: string) {
  vi.resetModules()
  process.env.REGION = region
  const { __reiniciarRegionActivaParaPruebas } = await import('@/lib/infraestructura/region/activa')
  __reiniciarRegionActivaParaPruebas()
  const { migrarDb } = await import('@/lib/db')
  await migrarDb()
  // La memoria de datasets es global al proceso: se vacía para simular una base sin publicar.
  const memoria = await import('@/lib/infraestructura/datasets/memoria')
  memoria.estadoReferencias().referencias.clear()
  expect(() => memoria.referencia('estaciones-prefectura')).toThrow('Dataset sin publicar')
  const { obtenerEstadoDatosSeguro } = await import('./consulta')
  return obtenerEstadoDatosSeguro()
}

afterEach(() => {
  if (regionPrevia === undefined) delete process.env.REGION
  else process.env.REGION = regionPrevia
})

describe('estado de datos en una región sin fuente Prefectura', () => {
  it('no lee el catálogo de Prefectura: devuelve estado, sin dato:prefectura y con los jobs aplicables', async () => {
    const estado = await estadoDatosSeguroEnRegion('manaos')

    expect(estado).not.toBeNull()
    const ids = estado!.items.map((item) => item.id)
    expect(ids).not.toContain('dato:prefectura')
    expect(ids).not.toContain('dato:plausibilidad')
    expect(ids.filter((id) => id.startsWith('job:sync-prefectura-'))).toEqual([])

    const calcularRiesgo = estado!.items.find((item) => item.id === 'job:calcular-riesgo')
    expect(calcularRiesgo?.estado).toBe('sin_datos')
  })
})
