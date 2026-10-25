import { getDb } from '@/lib/db'
import { hazardSourceHealth } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handleGET() {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  const filas = await getDb().select().from(hazardSourceHealth)

  // `frescuraMinutos` se deriva acá y no se persiste: es una función del reloj
  // en el momento de la lectura, no un atributo de la fuente.
  const fuentes = filas.map((f) => ({
    provider: f.provider,
    estado: f.estado,
    ultimoExitoEn: f.ultimoExitoEn,
    ultimoIntentoEn: f.ultimoIntentoEn,
    ultimoErrorSaneado: f.ultimoErrorSaneado,
    ttlMinutos: f.ttlMinutos,
    licencia: f.licencia,
    actualizadaEn: f.actualizadaEn,
    frescuraMinutos:
      f.ultimoExitoEn === null
        ? null
        : Math.round((Date.now() - new Date(f.ultimoExitoEn).getTime()) / 60000),
  }))

  return jsonNoStore({ fuentes })
}

export const GET = ruta('infraestructura.fuentes.get', handleGET)
