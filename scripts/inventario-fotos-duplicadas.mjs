#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const HELP = `Usage: node scripts/inventario-fotos-duplicadas.mjs --config FILE [--output DIR]
Reads existing dotenv or Coolify JSON configuration inside this process.
Only hub_prod is accepted. No storage access, changes, cleanup, migrations or deployment.
Writes grupos.csv, grupos.json, resumen.json and README.md to a private local directory.
--help prints this message without loading configuration or connecting.\n`

export function parseConfig(content) {
  try {
    let values
    const trimmed = content.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const parsed = JSON.parse(trimmed)
      const entries = Array.isArray(parsed) ? parsed : (parsed.environment_variables ?? parsed.envs)
      values = Array.isArray(entries) ? Object.fromEntries(entries.map(entry => [entry.key ?? entry.name, entry.value])) : parsed
    } else {
      values = Object.fromEntries(content.split(/\r?\n/).flatMap(line => {
        const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/)
        if (!match) return []
        let value = match[2]
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
        else value = value.replace(/\s+#.*$/, '')
        return [[match[1], value]]
      }))
    }
    const connectionString = values.DATABASE_URL ?? values.POSTGRES_URL
    const url = new URL(connectionString)
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || decodeURIComponent(url.pathname.slice(1)) !== 'hub_prod') throw Error()
    // Explicit options prevent a writable default transaction before BEGIN.
    return { connectionString, database: 'hub_prod', options: '-c default_transaction_read_only=on -c statement_timeout=20000 -c lock_timeout=3000', connectionTimeoutMillis: 10000, query_timeout: 25000, application_name: 'photo_duplicate_inventory_readonly' }
  } catch {
    throw new Error('Invalid database configuration.')
  }
}

export const PHOTO_SQL = `SELECT a.id, p.id AS "parteId", p.cue_anexo AS cue,
 a.movimiento_id AS "movimientoId", m.tipo, m.creada_en AS "creadaEn",
 a.creada_por AS "creadaPor", u.name AS autor, a.estado,
 a.optimizada_etag AS "optimizadaEtag", a.optimizada_size AS "optimizadaSize",
 a.miniatura_etag AS "miniaturaEtag", a.miniatura_size AS "miniaturaSize",
 m.resumen->>'documentaMovimientoId' AS "documentaMovimientoId",
 base.tipo AS "documentaTipo", base.creada_en AS "documentaCreadaEn"
 FROM infra_adjunto a JOIN infra_movimiento m ON m.id = a.movimiento_id
 JOIN infra_parte p ON p.id = m.parte_id
 LEFT JOIN "user" u ON u.id = a.creada_por
 LEFT JOIN infra_movimiento base ON base.id = m.resumen->>'documentaMovimientoId' AND base.parte_id = p.id
 WHERE a.estado IN ('confirmed', 'pending') ORDER BY p.id, m.creada_en, a.id`

export async function readInventory(client) {
  let connected = false
  // pg may emit idle connection errors outside a query promise. Never let its
  // default unhandled-event path print driver configuration or server details.
  client.on?.('error', () => undefined)
  try {
    await client.connect(); connected = true
    await client.query('BEGIN')
    await client.query('SET TRANSACTION READ ONLY')
    const identity = await client.query('SELECT current_database() AS database')
    if (identity.rows[0]?.database !== 'hub_prod') throw Error()
    const count = await client.query('SELECT count(*)::integer AS total FROM infra_parte')
    const photos = await client.query(PHOTO_SQL)
    return buildInventory(photos.rows, count.rows[0].total)
  } catch {
    throw new Error('Inventory query failed.')
  } finally {
    if (connected) {
      try { await client.query('ROLLBACK') } catch { /* Never disclose driver errors. */ }
    }
    try { await client.end() } catch { /* Never disclose driver errors. */ }
  }
}

function fingerprint(row) {
  if (typeof row.optimizadaEtag !== 'string' || !row.optimizadaEtag.trim() || typeof row.miniaturaEtag !== 'string' || !row.miniaturaEtag.trim() || !(Number(row.optimizadaSize) > 0) || !(Number(row.miniaturaSize) > 0)) return null
  return JSON.stringify([row.optimizadaEtag.trim().replace(/^"|"$/g,''), Number(row.optimizadaSize), row.miniaturaEtag.trim().replace(/^"|"$/g,''), Number(row.miniaturaSize)])
}

export function buildInventory(rows, reportsScanned) {
  const batches = new Map()
  const fingerprints = new Map()
  let unknown = 0
  for (const row of rows) {
    const key = fingerprint(row)
    const batchKey = JSON.stringify([row.parteId,row.movimientoId])
    if (!batches.has(batchKey)) batches.set(batchKey, [])
    batches.get(batchKey).push(key)
    if (!key) { unknown++; continue }
    const groupKey = JSON.stringify([row.parteId,key])
    if (!fingerprints.has(groupKey)) fingerprints.set(groupKey, [])
    fingerprints.get(groupKey).push(row)
  }
  const grupos = []
  for (const photos of fingerprints.values()) {
    if (photos.length < 2) continue
    const first = photos[0]
    const movements = new Set(photos.map(row => row.movimientoId))
    const baseIds = new Set(photos.map(row => row.documentaMovimientoId))
    const explicitDistinct = baseIds.size > 1 && photos.every(row => row.documentaMovimientoId && ['confirmacion','actualizacion'].includes(row.documentaTipo))
    const batchSignatures = photos.map(row => batches.get(JSON.stringify([row.parteId,row.movimientoId])))
    const completeBatches = batchSignatures.every(batch => batch.every(Boolean) && JSON.stringify([...batch].sort()) === JSON.stringify([...batchSignatures[0]].sort()))
    const times = photos.map(row => Date.parse(row.creadaEn))
    const closeInTime = times.every(Number.isFinite) && Math.max(...times) - Math.min(...times) <= 30 * 60 * 1000
    const accidental = movements.size === photos.length && baseIds.size === 1 && Boolean(first.documentaMovimientoId) && photos.every(row => row.tipo === 'evidencia_fotografica' && row.creadaPor && row.creadaPor === first.creadaPor) && completeBatches && closeInTime
    const clasificacion = explicitDistinct ? 'LEGITIMO' : accidental ? 'ACCIDENTAL' : 'DUDOSO'
    const safePhotos = photos.map(row => ({ id: row.id, movimientoId: row.movimientoId, tipo: row.tipo, creadaEn: row.creadaEn, creadaPor: row.creadaPor, autor: row.autor, estado: row.estado, documentaMovimientoId: row.documentaMovimientoId, documentaTipo: row.documentaTipo, documentaCreadaEn: row.documentaCreadaEn }))
    grupos.push({ grupo: grupos.length + 1, parteId: first.parteId, reporteId: first.parteId, cue: first.cue, clasificacion, filas: photos.length, filasExtra: photos.length - 1, bytesExtra: (photos.length - 1) * (Number(first.optimizadaSize) + Number(first.miniaturaSize)), optimizadaSize: Number(first.optimizadaSize), miniaturaSize: Number(first.miniaturaSize), fotos: safePhotos })
  }
  return { grupos, resumen: { reportesEscaneados: reportsScanned, fotosEscaneadas: rows.length, fotosSinHuellaCompleta: unknown, gruposConDuplicados: grupos.length, accidentales: grupos.filter(group => group.clasificacion === 'ACCIDENTAL').length, legitimos: grupos.filter(group => group.clasificacion === 'LEGITIMO').length, dudosos: grupos.filter(group => group.clasificacion === 'DUDOSO').length, filasFotosExtra: grupos.reduce((sum, group) => sum + group.filasExtra, 0), bytesInvolucrados: grupos.reduce((sum, group) => sum + group.bytesExtra, 0) } }
}

export function csv(rows) {
  const headers = rows.length ? Object.keys(rows[0]) : ['grupo','parteId','reporteId','cue','clasificacion','filas','filasExtra','bytesExtra']
  const encode = value => {
    let text = value == null ? '' : String(value)
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"','""')}"`
  }
  return [headers.map(encode).join(','), ...rows.map(row => headers.map(header => encode(row[header])).join(','))].join('\n') + '\n'
}

