// Consulta que hoy está copiada como función privada `seccionesDelCue` en
// tres route handlers (app/api/problematicas/route.ts,
// app/api/problematicas/impacto/route.ts y app/api/problematicas/nueva-alerta
// si existiera una tercera copia). Se promueve acá una única vez para que el
// batch 3 (parte-consulta.ts, app/api/problematicas/parte/*) no la repita una
// cuarta vez, y se amplía para devolver también el turno: lo necesitan
// calcularEstadoServicioGeneral (agrupa por turno) y la validación de
// alcances `tipo: 'turno'`.
//
// Las tres rutas existentes NO se migran a usar esta función en este batch:
// pasan sus tests hoy tal como están, y tocarlas no aporta nada a esta
// entrega — quedan como candidatas a una limpieza posterior.
//
// Requiere que `client` ya tenga adjuntada la base `ge` (ver
// asegurarGeAdjuntada en impacto.ts); esta función no la adjunta por sí
// misma.
import type { EjecutorSql } from './ge-db'
import type { SeccionEstablecimiento } from './trayectoria-tipos'

export async function listarSeccionesDelCue(
  client: EjecutorSql,
  corteId: number,
  cueAnexo: string,
): Promise<SeccionEstablecimiento[]> {
  const res = await client.execute({
    sql: 'SELECT ge_section_id, turno FROM ge.ge_seccion WHERE corte_id = ? AND cue_anexo = ?',
    args: [corteId, cueAnexo],
  })
  return res.rows.map((r) => ({
    geSectionId: Number(r.ge_section_id),
    turno: String(r.turno),
  }))
}
