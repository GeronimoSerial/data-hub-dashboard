'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, type Ref, type RefObject } from 'react'
import { Popover } from '@base-ui/react/popover'
import { ChevronDown, Search, X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { contarOpciones, filtrarEscuelas, opcionesDireccion, opcionesDisponibles } from '@/lib/infraestructura/mapa/filtrar'
import { etiquetaApoyo, etiquetaDepartamento, etiquetaEstadoClases, etiquetaGravedad } from '@/lib/infraestructura/mapa/etiquetas'
import { FILTROS_MAPA_VACIOS, type EscuelaMapaEnriquecida, type EstadoClases, type FiltrosMapa, type GravedadMapa } from '@/lib/infraestructura/mapa/tipos'
import { cantidadFiltrosEnLinea } from '@/lib/infraestructura/mapa/filtros-en-linea'
import { useTextos } from '@/lib/i18n/idioma-provider'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

type ClaveFiltro = 'departamentos' | 'gravedades' | 'clases' | 'apoyo' | 'direcciones'
type Opcion = { valor: string; etiqueta: string }

const CLAVES_DESPLEGABLES: readonly ClaveFiltro[] = ['departamentos', 'gravedades', 'clases', 'apoyo', 'direcciones']
const CLAVES_INTERRUPTOR = ['sinActualizar', 'solucionadasRecientes', 'conComedor'] as const
type ClaveInterruptor = (typeof CLAVES_INTERRUPTOR)[number]
const CLAVES_FILTROS_EN_ORDEN = [...CLAVES_DESPLEGABLES, ...CLAVES_INTERRUPTOR]

type TextosFiltrosChips = Diccionario['controlesFiltros']['filtrosChips']

function etiquetasInterruptor(textos: TextosFiltrosChips): Record<ClaveInterruptor, string> {
  return {
    sinActualizar: textos.sinActualizar,
    solucionadasRecientes: textos.solucionadasRecientes,
    conComedor: textos.conComedor,
  }
}

function etiquetasFiltro(textos: TextosFiltrosChips): Record<ClaveFiltro, string> {
  return {
    departamentos: 'Departamento',
    gravedades: textos.gravedad,
    clases: textos.clases,
    apoyo: textos.apoyo,
    direcciones: textos.direccion,
  }
}

const CLAVES_CLASES: readonly EstadoClases[] = ['normal', 'parcial', 'sin', 'evacuado', 'centro']
const CLAVES_APOYO = ['brinda', 'no', 'sin_dato'] as const

function opcionesGravedad(t: Diccionario): Opcion[] {
  return [4, 3, 2, 1, 0].map((valor) => ({
    valor: String(valor),
    etiqueta: etiquetaGravedad(t, valor as GravedadMapa),
  }))
}

function opcionesClases(t: Diccionario): Opcion[] {
  return CLAVES_CLASES.map((valor) => ({ valor, etiqueta: etiquetaEstadoClases(t, valor) }))
}

function opcionesApoyo(t: Diccionario): Opcion[] {
  return CLAVES_APOYO.map((valor) => ({ valor, etiqueta: etiquetaApoyo(t, valor) }))
}

function valoresSeleccionados(filtros: FiltrosMapa, clave: ClaveFiltro): string[] {
  return filtros[clave].map(String)
}

function esGravedadMapa(valor: number): valor is GravedadMapa {
  return valor === 0 || valor === 1 || valor === 2 || valor === 3 || valor === 4
}

function esClase(valor: string): valor is EstadoClases {
  return (CLAVES_CLASES as readonly string[]).includes(valor)
}

function esApoyo(valor: string): valor is FiltrosMapa['apoyo'][number] {
  return (CLAVES_APOYO as readonly string[]).includes(valor)
}

function opcionesPorFiltro(escuelas: EscuelaMapaEnriquecida[], clave: ClaveFiltro, t: Diccionario): Opcion[] {
  if (clave === 'departamentos') {
    return opcionesDisponibles(escuelas).departamentos.map((valor) => ({ valor, etiqueta: etiquetaDepartamento(valor) }))
  }
  if (clave === 'direcciones') return opcionesDireccion(escuelas).map((direccion) => ({ valor: String(direccion.id), etiqueta: direccion.nombre }))
  if (clave === 'gravedades') return opcionesGravedad(t)
  if (clave === 'clases') return opcionesClases(t)
  return opcionesApoyo(t)
}

function alternarValor(filtros: FiltrosMapa, clave: ClaveFiltro, valor: string): FiltrosMapa {
  const actual = valoresSeleccionados(filtros, clave)
  const siguiente = actual.includes(valor) ? actual.filter((seleccionado) => seleccionado !== valor) : [...actual, valor]

  switch (clave) {
    case 'departamentos': return { ...filtros, departamentos: siguiente }
    case 'gravedades': return { ...filtros, gravedades: siguiente.map(Number).filter(esGravedadMapa) }
    case 'clases': return { ...filtros, clases: siguiente.filter(esClase) }
    case 'apoyo': return { ...filtros, apoyo: siguiente.filter(esApoyo) }
    case 'direcciones': return { ...filtros, direcciones: siguiente.map(Number).filter(Number.isInteger) }
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
  const t = useTextos()
  const seleccionados = valoresSeleccionados(filtros, clave)
  const opciones = opcionesPorFiltro(escuelas, clave, t)
  const conteos = contarOpciones(escuelas, clave)

  return opciones.length === 0 ? (
    <div className="filtros-opcion-vacio" role="status">
      {t.controlesFiltros.filtrosChips.sinOpciones}
    </div>
  ) : opciones.map((opcion, indice) => (
    <Checkbox
      key={opcion.valor}
      className="filtros-opcion"
      data-testid={`filtro-opcion-${clave}-${opcion.valor}`}
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
  contenedorPopovers,
  enMedicion,
}: {
  clave: ClaveFiltro
  escuelas: EscuelaMapaEnriquecida[]
  filtros: FiltrosMapa
  onChange: (filtros: FiltrosMapa) => void
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  contenedorPopovers?: RefObject<HTMLElement | null>
  enMedicion: boolean
}) {
  const t = useTextos()
  const textos = t.controlesFiltros.filtrosChips
  const etiqueta = etiquetasFiltro(textos)[clave]
  const seleccionadosActuales = valoresSeleccionados(filtros, clave)
  // The bar is right-aligned: if the chip grew while its list is open, the list
  // would slide sideways. Keep the chip as it was until the list closes.
  const [seleccionados, setSeleccionados] = useState(seleccionadosActuales)
  if (!abierto && seleccionados.join('\u0000') !== seleccionadosActuales.join('\u0000')) {
    setSeleccionados(seleccionadosActuales)
  }
  const opciones = opcionesPorFiltro(escuelas, clave, t)
  const primerCheckbox = useRef<HTMLElement>(null)
  const textoChip = seleccionados.length === 0
    ? etiqueta
    : `${etiqueta}: ${seleccionados.length > 1
      ? textos.elegidos(seleccionados.length)
      : opciones.find((opcion) => opcion.valor === seleccionados[0])?.etiqueta ?? seleccionados[0]}`

  return (
    <div className={`filtros-chip-grupo${seleccionados.length ? ' filtros-chip-grupo--activo' : ''}`}>
      <Popover.Root open={abierto} onOpenChange={onAbiertoChange} modal={false}>
        <Popover.Trigger
          render={<button
            type="button"
            className={`filtros-chip${seleccionados.length ? ' filtros-chip--activo' : ''}`}
            aria-haspopup="dialog"
            aria-expanded={abierto}
            data-testid={enMedicion ? undefined : `filtro-chip-${clave}`}
          />}
        >
          <span className="filtros-chip__texto">{textoChip}</span>
          <ChevronDown aria-hidden="true" />
        </Popover.Trigger>
        {/* Rendered inside the given container so the popover stays visible in fullscreen. */}
        <Popover.Portal container={contenedorPopovers}>
          <Popover.Positioner className="filtros-popover-posicionador" side="bottom" align="start" sideOffset={4} collisionAvoidance={{ side: 'none', align: 'shift' }}>
            <Popover.Popup className="filtros-popover" aria-label={etiqueta} data-apertura="abajo" initialFocus={primerCheckbox}>
              <OpcionesFiltro clave={clave} escuelas={escuelas} filtros={filtros} onChange={onChange} primerCheckbox={primerCheckbox} />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {seleccionados.length > 0 ? (
        <button
          type="button"
          className="filtros-chip__quitar"
          aria-label={textos.quitarFiltro(etiqueta)}
          data-testid={enMedicion ? undefined : `filtro-quitar-${clave}`}
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
  contenedorPopovers,
}: {
  escuelas: EscuelaMapaEnriquecida[]
  filtros: FiltrosMapa
  onChange: (filtros: FiltrosMapa) => void
  onSeleccionar?: (cueAnexo: string) => void
  contenedorPopovers?: RefObject<HTMLElement | null>
}) {
  const t = useTextos()
  const textos = t.controlesFiltros.filtrosChips
  const [popoverAbierto, setPopoverAbierto] = useState<{ grupo: 'principal' | 'medicion'; clave: ClaveFiltro } | null>(null)
  const [sugerenciasCerradas, setSugerenciasCerradas] = useState(false)
  const [opcionActiva, setOpcionActiva] = useState(0)
  const [busquedaAbierta, setBusquedaAbierta] = useState(Boolean(filtros.q))
  const [cantidadEnLinea, setCantidadEnLinea] = useState(3)
  const [masFiltrosAbiertos, setMasFiltrosAbiertos] = useState(false)
  const busquedaRef = useRef<HTMLInputElement>(null)
  const filtrosBarraRef = useRef<HTMLDivElement>(null)
  const medicionRef = useRef<HTMLDivElement>(null)
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

  const interruptoresActivos = Number(filtros.sinActualizar) + Number(filtros.solucionadasRecientes) + Number(filtros.conComedor)
  const cantidadFiltrosActivos = filtros.departamentos.length
    + filtros.gravedades.length + filtros.clases.length + filtros.apoyo.length + filtros.direcciones.length + interruptoresActivos
  const cantidadFuera = CLAVES_FILTROS_EN_ORDEN.length - cantidadEnLinea
  const sinFiltrosEnLinea = cantidadEnLinea === 0
  const etiquetaBotonMas = sinFiltrosEnLinea ? 'Filtros' : textos.masFiltros
  const conteosActivosEnOrden = [
    filtros.departamentos.length,
    filtros.gravedades.length,
    filtros.clases.length,
    filtros.apoyo.length,
    filtros.direcciones.length,
    Number(filtros.sinActualizar),
    Number(filtros.solucionadasRecientes),
    Number(filtros.conComedor),
  ]
  const cantidadActivosFuera = conteosActivosEnOrden.slice(cantidadEnLinea).reduce((total, conteo) => total + conteo, 0)
  const hayFiltrosActivos = Boolean(filtros.q.trim()) || cantidadFiltrosActivos > 0

  // While a popover is open, the line must not re-flow: a selection changes the chip
  // text width, and re-measuring would move chips (and their anchored popover) or
  // push the open chip into "Más filtros". Re-measure once everything is closed.
  const lineaCongelada = popoverAbierto?.grupo === 'principal' || masFiltrosAbiertos

  useLayoutEffect(() => {
    const contenedor = filtrosBarraRef.current
    const fila = medicionRef.current
    if (lineaCongelada || !contenedor || !fila || typeof ResizeObserver === 'undefined') return
    const medir = () => {
      const anchoContenedor = contenedor.getBoundingClientRect().width
      if (anchoContenedor <= 0) return
      const busqueda = contenedor.querySelector<HTMLElement>('.filtros-busqueda-contenedor')
      const anchoBusqueda = busqueda?.getBoundingClientRect().width ?? 0
      const gaps = Number.parseFloat(getComputedStyle(contenedor).columnGap) || 0
      const anchoDisponible = Math.max(0, anchoContenedor - anchoBusqueda - (busqueda ? gaps : 0))
      const anchos = CLAVES_FILTROS_EN_ORDEN.map((clave) => fila.querySelector<HTMLElement>(`[data-medicion-filtro="${clave}"]`)?.getBoundingClientRect().width ?? 0)
      const anchoBotonMas = fila.querySelector<HTMLElement>('[data-medicion-filtro="mas"]')?.getBoundingClientRect().width ?? 0
      const siguiente = cantidadFiltrosEnLinea({ anchos, anchoDisponible, anchoBotonMas, separacion: gaps })
      setCantidadEnLinea((actual) => actual === siguiente ? actual : siguiente)
    }
    const observador = new ResizeObserver(medir)
    observador.observe(contenedor)
    fila.querySelectorAll<HTMLElement>('[data-medicion-filtro]').forEach((elemento) => observador.observe(elemento))
    medir()
    return () => observador.disconnect()
  }, [filtros, busquedaVisible, lineaCongelada])

  function seleccionar(cueAnexo: string) {
    onSeleccionar?.(cueAnexo)
    onChange({ ...filtros, q: '' })
    setSugerenciasCerradas(true)
    setBusquedaAbierta(false)
  }
  function renderDesplegable(clave: ClaveFiltro, grupo: 'principal' | 'medicion') {
    return (
      <FiltroDesplegable
        key={clave}
        clave={clave}
        escuelas={escuelas}
        filtros={filtros}
        onChange={onChange}
        abierto={popoverAbierto?.grupo === grupo && popoverAbierto.clave === clave}
        onAbiertoChange={(abierto) => setPopoverAbierto(abierto ? { grupo, clave } : null)}
        contenedorPopovers={contenedorPopovers}
        enMedicion={grupo === 'medicion'}
      />
    )
  }
  function renderInterruptor(clave: ClaveInterruptor, enMedicion = false) {
    const etiqueta = etiquetasInterruptor(textos)[clave]
    const activo = filtros[clave]
    return (
      <button key={clave} type="button" className={`filtros-chip filtros-chip--interruptor${activo ? ' filtros-chip--activo' : ''}`} aria-pressed={activo} data-testid={enMedicion ? undefined : `filtro-interruptor-${clave}`} onClick={() => onChange({ ...filtros, [clave]: !activo })}>
        {etiqueta}{activo ? <X aria-hidden="true" /> : null}
      </button>
    )
  }
  function renderGrupoPanel(clave: ClaveFiltro) {
    const titulo = etiquetasFiltro(textos)[clave]
    return (
      <section className="map-filtros-mas-grupo" aria-label={titulo} key={clave}>
        <h3 className="map-filtros-mas-titulo">{titulo}</h3>
        <OpcionesFiltro clave={clave} escuelas={escuelas} filtros={filtros} onChange={onChange} />
      </section>
    )
  }

  return (
    <div className="filtros-barra" aria-label={textos.filtrosEscuelas} ref={filtrosBarraRef}>
      <div className={`filtros-busqueda-contenedor${busquedaVisible ? ' filtros-busqueda-contenedor--abierto' : ''}`}>
        {busquedaVisible ? (
          <label className="filtros-busqueda">
            <Search aria-hidden="true" />
            <input
              ref={busquedaRef}
              type="search"
              role="combobox"
              aria-label={textos.buscarEscuela}
              aria-expanded={sugerenciasAbiertas}
              aria-controls={idLista}
              aria-activedescendant={indiceActivo >= 0 ? idOpcionActiva : undefined}
              aria-autocomplete="list"
              data-testid="filtros-busqueda-input"
              placeholder={textos.buscarEscuela}
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
            aria-label={textos.buscarEscuela}
            aria-expanded={false}
            onClick={() => setBusquedaAbierta(true)}
          >
            <Search aria-hidden="true" />
          </button>
        )}
        {busquedaVisible && sugerenciasAbiertas && (
          <div className="filtros-sugerencias" id={idLista} role="listbox" aria-label={textos.escuelasCoincidentes}>
            {sugerencias.length === 0 ? (
              <div className="filtros-sugerencias__vacio" role="status">{textos.ningunaCoincide}</div>
            ) : sugerencias.map((escuela, indice) => (
              <div
                key={escuela.cueAnexo}
                id={`${idLista}-opcion-${indice}`}
                data-testid="filtros-sugerencia"
                data-cue={escuela.cueAnexo}
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
      <div className="filtros-chips-principales">
        {CLAVES_DESPLEGABLES.slice(0, Math.min(cantidadEnLinea, CLAVES_DESPLEGABLES.length)).map((clave) => renderDesplegable(clave, 'principal'))}
        {cantidadEnLinea > CLAVES_DESPLEGABLES.length ? renderInterruptor('sinActualizar') : null}
        {cantidadEnLinea > CLAVES_DESPLEGABLES.length + 1 ? renderInterruptor('solucionadasRecientes') : null}
        {cantidadEnLinea > CLAVES_DESPLEGABLES.length + 2 ? renderInterruptor('conComedor') : null}
      </div>
      {cantidadFuera > 0 ? <div className="filtros-mas">
        <Popover.Root open={masFiltrosAbiertos} onOpenChange={setMasFiltrosAbiertos} modal={false}>
          <Popover.Trigger
            render={<button
              type="button"
              className={`filtros-chip${cantidadActivosFuera ? ' filtros-chip--activo' : ''}`}
              data-testid="filtros-mas"
              aria-expanded={masFiltrosAbiertos}
              aria-label={`${etiquetaBotonMas}${cantidadActivosFuera ? textos.activosAria(cantidadActivosFuera) : ''}`}
            />}
          >
            {etiquetaBotonMas}
            {cantidadActivosFuera > 0 ? <span className="filtros-chip__contador" aria-hidden="true">{cantidadActivosFuera}</span> : null}
          </Popover.Trigger>
          {/* Same container as the chip popovers, so it also stays visible in fullscreen. */}
          <Popover.Portal container={contenedorPopovers}>
            <Popover.Positioner className="map-filtros-mas-posicionador" side="bottom" align="end" sideOffset={4}>
              <Popover.Popup className="map-filtros-mas-panel" aria-label={etiquetaBotonMas}>
                {CLAVES_DESPLEGABLES.slice(cantidadEnLinea).map(renderGrupoPanel)}
                {cantidadEnLinea <= CLAVES_DESPLEGABLES.length ? <section className="map-filtros-mas-grupo" aria-label={textos.sinActualizar}><h3 className="map-filtros-mas-titulo">{textos.sinActualizar}</h3><Switch
                  data-testid="filtro-mas-switch-sinActualizar"
                  checked={filtros.sinActualizar}
                  onCheckedChange={(sinActualizar) => onChange({ ...filtros, sinActualizar })}
                  label={textos.sinActualizar}
                /></section> : null}
                {cantidadEnLinea <= CLAVES_DESPLEGABLES.length + 1 ? <section className="map-filtros-mas-grupo" aria-label={textos.solucionadasRecientes}><h3 className="map-filtros-mas-titulo">{textos.solucionadasRecientes}</h3><Switch
                  data-testid="filtro-mas-switch-solucionadasRecientes"
                  checked={filtros.solucionadasRecientes}
                  onCheckedChange={(solucionadasRecientes) => onChange({ ...filtros, solucionadasRecientes })}
                  label={textos.solucionadasRecientes}
                /></section> : null}
                {cantidadEnLinea <= CLAVES_DESPLEGABLES.length + 2 ? <section className="map-filtros-mas-grupo" aria-label={textos.conComedor}><h3 className="map-filtros-mas-titulo">{textos.conComedor}</h3><Switch
                  data-testid="filtro-mas-switch-conComedor"
                  checked={filtros.conComedor}
                  onCheckedChange={(conComedor) => onChange({ ...filtros, conComedor })}
                  label={textos.conComedor}
                /></section> : null}
                {hayFiltrosActivos ? <button type="button" className="filtros-limpiar" data-testid="filtros-limpiar" onClick={() => onChange(FILTROS_MAPA_VACIOS)}>{textos.limpiarFiltros}</button> : null}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div> : null}
      <div className="map-filtros-medicion" aria-hidden="true" ref={medicionRef}>
        {CLAVES_DESPLEGABLES.map((clave) => <div key={clave} data-medicion-filtro={clave}>{renderDesplegable(clave, 'medicion')}</div>)}
        <div data-medicion-filtro="sinActualizar">{renderInterruptor('sinActualizar', true)}</div>
        <div data-medicion-filtro="solucionadasRecientes">{renderInterruptor('solucionadasRecientes', true)}</div>
        <div data-medicion-filtro="conComedor">{renderInterruptor('conComedor', true)}</div>
        <button data-medicion-filtro="mas" type="button" className="filtros-chip">{textos.masFiltros}</button>
      </div>
    </div>
  )
}
