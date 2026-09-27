import { getDb } from '@/lib/db'
import { getCorteVigente } from '../../../ge-db'
import { asegurarGeAdjuntada } from '../../../impacto'
import type { PuertoExposicion, ResumenExposicion } from '../puertos'

export function crearAdapterExposicion(): PuertoExposicion {
  return {
    async obtenerResumen({ cueAnexo, asOf }): Promise<ResumenExposicion | null> {
      // LIMITACIÓN CONOCIDA DE v0: `asOf` NO se usa para elegir el corte. Hoy
      // no existe la estructura de "corte histórico al instante X" (ge_corte
      // sólo distingue vigente/historico sin ventana temporal), así que el
      // adapter siempre resuelve el corte vigente. El parámetro se conserva por
      // contrato del puerto y queda documentado como follow-up; no se intenta
      // resolver con una aproximación que daría un corte incorrecto.
      void asOf
      const db = getDb()
      const client = db.$client

      await asegurarGeAdjuntada(client)
      const corte = await getCorteVigente(client)
      if (corte === null) return null

      const seccionesRes = await client.execute({
        sql: 'SELECT ge_section_id FROM ge.ge_seccion WHERE corte_id = ? AND cue_anexo = ?',
        args: [corte.id, cueAnexo],
      })
      const seccionIds = seccionesRes.rows.map((fila) => Number(fila.ge_section_id))
      if (seccionIds.length === 0) {
        return { cueAnexo, matricula: 0, secciones: 0, corteId: corte.id }
      }

      const placeholders = seccionIds.map(() => '?').join(',')
      const matriculaRes = await client.execute({
        sql: `SELECT COUNT(DISTINCT ge_person_id) as n FROM ge.ge_alumno_seccion WHERE corte_id = ? AND ge_section_id IN (${placeholders})`,
        args: [corte.id, ...seccionIds],
      })

      return {
        cueAnexo,
        matricula: Number(matriculaRes.rows[0]?.n ?? 0),
        secciones: seccionIds.length,
        corteId: corte.id,
      }
    },
  }
}
