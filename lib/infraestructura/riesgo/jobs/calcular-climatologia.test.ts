import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { hazardClimatology, hazardPrecipitacionSerie, infraGeoProfile, infraJobRun } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { ejecutarCalculoClimatologia as EjecutarCalculoClimatologia } from './calcular-climatologia'
import { agruparPuntosPorEra5, type descargarAnioPrecipitacion } from '../providers/climatologia'
import { diasDelAnio, guardarAnioSerie } from '../climatologia/serie-diaria'

usarDbTemporal('calcular-climatologia-')

let ejecutarCalculoClimatologia: typeof EjecutarCalculoClimatologia

// Dos celdas de 0.1° en celdas ERA5 distintas (lat/lon 1 y 2 no comparten celda).
const CELDA_A = '-27.4_-58.8'
const CELDA_B = '-27.5_-58.9'

// Cada test usa una fecha UTC distinta: la clave diaria del lease es compartida
// por todos los tests del archivo (misma base temporal).
const AHORA_DIA_1 = new Date('2026-10-13T12:00:00.000Z')

type DescargarAnioPrecipitacion = typeof descargarAnioPrecipitacion
type Llamada = Parameters<DescargarAnioPrecipitacion>[0]

function celdasEra5() {
  return agruparPuntosPorEra5([
    { geometryRef: CELDA_A, lat: 1, lon: 1 },
    { geometryRef: CELDA_B, lat: 2, lon: 2 },
  ])
}

function serieOk(llamada: Llamada) {
  return {
    ok: true as const,
    series: llamada.celdas.map((celda) => ({ celdaEra5: celda.celdaEra5, valores: [1, null, 3] })),
  }
}

beforeAll(async () => {
  ;({ ejecutarCalculoClimatologia } = await import('./calcular-climatologia'))

  await getDb()
    .insert(infraGeoProfile)
    .values([
      {
        cueAnexo: '1800001-00',
        geometryRef: CELDA_A,
        lat: 1,
        lon: 1,
        motivoExclusion: null,
        perfilVersion: 'geo-perfil-v1',
        calculadoEn: '2026-09-26T00:00:00.000Z',
      },
      {
        cueAnexo: '1800002-00',
        geometryRef: CELDA_B,
        lat: 2,
        lon: 2,
        motivoExclusion: null,
        perfilVersion: 'geo-perfil-v1',
        calculadoEn: '2026-09-26T00:00:00.000Z',
      },
    ])
})

beforeEach(async () => {
  await getDb().delete(hazardPrecipitacionSerie)
})

