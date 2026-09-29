import type { Metadata } from 'next'
import { ActualizacionForm } from '@/components/infraestructura/actualizacion-form'
import { EncabezadoParte, TITULO_PROGRAMA_COMPLETO } from '@/components/infraestructura/encabezado-parte'
import { bloqueoDeAcceso, cargarContextoParte, ErrorContexto } from '../compartido'
import { destinoParaParte, enlaceDestino } from '@/lib/infraestructura/destino-carga'
import { obtenerParteActual } from '@/lib/infraestructura/parte-consulta'
import { redirect } from 'next/navigation'
import { ensureSeeded } from '@/lib/db/seed'
import { listarMotivos } from '@/lib/infraestructura/motivos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: `Actualizar · ${TITULO_PROGRAMA_COMPLETO}`,
}

const TITULO = 'Actualizar'

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

  const bloqueo = await bloqueoDeAcceso(cue, TITULO)
  if (bloqueo) return bloqueo
  // The current cut is read alongside context using the same client for redirect resolution.
  const { resultado, corteId } = await cargarContextoParte(cue)

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
  if (destino !== 'actualizar') redirect(enlaceDestino(destino, escuela.cueAnexo))

  const motivos = await listarMotivos()

  return (
    <div className="publico-content publico-content--ancho">
      <EncabezadoParte
        pantalla={TITULO}
        escuela={escuela}
        descripcion="Revise lo informado hasta ahora y agregue o corrija lo que cambió."
      />
      <ActualizacionForm cue={escuela.cueAnexo} turnos={turnos} motivos={motivos} />
    </div>
  )
}
