'use client'

import { useEffect, useRef, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { ChevronDown, Clock, Search, X } from 'lucide-react'
import { contarOpciones, opcionesDisponibles } from '@/lib/infraestructura/mapa/filtrar'
import { ETIQUETA_APOYO, ETIQUETA_CLASES, ETIQUETA_GRAVEDAD } from '@/lib/infraestructura/mapa/etiquetas'
import { FILTROS_MAPA_VACIOS, type EscuelaMapaEnriquecida, type EstadoClases, type FiltrosMapa, type GravedadMapa } from '@/lib/infraestructura/mapa/tipos'

type ClaveFiltro = 'departamentos' | 'niveles' | 'gravedades' | 'clases' | 'apoyo'
type Opcion = { valor: string; etiqueta: string }

const OPCIONES_GRAVEDAD: Opcion[] = [4, 3, 2, 1, 0].map((valor) => ({
  valor: String(valor),
  etiqueta: ETIQUETA_GRAVEDAD[valor as GravedadMapa],
}))

const OPCIONES_CLASES: Opcion[] = (['normal', 'parcial', 'sin', 'evacuado', 'centro'] as EstadoClases[]).map((valor) => ({
  valor,
  etiqueta: ETIQUETA_CLASES[valor],
}))

const OPCIONES_APOYO: Opcion[] = (['brinda', 'no', 'virtual', 'cuadernillo'] as const).map((valor) => ({
  valor,
  etiqueta: ETIQUETA_APOYO[valor],
}))

const ETIQUETAS_FILTRO: Record<ClaveFiltro, string> = {
  departamentos: 'Departamento',
  niveles: 'Nivel',
  gravedades: 'Gravedad',
  clases: 'Clases',
  apoyo: 'Apoyo pedagógico',
}

function valoresSeleccionados(filtros: FiltrosMapa, clave: ClaveFiltro): string[] {
  return filtros[clave].map(String)
}

function esGravedadMapa(valor: number): valor is GravedadMapa {
  return valor === 0 || valor === 1 || valor === 2 || valor === 3 || valor === 4
}

function esClase(valor: string): valor is EstadoClases {
  return OPCIONES_CLASES.some((opcion) => opcion.valor === valor)
}

function esApoyo(valor: string): valor is FiltrosMapa['apoyo'][number] {
  return OPCIONES_APOYO.some((opcion) => opcion.valor === valor)
}

function opcionesPorFiltro(escuelas: EscuelaMapaEnriquecida[], clave: ClaveFiltro): Opcion[] {
  if (clave === 'departamentos' || clave === 'niveles') {
    const disponibles = opcionesDisponibles(escuelas)[clave]
    return disponibles.map((valor) => ({ valor, etiqueta: valor }))
  }
  if (clave === 'gravedades') return OPCIONES_GRAVEDAD
  if (clave === 'clases') return OPCIONES_CLASES
  return OPCIONES_APOYO
}

function alternarValor(filtros: FiltrosMapa, clave: ClaveFiltro, valor: string): FiltrosMapa {
  const actual = valoresSeleccionados(filtros, clave)
  const siguiente = actual.includes(valor) ? actual.filter((seleccionado) => seleccionado !== valor) : [...actual, valor]

  switch (clave) {
    case 'departamentos': return { ...filtros, departamentos: siguiente }
    case 'niveles': return { ...filtros, niveles: siguiente }
    case 'gravedades': return { ...filtros, gravedades: siguiente.map(Number).filter(esGravedadMapa) }
    case 'clases': return { ...filtros, clases: siguiente.filter(esClase) }
    case 'apoyo': return { ...filtros, apoyo: siguiente.filter(esApoyo) }
  }
}

function FiltroDesplegable({
  clave,
  escuelas,
  filtros,
  onChange,
  abierto,
  onAbiertoChange,
}: {
  clave: ClaveFiltro
  escuelas: EscuelaMapaEnriquecida[]
  filtros: FiltrosMapa
  onChange: (filtros: FiltrosMapa) => void
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
}) {
  const etiqueta = ETIQUETAS_FILTRO[clave]
  const seleccionados = valoresSeleccionados(filtros, clave)
  const opciones = opcionesPorFiltro(escuelas, clave)
  const conteos = contarOpciones(escuelas, clave)
  const primerCheckbox = useRef<HTMLInputElement>(null)
  const textoChip = seleccionados.length === 0
    ? etiqueta
    : `${etiqueta}: ${seleccionados.length > 1
      ? `${seleccionados.length} elegidos`
      : opciones.find((opcion) => opcion.valor === seleccionados[0])?.etiqueta ?? seleccionados[0]}`

  useEffect(() => {
    if (abierto) primerCheckbox.current?.focus()
  }, [abierto])

  return (
    <div className={`filtros-chip-grupo${seleccionados.length ? ' filtros-chip-grupo--activo' : ''}`}>
      <Popover.Root open={abierto} onOpenChange={onAbiertoChange} modal={false}>
        <Popover.Trigger
          render={<button
            type="button"
            className={`filtros-chip${seleccionados.length ? ' filtros-chip--activo' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={abierto}
          />}
        >
          {textoChip}
          <ChevronDown aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className="filtros-popover-posicionador" side="bottom" align="start" sideOffset={4}>
            <Popover.Popup className="filtros-popover" aria-label={etiqueta}>
              {opciones.map((opcion, indice) => (
                <label className="filtros-opcion" key={opcion.valor}>
                  <input
                    ref={indice === 0 ? primerCheckbox : undefined}
                    type="checkbox"
                    checked={seleccionados.includes(opcion.valor)}
                    onChange={() => onChange(alternarValor(filtros, clave, opcion.valor))}
                  />
                  <span>{opcion.etiqueta}</span>
                  <span className="filtros-opcion__conteo">{conteos.get(opcion.valor) ?? 0}</span>
                </label>
              ))}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {seleccionados.length > 0 ? (
        <button
          type="button"
          className="filtros-chip__quitar"
          aria-label={`Quitar filtro ${etiqueta}`}
          onClick={() => onChange({ ...filtros, [clave]: [] })}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

export function FiltrosChips({
  escuelas,
  filtros,
  onChange,
}: {
  escuelas: EscuelaMapaEnriquecida[]
  filtros: FiltrosMapa
  onChange: (filtros: FiltrosMapa) => void
}) {
  const [popoverAbierto, setPopoverAbierto] = useState<ClaveFiltro | null>(null)
  const hayFiltrosActivos = Boolean(filtros.q.trim())
    || filtros.departamentos.length > 0
    || filtros.niveles.length > 0
    || filtros.gravedades.length > 0
    || filtros.clases.length > 0
    || filtros.apoyo.length > 0
    || filtros.sinActualizar

  return (
    <div className="filtros-barra" aria-label="Filtros de escuelas">
      <label className="filtros-busqueda">
        <Search aria-hidden="true" />
        <input
          type="search"
          aria-label="Buscar escuela o CUE"
          placeholder="Buscar escuela o CUE"
          value={filtros.q}
          onChange={(evento) => onChange({ ...filtros, q: evento.currentTarget.value })}
        />
      </label>
      {(['departamentos', 'niveles', 'gravedades', 'clases', 'apoyo'] as ClaveFiltro[]).map((clave) => (
        <FiltroDesplegable
          key={clave}
          clave={clave}
          escuelas={escuelas}
          filtros={filtros}
          onChange={onChange}
          abierto={popoverAbierto === clave}
          onAbiertoChange={(abierto) => setPopoverAbierto(abierto ? clave : null)}
        />
      ))}
      <button
        type="button"
        className={`filtros-chip filtros-chip--interruptor${filtros.sinActualizar ? ' filtros-chip--activo' : ''}`}
        aria-pressed={filtros.sinActualizar}
        onClick={() => onChange({ ...filtros, sinActualizar: !filtros.sinActualizar })}
      >
        <Clock aria-hidden="true" />
        Sin actualizar
        {filtros.sinActualizar ? <X aria-hidden="true" /> : null}
      </button>
      {hayFiltrosActivos ? (
        <button type="button" className="filtros-limpiar" onClick={() => onChange(FILTROS_MAPA_VACIOS)}>
          Limpiar filtros
        </button>
      ) : null}
    </div>
  )
}
