// Comparación pura v0.3 ↔ v0.4 de un mismo bloque (insumo de T9): conteo por
// nivel y horizonte, transiciones y causa de cada cambio de nivel. La causa se
// lee del factor `rio-v04` (su explicación declara el piso aplicado, ver
// motor/calculo.ts, explicacionRioV04).
type Nivel = 'bajo' | 'moderado' | 'alto' | 'muy_alto'

export interface SnapshotComparable {
  cueAnexo: string
  horizonteHoras: number
  nivelRiesgo: Nivel | null
  factores: { fuente: string; explicacion: string | null }[]
}

export type CausaCambio = 'piso_probabilistico' | 'piso_observado' | 'componente_probabilistico' | 'sin_factor_v04'
type Conteo = Record<Nivel | 'sin_nivel', number>

export interface ComparacionV03V04 {
  porHorizonte: {
    horizonteHoras: number
    conteoV03: Conteo
    conteoV04: Conteo
    transiciones: { sube: number; baja: number; igual: number }
  }[]
  cambios: { cueAnexo: string; horizonteHoras: number; desde: Nivel | null; hasta: Nivel | null; causa: CausaCambio }[]
}

const ORDEN: Record<Nivel, number> = { bajo: 0, moderado: 1, alto: 2, muy_alto: 3 }
const conteoVacio = (): Conteo => ({ bajo: 0, moderado: 0, alto: 0, muy_alto: 0, sin_nivel: 0 })

function causaDe(s: SnapshotComparable): CausaCambio {
  const f = s.factores.find((x) => x.fuente === 'rio-v04')
  if (f === undefined) return 'sin_factor_v04'
  const piso = /piso (\w+)/.exec(f.explicacion ?? '')?.[1] ?? 'ninguno'
  if (piso.startsWith('probabilistico')) return 'piso_probabilistico'
  if (piso.startsWith('observado')) return 'piso_observado'
  return 'componente_probabilistico'
}

export function compararNivelesV03V04(
  v03: readonly SnapshotComparable[],
  v04: readonly SnapshotComparable[],
): ComparacionV03V04 {
  const clave = (s: SnapshotComparable) => `${s.cueAnexo}|${s.horizonteHoras}`
  const previos = new Map(v03.map((s) => [clave(s), s]))
  const horizontes = [...new Set([...v03, ...v04].map((s) => s.horizonteHoras))].sort((a, b) => a - b)
  const porHorizonte: ComparacionV03V04['porHorizonte'] = horizontes.map((horizonteHoras) => {
    const conteoV03 = conteoVacio()
    const conteoV04 = conteoVacio()
    for (const s of v03) if (s.horizonteHoras === horizonteHoras) conteoV03[s.nivelRiesgo ?? 'sin_nivel'] += 1
    for (const s of v04) if (s.horizonteHoras === horizonteHoras) conteoV04[s.nivelRiesgo ?? 'sin_nivel'] += 1
    return { horizonteHoras, conteoV03, conteoV04, transiciones: { sube: 0, baja: 0, igual: 0 } }
  })
  const cambios: ComparacionV03V04['cambios'] = []
  for (const nuevo of v04) {
    const viejo = previos.get(clave(nuevo))
    // Sin nivel en alguno de los dos (p. ej. escuela sin coordenadas, que v0.3
    // no evalúa) no es una transición: se ve sólo en los conteos.
    if (viejo === undefined || viejo.nivelRiesgo === null || nuevo.nivelRiesgo === null) continue
    const t = porHorizonte.find((h) => h.horizonteHoras === nuevo.horizonteHoras)!.transiciones
    const delta = ORDEN[nuevo.nivelRiesgo] - ORDEN[viejo.nivelRiesgo]
    if (delta === 0) {
      t.igual += 1
      continue
    }
    if (delta > 0) t.sube += 1
    else t.baja += 1
    cambios.push({
      cueAnexo: nuevo.cueAnexo,
      horizonteHoras: nuevo.horizonteHoras,
      desde: viejo.nivelRiesgo,
      hasta: nuevo.nivelRiesgo,
      causa: causaDe(nuevo),
    })
  }
  return { porHorizonte, cambios }
}
