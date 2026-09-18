'use client'

import { useRef, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { AfectacionBorradorCard, type AfectacionBorrador } from '@/components/infraestructura/afectacion-borrador'
import { VigenciaField } from '@/components/infraestructura/vigencia-field'
import {
  ETIQUETA_ESTABLECIMIENTO,
  ETIQUETA_SERVICIO,
} from '@/components/infraestructura/estado-actual-textos'
import { SeccionesSelector } from '@/components/infraestructura/secciones-selector'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { MotivoRow } from '@/lib/infraestructura/motivos'
import type { Severidad } from '@/lib/infraestructura/validacion'
import type { CategoriaProblematica } from '@/lib/infraestructura/categorias'
import type { EstadoEstablecimiento } from '@/lib/infraestructura/trayectoria-tipos'

export interface ReporteInicialFormProps {
  cue: string
  escuelaNombre: string
  turnos: TurnoContexto[]
  motivos: MotivoRow[]
}

const MENSAJE_ERROR_GUARDADO =
  'No pudimos guardar la actualización. La información ingresada se mantiene para que pueda volver a intentar.'

const MENSAJE_AFECTACION_INCOMPLETA =
  'Complete categoría, motivo, severidad y al menos una sección en cada afectación agregada, o quítela.'

const MENSAJE_ALCANCE_FALTANTE = 'Indique el alcance de la suspensión.'

const MENSAJE_GUARDADO =
  'La actualización fue registrada. El estado actual y el historial ya reflejan los cambios informados.'

const ALCANCES_SERVICIO: { tipo: 'establecimiento' | 'turno' | 'seccion'; etiqueta: string }[] = [
  { tipo: 'establecimiento', etiqueta: 'Todo el establecimiento' },
  { tipo: 'turno', etiqueta: 'Uno o más turnos' },
  { tipo: 'seccion', etiqueta: 'Una o más secciones' },
]

// Una fila está lista para enviar sólo cuando sus cuatro datos obligatorios
// están completos. Una fila a medio llenar no se manda ni habilita el botón.
function esAfectacionLista(a: AfectacionBorrador): a is AfectacionBorrador & {
  categoria: CategoriaProblematica
  severidad: Severidad
} {
  return a.categoria !== '' && a.motivo !== '' && a.severidad !== '' && a.secciones.length > 0
}

function esAfectacionParcial(a: AfectacionBorrador): boolean {
  if (esAfectacionLista(a)) return false
  return (
    a.categoria !== '' ||
    a.motivo !== '' ||
    a.severidad !== '' ||
    a.secciones.length > 0 ||
    a.alumnos.length > 0 ||
    a.descripcion.trim() !== ''
  )
}

export function ReporteInicialForm({
  cue,
  escuelaNombre,
  turnos,
  motivos,
}: ReporteInicialFormProps): JSX.Element {
  const [afectaciones, setAfectaciones] = useState<AfectacionBorrador[]>([])
  const [servicioEstado, setServicioEstado] = useState<'' | 'normal' | 'suspendido'>('')
  const [servicioAlcanceTipo, setServicioAlcanceTipo] = useState<'' | 'establecimiento' | 'turno' | 'seccion'>('')
  const [servicioTurnos, setServicioTurnos] = useState<string[]>([])
  const [servicioSecciones, setServicioSecciones] = useState<number[]>([])
  const [estadoEstablecimiento, setEstadoEstablecimiento] = useState<'' | EstadoEstablecimiento>('')
  const [rigeDesde, setRigeDesde] = useState(() => new Date().toISOString())
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState<{ movimientoId: string } | null>(null)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const enviandoRef = useRef(false)

  const nombresTurnos = Array.from(new Set(turnos.map((t) => t.turno)))

  const afectacionesListasParaEnviar = afectaciones.filter(esAfectacionLista)

  // Espejo exacto del refine del servidor: si no hay afectaciones listas ni
  // servicio ni estado del establecimiento, no hay nada que informar y el
  // director no debe poder mandar un parte vacío.
  const hayAlgunCambio =
    afectacionesListasParaEnviar.length > 0 || servicioEstado !== '' || estadoEstablecimiento !== ''

  function agregarAfectacion() {
    setAfectaciones((actuales) => [
      ...actuales,
      {
        clientId: crypto.randomUUID(),
        categoria: '',
        motivo: '',
        severidad: '',
        secciones: [],
        alumnos: [],
        descripcion: '',
      },
    ])
  }

  function alternarTurno(turno: string) {
    setServicioTurnos((actuales) =>
      actuales.includes(turno) ? actuales.filter((t) => t !== turno) : [...actuales, turno],
    )
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enviando || enviandoRef.current) return

    if (afectaciones.some(esAfectacionParcial)) {
      setError(MENSAJE_AFECTACION_INCOMPLETA)
      return
    }
    if (servicioEstado === 'suspendido' && servicioAlcanceTipo === '') {
      setError(MENSAJE_ALCANCE_FALTANTE)
      return
    }

    enviandoRef.current = true
    setEnviando(true)
    setError(null)

    const alcance =
      servicioAlcanceTipo === 'turno'
        ? { tipo: 'turno' as const, turnos: servicioTurnos }
        : servicioAlcanceTipo === 'seccion'
          ? { tipo: 'seccion' as const, secciones: servicioSecciones }
          : { tipo: 'establecimiento' as const }

    try {
      const respuesta = await fetch('/api/problematicas/parte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cue,
          idempotencyKey,
          rigeDesde,
          afectacionesNuevas: afectacionesListasParaEnviar.map((a) => ({
            motivo: a.motivo,
            severidad: a.severidad,
            descripcion: a.descripcion.trim() || undefined,
            secciones: a.secciones,
            alumnos: a.alumnos.length > 0 ? a.alumnos : undefined,
          })),
          afectacionesModificadas: [],
          afectacionesRetiradas: [],
          servicioEducativo:
            servicioEstado === ''
              ? undefined
              : { estado: servicioEstado, alcance },
          estadoEstablecimiento:
            estadoEstablecimiento === '' ? undefined : { estado: estadoEstablecimiento },
        }),
      })

      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => null)
        enviandoRef.current = false
        setEnviando(false)
        setError(cuerpo && typeof cuerpo.error === 'string' ? cuerpo.error : MENSAJE_ERROR_GUARDADO)
        return
      }

      const datos = await respuesta.json()
      if (datos?.ok === true) {
        // Un reporte guardado no se reenvía desde la misma instancia del
        // formulario: el ref queda clavado en true a propósito.
        setGuardado({ movimientoId: datos.movimientoId })
        return
      }

      enviandoRef.current = false
      setEnviando(false)
      setError(datos && typeof datos.error === 'string' ? datos.error : MENSAJE_ERROR_GUARDADO)
    } catch {
      enviandoRef.current = false
      setEnviando(false)
      setError(MENSAJE_ERROR_GUARDADO)
    }
  }

  if (guardado) {
    return (
      <div className="reporte-inicial__confirmacion" role="status">
        <p>{MENSAJE_GUARDADO}</p>
      </div>
    )
  }

  return (
    <form className="reporte-inicial" onSubmit={manejarEnvio}>
      <div className="reporte-inicial__escuela">
        <p>{escuelaNombre}</p>
        <p>CUE {cue}</p>
      </div>

      <section className="reporte-inicial__seccion">
        <h2>Afectaciones</h2>
        {afectaciones.map((a, i) => (
          <AfectacionBorradorCard
            key={a.clientId}
            borrador={a}
            index={i}
            motivos={motivos}
            turnos={turnos}
            otrasAfectaciones={afectaciones.filter((_, j) => j !== i)}
            onChange={(siguiente) =>
              setAfectaciones((actuales) => actuales.map((x, j) => (j === i ? siguiente : x)))
            }
            onRemove={() => setAfectaciones((actuales) => actuales.filter((_, j) => j !== i))}
            disabled={enviando}
          />
        ))}
        <Button type="button" variant="secondary" onClick={agregarAfectacion} disabled={enviando}>
          Agregar afectación
        </Button>
      </section>

      <section className="reporte-inicial__seccion">
        <h2>Servicio educativo</h2>
        <div className="reporte-inicial__campo" role="radiogroup" aria-label="Servicio educativo">
          {(['normal', 'suspendido'] as const).map((estado) => (
            <label key={estado} className="reporte-inicial__radio">
              <input
                type="radio"
                name="servicio-educativo"
                value={estado}
                checked={servicioEstado === estado}
                onChange={() => setServicioEstado(estado)}
                disabled={enviando}
              />
              {ETIQUETA_SERVICIO[estado]}
            </label>
          ))}
        </div>

        {servicioEstado === 'suspendido' && (
          <div className="reporte-inicial__campo">
            <div role="radiogroup" aria-label="Alcance de la suspensión">
              {ALCANCES_SERVICIO.map((opcion) => (
                <label key={opcion.tipo} className="reporte-inicial__radio">
                  <input
                    type="radio"
                    name="alcance-servicio"
                    value={opcion.tipo}
                    checked={servicioAlcanceTipo === opcion.tipo}
                    onChange={() => setServicioAlcanceTipo(opcion.tipo)}
                    disabled={enviando}
                  />
                  {opcion.etiqueta}
                </label>
              ))}
            </div>

            {servicioAlcanceTipo === 'turno' && (
              <div className="reporte-inicial__campo">
                {nombresTurnos.map((turno) => (
                  <Checkbox
                    key={turno}
                    label={turno}
                    checked={servicioTurnos.includes(turno)}
                    onCheckedChange={() => alternarTurno(turno)}
                    disabled={enviando}
                  />
                ))}
              </div>
            )}

            {servicioAlcanceTipo === 'seccion' && (
              <SeccionesSelector
                turnos={turnos}
                seleccionadas={servicioSecciones}
                alumnosSeleccionados={[]}
                onCambiar={(secciones) => setServicioSecciones(secciones)}
                disabled={enviando}
                permiteAlumnos={false}
              />
            )}
          </div>
        )}
      </section>

      <section className="reporte-inicial__seccion">
        <h2>Situación del establecimiento</h2>
        <div className="reporte-inicial__campo" role="radiogroup" aria-label="Situación del establecimiento">
          {Object.entries(ETIQUETA_ESTABLECIMIENTO).map(([valor, etiqueta]) => (
            <label key={valor} className="reporte-inicial__radio">
              <input
                type="radio"
                name="estado-establecimiento"
                value={valor}
                checked={estadoEstablecimiento === valor}
                onChange={() => setEstadoEstablecimiento(valor as EstadoEstablecimiento)}
                disabled={enviando}
              />
              {etiqueta}
            </label>
          ))}
        </div>
      </section>

      <section className="reporte-inicial__seccion">
        <VigenciaField value={rigeDesde} onChange={setRigeDesde} disabled={enviando} />
      </section>

      {error && (
        <p className="reporte-inicial__error" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={enviando || !hayAlgunCambio}>
        Guardar reporte
      </Button>
    </form>
  )
}