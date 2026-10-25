// Characterization (golden) test of the current parte flow. It walks one
// parte through creation, modification and withdrawal using only the public
// route handlers and freezes every response body. Any refactor of the
// "alcance" model (sections + students) must keep these snapshots identical.
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { getRawClient } from '@/lib/db'
import { NOMBRE_COOKIE, crearTokenSesion } from '@/lib/infraestructura/acceso-publico'
import { claveDePrueba } from '@/lib/infraestructura/claves-de-prueba'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { getSessionUser } from '@/lib/session'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn(async () => null) }))

usarDbTemporal('parte-caracterizacion', {
  env: { PROBLEMATICAS_ACCESO_PASSWORD: claveDePrueba(), ADMIN_EMAIL: undefined, ADMIN_PASSWORD: undefined },
})

const CUE = '1801605-71'
const SECCION_MANANA = 7110
const SECCION_TARDE = 7120
const ALUMNOS_MANANA = [71000, 71001, 71002]
const ALUMNOS_TARDE = [71100, 71101]

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})/g

// Replaces volatile values (ids, timestamps) with stable placeholders while
// keeping identity: the same uuid always maps to the same placeholder.
function normalizar(valor: unknown): unknown {
  const ids = new Map<string, string>()
  const texto = JSON.stringify(valor)
    .replace(UUID, (id) => {
      if (!ids.has(id)) ids.set(id, `<id-${ids.size + 1}>`)
      return ids.get(id)!
    })
    .replace(ISO, '<fecha>')
  return JSON.parse(texto)
}

function cookie(): string {
  return `${NOMBRE_COOKIE}=${crearTokenSesion().token}`
}

function getParte(): Request {
  return new Request(`http://localhost/api/problematicas/parte?cue=${CUE}`, { headers: { cookie: cookie() } })
}

function postParte(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/problematicas/parte', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookie() },
    body: JSON.stringify({ cue: CUE, idempotencyKey: crypto.randomUUID(), rigeDesde: new Date().toISOString(), ...body }),
  })
}

async function respuesta(res: Response) {
  return { status: res.status, cacheControl: res.headers.get('cache-control'), body: await res.json() }
}

beforeAll(async () => {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)
  await client.execute(
    "INSERT INTO ge.ge_corte (id, ciclo_lectivo, fetched_at, estado) OVERRIDING SYSTEM VALUE VALUES (1, 2025, '2025-01-01T00:00:00Z', 'vigente')",
  )
  await client.execute(
    `INSERT INTO ge.ge_localizacion (cue_anexo, cui, nombre, departamento, localidad) VALUES ('${CUE}', NULL, 'Escuela', 'ER', 'Parana')`,
  )
  for (const [id, division, turno] of [[SECCION_MANANA, 'A', 'MAÑANA'], [SECCION_TARDE, 'B', 'TARDE']] as const) {
    await client.execute(
      `INSERT INTO ge.ge_seccion (corte_id, ge_section_id, cue_anexo, curso, division, nivel, turno) VALUES (1, ${id}, '${CUE}', '1', '${division}', 'PRIMARIA', '${turno}')`,
    )
  }
  for (const [seccion, alumnos] of [[SECCION_MANANA, ALUMNOS_MANANA], [SECCION_TARDE, ALUMNOS_TARDE]] as const) {
    for (const alumno of alumnos) {
      await client.execute({
        sql: 'INSERT INTO ge.ge_alumno_seccion (corte_id, ge_section_id, ge_person_id) VALUES (1, ?, ?)',
        args: [seccion, alumno],
      })
    }
  }
})

describe('parte characterization', () => {
  it('freezes the parte, history and map responses across its lifecycle', async () => {
    const { GET, POST } = await import('./route')
    const { GET: GET_HISTORIAL } = await import('./historial/route')
    const { GET: GET_MAPA } = await import('@/app/api/mapas/infraestructura/parte/route')

    const pasos: Record<string, unknown> = {}
    pasos.vacio = await respuesta(await GET(getParte()))

    pasos.alta = await respuesta(
      await POST(
        postParte({
          afectacionesNuevas: [
            { motivo: 'Inundación', severidad: 'Alta', secciones: [SECCION_MANANA, SECCION_TARDE] },
            { motivo: 'Anegamiento', severidad: 'Media', secciones: [SECCION_MANANA], alumnos: ALUMNOS_MANANA.slice(0, 2) },
          ],
          servicioEducativo: { estado: 'suspendido', alcance: { tipo: 'seccion', secciones: [SECCION_TARDE] } },
        }),
      ),
    )
    const conAlta = await (await GET(getParte())).json()
    pasos.trasAlta = { status: 200, body: conAlta }

    const afectaciones = conAlta.afectaciones as { id: string; motivo: string }[]
    const inundacion = afectaciones.find((a) => a.motivo === 'Inundación')!
    const anegamiento = afectaciones.find((a) => a.motivo === 'Anegamiento')!

    pasos.modificacion = await respuesta(
      await POST(postParte({ afectacionesModificadas: [{ id: inundacion.id, severidad: 'Crítica' }] })),
    )
    pasos.invalido = await respuesta(await POST(postParte({ afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [999999] }] })))
    pasos.retiro = await respuesta(await POST(postParte({ afectacionesRetiradas: [anegamiento.id] })))
    pasos.final = await respuesta(await GET(getParte()))

    pasos.historial = await respuesta(
      await GET_HISTORIAL(new Request(`http://localhost/api/problematicas/parte/historial?cue=${CUE}`, { headers: { cookie: cookie() } })),
    )

    vi.mocked(getSessionUser).mockResolvedValue({
      id: 'admin',
      role: 'admin',
      banned: false,
      nivelJurIds: [],
      accesoRecursos: 'todos',
      recursoIds: [],
    } as never)
    pasos.mapa = await respuesta(await GET_MAPA(new Request(`http://localhost/api/mapas/infraestructura/parte?cue=${CUE}`)))

    expect(normalizar(pasos)).toMatchSnapshot()
  })
})
