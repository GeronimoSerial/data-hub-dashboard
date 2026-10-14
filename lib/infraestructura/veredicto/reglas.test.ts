import { describe, expect, it } from 'vitest'
import type { LluviaObservadaAmbito } from './lluvia-observada'
import type { AvisoSmnDia, CaudalDia, EnsambleDia } from './pronostico'
import type { RioDia } from './rios'
import { evaluarDia, UMBRALES, VERSION_REGLAS, type EntradaEvaluacion, type ResultadoAmbito } from './reglas'

type Lluvia24 = LluviaObservadaAmbito & { percentilMax: 'bajo_p90' | 'p90' | 'p95' | 'p99' | null }

function lluvia(id: string, maxMm: number, cobertura = 1): LluviaObservadaAmbito {
  return {
    ambito: `departamento:${id}`,
    promMm: 0,
    maxMm,
    celdaMax: 'c1',
    cobertura,
    granulosEsperados: 48,
    granulosRecibidos: Math.round(48 * cobertura),
  }
}

function lluvia24(id: string, maxMm: number, percentilMax: Lluvia24['percentilMax'], cobertura = 1): Lluvia24 {
  return { ...lluvia(id, maxMm, cobertura), percentilMax }
}

function rio(over: Partial<RioDia> = {}): RioDia {
  return {
    estacionId: 'est-1',
    nombre: 'Estación 1',
    rio: 'uruguay',
    departamento: 'd1',
    estadoMax: 'normal',
    alturaMaxM: 3,
    tendenciaM24h: 0,
    margenEvacM: 2,
    margenAlertaM: 1,
    ultimaMedidaEn: '2026-10-12T12:00:00Z',
    ...over,
  }
}

function caudal(over: Partial<CaudalDia> = {}): CaudalDia {
  return {
    puntoId: 'p1',
    nombre: 'Punto 1',
    departamento: 'd1',
    picoM3s: 100,
    picoEn: '2026-10-13T00:00:00Z',
    corridaEn: '2026-10-12T00:00:00Z',
    percentil: null,
    ...over,
  }
}

function ensamble(over: Partial<EnsambleDia> = {}): EnsambleDia {
  return {
    departamento: 'd1',
    probP95Max: 0,
    probP99Max: 0,
    corridaEn: '2026-10-12T00:00:00Z',
    ...over,
  }
}

function smn(nivel: AvisoSmnDia['nivel'], departamento = 'd1'): AvisoSmnDia {
  return {
    departamento,
    nivel,
    avisoId: `aviso-${nivel}`,
    evento: 'tormentas',
    desde: '2026-10-13T00:00:00Z',
    hasta: '2026-10-13T23:59:00Z',
  }
}

function entrada(over: Partial<EntradaEvaluacion> & Pick<EntradaEvaluacion, 'tipoDia' | 'departamentos'>): EntradaEvaluacion {
  return {
    lluvia24: [],
    lluvia72: [],
    rios: [],
    caudal: [],
    ensamble: [],
    smn: [],
    ...over,
  }
}

function ambito(resultados: ResultadoAmbito[], id: string): ResultadoAmbito {
  const encontrado = resultados.find((r) => r.ambito === `departamento:${id}`)
  if (!encontrado) throw new Error(`falta el ámbito ${id}`)
  return encontrado
}

function provincia(resultados: ResultadoAmbito[]): ResultadoAmbito {
  const encontrado = resultados.find((r) => r.ambito === 'provincia')
  if (!encontrado) throw new Error('falta el ámbito provincia')
  return encontrado
}

