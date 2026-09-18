'use client'

import type { JSX } from 'react'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import { CATEGORIAS, CATEGORIA_META, type CategoriaProblematica } from '@/lib/infraestructura/categorias'
import { SEVERIDADES, type Severidad } from '@/lib/infraestructura/validacion'
import type { MotivoRow } from '@/lib/infraestructura/motivos'
import { detectarMotivoDuplicado } from '@/lib/infraestructura/duplicado-motivo'
import { SeccionesSelector } from '@/components/infraestructura/secciones-selector'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export interface AfectacionBorrador {
  clientId: string
  categoria: CategoriaProblematica | ''
  motivo: string
  severidad: Severidad | ''
  secciones: number[]
  alumnos: number[]
  descripcion: string
}

export interface AfectacionBorradorCardProps {
  borrador: AfectacionBorrador
  index: number
  motivos: MotivoRow[]
  turnos: TurnoContexto[]
  otrasAfectaciones: AfectacionBorrador[]
  onChange: (siguiente: AfectacionBorrador) => void
  onRemove: () => void
  disabled?: boolean
}

function aplanarSecciones(turnos: TurnoContexto[]) {
  return turnos.flatMap((turno) => turno.niveles.flatMap((nivel) => nivel.secciones))
}

export function AfectacionBorradorCard({
  borrador,
  index,
  motivos,
  turnos,
  otrasAfectaciones,
  onChange,
  onRemove,
  disabled = false,
}: AfectacionBorradorCardProps): JSX.Element {
  // Al cambiar la categoría se limpian motivo y alumnos: el motivo porque el
  // catálogo depende de la categoría, los alumnos porque una categoría sin
  // permiteAlumnos nunca puede llevarlos. Las secciones elegidas se
  // conservan: siguen siendo válidas para cualquier categoría.
  function cambiarCategoria(categoria: CategoriaProblematica) {
    onChange({ ...borrador, categoria, motivo: '', alumnos: [] })
  }

  const motivosDeLaCategoria = borrador.categoria
    ? motivos.filter((m) => m.categoria === borrador.categoria)
    : []

  // Síntesis de alcance, calculada localmente (sin red): si hay alumnos
  // explícitos se cuentan esos; si no, la suma de la matrícula de todas las
  // secciones elegidas del corte vigente.
  const totalAlumnos =
    borrador.alumnos.length > 0
      ? borrador.alumnos.length
      : aplanarSecciones(turnos)
          .filter((seccion) => borrador.secciones.includes(seccion.geSectionId))
          .reduce((suma, seccion) => suma + seccion.matricula, 0)

  // Recomendación, nunca decisión (spec §18.14): si el motivo ya está en
  // otra afectación del borrador se avisa, pero la forma sigue operativa.
  const candidatos = otrasAfectaciones
    .filter((a) => a.motivo && a.categoria)
    .map((a) => ({ motivo: a.motivo, categoria: a.categoria as CategoriaProblematica }))
  const duplicado = borrador.motivo
    ? detectarMotivoDuplicado(candidatos, {
        motivo: borrador.motivo,
        categoria: borrador.categoria || 'establecimiento',
      })
    : null

  return (
    <div className="afectacion-borrador">
      <div className="afectacion-borrador__encabezado">
        <h3>Afectación {index + 1}</h3>
        <button
          type="button"
          className="afectacion-borrador__quitar"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Quitar afectación ${index + 1}`}
        >
          Quitar
        </button>
      </div>

      <div
        className="afectacion-borrador__campo"
        role="radiogroup"
        aria-labelledby={`afectacion-${index}-categoria-label`}
      >
        <Label id={`afectacion-${index}-categoria-label`}>Categoría</Label>
        {CATEGORIAS.map((c) => (
          <label key={c} className="formulario-problematica__radio">
            <input
              type="radio"
              name={`afectacion-${index}-categoria`}
              value={c}
              checked={borrador.categoria === c}
              onChange={() => cambiarCategoria(c)}
              disabled={disabled}
            />
            {CATEGORIA_META[c].label}
          </label>
        ))}
      </div>

      {/*
        Motivo/Severidad usan <select> nativo a propósito, mismo criterio que
        formulario-problematica.tsx: lo llena un director desde el celular,
        sin cuenta y a veces con mala conexión. El nativo abre el picker del
        sistema operativo y opera 100% por teclado y con lectores de pantalla.
      */}
      <div className="afectacion-borrador__campo">
        <Label htmlFor={`afectacion-${index}-motivo`}>Motivo</Label>
        <select
          id={`afectacion-${index}-motivo`}
          className="ui-input"
          value={borrador.motivo}
          onChange={(evento) => onChange({ ...borrador, motivo: evento.target.value })}
          disabled={disabled || !borrador.categoria}
        >
          <option value="" disabled>
            Seleccione un motivo
          </option>
          {motivosDeLaCategoria.map((m) => (
            <option key={m.id} value={m.nombre}>
              {m.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="afectacion-borrador__campo">
        <Label htmlFor={`afectacion-${index}-severidad`}>Severidad</Label>
        <select
          id={`afectacion-${index}-severidad`}
          className="ui-input"
          value={borrador.severidad}
          onChange={(evento) => onChange({ ...borrador, severidad: evento.target.value as Severidad | '' })}
          disabled={disabled}
        >
          <option value="" disabled>
            Seleccione una severidad
          </option>
          {SEVERIDADES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="afectacion-borrador__campo">
        <Label>Secciones afectadas</Label>
        <SeccionesSelector
          turnos={turnos}
          seleccionadas={borrador.secciones}
          alumnosSeleccionados={borrador.alumnos}
          onCambiar={(secciones, alumnos) => onChange({ ...borrador, secciones, alumnos })}
          disabled={disabled}
          permiteAlumnos={borrador.categoria ? CATEGORIA_META[borrador.categoria].permiteAlumnos : true}
        />
      </div>

      <div className="afectacion-borrador__campo">
        <Label htmlFor={`afectacion-${index}-descripcion`}>Descripción (opcional)</Label>
        <Textarea
          id={`afectacion-${index}-descripcion`}
          maxLength={500}
          value={borrador.descripcion}
          onChange={(evento) => onChange({ ...borrador, descripcion: evento.target.value })}
          disabled={disabled}
        />
      </div>

      <p className="afectacion-borrador__resumen" aria-live="polite">
        {borrador.secciones.length} secciones · {totalAlumnos} alumnos
      </p>

      {duplicado?.hayCoincidencia && (
        <p className="afectacion-borrador__duplicado" role="status">
          Ya agregó una afectación con un motivo o categoría similar.
        </p>
      )}
    </div>
  )
}