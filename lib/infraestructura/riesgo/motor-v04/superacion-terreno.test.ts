import { describe, expect, it } from 'vitest'
import { crearSerieDiaria, fechaDeIndice, indiceDia, type FilaDiaria } from './hidrologia/analogos'
import { ensambleConjuntoV2 } from './hidrologia/analogos-v2'
import type { ResultadoAltimetria } from './altimetria'
import {
  METODO_SUPERACION_TERRENO,
  estimarSuperacionTerreno,
  fechaLocal,
  fusionarLecturaActual,
  probabilidadesSobreCotas,
  trayectoriasSitio,
} from './superacion-terreno'
import { ubicarEscuelaEnRio, type EstacionTransferencia } from './transferencia-nivel'

const CORRIENTES: EstacionTransferencia = { estacionId: 'pna-corrientes', rio: 'parana', ceroM: 42.39, kmRio: 1208, coordenadas: { lat: -27.46, lon: -58.84 } }
const EMPEDRADO: EstacionTransferencia = { estacionId: 'pna-empedrado', rio: 'parana', ceroM: 39.68, kmRio: 1140, coordenadas: { lat: -27.958948, lon: -58.820198 } }
const ASOF = '2026-10-15'

// Serie sintética determinística: ciclo anual + oscilación de 9 días.
function serie(desde: string, hasta: string, desplazamientoM: number): FilaDiaria[] {
  const filas: FilaDiaria[] = []
  for (let i = indiceDia(desde); i <= indiceDia(hasta); i++) {
    filas.push({ fecha: fechaDeIndice(i), valorM: 4 + desplazamientoM + 2 * Math.sin((2 * Math.PI * i) / 365) + 0.8 * Math.sin((2 * Math.PI * i) / 9) })
  }
  return filas
}
const FILAS_C = serie('2023-01-01', ASOF, 0)
const FILAS_E = serie('2023-01-01', ASOF, -0.5)

const ubicacion = ubicarEscuelaEnRio({
  punto: { lat: -27.46 + 0.4 * (-27.958948 + 27.46), lon: -58.84 + 0.4 * (-58.820198 + 58.84) },
  estacionTramoId: 'pna-corrientes',
  estaciones: [CORRIENTES, EMPEDRADO],
})

const altimetria = (principal: number | null, conservadora: number): ResultadoAltimetria => ({
  estado: 'candidata',
  cotaPrincipalM: principal,
  cotaConservadoraM: conservadora,
  fuenteConservadora: 'ign',
  fuentesValidas: 2,
  referenciaVertical: 'SRVN16_con_conversion_aproximada_de_Copernicus',
  operador: 'p10_espacial_50m',
  motivos: principal === null ? ['principal_sin_copernicus'] : [],
})

const ensamble = (filasC = FILAS_C, filasE = FILAS_E) =>
  ensambleConjuntoV2(crearSerieDiaria(filasC), { 'pna-empedrado': crearSerieDiaria(filasE) }, ASOF)

