import { randomUUID } from 'node:crypto'
import type { hazardObservation } from '@/lib/db/schema'

export function crearGeneradoresGranulos(geometryRef: string): {
  granulo: (finEn: string, valor: number) => typeof hazardObservation.$inferInsert
  granulosConsecutivos: (
    finMasReciente: string,
    n: number,
    valor: number,
  ) => typeof hazardObservation.$inferInsert[]
} {
  // The calculation only depends on `valor` and `validoHasta`; all fields are
  // populated to satisfy the persisted observation contract.
  function granulo(finEn: string, valor: number): typeof hazardObservation.$inferInsert {
    return {
      id: randomUUID(),
      provider: 'nasa-imerg',
      variable: 'precipitacion_observada_satelital',
      geometryRef,
      valor,
      unidad: 'mm/30min',
      observadoEn: finEn,
      validoDesde: finEn,
      validoHasta: finEn,
      calidad: null,
      rawRef: null,
      ingeridoEn: finEn,
    }
  }

  function granulosConsecutivos(
    finMasReciente: string,
    n: number,
    valor: number,
  ): typeof hazardObservation.$inferInsert[] {
    // Consecutive 30-minute granules ending at the latest timestamp, inclusive.
    const finMs = Date.parse(finMasReciente)
    return Array.from({ length: n }, (_, i) =>
      granulo(new Date(finMs - i * 30 * 60 * 1000).toISOString(), valor),
    )
  }

  return { granulo, granulosConsecutivos }
}
