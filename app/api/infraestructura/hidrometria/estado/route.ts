import { z } from 'zod'
import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { ultimaLecturaEstacion } from '@/lib/infraestructura/hidrometria/lecturas-repo'
import { obtenerEstacionesPrefectura } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'
import { estacionParaLocalidad } from '@/lib/infraestructura/hidrometria/tramos-prefectura'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const localidadSchema = z.string().min(1).max(120)

// Estado hidrométrico de la estación de referencia de una localidad: sólo
// tramos aprobados (default de estacionParaLocalidad) y la última lectura
// publicada por Prefectura.
export async function GET(request: Request) {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  const { searchParams } = new URL(request.url)
  const parsed = localidadSchema.safeParse(searchParams.get('localidad') ?? undefined)
  if (!parsed.success) {
    return Response.json({ error: 'localidad inválida' }, { status: 400 })
  }

  const tramo = estacionParaLocalidad(parsed.data)
  if (!tramo) return jsonNoStore({ tramo: null, lectura: null })

  const estacion = obtenerEstacionesPrefectura().find(
    (e) => e.estacionId === tramo.estacionId,
  )
  const fila = await ultimaLecturaEstacion(getDb(), tramo.estacionId)

  return jsonNoStore({
    tramo: {
      tramoId: tramo.tramoId,
      rio: tramo.rio,
      estacionId: tramo.estacionId,
      estacionNombre: estacion?.nombrePna ?? null,
    },
    lectura: fila
      ? {
          lecturaM: fila.lecturaM,
          variacionM: fila.variacionM,
          periodoHoras: fila.periodoHoras,
          medidaEn: fila.medidaEn,
          estadoPublicado: fila.estadoPublicado,
          alertaM: fila.alertaM,
          evacuacionM: fila.evacuacionM,
          inconsistente: fila.inconsistente,
          motivosInconsistencia: fila.motivosInconsistencia,
          capturadaEn: fila.capturadaEn,
        }
      : null,
  })
}
