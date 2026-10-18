import { and, eq, isNull, lte } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { infraDatasetEntrega, infraDatasetVersion, infraDatasetRegistro, infraDatasetDependencia } from '@/lib/db/schema'
import { guardarVersion, leerVersion, publicarVersion } from '../datasets/repositorio'
import { reconstruirDocumento, type Datos } from '../datasets/codec'
import { proyectarPrefectura, guardarSaludCorrida, type CorridaPrefectura } from './publicacion'

type Db = ReturnType<typeof getDb>

async function copiarVersion(id: string, origen: Db, destino: Db, vistas = new Set<string>()) {
  if (vistas.has(id)) return
  vistas.add(id)
  const [v] = await origen.select().from(infraDatasetVersion).where(eq(infraDatasetVersion.id, id))
  if (!v) throw new Error('Versión de origen inexistente')
  const deps = await origen.select().from(infraDatasetDependencia).where(eq(infraDatasetDependencia.versionId, id))
  for (const dep of deps) await copiarVersion(dep.entradaId, origen, destino, vistas)
  const filas = await origen.select().from(infraDatasetRegistro).where(eq(infraDatasetRegistro.versionId, id)).orderBy(infraDatasetRegistro.orden)
  const copiada = await guardarVersion({ datasetId: v.datasetId, nombre: v.datasetId,
    revision: v.revision, fuente: v.fuente, licencia: v.licencia, fechaFuente: v.fechaFuente?.toISOString(),
    formato: v.formato as 'array', datos: reconstruirDocumento(v.formato, v.estructura, filas.map((r) => r.datos)),
    claves: filas.map((r) => r.clave), metadatos: v.metadatos, entradas: deps.map((d) => d.entradaId),
  }, destino, false)
  if (copiada !== id) throw new Error('Checksum de réplica distinto al origen')
}

export type DestinoPrefectura = 'staging' | 'dev'

/** Entrega acotada, idempotente y sin llamadas a Prefectura. Cada entorno consume sólo su cola. */
export async function entregarPrefectura(origen: Db, destino: Db, ahora = new Date(), limite = 50,
  entorno: DestinoPrefectura = 'staging') {
  let entregadas = 0
  let fallidas = 0
  for (let i = 0; i < limite; i++) {
    const procesada = await origen.transaction(async (tx) => {
      const [pendiente] = await tx.select().from(infraDatasetEntrega).where(and(
        eq(infraDatasetEntrega.destino, entorno), isNull(infraDatasetEntrega.entregadaEn),
        lte(infraDatasetEntrega.proximoIntento, ahora),
      )).orderBy(infraDatasetEntrega.creadaEn).limit(1).for('update', { skipLocked: true })
      if (!pendiente) return false
      try {
        await destino.transaction(async (target) => {
          const db = target as Db
          await copiarVersion(pendiente.versionId, tx as Db, db)
          const version = await leerVersion('prefectura-alturas', pendiente.versionId, db)
            ?? await leerVersion('prefectura-referencias', pendiente.versionId, db)
          if (!version) throw new Error('Entrega ajena a Prefectura')
          const vigente = await leerVersion(version.version.datasetId, undefined, db)
          // Un reintento atrasado conserva el archivo, pero nunca retrocede el mapa.
          if (!vigente || (vigente.version.fechaFuente?.getTime() ?? 0) <= (version.version.fechaFuente?.getTime() ?? 0)) {
            const m = version.version.metadatos
            const corrida: CorridaPrefectura = { tipo: m.tipo as CorridaPrefectura['tipo'],
              jobRunId: String(m.jobRunId), catalogoVersion: String(m.catalogoVersion),
              estacionesConError: Number(m.estacionesConError ?? 0),
              capturadaEn: version.version.fechaFuente!.toISOString(), filas: version.documento as Datos[] }
            await publicarVersion(version.version.datasetId, pendiente.versionId, db,
              async (proyeccion) => {
                await proyectarPrefectura(proyeccion, corrida)
                await guardarSaludCorrida(proyeccion, corrida)
              })
          }
        })
        await tx.update(infraDatasetEntrega).set({ entregadaEn: ahora, ultimoError: null,
          intentos: pendiente.intentos + 1 }).where(and(eq(infraDatasetEntrega.versionId, pendiente.versionId), eq(infraDatasetEntrega.destino, entorno)))
        entregadas++
      } catch {
        // No propagar mensajes de drivers: pueden contener URL, parámetros o secretos.
        await tx.update(infraDatasetEntrega).set({ intentos: pendiente.intentos + 1,
          ultimoError: 'Entrega fallida; reintento pendiente',
          proximoIntento: new Date(ahora.getTime() + Math.min(3600, 30 * 2 ** Math.min(pendiente.intentos, 7)) * 1000),
        }).where(and(eq(infraDatasetEntrega.versionId, pendiente.versionId), eq(infraDatasetEntrega.destino, entorno)))
        fallidas++
      }
      return true
    })
    if (!procesada) break
  }
  return { entregadas, fallidas }
}
