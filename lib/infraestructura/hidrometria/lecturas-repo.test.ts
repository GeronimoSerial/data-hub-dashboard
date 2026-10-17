import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hidroLectura, hidroReferencia } from '@/lib/db/schema'
import type { LecturaResuelta } from './lecturas-repo'
import {
  consultarHistoriaEstacion,
  guardarLecturasPrefectura,
  LIMITE_MAXIMO_LECTURAS_HISTORIA,
  RANGO_MAXIMO_HISTORIA_DIAS,
  ultimaLecturaEstacion,
  validarConsultaHistoriaEstacion,
} from './lecturas-repo'
import { guardarReferencia } from './referencia-repo'

// seed: false evita sembrar datos; las migraciones se aplican explícitamente abajo.
usarDbTemporal('hidro-lecturas-repo-', { seed: false })

const CAPTURADA_EN = '2026-10-13T12:00:00.000Z'
const CATALOGO = 'estaciones-prefectura-v1'

function lectura(sobrescribir: Partial<LecturaResuelta> = {}): LecturaResuelta {
  return {
    estacionId: 'corrientes-ciudad',
    lecturaM: 3.45,
    variacionM: 0.02,
    periodoHoras: 1,
    medidaEn: '2026-10-13T15:00:00.000Z',
    estadoPublicado: 'CRECE',
    lecturaAnteriorM: 3.43,
    medidaAnteriorEn: '2026-10-13T14:00:00.000Z',
    alertaM: 5,
    evacuacionM: 6,
    inconsistente: false,
    motivosInconsistencia: [],
    ...sobrescribir,
  }
}

