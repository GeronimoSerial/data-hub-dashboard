// Referencia estable del nivel por estación (reglas v0.4, T10c). Módulo puro,
// sin DB ni reloj. Ver docs/motor-v0.4/validacion-historica.md.
//
// 1. Mediana de largo plazo: la anomalía v0.4 deja de medirse contra la
//    mediana de 365 días (hidro_referencia), que para la misma altura movía el
//    agua posible ~3 m según el año previo (Paso de los Libres 1,97 m en 2023
//    vs 4,79 m en 2024). Se usa la mediana de la serie diaria INA A5 en una
//    ventana FIJA (normal climatológica 1991–2020), sólo con años completos.
// 2. Cero efectivo calibrado: donde hay ajuste del borde de agua observado por
//    Sentinel-2 sobre el DEM Copernicus GLO-30, la cota del agua en el sitio es
//    a + b·h (h = altura en la escala de la estación del tramo).
import {
  ANIOS_COMPLETOS_REFERENCIA_V04,
  DIAS_ANIO_COMPLETO_V04,
  SALTO_MAX_DIARIO_M,
  VENTANA_REFERENCIA_LARGA_V04,
} from './config'

export type FilaNivelDiario = { fecha: string; valorM: number }

export type ReferenciaNivelEstacion = {
  /** Mediana 1991–2020 (años completos); null = menos de 10 años completos. */
  medianaLargoPlazoM: number | null
  aniosCompletos: number
  /** Máximo de la serie ≤ asOf (récord histórico de la escala). */
  record: { valorM: number; fecha: string } | null
}

const redondear2 = (x: number) => Math.round(x * 100) / 100

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 === 1 ? v[m] : (v[m - 1] + v[m]) / 2
}

export function referenciaNivelEstacion(filas: readonly FilaNivelDiario[], asOfFecha: string): ReferenciaNivelEstacion {
  const { desde, hasta } = VENTANA_REFERENCIA_LARGA_V04
  const porAnio = new Map<string, number[]>()
  let record: ReferenciaNivelEstacion['record'] = null
  const validas = [...filas].filter((f) => f.fecha <= asOfFecha && Number.isFinite(f.valorM)).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
  validas.forEach((f, i) => {
    // Récord sin picos espurios: un día que supera a ambos vecinos por más del
    // salto máximo diario se descarta (Santo Tomé trae 1e12 m en 2017).
    const previo = validas[i - 1]?.valorM ?? f.valorM
    const siguiente = validas[i + 1]?.valorM ?? f.valorM
    const espurio = f.valorM - previo > SALTO_MAX_DIARIO_M && f.valorM - siguiente > SALTO_MAX_DIARIO_M
    if (!espurio && (record === null || f.valorM > record.valorM)) record = { valorM: f.valorM, fecha: f.fecha }
  })
  for (const f of validas) {
    if (f.fecha < desde || f.fecha > hasta) continue
    const anio = f.fecha.slice(0, 4)
    const lista = porAnio.get(anio) ?? []
    lista.push(f.valorM)
    porAnio.set(anio, lista)
  }
  const completos = [...porAnio.values()].filter((v) => v.length >= DIAS_ANIO_COMPLETO_V04)
  const medianaLargoPlazoM =
    completos.length >= ANIOS_COMPLETOS_REFERENCIA_V04 ? redondear2(mediana(completos.flat())) : null
  return { medianaLargoPlazoM, aniosCompletos: completos.length, record }
}

export type CeroEfectivo = {
  estacionId: string
  /** cota_agua(sitio) = aM + bM·h (m IGN aprox., DEM Copernicus GLO-30). */
  aM: number
  bM: number
  n: number
  r2: number | null
  fechas: readonly string[]
  metodo: string
}

// Ajuste: percentil 75 de la elevación GLO-30 sobre el borde del agua
// clasificada en escenas Sentinel-2 L2A (nubes < 20 %) en la zona urbana del
// tramo, contra la altura diaria A5 de la escala del mismo día. Para agregar
// una estación: ≥ 3 fechas con h distinto, regresión lineal, documentar aquí.
export const CEROS_EFECTIVOS_V04: Readonly<Record<string, CeroEfectivo>> = {
  'pna-paso-de-los-libres': {
    estacionId: 'pna-paso-de-los-libres',
    aM: 39.19,
    bM: 0.837,
    n: 5,
    r2: 0.953,
    fechas: ['2019-01-24', '2023-11-04', '2023-11-19', '2023-11-29', '2024-05-17'],
    metodo: 'regresion borde S2 p75 vs h A5 (h 8,69–11,28 m)',
  },
  // Sólo 2 fechas con h muy parecido (8,35 y 8,88 m): pendiente física fija 1
  // (la escala está en el embalse de Salto Grande) y a = media(p75 − h).
  'pna-monte-caseros': {
    estacionId: 'pna-monte-caseros',
    aM: 31.26,
    bM: 1,
    n: 2,
    r2: null,
    fechas: ['2023-11-29', '2024-05-17'],
    metodo: 'pendiente fija 1, a = media(borde S2 p75 − h A5)',
  },
}

export function cotaAguaCeroEfectivo(cero: CeroEfectivo, hM: number): number {
  return redondear2(cero.aM + cero.bM * hM)
}

/** Altura en la escala a la que el agua posible + margen llega a la cota. */
export function alturaCriticaCeroEfectivo(cero: CeroEfectivo, cotaM: number, margenM: number, bandaM: number) {
  return {
    alturaCriticaM: redondear2((cotaM - margenM - cero.aM) / cero.bM),
    alturaCriticaBandaM: redondear2((cotaM - margenM - bandaM - cero.aM) / cero.bM),
  }
}
