import { referencia, versionReferencia } from '@/lib/infraestructura/datasets/memoria'
// Puntos curados de consulta de caudal: dataset versionado `puntos-rio`.
// La curación geográfica y su criterio se conservan en cada registro de la DB.
export type PuntoRio = {
  id: string
  rio: 'parana' | 'uruguay' | 'corriente' | 'santa-lucia' | 'miriñay' | 'aguapey'
  localidad: string
  lat: number
  lon: number
  criterio: string
}

export function obtenerVersionPuntosRio(): string { return versionReferencia('puntos-rio') }

export function obtenerPuntosRio(): readonly PuntoRio[] { return referencia('puntos-rio') }

// Afluentes (Corriente, Santa Lucía, Miriñay, Aguapey): NO se incluyen en
// esta versión. El barrido automatizado por caudal máximo en una ventana
// alrededor de la localidad converge sistemáticamente al cauce principal
// (Paraná/Uruguay) más cercano, que domina el caudal de cualquier celda
// vecina — no sirve para aislar un afluente mucho más chico. Ubicar esos
// puntos requiere el curso real del afluente (polígono/línea, no sólo un
// centro de localidad), que no está disponible en este repo (ver
// cobertura-geo.md de E2-prep: no hay polígonos de hidrografía). Queda como
// pendiente explícito, documentado en el registro del batch; no bloquea la
// aceptación de E2 (la integración mínima exigida es Paraná + Uruguay).
export function puntoRioPorId(id: string): PuntoRio | undefined {
  return obtenerPuntosRio().find((p) => p.id === id)
}
