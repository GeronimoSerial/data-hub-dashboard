'use client'

import { useEffect, useId, useRef, useState, type Ref } from 'react'
import { Popover } from '@base-ui/react/popover'
import { ChevronDown, Clock, Search, SlidersHorizontal, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { contarOpciones, filtrarEscuelas, opcionesDisponibles } from '@/lib/infraestructura/mapa/filtrar'
import { etiquetaDepartamento, ETIQUETA_APOYO, ETIQUETA_ESTADO_CLASES, ETIQUETA_GRAVEDAD } from '@/lib/infraestructura/mapa/etiquetas'
import { FILTROS_MAPA_VACIOS, type EscuelaMapaEnriquecida, type EstadoClases, type FiltrosMapa, type GravedadMapa } from '@/lib/infraestructura/mapa/tipos'

type ClaveFiltro = 'departamentos' | 'niveles' | 'gravedades' | 'clases' | 'apoyo'
type Opcion = { valor: string; etiqueta: string }

const OPCIONES_GRAVEDAD: Opcion[] = [4, 3, 2, 1, 0].map((valor) => ({
  valor: String(valor),
  etiqueta: ETIQUETA_GRAVEDAD[valor as GravedadMapa],
}))

const OPCIONES_CLASES: Opcion[] = (['normal', 'parcial', 'sin', 'evacuado', 'centro'] as EstadoClases[]).map((valor) => ({
  valor,
  etiqueta: ETIQUETA_ESTADO_CLASES[valor],
}))

const OPCIONES_APOYO: Opcion[] = (['brinda', 'no', 'sin_dato'] as const).map((valor) => ({
  valor,
  etiqueta: ETIQUETA_APOYO[valor],
}))

const ETIQUETAS_FILTRO: Record<ClaveFiltro, string> = {
  departamentos: 'Departamento',
  niveles: 'Nivel',
  gravedades: 'Gravedad',
  clases: 'Clases',
  apoyo: 'Asistencia pedagógica',
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
    return disponibles.map((valor) => ({ valor, etiqueta: clave === 'departamentos' ? etiquetaDepartamento(valor) : valor }))
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

function OpcionesFiltro({
  clave,
  escuelas,
  filtros,
  onChange,
  primerCheckbox,
}: {
  clave: ClaveFiltro
  escuelas: EscuelaMapaEnriquecida[]
  filtros: FiltrosMapa
  onChange: (filtros: FiltrosMapa) => void
  primerCheckbox?: Ref<HTMLElement>
}) {
  const seleccionados = valoresSeleccionados(filtros, clave)
  const opciones = opcionesPorFiltro(escuelas, clave)
  const conteos = contarOpciones(escuelas, clave)

  return opciones.length === 0 ? (
    <div className="filtros-opcion-vacio" role="status">
      {clave === 'niveles' ? 'No hay niveles cargados en el padrón.' : 'No hay opciones disponibles.'}
    </div>
  ) : opciones.map((opcion, indice) => (
    <Checkbox
      key={opcion.valor}
      className="filtros-opcion"
      checked={seleccionados.includes(opcion.valor)}
      ref={indice === 0 ? primerCheckbox : undefined}
      onCheckedChange={() => onChange(alternarValor(filtros, clave, opcion.valor))}
      label={(
        <>
          <span className="filtros-opcion__etiqueta">{opcion.etiqueta}</span>
          <span className="filtros-opcion__conteo">{conteos.get(opcion.valor) ?? 0}</span>
        </>
      )}
    />
  ))
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
  const primerCheckbox = useRef<HTMLElement>(null)
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
          <Popover.Positioner className="filtros-popover-posicionador" side="bottom" align="start" sideOffset={4} collisionAvoidance={{ side: 'none', align: 'shift' }}>
            <Popover.Popup className="filtros-popover" aria-label={etiqueta} data-apertura="abajo">
              <OpcionesFiltro clave={clave} escuelas={escuelas} filtros={filtros} onChange={onChange} primerCheckbox={primerCheckbox} />
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
  onSeleccionar,
}: {
  escuelas: EscuelaMapaEnriquecida[]
  filtros: FiltrosMapa
  onChange: (filtros: FiltrosMapa) => void
  onSeleccionar?: (cueAnexo: string) => void
}) {
  const [popoverAbierto, setPopoverAbierto] = useState<{ grupo: 'principal' | 'compacto'; clave: ClaveFiltro } | null>(null)
  const [sugerenciasCerradas, setSugerenciasCerradas] = useState(false)
  const [opcionActiva, setOpcionActiva] = useState(0)
  const [busquedaAbierta, setBusquedaAbierta] = useState(Boolean(filtros.q))
  const [filtrosCompactosAbiertos, setFiltrosCompactosAbiertos] = useState(false)
  const [masFiltrosAbiertos, setMasFiltrosAbiertos] = useState(false)
  const busquedaRef = useRef<HTMLInputElement>(null)
  const filtrosBarraRef = useRef<HTMLDivElement>(null)
  const idLista = useId()
  const idOpcionActiva = `${idLista}-opcion-${opcionActiva}`
  const queryRecortada = filtros.q.trim()
  const busquedaVisible = busquedaAbierta || Boolean(filtros.q)
  const sugerenciasAbiertas = queryRecortada.length >= 2 && !sugerenciasCerradas
  const sugerencias = sugerenciasAbiertas
    ? filtrarEscuelas(escuelas, filtros).slice(0, 8)
    : []
  const indiceActivo = sugerencias.length > 0 ? Math.min(opcionActiva, sugerencias.length - 1) : -1

  useEffect(() => {
    if (busquedaAbierta) busquedaRef.current?.focus()
  }, [busquedaAbierta])

  useEffect(() => {
    if (!filtrosCompactosAbiertos) return
    const cerrarAlHacerClicFuera = (evento: PointerEvent) => {
      if (!(evento.target instanceof Node) || !filtrosBarraRef.current?.contains(evento.target)) setFiltrosCompactosAbiertos(false)
    }
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setFiltrosCompactosAbiertos(false)
    }
    document.addEventListener('pointerdown', cerrarAlHacerClicFuera)
    document.addEventListener('keydown', cerrarConEscape)
    return () => {
      document.removeEventListener('pointerdown', cerrarAlHacerClicFuera)
      document.removeEventListener('keydown', cerrarConEscape)
    }
  }, [filtrosCompactosAbiertos])

  function seleccionar(cueAnexo: string) {
    onSeleccionar?.(cueAnexo)
    onChange({ ...filtros, q: '' })
    setSugerenciasCerradas(true)
    setBusquedaAbierta(false)
  }
  const hayFiltrosActivos = Boolean(filtros.q.trim())
    || filtros.departamentos.length > 0
    || filtros.niveles.length > 0
    || filtros.gravedades.length > 0
    || filtros.clases.length > 0
    || filtros.apoyo.length > 0
    || filtros.sinActualizar
    || filtros.solucionadasRecientes
  const cantidadFiltrosActivos = filtros.departamentos.length + filtros.niveles.length
    + filtros.gravedades.length + filtros.clases.length + filtros.apoyo.length
    + Number(filtros.sinActualizar) + Number(filtros.solucionadasRecientes)
  const cantidadMasFiltrosActivos = filtros.apoyo.length
    + Number(filtros.sinActualizar) + Number(filtros.solucionadasRecientes)
  function renderChipsPrincipales(grupo: 'principal' | 'compacto') {
    const claves: ClaveFiltro[] = grupo === 'principal'
      ? ['departamentos', 'niveles', 'gravedades', 'clases']
      : ['departamentos', 'niveles', 'gravedades', 'clases', 'apoyo']
    return claves.map((clave) => (
      <FiltroDesplegable
        key={clave}
        clave={clave}
        escuelas={escuelas}
        filtros={filtros}
        onChange={onChange}
        abierto={popoverAbierto?.grupo === grupo && popoverAbierto.clave === clave}
        onAbiertoChange={(abierto) => setPopoverAbierto(abierto ? { grupo, clave } : null)}
      />
    ))
  }

  return (
    <div className="filtros-barra" aria-label="Filtros de escuelas" data-abierto={filtrosCompactosAbiertos} ref={filtrosBarraRef}>
      <div className={`filtros-busqueda-contenedor${busquedaVisible ? ' filtros-busqueda-contenedor--abierto' : ''}`}>
        {busquedaVisible ? (
          <label className="filtros-busqueda">
            <Search aria-hidden="true" />
            <input
              ref={busquedaRef}
              type="search"
              role="combobox"
              aria-label="Buscar escuela o CUE"
              aria-expanded={sugerenciasAbiertas}
              aria-controls={idLista}
              aria-activedescendant={indiceActivo >= 0 ? idOpcionActiva : undefined}
              aria-autocomplete="list"
              placeholder="Buscar escuela o CUE"
              value={filtros.q}
              onChange={(evento) => {
                onChange({ ...filtros, q: evento.currentTarget.value })
                setOpcionActiva(0)
                setSugerenciasCerradas(false)
              }}
              onBlur={() => {
                if (!filtros.q.trim()) setBusquedaAbierta(false)
              }}
              onKeyDown={(evento) => {
                if (evento.key === 'Escape') {
                  evento.preventDefault()
                  if (sugerenciasAbiertas) setSugerenciasCerradas(true)
                  else setBusquedaAbierta(false)
                  return
                }
                if (!sugerenciasAbiertas) return
                if (evento.key === 'ArrowDown' && sugerencias.length > 0) {
                  evento.preventDefault()
                  setOpcionActiva((actual) => (actual + 1) % sugerencias.length)
                } else if (evento.key === 'ArrowUp' && sugerencias.length > 0) {
                  evento.preventDefault()
                  setOpcionActiva((actual) => (actual - 1 + sugerencias.length) % sugerencias.length)
                } else if (evento.key === 'Enter' && indiceActivo >= 0) {
                  evento.preventDefault()
                  seleccionar(sugerencias[indiceActivo].cueAnexo)
                }
              }}
            />
          </label>
        ) : (
          <button
            type="button"
            className="filtros-busqueda-boton"
            aria-label="Buscar escuela o CUE"
            aria-expanded={false}
            onClick={() => setBusquedaAbierta(true)}
          >
            <Search aria-hidden="true" />
          </button>
        )}
        {busquedaVisible && sugerenciasAbiertas && (
          <div className="filtros-sugerencias" id={idLista} role="listbox" aria-label="Escuelas coincidentes">
            {sugerencias.length === 0 ? (
              <div className="filtros-sugerencias__vacio" role="status">Ninguna escuela coincide</div>
            ) : sugerencias.map((escuela, indice) => (
              <div
                key={escuela.cueAnexo}
                id={`${idLista}-opcion-${indice}`}
                role="option"
                aria-selected={indice === indiceActivo}
                className="filtros-sugerencias__opcion"
                onMouseDown={(evento) => evento.preventDefault()}
                onMouseEnter={() => setOpcionActiva(indice)}
                onClick={() => seleccionar(escuela.cueAnexo)}
              >
                <span className="filtros-sugerencias__nombre">{escuela.nombre}</span>
                <span className="filtros-sugerencias__detalle">{escuela.cueAnexo} · {etiquetaDepartamento(escuela.departamento)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className="filtros-compactos-boton"
        aria-expanded={filtrosCompactosAbiertos}
        aria-label={`Filtros${cantidadFiltrosActivos ? `, ${cantidadFiltrosActivos} activos` : ''}`}
        onClick={() => setFiltrosCompactosAbiertos((abiertos) => !abiertos)}
      >
        <SlidersHorizontal aria-hidden="true" />
        Filtros
        {cantidadFiltrosActivos > 0 ? <span aria-hidden="true">{cantidadFiltrosActivos}</span> : null}
      </button>
      <div className="filtros-chips-principales">{renderChipsPrincipales('principal')}</div>
      <div className="filtros-mas">
        <Popover.Root open={masFiltrosAbiertos} onOpenChange={setMasFiltrosAbiertos} modal={false}>
          <Popover.Trigger
            render={<button
              type="button"
              className="filtros-mas-boton"
              aria-expanded={masFiltrosAbiertos}
              aria-label={`Más filtros${cantidadMasFiltrosActivos ? `, ${cantidadMasFiltrosActivos} activos` : ''}`}
            />}
          >
            Más filtros
            {cantidadMasFiltrosActivos > 0 ? <span aria-hidden="true">{cantidadMasFiltrosActivos}</span> : null}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner className="map-filtros-mas-posicionador" side="bottom" align="end" sideOffset={4}>
              <Popover.Popup className="map-filtros-mas-panel" aria-label="Más filtros">
                <section className="map-filtros-mas-grupo" aria-label="Asistencia pedagógica">
                  <h3 className="map-filtros-mas-titulo">Asistencia pedagógica</h3>
                  <OpcionesFiltro clave="apoyo" escuelas={escuelas} filtros={filtros} onChange={onChange} />
                </section>
                <Switch
                  checked={filtros.sinActualizar}
                  onCheckedChange={(sinActualizar) => onChange({ ...filtros, sinActualizar })}
                  label="Sin actualizar"
                />
                <Switch
                  checked={filtros.solucionadasRecientes}
                  onCheckedChange={(solucionadasRecientes) => onChange({ ...filtros, solucionadasRecientes })}
                  label="Solucionadas en los últimos 15 días"
                />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <div className="filtros-controles">
        {renderChipsPrincipales('compacto')}
        <span className="filtros-chip-final">
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
          <button
            type="button"
            className={`filtros-chip filtros-chip--interruptor${filtros.solucionadasRecientes ? ' filtros-chip--activo' : ''}`}
            aria-pressed={filtros.solucionadasRecientes}
            onClick={() => onChange({ ...filtros, solucionadasRecientes: !filtros.solucionadasRecientes })}
          >
            Solucionadas en los últimos 15 días
            {filtros.solucionadasRecientes ? <X aria-hidden="true" /> : null}
          </button>
          {hayFiltrosActivos ? (
            <button type="button" className="filtros-limpiar" onClick={() => onChange(FILTROS_MAPA_VACIOS)}>
              Limpiar filtros
            </button>
          ) : null}
        </span>
      </div>
    </div>
  )
}
