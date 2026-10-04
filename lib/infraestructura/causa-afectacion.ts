// Spec rediseño §4.4: una situación nueva puede declararse consecuencia de
// otra de la misma escuela que siga activa o que se haya cerrado hace poco
// (la luz puede cortarse justo después de que bajó el agua).
export const VENTANA_CAUSA_DIAS = 15

const MS_POR_DIA = 24 * 60 * 60 * 1000

export function causaElegible(
  causa: { cueAnexo: string; retiradaEn: string | null },
  cue: string,
  rigeDesde: string,
): boolean {
  if (causa.cueAnexo !== cue) return false
  if (causa.retiradaEn === null) return true
  const transcurrido = Date.parse(rigeDesde) - Date.parse(causa.retiradaEn)
  return transcurrido <= VENTANA_CAUSA_DIAS * MS_POR_DIA
}
