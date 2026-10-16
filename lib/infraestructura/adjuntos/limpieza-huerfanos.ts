import {
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type _Object,
} from '@aws-sdk/client-s3'
import { getDb } from '@/lib/db'
import { infraAdjunto } from '@/lib/db/schema'
import { readObsConfig } from './obs'

export const BUCKET_REPORTES = 'reportes-infraestructura'
export const GRACIA_HUERFANOS_MS = 24 * 60 * 60 * 1000

export type ObjetoReporte = { key: string; lastModified: Date | undefined }
export type ResultadoLimpiezaHuerfanos = {
  dryRun: boolean
  examinados: number
  referenciados: number
  recientes: number
  candidatos: number
  movidos: number
}

export type DependenciasLimpieza = {
  listar: () => Promise<ObjetoReporte[]>
  clavesAdjuntas: () => Promise<Set<string>>
  moverAHuerfanos: (key: string) => Promise<void>
  log: (message: string) => void
}

/** Plans and optionally quarantines old report objects with no attachment row. */
export async function limpiarObjetosHuerfanos(
  options: { dryRun?: boolean; ahora?: Date; graciaMs?: number } = {},
  dependencies: DependenciasLimpieza = crearDependencias(),
): Promise<ResultadoLimpiezaHuerfanos> {
  const dryRun = options.dryRun ?? true
  const ahora = options.ahora ?? new Date()
  const graciaMs = options.graciaMs ?? GRACIA_HUERFANOS_MS
  if (!Number.isFinite(graciaMs) || graciaMs < 0) throw new TypeError('Invalid orphan grace period.')

  const objetos = await dependencies.listar()
  const clavesAdjuntas = await dependencies.clavesAdjuntas()
  const resultado: ResultadoLimpiezaHuerfanos = {
    dryRun,
    examinados: 0,
    referenciados: 0,
    recientes: 0,
    candidatos: 0,
    movidos: 0,
  }

  for (const objeto of objetos) {
    if (!objeto.key.startsWith('reportes/') || objeto.key.includes('/../')) continue
    resultado.examinados += 1
    if (clavesAdjuntas.has(objeto.key)) {
      resultado.referenciados += 1
      continue
    }
    if (!objeto.lastModified || ahora.getTime() - objeto.lastModified.getTime() < graciaMs) {
      resultado.recientes += 1
      continue
    }
    resultado.candidatos += 1
    if (dryRun) {
      dependencies.log(`[adjuntos-limpieza] dry-run would quarantine ${objeto.key}`)
      continue
    }
    await dependencies.moverAHuerfanos(objeto.key)
    resultado.movidos += 1
    dependencies.log(`[adjuntos-limpieza] quarantined ${objeto.key}`)
  }

  dependencies.log(`[adjuntos-limpieza] ${JSON.stringify(resultado)}`)
  return resultado
}

function crearDependencias(): DependenciasLimpieza {
  const config = readObsConfig()
  if (config.bucket !== BUCKET_REPORTES) {
    throw new Error(`OBS_BUCKET must be ${BUCKET_REPORTES} for orphan cleanup.`)
  }
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  })

  return {
    async listar() {
      const objetos: ObjetoReporte[] = []
      let continuationToken: string | undefined
      do {
        const page = await client.send(new ListObjectsV2Command({
          Bucket: BUCKET_REPORTES,
          Prefix: 'reportes/',
          ContinuationToken: continuationToken,
        }))
        objetos.push(...(page.Contents ?? []).flatMap((item: _Object) =>
          item.Key ? [{ key: item.Key, lastModified: item.LastModified }] : [],
        ))
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (continuationToken)
      return objetos
    },
    async clavesAdjuntas() {
      const db = getDb()
      const filas = await db.select({
        optimizada: infraAdjunto.optimizadaObsKey,
        miniatura: infraAdjunto.miniaturaObsKey,
      }).from(infraAdjunto)
      return new Set(filas.flatMap((fila) => [fila.optimizada, fila.miniatura]))
    },
    async moverAHuerfanos(key) {
      const quarantineKey = `huerfanos/${key}`
      await client.send(new CopyObjectCommand({
        Bucket: BUCKET_REPORTES,
        Key: quarantineKey,
        CopySource: `${BUCKET_REPORTES}/${encodeURIComponent(key).replaceAll('%2F', '/')}`,
      }))
      await client.send(new DeleteObjectCommand({ Bucket: BUCKET_REPORTES, Key: key }))
    },
    log: (message) => console.info(message),
  }
}
