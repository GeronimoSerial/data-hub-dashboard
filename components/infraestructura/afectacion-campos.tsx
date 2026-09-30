'use client'

import type { JSX } from 'react'
import type { TurnoContexto, SeccionContexto } from '@/lib/infraestructura/contexto'
import { CATEGORIAS, CATEGORIA_META, type CategoriaAfectacion } from '@/lib/infraestructura/categorias'
import { SEVERIDADES, type Severidad } from '@/lib/infraestructura/validacion'
import type { MotivoRow } from '@/lib/infraestructura/motivos'
import { detectarMotivoDuplicado } from '@/lib/infraestructura/duplicado-motivo'
import { EstadoActualSeveridad } from '@/components/infraestructura/estado-actual-severidad'
import { SEVERIDAD_CRITERIOS } from '@/lib/infraestructura/severidad'
import { SeccionesSelector } from '@/components/infraestructura/secciones-selector'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export interface AfectacionBorrador {
  clientId: string
  categoria: CategoriaAfectacion | ''
  motivo: string
  severidad: Severidad | ''
  secciones: number[]
  alumnos: number[]
  descripcion: string
}

export function aplanarSecciones(turnos: TurnoContexto[]): SeccionContexto[] {
  return turnos.flatMap((turno) => turno.niveles.flatMap((nivel) => nivel.secciones))
}

/**
 * Alcance de una afectación calculado localmente (sin red): si hay alumnos
 * explícitos se cuentan esos; si no, la suma de la matrícula de todas las
 * secciones elegidas del corte vigente.
 */
export function totalAlumnosDe(borrador: AfectacionBorrador, turnos: TurnoContexto[]): number {
  if (borrador.alumnos.length > 0) return borrador.alumnos.length
  return aplanarSecciones(turnos)
    .filter((seccion) => borrador.secciones.includes(seccion.geSectionId))
    .reduce((suma, seccion) => suma + seccion.matricula, 0)
}

/**
 * Una fila está lista para enviar sólo cuando sus cuatro datos obligatorios
 * están completos. Una fila a medio llenar no se manda ni habilita el botón.
 */
export function esAfectacionLista(a: AfectacionBorrador): a is AfectacionBorrador & {
  categoria: CategoriaAfectacion
  severidad: Severidad
} {
  return a.categoria !== '' && a.motivo !== '' && a.severidad !== '' && a.secciones.length > 0
}