describe('reglas de veredicto', () => {
  it('expone la versión de reglas y los umbrales en calibración', () => {
    expect(VERSION_REGLAS).toBe('reglas-veredicto-v0.1')
    expect(UMBRALES.lluvia72Mm).toEqual({ vigilancia: 80, alerta: 120, severo: 180 })
  })

  describe('lluvia observada 24 h (percentil)', () => {
    it.each([
      ['p90', 'vigilancia'],
      ['p95', 'alerta'],
      ['p99', 'severo'],
    ] as const)('percentil %s da %s', (percentil, nivel) => {
      const r = ambito(
        evaluarDia(entrada({ tipoDia: 'observado', departamentos: ['d1'], lluvia24: [lluvia24('d1', 50, percentil)] })),
        'd1',
      )
      expect(r.nivel).toBe(nivel)
      expect(r.traza[0]).toMatchObject({ regla: 'lluvia.obs_24h', ref: 'lluvia.obs_24h.max_mm', valor: 50, nivel })
    })

    it('bajo_p90 o null no disparan', () => {
      const r = ambito(
        evaluarDia(
          entrada({
            tipoDia: 'observado',
            departamentos: ['d1'],
            lluvia24: [lluvia24('d1', 5, 'bajo_p90'), { ...lluvia24('d2', 5, null) }],
          }),
        ),
        'd1',
      )
      expect(r.nivel).toBe('sin_senal')
      expect(r.traza).toEqual([])
    })
  })

  describe('lluvia observada 72 h (mm)', () => {
    it.each([
      [79.9, 'sin_senal'],
      [80, 'vigilancia'],
      [119.9, 'vigilancia'],
      [120, 'alerta'],
      [179.9, 'alerta'],
      [180, 'severo'],
    ] as const)('%s mm da %s', (mm, nivel) => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'observado', departamentos: ['d1'], lluvia72: [lluvia('d1', mm)] })), 'd1')
      expect(r.nivel).toBe(nivel)
    })

    it('cobertura menor a 0,8 cuenta como fuente imerg ausente y no dispara', () => {
      const r = ambito(
        evaluarDia(
          entrada({
            tipoDia: 'observado',
            departamentos: ['d1'],
            lluvia72: [lluvia('d1', 300, 0.79)],
          }),
        ),
        'd1',
      )
      expect(r.nivel).toBe('sin_dato')
      expect(r.fuentesAusentes).toEqual(['imerg', 'prefectura'])
      expect(r.traza).toEqual([])
    })
  })

  describe('ríos', () => {
    it('evacuación da severo', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'observado', departamentos: ['d1'], rios: [rio({ estadoMax: 'evacuacion' })] })), 'd1')
      expect(r.nivel).toBe('severo')
      expect(r.traza[0].ref).toBe('rio.est-1.estado_max')
    })

    it('alerta da alerta', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'observado', departamentos: ['d1'], rios: [rio({ estadoMax: 'alerta', tendenciaM24h: 0.2 })] })), 'd1')
      expect(r.nivel).toBe('alerta')
    })

    it('alerta con subida mayor a 0,3 m da severo', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'observado', departamentos: ['d1'], rios: [rio({ estadoMax: 'alerta', tendenciaM24h: 0.31 })] })), 'd1')
      expect(r.nivel).toBe('severo')
    })

    it('alerta con subida exactamente 0,3 m queda en alerta', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'observado', departamentos: ['d1'], rios: [rio({ estadoMax: 'alerta', tendenciaM24h: 0.3 })] })), 'd1')
      expect(r.nivel).toBe('alerta')
    })

    it('normal con margen a alerta menor a 0,5 m y subida da vigilancia', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'observado', departamentos: ['d1'], rios: [rio({ margenAlertaM: 0.49, tendenciaM24h: 0.01 })] })), 'd1')
      expect(r.nivel).toBe('vigilancia')
    })

    it('margen de exactamente 0,5 m o subida nula no disparan', () => {
      const margen = ambito(evaluarDia(entrada({ tipoDia: 'observado', departamentos: ['d1'], rios: [rio({ margenAlertaM: 0.5, tendenciaM24h: 0.1 })] })), 'd1')
      const bajada = ambito(evaluarDia(entrada({ tipoDia: 'observado', departamentos: ['d1'], rios: [rio({ margenAlertaM: 0.1, tendenciaM24h: 0 })] })), 'd1')
      expect(margen.nivel).toBe('sin_senal')
      expect(bajada.nivel).toBe('sin_senal')
    })

    it('río sin dato no cuenta como fuente prefectura presente', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'observado', departamentos: ['d1'], rios: [rio({ estadoMax: 'sin_dato' })] })), 'd1')
      expect(r.nivel).toBe('sin_dato')
      expect(r.fuentesAusentes).toEqual(['imerg', 'prefectura'])
    })
  })

  describe('caudal GloFAS', () => {
    it.each([
      ['p90', 'vigilancia'],
      ['p95', 'alerta'],
      ['p99', 'severo'],
    ] as const)('percentil %s da %s en pronóstico', (percentil, nivel) => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'pronostico', departamentos: ['d1'], caudal: [caudal({ percentil })] })), 'd1')
      expect(r.nivel).toBe(nivel)
      expect(r.traza[0]).toMatchObject({ ref: 'caudal.p1.pico_m3s', valor: 100, nivel })
    })

    it('ignora puntos sin departamento', () => {
      const r = provincia(evaluarDia(entrada({ tipoDia: 'pronostico', departamentos: ['d1'], caudal: [caudal({ departamento: null, percentil: 'p99' })] })))
      expect(r.nivel).toBe('sin_dato')
      expect(r.traza).toEqual([])
    })
  })

  describe('ensamble', () => {
    it.each([
      [{ probP95Max: 0.3, probP99Max: 0 }, 'vigilancia'],
      [{ probP95Max: 0.5, probP99Max: 0 }, 'alerta'],
      [{ probP95Max: 0.1, probP99Max: 0.2 }, 'alerta'],
      [{ probP95Max: 0.1, probP99Max: 0.5 }, 'severo'],
      [{ probP95Max: 0.29, probP99Max: 0.19 }, 'sin_senal'],
    ] as const)('probabilidades %o dan %s en hoy', (probs, nivel) => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'hoy', departamentos: ['d1'], ensamble: [ensamble(probs)] })), 'd1')
      expect(r.nivel).toBe(nivel)
    })

    it('en pronóstico futuro se limita a alerta', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'pronostico', departamentos: ['d1'], ensamble: [ensamble({ probP95Max: 0.9, probP99Max: 0.9 })] })), 'd1')
      expect(r.nivel).toBe('alerta')
      expect(r.traza[0].nivel).toBe('alerta')
    })

    it('en hoy no se limita a alerta', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'hoy', departamentos: ['d1'], ensamble: [ensamble({ probP95Max: 0.9, probP99Max: 0.9 })] })), 'd1')
      expect(r.nivel).toBe('severo')
    })
  })

  describe('avisos SMN', () => {
    it.each([
      ['amarillo', 'vigilancia'],
      ['naranja', 'alerta'],
      ['rojo', 'severo'],
    ] as const)('aviso %s da %s en pronóstico', (aviso, nivel) => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'pronostico', departamentos: ['d1'], smn: [smn(aviso)] })), 'd1')
      expect(r.nivel).toBe(nivel)
      expect(r.traza[0]).toMatchObject({ regla: 'smn.aviso', ref: `smn.aviso-${aviso}.nivel` })
    })

    it('aviso SMN rojo sigue siendo severo en pronóstico (no se limita)', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'pronostico', departamentos: ['d1'], smn: [smn('rojo')] })), 'd1')
      expect(r.nivel).toBe('severo')
    })
  })

  describe('filtrado por tipo de día', () => {
    it('observado ignora caudal, ensamble y SMN', () => {
      const r = ambito(
        evaluarDia(
          entrada({
            tipoDia: 'observado',
            departamentos: ['d1'],
            caudal: [caudal({ percentil: 'p99' })],
            ensamble: [ensamble({ probP99Max: 0.9 })],
            smn: [smn('rojo')],
          }),
        ),
        'd1',
      )
      expect(r.nivel).toBe('sin_dato')
      expect(r.traza).toEqual([])
    })

    it('pronóstico ignora lluvia observada y ríos', () => {
      const r = ambito(
        evaluarDia(
          entrada({
            tipoDia: 'pronostico',
            departamentos: ['d1'],
            lluvia72: [lluvia('d1', 300)],
            rios: [rio({ estadoMax: 'evacuacion' })],
          }),
        ),
        'd1',
      )
      expect(r.nivel).toBe('sin_dato')
      expect(r.traza).toEqual([])
      expect(r.fuentesAusentes).toEqual(['glofas', 'ensamble'])
    })

    it('hoy combina observado y pronóstico', () => {
      const r = ambito(
        evaluarDia(
          entrada({
            tipoDia: 'hoy',
            departamentos: ['d1'],
            lluvia72: [lluvia('d1', 130)],
            smn: [smn('amarillo')],
          }),
        ),
        'd1',
      )
      expect(r.nivel).toBe('alerta')
      expect(r.traza.map((t) => t.regla)).toEqual(['lluvia.obs_72h', 'smn.aviso'])
    })
  })

  describe('sin_dato frente a sin_senal', () => {
    it('observado sin fuentes con datos es sin_dato', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'observado', departamentos: ['d1'] })), 'd1')
      expect(r.nivel).toBe('sin_dato')
      expect(r.fuentesAusentes).toEqual(['imerg', 'prefectura'])
    })

    it('pronóstico sin fuentes y con SMN no disponible es sin_dato', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'pronostico', departamentos: ['d1'], smnDisponible: false })), 'd1')
      expect(r.nivel).toBe('sin_dato')
      expect(r.fuentesAusentes).toEqual(['glofas', 'ensamble', 'smn'])
    })

    it('hoy sin datos de lluvia, río ni pronóstico es sin_dato aunque SMN esté disponible', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'hoy', departamentos: ['d1'] })), 'd1')
      expect(r.nivel).toBe('sin_dato')
      expect(r.fuentesAusentes).toEqual(['imerg', 'prefectura', 'glofas', 'ensamble'])
    })

    it('con datos y sin disparos es sin_senal', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'pronostico', departamentos: ['d1'], caudal: [caudal()] })), 'd1')
      expect(r.nivel).toBe('sin_senal')
      expect(r.fuentesAusentes).toEqual(['ensamble'])
    })

    it('SMN sin avisos no aparece como ausente pero no alcanza para sin_senal', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'pronostico', departamentos: ['d1'] })), 'd1')
      expect(r.nivel).toBe('sin_dato')
      expect(r.fuentesAusentes).toEqual(['glofas', 'ensamble'])
    })

    it('smnDisponible false lista smn como ausente', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'pronostico', departamentos: ['d1'], caudal: [caudal()], smnDisponible: false })), 'd1')
      expect(r.fuentesAusentes).toEqual(['ensamble', 'smn'])
    })
  })

  describe('conSenal', () => {
    it('es verdadero con nivel vigilancia o superior', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'observado', departamentos: ['d1'], lluvia72: [lluvia('d1', 90)] })), 'd1')
      expect(r.conSenal).toBe(true)
    })

    it('es falso con sin_senal aunque haya datos', () => {
      const r = ambito(evaluarDia(entrada({ tipoDia: 'observado', departamentos: ['d1'], lluvia72: [lluvia('d1', 10)] })), 'd1')
      expect(r.nivel).toBe('sin_senal')
      expect(r.conSenal).toBe(false)
    })
  })

  describe('agregación provincial', () => {
    it('el nivel provincial es el máximo departamental', () => {
      const resultados = evaluarDia(
        entrada({
          tipoDia: 'observado',
          departamentos: ['d1', 'd2'],
          lluvia72: [lluvia('d1', 90), lluvia('d2', 130)],
        }),
      )
      expect(ambito(resultados, 'd1').nivel).toBe('vigilancia')
      expect(ambito(resultados, 'd2').nivel).toBe('alerta')
      expect(provincia(resultados).nivel).toBe('alerta')
      expect(provincia(resultados).conSenal).toBe(true)
    })

    it('provincia es sin_dato solo si todos los departamentos lo son', () => {
      const resultados = evaluarDia(entrada({ tipoDia: 'observado', departamentos: ['d1', 'd2'], lluvia72: [lluvia('d2', 10)] }))
      expect(provincia(resultados).nivel).toBe('sin_senal')
    })

    it('estación sin departamento aparece en la traza provincial pero no eleva el nivel', () => {
      const resultados = evaluarDia(
        entrada({
          tipoDia: 'observado',
          departamentos: ['d1'],
          lluvia72: [lluvia('d1', 10)],
          rios: [rio({ departamento: null, estadoMax: 'alerta', tendenciaM24h: 0 })],
        }),
      )
      const prov = provincia(resultados)
      expect(prov.nivel).toBe('sin_senal')
      expect(prov.traza.map((t) => t.ref)).toEqual(['rio.est-1.estado_max'])
      expect(prov.conSenal).toBe(true)
      expect(ambito(resultados, 'd1').conSenal).toBe(false)
    })

    it('provincia sin departamentos es sin_dato', () => {
      const resultados = evaluarDia(entrada({ tipoDia: 'pronostico', departamentos: [] }))
      expect(resultados).toHaveLength(1)
      expect(provincia(resultados).nivel).toBe('sin_dato')
    })

    it('provincia lista fuentes ausentes solo si ningún departamento las tiene', () => {
      const resultados = evaluarDia(
        entrada({
          tipoDia: 'pronostico',
          departamentos: ['d1', 'd2'],
          caudal: [caudal({ departamento: 'd2' })],
        }),
      )
      expect(provincia(resultados).fuentesAusentes).toEqual(['ensamble'])
    })
  })
})
