import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import type { Client } from '@libsql/client'
import {
  asegurarGeAdjuntada,
  obtenerCorteYSeccionesDeProblematica,
  type EjecutorSql,
} from './impacto'

export interface SeccionAfectada {
  geSectionId: number
  curso: string
  division: string
  turno: string
  alumnos: Array<{ nombre: string; apellido: string }>
}

export interface AfectadosNominal {
  secciones: SeccionAfectada[]
  cantidad: number
}

const ALGORITMO = 'aes-256-gcm'
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16

// La clave vive únicamente en la variable de entorno NOMINAL_ENCRYPTION_KEY,
// nunca en la base ni en el repositorio. Formato: 32 bytes en base64. Ver
// docs/rotacion-clave-nominal.md para el procedimiento de rotación.
function obtenerClave(): Buffer {
  const raw = process.env.NOMINAL_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('NOMINAL_ENCRYPTION_KEY no está configurada')
  }
  const clave = Buffer.from(raw, 'base64')
  if (clave.length !== 32) {
    throw new Error(
      'NOMINAL_ENCRYPTION_KEY debe decodificar en base64 a exactamente 32 bytes (AES-256)',
    )
  }
  return clave
}

// Cifra nombre y apellido en un único payload autocontenido: iv || authTag ||
// ciphertext, todo en base64. Se puede llamar con una clave explícita (para
// el procedimiento de rotación, que recifra con la clave nueva sin tocar el
// resto del módulo) o usar la de entorno por defecto.
export function cifrarIdentidad(
  nombre: string,
  apellido: string,
  clave: Buffer = obtenerClave(),
): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITMO, clave, iv)
  const plano = JSON.stringify({ nombre, apellido })
  const cifrado = Buffer.concat([cipher.update(plano, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, cifrado]).toString('base64')
}

// NO exportada fuera de este módulo. Es la única función que descifra el
// payload nominal, y su único llamador autorizado es
// listarIdentidadesPorPersonas de más abajo, que a su vez sólo puede
// invocarse después de que el caller haya verificado puedeVerNominal(). No
// agregues un segundo export que la reexponga: el permiso deja de tener
// sentido si el descifrado queda accesible por otro camino.
function descifrarIdentidad(
  payloadCifrado: string,
  clave: Buffer = obtenerClave(),
): { nombre: string; apellido: string } {
  const buf = Buffer.from(payloadCifrado, 'base64')
  const iv = buf.subarray(0, IV_BYTES)
  const authTag = buf.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES)
  const cifrado = buf.subarray(IV_BYTES + AUTH_TAG_BYTES)
  const decipher = createDecipheriv(ALGORITMO, clave, iv)
  decipher.setAuthTag(authTag)
  const plano = Buffer.concat([decipher.update(cifrado), decipher.final()])
  return JSON.parse(plano.toString('utf8'))
}

// Cifra e inserta/actualiza la identidad de un alumno en ge_alumno_identidad.
// `client` debe ser una conexión directa a ge.sqlite (openGeDb()): esta tabla
// nunca se escribe a través del ATTACH de sólo lectura.
export async function importarIdentidad(
  client: Client,
  gePersonId: number,
  nombre: string,
  apellido: string,
): Promise<void> {
  const payloadCifrado = cifrarIdentidad(nombre, apellido)
  await client.execute({
    sql: `INSERT INTO ge_alumno_identidad (ge_person_id, payload_cifrado) VALUES (?, ?)
          ON CONFLICT(ge_person_id) DO UPDATE SET payload_cifrado = excluded.payload_cifrado`,
    args: [gePersonId, payloadCifrado],
  })
}

// Descifra los nombres de un conjunto de alumnos. `hostClient` es la conexión
// del Hub con ge.sqlite adjuntada de sólo lectura (mismo patrón que
// impacto.ts). El llamador es responsable de haber verificado
// puedeVerNominal(user, ahora) === true antes de invocar esta función: acá no
// se repite esa verificación, así que nunca la expongas detrás de una ruta
// que no la haya hecho.
export async function listarIdentidadesPorPersonas(
  hostClient: EjecutorSql,
  gePersonIds: number[],
): Promise<Array<{ gePersonId: number; nombre: string; apellido: string }>> {
  if (gePersonIds.length === 0) return []
  await asegurarGeAdjuntada(hostClient)
  const placeholders = gePersonIds.map(() => '?').join(',')
  const res = await hostClient.execute({
    sql: `SELECT ge_person_id, payload_cifrado FROM ge.ge_alumno_identidad WHERE ge_person_id IN (${placeholders})`,
    args: gePersonIds,
  })
  return res.rows.map((r) => {
    const { nombre, apellido } = descifrarIdentidad(String(r.payload_cifrado))
    return { gePersonId: Number(r.ge_person_id), nombre, apellido }
  })
}