const METHODOLOGY = `# Read-only photo duplicate inventory

The script uses an explicitly read-only PostgreSQL transaction (BEGIN, SET TRANSACTION READ ONLY, SELECT only, ROLLBACK). The connection also requests default_transaction_read_only, statement_timeout and lock_timeout. It verifies current_database() is hub_prod. No storage objects are read, downloaded, moved or deleted.

All reports in infra_parte are counted. Both pending and confirmed infra_adjunto rows are scanned and joined with their movement, report/CUE, attachment author and explicitly documented base movement. Attachment creation time is unavailable in this schema; creadaEn is the movement creation time. Report ID is the parte ID. Raw movement summaries are deliberately not exported: only the documented movement ID, type and time are extracted, avoiding arbitrary free text and URLs.

A duplicate group requires the same report and complete optimized ETag+size AND thumbnail ETag+size. ETags are metadata heuristics, NOT cryptographic proof or a global content identity. Missing ETags/sizes are excluded and counted separately; pending rows without fingerprints remain unknown. No storage keys, object URLs, credentials or raw ETags are exported.

ACCIDENTAL requires distinct photo-only movements, the same known author, the same explicit documented movement, identical complete photo-batch multisets, and a maximum 30-minute span. LEGITIMO requires distinct explicitly documented confirmation/update movements. Every other candidate is DUDOSO, including partial batch overlaps, unknown authors/bases and repetitions within one movement. These are investigation classifications, never deletion approval.

Extra rows and bytes count each fingerprint's occurrences minus one, including optimized and thumbnail declared sizes. This measures duplicated metadata payload, not proven physical reclaimable bytes (objects might be shared). Totals include all classifications. CSV expands groups to photo rows; group totals repeat and must not be summed from that expanded CSV. JSON is authoritative for grouped totals. Spreadsheet formula prefixes are neutralized in CSV.

Configuration is loaded only inside the process from explicit --config FILE (dotenv DATABASE_URL/POSTGRES_URL, JSON object, or Coolify key/value arrays). No implicit shell/SSH credentials are inspected. Use --help for CLI syntax. Output is local, directory mode 0700 and files mode 0600. Errors are deliberately generic and never include driver/parser details. No cleanup is performed; propose manual review and a separately authorized backup/cleanup plan.
`

