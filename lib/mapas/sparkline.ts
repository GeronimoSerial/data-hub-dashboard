// Pure geometry for the river level sparkline: an inline SVG path plus horizontal
// threshold lines, with no charting library.

export type PuntoSerie = { medidaEn: string; lecturaM: number | null }
export type TrazoSparkline = {
  path: string
  ultimo: { x: number; y: number }
  lineas: Array<{ valor: number; y: number }>
}

export function trazoSparkline(
  serie: readonly PuntoSerie[],
  { ancho, alto, margen = 2, umbrales = [] }: { ancho: number; alto: number; margen?: number; umbrales?: ReadonlyArray<number | null> },
): TrazoSparkline | null {
  const puntos = serie
    .filter((p): p is { medidaEn: string; lecturaM: number } => p.lecturaM !== null && !Number.isNaN(Date.parse(p.medidaEn)))
    .map((p) => ({ t: Date.parse(p.medidaEn), v: p.lecturaM }))
    .sort((a, b) => a.t - b.t)
  if (puntos.length < 2) return null

  const limites = umbrales.filter((u): u is number => u !== null)
  const valores = [...puntos.map((p) => p.v), ...limites]
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const t0 = puntos[0].t
  const t1 = puntos[puntos.length - 1].t
  const x = (t: number) => redondear(margen + (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * (ancho - 2 * margen)))
  const y = (v: number) => redondear(max === min ? alto / 2 : margen + ((max - v) / (max - min)) * (alto - 2 * margen))

  const coords = puntos.map((p) => ({ x: x(p.t), y: y(p.v) }))
  return {
    path: coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' '),
    ultimo: coords[coords.length - 1],
    lineas: limites.map((valor) => ({ valor, y: y(valor) })),
  }
}

function redondear(n: number): number {
  return Math.round(n * 10) / 10
}
