// Tests del estado de los ríos por estación y día. La lógica pura se prueba
// directamente; `leerRiosDia` se prueba contra la base real aislada en un tmpdir
// (mismo patrón que repositorio.test.ts).
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { hidroLectura } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { agregarRioDia, clasificarAltura, leerRiosDia } from './rios'

usarDbTemporal('veredicto-rios')

describe('clasificarAltura', () => {
  it('sin_dato si la altura es nula o no hay umbrales', () => {
    expect(clasificarAltura(null, 5, 6)).toBe('sin_dato')
    expect(clasificarAltura(4, null, null)).toBe('sin_dato')
  })

  it('normal por debajo de alerta', () => {
    expect(clasificarAltura(4.99, 5, 6)).toBe('normal')
  })

  it('alerta en el umbral exacto y hasta evacuación excluida', () => {
    expect(clasificarAltura(5, 5, 6)).toBe('alerta')
    expect(clasificarAltura(5.99, 5, 6)).toBe('alerta')
  })

  it('evacuación en el umbral exacto', () => {
    expect(clasificarAltura(6, 5, 6)).toBe('evacuacion')
  })

  it('con sólo evacuación definida clasifica normal o evacuación', () => {
    expect(clasificarAltura(3, null, 6)).toBe('normal')
    expect(clasificarAltura(7, null, 6)).toBe('evacuacion')
  })
})

describe('agregarRioDia', () => {
  const base = { alertaM: 5, evacuacionM: 6, inconsistente: false }

  it('devuelve null sin lecturas válidas', () => {
    expect(agregarRioDia({ lecturasDia: [], ultimaLecturaDiaAnterior: null })).toBeNull()
    expect(
      agregarRioDia({
        lecturasDia: [{ ...base, lecturaM: 9, medidaEn: '2026-10-12T10:00:00.000Z', inconsistente: true }],
        ultimaLecturaDiaAnterior: null,
      }),
    ).toBeNull()
  })

  it('ignora lecturas inconsistentes al calcular máximo, estado y última medida', () => {
    const resultado = agregarRioDia({
      lecturasDia: [
        { ...base, lecturaM: 4.5, medidaEn: '2026-10-12T06:00:00.000Z' },
        { ...base, lecturaM: 9.9, medidaEn: '2026-10-12T12:00:00.000Z', inconsistente: true },
        { ...base, lecturaM: 5.25, medidaEn: '2026-10-12T09:00:00.000Z' },
      ],
      ultimaLecturaDiaAnterior: null,
    })
    expect(resultado?.alturaMaxM).toBe(5.25)
    expect(resultado?.estadoMax).toBe('alerta')
    expect(resultado?.ultimaMedidaEn).toBe('2026-10-12T09:00:00.000Z')
  })

  it('calcula tendencia contra la última lectura del día anterior', () => {
    const resultado = agregarRioDia({
      lecturasDia: [
        { ...base, lecturaM: 4.1, medidaEn: '2026-10-12T06:00:00.000Z' },
        { ...base, lecturaM: 4.6, medidaEn: '2026-10-12T20:00:00.000Z' },
      ],
      ultimaLecturaDiaAnterior: { lecturaM: 4.2 },
    })
    expect(resultado?.tendenciaM24h).toBe(0.4)
  })

  it('tendencia nula si falta la lectura previa', () => {
    const resultado = agregarRioDia({
      lecturasDia: [{ ...base, lecturaM: 4.6, medidaEn: '2026-10-12T20:00:00.000Z' }],
      ultimaLecturaDiaAnterior: null,
    })
    expect(resultado?.tendenciaM24h).toBeNull()
  })

  it('calcula márgenes a evacuación y alerta redondeados a 2 decimales', () => {
    const resultado = agregarRioDia({
      lecturasDia: [{ lecturaM: 4.333, alertaM: 5, evacuacionM: 6, inconsistente: false, medidaEn: '2026-10-12T20:00:00.000Z' }],
      ultimaLecturaDiaAnterior: null,
    })
    expect(resultado?.alturaMaxM).toBe(4.33)
    expect(resultado?.margenEvacM).toBe(1.67)
    expect(resultado?.margenAlertaM).toBe(0.67)
  })

  it('márgenes nulos si no hay umbral', () => {
    const resultado = agregarRioDia({
      lecturasDia: [{ lecturaM: 4, alertaM: null, evacuacionM: null, inconsistente: false, medidaEn: '2026-10-12T20:00:00.000Z' }],
      ultimaLecturaDiaAnterior: null,
    })
    expect(resultado?.estadoMax).toBe('sin_dato')
    expect(resultado?.margenEvacM).toBeNull()
    expect(resultado?.margenAlertaM).toBeNull()
  })
})

