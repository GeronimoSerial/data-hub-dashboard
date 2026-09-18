import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { AccesoForm } from '@/components/infraestructura/acceso-form'
import { ActualizacionForm } from '@/components/infraestructura/actualizacion-form'
import { NOMBRE_COOKIE, tieneAccesoPublicoDesdeValorCookie } from '@/lib/infraestructura/acceso-publico'
import { resolverContextoPorCue, type ContextoErrorKind } from '@/lib/infraestructura/contexto'
import { ensureGeSchema, openGeDb } from '@/lib/infraestructura/ge-db'
import { ensureSeeded } from '@/lib/db/seed'
import { listarMotivos } from '@/lib/infraestructura/motivos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Actualizar el parte',
}

const TITULO = 'Actualizar el parte'

// Mismos textos que app/problematicas/parte/page.tsx y
// app/problematicas/parte/nuevo/page.tsx: el director no debería leer dos
// explicaciones distintas del mismo problema según por qué enlace entró.
const MENSAJES_ERROR: Record<ContextoErrorKind, string> = {
  cue_ausente: 'Este enlace no incluye el CUE de la escuela. Solicite el enlace nuevamente a quien se lo compartió.',
  cue_invalido: 'El CUE incluido en el enlace no tiene un formato válido.',
  sin_corte_vigente: 'No hay datos de escuelas disponibles en este momento. Intente nuevamente más tarde.',
  cue_inexistente: 'No se encontró una escuela con ese CUE.',
  sin_secciones: 'Esta escuela todavía no tiene secciones cargadas.',
}

/**
 * Pantalla "Actualizar el parte" (spec §8): el director modifica lo que
 * cambió en una situación ya en seguimiento. Misma guarda de acceso y
 * resolución de contexto que el resto del recorrido público (spec §6, §7):
 * sin la cookie de acceso, el director ve el formulario de ingreso; con
 * ella, la página resuelve el establecimiento y entrega el formulario de
 * actualización, que a su vez trae el estado vigente del parte por su
 * cuenta (mismo GET que EstadoActualParte).
 */
export default async function ActualizarPartePage({
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
      <ActualizacionForm
        cue={escuela.cueAnexo}
        escuelaNombre={escuela.nombre}
        turnos={turnos}
        motivos={motivos}
      />
    </div>
  )
}