#!/usr/bin/env node
/**
 * Importa el padrón nominal (Gestión Educativa o un tablero HTML local) al
 * schema `ge` como un corte nuevo y lo activa.
 * Uso: ver USO más abajo (`--ge`, `<ruta-al-html>`, `--mantenimiento`).
 *
 * Diseño (fix de los cortes que quedaban colgados en 'importando'):
 * - Streaming: cada página del origen se concilia, se deriva y se persiste
 *   enseguida; el padrón nunca está entero en memoria.
 * - Inserts multi-fila (unnest) por bloques transaccionales, no fila a fila.
 * - Cada corrida es un job de infra_job_run con lease + heartbeat; termina en
 *   'completado' con contadores o 'fallido' con error saneado.
 * - Si falla o recibe SIGTERM/SIGINT borra su propio corte parcial; si muere
 *   sin poder hacerlo, la próxima corrida lo limpia como huérfano. Tras
 *   activar, rota los históricos (ver lib/infraestructura/ge-cortes.ts).
 *
 * El DNI se usa únicamente en memoria para derivar gePersonId y detectar
 * colisiones: nunca se persiste, no se loguea y no se cifra.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { normalizeCue } from '../lib/infraestructura/cue.ts'

import { registerTsResolver } from './lib/register-ts-resolver.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// lib/infraestructura/ge-db.ts importa '@libsql/client' y '@/lib/data-dir'. El alias @/
// lo mapea Node vía tsconfig, pero deja la ruta sin extensión ('../data-dir'), que el
// resolver ESM no completa. Registramos un hook que agrega '.ts' antes de importar.
registerTsResolver(root)

const { ensureGeSchema, activarCorte, crearEjecutorSql, ejecutarEnTransaccion } = await import(
  '../lib/infraestructura/ge-db.ts'
)
const { eliminarCorte, mantenerCortes, politicaDesdeEntorno } = await import('../lib/infraestructura/ge-cortes.ts')
const { getRawClient } = await import('../lib/db/index.ts')
// Importa el módulo de cifrado aislado, no identidad.ts: ese arrastra el ORM,
// que no es resoluble dentro del bundle standalone de producción.
const { cifrarIdentidad } = await import('../lib/infraestructura/identidad-cripto.ts')

const STUDENTS_GZ_B64_RE = /const\s+STUDENTS_GZ_B64\s*=\s*"([^"]*)"/

const TAMANO_LOTE = 1000

// Pausa entre lotes. El import corre en el mismo contenedor que sirve el sitio:
// ceder el control evita monopolizar CPU y disco mientras escribe.
const PAUSA_ENTRE_LOTES_MS = 15

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

// Pasa una fila posicional del HTML a la forma común del pipeline. El HTML es
// un array por columna; Postgres entrega el mismo objeto ya normalizado (ver
// scripts/padron-ge.mjs), y de ahí en adelante ambos orígenes son idénticos.
export function normalizarFilaHtml(fila) {
  return {
    dni: String(fila[0] ?? ''),
    apellido: String(fila[1] ?? ''),
    nombre: String(fila[2] ?? ''),
    nivel: String(fila[3] ?? ''),
    cueAnexo: String(fila[7] ?? ''),
    curso: String(fila[9] ?? ''),
    division: String(fila[10] ?? ''),
    turno: String(fila[11] ?? ''),
  }
}

// Separa las filas normalizadas en aceptadas y descartadas según CUE válido
// (anexo) y reconciliación contra ge_localizacion, con sus contadores y los
// conjuntos de CUE para el resumen. Es común a los dos orígenes.
export function reconciliarFilas(filas, cuesConocidos) {
  const aceptadas = []
  const cuesEnPadron = new Set()
  const cuesConciliados = new Set()
  const cuesDescartados = new Set()
  let descartadosPorCue = 0
  let descartadosPorLocalizacion = 0

  for (const fila of filas) {
    const cue = normalizeCue(fila.cueAnexo)
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
    aceptadas.push({ ...fila, cueAnexo: cue.value })
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

// Camino del HTML: normaliza y reconcilia en un paso.
export function clasificarFilas(filas, cuesConocidos) {
  return reconciliarFilas(
    filas.filter((fila) => Array.isArray(fila)).map(normalizarFilaHtml),
    cuesConocidos,
  )
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
        throw new Error(`Colisión de gePersonId ${gePersonId} entre dos documentos distintos`)
      }
      personIdPorDni.set(fila.dni, gePersonId)
      dniPorPersonId.set(gePersonId, fila.dni)
      personas.set(gePersonId, { nombre: fila.nombre, apellido: fila.apellido })
    }

    asignaciones.push({ geSectionId, gePersonId })
  }

  return { secciones, personas, asignaciones, cuesDistintos }
}

// Acumulador incremental: misma derivación que derivarIds pero alimentado por
// lotes, para que el padrón completo no tenga que estar en memoria a la vez.
// Las membresías se deduplican al vuelo contra un Set en lugar de construir un
// segundo array del tamaño del padrón.
export function crearAcumulador() {
  const seccionIdPorClave = new Map()
  const clavePorSeccionId = new Map()
  const personIdPorDni = new Map()
  const dniPorPersonId = new Map()

  const secciones = new Map()
  const personas = new Map()
  const membresias = []
  const vistas = new Set()

  return {
    secciones,
    personas,
    membresias,
    agregar(filas) {
      for (const fila of filas) {
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
        }

        let gePersonId = personIdPorDni.get(fila.dni)
        if (gePersonId === undefined) {
          gePersonId = derivarEnteroEstable(fila.dni)
          const existente = dniPorPersonId.get(gePersonId)
          if (existente !== undefined) {
            throw new Error(`Colisión de gePersonId ${gePersonId} entre dos documentos distintos`)
          }
          personIdPorDni.set(fila.dni, gePersonId)
          dniPorPersonId.set(gePersonId, fila.dni)
          personas.set(gePersonId, { nombre: fila.nombre, apellido: fila.apellido })
        }

        const clave = `${geSectionId}:${gePersonId}`
        if (vistas.has(clave)) continue
        vistas.add(clave)
        membresias.push({ geSectionId, gePersonId })
      }
    },
  }
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

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Ejecuta `fn` sobre `items` en lotes de TAMANO_LOTE, cada lote dentro de una
 * transacción atómica (BEGIN/COMMIT con ROLLBACK ante error) y cediendo el
 * control entre lotes para no monopolizar CPU y disco mientras escribe.
 *
 * `conexion` es un contenedor mutable { client, raw }: `client` es el
 * EjecutorSql compartido para lecturas previas y `raw` es el cliente crudo
 * (pg.Pool o PGlite) que ejecutarEnTransaccion necesita para abrir la sesión
 * del lote. `fn` recibe el tx atado a esa transacción, no `conexion.client`:
 * todas las escrituras del lote deben ir por la misma sesión.
 */
