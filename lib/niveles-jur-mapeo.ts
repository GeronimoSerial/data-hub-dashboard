// Mapeo legado → niveles jurisdiccionales de GE (aprobado por el usuario el
// 2026-10-15, ver odd/tasks/ge-sso-nivel-jurisdiccional.md). Los ids de la
// derecha son ids de ge.ge_nivel_jurisdiccional.
//
// `transversal` no restringe: lista vacía = sin restricción por este eje.
// 2, 6 y 7 no tienen equivalente legado: sólo se asignan por el admin o SSO.
export const MAPEO_NIVEL_A_JUR: Readonly<Record<string, readonly number[]>> = {
  secundario: [1, 5],
  superior: [4],
  inicial: [9],
  primario: [9],
  transversal: [],
}

// Ids legados que no están en el mapeo (y por lo tanto se ignoran al mapear).
export function nivelesDesconocidos(ids: readonly string[]): string[] {
  const desconocidos = new Set<string>()
  for (const id of ids) {
    if (!Object.hasOwn(MAPEO_NIVEL_A_JUR, id)) desconocidos.add(id)
  }
  return [...desconocidos]
}

// Traduce ids legados a ids jurisdiccionales: sin duplicados, ordenados, y los
// ids desconocidos se ignoran (ver nivelesDesconocidos para reportarlos).
export function mapearNivelesAJur(ids: readonly string[]): number[] {
  const jur = new Set<number>()
  for (const id of ids) {
    if (!Object.hasOwn(MAPEO_NIVEL_A_JUR, id)) continue
    for (const jurId of MAPEO_NIVEL_A_JUR[id]) jur.add(jurId)
  }
  return [...jur].sort((a, b) => a - b)
}
