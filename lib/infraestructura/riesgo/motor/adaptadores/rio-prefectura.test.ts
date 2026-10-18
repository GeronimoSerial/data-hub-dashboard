// Tests puros del adapter de PuertoRioPrefectura: sin base de datos.
import { describe, expect, it } from 'vitest'
import { estacionParaLocalidad } from '@/lib/infraestructura/hidrometria/tramos-prefectura'
import type { EvidenciaRioPrefectura } from '../puertos'
import {
  crearAdapterRioPrefectura,
  resolverEvidenciaRio,
  type DatosRio,
  type FilaLecturaRio,
} from './rio-prefectura'

const CUE = '12345678'
// Evidencia vigente (con lectura) o undefined, para acceder a sus campos.
function vigente(ev: ReturnType<typeof resolverEvidenciaRio>): EvidenciaRioPrefectura | undefined {
  return ev && !('disponibilidad' in ev) ? ev : undefined
}

const ASOF = '2026-10-13T12:00:00.000Z'
const HACE_1H = '2026-10-13T11:00:00.000Z'
const HACE_30H = '2026-10-12T06:00:00.000Z'
const EN_1H = '2026-10-13T13:00:00.000Z'

function lectura(over: Partial<FilaLecturaRio> = {}): FilaLecturaRio {
  return {
    estacionId: 'pna-paso-de-los-libres',
    lecturaM: 9.33,
    alertaM: 7,
    evacuacionM: 8.5,
    variacionM: 0.12,
    medidaEn: HACE_1H,
    inconsistente: false,
    ...over,
  }
}

function datos(over: Partial<DatosRio> = {}): DatosRio {
  return {
    localidadPorCue: new Map([[CUE, 'PASO DE LOS LIBRES']]),
    susceptibilidadPorCue: new Map([
      [
        CUE,
        {
          claseRio: 'alto',
          peligroInundacionFluvial: 0,
          distanciaAguaM: null,
          alturaSobreAguaM: null,
          juntoLaguna: false,
        },
      ],
    ]),
    distanciaRioKmPorCue: new Map(),
    lecturas: [lectura()],
    ...over,
  }
}

// Escuela no expuesta: sin clase de río, sin peligro, sin agua ni punto de río cercano.
const SIN_EXPOSICION = {
  claseRio: null,
  peligroInundacionFluvial: 0,
  distanciaAguaM: null,
  alturaSobreAguaM: null,
  juntoLaguna: false,
}

describe('localidades de prueba', () => {
  it('PASO DE LOS LIBRES e ITUZAINGO resuelven a un tramo aprobado', () => {
    expect(estacionParaLocalidad('PASO DE LOS LIBRES')?.estacionId).toBe('pna-paso-de-los-libres')
    expect(estacionParaLocalidad('ITUZAINGO')?.estacionId).toBe('pna-ituzaingo')
  })
})