export async function ejecutarEnLotes(conexion, items, fn) {
  for (let i = 0; i < items.length; i += TAMANO_LOTE) {
    const lote = items.slice(i, i + TAMANO_LOTE)
    await ejecutarEnTransaccion(conexion.raw, async (tx) => {
      for (const item of lote) await fn(tx, item)
    })
    if (PAUSA_ENTRE_LOTES_MS > 0) await dormir(PAUSA_ENTRE_LOTES_MS)
  }
}

// Inserciones multi-fila: una sentencia por bloque con unnest() de arrays
// en vez de un INSERT por fila. El import anterior hacía ~560.000 round-trips
// (uno por sección, membresía e identidad); con bloques de TAMANO_BLOQUE son
// unos cientos, y la ventana en la que el proceso puede morir a mitad de
// camino pasa de decenas de minutos a segundos.
export const TAMANO_BLOQUE = 2000

/**
 * Igual que ejecutarEnLotes pero `fn` recibe el bloque entero (para una
 * sentencia multi-fila). Cada bloque es una transacción atómica en una
 * conexión dedicada. `debeAbortar` se consulta entre bloques: si devuelve un
 * Error, se lanza y el import corta limpio en el borde de un bloque.
 */
export async function ejecutarEnBloques(conexion, items, fn, { tamano = TAMANO_BLOQUE } = {}) {
  for (let i = 0; i < items.length; i += tamano) {
    const abortar = conexion.debeAbortar?.()
    if (abortar) throw abortar
    const bloque = items.slice(i, i + tamano)
    await ejecutarEnTransaccion(conexion.raw, (tx) => fn(tx, bloque))
    if (PAUSA_ENTRE_LOTES_MS > 0) await dormir(PAUSA_ENTRE_LOTES_MS)
  }
}

export async function insertarSecciones(conexion, corteId, secciones) {
  await ejecutarEnBloques(conexion, [...secciones.entries()], async (tx, bloque) => {
    await tx.execute({
      sql: `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno)
            SELECT ?::integer, u.sid, u.cue, u.curso, u.division, u.nivel, u.turno
              FROM unnest(?::bigint[], ?::text[], ?::text[], ?::text[], ?::text[], ?::text[])
                   AS u(sid, cue, curso, division, nivel, turno)
            ON CONFLICT (corte_id, ge_section_id) DO NOTHING`,
      args: [
        corteId,
        bloque.map(([id]) => id),
        bloque.map(([, s]) => s.cueAnexo),
        bloque.map(([, s]) => s.curso),
        bloque.map(([, s]) => s.division),
        bloque.map(([, s]) => s.nivel),
        bloque.map(([, s]) => s.turno),
      ],
    })
  })
}

