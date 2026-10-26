import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { estadoAltura } from '@/lib/infraestructura/hidrometria/estado-altura'
import { estadoUltimaLectura } from '@/lib/infraestructura/hidrometria/ultima-lectura'
import { ultimaLecturaEstacion } from '@/lib/infraestructura/hidrometria/lecturas-repo'
import { obtenerEstacionesPrefectura } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Todas las estaciones del catálogo con coordenadas declaradas, cada una con su
// última lectura publicada y el estado (altura y tendencia) derivado de ella.
// Las coordenadas son las del publicador (no verificadas).
async function handleGET() {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  const db = getDb()
  const estaciones = await Promise.all(
    obtenerEstacionesPrefectura().filter((e) => e.coordenadas !== null).map(async (estacion) => {
      const fila = await ultimaLecturaEstacion(db, estacion.estacionId)
      const lectura = fila
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
        : null
      const { estado, tendencia, vencida } = estadoAltura(lectura)
      const ultima = estadoUltimaLectura(lectura)

      return {
        estacionId: estacion.estacionId,
        nombre: estacion.nombrePna,
        rio: estacion.rio,
        rol: estacion.rol,
        lat: estacion.coordenadas!.lat,
        lon: estacion.coordenadas!.lon,
        coordenadasVerificadas: false,
        lectura,
        estado,
        tendencia,
        // Lectura de más de EDAD_MAXIMA_LECTURA_HORAS: se informa como sin dato.
        lecturaVencida: vencida,
        // Para el mapa: estado de nivel de la última lectura aunque esté vencida.
        estadoUltimaLectura: ultima.estado,
        horasDesdeLectura: ultima.horasDesdeLectura,
      }
    }),
  )

  return jsonNoStore({ estaciones })
}

export const GET = ruta('infraestructura.hidrometria.estaciones.get', handleGET)