export function esAfectacionParcial(a: AfectacionBorrador): boolean {
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

export function crearAfectacionVacia(clientId: string): AfectacionBorrador {
  return {
    clientId,
    categoria: '',
    motivo: '',
    severidad: '',
    secciones: [],
    alumnos: [],
    descripcion: '',
  }
}

interface CamposComunes {
  borrador: AfectacionBorrador
  /** Prefijo de `id`/`name` para que dos instancias no compartan grupo de radio. */
  idPrefijo: string
  onChange: (siguiente: AfectacionBorrador) => void
  disabled?: boolean
}

export interface CamposQuePasoProps extends CamposComunes {
  motivos: MotivoRow[]
  otrasAfectaciones: AfectacionBorrador[]
  /**
   * La afectación se está agregando ahora. Sólo entonces tiene sentido
   * avisar de un duplicado: sobre algo que ya figura en el parte, el aviso
   * es ruido — el director no lo está agregando, lo está mirando.
   */
  esNueva?: boolean
}

/*
  Categoría, motivo y severidad van como grupos de radio nativos y NO como
  <select>. El catálogo entero son 5 motivos para "establecimiento", 3 para
  "alumnos" y 4 severidades fijas: con esos números un desplegable cuesta tres
  gestos (abrir el picker del sistema, elegir, cerrar) y tapa la pantalla con
  un modal, mientras que las opciones a la vista cuestan un toque y se leen
  sin interacción previa. Sigue siendo nativo, así que conserva el soporte de
  teclado y lectores de pantalla que motivó el <select> original.

  Una sola opción por grupo, nunca checkbox: en el dominio una afectación
  tiene UN motivo. Un control que dejara marcar varios estaría prometiendo
  algo que el modelo no puede representar.
*/
export function CamposQuePaso({
  borrador,
  idPrefijo,
  motivos,
  otrasAfectaciones,
  esNueva = false,
  onChange,
  disabled = false,
}: CamposQuePasoProps): JSX.Element {
  // Al cambiar la categoría se limpian motivo y alumnos: el motivo porque el
  // catálogo depende de la categoría, los alumnos porque una categoría sin
  // permiteAlumnos nunca puede llevarlos. Las secciones elegidas se
  // conservan: siguen siendo válidas para cualquier categoría.
  function cambiarCategoria(categoria: CategoriaAfectacion) {
    onChange({ ...borrador, categoria, motivo: '', alumnos: [] })
  }

  const motivosDeLaCategoria = borrador.categoria
    ? motivos.filter((m) => m.categoria === borrador.categoria)
    : []

  /*
    Recomendación, nunca decisión (spec §18.14).

    Dos recortes respecto de la versión anterior, que mostraba el aviso casi
    siempre:

    - Sólo para una afectación que se está agregando AHORA. Sobre las que ya
      figuran en el parte el aviso no significa nada: el director no las está
      agregando.
    - Sólo ante coincidencia EXACTA de motivo. `detectarMotivoDuplicado`
      también marca coincidencia cuando apenas comparten la categoría, que es
      lo correcto para §14 —ahí se compara un episodio nuevo contra el parte
      vigente—, pero dentro de un mismo parte es normal y esperable: una
      escuela puede estar inundada Y sin energía, las dos "establecimiento".
      Avisar de eso convertía la recomendación en ruido de fondo.
  */
  const candidatos = otrasAfectaciones
    .filter((a) => a.motivo && a.categoria)
    .map((a) => ({ motivo: a.motivo, categoria: a.categoria as CategoriaAfectacion }))
  const duplicado =
    esNueva && borrador.motivo
      ? detectarMotivoDuplicado(candidatos, {
          motivo: borrador.motivo,
          categoria: borrador.categoria || 'establecimiento',
        })
      : null

  return (
    <>
      <fieldset className="afectacion-campos__grupo" disabled={disabled}>
        <legend className="afectacion-campos__legend">¿Qué tipo de problema es?</legend>
        <div className="afectacion-campos__opciones">
          {CATEGORIAS.map((c) => (
            <label key={c} className="opcion-radio">
              <input
                type="radio"
                name={`${idPrefijo}-categoria`}
                value={c}
                checked={borrador.categoria === c}
                onChange={() => cambiarCategoria(c)}
                disabled={disabled}
              />
              <span className="opcion-radio__texto">
                <span className="opcion-radio__titulo">{CATEGORIA_META[c].label}</span>
                {/* La glosa ya existía en CATEGORIA_META y no se mostraba en
                    ninguna pantalla. Es la que traduce el rótulo
                    administrativo a algo que un director lee sin interpretar. */}
                <span className="opcion-radio__ayuda">{CATEGORIA_META[c].descripcion}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="afectacion-campos__grupo" disabled={disabled || !borrador.categoria}>
        <legend className="afectacion-campos__legend">¿Cuál es el motivo?</legend>
        {borrador.categoria === '' ? (
          <p className="afectacion-campos__espera">Elija primero el tipo de problema.</p>
        ) : (
          <div className="afectacion-campos__opciones">
            {motivosDeLaCategoria.map((m) => (
              <label key={m.id} className="opcion-radio opcion-radio--compacta">
                <input
                  type="radio"
                  name={`${idPrefijo}-motivo`}
                  value={m.nombre}
                  checked={borrador.motivo === m.nombre}
                  onChange={() => onChange({ ...borrador, motivo: m.nombre })}
                  disabled={disabled}
                />
                <span className="opcion-radio__texto">
                  <span className="opcion-radio__titulo">{m.nombre}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {/*
        Cada nivel lleva escrito qué lo distingue del siguiente. La
        especificación define que la severidad es por afectación pero no sus
        criterios, así que sin esto "Alta" y "Crítica" quedaban a
        interpretación de cada director y el dato dejaba de ser comparable
        entre escuelas.

        Va como texto a la vista y NO como tooltip: lo llena un director desde
        el celular, donde no existe el hover, y el contrato de UX de este
        recorrido prohíbe poner algo necesario detrás de él. El criterio se lee
        justo cuando hay que decidir, sin un gesto extra.

        El criterio viaja por aria-describedby y no dentro de la etiqueta: así
        el nombre accesible de la opción sigue siendo "Alta" y no la frase
        entera, que es lo que un lector de pantalla necesita para anunciar la
        selección.
      */}
      <fieldset className="afectacion-campos__grupo" disabled={disabled}>
        <legend className="afectacion-campos__legend">¿Qué tan grave es?</legend>
        <div className="afectacion-campos__opciones">
          {SEVERIDADES.map((s) => (
            <label key={s} className="opcion-radio">
              <input
                type="radio"
                name={`${idPrefijo}-severidad`}
                value={s}
                checked={borrador.severidad === s}
                onChange={() => onChange({ ...borrador, severidad: s })}
                disabled={disabled}
                aria-labelledby={`${idPrefijo}-severidad-${s}-nombre`}
                aria-describedby={`${idPrefijo}-severidad-${s}-criterio`}
              />
              <span className="opcion-radio__texto">
                {/* Con la marca al lado, elegir severidad deja de ser leer
                    cuatro palabras sueltas y pasa a ser ubicarse en una
                    escala — la misma que después ve en el parte. */}
                <span className="opcion-radio__titulo" id={`${idPrefijo}-severidad-${s}-nombre`}>
                  <EstadoActualSeveridad severidad={s} prefijo={false} marca={false} />
                </span>
                <span className="opcion-radio__ayuda" id={`${idPrefijo}-severidad-${s}-criterio`}>
                  {SEVERIDAD_CRITERIOS[s]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {duplicado?.coincidenciaExacta && (
        <p className="aviso-badge" role="status">
          <span className="aviso-badge__sello">Ya informado</span>
          <span className="aviso-badge__texto">
            Ya hay una situación por este mismo motivo. Puede continuar igual.
          </span>
        </p>
      )}
    </>
  )
}

export interface CamposAQuienAfectaProps extends CamposComunes {
  turnos: TurnoContexto[]
}

export function CamposAQuienAfecta({
  borrador,
  idPrefijo,
  turnos,
  onChange,
  disabled = false,
}: CamposAQuienAfectaProps): JSX.Element {
  const totalAlumnos = totalAlumnosDe(borrador, turnos)
  const seccionesDisponibles = aplanarSecciones(turnos)
  const matriculaDisponible = seccionesDisponibles.reduce((suma, seccion) => suma + seccion.matricula, 0)

  return (
    <>
      <div className="afectacion-campos__grupo">
        <Label>Secciones afectadas</Label>
        <SeccionesSelector
          turnos={turnos}
          seleccionadas={borrador.secciones}
          alumnosSeleccionados={borrador.alumnos}
          onCambiar={(secciones, alumnos) => onChange({ ...borrador, secciones, alumnos })}
          disabled={disabled}
          permiteAlumnos={borrador.categoria ? CATEGORIA_META[borrador.categoria].permiteAlumnos : true}
        />
        <p className="afectacion-borrador__resumen" aria-live="polite">
          Seleccionadas: {borrador.secciones.length} de {seccionesDisponibles.length} secciones · {totalAlumnos} de{' '}
          {matriculaDisponible} alumnos
        </p>
      </div>

      <div className="afectacion-campos__grupo">
        <Label htmlFor={`${idPrefijo}-descripcion`}>Descripción (opcional)</Label>
        <Textarea
          id={`${idPrefijo}-descripcion`}
          maxLength={500}
          value={borrador.descripcion}
          onChange={(evento) => onChange({ ...borrador, descripcion: evento.target.value })}
          disabled={disabled}
        />
      </div>
    </>
  )
}