export async function insertarMembresias(conexion, corteId, membresias) {
  await ejecutarEnBloques(conexion, membresias, async (tx, bloque) => {
    await tx.execute({
      sql: `INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id)
            SELECT ?::integer, u.sid, u.pid FROM unnest(?::bigint[], ?::bigint[]) AS u(sid, pid)
            ON CONFLICT (corte_id, ge_section_id, ge_person_id) DO NOTHING`,
      args: [corteId, bloque.map((m) => m.geSectionId), bloque.map((m) => m.gePersonId)],
    })
  })
}

// Inserta (cifradas) sólo las identidades que todavía no existen. Antes se
// cargaba en memoria el id de TODAS las identidades de la tabla (~285.000)
// para filtrar; ahora se consulta por bloque, así que sirve para lotes
// parciales del recorrido por streaming.
export async function insertarIdentidades(conexion, personas) {
  const clave = leerClaveIdentidad()
  let insertadas = 0
  await ejecutarEnBloques(conexion, [...personas.entries()], async (tx, bloque) => {
    const existentes = await tx.execute({
      sql: 'SELECT ge_person_id FROM ge.ge_alumno_identidad WHERE ge_person_id = ANY(?::bigint[])',
      args: [bloque.map(([id]) => id)],
    })
    const ya = new Set(existentes.rows.map((r) => Number(r.ge_person_id)))
    const pendientes = bloque.filter(([id]) => !ya.has(id))
    if (pendientes.length === 0) return
    await tx.execute({
      sql: `INSERT INTO ge.ge_alumno_identidad (ge_person_id, payload_cifrado)
            SELECT u.pid, u.payload FROM unnest(?::bigint[], ?::text[]) AS u(pid, payload)
            ON CONFLICT (ge_person_id) DO NOTHING`,
      args: [pendientes.map(([id]) => id), pendientes.map(([, p]) => cifrarIdentidad(p.nombre, p.apellido, clave))],
    })
    insertadas += pendientes.length
  })
  return insertadas
}

// Huella secundaria del documento (bytes 6..9 del mismo sha256 que da el id).
// Sirve para detectar colisiones de gePersonId sin retener el DNI: dos
// documentos distintos con el mismo id de 48 bits casi seguro difieren acá.
function huellaDocumento(dni) {
  return createHash('sha256').update(dni, 'utf8').digest().readUInt32BE(6)
}

/**
 * Derivador incremental para el import por streaming. Recuerda, por todo el
 * recorrido, sólo lo necesario para ids estables y detección de colisiones:
 * secciones (~16.000 claves) y, por persona, un entero (id → huella). No
 * acumula membresías ni identidades: cada lote devuelve lo nuevo y se
 * persiste enseguida.
 */
export function crearDerivador() {
  const clavePorSeccionId = new Map()
  const huellaPorPersonaId = new Map()

  return {
    get secciones() {
      return clavePorSeccionId.size
    },
    get personas() {
      return huellaPorPersonaId.size
    },
    derivar(filasAceptadas) {
      const seccionesNuevas = new Map()
      const personasNuevas = new Map()
      const membresias = []
      const vistas = new Set()

      for (const fila of filasAceptadas) {
        const claveSeccion = `${fila.cueAnexo}|${fila.curso}|${fila.division}|${fila.turno}|${fila.nivel}`
        const geSectionId = derivarEnteroEstable(claveSeccion)
        const existente = clavePorSeccionId.get(geSectionId)
        if (existente === undefined) {
          clavePorSeccionId.set(geSectionId, claveSeccion)
          seccionesNuevas.set(geSectionId, {
            cueAnexo: fila.cueAnexo,
            curso: fila.curso,
            division: fila.division,
            nivel: fila.nivel,
            turno: fila.turno,
          })
        } else if (existente !== claveSeccion) {
          throw new Error(
            `Colisión de geSectionId entre secciones: "${existente}" y "${claveSeccion}"`,
          )
        }

        const gePersonId = derivarEnteroEstable(fila.dni)
        const huella = huellaDocumento(fila.dni)
        const huellaPrevia = huellaPorPersonaId.get(gePersonId)
        if (huellaPrevia === undefined) {
          huellaPorPersonaId.set(gePersonId, huella)
          personasNuevas.set(gePersonId, { nombre: fila.nombre, apellido: fila.apellido })
        } else if (huellaPrevia !== huella) {
          throw new Error(`Colisión de gePersonId ${gePersonId} entre dos documentos distintos`)
        }

        const clave = `${geSectionId}:${gePersonId}`
        if (vistas.has(clave)) continue
        vistas.add(clave)
        membresias.push({ geSectionId, gePersonId })
      }

      return { seccionesNuevas, personasNuevas, membresias }
    },
  }
}

