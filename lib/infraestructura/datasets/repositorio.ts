import { validarReferencia } from './validacion'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraDataset, infraDatasetVersion, infraDatasetRegistro, infraDatasetDependencia, infraDatasetPublicacion } from '@/lib/db/schema'
import { DATASETS_REFERENCIA } from './catalogo'
import { prepararVersion, reconstruirDocumento, type Datos, type EntradaVersion } from './codec'
import { estadoReferencias } from './memoria'
import { describirAuditoria } from '../auditoria/contexto'

type Db = ReturnType<typeof getDb>
export type TxDataset = Parameters<Parameters<Db['transaction']>[0]>[0]
async function proyectarLocalizaciones(tx: TxDataset, datos: Datos[]) {
  if (datos.some((fila) => typeof fila.cueAnexo !== 'string' || typeof fila.nombre !== 'string'
    || ![fila.lat, fila.lon].every((n) => n === null || (typeof n === 'number' && Number.isFinite(n))))) {
    throw new Error('Localizaciones inválidas')
  }
  await tx.execute(sql`INSERT INTO ge.ge_localizacion (cue_anexo,cui,nombre,departamento,localidad,lat,lon,geo_calidad)
    SELECT fila->>'cueAnexo',fila->>'cui',fila->>'nombre',fila->>'departamento',fila->>'localidad',
      (fila->>'lat')::real,(fila->>'lon')::real,fila->>'geoCalidad'
    FROM jsonb_array_elements(${JSON.stringify(datos)}::jsonb) fila
    ON CONFLICT (cue_anexo) DO UPDATE SET cui=coalesce(excluded.cui,ge_localizacion.cui),nombre=excluded.nombre,departamento=excluded.departamento,
      localidad=excluded.localidad,lat=excluded.lat,lon=excluded.lon,geo_calidad=excluded.geo_calidad`)
}

