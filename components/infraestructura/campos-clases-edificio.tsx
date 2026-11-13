'use client'

import { Fragment, useState, type JSX, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { ETIQUETA_ESTABLECIMIENTO, etiquetaClases, etiquetaEstablecimiento } from '@/components/infraestructura/estado-actual-textos'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Opcion } from '@/components/ui/opcion'
import { AvisosConsistencia } from '@/components/infraestructura/afectacion-campos'
import type { EstadoEstablecimiento } from '@/lib/infraestructura/trayectoria-tipos'
import { evaluarCambioAHabitual } from '@/lib/infraestructura/consistencia-estado-activo'
import {
  bloqueoOpcion,
  mensajeConsistencia,
  type Regla,
  type RespuestasConsistencia,
  type Sugerencia,
} from '@/lib/infraestructura/consistencia-parte'
import { useTextos } from '@/lib/i18n/idioma-provider'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

export interface ValorClasesEdificio {
  servicioEstado: '' | 'normal' | 'suspendido'
  estadoEstablecimiento: '' | EstadoEstablecimiento
}

const INTERRUMPE_TODO: EstadoEstablecimiento[] = ['evacuado', 'centro_evacuados']
// Estados del edificio que dejan a toda la escuela sin clases.
const SUSPENDE_CLASES: EstadoEstablecimiento[] = ['evacuado', 'sin_clases']
const ESTADOS_EDIFICIO = Object.keys(ETIQUETA_ESTABLECIMIENTO) as EstadoEstablecimiento[]

// Elegir "evacuado" o "sin clases" suspende las clases (ver aplicarEdificio):
// el bloqueo se evalúa con esa consecuencia, no con la respuesta vigente.
function bloqueoEdificio(respuestas: RespuestasConsistencia | undefined, estado: string): Regla | null {
  if (!respuestas) return null
  const implicita = SUSPENDE_CLASES.includes(estado as EstadoEstablecimiento) ? { ...respuestas, clases: 'suspendido' as const } : respuestas
  return bloqueoOpcion(implicita, 'edificio', estado)
}

function bloqueoClases(respuestas: RespuestasConsistencia | undefined, estado: string): Regla | null {
  return respuestas ? bloqueoOpcion(respuestas, 'clases', estado) : null
}

// El motivo del bloqueo vive dentro de la opción deshabilitada, con candado.
// Va como descripción (aria-describedby) y no como parte del nombre: el nombre
// de la opción sigue siendo su etiqueta.
function MotivoBloqueo({ id, mensaje }: { id: string; mensaje: string }): JSX.Element {
  return (
    <span id={id} className="opcion__bloqueo">
      <Lock className="opcion__candado" size={14} aria-hidden="true" />
      {mensaje}
    </span>
  )
}

// Bloqueos del cambio a habitual (update) que no deshabilitan la opción pero sí frenan el envío.
function mensajesPrevios(reglas: Regla[], diccionario: Diccionario): ReactNode {
  if (reglas.length === 0) return undefined
  return reglas.map((regla) => <span key={regla.codigo} className="opcion__bloqueo">{mensajeConsistencia(regla.mensaje, diccionario)}</span>)
}

// Advertencias de un campo que no tienen opción a la cual asociarse (p. ej.
// sin respuesta todavía) se muestran al final del grupo.
function avisosSinOpcion(reglas: Regla[], campo: 'edificio' | 'clases', actual: string | null | undefined, opciones: string[]): Regla[] {
  const delCampo = reglas.filter((regla) => regla.campo === campo)
  return actual && opciones.includes(actual) ? [] : delCampo
}

