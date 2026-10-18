import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { calcularAltimetriaEscolar, type EntradaAltimetria } from './altimetria'
import { evaluarFilaCsvAltimetria, parsearCsvAltimetria } from './altimetria-csv'

const COMPATIBLE = 'SRVN16_con_conversion_aproximada_de_Copernicus'

function entrada(parcial: Partial<EntradaAltimetria> = {}): EntradaAltimetria {
  return {
    ignP10M: 72,
    copernicusP10M: 69.1,
    tieneCoordenadas: true,
    georreferenciaObservada: false,
    referenciaVertical: COMPATIBLE,
    operador: 'p10_espacial_50m',
    ...parcial,
  }
}

describe('calcularAltimetriaEscolar', () => {
  it('con dos fuentes válidas toma el mínimo y conserva Copernicus como principal', () => {
    const r = calcularAltimetriaEscolar(entrada())
    expect(r).toMatchObject({
      estado: 'candidata',
      cotaPrincipalM: 69.1,
      cotaConservadoraM: 69.1,
      fuenteConservadora: 'copernicus',
      fuentesValidas: 2,
      referenciaVertical: COMPATIBLE,
      operador: 'p10_espacial_50m',
    })
    const ign = calcularAltimetriaEscolar(entrada({ ignP10M: 60 }))
    expect(ign).toMatchObject({ cotaPrincipalM: 69.1, cotaConservadoraM: 60, fuenteConservadora: 'ign' })
  })

  it('valores iguales se informan como coincidentes', () => {
    expect(calcularAltimetriaEscolar(entrada({ ignP10M: 50, copernicusP10M: 50 }))).toMatchObject({
      cotaConservadoraM: 50,
      fuenteConservadora: 'coincidentes',
    })
  })

  it('con una sola fuente admisible usa ese valor; sin Copernicus la principal es null con motivo', () => {
    const soloIgn = calcularAltimetriaEscolar(entrada({ copernicusP10M: null }))
    expect(soloIgn).toMatchObject({
      estado: 'candidata',
      cotaPrincipalM: null,
      cotaConservadoraM: 72,
      fuenteConservadora: 'ign',
      fuentesValidas: 1,
      motivos: ['principal_sin_copernicus'],
    })
    const soloCop = calcularAltimetriaEscolar(entrada({ ignP10M: Number.NaN }))
    expect(soloCop).toMatchObject({ cotaPrincipalM: 69.1, cotaConservadoraM: 69.1, fuentesValidas: 1, motivos: [] })
  })

  it('excluye null, NaN e infinitos, pero conserva un cero válido', () => {
    for (const invalido of [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const r = calcularAltimetriaEscolar(entrada({ ignP10M: invalido }))
      expect(r).toMatchObject({ estado: 'candidata', fuentesValidas: 1, cotaConservadoraM: 69.1 })
    }
    expect(calcularAltimetriaEscolar(entrada({ ignP10M: 0 }))).toMatchObject({
      cotaConservadoraM: 0,
      fuenteConservadora: 'ign',
      fuentesValidas: 2,
    })
    expect(calcularAltimetriaEscolar(entrada({ ignP10M: null, copernicusP10M: Number.NaN }))).toEqual({
      estado: 'pendiente',
      motivo: 'sin_fuente_valida',
    })
  })

  it('sin coordenadas o con georreferencia observada queda pendiente aunque haya valores', () => {
    expect(calcularAltimetriaEscolar(entrada({ tieneCoordenadas: false }))).toEqual({
      estado: 'pendiente',
      motivo: 'sin_coordenadas',
    })
    expect(calcularAltimetriaEscolar(entrada({ georreferenciaObservada: true }))).toEqual({
      estado: 'pendiente',
      motivo: 'revisar_georreferencia',
    })
  })

  it('una referencia vertical incompatible excluye las fuentes en lugar de aceptarlas por ser menores', () => {
    expect(calcularAltimetriaEscolar(entrada({ referenciaVertical: 'EGM2008' }))).toEqual({
      estado: 'pendiente',
      motivo: 'sin_fuente_valida',
      exclusiones: ['referencia_vertical_incompatible'],
    })
  })

  it('la cota conservadora nunca supera ninguna entrada admisible', () => {
    const pares: [number | null, number | null][] = [
      [10, 20], [20, 10], [-3, 4], [0, -0.5], [100, null], [null, 7.25],
    ]
    for (const [ign, cop] of pares) {
      const r = calcularAltimetriaEscolar(entrada({ ignP10M: ign, copernicusP10M: cop }))
      if (r.estado !== 'candidata') throw new Error('se esperaba candidata')
      for (const v of [ign, cop]) if (v !== null) expect(r.cotaConservadoraM).toBeLessThanOrEqual(v)
    }
  })

  it('no expone cota de ingreso al edificio: el terreno no la deriva', () => {
    expect(calcularAltimetriaEscolar(entrada())).not.toHaveProperty('cotaIngresoEdificioM')
  })
})

// Arnés local: corre la regla sobre el CSV real (carpeta local, ignorada por git).
const CSV_REAL = path.join(process.cwd(), 'Motor v0.4', 'datos', 'elevacion-conservadora-candidata.csv')

describe('arnés local sobre el CSV real', () => {
  it.skipIf(!existsSync(CSV_REAL))('reproduce 1.994 candidatas, 7 revisar, 4 sin coordenadas', () => {
    const filas = parsearCsvAltimetria(readFileSync(CSV_REAL, 'utf8'))
    const conteo: Record<string, number> = {}
    const discrepancias: string[] = []
    for (const fila of filas) {
      const evaluada = evaluarFilaCsvAltimetria(fila)
      if (!evaluada.coincide) discrepancias.push(fila.cueAnexo)
      const r = evaluada.resultado
      const clave = r.estado === 'candidata' ? `fuente:${r.fuenteConservadora}` : `pendiente:${r.motivo}`
      conteo[clave] = (conteo[clave] ?? 0) + 1
    }
    expect(discrepancias).toEqual([])
    expect(filas).toHaveLength(2005)
    expect(conteo).toEqual({
      'fuente:copernicus': 1918,
      'fuente:ign': 76,
      'pendiente:revisar_georreferencia': 7,
      'pendiente:sin_coordenadas': 4,
    })
  })
})
