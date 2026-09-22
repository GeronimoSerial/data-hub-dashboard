'use client'

import { useEffect, useState, type JSX } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface AlumnoAlcanzado {
  nombre: string
  apellido: string
}

interface SeccionAlcanzada {
  geSectionId: number
  curso: string
  division: string
  turno: string
  alumnos: AlumnoAlcanzado[]
}

interface RespuestaNominal {
  ok?: boolean
  secciones?: SeccionAlcanzada[]
  cantidad?: number
  error?: string
}

type Estado =
  | { fase: 'cargando' }
  | { fase: 'listo'; secciones: SeccionAlcanzada[]; cantidad: number }
  | { fase: 'error' }

function nombreVisible(alumno: AlumnoAlcanzado): string {
  return alumno.apellido ? `${alumno.apellido}, ${alumno.nombre}` : alumno.nombre
}

/**
 * Contenido del modal nominal. Componente aparte (no inline en
 * `AlcanceNominalModal`) para que el `useEffect` de fetch tenga dependencias
 * vacías A PROPÓSITO: un fetch por MONTAJE, no por cambio de prop. Sólo se
 * monta cuando `afectacionId !== null` (ver el padre), así que montaje =
 * apertura del modal = un evento auditado en infra_acceso_nominal_log. El
 * padre le pasa `key={afectacionId}`, así que si se reabre con OTRA
 * afectación sin pasar por un ciclo close→open completo, React lo trata como
 * un componente nuevo y no como un rerender con la misma instancia.
 */
function AlcanceNominalContenido({ afectacionId }: { afectacionId: string }): JSX.Element {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })

  useEffect(() => {
    let vigente = true
    fetch(`/api/mapas/infraestructura/nominal?afectacionId=${encodeURIComponent(afectacionId)}`)
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error('fallo de acceso o de red')
        return (await respuesta.json()) as RespuestaNominal
      })
      .then((datos) => {
        if (!vigente) return
        setEstado({ fase: 'listo', secciones: datos.secciones ?? [], cantidad: datos.cantidad ?? 0 })
      })
      .catch(() => {
        if (vigente) setEstado({ fase: 'error' })
      })
    return () => {
      vigente = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dependencia vacía a propósito, ver comentario arriba
  }, [])

  if (estado.fase === 'cargando') {
    return (
      <p className="historial-estado" role="status">
        Buscando los alumnos alcanzados…
      </p>
    )
  }

  if (estado.fase === 'error') {
    return (
      <p className="historial-estado__texto" role="alert">
        No pudimos mostrar el alcance nominal. Puede que ya no tenga acceso o que la conexión haya
        fallado; cierre este modal y vuelva a intentar.
      </p>
    )
  }

  if (estado.secciones.length === 0) {
    return (
      <p className="historial-estado__texto">
        No hay alumnos identificados alcanzados por esta afectación.
      </p>
    )
  }

  return (
    <div className="alcance-nominal-modal__resultado">
      <p className="alcance-nominal-modal__cantidad">
        {estado.cantidad === 1 ? '1 alumno alcanzado.' : `${estado.cantidad} alumnos alcanzados.`}
      </p>
      {estado.secciones.map((seccion) => (
        <section key={seccion.geSectionId} className="alcance-nominal-modal__seccion">
          <h3 className="alcance-nominal-modal__seccion-titulo">
            {seccion.curso} {seccion.division} · {seccion.turno}
          </h3>
          {seccion.alumnos.length === 0 ? (
            <p className="alcance-nominal-modal__vacio">Sin identidad importada para esta sección.</p>
          ) : (
            <ul className="alcance-nominal-modal__alumnos">
              {seccion.alumnos.map((alumno, indice) => (
                <li key={indice}>{nombreVisible(alumno)}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

/**
 * Modal de alcance nominal (F3.3 frontend): la ÚNICA puerta a nombres de
 * alumnos desde el mapa, y cada apertura escribe una fila de auditoría en el
 * servidor (`infra_acceso_nominal_log`, vía `GET /api/mapas/infraestructura/nominal`).
 * Por eso nunca se prefetchea ni se monta especulativamente: el contenido
 * (con su fetch adentro) sólo existe mientras `afectacionId !== null`, igual
 * que `RecursoDialog` en `components/admin-page.tsx`.
 */
export function AlcanceNominalModal({
  afectacionId,
  onOpenChange,
}: {
  afectacionId: string | null
  onOpenChange: (open: boolean) => void
}): JSX.Element {
  return (
    <Dialog open={afectacionId !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Alumnos alcanzados</DialogTitle>
        {afectacionId ? <AlcanceNominalContenido key={afectacionId} afectacionId={afectacionId} /> : null}
      </DialogContent>
    </Dialog>
  )
}
