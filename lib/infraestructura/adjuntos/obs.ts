import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const MAX_ATTACHMENTS = 3
export const MAX_OPTIMIZED_BYTES = 600 * 1024
export const MAX_THUMBNAIL_BYTES = 40 * 1024
export const AUTHORIZATION_TTL_SECONDS = 10 * 60

export type VariantAuthorization = {
  url: string
  key: string
  contentType: 'image/jpeg'
  contentLength: number
  expiresAt: string
}

export type AttachmentAuthorization = {
  attachmentId: string
  optimizada: VariantAuthorization
  miniatura: VariantAuthorization
}

export type AttachmentDeclaration = {
  attachmentId: string
  bytesOptimizado: number
  bytesMiniatura: number
}

export type AttachmentObjectMetadata = {
  etag: string
  size: number
  contentType: string
}

export class ObsObjectMissingError extends Error {
  constructor() {
    super('OBS object is not present.')
    this.name = 'ObsObjectMissingError'
  }
}

type ObsConfig = {
  bucket: string
  region: string
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
}

export class ObsConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ObsConfigurationError'
  }
}

export function readObsConfig(env: NodeJS.ProcessEnv = process.env): ObsConfig {
  const config = {
    bucket: env.OBS_BUCKET,
    region: env.OBS_REGION,
    endpoint: env.OBS_ENDPOINT,
    accessKeyId: env.OBS_ACCESS_KEY_ID,
    secretAccessKey: env.OBS_SECRET_ACCESS_KEY,
  }
  const environmentNames: Record<keyof ObsConfig, string> = {
    bucket: 'OBS_BUCKET',
    region: 'OBS_REGION',
    endpoint: 'OBS_ENDPOINT',
    accessKeyId: 'OBS_ACCESS_KEY_ID',
    secretAccessKey: 'OBS_SECRET_ACCESS_KEY',
  }
  const missing = Object.entries(config)
    .filter(([, value]) => !value?.trim())
    .map(([key]) => environmentNames[key as keyof ObsConfig])
  if (missing.length > 0) throw new ObsConfigurationError(`Missing OBS configuration: ${missing.join(', ')}`)

  let endpointUrl: URL
  try {
    endpointUrl = new URL(config.endpoint!)
  } catch {
    throw new ObsConfigurationError('OBS_ENDPOINT must be a valid URL.')
  }
  if (endpointUrl.protocol !== 'https:') throw new ObsConfigurationError('OBS_ENDPOINT must use HTTPS.')

  return config as ObsConfig
}

export function validateAttachmentDeclarations(value: unknown): value is AttachmentDeclaration[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ATTACHMENTS) return false
  const seen = new Set<string>()
  return value.every((item) => {
    if (typeof item !== 'object' || item === null) return false
    const candidate = item as Partial<AttachmentDeclaration>
    if (typeof candidate.attachmentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.attachmentId)) return false
    if (seen.has(candidate.attachmentId)) return false
    seen.add(candidate.attachmentId)
    return Number.isInteger(candidate.bytesOptimizado) && candidate.bytesOptimizado! > 0 && candidate.bytesOptimizado! <= MAX_OPTIMIZED_BYTES
      && Number.isInteger(candidate.bytesMiniatura) && candidate.bytesMiniatura! > 0 && candidate.bytesMiniatura! <= MAX_THUMBNAIL_BYTES
  })
}

type CachedAuthorization = { validUntil: number; value: AttachmentAuthorization }
const authorizationCache = new Map<string, CachedAuthorization>()
let clientCache: { fingerprint: string; client: S3Client } | undefined

function getClient(config: ObsConfig): S3Client {
  const fingerprint = `${config.endpoint}\n${config.region}\n${config.accessKeyId}\n${config.secretAccessKey}`
  if (!clientCache || clientCache.fingerprint !== fingerprint) {
    clientCache = {
      fingerprint,
      client: new S3Client(opcionesClienteObs(config)),
    }
  }
  return clientCache.client
}

function cacheKey(cueAnexo: string, movimientoId: string, item: AttachmentDeclaration): string {
  return `${cueAnexo}:${movimientoId}:${item.attachmentId}:${item.bytesOptimizado}:${item.bytesMiniatura}`
}

