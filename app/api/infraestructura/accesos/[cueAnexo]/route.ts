import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'
import { obtenerIndiceAislamientoDeCue } from '../../../../../lib/infraestructura/riesgo/motor/adaptadores/aislamiento'
import { crearAdapterTerritorio } from '../../../../../lib/infraestructura/riesgo/motor/adaptadores/territorio'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { respuestaGuard } from '@/lib/infraestructura/respuesta-guard'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Next.js 16 App Router: el segundo argumento de un route handler dinámico es
// una promesa de params (misma firma que geo-perfiles/[cueAnexo]/route.ts).
type Ctx = { params: Promise<{ cueAnexo: string }> }

const cueAnexoSchema = z.string().min(1).max(50)

// Lectura de staff: más estricta que la lectura genérica de mapas. Todo dato
// territorial sale por este endpoint, así que TODAS las respuestas (incluidos
// errores) se marcan no-store para que no queden cacheadas en proxies.
const SIN_STORE = { 'Cache-Control': 'private, no-store' } as const

// GET de sólo lectura: expone el índice territorial de accesos (aislamiento
// OSM) de un CUE-anexo. Nunca acepta escritura ni carga manual, y NUNCA
// devuelve datos nominales de alumnos/personas.
async function handleGET(_request: Request, ctx: Ctx) {
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) return respuestaGuard(guard)

  await ensureSeeded()

  const { cueAnexo } = await ctx.params
  const parsed = cueAnexoSchema.safeParse(cueAnexo)
  if (!parsed.success) {
    return Response.json({ error: 'cueAnexo inválido' }, { status: 400, headers: SIN_STORE })
  }

  // Primero confirmamos que la escuela existe en el padrón territorial. Sin
  // fila en infra_geo_profile el CUE-anexo no existe: eso SÍ es un 404.
  const perfil = await crearAdapterTerritorio().obtenerPerfil(parsed.data)
  if (!perfil) {
    return Response.json({ error: 'Escuela no encontrada' }, { status: 404, headers: SIN_STORE })
  }

  const indice = await obtenerIndiceAislamientoDeCue(parsed.data)
  // La escuela existe pero el dataset OSM no tiene fila para ella: falta de
  // cobertura, no un error (mismo criterio que `rioAsociacion: null` en
  // geo-perfiles). Se responde 200 con `disponible: false`, nunca 404.
  if (!indice) {
    return jsonNoStore({ cueAnexo: parsed.data, disponible: false, motivo: 'sin_cobertura_osm' })
  }

  return jsonNoStore(
    {
      cueAnexo: parsed.data,
      disponible: true,
      indice: indice.nivel,
      cruces: {
        total: indice.crucesAguaCount,
        conPuente: indice.crucesAguaConPuenteCount,
        conVado: indice.crucesAguaConVadoCount,
      },
      // null = alternativa DESCONOCIDA. Se devuelve tal cual: NUNCA se traduce
      // a true ("segura"), ver contrato en puertos.ts.
      rutaAlternativaSinCruce: indice.tieneAlternativaSinCruce,
      fechaExtractoOsm: indice.fechaExtractoOsm,
      licencia: indice.licencia,
      atribucion: '© OpenStreetMap contributors',
    },
  )
}

export const GET = ruta('infraestructura.accesos.cueAnexo.get', handleGET)
