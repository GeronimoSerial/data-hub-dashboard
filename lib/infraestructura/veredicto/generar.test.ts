// Tests de la generación del veredicto diario. La base es real y aislada en un
// tmpdir; el proveedor de IA y el presupuesto son mocks: ningún test toca red.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '@/lib/db'
import { hazardSourceHealth, hidroLectura, infraVeredictoDia } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { cerrarDiaAnterior, generarVeredictos } from './generar'
import { fechasVentana } from './entradas'

usarDbTemporal('veredicto-generar')

const AHORA = new Date('2026-10-13T15:00:00.000Z')

// Valid model output: a headline with no figures for every day of the window
// (without data the only scope is 'provincia').
function contenidoIaValido(): string {
  return JSON.stringify({
    dias: fechasVentana(AHORA).map((d) => ({
      fecha: d.fecha,
      titular: { texto: 'Sin señales relevantes en la provincia.', refs: [] },
      departamentos: [],
    })),
  })
}

function respuestaOk(contenido: string) {
  return {
    ok: true,
    contenido,
    tokensEntrada: 100,
    tokensSalida: 50,
    costoUsd: 0.001,
    latenciaMs: 300,
    motivoFallo: null,
  }
}

function mockIa(contenido = contenidoIaValido()) {
  return vi.fn().mockResolvedValue(respuestaOk(contenido))
}

function mockPresupuesto(reservado = true) {
  return {
    reservarPresupuesto: vi.fn().mockResolvedValue({ reservado, mes: '2026-10' }),
    ajustarPresupuesto: vi.fn().mockResolvedValue(undefined),
  }
}

