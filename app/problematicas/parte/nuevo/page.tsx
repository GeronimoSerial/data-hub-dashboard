import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { AccesoForm } from '@/components/infraestructura/acceso-form'
import { ReporteInicialForm } from '@/components/infraestructura/reporte-inicial-form'
import { NOMBRE_COOKIE, tieneAccesoPublicoDesdeValorCookie } from '@/lib/infraestructura/acceso-publico'
import { resolverContextoPorCue, type ContextoErrorKind } from '@/lib/infraestructura/contexto'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { ensureSeeded } from '@/lib/db/seed'
import { listarMotivos } from '@/lib/infraestructura/motivos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Iniciar un reporte',
}

const TITULO = 'Iniciar un reporte'

// Mismos textos que app/problematicas/parte/page.tsx: el director no debería
// leer dos explicaciones distintas del mismo problema según por qué enlace
// entró.
const MENSAJES_ERROR: Record<ContextoErrorKind, string> = {
  cue_ausente: 'Este enlace no incluye el CUE de la escuela. Solicite el enlace nuevamente a quien se lo compartió.',
  cue_invalido: 'El CUE incluido en el enlace no tiene un formato válido.',
  sin_corte_vigente: 'No hay datos de escuelas disponibles en este momento. Intente nuevamente más tarde.',
  cue_inexistente: 'No se encontró una escuela con ese CUE.',
  sin_secciones: 'Esta escuela todavía no tiene secciones cargadas.',
}

/**
 * Pantalla "Iniciar un reporte" (spec §7): primer paso del parte, donde el
 * director informa la actualización del estado de su establecimiento.
 *
 * Misma guarda de acceso y resolución de contexto que la pantalla del estado
 * actual (spec §6): sin la cookie de acceso, el director ve el formulario de
 * ingreso; con ella, la página resuelve el establecimiento y entrega el
 * formulario de reporte inicial (mismos motivos sembrados que el resto del
 * recorrido público).
 */
export default async function NuevoPartePage({
  searchParams,
}: {
  searchParams: Promise<{ cue?: string }>
}) {
  const { cue } = await searchParams

  const cookieStore = await cookies()
  if (!tieneAccesoPublicoDesdeValorCookie(cookieStore.get(NOMBRE_COOKIE)?.value)) {
    return (
      <div className="publico-content">
        <h1 className="publico-content__title">{TITULO}</h1>
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
        <h1 className="publico-content__title">{TITULO}</h1>
        <p className="estado-actual-aviso__texto" role="alert">
          {MENSAJES_ERROR[resultado.error.kind]}
        </p>
      </div>
    )
  }

  const { escuela, turnos } = resultado.contexto

  await ensureSeeded()
  const motivos = await listarMotivos()

  return (
    <div className="publico-content">
      <h1 className="publico-content__title">{escuela.nombre}</h1>
      <p className="publico-content__intro">
        CUE {escuela.cueAnexo} · {escuela.localidad}, {escuela.departamento}
      </p>
      <ReporteInicialForm
        cue={escuela.cueAnexo}
        escuelaNombre={escuela.nombre}
        turnos={turnos}
        motivos={motivos}
      />
    </div>
  )
}