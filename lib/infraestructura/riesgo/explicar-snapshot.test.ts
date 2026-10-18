import { describe, expect, it } from 'vitest'
import { explicarSnapshot, type FactorMotor, type SnapshotMotor } from './explicar-snapshot'

const SNAPSHOT_ALTO: SnapshotMotor = {
  nivelRiesgo: 'alto',
  scoreRiesgo: 72.4,
  horizonteHoras: 72,
  calculadoEn: '2026-10-12T12:00:00.000Z',
}

const FACTOR_RIO: FactorMotor = {
  tipo: 'amenaza',
  fuente: 'rio-pna',
  variable: 'altura_rio',
  valor: 4.03,
  unidad: 'm',
  contribucion: 31.25,
  explicacion:
    'Rio parana en pna-ituzaingo: 4.03m, estado evacuacion (alerta 3.5m, evacuacion 4m), tendencia crece; escuela expuesta por clase_rio=alto',
  observadoEn: '2026-10-12T11:00:00.000Z',
}

const FACTOR_LLUVIA_72H: FactorMotor = {
  tipo: 'amenaza',
  fuente: 'lluvia-observada',
  variable: 'acumulado_72h',
  valor: 20.195,
  unidad: 'mm',
  contribucion: 1.56,
  explicacion: null,
  observadoEn: '2026-10-12T11:00:00.000Z',
}

const FACTOR_PELIGRO: FactorMotor = {
  tipo: 'amenaza',
  fuente: 'peligro-celda',
  variable: 'nivel_peligro_72h',
  valor: 0,
  unidad: null,
  contribucion: 0,
  explicacion: 'Peligro estimado verde a 72h (base deterministico)',
  observadoEn: null,
}

const FACTOR_URGENCIA: FactorMotor = {
  tipo: 'urgencia',
  fuente: 'pendiente',
  variable: 'urgencia_compuesta',
  valor: null,
  unidad: null,
  contribucion: 0,
  explicacion: 'No implementado en el motor v0: urgencia sin fuente de datos',
  observadoEn: null,
}

const FACTOR_VULNERABILIDAD: FactorMotor = {
  tipo: 'vulnerabilidad',
  fuente: 'estatico',
  variable: 'susceptibilidad_estatica',
  valor: 30,
  unidad: null,
  contribucion: 30,
  explicacion: 'Susceptibilidad estatica compuesta (version 1)',
  observadoEn: null,
}

const FACTORES_ITUZAINGO: FactorMotor[] = [
  FACTOR_VULNERABILIDAD,
  FACTOR_URGENCIA,
  FACTOR_PELIGRO,
  FACTOR_LLUVIA_72H,
  FACTOR_RIO,
]