/**
 * Persiste un lote ya reconciliado: secciones nuevas, membresías e
 * identidades nuevas, en ese orden (activarCorte exige que toda membresía
 * tenga su sección). Devuelve contadores del lote.
 */
export async function persistirLote(conexion, corteId, derivador, filasAceptadas) {
  const { seccionesNuevas, personasNuevas, membresias } = derivador.derivar(filasAceptadas)
  await insertarSecciones(conexion, corteId, seccionesNuevas)
  await insertarMembresias(conexion, corteId, membresias)
  const identidadesNuevas = await insertarIdentidades(conexion, personasNuevas)
  return { secciones: seccionesNuevas.size, membresias: membresias.length, identidadesNuevas }
}

// Upsert del catálogo de niveles jurisdiccionales y de la asignación CUE → nivel
// del ciclo. El catálogo va primero: ge_escuela_nivel_jur referencia a sus ids.
export async function insertarNivelesJurisdiccionales(conexion, cicloLectivo, { niveles, cues }) {
  await ejecutarEnLotes(conexion, niveles, async (client, n) => {
    await client.execute({
      sql: 'INSERT INTO ge.ge_nivel_jurisdiccional (id, nombre) VALUES (?,?) ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre',
      args: [n.id, n.nombre],
    })
  })
  await ejecutarEnLotes(conexion, cues, async (client, c) => {
    await client.execute({
      sql: `INSERT INTO ge.ge_escuela_nivel_jur (cue_anexo, nivel_jurisdiccional_id, ciclo_lectivo) VALUES (?,?,?)
            ON CONFLICT (cue_anexo) DO UPDATE SET
              nivel_jurisdiccional_id = EXCLUDED.nivel_jurisdiccional_id,
              ciclo_lectivo = EXCLUDED.ciclo_lectivo`,
      args: [c.cueAnexo, c.nivelJurisdiccionalId, cicloLectivo],
    })
  })
}

// Relee el corte recién cargado y falla si no quedó vigente o quedó vacío.
export async function verificarCorte(client, corteId) {
  const corte = await client.execute({
    sql: 'SELECT estado FROM ge.ge_corte WHERE id = ?',
    args: [corteId],
  })
  const estado = corte.rows[0]?.estado
  if (estado !== 'vigente') {
    throw new Error(`El corte ${corteId} quedó en estado '${estado ?? 'inexistente'}', no 'vigente'`)
  }

  const secciones = await client.execute({
    sql: 'SELECT COUNT(*) AS n FROM ge.ge_seccion WHERE corte_id = ?',
    args: [corteId],
  })
  const membresias = await client.execute({
    sql: 'SELECT COUNT(*) AS n FROM ge.ge_alumno_seccion WHERE corte_id = ?',
    args: [corteId],
  })

  const resultado = {
    estado,
    secciones: Number(secciones.rows[0]?.n ?? 0),
    membresias: Number(membresias.rows[0]?.n ?? 0),
  }
  if (resultado.secciones === 0 || resultado.membresias === 0) {
    throw new Error(`El corte ${corteId} quedó vacío: ${JSON.stringify(resultado)}`)
  }
  return resultado
}

const USO = `Uso:
  node scripts/import-padron.mjs --ge [--ciclo <año>] [--forzar] [--conservar <n>]
      padrón desde Gestión Educativa (Postgres), registrado como job con lease
  node scripts/import-padron.mjs <ruta-al-html> [--forzar] [--conservar <n>]
      padrón desde un tablero HTML local
  node scripts/import-padron.mjs --mantenimiento [--dry-run] [--conservar <n>]
      sólo limpia cortes huérfanos y rota históricos (con --dry-run no escribe nada)

Entorno: PADRON_CORTES_HISTORICOS (históricos a conservar además del vigente, def. 2),
         PADRON_HUERFANO_HORAS (antigüedad para dar por muerto un 'importando', def. 6),
         PADRON_LEASE_MIN (duración del lease, def. 15), PADRON_MIN_PROPORCION (def. 0.5)`

export const TIPO_JOB_PADRON = 'importar-padron-ge'

export class ImportAbortadoError extends Error {
  constructor(motivo) {
    super(`Import abortado: ${motivo}`)
    this.name = 'ImportAbortadoError'
  }
}

