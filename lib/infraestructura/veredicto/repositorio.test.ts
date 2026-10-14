// Tests de integración del repositorio del veredicto diario contra la base
// real aislada en un tmpdir (mismo patrón que briefing-ia/repositorio.test.ts).
import { beforeEach, describe, expect, it } from 'vitest'
import { getDb } from '@/lib/db'
import { infraVeredictoDia } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import {
  guardarVeredicto,
  historialVeredicto,
  listarVigentes,
  marcarCerrado,
  type EntradaVeredicto,
} from './repositorio'

usarDbTemporal('veredicto-repositorio')

beforeEach(async () => {
  await getDb().delete(infraVeredictoDia)
})

function entrada(overrides: Partial<EntradaVeredicto> = {}): EntradaVeredicto {
  return {
    fecha: '2026-10-12',
    ambito: 'provincia',
    tipoDia: 'observado',
    nivel: 'alerta',
    trazaReglas: { reglas: ['r1'] },
    versionReglas: 'v1',
    metricas: { lluviaMm: 42 },
    inputsHash: 'hash-a',
    cobertura: { fuentes: 3 },
    textoFinal: 'texto',
    salidaIa: null,
    fuente: 'plantilla',
    motivoFallback: 'sin_api_key',
    modelo: null,
    versionPrompt: null,
    tokensEntrada: null,
    tokensSalida: null,
    costoUsd: null,
    latenciaMs: null,
    enCalibracion: true,
    generadoEn: '2026-10-12T12:00:00.000Z',
    jobRunId: null,
    ...overrides,
  }
}

describe('guardarVeredicto', () => {
  it('inserta una versión nueva y la deja vigente', async () => {
    const resultado = await guardarVeredicto(getDb(), entrada())

    expect(resultado.estado).toBe('insertado')
    expect(resultado.fila.reemplazadoPor).toBeNull()
    const filas = await getDb().select().from(infraVeredictoDia)
    expect(filas).toHaveLength(1)
  })

  it('devuelve sin_cambios si el hash de entradas coincide con la vigente', async () => {
    await guardarVeredicto(getDb(), entrada())

    const resultado = await guardarVeredicto(getDb(), entrada())

    expect(resultado.estado).toBe('sin_cambios')
    const filas = await getDb().select().from(infraVeredictoDia)
    expect(filas).toHaveLength(1)
  })

  it('con hash nuevo reemplaza la vigente sin borrarla', async () => {
    const primera = await guardarVeredicto(getDb(), entrada({ inputsHash: 'hash-a' }))

    const segunda = await guardarVeredicto(getDb(), entrada({ inputsHash: 'hash-b' }))

    expect(segunda.estado).toBe('insertado')
    const filas = await getDb().select().from(infraVeredictoDia)
    expect(filas).toHaveLength(2)
    const vieja = filas.find((f) => f.id === primera.fila.id)
    expect(vieja?.reemplazadoPor).toBe(segunda.fila.id)
    const vigentes = filas.filter((f) => f.reemplazadoPor === null)
    expect(vigentes).toHaveLength(1)
    expect(vigentes[0]?.id).toBe(segunda.fila.id)
  })

  it('acepta volver a un hash anterior como versión nueva', async () => {
    await guardarVeredicto(getDb(), entrada({ inputsHash: 'hash-a' }))
    await guardarVeredicto(getDb(), entrada({ inputsHash: 'hash-b' }))

    const tercera = await guardarVeredicto(getDb(), entrada({ inputsHash: 'hash-a' }))

    expect(tercera.estado).toBe('insertado')
    const filas = await getDb().select().from(infraVeredictoDia)
    expect(filas).toHaveLength(3)
    expect(filas.filter((f) => f.reemplazadoPor === null)).toHaveLength(1)
  })
})

describe('listarVigentes', () => {
  it('lista solo vigentes en el rango, ordenadas por fecha y ámbito', async () => {
    await guardarVeredicto(getDb(), entrada({ fecha: '2026-10-10', ambito: 'provincia', inputsHash: 'h1' }))
    await guardarVeredicto(getDb(), entrada({ fecha: '2026-10-11', ambito: 'departamento:1', inputsHash: 'h2' }))
    await guardarVeredicto(getDb(), entrada({ fecha: '2026-10-11', ambito: 'provincia', inputsHash: 'h3' }))
    await guardarVeredicto(getDb(), entrada({ fecha: '2026-10-11', ambito: 'provincia', inputsHash: 'h4' }))
    await guardarVeredicto(getDb(), entrada({ fecha: '2026-10-20', ambito: 'provincia', inputsHash: 'h5' }))

    const filas = await listarVigentes(getDb(), { desde: '2026-10-10', hasta: '2026-10-12' })

    expect(filas.map((f) => [f.fecha, f.ambito])).toEqual([
      ['2026-10-10', 'provincia'],
      ['2026-10-11', 'departamento:1'],
      ['2026-10-11', 'provincia'],
    ])
    expect(filas.every((f) => f.reemplazadoPor === null)).toBe(true)
  })

  it('filtra por ámbito cuando se indica', async () => {
    await guardarVeredicto(getDb(), entrada({ ambito: 'provincia', inputsHash: 'h1' }))
    await guardarVeredicto(getDb(), entrada({ ambito: 'departamento:1', inputsHash: 'h2' }))

    const filas = await listarVigentes(getDb(), {
      desde: '2026-10-12',
      hasta: '2026-10-12',
      ambito: 'departamento:1',
    })

    expect(filas.map((f) => f.ambito)).toEqual(['departamento:1'])
  })
})

describe('historialVeredicto', () => {
  it('devuelve todas las versiones del día y ámbito, la más nueva primero', async () => {
    const primera = await guardarVeredicto(getDb(), entrada({ inputsHash: 'h1', generadoEn: '2026-10-12T10:00:00.000Z' }))
    const segunda = await guardarVeredicto(getDb(), entrada({ inputsHash: 'h2', generadoEn: '2026-10-12T11:00:00.000Z' }))

    const historial = await historialVeredicto(getDb(), { fecha: '2026-10-12', ambito: 'provincia' })

    expect(historial.map((f) => f.id)).toEqual([segunda.fila.id, primera.fila.id])
  })
})

describe('marcarCerrado', () => {
  it('marca cerradas las filas vigentes de la fecha indicada', async () => {
    await guardarVeredicto(getDb(), entrada({ fecha: '2026-10-12', ambito: 'provincia', inputsHash: 'h1' }))
    await guardarVeredicto(getDb(), entrada({ fecha: '2026-10-12', ambito: 'departamento:1', inputsHash: 'h2' }))
    await guardarVeredicto(getDb(), entrada({ fecha: '2026-10-13', ambito: 'provincia', inputsHash: 'h3' }))

    await marcarCerrado(getDb(), '2026-10-12')

    const filas = await listarVigentes(getDb(), { desde: '2026-10-12', hasta: '2026-10-13' })
    expect(filas.map((f) => [f.fecha, f.ambito, f.cerrado])).toEqual([
      ['2026-10-12', 'departamento:1', true],
      ['2026-10-12', 'provincia', true],
      ['2026-10-13', 'provincia', false],
    ])
  })
})
