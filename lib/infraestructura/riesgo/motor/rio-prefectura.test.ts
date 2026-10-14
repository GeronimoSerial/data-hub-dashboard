import { describe, expect, it } from 'vitest'
import {
  ALTURA_SOBRE_AGUA_MAX_M,
  DISTANCIA_AGUA_MAX_M,
  DISTANCIA_PUNTO_RIO_MAX_KM,
  MAX_ANTIGUEDAD_LECTURA_HORAS,
  PISO_NIVEL_POR_ESTADO_RIO,
  estadoDeLectura,
  evaluarExposicionRio,
  lecturaVigente,
  valorAmenazaRio,
  type DatosExposicionRio,
} from './rio-prefectura'

const EXPUESTA_NADA: DatosExposicionRio = {
  claseRio: null,
  peligroInundacionFluvial: null,
  distanciaAguaM: null,
  alturaSobreAguaM: null,
  juntoLaguna: null,
  distanciaPuntoRioKm: null,
}

describe('estadoDeLectura', () => {
  it('Paso de los Libres 9.33 con alerta 7.0 y evacuación 8.5 es evacuación', () => {
    expect(estadoDeLectura(9.33, 7.0, 8.5)).toBe('evacuacion')
  })

  it('Ituzaingó 4.03 con alerta 3.5 y evacuación 4.0 es evacuación', () => {
    expect(estadoDeLectura(4.03, 3.5, 4.0)).toBe('evacuacion')
  })

  it('Corrientes 5.43 con alerta 6.5 y evacuación 7 es normal', () => {
    expect(estadoDeLectura(5.43, 6.5, 7)).toBe('normal')
  })

  it('igualdad exacta con evacuación cuenta como evacuación', () => {
    expect(estadoDeLectura(8.5, 7.0, 8.5)).toBe('evacuacion')
  })

  it('igualdad exacta con alerta cuenta como alerta', () => {
    expect(estadoDeLectura(7.0, 7.0, 8.5)).toBe('alerta')
  })

  it('alerta sin evacuación definida se clasifica como alerta', () => {
    expect(estadoDeLectura(7.2, 7.0, null)).toBe('alerta')
  })

  it('evacuación sin alerta definida se clasifica por evacuación', () => {
    expect(estadoDeLectura(4.1, null, 4.0)).toBe('evacuacion')
    expect(estadoDeLectura(3.9, null, 4.0)).toBe('normal')
  })

  it('sin ningún umbral devuelve null', () => {
    expect(estadoDeLectura(5, null, null)).toBeNull()
  })
})

describe('lecturaVigente', () => {
  const asOf = '2026-10-13T12:00:00Z'

  it('lectura de 23 h es vigente', () => {
    expect(lecturaVigente('2026-10-12T13:00:00Z', asOf)).toBe(true)
  })

  it('lectura de 25 h no es vigente', () => {
    expect(lecturaVigente('2026-10-12T11:00:00Z', asOf)).toBe(false)
  })

  it('lectura exactamente al límite es vigente', () => {
    expect(lecturaVigente('2026-10-12T12:00:00Z', asOf)).toBe(true)
    expect(MAX_ANTIGUEDAD_LECTURA_HORAS).toBe(24)
  })

  it('lectura futura no es vigente', () => {
    expect(lecturaVigente('2026-10-13T13:00:00Z', asOf)).toBe(false)
  })

  it('fecha inválida no es vigente', () => {
    expect(lecturaVigente('no-es-fecha', asOf)).toBe(false)
    expect(lecturaVigente('2026-10-13T11:00:00Z', 'tampoco')).toBe(false)
  })

  it('respeta un límite de horas explícito', () => {
    expect(lecturaVigente('2026-10-13T06:00:00Z', asOf, 6)).toBe(true)
    expect(lecturaVigente('2026-10-13T05:59:00Z', asOf, 6)).toBe(false)
  })
})