describe('guardarLecturasPrefectura', () => {
  let db: ReturnType<typeof getDb>

  beforeAll(async () => {
    await migrarDb()
    db = getDb()
  })

  beforeEach(async () => {
    await db.delete(hidroLectura)
  })

  it('inserta las lecturas nuevas y las cuenta como insertadas', async () => {
    const resultado = await guardarLecturasPrefectura(
      db,
      [lectura(), lectura({ estacionId: 'goya', medidaEn: '2026-10-13T15:00:00.000Z' })],
      { capturadaEn: CAPTURADA_EN, catalogoVersion: CATALOGO },
    )

    expect(resultado).toEqual({ insertadas: 2, duplicadas: 0, sinFecha: 0 })
    const filas = await db.select().from(hidroLectura)
    expect(filas).toHaveLength(2)
    const corrientes = filas.find((f) => f.estacionId === 'corrientes-ciudad')
    expect(corrientes).toMatchObject({
      fuente: 'prefectura',
      lecturaM: 3.45,
      medidaEn: '2026-10-13T15:00:00.000Z',
      estadoPublicado: 'CRECE',
      inconsistente: false,
      catalogoVersion: CATALOGO,
      capturadaEn: CAPTURADA_EN,
    })
    expect(corrientes?.hashOriginal).toMatch(/^[0-9a-f]{64}$/)
  })

  it('omite una lectura ya guardada y no la sobrescribe', async () => {
    await guardarLecturasPrefectura(db, [lectura()], {
      capturadaEn: CAPTURADA_EN,
      catalogoVersion: CATALOGO,
    })

    const resultado = await guardarLecturasPrefectura(
      db,
      [lectura({ lecturaM: 9.99, estadoPublicado: 'BAJA' })],
      { capturadaEn: '2026-10-13T13:00:00.000Z', catalogoVersion: 'estaciones-prefectura-v2' },
    )

    expect(resultado).toEqual({ insertadas: 0, duplicadas: 1, sinFecha: 0 })
    const filas = await db
      .select()
      .from(hidroLectura)
      .where(eq(hidroLectura.estacionId, 'corrientes-ciudad'))
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ lecturaM: 3.45, estadoPublicado: 'CRECE', catalogoVersion: CATALOGO })
  })

  it('no inserta lecturas sin fecha y las cuenta como sinFecha', async () => {
    const resultado = await guardarLecturasPrefectura(
      db,
      [lectura({ medidaEn: null, motivosInconsistencia: ['fecha_no_interpretable:medidaEn'], inconsistente: true })],
      { capturadaEn: CAPTURADA_EN, catalogoVersion: CATALOGO },
    )

    expect(resultado).toEqual({ insertadas: 0, duplicadas: 0, sinFecha: 1 })
    expect(await db.select().from(hidroLectura)).toHaveLength(0)
  })

  it('persiste el flag de inconsistencia y sus motivos', async () => {
    await guardarLecturasPrefectura(
      db,
      [
        lectura({
          lecturaM: 0,
          estadoPublicado: 'CRECE',
          inconsistente: true,
          motivosInconsistencia: ['lectura_cero_con_crece'],
        }),
      ],
      { capturadaEn: CAPTURADA_EN, catalogoVersion: CATALOGO },
    )

    const [fila] = await db.select().from(hidroLectura)
    expect(fila).toMatchObject({
      inconsistente: true,
      motivosInconsistencia: ['lectura_cero_con_crece'],
      lecturaM: 0,
    })
  })

  it('calcula un hash determinista que cambia con el contenido de la fila', async () => {
    await guardarLecturasPrefectura(
      db,
      [lectura(), lectura({ estacionId: 'goya', lecturaM: 3.46 })],
      { capturadaEn: CAPTURADA_EN, catalogoVersion: CATALOGO },
    )

    const filas = await db.select().from(hidroLectura)
    const hashPorEstacion = new Map(filas.map((f) => [f.estacionId, f.hashOriginal]))
    expect(hashPorEstacion.get('corrientes-ciudad')).not.toBe(hashPorEstacion.get('goya'))

    await db.delete(hidroLectura)
    await guardarLecturasPrefectura(db, [lectura()], {
      capturadaEn: CAPTURADA_EN,
      catalogoVersion: CATALOGO,
    })
    const [repetida] = await db.select().from(hidroLectura)
    expect(repetida?.hashOriginal).toBe(hashPorEstacion.get('corrientes-ciudad'))
  })
})
describe('ultimaLecturaEstacion', () => {
  let db: ReturnType<typeof getDb>

  beforeAll(async () => {
    await migrarDb()
    db = getDb()
  })

  beforeEach(async () => {
    await db.delete(hidroLectura)
  })

  it('devuelve null cuando la estación no tiene lecturas', async () => {
    expect(await ultimaLecturaEstacion(db, 'corrientes-ciudad')).toBeNull()
  })

  it('devuelve la lectura con medidaEn más reciente de la estación', async () => {
    await guardarLecturasPrefectura(
      db,
      [
        lectura({ medidaEn: '2026-10-13T12:00:00.000Z', lecturaM: 3.1 }),
        lectura({ medidaEn: '2026-10-13T15:00:00.000Z', lecturaM: 3.45 }),
        lectura({ medidaEn: '2026-10-13T13:00:00.000Z', lecturaM: 3.2 }),
        lectura({ estacionId: 'goya', medidaEn: '2026-10-14T00:00:00.000Z', lecturaM: 1.0 }),
      ],
      { capturadaEn: CAPTURADA_EN, catalogoVersion: CATALOGO },
    )

    const ultima = await ultimaLecturaEstacion(db, 'corrientes-ciudad')
    expect(ultima).toMatchObject({
      estacionId: 'corrientes-ciudad',
      medidaEn: '2026-10-13T15:00:00.000Z',
      lecturaM: 3.45,
    })
  })
})

describe('validarConsultaHistoriaEstacion', () => {
  it('rechaza estacionId con formato inválido con 400', () => {
    const res = validarConsultaHistoriaEstacion({
      estacionId: 'INVALIDO MAYUSCULAS',
      desde: '2026-10-13T00:00:00.000Z',
      hasta: '2026-10-16T00:00:00.000Z',
    })
    expect(res).toMatchObject({
      ok: false,
      codigo: 'estacion_id_invalido',
      status: 400,
    })
  })

  it('rechaza estación fuera del catálogo con 404', () => {
    const res = validarConsultaHistoriaEstacion({
      estacionId: 'pna-inexistente',
      desde: '2026-10-13T00:00:00.000Z',
      hasta: '2026-10-16T00:00:00.000Z',
    })
    expect(res).toMatchObject({
      ok: false,
      codigo: 'estacion_no_encontrada',
      status: 404,
    })
  })

  it.each([
    ['desde faltante', null, '2026-10-16T00:00:00.000Z'],
    ['hasta faltante', '2026-10-13T00:00:00.000Z', null],
    ['fecha sin zona horaria', '2026-10-13T00:00:00', '2026-10-16T00:00:00Z'],
    ['desde posterior a hasta', '2026-10-16T12:00:00.000Z', '2026-10-13T12:00:00.000Z'],
  ])('rechaza rango inválido (%s) con 400', (_caso, desde, hasta) => {
    const res = validarConsultaHistoriaEstacion({
      estacionId: 'pna-corrientes',
      desde,
      hasta,
    })
    expect(res).toMatchObject({
      ok: false,
      codigo: 'rango_invalido',
      status: 400,
    })
  })

  it('rechaza rango superior a 90 días con 400 y codigo rango_excesivo', () => {
    const res = validarConsultaHistoriaEstacion({
      estacionId: 'pna-corrientes',
      desde: '2026-07-01T00:00:00.000Z',
      hasta: '2026-10-16T00:00:00.000Z',
    })
    expect(res).toMatchObject({
      ok: false,
      codigo: 'rango_excesivo',
      status: 400,
    })
    expect(RANGO_MAXIMO_HISTORIA_DIAS).toBe(90)
  })

  it('acepta offset horario explícito (-03:00) y normaliza a UTC ISO', () => {
    const res = validarConsultaHistoriaEstacion({
      estacionId: 'pna-corrientes',
      desde: '2026-10-13T12:00:00-03:00',
      hasta: '2026-10-16T18:00:00-03:00',
    })
    expect(res).toMatchObject({
      ok: true,
      desdeIso: '2026-10-13T15:00:00.000Z',
      hastaIso: '2026-10-16T21:00:00.000Z',
      horasSolicitadas: 78,
      limite: LIMITE_MAXIMO_LECTURAS_HISTORIA,
    })
  })
})

