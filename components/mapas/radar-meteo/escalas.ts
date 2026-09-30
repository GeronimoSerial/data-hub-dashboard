export type Rgba = readonly [number, number, number, number]

type RGB = readonly [number, number, number]
type ColorStop = readonly [value: number, color: RGB]

const lluvia: ColorStop[] = [
  [0.1, [150, 240, 100]],
  [0.5, [50, 210, 75]],
  [1, [0, 140, 55]],
  [2, [245, 230, 40]],
  [5, [255, 145, 20]],
  [10, [235, 40, 35]],
  [20, [155, 0, 20]],
  [40, [225, 20, 190]],
  [80, [205, 190, 255]],
]

const probabilidad: ColorStop[] = [
  [10, [38, 190, 180]],
  [30, [30, 140, 230]],
  [55, [85, 90, 225]],
  [80, [180, 55, 210]],
  [100, [255, 55, 155]],
]

const viento: ColorStop[] = [
  [0, [80, 155, 180]],
  [20, [100, 195, 190]],
  [40, [245, 190, 85]],
  [80, [245, 105, 95]],
]

function colorDesdeRampa(value: number, stops: ColorStop[], threshold: number): Rgba {
  if (!Number.isFinite(value) || value < threshold) {
    return [0, 0, 0, 0]
  }

  let index = 0
  while (index < stops.length - 1 && value > stops[index + 1][0]) {
    index += 1
  }

  const [lowerValue, lowerColor] = stops[index]
  const [upperValue, upperColor] = stops[Math.min(index + 1, stops.length - 1)]
  const span = upperValue - lowerValue
  const amount = span === 0 ? 0 : Math.max(0, Math.min(1, (value - lowerValue) / span))
  const red = Math.round(lowerColor[0] + (upperColor[0] - lowerColor[0]) * amount)
  const green = Math.round(lowerColor[1] + (upperColor[1] - lowerColor[1]) * amount)
  const blue = Math.round(lowerColor[2] + (upperColor[2] - lowerColor[2]) * amount)
  const alpha = Math.round(190 + 55 * amount)

  return [red, green, blue, alpha]
}

export function colorLluvia(value: number | null): Rgba {
  return value === null ? [0, 0, 0, 0] : colorDesdeRampa(value, lluvia, 0.1)
}

export function colorProbabilidad(value: number | null): Rgba {
  return value === null ? [0, 0, 0, 0] : colorDesdeRampa(value, probabilidad, 10)
}

export function colorViento(value: number | null): Rgba {
  return value === null ? [0, 0, 0, 0] : colorDesdeRampa(value, viento, 0)
}

export function colorGranizo(value: number | null): string {
  if (value === null || value < 1) {
    return 'transparent'
  }

  const index = Math.min(3, Math.floor(value)) - 1
  return ['#facc15', '#fb923c', '#ec4899'][index]
}

export function rgbaComoCss([red, green, blue, alpha]: Rgba): string {
  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`
}

export function pixelAGrilla(
  x: number,
  y: number,
  width: number,
  height: number,
  filas: number,
  columnas: number,
) {
  return {
    fila: y / Math.max(1, height - 1) * (filas - 1),
    columna: x / Math.max(1, width - 1) * (columnas - 1),
  }
}

export function formatearAntiguedad(minutos: number | null | undefined): string {
  if (minutos === null || minutos === undefined) {
    return '—'
  }

  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  return horas ? `hace ${horas} h ${resto} min` : `hace ${resto} min`
}

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
    if (value === null || value === undefined || !Number.isFinite(value)) {
      continue
    }

    weightedSum += value * weight
    totalWeight += weight
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null
}

export function valoresEnGrilla(
  grid: { filas: number; columnas: number; celdas: Array<{ fila: number; columna: number }> },
  values: Array<number | null>,
): Array<number | null> {
  const lattice: Array<number | null> = Array(grid.filas * grid.columnas).fill(null)
  grid.celdas.forEach((cell, index) => {
    lattice[cell.fila * grid.columnas + cell.columna] = values[index] ?? null
  })
  return lattice
}

export function rellenarAnilloExterior(
  grid: { filas: number; columnas: number },
  values: Array<number | null>,
): Array<number | null> {
  const output = values.slice()
  const validCells = values.flatMap((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      return []
    }

    return [{
      fila: Math.floor(index / grid.columnas),
      columna: index % grid.columnas,
      value,
    }]
  })

  if (!validCells.length) {
    return output
  }

  for (let fila = 0; fila < grid.filas; fila += 1) {
    for (let columna = 0; columna < grid.columnas; columna += 1) {
      const index = fila * grid.columnas + columna
      const isOuterRing = fila === 0 || columna === 0 || fila === grid.filas - 1 || columna === grid.columnas - 1
      if (output[index] !== null || !isOuterRing) {
        continue
      }

      const nearest = validCells.reduce((best, cell) => {
        const bestDistance = Math.abs(best.fila - fila) + Math.abs(best.columna - columna)
        const cellDistance = Math.abs(cell.fila - fila) + Math.abs(cell.columna - columna)
        return cellDistance < bestDistance ? cell : best
      })
      output[index] = nearest.value
    }
  }

  return output
}

export function rotacionFlecha(direccion: number | null): number | null {
  return direccion === null ? null : (direccion + 180) % 360
}

export function letraViento(direccion: number | null): string {
  if (direccion === null) {
    return '—'
  }

  const index = Math.round((((direccion % 360) + 360) % 360) / 22.5) % 16
  return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'][index]
}

export function fechaRadar(value: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    ...options,
  }).format(new Date(value))
}

export function indiceCercano(times: string[], now = Date.now()): number {
  if (!times.length) {
    return 0
  }

  return times.reduce((bestIndex, value, index) => {
    const bestDistance = Math.abs(Date.parse(times[bestIndex]) - now)
    const distance = Math.abs(Date.parse(value) - now)
    return distance < bestDistance ? index : bestIndex
  }, 0)
}
