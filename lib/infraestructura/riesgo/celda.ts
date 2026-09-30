// Celdas geográficas para reducir llamadas multi-coordenada a Open-Meteo.
// Un grado decimal de 0.1° evita pedir el pronóstico escuela por escuela:
// las ~2000 escuelas se agrupan en celdas únicas y se consulta una vez por
// celda, no una vez por establecimiento.

// Redondeo a 0.1° con formateo fijo a 1 decimal. toFixed(1) normaliza la
// representación: evita que -27.5 y -27.50 convivan como claves distintas y
// garantiza que el string sea estable como clave de Map.
export function celdaDeCoordenada(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Coordenada inválida: lat=${lat}, lon=${lon}`)
  }
  const latRedondeada = Math.round(lat * 10) / 10
  const lonRedondeada = Math.round(lon * 10) / 10
  return `${latRedondeada.toFixed(1)}_${lonRedondeada.toFixed(1)}`
}

// Agrupa items por celda, ignorando los que no tienen coordenada (coord(item)
// null) porque no se les puede pedir pronóstico. El Map resultante se usa para
// mandar una sola lista de coordenadas a Open-Meteo y luego repartir el
// resultado entre los items que comparten celda.
export function agruparEnCeldas<T>(
  items: T[],
  coord: (item: T) => { lat: number; lon: number } | null,
): Map<string, T[]> {
  const celdas = new Map<string, T[]>()
  for (const item of items) {
    const punto = coord(item)
    if (punto === null) continue
    const clave = celdaDeCoordenada(punto.lat, punto.lon)
    const grupo = celdas.get(clave)
    if (grupo) {
      grupo.push(item)
    } else {
      celdas.set(clave, [item])
    }
  }
  return celdas
}