/** Signs two exact-size JPEG PUTs per attachment and reuses live signatures in this process. */
export async function authorizeAttachments(
  movimientoId: string,
  cueAnexo: string,
  attachments: AttachmentDeclaration[],
  now = Date.now(),
): Promise<AttachmentAuthorization[]> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(movimientoId)) {
    throw new TypeError('Invalid movement ID.')
  }
  if (!/^[0-9A-Za-z-]{3,16}$/.test(cueAnexo)) throw new TypeError('Invalid school identity.')
  if (!validateAttachmentDeclarations(attachments)) throw new TypeError('Invalid attachment declarations.')

  const config = readObsConfig()
  const client = getClient(config)
  const expiresAtMs = now + AUTHORIZATION_TTL_SECONDS * 1000
  const result: AttachmentAuthorization[] = []

  for (const item of attachments) {
    const key = cacheKey(cueAnexo, movimientoId, item)
    const cached = authorizationCache.get(key)
    if (cached && cached.validUntil > now + 30_000) {
      result.push(cached.value)
      continue
    }

    const optimizadaKey = `reportes/${cueAnexo}/${movimientoId}/${item.attachmentId}/optimizada.jpg`
    const miniaturaKey = `reportes/${cueAnexo}/${movimientoId}/${item.attachmentId}/miniatura.jpg`
    const [optimizadaUrl, miniaturaUrl] = await Promise.all([
      getSignedUrl(client, new PutObjectCommand({
        Bucket: config.bucket,
        Key: optimizadaKey,
        ContentType: 'image/jpeg',
        ContentLength: item.bytesOptimizado,
      }), { expiresIn: AUTHORIZATION_TTL_SECONDS }),
      getSignedUrl(client, new PutObjectCommand({
        Bucket: config.bucket,
        Key: miniaturaKey,
        ContentType: 'image/jpeg',
        ContentLength: item.bytesMiniatura,
      }), { expiresIn: AUTHORIZATION_TTL_SECONDS }),
    ])
    const value: AttachmentAuthorization = {
      attachmentId: item.attachmentId,
      optimizada: { url: optimizadaUrl, key: optimizadaKey, contentType: 'image/jpeg', contentLength: item.bytesOptimizado, expiresAt: new Date(expiresAtMs).toISOString() },
      miniatura: { url: miniaturaUrl, key: miniaturaKey, contentType: 'image/jpeg', contentLength: item.bytesMiniatura, expiresAt: new Date(expiresAtMs).toISOString() },
    }
    authorizationCache.set(key, { validUntil: expiresAtMs, value })
    result.push(value)
  }

  for (const [key, entry] of authorizationCache) {
    if (entry.validUntil <= now) authorizationCache.delete(key)
  }
  while (authorizationCache.size > 500) authorizationCache.delete(authorizationCache.keys().next().value!)
  return result
}

/** Reads object metadata only; image bytes never pass through the application server. */
export async function headAttachmentObjects(
  bucket: string,
  keys: { optimizada: string; miniatura: string },
): Promise<{ optimizada: AttachmentObjectMetadata; miniatura: AttachmentObjectMetadata }> {
  const [optimizada, miniatura] = await Promise.all([
    headAttachmentObject(bucket, keys.optimizada),
    headAttachmentObject(bucket, keys.miniatura),
  ])
  return { optimizada, miniatura }
}

export async function headAttachmentObject(bucket: string, key: string): Promise<AttachmentObjectMetadata> {
  const client = getClient(readObsConfig())
  let result
  try {
    result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
  } catch (error) {
    const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } }
    if (candidate.name === 'NotFound' || candidate.name === 'NoSuchKey' || candidate.$metadata?.httpStatusCode === 404) {
      throw new ObsObjectMissingError()
    }
    throw error
  }
  if (!result.ETag || result.ContentLength === undefined || !result.ContentType) {
    throw new Error('OBS returned incomplete object metadata.')
  }
  return { etag: result.ETag.replaceAll('"', ''), size: result.ContentLength, contentType: result.ContentType }
}

/**
 * Huawei OBS rejects path-style requests ("VirtualHostDomainRequired"), so every client addresses the
 * bucket as a virtual host (`<bucket>.<endpoint host>`), both for server calls and presigned URLs.
 */
export function opcionesClienteObs(config: ReturnType<typeof readObsConfig>) {
  return {
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: false,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  }
}

export function getObsBucket(): string {
  return readObsConfig().bucket
}

export function clearAuthorizationCacheForTests(): void {
  authorizationCache.clear()
  clientCache?.client.destroy()
  clientCache = undefined
}