describe('explicarSnapshot', () => {
  it('sin snapshot devuelve estado sin datos', () => {
    const resultado = explicarSnapshot(null, FACTORES_ITUZAINGO)

    expect(resultado.nivel).toBeNull()
    expect(resultado.etiquetaNivel).toBe('Sin datos')
    expect(resultado.conclusion).toBe('El motor de riesgo todavía no evaluó esta escuela.')
    expect(resultado.situacionActual).toEqual([])
    expect(resultado.detalleTecnico).toEqual([])
    expect(resultado.zonaExpuesta).toBeNull()
  })

  it('caso Ituzaingó con nivel alto explica río y lluvia sin jerga', () => {
    const resultado = explicarSnapshot(SNAPSHOT_ALTO, FACTORES_ITUZAINGO)

    expect(resultado.nivel).toBe('alto')
    expect(resultado.etiquetaNivel).toBe('Alto')
    expect(resultado.conclusion).toBe(
      'Riesgo actual alto. Río Paraná en Ituzaingó — Altura del río: 4,03 m y creciendo · Evacuación (evacuación 4,00 m).',
    )
    expect(resultado.situacionActual).toHaveLength(2)
    expect(resultado.situacionActual[0]).toBe(
      'Río Paraná en Ituzaingó — Altura del río: 4,03 m y creciendo · Evacuación (evacuación 4,00 m).',
    )
    expect(resultado.situacionActual[1]).toBe('Lluvia de las últimas 72 h: 20 mm.')
    expect(resultado.zonaExpuesta).toBe('La escuela está en zona expuesta a crecidas del río.')

    const textos = [resultado.conclusion, ...resultado.situacionActual, resultado.zonaExpuesta ?? '']
    for (const texto of textos) {
      expect(texto).not.toContain('_')
      expect(texto).not.toContain('puntaje')
      expect(texto).not.toContain('No implementado')
      expect(texto).not.toContain('pna-')
    }
  })

  it('detalle técnico incluye todos los factores ordenados por contribución', () => {
    const resultado = explicarSnapshot(SNAPSHOT_ALTO, FACTORES_ITUZAINGO)

    expect(resultado.detalleTecnico.map((d) => d.titulo)).toEqual([
      'Amenaza · altura rio',
      'Vulnerabilidad · susceptibilidad estatica',
      'Amenaza · acumulado 72h',
      'Urgencia · urgencia compuesta',
      'Amenaza · nivel peligro 72h',
    ])
    expect(resultado.detalleTecnico[0].texto).toBe(FACTOR_RIO.explicacion)
    expect(resultado.detalleTecnico[3].texto).toBe(FACTOR_URGENCIA.explicacion)
    expect(resultado.detalleTecnico[4].texto).toBe(FACTOR_PELIGRO.explicacion)
  })

  it('río sin datos (no_aplica o valor null) solo aparece en detalle técnico', () => {
    const riesgoRioNoAplica: FactorMotor = {
      ...FACTOR_RIO,
      valor: null,
      unidad: 'no_aplica',
      contribucion: 0,
      explicacion: 'Sin estación de referencia cercana',
    }
    const resultado = explicarSnapshot(SNAPSHOT_ALTO, [riesgoRioNoAplica, FACTOR_VULNERABILIDAD])

    expect(resultado.situacionActual).toEqual([])
    expect(resultado.zonaExpuesta).toBeNull()
    expect(resultado.detalleTecnico.map((d) => d.titulo)).toContain('Amenaza · altura rio')
  })

  it('nivel alto sin evidencia nunca dice sin señales', () => {
    const resultado = explicarSnapshot(SNAPSHOT_ALTO, [FACTOR_VULNERABILIDAD])

    expect(resultado.conclusion).toBe('Riesgo actual alto.')
    expect(resultado.conclusion).not.toContain('Sin señales')
  })

  it('bajo sin evidencia indica ausencia de señales', () => {
    const resultado = explicarSnapshot(
      { ...SNAPSHOT_ALTO, nivelRiesgo: 'bajo' },
      [FACTOR_PELIGRO, FACTOR_URGENCIA, FACTOR_VULNERABILIDAD],
    )

    expect(resultado.etiquetaNivel).toBe('Bajo')
    expect(resultado.situacionActual).toEqual([])
    expect(resultado.conclusion).toBe('Riesgo actual bajo: sin señales de lluvia ni de río para hoy.')
  })

  it('alerta con tendencia baja usa nivel de alerta y bajando', () => {
    const riesgoAlerta: FactorMotor = {
      ...FACTOR_RIO,
      valor: 3.6,
      contribucion: 12,
      explicacion:
        'Rio uruguay en pna-paso-de-la-patria: 3.6m, estado alerta (alerta 3.5m, evacuacion 4m), tendencia baja',
    }
    const resultado = explicarSnapshot(
      { ...SNAPSHOT_ALTO, nivelRiesgo: 'moderado' },
      [riesgoAlerta],
    )

    expect(resultado.conclusion).toBe(
      'Riesgo actual moderado: conviene seguir la evolución. Río Uruguay en Paso de la Patria — Altura del río: 3,60 m y bajando · Alerta (alerta 3,50 m).',
    )
    expect(resultado.zonaExpuesta).toBeNull()
  })

  it('lluvia de 1,58 mm se muestra con una decimal y solo si valor >= 1', () => {
    const lluvia24h: FactorMotor = {
      ...FACTOR_LLUVIA_72H,
      variable: 'acumulado_24h',
      valor: 1.58,
      contribucion: 0.5,
    }
    const lluviaInsignificante: FactorMotor = { ...lluvia24h, valor: 0.4, contribucion: 0.5 }

    const conLluvia = explicarSnapshot({ ...SNAPSHOT_ALTO, nivelRiesgo: 'bajo' }, [lluvia24h])
    expect(conLluvia.situacionActual).toEqual(['Lluvia de las últimas 24 h: 1,6 mm.'])

    const sinLluvia = explicarSnapshot({ ...SNAPSHOT_ALTO, nivelRiesgo: 'bajo' }, [lluviaInsignificante])
    expect(sinLluvia.situacionActual).toEqual([])
  })

  it('peligro de celda con contribución > 0 describe el color y el horizonte', () => {
    const peligroAmarillo: FactorMotor = {
      ...FACTOR_PELIGRO,
      valor: 1,
      contribucion: 8,
      explicacion: 'Peligro estimado amarillo a 24h (base deterministico)',
    }
    const peligroLargo: FactorMotor = {
      ...peligroAmarillo,
      explicacion: 'Peligro estimado rojo a 240h (base deterministico)',
    }

    expect(explicarSnapshot(SNAPSHOT_ALTO, [peligroAmarillo]).situacionActual).toEqual([
      'Pronóstico de lluvia: peligro amarillo en las próximas 24 h.',
    ])
    expect(explicarSnapshot(SNAPSHOT_ALTO, [peligroLargo]).situacionActual).toEqual([
      'Pronóstico de lluvia: peligro rojo en los próximos 10 días.',
    ])
  })

  it('otra amenaza con contribución > 0 usa señal genérica sin snake_case', () => {
    const otra: FactorMotor = {
      tipo: 'amenaza',
      fuente: 'otra',
      variable: 'marea_viento',
      valor: 2,
      unidad: null,
      contribucion: 4,
      explicacion: 'viento_fuerte sostenido',
      observadoEn: null,
    }
    const resultado = explicarSnapshot({ ...SNAPSHOT_ALTO, nivelRiesgo: 'moderado' }, [otra])

    expect(resultado.situacionActual).toEqual(['Otra señal: viento fuerte sostenido.'])
  })

  it('explica el factor río v0.4 (superación del terreno) sin romper altura_rio', () => {
    const rioV04: FactorMotor = {
      tipo: 'amenaza',
      fuente: 'rio-v04',
      variable: 'superacion_terreno',
      valor: 0.42,
      unidad: 'probabilidad',
      contribucion: 10.5,
      explicacion:
        'Rio v0.4: P superacion del terreno 0.42 a 72h; conservador 0.55; metodo analogos-v2+transferencia-km version superacion-terreno-v1; mapeo rio-v04-mapeo-provisorio-1; piso ninguno',
      observadoEn: '2026-10-12T12:00:00.000Z',
    }
    const resultado = explicarSnapshot(SNAPSHOT_ALTO, [rioV04, FACTOR_RIO])

    expect(resultado.situacionActual).toEqual([
      expect.stringContaining('Altura del río: 4,03 m'),
      'Río: probabilidad 42 % de que el agua supere el terreno de la escuela en las próximas 72 h (escenario conservador 55 %).',
    ])
  })
})

