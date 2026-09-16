#!/usr/bin/env node
/**
 * Importa un padrón nominal real desde un tablero HTML local y lo carga en
 * ge.sqlite como un nuevo corte.
 * Usage: node scripts/import-padron.mjs <ruta-al-html>
 *
 * El HTML contiene `const STUDENTS_GZ_B64="<base64 gzip json>"`. El JSON tiene
 * forma { c: [...], r: [[...], ...] } donde cada fila es un array posicional.
 * El DNI se usa únicamente en memoria para derivar gePersonId y detectar
 * colisiones: nunca se persiste, no se loguea y no se cifra.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { registerHooks } from 'node:module'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { normalizeCue } from '../lib/infraestructura/cue.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// lib/infraestructura/ge-db.ts importa '@libsql/client' y '@/lib/data-dir'. El alias @/
// lo mapea Node vía tsconfig, pero deja la ruta sin extensión ('../data-dir'), que el
// resolver ESM no completa. Registramos un hook que agrega '.ts' antes de importar.
function resolveTsCandidate(base) {
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const candidate = resolveTsCandidate(join(root, specifier.slice(2)))
      if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true }
    } else if (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')) {
      const base = specifier.startsWith('/')
        ? specifier
        : join(dirname(fileURLToPath(context.parentURL)), specifier)
      const candidate = resolveTsCandidate(base)
      if (candidate) return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const { openGeDb, ensureGeSchema, activarCorte } = await import(
  '../lib/infraestructura/ge-db.ts'
)
const { cifrarIdentidad } = await import('../lib/infraestructura/identidad.ts')

const STUDENTS_GZ_B64_RE = /const\s+STUDENTS_GZ_B64\s*=\s*"([^"]*)"/

const TAMANO_LOTE = 1000

export function extraerB64DeHtml(htmlText) {
  const match = STUDENTS_GZ_B64_RE.exec(htmlText)
  if (!match) throw new Error('No se encontró "const STUDENTS_GZ_B64=" en el HTML')
  return match[1]
}

// Decodifica el blob base64+gzip del padrón embebido en el HTML y parsea el
// JSON resultante ({ c, r }). Lanza si algo de la cadena falla.
export function decodificarPadron(htmlText) {
  const b64 = extraerB64DeHtml(htmlText)
  const comprimido = Buffer.from(b64, 'base64')
  const jsonText = gunzipSync(comprimido).toString('utf8')
  const parsed = JSON.parse(jsonText)
  if (!Array.isArray(parsed?.r)) {
    throw new Error('El JSON del padrón no tiene la forma esperada { c, r } con r como array')
  }
  return parsed
}

// Deriva un entero estable a partir de una clave: sha256 + primeros 6 bytes
// interpretados como entero sin signo (BigInt para no perder precisión).
// Con 6 bytes el resultado siempre cabe en Number.MAX_SAFE_INTEGER, pero si en
// el futuro cambiara el largo del hash se devuelve el BigInt tal cual (libsql
// acepta bigint en columnas INTEGER).
export function derivarEnteroEstable(clave) {
  const digest = createHash('sha256').update(clave, 'utf8').digest()
  let valor = 0n
  for (let i = 0; i < 6; i++) {
    valor = (valor << 8n) | BigInt(digest[i])
  }
  if (valor <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(valor)
  return valor
}

// Separa las filas del padrón en aceptadas y descartadas según CUE válido
// (anexo) y reconciliación contra ge_localizacion, con sus contadores y los
// conjuntos de CUE para el resumen.
export function clasificarFilas(filas, cuesConocidos) {
  const aceptadas = []
  const cuesEnPadron = new Set()
  const cuesConciliados = new Set()
  const cuesDescartados = new Set()
  let descartadosPorCue = 0
  let descartadosPorLocalizacion = 0

  for (const fila of filas) {
    if (!Array.isArray(fila)) continue
    const cue = normalizeCue(String(fila[7] ?? ''))
    if (cue === null || cue.kind !== 'anexo') {
      descartadosPorCue++
      continue
    }
    cuesEnPadron.add(cue.value)
    if (!cuesConocidos.has(cue.value)) {
      descartadosPorLocalizacion++
      cuesDescartados.add(cue.value)
      continue
    }
    cuesConciliados.add(cue.value)
    aceptadas.push({
      dni: String(fila[0] ?? ''),
      apellido: String(fila[1] ?? ''),
      nombre: String(fila[2] ?? ''),
      nivel: String(fila[3] ?? ''),
      cueAnexo: cue.value,
      curso: String(fila[9] ?? ''),
      division: String(fila[10] ?? ''),
      turno: String(fila[11] ?? ''),
    })
  }

  return {
    aceptadas,
    descartadosPorCue,
    descartadosPorLocalizacion,
    cuesEnPadron,
    cuesConciliados,
    cuesDescartados,
  }
}

// Deriva geSectionId por (cueAnexo, curso, division, turno, nivel) y gePersonId
// por DNI. Detecta colisiones entre claves de texto distintas que producen el
// mismo entero y aborta tirando un Error con ambas claves.
export function derivarIds(filasAceptadas) {
  const seccionIdPorClave = new Map()
  const clavePorSeccionId = new Map()
  const personIdPorDni = new Map()
  const dniPorPersonId = new Map()

  const secciones = new Map()
  const personas = new Map()
  const asignaciones = []
  const cuesDistintos = new Set()

  for (const fila of filasAceptadas) {
    const claveSeccion = `${fila.cueAnexo}|${fila.curso}|${fila.division}|${fila.turno}|${fila.nivel}`
    let geSectionId = seccionIdPorClave.get(claveSeccion)
    if (geSectionId === undefined) {
      geSectionId = derivarEnteroEstable(claveSeccion)
      const existente = clavePorSeccionId.get(geSectionId)
      if (existente !== undefined) {
        throw new Error(
          `Colisión de geSectionId entre secciones: "${existente}" y "${claveSeccion}"`,
        )
      }
      seccionIdPorClave.set(claveSeccion, geSectionId)
      clavePorSeccionId.set(geSectionId, claveSeccion)
      secciones.set(geSectionId, {
        cueAnexo: fila.cueAnexo,
        curso: fila.curso,
        division: fila.division,
        nivel: fila.nivel,
        turno: fila.turno,
      })
      cuesDistintos.add(fila.cueAnexo)
    }

    let gePersonId = personIdPorDni.get(fila.dni)
    if (gePersonId === undefined) {
      gePersonId = derivarEnteroEstable(fila.dni)
      const existente = dniPorPersonId.get(gePersonId)
      if (existente !== undefined) {
        throw new Error(`Colisión de gePersonId entre DNIs: "${existente}" y "${fila.dni}"`)
      }
      personIdPorDni.set(fila.dni, gePersonId)
      dniPorPersonId.set(gePersonId, fila.dni)
      personas.set(gePersonId, { nombre: fila.nombre, apellido: fila.apellido })
    }

    asignaciones.push({ geSectionId, gePersonId })
  }

  return { secciones, personas, asignaciones, cuesDistintos }
}

export function deduplicarMembresias(asignaciones) {
  const vistos = new Set()
  const unicas = []
  for (const a of asignaciones) {
    const clave = `${a.geSectionId}:${a.gePersonId}`
    if (vistos.has(clave)) continue
    vistos.add(clave)
    unicas.push(a)
  }
  return unicas
}

function leerClaveIdentidad() {
  const raw = process.env.NOMINAL_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('NOMINAL_ENCRYPTION_KEY no está configurada')
  }
  const clave = Buffer.from(raw, 'base64')
  if (clave.length !== 32) {
    throw new Error('NOMINAL_ENCRYPTION_KEY debe decodificar en base64 a 32 bytes (AES-256)')
  }
  return clave
}

async function ejecutarEnLotes(client, items, fn) {
  for (let i = 0; i < items.length; i += TAMANO_LOTE) {
    const lote = items.slice(i, i + TAMANO_LOTE)
    const tx = await client.transaction('write')
    try {
      for (const item of lote) await fn(tx, item)
      await tx.commit()
    } catch (err) {
      try {
        await tx.rollback()
      } catch {
        // noop: si el commit ya cerró la transacción, el error original manda
      }
      throw err
    }
  }
}

async function insertarSecciones(client, corteId, secciones) {
  await ejecutarEnLotes(client, [...secciones.entries()], async (tx, [geSectionId, sec]) => {
    await tx.execute({
      sql: 'INSERT OR IGNORE INTO ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (?,?,?,?,?,?,?)',
      args: [corteId, geSectionId, sec.cueAnexo, sec.curso, sec.division, sec.nivel, sec.turno],
    })
  })
}

async function insertarMembresias(client, corteId, membresias) {
  await ejecutarEnLotes(client, membresias, async (tx, m) => {
    await tx.execute({
      sql: 'INSERT OR IGNORE INTO ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (?,?,?)',
      args: [corteId, m.geSectionId, m.gePersonId],
    })
  })
}

async function insertarIdentidades(client, personas) {
  const existentesRes = await client.execute('SELECT ge_person_id FROM ge_alumno_identidad')
  const existentes = new Set(existentesRes.rows.map((r) => Number(r.ge_person_id)))
  const pendientes = [...personas.entries()].filter(([gePersonId]) => !existentes.has(gePersonId))

  const clave = leerClaveIdentidad()
  await ejecutarEnLotes(client, pendientes, async (tx, [gePersonId, p]) => {
    const payload = cifrarIdentidad(p.nombre, p.apellido, clave)
    await tx.execute({
      sql: 'INSERT OR IGNORE INTO ge_alumno_identidad (ge_person_id, payload_cifrado) VALUES (?,?)',
      args: [gePersonId, payload],
    })
  })

  return pendientes.length
}

async function main() {
  const rutaHtml = process.argv[2]
  if (!rutaHtml) {
    console.error('Falta el argumento: node scripts/import-padron.mjs <ruta-al-html>')
    process.exit(1)
  }

  console.time('importar-padron')
  const inicio = Date.now()

  const html = readFileSync(rutaHtml, 'utf8')
  const padron = decodificarPadron(html)
  const filas = padron.r

  const client = openGeDb()
  try {
    await ensureGeSchema(client)

    const locRes = await client.execute('SELECT cue_anexo FROM ge_localizacion')
    const cuesConocidos = new Set(locRes.rows.map((r) => String(r.cue_anexo)))

    const clasificacion = clasificarFilas(filas, cuesConocidos)
    const { secciones, personas, asignaciones, cuesDistintos } = derivarIds(
      clasificacion.aceptadas,
    )

    const corteRes = await client.execute({
      sql: "INSERT INTO ge_corte (ciclo_lectivo, fetched_at, estado) VALUES (?, ?, 'importando')",
      args: [new Date().getFullYear(), new Date().toISOString()],
    })
    const corteId = Number(corteRes.lastInsertRowid)

    await insertarSecciones(client, corteId, secciones)
    await insertarMembresias(client, corteId, deduplicarMembresias(asignaciones))
    const identidadesInsertadas = await insertarIdentidades(client, personas)

    try {
      await activarCorte(client, corteId)
    } catch (err) {
      console.error(
        `No se pudo activar el corte ${corteId}; queda en estado 'importando'. ${err.message}`,
      )
      process.exit(1)
    }

    const cuesDescartados = clasificacion.cuesDescartados
    console.log(`Filas leídas: ${filas.length}`)
    console.log(`Alumnos únicos cargados (gePersonId): ${personas.size}`)
    console.log(`Secciones únicas cargadas: ${secciones.size}`)
    console.log(`CUE distintos en el padrón: ${clasificacion.cuesEnPadron.size}`)
    console.log(`CUE conciliados contra ge_localizacion: ${clasificacion.cuesConciliados.size}`)
    console.log(
      `CUE descartados por no existir en ge_localizacion: ${cuesDescartados.size}${
        cuesDescartados.size > 0 && cuesDescartados.size <= 20
          ? ` -> ${[...cuesDescartados].join(', ')}`
          : ''
      }`,
    )
    console.log(`Filas descartadas por CUE inválido: ${clasificacion.descartadosPorCue}`)
    console.log(
      `Filas descartadas por localización inexistente: ${clasificacion.descartadosPorLocalizacion}`,
    )
    console.log(`Identidades cifradas insertadas: ${identidadesInsertadas}`)
    console.log(`Corte id activado: ${corteId}`)
    console.log(`Tiempo total: ${Date.now() - inicio} ms`)
    console.timeEnd('importar-padron')
  } finally {
    client.close()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}