// Planificador puro de la climatología progresiva. Dado el conjunto de celdas
// ERA5, los pares (celda, año) ya guardados y el cupo disponible, decide qué
// lotes (año, celdas) bajar a continuación. Sin DB ni red.
//
// Orden ancho-primero: se recorren los años de más reciente a más antiguo y,
// dentro de cada año, todas las celdas que lo necesitan. Así, con cupo
// limitado, toda celda tiene primero sus años recientes.
//
// El peso replica `pesoLlamada` de providers/cupo-om.ts (lineal en la cantidad
// de ubicaciones). No se importa desde allí porque ese módulo arrastra la DB.

export type CeldaPlanificable = { celdaEra5: string; lat: number; lon: number }

export type LoteDescarga = {
  anio: number
  celdas: CeldaPlanificable[]
  peso: number
}

export type ParametrosPlanificador = {
  celdas: CeldaPlanificable[]
  /** Pares `${celdaEra5}:${anio}` ya guardados. */
  aniosGuardados: Set<string>
  anioDesde: number
  anioHasta: number
  pesoMaximoPorRequest: number
  pesoDisponible: number
  variables: number
}

function diasDelAnio(anio: number): number {
  const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0
  return bisiesto ? 366 : 365
}

function pesoDeUnaCeldaAnio(variables: number, dias: number): number {
  return Math.max(1, variables / 10) * Math.max(1, dias / 14)
}

export function planificarDescargas(params: ParametrosPlanificador): LoteDescarga[] {
  const celdas = [...params.celdas].sort((a, b) => (a.celdaEra5 < b.celdaEra5 ? -1 : a.celdaEra5 > b.celdaEra5 ? 1 : 0))
  const plan: LoteDescarga[] = []
  let pesoAcumulado = 0

  for (let anio = params.anioHasta; anio >= params.anioDesde; anio--) {
    const pesoCelda = pesoDeUnaCeldaAnio(params.variables, diasDelAnio(anio))
    const celdasPorLote = Math.floor(params.pesoMaximoPorRequest / pesoCelda)
    if (celdasPorLote < 1) continue

    const faltantes = celdas.filter((celda) => !params.aniosGuardados.has(`${celda.celdaEra5}:${anio}`))

    for (let inicio = 0; inicio < faltantes.length; inicio += celdasPorLote) {
      const restante = params.pesoDisponible - pesoAcumulado
      const celdasQueCaben = Math.min(celdasPorLote, Math.floor(restante / pesoCelda))
      if (celdasQueCaben < 1) return plan

      const lote = faltantes.slice(inicio, inicio + celdasQueCaben)
      const peso = lote.length * pesoCelda
      plan.push({ anio, celdas: lote, peso })
      pesoAcumulado += peso

      if (lote.length < Math.min(celdasPorLote, faltantes.length - inicio)) return plan
    }
  }

  return plan
}
