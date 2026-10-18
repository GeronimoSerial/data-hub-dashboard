import type { PestanaMapa } from './tipos'

export function pestanaDeMapa(
  pestana: Exclude<PestanaMapa, 'estadisticas' | 'metodologia' | 'exportar'>,
): Exclude<PestanaMapa, 'estadisticas' | 'capas' | 'metodologia' | 'exportar'> {
  return pestana === 'capas' ? 'actual' : pestana
}

const VALIDAS: readonly PestanaMapa[] = ['actual', 'radar', 'planificacion', 'estadisticas', 'capas', 'metodologia', 'exportar']
const ALIAS: Record<string, PestanaMapa> = { operativa: 'actual', evolucion: 'estadisticas' }

export function resolverPestana(
  hash: string,
  query: string,
  opciones: { radarHabilitado: boolean },
): PestanaMapa {
  const crudo = hash.replace(/^#/, '').split('/')[0]
  let pestana: PestanaMapa = (VALIDAS as readonly string[]).includes(crudo)
    ? (crudo as PestanaMapa)
    : Object.hasOwn(ALIAS, crudo)
      ? ALIAS[crudo]
      : 'actual'
  if (!crudo && new URLSearchParams(query).get('modo') === 'radar') pestana = 'radar'
  if (pestana === 'radar' && !opciones.radarHabilitado) return 'actual'
  return pestana
}