export async function prepareOutput(directory) {
  await mkdir(dirname(directory), { mode: 0o700, recursive: true })
  await mkdir(directory, { mode: 0o700, recursive: false })
}

export async function main(args = process.argv.slice(2)) {
  try {
    if (args.length === 1 && args[0] === '--help') { process.stdout.write(HELP); return 0 }
    let configFile, output
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--config' && args[i+1]) configFile = args[++i]
      else if (args[i] === '--output' && args[i+1]) output = args[++i]
      else throw Error()
    }
    if (!configFile) throw Error()
    const config = parseConfig(await readFile(configFile, 'utf8'))
    const { default: pg } = await import('pg')
    const result = await readInventory(new pg.Client(config))
    const timestamp = new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15)
    const directory = resolve(output ?? join(homedir(), 'orca/backups', `inventario-fotos-${timestamp}`))
    await prepareOutput(directory)
    const flat = result.grupos.flatMap(({ fotos, ...group }) => fotos.map(photo => ({ ...group, ...photo })))
    for (const [name, content] of [['grupos.json',JSON.stringify(result.grupos,null,2)], ['resumen.json',JSON.stringify(result.resumen,null,2)], ['grupos.csv',csv(flat)], ['README.md',METHODOLOGY]]) await writeFile(join(directory,name), content, {mode:0o600,flag:'wx'})
    process.stdout.write('Inventory completed. Local output files created.\n')
    return 0
  } catch {
    process.stderr.write('Inventory could not be completed. Configuration, connection or output unavailable.\n')
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main()
