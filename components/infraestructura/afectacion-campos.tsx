'use client'

import { useState, type JSX } from 'react'
import type { TurnoContexto, SeccionContexto } from '@/lib/infraestructura/contexto'
import { CATEGORIAS, CATEGORIA_META, type CategoriaAfectacion } from '@/lib/infraestructura/categorias'
import type { Severidad } from '@/lib/infraestructura/validacion'
import type { MotivoRow } from '@/lib/infraestructura/motivos'
import { detectarMotivoDuplicado } from '@/lib/infraestructura/duplicado-motivo'
import { CampoGravedad } from '@/components/infraestructura/campo-gravedad'
import type { JustificacionCritica } from '@/lib/infraestructura/justificacion-critica'
import { SeccionesSelector } from '@/components/infraestructura/secciones-selector'
import { SelectorEstablecimiento } from '@/components/infraestructura/selector-establecimiento'
import { Label } from '@/components/ui/label'
import { Opcion } from '@/components/ui/opcion'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { SelectorAlumnos } from '@/components/infraestructura/selector-alumnos'
import { AvisosRedSeguridad } from '@/components/infraestructura/aviso-red-seguridad'
import { evaluarRedesSeguridad } from '@/lib/infraestructura/red-seguridad'

export const TEXTO_CONFIRMAR_CATEGORIA: Record<CategoriaAfectacion, string> = {
  establecimiento:
    'Va a marcar las secciones que no pueden funcionar por un problema de la escuela. Si son alumnos puntuales que no pueden llegar, elija "Inaccesibilidad de alumnos".',
  alumnos:
    'Va a marcar sólo a los alumnos que no pueden llegar a la escuela. Si el problema es del edificio o afecta a la escuela, elija "Afecta al establecimiento".',
}

export interface AfectacionBorrador {
  clientId: string
  categoria: CategoriaAfectacion | ''
  motivo: string
  severidad: Severidad | ''
  justificacionCritica: JustificacionCritica | ''
  justificacionCriticaDetalle: string
  alcanceEstablecimiento: '' | 'toda' | 'algunas'
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
    justificacionCritica: '',
    justificacionCriticaDetalle: '',
    alcanceEstablecimiento: '',
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
  const [categoriaPendiente, setCategoriaPendiente] = useState<CategoriaAfectacion | null>(null)