describe('consultarHistoriaEstacion', () => {
  let db: ReturnType<typeof getDb>

  beforeAll(async () => {
    await migrarDb()
    db = getDb()
  })

  beforeEach(async () => {
    await db.delete(hidroLectura)
    await db.delete(hidroReferencia)
  })

  it('devuelve serie vacía sin fabricar puntos desde hidro_referencia e informa cobertura disponible', async () => {
    await guardarReferencia(db, {
      estacionId: 'pna-corrientes',
      ventanaDias: 365,
      n: 749,
      medianaM: 3.4,
      p10M: 2.1,
      p90M: 4.9,
      desde: '2025-10-15T15:00:00.000Z',
      hasta: '2026-10-15T09:00:00.000Z',
      fuente: 'prefectura-historico',
      calculadoEn: '2026-10-16T06:00:00.000Z',
    })

    await guardarLecturasPrefectura(
      db,
      [
        lectura({
          estacionId: 'pna-corrientes',
          medidaEn: '2026-10-13T18:00:00.000Z',
          lecturaM: 3.1,
        }),
        lectura({
          estacionId: 'pna-corrientes',
          medidaEn: '2026-10-16T21:00:00.000Z',
          lecturaM: 3.5,
        }),
      ],
      { capturadaEn: CAPTURADA_EN, catalogoVersion: CATALOGO },
    )

    const respuesta = await consultarHistoriaEstacion(db, {
      estacionId: 'pna-corrientes',
      desde: '2026-10-01T00:00:00.000Z',
      hasta: '2026-10-05T00:00:00.000Z',
    })

    expect(respuesta.lecturas).toEqual([])
    expect(respuesta.cobertura).toEqual({
      sinLecturas: true,
      totalEnVentana: 0,
      puntosDevueltos: 0,
      limiteAplicado: LIMITE_MAXIMO_LECTURAS_HISTORIA,
      truncada: false,
      primeraMedidaEn: null,
      ultimaMedidaEn: null,
      horasCubiertas: 0,
      brechaMinHoras: null,
      brechaMaxHoras: null,
      huecos: [],
      disponibleEstacion: {
        totalLecturas: 2,
        primeraMedidaEn: '2026-10-13T18:00:00.000Z',
        ultimaMedidaEn: '2026-10-16T21:00:00.000Z',
        horasDisponibles: 75,
      },
    })
  })

  it('ordena cronológicamente, detecta huecos > 18h sin interpolar y separa nivel, calidad y variación', async () => {
    await guardarLecturasPrefectura(
      db,
      [
        lectura({
          estacionId: 'pna-bella-vista',
          medidaEn: '2026-10-15T15:00:00.000Z',
          lecturaM: 0,
          variacionM: 0.12,
          periodoHoras: 12,
          estadoPublicado: 'CRECE',
          alertaM: 6,
          evacuacionM: 6.5,
          inconsistente: true,
          motivosInconsistencia: ['lectura_cero_con_crece'],
        }),
        lectura({
          estacionId: 'pna-bella-vista',
          medidaEn: '2026-10-13T15:00:00.000Z',
          lecturaM: 4.1,
          variacionM: 0.04,
          periodoHoras: 12,
          estadoPublicado: 'CRECE',
          alertaM: 6,
          evacuacionM: 6.5,
          inconsistente: false,
        }),
        lectura({
          estacionId: 'pna-bella-vista',
          medidaEn: '2026-10-14T15:00:00.000Z',
          lecturaM: 6.1,
          variacionM: -0.03,
          periodoHoras: 12,
          estadoPublicado: 'BAJA',
          alertaM: 6,
          evacuacionM: 6.5,
          inconsistente: false,
        }),
      ],
      { capturadaEn: CAPTURADA_EN, catalogoVersion: CATALOGO },
    )

    const respuesta = await consultarHistoriaEstacion(db, {
      estacionId: 'pna-bella-vista',
      desde: '2026-10-13T00:00:00.000Z',
      hasta: '2026-10-16T00:00:00.000Z',
    })

    expect(respuesta.lecturas.map((l) => l.medidaEn)).toEqual([
      '2026-10-13T15:00:00.000Z',
      '2026-10-14T15:00:00.000Z',
      '2026-10-15T15:00:00.000Z',
    ])

    expect(respuesta.lecturas[0]).toMatchObject({
      lecturaM: 4.1,
      estadoNivel: 'normal',
      calidad: 'valida',
      brechaDesdeAnteriorHoras: null,
      huecoPrevio: false,
      variacionPublicada: {
        variacionM: 0.04,
        tendencia: 'crece',
        confiable: true,
      },
    })

    expect(respuesta.lecturas[1]).toMatchObject({
      lecturaM: 6.1,
      estadoNivel: 'alerta',
      calidad: 'valida',
      brechaDesdeAnteriorHoras: 24,
      huecoPrevio: true,
      variacionPublicada: {
        variacionM: -0.03,
        tendencia: 'baja',
        confiable: true,
      },
    })

    expect(respuesta.lecturas[2]).toMatchObject({
      lecturaM: 0,
      estadoNivel: 'sin_dato',
      calidad: 'inconsistente',
      inconsistente: true,
      motivosInconsistencia: ['lectura_cero_con_crece'],
      brechaDesdeAnteriorHoras: 24,
      huecoPrevio: true,
      variacionPublicada: {
        variacionM: 0.12,
        tendencia: 'sin_dato',
        confiable: false,
      },
    })

    expect(respuesta.cobertura.huecos).toEqual([
      {
        desdeMedidaEn: '2026-10-13T15:00:00.000Z',
        hastaMedidaEn: '2026-10-14T15:00:00.000Z',
        duracionHoras: 24,
      },
      {
        desdeMedidaEn: '2026-10-14T15:00:00.000Z',
        hastaMedidaEn: '2026-10-15T15:00:00.000Z',
        duracionHoras: 24,
      },
    ])
    expect(respuesta.calidad).toEqual({
      totalPuntos: 3,
      puntosValidos: 2,
      puntosInconsistentes: 1,
      puntosSinUmbrales: 0,
      puntosSinLectura: 0,
      cantidadHuecos: 2,
      umbralHuecoHoras: 18,
    })
  })

  it('informa truncamiento explícito y totalEnVentana cuando se alcanza el límite solicitado', async () => {
    await guardarLecturasPrefectura(
      db,
      [
        lectura({ estacionId: 'pna-corrientes', medidaEn: '2026-10-13T15:00:00.000Z', lecturaM: 3.1 }),
        lectura({ estacionId: 'pna-corrientes', medidaEn: '2026-10-13T18:00:00.000Z', lecturaM: 3.2 }),
        lectura({ estacionId: 'pna-corrientes', medidaEn: '2026-10-13T21:00:00.000Z', lecturaM: 3.3 }),
      ],
      { capturadaEn: CAPTURADA_EN, catalogoVersion: CATALOGO },
    )

    const respuesta = await consultarHistoriaEstacion(db, {
      estacionId: 'pna-corrientes',
      desde: '2026-10-13T00:00:00.000Z',
      hasta: '2026-10-14T00:00:00.000Z',
      limite: 2,
    })

    expect(respuesta.cobertura).toMatchObject({
      sinLecturas: false,
      totalEnVentana: 3,
      puntosDevueltos: 2,
      limiteAplicado: 2,
      truncada: true,
    })
    expect(respuesta.lecturas.map((l) => l.medidaEn)).toEqual([
      '2026-10-13T15:00:00.000Z',
      '2026-10-13T18:00:00.000Z',
    ])
  })
})