describe('leerRiosDia', () => {
  beforeEach(async () => {
    await getDb().delete(hidroLectura)
  })

  function fila(estacionId: string, medidaEn: string, lecturaM: number, inconsistente = false) {
    return {
      id: `${estacionId}-${medidaEn}`,
      estacionId,
      fuente: 'prefectura',
      lecturaM,
      variacionM: null,
      periodoHoras: null,
      medidaEn,
      estadoPublicado: 'normal',
      lecturaAnteriorM: null,
      medidaAnteriorEn: null,
      alertaM: 5,
      evacuacionM: 6,
      inconsistente,
      motivosInconsistencia: [],
      hashOriginal: `hash-${medidaEn}`,
      catalogoVersion: 'estaciones-prefectura-v2',
      capturadaEn: '2026-10-13T00:00:00.000Z',
    }
  }

  it('agrega el día ART por estación con nombre, río y departamento del catálogo', async () => {
    // Día ART 2026-10-12 = [2026-10-12T03:00Z, 2026-10-13T03:00Z)
    await getDb().insert(hidroLectura).values([
      fila('pna-corrientes', '2026-10-11T20:00:00.000Z', 4.0),
      fila('pna-corrientes', '2026-10-12T06:00:00.000Z', 4.4),
      fila('pna-corrientes', '2026-10-12T18:00:00.000Z', 4.9),
      fila('pna-iguazu', '2026-10-12T06:00:00.000Z', 3.0),
      fila('pna-iguazu', '2026-10-12T12:00:00.000Z', 3.5, true),
      fila('pna-posadas', '2026-10-10T00:00:00.000Z', 2.0),
    ])

    const rios = await leerRiosDia(getDb(), '2026-10-12')
    const corrientes = rios.find((r) => r.estacionId === 'pna-corrientes')
    const iguazu = rios.find((r) => r.estacionId === 'pna-iguazu')

    expect(rios.find((r) => r.estacionId === 'pna-posadas')).toBeUndefined()
    expect(corrientes).toMatchObject({
      nombre: 'CORRIENTES',
      rio: 'parana',
      alturaMaxM: 4.9,
      estadoMax: 'normal',
      tendenciaM24h: 0.9,
      margenEvacM: 1.1,
      ultimaMedidaEn: '2026-10-12T18:00:00.000Z',
    })
    expect(corrientes?.departamento).not.toBeNull()
    expect(iguazu).toMatchObject({ nombre: 'IGUAZU', alturaMaxM: 3, tendenciaM24h: null })
    expect(iguazu?.departamento).toBeNull()
    expect(corrientes?.rol).toBe('corrientes')
    expect(iguazu?.rol).toBe('contexto-aguas-arriba')
  })

  it('descarta la lectura previa más vieja de 36 h como faltante', async () => {
    await getDb().insert(hidroLectura).values([
      fila('pna-corrientes', '2026-10-10T10:00:00.000Z', 4.0),
      fila('pna-corrientes', '2026-10-12T06:00:00.000Z', 4.4),
    ])
    const [corrientes] = (await leerRiosDia(getDb(), '2026-10-12')).filter(
      (r) => r.estacionId === 'pna-corrientes',
    )
    expect(corrientes?.tendenciaM24h).toBeNull()
  })
})