export async function guardarVersion(entrada: EntradaVersion, db: Db = getDb(), publicar = true, proyectar?: (tx: TxDataset, versionId: string) => Promise<void>) {
  validarReferencia(entrada)
  const preparada = prepararVersion(entrada)
  describirAuditoria({ objetoTipo: 'dataset', objetoId: entrada.datasetId,
    metadatos: { datasetId: entrada.datasetId, versionId: preparada.id } })
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('infra-datasets-publicacion'))`)
    await tx.insert(infraDataset).values({ id: entrada.datasetId, nombre: entrada.nombre }).onConflictDoNothing()
    const [existente] = await tx.select({ id: infraDatasetVersion.id }).from(infraDatasetVersion).where(eq(infraDatasetVersion.id, preparada.id))
    if (!existente) {
      await tx.insert(infraDatasetVersion).values({
        id: preparada.id, datasetId: entrada.datasetId, revision: entrada.revision, checksum: preparada.checksum,
        fuente: entrada.fuente, licencia: entrada.licencia ?? null,
        fechaFuente: entrada.fechaFuente ? new Date(entrada.fechaFuente) : null,
        formato: entrada.formato, estructura: preparada.estructura,
        metadatos: entrada.metadatos ?? {}, filas: preparada.registros.length,
      })
      for (let i = 0; i < preparada.registros.length; i += 250) {
        await tx.insert(infraDatasetRegistro).values(preparada.registros.slice(i, i + 250).map((fila) => ({ ...fila, versionId: preparada.id })))
      }
      if (preparada.entradas.length) await tx.insert(infraDatasetDependencia).values(preparada.entradas.map((entradaId) => ({ versionId: preparada.id, entradaId })))
    }
    if (publicar && entrada.datasetId === 'localizaciones') await proyectarLocalizaciones(tx, preparada.registros.map((r) => r.datos))
    if (publicar && proyectar) await proyectar(tx, preparada.id)
    if (publicar) await tx.insert(infraDatasetPublicacion).values({ datasetId: entrada.datasetId, versionId: preparada.id })
      .onConflictDoUpdate({ target: infraDatasetPublicacion.datasetId, set: { versionId: preparada.id, publicadaEn: new Date() } })
  })
  estadoReferencias().cargadoEn = 0
  return preparada.id
}

export async function leerVersion(datasetId: string, versionId?: string, db: Db = getDb()) {
  const versiones = db.select({ version: infraDatasetVersion }).from(infraDatasetVersion)
  const [seleccion] = versionId
    ? await versiones.where(and(eq(infraDatasetVersion.datasetId, datasetId), eq(infraDatasetVersion.id, versionId)))
    : await versiones.innerJoin(infraDatasetPublicacion, eq(infraDatasetPublicacion.versionId, infraDatasetVersion.id))
      .where(eq(infraDatasetPublicacion.datasetId, datasetId))
  if (!seleccion) return null
  const filas = await db.select({ datos: infraDatasetRegistro.datos }).from(infraDatasetRegistro)
    .where(eq(infraDatasetRegistro.versionId, seleccion.version.id)).orderBy(infraDatasetRegistro.orden)
  return { version: seleccion.version, documento: reconstruirDocumento(seleccion.version.formato, seleccion.version.estructura, filas.map((f) => f.datos)) }
}

export async function listarVersiones(datasetId: string, db: Db = getDb()) {
  return db.select({ id: infraDatasetVersion.id, revision: infraDatasetVersion.revision,
    fuente: infraDatasetVersion.fuente, fechaFuente: infraDatasetVersion.fechaFuente,
    creadaEn: infraDatasetVersion.creadaEn, filas: infraDatasetVersion.filas,
  }).from(infraDatasetVersion).where(eq(infraDatasetVersion.datasetId, datasetId)).orderBy(infraDatasetVersion.creadaEn)
}

export async function publicarVersion(datasetId: string, versionId: string, db: Db = getDb(), proyectar?: (tx: TxDataset) => Promise<void>) {
  describirAuditoria({ objetoTipo: 'dataset', objetoId: datasetId, metadatos: { datasetId, versionId } })
  const seleccion = await leerVersion(datasetId, versionId, db)
  if (!seleccion) throw new Error('Versión inexistente para el dataset')
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('infra-datasets-publicacion'))`)
    if (datasetId === 'localizaciones') await proyectarLocalizaciones(tx, seleccion.documento as Datos[])
    if (proyectar) await proyectar(tx)
    await tx.insert(infraDatasetPublicacion).values({ datasetId, versionId }).onConflictDoUpdate({
      target: infraDatasetPublicacion.datasetId, set: { versionId, publicadaEn: new Date() },
    })
  })
  estadoReferencias().cargadoEn = 0
}

export async function cargarReferencias(db: Db = getDb(), forzar = false) {
  const estado = estadoReferencias()
  if (!forzar && estado.cargadoEn && Date.now() - estado.cargadoEn < 60_000) return
  const ids = Object.keys(DATASETS_REFERENCIA)
  // Un statement para que todos los documentos correspondan al mismo snapshot.
  const respuesta = await db.execute(sql`
    SELECT v.dataset_id, v.id, v.revision, v.formato, v.estructura,
      coalesce(jsonb_agg(r.datos ORDER BY r.orden) FILTER (WHERE r.version_id IS NOT NULL), '[]'::jsonb) AS filas
    FROM infra_dataset_publicacion p JOIN infra_dataset_version v ON v.id=p.version_id
    LEFT JOIN infra_dataset_registro r ON r.version_id=v.id
    WHERE p.dataset_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    GROUP BY v.id`)
  const filas = (respuesta as { rows: Record<string, unknown>[] }).rows
  if (!filas.length) return // instalaciones de otros módulos sin datos de infraestructura
  const nuevas = new Map<string, { versionId: string; revision: string; documento: unknown }>()
  for (const fila of filas) nuevas.set(String(fila.dataset_id), {
    versionId: String(fila.id), revision: String(fila.revision),
    documento: reconstruirDocumento(String(fila.formato), fila.estructura as Datos, fila.filas as Datos[]),
  })
  estado.referencias = nuevas
  estado.cargadoEn = Date.now()
}

export async function versionesPublicadas(ids: string[], db: Db = getDb()) {
  return db.select().from(infraDatasetPublicacion).where(inArray(infraDatasetPublicacion.datasetId, ids))
}
