import { describe, expect, it } from 'vitest'
import { calcularFilasCentros, type EntradaCalculo } from './calculo'

const AHORA = new Date('2026-10-29T03:00:00Z')

function entrada(cambio: Partial<EntradaCalculo> = {}): EntradaCalculo {
  return {
    escuelas: [
      { cueAnexo: 'A', nombre: 'Escuela A', lat: -28, lon: -58 },
      { cueAnexo: 'B', nombre: 'Escuela B', lat: -28.1, lon: -58 },
      { cueAnexo: 'C', nombre: 'Escuela C', lat: -28.5, lon: -58 },
      { cueAnexo: 'S', nombre: 'Sin coordenadas', lat: null, lon: null },
    ],
    riesgoPorCue: new Map([
      ['A', { evidenciaValida: true, nivelRiesgo: 'bajo' }],
      ['B', { evidenciaValida: true, nivelRiesgo: 'bajo' }],
      ['C', { evidenciaValida: true, nivelRiesgo: 'alto' }],
    ]),
    sitioPorCue: new Map([
      ['A', { claseRio: 'bajo', juntoLaguna: false }],
      ['B', { claseRio: 'sin_riesgo', juntoLaguna: false }],
      ['C', { claseRio: 'bajo', juntoLaguna: false }],
    ]),
    claseRutaPorCue: new Map([['A', 'bajo'], ['B', 'bajo'], ['C', 'bajo']]),
    candidatosOsmPorCue: new Map(),
    ahora: AHORA,
    ...cambio,
  }
}

describe('calcularFilasCentros', () => {
  it('marca aptas y asigna a cada escuela con coordenadas la apta más cercana', () => {
    const filas = calcularFilasCentros(entrada())
    const por = Object.fromEntries(filas.map((f) => [f.cueAnexo, f]))
    expect(por.A).toMatchObject({ apto: true, motivo: null, destinoCue: 'B', destinoNombre: 'Escuela B', distanciaRutaM: null })
    expect(por.B).toMatchObject({ apto: true, destinoCue: 'A' })
    expect(por.C).toMatchObject({ apto: false, motivo: 'riesgo_no_bajo', destinoCue: 'B' })
    expect(por.A.distanciaRectaM).toBeGreaterThan(10_000)
    expect(por.A.calculadoEn).toBe('2026-10-29T03:00:00.000Z')
  })

  it('una escuela sin coordenadas no es apta ni recibe destino', () => {
    const s = calcularFilasCentros(entrada()).find((f) => f.cueAnexo === 'S')
    expect(s).toMatchObject({ apto: false, motivo: 'sin_coordenadas', destinoCue: null, distanciaRectaM: null })
  })

  it('sin otras aptas no hay destino (la única apta no se apunta a sí misma)', () => {
    const filas = calcularFilasCentros(entrada({
      riesgoPorCue: new Map([['A', { evidenciaValida: true, nivelRiesgo: 'bajo' }], ['B', { evidenciaValida: true, nivelRiesgo: 'alto' }], ['C', { evidenciaValida: true, nivelRiesgo: 'alto' }]]),
    }))
    expect(filas.find((f) => f.cueAnexo === 'A')).toMatchObject({ apto: true, destinoCue: null })
    expect(filas.find((f) => f.cueAnexo === 'B')).toMatchObject({ apto: false, motivo: 'riesgo_no_bajo', destinoCue: 'A' })
  })

  it('una escuela sin ningún antecedente es apta y se guarda con motivo sin_antecedentes', () => {
    const filas = calcularFilasCentros(entrada({
      escuelas: [
        { cueAnexo: 'A', nombre: 'Escuela A', lat: -28, lon: -58 },
        { cueAnexo: 'N', nombre: 'Sin datos', lat: -28.05, lon: -58 },
      ],
    }))
    expect(filas.find((f) => f.cueAnexo === 'N')).toMatchObject({ apto: true, motivo: 'sin_antecedentes', destinoCue: 'A' })
    expect(filas.find((f) => f.cueAnexo === 'A')).toMatchObject({ apto: true, motivo: null, destinoCue: 'N' })
  })

  it('usa el primer candidato OSM que hoy es apto y guarda su distancia por camino', () => {
    const filas = calcularFilasCentros(entrada({
      candidatosOsmPorCue: new Map([['C', [{ cueAnexo: 'C', distanciaM: 1 }, { cueAnexo: 'A', distanciaM: 70_000 }]]]),
    }))
    expect(filas.find((f) => f.cueAnexo === 'C')).toMatchObject({ destinoCue: 'A', distanciaRutaM: 70_000 })
  })
})

