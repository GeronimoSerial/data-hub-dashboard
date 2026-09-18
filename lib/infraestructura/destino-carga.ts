// A qué pantalla de carga corresponde mandar al director: la del primer
// reporte o la de actualización.
//
// El director recibe un enlace y una contraseña, no un mapa del sitio. No
// tiene por qué saber si lo que le toca es "iniciar" o "actualizar" — eso
// depende del estado del parte, que es justamente lo que viene a consultar.
// Las dos rutas siguen existiendo (el estado actual enlaza a la que
// corresponde), pero cada una se corrige sola si le llega alguien al lugar
// equivocado.
//
// La regla es la misma que sinSituacionEnSeguimiento en
// estado-actual-textos.ts, para que la redirección y el mensaje de §17 nunca
// discrepen: sin período, sin parte o sin ninguna afectación vigente, no hay
// nada que actualizar.
import type { ParteActual } from '@/lib/infraestructura/parte-consulta'
import { snapshotDesde } from '@/lib/infraestructura/parte-consulta'

export type DestinoCarga = 'nuevo' | 'actualizar'

export const RUTA_DESTINO: Record<DestinoCarga, string> = {
  nuevo: '/problematicas/parte/nuevo',
  actualizar: '/problematicas/parte/actualizar',
}

/**
 * Decisión pura, para poder probarla sin base: `null` es "no hay período
 * vigente", que se trata igual que "todavía no hay nada informado".
 */
export function destinoParaParte(actual: ParteActual | null): DestinoCarga {
  if (!actual || !actual.parte) return 'nuevo'
  return snapshotDesde(actual).afectaciones.length > 0 ? 'actualizar' : 'nuevo'
}

/** URL de la pantalla que corresponde, conservando el CUE del enlace. */
export function enlaceDestino(destino: DestinoCarga, cueAnexo: string): string {
  return `${RUTA_DESTINO[destino]}?cue=${encodeURIComponent(cueAnexo)}`
}
