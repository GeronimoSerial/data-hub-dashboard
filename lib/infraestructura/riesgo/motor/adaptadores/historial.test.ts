import { beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

usarDbTemporal('motor-historial-', { seed: false })

beforeAll(async () => {
  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()

  const { getDb } = await import('@/lib/db')
  const { infraPeriodo, infraParte, infraAfectacion } = await import('@/lib/db/schema')
  const db = getDb()

  const [periodo] = await db.select({ id: infraPeriodo.id }).from(infraPeriodo).limit(1)
  if (!periodo) throw new Error('ensureSeeded no sembró infra_periodo')

  const parteBase = {
    periodoId: periodo.id,
    estadoEstablecimiento: 'habitual',
    corteId: 0,
    creadaEn: '2026-06-01T00:00:00.000Z',
    actualizadaEn: '2026-06-01T00:00:00.000Z',
  }

  await db.insert(infraParte).values([
    { id: 'parte-a', cueAnexo: CUE_INTERRUMPIDO, estadoEstablecimientoRigeDesde: '2026-06-01T00:00:00.000Z', ...parteBase },
    { id: 'parte-b', cueAnexo: CUE_FUTURO, estadoEstablecimientoRigeDesde: '2026-07-01T00:00:00.000Z', ...parteBase },
    { id: 'parte-c', cueAnexo: CUE_VIGENTE, estadoEstablecimientoRigeDesde: '2026-06-05T00:00:00.000Z', ...parteBase },
  ])

  await db.insert(infraAfectacion).values([
    {
      id: 'af-a',
      parteId: 'parte-a',
      motivo: 'Acceso interrumpido',
      categoria: 'alumnos',
      severidad: 'alta',
      descripcion: null,
      rigeDesde: '2026-06-01T00:00:00.000Z',
      creadaEn: '2026-06-01T00:00:00.000Z',
      retiradaEn: '2026-06-02T00:00:00.000Z',
    },
    {
      id: 'af-b',
      parteId: 'parte-b',
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'media',
      descripcion: null,
      rigeDesde: '2026-07-01T00:00:00.000Z',
      creadaEn: '2026-07-01T00:00:00.000Z',
      retiradaEn: null,
    },
    {
      id: 'af-c',
      parteId: 'parte-c',
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'baja',
      descripcion: null,
      rigeDesde: '2026-06-05T00:00:00.000Z',
      creadaEn: '2026-06-05T00:00:00.000Z',
      retiradaEn: null,
    },
  ])
})

const CUE_INTERRUMPIDO = '1800001-00'
const CUE_FUTURO = '1800002-00'
const CUE_VIGENTE = '1800003-00'

describe('crearAdapterHistorial', () => {
  it('cuenta una afectación con "Acceso interrumpido" retirada en el pasado con su duración cerrada', async () => {
    const { crearAdapterHistorial } = await import('./historial')
    const resumen = await crearAdapterHistorial().obtenerResumen({
      cueAnexo: CUE_INTERRUMPIDO,
      asOf: '2026-06-10T00:00:00.000Z',
      ventanaDias: 365,
    })

    expect(resumen.cantidadConfirmadas).toBe(1)
    expect(resumen.accesoInterrumpidoCantidad).toBe(1)
    expect(resumen.duracionTotalHoras).toBe(24)
    expect(resumen.antecedentes).toHaveLength(1)
    expect(resumen.antecedentes[0]?.motivo).toBe('Acceso interrumpido')
    expect(resumen.antecedentes[0]?.accesoInterrumpido).toBe(true)
  })

  it('respeta la ventana hacia atrás: fuera de ventana no cuenta', async () => {
    const { crearAdapterHistorial } = await import('./historial')
    const resumen = await crearAdapterHistorial().obtenerResumen({
      cueAnexo: CUE_INTERRUMPIDO,
      asOf: '2026-06-10T00:00:00.000Z',
      ventanaDias: 5,
    })

    expect(resumen.cantidadConfirmadas).toBe(0)
    expect(resumen.duracionTotalHoras).toBe(0)
  })

  it('as-of estricto: una afectación posterior a asOf no cuenta hasta que asOf la alcanza', async () => {
    const { crearAdapterHistorial } = await import('./historial')
    const adapter = crearAdapterHistorial()

    const antes = await adapter.obtenerResumen({
      cueAnexo: CUE_FUTURO,
      asOf: '2026-06-15T00:00:00.000Z',
      ventanaDias: 365,
    })
    expect(antes.cantidadConfirmadas).toBe(0)
    expect(antes.duracionTotalHoras).toBe(0)
    expect(antes.antecedentes).toHaveLength(0)

    const despues = await adapter.obtenerResumen({
      cueAnexo: CUE_FUTURO,
      asOf: '2026-07-10T00:00:00.000Z',
      ventanaDias: 365,
    })
    expect(despues.cantidadConfirmadas).toBe(1)
    // 9 días = 216 h; retiradaEn null, se corta en asOf.
    expect(despues.duracionTotalHoras).toBe(216)
  })

  it('una afectación vigente al asOf (retiradaEn null) dura hasta asOf, no hasta ahora real', async () => {
    const { crearAdapterHistorial } = await import('./historial')
    const resumen = await crearAdapterHistorial().obtenerResumen({
      cueAnexo: CUE_VIGENTE,
      asOf: '2026-06-06T00:00:00.000Z',
      ventanaDias: 365,
    })

    expect(resumen.cantidadConfirmadas).toBe(1)
    expect(resumen.duracionTotalHoras).toBe(24)
    expect(resumen.antecedentes[0]?.retiradaEn).toBeNull()
    expect(resumen.antecedentes[0]?.accesoInterrumpido).toBe(false)
  })
})

// Reglas v0.4 (F2): el adapter informa si el sistema tenía algún parte al asOf.
describe('crearAdapterHistorial con informarFuente', () => {
  it('fuenteDisponible true si existe algún parte creado hasta asOf', async () => {
    const { crearAdapterHistorial } = await import('./historial')
    const resumen = await crearAdapterHistorial({ informarFuente: true }).obtenerResumen({
      cueAnexo: '1899999-00',
      asOf: '2026-06-10T00:00:00.000Z',
      ventanaDias: 365,
    })
    expect(resumen.cantidadConfirmadas).toBe(0)
    expect(resumen.fuenteDisponible).toBe(true)
  })

  it('fuenteDisponible false si no había ningún parte al asOf', async () => {
    const { crearAdapterHistorial } = await import('./historial')
    const resumen = await crearAdapterHistorial({ informarFuente: true }).obtenerResumen({
      cueAnexo: CUE_VIGENTE,
      asOf: '2026-05-01T00:00:00.000Z',
      ventanaDias: 365,
    })
    expect(resumen.fuenteDisponible).toBe(false)
  })

  it('sin la opción no agrega el campo (v0.3 intacto)', async () => {
    const { crearAdapterHistorial } = await import('./historial')
    const resumen = await crearAdapterHistorial().obtenerResumen({
      cueAnexo: CUE_VIGENTE,
      asOf: '2026-06-06T00:00:00.000Z',
      ventanaDias: 365,
    })
    expect('fuenteDisponible' in resumen).toBe(false)
  })
})
