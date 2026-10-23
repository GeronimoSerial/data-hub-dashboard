import { createDecipheriv } from 'node:crypto'
import {
  asegurarGeAdjuntada,
  obtenerCorteYSeccionesDeAfectacion,
  obtenerMembresiaSecciones,
  seleccionarAlumnosPorSeccion,
} from './impacto'
import type { EjecutorSql } from './ge-db'
import {
  ALGORITMO,
  AUTH_TAG_BYTES,
  IV_BYTES,
  cifrarIdentidad,
  obtenerClave,
} from './identidad-cripto'

// Reexportado para que los llamadores existentes sigan importando el cifrado
// desde acá. Los scripts de mantenimiento, en cambio, importan
// './identidad-cripto' directo para no arrastrar el ORM (ver ese módulo).
export { cifrarIdentidad }

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

// NO exportada fuera de este módulo. Es la única función que descifra el
// payload nominal, y sus únicos llamadores autorizados son
// listarIdentidadesPorPersonas (requiere puedeVerNominal() ya verificado por
// el caller) y listarIdentidadesPorPersonasDesdeGeDb (usada por el formulario
// público de problemáticas, donde el gate es la contraseña temporal de
// lib/infraestructura/acceso-publico.ts en vez de puedeVerNominal — ver el
// comentario en contexto.ts sobre por qué ese payload dejó de prohibir
// identidad de alumnos). No agregues un segundo export que la reexponga: el
// permiso deja de tener sentido si el descifrado queda accesible por otro
// camino que no pase por uno de estos dos gates.
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

// Cifra e inserta/actualiza la identidad de un alumno en ge.ge_alumno_identidad,
// dentro del schema `ge` de la misma base del hub.
export async function importarIdentidad(
  client: EjecutorSql,
  gePersonId: number,
  nombre: string,
  apellido: string,
): Promise<void> {
  const payloadCifrado = cifrarIdentidad(nombre, apellido)
  await client.execute({
    sql: `INSERT INTO ge.ge_alumno_identidad (ge_person_id, payload_cifrado) VALUES (?, ?)
          ON CONFLICT(ge_person_id) DO UPDATE SET payload_cifrado = excluded.payload_cifrado`,
    args: [gePersonId, payloadCifrado],
  })
}

// Descifra los nombres de un conjunto de alumnos. `hostClient` es una
// conexión al Hub (mismo patrón que impacto.ts) que lee el schema `ge` de la
// misma base. El llamador es responsable de haber verificado
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

// Variante de listarIdentidadesPorPersonas para llamadores que ya tienen una
// conexión al schema `ge` de la misma base del hub (como
// lib/infraestructura/contexto.ts para el formulario público): no hace ATTACH
// ni asume un search_path particular, lee ge.ge_alumno_identidad con el
// prefijo de schema explícito.
export async function listarIdentidadesPorPersonasDesdeGeDb(
  client: EjecutorSql,
  gePersonIds: number[],
): Promise<Array<{ gePersonId: number; nombre: string; apellido: string }>> {
  if (gePersonIds.length === 0) return []
  const placeholders = gePersonIds.map(() => '?').join(',')
  const res = await client.execute({
    sql: `SELECT ge_person_id, payload_cifrado FROM ge.ge_alumno_identidad WHERE ge_person_id IN (${placeholders})`,
    args: gePersonIds,
  })
  return res.rows.map((r) => {
    const { nombre, apellido } = descifrarIdentidad(String(r.payload_cifrado))
    return { gePersonId: Number(r.ge_person_id), nombre, apellido }
  })
}