export function CamposClasesEdificio({
  valor,
  onCambiar,
  alcanceParcial,
  onInterrumpirTodaLaEscuela,
  respuestas,
  advertencias = [],
  alcanceAlgunas = false,
  esInstituto = false,
  disabled = false,
  estadoActual,
  afectacionesActivas = [],
  onConfirmarHabitual,
  bloqueos = [],
  bloqueosHabitualPorAfectacion = {},
}: {
  valor: ValorClasesEdificio
  onCambiar: (valor: ValorClasesEdificio) => void
  alcanceParcial: boolean
  /** Recibe el valor ya elegido: el padre no debe tomar el estado previo del render. */
  onInterrumpirTodaLaEscuela: (valor: ValorClasesEdificio) => void
  /** Sin respuestas no hay reglas que aplicar: las opciones quedan habilitadas. */
  respuestas?: RespuestasConsistencia
  advertencias?: Regla[]
  alcanceAlgunas?: boolean
  /** Institutos superiores: el alcance se habla en carreras, no en escuela ni secciones. */
  esInstituto?: boolean
  disabled?: boolean
  /** Estado del edificio en la escuela hoy. Sólo la actualización lo informa. */
  estadoActual?: EstadoEstablecimiento
  /** Al pasar de evacuado o centro de evacuados a habitual, cada una necesita una decisión. */
  afectacionesActivas?: Array<{ id: string; motivo: string }>
  onConfirmarHabitual?: (decisiones: Record<string, 'solucionada' | 'sigue'>) => void
  /** Bloqueos del cambio a habitual; cada uno se muestra en la opción que bloquean. */
  bloqueos?: Regla[]
  /**
   * Por afectación activa, el motivo por el que no puede figurar como habitual
   * si sigue activa. Una afectación que se cierra en esta actualización no bloquea.
   */
  bloqueosHabitualPorAfectacion?: Record<string, string>
}): JSX.Element {
  const diccionario = useTextos()
  const t = diccionario.parteCampos
  const [pendiente, setPendiente] = useState<EstadoEstablecimiento | null>(null)
  const [hojaHabitual, setHojaHabitual] = useState(false)
  const [decisiones, setDecisiones] = useState<Record<string, 'solucionada' | 'sigue'>>({})
  const evacuado = valor.estadoEstablecimiento === 'evacuado'
  const sinClases = valor.estadoEstablecimiento === 'sin_clases'
  const saleDeEvacuacion = estadoActual !== undefined && INTERRUMPE_TODO.includes(estadoActual)
  // Al salir de una evacuación con afectaciones activas, el bloqueo de habitual
  // lo decide la hoja: cada afectación se marca solucionada o sigue activa.
  const habitualDecididoEnLaHoja = (estado: string) => estado === 'habitual' && saleDeEvacuacion && afectacionesActivas.length > 0
  const bloqueoEdificioVigente = (estado: string) => (habitualDecididoEnLaHoja(estado) ? null : bloqueoEdificio(respuestas, estado))
  const decididas = afectacionesActivas.filter((afectacion) => decisiones[afectacion.id] !== undefined).length
  const seguiraSinHabitual = afectacionesActivas.some((afectacion) => decisiones[afectacion.id] === 'sigue' && bloqueosHabitualPorAfectacion[afectacion.id])
  // Sólo se usan las advertencias: no dependen del servicio, que aquí no interesa.
  const avisosHabitual = evaluarCambioAHabitual({
    estadoActual: estadoActual ?? null,
    nuevoEstado: 'habitual',
    servicioActual: 'normal',
    servicioEnvio: null,
    afectacionesActivas,
    solucionadas: afectacionesActivas.filter((a) => decisiones[a.id] === 'solucionada').map((a) => a.id),
    sigueActiva: afectacionesActivas.filter((a) => decisiones[a.id] === 'sigue').map((a) => a.id),
  }).advertencias

  const bloqueosEdificioPrevios = bloqueos.filter((regla) => regla.campo === 'edificio')
  const bloqueosClasesPrevios = bloqueos.filter((regla) => regla.campo === 'clases')
  const avisosEdificioSueltos = avisosSinOpcion(advertencias, 'edificio', respuestas?.edificio, ESTADOS_EDIFICIO)
  const avisosClasesSueltos = avisosSinOpcion(advertencias, 'clases', respuestas?.clases, ['normal', 'suspendido'])

  // Evacuado o sin clases ⇒ clases suspendidas: la combinación contraria es imposible.
  function valorConEdificio(estado: EstadoEstablecimiento): ValorClasesEdificio {
    return { estadoEstablecimiento: estado, servicioEstado: SUSPENDE_CLASES.includes(estado) ? 'suspendido' : valor.servicioEstado }
  }

  function aplicarEdificio(estado: EstadoEstablecimiento) {
    onCambiar(valorConEdificio(estado))
  }

  function elegirEdificio(estado: EstadoEstablecimiento) {
    if (bloqueoEdificioVigente(estado) !== null) return
    if (habitualDecididoEnLaHoja(estado)) {
      setDecisiones({})
      setHojaHabitual(true)
      return
    }
    if (INTERRUMPE_TODO.includes(estado) && alcanceParcial) {
      setPendiente(estado)
      return
    }
    aplicarEdificio(estado)
  }

  // "Cambiar a": aplica el valor que resuelve la advertencia, si la opción está habilitada.
  function aplicarSugerencia(sugerencia: Sugerencia) {
    if (sugerencia.campo === 'edificio') {
      const estado = sugerencia.valor as EstadoEstablecimiento
      if (bloqueoEdificioVigente(estado) === null) aplicarEdificio(estado)
      return
    }
    if (sugerencia.campo === 'clases' && bloqueoClases(respuestas, sugerencia.valor) === null) {
      onCambiar({ ...valor, servicioEstado: sugerencia.valor as 'normal' | 'suspendido' })
    }
  }

  function ayudaEdificio(estado: EstadoEstablecimiento): ReactNode {
    const bloqueo = bloqueoEdificioVigente(estado)
    if (bloqueo) return <MotivoBloqueo id={`bloqueo-edificio-${estado}`} mensaje={mensajeConsistencia(bloqueo.mensaje, diccionario)} />
    return estado === 'habitual' ? mensajesPrevios(bloqueosEdificioPrevios, diccionario) : undefined
  }

  function ayudaClases(estado: 'normal' | 'suspendido'): ReactNode {
    const bloqueo = bloqueoClases(respuestas, estado)
    if (bloqueo) return <MotivoBloqueo id={`bloqueo-clases-${estado}`} mensaje={mensajeConsistencia(bloqueo.mensaje, diccionario)} />
    return estado === 'normal' ? mensajesPrevios(bloqueosClasesPrevios, diccionario) : undefined
  }

  return (
    <>
      <fieldset className="afectacion-campos__grupo" disabled={disabled} aria-label={t.clases.hayClases}>
        <p className="afectacion-campos__legend">{t.clases.hayClases}</p>
        <div className="afectacion-campos__opciones">
          {(['normal', 'suspendido'] as const).map((estado) => (
            <Fragment key={estado}>
              <Opcion
                  tipo="radio"
                  name="servicio-educativo"
                  value={estado}
                  checked={valor.servicioEstado === estado}
                  onChange={() => {
                    if (bloqueoClases(respuestas, estado) === null) onCambiar({ ...valor, servicioEstado: estado })
                  }}
                  disabled={disabled || evacuado || sinClases || bloqueoClases(respuestas, estado) !== null}
                  aria-labelledby={`etiqueta-clases-${estado}`}
                  aria-describedby={bloqueoClases(respuestas, estado) ? `bloqueo-clases-${estado}` : undefined}
                  label={<span id={`etiqueta-clases-${estado}`}>{etiquetaClases(estado, diccionario)}</span>}
                  ayuda={ayudaClases(estado)}
                  compacta
                />
              <AvisosConsistencia
                reglas={advertencias.filter((regla) => regla.campo === 'clases' && respuestas?.clases === estado)}
                campos={['clases']}
                onAplicar={aplicarSugerencia}
              />
            </Fragment>
          ))}
          <AvisosConsistencia reglas={avisosClasesSueltos} campos={['clases']} onAplicar={aplicarSugerencia} />
        </div>
        {evacuado ? <p className="afectacion-campos__espera">{t.clases.edificioEvacuado}</p> : null}
        {sinClases ? <p className="afectacion-campos__espera">{t.clases.edificioSinClases}</p> : null}
        {alcanceAlgunas && valor.servicioEstado === 'suspendido' ? (
          <p className="afectacion-campos__espera">{t.clases.algunasSecciones}</p>
        ) : null}
      </fieldset>

      <fieldset className="afectacion-campos__grupo" disabled={disabled} aria-label={t.clases.comoEstaEdificio}>
        <p className="afectacion-campos__legend">{t.clases.comoEstaEdificio}</p>
        <div className="afectacion-campos__opciones">
          {ESTADOS_EDIFICIO.map((estado) => (
            <Fragment key={estado}>
              <Opcion
                  tipo="radio"
                  name="estado-establecimiento"
                  value={estado}
                  checked={valor.estadoEstablecimiento === estado}
                  onChange={() => elegirEdificio(estado)}
                  disabled={disabled || bloqueoEdificioVigente(estado) !== null}
                  aria-labelledby={`etiqueta-edificio-${estado}`}
                  aria-describedby={bloqueoEdificioVigente(estado) ? `bloqueo-edificio-${estado}` : undefined}
                  label={<span id={`etiqueta-edificio-${estado}`}>{etiquetaEstablecimiento(estado, diccionario)}</span>}
                  ayuda={ayudaEdificio(estado)}
                  compacta
                />
              <AvisosConsistencia
                reglas={advertencias.filter((regla) => regla.campo === 'edificio' && respuestas?.edificio === estado)}
                campos={['edificio']}
                onAplicar={aplicarSugerencia}
              />
            </Fragment>
          ))}
          <AvisosConsistencia reglas={avisosEdificioSueltos} campos={['edificio']} onAplicar={aplicarSugerencia} />
        </div>
      </fieldset>

      <ConfirmSheet
        open={hojaHabitual}
        titulo={t.clases.hojaHabitualTitulo}
        confirmarLabel="Confirmar"
        confirmarDeshabilitado={decididas < afectacionesActivas.length || seguiraSinHabitual}
        onCancelar={() => setHojaHabitual(false)}
        onConfirmar={() => {
          setHojaHabitual(false)
          aplicarEdificio('habitual')
          onConfirmarHabitual?.(decisiones)
        }}
      >
        <p>{t.clases.hojaHabitualAntes}</p>
        {afectacionesActivas.map((afectacion) => (
          <fieldset key={afectacion.id} className="afectacion-campos__grupo" aria-label={afectacion.motivo}>
            <p className="afectacion-campos__legend">{afectacion.motivo}</p>
            <div className="afectacion-campos__opciones">
              {(['solucionada', 'sigue'] as const).map((decision) => (
                <Opcion
                  key={decision}
                  tipo="radio"
                  name={`habitual-${afectacion.id}`}
                  value={decision}
                  checked={decisiones[afectacion.id] === decision}
                  onChange={() => setDecisiones((actual) => ({ ...actual, [afectacion.id]: decision }))}
                  label={decision === 'solucionada' ? t.clases.solucionada : t.clases.sigueActiva}
                  compacta
                />
              ))}
            </div>
            {decisiones[afectacion.id] === 'sigue' && bloqueosHabitualPorAfectacion[afectacion.id]
              ? <p className="afectacion-campos__espera">{bloqueosHabitualPorAfectacion[afectacion.id]}</p>
              : null}
          </fieldset>
        ))}
        <AvisosConsistencia reglas={avisosHabitual} campos={['edificio']} />
      </ConfirmSheet>

      <ConfirmSheet
        open={pendiente !== null}
        titulo={esInstituto ? t.clases.alcanceInstitutoTitulo : t.clases.alcanceEscuelaTitulo}
        confirmarLabel={esInstituto ? t.clases.alcanceInstitutoConfirmar : t.clases.alcanceEscuelaConfirmar}
        onCancelar={() => setPendiente(null)}
        onConfirmar={() => {
          if (pendiente) {
            aplicarEdificio(pendiente)
            onInterrumpirTodaLaEscuela(valorConEdificio(pendiente))
          }
          setPendiente(null)
        }}
      >
        <p>
          {esInstituto
            ? t.clases.alcanceInstitutoCuerpo
            : t.clases.alcanceEscuelaCuerpo}
        </p>
      </ConfirmSheet>
    </>
  )
}