describe('evaluarExposicionRio', () => {
  it('sin ningún criterio devuelve null', () => {
    expect(evaluarExposicionRio(EXPUESTA_NADA)).toBeNull()
  })

  it('clase de río alto, medio o bajo produce clase_rio', () => {
    for (const claseRio of ['alto', 'medio', 'bajo']) {
      expect(evaluarExposicionRio({ ...EXPUESTA_NADA, claseRio })).toBe(`clase_rio=${claseRio}`)
    }
  })

  it('clase distinta de alto/medio/bajo no cuenta', () => {
    expect(evaluarExposicionRio({ ...EXPUESTA_NADA, claseRio: 'nulo' })).toBeNull()
  })

  it('peligro de inundación fluvial mayor que 0 produce peligro_fluvial', () => {
    expect(evaluarExposicionRio({ ...EXPUESTA_NADA, peligroInundacionFluvial: 2 })).toBe(
      'peligro_fluvial=2',
    )
    expect(evaluarExposicionRio({ ...EXPUESTA_NADA, peligroInundacionFluvial: 0 })).toBeNull()
  })

  it('agua cercana y baja produce agua_a_<m>m redondeado', () => {
    expect(
      evaluarExposicionRio({
        ...EXPUESTA_NADA,
        distanciaAguaM: 640.4,
        alturaSobreAguaM: 4,
        juntoLaguna: false,
      }),
    ).toBe('agua_a_640m')
  })

  it('juntoLaguna true excluye la regla de distancia al agua', () => {
    expect(
      evaluarExposicionRio({
        ...EXPUESTA_NADA,
        distanciaAguaM: 100,
        alturaSobreAguaM: 2,
        juntoLaguna: true,
      }),
    ).toBeNull()
  })

  it('juntoLaguna null no excluye la regla de distancia al agua', () => {
    expect(
      evaluarExposicionRio({
        ...EXPUESTA_NADA,
        distanciaAguaM: 100,
        alturaSobreAguaM: 2,
        juntoLaguna: null,
      }),
    ).toBe('agua_a_100m')
  })

  it('distancia o altura fuera de umbral no activan la regla de agua', () => {
    expect(
      evaluarExposicionRio({
        ...EXPUESTA_NADA,
        distanciaAguaM: DISTANCIA_AGUA_MAX_M + 1,
        alturaSobreAguaM: 1,
        juntoLaguna: false,
      }),
    ).toBeNull()
    expect(
      evaluarExposicionRio({
        ...EXPUESTA_NADA,
        distanciaAguaM: 10,
        alturaSobreAguaM: ALTURA_SOBRE_AGUA_MAX_M + 1,
        juntoLaguna: false,
      }),
    ).toBeNull()
  })

  it('regla de agua exige todos sus datos no nulos', () => {
    expect(
      evaluarExposicionRio({
        ...EXPUESTA_NADA,
        distanciaAguaM: 10,
        alturaSobreAguaM: null,
        juntoLaguna: false,
      }),
    ).toBeNull()
  })

  it('punto de río a <= 3 km produce punto_rio_a_<km>km con 1 decimal', () => {
    expect(evaluarExposicionRio({ ...EXPUESTA_NADA, distanciaPuntoRioKm: 2.345 })).toBe(
      'punto_rio_a_2.3km',
    )
    expect(
      evaluarExposicionRio({ ...EXPUESTA_NADA, distanciaPuntoRioKm: DISTANCIA_PUNTO_RIO_MAX_KM }),
    ).toBe('punto_rio_a_3.0km')
    expect(evaluarExposicionRio({ ...EXPUESTA_NADA, distanciaPuntoRioKm: 3.1 })).toBeNull()
  })

  it('devuelve el primer criterio que coincide en orden', () => {
    expect(
      evaluarExposicionRio({
        claseRio: 'bajo',
        peligroInundacionFluvial: 1,
        distanciaAguaM: 10,
        alturaSobreAguaM: 1,
        juntoLaguna: false,
        distanciaPuntoRioKm: 0.5,
      }),
    ).toBe('clase_rio=bajo')
  })
})