describe('estimarSuperacionTerreno', () => {
  it('modela P principal y conservadora con método, versión y diagnóstico de supuestos', () => {
    const r = estimarSuperacionTerreno({ ubicacion, ensamble: ensamble(), altimetria: altimetria(47, 46) })
    const e = r[240].principal
    expect(e).toMatchObject({ estado: 'modelada', metodo: METODO_SUPERACION_TERRENO, ventanaHoras: 240 })
    expect(e.probabilidad).not.toBeNull()
    expect(e.diagnostico).toMatchObject({
      datumCeroSupuesto: true,
      conexionHidraulicaSupuesta: true,
      defensasNoModeladas: true,
      estacionReferencia: 'pna-corrientes',
      estacionCompanera: 'pna-empedrado',
      cotaM: 47,
    })
    expect(e.diagnostico?.kmRio).toBeCloseTo(1180.8, 1)
    expect(typeof e.diagnostico?.fueraDeRangoHistorico).toBe('boolean')
  })

  it('una cota menor nunca baja la probabilidad y las ventanas anidadas son monótonas', () => {
    let intermedias = 0
    for (const cota of [44, 45, 45.5, 46, 46.5, 47, 48, 50]) {
      const r = estimarSuperacionTerreno({ ubicacion, ensamble: ensamble(), altimetria: altimetria(cota, cota - 0.7) })
      for (const h of [24, 72, 240] as const) {
        expect(r[h].conservador.probabilidad!).toBeGreaterThanOrEqual(r[h].principal.probabilidad!)
        const p = r[h].principal.probabilidad!
        if (p > 0 && p < 1) intermedias++
      }
      expect(r[24].principal.probabilidad!).toBeLessThanOrEqual(r[72].principal.probabilidad!)
      expect(r[72].principal.probabilidad!).toBeLessThanOrEqual(r[240].principal.probabilidad!)
    }
    expect(intermedias).toBeGreaterThan(0)
  })

  it('usa las mismas fechas análogas en ambos hidrómetros', () => {
    const e = ensamble()
    if (ubicacion.estado !== 'ubicada') throw new Error('se esperaba ubicada')
    const t = trayectoriasSitio(ubicacion, e)
    if (!('niveles' in t) || e.referencia.estado !== 'estimado') throw new Error('se esperaba estimado')
    const companera = e.estaciones['pna-empedrado']
    if (companera?.estado !== 'estimado') throw new Error('compañera sin estimar')
    expect(t.fechas).toEqual(companera.fechasAnalogas)
    expect(t.fechas.every((f) => e.referencia.estado === 'estimado' && e.referencia.fechasAnalogas.includes(f))).toBe(true)
  })

  it('no usa datos posteriores a asOf', () => {
    const base = estimarSuperacionTerreno({ ubicacion, ensamble: ensamble(), altimetria: altimetria(46, 45.5) })
    const conFuturo = estimarSuperacionTerreno({
      ubicacion,
      ensamble: ensamble([...FILAS_C, ...serie('2026-10-16', '2026-12-31', 30)], [...FILAS_E, ...serie('2026-10-16', '2026-12-31', 30)]),
      altimetria: altimetria(46, 45.5),
    })
    expect(conFuturo).toEqual(base)
  })

  it('nivel vencido (> 2 días) es no_estimable con motivo', () => {
    const vencida = FILAS_C.filter((f) => f.fecha <= '2026-10-12')
    const r = estimarSuperacionTerreno({ ubicacion, ensamble: ensamble(vencida), altimetria: altimetria(46, 45) })
    expect(r[72].principal).toMatchObject({ estado: 'no_estimable', probabilidad: null })
    expect(r[72].principal.motivos).toContain('nivel_actual_no_disponible')
  })

  it('sin altimetría o con altimetría pendiente: motivo de altimetría; sin principal Copernicus sólo cae la principal', () => {
    const sin = estimarSuperacionTerreno({ ubicacion, ensamble: ensamble(), altimetria: null })
    expect(sin[24].principal.motivos).toEqual(['cota_terreno_pendiente'])
    expect(sin[24].conservador.motivos).toEqual(['cota_conservadora_pendiente'])
    const pendiente = estimarSuperacionTerreno({ ubicacion, ensamble: ensamble(), altimetria: { estado: 'pendiente', motivo: 'revisar_georreferencia' } })
    expect(pendiente[24].conservador.motivos).toEqual(['revisar_georreferencia'])
    const soloIgn = estimarSuperacionTerreno({ ubicacion, ensamble: ensamble(), altimetria: altimetria(null, 45) })
    expect(soloIgn[24].principal.motivos).toEqual(['principal_sin_copernicus'])
    expect(soloIgn[24].conservador.estado).toBe('modelada')
  })

  it('una ubicación no estimable propaga su motivo a ambos escenarios', () => {
    const r = estimarSuperacionTerreno({ ubicacion: { estado: 'no_estimable', motivo: 'sin_cero_escala' }, ensamble: null, altimetria: altimetria(46, 45) })
    expect(r[240].principal).toMatchObject({ estado: 'no_estimable', motivos: ['sin_cero_escala'] })
    expect(r[240].conservador.motivos).toEqual(['sin_cero_escala'])
  })
})

describe('probabilidadesSobreCotas', () => {
  it('coincide con la P exacta del ensamble para la misma cota y una cota menor nunca baja P', () => {
    const ps = probabilidadesSobreCotas({ ubicacion, ensamble: ensamble(), cotasM: [45, 43] })!
    const exacta = estimarSuperacionTerreno({ ubicacion, ensamble: ensamble(), altimetria: altimetria(45, 45) })
    for (const h of [24, 72, 240] as const) {
      expect(ps[h][0]).toBe(exacta[h].conservador.probabilidad)
      expect(ps[h][1]).toBeGreaterThanOrEqual(ps[h][0])
    }
    expect(probabilidadesSobreCotas({ ubicacion, ensamble: null, cotasM: [45] })).toBeNull()
  })
})

describe('nivel actual', () => {
  it('la lectura de Prefectura ≤ asOf completa los días posteriores al último diario A5', () => {
    const filas = [{ fecha: '2026-10-12', valorM: 4 }]
    expect(fusionarLecturaActual(filas, { fecha: '2026-10-14', valorM: 4.3 }, '2026-10-15')).toEqual([...filas, { fecha: '2026-10-14', valorM: 4.3 }])
    // Mismo día: gana el diario A5; lectura futura: se ignora.
    expect(fusionarLecturaActual(filas, { fecha: '2026-10-12', valorM: 9 }, '2026-10-15')).toEqual(filas)
    expect(fusionarLecturaActual(filas, { fecha: '2026-10-16', valorM: 9 }, '2026-10-15')).toEqual(filas)
    expect(fusionarLecturaActual(filas, null, '2026-10-15')).toEqual(filas)
  })

  it('fecha local con huso fijo UTC-3', () => {
    expect(fechaLocal('2026-10-16T02:00:00.000Z')).toBe('2026-10-15')
    expect(fechaLocal('2026-10-16T03:00:00.000Z')).toBe('2026-10-16')
  })
})
