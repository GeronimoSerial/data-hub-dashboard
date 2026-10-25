// Búsqueda de alumnos de la matrícula vigente para el parte de institutos
// superiores. Misma guarda que el historial del parte; la respuesta es
// no-store porque lleva nombres de alumnos.
import { getRawClient } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { codigoSinAccesoParte, tieneAccesoAlParteParaCue } from '@/lib/infraestructura/acceso-parte'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { crearEjecutorSql } from '@/lib/infraestructura/ge-db'
import { buscarAlumnos, parsearBusqueda } from '@/lib/infraestructura/matricula/busqueda'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { crearLimitador } from '@/lib/http/limitador'
import { log } from '@/lib/http/log'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const limitador = crearLimitador({ ventanaMs: 60_000, max: 60 })
// Búsquedas por DNI completo, por CUE: un DNI exacto es una consulta de
// identidad, así que se limita más fuerte que el listado o la búsqueda por nombre.
const limitadorDni = crearLimitador({ ventanaMs: 60_000, max: 30 })

async function handleGET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cue = normalizeCue(searchParams.get('cue') ?? '')
  if (!cue) {
    return jsonNoStore({ error: 'CUE inválido' }, 400)
  }

  if (!(await tieneAccesoAlParteParaCue(request, cue.value))) {
    return jsonNoStore({ error: 'No autorizado' }, await codigoSinAccesoParte())
  }

  const parseo = parsearBusqueda({
    cueAnexo: cue.value,
    carreras: searchParams.get('carreras'),
    q: searchParams.get('q'),
    limite: searchParams.get('limite'),
  })
  if (!parseo.ok) {
    return jsonNoStore({ error: parseo.error }, 400)
  }

  if (parseo.parametros.filtro.tipo === 'dni') {
    const espera = limitadorDni.consumir(cue.value)
    if (espera !== null) {
      log.warn('rate_limited', { cue: cue.value })
      return Response.json(
        { error: 'Demasiados pedidos. Intente nuevamente en unos segundos.' },
        { status: 429, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(espera) } },
      )
    }
  }

  await ensureSeeded()

  const resultado = await buscarAlumnos(crearEjecutorSql(getRawClient()), parseo.parametros)
  if (resultado.sinCorte) {
    return jsonNoStore({ error: 'No hay una matrícula vigente cargada' }, 503)
  }

  return jsonNoStore({ ok: true, alumnos: resultado.alumnos, truncado: resultado.truncado })
}

export const GET = ruta('parte.matricula.get', handleGET, { limite: { limitador } })
