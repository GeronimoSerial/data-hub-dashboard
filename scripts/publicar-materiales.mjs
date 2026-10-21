import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

const required = ['OBS_BUCKET', 'OBS_REGION', 'OBS_ENDPOINT', 'OBS_ACCESS_KEY_ID', 'OBS_SECRET_ACCESS_KEY']
const missing = required.filter(name => !process.env[name]?.trim())
if (missing.length) throw new Error(`Faltan variables: ${missing.join(', ')}`)
if (new URL(process.env.OBS_ENDPOINT).protocol !== 'https:') throw new Error('OBS_ENDPOINT debe usar HTTPS')
const client = new S3Client({
  region: process.env.OBS_REGION,
  endpoint: process.env.OBS_ENDPOINT,
  forcePathStyle: process.env.OBS_FORCE_PATH_STYLE === 'true',
  credentials: { accessKeyId: process.env.OBS_ACCESS_KEY_ID, secretAccessKey: process.env.OBS_SECRET_ACCESS_KEY },
})
try {
  const catalogo = JSON.parse(await readFile(new URL('../data/materiales.json', import.meta.url), 'utf8'))
  // Validate all local files before publishing any object.
  const archivos = await Promise.all(catalogo.map(async item => {
    const body = await readFile(path.join(process.env.DATA_DIR || '.data', 'materiales', item.archivo))
    if (body.length !== item.bytes || createHash('sha256').update(body).digest('hex') !== item.sha256) throw new Error(`El archivo no coincide con el catálogo: ${item.id}`)
    return { item, body }
  }))
  for (const { item, body } of archivos) {
    await client.send(new PutObjectCommand({
      Bucket: process.env.OBS_BUCKET, Key: item.storageKey, Body: body,
      ContentType: 'application/pdf', ContentDisposition: `attachment; filename="${item.id}.pdf"`,
      CacheControl: 'public, max-age=31536000, immutable', Metadata: { sha256: item.sha256 },
    }))
    const check = await client.send(new HeadObjectCommand({ Bucket: process.env.OBS_BUCKET, Key: item.storageKey }))
    if (check.ContentLength !== item.bytes || check.Metadata?.sha256 !== item.sha256) throw new Error(`No se pudo verificar ${item.id}`)
    console.log(`Verificado: ${item.storageKey} (${item.bytes} bytes)`)
  }
  console.log('Publicación completa. Configurar MATERIALES_STORAGE=s3 y reiniciar la aplicación.')
} finally { client.destroy() }
