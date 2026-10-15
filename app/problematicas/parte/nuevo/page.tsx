import type { Metadata } from 'next'
import { EncabezadoParte, TITULO_PROGRAMA_COMPLETO } from '@/components/infraestructura/encabezado-parte'
import { NuevoParteContenido } from '@/components/infraestructura/nuevo-parte-contenido'
import { bloqueoDeAcceso, cargarContextoParte, ErrorContexto } from '../compartido'
import { destinoParaParte, enlaceDestino } from '@/lib/infraestructura/destino-carga'
import { obtenerParteActual } from '@/lib/infraestructura/parte-consulta'
import { redirect } from 'next/navigation'
import { ensureSeeded } from '@/lib/db/seed'
import { listarMotivos } from '@/lib/infraestructura/motivos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `Cargar una situación · ${TITULO_PROGRAMA_COMPLETO}`,
}

const TITULO = 'Cargar una situación'

/**
 * Pantalla para cargar una situación (spec §7): primer paso del parte, donde el
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

  const { bloqueo, cue: cueParte } = await bloqueoDeAcceso(cue, TITULO)
  if (bloqueo) return bloqueo
  // The current cut is read alongside context using the same client for redirect resolution.
  const { resultado, corteId } = await cargarContextoParte(cueParte)

  if (!resultado.ok) {
    return (
      <div className="publico-content">
        <EncabezadoParte pantalla={TITULO} />
        <ErrorContexto kind={resultado.error.kind} />
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
    <div className="publico-content publico-content--parte">
      <NuevoParteContenido cue={escuela.cueAnexo} escuela={escuela} turnos={turnos} motivos={motivos} />
    </div>
  )
}
