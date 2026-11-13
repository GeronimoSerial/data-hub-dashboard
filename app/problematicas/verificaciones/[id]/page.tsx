import type { Metadata } from 'next'
import { VerificacionResponder } from '@/components/infraestructura/verificacion-responder'
import { getRawClient } from '@/lib/db'
import { resolverContextoPorCue } from '@/lib/infraestructura/contexto'
import { ensureGeSchema, crearEjecutorSql } from '@/lib/infraestructura/ge-db'
import { obtenerVerificacion } from '@/lib/infraestructura/verificaciones'
import { textosActuales } from '@/lib/i18n'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: textosActuales().shellHub.verificacion.titulo }
}

/**
 * Puerta de entrada del enlace de verificación escolar del batch E1
 * (protocolo ENOS). Pública a propósito y SIN guarda de acceso: la única
 * credencial es el token que viaja en la query string del enlace y que se
 * reenvía por POST en el cuerpo — nunca se lee ni se registra acá.
 *
 * La página no llama a ninguna API: toda la lógica de red vive en el
 * componente cliente, que valida el token al montar. Sólo resuelve el nombre
 * del establecimiento del lado del servidor (lectura local de GE), como
 * adorno: si no está disponible, la pantalla sigue funcionando con el CUE.
 */
export default async function VerificacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { id } = await params
  const { token } = await searchParams

  if (!token) {
    const t = textosActuales().shellHub.verificacion
    return (
      <div className="publico-content">
        <div className="estado-actual-aviso">
          <p className="estado-actual-aviso__texto" role="alert">
            {t.sinCredencial}
          </p>
        </div>
      </div>
    )
  }

  // El nombre de la escuela es un adorno: nunca debe romper la página. Se
  // resuelve SÓLO para el CUE de esta verificación (el id del path no es
  // secreto; el token sigue siendo la única credencial).
  const fila = await obtenerVerificacion(id).catch(() => null)
  let escuelaNombre: string | undefined
  if (fila) {
    const client = crearEjecutorSql(getRawClient())
    try {
      await ensureGeSchema(client)
      const resultado = await resolverContextoPorCue(client, fila.cueAnexo)
      if (resultado.ok) escuelaNombre = resultado.contexto.escuela.nombre
    } catch {
      // GE no disponible: se sigue con el CUE.
    }
  }

  return (
    <div className="publico-content">
      <VerificacionResponder
        verificacionId={id}
        token={token}
        escuelaNombre={escuelaNombre}
      />
    </div>
  )
}