describe('ejecutarCalculoClimatologia (descarga progresiva)', () => {
  it('guarda cada lote antes de un corte de cupo posterior', async () => {
    let llamadas = 0
    const descargarAnio: DescargarAnioPrecipitacion = async (llamada) => {
      llamadas += 1
      if (llamadas === 2) return { ok: false, motivo: 'cupo_agotado', detalle: 'fake: cupo agotado' }
      return serieOk(llamada)
    }

    const resultado = await ejecutarCalculoClimatologia({ ahora: AHORA_DIA_1, descargarAnio })

    expect(resultado).toEqual({
      ok: true,
      resultado: { celdasAnioDescargadas: 2, requests: 2, celdasConUmbral: 0, celdasConError: [], cortadoPorCupo: true },
    })

    // El primer lote (año más reciente, ambas celdas) quedó guardado y el corte no lo borró.
    const filas = await getDb().select().from(hazardPrecipitacionSerie)
    expect(filas).toHaveLength(2)
    expect(filas.map((fila) => fila.anio)).toEqual([2020, 2020])
  })

  it('un corte por cupo no deja la corrida fallido', async () => {
    const descargarAnio = vi.fn<DescargarAnioPrecipitacion>(async () => ({
      ok: false,
      motivo: 'cupo_minuto_agotado',
      detalle: 'fake: minuto agotado',
    }))

    await ejecutarCalculoClimatologia({ ahora: new Date('2026-10-20T12:00:00.000Z'), descargarAnio })

    const clave = '1991-01-01_2020-12-31_climatologia-v2-progresiva_2026-10-20'
    const [jobRun] = await getDb().select().from(infraJobRun).where(eq(infraJobRun.claveIdempotente, clave))
    expect(jobRun?.estado).toBe('completado')
  })

  it('omite los pares (celda, año) ya guardados', async () => {
    const [grupoA, grupoB] = celdasEra5()
    const db = getDb()
    for (const grupo of [grupoA, grupoB]) {
      await guardarAnioSerie(db, {
        celdaEra5: grupo.claveEra5,
        anio: 2020,
        lat: grupo.lat,
        lon: grupo.lon,
        valores: [1],
        descargadoEn: '2026-10-12T05:00:00.000Z',
      })
    }

    const llamadas: Llamada[] = []
    const descargarAnio: DescargarAnioPrecipitacion = async (llamada) => {
      llamadas.push(llamada)
      return serieOk(llamada)
    }

    const resultado = await ejecutarCalculoClimatologia({ ahora: new Date('2026-10-21T12:00:00.000Z'), descargarAnio })

    expect(resultado).toEqual({
      ok: true,
      resultado: { celdasAnioDescargadas: 58, requests: 29, celdasConUmbral: 0, celdasConError: [], cortadoPorCupo: false },
    })
    expect(llamadas.map((llamada) => llamada.anio)).not.toContain(2020)
    expect(llamadas[0].anio).toBe(2019)
    expect(llamadas.every((llamada) => llamada.celdas.length === 2)).toBe(true)
  })

  it('la clave diaria permite una corrida por día y bloquea la repetición del mismo día', async () => {
    const descargarAnio: DescargarAnioPrecipitacion = async () => ({ ok: false, motivo: 'cupo_agotado', detalle: 'x' })

    const dia22 = new Date('2026-10-22T12:00:00.000Z')
    const primera = await ejecutarCalculoClimatologia({ ahora: dia22, descargarAnio })
    expect(primera.ok).toBe(true)

    const repetida = await ejecutarCalculoClimatologia({ ahora: dia22, descargarAnio })
    expect(repetida).toEqual({ ok: false, motivo: 'lease_no_disponible' })

    const otroDia = await ejecutarCalculoClimatologia({ ahora: new Date('2026-10-23T12:00:00.000Z'), descargarAnio })
    expect(otroDia.ok).toBe(true)
  })

  it('un error no-cupo de un lote deja sus celdas en celdasConError y sigue con los demás años', async () => {
    const descargarAnio: DescargarAnioPrecipitacion = async (llamada) => {
      if (llamada.anio === 2020) return { ok: false, motivo: 'sin_datos', detalle: 'fake: lote caído' }
      return serieOk(llamada)
    }

    const resultado = await ejecutarCalculoClimatologia({
      ahora: new Date('2026-10-15T12:00:00.000Z'),
      descargarAnio,
    })

    expect(resultado).toEqual({
      ok: true,
      resultado: {
        celdasAnioDescargadas: 58,
        requests: 30,
        celdasConUmbral: 0,
        celdasConError: [CELDA_A, CELDA_B],
        cortadoPorCupo: false,
      },
    })
  })

  // Regresión: una excepción posterior a adquirir el lease debe marcar la
  // corrida como 'fallido' antes de relanzar la excepción original.
  it('si descargarAnio lanza, el job-run queda fallido y la excepción se relanza', async () => {
    const errorOriginal = new Error('boom: fallo simulado de red')
    const descargarAnio: DescargarAnioPrecipitacion = async () => {
      throw errorOriginal
    }

    await expect(
      ejecutarCalculoClimatologia({
        ahora: new Date('2026-10-16T12:00:00.000Z'),
        version: 'climatologia-v2-fallido',
        descargarAnio,
      }),
    ).rejects.toThrow(errorOriginal)

    const [fila] = await getDb()
      .select()
      .from(infraJobRun)
      .where(eq(infraJobRun.claveIdempotente, '1991-01-01_2020-12-31_climatologia-v2-fallido_2026-10-16'))

    expect(fila?.estado).toBe('fallido')
    expect(fila?.leaseOwner).toBeNull()
  })
})