describe('generarVeredictos', () => {
  beforeEach(async () => {
    await getDb().delete(infraVeredictoDia)
    await getDb().delete(hidroLectura)
    await getDb().delete(hazardSourceHealth)
  })

  it('sin registro de salud informa todas las fuentes como no disponibles', async () => {
    const resultado = await generarVeredictos(getDb(), {
      ahora: AHORA,
      generarConIA: mockIa(),
      ...mockPresupuesto(),
    })
    expect([...resultado.fuentesNoDisponibles].sort()).toEqual(
      ['ecmwf', 'ensamble', 'glofas', 'imerg', 'prefectura', 'smn'],
    )
  })

  it('una fuente con éxito dentro de tolerancia no figura como no disponible', async () => {
    await getDb().insert(hazardSourceHealth).values({
      provider: 'open-meteo-flood',
      ultimoExitoEn: AHORA.toISOString(),
      ultimoIntentoEn: AHORA.toISOString(),
      estado: 'ok',
      ultimoErrorSaneado: null,
      ttlMinutos: 360,
      licencia: 'prueba',
      actualizadaEn: AHORA.toISOString(),
    })
    const resultado = await generarVeredictos(getDb(), {
      ahora: AHORA,
      generarConIA: mockIa(),
      ...mockPresupuesto(),
    })
    expect(resultado.fuentesNoDisponibles).not.toContain('glofas')
    expect(resultado.fuentesNoDisponibles).toContain('smn')
  })

  it('sin cambios en las entradas no llama a la IA ni reserva presupuesto', async () => {
    const db = getDb()
    const primera = mockIa()
    await generarVeredictos(db, {
      ahora: AHORA,
      generarConIA: primera,
      ...mockPresupuesto(),
    })

    const segunda = mockIa()
    const presupuesto = mockPresupuesto()
    const resultado = await generarVeredictos(db, {
      ahora: AHORA,
      generarConIA: segunda,
      ...presupuesto,
    })

    expect(primera).toHaveBeenCalledTimes(1)
    expect(segunda).not.toHaveBeenCalled()
    expect(presupuesto.reservarPresupuesto).not.toHaveBeenCalled()
    expect(resultado.insertados).toBe(0)
    expect(resultado.sinCambios).toBe(resultado.evaluados)
  })

  it('respuesta válida de la IA se guarda con fuente ia y una sola llamada', async () => {
    const db = getDb()
    const ia = mockIa()
    const presupuesto = mockPresupuesto()
    const resultado = await generarVeredictos(db, {
      ahora: AHORA,
      generarConIA: ia,
      jobRunId: 'job-1',
      modelo: 'modelo-test',
      ...presupuesto,
    })

    expect(ia).toHaveBeenCalledTimes(1)
    expect(resultado.fuenteIa).toBe(resultado.evaluados)
    expect(resultado.fuentePlantilla).toBe(0)
    expect(resultado.motivoFallback).toBeNull()

    const filas = await db.select().from(infraVeredictoDia)
    expect(filas.every((f) => f.fuente === 'ia')).toBe(true)
    expect(filas.every((f) => f.jobRunId === 'job-1')).toBe(true)
    expect(filas.every((f) => f.enCalibracion)).toBe(true)
    expect(filas.every((f) => f.modelo === 'modelo-test')).toBe(true)
    expect(
      filas.every(
        (f) => f.textoFinal === 'Sin señales relevantes en la provincia.',
      ),
    ).toBe(true)

    // Costo, tokens y latencia sólo en la primera fila persistida de la llamada.
    const conCosto = filas.filter((f) => f.costoUsd !== null)
    expect(conCosto).toHaveLength(1)
    expect(conCosto[0]?.tokensEntrada).toBe(100)

    // El ajuste de presupuesto usa costo real menos la reserva.
    expect(presupuesto.ajustarPresupuesto).toHaveBeenCalledWith(
      expect.objectContaining({ mes: '2026-10', deltaUsd: 0.001 - 0.02 }),
    )
  })

  it('una referencia inválida deja la plantilla con el motivo de la validación', async () => {
    const db = getDb()
    const contenido = JSON.stringify({
      dias: fechasVentana(AHORA).map((d) => ({
        fecha: d.fecha,
        titular: { texto: 'Se registran 999 mm en la provincia.', refs: ['ref-inexistente'] },
        departamentos: [],
      })),
    })
    const resultado = await generarVeredictos(db, {
      ahora: AHORA,
      generarConIA: mockIa(contenido),
      ...mockPresupuesto(),
    })

    expect(resultado.fuentePlantilla).toBe(resultado.evaluados)
    expect(resultado.fuenteIa).toBe(0)
    expect(resultado.motivoFallback).not.toBeNull()

    const filas = await db.select().from(infraVeredictoDia)
    expect(filas.every((f) => f.fuente === 'plantilla')).toBe(true)
    expect(filas.every((f) => f.motivoFallback !== null)).toBe(true)
  })

  it('presupuesto agotado usa plantilla sin llamar a la IA', async () => {
    const db = getDb()
    const ia = mockIa()
    const resultado = await generarVeredictos(db, {
      ahora: AHORA,
      generarConIA: ia,
      ...mockPresupuesto(false),
    })

    expect(ia).not.toHaveBeenCalled()
    expect(resultado.motivoFallback).toBe('presupuesto_agotado')
    expect(resultado.fuentePlantilla).toBe(resultado.evaluados)

    const filas = await db.select().from(infraVeredictoDia)
    expect(filas.every((f) => f.fuente === 'plantilla')).toBe(true)
    expect(filas.every((f) => f.modelo === null)).toBe(true)
  })

  it('una respuesta que no es JSON válido cae a plantilla con json_invalido', async () => {
    const db = getDb()
    const resultado = await generarVeredictos(db, {
      ahora: AHORA,
      generarConIA: mockIa('esto no es json'),
      ...mockPresupuesto(),
    })

    expect(resultado.motivoFallback).toBe('json_invalido')
    expect(resultado.fuenteIa).toBe(0)
  })

  it('stores the headline on the province row and each line on its department row', async () => {
    const db = getDb()
    const hoy = fechasVentana(AHORA).find((d) => d.tipoDia === 'hoy')!.fecha
    const impacto = new Map([
      ['GOYA', { situacionesAbiertas: 0, escuelasSinClases: 2, alumnosSinClases: 0, asistenciaPedagogica: 0, escuelasAisladas: 0, escuelasAccesoRiesgo: 0, radarAlto: 0 }],
    ])
    const contenido = JSON.stringify({
      dias: fechasVentana(AHORA).map((d) => ({
        fecha: d.fecha,
        titular: { texto: 'Hay escuelas sin clases en Goya.', refs: [] },
        departamentos:
          d.fecha === hoy
            ? [{ ambito: 'departamento:GOYA', texto: 'Goya tiene 2 escuelas sin clases.', refs: ['escuelas.sin_clases'] }]
            : [],
      })),
    })
    const ia = mockIa(contenido)
    await generarVeredictos(db, {
      ahora: AHORA,
      generarConIA: ia,
      leerImpacto: async () => impacto,
      ...mockPresupuesto(),
    })

    const filas = await db.select().from(infraVeredictoDia)
    const goya = filas.find((f) => f.fecha === hoy && f.ambito === 'departamento:GOYA')
    const provincia = filas.find((f) => f.fecha === hoy && f.ambito === 'provincia')
    expect(goya?.fuente).toBe('ia')
    expect(goya?.textoFinal).toBe('Goya tiene 2 escuelas sin clases.')
    expect(provincia?.textoFinal).toBe('Hay escuelas sin clases en Goya.')
    const mensaje = ia.mock.calls[0][0][1].content as string
    expect(mensaje).toContain('escuelas.sin_clases')
  })

  it('a department missing from the output falls back to the template for that row only', async () => {
    const db = getDb()
    const hoy = fechasVentana(AHORA).find((d) => d.tipoDia === 'hoy')!.fecha
    const impacto = new Map([
      ['GOYA', { situacionesAbiertas: 1, escuelasSinClases: 0, alumnosSinClases: 0, asistenciaPedagogica: 0, escuelasAisladas: 0, escuelasAccesoRiesgo: 0, radarAlto: 0 }],
    ])
    await generarVeredictos(db, {
      ahora: AHORA,
      generarConIA: mockIa(),
      leerImpacto: async () => impacto,
      ...mockPresupuesto(),
    })
    const filas = await db.select().from(infraVeredictoDia)
    expect(filas.find((f) => f.fecha === hoy && f.ambito === 'departamento:GOYA')?.fuente).toBe('plantilla')
    expect(filas.find((f) => f.fecha === hoy && f.ambito === 'provincia')?.fuente).toBe('ia')
  })

  it('cerrarDiaAnterior marca cerrado el día ART anterior a ahora', async () => {
    const db = getDb()
    await generarVeredictos(db, {
      ahora: AHORA,
      generarConIA: mockIa(),
      ...mockPresupuesto(),
    })

    await cerrarDiaAnterior(db, AHORA)

    const filas = await db.select().from(infraVeredictoDia)
    const cerradas = filas.filter((f) => f.cerrado).map((f) => f.fecha)
    expect(cerradas).toEqual(['2026-10-12'])
  })
})
