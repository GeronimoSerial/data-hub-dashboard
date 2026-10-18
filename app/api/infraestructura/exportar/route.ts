import { GET as radarGET } from '@/app/api/infraestructura/radar/route'
import { archivoResponseHeaders } from '@/lib/archivo'
import { crearLibroInstitucional } from '@/lib/exportaciones/libro-institucional'
import {
  EXPORTACIONES_ESCUELAS,
  filasExportacion,
  riesgoPorCueDesdeRadar,
} from '@/lib/exportaciones/escuelas'
import { etiquetasFiltros, nombreArchivoExportacion, parsearSolicitudExportacion } from '@/lib/exportaciones/solicitud'
import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { alcanceMapa, filtrosDeAlcance } from '@/lib/infraestructura/alcance-mapa'
import { filtrarEscuelas, opcionesDireccion } from '@/lib/infraestructura/mapa/filtrar'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import { listarEscuelasMapaEnriquecidas } from '@/lib/infraestructura/parte-mapa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

type RespuestaRadar = { puntos: Parameters<typeof riesgoPorCueDesdeRadar>[0] }

// El radar no expone un cargador reutilizable: se usa su propio handler, que
// trae los puntos del horizonte con la misma lógica que el panel y el mapa.
async function cargarRiesgoPorCue(
  request: Request,
  horizonte: HorizonteMotor,
  escuelas: EscuelaMapaEnriquecida[],
) {
  const url = new URL('/api/infraestructura/radar', request.url)
  url.searchParams.set('horizonte', String(horizonte))
  const respuesta = await radarGET(new Request(url))
  if (!respuesta.ok) return null
  const { puntos } = (await respuesta.json()) as RespuestaRadar
  return riesgoPorCueDesdeRadar(puntos, escuelas, horizonte)
}

// Mismo orden que `app/api/mapas/infraestructura/escuelas` y `mapa-ruta.ts`.
export async function GET(request: Request) {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) {
    const error = acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso'
    return Response.json({ error }, { status: acceso.status })
  }

  const alcance = alcanceMapa(acceso.user)
  if (alcance.tipo === 'ninguno') {
    return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403 })
  }

  const parseo = parsearSolicitudExportacion(new URL(request.url).searchParams)
  if (!parseo.ok) return Response.json({ error: parseo.error }, { status: 400 })
  const { tipo, filtros, horizonte } = parseo.solicitud

  const { escuelas } = await listarEscuelasMapaEnriquecidas(filtrosDeAlcance(alcance))
  const seleccionadas = filtrarEscuelas(escuelas, filtros)

  const riesgoPorCue = tipo === 'en-riesgo'
    ? await cargarRiesgoPorCue(request, horizonte, seleccionadas)
    : undefined
  if (riesgoPorCue === null) {
    return Response.json({ error: 'No se pudo calcular el riesgo de las escuelas' }, { status: 500 })
  }

  const definicion = EXPORTACIONES_ESCUELAS[tipo]
  const generadoEn = new Date()
  const libro = await crearLibroInstitucional({
    titulo: definicion.titulo,
    filtros: etiquetasFiltros(filtros, opcionesDireccion(escuelas)),
    columnas: definicion.columnas,
    filas: filasExportacion(tipo, seleccionadas, { riesgoPorCue }),
    generadoEn,
    unidad: 'escuelas',
  })

  return new Response(libro, {
    headers: archivoResponseHeaders({
      mime: MIME_XLSX,
      nombreOriginal: nombreArchivoExportacion(tipo, generadoEn),
      download: true,
    }),
  })
}