// Mensaje apto para infra_job_run.error_saneado y para el log: sin URLs de
// conexión, contraseñas ni números de documento.
export function sanearError(err) {
  const texto = err instanceof Error ? err.message : String(err ?? 'Error desconocido')
  return texto
    .replace(/postgres(ql)?:\/\/\S+/gi, 'postgres://<redactado>')
    .replace(/(password|pwd)\s*=\s*[^;\s]+/gi, '$1=<redactado>')
    .replace(/\b\d{7,9}\b/g, '<num>')
    .slice(0, 500)
}

export function parsearArgumentos(argv) {
  const valor = (flag) => {
    const i = argv.indexOf(flag)
    if (i === -1) return undefined
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} necesita un valor`)
    return v
  }
  const conservar = valor('--conservar')
  if (conservar !== undefined && !/^\d+$/.test(conservar)) throw new Error('--conservar necesita un entero >= 0')
  const conValor = new Set(['--ciclo', '--conservar'])
  const posicionales = argv.filter((a, i) => !a.startsWith('--') && !conValor.has(argv[i - 1]))
  const modo = argv.includes('--mantenimiento') ? 'mantenimiento' : argv.includes('--ge') ? 'ge' : 'html'
  if (modo === 'html' && !posicionales[0]) throw new Error(USO)
  return {
    modo,
    rutaHtml: modo === 'html' ? posicionales[0] : undefined,
    ciclo: valor('--ciclo') ?? String(new Date().getFullYear()),
    forzar: argv.includes('--forzar'),
    dryRun: argv.includes('--dry-run'),
    conservar: conservar === undefined ? undefined : Number(conservar),
  }
}

function numeroEntorno(nombre, porDefecto) {
  const n = Number(process.env[nombre])
  return process.env[nombre] && Number.isFinite(n) && n >= 0 ? n : porDefecto
}

const rssMb = () => Math.round(process.memoryUsage().rss / 1048576)

/**
 * Recorre el origen y persiste lote a lote. No devuelve filas: el padrón
 * nunca está entero en memoria (antes se acumulaba completo, ~500 MB de RSS
 * para 272.000 alumnos, dentro de un contenedor de 1,5 GB compartido con el
 * servidor Next).
 */
async function importarOrigen(opciones, conexion, corteId, cuesConocidos, onProgreso) {
  const derivador = crearDerivador()
  const resumen = {
    leidas: 0,
    sinDocumento: 0,
    descartadosPorCue: 0,
    descartadosPorLocalizacion: 0,
    membresiasEnviadas: 0,
    identidadesNuevas: 0,
    cuesEnPadron: new Set(),
    cuesConciliados: new Set(),
    cuesDescartados: new Set(),
  }

  const consumirLote = async (filas) => {
    const c = reconciliarFilas(filas, cuesConocidos)
    resumen.descartadosPorCue += c.descartadosPorCue
    resumen.descartadosPorLocalizacion += c.descartadosPorLocalizacion
    for (const v of c.cuesEnPadron) resumen.cuesEnPadron.add(v)
    for (const v of c.cuesConciliados) resumen.cuesConciliados.add(v)
    for (const v of c.cuesDescartados) resumen.cuesDescartados.add(v)
    const r = await persistirLote(conexion, corteId, derivador, c.aceptadas)
    resumen.membresiasEnviadas += r.membresias
    resumen.identidadesNuevas += r.identidadesNuevas
  }

  let nivelesJurisdiccionales = null
  if (opciones.modo === 'ge') {
    const { recorrerPadronDesdeGe, leerNivelesJurisdiccionalesDesdeGe } = await import('./padron-ge.mjs')
    console.log(`Origen: Gestión Educativa (Postgres), ciclo ${opciones.ciclo}`)
    const totales = await recorrerPadronDesdeGe({
      cicloLectivo: opciones.ciclo,
      onLote: async (filas) => {
        const abortar = conexion.debeAbortar?.()
        if (abortar) throw abortar
        await consumirLote(filas)
        resumen.leidas += filas.length
        console.log(`  lote: ${resumen.leidas} filas procesadas, RSS ${rssMb()} MB`)
        await onProgreso?.()
      },
    })
    resumen.leidas = totales.leidas
    resumen.sinDocumento = totales.sinDocumento
    if (totales.sinDocumento > 0) {
      console.log(`Filas descartadas por documento vacío: ${totales.sinDocumento}`)
    }
    // El HTML no trae nivel jurisdiccional: en ese caso no se tocan las tablas.
    nivelesJurisdiccionales = await leerNivelesJurisdiccionalesDesdeGe({ cicloLectivo: opciones.ciclo })
    console.log(
      `Niveles jurisdiccionales: ${nivelesJurisdiccionales.niveles.length}, CUE asignados: ${nivelesJurisdiccionales.cues.length}`,
    )
  } else {
    const padron = decodificarPadron(readFileSync(opciones.rutaHtml, 'utf8'))
    console.log(`Origen: HTML ${opciones.rutaHtml}`)
    resumen.leidas = padron.r.length
    await consumirLote(padron.r.filter((fila) => Array.isArray(fila)).map(normalizarFilaHtml))
  }

  if (resumen.membresiasEnviadas === 0) {
    throw new Error(`El origen no devolvió alumnos activos conciliables para el ciclo ${opciones.ciclo}`)
  }
  return { resumen, derivador, nivelesJurisdiccionales }
}

async function hayOtroImportVivo(client, jobRunIdPropio, ahora = new Date()) {
  const existe = await client.execute("SELECT to_regclass('public.infra_job_run') IS NOT NULL AS existe")
  if (!existe.rows[0]?.existe) return false
  const res = await client.execute({
    sql: `SELECT COUNT(*) AS n FROM infra_job_run
           WHERE tipo = ? AND estado = 'en_progreso' AND lease_expira_en > ? AND id <> ?`,
    args: [TIPO_JOB_PADRON, ahora.toISOString(), jobRunIdPropio ?? ''],
  })
  return Number(res.rows[0]?.n ?? 0) > 0
}

function imprimirMantenimiento(titulo, r) {
  const fmt = (lista) => (lista.length === 0 ? '-' : lista.map((c) => `#${c.id}(${c.estado}, ${c.membresias} membresías, ${c.secciones} secciones)`).join(', '))
  console.log(`${titulo}${r.dryRun ? ' [dry-run, no se borró nada]' : ''}`)
  console.log(`  huérfanos 'importando': ${fmt(r.huerfanos)}`)
  console.log(`  históricos a rotar: ${fmt(r.historicosARotar)}`)
  console.log(`  retenidos por partes: ${fmt(r.retenidosPorPartes)}`)
  console.log(`  históricos conservados: ${fmt(r.conservados)}`)
  if (!r.dryRun) console.log(`  eliminados: ${r.eliminados.join(', ') || '-'}; omitidos: ${r.omitidos.join(', ') || '-'}`)
}

