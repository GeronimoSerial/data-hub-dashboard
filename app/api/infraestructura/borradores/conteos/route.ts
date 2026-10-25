import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { getDraftCounts } from '@/lib/infraestructura/borradores/mapa'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { getReportesOfflineFeatures } from '@/lib/infraestructura/parte/feature-flags'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CUE_PATTERN = /^\d{7}-\d{2}$/
const MAX_CUES = 1_000

async function handleGET(request: Request) {
  if (!getReportesOfflineFeatures().mapaBorradores) return jsonNoStore({ items: [] })
  await ensureSeeded()
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  const rawCues = new URL(request.url).searchParams.get('cues')
  let cues: string[] | undefined
  if (rawCues !== null) {
    cues = [...new Set(rawCues.split(',').map((cue) => cue.trim()))]
    if (cues.length > MAX_CUES || cues.some((cue) => !CUE_PATTERN.test(cue))) {
      return jsonNoStore({ error: 'Parámetro cues inválido' }, 400)
    }
  }

  return jsonNoStore({ items: await getDraftCounts(cues) })
}

export const GET = ruta('infraestructura.borradores.conteos.get', handleGET)
