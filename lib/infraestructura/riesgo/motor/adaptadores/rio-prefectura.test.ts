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
