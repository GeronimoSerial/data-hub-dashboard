// Tests puros del adapter de PuertoRioPrefectura: sin base de datos.
import { describe, expect, it } from 'vitest'
import { estacionParaLocalidad } from '@/lib/infraestructura/hidrometria/tramos-prefectura'
import {
  crearAdapterRioPrefectura,
  resolverEvidenciaRio,
  type DatosRio,
  type FilaLecturaRio,
} from './rio-prefectura'

const CUE = '12345678'
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

  it('lectura de 30 h de antigüedad devuelve null', () => {
    const ev = resolverEvidenciaRio(datos({ lecturas: [lectura({ medidaEn: HACE_30H })] }), CUE, ASOF)
    expect(ev).toBeNull()
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
    expect(ev?.lecturaM).toBe(5)
    expect(ev?.medidaEn).toBe('2026-10-13T10:00:00.000Z')
    expect(ev?.estado).toBe('normal')
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
    expect(ev?.lecturaM).toBe(2)
    expect(ev?.estado).toBe('normal')
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
    expect(ev?.lecturaM).toBe(9.33)
    expect(ev?.alertaM).toBe(7)
    expect(ev?.evacuacionM).toBe(8.5)
    expect(ev?.variacionM).toBe(0.12)
    expect(ev?.estado).toBe('evacuacion')
  })

  it('una lectura no numérica (NaN) devuelve null, nunca un estado normal', () => {
    const ev = resolverEvidenciaRio(datos({ lecturas: [lectura({ lecturaM: 'abc' })] }), CUE, ASOF)
    expect(ev).toBeNull()
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
    expect(primera?.estado).toBe('evacuacion')
    expect(segunda?.estado).toBe('evacuacion')
    expect(cargas).toBe(1)
  })
})
