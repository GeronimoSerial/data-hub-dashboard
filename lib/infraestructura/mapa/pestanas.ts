import type { PestanaMapa } from './tipos'

export function pestanaDeMapa(
  pestana: Exclude<PestanaMapa, 'estadisticas' | 'metodologia'>,
): Exclude<PestanaMapa, 'estadisticas' | 'capas' | 'metodologia'> {
  return pestana === 'capas' ? 'actual' : pestana
}

const VALIDAS: readonly PestanaMapa[] = ['actual', 'radar', 'planificacion', 'estadisticas', 'capas', 'metodologia']
const ALIAS: Record<string, PestanaMapa> = { operativa: 'actual', evolucion: 'estadisticas' }

export function resolverPestana(
  hash: string,
  query: string,
  opciones: { radarHabilitado: boolean },
): PestanaMapa {
  const crudo = hash.replace(/^#/, '')
  let pestana: PestanaMapa = (VALIDAS as readonly string[]).includes(crudo)
    ? (crudo as PestanaMapa)
    : Object.hasOwn(ALIAS, crudo)
      ? ALIAS[crudo]
      : 'actual'
  if (!crudo && new URLSearchParams(query).get('modo') === 'radar') pestana = 'radar'
  if (pestana === 'radar' && !opciones.radarHabilitado) return 'actual'
  return pestana
}