  // Al cambiar la categoría se limpian los datos dependientes: el motivo y
  // su gravedad porque el catálogo depende de la categoría, y el alcance
  // porque cada categoría usa un selector distinto.
  function cambiarCategoria(categoria: CategoriaAfectacion) {
    onChange({
      ...borrador,
      categoria,
      motivo: '',
      severidad: '',
      justificacionCritica: '',
      justificacionCriticaDetalle: '',
      alcanceEstablecimiento: '',
      secciones: [],
      alumnos: [],
    })
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
        <legend className="afectacion-campos__legend">¿Qué tipo de situación es?</legend>
        <div className="afectacion-campos__opciones">
          {CATEGORIAS.map((c) => (
            <Opcion
                key={c}
                tipo="radio"
                name={`${idPrefijo}-categoria`}
                value={c}
                checked={borrador.categoria === c}
                onChange={() => {
                  if (c !== borrador.categoria) setCategoriaPendiente(c)
                }}
                disabled={disabled}
                label={CATEGORIA_META[c].label}
                ayuda={CATEGORIA_META[c].descripcion}
              />
          ))}
        </div>
      </fieldset>

      <ConfirmSheet
        open={categoriaPendiente !== null}
        titulo={categoriaPendiente ? CATEGORIA_META[categoriaPendiente].label : ''}
        confirmarLabel="Continuar"
        cancelarLabel="Elegir otra"
        onCancelar={() => setCategoriaPendiente(null)}
        onConfirmar={() => {
          if (categoriaPendiente) cambiarCategoria(categoriaPendiente)
          setCategoriaPendiente(null)
        }}
      >
        <p>{categoriaPendiente ? TEXTO_CONFIRMAR_CATEGORIA[categoriaPendiente] : null}</p>
      </ConfirmSheet>

      <fieldset className="afectacion-campos__grupo" disabled={disabled || !borrador.categoria}>
        <legend className="afectacion-campos__legend">¿Cuál es el motivo?</legend>
        {borrador.categoria === '' ? (
          <p className="afectacion-campos__espera">Elija primero el tipo de situación.</p>
        ) : (
          <div className="afectacion-campos__opciones">
            {motivosDeLaCategoria.map((m) => (
              <Opcion
                  key={m.id}
                  tipo="radio"
                  name={`${idPrefijo}-motivo`}
                  value={m.nombre}
                  checked={borrador.motivo === m.nombre}
                  onChange={() => onChange({
                    ...borrador,
                    motivo: m.nombre,
                    severidad: '',
                    justificacionCritica: '',
                    justificacionCriticaDetalle: '',
                  })}
                  disabled={disabled}
                  label={m.nombre}
                  compacta
                />
            ))}
          </div>
        )}
      </fieldset>

      <CampoGravedad
        idPrefijo={idPrefijo}
        categoria={borrador.categoria}
        sugerida={motivosDeLaCategoria.find((m) => m.nombre === borrador.motivo)?.severidadSugerida ?? null}
        valor={borrador}
        onCambiar={(gravedad) => onChange({ ...borrador, ...gravedad })}
        disabled={disabled}
      />

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
  usaSelectorEstablecimiento?: boolean
}

export function CamposAQuienAfecta({
  borrador,
  idPrefijo,
  turnos,
  usaSelectorEstablecimiento = false,
  onChange,
  disabled = false,
}: CamposAQuienAfectaProps): JSX.Element {
  const totalAlumnos = totalAlumnosDe(borrador, turnos)
  const seccionesDisponibles = aplanarSecciones(turnos)
  const matriculaDisponible = seccionesDisponibles.reduce((suma, seccion) => suma + seccion.matricula, 0)

  return (
    <>
      {borrador.categoria === 'alumnos' ? (
        <div className="afectacion-campos__grupo">
          <Label>Alumnos afectados</Label>
          <SelectorAlumnos
            turnos={turnos}
            alumnosSeleccionados={borrador.alumnos}
            onCambiar={(secciones, alumnos) => onChange({ ...borrador, secciones, alumnos })}
            disabled={disabled}
          />
          <AvisosRedSeguridad
            avisos={evaluarRedesSeguridad({
              categoria: 'alumnos',
              alumnosMarcados: borrador.alumnos.length,
              matricula: matriculaDisponible,
              seccionesMarcadas: borrador.secciones.length,
              seccionesTotales: seccionesDisponibles.length,
              alcanceEstablecimiento: '',
            })}
            onAccion={(tipo) => {
              if (tipo === 'cambiar-a-establecimiento') {
                onChange({
                  ...borrador,
                  categoria: 'establecimiento',
                  motivo: '',
                  severidad: '',
                  justificacionCritica: '',
                  justificacionCriticaDetalle: '',
                  alumnos: [],
                  secciones: [],
                  alcanceEstablecimiento: '',
                })
              }
            }}
          />
        </div>
      ) : usaSelectorEstablecimiento && borrador.categoria === 'establecimiento' ? (
        <div className="afectacion-campos__grupo">
          <Label>¿A quién afecta?</Label>
          <SelectorEstablecimiento
            turnos={turnos}
            valor={{ alcance: borrador.alcanceEstablecimiento, secciones: borrador.secciones }}
            onCambiar={(v) => onChange({ ...borrador, alcanceEstablecimiento: v.alcance, secciones: v.secciones, alumnos: [] })}
            disabled={disabled}
          />
          <AvisosRedSeguridad
            avisos={evaluarRedesSeguridad({
              categoria: 'establecimiento',
              alumnosMarcados: 0,
              matricula: matriculaDisponible,
              seccionesMarcadas: borrador.secciones.length,
              seccionesTotales: seccionesDisponibles.length,
              alcanceEstablecimiento: borrador.alcanceEstablecimiento,
            })}
            onAccion={(tipo) => {
              if (tipo === 'marcar-toda-la-escuela') {
                onChange({
                  ...borrador,
                  alcanceEstablecimiento: 'toda',
                  secciones: seccionesDisponibles.map((s) => s.geSectionId),
                  alumnos: [],
                })
              }
            }}
          />
          <p className="afectacion-borrador__resumen" aria-live="polite">
            Seleccionadas: {borrador.secciones.length} de {seccionesDisponibles.length} secciones · {totalAlumnos} de{' '}
            {matriculaDisponible} alumnos
          </p>
        </div>
      ) : (
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
      )}

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