describe('umbrales progresivos desde años acumulados (T23b)', () => {
  const AHORA_UMBRALES = new Date('2026-10-21T12:00:00.000Z')
  const DESDE_10_ANIOS = '2011-01-01'
  const HASTA_10_ANIOS = '2020-12-31'

  beforeEach(async () => {
    await getDb().delete(hazardClimatology)
  })

  async function guardarAniosCelda(grupo: ReturnType<typeof celdasEra5>[number], anios: number[]) {
    for (const anio of anios) {
      await guardarAnioSerie(getDb(), {
        celdaEra5: grupo.claveEra5,
        anio,
        lat: grupo.lat,
        lon: grupo.lon,
        valores: Array.from({ length: diasDelAnio(anio) }, (_, dia) => (dia % 7) + 1),
        descargadoEn: AHORA_UMBRALES.toISOString(),
      })
    }
  }

  const DIEZ_ANIOS = Array.from({ length: 10 }, (_, i) => 2011 + i)

  it('con 10 años completos escribe umbrales con cobertura para cada geometryRef del grupo', async () => {
    const [grupoA, grupoB] = celdasEra5()
    await guardarAniosCelda(grupoA, DIEZ_ANIOS)
    await guardarAniosCelda(grupoB, DIEZ_ANIOS)
    const descargarAnio = vi.fn<DescargarAnioPrecipitacion>(async () => ({
      ok: false,
      motivo: 'cupo_agotado',
      detalle: 'fake: cupo agotado',
    }))

    const resultado = await ejecutarCalculoClimatologia({
      ahora: AHORA_UMBRALES,
      periodoDesde: DESDE_10_ANIOS,
      periodoHasta: HASTA_10_ANIOS,
      descargarAnio,
    })

    expect(resultado).toMatchObject({ ok: true, resultado: { celdasConUmbral: 2 } })
    const filas = await getDb().select().from(hazardClimatology)
    expect(new Set(filas.map((fila) => fila.geometryRef))).toEqual(new Set([CELDA_A, CELDA_B]))
    for (const celda of [CELDA_A, CELDA_B]) {
      const delCelda = filas.filter((fila) => fila.geometryRef === celda)
      expect(new Set(delCelda.map((fila) => fila.percentil))).toEqual(new Set(['p90', 'p95', 'p99']))
    }
    expect(
      filas.every(
        (fila) =>
          fila.aniosCobertura === 10 &&
          (fila.diasCobertura ?? 0) > 0 &&
          fila.version === 'climatologia-v2-progresiva' &&
          fila.periodoDesde === DESDE_10_ANIOS &&
          fila.periodoHasta === HASTA_10_ANIOS &&
          fila.calculadoEn === AHORA_UMBRALES.toISOString(),
      ),
    ).toBe(true)
  })

  it('con 9 años completos no escribe nada para esa celda', async () => {
    const [grupoA, grupoB] = celdasEra5()
    await guardarAniosCelda(grupoA, DIEZ_ANIOS)
    await guardarAniosCelda(grupoB, DIEZ_ANIOS.slice(1))
    const descargarAnio = vi.fn<DescargarAnioPrecipitacion>(async () => ({
      ok: false,
      motivo: 'cupo_agotado',
      detalle: 'fake: cupo agotado',
    }))

    // Fecha UTC distinta: la clave diaria del lease no admite dos corridas el mismo día.
    const resultado = await ejecutarCalculoClimatologia({
      ahora: new Date('2026-10-22T12:00:00.000Z'),
      periodoDesde: DESDE_10_ANIOS,
      periodoHasta: HASTA_10_ANIOS,
      descargarAnio,
    })

    expect(resultado).toMatchObject({ ok: true, resultado: { celdasConUmbral: 1 } })
    const filas = await getDb().select().from(hazardClimatology)
    expect(new Set(filas.map((fila) => fila.geometryRef))).toEqual(new Set([CELDA_A]))
  })
})
