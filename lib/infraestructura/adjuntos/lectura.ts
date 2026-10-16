import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { opcionesClienteObs, readObsConfig } from './obs'

export const READ_URL_TTL_SECONDS = 5 * 60

let clientCache: { fingerprint: string; client: S3Client; bucket: string } | undefined

function getReadClient() {
  const config = readObsConfig()
  const fingerprint = `${config.endpoint}\n${config.region}\n${config.accessKeyId}\n${config.secretAccessKey}`
  if (!clientCache || clientCache.fingerprint !== fingerprint) {
    clientCache?.client.destroy()
    clientCache = {
      fingerprint,
      bucket: config.bucket,
      client: new S3Client(opcionesClienteObs(config)),
    }
  }
  return clientCache
}

export async function firmarLecturaAdjunto(key: string, expiresIn = READ_URL_TTL_SECONDS): Promise<string> {
  if (!key.startsWith('reportes/') || key.includes('..')) throw new TypeError('Invalid attachment object key.')
  const config = getReadClient()
  return getSignedUrl(config.client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), { expiresIn })
}
