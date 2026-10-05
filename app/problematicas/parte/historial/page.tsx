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

  const bloqueo = await bloqueoDeAcceso(cue, TITULO)
  if (bloqueo) return bloqueo

  const cueNormalizado = normalizeCue(cue ?? '')
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

  return (
    <div className="publico-content publico-content--parte">
      <div className="historial-contenido">
        <EncabezadoParte pantalla={TITULO} descripcion="Los cambios más recientes aparecen primero." />
        <HistorialParte
          cue={cueNormalizado.value}
          endpoint={`/api/problematicas/parte/historial?cue=${encodeURIComponent(cueNormalizado.value)}`}
        />

        {/* Nielsen #3: salida visible hacia el estado actual del parte, para
            no depender del botón de atrás del navegador en un teléfono. */}
        <a
          className="historial-volver"
          href={`/problematicas/parte?cue=${encodeURIComponent(cueNormalizado.value)}`}
        >
          Volver al parte
        </a>
      </div>
    </div>
  )
}