// Reglas v0.4 (F3): el factor río conserva el prefijo legible y agrega el
// detalle de exposición; el río no alcanzable no marca zona expuesta.
describe('explicarSnapshot con factores río de reglas v0.4', () => {
  it('río alcanzable: mismo texto de evidencia y zona expuesta', () => {
    const factor: FactorMotor = {
      ...FACTOR_RIO,
      explicacion: `${FACTOR_RIO.explicacion!.replace('clase_rio=alto', 'exposicion_v0.4')}; exposicion v0.4 a 72h: criterio dem_agua_posible; alcance completo; margen 0.4m (suelo 57m, agua posible 55.4m = dem 52 + anomalia 3.1 + subida 0.3 por analogos [analogos_p90 0.3, tendencia 0 a 0 m/dia, onda 0]; margen_error 2m; banda 2m)`,
    }
    const r = explicarSnapshot(SNAPSHOT_ALTO, [factor])
    expect(r.situacionActual[0]).toContain('Río Paraná en Ituzaingó')
    expect(r.zonaExpuesta).not.toBeNull()
  })

  it('río no alcanzable: sin evidencia ni zona expuesta, visible en el detalle técnico', () => {
    const factor: FactorMotor = {
      ...FACTOR_RIO,
      unidad: 'no_alcanzable',
      contribucion: 0,
      explicacion: 'Rio parana en pna-ituzaingo: 4.03m, estado evacuacion (alerta 3.5m, evacuacion 4m), tendencia crece; terreno no alcanzable: exposicion v0.4 a 72h: criterio dem_agua_posible; alcance ninguno; margen -12.4m',
    }
    const r = explicarSnapshot({ ...SNAPSHOT_ALTO, nivelRiesgo: 'bajo' }, [factor])
    expect(r.situacionActual).toEqual([])
    expect(r.zonaExpuesta).toBeNull()
    expect(r.detalleTecnico[0].texto).toContain('terreno no alcanzable')
  })
})
