// Derivación de métricas citables para el briefing asistido por IA (E8).
// El LLM sólo puede referenciar cifras que existan en esta lista blanca,
// construida exclusivamente a partir de campos numéricos agregados del corte.
// Nunca se exponen datos nominales, CUE ni texto libre de fuentes (provider o
// estado) porque podrían filtrarse al prompt y volver como cifras inventadas.

import type { CorteSituacion } from './puertos'

export interface MetricaAutorizada {
  id: string
  valor: number
  etiqueta: string
}

function metricasDeConteos(
  conteos: Record<string, number>,
  prefijo: string,
  etiquetar: (clave: string) => string,
): MetricaAutorizada[] {
  return Object.keys(conteos)
    .sort()
    .map((clave) => ({
      id: `${prefijo}.${clave}`,
      valor: conteos[clave] ?? 0,
      etiqueta: etiquetar(clave),
    }))
}

export function derivarMetricasAutorizadas(corte: CorteSituacion): MetricaAutorizada[] {
  const metricas: MetricaAutorizada[] = [
    {
      id: 'kpi.escuelas_afectacion_confirmada_vigente',
      valor: corte.kpis.escuelasAfectacionConfirmadaVigente,
      etiqueta: 'Escuelas con afectación confirmada vigente',
    },
    {
      id: 'kpi.escuelas_riesgo_alto_24h',
      valor: corte.kpis.escuelasRiesgoAlto24h,
      etiqueta: 'Escuelas en riesgo alto en las próximas 24 horas',
    },
    {
      id: 'kpi.fuentes_vencidas',
      valor: corte.kpis.fuentesVencidas,
      etiqueta: 'Fuentes de datos vencidas',
    },
  ]

  metricas.push(
    ...metricasDeConteos(
      corte.conteosPorNivelRiesgo,
      'nivel',
      (clave) => `Escuelas en nivel ${clave}`,
    ),
  )

  if (corte.cobertura !== null) {
    metricas.push(
      ...metricasDeConteos(corte.cobertura, 'cobertura', (clave) => `Cobertura ${clave}`),
    )
  }

  metricas.push(
    {
      id: 'fuentes.total',
      valor: corte.fuentesSalud.length,
      etiqueta: 'Fuentes de datos monitoreadas',
    },
    {
      id: 'fuentes.vencidas_conteo',
      valor: corte.fuentesSalud.filter((fuente) => fuente.vencida).length,
      etiqueta: 'Fuentes de datos vencidas en el monitoreo',
    },
    {
      id: 'episodios.abiertos',
      valor: corte.episodiosAbiertos,
      etiqueta: 'Episodios abiertos',
    },
    {
      id: 'episodios.cerrados_desde_anterior',
      valor: corte.episodiosCerradosDesdeAnterior,
      etiqueta: 'Episodios cerrados desde el corte anterior',
    },
  )

  return metricas
}

export function mapaMetricasPorId(
  metricas: MetricaAutorizada[],
): Map<string, MetricaAutorizada> {
  return new Map(metricas.map((metrica) => [metrica.id, metrica]))
}
