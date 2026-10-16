import { getDb } from '@/lib/db'
import { and, eq } from 'drizzle-orm'
import { infraDatasetEntrega, infraDatasetVersion } from '@/lib/db/schema'
import { guardarVersion, type TxDataset } from '../datasets/repositorio'
import type { Datos } from '../datasets/codec'
import { guardarLecturasPrefectura, type LecturaResuelta } from './lecturas-repo'
import { guardarReferencia, type FilaReferencia } from './referencia-repo'
import { actualizarSaludFuente } from '../riesgo/jobs/salud-fuente'

export type CorridaPrefectura = {
  tipo: 'alturas' | 'referencias'; jobRunId: string; capturadaEn: string
  filas: Datos[]; catalogoVersion: string
  lecturasOriginales?: Datos[]
  estacionesConError?: number
  originalesNoDisponibles?: boolean
}

export async function guardarSaludCorrida(tx: TxDataset, corrida: CorridaPrefectura) {
  await actualizarSaludFuente(tx as ReturnType<typeof getDb>, {
    provider: corrida.tipo === 'alturas' ? 'prefectura-alturas' : 'prefectura-historico',
    ttlMinutos: corrida.tipo === 'alturas' ? 120 : 2160,
    estado: corrida.estacionesConError ? 'degradado' : 'ok',
    ultimoErrorSaneado: corrida.estacionesConError ? 'Fallo parcial al sincronizar el histórico de Prefectura' : null,
    licencia: 'Prefectura Naval Argentina — sin términos publicados; atribución a PNA',
    ahoraIso: corrida.capturadaEn,
  })
}

export async function proyectarPrefectura(tx: TxDataset, corrida: CorridaPrefectura) {
  if (corrida.tipo === 'alturas') return guardarLecturasPrefectura(tx as ReturnType<typeof getDb>,
    corrida.filas as LecturaResuelta[], { capturadaEn: corrida.capturadaEn, catalogoVersion: corrida.catalogoVersion })
  for (const fila of corrida.filas) await guardarReferencia(tx as ReturnType<typeof getDb>, fila as FilaReferencia)
  return { guardadas: corrida.filas.length }
}

/** Archivo, proyección y entrega pendiente se confirman juntos. No usa la red. */
export async function publicarCorridaPrefectura(corrida: CorridaPrefectura, db = getDb()) {
  return db.transaction(async (tx) => {
    // Usar el catálogo fijado al comenzar el job, aunque mientras descarga
    // el histórico otro proceso publique uno nuevo.
    const entradas: string[] = []
    if (process.env.NODE_ENV === 'production' && !/^[a-f0-9]{64}$/.test(corrida.catalogoVersion)) {
      throw new Error('Se requiere un catálogo versionado para publicar')
    }
    if (/^[a-f0-9]{64}$/.test(corrida.catalogoVersion)) {
      const [catalogo] = await tx.select({ id: infraDatasetVersion.id }).from(infraDatasetVersion).where(and(
        eq(infraDatasetVersion.id, corrida.catalogoVersion), eq(infraDatasetVersion.datasetId, 'estaciones-prefectura')))
      if (!catalogo) throw new Error('Catálogo de entrada inexistente')
      entradas.push(catalogo.id)
    }
    let resultado: Awaited<ReturnType<typeof proyectarPrefectura>> | undefined
    const versionId = await guardarVersion({
      datasetId: `prefectura-${corrida.tipo}`, nombre: `Prefectura ${corrida.tipo}`,
      revision: 'prefectura-v1', fuente: 'Prefectura Naval Argentina',
      licencia: 'Sin términos publicados; atribución a PNA', fechaFuente: corrida.capturadaEn,
      formato: 'array', clave: corrida.tipo === 'referencias' ? 'estacionId' : undefined,
      claves: corrida.tipo === 'alturas' ? corrida.filas.map((f) => `${f.estacionId}/${f.medidaEn ?? 'sin-fecha'}`) : undefined,
      datos: corrida.filas, entradas,
      metadatos: { jobRunId: corrida.jobRunId, tipo: corrida.tipo, catalogoVersion: corrida.catalogoVersion,
        codigoRevision: process.env.APP_REVISION ?? 'desconocida',
        estacionesConError: corrida.estacionesConError ?? 0,
        originalesNoDisponibles: corrida.originalesNoDisponibles ?? false,
        lecturasOriginales: corrida.lecturasOriginales ?? [] },
    }, tx as typeof db, true, async (proyeccion) => { resultado = await proyectarPrefectura(proyeccion, corrida) })
    if (process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).pathname === '/hub_prod') {
      await tx.insert(infraDatasetEntrega).values({ versionId, destino: 'staging' }).onConflictDoNothing()
    }
    return { versionId, resultado: resultado! }
  })
}
