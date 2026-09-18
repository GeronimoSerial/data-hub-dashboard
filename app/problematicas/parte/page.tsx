import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { AccesoForm } from '@/components/infraestructura/acceso-form'
import { EncabezadoParte, TITULO_PROGRAMA_COMPLETO } from '@/components/infraestructura/encabezado-parte'
import { EstadoActualParte } from '@/components/infraestructura/estado-actual-parte'
import { NOMBRE_COOKIE, tieneAccesoPublicoDesdeValorCookie } from '@/lib/infraestructura/acceso-publico'
import { resolverContextoPorCue, type ContextoErrorKind } from '@/lib/infraestructura/contexto'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `Estado actual · ${TITULO_PROGRAMA_COMPLETO}`,
}

const TITULO = 'Estado actual'

// Mismos textos que app/(publico)/problematicas/nueva/page.tsx: el director
// no debería leer dos explicaciones distintas del mismo problema según por
// qué enlace entró.
const MENSAJES_ERROR: Record<ContextoErrorKind, string> = {
  cue_ausente: 'Este enlace no incluye el CUE de la escuela. Solicite el enlace nuevamente a quien se lo compartió.',
  cue_invalido: 'El CUE incluido en el enlace no tiene un formato válido.',
  sin_corte_vigente: 'No hay datos de escuelas disponibles en este momento. Intente nuevamente más tarde.',
  cue_inexistente: 'No se encontró una escuela con ese CUE.',
  sin_secciones: 'Esta escuela todavía no tiene secciones cargadas.',
}

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

  const cookieStore = await cookies()
  if (!tieneAccesoPublicoDesdeValorCookie(cookieStore.get(NOMBRE_COOKIE)?.value)) {
    return (
      <div className="publico-content">
        <EncabezadoParte pantalla={TITULO} />
        <AccesoForm />
      </div>
    )
  }

  const client = openGeDb()
  let resultado
  try {
    await ensureGeSchema(client)
    resultado = await resolverContextoPorCue(client, cue ?? null)
  } finally {
    client.close()
  }

  if (!resultado.ok) {
    return (
      <div className="publico-content">
        <EncabezadoParte pantalla={TITULO} />
        <p className="estado-actual-aviso__texto" role="alert">
          {MENSAJES_ERROR[resultado.error.kind]}
        </p>
      </div>
    )
  }

  const { escuela } = resultado.contexto

  return (
    <div className="publico-content">
      {/* §6.1 — Identificación del establecimiento, ahora subordinada al
          título del programa: el enlace ya puso al director en su escuela. */}
      <EncabezadoParte pantalla={TITULO} escuela={escuela} />

      <EstadoActualParte cue={escuela.cueAnexo} />
    </div>
  )
}