describe('correrCalculoCentrosEvacuados (PGlite)', () => {
  it('lee riesgo vigente a 72 h, exposición de sitio y de ruta y deja una fila por escuela', async () => {
    const { getDb, getRawClient, migrarDb } = await import('@/lib/db')
    const schema = await import('@/lib/db/schema')
    const { crearEjecutorSql, ensureGeSchema } = await import('@/lib/infraestructura/ge-db')
    const { correrCalculoCentrosEvacuados } = await import('./calculo')
    await migrarDb()
    const db = getDb()
    const ge = crearEjecutorSql(getRawClient())
    await ensureGeSchema(ge)
    for (const [cue, lat] of [['1800001-00', -28], ['1800002-00', -28.1], ['1800003-00', -28.2]] as const) {
      await ge.execute({ sql: 'INSERT INTO ge.ge_localizacion (cue_anexo, nombre, departamento, localidad, lat, lon) VALUES (?,?,?,?,?,?)', args: [cue, `Escuela ${cue}`, 'CAPITAL', 'X', lat, -58] })
    }
    await db.insert(schema.infraPeriodo).values({ id: 'p1', nombre: 'p', inicioEn: '2026-01-01', estado: 'vigente', creadaEn: '2026-01-01' })
    await db.insert(schema.infraRiskRun).values({ id: 'r1', periodoId: 'p1', modeloVersion: 'motor-v0.4', iniciadoEn: '2026-10-29', estado: 'vigente', creadaEn: '2026-10-29', modo: 'operativo' })
    const snap = (id: string, cue: string, horizonteHoras: number, nivelRiesgo: string) => ({
      id, runId: 'r1', cueAnexo: cue, horizonteHoras, evidenciaValida: true, nivelRiesgo, confianza: 'alta',
      calculadoEn: '2026-10-29', validoHasta: '2026-10-30',
    })
    await db.insert(schema.infraRiskSnapshot).values([
      snap('s1', '1800001-00', 72, 'bajo'), snap('s2', '1800002-00', 72, 'bajo'),
      snap('s3', '1800003-00', 72, 'alto'), snap('s4', '1800003-00', 24, 'bajo'),
    ])
    const susc = (cueAnexo: string, claseRio: string) => ({
      cueAnexo, versionJob: '1', periodoRetornoAnios: 100, fuente: 'physrisk', fechaCorrida: '2026-01-01', licencia: 'x', importadoEn: '2026-01-01', claseRio, juntoLaguna: false,
    })
    await db.insert(schema.infraSusceptibilidadEstatica).values([susc('1800001-00', 'bajo'), susc('1800002-00', 'sin_riesgo'), susc('1800003-00', 'bajo')])
    const ruta = (cueAnexo: string, claseRuta: string) => ({
      cueAnexo, versionJob: '1', estado: 'sin_profundidad', celdasTotal: 0, celdasConDato: 0, celdasConProfundidad: 0, cobertura: 1, periodoRetornoAnios: 100,
      resolucionArcsec: 30, escenario: 'h', fuente: 'f', celdas: [], fechaCorrida: '2026-01-01', licencia: 'x', importadoEn: '2026-01-01', claseRuta,
    })
    await db.insert(schema.infraExposicionRutaInundacion).values([ruta('1800001-00', 'bajo'), ruta('1800002-00', 'bajo'), ruta('1800003-00', 'bajo')])

    // Rutas OSM de la 3.ª escuela: prefiere el candidato por camino (1.º) aunque el 2.º esté más cerca en línea recta.
    const trazo = { type: 'LineString' as const, coordinates: [[-58, -28] as [number, number], [-58, -28.2] as [number, number]] }
    await db.insert(schema.infraRutaEvacuacionOsm).values({
      cueAnexo: '1800003-00', versionJob: '1', fechaExtractoOsm: '2026-09-26', licencia: 'ODbL', importadoEn: '2026-10-01T00:00:00Z',
      candidatos: [
        { destinoCue: '1800002-00', destinoNombre: 'x', distanciaM: 9000, ruta: trazo },
        { destinoCue: '1800001-00', destinoNombre: 'x', distanciaM: 2000, ruta: trazo },
      ],
    })

    // Elegibilidad estática: ignora el riesgo vigente (la 3.ª tiene riesgo alto a 72 h pero exposición baja).
    const { cargarElegiblesEstaticos } = await import('./calculo')
    const estaticos = await cargarElegiblesEstaticos()
    expect(estaticos.elegibles.sort()).toEqual(['1800001-00', '1800002-00', '1800003-00'])
    expect(estaticos.escuelas).toHaveLength(3)

    expect(await correrCalculoCentrosEvacuados({ ahora: AHORA })).toEqual({ escuelas: 3, aptas: 2 })
    const filas = await db.select().from(schema.infraCentroEvacuados)
    const por = Object.fromEntries(filas.map((f) => [f.cueAnexo, f]))
    expect(por['1800001-00']).toMatchObject({ apto: true, destinoCue: '1800002-00' })
    // El horizonte relevante es 72 h: el 'bajo' a 24 h de la tercera no cuenta.
    expect(por['1800003-00']).toMatchObject({ apto: false, motivo: 'riesgo_no_bajo', destinoCue: '1800001-00', distanciaRutaM: 2000 })
  })
})
