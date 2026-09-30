export function interpolarBilineal(
  grid: { filas: number; columnas: number },
  values: Array<number | null>,
  fila: number,
  columna: number,
): number | null {
  const filaBase = Math.floor(fila)
  const columnaBase = Math.floor(columna)
  const filaSiguiente = Math.min(grid.filas - 1, filaBase + 1)
  const columnaSiguiente = Math.min(grid.columnas - 1, columnaBase + 1)
  const vertical = fila - filaBase
  const horizontal = columna - columnaBase
  const neighbors = [
    [filaBase, columnaBase, (1 - vertical) * (1 - horizontal)],
    [filaBase, columnaSiguiente, (1 - vertical) * horizontal],
    [filaSiguiente, columnaBase, vertical * (1 - horizontal)],
    [filaSiguiente, columnaSiguiente, vertical * horizontal],
  ] as const
  let weightedSum = 0
  let totalWeight = 0
  for (const [row, col, weight] of neighbors) {
    const value = values[row * grid.columnas + col]
    if (value === null || value === undefined || !Number.isFinite(value)) continue
    weightedSum += value * weight
    totalWeight += weight
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null
}