describe('valorAmenazaRio', () => {
  it('normal con alerta 6.5 y lectura 5.43 vale ≈ 27.6', () => {
    expect(
      valorAmenazaRio({ estado: 'normal', lecturaM: 5.43, alertaM: 6.5, variacionM: null }),
    ).toBe(27.6)
  })

  it('normal se satura en 33 cuando la lectura supera la alerta', () => {
    expect(
      valorAmenazaRio({ estado: 'normal', lecturaM: 9, alertaM: 6, variacionM: null }),
    ).toBe(33)
  })

  it('normal sin alerta o con alerta 0 vale 0', () => {
    expect(valorAmenazaRio({ estado: 'normal', lecturaM: 5, alertaM: null, variacionM: null })).toBe(0)
    expect(valorAmenazaRio({ estado: 'normal', lecturaM: 5, alertaM: 0, variacionM: null })).toBe(0)
  })

  it('alerta vale 66 y suma 10 si la variación crece', () => {
    expect(valorAmenazaRio({ estado: 'alerta', lecturaM: 7, alertaM: 7, variacionM: 0.2 })).toBe(76)
    expect(valorAmenazaRio({ estado: 'alerta', lecturaM: 7, alertaM: 7, variacionM: 0 })).toBe(66)
    expect(valorAmenazaRio({ estado: 'alerta', lecturaM: 7, alertaM: 7, variacionM: null })).toBe(66)
  })

  it('evacuación vale 100', () => {
    expect(valorAmenazaRio({ estado: 'evacuacion', lecturaM: 9.33, alertaM: 7, variacionM: 1 })).toBe(100)
  })
})

describe('PISO_NIVEL_POR_ESTADO_RIO', () => {
  it('fija el piso de nivel por estado oficial', () => {
    expect(PISO_NIVEL_POR_ESTADO_RIO).toEqual({ normal: null, alerta: 'moderado', evacuacion: 'alto' })
  })
})

describe('evaluarExposicionRio — relación propia de la escuela con el río', () => {
  const base = {
    claseRio: 'sin_riesgo',
    peligroInundacionFluvial: 0,
    distanciaAguaM: null,
    alturaSobreAguaM: null,
    juntoLaguna: false,
    distanciaPuntoRioKm: 24.5,
    tieneDatosSusceptibilidad: true,
  }

  it('escuela ribereña lejos del puerto (cota bajo el nivel RP100, 4 km de la estación) queda expuesta', () => {
    expect(evaluarExposicionRio({ ...base, margenRp100M: -0.5, distanciaEstacionKm: 4 })).toBe('margen_rp100=-0.5m')
  })

  it('escuela en altura junto al puerto (margen 5 m, 0.6 km de la estación) NO queda expuesta', () => {
    expect(evaluarExposicionRio({ ...base, margenRp100M: 5, distanciaEstacionKm: 0.6 })).toBeNull()
  })

  it('margen en el borde (1 m) cuenta; 1.1 m no', () => {
    expect(evaluarExposicionRio({ ...base, margenRp100M: 1 })).toBe('margen_rp100=1.0m')
    expect(evaluarExposicionRio({ ...base, margenRp100M: 1.1 })).toBeNull()
  })

  it('ruta de acceso inundable (RP100) cuenta como exposición', () => {
    expect(evaluarExposicionRio({ ...base, margenRp100M: 3, rutaProfundidadMaxM: 0.8 })).toBe('ruta_rp100=0.8m')
  })

  it('fallback: sin datos de susceptibilidad, cerca de la estación (<= 1.5 km) cuenta', () => {
    const sinDatos = { ...base, claseRio: null, peligroInundacionFluvial: null, tieneDatosSusceptibilidad: false }
    expect(evaluarExposicionRio({ ...sinDatos, distanciaEstacionKm: 1.2 })).toBe('estacion_a_1.2km(fallback)')
    expect(evaluarExposicionRio({ ...sinDatos, distanciaEstacionKm: 1.6 })).toBeNull()
  })

  it('con datos de susceptibilidad la cercanía a la estación sola no alcanza', () => {
    expect(evaluarExposicionRio({ ...base, distanciaEstacionKm: 0.3 })).toBeNull()
  })
})
