import type { Metadata } from 'next'
import { EncabezadoParte, TITULO_PROGRAMA_COMPLETO } from '@/components/infraestructura/encabezado-parte'
import { HistorialParte } from '@/components/infraestructura/historial-parte'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { bloqueoDeAcceso } from '../compartido'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `Historial · ${TITULO_PROGRAMA_COMPLETO}`,
}

const TITULO = 'Historial'

/**
 * Historial del parte (spec §15): sólo lectura.
 *
 * La página resuelve la guarda de acceso y el CUE del enlace; los
 * movimientos los pide el componente cliente contra el Route Handler, como
 * el resto del recorrido público (no hay server actions en el proyecto).
 */
export default async function HistorialPartePage({
  searchParams,
}: {
  searchParams: Promise<{ cue?: string }>
}) {
  const { cue } = await searchParams

  const { bloqueo, cue: cueParte } = await bloqueoDeAcceso(cue, TITULO)
  if (bloqueo) return bloqueo

  const cueNormalizado = normalizeCue(cueParte ?? '')
  if (!cueNormalizado) {
    return (
      <div className="publico-content">
        <EncabezadoParte pantalla={TITULO} />
        <p className="historial-estado__texto" role="alert">
          Este enlace no incluye un CUE válido. Solicite el enlace nuevamente a quien se lo compartió.
        </p>
      </div>
    )
  }

  const enlaceVolver = `/problematicas/parte?cue=${encodeURIComponent(cueNormalizado.value)}`

  return (
    <div className="publico-content publico-content--parte">
      <div className="historial-contenido">
        <EncabezadoParte pantalla={TITULO} descripcion="Los cambios más recientes aparecen primero." />
        <a className="ui-button ui-button--secondary historial-volver" href={enlaceVolver}>
          Volver al estado actual
        </a>
        <HistorialParte
          cue={cueNormalizado.value}
          endpoint={`/api/problematicas/parte/historial?cue=${encodeURIComponent(cueNormalizado.value)}`}
        />
        <a className="ui-button ui-button--secondary historial-volver" href={enlaceVolver}>
          Volver al estado actual
        </a>
      </div>
    </div>
  )
}
