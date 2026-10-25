import { archivoResponseHeaders } from '@/lib/archivo'
import { consultarExportacion } from '@/lib/exportaciones/consulta'
import { tituloExportacion } from '@/lib/exportaciones/escuelas'
import { etiquetasFiltros, nombreArchivoExportacion, parsearSolicitudExportacion } from '@/lib/exportaciones/solicitud'
import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { alcanceMapa } from '@/lib/infraestructura/alcance-mapa'
import { jsonComprimido } from '@/lib/http/respuesta-comprimida'
import { ruta } from '@/lib/http/ruta'
import { crearLimitador } from '@/lib/http/limitador'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const limitador = crearLimitador({ ventanaMs: 60_000, max: 10 })

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const CABECERAS_PRIVADAS = { 'Cache-Control': 'private, no-cache', Vary: 'Cookie, Accept-Encoding' }

async function handleGET(request: Request) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) {
    const error = acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso'
    return Response.json({ error }, { status: acceso.status, headers: { 'Cache-Control': 'private, no-store' } })
  }

  const alcance = alcanceMapa(acceso.user)
  if (alcance.tipo === 'ninguno') {
    return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403 })
  }

  const parseo = parsearSolicitudExportacion(new URL(request.url).searchParams)
  if (!parseo.ok) return Response.json({ error: parseo.error }, { status: 400 })
  const solicitud = parseo.solicitud
  await ensureSeeded()

  let consulta
  try {
    consulta = await consultarExportacion(alcance, solicitud, request)
  } catch (error) {
    const ordenInvalido = error instanceof Error && error.message === 'Columna de orden inválida'
    return Response.json(
      { error: ordenInvalido ? error.message : 'No se pudo cargar la exportación. Volvé a intentar.' },
      { status: ordenInvalido ? 400 : 500, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }
  const { filas, columnas, opciones, direcciones, totalAlumnos } = consulta

  if (solicitud.formato === 'json') {
    const { tamanoPagina } = solicitud
    const totalPaginas = Math.ceil(filas.length / tamanoPagina)
    const pagina = Math.min(solicitud.pagina, Math.max(1, totalPaginas))
    const inicio = (pagina - 1) * tamanoPagina
    return jsonComprimido(request, {
      total: filas.length,
      totalAlumnos,
      pagina,
      tamanoPagina,
      totalPaginas,
      columnas: columnas.map(({ clave, encabezado }) => ({ clave, encabezado })),
      filas: filas.slice(inicio, inicio + tamanoPagina).map(fila =>
        Object.fromEntries(columnas.map(({ clave }) => [clave, fila[clave]])),
      ),
      opciones,
    }, { headers: CABECERAS_PRIVADAS })
  }

  // La vista previa no carga ExcelJS ni genera un libro.
  const { crearLibroInstitucional } = await import('@/lib/exportaciones/libro-institucional')
  const generadoEn = new Date()
  const libro = await crearLibroInstitucional({
    titulo: tituloExportacion(solicitud.estados),
    filtros: etiquetasFiltros(solicitud.filtros, direcciones, solicitud.estados),
    columnas,
    filas,
    generadoEn,
    unidad: 'escuelas',
    totales: [{ etiqueta: 'Total alumnos', valor: totalAlumnos }],
  })

  return new Response(libro, {
    headers: archivoResponseHeaders({
      mime: MIME_XLSX,
      nombreOriginal: nombreArchivoExportacion(solicitud.estados, generadoEn),
      download: true,
    }),
  })
}

export const GET = ruta('infraestructura.exportar.get', handleGET, { limite: { limitador } })
