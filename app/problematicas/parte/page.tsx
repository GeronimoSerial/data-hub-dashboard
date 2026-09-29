import type { Metadata } from 'next'
import { EncabezadoParte, TITULO_PROGRAMA_COMPLETO } from '@/components/infraestructura/encabezado-parte'
import { EstadoActualParte } from '@/components/infraestructura/estado-actual-parte'
import { bloqueoDeAcceso, cargarContextoParte, ErrorContexto } from './compartido'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `Estado actual · ${TITULO_PROGRAMA_COMPLETO}`,
}

const TITULO = 'Estado actual'

/**
 * Pantalla inicial del director (spec §6): muestra el estado actual ANTES de
 * cualquier formulario (spec §5.1, "Mostrar antes de pedir").
 *
 * La página resuelve la guarda de acceso y la identificación del
 * establecimiento — punto 1 de §6 — para que el director reconozca dónde está
 * parado sin esperar a la red. El resto del parte lo pide el componente
 * cliente contra el Route Handler, como el resto del recorrido público (no
 * hay server actions en el proyecto).
 */
export default async function EstadoActualPartePage({
  searchParams,
}: {
  searchParams: Promise<{ cue?: string }>
}) {
  const { cue } = await searchParams

  // Con CUE en la query, una sesión de verificación canjeada desde el enlace
  // público "Hay afectación" habilita el formulario SÓLO para ese CUE, sin la
  // contraseña compartida. Sin CUE no hay contra qué validar esa sesión, así
  // que se cae a la guarda de siempre (contraseña o admin).
  const bloqueo = await bloqueoDeAcceso(cue, TITULO)
  if (bloqueo) return bloqueo

  const { resultado } = await cargarContextoParte(cue, false)

  if (!resultado.ok) {
    return (
      <div className="publico-content">
        <EncabezadoParte pantalla={TITULO} />
        <ErrorContexto kind={resultado.error.kind} />
      </div>
    )
  }

  const { escuela } = resultado.contexto

  return (
    <div className="publico-content publico-content--ancho">
      {/* §6.1 — Identificación del establecimiento, ahora subordinada al
          título del programa: el enlace ya puso al director en su escuela. */}
      <EncabezadoParte pantalla={TITULO} escuela={escuela} />

      <EstadoActualParte cue={escuela.cueAnexo} />
    </div>
  )
}
