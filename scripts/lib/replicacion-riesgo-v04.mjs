import { validarDestinosRadar } from './replicacion-radar.mjs'

export { validarDestinosRadar as validarDestinosRiesgoV04 }

const TABLAS = ['infra_risk_run', 'infra_risk_snapshot', 'infra_risk_factor']

async function insertar(conexion, tabla, filas) {
  if (filas.length === 0) return
  await conexion.query(`INSERT INTO public.${tabla}
    SELECT * FROM jsonb_populate_recordset(NULL::public.${tabla}, $1::jsonb)`, [JSON.stringify(filas)])
}

async function resumen(conexion, runId) {
  const { rows: [fila] } = await conexion.query(`SELECT
    (SELECT count(*)::int FROM infra_risk_snapshot WHERE run_id = $1) AS snapshots,
    (SELECT count(*)::int FROM infra_risk_factor f JOIN infra_risk_snapshot s ON s.id = f.snapshot_id WHERE s.run_id = $1) AS factores`, [runId])
  return fila
}

/** Copia la evaluación completa; no recalcula, borra ni transforma factores. */
export async function replicarRiesgoV04(origen, destino, { lote = 500 } = {}) {
  if (!Number.isInteger(lote) || lote < 1 || lote > 1000) throw new Error('Lote inválido')
  await origen.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  let transaccionDestino = false
  try {
    const { rows: [run] } = await origen.query("SELECT * FROM infra_risk_run WHERE estado = 'vigente'")
    if (!run || run.modelo_version !== 'motor-v0.4' || run.modo !== 'operativo' || run.metadatos?.reglas !== 'v0.4') {
      throw new Error('El origen no tiene una corrida operativa v0.4 completa')
    }
    const esperado = await resumen(origen, run.id)
    if (esperado.snapshots === 0 || esperado.snapshots !== run.cobertura?.procesadas) throw new Error('Cobertura incompleta en origen')
    const { rows: invalidas } = await origen.query(`SELECT cue_anexo FROM infra_risk_snapshot
      WHERE run_id = $1 GROUP BY cue_anexo HAVING count(*) <> 3
      OR count(DISTINCT horizonte_horas) FILTER (WHERE horizonte_horas IN (24,72,240)) <> 3
      OR bool_or(resultado_v04 IS NULL OR resultado_v04->>'modeloVersion' IS DISTINCT FROM 'motor-v0.4')`, [run.id])
    if (invalidas.length) throw new Error('El origen tiene escuelas sin evaluación v0.4 para los tres horizontes')

    await destino.query('BEGIN')
    transaccionDestino = true
    await destino.query("SET LOCAL lock_timeout = '10s'")
    await destino.query(`LOCK TABLE ${TABLAS.join(', ')} IN SHARE ROW EXCLUSIVE MODE`)
    const { rows: [vigente] } = await destino.query("SELECT * FROM infra_risk_run WHERE estado = 'vigente'")
    if (vigente?.id === run.id) {
      const actual = await resumen(destino, run.id)
      if (actual.snapshots !== esperado.snapshots || actual.factores !== esperado.factores) throw new Error('La copia existente está incompleta')
      await destino.query('COMMIT')
      transaccionDestino = false
      await origen.query('COMMIT')
      return { estado: 'ya_actualizado', runId: run.id, ...actual }
    }
    if (vigente && Date.parse(vigente.iniciado_en) > Date.parse(run.iniciado_en)) throw new Error('El destino tiene una evaluación más reciente')
    const { rows: existente } = await destino.query('SELECT id FROM infra_risk_run WHERE id = $1', [run.id])
    if (existente.length) throw new Error('El run ya existe como histórico: no se modifica')
    const { rows: periodo } = await destino.query('SELECT id FROM infra_periodo WHERE id = $1', [run.periodo_id])
    if (!periodo.length) throw new Error('El período de la corrida no existe en destino')

    await insertar(destino, 'infra_risk_run', [{ ...run, estado: 'preparando' }])
    for (let offset = 0; offset < esperado.snapshots; offset += lote) {
      const { rows } = await origen.query('SELECT * FROM infra_risk_snapshot WHERE run_id = $1 ORDER BY id LIMIT $2 OFFSET $3', [run.id, lote, offset])
      await insertar(destino, 'infra_risk_snapshot', rows)
    }
    for (let offset = 0; offset < esperado.factores; offset += lote) {
      const { rows } = await origen.query(`SELECT f.* FROM infra_risk_factor f JOIN infra_risk_snapshot s ON s.id = f.snapshot_id
        WHERE s.run_id = $1 ORDER BY f.id LIMIT $2 OFFSET $3`, [run.id, lote, offset])
      await insertar(destino, 'infra_risk_factor', rows)
    }
    const copiado = await resumen(destino, run.id)
    if (copiado.snapshots !== esperado.snapshots || copiado.factores !== esperado.factores) throw new Error('Copia incompleta: se revierte')
    await destino.query("UPDATE infra_risk_run SET estado = 'vencido' WHERE estado = 'vigente'")
    await destino.query("UPDATE infra_risk_run SET estado = 'vigente' WHERE id = $1", [run.id])
    await destino.query('COMMIT')
    transaccionDestino = false
    await origen.query('COMMIT')
    return { estado: 'actualizado', runId: run.id, anterior: vigente?.id ?? null, ...copiado }
  } catch (error) {
    if (transaccionDestino) await destino.query('ROLLBACK')
    await origen.query('ROLLBACK')
    throw error
  }
}