async function correrMantenimiento(opciones, conexion, politica) {
  const r = await mantenerCortes(conexion.client, {
    ...politica,
    dryRun: opciones.dryRun,
    hayOtroImportVivo: await hayOtroImportVivo(conexion.client, null),
  })
  imprimirMantenimiento('Mantenimiento de cortes', r)
  return { ejecutado: true, dryRun: r.dryRun, eliminados: r.eliminados, omitidos: r.omitidos }
}

/**
 * Import completo como job de infra_job_run (mismo patrón que jobs.mjs):
 * lease con heartbeat, resultado 'completado' con contadores o 'fallido' con
 * error saneado. Un corte que no llega a vigente se borra antes de salir; si
 * el proceso muere sin poder hacerlo (SIGKILL/OOM), la próxima corrida lo
 * limpia como huérfano.
 */
export async function correrImport(opciones, conexion, deps = {}) {
  const { adquirirLease, renovarLease, publicarResultado } =
    deps.jobRun ?? (await import('../lib/infraestructura/riesgo/job-run.ts'))
  const ahora = deps.ahora ?? new Date()
  const politica = { ...politicaDesdeEntorno(), ...(opciones.conservar === undefined ? {} : { historicosAConservar: opciones.conservar }) }
  const duracionLeaseMs = numeroEntorno('PADRON_LEASE_MIN', 15) * 60_000
  const minProporcion = numeroEntorno('PADRON_MIN_PROPORCION', 0.5)

  if (await hayOtroImportVivo(conexion.client, null, ahora)) {
    console.warn('[import-padron] hay otro import del padrón con lease vigente; no se ejecuta')
    return { ejecutado: false, motivo: 'en_progreso_vigente' }
  }

  // Clave diaria (UTC) por ciclo: dos disparos el mismo día comparten la
  // corrida. --forzar usa una clave única para reimportar a mano.
  const claveIdempotente = `${opciones.ciclo}:${opciones.forzar ? ahora.toISOString() : ahora.toISOString().slice(0, 10)}`
  const lease = await adquirirLease({
    tipo: TIPO_JOB_PADRON,
    claveIdempotente,
    version: deps.version ?? 'desconocida',
    duracionLeaseMs,
    ahora,
  })
  if (!lease.adquirido) {
    console.warn(`[import-padron] no ejecutado: ${lease.motivo} (clave ${claveIdempotente})`)
    return { ejecutado: false, motivo: lease.motivo }
  }

  let abortado = null
  conexion.debeAbortar = () => abortado
  const abortar = (motivo) => {
    if (!abortado) abortado = new ImportAbortadoError(motivo)
  }
  const latir = async () => {
    const ok = await renovarLease({ jobRunId: lease.jobRunId, leaseOwner: lease.leaseOwner, duracionLeaseMs })
    if (!ok) abortar('lease perdido (otro proceso tomó la corrida)')
  }
  const heartbeat = setInterval(() => {
    latir().catch((err) => console.warn(`[import-padron] heartbeat falló: ${sanearError(err)}`))
  }, Math.max(5_000, Math.floor(duracionLeaseMs / 3)))
  heartbeat.unref?.()
  const alSenal = (senal) => {
    console.warn(`[import-padron] recibido ${senal}: se corta en el próximo bloque`)
    abortar(senal)
  }
  process.on('SIGTERM', alSenal)
  process.on('SIGINT', alSenal)

  const inicio = Date.now()
  let corteId = null
  let rssPico = rssMb()
  try {
    // Pasos previos que dependen del origen (p. ej. incorporar escuelas de GE
    // al catálogo): corren con el lease tomado para que su error quede en el job.
    if (deps.prepararOrigen) await deps.prepararOrigen(conexion)

    const previa = await mantenerCortes(conexion.client, {
      ...politica,
      ahora,
      soloHuerfanos: true,
      hayOtroImportVivo: await hayOtroImportVivo(conexion.client, lease.jobRunId, ahora),
    })
    imprimirMantenimiento('Limpieza previa', previa)

    const corteRes = await conexion.client.execute({
      sql: "INSERT INTO ge.ge_corte (ciclo_lectivo, fetched_at, estado) VALUES (?, ?, 'importando') RETURNING id",
      args: [Number(opciones.ciclo), new Date().toISOString()],
    })
    corteId = Number(corteRes.rows[0].id)
    console.log(`Corte ${corteId} creado en 'importando' (job ${lease.jobRunId})`)

    const { resumen, derivador, nivelesJurisdiccionales } = await importarOrigen(
      opciones,
      conexion,
      corteId,
      conexion.cuesConocidos,
      async () => {
        rssPico = Math.max(rssPico, rssMb())
        await latir()
      },
    )
    if (nivelesJurisdiccionales) {
      await insertarNivelesJurisdiccionales(conexion, Number(opciones.ciclo), nivelesJurisdiccionales)
    }
    if (abortado) throw abortado

    // Red de seguridad para el job nocturno: si el origen devolvió de golpe
    // mucho menos que el vigente (GE a medio cargar, filtro roto), no se
    // reemplaza el corte bueno por uno parcial.
    const vigente = await conexion.client.execute(
      "SELECT c.id, (SELECT COUNT(*) FROM ge.ge_alumno_seccion m WHERE m.corte_id = c.id) AS n FROM ge.ge_corte c WHERE c.estado = 'vigente' ORDER BY c.id DESC LIMIT 1",
    )
    const membresiasVigente = Number(vigente.rows[0]?.n ?? 0)
    if (membresiasVigente > 0 && resumen.membresiasEnviadas < membresiasVigente * minProporcion) {
      throw new Error(
        `El corte nuevo trae ${resumen.membresiasEnviadas} membresías contra ${membresiasVigente} del vigente ` +
          `(< ${minProporcion * 100}%); no se activa. Reintentar con PADRON_MIN_PROPORCION=0 si es esperado.`,
      )
    }

    await activarCorte(conexion.client, corteId)
    const verificacion = await verificarCorte(conexion.client, corteId)

    const rotacion = await mantenerCortes(conexion.client, {
      ...politica,
      corteEnCursoId: corteId,
      hayOtroImportVivo: await hayOtroImportVivo(conexion.client, lease.jobRunId),
    })
    imprimirMantenimiento('Rotación', rotacion)

    const cuesDescartados = resumen.cuesDescartados
    console.log(`Filas leídas: ${resumen.leidas}`)
    console.log(`Alumnos únicos cargados (gePersonId): ${derivador.personas}`)
    console.log(`Secciones únicas cargadas: ${derivador.secciones}`)
    console.log(`CUE distintos en el padrón: ${resumen.cuesEnPadron.size}`)
    console.log(`CUE conciliados contra ge_localizacion: ${resumen.cuesConciliados.size}`)
    console.log(
      `CUE descartados por no existir en ge_localizacion: ${cuesDescartados.size}${
        cuesDescartados.size > 0 && cuesDescartados.size <= 20 ? ` -> ${[...cuesDescartados].join(', ')}` : ''
      }`,
    )
    console.log(`Filas descartadas por CUE inválido: ${resumen.descartadosPorCue}`)
    console.log(`Filas descartadas por localización inexistente: ${resumen.descartadosPorLocalizacion}`)
    console.log(`Identidades cifradas insertadas: ${resumen.identidadesNuevas}`)
    console.log(
      `Corte ${corteId} verificado: estado=${verificacion.estado}, ` +
        `secciones=${verificacion.secciones}, membresías=${verificacion.membresias}`,
    )

    const contadores = {
      corteId,
      leidas: resumen.leidas,
      secciones: verificacion.secciones,
      membresias: verificacion.membresias,
      identidadesNuevas: resumen.identidadesNuevas,
      descartadosPorCue: resumen.descartadosPorCue,
      descartadosPorLocalizacion: resumen.descartadosPorLocalizacion,
      sinDocumento: resumen.sinDocumento,
      cortesEliminados: previa.eliminados.length + rotacion.eliminados.length,
      duracionMs: Date.now() - inicio,
      rssPicoMb: rssPico,
    }
    const publicado = await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores,
    })
    return { ejecutado: true, jobRunId: lease.jobRunId, ...contadores, leasePerdido: !publicado }
  } catch (err) {
    const errorSaneado = sanearError(err)
    console.error(`[import-padron] falló: ${errorSaneado}`)
    if (corteId !== null) {
      try {
        const borrado = await eliminarCorte(conexion.client, corteId, ['importando'])
        console.error(`[import-padron] corte ${corteId} ${borrado ? 'eliminado' : 'no se pudo eliminar (queda para la próxima limpieza)'}`)
      } catch (errBorrado) {
        console.error(`[import-padron] no se pudo eliminar el corte ${corteId}: ${sanearError(errBorrado)}`)
      }
    }
    try {
      await publicarResultado({
        jobRunId: lease.jobRunId,
        leaseOwner: lease.leaseOwner,
        estado: 'fallido',
        errorSaneado,
        contadores: { corteId: corteId ?? 0, duracionMs: Date.now() - inicio, rssPicoMb: rssPico },
      })
    } catch {
      // Se conserva el error original.
    }
    throw err
  } finally {
    clearInterval(heartbeat)
    process.off('SIGTERM', alSenal)
    process.off('SIGINT', alSenal)
    conexion.debeAbortar = undefined
  }
}

