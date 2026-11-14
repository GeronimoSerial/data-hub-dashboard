import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
import { regionActiva } from '@/lib/infraestructura/region/activa'
import { correrSondaCadenaDatos } from './job'
import {
  ESCUELAS_TESTIGO_DEFAULT,
  ESTACIONES_TESTIGO_DEFAULT,
  escuelasTestigo,
  estacionesTestigo,
} from './testigos'

// Región Corrientes (por defecto): los testigos y la comparación con Prefectura no cambian.
usarDbTemporal('sonda-corrientes-', { env: { REGION: 'corrientes', RIESGO_DATOS_ROL: 'productor' } })

const fixture = readFileSync(
  new URL('../hidrometria/__fixtures__/prefectura-index.html', import.meta.url),
  'utf8',
)

describe('sonda de cadena de datos en Corrientes', () => {
  beforeAll(async () => {
    await migrarDb()
    await cargarReferencias()
    getDb()
  })

  it('los testigos de la región son exactamente los defaults de Corrientes', () => {
    expect(regionActiva().sondaTestigos).toEqual({
      escuelas: [...ESCUELAS_TESTIGO_DEFAULT],
      estaciones: [...ESTACIONES_TESTIGO_DEFAULT],
    })
    expect(escuelasTestigo({} as NodeJS.ProcessEnv)).toEqual([...ESCUELAS_TESTIGO_DEFAULT])
    expect(estacionesTestigo({} as NodeJS.ProcessEnv)).toEqual([...ESTACIONES_TESTIGO_DEFAULT])
  })

  it('rol productor: consulta Prefectura una vez', async () => {
    const fetchImpl = vi.fn(async () => new Response(fixture, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }))
    await correrSondaCadenaDatos({ ahora: new Date('2026-10-13T12:30:00.000Z'), fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
