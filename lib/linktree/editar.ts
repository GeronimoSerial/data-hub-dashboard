import type { LinktreeConfig, LinktreeEnlace, LinktreeGrupo } from './config'

// Pure edits over the draft document. Each returns a new config and leaves its
// input untouched; a move that would fall off either end returns the same
// object so callers can skip a re-render.

function mover<T>(lista: T[], indice: number, delta: -1 | 1): T[] | null {
  const destino = indice + delta
  if (indice < 0 || destino < 0 || destino >= lista.length) return null
  const copia = [...lista]
  ;[copia[indice], copia[destino]] = [copia[destino], copia[indice]]
  return copia
}

function conGrupos(config: LinktreeConfig, grupos: LinktreeGrupo[]): LinktreeConfig {
  return { ...config, grupos }
}

export function totalEnlaces(config: LinktreeConfig) {
  return config.grupos.reduce((suma, grupo) => suma + grupo.enlaces.length, 0)
}

export function agregarGrupo(config: LinktreeConfig, id: string, titulo: string) {
  return conGrupos(config, [...config.grupos, { id, titulo, enlaces: [] }])
}

export function renombrarGrupo(config: LinktreeConfig, id: string, titulo: string) {
  return conGrupos(config, config.grupos.map((grupo) => (grupo.id === id ? { ...grupo, titulo } : grupo)))
}

export function eliminarGrupo(config: LinktreeConfig, id: string) {
  return conGrupos(config, config.grupos.filter((grupo) => grupo.id !== id))
}

export function moverGrupo(config: LinktreeConfig, id: string, delta: -1 | 1) {
  const grupos = mover(config.grupos, config.grupos.findIndex((grupo) => grupo.id === id), delta)
  return grupos ? conGrupos(config, grupos) : config
}

/** Adds the link, or updates it in place; when it changes group it lands at the end of the new one. */
export function guardarEnlace(config: LinktreeConfig, grupoId: string, enlace: LinktreeEnlace) {
  const grupoActual = config.grupos.find((grupo) => grupo.enlaces.some((e) => e.id === enlace.id))
  return conGrupos(
    config,
    config.grupos.map((grupo) => {
      if (grupo.id === grupoId && grupoActual?.id === grupoId) {
        return { ...grupo, enlaces: grupo.enlaces.map((e) => (e.id === enlace.id ? enlace : e)) }
      }
      if (grupo.id === grupoId) return { ...grupo, enlaces: [...grupo.enlaces, enlace] }
      if (grupo.id === grupoActual?.id) return { ...grupo, enlaces: grupo.enlaces.filter((e) => e.id !== enlace.id) }
      return grupo
    }),
  )
}

export function eliminarEnlace(config: LinktreeConfig, enlaceId: string) {
  return conGrupos(
    config,
    config.grupos.map((grupo) => ({ ...grupo, enlaces: grupo.enlaces.filter((e) => e.id !== enlaceId) })),
  )
}

export function moverEnlace(config: LinktreeConfig, enlaceId: string, delta: -1 | 1) {
  for (const grupo of config.grupos) {
    const indice = grupo.enlaces.findIndex((e) => e.id === enlaceId)
    if (indice === -1) continue
    const enlaces = mover(grupo.enlaces, indice, delta)
    if (!enlaces) return config
    return conGrupos(config, config.grupos.map((g) => (g.id === grupo.id ? { ...g, enlaces } : g)))
  }
  return config
}

export function alternarVisible(config: LinktreeConfig, enlaceId: string, visible: boolean) {
  return conGrupos(
    config,
    config.grupos.map((grupo) => ({
      ...grupo,
      enlaces: grupo.enlaces.map((e) => (e.id === enlaceId ? { ...e, visible } : e)),
    })),
  )
}