describe('resolverEvidenciaRio', () => {
  it('escuela expuesta con lectura sobre evacuación devuelve estado evacuacion', () => {
    const ev = resolverEvidenciaRio(datos(), CUE, ASOF)
    expect(ev).toEqual({
      cueAnexo: CUE,
      estacionId: 'pna-paso-de-los-libres',
      rio: 'uruguay',
      lecturaM: 9.33,
      alertaM: 7,
      evacuacionM: 8.5,
      variacionM: 0.12,
      medidaEn: HACE_1H,
      estado: 'evacuacion',
      criterioExposicion: 'clase_rio=alto',
    })
  })

  it('misma localidad pero escuela no expuesta devuelve null', () => {
    const ev = resolverEvidenciaRio(
      datos({
        susceptibilidadPorCue: new Map([[CUE, SIN_EXPOSICION]]),
        distanciaRioKmPorCue: new Map([[CUE, 10]]),
      }),
      CUE,
      ASOF,
    )
    expect(ev).toBeNull()
  })

  it('localidad sin tramo aprobado devuelve null', () => {
    const ev = resolverEvidenciaRio(
      datos({ localidadPorCue: new Map([[CUE, 'LOCALIDAD SIN TRAMO']]) }),
      CUE,
      ASOF,
    )
    expect(ev).toBeNull()
  })

  it('escuela expuesta con lectura de 30 h: sin_dato (nunca normal ni silencio)', () => {
    const ev = resolverEvidenciaRio(datos({ lecturas: [lectura({ medidaEn: HACE_30H })] }), CUE, ASOF)
    expect(ev).toMatchObject({ disponibilidad: 'sin_dato' })
  })

  it('ignora la lectura futura y usa la última válida anterior a asOf', () => {
    const ev = resolverEvidenciaRio(
      datos({
        lecturas: [
          lectura({ lecturaM: 1, medidaEn: EN_1H }),
          lectura({ lecturaM: 5, medidaEn: '2026-10-13T10:00:00.000Z' }),
          lectura({ lecturaM: 3, medidaEn: '2026-10-13T09:00:00.000Z' }),
        ],
      }),
      CUE,
      ASOF,
    )
    expect(vigente(ev)?.lecturaM).toBe(5)
    expect(vigente(ev)?.medidaEn).toBe('2026-10-13T10:00:00.000Z')
    expect(vigente(ev)?.estado).toBe('normal')
  })

  it('omite la lectura inconsistente y usa la anterior válida', () => {
    const ev = resolverEvidenciaRio(
      datos({
        lecturas: [
          lectura({ lecturaM: 9.33, inconsistente: true }),
          lectura({ lecturaM: 2, medidaEn: '2026-10-13T10:00:00.000Z' }),
        ],
      }),
      CUE,
      ASOF,
    )
    expect(vigente(ev)?.lecturaM).toBe(2)
    expect(vigente(ev)?.estado).toBe('normal')
  })

  it('coerciona valores numéricos llegados como string', () => {
    const ev = resolverEvidenciaRio(
      datos({
        lecturas: [
          lectura({
            lecturaM: '9.33',
            alertaM: '7',
            evacuacionM: '8.5',
            variacionM: '0.12',
          }),
        ],
      }),
      CUE,
      ASOF,
    )
    expect(vigente(ev)?.lecturaM).toBe(9.33)
    expect(vigente(ev)?.alertaM).toBe(7)
    expect(vigente(ev)?.evacuacionM).toBe(8.5)
    expect(vigente(ev)?.variacionM).toBe(0.12)
    expect(vigente(ev)?.estado).toBe('evacuacion')
  })

  it('una lectura no numérica (NaN) da sin_dato, nunca un estado normal', () => {
    const ev = resolverEvidenciaRio(datos({ lecturas: [lectura({ lecturaM: 'abc' })] }), CUE, ASOF)
    expect(ev).toMatchObject({ disponibilidad: 'sin_dato' })
  })
})

describe('crearAdapterRioPrefectura', () => {
  it('carga los datos una sola vez por instancia y resuelve con ellos', async () => {
    let cargas = 0
    const adapter = crearAdapterRioPrefectura({
      cargarDatos: async () => {
        cargas += 1
        return datos()
      },
    })
    const primera = await adapter.obtenerEvidencia({ cueAnexo: CUE, asOf: ASOF })
    const segunda = await adapter.obtenerEvidencia({ cueAnexo: CUE, asOf: ASOF })
    expect(vigente(primera)?.estado).toBe('evacuacion')
    expect(vigente(segunda)?.estado).toBe('evacuacion')
    expect(cargas).toBe(1)
  })
})