// Arma la lista nominal por sección de una problemática: mismo origen
// (corteId, geSectionIds) que el motor de impacto, vía
// obtenerCorteYSeccionesDeProblematica, así que la cantidad de alumnos que
// esta función revela nunca puede discrepar en su universo con la cifra que
// ya vio quien tiene acceso al mapa. El llamador es responsable de haber
// verificado puedeVerNominal(user, ahora) === true antes de invocar esta
// función, igual que listarIdentidadesPorPersonas.
export async function listarAfectadosNominal(
  hostClient: EjecutorSql,
  problematicaId: string,
): Promise<AfectadosNominal | null> {
  const referencia = await obtenerCorteYSeccionesDeProblematica(problematicaId)
  if (!referencia) return null
  const { corteId, geSectionIds } = referencia
  if (geSectionIds.length === 0) return { secciones: [], cantidad: 0 }

  await asegurarGeAdjuntada(hostClient)
  const placeholders = geSectionIds.map(() => '?').join(',')

  const seccionesRes = await hostClient.execute({
    sql: `SELECT ge_section_id, curso, division, turno FROM ge.ge_seccion
          WHERE corte_id = ? AND ge_section_id IN (${placeholders})`,
    args: [corteId, ...geSectionIds],
  })

  const membresiasRes = await hostClient.execute({
    sql: `SELECT DISTINCT ge_section_id, ge_person_id FROM ge.ge_alumno_seccion
          WHERE corte_id = ? AND ge_section_id IN (${placeholders})`,
    args: [corteId, ...geSectionIds],
  })

  const personIdsPorSeccion = new Map<number, number[]>()
  const todosLosPersonIds = new Set<number>()
  for (const r of membresiasRes.rows) {
    const sectionId = Number(r.ge_section_id)
    const personId = Number(r.ge_person_id)
    todosLosPersonIds.add(personId)
    const lista = personIdsPorSeccion.get(sectionId) ?? []
    lista.push(personId)
    personIdsPorSeccion.set(sectionId, lista)
  }

  const identidades = await listarIdentidadesPorPersonas(
    hostClient,
    Array.from(todosLosPersonIds),
  )
  const nombresPorPersona = new Map(
    identidades.map((i) => [i.gePersonId, { nombre: i.nombre, apellido: i.apellido }]),
  )

  const secciones: SeccionAfectada[] = seccionesRes.rows.map((r) => {
    const geSectionId = Number(r.ge_section_id)
    const personIds = personIdsPorSeccion.get(geSectionId) ?? []
    return {
      geSectionId,
      curso: String(r.curso),
      division: String(r.division),
      turno: String(r.turno),
      alumnos: personIds
        .map((id) => nombresPorPersona.get(id))
        .filter((a): a is { nombre: string; apellido: string } => a !== undefined),
    }
  })

  return { secciones, cantidad: todosLosPersonIds.size }
}

// Procedimiento de rotación de clave (ver docs/rotacion-clave-nominal.md):
// descifra cada fila con la clave vieja y la recifra con la nueva, dentro de
// una única transacción sobre ge.sqlite. `client` debe ser una conexión
// directa a ge.sqlite (openGeDb()), igual que importarIdentidad. Vive en este
// módulo porque es, junto a listarIdentidadesPorPersonas, la única función
// autorizada a invocar descifrarIdentidad.
export async function rotarClaveIdentidad(
  client: Client,
  claveViejaBase64: string,
  claveNuevaBase64: string,
): Promise<{ filasRotadas: number }> {
  const claveVieja = Buffer.from(claveViejaBase64, 'base64')
  const claveNueva = Buffer.from(claveNuevaBase64, 'base64')
  if (claveVieja.length !== 32 || claveNueva.length !== 32) {
    throw new Error('Ambas claves deben decodificar en base64 a 32 bytes (AES-256)')
  }

  const filas = await client.execute(
    'SELECT ge_person_id, payload_cifrado FROM ge_alumno_identidad',
  )

  const tx = await client.transaction('write')
  try {
    for (const r of filas.rows) {
      const { nombre, apellido } = descifrarIdentidad(String(r.payload_cifrado), claveVieja)
      const payloadNuevo = cifrarIdentidad(nombre, apellido, claveNueva)
      await tx.execute({
        sql: 'UPDATE ge_alumno_identidad SET payload_cifrado = ? WHERE ge_person_id = ?',
        args: [payloadNuevo, r.ge_person_id],
      })
    }
    await tx.commit()
  } catch (err) {
    try {
      await tx.rollback()
    } catch {
      // noop: si el commit ya cerró la transacción, el error original manda
    }
    throw err
  }

  return { filasRotadas: filas.rows.length }
}

// Lee el alcance nominal de una problemática y registra el acceso en
// infra_acceso_nominal_log dentro de la misma transacción que produce la
// respuesta: no puede quedar una lectura sin su fila de auditoría, ni una
// fila de auditoría sin la lectura que la originó. Usada tanto por
// GET /api/infraestructura/nominal como por la página de alcance: cada una
// verifica puedeVerNominal() por su cuenta antes de llamar acá, esta función
// no repite esa verificación.
export async function consultarYRegistrarAfectados(
  client: Client,
  userId: string,
  problematicaId: string,
  ahora: Date,
): Promise<AfectadosNominal | null> {
  const tx = await client.transaction('write')
  try {
    const resultado = await listarAfectadosNominal(tx, problematicaId)
    if (!resultado) {
      await tx.rollback()
      return null
    }

    await tx.execute({
      sql: `INSERT INTO infra_acceso_nominal_log
              (id, user_id, problematica_id, cantidad, consultado_en)
            VALUES (?, ?, ?, ?, ?)`,
      args: [crypto.randomUUID(), userId, problematicaId, resultado.cantidad, ahora.toISOString()],
    })

    await tx.commit()
    return resultado
  } catch (err) {
    try {
      await tx.rollback()
    } catch {
      // noop: si el commit ya cerró la transacción, el error original manda
    }
    throw err
  }
}
