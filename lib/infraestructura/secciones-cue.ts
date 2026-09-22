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

// Límite conservador de parámetros por consulta: SQLite (según la build)
// puede limitar a 999 parámetros (SQLITE_MAX_VARIABLE_NUMBER histórico); acá
// se chunkea la lista de CUEs en lotes de 500 (1 parámetro de corteId + hasta
// 500 de cueAnexo por lote) para no depender de qué build corra en
// producción. El mapa/mapa-enos hoy nunca pide miles de CUEs en simultáneo,
// pero el chunkeo es gratis y evita un techo silencioso el día que sí pase.
const CUE_CHUNK_SIZE = 500

// Variante batcheada: una sola tanda de queries (una por chunk de 500 CUEs,
// normalmente una sola) para TODOS los CUEs pedidos, en vez de N consultas
// (una por CUE). listarPartesVigentes (parte-mapa.ts) depende de esto para
// no volver a caer en el patrón N+1 que esta función singular tendría si se
// llamara una vez por escuela.
export async function listarSeccionesDeCues(
  client: EjecutorSql,
  corteId: number,
  cueAnexos: string[],
): Promise<Map<string, SeccionEstablecimiento[]>> {
  const resultado = new Map<string, SeccionEstablecimiento[]>()
  const unicos = [...new Set(cueAnexos)]
  if (unicos.length === 0) return resultado

  for (let i = 0; i < unicos.length; i += CUE_CHUNK_SIZE) {
    const lote = unicos.slice(i, i + CUE_CHUNK_SIZE)
    const placeholders = lote.map(() => '?').join(',')
    const res = await client.execute({
      sql: `SELECT ge_section_id, turno, cue_anexo FROM ge.ge_seccion WHERE corte_id = ? AND cue_anexo IN (${placeholders})`,
      args: [corteId, ...lote],
    })
    for (const r of res.rows) {
      const cueAnexo = String(r.cue_anexo)
      const lista = resultado.get(cueAnexo) ?? []
      lista.push({ geSectionId: Number(r.ge_section_id), turno: String(r.turno) })
      resultado.set(cueAnexo, lista)
    }
  }

  // Todo CUE pedido queda con entrada (aunque sea []), para que quien llama
  // no tenga que distinguir "sin secciones en este corte" de "no consultado".
  for (const cueAnexo of unicos) {
    if (!resultado.has(cueAnexo)) resultado.set(cueAnexo, [])
  }
  return resultado
}

// Delegación al plural: se conserva la firma singular porque
// obtenerParteActual (parte-consulta.ts) y el resto del flujo de un solo CUE
// la siguen usando tal cual, pero el SQL vive en un único lugar.
export async function listarSeccionesDelCue(
  client: EjecutorSql,
  corteId: number,
  cueAnexo: string,
): Promise<SeccionEstablecimiento[]> {
  const mapa = await listarSeccionesDeCues(client, corteId, [cueAnexo])
  return mapa.get(cueAnexo) ?? []
}