describe('resolverEvidenciaRio — relación propia con el río y fallback de estación', () => {
  const coordsCercaPuerto = new Map([[CUE, { lat: -29.7085, lon: -57.0858 }]])

  it('margen RP100 estático ya no alcanza por sí solo (sesgo del pipeline)', () => {
    const ev = resolverEvidenciaRio(
      datos({ susceptibilidadPorCue: new Map([[CUE, { ...SIN_EXPOSICION, margenRp100M: -3.4 }]]) }),
      CUE,
      ASOF,
    )
    expect(ev).toBeNull()
  })

  it('escuela en altura a ~1.4 km del puerto (margen 4 m) no queda expuesta', () => {
    const ev = resolverEvidenciaRio(
      datos({
        susceptibilidadPorCue: new Map([[CUE, { ...SIN_EXPOSICION, margenRp100M: 4 }]]),
        coordenadasPorCue: coordsCercaPuerto,
      }),
      CUE,
      ASOF,
    )
    expect(ev).toBeNull()
  })

  it('ruta de acceso inundable RP100 cuenta', () => {
    const ev = resolverEvidenciaRio(
      datos({
        susceptibilidadPorCue: new Map([[CUE, { ...SIN_EXPOSICION, margenRp100M: 4 }]]),
        rutaProfundidadMaxMPorCue: new Map([[CUE, '3.58']]),
      }),
      CUE,
      ASOF,
    )
    expect(vigente(ev)?.criterioExposicion).toBe('ruta_rp100=3.6m')
  })

  it('sin fila de susceptibilidad: fallback por cercanía a la estación', () => {
    const ev = resolverEvidenciaRio(
      datos({ susceptibilidadPorCue: new Map(), coordenadasPorCue: coordsCercaPuerto }),
      CUE,
      ASOF,
    )
    expect(vigente(ev)?.criterioExposicion).toMatch(/^estacion_a_1\.\dkm\(fallback\)$/)
  })

  it('fallback no aplica con estación de baja precisión (Itatí, 2 decimales)', () => {
    const ev = resolverEvidenciaRio(
      datos({
        localidadPorCue: new Map([[CUE, 'ITATI']]),
        susceptibilidadPorCue: new Map(),
        coordenadasPorCue: new Map([[CUE, { lat: -27.27, lon: -58.24 }]]),
        lecturas: [lectura({ estacionId: 'pna-itati', lecturaM: 7.6, alertaM: 6.8, evacuacionM: 7.5 })],
      }),
      CUE,
      ASOF,
    )
    expect(ev).toBeNull()
  })
})

describe('resolverEvidenciaRio — exposición dinámica por DEM (estimada)', () => {
  // Paso de los Libres: lectura 9.33, mediana 365 d 4.32 -> anomalía +5.01 m.
  const RIBERENA = 'cue-riberena'
  const ALTURA = 'cue-altura'
  function datosDem(over: Partial<DatosRio> = {}): DatosRio {
    return datos({
      localidadPorCue: new Map([
        [RIBERENA, 'PASO DE LOS LIBRES'],
        [ALTURA, 'PASO DE LOS LIBRES'],
      ]),
      susceptibilidadPorCue: new Map([
        [RIBERENA, SIN_EXPOSICION],
        [ALTURA, SIN_EXPOSICION],
      ]),
      coordenadasPorCue: new Map([
        // 3.5 km aguas arriba del puerto, sobre la costa.
        [RIBERENA, { lat: -29.69, lon: -57.075 }],
        // Junto al puerto pero en la barranca.
        [ALTURA, { lat: -29.7205, lon: -57.0865 }],
      ]),
      demPorCue: new Map([
        [RIBERENA, { sueloM: 45.5, nivelRioDemM: 42, distanciaRioM: 150 }],
        [ALTURA, { sueloM: 52, nivelRioDemM: 42, distanciaRioM: 300 }],
      ]),
      medianaPorEstacion: new Map([['pna-paso-de-los-libres', 4.32]]),
      ...over,
    })
  }

  it('escuela ribereña lejos del puerto con suelo bajo el agua estimada queda expuesta (estimado)', () => {
    const ev = vigente(resolverEvidenciaRio(datosDem(), RIBERENA, ASOF))
    expect(ev?.estado).toBe('evacuacion')
    expect(ev?.criterioExposicion).toMatch(/^dem_estimado: suelo 45.5 m <= agua estimada 47.01 m/)
  })

  it('escuela en altura junto al puerto no queda expuesta', () => {
    expect(resolverEvidenciaRio(datosDem(), ALTURA, ASOF)).toBeNull()
  })

  it('sin mediana de referencia y sin criterio estático: sin_dato, nunca no expuesta por omisión', () => {
    const ev = resolverEvidenciaRio(datosDem({ medianaPorEstacion: new Map() }), RIBERENA, ASOF)
    expect(ev).toMatchObject({ disponibilidad: 'sin_dato' })
  })

  it('Puerto Valle (embalse de Yacyretá, aguas arriba de la escala de Ituzaingó): no_aplica', () => {
    const PV = '1801318-00'
    const ev = resolverEvidenciaRio(
      datos({
        localidadPorCue: new Map([
          [PV, 'ITUZAINGO'],
          ['rib-ituz', 'ITUZAINGO'],
        ]),
        susceptibilidadPorCue: new Map([[PV, SIN_EXPOSICION]]),
        coordenadasPorCue: new Map([[PV, { lat: -27.617, lon: -56.415 }]]),
        demPorCue: new Map([
          [PV, { sueloM: 89.33, nivelRioDemM: 80, distanciaRioM: 1165.85 }],
          ['rib-ituz', { sueloM: 58, nivelRioDemM: 54.5, distanciaRioM: 200 }],
        ]),
        medianaPorEstacion: new Map([['pna-ituzaingo', 1.2]]),
        lecturas: [lectura({ estacionId: 'pna-ituzaingo', lecturaM: 4.03, alertaM: 3.5, evacuacionM: 4 })],
      }),
      PV,
      ASOF,
    )
    expect(ev).toMatchObject({ disponibilidad: 'no_aplica', estacionId: 'pna-ituzaingo' })
  })
})

