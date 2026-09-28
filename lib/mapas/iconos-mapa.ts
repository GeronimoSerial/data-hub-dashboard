// Íconos rasterizables para las capas `symbol` de MapLibre. Las capas DOM
// (badges por escuela) usan los componentes de `lucide-react` directamente;
// acá sólo viven los SVG standalone que `map.addImage` necesita para los
// íconos de agregado a nivel cluster (no hay componente React en WebGL).
//
// Los paths son los mismos que expone `lucide-react` (v1.34.0) para Tent y
// DoorOpen, con los atributos por defecto de Lucide (viewBox 24x24, stroke
// 2). Se duplican acá como string porque `map.addImage` necesita un
// HTMLImageElement, no un componente React, y no se importa React en un
// módulo puro de datos. Si Lucide cambia un path, la leyenda sigue usando el
// componente real; este string es la única copia desacoplada.
//
// El badge de cluster lleva fondo blanco para leerse sobre cualquier color de
// severidad (incluida Crítica, rojo oscuro), igual que el badge DOM.

const ATRIBUTOS_LUCIDE =
  'xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" ' +
  'fill="none" stroke="#1c1c1c" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"'

const FONDO_BADGE = '<circle cx="12" cy="12" r="11" fill="#ffffff" stroke="#1c1c1c" stroke-width="1" />'

export const ID_IMAGEN_CLUSTER_CENTRO_EVACUADOS = 'infra-icono-centro-evacuados'
export const ID_IMAGEN_CLUSTER_EVACUADO = 'infra-icono-evacuado'

// Tent (centro de evacuados): prioridad 1 del badge de estado.
export const SVG_ICONO_CLUSTER_CENTRO_EVACUADOS = `<svg ${ATRIBUTOS_LUCIDE}>${FONDO_BADGE}<path d="M3.5 21 14 3" /><path d="M20.5 21 10 3" /><path d="M15.5 21 12 15l-3.5 6" /><path d="M2 21h20" /></svg>`

// DoorOpen (establecimiento evacuado): prioridad 2 del badge de estado.
export const SVG_ICONO_CLUSTER_EVACUADO = `<svg ${ATRIBUTOS_LUCIDE}>${FONDO_BADGE}<path d="M11 20H2" /><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z" /><path d="M11 4H8a2 2 0 0 0-2 2v14" /><path d="M14 12h.01" /><path d="M22 20h-3" /></svg>`

export const ICONOS_CLUSTER_MAPA: ReadonlyArray<{ id: string; svg: string }> = [
  { id: ID_IMAGEN_CLUSTER_CENTRO_EVACUADOS, svg: SVG_ICONO_CLUSTER_CENTRO_EVACUADOS },
  { id: ID_IMAGEN_CLUSTER_EVACUADO, svg: SVG_ICONO_CLUSTER_EVACUADO },
]
