import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'
import { getRawClient } from '@/lib/db'
import { resolverContextoPorCue, type ContextoErrorKind } from '@/lib/infraestructura/contexto'
import { ensureGeSchema, crearEjecutorSql } from '@/lib/infraestructura/ge-db'
import { ensureLocalizacionesSeeded } from '@/lib/infraestructura/localizaciones-seed'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Cargar el parte de una escuela',
}

const MENSAJES_ERROR: Record<ContextoErrorKind, string> = {
  cue_ausente: 'Ingrese el CUE de la escuela.',
  cue_invalido: 'El CUE ingresado no tiene un formato válido.',
  sin_corte_vigente: 'No hay datos de escuelas disponibles en este momento.',
  cue_inexistente: 'No se encontró una escuela con ese CUE.',
  sin_secciones: 'La escuela no tiene secciones cargadas en el corte vigente.',
}

/**
 * Puente entre el hub interno y el recorrido del director.
 *
 * El recorrido del parte identifica la escuela por el CUE del enlace, así que
 * no se puede entrar desde el hub, que no tiene escuela en contexto. Esta
 * pantalla resuelve esa única pieza: se ingresa un CUE, se confirma de qué
 * escuela se trata y recién entonces se entra a cargar.
 *
 * La resolución ocurre en el servidor y no contra /api/problematicas/contexto:
 * ese endpoint exige la contraseña pública (acceso-publico.ts) porque devuelve
 * identidad de alumnos, y acá ya hay sesión del hub. Se consulta directo, con
 * la misma guarda que el resto de /(hub).
 */
export default async function CargarParteEscuelaPage({
  searchParams,
}: {
  searchParams: Promise<{ cue?: string }>
}) {
  const user = await getSessionUser()
  if (!user) redirect('/login?callbackUrl=/infraestructura/cargar')

  const { cue } = await searchParams
  const buscado = typeof cue === 'string' && cue.trim() !== ''

  let resultado = null
  if (buscado) {
    await ensureLocalizacionesSeeded()
    const client = crearEjecutorSql(getRawClient())
    await ensureGeSchema(client)
    resultado = await resolverContextoPorCue(client, cue)
  }

  const escuela = resultado?.ok ? resultado.contexto.escuela : null

  return (
    <div className="cargar-parte">
      <header className="cargar-parte__encabezado">
        <h1>Cargar el parte de una escuela</h1>
        <p className="cargar-parte__intro">
          Indique el CUE para confirmar de qué escuela se trata antes de entrar a cargar.
        </p>
      </header>

      {/* Un GET y no un formulario con estado: el CUE queda en la URL, así que
          la búsqueda se puede compartir, marcar y recargar sin repetirla. */}
      <form className="cargar-parte__busqueda" method="get" action="/infraestructura/cargar">
        <div className="cargar-parte__campo">
          <Label htmlFor="cue">CUE de la escuela</Label>
          <Input id="cue" name="cue" defaultValue={cue ?? ''} placeholder="1800001-00" />
        </div>
        <Button type="submit">Buscar escuela</Button>
      </form>

      {buscado && !escuela && resultado && !resultado.ok && (
        <p className="cargar-parte__error" role="alert">
          {MENSAJES_ERROR[resultado.error.kind]}
        </p>
      )}

      {escuela && (
        <section className="cargar-parte__resultado" aria-live="polite">
          <p className="cargar-parte__escuela">{escuela.nombre}</p>
          <p className="cargar-parte__ubicacion">
            CUE {escuela.cueAnexo} · {escuela.localidad}, {escuela.departamento}
          </p>

          {/* Siempre a /nuevo: esa ruta decide sola si corresponde iniciar o
              actualizar según el estado del parte (destino-carga.ts). */}
          <Link
            className="ui-button ui-button--default"
            href={`/problematicas/parte/nuevo?cue=${encodeURIComponent(escuela.cueAnexo)}`}
          >
            Cargar el parte
          </Link>

          <p className="cargar-parte__aviso">
            La pantalla de carga pide la contraseña de acceso del recorrido público, la misma que
            recibe el director junto con su enlace.
          </p>
        </section>
      )}
    </div>
  )
}