// Reglas v0.4 (F3): exposición por terreno contra el agua posible.
describe('resolverEvidenciaRio con reglas v0.4', () => {
  const V04 = { reglas: 'v0.4' as const }
  const ASOF_V04 = '2026-10-18T02:15:04.000Z'
  const LECTURA_V04 = '2026-10-17T15:00:00.000Z'

  it('Paso de los Libres sólo por ruta RP100: v0.3 la expone, v0.4 no le da piso en ningún horizonte', () => {
    const d = datos({
      susceptibilidadPorCue: new Map([[CUE, { ...SIN_EXPOSICION, claseRio: 'sin_riesgo' }]]),
      rutaProfundidadMaxMPorCue: new Map([[CUE, 0.76]]),
      lecturas: [lectura({ medidaEn: LECTURA_V04 })],
    })
    expect(vigente(resolverEvidenciaRio(d, CUE, ASOF_V04))?.criterioExposicion).toBe('ruta_rp100=0.8m')
    const v04 = vigente(resolverEvidenciaRio(d, CUE, ASOF_V04, V04))!
    expect(v04.estado).toBe('evacuacion')
    expect(v04.criterioExposicion).toBe('no_alcanzable_v0.4')
    for (const h of [24, 72, 240] as const) expect(v04.exposicionV04![h]).toMatchObject({ criterio: 'no_evaluable', alcance: 'ninguno' })
  })

  // Casco de Ituzaingó: 17 m sobre el agua, marcado por la celda WRI.
  function ituzaingo(): DatosRio {
    const VECINA = 'vecina-ribera'
    return {
      localidadPorCue: new Map([[CUE, 'ITUZAINGO'], [VECINA, 'ITUZAINGO']]),
      susceptibilidadPorCue: new Map([[CUE, { ...SIN_EXPOSICION, claseRio: 'sin_riesgo', peligroInundacionFluvial: 0.9 }]]),
      distanciaRioKmPorCue: new Map(),
      lecturas: [lectura({ estacionId: 'pna-ituzaingo', lecturaM: 4.1, alertaM: 4, evacuacionM: 5, medidaEn: LECTURA_V04 })],
      coordenadasPorCue: new Map([[CUE, { lat: -27.58, lon: -56.68 }]]),
      demPorCue: new Map([
        [CUE, { sueloM: 72, nivelRioDemM: 55, distanciaRioM: 600 }],
        [VECINA, { sueloM: 56, nivelRioDemM: 55, distanciaRioM: 100 }],
      ]),
      medianaPorEstacion: new Map([['pna-ituzaingo', 1.5]]),
    }
  }

  it('Ituzaingó con celda WRI pero 17 m sobre el agua: alerta sin alcance (v0.3 la exponía)', () => {
    expect(vigente(resolverEvidenciaRio(ituzaingo(), CUE, ASOF_V04))?.criterioExposicion).toMatch(/^peligro_fluvial/)
    const v04 = vigente(resolverEvidenciaRio(ituzaingo(), CUE, ASOF_V04, V04))!
    expect(v04.estado).toBe('alerta')
    expect(v04.exposicionV04![240]).toMatchObject({ criterio: 'dem_agua_posible', alcance: 'ninguno' })
    expect(v04.exposicionV04![240].margenM!).toBeLessThan(-10)
  })

  it('el escenario de subida de la estación del tramo entra al agua posible por horizonte', () => {
    const d = ituzaingo()
    d.demPorCue!.set(CUE, { sueloM: 60, nivelRioDemM: 55, distanciaRioM: 600 })
    const escenarios = new Map([
      ['pna-ituzaingo', {
        estacionId: 'pna-ituzaingo', h0M: 4.1, fechaH0: '2026-10-17', tasaCortaM: 0.3, tasaMediaM: 0.3, ondaM: null, estacionAguasArriba: null,
        porHorizonte: {
          24: { analogosP90M: 0.1, tendenciaCortaM: 0.3, tendenciaMediaM: 0.3, ondaM: 0, posibleM: 0.3, decide: 'tendencia' as const },
          72: { analogosP90M: 0.2, tendenciaCortaM: 0.9, tendenciaMediaM: 0.9, ondaM: 0, posibleM: 0.9, decide: 'tendencia' as const },
          240: { analogosP90M: 0.5, tendenciaCortaM: 3, tendenciaMediaM: 3, ondaM: 0, posibleM: 3, decide: 'tendencia' as const },
        },
      }],
    ])
    const v04 = vigente(resolverEvidenciaRio(d, CUE, ASOF_V04, { ...V04, escenarios }))!
    // agua actual 55 + 2,6 = 57,6; margen = 57,6 + subida + 2 − 60.
    expect([24, 72, 240].map((h) => v04.exposicionV04![h as 24].alcance)).toEqual(['reducido', 'completo', 'completo'])
    expect(v04.exposicionV04![240].subida?.decide).toBe('tendencia')
  })

  it('vecinas a 100 m con terreno parecido quedan con el mismo alcance aunque una celda gruesa las separe', () => {
    const A = 'cue-a'
    const B = 'cue-b'
    const d: DatosRio = {
      localidadPorCue: new Map([[A, 'ITUZAINGO'], [B, 'ITUZAINGO']]),
      susceptibilidadPorCue: new Map([
        [A, { ...SIN_EXPOSICION, claseRio: 'alto' }],
        [B, { ...SIN_EXPOSICION, claseRio: 'sin_riesgo' }],
      ]),
      distanciaRioKmPorCue: new Map(),
      lecturas: [lectura({ estacionId: 'pna-ituzaingo', lecturaM: 5.2, alertaM: 4, evacuacionM: 5, medidaEn: LECTURA_V04 })],
      coordenadasPorCue: new Map([[A, { lat: -27.58, lon: -56.68 }], [B, { lat: -27.5809, lon: -56.68 }]]),
      demPorCue: new Map([
        [A, { sueloM: 63.1, nivelRioDemM: 55, distanciaRioM: 700 }],
        [B, { sueloM: 63.3, nivelRioDemM: 55, distanciaRioM: 780 }],
      ]),
      medianaPorEstacion: new Map([['pna-ituzaingo', 1.5]]),
    }
    const a = vigente(resolverEvidenciaRio(d, A, ASOF_V04, V04))!
    const b = vigente(resolverEvidenciaRio(d, B, ASOF_V04, V04))!
    for (const h of [24, 72, 240] as const) expect(a.exposicionV04![h].alcance).toBe(b.exposicionV04![h].alcance)
    // v0.3: A expuesta por la celda JRC, B no.
    expect(vigente(resolverEvidenciaRio(d, A, ASOF_V04))).toBeDefined()
    expect(resolverEvidenciaRio(d, B, ASOF_V04)).toBeNull()
  })

  it('sin lectura vigente: sin_dato si algún horizonte alcanza, null si ninguno', () => {
    const d = ituzaingo()
    d.lecturas = []
    // DEM evaluable sin nivel actual: posiblemente expuesta, nunca "no expuesta" por omisión.
    expect(resolverEvidenciaRio(d, CUE, ASOF_V04, V04)).toMatchObject({ disponibilidad: 'sin_dato' })
    d.demPorCue!.delete(CUE)
    expect(resolverEvidenciaRio(d, CUE, ASOF_V04, V04)).toBeNull()
    d.susceptibilidadPorCue.set(CUE, { ...SIN_EXPOSICION, claseRio: 'alto' })
    expect(resolverEvidenciaRio(d, CUE, ASOF_V04, V04)).toMatchObject({ disponibilidad: 'sin_dato' })
  })
})
