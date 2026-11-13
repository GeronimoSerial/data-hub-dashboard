import type { Metadata } from 'next'
import { EncabezadoParte } from '@/components/infraestructura/encabezado-parte'
import { EstadoActualParte } from '@/components/infraestructura/estado-actual-parte'
import { textosActuales } from '@/lib/i18n'
import { bloqueoDeAcceso, cargarContextoParte, ErrorContexto } from './compartido'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const t = textosActuales().parteResto

export const metadata: Metadata = {
  title: `${t.pantallas.estadoActual} · ${t.encabezado.programaCompleto}`,
}

const TITULO = t.pantallas.estadoActual

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
  // contraseña compartida. El operador de establecimiento usa el CUE de su
  // sesión cuando no hay ?cue.
  const { bloqueo, cue: cueParte } = await bloqueoDeAcceso(cue, TITULO)
  if (bloqueo) return bloqueo

  const { resultado } = await cargarContextoParte(cueParte, false)

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
    <div className="publico-content publico-content--parte publico-content--estado-actual">
      {/* §6.1 — Identificación del establecimiento, ahora subordinada al
          título del programa: el enlace ya puso al director en su escuela. */}
      <EncabezadoParte pantalla={TITULO} escuela={escuela} />

      <EstadoActualParte cue={escuela.cueAnexo} />
    </div>
  )
}
