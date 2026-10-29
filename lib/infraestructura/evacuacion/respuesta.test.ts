import { describe, expect, it } from 'vitest'
import type { CandidatoRutaEvacuacion } from '@/lib/db/schema'
import { construirRespuestaCentro, type FilaCentro } from './respuesta'

const trazo = { type: 'LineString' as const, coordinates: [[-58.1, -28.1], [-58.2, -28.2]] as Array<[number, number]> }
const fila = (c: Partial<FilaCentro> = {}): FilaCentro => ({
  cueAnexo: 'A', apto: false, motivo: 'riesgo_no_bajo', destinoCue: 'B', destinoNombre: 'Escuela B',
  distanciaRectaM: 4200, distanciaRutaM: 5100, calculadoEn: '2026-10-29T03:20:00.000Z', ...c,
})
const candidato = (destinoCue: string, distanciaM: number): CandidatoRutaEvacuacion => ({ destinoCue, destinoNombre: 'x', distanciaM, ruta: trazo })
const destinoGeo = { lat: -28.2, lon: -58.2 }

describe('construirRespuestaCentro', () => {
  it('sin fila calculada: no disponible, motivo sin_calculo, apta false', () => {
    expect(construirRespuestaCentro('A', null, null, null)).toEqual({ cueAnexo: 'A', apto: false, disponible: false, motivoSinDestino: 'sin_calculo' })
  })

  it('apta sin otra apta cercana: disponible false con motivo sin_destino_apto', () => {
    expect(construirRespuestaCentro('A', fila({ apto: true, motivo: null, destinoCue: null, destinoNombre: null, distanciaRectaM: null, distanciaRutaM: null }), null, null))
      .toMatchObject({ apto: true, disponible: false, motivoSinDestino: 'sin_destino_apto' })
  })

  it('con ruta OSM hacia el destino elegido: tipo camino con trazo y distancia por camino', () => {
    const r = construirRespuestaCentro('A', fila(), [candidato('Z', 100), candidato('B', 5100)], destinoGeo)
    expect(r).toMatchObject({
      apto: false, disponible: true, tipo: 'camino', ruta: trazo,
      destino: { cueAnexo: 'B', nombre: 'Escuela B', lat: -28.2, lon: -58.2 },
      distanciaKm: 5.1, distanciaRectaKm: 4.2, calculadoEn: '2026-10-29T03:20:00.000Z',
    })
  })

  it('sin ruta OSM al destino elegido: línea recta rotulada, sin trazo', () => {
    const r = construirRespuestaCentro('A', fila({ distanciaRutaM: null }), [candidato('Z', 100)], destinoGeo)
    expect(r).toMatchObject({ disponible: true, tipo: 'linea_recta', distanciaKm: 4.2, distanciaRectaKm: 4.2 })
    expect(r).not.toHaveProperty('ruta')
  })

  it('sin coordenadas del destino no puede dibujar nada: no disponible', () => {
    expect(construirRespuestaCentro('A', fila(), null, null)).toMatchObject({ disponible: false, motivoSinDestino: 'sin_destino_apto' })
  })
})

describe('obtenerCentroEvacuados (PGlite)', () => {
  it('lee fila, ruta OSM más reciente y coordenadas del destino', async () => {
    const { getDb, getRawClient, migrarDb } = await import('@/lib/db')
    const schema = await import('@/lib/db/schema')
    const { crearEjecutorSql, ensureGeSchema } = await import('@/lib/infraestructura/ge-db')
    const { obtenerCentroEvacuados } = await import('./respuesta')
    await migrarDb()
    const db = getDb()
    const ge = crearEjecutorSql(getRawClient())
    await ensureGeSchema(ge)
    await ge.execute({ sql: 'INSERT INTO ge.ge_localizacion (cue_anexo, nombre, departamento, localidad, lat, lon) VALUES (?,?,?,?,?,?)', args: ['1800002-00', 'Escuela B', 'CAPITAL', 'X', -28.2, -58.2] })
    await db.insert(schema.infraCentroEvacuados).values({ ...fila({ cueAnexo: '1800001-00', destinoCue: '1800002-00' }), distanciaRutaM: 5100 })
    await db.insert(schema.infraRutaEvacuacionOsm).values([
      { cueAnexo: '1800001-00', versionJob: '1', fechaExtractoOsm: '2026-09-26', licencia: 'ODbL', importadoEn: '2026-01-01T00:00:00Z', candidatos: [candidato('1800002-00', 1)] },
      { cueAnexo: '1800001-00', versionJob: '2', fechaExtractoOsm: '2026-09-26', licencia: 'ODbL', importadoEn: '2026-10-01T00:00:00Z', candidatos: [candidato('1800002-00', 5100)] },
    ])
    const r = await obtenerCentroEvacuados('1800001-00')
    expect(r).toMatchObject({ disponible: true, tipo: 'camino', ruta: trazo, distanciaKm: 5.1, destino: { lat: -28.2, lon: -58.2 } })
    expect(await obtenerCentroEvacuados('1800099-00')).toMatchObject({ disponible: false, motivoSinDestino: 'sin_calculo' })
  })
})