// Arma la lista nominal por sección de una afectación: mismo origen
// (corteId, geSectionIds) que el motor de impacto, vía
// obtenerCorteYSeccionesDeAfectacion (F3.3, modelo nuevo infra_afectacion),
// así que la cantidad de alumnos que esta función revela nunca puede
// discrepar en su universo con la cifra que ya vio quien tiene acceso al
// mapa. El llamador es responsable de haber verificado
// puedeVerNominal(user, ahora) === true antes de invocar esta función, igual
// que listarIdentidadesPorPersonas.
export async function listarAfectadosNominal(
  hostClient: EjecutorSql,
  afectacionId: string,
): Promise<AfectadosNominal | null> {
  const referencia = await obtenerCorteYSeccionesDeAfectacion(afectacionId)
  if (!referencia) return null
  const { corteId, geSectionIds, alumnoIds } = referencia
  if (geSectionIds.length === 0) return { secciones: [], cantidad: 0 }

  await asegurarGeAdjuntada(hostClient)
  const placeholders = geSectionIds.map(() => '?').join(',')

  const seccionesRes = await hostClient.execute({
    sql: `SELECT ge_section_id, curso, division, turno FROM ge.ge_seccion
          WHERE corte_id = ? AND ge_section_id IN (${placeholders})`,
    args: [corteId, ...geSectionIds],
  })

  const membresiaPorSeccion = await obtenerMembresiaSecciones(hostClient, { corteId, geSectionIds })
  const personIdsPorSeccion = seleccionarAlumnosPorSeccion(membresiaPorSeccion, alumnoIds)
  const todosLosPersonIds = new Set([...personIdsPorSeccion.values()].flat())

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

// Alcance por nivel jurisdiccional (rol director_nivel): la afectación sólo es
// visible si su establecimiento tiene asignado alguno de los niveles. Usa la
// misma regla EXISTS sobre ge_escuela_nivel_jur que el mapa (parte-mapa.ts);
// sin este chequeo un director podría leer nombres de otra dirección por id.
// Lista vacía = ningún alcance, así que devuelve false.
export async function afectacionDentroDeNiveles(
  client: EjecutorSql,
  afectacionId: string,
  nivelesJurIds: number[],
): Promise<boolean> {
  if (nivelesJurIds.length === 0) return false
  await asegurarGeAdjuntada(client)
  const marcas = nivelesJurIds.map(() => '?').join(', ')
  const res = await client.execute({
    sql: `SELECT a.id FROM infra_afectacion a
          JOIN infra_parte p ON p.id = a.parte_id
          WHERE a.id = ? AND EXISTS (
            SELECT 1 FROM ge.ge_escuela_nivel_jur nje
            WHERE nje.cue_anexo = p.cue_anexo AND nje.nivel_jurisdiccional_id IN (${marcas})
          )`,
    args: [afectacionId, ...nivelesJurIds],
  })
  return res.rows.length > 0
}

// Procedimiento de rotación de clave (ver docs/rotacion-clave-nominal.md):
// descifra cada fila con la clave vieja y la recifra con la nueva, dentro de
// una única transacción sobre ge.ge_alumno_identidad. Vive en este
// módulo porque es, junto a listarIdentidadesPorPersonas, la única función
// autorizada a invocar descifrarIdentidad.
export async function rotarClaveIdentidad(
  client: EjecutorSql,
  claveViejaBase64: string,
  claveNuevaBase64: string,
): Promise<{ filasRotadas: number }> {
  const claveVieja = Buffer.from(claveViejaBase64, 'base64')
  const claveNueva = Buffer.from(claveNuevaBase64, 'base64')
  if (claveVieja.length !== 32 || claveNueva.length !== 32) {
    throw new Error('Ambas claves deben decodificar en base64 a 32 bytes (AES-256)')
  }

  const filas = await client.execute(
    'SELECT ge_person_id, payload_cifrado FROM ge.ge_alumno_identidad',
  )

  await client.execute('BEGIN')
  try {
    for (const r of filas.rows) {
      const { nombre, apellido } = descifrarIdentidad(String(r.payload_cifrado), claveVieja)
      const payloadNuevo = cifrarIdentidad(nombre, apellido, claveNueva)
      await client.execute({
        sql: 'UPDATE ge.ge_alumno_identidad SET payload_cifrado = ? WHERE ge_person_id = ?',
        args: [payloadNuevo, r.ge_person_id],
      })
    }
    await client.execute('COMMIT')
  } catch (err) {
    try {
      await client.execute('ROLLBACK')
    } catch {
      // noop: si el commit ya cerró la transacción, el error original manda
    }
    throw err
  }

  return { filasRotadas: filas.rows.length }
}

// Lee el alcance nominal de una afectación y registra el acceso en
// infra_acceso_nominal_log dentro de la misma transacción que produce la
// respuesta: no puede quedar una lectura sin su fila de auditoría, ni una
// fila de auditoría sin la lectura que la originó. Usada por
// GET /api/mapas/infraestructura/nominal (F3.3, modelo nuevo, vía el modal
// de alcance nominal del mapa) — la ruta vieja sobre el modelo deprecado
// (GET /api/infraestructura/nominal, con su página app/(hub)/infraestructura/afectados)
// se retiró en F3.3 frontend. Este caller verifica puedeVerNominal() por su
// cuenta antes de llamar acá; esta función no repite esa verificación.
export async function consultarYRegistrarAfectados(
  client: EjecutorSql,
  userId: string,
  afectacionId: string,
  ahora: Date,
): Promise<AfectadosNominal | null> {
  await client.execute('BEGIN')
  try {
    const resultado = await listarAfectadosNominal(client, afectacionId)
    if (!resultado) {
      await client.execute('ROLLBACK')
      return null
    }

    await client.execute({
      sql: `INSERT INTO infra_acceso_nominal_log
              (id, user_id, afectacion_id, cantidad, consultado_en)
            VALUES (?, ?, ?, ?, ?)`,
      args: [crypto.randomUUID(), userId, afectacionId, resultado.cantidad, ahora.toISOString()],
    })

    await client.execute('COMMIT')
    return resultado
  } catch (err) {
    try {
      await client.execute('ROLLBACK')
    } catch {
      // noop: si el commit ya cerró la transacción, el error original manda
    }
    throw err
  }
}
