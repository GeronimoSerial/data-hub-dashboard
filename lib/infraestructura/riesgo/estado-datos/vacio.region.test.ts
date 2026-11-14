import { afterEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

// Base migrada y vacía: ningún job corrió, sin fuentes ni run de riesgo.
usarDbTemporal('estado-datos-vacio-', { seed: false })

const regionPrevia = process.env.REGION

// Módulos con estado a nivel de import (región, JOBS_ESPERADOS): se recargan por región.
async function estadoDatosEnRegion(region: string | undefined) {
  vi.resetModules()
  if (region === undefined) delete process.env.REGION
  else process.env.REGION = region
  const { __reiniciarRegionActivaParaPruebas } = await import('@/lib/infraestructura/region/activa')
  __reiniciarRegionActivaParaPruebas()
  const { ensureSeeded } = await import('@/lib/db/seed')
  const { migrarDb } = await import('@/lib/db')
  await migrarDb()
  await ensureSeeded()
  const { obtenerEstadoDatos } = await import('./consulta')
  return obtenerEstadoDatos()
}

afterEach(() => {
  if (regionPrevia === undefined) delete process.env.REGION
  else process.env.REGION = regionPrevia
})

describe('obtenerEstadoDatos sobre base vacía', () => {
  it('Corrientes: no lanza y clasifica el job sin corridas como sin datos', async () => {
    const estado = await estadoDatosEnRegion(undefined)

    const calcularRiesgo = estado.items.find((item) => item.id === 'job:calcular-riesgo')
    expect(calcularRiesgo?.estado).toBe('sin_datos')
    expect(calcularRiesgo?.motivo).toBe('Nunca corrió.')
    expect(estado.problemas).toBeGreaterThan(0)
  })

  it('Manaos: no lanza, lista calcular-riesgo como nunca corrido y omite sync-prefectura-* y sync-ina-*', async () => {
    const estado = await estadoDatosEnRegion('manaos')

    const calcularRiesgo = estado.items.find((item) => item.id === 'job:calcular-riesgo')
    expect(calcularRiesgo?.estado).toBe('sin_datos')
    expect(calcularRiesgo?.motivo).toBe('Nunca corrió.')
    expect(estado.problemas).toBeGreaterThan(0)

    const ids = estado.items.map((item) => item.id)
    expect(ids.filter((id) => id.startsWith('job:sync-prefectura-'))).toEqual([])
    expect(ids.filter((id) => id.startsWith('job:sync-ina-'))).toEqual([])
  })
})