async function main() {
  const opciones = parsearArgumentos(process.argv.slice(2))
  const raw = getRawClient()
  const conexion = { client: crearEjecutorSql(raw), raw }

  if (opciones.modo === 'mantenimiento') {
    const politica = { ...politicaDesdeEntorno(), ...(opciones.conservar === undefined ? {} : { historicosAConservar: opciones.conservar }) }
    // --dry-run no corre el DDL de ensureGeSchema: sólo SELECTs.
    if (!opciones.dryRun) await ensureGeSchema(conexion.client)
    return correrMantenimiento(opciones, conexion, politica)
  }

  await ensureGeSchema(conexion.client)
  // Con --ge, antes de leer ge_localizacion se incorporan las escuelas de GE
  // ausentes del catálogo geográfico (hotfix 90111292, que ya corre en prod).
  const prepararOrigen =
    opciones.modo === 'ge'
      ? async (cx) => {
          const { leerLocalizacionesDesdeGe, publicarLocalizacionesGe } = await import('./localizaciones-ge.mjs')
          const { getDb } = await import('../lib/db/index.ts')
          const resultado = await publicarLocalizacionesGe(
            getDb(),
            await leerLocalizacionesDesdeGe({ cicloLectivo: opciones.ciclo }),
          )
          console.log(
            `Localizaciones incorporadas desde GE: ${resultado.nuevas.length}; excluidas: ${resultado.excluidas.length}`,
          )
          const res = await cx.client.execute('SELECT cue_anexo FROM ge.ge_localizacion')
          cx.cuesConocidos = new Set(res.rows.map((r) => String(r.cue_anexo)))
        }
      : undefined
  const locRes = await conexion.client.execute('SELECT cue_anexo FROM ge.ge_localizacion')
  conexion.cuesConocidos = new Set(locRes.rows.map((r) => String(r.cue_anexo)))
  if (conexion.cuesConocidos.size === 0) {
    throw new Error('ge_localizacion está vacía: corré primero `node scripts/sync-ge.mjs --fixture`')
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  return correrImport(opciones, conexion, { version: process.env.APP_REVISION ?? pkg.version, prepararOrigen })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.time('importar-padron')
  try {
    const resultado = await main()
    console.log(JSON.stringify(resultado))
    console.timeEnd('importar-padron')
    // Salida explícita: el pool compartido no se cierra por invocación de
    // script. 3 = corrió pero perdió el lease (mismo código que jobs.mjs).
    process.exit(resultado?.leasePerdido ? 3 : 0)
  } catch (err) {
    console.error(sanearError(err))
    process.exit(1)
  }
}
