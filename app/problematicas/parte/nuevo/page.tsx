import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { AccesoForm } from '@/components/infraestructura/acceso-form'
import { EncabezadoParte, TITULO_PROGRAMA_COMPLETO } from '@/components/infraestructura/encabezado-parte'
import { ReporteInicialForm } from '@/components/infraestructura/reporte-inicial-form'
import { NOMBRE_COOKIE, tieneAccesoPublicoDesdeValorCookie } from '@/lib/infraestructura/acceso-publico'
import { resolverContextoPorCue, type ContextoErrorKind } from '@/lib/infraestructura/contexto'
import { ensureGeSchema, getCorteVigente, openGeDb } from '@/lib/infraestructura/ge-db'
import { destinoParaParte, enlaceDestino } from '@/lib/infraestructura/destino-carga'
import { obtenerParteActual } from '@/lib/infraestructura/parte-consulta'
import { redirect } from 'next/navigation'
import { ensureSeeded } from '@/lib/db/seed'
import { listarMotivos } from '@/lib/infraestructura/motivos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `Iniciar un reporte · ${TITULO_PROGRAMA_COMPLETO}`,
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
        <EncabezadoParte pantalla={TITULO} />
        <AccesoForm />
      </div>
    )
  }

  const clienteGe = openGeDb()
  let resultado
  // El corte se lee con el mismo cliente, antes de cerrarlo: la guarda de
  // abajo lo necesita y abrir una segunda conexión sólo para eso sería otra
  // ida a disco por cada carga de la pantalla.
  let corteId: number | null = null
  try {
    await ensureGeSchema(clienteGe)
    resultado = await resolverContextoPorCue(clienteGe, cue ?? null)
    corteId = (await getCorteVigente(clienteGe))?.id ?? null
  } finally {
    clienteGe.close()
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

  const { escuela, turnos } = resultado.contexto

  await ensureSeeded()

  // El director recibe un enlace y una contraseña, no un mapa del sitio: si
  // lo que le toca es la otra pantalla, se lo lleva sola. Las dos rutas
  // siguen existiendo, pero ninguna deja a nadie en el lugar equivocado.
  const destino = destinoParaParte(
    corteId === null ? null : await obtenerParteActual(escuela.cueAnexo, corteId),
  )
  if (destino !== 'nuevo') redirect(enlaceDestino(destino, escuela.cueAnexo))

  const motivos = await listarMotivos()

  return (
    <div className="publico-content">
      <EncabezadoParte
        pantalla={TITULO}
        escuela={escuela}
        descripcion="Informe un hecho. Le vamos a hacer unas pocas preguntas, de a una por vez."
      />
      <ReporteInicialForm cue={escuela.cueAnexo} turnos={turnos} motivos={motivos} />
    </div>
  )
}